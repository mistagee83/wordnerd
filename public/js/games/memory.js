// Memory renderer: a square board of wooden cards that flip in 3D.
import { isPair } from '/engines/games/memory.js';
import { addMiss, fitText, h, statusLine } from './ui.js';

const LOGO = '/img/brand/WordNerd_logo_bump.png';

export function render(p, ctx = {}) {
  const line = statusLine(`Find the ${p.pairs} pairs.`);
  const misses = {};
  const done = new Set();
  let open = [];
  let moves = 0;
  let busy = false;
  let timer = null;

  const board = h('div', { class: 'mem-board', style: { '--n': p.grid } });
  for (const card of p.cards) {
    if (card.logo) {
      board.append(h('div', { class: 'mem-card mem-logo', 'aria-hidden': 'true' }, h('img', { src: LOGO, alt: '' })));
      continue;
    }
    const face = h('div', { class: `mem-face mem-${card.face}` }, h('span', { class: 'mem-text' }, card.text));
    const btn = h('button', { type: 'button', class: 'mem-card', 'aria-label': 'Hidden card' },
      h('div', { class: 'mem-inner' }, h('div', { class: 'mem-back' }, h('img', { src: LOGO, alt: '' })), face));
    btn.addEventListener('click', () => turn(card, btn));
    board.append(btn);
  }

  function turn(card, btn) {
    if (busy || done.has(card.itemId) || open.some((o) => o.btn === btn)) return;
    btn.classList.add('is-up');
    btn.setAttribute('aria-label', card.text);
    open.push({ card, btn });
    if (open.length < 2) return;
    moves += 1;
    const [a, b] = open;
    if (isPair(a.card, b.card)) {
      done.add(a.card.itemId);
      open = [];
      setTimeout(() => { a.btn.classList.add('is-matched'); b.btn.classList.add('is-matched'); }, 350);
      if (done.size === p.pairs) {
        line.textContent = `All pairs found in ${moves} moves.`;
        ctx.onFinish?.({ score: p.pairs, max: p.pairs, misses, moves });
      } else line.textContent = `${done.size} / ${p.pairs} pairs · ${moves} moves`;
    } else {
      addMiss(misses, a.card.itemId);
      addMiss(misses, b.card.itemId);
      busy = true;
      timer = setTimeout(() => {
        for (const o of [a, b]) { o.btn.classList.remove('is-up'); o.btn.setAttribute('aria-label', 'Hidden card'); }
        open = [];
        busy = false;
      }, p.settings.flipMs + 500); // + the flip animation itself
    }
  }

  const el = h('div', { class: 'g-memory' }, line, board);
  requestAnimationFrame(() => fitText(board.querySelectorAll('.mem-text')));
  return { el, destroy: () => clearTimeout(timer) };
}
