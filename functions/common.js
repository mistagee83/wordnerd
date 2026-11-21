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

/** A teacher is any signed-in account that is not anonymous (students are anonymous). */
export function teacher(req) {
  const uid = caller(req);
  if (req.auth.token?.firebase?.sign_in_provider === 'anonymous') fail('permission-denied', 'teacher-only');
  return uid;
}
