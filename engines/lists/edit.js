// Teacher edits of a word list (F3): what may change and how the rest follows. Pure, no I/O; the browser
// uses it to show errors early, the function (wnSaveList) applies it for real.
// Editable: the title; per word: term, translation, definition, category; delete words; reorder; add a
// word by hand (term, translation and definition required – the rest stays empty, so games that need an
// example sentence or a gapfill gap leave that word out). Everything else (example sentences, distractors,
// the gapfill text) is analysis data and is not edited here.
import { gridLetters } from '../lang.js';

export const EDIT_LIMITS = Object.freeze({ minItems: 4, maxItems: 40, term: 40, translation: 80, definition: 160, category: 40, title: 80 });

const clean = (v, max) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : '');
const key = (s) => s.toLowerCase();

/**
 * list: the stored list. patch: { title?, items: [{ id?, term, translation, definition, category? }] } in the
 * new order (an existing id keeps its analysis data; no id = a new word). Returns { ok: true, list, removed }
 * or { ok: false, reason, index? }.
 */
export function applyEdits(list, patch) {
  if (!patch || !Array.isArray(patch.items)) return { ok: false, reason: 'items' };
  if (patch.items.length < EDIT_LIMITS.minItems) return { ok: false, reason: 'too-few-words' };
  if (patch.items.length > EDIT_LIMITS.maxItems) return { ok: false, reason: 'too-many-words' };
  const lang = list.targetLang ?? 'en';
  const old = new Map(list.items.map((it) => [it.id, it]));
  let nextNum = Math.max(0, ...list.items.map((it) => Number(String(it.id).replace(/\D/g, '')) || 0)) + 1;
  const seenIds = new Set();
  const seenTerms = new Set();
  const items = [];
  for (const [index, p] of patch.items.entries()) {
    const term = clean(p?.term, EDIT_LIMITS.term);
    const translation = clean(p?.translation, EDIT_LIMITS.translation);
    const definition = clean(p?.definition, EDIT_LIMITS.definition);
    if (!term || gridLetters(term, lang).length < 2 || /[{}_]/.test(term)) return { ok: false, reason: 'term', index };
    if (!translation) return { ok: false, reason: 'translation', index };
    if (!definition) return { ok: false, reason: 'definition', index };
    if (seenTerms.has(key(term))) return { ok: false, reason: 'duplicate', index };
    seenTerms.add(key(term));
    const category = clean(p?.category, EDIT_LIMITS.category);
    if (p.id != null) {
      const prev = old.get(p.id);
      if (!prev || seenIds.has(p.id)) return { ok: false, reason: 'unknown-word', index };
      seenIds.add(p.id);
      items.push({ ...prev, term, lemma: prev.term === term ? prev.lemma : term, translation, definition, category: category || prev.category || '' });
    } else {
      const id = `w${String(nextNum++).padStart(2, '0')}`;
      items.push({ id, term, lemma: term, pos: '', level: list.level, translation, definition, sourceSentence: '', example: null, distractors: [], family: [], synonyms: [], antonyms: [], category, added: true });
    }
  }
  const removed = list.items.filter((it) => !seenIds.has(it.id)).map((it) => it.id);
  return {
    ok: true,
    removed,
    list: {
      ...list,
      title: clean(patch.title, EDIT_LIMITS.title) || list.title,
      items,
      cloze: list.cloze ? dropGaps(list.cloze, new Set(removed)) : list.cloze,
    },
  };
}

// A gap whose word was deleted becomes plain text (its answer), the other gaps are renumbered 1..n, so the
// text still reads and the gapfill keeps working with the words that are left.
export function dropGaps(cloze, removedIds) {
  const byN = new Map(cloze.gaps.map((g) => [g.n, g]));
  const gaps = [];
  const text = cloze.text.replace(/\{\{(\d+)\}\}/g, (m, num) => {
    const g = byN.get(Number(num));
    if (!g) return m;
    if (removedIds.has(g.itemId)) return g.answer;
    gaps.push({ ...g, n: gaps.length + 1 });
    return `{{${gaps.length}}}`;
  });
  return { text, gaps };
}

/** Short summary for the library view. */
export const summarize = (id, list) => ({
  id,
  title: list.title,
  topic: list.topic ?? '',
  level: list.level,
  targetLang: list.targetLang,
  supportLang: list.supportLang,
  words: list.items?.length ?? 0,
  sourceKind: list.source?.kind ?? null,
  createdAt: list.createdAt ?? null,
  updatedAt: list.updatedAt ?? null,
});
