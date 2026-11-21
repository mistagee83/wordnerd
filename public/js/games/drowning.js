// Drowning renderer – the red British telephone box (decided 2026-11-21). The box fills with water; a
// mortarboard floats on the surface. Type the target-language word for the prompt: a correct answer drains
// some water, at the top the game is over.
import { isCorrect, waterLevel } from '/engines/games/drowning.js';
import { flash, h, s, statusLine } from './ui.js';

// glass area inside the box (SVG units)
const G = { x: 34, y: 92, w: 92, h: 200 };

function phoneBox() {
  const water = s('g', { class: 'dr-water' },
    s('path', { class: 'dr-wave', d: waveD(), fill: '#3a8fd6' }),
    s('rect', { x: G.x - 40, y: 6, width: G.w + 80, height: G.h + 20, fill: '#3a8fd6' }),
    ...[0, 1, 2, 3, 4].map((i) => s('circle', { class: 'dr-bubble', cx: G.x + 12 + i * 17, cy: G.h, r: 2.5 + (i % 3), style: `--d:${i * 0.7}s` })));
  const cap = s('g', { transform: 'translate(80 3)' }, s('g', { class: 'dr-cap' },
    s('path', { d: 'M-22 0 L0 -9 L22 0 L0 9 Z', fill: '#1f1913' }),
    s('path', { d: 'M-11 4 L-11 11 Q0 16 11 11 L11 4', fill: '#2b231b' }),
    s('path', { d: 'M14 1 L16 14', stroke: '#f8b856', 'stroke-width': 1.6 }),
    s('circle', { cx: 16, cy: 15, r: 2.2, fill: '#f8b856' })));
  const inner = s('g', { 'clip-path': 'url(#dr-glass)' },
    s('rect', { x: G.x, y: G.y, width: G.w, height: G.h, fill: '#dfeef5' }),
    s('g', { class: 'dr-level' }, water, cap));
  // window bars: 3 columns × 6 rows of panes, drawn over the water
  const bars = [];
  for (let c = 1; c < 3; c++) bars.push(s('rect', { x: G.x + (G.w / 3) * c - 2, y: G.y, width: 4, height: G.h, fill: '#b5121b' }));
  for (let r = 1; r < 6; r++) bars.push(s('rect', { x: G.x, y: G.y + (G.h / 6) * r - 2, width: G.w, height: 4, fill: '#b5121b' }));
  const svg = s('svg', { class: 'dr-box', viewBox: '0 0 160 330', role: 'img', 'aria-label': 'Telephone box filling with water' },
    s('defs', {}, s('clipPath', { id: 'dr-glass' }, s('rect', { x: G.x, y: G.y, width: G.w, height: G.h }))),
    // roof and body
    s('path', { d: 'M18 46 Q80 4 142 46 Z', fill: '#c8102e', stroke: '#8f0b20', 'stroke-width': 3 }),
    s('rect', { x: 14, y: 44, width: 132, height: 14, rx: 3, fill: '#c8102e', stroke: '#8f0b20', 'stroke-width': 3 }),
    s('rect', { x: 18, y: 58, width: 124, height: 252, fill: '#c8102e', stroke: '#8f0b20', 'stroke-width': 3 }),
    s('rect', { x: 32, y: 64, width: 96, height: 20, fill: '#1f1913' }),
    s('text', { x: 80, y: 78.5, 'text-anchor': 'middle', fill: '#fcf4e7', 'font-size': 11, 'font-family': 'Tenor Sans, sans-serif', 'letter-spacing': 1.5 }, 'TELEPHONE'),
    s('circle', { cx: 80, cy: 28, r: 6, fill: '#f8b856' }),
    inner, ...bars,
    s('rect', { x: G.x, y: G.y, width: G.w, height: G.h, fill: 'none', stroke: '#8f0b20', 'stroke-width': 3 }),
    s('rect', { x: 120, y: 190, width: 4, height: 22, rx: 2, fill: '#8f0b20' }), // door handle
    s('rect', { x: 10, y: 308, width: 140, height: 14, rx: 2, fill: '#8f0b20' }));
  return { svg, level: inner.querySelector('.dr-level') };
}

function waveD() {
  // a long wavy surface so the CSS animation can slide it sideways
  let d = `M${G.x - 40} 6`;
  for (let x = G.x - 40; x <= G.x + G.w + 40; x += 20) d += ` Q ${x + 5} 0 ${x + 10} 6 T ${x + 20} 6`;
  return `${d} L${G.x + G.w + 40} 14 L${G.x - 40} 14 Z`;
}

export function render(p, ctx = {}) {
  const { svg, level } = phoneBox();
  const prompt = h('div', { class: 'dr-prompt', 'aria-live': 'polite' }, 'Ready?');
  const line = statusLine(`Type the word for each prompt before the box fills with water. ${p.queue.length} words.`);
  const input = h('input', { type: 'text', class: 'dr-input', autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false', 'aria-label': 'Your answer', disabled: true });
  const startBtn = h('button', { type: 'button', class: 'btn', onclick: start }, 'Start');
  const skipBtn = h('button', { type: 'button', class: 'btn btn-ghost', hidden: true, onclick: skip }, 'Skip');
  let i = 0;
  let correct = 0;
  let t0 = 0;
  let timer = null;
  let misses = {};
  let queue = [...p.queue]; // a skipped word is appended to this copy, never to the puzzle

  function setLevel(x) {
    // 0 = empty (surface at the bottom of the glass), 1 = full (surface at the top)
    level.style.transform = `translateY(${G.y + G.h - x * (G.h + 6)}px)`;
  }
  setLevel(0);

  function start() {
    i = 0; correct = 0; misses = {}; queue = [...p.queue];
    startBtn.hidden = true; skipBtn.hidden = false;
    input.disabled = false; input.value = ''; input.focus();
    prompt.textContent = queue[0].prompt;
    line.textContent = `0 / ${queue.length}`;
    t0 = performance.now();
    clearInterval(timer);
    timer = setInterval(tick, 100);
  }
  function tick() {
    const lvl = waterLevel(p, (performance.now() - t0) / 1000, correct);
    setLevel(lvl);
    if (lvl >= 1) end(false);
  }
  function nextWord() {
    i += 1;
    input.value = '';
    if (i >= queue.length) { end(true); return; }
    prompt.textContent = queue[i].prompt;
    flash(prompt, 'is-new');
  }
  function skip() {
    misses[queue[i].itemId] = (misses[queue[i].itemId] ?? 0) + 1;
    queue.push(queue[i]); // a skipped word comes back at the end
    nextWord();
    input.focus();
  }
  function end(survived) {
    clearInterval(timer);
    input.disabled = true; skipBtn.hidden = true; startBtn.hidden = false; startBtn.textContent = 'Play again';
    svg.classList.toggle('is-full', !survived);
    prompt.textContent = survived ? 'You made it.' : 'The box is full.';
    line.textContent = survived ? `All ${correct} words before the water reached the top.` : `${correct} word${correct === 1 ? '' : 's'} before the water reached the top.`;
    ctx.onFinish?.({ score: correct, max: p.settings.words, misses, survived });
  }

  const form = h('form', { class: 'dr-form', onsubmit: (e) => {
    e.preventDefault();
    if (input.disabled || !input.value.trim()) return;
    if (isCorrect(queue[i], input.value, ctx.lang ?? 'en')) {
      correct += 1;
      svg.classList.remove('is-drain'); void svg.offsetWidth; svg.classList.add('is-drain');
      line.textContent = `${correct} / ${queue.length}`;
      nextWord();
    } else {
      misses[queue[i].itemId] = (misses[queue[i].itemId] ?? 0) + 1;
      flash(input, 'is-wrong');
      input.select();
    }
  } }, input, h('button', { class: 'btn' }, 'Enter'));

  const el = h('div', { class: 'g-drowning' }, line, h('div', { class: 'dr-layout' }, svg,
    h('div', { class: 'dr-side' }, prompt, form, h('p', { class: 'dr-actions' }, startBtn, skipBtn))));
  return { el, destroy: () => clearInterval(timer) };
}
