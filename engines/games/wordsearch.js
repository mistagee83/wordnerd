// Word search: the words hidden in a letter grid. The student sees a clue list (the words themselves,
// or the translations / definitions for a harder version) and marks each word from first to last letter.
// Teacher settings (old skill tree): number of words, grid size, directions.
import { clampInt, clueText, fail, oneOf, pickItems, rngFor, usableItems } from './common.js';
import { fillerAlphabet, gridLetters } from '../lang.js';

export const meta = { id: 'wordsearch', title: 'Word search', bilingual: 'both' };

export const defaults = { words: 10, size: 0, directions: 'medium', clueMode: 'term' };
export const limits = { words: { min: 4, max: 20 }, size: { min: 8, max: 16 } };

// [dRow, dCol]
const DIRS = {
  easy: [[0, 1], [1, 0]], // right, down
  medium: [[0, 1], [1, 0], [1, 1], [-1, 1]], // + diagonals going right
  hard: [[0, 1], [1, 0], [1, 1], [-1, 1], [0, -1], [-1, 0], [-1, -1], [1, -1]], // + backwards
};

export function normalizeSettings(s = {}) {
  return {
    words: clampInt(s.words, { def: defaults.words, ...limits.words }),
    // 0 = automatic (fits the longest word and the letter count)
    size: Number(s.size) ? clampInt(s.size, { def: 12, ...limits.size }) : 0,
    directions: oneOf(s.directions, Object.keys(DIRS), defaults.directions),
    clueMode: oneOf(s.clueMode, ['term', 'translation', 'definition'], defaults.clueMode),
  };
}

function autoSize(words) {
  const longest = Math.max(...words.map((w) => w.length));
  const letters = words.reduce((n, w) => n + w.length, 0);
  // about half of the cells hold word letters; never smaller than the longest word
  return Math.min(limits.size.max, Math.max(limits.size.min, longest, Math.ceil(Math.sqrt(letters * 2))));
}

// Every start cell and direction where the word stays on the grid.
function positions(n, len, dirs) {
  const out = [];
  for (const [dr, dc] of dirs) {
    const rowMin = dr < 0 ? len - 1 : 0;
    const rowMax = dr > 0 ? n - len : n - 1;
    const colMin = dc < 0 ? len - 1 : 0;
    const colMax = dc > 0 ? n - len : n - 1;
    for (let row = rowMin; row <= rowMax; row++) for (let col = colMin; col <= colMax; col++) out.push({ row, col, dr, dc });
  }
  return out;
}

const fits = (grid, letters, { row, col, dr, dc }) =>
  letters.every((l, i) => { const cell = grid[row + dr * i][col + dc * i]; return cell === null || cell === l; }); // cross only on the same letter

// Tries every position in a seeded random order: a word is skipped only if it really cannot fit.
function place(grid, letters, dirs, rng) {
  const pos = rng.shuffle(positions(grid.length, letters.length, dirs)).find((p) => fits(grid, letters, p));
  if (!pos) return null;
  letters.forEach((l, i) => { grid[pos.row + pos.dr * i][pos.col + pos.dc * i] = l; });
  return pos;
}

export function generate(list, settings, seed) {
  const s = normalizeSettings(settings);
  const rng = rngFor(seed);
  const lang = list?.targetLang ?? 'en';
  // with a fixed grid size only words that fit are used (a long word never makes the grid fail)
  const maxLen = s.size || limits.size.max;
  const items = usableItems(list, (it) => {
    const n = gridLetters(it.term, lang).length;
    return n >= 2 && n <= maxLen && clueText(it, s.clueMode).trim();
  });
  if (items.length < limits.words.min) return fail(`needs at least ${limits.words.min} words of 2–${maxLen} letters`);

  const chosen = pickItems(items, s.words, rng).map((it) => ({ item: it, letters: gridLetters(it.term, lang) }));
  const size = s.size || autoSize(chosen.map((c) => c.letters));
  const grid = Array.from({ length: size }, () => Array(size).fill(null));
  const dirs = DIRS[s.directions];

  // longest first: they are the hardest to fit
  const order = [...chosen].sort((a, b) => b.letters.length - a.letters.length || (a.item.id < b.item.id ? -1 : 1));
  const placements = [];
  const skipped = [];
  for (const { item, letters } of order) {
    const placed = place(grid, letters, dirs, rng);
    if (placed) placements.push({ itemId: item.id, length: letters.length, ...placed });
    else skipped.push(item.id);
  }
  if (placements.length < limits.words.min) return fail('the words do not fit the grid');

  const filler = fillerAlphabet(lang, chosen.map((c) => c.letters));
  const rows = grid.map((r) => r.map((cell) => cell ?? rng.pick(filler)));
  // the clue list follows the original list order, not the placement order
  const placedIds = new Set(placements.map((p) => p.itemId));
  const clues = chosen.filter((c) => placedIds.has(c.item.id)).map((c) => ({ itemId: c.item.id, text: clueText(c.item, s.clueMode) }));
  return { ok: true, game: meta.id, settings: { ...s, size }, size, grid: rows, placements, clues, skipped };
}

// The student marks a line from (r1,c1) to (r2,c2). Returns the itemId it finds, or null.
// Either end may be first (a word marked backwards still counts).
export function findWord(puzzle, r1, c1, r2, c2) {
  for (const p of puzzle.placements) {
    const er = p.row + p.dr * (p.length - 1);
    const ec = p.col + p.dc * (p.length - 1);
    if ((p.row === r1 && p.col === c1 && er === r2 && ec === c2) || (p.row === r2 && p.col === c2 && er === r1 && ec === c1)) return p.itemId;
  }
  return null;
}

// The cells of a straight line (row, column or 45° diagonal) from (r1,c1) to (r2,c2), or null if the two
// cells are not on one line. The UI uses it to highlight a drag only when it could be a word.
export function lineCells(r1, c1, r2, c2) {
  const dr = Math.sign(r2 - r1);
  const dc = Math.sign(c2 - c1);
  const len = Math.max(Math.abs(r2 - r1), Math.abs(c2 - c1)) + 1;
  if (r1 !== r2 && c1 !== c2 && Math.abs(r2 - r1) !== Math.abs(c2 - c1)) return null;
  return Array.from({ length: len }, (_, i) => [r1 + dr * i, c1 + dc * i]);
}

export function cellsOf(p) {
  return Array.from({ length: p.length }, (_, i) => [p.row + p.dr * i, p.col + p.dc * i]);
}
