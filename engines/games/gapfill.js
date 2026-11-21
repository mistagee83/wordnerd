// Gapfill (redesigned 2026-11-21, as in the old WordNerd "complex gapfill"): one connected text written by
// the analysis with the list words, the gaps marked; the words are in a bank. The student drags (or taps)
// words into the gaps, can move them around, and checks everything at the end.
// List field: cloze = { text: "Mr Harris {{1}} his little son…", gaps: [{ n: 1, itemId: "w01", answer: "looks after" }] }
// `answer` is the exact form that fits the gap (it may be inflected). Teacher setting: extra wrong words in the bank.
import { clampInt, fail, rngFor } from './common.js';
import { answersMatch } from '../lang.js';

export const meta = { id: 'gapfill', title: 'Gapfill', bilingual: 'monolingual' };

export const defaults = { extras: 2 };
export const limits = { extras: { min: 0, max: 4 } };
export const MIN_GAPS = 4;
const MARKER = /\{\{(\d+)\}\}/g;

export function normalizeSettings(s = {}) {
  return { extras: clampInt(s.extras, { def: defaults.extras, ...limits.extras }) };
}

// Text → segments; null if markers and gaps do not match one to one.
export function parseCloze(cloze) {
  if (!cloze || typeof cloze.text !== 'string' || !Array.isArray(cloze.gaps)) return null;
  const byN = new Map(cloze.gaps.filter((g) => g && typeof g.answer === 'string' && g.answer.trim()).map((g) => [Number(g.n), g]));
  const segments = [];
  const seen = new Set();
  let last = 0;
  for (const m of cloze.text.matchAll(MARKER)) {
    const n = Number(m[1]);
    const gap = byN.get(n);
    if (!gap || seen.has(n)) return null;
    seen.add(n);
    if (m.index > last) segments.push({ type: 'text', text: cloze.text.slice(last, m.index) });
    segments.push({ type: 'gap', gapId: `g${n}`, itemId: gap.itemId ?? null, answer: gap.answer.trim() });
    last = m.index + m[0].length;
  }
  if (last < cloze.text.length) segments.push({ type: 'text', text: cloze.text.slice(last) });
  if (seen.size !== byN.size) return null; // a gap entry without a marker
  return segments;
}

export function generate(list, settings, seed) {
  const s = normalizeSettings(settings);
  const rng = rngFor(seed);
  const segments = parseCloze(list?.cloze);
  if (!segments) return fail('the list has no valid gapfill text');
  const gaps = segments.filter((x) => x.type === 'gap');
  if (gaps.length < MIN_GAPS) return fail(`the gapfill text needs at least ${MIN_GAPS} gaps`);

  // extra wrong words: distractors of the gap words that are not an answer anywhere in the text
  const answers = new Set(gaps.map((g) => g.answer.toLowerCase()));
  const items = new Map((list.items ?? []).map((it) => [it.id, it]));
  const pool = [];
  for (const g of gaps) {
    for (const d of items.get(g.itemId)?.distractors ?? []) {
      const t = String(d).trim();
      if (t && !answers.has(t.toLowerCase()) && !pool.some((p) => p.toLowerCase() === t.toLowerCase())) pool.push(t);
    }
  }
  const extras = rng.shuffle(pool).slice(0, s.extras);
  const bank = rng.shuffle([
    ...gaps.map((g) => ({ text: g.answer, itemId: g.itemId })),
    ...extras.map((text) => ({ text, itemId: null })),
  ]).map((chip, i) => ({ chipId: `k${i}`, ...chip }));
  return {
    ok: true,
    game: meta.id,
    settings: { ...s, extras: extras.length },
    segments: segments.map((x) => (x.type === 'gap' ? { type: 'gap', gapId: x.gapId, itemId: x.itemId } : x)),
    answers: Object.fromEntries(gaps.map((g) => [g.gapId, g.answer])),
    bank,
  };
}

// placed: { gapId: chipText }. Returns per-gap results and the score; identical words are interchangeable.
export function checkAll(puzzle, placed, lang = 'en') {
  const results = Object.fromEntries(Object.entries(puzzle.answers).map(([gapId, answer]) => [gapId, answersMatch(placed[gapId] ?? '', answer, lang)]));
  return { results, score: Object.values(results).filter(Boolean).length, max: Object.keys(results).length };
}
