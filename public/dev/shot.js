// One game with the sample list, nothing else: the source of the landing page's screenshots (scripts/shots.mjs).
import list from '/engines/fixtures/sample-family-b1.js';
import { GAMES, GAME_IDS, generateGame } from '/engines/games/index.js';
import * as memory from '/js/games/memory.js';
import * as matching from '/js/games/matching.js';
import * as wordsearch from '/js/games/wordsearch.js';
import * as crossword from '/js/games/crossword.js';
import * as hangman from '/js/games/hangman.js';
import * as gapfill from '/js/games/gapfill.js';
import * as drowning from '/js/games/drowning.js';
import * as bridge from '/js/games/bridge.js';

const UI = { memory, matching, wordsearch, crossword, hangman, gapfill, drowning, bridge };
const params = new URLSearchParams(location.search);
const id = GAME_IDS.includes(params.get('game')) ? params.get('game') : 'memory';
// English definitions as clues, not the sample list's Hungarian translations: the landing page is international
// (András, 2026-11-22). Games whose clue is the word itself (word search) keep their default.
const settings = { ...GAMES[id].defaults };
if (settings.clueMode === 'translation') settings.clueMode = 'definition';
const puzzle = generateGame(id, list, settings, params.get('seed') || 'landing:1');
const mounted = UI[id].render(puzzle, { lang: list.targetLang, onFinish: () => {} });
document.getElementById('game').replaceChildren(mounted.el);
document.title = `${GAMES[id].meta.title} – shot`;

// ?stage=1: play a little, so the picture shows a game in progress (clicks and events, as a student would)
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const root = mounted.el;
const STAGE = {
  async memory() {
    const btns = [...root.querySelectorAll('button.mem-card')];
    const cards = puzzle.cards.filter((c) => !c.logo);
    const pairOf = (itemId) => cards.map((c, i) => (c.itemId === itemId ? btns[i] : null)).filter(Boolean);
    for (const itemId of [...new Set(cards.map((c) => c.itemId))].slice(0, 2)) {
      for (const b of pairOf(itemId)) b.click();
      await wait(450);
    }
    btns[cards.findIndex((c) => c.itemId === cards.at(-1).itemId)].click();
  },
  async wordsearch() {
    const cell = (r, c) => root.querySelector(`.ws-cell[data-r="${r}"][data-c="${c}"]`);
    const tap = (el) => {
      const b = el.getBoundingClientRect();
      const o = { clientX: b.left + b.width / 2, clientY: b.top + b.height / 2, pointerId: 1, bubbles: true };
      el.dispatchEvent(new PointerEvent('pointerdown', o));
      el.dispatchEvent(new PointerEvent('pointerup', o));
    };
    for (const pl of puzzle.placements.slice(0, 3)) {
      tap(cell(pl.row, pl.col));
      tap(cell(pl.row + pl.dr * (pl.length - 1), pl.col + pl.dc * (pl.length - 1)));
    }
  },
  async crossword() {
    const rows = [...root.querySelectorAll('.cw-row')];
    for (const el of rows.slice(0, 3)) {
      el.querySelectorAll('input').forEach((inp, i) => { inp.value = el._row.letters[i]; inp.dispatchEvent(new Event('input', { bubbles: true })); });
    }
  },
  async drowning() {
    [...root.querySelectorAll('button')].find((b) => b.textContent === 'Start')?.click();
    root.querySelector('.dr-level').style.transition = 'none'; // headless virtual time does not run CSS transitions
    await wait(14000); // about a third of the box under water (it fills in 40 s)
    const input = root.querySelector('.dr-input');
    const answer = puzzle.queue[0].answer;
    if (input) input.value = answer.slice(0, Math.ceil(answer.length / 2));
  },
  async hangman() {
    const word = puzzle.rounds[0].slots.filter((s) => s.letter).map((s) => s.letter);
    const press = (k) => [...root.querySelectorAll('.hm-key')].find((b) => b.textContent === k && !b.disabled)?.click();
    for (const k of [word[1], 'U', word[3], 'Z', word[0]]) { press(k); await wait(120); }
  },
};
if (params.get('stage')) await STAGE[id]?.();
document.body.dataset.ready = '1';
