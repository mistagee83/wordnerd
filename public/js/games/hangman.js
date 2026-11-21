// Hangman renderer – the balloon version (decided 2026-11-21): a basket of books hangs from as many
// balloons as the game has lives. The lives (balloons) are shared by all the words of the game: every wrong
// letter pops one and the basket sinks; with the last balloon gone it falls and the game is over. When the
// last word is solved the basket flies up and away.
import { display, guess, newRound, status } from '/engines/games/hangman.js';
import { addMiss, flash, h, s, statusLine } from './ui.js';

const COLORS = ['#f8b856', '#e5483b', '#72d90a', '#5fb3e8', '#ff9a00', '#e86f8a', '#b58cf0', '#4fd1b5'];
const W = 300;
const H = 360;
const BASKET_Y = 230; // top of the basket at full lift
const GROUND_Y = 340;

function balloonLayout(count) {
  // two rows: the back row higher and smaller, so a dozen balloons still look like a bunch
  const front = Math.ceil(count / 2);
  const back = count - front;
  const row = (k, y, r, x0, x1) => Array.from({ length: k }, (_, i) => ({ x: k === 1 ? W / 2 : x0 + ((x1 - x0) * i) / (k - 1), y, r }));
  return [...row(back, 62, 21, 78, 222), ...row(front, 104, 24, 58, 242)];
}

function scene(maxMisses) {
  const bunch = s('g', { class: 'hm-bunch' });
  const balloons = balloonLayout(maxMisses).map((b, i) => {
    const color = COLORS[i % COLORS.length];
    const g = s('g', { class: 'hm-balloon', style: `--d:${(i % 5) * 0.37}s` },
      s('path', { class: 'hm-string', d: `M${b.x} ${b.y + b.r * 1.2} Q ${(b.x + W / 2) / 2} ${(b.y + BASKET_Y) / 2 + 20} ${W / 2} ${BASKET_Y}`, fill: 'none' }),
      s('ellipse', { cx: b.x, cy: b.y, rx: b.r, ry: b.r * 1.2, fill: color }),
      s('ellipse', { cx: b.x - b.r * 0.35, cy: b.y - b.r * 0.45, rx: b.r * 0.22, ry: b.r * 0.34, fill: '#fff', opacity: 0.45 }),
      s('path', { d: `M${b.x - 4} ${b.y + b.r * 1.2 + 5} L${b.x} ${b.y + b.r * 1.2 - 1} L${b.x + 4} ${b.y + b.r * 1.2 + 5} Z`, fill: color }));
    g.style.transformOrigin = `${b.x}px ${b.y}px`;
    bunch.append(g);
    return g;
  });
  const basket = s('g', { class: 'hm-basket' },
    // books peeking out of the basket
    s('rect', { x: 128, y: BASKET_Y - 4, width: 12, height: 22, fill: '#5fb3e8', rx: 1.5 }),
    s('rect', { x: 141, y: BASKET_Y - 9, width: 13, height: 27, fill: '#e5483b', rx: 1.5 }),
    s('rect', { x: 155, y: BASKET_Y - 2, width: 11, height: 20, fill: '#72d90a', rx: 1.5 }),
    s('path', { d: `M118 ${BASKET_Y + 10} L182 ${BASKET_Y + 10} L174 ${BASKET_Y + 48} L126 ${BASKET_Y + 48} Z`, fill: '#a3602e', stroke: '#6e4a12', 'stroke-width': 2.5 }),
    s('path', { d: `M121 ${BASKET_Y + 22} L179 ${BASKET_Y + 22} M124 ${BASKET_Y + 35} L176 ${BASKET_Y + 35}`, stroke: '#6e4a12', 'stroke-width': 2 }),
    s('rect', { x: 114, y: BASKET_Y + 6, width: 72, height: 7, rx: 3, fill: '#8a4f26', stroke: '#6e4a12', 'stroke-width': 2 }));
  bunch.append(basket);
  const svg = s('svg', { class: 'hm-scene', viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': 'Balloons' },
    s('path', { d: `M0 ${GROUND_Y} Q ${W / 2} ${GROUND_Y - 14} ${W} ${GROUND_Y} L${W} ${H} L0 ${H} Z`, fill: '#4b3b2b' }),
    bunch);
  return { svg, bunch, balloons };
}

export function render(p, ctx = {}) {
  const misses = {};
  const total = p.rounds.length;
  let index = 0;
  let won = 0;
  let missesSoFar = 0; // shared by all rounds
  let timer = null;
  let cleanupKey = () => {};
  const { svg, bunch, balloons } = scene(p.maxMisses);
  const info = statusLine('');
  const progress = h('div', { class: 'hm-progress', 'aria-label': 'Words' }, p.rounds.map(() => h('span', { class: 'hm-dot' })));
  const side = h('div', { class: 'hm-side' });
  const box = h('div', { class: 'g-hangman' }, info, h('div', { class: 'hm-layout' }, h('div', {}, svg, progress), side));
  const livesLeft = () => p.maxMisses - missesSoFar;
  const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;

  function endGame(allSolved) {
    cleanupKey();
    info.textContent = allSolved
      ? `All ${total} words solved with ${plural(livesLeft(), 'balloon')} left – up and away.`
      : `The basket fell. ${won} of ${total} words solved.`;
    bunch.classList.add(allSolved ? 'is-flying' : 'is-falling');
    ctx.onFinish?.({ score: won, max: total, misses, livesLeft: livesLeft() });
  }

  function drawRound() {
    const round = p.rounds[index];
    let st = newRound(missesSoFar);
    const word = h('div', { class: 'hm-word', 'aria-live': 'polite' });
    const next = h('button', { type: 'button', class: 'btn', hidden: true, onclick: () => { index += 1; drawRound(); } }, 'Next word');
    const keys = round.keyboard.map((k) => h('button', { type: 'button', class: 'hm-key', onclick: (e) => press(k, e.currentTarget) }, k));
    cleanupKey();
    const onKey = (e) => {
      const k = e.key.length === 1 ? e.key.toLocaleUpperCase(ctx.lang ?? 'en') : null;
      const btn = keys.find((b) => b.textContent === k && !b.disabled);
      if (btn) press(k, btn);
      else if (e.key === 'Enter' && !next.hidden) next.click();
    };
    document.addEventListener('keydown', onKey);
    cleanupKey = () => document.removeEventListener('keydown', onKey);

    function press(k, btn) {
      const before = st.misses;
      st = guess(round, st, k, p.maxMisses);
      missesSoFar = st.misses;
      btn.disabled = true;
      const miss = st.misses > before;
      btn.classList.add(miss ? 'is-miss' : 'is-hit');
      if (miss) {
        balloons[balloons.length - st.misses].classList.add('is-popped');
        addMiss(misses, round.itemId);
        // the basket sinks a step for every lost balloon
        bunch.style.transform = `translateY(${(st.misses / p.maxMisses) * 70}px)`;
        flash(word, 'is-wrong');
      }
      update();
    }

    function update() {
      word.replaceChildren(...display(round, st).map((ch, i) => h('span', { class: `hm-slot${round.slots[i].hidden ? '' : ' is-fixed'}` }, ch === '_' ? '' : ch)));
      const stt = status(round, st, p.maxMisses);
      if (stt === 'playing') {
        info.textContent = `Word ${index + 1} of ${total} · ${plural(livesLeft(), 'balloon')} left for all the words`;
        return;
      }
      keys.forEach((b) => { b.disabled = true; });
      const dot = progress.children[index];
      if (stt === 'won') {
        won += 1;
        dot.classList.add('is-won');
        word.classList.add('is-solved');
        if (index + 1 >= total) { endGame(true); return; }
        info.textContent = `Correct. ${plural(livesLeft(), 'balloon')} left for the next ${plural(total - index - 1, 'word')}.`;
        next.hidden = false;
        timer = setTimeout(() => next.focus(), 300);
      } else {
        dot.classList.add('is-lost');
        word.replaceChildren(...round.slots.map((sl) => h('span', { class: 'hm-slot is-reveal' }, sl.letter ?? sl.char)));
        endGame(false);
      }
    }
    update();
    side.replaceChildren(round.clue ? h('p', { class: 'hm-clue' }, round.clue) : null, word, h('div', { class: 'hm-keys' }, keys), h('p', {}, next));
  }

  drawRound();
  return { el: box, destroy: () => { clearTimeout(timer); cleanupKey(); } };
}
