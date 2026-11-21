// Credits on the server (Hub docs/spec-v1.md "Kreditek", docs/payments.md "Appok bekötése").
// The pattern of the Hub's functions/credits-store.js, as in Hubbaloo and QotD: spend before the model
// call, refund after a failure. The arithmetic is the Hub's pure module (engines/hub/credits.js, a copy).
// users/{uid} and creditLedger belong to the Hub: this code writes only the credits map and ledger rows,
// exactly as the Hub's own code does.
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { planSpend, planRefund, costFor } from './engines/hub/credits.js';
import { APP } from './config.js';

export class CreditError extends Error {
  constructor(code, extra = {}) { super(code); this.code = code; Object.assign(this, extra); }
}

const TX = { maxAttempts: 30 }; // a class may start several analyses at once
const TS_FIELDS = ['includedExpiresAt', 'purchasedExpiresAt', 'signupBonusAt'];
const toFirestoreFields = (fields) => {
  const out = { ...fields };
  for (const k of TS_FIELDS) if (typeof out[k] === 'number') out[k] = Timestamp.fromMillis(out[k]);
  return out;
};

function writeCredits(tx, fs, uid, plan, meta, ledgerId) {
  const credits = toFirestoreFields(plan.fields);
  // An empty credits map with merge would replace the whole map (the unlimited flag would be lost).
  if (Object.keys(credits).length) tx.set(fs.collection('users').doc(uid), { credits }, { merge: true });
  const ledger = fs.collection('creditLedger');
  const lost = (plan.expired?.included ?? 0) + (plan.expired?.purchased ?? 0);
  if (lost > 0) {
    tx.set(ledger.doc(`${ledgerId}-expire`), {
      uid, delta: -lost, split: { included: -(plan.expired.included ?? 0), purchased: -(plan.expired.purchased ?? 0) },
      reason: 'expire', app: null, action: null, ref: ledgerId, balanceAfter: null, createdAt: FieldValue.serverTimestamp(),
    });
  }
  const delta = (plan.split?.included ?? 0) + (plan.split?.purchased ?? 0);
  tx.set(ledger.doc(ledgerId), {
    uid, delta, split: plan.split, reason: meta.reason, app: APP, action: meta.action ?? null,
    ref: meta.ref ?? null, balanceAfter: plan.balanceAfter, createdAt: FieldValue.serverTimestamp(),
  });
}

/** Spends the price of wordnerd/<action> before the model call. -> { ledgerId, cost, balanceAfter } */
export async function spendCredits(fs, { uid, action, ref = null }) {
  const ledgerRef = fs.collection('creditLedger').doc();
  return fs.runTransaction(async (tx) => {
    const settings = await tx.get(fs.doc('settings/credits'));
    const cost = costFor(settings.exists ? settings.data()?.prices ?? {} : {}, APP, action);
    if (cost == null) throw new CreditError('no_price', { action });
    const user = (await tx.get(fs.collection('users').doc(uid))).data() ?? {};
    const plan = planSpend(user.credits, cost);
    if (!plan.ok) throw new CreditError('insufficient', { balance: plan.balance ?? 0, cost });
    writeCredits(tx, fs, uid, plan, { reason: 'spend', action, ref }, ledgerRef.id);
    return { ledgerId: ledgerRef.id, cost, balanceAfter: plan.balanceAfter };
  }, TX);
}

/** Gives a spend back after a failure; idempotent (ledger id `<spend id>-refund`). */
export async function refundCredits(fs, spendLedgerId) {
  const spendRef = fs.collection('creditLedger').doc(spendLedgerId);
  const refundId = `${spendLedgerId}-refund`;
  return fs.runTransaction(async (tx) => {
    const [spend, done] = await Promise.all([tx.get(spendRef), tx.get(fs.collection('creditLedger').doc(refundId))]);
    if (!spend.exists || spend.get('reason') !== 'spend') throw new CreditError('no_spend');
    if (done.exists) return { skipped: 'already_refunded' };
    const { uid, split, action } = spend.data();
    const user = (await tx.get(fs.collection('users').doc(uid))).data() ?? {};
    const plan = planRefund(user.credits, split);
    writeCredits(tx, fs, uid, plan, { reason: 'refund', action, ref: spendLedgerId }, refundId);
    return { balanceAfter: plan.balanceAfter };
  }, TX);
}
