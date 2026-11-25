// Game registry: the seven first-version games plus Bridge (2026-11-25) (SPEC 6). Each module exports
// meta, defaults, limits, normalizeSettings(settings) and generate(list, settings, seed).
// generate() returns { ok: true, game, settings, ... } or { ok: false, reason }.
import * as memory from './memory.js';
import * as matching from './matching.js';
import * as wordsearch from './wordsearch.js';
import * as crossword from './crossword.js';
import * as hangman from './hangman.js';
import * as gapfill from './gapfill.js';
import * as drowning from './drowning.js';
import * as bridge from './bridge.js';

export const GAMES = { memory, matching, wordsearch, crossword, hangman, gapfill, drowning, bridge };
export const GAME_IDS = Object.keys(GAMES);

// The seed of one game in a room: the room seed plus the game's position, so two games of the same type in
// one room differ, and every student gets the same puzzle for the same game.
export const gameSeed = (roomSeed, gameIndex) => `${roomSeed}:${gameIndex}`;

export function generateGame(type, list, settings, seed) {
  const g = GAMES[type];
  if (!g) return { ok: false, reason: `unknown game: ${type}` };
  return g.generate(list, settings, seed);
}
