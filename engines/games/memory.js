// Memory: pairs of cards (word ↔ translation or definition), face down; turn two, keep matching pairs.
// Teacher settings (old skill tree): number of pairs, how long a wrong pair stays face up.
import { clampInt, clueText, fail, oneOf, pickItems, rngFor, usableItems } from './common.js';

export const meta = { id: 'memory', title: 'Memory', bilingual: 'both' };

export const defaults = { pairs: 8, clueMode: 'translation', flipMs: 1000 };
export const limits = { pairs: { min: 4, max: 12 }, flipMs: { min: 500, max: 4000 } };

export function normalizeSettings(s = {}) {
  return {
    pairs: clampInt(s.pairs, { def: defaults.pairs, ...limits.pairs }),
    clueMode: oneOf(s.clueMode, ['translation', 'definition'], defaults.clueMode),
    flipMs: clampInt(s.flipMs, { def: defaults.flipMs, ...limits.flipMs }),
  };
}

export function generate(list, settings, seed) {
  const s = normalizeSettings(settings);
  const rng = rngFor(seed);
  const items = usableItems(list, (it) => clueText(it, s.clueMode).trim());
  if (items.length < limits.pairs.min) return fail(`needs at least ${limits.pairs.min} words with a ${s.clueMode}`);
  const chosen = pickItems(items, s.pairs, rng);
  const cards = rng.shuffle(chosen.flatMap((it) => [
    { itemId: it.id, face: 'term', text: it.term },
    { itemId: it.id, face: 'clue', text: clueText(it, s.clueMode) },
  ])).map((c, i) => ({ cardId: `c${i}`, ...c }));
  return { ok: true, game: meta.id, settings: { ...s, pairs: chosen.length }, cards };
}

// A pair matches when both cards belong to the same word and show different faces.
export const isPair = (a, b) => a.itemId === b.itemId && a.face !== b.face;
