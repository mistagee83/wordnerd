// Bridge renderer (2026-11-25): a gorge with a river, two cliffs and a rope bridge with one empty slot per
// sentence. A right word lays a plank and the walker steps onto it; a wrong word cracks a plank that falls
// into the river, shows the right word, and the sentence comes back at the end. All planks laid: across.
import { isCorrect } from '/engines/games/bridge.js';
import { flash, h, s, statusLine } from './ui.js';

const W = 360;
const DECK = 64; // y of the bridge deck
const L = 44; // left cliff edge
const R = W - 44; // right cliff edge

function walker() {
  return s('g', { class: 'br-walker' },
    s('g', { class: 'br-walker-body' },
      s('line', { x1: -4, y1: 0, x2: -2, y2: -12, stroke: '#2b231b', 'stroke-width': 3, 'stroke-linecap': 'round' }),
      s('line', { x1: 4, y1: 0, x2: 2, y2: -12, stroke: '#2b231b', 'stroke-width': 3, 'stroke-linecap': 'round' }),
      s('rect', { x: -6, y: -26, width: 12, height: 15, rx: 5, fill: '#e2702b' }),
      s('circle', { cx: 0, cy: -33, r: 7, fill: '#f3c99b' }),
      s('path', { d: 'M-11 -39 L0 -44 L11 -39 L0 -34 Z', fill: '#1f1913' }),
      s('path', { d: 'M8 -39 L9 -31', stroke: '#f8b856', 'stroke-width': 1.4 }),
      s('circle', { cx: 9, cy: -30, r: 1.6, fill: '#f8b856' })));
}

function scene(n) {
  const slot = (R - L) / n;
  const planks = Array.from({ length: n }, (_, i) => s('rect', {
    class: 'br-plank', x: L + i * slot + 1, y: DECK, width: slot - 2, height: 9, rx: 2,
    fill: i % 2 ? '#b0763f' : '#c68a4e', stroke: '#6b4423', 'stroke-width': 1.2,
  }));
  const posts = [L - 4, R + 4].map((x) => s('rect', { x: x - 3, y: DECK - 26, width: 6, height: 30, rx: 2, fill: '#6b4423' }));
  const rope = (y) => s('path', { d: `M${L - 4} ${y} Q${W / 2} ${y + 14} ${R + 4} ${y}`, fill: 'none', stroke: '#8a6a45', 'stroke-width': 2 });
  const cliff = (d) => s('path', { d, fill: '#7a5a3a', stroke: '#4e3622', 'stroke-width': 2 });
  const fallLayer = s('g', {});
  const man = walker();
  const svg = s('svg', { class: 'br-scene', viewBox: `0 0 ${W} 138`, role: 'img', 'aria-label': 'A bridge across a gorge' },
    s('rect', { x: 0, y: 0, width: W, height: 138, fill: '#cfe7f1' }),
    s('path', { d: `M${L} 74 L${L + 30} 138 L${R - 30} 138 L${R} 74 Z`, fill: '#9fc6d4' }),
    s('path', { class: 'br-river', d: `M${L + 22} 124 Q${W / 2} 116 ${R - 22} 124 L${R - 14} 138 L${L + 14} 138 Z`, fill: '#3a8fd6' }),
    cliff(`M0 ${DECK + 9} L${L} ${DECK + 9} L${L + 10} 104 L${L - 6} 138 L0 138 Z`),
    cliff(`M${W} ${DECK + 9} L${R} ${DECK + 9} L${R - 10} 104 L${R + 6} 138 L${W} 138 Z`),
    s('rect', { x: 0, y: DECK + 5, width: L, height: 6, fill: '#5f8f3a' }),
    s('rect', { x: R, y: DECK + 5, width: W - R, height: 6, fill: '#5f8f3a' }),
    rope(DECK - 22), posts, planks, rope(DECK - 10), fallLayer, man);
  return { svg, planks, slot, man, fallLayer };
}

export function render(p, ctx = {}) {
  const n = p.queue.length;
  const sc = scene(n);
  const line = statusLine(`Choose the word that fits. Every right word lays a plank: ${n} planks to the other side.`);
  const sentence = h('p', { class: 'br-sentence', 'aria-live': 'polite' });
  const choices = h('div', { class: 'br-choices' });
  const again = h('button', { type: 'button', class: 'btn', hidden: true, onclick: start }, 'Play again');
  let queue, laid, firstTry, misses, wrongOnce, busy, timer;

  const placeWalker = (k, instant = false) => {
    const x = k >= n ? W - 22 : k === 0 ? L - 16 : L + (k - 0.5) * sc.slot;
    sc.man.style.transition = instant ? 'none' : '';
    sc.man.style.transform = `translate(${x}px, ${DECK}px)`;
  };

  function show() {
    const e = queue[0];
    busy = false;
    sentence.replaceChildren(e.before, h('span', { class: 'br-gap' }, ' '), e.after);
    flash(sentence, 'is-new');
    choices.replaceChildren(...e.options.map((o) => h('button', { type: 'button', class: 'br-opt', onclick: (ev) => choose(o, ev.currentTarget) }, o)));
  }

  function choose(word, btn) {
    if (busy) return;
    const e = queue[0];
    const gap = sentence.querySelector('.br-gap');
    busy = true;
    if (isCorrect(e, word)) {
      if (!wrongOnce.has(e.itemId)) firstTry += 1;
      btn.classList.add('is-right');
      gap.textContent = e.answer; gap.classList.add('is-right');
      sc.planks[laid].classList.add('is-on');
      laid += 1;
      placeWalker(laid);
      line.textContent = `${laid} / ${n} planks`;
      queue.shift();
      timer = setTimeout(() => (laid >= n ? finish() : show()), 900);
    } else {
      misses[e.itemId] = (misses[e.itemId] ?? 0) + 1;
      wrongOnce.add(e.itemId);
      btn.classList.add('is-wrong');
      gap.textContent = word; gap.classList.add('is-wrong');
      crack();
      timer = setTimeout(() => {
        gap.textContent = e.answer; gap.classList.replace('is-wrong', 'is-shown');
        for (const b of choices.children) if (b.textContent === e.answer) b.classList.add('is-shown');
        line.textContent = 'The plank cracked. This sentence comes back at the end.';
        timer = setTimeout(() => { queue.push(queue.shift()); show(); line.textContent = `${laid} / ${n} planks`; }, 1600);
      }, 700);
    }
  }

  function crack() {
    // a plank drops into the slot in front of the walker, cracks and falls into the river
    const x = L + laid * sc.slot + 1;
    const g = s('g', { class: 'br-falling', style: `transform-origin: ${x + sc.slot / 2}px ${DECK + 4}px` },
      s('rect', { x, y: DECK, width: sc.slot - 2, height: 9, rx: 2, fill: '#c68a4e', stroke: '#6b4423', 'stroke-width': 1.2 }),
      s('path', { d: `M${x + sc.slot * 0.3} ${DECK} l4 4 l-3 2 l4 3`, stroke: '#3b2615', 'stroke-width': 1.4, fill: 'none' }));
    sc.fallLayer.append(g);
    flash(sc.man, 'is-wobble');
    setTimeout(() => g.remove(), 1500);
  }

  function finish() {
    sentence.replaceChildren('You crossed the bridge!');
    choices.replaceChildren();
    sc.svg.classList.add('is-done');
    line.textContent = firstTry === n ? `All ${n} sentences right the first time.` : `${firstTry} of ${n} right the first time.`;
    again.hidden = false;
    ctx.onFinish?.({ score: firstTry, max: n, misses });
  }

  function start() {
    clearTimeout(timer);
    queue = [...p.queue]; laid = 0; firstTry = 0; misses = {}; wrongOnce = new Set(); busy = false;
    for (const pl of sc.planks) pl.classList.remove('is-on');
    sc.svg.classList.remove('is-done');
    again.hidden = true;
    placeWalker(0, true);
    line.textContent = `0 / ${n} planks`;
    show();
  }

  const el = h('div', { class: 'g-bridge' }, line, sc.svg, sentence, choices, h('p', { class: 'br-actions' }, again));
  start();
  return { el, destroy: () => clearTimeout(timer) };
}
