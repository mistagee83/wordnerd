// Matching (redesigned 2026-11-21): definition cards in a column, the words in a bank; the student drags
// (or taps) each word onto its definition. A correct word snaps in, a wrong one flies back and counts as a
// mistake. Definitions by default; translations are still possible for a bilingual version.
import { clampInt, clueText, fail, oneOf, pickItems, rngFor, usableItems } from './common.js';

export const meta = { id: 'matching', title: 'Matching', bilingual: 'both' };

export const defaults = { pairs: 6, clueMode: 'definition' };
export const limits = { pairs: { min: 4, max: 10 } };

export function normalizeSettings(s = {}) {
  return {
    pairs: clampInt(s.pairs, { def: defaults.pairs, ...limits.pairs }),
    clueMode: oneOf(s.clueMode, ['definition', 'translation'], defaults.clueMode),
  };
}

export function generate(list, settings, seed) {
  const s = normalizeSettings(settings);
  const rng = rngFor(seed);
  const items = usableItems(list, (it) => clueText(it, s.clueMode).trim());
  if (items.length < limits.pairs.min) return fail(`needs at least ${limits.pairs.min} words with a ${s.clueMode}`);
  const chosen = pickItems(items, s.pairs, rng);
  const targets = chosen.map((it) => ({ itemId: it.id, text: clueText(it, s.clueMode) }));
  const bank = rng.shuffle(chosen).map((it) => ({ itemId: it.id, text: it.term }));
  return { ok: true, game: meta.id, settings: { ...s, pairs: chosen.length }, targets, bank };
}

export const isMatch = (word, target) => word.itemId === target.itemId;
