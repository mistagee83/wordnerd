import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyEdits, dropGaps, summarize, EDIT_LIMITS } from '../engines/lists/edit.js';
import { parseCloze } from '../engines/games/gapfill.js';
import { GAME_IDS, generateGame } from '../engines/games/index.js';
import sample from '../engines/fixtures/sample-family-b1.js';

const patchOf = (list) => ({ title: list.title, items: list.items.map(({ id, term, translation, definition, category }) => ({ id, term, translation, definition, category })) });

test('edits: an unchanged patch keeps the list as it was', () => {
  const r = applyEdits(sample, patchOf(sample));
  assert.equal(r.ok, true);
  assert.deepEqual(r.list.items, sample.items);
  assert.deepEqual(r.removed, []);
  assert.deepEqual(r.list.cloze, sample.cloze);
});

test('edits: text changes keep the analysis data of the word', () => {
  const p = patchOf(sample);
  p.items[0] = { ...p.items[0], term: 'look  after ', translation: 'vigyáz valakire', definition: 'to care for someone' };
  const r = applyEdits(sample, p);
  const w = r.list.items[0];
  assert.deepEqual([w.term, w.translation, w.definition], ['look after', 'vigyáz valakire', 'to care for someone']);
  assert.deepEqual(w.example, sample.items[0].example);
  assert.deepEqual(w.distractors, sample.items[0].distractors);
});

test('edits: deleting a word turns its gapfill gap into text and renumbers the rest', () => {
  const p = patchOf(sample);
  p.items = p.items.filter((it) => it.id !== 'w07'); // "relatives" is gap 1
  const r = applyEdits(sample, p);
  assert.deepEqual(r.removed, ['w07']);
  assert.equal(r.list.cloze.gaps.length, 10);
  assert.ok(r.list.cloze.text.startsWith('Every summer all our relatives meet'));
  assert.ok(r.list.cloze.gaps.every((g, i) => g.n === i + 1));
  assert.ok(parseCloze(r.list.cloze));
});

test('edits: reorder and a new word by hand; every game still builds', () => {
  const p = patchOf(sample);
  p.items.reverse();
  p.items.push({ term: 'twin', translation: 'iker', definition: 'one of two children born at the same time' });
  const r = applyEdits(sample, p);
  assert.equal(r.ok, true);
  assert.equal(r.list.items[0].id, 'w20');
  const added = r.list.items.at(-1);
  assert.deepEqual([added.id, added.term, added.added, added.example], ['w21', 'twin', true, null]);
  for (const id of GAME_IDS) assert.equal(generateGame(id, r.list, {}, 's').ok, true, id);
});

test('edits: refusals name the reason and the row', () => {
  const p = () => patchOf(sample);
  const bad = (fn) => { const x = p(); fn(x); return applyEdits(sample, x); };
  assert.deepEqual(bad((x) => { x.items[3].term = ''; }), { ok: false, reason: 'term', index: 3 });
  assert.deepEqual(bad((x) => { x.items[2].translation = ' '; }), { ok: false, reason: 'translation', index: 2 });
  assert.deepEqual(bad((x) => { x.items[1].definition = ''; }), { ok: false, reason: 'definition', index: 1 });
  assert.deepEqual(bad((x) => { x.items[5].term = x.items[4].term.toUpperCase(); }), { ok: false, reason: 'duplicate', index: 5 });
  assert.deepEqual(bad((x) => { x.items[0].id = 'w99'; }), { ok: false, reason: 'unknown-word', index: 0 });
  assert.deepEqual(bad((x) => { x.items[1].id = 'w01'; }), { ok: false, reason: 'unknown-word', index: 1 });
  assert.deepEqual(bad((x) => { x.items = x.items.slice(0, EDIT_LIMITS.minItems - 1); }), { ok: false, reason: 'too-few-words' });
  assert.deepEqual(applyEdits(sample, {}), { ok: false, reason: 'items' });
});

test('dropGaps leaves an untouched text alone; summarize gives the library card data', () => {
  assert.deepEqual(dropGaps(sample.cloze, new Set()), sample.cloze);
  const s = summarize('abc', { ...sample, createdAt: 5, source: { kind: 'pdf' } });
  assert.deepEqual([s.id, s.words, s.level, s.sourceKind, s.createdAt], ['abc', 20, 'B1', 'pdf', 5]);
});
