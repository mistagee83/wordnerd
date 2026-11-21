// Tiny DOM helpers shared by the game renderers. No framework.
// Every renderer: render(puzzle, ctx) -> { el, destroy }.
// ctx: { lang, onFinish({ score, max, misses: { itemId: n } }) } – the F4 session UI stores the result.

export function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else if (k === 'class') el.className = v;
    else if (k === 'style' && typeof v === 'object') {
      // custom properties (--n) need setProperty; Object.assign on style silently drops them
      for (const [prop, val] of Object.entries(v)) {
        if (prop.startsWith('--')) el.style.setProperty(prop, String(val));
        else el.style[prop] = val;
      }
    }
    else if (v !== false && v != null) el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat()) if (c != null && c !== false) el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  return el;
}

const SVG_NS = 'http://www.w3.org/2000/svg';
export function s(tag, attrs = {}, ...children) {
  const el = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) if (v != null) el.setAttribute(k, v);
  for (const c of children.flat()) if (c != null) el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  return el;
}

export const statusLine = (text = '') => h('p', { class: 'g-status', role: 'status' }, text);

export function addMiss(misses, itemId) {
  if (itemId) misses[itemId] = (misses[itemId] ?? 0) + 1;
}

// Restart a CSS animation class on an element (shake, pop…).
export function flash(el, cls) {
  el.classList.remove(cls);
  void el.offsetWidth; // reflow so the animation runs again
  el.classList.add(cls);
}

// Shrink the font of each element until its text fits its box (long definitions on small cards).
export function fitText(els, { min = 9 } = {}) {
  for (const el of els) {
    let size = parseFloat(getComputedStyle(el).fontSize);
    while ((el.scrollHeight > el.clientHeight + 1 || el.scrollWidth > el.clientWidth + 1) && size > min) {
      size -= 1;
      el.style.fontSize = `${size}px`;
    }
  }
}
