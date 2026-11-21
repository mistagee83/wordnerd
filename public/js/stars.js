// Stars (decided 2026-11-21): 0–3 per game, drawn as small SVGs (no emoji, no icon font).
import { s, h } from './games/ui.js';

const STAR = 'M12 2.8l2.8 5.9 6.4.8-4.7 4.4 1.2 6.4L12 17.2l-5.7 3.1 1.2-6.4L2.8 9.5l6.4-.8z';

export function star(filled, size = 18) {
  return s('svg', { viewBox: '0 0 24 24', width: size, height: size, class: `star${filled ? ' is-on' : ''}`, 'aria-hidden': 'true' },
    s('path', { d: STAR, 'stroke-linejoin': 'round', 'stroke-width': 1.6 }));
}

/** n of max stars; n = null draws empty outlines (not played yet). */
export function starRow(n, max = 3, size = 18) {
  const label = n == null ? 'not played yet' : `${n} of ${max} stars`;
  return h('span', { class: 'stars', role: 'img', 'aria-label': label }, Array.from({ length: max }, (_, i) => star(n != null && i < n, size)));
}
