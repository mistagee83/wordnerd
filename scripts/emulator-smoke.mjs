// End-to-end check of wnAnalyze against the emulators (auth, firestore, functions) with the mock model.
// No dependencies: plain REST calls to the emulators. Run with:  npm run test:emulator
// (firebase emulators:exec starts the emulators, runs this file, and stops them.)
import assert from 'node:assert/strict';

const PROJECT = 'mrashub';
// the emulator hosts come from the hub that emulators:exec runs (WordNerd uses its own ports, firebase.json,
// so it never clashes with a sister app's emulators)
const HUB = process.env.FIREBASE_EMULATOR_HUB ?? '127.0.0.1:4410';
const hosts = await (await fetch(`http://${HUB}/emulators`)).json();
const at = (name) => `http://${hosts[name].host}:${hosts[name].port}`;
const AUTH = `${at('auth')}/identitytoolkit.googleapis.com/v1`;
const FS = `${at('firestore')}/v1/projects/${PROJECT}/databases/(default)/documents`;
const FN_BASE = `${at('functions')}/${PROJECT}/europe-west1`;
const OWNER = { Authorization: 'Bearer owner', 'Content-Type': 'application/json' }; // emulator admin access

const toValue = (v) => {
  if (v === null) return { nullValue: null };
  if (v instanceof Date) return { timestampValue: v.toISOString() };
  if (typeof v === 'number') return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (typeof v === 'string') return { stringValue: v };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(toValue) } };
  return { mapValue: { fields: Object.fromEntries(Object.entries(v).map(([k, x]) => [k, toValue(x)])) } };
};
const fromValue = (v) => {
  if ('nullValue' in v) return null;
  if ('integerValue' in v) return Number(v.integerValue);
  if ('doubleValue' in v) return v.doubleValue;
  if ('stringValue' in v) return v.stringValue;
  if ('booleanValue' in v) return v.booleanValue;
  if ('timestampValue' in v) return v.timestampValue;
  if ('arrayValue' in v) return (v.arrayValue.values ?? []).map(fromValue);
  if ('mapValue' in v) return Object.fromEntries(Object.entries(v.mapValue.fields ?? {}).map(([k, x]) => [k, fromValue(x)]));
  return undefined;
};
const setDoc = (path, data) => fetch(`${FS}/${path}`, { method: 'PATCH', headers: OWNER, body: JSON.stringify({ fields: toValue(data).mapValue.fields }) })
  .then((r) => { if (!r.ok) throw new Error(`seed ${path}: ${r.status}`); });
const getDoc = async (path) => {
  const r = await fetch(`${FS}/${path}`, { headers: OWNER });
  return r.ok ? fromValue({ mapValue: await r.json() }) : null;
};
const listDocs = async (coll) => {
  const r = await fetch(`${FS}/${coll}?pageSize=300`, { headers: OWNER });
  return ((await r.json()).documents ?? []).map((d) => ({ id: d.name.split('/').pop(), ...fromValue({ mapValue: d }) }));
};

async function signUp(anonymous = false) {
  const body = anonymous ? { returnSecureToken: true } : { email: `t${Date.now()}${Math.random().toString(36).slice(2, 6)}@example.com`, password: 'test-password-1', returnSecureToken: true };
  const r = await fetch(`${AUTH}/accounts:signUp?key=fake-key`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const j = await r.json();
  return { uid: j.localId, token: j.idToken };
}

async function call(token, data, fn = 'wnAnalyze') {
  const r = await fetch(`${FN_BASE}/${fn}`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify({ data }) });
  const j = await r.json();
  return j.error ? { error: j.error.status, reason: j.error.details?.reason, details: j.error.details } : { result: j.result };
}

const text = (extra = '') => `${extra} ${Array.from({ length: 80 }, (_, i) => `word${i}`).join(' ')}`;
const req = (extra = '') => ({ kind: 'text', text: text(extra), level: 'B1', supportLang: 'hu', count: 20 });
const balanceOf = async (uid) => (await getDoc(`users/${uid}`))?.credits?.purchased;
let step = 0;
const ok = (label) => console.log(`  ✔ ${++step}. ${label}`);

// ---- seed: price and a teacher with 10 credits
await setDoc('settings/credits', { prices: { 'wordnerd/analyze': 3 } });
const teacher = await signUp();
const future = new Date(Date.now() + 30 * 24 * 3600 * 1000);
await setDoc(`users/${teacher.uid}`, { email: 'teacher@example.com', credits: { purchased: 10, purchasedExpiresAt: future } });

// 1. success: credits spent, list written, ledger row
const r1 = await call(teacher.token, req());
assert.ok(r1.result?.listId, JSON.stringify(r1));
assert.equal(r1.result.cost, 3);
const list = await getDoc(`wnLists/${r1.result.listId}`);
assert.equal(list.ownerUid, teacher.uid);
assert.equal(list.items.length, 20);
assert.equal(list.cloze.gaps.length, 11);
assert.equal(list.analysis.promptVersion, 'analyze-v3');
assert.equal(list.analysis.model, 'mock');
assert.equal(list.source.kind, 'text');
assert.equal(await balanceOf(teacher.uid), 7);
ok('analysis succeeds: 3 credits spent, wnLists doc with 20 items and 11 gaps, prompt version stored');

// 2. broken model answer twice: credits come back
const r2 = await call(teacher.token, req('MOCK:BROKEN'));
assert.deepEqual([r2.error, r2.reason, r2.details?.detail], ['INTERNAL', 'analysis-failed', 'parse_error']);
assert.equal(await balanceOf(teacher.uid), 7);
ok('a broken model answer (twice) fails and refunds the credits');

// 3. unsuitable material: refused, refunded
const r3 = await call(teacher.token, req('MOCK:UNSUITABLE'));
assert.deepEqual([r3.error, r3.reason, r3.details?.detail], ['FAILED_PRECONDITION', 'unsuitable', 'Not a text.']);
assert.equal(await balanceOf(teacher.uid), 7);
ok('unsuitable material is refused with the model\'s reason and refunded');

// 4. model unavailable: refused, refunded
const r4 = await call(teacher.token, req('MOCK:UNAVAILABLE'));
assert.deepEqual([r4.error, r4.reason], ['UNAVAILABLE', 'model-unavailable']);
assert.equal(await balanceOf(teacher.uid), 7);
ok('an unavailable model is reported and refunded');

// 5. ledger: one spend kept, three spends refunded
const ledger = (await listDocs('creditLedger')).filter((l) => l.uid === teacher.uid);
assert.equal(ledger.filter((l) => l.reason === 'spend').length, 4);
assert.equal(ledger.filter((l) => l.reason === 'refund').length, 3);
assert.ok(ledger.every((l) => l.app === 'wordnerd'));
ok('ledger: 4 spends, 3 refunds, all with app "wordnerd"');

// 6. bad input: refused before any spend
const r6 = await call(teacher.token, { ...req(), level: 'Z9' });
assert.deepEqual([r6.error, r6.reason], ['INVALID_ARGUMENT', 'level']);
assert.equal(await balanceOf(teacher.uid), 7);
ok('bad input is refused before any credit is spent');

// 7. not enough credits
await setDoc(`users/${teacher.uid}`, { email: 'teacher@example.com', credits: { purchased: 2, purchasedExpiresAt: future } });
const r7 = await call(teacher.token, req());
assert.deepEqual([r7.error, r7.reason, r7.details?.cost], ['RESOURCE_EXHAUSTED', 'insufficient', 3]);
ok('too few credits: refused with balance and cost');

// 8. students (anonymous) and signed-out callers cannot analyse
const student = await signUp(true);
assert.equal((await call(student.token, req())).reason, 'teacher-only');
assert.equal((await call(null, req())).reason, 'sign-in');
ok('anonymous students and signed-out callers are refused');

// 9. no price on the list: refused
await setDoc('settings/credits', { prices: {} });
await setDoc(`users/${teacher.uid}`, { email: 'teacher@example.com', credits: { purchased: 10, purchasedExpiresAt: future } });
assert.equal((await call(teacher.token, req())).reason, 'no-price');
ok('no price in settings/credits: refused (no free calls)');

// 10–11. the library: list, open, edit, delete; another teacher and a student see nothing
const listId = r1.result.listId;
const lib = await call(teacher.token, {}, 'wnListLists');
assert.ok(lib.result.lists.some((l) => l.id === listId && l.words === 20), JSON.stringify(lib));
const got = await call(teacher.token, { id: listId }, 'wnGetList');
assert.equal(got.result.list.items.length, 20);
assert.equal(got.result.list.ownerUid, undefined);
const items = got.result.list.items.filter((it) => it.id !== 'w07')
  .map(({ id, term, translation, definition, category }) => ({ id, term, translation, definition, category }));
items[0].translation = 'vigyáz valakire';
items.push({ term: 'twin', translation: 'iker', definition: 'one of two children born together' });
const saved = await call(teacher.token, { id: listId, title: 'Edited', items }, 'wnSaveList');
assert.equal(saved.result?.list?.title, 'Edited', JSON.stringify(saved));
assert.equal(saved.result.list.items.length, 20);
assert.equal(saved.result.list.cloze.gaps.length, 10);
const stored = await getDoc(`wnLists/${listId}`);
assert.equal(stored.items[0].translation, 'vigyáz valakire');
assert.equal(stored.items.at(-1).id, 'w21');
assert.equal((await call(teacher.token, { id: listId, items: items.slice(0, 2) }, 'wnSaveList')).reason, 'too-few-words');
const other = await signUp();
assert.equal((await call(other.token, { id: listId }, 'wnGetList')).reason, 'list');
assert.equal((await call(other.token, { id: listId, items }, 'wnSaveList')).reason, 'list');
assert.equal((await call(other.token, { id: listId }, 'wnDeleteList')).reason, 'list');
assert.deepEqual((await call(other.token, {}, 'wnListLists')).result.lists, []);
assert.equal((await call(student.token, {}, 'wnListLists')).reason, 'teacher-only');
ok('library: list, open, edit (a deleted word\'s gap becomes text), refusals; other teachers and students see nothing');
// 12–15. rooms: open, join, play, see the results, close
const games = ['memory', 'matching', 'wordsearch', 'crossword', 'hangman', 'gapfill', 'drowning'].map((type) => ({ type, settings: {} }));
const made = await call(teacher.token, { listId, games, title: 'Year 9 – family' }, 'wnCreateRoom');
assert.ok(made.result?.code?.length === 6, JSON.stringify(made));
const { roomId, code } = made.result;
assert.equal((await call(teacher.token, { listId, games: [{ type: 'chess' }] }, 'wnCreateRoom')).reason, 'unknown-game');
assert.equal((await call(other.token, { listId, games }, 'wnCreateRoom')).reason, 'list');
const kid1 = await signUp(true);
const kid2 = await signUp(true);
const j1 = await call(kid1.token, { code: code.toLowerCase(), nickname: ' Anna ' }, 'wnJoinRoom');
assert.deepEqual(j1.result, { roomId, nickname: 'Anna', rejoined: false });
assert.equal((await call(kid1.token, { code, nickname: 'Someone else' }, 'wnJoinRoom')).result.rejoined, true);
assert.equal((await call(kid2.token, { code, nickname: 'anna' }, 'wnJoinRoom')).reason, 'nickname-taken');
assert.equal((await call(kid2.token, { code: 'ZZZZZZ', nickname: 'Ben' }, 'wnJoinRoom')).reason, 'code');
assert.equal((await call(kid2.token, { code, nickname: 'Ben' }, 'wnJoinRoom')).result.nickname, 'Ben');
ok('rooms: a teacher opens a room with all seven games; students join with code and nickname (rejoin, taken name, wrong code)');

const play = await call(kid1.token, { roomId }, 'wnPlayRoom');
assert.equal(play.result.room.games.length, 7);
assert.equal(play.result.room.listSnapshot.items.length, 20);
assert.equal(play.result.me.nickname, 'Anna');
assert.equal((await call(other.token, { roomId }, 'wnPlayRoom')).reason, 'player');
const s1 = await call(kid1.token, { roomId, index: 0, result: { score: 8, max: 8, timeMs: 61000, moves: 20, misses: { w01: 2 } } }, 'wnSubmitResult');
assert.equal(s1.result?.stars, 1, JSON.stringify(s1));
const s2 = await call(kid1.token, { roomId, index: 0, result: { score: 8, max: 8, timeMs: 40000, moves: 9, misses: {} } }, 'wnSubmitResult');
assert.deepEqual([s2.result.stars, s2.result.best.stars, s2.result.best.attempts, s2.result.path.stars], [3, 3, 2, 3]);
assert.deepEqual(s2.result.best.firstMisses, { w01: 2 });
assert.equal((await call(kid1.token, { roomId, index: 0, result: { score: 9, max: 8, timeMs: 1 } }, 'wnSubmitResult')).reason, 'score');
ok('a student plays: results checked, stars computed, best try kept, first-try misses kept');

const view = await call(teacher.token, { roomId }, 'wnGetRoom');
assert.equal(view.result.room.code, code);
assert.equal(view.result.room.seed, undefined);
assert.deepEqual(view.result.players.map((p) => [p.nickname, p.path.stars]), [['Anna', 3], ['Ben', 0]]);
assert.equal((await call(other.token, { roomId }, 'wnGetRoom')).reason, 'room');
const myRooms = await call(teacher.token, {}, 'wnListRooms');
assert.ok(myRooms.result.rooms.some((r) => r.id === roomId && r.players === 2 && r.status === 'open'));
ok('the teacher sees the room, its code and every student\'s stars; others see nothing');

assert.deepEqual((await call(teacher.token, { roomId }, 'wnCloseRoom')).result, { ok: true });
assert.equal((await call(kid2.token, { roomId, index: 1, result: { score: 1, max: 6, timeMs: 5 } }, 'wnSubmitResult')).reason, 'room-closed');
const kid3 = await signUp(true);
assert.equal((await call(kid3.token, { code, nickname: 'Cara' }, 'wnJoinRoom')).reason, 'room-closed');
assert.equal((await call(teacher.token, { roomId }, 'wnGetRoom')).reason, 'hub-pass');
await setDoc(`users/${teacher.uid}`, { email: 'teacher@example.com', entitlements: { all: { status: 'active', source: 'admin', tier: 'hub' } }, credits: { purchased: 10, purchasedExpiresAt: future } });
assert.equal((await call(teacher.token, { roomId }, 'wnGetRoom')).result.room.status, 'closed');
ok('closing: no more results or joins; the closed room (History) opens only with the Hub pass');

assert.deepEqual((await call(teacher.token, { id: listId }, 'wnDeleteList')).result, { ok: true });
assert.equal(await getDoc(`wnLists/${listId}`), null);
ok('delete removes the list');

console.log(`\nemulator smoke test: ${step} checks passed`);
