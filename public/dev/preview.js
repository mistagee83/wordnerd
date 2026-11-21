// Developer preview of the game engines (F1): pick a game, change the teacher settings and the seed,
// and play it with the sample list. Plain DOM, no framework. The real student UI comes in F4.
import list from '/engines/fixtures/sample-family-b1.js';
import { GAMES, GAME_IDS, generateGame } from '/engines/games/index.js';
import { isPair } from '/engines/games/memory.js';
import { cellsOf, findWord } from '/engines/games/wordsearch.js';
import { rowCorrect } from '/engines/games/crossword.js';
import { display, guess, newRound, status } from '/engines/games/hangman.js';
import { isCorrect as gapCorrect } from '/engines/games/gapfill.js';
import { isCorrect as drownCorrect, waterLevel } from '/engines/games/drowning.js';
import { gridLetters } from '/engines/lang.js';

const LANG = list.targetLang;
const CHOICES = {
  clueMode: { memory: ['translation', 'definition'], matching: ['translation', 'definition'], wordsearch: ['term', 'translation', 'definition'], crossword: ['definition', 'translation'], hangman: ['translation', 'definition', 'none'], drowning: ['translation', 'definition'] },
  directions: ['easy', 'medium', 'hard'],
  mode: ['options', 'typing'],
  speed: ['slow', 'normal', 'fast'],
};

const $ = (sel) => document.querySelector(sel);
function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'class') el.className = v;
    else if (v !== false && v != null) el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat()) if (c != null) el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  return el;
}

let current = 'memory';
const settings = Object.fromEntries(GAME_IDS.map((id) => [id, { ...GAMES[id].defaults }]));
let cleanup = () => {};

$('#list-title').textContent = `${list.title} (${list.level}, ${list.targetLang} → ${list.supportLang}, ${list.items.length} words)`;

function renderTabs() {
  $('#tabs').replaceChildren(...GAME_IDS.map((id) => h('button', {
    type: 'button', class: 'btn', 'aria-pressed': String(id === current),
    onclick: () => { current = id; renderTabs(); renderSettings(); run(); },
  }, GAMES[id].meta.title)));
}

function renderSettings() {
  const g = GAMES[current];
  const s = settings[current];
  const fields = Object.keys(g.defaults).map((key) => {
    const options = key === 'clueMode' ? CHOICES.clueMode[current] : CHOICES[key];
    const onchange = (e) => { s[key] = e.target.type === 'number' ? Number(e.target.value) : e.target.value; run(); };
    if (options) {
      return h('label', {}, key, h('select', { onchange }, options.map((o) => h('option', { value: o, selected: o === s[key] }, o))));
    }
    const lim = g.limits[key] ?? {};
    return h('label', {}, key === 'size' ? 'size (0 = auto)' : key,
      h('input', { type: 'number', value: s[key], min: key === 'size' ? 0 : lim.min, max: lim.max, onchange }));
  });
  $('#settings').replaceChildren(...fields);
}

$('#seed').addEventListener('change', run);
$('#new-seed').addEventListener('click', () => { $('#seed').value = `demo:${Math.floor(Math.random() * 1e6)}`; run(); });

function run() {
  cleanup();
  cleanup = () => {};
  const puzzle = generateGame(current, list, settings[current], $('#seed').value);
  $('#json').textContent = JSON.stringify(puzzle, null, 2);
  const root = $('#game');
  if (!puzzle.ok) { root.replaceChildren(h('p', { class: 'error' }, `Cannot build this game: ${puzzle.reason}`)); return; }
  root.replaceChildren(RENDER[current](puzzle));
}

const statusLine = (text = '') => h('p', { class: 'status' }, text);

const RENDER = {
  memory(p) {
    const line = statusLine(`Find ${p.settings.pairs} pairs.`);
    const done = new Set();
    let open = [];
    let moves = 0;
    let busy = false;
    const buttons = p.cards.map((c) => h('button', {
      type: 'button', class: 'card', 'aria-label': 'card',
      onclick: (e) => {
        const btn = e.currentTarget;
        if (busy || done.has(c.itemId) || open.some((o) => o.c === c)) return;
        btn.classList.add('up');
        open.push({ c, btn });
        if (open.length < 2) return;
        moves += 1;
        const [a, b] = open;
        if (isPair(a.c, b.c)) {
          done.add(a.c.itemId);
          a.btn.classList.add('done'); b.btn.classList.add('done');
          open = [];
          line.textContent = done.size === p.settings.pairs ? `All pairs found in ${moves} moves.` : `${done.size} / ${p.settings.pairs} pairs`;
        } else {
          busy = true;
          const t = setTimeout(() => { a.btn.classList.remove('up'); b.btn.classList.remove('up'); open = []; busy = false; }, p.settings.flipMs);
          cleanup = () => clearTimeout(t);
        }
      },
    }, c.text));
    return h('div', {}, line, h('div', { class: 'mem' }, buttons));
  },

  matching(p) {
    const line = statusLine('Click a word, then its pair.');
    let sel = null;
    let found = 0;
    let mistakes = 0;
    const left = p.left.map((l) => h('button', {
      type: 'button', class: 'pill',
      onclick: (e) => { if (e.currentTarget.classList.contains('done')) return; sel?.btn.classList.remove('sel'); sel = { l, btn: e.currentTarget }; sel.btn.classList.add('sel'); },
    }, l.text));
    const right = p.right.map((r) => h('button', {
      type: 'button', class: 'pill',
      onclick: (e) => {
        const btn = e.currentTarget;
        if (!sel || btn.classList.contains('done')) return;
        if (sel.l.itemId === r.itemId) {
          btn.classList.add('done'); sel.btn.classList.add('done'); sel.btn.classList.remove('sel'); sel = null; found += 1;
        } else {
          mistakes += 1; btn.classList.add('wrong'); setTimeout(() => btn.classList.remove('wrong'), 500);
        }
        line.textContent = found === p.left.length ? `Done with ${mistakes} mistakes.` : `${found} / ${p.left.length} matched, ${mistakes} mistakes`;
      },
    }, r.text));
    return h('div', {}, line, h('div', { class: 'match' }, h('div', { class: 'col' }, left), h('div', { class: 'col' }, right)));
  },

  wordsearch(p) {
    const line = statusLine('Click the first letter of a word, then the last.');
    let start = null;
    const found = new Set();
    const cells = p.grid.map((row, r) => row.map((ch, c) => h('button', {
      type: 'button', class: 'cell', 'aria-label': `row ${r + 1} column ${c + 1}: ${ch}`,
      onclick: (e) => {
        if (!start) { start = { r, c, btn: e.currentTarget }; start.btn.classList.add('start'); return; }
        start.btn.classList.remove('start');
        const id = findWord(p, start.r, start.c, r, c);
        start = null;
        if (!id || found.has(id)) return;
        found.add(id);
        cellsOf(p.placements.find((pl) => pl.itemId === id)).forEach(([rr, cc]) => cells[rr][cc].classList.add('found'));
        clueEls[id].classList.add('found');
        line.textContent = found.size === p.placements.length ? 'All words found.' : `${found.size} / ${p.placements.length} found`;
      },
    }, ch)));
    const clueEls = Object.fromEntries(p.clues.map((cl) => [cl.itemId, h('li', {}, cl.text)]));
    const grid = h('div', { class: 'grid', style: `grid-template-columns: repeat(${p.size}, auto); --n: ${p.size}` }, cells.flat());
    return h('div', {}, line, h('div', { class: 'ws' }, grid, h('ol', { class: 'clues' }, Object.values(clueEls))),
      p.skipped.length ? h('p', { class: 'muted' }, `Skipped (did not fit): ${p.skipped.join(', ')}`) : null);
  },

  crossword(p) {
    const line = statusLine(`Fill in the rows. The yellow column hides a ${p.hidden.letters.length}-letter word. Reveals left: ${p.settings.reveals}`);
    let reveals = p.settings.reveals;
    let solved = 0;
    const rows = p.rows.map((row) => {
      const inputs = row.letters.map((_, i) => h('input', {
        class: `cw-cell${row.offset + i === p.hiddenCol ? ' hidden-col' : ''}`, maxlength: 2, 'aria-label': `${row.number}, letter ${i + 1}`,
        oninput: () => check(),
        ondblclick: (e) => { // double-click a cell to use a reveal
          if (reveals <= 0 || e.target.value) return;
          reveals -= 1; e.target.value = row.letters[i]; check();
          line.textContent = line.textContent.replace(/Reveals left: \d+/, `Reveals left: ${reveals}`);
        },
      }));
      const el = h('div', { class: 'cw-row' }, h('span', { class: 'cw-num' }, row.number),
        Array.from({ length: row.offset }, () => h('span', { class: 'cw-gap' })), inputs);
      function check() {
        const typed = inputs.map((inp) => gridLetters(inp.value, LANG)[0] ?? '');
        const ok = rowCorrect(row, typed);
        if (ok !== el.classList.contains('solved')) { el.classList.toggle('solved', ok); solved += ok ? 1 : -1; }
        if (solved === p.rows.length) line.textContent = `Solved. The hidden word: ${p.hidden.letters.join('')}`;
      }
      return el;
    });
    const clues = h('ol', { class: 'cw-clues' }, p.rows.map((r) => h('li', {}, r.clue)));
    return h('div', {}, line, h('p', { class: 'muted' }, 'Tip: double-click an empty cell to reveal its letter.'),
      h('div', { class: 'cw' }, h('div', { class: 'cw-grid' }, rows), clues));
  },

  hangman(p) {
    let index = 0;
    let won = 0;
    const box = h('div');
    const drawRound = () => {
      if (index >= p.rounds.length) { box.replaceChildren(statusLine(`Finished: ${won} / ${p.rounds.length} words guessed.`)); return; }
      const round = p.rounds[index];
      let st = newRound();
      const word = h('div', { class: 'hm-word' });
      const info = statusLine();
      const next = h('button', { type: 'button', class: 'btn', hidden: true, onclick: () => { index += 1; drawRound(); } }, 'Next word');
      const keys = round.keyboard.map((k) => h('button', {
        type: 'button', class: 'btn',
        onclick: (e) => { e.currentTarget.disabled = true; st = guess(round, st, k, p.maxMisses); update(); },
      }, k));
      function update() {
        word.textContent = display(round, st).join('');
        const s = status(round, st, p.maxMisses);
        info.textContent = s === 'playing' ? `Word ${index + 1} / ${p.rounds.length} · misses ${st.misses} / ${p.maxMisses}` : s === 'won' ? 'Correct.' : `Lost. The word was: ${round.slots.map((x) => x.letter ?? x.char).join('')}`;
        if (s !== 'playing') { keys.forEach((b) => { b.disabled = true; }); next.hidden = false; if (s === 'won') won += 1; }
      }
      update();
      box.replaceChildren(info, round.clue ? h('p', {}, `Clue: ${round.clue}`) : null, word, h('div', { class: 'keys' }, keys), h('p', {}, next));
    };
    drawRound();
    return box;
  },

  gapfill(p) {
    const line = statusLine(`${p.questions.length} sentences.`);
    let right = 0;
    let answered = 0;
    const mark = (q, ok, el) => {
      answered += 1; if (ok) right += 1;
      el.append(h('span', { class: ok ? 'ok' : 'bad' }, ok ? '  ✓' : `  ✗ ${q.answer}`));
      line.textContent = `${right} / ${answered} correct${answered === p.questions.length ? ' – finished.' : ''}`;
    };
    const qs = p.questions.map((q, i) => {
      const result = h('span');
      const sentence = h('p', {}, `${i + 1}. ${q.before}`, h('strong', {}, '_____'), q.after, result);
      if (q.options) {
        const btns = q.options.map((o) => h('button', {
          type: 'button', class: 'pill',
          onclick: () => { btns.forEach((b) => { b.disabled = true; }); mark(q, gapCorrect(q, o, LANG), result); },
        }, o));
        return h('div', { class: 'gf-q' }, sentence, h('div', { class: 'gf-opts' }, btns));
      }
      const input = h('input', { type: 'text', autocomplete: 'off', spellcheck: 'false' });
      const form = h('form', { onsubmit: (e) => { e.preventDefault(); if (input.disabled) return; input.disabled = true; mark(q, gapCorrect(q, input.value, LANG), result); } },
        input, ' ', h('button', { class: 'btn' }, 'Check'));
      return h('div', { class: 'gf-q' }, sentence, form);
    });
    return h('div', {}, line, h('div', { class: 'gf' }, qs));
  },

  drowning(p) {
    const water = h('div', { class: 'water', style: 'height:0%' });
    const prompt = h('div', { class: 'dr-prompt' });
    const line = statusLine('Type the English word before the water reaches the top.');
    const input = h('input', { type: 'text', autocomplete: 'off', spellcheck: 'false', 'aria-label': 'your answer' });
    const startBtn = h('button', { type: 'button', class: 'btn', onclick: start }, 'Start');
    let i = 0;
    let correct = 0;
    let t0 = 0;
    let timer = null;
    function start() {
      startBtn.hidden = true; input.disabled = false; input.focus();
      i = 0; correct = 0; t0 = performance.now(); prompt.textContent = p.queue[0].prompt;
      timer = setInterval(tick, 100);
      cleanup = () => clearInterval(timer);
    }
    function tick() {
      const level = waterLevel(p, (performance.now() - t0) / 1000, correct);
      water.style.height = `${Math.round(level * 100)}%`;
      if (level >= 1) end(`The water reached the top. ${correct} words.`);
    }
    function end(text) {
      clearInterval(timer); input.disabled = true; line.textContent = text; startBtn.hidden = false; startBtn.textContent = 'Play again';
    }
    const form = h('form', {
      onsubmit: (e) => {
        e.preventDefault();
        if (input.disabled) return;
        const entry = p.queue[i];
        if (drownCorrect(entry, input.value, LANG)) {
          correct += 1; i += 1; input.value = '';
          if (i >= p.queue.length) { end(`You survived: all ${correct} words.`); return; }
          prompt.textContent = p.queue[i].prompt;
          line.textContent = `${correct} / ${p.queue.length}`;
        } else {
          input.select();
        }
      },
    }, input, ' ', h('button', { class: 'btn' }, 'Enter'));
    input.disabled = true;
    return h('div', { class: 'dr' }, h('div', { class: 'tank' }, water), h('div', {}, line, prompt, form, h('p', {}, startBtn)));
  },
};

renderTabs();
renderSettings();
run();
