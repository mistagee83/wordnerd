// Memory: pairs of cards (word ↔ translation or definition), face down; turn two, keep matching pairs.
// The board is always square (decided 2026-11-21): 3×3, 4×4, 5×5 or 6×6. On an odd board the centre
// cell is a fixed logo tile, so 3×3 = 4 pairs, 4×4 = 8, 5×5 = 12, 6×6 = 18 (old skill tree: 8 → 12 pairs).
// Teacher settings: board size, clue type, how long a wrong pair stays face up.
import { clampInt, clueText, fail, oneOf, pickItems, rngFor, usableItems } from './common.js';

export const meta = { id: 'memory', title: 'Memory', bilingual: 'both' };

export const defaults = { grid: 4, clueMode: 'translation', flipMs: 1000 };
export const limits = { grid: { min: 3, max: 6 }, flipMs: { min: 500, max: 4000 } };

export const pairsFor = (n) => Math.floor((n * n) / 2);

export function normalizeSettings(s = {}) {
  return {
    grid: clampInt(s.grid, { def: defaults.grid, ...limits.grid }),
    clueMode: oneOf(s.clueMode, ['translation', 'definition'], defaults.clueMode),
    flipMs: clampInt(s.flipMs, { def: defaults.flipMs, ...limits.flipMs }),
  };
}

export function generate(list, settings, seed) {
  const s = normalizeSettings(settings);
  const rng = rngFor(seed);
  const items = usableItems(list, (it) => clueText(it, s.clueMode).trim());
  // a short list gets the largest square board it can fill
  let n = s.grid;
  while (n > limits.grid.min && pairsFor(n) > items.length) n -= 1;
  if (pairsFor(n) > items.length) return fail(`needs at least ${pairsFor(limits.grid.min)} words with a ${s.clueMode}`);
  const chosen = pickItems(items, pairsFor(n), rng);
  const cards = rng.shuffle(chosen.flatMap((it) => [
    { itemId: it.id, face: 'term', text: it.term },
    { itemId: it.id, face: 'clue', text: clueText(it, s.clueMode) },
  ])).map((c, i) => ({ cardId: `c${i}`, ...c }));
  if (n % 2 === 1) cards.splice(Math.floor((n * n) / 2), 0, { cardId: 'logo', logo: true }); // centre cell
  return { ok: true, game: meta.id, settings: { ...s, grid: n }, grid: n, pairs: chosen.length, cards };
}

// A pair matches when both cards belong to the same word and show different faces.
export const isPair = (a, b) => !a.logo && !b.logo && a.itemId === b.itemId && a.face !== b.face;
