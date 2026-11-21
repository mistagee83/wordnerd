// Client configuration. Web config values are not secrets (Security Rules protect the data).
// Project values come from the Hub: D:\dev\Edtechhub\shared\firebase-config.js. Never invent or
// leave out a field. WordNerd has no Realtime Database instance (Firestore only).
export const firebaseConfig = {
  apiKey: 'AIzaSyDfK-2VYD8bU2lK4JfKbCQGx-foswmIlq8',
  authDomain: 'mrashub.firebaseapp.com',
  projectId: 'mrashub',
  storageBucket: 'mrashub.firebasestorage.app',
  messagingSenderId: '870232062269',
  appId: '1:870232062269:web:98518a83cdc00d17b7ed54',
};

export const FUNCTIONS_REGION = 'europe-west1';

// Public address for join links and QR codes. Local development keeps its own origin.
export const PUBLIC_BASE_URL = 'https://wordnerd.mrandrewshub.com';

// The Hub's account page, where credits and the Hub pass are bought.
export const HUB_ACCOUNT_URL = 'https://mrandrewshub.com/account';

export function publicBaseUrl() {
  const host = location.hostname;
  if (host === 'localhost' || host === '127.0.0.1') return location.origin;
  return PUBLIC_BASE_URL;
}
