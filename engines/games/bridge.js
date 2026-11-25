// Bridge (added 2026-11-25): build a bridge across a gorge, one plank per sentence. Each sentence is the item's
// example with one gap; the student picks the word that fits from the answer and the item's distractors.
// A right choice lays a plank; a wrong one cracks and falls, and that sentence comes back at the end.
// Uses only fields the analysis already writes (example, distractors); hand-added words have no example and
// are skipped, as in the gapfill.
import { fail, pickItems, rngFor, clampInt } from './common.js';

export const meta = { id: 'bridge', title: 'Bridge', bilingual: 'monolingual' };

export const defaults = { words: 10 };
export const limits = { words: { min: 5, max: 20 } };

export function normalizeSettings(s = {}) {
  return { words: clampInt(s.words, { def: defaults.words, ...limits.words }) };
}

const clean = (v) => (typeof v === 'string' ? v.trim() : '');
const key = (v) => clean(v).toLowerCase().replace(/\s+/g, ' ');

/** The options of an item: the answer plus up to three distractors, all different; null if unusable. */
function optionsOf(it) {
  const text = clean(it?.example?.text);
  const answer = clean(it?.example?.answer);
  if (!answer || text.split('___').length !== 2) return null;
  const seen = new Set([key(answer)]);
  const wrong = [];
  for (const d of Array.isArray(it.distractors) ? it.distractors : []) {
    const k = key(d);
    if (!k || seen.has(k) || wrong.length >= 3) continue;
    seen.add(k);
    wrong.push(clean(d));
  }
  if (wrong.length < 2) return null; // at least three options, or it is a guess between two
  return { text, answer, wrong };
}

export function generate(list, settings, seed) {
  const s = normalizeSettings(settings);
  const rng = rngFor(seed);
  const items = (Array.isArray(list?.items) ? list.items : []).filter((it) => it?.id && optionsOf(it));
  if (items.length < limits.words.min) return fail(`needs at least ${limits.words.min} words with an example sentence`);
  const queue = pickItems(items, s.words, rng).map((it) => {
    const o = optionsOf(it);
    const [before, after] = o.text.split('___');
    return { itemId: it.id, before, after, answer: o.answer, options: rng.shuffle([o.answer, ...o.wrong]) };
  });
  return { ok: true, game: meta.id, settings: { ...s, words: queue.length }, queue };
}

export const isCorrect = (entry, choice) => choice === entry.answer;
