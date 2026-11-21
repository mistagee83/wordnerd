// Firebase for the browser: Auth, Firestore (read only: the Hub's users/{uid} and settings/credits) and
// Functions. Web config values are not secrets; rules protect the data.
// On localhost (and private LAN addresses, for phones testing against the dev machine) the page talks to
// the local emulators with WordNerd's own ports (firebase.json); add ?live to use the real project.
import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.6.0/firebase-app.js';
import { getAuth, connectAuthEmulator } from 'https://www.gstatic.com/firebasejs/12.6.0/firebase-auth.js';
import { getFirestore, connectFirestoreEmulator } from 'https://www.gstatic.com/firebasejs/12.6.0/firebase-firestore.js';
import { getFunctions, connectFunctionsEmulator, httpsCallable } from 'https://www.gstatic.com/firebasejs/12.6.0/firebase-functions.js';
import { firebaseConfig, FUNCTIONS_REGION } from './config.js';

const host = location.hostname;
const LAN = /^(10\.|192\.168\.|172\.(1[6-9]|2[0-9]|3[01])\.)/;
const LOCAL = host === 'localhost' || host === '127.0.0.1' || LAN.test(host);
export const USE_EMULATORS = LOCAL && !new URLSearchParams(location.search).has('live');
export const EMULATOR_PORTS = { auth: 9109, functions: 5011, firestore: 8090 };

/** One Firebase app per page kind (the student page will get its own, so its anonymous sign-in never
 *  touches a teacher's session in the same browser). */
export function firebase(name) {
  const app = initializeApp(firebaseConfig, name);
  const auth = getAuth(app);
  const db = getFirestore(app);
  const fns = getFunctions(app, FUNCTIONS_REGION);
  if (USE_EMULATORS) {
    connectAuthEmulator(auth, `http://${host}:${EMULATOR_PORTS.auth}`, { disableWarnings: true });
    const emu = host === 'localhost' ? '127.0.0.1' : host;
    connectFirestoreEmulator(db, emu, EMULATOR_PORTS.firestore);
    connectFunctionsEmulator(fns, emu, EMULATOR_PORTS.functions);
  }
  /**
   * Calls a Cloud Function; a refusal throws an Error with `reason` (the function's details.reason, or a
   * network/timeout code) and `details`.
   */
  const call = async (fn, data, { timeout } = {}) => {
    try {
      return (await httpsCallable(fns, fn, timeout ? { timeout } : undefined)(data)).data;
    } catch (e) {
      const err = new Error(e.message);
      err.code = String(e.code ?? 'unknown').replace(/^functions\//, '');
      err.details = e.details ?? {};
      err.reason = e.details?.reason
        ?? (err.code === 'deadline-exceeded' ? 'timeout' : err.code === 'unavailable' || err.code === 'internal' ? 'network' : 'unknown');
      throw err;
    }
  };
  return { app, auth, db, call };
}
