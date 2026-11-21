// WordNerd Cloud Functions (codebase `wordnerd`, Node 22, 2nd gen, europe-west1).
// Deploy only with András's approval: firebase deploy --only functions:wordnerd
import { setGlobalOptions } from 'firebase-functions/v2';
import { onCall } from 'firebase-functions/v2/https';
import { defineSecret } from 'firebase-functions/params';
import { REGION } from './config.js';
import { analyze } from './analyze.js';

setGlobalOptions({ region: REGION, maxInstances: 10 });

// Secret Manager: firebase functions:secrets:set WN_GEMINI_API_KEY
const GEMINI_KEY = defineSecret('WN_GEMINI_API_KEY');

// The material travels in the request (a file as base64, at most 4 MB before encoding; SPEC 4).
export const wnAnalyze = onCall(
  { secrets: [GEMINI_KEY], timeoutSeconds: 300, memory: '512MiB' },
  (req) => analyze(req, { apiKey: () => GEMINI_KEY.value() }),
);
