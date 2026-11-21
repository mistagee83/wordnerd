// Turns the model's answer into a word-list document (SPEC 5, 8) – or says why it cannot.
// Code decides everything structural: ids, how many items, which fields are trustworthy. A broken
// optional field is dropped (the game that needs it simply leaves that word out); a broken item is
// dropped; too few usable items or an unusable gapfill text is a failure (the caller retries once,
// then gives the credits back). Pure module: no I/O.
import { parseCloze } from '../games/gapfill.js';
import { gridLetters } from '../lang.js';
import { AUTO_MAX } from './prompt.js';

export const MIN_ITEMS = 8;
export const MIN_GAPS = 4;
const MAX = { term: 40, definition: 160, translation: 80, sentence: 300, label: 40, title: 80, topic: 40, cloze: 2000 };

const clean = (v, max) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : '');
const key = (s) => clean(s, 200).toLowerCase();
const words = (list, max, n) => (Array.isArray(list) ? [...new Set(list.map((x) => clean(x, max)).filter(Boolean))].slice(0, n) : []);

function cleanExample(ex) {
  // "a ___ ." -> "a ___." (the model sometimes leaves a space before the punctuation after the gap)
  const text = clean(ex?.text, MAX.sentence).replace(/___\s+([.,!?;:])/g, '___$1');
  const answer = clean(ex?.answer, MAX.term);
  if (!answer || text.split('___').length !== 2) return null;
  return { text, answer };
}

function cleanDistractors(list, answer) {
  const out = [];
  for (const d of Array.isArray(list) ? list : []) {
    const t = clean(d, MAX.term);
    if (t && key(t) !== key(answer) && !out.some((o) => key(o) === key(t))) out.push(t);
  }
  return out.slice(0, 3);
}

/**
 * raw: the model's JSON. opts: { count, level, targetLang, supportLang, title?, source }.
 * Returns { ok: true, list, warnings } or { ok: false, reason, retry, warnings }.
 * reason: 'unsuitable' (the model said the material is not usable; no retry), 'too_few_items', 'no_cloze'.
 */
export function normalizeAnalysis(raw, opts) {
  const warnings = [];
  const lang = opts.targetLang ?? 'en';
  if (!raw || typeof raw !== 'object') return { ok: false, reason: 'bad_output', retry: true, warnings };
  if (raw.suitable === false) return { ok: false, reason: 'unsuitable', retry: false, detail: clean(raw.reason, 200), warnings };

  const items = [];
  const seen = new Set();
  for (const it of Array.isArray(raw.items) ? raw.items : []) {
    const term = clean(it?.term, MAX.term);
    const definition = clean(it?.definition, MAX.definition);
    const translation = clean(it?.translation, MAX.translation);
    if (!term || gridLetters(term, lang).length < 2 || /[{}_]/.test(term)) { warnings.push(`dropped item: bad term "${term}"`); continue; }
    if (!definition || !translation) { warnings.push(`dropped item "${term}": no definition or translation`); continue; }
    if (seen.has(key(term))) { warnings.push(`dropped duplicate "${term}"`); continue; }
    seen.add(key(term));
    const example = cleanExample(it.example);
    if (!example) warnings.push(`"${term}": example sentence dropped (needs exactly one ___ and an answer)`);
    const distractors = example ? cleanDistractors(it.distractors, example.answer) : [];
    if (example && distractors.length < 3) warnings.push(`"${term}": only ${distractors.length} usable distractors`);
    items.push({
      term,
      lemma: term,
      pos: clean(it.pos, MAX.label),
      level: ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'].includes(it.level) ? it.level : opts.level,
      definition,
      translation,
      sourceSentence: clean(it.sourceSentence, MAX.sentence),
      example,
      distractors,
      family: words(it.family, MAX.term, 4),
      synonyms: words(it.synonyms, MAX.term, 3),
      antonyms: words(it.antonyms, MAX.term, 3),
      category: clean(it.category, MAX.label),
    });
    if (items.length === (opts.count === 'auto' ? AUTO_MAX : opts.count)) break;
  }
  if (items.length < MIN_ITEMS) return { ok: false, reason: 'too_few_items', retry: true, warnings };
  items.forEach((it, i) => { it.id = `w${String(i + 1).padStart(2, '0')}`; });

  // gapfill text: gaps must point at list items; a gap that does not is written into the text as plain
  // words (the text still reads correctly), and the remaining gaps are renumbered 1..n in reading order
  const byTerm = new Map(items.map((it) => [key(it.term), it.id]));
  const rawText = clean(raw.cloze?.text, MAX.cloze);
  const rawGaps = new Map((Array.isArray(raw.cloze?.gaps) ? raw.cloze.gaps : []).map((g) => [Number(g?.n), g]));
  let n = 0;
  const gaps = [];
  const usedItems = new Set();
  const text = rawText.replace(/\{\{(\d+)\}\}/g, (m, num) => {
    const g = rawGaps.get(Number(num));
    const answer = clean(g?.answer, MAX.term);
    const itemId = byTerm.get(key(g?.term));
    rawGaps.delete(Number(num)); // a second marker with the same number becomes plain text
    if (!g || !answer) { warnings.push(`gap ${num}: no answer, removed`); return '…'; }
    if (!itemId || usedItems.has(itemId)) { warnings.push(`gap ${num}: "${g.term}" is not a list word (or repeated), written as text`); return answer; }
    usedItems.add(itemId);
    n += 1;
    gaps.push({ n, itemId, answer });
    return `{{${n}}}`;
  });
  const cloze = { text, gaps };
  if (gaps.length < MIN_GAPS || !parseCloze(cloze)) return { ok: false, reason: 'no_cloze', retry: true, warnings };

  return {
    ok: true,
    warnings,
    list: {
      title: clean(opts.title, MAX.title) || clean(raw.title, MAX.title) || 'Word list',
      topic: clean(raw.topic, MAX.topic),
      level: opts.level,
      targetLang: lang,
      supportLang: opts.supportLang,
      items,
      cloze,
      source: opts.source,
    },
  };
}
