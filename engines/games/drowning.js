// Drowning (old WordNerd): the translation appears, the student types the target-language word before
// the water reaches the top. A correct answer drains the water a little; at the top the game ends.
// Teacher setting (old skill tree): water speed. Timing lives in the UI; the engine gives the numbers.
import { fail, oneOf, pickItems, rngFor, usableItems, clampInt } from './common.js';
import { answersMatch } from '../lang.js';

export const meta = { id: 'drowning', title: 'Drowning', bilingual: 'bilingual' };

export const SPEEDS = {
  // seconds for the water to rise from empty to the top, and how much a correct answer drains (0–1)
  slow: { fillSeconds: 60, drain: 0.2 },
  normal: { fillSeconds: 40, drain: 0.15 },
  fast: { fillSeconds: 25, drain: 0.12 },
};
export const defaults = { words: 15, speed: 'normal', clueMode: 'translation' };
export const limits = { words: { min: 5, max: 30 } };

export function normalizeSettings(s = {}) {
  return {
    words: clampInt(s.words, { def: defaults.words, ...limits.words }),
    speed: oneOf(s.speed, Object.keys(SPEEDS), defaults.speed),
    clueMode: oneOf(s.clueMode, ['translation', 'definition'], defaults.clueMode),
  };
}

export function generate(list, settings, seed) {
  const s = normalizeSettings(settings);
  const rng = rngFor(seed);
  const field = s.clueMode;
  const items = usableItems(list, (it) => typeof it[field] === 'string' && it[field].trim());
  if (items.length < limits.words.min) return fail(`needs at least ${limits.words.min} words with a ${field}`);
  const queue = pickItems(items, s.words, rng).map((it) => ({ itemId: it.id, prompt: it[field], answer: it.term }));
  return { ok: true, game: meta.id, settings: { ...s, words: queue.length }, ...SPEEDS[s.speed], queue };
}

export const isCorrect = (entry, typed, lang = 'en') => answersMatch(typed, entry.answer, lang);

// Water level after `seconds` with `correct` answers so far, 0 (empty) to 1 (top = game over).
// Pure helper so the UI and tests agree on the rule.
export function waterLevel(puzzle, seconds, correct) {
  return Math.max(0, Math.min(1, seconds / puzzle.fillSeconds - correct * puzzle.drain));
}
