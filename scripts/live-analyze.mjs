// Live check of the analysis with the REAL model, without Firebase: no credits, nothing stored in
// Firestore (spend/refund/save are local stand-ins). Costs a real Gemini call (a few cents).
// Key: WN_GEMINI_API_KEY (or HB_GEMINI_API_KEY) from the environment or functions/.secret.local
// (gitignored). The key is never printed.
// Usage: node scripts/live-analyze.mjs [text file] [--level B1] [--lang hu] [--count 20] [--out <dir>]
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, resolve, dirname, basename, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkInput } from '../engines/analysis/input.js';
import { ANALYSIS_SCHEMA } from '../engines/analysis/schema.js';
import { runAnalysis } from '../engines/analysis/run.js';
import { GAME_IDS, generateGame } from '../engines/games/index.js';
import { geminiModel } from '../functions/llm/gemini.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const flag = (name, def) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : def; };
const file = args.find((a, i) => !a.startsWith('--') && !args[i - 1]?.startsWith('--')) ?? join(root, 'scripts/samples/moving-city-b1.txt');
const outDir = flag('out', join(root, 'tmp-live'));

function readKey() {
  for (const name of ['WN_GEMINI_API_KEY', 'HB_GEMINI_API_KEY']) if (process.env[name]) return process.env[name].trim();
  const p = join(root, 'functions/.secret.local');
  if (!existsSync(p)) return null;
  for (const line of readFileSync(p, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*(WN_GEMINI_API_KEY|HB_GEMINI_API_KEY)\s*=\s*(.+?)\s*$/);
    if (m) return m[2].replace(/^["']|["']$/g, '');
  }
  return null;
}

const apiKey = readKey();
if (!apiKey) { console.error('No key: set WN_GEMINI_API_KEY or put it in functions/.secret.local'); process.exit(2); }

const ext = extname(file).toLowerCase();
const MIME = { '.pdf': 'application/pdf', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp' };
const base = { level: flag('level', 'B1'), supportLang: flag('lang', 'hu'), count: Number(flag('count', 20)) };
const data = MIME[ext]
  ? { ...base, kind: 'file', file: { mimeType: MIME[ext], data: readFileSync(file).toString('base64'), name: basename(file) } }
  : { ...base, kind: 'text', text: readFileSync(file, 'utf8') };
const checked = checkInput(data);
if (!checked.ok) { console.error('input refused:', checked.reason); process.exit(2); }

const model = geminiModel({ apiKey, model: 'gemini-3.8-flash', schema: ANALYSIS_SCHEMA });
const logs = [];
let saved = null;
const t0 = Date.now();
const result = await runAnalysis(checked.input, {
  spend: async () => ({ ledgerId: 'local', cost: 0 }),
  refund: async () => {},
  model,
  save: async (list) => { saved = list; return 'local'; },
  log: (r) => logs.push(r),
});
const ms = Date.now() - t0;

mkdirSync(outDir, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const out = join(outDir, `${basename(file, ext)}-${stamp}.json`);
writeFileSync(out, JSON.stringify({ result, logs, list: saved, ms }, null, 2));

console.log(`\nmodel gemini-3.8-flash · ${ms} ms · ${logs.length} attempt(s)`);
for (const l of logs) console.log(`  attempt ${l.attempt}: ${l.outcome} · ${l.ms} ms · tokens in ${l.usage?.tokensIn} out ${l.usage?.tokensOut} thinking ${l.usage?.tokensThinking}${l.error ? ` · ${l.error}` : ''}`);
if (!result.ok) { console.log(`\nFAILED: ${result.reason}${result.detail ? ` (${result.detail})` : ''}`); process.exit(1); }
console.log(`\n"${saved.title}" · topic ${saved.topic} · ${saved.items.length} items · ${saved.cloze.gaps.length} gaps · ${result.warnings.length} warnings`);
for (const w of result.warnings) console.log(`  ! ${w}`);
console.log('\nitems:');
for (const it of saved.items) {
  console.log(`  ${it.id} ${it.term} (${it.pos}, ${it.level}) = ${it.translation}`);
  console.log(`      def: ${it.definition}`);
  console.log(`      ex:  ${it.example ? `${it.example.text}  → ${it.example.answer}  | ${it.distractors.join(' / ')}` : '(none)'}`);
}
console.log(`\ncloze:\n${saved.cloze.text}`);
console.log(`gaps: ${saved.cloze.gaps.map((g) => `${g.n}=${g.answer}`).join(', ')}`);
console.log('\ngames from this list:');
for (const id of GAME_IDS) { const g = generateGame(id, saved, {}, 'live:0'); console.log(`  ${id}: ${g.ok ? 'ok' : `FAIL – ${g.reason}`}`); }
console.log(`\nfull output: ${out}`);
