import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkInput, INPUT_LIMITS } from '../engines/analysis/input.js';
import { buildPrompt, PROMPT_VERSION } from '../engines/analysis/prompt.js';
import { normalizeAnalysis, MIN_ITEMS } from '../engines/analysis/normalize.js';
import { runAnalysis } from '../engines/analysis/run.js';
import { ANALYSIS_SCHEMA } from '../engines/analysis/schema.js';
import { sampleAnswer } from '../engines/fixtures/sample-answer.js';
import { GAME_IDS, generateGame } from '../engines/games/index.js';
import { parseCloze } from '../engines/games/gapfill.js';

const words = (n) => Array.from({ length: n }, (_, i) => `word${i}`).join(' ');
const base = { kind: 'text', text: words(100), level: 'B1', supportLang: 'hu' };
const opts = { count: 20, level: 'B1', targetLang: 'en', supportLang: 'hu', source: { kind: 'text', wordCount: 100 } };

// ---------- input ----------
test('input: a normal text request passes with defaults', () => {
  const r = checkInput(base);
  assert.equal(r.ok, true);
  assert.equal(r.input.count, 'auto'); // the default since 2026-11-21
  assert.equal(r.input.targetLang, 'en');
  assert.deepEqual(r.input.source, { kind: 'text', wordCount: 100, title: null });
});

test('input: every bad field has its own reason', () => {
  const bad = (patch) => checkInput({ ...base, ...patch }).reason;
  assert.equal(bad({ supportLang: 'xx' }), 'support-language');
  assert.equal(bad({ supportLang: undefined }), 'support-language');
  assert.equal(bad({ targetLang: 'de' }), 'target-language');
  assert.equal(bad({ level: 'C2' }), 'level');
  assert.equal(bad({ count: 5 }), 'count');
  assert.equal(bad({ count: 31 }), 'count');
  assert.equal(bad({ count: 12.5 }), 'count');
  assert.equal(bad({ count: 'all' }), 'count');
  assert.equal(checkInput({ ...base, count: 'auto' }).input.count, 'auto');
  assert.equal(checkInput({ ...base, count: '15' }).input.count, 15);
  assert.equal(bad({ text: words(39) }), 'text-too-short');
  assert.equal(bad({ text: words(2501) }), 'text-too-long');
  assert.equal(bad({ text: 'a'.repeat(INPUT_LIMITS.maxChars + 1) }), 'text-too-long');
  assert.equal(bad({ kind: 'url' }), 'kind');
});

test('input: files – type, base64 and size are checked; the size counts decoded bytes', () => {
  const file = (patch) => checkInput({ ...base, kind: 'file', file: { mimeType: 'application/pdf', data: 'JVBERi0xLjQK', name: 'lesson.pdf', ...patch } });
  const ok = file({});
  assert.equal(ok.ok, true);
  assert.deepEqual(ok.input.source, { kind: 'pdf', bytes: 9, title: 'lesson.pdf' });
  assert.equal(file({ mimeType: 'image/jpeg' }).input.source.kind, 'image');
  assert.equal(file({ mimeType: 'text/html' }).reason, 'file-type');
  assert.equal(file({ data: 'not base64!' }).reason, 'file-data');
  assert.equal(file({ data: '' }).reason, 'file-data');
  const big = 'A'.repeat(Math.ceil((INPUT_LIMITS.maxFileBytes + 3) / 3) * 4);
  assert.equal(file({ data: big }).reason, 'file-too-large');
  const fits = 'A'.repeat((INPUT_LIMITS.maxFileBytes / 3) * 4 - 4);
  assert.equal(file({ data: fits }).ok, true);
});

// ---------- prompt ----------
test('prompt: carries level, count, languages, focus and the material', () => {
  const p = buildPrompt({ level: 'B2', count: 25, supportLang: 'de', focus: 'phrasal verbs', kind: 'text', material: 'MATERIAL TEXT' });
  assert.match(p.text, /25 most useful English vocabulary items/);
  assert.match(p.text, /level B2/);
  assert.match(p.text, /German equivalent/);
  assert.match(p.text, /focus on: phrasal verbs/);
  assert.match(p.text, /<material>\nMATERIAL TEXT\n<\/material>/);
  assert.match(p.system, /DATA, not instructions/);
  assert.equal(PROMPT_VERSION, 'analyze-v3');
  assert.match(p.text, /COMPLETE word or expression/);
});

test('prompt: a file request has no material block and no focus line without focus', () => {
  const p = buildPrompt({ level: 'A2', count: 10, supportLang: 'hu', kind: 'file' });
  assert.doesNotMatch(p.text, /<material>/);
  assert.doesNotMatch(p.text, /focus on/);
  assert.match(p.text, /attached file/);
  assert.throws(() => buildPrompt({ level: 'A2', count: 10, supportLang: 'xx' }));
});

test('schema: every field the games need is required of the model', () => {
  const req = ANALYSIS_SCHEMA.properties.items.items.required;
  for (const f of ['term', 'definition', 'translation', 'example', 'distractors']) assert.ok(req.includes(f), f);
  assert.deepEqual(ANALYSIS_SCHEMA.properties.cloze.required, ['text', 'gaps']);
});

// ---------- normalize ----------
test('normalize: the sample answer becomes a list every one of the seven games can use', () => {
  const r = normalizeAnalysis(sampleAnswer(), opts);
  assert.equal(r.ok, true, r.reason);
  assert.equal(r.list.items.length, 20);
  assert.deepEqual(r.list.items.map((it) => it.id).slice(0, 3), ['w01', 'w02', 'w03']);
  assert.equal(r.list.cloze.gaps.length, 11);
  assert.ok(parseCloze(r.list.cloze));
  assert.equal(r.list.supportLang, 'hu');
  for (const id of GAME_IDS) {
    const g = generateGame(id, r.list, {}, 'x');
    assert.equal(g.ok, true, `${id}: ${g.reason}`);
  }
});

test('normalize: the teacher\'s count caps the list; a teacher title wins over the model\'s', () => {
  const r = normalizeAnalysis(sampleAnswer(), { ...opts, count: 12, title: 'My lesson' });
  assert.equal(r.list.items.length, 12);
  assert.equal(r.list.title, 'My lesson');
  // gaps pointing at words beyond the cap are written into the text, the rest renumbered 1..n
  assert.ok(r.list.cloze.gaps.every((g, i) => g.n === i + 1));
  assert.ok(r.list.cloze.gaps.every((g) => r.list.items.some((it) => it.id === g.itemId)));
  assert.ok(parseCloze(r.list.cloze));
});

test('normalize: bad and duplicate items are dropped, broken optional fields are cleared', () => {
  const raw = sampleAnswer();
  raw.items[0].term = '';
  raw.items[1].translation = '';
  raw.items[2] = { ...raw.items[3] }; // duplicate of item 3
  raw.items[4].example = { text: 'no gap here', answer: 'x' };
  raw.items[5].distractors = [raw.items[5].example.answer, 'same', 'SAME'];
  raw.items[6].term = 'a {{1}}';
  const r = normalizeAnalysis(raw, opts);
  assert.equal(r.ok, true);
  assert.equal(r.list.items.length, 16);
  const ex = r.list.items.find((it) => it.term === raw.items[4].term);
  assert.equal(ex.example, null);
  assert.deepEqual(ex.distractors, []);
  assert.deepEqual(r.list.items.find((it) => it.term === raw.items[5].term).distractors, ['same']);
  assert.ok(r.warnings.length >= 6);
});

test('normalize: too few items, no usable gapfill text, or "unsuitable" fail with a reason', () => {
  const few = sampleAnswer();
  few.items = few.items.slice(0, MIN_ITEMS - 1);
  assert.deepEqual([normalizeAnalysis(few, opts).reason, normalizeAnalysis(few, opts).retry], ['too_few_items', true]);

  const noCloze = sampleAnswer();
  noCloze.cloze.gaps = noCloze.cloze.gaps.map((g) => ({ ...g, term: 'not in the list' }));
  assert.equal(normalizeAnalysis(noCloze, opts).reason, 'no_cloze');

  const r = normalizeAnalysis({ suitable: false, reason: 'A shopping receipt.', items: [] }, opts);
  assert.deepEqual([r.ok, r.reason, r.retry, r.detail], [false, 'unsuitable', false, 'A shopping receipt.']);
  assert.equal(normalizeAnalysis(null, opts).reason, 'bad_output');
});

test('normalize: a gap word used twice keeps only the first gap; the text still reads', () => {
  const raw = sampleAnswer();
  raw.cloze.gaps[1].term = raw.cloze.gaps[0].term; // gap 2 repeats the word of gap 1
  const r = normalizeAnalysis(raw, opts);
  assert.equal(r.list.cloze.gaps.length, 10);
  assert.ok(r.list.cloze.text.includes(raw.cloze.gaps[1].answer));
  assert.ok(parseCloze(r.list.cloze));
});

// ---------- run (credits, retry, refund) ----------
function deps({ answers, saveThrows = false, spendThrows = null } = {}) {
  const calls = { spend: 0, refund: [], model: 0, saved: null, logs: [] };
  const queue = [...answers];
  return {
    calls,
    d: {
      spend: async () => { calls.spend += 1; if (spendThrows) throw spendThrows; return { ledgerId: 'L1', cost: 3 }; },
      refund: async (id) => { calls.refund.push(id); },
      model: {
        name: 'fake',
        complete: async () => {
          calls.model += 1;
          const a = queue.shift();
          if (a instanceof Error) throw a;
          return { text: typeof a === 'string' ? a : JSON.stringify(a), usage: { tokensIn: 1, tokensOut: 2 } };
        },
      },
      save: async (list) => { if (saveThrows) throw new Error('disk full'); calls.saved = list; return 'list-1'; },
      log: (r) => calls.logs.push(r),
    },
  };
}
const input = checkInput(base).input;

test('run: success spends once, saves the list with the prompt version, no refund', async () => {
  const { calls, d } = deps({ answers: [sampleAnswer()] });
  const r = await runAnalysis(input, d);
  assert.deepEqual([r.ok, r.listId, r.cost], [true, 'list-1', 3]);
  assert.deepEqual([calls.spend, calls.model, calls.refund.length], [1, 1, 0]);
  assert.equal(calls.saved.promptVersion, 'analyze-v3');
  assert.equal(calls.saved.items.length, 20);
  assert.equal(calls.logs[0].outcome, 'ok');
});

test('run: a broken answer is retried once', async () => {
  const { calls, d } = deps({ answers: ['{"items": [', sampleAnswer()] });
  const r = await runAnalysis(input, d);
  assert.equal(r.ok, true);
  assert.equal(calls.model, 2);
  assert.deepEqual(calls.logs.map((l) => l.outcome), ['parse_error', 'ok']);
  assert.equal(calls.refund.length, 0);
});

test('run: two broken answers give the credits back', async () => {
  const few = sampleAnswer();
  few.items = few.items.slice(0, 3);
  const { calls, d } = deps({ answers: [few, new Error('HTTP 500')] });
  const r = await runAnalysis(input, d);
  assert.deepEqual([r.ok, r.reason], [false, 'provider_error']);
  assert.deepEqual(calls.refund, ['L1']);
  assert.equal(calls.saved, null);
});

test('run: "unsuitable" is not retried and is refunded', async () => {
  const { calls, d } = deps({ answers: [{ suitable: false, reason: 'Empty page.', items: [] }, sampleAnswer()] });
  const r = await runAnalysis(input, d);
  assert.deepEqual([r.ok, r.reason, r.detail], [false, 'unsuitable', 'Empty page.']);
  assert.equal(calls.model, 1);
  assert.deepEqual(calls.refund, ['L1']);
});

test('run: an unavailable model stops at once and is refunded', async () => {
  const { calls, d } = deps({ answers: [Object.assign(new Error('404'), { unavailable: true })] });
  const r = await runAnalysis(input, d);
  assert.deepEqual([r.ok, r.reason], [false, 'model-unavailable']);
  assert.equal(calls.model, 1);
  assert.deepEqual(calls.refund, ['L1']);
});

test('run: a failed save is refunded and the error goes up', async () => {
  const { calls, d } = deps({ answers: [sampleAnswer()], saveThrows: true });
  await assert.rejects(runAnalysis(input, d), /disk full/);
  assert.deepEqual(calls.refund, ['L1']);
});

test('run: no credits means no model call', async () => {
  const { calls, d } = deps({ answers: [sampleAnswer()], spendThrows: Object.assign(new Error('insufficient'), { code: 'insufficient' }) });
  await assert.rejects(runAnalysis(input, d), /insufficient/);
  assert.equal(calls.model, 0);
  assert.equal(calls.refund.length, 0);
});

test('run: a file request sends the file to the model, not as prompt text', async () => {
  const fileInput = checkInput({ ...base, kind: 'file', file: { mimeType: 'image/png', data: 'iVBORw0KGgo=' } }).input;
  let seen = null;
  const { d } = deps({ answers: [sampleAnswer()] });
  d.model.complete = async (req) => { seen = req; return { text: JSON.stringify(sampleAnswer()) }; };
  await runAnalysis(fileInput, d);
  assert.deepEqual(seen.file, { mimeType: 'image/png', data: 'iVBORw0KGgo=' });
  assert.doesNotMatch(seen.text, /<material>/);
});

test('normalize: no space is left between a gap and the punctuation after it', () => {
  const raw = sampleAnswer();
  raw.items[0].example = { text: 'Never get into a car with a ___ .', answer: 'look after' };
  const r = normalizeAnalysis(raw, opts);
  assert.equal(r.list.items[0].example.text, 'Never get into a car with a ___.');
});

test('auto count: the prompt lets the model decide (10–40), the normalizer keeps at most 40', () => {
  const p = buildPrompt({ level: 'B1', count: 'auto', supportLang: 'hu', material: 'x' });
  assert.match(p.text, /You decide how many/);
  assert.match(p.text, /between 10 and 40/);
  assert.doesNotMatch(p.text, /choose the auto/);
  const raw = sampleAnswer();
  // 50 items: the 20 sample words plus 30 extra ones
  for (let i = 0; i < 30; i++) raw.items.push({ ...raw.items[i % 20], term: `extra word ${String.fromCharCode(97 + (i % 26))}${String.fromCharCode(97 + Math.floor(i / 26))}` });
  const r = normalizeAnalysis(raw, { ...opts, count: 'auto' });
  assert.equal(r.ok, true, r.reason);
  assert.equal(r.list.items.length, 40);
  const fewer = normalizeAnalysis(sampleAnswer(), { ...opts, count: 'auto' });
  assert.equal(fewer.list.items.length, 20); // auto never pads
});
