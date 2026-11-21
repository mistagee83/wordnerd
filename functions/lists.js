// The teacher's word lists (F3). Only these functions touch wnLists (the Hub's rules give clients no
// access), the Hubbaloo pattern: every read and write is checked here.
//   wnListLists  -> { lists: [summary] }            newest first
//   wnGetList    { id } -> { list }
//   wnSaveList   { id, title, items } -> { list }    edits checked by engines/lists/edit.js
//   wnDeleteList { id } -> { ok: true }
import { fs, fail, teacher } from './common.js';
import { LISTS } from './analyze.js';
import { applyEdits, summarize } from './engines/lists/edit.js';

const MAX_LISTS = 500;
const idOf = (d) => (typeof d?.id === 'string' && /^[A-Za-z0-9]{10,40}$/.test(d.id) ? d.id : fail('invalid-argument', 'id'));

async function ownList(uid, id) {
  const snap = await fs().collection(LISTS).doc(id).get();
  // someone else's list looks exactly like a missing one
  if (!snap.exists || snap.get('ownerUid') !== uid) fail('not-found', 'list');
  return { ref: snap.ref, data: snap.data() };
}

// what the browser gets: the list without server bookkeeping
const forClient = (id, d) => {
  const { ownerUid, analysis, ...rest } = d;
  return { id, ...rest, analysis: analysis ? { promptVersion: analysis.promptVersion, model: analysis.model } : null };
};

export async function listLists(req) {
  const uid = teacher(req);
  // no orderBy: it would need a composite index in the Hub's firestore.indexes.json; a teacher's lists are few
  const snap = await fs().collection(LISTS).where('ownerUid', '==', uid).limit(MAX_LISTS).get();
  const lists = snap.docs.map((d) => summarize(d.id, d.data())).sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));
  return { lists };
}

export async function getList(req) {
  const uid = teacher(req);
  const { data } = await ownList(uid, idOf(req.data));
  return { list: forClient(req.data.id, data) };
}

export async function saveList(req) {
  const uid = teacher(req);
  const id = idOf(req.data);
  return fs().runTransaction(async (tx) => {
    const ref = fs().collection(LISTS).doc(id);
    const snap = await tx.get(ref);
    if (!snap.exists || snap.get('ownerUid') !== uid) fail('not-found', 'list');
    const r = applyEdits(snap.data(), { title: req.data.title, items: req.data.items });
    if (!r.ok) fail('invalid-argument', r.reason, r.index != null ? { index: r.index } : {});
    const updatedAt = Date.now();
    tx.update(ref, { title: r.list.title, items: r.list.items, cloze: r.list.cloze ?? null, updatedAt });
    return { list: forClient(id, { ...r.list, updatedAt }) };
  });
}

export async function deleteList(req) {
  const uid = teacher(req);
  const { ref } = await ownList(uid, idOf(req.data));
  await ref.delete();
  return { ok: true };
}

/**
 * Emulator only (never exported in production): gives the caller 50 credits and puts a price on
 * wordnerd/analyze, so the teacher page can be tried end to end on the local emulators.
 */
export async function devSeed(req) {
  const uid = teacher(req);
  const future = new Date(Date.now() + 30 * 24 * 3600 * 1000);
  await fs().doc('settings/credits').set({ prices: { 'wordnerd/analyze': 2 } }, { merge: true });
  await fs().doc(`users/${uid}`).set({ email: req.auth.token.email ?? null, credits: { purchased: 50, purchasedExpiresAt: future } }, { merge: true });
  return { ok: true };
}
