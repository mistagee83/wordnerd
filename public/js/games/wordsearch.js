// Word search renderer: drag across the letters (mouse or finger) from the first letter to the last.
// A found word gets a coloured capsule drawn over it; the live drag shows the line it would mark.
// A tap on the first letter and a tap on the last still works (the old way).
import { findWord, lineCells } from '/engines/games/wordsearch.js';
import { h, s, statusLine } from './ui.js';

const COLORS = ['#f8b856', '#72d90a', '#ff9a00', '#5fb3e8', '#e86f8a', '#b58cf0', '#f1ddba', '#4fd1b5'];

export function render(p, ctx = {}) {
  const n = p.size;
  const line = statusLine(`Find ${p.placements.length} words. Drag from the first letter to the last.`);
  const found = new Set();
  const misses = {};
  let wrongDrags = 0;

  const grid = h('div', { class: 'ws-grid', style: { '--n': n } },
    p.grid.flatMap((row, r) => row.map((ch, c) => h('span', { class: 'ws-cell', 'data-r': r, 'data-c': c }, ch))));
  const overlay = s('svg', { class: 'ws-overlay', viewBox: `0 0 ${n} ${n}`, 'aria-hidden': 'true' });
  const live = s('line', { class: 'ws-live', 'stroke-width': 0.78, 'stroke-linecap': 'round', visibility: 'hidden' });
  overlay.append(live);
  const board = h('div', { class: 'ws-board', style: { touchAction: 'none' } }, grid, overlay);
  const clueEls = Object.fromEntries(p.clues.map((cl) => [cl.itemId, h('li', {}, cl.text)]));
  const el = h('div', { class: 'g-wordsearch' }, line, h('div', { class: 'ws-layout' }, board, h('ol', { class: 'ws-clues' }, Object.values(clueEls))));

  const cellAt = (x, y) => {
    const t = document.elementFromPoint(x, y)?.closest('.ws-cell');
    return t && grid.contains(t) ? [Number(t.dataset.r), Number(t.dataset.c)] : null;
  };
  function drawLive(a, b) {
    const ok = b && lineCells(a[0], a[1], b[0], b[1]);
    if (!ok) { live.setAttribute('visibility', 'hidden'); return; }
    Object.entries({ x1: a[1] + 0.5, y1: a[0] + 0.5, x2: b[1] + 0.5, y2: b[0] + 0.5 }).forEach(([k, v]) => live.setAttribute(k, v));
    live.setAttribute('visibility', 'visible');
  }

  let start = null; // [r, c] where the press began
  let tapStart = null; // first tap of a tap-tap selection
  let moved = false;

  function finish(a, b) {
    const id = findWord(p, a[0], a[1], b[0], b[1]);
    if (!id) { if (a[0] !== b[0] || a[1] !== b[1]) wrongDrags += 1; return false; }
    if (found.has(id)) return true;
    found.add(id);
    const color = COLORS[(found.size - 1) % COLORS.length];
    overlay.insertBefore(s('line', {
      class: 'ws-found', x1: a[1] + 0.5, y1: a[0] + 0.5, x2: b[1] + 0.5, y2: b[0] + 0.5,
      stroke: color, 'stroke-width': 0.78, 'stroke-linecap': 'round',
    }), live);
    clueEls[id].classList.add('is-found');
    if (found.size === p.placements.length) {
      line.textContent = 'All words found.';
      ctx.onFinish?.({ score: found.size, max: p.placements.length, misses, wrongDrags });
    } else line.textContent = `${found.size} / ${p.placements.length} found`;
    return true;
  }

  board.addEventListener('pointerdown', (e) => {
    const cell = cellAt(e.clientX, e.clientY);
    if (!cell) return;
    e.preventDefault();
    board.setPointerCapture(e.pointerId);
    start = cell;
    moved = false;
    drawLive(cell, cell);
  });
  board.addEventListener('pointermove', (e) => {
    if (!start) return;
    const cell = cellAt(e.clientX, e.clientY);
    if (cell && (cell[0] !== start[0] || cell[1] !== start[1])) moved = true;
    drawLive(start, cell ?? start);
  });
  board.addEventListener('pointerup', (e) => {
    if (!start) return;
    const end = cellAt(e.clientX, e.clientY) ?? start;
    const a = start;
    start = null;
    live.setAttribute('visibility', 'hidden');
    if (moved) { tapStart = null; finish(a, end); return; }
    // a tap: first tap marks the start, the second tap the end
    if (!tapStart) { tapStart = a; drawLive(a, a); live.setAttribute('visibility', 'visible'); return; }
    const first = tapStart;
    tapStart = null;
    finish(first, a);
  });
  board.addEventListener('pointercancel', () => { start = null; live.setAttribute('visibility', 'hidden'); });

  return { el, destroy: () => {} };
}
