// Hangman: guess the words letter by letter. A clue (translation or definition) is shown. Spaces, hyphens
// and apostrophes are visible from the start.
// The lives are shared by all the words of the game (decided 2026-11-21): e.g. 4 words with 12 lives; the
// game ends when all words are solved or the lives run out.
// Teacher settings: number of words, number of lives (balloons), clue.
import { clampInt, clueText, fail, oneOf, pickItems, rngFor, usableItems } from './common.js';
import { gridLetters, keyboard, slots } from '../lang.js';

export const meta = { id: 'hangman', title: 'Hangman', bilingual: 'both' };

export const defaults = { words: 4, lives: 12, clueMode: 'translation' };
export const limits = { words: { min: 1, max: 8 }, lives: { min: 4, max: 12 } };

export function normalizeSettings(s = {}) {
  return {
    words: clampInt(s.words, { def: defaults.words, ...limits.words }),
    lives: clampInt(s.lives, { def: defaults.lives, ...limits.lives }),
    clueMode: oneOf(s.clueMode, ['translation', 'definition', 'none'], defaults.clueMode),
  };
}

export function generate(list, settings, seed) {
  const s = normalizeSettings(settings);
  const rng = rngFor(seed);
  const lang = list?.targetLang ?? 'en';
  const items = usableItems(list, (it) => gridLetters(it.term, lang).length >= 3 && (s.clueMode === 'none' || clueText(it, s.clueMode).trim()));
  if (!items.length) return fail('needs at least one word with 3 or more letters');
  const rounds = pickItems(items, s.words, rng).map((it) => ({
    itemId: it.id,
    slots: slots(it.term, lang),
    clue: s.clueMode === 'none' ? '' : clueText(it, s.clueMode),
    keyboard: keyboard(lang, gridLetters(it.term, lang)),
  }));
  return { ok: true, game: meta.id, settings: { ...s, words: rounds.length }, maxMisses: s.lives, rounds };
}

// Round state: guessed letters and the misses of the whole game so far (lives are shared, so a new round
// starts with the misses of the previous ones). Pure reducer: returns a new state.
export function newRound(missesSoFar = 0) {
  return { guessed: [], misses: missesSoFar };
}

export function guess(round, state, letter, maxMisses) {
  if (state.guessed.includes(letter) || status(round, state, maxMisses) !== 'playing') return state;
  const hit = round.slots.some((sl) => sl.hidden && sl.letter === letter);
  return { guessed: [...state.guessed, letter], misses: state.misses + (hit ? 0 : 1) };
}

export function status(round, state, maxMisses) {
  if (state.misses >= maxMisses) return 'lost';
  const solved = round.slots.every((sl) => !sl.hidden || state.guessed.includes(sl.letter));
  return solved ? 'won' : 'playing';
}

// What the student sees: letters guessed so far, '_' for the rest.
export function display(round, state) {
  return round.slots.map((sl) => (!sl.hidden ? sl.char : state.guessed.includes(sl.letter) ? sl.letter : '_'));
}
