// Drag and drop for word chips, with a tap fallback (tap a chip, then tap a place), for mouse, pen and touch.
// Chips: elements with [data-chip] inside root (not [data-locked]). Places: elements with [data-drop].
// onDrop(chipEl, placeEl) returns true if the chip was accepted (the caller moves it in the DOM);
// otherwise the floating copy flies back to where the chip came from.
const DRAG_START_PX = 6;

export function enableDnD(root, onDrop) {
  let press = null; // { chip, x, y, id }
  let drag = null; // { chip, ghost, dx, dy, over }
  let selected = null;

  const placeAt = (x, y) => document.elementFromPoint(x, y)?.closest('[data-drop]') ?? null;
  const select = (chip) => {
    selected?.classList.remove('is-selected');
    selected = chip;
    chip?.classList.add('is-selected');
    root.classList.toggle('has-selection', !!chip);
  };

  function down(e) {
    const chip = e.target.closest('[data-chip]');
    if (chip && root.contains(chip) && !chip.hasAttribute('data-locked') && e.button === 0) {
      press = { chip, x: e.clientX, y: e.clientY, id: e.pointerId };
      e.preventDefault();
      return;
    }
    const place = e.target.closest('[data-drop]');
    if (place && selected && root.contains(place)) {
      const chipEl = selected;
      select(null);
      onDrop(chipEl, place);
    }
  }

  function startDrag(e) {
    const { chip } = press;
    const r = chip.getBoundingClientRect();
    const ghost = chip.cloneNode(true);
    ghost.classList.add('dnd-ghost');
    Object.assign(ghost.style, { position: 'fixed', left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, margin: 0, zIndex: 1000, pointerEvents: 'none' });
    document.body.append(ghost);
    chip.classList.add('is-dragging');
    select(null);
    drag = { chip, ghost, dx: e.clientX - r.left, dy: e.clientY - r.top, over: null, home: r };
  }

  function move(e) {
    if (!press || e.pointerId !== press.id) return;
    if (!drag && Math.hypot(e.clientX - press.x, e.clientY - press.y) > DRAG_START_PX) startDrag(e);
    if (!drag) return;
    drag.ghost.style.left = `${e.clientX - drag.dx}px`;
    drag.ghost.style.top = `${e.clientY - drag.dy}px`;
    const over = placeAt(e.clientX, e.clientY);
    if (over !== drag.over) {
      drag.over?.classList.remove('is-over');
      over?.classList.add('is-over');
      drag.over = over;
    }
    e.preventDefault();
  }

  function up(e) {
    if (!press || e.pointerId !== press.id) return;
    const { chip } = press;
    press = null;
    if (!drag) { // a tap: select the chip (tap again to unselect)
      select(selected === chip ? null : chip);
      return;
    }
    const { ghost, over, home } = drag;
    drag = null;
    over?.classList.remove('is-over');
    chip.classList.remove('is-dragging');
    const accepted = over && root.contains(over) ? onDrop(chip, over) : false;
    if (accepted) { ghost.remove(); return; }
    // fly back
    ghost.style.transition = 'left .25s ease, top .25s ease';
    const back = chip.isConnected ? chip.getBoundingClientRect() : home;
    ghost.style.left = `${back.left}px`;
    ghost.style.top = `${back.top}px`;
    setTimeout(() => ghost.remove(), 260);
  }

  root.addEventListener('pointerdown', down);
  window.addEventListener('pointermove', move, { passive: false });
  window.addEventListener('pointerup', up);
  window.addEventListener('pointercancel', up);
  return () => {
    root.removeEventListener('pointerdown', down);
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', up);
    window.removeEventListener('pointercancel', up);
    document.querySelectorAll('.dnd-ghost').forEach((g) => g.remove());
  };
}
