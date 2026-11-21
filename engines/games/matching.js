// Matching: words in one column, translations or definitions in the other; connect the pairs.
import { clampInt, clueText, fail, oneOf, pickItems, rngFor, usableItems } from './common.js';

export const meta = { id: 'matching', title: 'Matching', bilingual: 'both' };

export const defaults = { pairs: 10, clueMode: 'translation' };
export const limits = { pairs: { min: 4, max: 15 } };

export function normalizeSettings(s = {}) {
  return {
    pairs: clampInt(s.pairs, { def: defaults.pairs, ...limits.pairs }),
    clueMode: oneOf(s.clueMode, ['translation', 'definition'], defaults.clueMode),
  };
}

export function generate(list, settings, seed) {
  const s = normalizeSettings(settings);
  const rng = rngFor(seed);
  const items = usableItems(list, (it) => clueText(it, s.clueMode).trim());
  if (items.length < limits.pairs.min) return fail(`needs at least ${limits.pairs.min} words with a ${s.clueMode}`);
  const chosen = pickItems(items, s.pairs, rng);
  const left = chosen.map((it) => ({ itemId: it.id, text: it.term }));
  const right = rng.shuffle(chosen).map((it) => ({ itemId: it.id, text: clueText(it, s.clueMode) }));
  return { ok: true, game: meta.id, settings: { ...s, pairs: chosen.length }, left, right };
}

export const isMatch = (leftEntry, rightEntry) => leftEntry.itemId === rightEntry.itemId;
