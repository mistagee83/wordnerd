// Copies the Hub's shared pure modules into this repo (Hub docs/payments.md "Appok bekötése"):
// credits.js and entitlements.js into engines/hub/ (server side, via sync-engines), sso.js into
// public/js/hub/ (one Hub account, one click from the Hub). The source is D:\dev\Edtechhub\shared;
// change them only there, then run `npm run sync:hub`. With --check it only reports (exit 1 if stale).
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const HUB = process.env.HUB_DIR ?? 'D:/dev/Edtechhub';
const FILES = [['entitlements.js', 'engines/hub'], ['credits.js', 'engines/hub'], ['sso.js', 'public/js/hub']];
const check = process.argv.includes('--check');
const header = (f) => `// COPY of ${HUB}/shared/${f} (Mr. Andrew's EdTech Hub). Do not edit here: change the Hub's file,\n// then run \`npm run sync:hub\` in this repo.\n`;

if (!existsSync(join(HUB, 'shared'))) { console.error(`Hub repo not found at ${HUB} (set HUB_DIR)`); process.exit(2); }
let stale = 0;
for (const [f, dir] of FILES) {
  const want = header(f) + readFileSync(join(HUB, 'shared', f), 'utf8');
  const path = join(dir, f);
  const have = existsSync(path) ? readFileSync(path, 'utf8') : '';
  const lf = (x) => x.replace(/\r\n/g, '\n'); // line endings may differ (git autocrlf)
  if (lf(have) === lf(want)) continue;
  stale += 1;
  if (check) console.error(`stale: ${path}`);
  else { mkdirSync(dir, { recursive: true }); writeFileSync(path, want); console.log(`updated: ${path}`); }
}
if (check && stale) process.exit(1);
if (!stale) console.log('engines/hub/ and public/js/hub/ are up to date');
