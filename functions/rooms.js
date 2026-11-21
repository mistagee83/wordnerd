// Rooms (F4). Only these functions touch wnRooms and wnCodes (no client rules needed; the Hubbaloo pattern).
// Teacher:  wnCreateRoom { listId, games, title? } -> { roomId, code }
//           wnListRooms -> { rooms: [summary] }
//           wnGetRoom { roomId } -> { room, players }      (a closed room needs the Hub pass: History)
//           wnCloseRoom { roomId } -> { ok }
// Student (anonymous): wnJoinRoom { code, nickname } -> { roomId, nickname }
//           wnPlayRoom { roomId } -> { room, me }
//           wnSubmitResult { roomId, index, result } -> { best, path }
import { randomBytes } from 'node:crypto';
import { FieldValue } from 'firebase-admin/firestore';
import { fs, fail, caller, teacher } from './common.js';
import { APP } from './config.js';
import { LISTS } from './analyze.js';
import { hasAccess } from './engines/hub/entitlements.js';
import {
  ROOM_LIMITS, ROOM_MS, codeFromBytes, normalizeCode, checkNickname, checkRoomGames, listSnapshot,
  checkResult, mergeResult, pathSummary, isOpen,
} from './engines/rooms/rooms.js';

export const ROOMS = 'wnRooms';
export const CODES = 'wnCodes';
const roomRef = (id) => fs().collection(ROOMS).doc(id);
const idOf = (v, what = 'roomId') => (typeof v === 'string' && /^[A-Za-z0-9]{10,40}$/.test(v) ? v : fail('invalid-argument', what));
const titleOf = (t) => (typeof t === 'string' ? t.replace(/\s+/g, ' ').trim().slice(0, ROOM_LIMITS.titleChars) : '');

async function ownRoom(uid, id) {
  const snap = await roomRef(id).get();
  if (!snap.exists || snap.get('ownerUid') !== uid) fail('not-found', 'room');
  return snap;
}

const statusOf = (room, now) => (isOpen(room, now) ? 'open' : 'closed');

const summary = (id, r, now) => ({
  id, code: r.code, title: r.title, listTitle: r.listSnapshot?.title ?? '', status: statusOf(r, now),
  games: r.games.length, players: r.playerCount ?? 0, createdAt: r.createdAt, expiresAt: r.expiresAt, closedAt: r.closedAt ?? null,
});

async function hubPass(uid) {
  const user = (await fs().doc(`users/${uid}`).get()).data();
  return hasAccess(user?.entitlements, APP);
}

// ---------------------------------------------------------------------------------------------------
// teacher

export async function createRoom(req) {
  const uid = teacher(req);
  const listId = idOf(req.data?.listId, 'listId');
  const listSnap = await fs().collection(LISTS).doc(listId).get();
  if (!listSnap.exists || listSnap.get('ownerUid') !== uid) fail('not-found', 'list');
  const list = listSnap.data();
  const seed = randomBytes(8).toString('hex');
  const check = checkRoomGames(list, req.data?.games, seed);
  if (!check.ok) fail('invalid-argument', check.reason, check.type ? { type: check.type } : {});
  const now = Date.now();
  const ref = fs().collection(ROOMS).doc();
  const room = {
    ownerUid: uid, listId, title: titleOf(req.data?.title) || list.title, listSnapshot: listSnapshot(list),
    games: check.games, seed, status: 'open', playerCount: 0, createdAt: now, expiresAt: now + ROOM_MS,
  };
  // a free code: a code doc whose room is closed or expired may be taken over
  for (let attempt = 0; attempt < 12; attempt++) {
    const code = codeFromBytes(randomBytes(6));
    const done = await fs().runTransaction(async (tx) => {
      const codeRef = fs().collection(CODES).doc(code);
      const c = await tx.get(codeRef);
      if (c.exists && c.get('expiresAt') > now && c.get('open') !== false) return false;
      tx.set(codeRef, { roomId: ref.id, expiresAt: room.expiresAt, open: true });
      tx.set(ref, { ...room, code });
      return true;
    });
    if (done) return { roomId: ref.id, code };
  }
  fail('resource-exhausted', 'no-code');
}

export async function listRooms(req) {
  const uid = teacher(req);
  const now = Date.now();
  const [snap, pass] = await Promise.all([fs().collection(ROOMS).where('ownerUid', '==', uid).limit(500).get(), hubPass(uid)]);
  const rooms = snap.docs.map((d) => summary(d.id, d.data(), now)).sort((a, b) => b.createdAt - a.createdAt);
  return { rooms, hubPass: pass };
}

export async function getRoom(req) {
  const uid = teacher(req);
  const snap = await ownRoom(uid, idOf(req.data?.roomId));
  const r = snap.data();
  const now = Date.now();
  // the History (played rooms after they closed) belongs to the Hub pass (SPEC 7)
  if (statusOf(r, now) === 'closed' && !(await hubPass(uid))) fail('permission-denied', 'hub-pass');
  const players = (await snap.ref.collection('players').get()).docs.map((d) => {
    const p = d.data();
    return { nickname: p.nickname, joinedAt: p.joinedAt, results: p.results ?? {}, path: pathSummary(r, p.results ?? {}) };
  }).sort((a, b) => a.joinedAt - b.joinedAt);
  const { ownerUid, seed, ...room } = r;
  return { room: { id: snap.id, ...room, status: statusOf(r, now) }, players };
}

export async function closeRoom(req) {
  const uid = teacher(req);
  const snap = await ownRoom(uid, idOf(req.data?.roomId));
  const now = Date.now();
  await fs().runTransaction(async (tx) => {
    const codeRef = fs().collection(CODES).doc(snap.get('code'));
    const c = await tx.get(codeRef);
    tx.update(snap.ref, { status: 'closed', closedAt: now });
    if (c.exists && c.get('roomId') === snap.id) tx.update(codeRef, { open: false });
  });
  return { ok: true };
}

// ---------------------------------------------------------------------------------------------------
// students (anonymous accounts; a signed-in teacher may join too, to try a room)

export async function joinRoom(req) {
  const uid = caller(req);
  const code = normalizeCode(req.data?.code) ?? fail('invalid-argument', 'code');
  const nick = checkNickname(req.data?.nickname);
  if (!nick.ok) fail('invalid-argument', nick.reason);
  const now = Date.now();
  const codeSnap = await fs().collection(CODES).doc(code).get();
  if (!codeSnap.exists) fail('not-found', 'code');
  const roomId = codeSnap.get('roomId');
  return fs().runTransaction(async (tx) => {
    const ref = roomRef(roomId);
    const room = await tx.get(ref);
    if (!room.exists || !isOpen(room.data(), now)) fail('failed-precondition', 'room-closed');
    const playerRef = ref.collection('players').doc(uid);
    const me = await tx.get(playerRef);
    if (me.exists) return { roomId, nickname: me.get('nickname'), rejoined: true }; // same device: back in
    if ((room.get('playerCount') ?? 0) >= ROOM_LIMITS.maxPlayers) fail('resource-exhausted', 'room-full');
    const nameRef = ref.collection('names').doc(nick.key);
    if ((await tx.get(nameRef)).exists) fail('already-exists', 'nickname-taken');
    tx.set(nameRef, { uid });
    tx.set(playerRef, { nickname: nick.nickname, key: nick.key, joinedAt: now, results: {} });
    tx.update(ref, { playerCount: FieldValue.increment(1) });
    return { roomId, nickname: nick.nickname, rejoined: false };
  });
}

export async function playRoom(req) {
  const uid = caller(req);
  const id = idOf(req.data?.roomId);
  const [room, me] = await Promise.all([roomRef(id).get(), roomRef(id).collection('players').doc(uid).get()]);
  if (!room.exists || !me.exists) fail('not-found', 'player');
  const r = room.data();
  return {
    room: { id, title: r.title, listSnapshot: r.listSnapshot, games: r.games, seed: r.seed, status: statusOf(r, Date.now()), expiresAt: r.expiresAt },
    me: { nickname: me.get('nickname'), results: me.get('results') ?? {}, path: pathSummary(r, me.get('results') ?? {}) },
  };
}

export async function submitResult(req) {
  const uid = caller(req);
  const id = idOf(req.data?.roomId);
  const index = Number(req.data?.index);
  const now = Date.now();
  return fs().runTransaction(async (tx) => {
    const ref = roomRef(id);
    const playerRef = ref.collection('players').doc(uid);
    const [room, me] = await Promise.all([tx.get(ref), tx.get(playerRef)]);
    if (!room.exists || !me.exists) fail('not-found', 'player');
    const r = room.data();
    if (!isOpen(r, now)) fail('failed-precondition', 'room-closed');
    const check = checkResult(r, index, req.data?.result);
    if (!check.ok) fail('invalid-argument', check.reason);
    const results = { ...(me.get('results') ?? {}) };
    results[index] = mergeResult(results[index], check.result, now);
    tx.update(playerRef, { [`results.${index}`]: results[index] });
    return { stars: check.result.stars, best: results[index], path: pathSummary(r, results) };
  });
}
