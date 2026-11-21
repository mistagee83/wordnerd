// Shared helpers for the game generators. Pure, no I/O.
import { createRng } from '../prng.js';

// Clue modes: what the student sees for a word.
//   translation – the support-language translation (bilingual)
//   definition  – the simple target-language definition (monolingual)
//   term        – the word itself (word search: find the listed words)
export const CLUE_MODES = ['translation', 'definition', 'term'];

export function clueText(item, mode) {
  if (mode === 'translation') return item.translation ?? '';
  if (mode === 'definition') return item.definition ?? '';
  return item.term;
}

// Clamp a number setting into [min, max]; a missing or invalid value gives the default.
export function clampInt(value, { def, min, max }) {
  const n = Number.isFinite(Number(value)) ? Math.round(Number(value)) : def;
  return Math.min(max, Math.max(min, n));
}

export function oneOf(value, allowed, def) {
  return allowed.includes(value) ? value : def;
}

// Items that have every field the game needs (non-empty), in list order.
export function usableItems(list, needs) {
  const items = Array.isArray(list?.items) ? list.items : [];
  return items.filter((it) => it && it.id && typeof it.term === 'string' && it.term.trim() && needs(it));
}

// Deterministic subset: shuffle with the game rng and take n. Same seed, same words.
export function pickItems(items, n, rng) {
  return rng.shuffle(items).slice(0, Math.min(n, items.length));
}

export function rngFor(seed) {
  return createRng(String(seed ?? ''));
}

export const fail = (reason) => ({ ok: false, reason });
