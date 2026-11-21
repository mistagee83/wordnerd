// Developer preview of the games: pick a game, change the teacher settings and the seed, play it with the
// sample list. The game UIs live in /js/games/ and are the ones the F4 student pages will use.
import list from '/engines/fixtures/sample-family-b1.js';
import { GAMES, GAME_IDS, generateGame } from '/engines/games/index.js';
import { h } from '/js/games/ui.js';
import { settingsForm } from '/js/games/settings.js';
import * as memory from '/js/games/memory.js';
import * as matching from '/js/games/matching.js';
import * as wordsearch from '/js/games/wordsearch.js';
import * as crossword from '/js/games/crossword.js';
import * as hangman from '/js/games/hangman.js';
import * as gapfill from '/js/games/gapfill.js';
import * as drowning from '/js/games/drowning.js';

const UI = { memory, matching, wordsearch, crossword, hangman, gapfill, drowning };
const $ = (sel) => document.querySelector(sel);
const params = new URLSearchParams(location.search);
let current = GAME_IDS.includes(params.get('game')) ? params.get('game') : 'memory';
const settings = Object.fromEntries(GAME_IDS.map((id) => [id, { ...GAMES[id].defaults }]));
let mounted = null;

$('#list-title').textContent = `${list.title} (${list.level}, ${list.targetLang} → ${list.supportLang}, ${list.items.length} words)`;

function renderTabs() {
  $('#tabs').replaceChildren(...GAME_IDS.map((id) => h('button', {
    type: 'button', class: 'btn', 'aria-pressed': String(id === current),
    onclick: () => { current = id; history.replaceState(null, '', `?game=${id}`); renderTabs(); renderSettings(); run(); },
  }, GAMES[id].meta.title)));
}

function renderSettings() {
  $('#settings').replaceChildren(settingsForm(current, settings[current], (st) => { settings[current] = st; run(); }));
}

$('#seed').addEventListener('change', run);
$('#new-seed').addEventListener('click', () => { $('#seed').value = `demo:${Math.floor(Math.random() * 1e6)}`; run(); });
$('#restart').addEventListener('click', run);

function run() {
  mounted?.destroy();
  mounted = null;
  const puzzle = generateGame(current, list, settings[current], $('#seed').value);
  $('#json').textContent = JSON.stringify(puzzle, null, 2);
  $('#result').textContent = '';
  if (!puzzle.ok) { $('#game').replaceChildren(h('p', { class: 'error' }, `Cannot build this game: ${puzzle.reason}`)); return; }
  mounted = UI[current].render(puzzle, {
    lang: list.targetLang,
    onFinish: (r) => { $('#result').textContent = `Result sent to the session: ${JSON.stringify(r)}`; },
  });
  $('#game').replaceChildren(mounted.el);
}

renderTabs();
renderSettings();
run();
