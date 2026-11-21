// Crossword with a hidden word (the old WordNerd design, "Crossword puzzle dinamikus kiépítése", 2012):
// a hidden word stands vertically in the middle; every row is a list word written across, crossing the
// hidden column at one of its letters. Row clues are translations or definitions; the hidden word has no
// clue – the student discovers it. Teacher settings (old skill tree): hidden word length, number of reveals,
// number of guesses at the secret word.
// The goal (decided 2026-11-21): find the secret word. Solving rows gives its letters; a student who sees it
// early can guess it at any time. Solving every row also counts as finding it.
import { clampInt, clueText, fail, oneOf, rngFor, usableItems } from './common.js';
import { gridLetters } from '../lang.js';

export const meta = { id: 'crossword', title: 'Crossword', bilingual: 'both' };

export const defaults = { hiddenLength: 7, clueMode: 'definition', reveals: 3, guesses: 3 };
export const limits = { hiddenLength: { min: 4, max: 12 }, reveals: { min: 0, max: 10 }, guesses: { min: 1, max: 5 } };
const HIDDEN_SPAN = 3; // a hidden word may be up to this many letters longer than asked
const SHUFFLES_PER_CANDIDATE = 20;

export function normalizeSettings(s = {}) {
  return {
    hiddenLength: clampInt(s.hiddenLength, { def: defaults.hiddenLength, ...limits.hiddenLength }),
    clueMode: oneOf(s.clueMode, ['translation', 'definition'], defaults.clueMode),
    reveals: clampInt(s.reveals, { def: defaults.reveals, ...limits.reveals }),
    guesses: clampInt(s.guesses, { def: defaults.guesses, ...limits.guesses }),
  };
}

// Assign one distinct word to every hidden letter. Letters with the fewest options go first, which
// solves almost every real list greedily; a few shuffled retries cover the rest.
function assignRows(hidden, others, rng) {
  const options = hidden.map((letter) => others.filter((o) => o.letters.includes(letter)));
  if (options.some((opt) => opt.length === 0)) return null;
  const order = hidden.map((_, i) => i).sort((a, b) => options[a].length - options[b].length || a - b);
  const used = new Set();
  const rows = Array(hidden.length);
  for (const i of order) {
    const free = rng.shuffle(options[i]).find((o) => !used.has(o.item.id));
    if (!free) return null;
    used.add(free.item.id);
    const positions = free.letters.map((l, p) => (l === hidden[i] ? p : -1)).filter((p) => p >= 0);
    rows[i] = { ...free, cross: rng.pick(positions) };
  }
  return rows;
}

export function generate(list, settings, seed) {
  const s = normalizeSettings(settings);
  const rng = rngFor(seed);
  const lang = list?.targetLang ?? 'en';
  const entries = usableItems(list, (it) => clueText(it, s.clueMode).trim())
    .map((item) => ({ item, letters: gridLetters(item.term, lang) }))
    .filter((e) => e.letters.length >= 2);

  const candidates = rng.shuffle(entries.filter((e) => e.letters.length >= s.hiddenLength && e.letters.length <= s.hiddenLength + HIDDEN_SPAN))
    .sort((a, b) => a.letters.length - b.letters.length); // closest to the asked length first (stable after shuffle)
  if (!candidates.length) return fail(`no word with ${s.hiddenLength}–${s.hiddenLength + HIDDEN_SPAN} letters for the hidden word`);

  for (const hidden of candidates) {
    const others = entries.filter((e) => e.item.id !== hidden.item.id);
    if (others.length < hidden.letters.length) continue;
    for (let t = 0; t < SHUFFLES_PER_CANDIDATE; t++) {
      const rows = assignRows(hidden.letters, others, rng);
      if (!rows) continue;
      const hiddenCol = Math.max(...rows.map((r) => r.cross));
      const width = Math.max(...rows.map((r) => hiddenCol - r.cross + r.letters.length));
      return {
        ok: true,
        game: meta.id,
        settings: { ...s, hiddenLength: hidden.letters.length },
        width,
        hiddenCol,
        hidden: { itemId: hidden.item.id, letters: hidden.letters, clue: clueText(hidden.item, s.clueMode) },
        rows: rows.map((r, i) => ({
          number: i + 1,
          itemId: r.item.id,
          letters: r.letters,
          offset: hiddenCol - r.cross, // first column of the row
          cross: r.cross, // index of the letter in the hidden column
          clue: clueText(r.item, s.clueMode),
        })),
      };
    }
  }
  return fail('could not build a crossword from these words; try a shorter hidden word or more words');
}

// Is a typed row correct? Letters compared on the grid form (upper case, letters only).
export function rowCorrect(row, typedLetters) {
  return row.letters.length === typedLetters.length && row.letters.every((l, i) => l === typedLetters[i]);
}

// Is a guess at the secret word right? Compared on grid letters, so case, spaces and hyphens do not matter.
export function secretCorrect(puzzle, typed, lang = 'en') {
  const letters = gridLetters(typed, lang);
  return letters.length === puzzle.hidden.letters.length && letters.every((l, i) => l === puzzle.hidden.letters[i]);
}
