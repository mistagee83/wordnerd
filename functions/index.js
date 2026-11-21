// WordNerd Cloud Functions (codebase `wordnerd`, Node 22, 2nd gen, europe-west1).
// Deploy only with András's approval: firebase deploy --only functions:wordnerd
import { setGlobalOptions } from 'firebase-functions/v2';
import { onCall } from 'firebase-functions/v2/https';
import { defineSecret } from 'firebase-functions/params';
import { REGION } from './config.js';
import { analyze } from './analyze.js';
import * as lists from './lists.js';
import * as rooms from './rooms.js';

setGlobalOptions({ region: REGION, maxInstances: 10 });

// Secret Manager: firebase functions:secrets:set WN_GEMINI_API_KEY
const GEMINI_KEY = defineSecret('WN_GEMINI_API_KEY');

// The material travels in the request (a file as base64, at most 4 MB before encoding; SPEC 4).
export const wnAnalyze = onCall(
  { secrets: [GEMINI_KEY], timeoutSeconds: 300, memory: '512MiB' },
  (req) => analyze(req, { apiKey: () => GEMINI_KEY.value() }),
);

export const wnListLists = onCall(lists.listLists);
export const wnGetList = onCall(lists.getList);
export const wnSaveList = onCall(lists.saveList);
export const wnDeleteList = onCall(lists.deleteList);

// Rooms (F4)
export const wnCreateRoom = onCall(rooms.createRoom);
export const wnListRooms = onCall(rooms.listRooms);
export const wnGetRoom = onCall(rooms.getRoom);
export const wnCloseRoom = onCall(rooms.closeRoom);
export const wnJoinRoom = onCall(rooms.joinRoom);
export const wnPlayRoom = onCall(rooms.playRoom);
export const wnSubmitResult = onCall(rooms.submitResult);

// Emulator only: credits and a price for local end-to-end trials. Not part of a production deploy.
export const wnDevSeed = process.env.FUNCTIONS_EMULATOR === 'true' ? onCall(lists.devSeed) : undefined;
