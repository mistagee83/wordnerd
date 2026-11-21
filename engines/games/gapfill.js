// Gapfill: one new example sentence per word with a gap. The student picks from four options (the
// answer and three distractors in the same form, from the analysis) or types the word.
// Item fields: example = { text: "Who will ___ the dog while we're away?", answer: "look after" },
// distractors = ["take after", "look for", "look into"].
import { clampInt, fail, oneOf, pickItems, rngFor, usableItems } from './common.js';
import { answersMatch } from '../lang.js';

export const meta = { id: 'gapfill', title: 'Gapfill', bilingual: 'monolingual' };

export const GAP = '___';
export const defaults = { items: 10, mode: 'options' };
export const limits = { items: { min: 3, max: 25 } };

export function normalizeSettings(s = {}) {
  return {
    items: clampInt(s.items, { def: defaults.items, ...limits.items }),
    mode: oneOf(s.mode, ['options', 'typing'], defaults.mode),
  };
}

function splitGap(text) {
  const parts = String(text).split(GAP);
  return parts.length === 2 ? { before: parts[0], after: parts[1] } : null; // exactly one gap
}

function hasOptions(it) {
  if (!Array.isArray(it.distractors)) return false;
  const distinct = new Set([it.example.answer, ...it.distractors].map((d) => String(d).trim().toLowerCase()));
  return distinct.size >= 4;
}

export function generate(list, settings, seed) {
  const s = normalizeSettings(settings);
  const rng = rngFor(seed);
  const items = usableItems(list, (it) => it.example && typeof it.example.answer === 'string' && it.example.answer.trim()
    && splitGap(it.example.text) && (s.mode === 'typing' || hasOptions(it)));
  if (items.length < limits.items.min) return fail(`needs at least ${limits.items.min} words with an example sentence${s.mode === 'options' ? ' and three distractors' : ''}`);
  const questions = pickItems(items, s.items, rng).map((it) => {
    const q = { itemId: it.id, ...splitGap(it.example.text), answer: it.example.answer };
    if (s.mode === 'options') {
      const wrong = [];
      for (const d of it.distractors) {
        const key = String(d).trim().toLowerCase();
        if (key !== it.example.answer.trim().toLowerCase() && !wrong.some((w) => w.toLowerCase() === key)) wrong.push(String(d).trim());
      }
      q.options = rng.shuffle([it.example.answer, ...wrong.slice(0, 3)]);
    }
    return q;
  });
  return { ok: true, game: meta.id, settings: { ...s, items: questions.length }, questions };
}

export const isCorrect = (question, answer, lang = 'en') => answersMatch(answer, question.answer, lang);
