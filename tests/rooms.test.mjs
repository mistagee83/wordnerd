import { test } from 'node:test';
import assert from 'node:assert/strict';
import sample from '../engines/fixtures/sample-family-b1.js';
import {
  CODE_ALPHABET, CODE_LENGTH, codeFromBytes, normalizeCode, checkNickname, checkRoomGames, listSnapshot,
  checkResult, starsFor, mergeResult, pathSummary, isOpen, ROOM_MS,
} from '../engines/rooms/rooms.js';
import { GAME_IDS } from '../engines/games/index.js';

test('codes: 6 unambiguous characters; typed codes are normalised', () => {
  const code = codeFromBytes(Uint8Array.from([0, 30, 31, 255, 7, 100, 9]));
  assert.equal(code.length, CODE_LENGTH);
  assert.ok([...code].every((c) => CODE_ALPHABET.includes(c)));
  assert.ok(!/[01OIL]/.test(CODE_ALPHABET));
  assert.equal(normalizeCode(' ab-c 23k '), 'ABC23K'); // spaces and dashes are ignored
  assert.equal(normalizeCode('abc 234'), 'ABC234');
  assert.equal(normalizeCode('ABC23'), null);
  assert.equal(normalizeCode('ABC10O'), null); // look-alikes are not in the alphabet
});

test('nicknames: length, characters, a key that ignores case and spacing', () => {
  assert.deepEqual(checkNickname('  Anna  K. '), { ok: true, nickname: 'Anna K.', key: 'annak' });
  assert.equal(checkNickname('Zsófi').ok, true);
  assert.equal(checkNickname('李明').ok, true);
  assert.equal(checkNickname('A').reason, 'nickname-short');
  assert.equal(checkNickname('x'.repeat(21)).reason, 'nickname-long');
  assert.equal(checkNickname('<script>').reason, 'nickname-chars');
  assert.equal(checkNickname('anna k').key, checkNickname('Anna-K').key);
});

test('room games: normalised settings, every game must build, no duplicates', () => {
  const all = GAME_IDS.map((type) => ({ type, settings: {} }));
  const r = checkRoomGames(sample, all, 'seed');
  assert.equal(r.ok, true);
  assert.equal(r.games.length, 7);
  assert.equal(r.games[0].settings.grid, 4); // defaults filled in
  assert.deepEqual(checkRoomGames(sample, [], 's'), { ok: false, reason: 'no-games' });
  assert.deepEqual(checkRoomGames(sample, [{ type: 'memory' }, { type: 'memory' }], 's'), { ok: false, reason: 'duplicate-game', type: 'memory' });
  assert.deepEqual(checkRoomGames(sample, [{ type: 'chess' }], 's'), { ok: false, reason: 'unknown-game' });
  const noCloze = { ...sample, cloze: null };
  assert.deepEqual(checkRoomGames(noCloze, [{ type: 'gapfill' }], 's'), { ok: false, reason: 'game-unavailable', type: 'gapfill' });
});

const room = { games: checkRoomGames(sample, GAME_IDS.map((type) => ({ type })), 's').games, listSnapshot: listSnapshot(sample) };

test('results: shape and bounds are checked, stars are computed, unknown fields dropped', () => {
  const ok = checkResult(room, 0, { score: 8, max: 8, timeMs: 40000, misses: { w01: 1, w02: 0 }, moves: 9, stars: 99, hack: true });
  assert.equal(ok.ok, true);
  assert.deepEqual(ok.result, { score: 8, max: 8, timeMs: 40000, misses: { w01: 1 }, moves: 9, stars: 3 });
  assert.equal(checkResult(room, 9, { score: 1, max: 1, timeMs: 1 }).reason, 'game-index');
  assert.equal(checkResult(room, 0, { score: 9, max: 8, timeMs: 1 }).reason, 'score');
  assert.equal(checkResult(room, 0, { score: 1, max: 8, timeMs: -5 }).reason, 'time');
  assert.equal(checkResult(room, 0, { score: 1, max: 8, timeMs: 5, misses: { nope: 1 } }).reason, 'misses');
  assert.equal(checkResult(room, 0, { score: 1, max: 8, timeMs: 5, moves: 1.5 }).reason, 'moves');
});

test('stars: one rule per game', () => {
  assert.equal(starsFor('memory', { score: 8, max: 8, moves: 10 }), 3);
  assert.equal(starsFor('memory', { score: 8, max: 8, moves: 16 }), 2);
  assert.equal(starsFor('memory', { score: 8, max: 8, moves: 30 }), 1);
  assert.equal(starsFor('matching', { score: 6, max: 6 }), 3);
  assert.equal(starsFor('matching', { score: 5, max: 6 }), 2);
  assert.equal(starsFor('matching', { score: 0, max: 6 }), 0);
  assert.equal(starsFor('wordsearch', { score: 10, max: 10, wrongDrags: 0 }), 3);
  assert.equal(starsFor('wordsearch', { score: 10, max: 10, wrongDrags: 6 }), 1);
  assert.equal(starsFor('crossword', { score: 3, max: 7, secretFound: true, revealsUsed: 0, guessesUsed: 0, misses: {} }), 3);
  assert.equal(starsFor('crossword', { score: 7, max: 7, secretFound: true, revealsUsed: 2, guessesUsed: 0, misses: {} }), 2);
  assert.equal(starsFor('hangman', { score: 4, max: 4, livesLeft: 8 }, { lives: 12 }), 3);
  assert.equal(starsFor('hangman', { score: 4, max: 4, livesLeft: 2 }, { lives: 12 }), 2);
  assert.equal(starsFor('hangman', { score: 2, max: 4, livesLeft: 0 }, { lives: 12 }), 1);
  assert.equal(starsFor('hangman', { score: 0, max: 4, livesLeft: 0 }, { lives: 12 }), 0);
  assert.equal(starsFor('gapfill', { score: 11, max: 11 }), 3);
  assert.equal(starsFor('gapfill', { score: 8, max: 11 }), 2);
  assert.equal(starsFor('gapfill', { score: 2, max: 11 }), 0);
  assert.equal(starsFor('drowning', { score: 15, max: 15, survived: true, misses: { w01: 1 } }), 3);
  assert.equal(starsFor('drowning', { score: 4, max: 15, survived: false }), 0);
});

test('best try counts; tries are counted; the first try\'s misses stay', () => {
  const a = { score: 5, max: 8, stars: 1, timeMs: 9000, misses: { w01: 2 } };
  const b = { score: 8, max: 8, stars: 3, timeMs: 12000, misses: {} };
  const c = { score: 6, max: 8, stars: 2, timeMs: 5000, misses: { w03: 1 } };
  let r = mergeResult(null, a, 1);
  r = mergeResult(r, b, 2);
  r = mergeResult(r, c, 3);
  assert.deepEqual([r.score, r.stars, r.attempts, r.bestAt, r.lastAt], [8, 3, 3, 2, 3]);
  assert.deepEqual(r.firstMisses, { w01: 2 });
});

test('path summary and open state', () => {
  const p = pathSummary(room, { 0: { stars: 3 }, 2: { stars: 1 } });
  assert.deepEqual([p.stars, p.maxStars, p.done], [4, 21, 2]);
  assert.equal(p.games[1].stars, null);
  assert.equal(isOpen({ status: 'open', expiresAt: 100 }, 50), true);
  assert.equal(isOpen({ status: 'open', expiresAt: 100 }, 100), false);
  assert.equal(isOpen({ status: 'closed', expiresAt: 100 }, 50), false);
  assert.equal(ROOM_MS, 7 * 24 * 3600 * 1000);
});
