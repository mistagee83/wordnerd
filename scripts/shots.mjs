// Screenshots of the eight games for the landing page, taken with the local Chrome in headless mode
// (no dependency). Needs the dev server: `npm run serve`, then `node scripts/shots.mjs [game…]`.
// Output: public/img/landing/<game>.webp, a phone-sized view (390 px wide, 2x pixels), via a PNG that is
// converted in the same headless Chrome (public/dev/webp.html) and then removed.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'public', 'img', 'landing');
mkdirSync(out, { recursive: true });
const CHROME = [
  process.env.CHROME,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
].find((p) => p && existsSync(p));
if (!CHROME) throw new Error('No Chrome found: set CHROME to its path.');

const BASE = process.env.BASE || 'http://localhost:5174';
// height per game: enough for the board, not the empty page under it
const SHOTS = { memory: 560, matching: 620, wordsearch: 620, crossword: 600, hangman: 640, gapfill: 640, drowning: 600, bridge: 440 };
const games = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(SHOTS);
for (const game of games) {
  const file = join(out, `${game}.png`);
  execFileSync(CHROME, [
    '--headless=new', '--disable-gpu', '--hide-scrollbars', '--force-device-scale-factor=2',
    `--window-size=390,${SHOTS[game]}`, `--virtual-time-budget=${game === 'drowning' ? 18000 : 6000}`, `--screenshot=${file}`,
    `${BASE}/dev/shot.html?game=${game}&stage=1`,
  ], { stdio: 'ignore' });
  const dom = execFileSync(CHROME, [
    '--headless=new', '--disable-gpu', '--virtual-time-budget=4000', '--dump-dom',
    `${BASE}/dev/webp.html?src=/img/landing/${game}.png`,
  ], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  const data = dom.match(/data:image\/webp;base64,([A-Za-z0-9+/=]+)/)?.[1];
  if (!data) throw new Error(`${game}: no WebP from Chrome`);
  const webp = join(out, `${game}.webp`);
  writeFileSync(webp, Buffer.from(data, 'base64'));
  rmSync(file);
  console.log(`${game}: ${webp}`);
}
