// WordNerd student page (F4): join a room with the code and a nickname (anonymous account, no personal
// data), see the games as a path with stars, play them on the phone, send each result. Replays are fine:
// the best try counts (decided 2026-11-21).
import { onAuthStateChanged, signInAnonymously } from 'https://www.gstatic.com/firebasejs/12.6.0/firebase-auth.js';
import { firebase } from './firebase.js';
import { h } from './games/ui.js';
import { starRow } from './stars.js';
import { GAMES, generateGame, gameSeed } from '/engines/games/index.js';
import { normalizeCode, checkNickname, ROOM_LIMITS } from '/engines/rooms/rooms.js';
import * as memory from './games/memory.js';
import * as matching from './games/matching.js';
import * as wordsearch from './games/wordsearch.js';
import * as crossword from './games/crossword.js';
import * as hangman from './games/hangman.js';
import * as gapfill from './games/gapfill.js';
import * as drowning from './games/drowning.js';

const UI = { memory, matching, wordsearch, crossword, hangman, gapfill, drowning };
const fb = firebase('student');
const $app = document.getElementById('app');
const LOGO = '/img/brand/WordNerd_logo.png';

const REASONS = {
  code: 'There is no room with this code. Check the code and try again.',
  'room-closed': 'This room is closed. Ask your teacher for a new code.',
  'room-full': 'This room is full.',
  'nickname-taken': 'Someone in this room already uses this nickname. Choose another one.',
  'nickname-short': `Your nickname needs at least ${ROOM_LIMITS.nickname.min} characters.`,
  'nickname-long': `Your nickname can have at most ${ROOM_LIMITS.nickname.max} characters.`,
  'nickname-chars': 'Use only letters, numbers, spaces and . - _ in your nickname.',
  player: 'You are not in this room yet. Join with the code.',
  network: 'The connection was lost. Check your internet and try again.',
  timeout: 'The connection is slow. Please try again.',
};
const reasonText = (err) => REASONS[err?.reason] ?? 'Something went wrong. Please try again.';

// the room this browser joined, per code (an anonymous account stays signed in on this device)
const store = {
  get(code) { try { return localStorage.getItem(`wn.room.${code}`); } catch { return null; } },
  set(code, roomId) { try { localStorage.setItem(`wn.room.${code}`, roomId); localStorage.setItem('wn.lastCode', code); } catch { /* private mode */ } },
  last() { try { return localStorage.getItem('wn.lastCode'); } catch { return null; } },
};

const params = new URLSearchParams(location.search);
const S = {
  view: 'loading', // loading | join | path | game
  code: normalizeCode(params.get('code')) ?? store.last() ?? '',
  nickname: '',
  error: '',
  busy: false,
  room: null, // { id, title, listSnapshot, games, seed, status }
  me: null, // { nickname, results, path }
  game: null, // { index, startedAt, mounted, finished }
};
if (params.get('code')) history.replaceState(null, '', location.pathname); // keep the URL short and clean

let userReady;
const authReady = new Promise((resolve) => { userReady = resolve; });
onAuthStateChanged(fb.auth, (u) => userReady(u));

async function ensureUser() {
  const u = await authReady;
  if (fb.auth.currentUser) return fb.auth.currentUser;
  return u ?? (await signInAnonymously(fb.auth)).user;
}

// ---------------------------------------------------------------------------------------------------
async function start() {
  const u = await authReady;
  const roomId = S.code ? store.get(S.code) : null;
  if (u && roomId) {
    try { await openRoom(roomId); return; } catch { /* fall back to the join form */ }
  }
  S.view = 'join';
  render();
}

async function openRoom(roomId) {
  const res = await fb.call('wnPlayRoom', { roomId });
  S.room = res.room;
  S.me = res.me;
  S.view = 'path';
  render();
  watchRoom();
}

// The teacher may close the room at any time (fixed 2026-11-21: a phone kept playing a closed room, its results
// were refused but the student was not told). The path and a running game check the room every 15 s and when
// the page comes back to the front; a closed room stops the game and says so.
const WATCH_MS = 15000;
let watchTimer = null;
function watchRoom() {
  clearInterval(watchTimer);
  watchTimer = setInterval(checkRoom, WATCH_MS);
}
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && S.room) checkRoom(); });

async function checkRoom() {
  if (!S.room || S.room.status !== 'open') return S.room?.status === 'open';
  try {
    const res = await fb.call('wnPlayRoom', { roomId: S.room.id });
    S.room.status = res.room.status;
    S.me = res.me;
  } catch { return true; } // offline for a moment: keep playing, the result is checked when it is sent
  if (S.room.status !== 'open') { roomClosed(); return false; }
  if (S.view === 'path') render(); // fresh stars (e.g. the same student on another device)
  return true;
}

function roomClosed(text = 'Your teacher closed the room. Your stars are saved.') {
  clearInterval(watchTimer);
  S.room.status = 'closed';
  S.closedNote = text;
  S.view = 'path';
  render();
  window.scrollTo(0, 0);
}

async function join(e) {
  e.preventDefault();
  const code = normalizeCode(e.target.code.value);
  const nick = checkNickname(e.target.nickname.value);
  S.code = e.target.code.value; S.nickname = e.target.nickname.value;
  if (!code) { S.error = 'The code has 6 letters and numbers.'; render(); return; }
  if (!nick.ok) { S.error = REASONS[nick.reason]; render(); return; }
  S.busy = true; S.error = ''; render();
  try {
    await ensureUser();
    const res = await fb.call('wnJoinRoom', { code, nickname: nick.nickname });
    store.set(code, res.roomId);
    S.code = code;
    await openRoom(res.roomId);
  } catch (err) {
    S.error = reasonText(err);
  }
  S.busy = false;
  render();
}

// ---------------------------------------------------------------------------------------------------
function render() {
  if (S.view !== 'game' && S.game?.mounted) { S.game.mounted.destroy(); S.game = null; }
  const views = { loading, join: joinView, path: pathView, game: gameView };
  $app.replaceChildren(...[views[S.view]()].flat().filter(Boolean));
}

const loading = () => h('div', { class: 'p-center' }, h('img', { src: LOGO, alt: 'WordNerd', class: 'p-logo pulse' }));
const errorLine = () => (S.error ? h('p', { class: 'msg msg-error', role: 'alert' }, S.error) : null);

function joinView() {
  return h('div', { class: 'p-center' },
    h('img', { src: LOGO, alt: 'WordNerd', class: 'p-logo' }),
    h('form', { class: 'p-card', onsubmit: join, novalidate: true },
      h('h1', {}, 'Join the game'),
      errorLine(),
      h('label', { class: 'p-field' }, 'Code from your teacher',
        h('input', { name: 'code', value: S.code, autocomplete: 'off', autocapitalize: 'characters', spellcheck: 'false', inputmode: 'text', maxlength: 9, class: 'p-code', placeholder: 'ABC 234' })),
      h('label', { class: 'p-field' }, 'Your nickname',
        h('input', { name: 'nickname', value: S.nickname, autocomplete: 'nickname', maxlength: ROOM_LIMITS.nickname.max, placeholder: 'e.g. Zsofi K.' })),
      h('p', { class: 'p-hint' }, 'No account, no e-mail: your teacher sees only this nickname.'),
      h('button', { class: 'btn btn-primary btn-wide', disabled: S.busy }, S.busy ? 'Joining…' : 'Join')));
}

function pathView() {
  const { room, me } = S;
  const p = me.path;
  const closed = room.status !== 'open';
  return [
    h('header', { class: 'p-top' },
      h('img', { src: LOGO, alt: 'WordNerd', class: 'p-logo-small' }),
      h('div', { class: 'p-who' }, h('span', { class: 'p-nick' }, me.nickname), h('span', { class: 'p-total' }, starRow(1, 1, 16), ` ${p.stars} / ${p.maxStars}`))),
    h('main', { class: 'p-main' },
      h('h1', { class: 'p-title' }, room.title),
      closed ? h('p', { class: 'msg msg-error', role: 'alert' }, S.closedNote ?? 'This room is closed. You can still see your stars.') : h('p', { class: 'p-hint' }, `${p.done} of ${p.games.length} games done. Play them in any order. You can play again to get more stars.`),
      errorLine(),
      h('ol', { class: 'path' }, p.games.map((g) => h('li', { class: `stop${g.done ? ' is-done' : ''}` },
        h('button', { type: 'button', class: 'stop-btn', disabled: closed || S.busy, onclick: () => playGame(g.index) },
          h('span', { class: 'stop-num' }, g.index + 1),
          h('span', { class: 'stop-body' }, h('span', { class: 'stop-name' }, g.title), starRow(g.stars, 3, 20)),
          h('span', { class: 'stop-go' }, closed ? '' : g.done ? 'Play again' : 'Play')))))),
  ];
}

// ---------------------------------------------------------------------------------------------------
async function playGame(index) {
  // ask the server first: the teacher may have closed the room since the path was shown
  S.busy = true; render();
  const open = await checkRoom();
  S.busy = false;
  if (!open) return;
  const g = S.room.games[index];
  const puzzle = generateGame(g.type, S.room.listSnapshot, g.settings, gameSeed(S.room.seed, index));
  S.error = '';
  if (!puzzle.ok) { S.error = 'This game cannot start. Tell your teacher.'; render(); return; }
  S.game?.mounted?.destroy(); // "Play again": stop the timers of the previous round
  S.game = { index, startedAt: performance.now(), mounted: null, finished: null };
  S.game.mounted = UI[g.type].render(puzzle, { lang: S.room.listSnapshot.targetLang, onFinish: (r) => finish(index, r) });
  S.view = 'game';
  render();
  window.scrollTo(0, 0);
}

async function finish(index, r) {
  if (!S.game || S.game.index !== index || S.game.finished) return;
  const timeMs = Math.round(performance.now() - S.game.startedAt);
  S.game.finished = { sending: true };
  renderFinish();
  try {
    const res = await fb.call('wnSubmitResult', { roomId: S.room.id, index, result: { ...r, timeMs } });
    S.me.results[index] = res.best;
    S.me.path = res.path;
    S.game.finished = { stars: res.stars, best: res.best.stars, attempts: res.best.attempts };
  } catch (err) {
    if (err.reason === 'room-closed') { roomClosed('Your teacher closed the room, so this last result could not be saved. Your earlier stars are kept.'); return; }
    S.game.finished = { error: reasonText(err), retry: () => { S.game.finished = null; finish(index, r); } };
  }
  renderFinish();
}

let $finish = null;
function renderFinish() {
  if (!$finish) return;
  const f = S.game?.finished;
  if (!f) { $finish.hidden = true; return; }
  $finish.hidden = false;
  if (f.sending) { $finish.replaceChildren(h('p', { class: 'p-hint' }, 'Saving your result…')); return; }
  if (f.error) {
    $finish.replaceChildren(h('p', { class: 'msg msg-error' }, f.error), h('button', { type: 'button', class: 'btn', onclick: f.retry }, 'Try again'));
    return;
  }
  const better = f.best > f.stars;
  $finish.replaceChildren(...[
    h('div', { class: 'finish-stars' }, starRow(f.stars, 3, 46)),
    h('p', { class: 'finish-line' }, f.stars === 3 ? 'Perfect!' : f.stars === 2 ? 'Great job!' : f.stars === 1 ? 'Well done!' : 'Keep practising!'),
    better ? h('p', { class: 'p-hint' }, `Your best in this game: ${f.best} stars.`) : null,
    h('p', { class: 'finish-actions' },
      h('button', { type: 'button', class: 'btn', onclick: () => playGame(S.game.index) }, 'Play again'),
      h('button', { type: 'button', class: 'btn btn-primary', onclick: backToPath }, 'Back to the path')),
  ].filter(Boolean)); // replaceChildren would print a null as text
  $finish.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function backToPath() {
  S.view = 'path';
  render();
  window.scrollTo(0, 0);
}

function gameView() {
  const g = S.room.games[S.game.index];
  $finish = h('section', { class: 'finish', hidden: true, 'aria-live': 'polite' });
  return [
    h('header', { class: 'p-top' },
      h('button', { type: 'button', class: 'p-back', onclick: () => { if (!S.game.finished && !confirm('Leave this game? Your progress in it is lost.')) return; backToPath(); } }, '← Path'),
      h('span', { class: 'p-game-title' }, GAMES[g.type].meta.title),
      h('span', { class: 'p-nick' }, S.me.nickname)),
    h('main', { class: 'p-main p-game' }, S.game.mounted.el, $finish),
  ];
}

render();
start();
