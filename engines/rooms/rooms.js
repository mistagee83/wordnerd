// Rooms (F4): the rules of a room, pure and shared by the functions and the pages. No I/O, no randomness
// of its own (the caller passes random bytes for codes and seeds).
// Decisions (András, 2026-11-21): 1–3 stars per game and a path view; a room lives until the teacher
// closes it, at most 7 days; a student may replay a game, the best result counts.
import { GAMES, GAME_IDS, generateGame, gameSeed } from '../games/index.js';

export const ROOM_LIMITS = Object.freeze({
  maxDays: 7,
  maxGames: 7, // each of the seven games at most once in a room
  maxPlayers: 80,
  nickname: { min: 2, max: 20 },
  titleChars: 80,
});
export const ROOM_MS = ROOM_LIMITS.maxDays * 24 * 3600 * 1000;

// Join codes: 6 characters without look-alikes (no 0/O, 1/I/L), easy to read aloud and to type on a phone.
export const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const CODE_LENGTH = 6;
/** bytes: CODE_LENGTH random bytes (crypto). */
export function codeFromBytes(bytes) {
  return Array.from(bytes.slice(0, CODE_LENGTH), (b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join('');
}
export function normalizeCode(text) {
  const c = String(text ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  return c.length === CODE_LENGTH && [...c].every((ch) => CODE_ALPHABET.includes(ch)) ? c : null;
}

// Nicknames: shown to the teacher; letters (any script), digits, spaces, . - _ '; unique in a room ignoring case
// and spacing. Not a real name on purpose (no accounts, no personal data).
export function checkNickname(text) {
  const nick = String(text ?? '').normalize('NFC').replace(/\s+/g, ' ').trim();
  if (nick.length < ROOM_LIMITS.nickname.min) return { ok: false, reason: 'nickname-short' };
  if (nick.length > ROOM_LIMITS.nickname.max) return { ok: false, reason: 'nickname-long' };
  if (!/^[\p{L}\p{N} .'_-]+$/u.test(nick)) return { ok: false, reason: 'nickname-chars' };
  return { ok: true, nickname: nick, key: nick.toLocaleLowerCase().replace(/[\s.'_-]+/g, '') };
}

/**
 * The teacher's room set-up: games in the order given, each with its settings (normalised by the game).
 * Every game must build from the list, or the room is refused (a student never meets a broken game).
 * Returns { ok: true, games: [{ type, settings }] } or { ok: false, reason, type? }.
 */
export function checkRoomGames(list, games, seed) {
  if (!Array.isArray(games) || !games.length) return { ok: false, reason: 'no-games' };
  if (games.length > ROOM_LIMITS.maxGames) return { ok: false, reason: 'too-many-games' };
  const seen = new Set();
  const out = [];
  for (const [i, g] of games.entries()) {
    if (!GAME_IDS.includes(g?.type)) return { ok: false, reason: 'unknown-game' };
    if (seen.has(g.type)) return { ok: false, reason: 'duplicate-game', type: g.type };
    seen.add(g.type);
    const settings = GAMES[g.type].normalizeSettings(g.settings ?? {});
    const test = generateGame(g.type, list, settings, gameSeed(seed, i));
    if (!test.ok) return { ok: false, reason: 'game-unavailable', type: g.type };
    out.push({ type: g.type, settings });
  }
  return { ok: true, games: out };
}

/** What a room keeps of the list: a snapshot, so later edits of the list never change a running room. */
export const listSnapshot = (list) => ({
  title: list.title, topic: list.topic ?? '', level: list.level, targetLang: list.targetLang, supportLang: list.supportLang,
  items: list.items, cloze: list.cloze ?? null,
});

// ---------------------------------------------------------------------------------------------------
// results

const int = (v, min, max) => Number.isInteger(v) && v >= min && v <= max;

/**
 * A result sent by a student's browser for game `index` of the room. The client is trusted only so far
 * (it is a practice tool; cheating is an accepted risk, SPEC 8): the shape, the bounds and the item ids are
 * checked, stars are computed here, never taken from the client.
 * Returns { ok: true, result } or { ok: false, reason }.
 */
export function checkResult(room, index, r) {
  const game = room.games?.[index];
  if (!game) return { ok: false, reason: 'game-index' };
  if (!r || typeof r !== 'object') return { ok: false, reason: 'result' };
  if (!int(r.max, 1, 100) || !int(r.score, 0, r.max)) return { ok: false, reason: 'score' };
  if (!int(r.timeMs, 0, 4 * 3600 * 1000)) return { ok: false, reason: 'time' };
  const ids = new Set(room.listSnapshot.items.map((it) => it.id));
  const misses = {};
  for (const [id, n] of Object.entries(r.misses ?? {})) {
    if (!ids.has(id) || !int(n, 0, 1000)) return { ok: false, reason: 'misses' };
    if (n > 0) misses[id] = n;
  }
  const extra = {};
  for (const k of ['moves', 'wrongDrags', 'guessesUsed', 'revealsUsed', 'livesLeft']) if (r[k] != null) {
    if (!int(r[k], 0, 10000)) return { ok: false, reason: k };
    extra[k] = r[k];
  }
  for (const k of ['secretFound', 'guessedEarly', 'survived']) if (r[k] != null) extra[k] = r[k] === true;
  const result = { score: r.score, max: r.max, timeMs: r.timeMs, misses, ...extra };
  result.stars = starsFor(game.type, result, game.settings);
  return { ok: true, result };
}

/**
 * 1–3 stars for a finished game (0 = finished without a real success: no word solved, nothing right).
 * One rule per game, from the result the game reports (public/js/games/*: onFinish).
 */
export function starsFor(type, r, settings = {}) {
  const ratio = r.max ? r.score / r.max : 0;
  const missCount = Object.values(r.misses ?? {}).reduce((a, b) => a + b, 0);
  switch (type) {
    case 'memory': { // moves against pairs. Even perfect recall needs about 1.6 moves per pair on average (the
      // cards are unknown at first), so 3 stars allow 2.2 per pair (2026-11-25; 1.5 was almost unreachable)
      const moves = r.moves ?? r.max + missCount;
      return moves <= r.max * 2.2 ? 3 : moves <= r.max * 3.2 ? 2 : 1;
    }
    case 'matching': // first-try matches
      return ratio === 1 ? 3 : ratio >= 0.75 ? 2 : r.score > 0 ? 1 : 0;
    case 'wordsearch': { // every word is found when it finishes; wrong drags cost
      const w = r.wrongDrags ?? 0;
      return w <= 1 ? 3 : w <= 4 ? 2 : 1;
    }
    case 'crossword': { // help used: reveals, wrong secret-word guesses, rows typed wrong
      if (!r.secretFound) return r.score > 0 ? 1 : 0;
      const help = (r.revealsUsed ?? 0) + (r.guessesUsed ?? 0) + Object.keys(r.misses ?? {}).length;
      return help === 0 ? 3 : help <= 2 ? 2 : 1;
    }
    case 'hangman': { // words solved, and lives kept
      if (r.score === 0) return 0;
      const lives = settings.lives ?? 12;
      if (ratio === 1) return (r.livesLeft ?? 0) >= lives / 2 ? 3 : 2;
      return 1; // some words solved before the basket fell
    }
    case 'gapfill':
      return ratio === 1 ? 3 : ratio >= 0.7 ? 2 : ratio >= 0.4 ? 1 : 0;
    case 'drowning':
      if (r.survived) return missCount <= 2 ? 3 : 2;
      return ratio >= 0.5 ? 1 : 0;
    default:
      return ratio === 1 ? 3 : ratio >= 0.7 ? 2 : ratio > 0 ? 1 : 0;
  }
}

/**
 * Keeps the best try (more stars, then more points, then faster) and counts the tries; the misses of the
 * FIRST try are kept apart, because the teacher wants to see what was hard before practice.
 */
export function mergeResult(prev, next, now) {
  if (!prev) return { ...next, attempts: 1, firstMisses: next.misses, bestAt: now, lastAt: now };
  const better = next.stars > prev.stars || (next.stars === prev.stars && (next.score > prev.score || (next.score === prev.score && next.timeMs < prev.timeMs)));
  const base = better ? { ...next, bestAt: now } : { ...prev };
  return { ...base, attempts: (prev.attempts ?? 1) + 1, firstMisses: prev.firstMisses ?? prev.misses, lastAt: now };
}

/** The path summary: stars per game and the total, for the student's path and the teacher's table. */
export function pathSummary(room, results = {}) {
  const games = room.games.map((g, i) => ({ index: i, type: g.type, title: GAMES[g.type].meta.title, stars: results[i]?.stars ?? null, done: results[i] != null }));
  return { games, stars: games.reduce((a, g) => a + (g.stars ?? 0), 0), maxStars: games.length * 3, done: games.filter((g) => g.done).length };
}

export const isOpen = (room, now) => room.status === 'open' && now < room.expiresAt;

// ---------------------------------------------------------------------------------------------------
// monitor and retention (F5)

/**
 * Hardest words of a room for the teacher's monitor. A student "missed" a word when it had at least one miss in
 * the FIRST try of any game (firstMisses: what was hard before practice). `played` = students with at least one
 * result. Returns { played, words: [{ id, term, translation, students, misses, games: [type] }] } with only the
 * missed words, hardest first (more students, then more misses, then list order).
 */
export function wordStats(room, players) {
  const items = room.listSnapshot?.items ?? [];
  const order = new Map(items.map((it, i) => [it.id, i]));
  const stats = new Map();
  let played = 0;
  for (const p of players) {
    const results = Object.entries(p.results ?? {});
    if (!results.length) continue;
    played++;
    const missedBy = new Set();
    for (const [index, r] of results) {
      const type = room.games?.[index]?.type;
      for (const [id, n] of Object.entries(r?.firstMisses ?? r?.misses ?? {})) {
        if (!order.has(id) || !(n > 0)) continue;
        const s = stats.get(id) ?? { students: 0, misses: 0, games: new Set() };
        s.misses += n;
        if (type) s.games.add(type);
        if (!missedBy.has(id)) { missedBy.add(id); s.students++; }
        stats.set(id, s);
      }
    }
  }
  const words = [...stats].map(([id, s]) => {
    const it = items[order.get(id)];
    return { id, term: it.term, translation: it.translation, students: s.students, misses: s.misses, games: [...s.games] };
  }).sort((a, b) => b.students - a.students || b.misses - a.misses || order.get(a.id) - order.get(b.id));
  return { played, words };
}

/** Without a Hub pass, a closed room and its results are kept this long after closing (András, 2026-11-22). */
export const RETENTION_DAYS = 30;
export const RETENTION_MS = RETENTION_DAYS * 24 * 3600 * 1000;

/**
 * What the daily clean-up does with a room: 'expire' (still marked open but past its 7 days: close it),
 * 'delete' (closed more than RETENTION_DAYS ago and the owner has no Hub pass) or null (keep).
 */
export function cleanupAction(room, now, ownerHasPass) {
  if (room.status === 'open') return now >= room.expiresAt ? 'expire' : null;
  const closedAt = room.closedAt ?? room.expiresAt;
  return !ownerHasPass && now - closedAt > RETENTION_MS ? 'delete' : null;
}
