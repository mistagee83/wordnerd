// Shared server helpers: Firestore handle, refusals with a reason, caller checks.
import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/v2/https';

if (!getApps().length) initializeApp();
let firestore = null;
export const fs = () => {
  if (!firestore) {
    firestore = getFirestore();
    firestore.settings({ ignoreUndefinedProperties: true });
  }
  return firestore;
};

/** Refuses a call; the client reads `details.reason`. */
export const fail = (code, reason, extra = {}) => { throw new HttpsError(code, reason, { reason, ...extra }); };

export function caller(req) {
  if (!req.auth) fail('unauthenticated', 'sign-in');
  return req.auth.uid;
}

/**
 * A teacher is a signed-in account that is not anonymous (WordNerd students are anonymous) and not a Potluck
 * student (their custom token carries the plStudent claim; Hub security audit 2026-11-22, K-2).
 */
export function teacher(req) {
  const uid = caller(req);
  const t = req.auth.token ?? {};
  if (t.firebase?.sign_in_provider === 'anonymous' || t.plStudent) fail('permission-denied', 'teacher-only');
  return uid;
}
