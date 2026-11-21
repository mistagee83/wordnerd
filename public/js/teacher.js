// WordNerd teacher page (F3): sign-in (Hub account, one click from the Hub), the dashboard in the old
// WordNerd layout (wooden tabs around a central panel, name bar below), new list (upload + analysis),
// the library of lists, the list editor with game previews. Rooms and results come in F4/F5.
// Plain DOM (h()), no framework. Every server call goes through the wn* callables.
import {
  onAuthStateChanged, signInWithPopup, signInWithRedirect, GoogleAuthProvider, signOut,
  signInWithEmailAndPassword, createUserWithEmailAndPassword, sendPasswordResetEmail, signInWithCustomToken,
} from 'https://www.gstatic.com/firebasejs/12.6.0/firebase-auth.js';
import { doc, onSnapshot } from 'https://www.gstatic.com/firebasejs/12.6.0/firebase-firestore.js';
import { firebase, USE_EMULATORS } from './firebase.js';
import { HUB_ACCOUNT_URL, publicBaseUrl } from './config.js';
import { ONE_ACCOUNT_TEXT, authErrorText, isEmail, hubAccountUrl, redeemSso, takeSsoCode } from './hub/sso.js';
import { h, s } from './games/ui.js';
import { settingsForm } from './games/settings.js';
import { balance, costFor } from '/engines/hub/credits.js';
import { checkInput, INPUT_LIMITS, FILE_TYPES } from '/engines/analysis/input.js';
import { LEVELS, SUPPORT_LANGS } from '/engines/analysis/languages.js';
import { applyEdits, EDIT_LIMITS } from '/engines/lists/edit.js';
import { GAMES, GAME_IDS, generateGame } from '/engines/games/index.js';
import { ROOM_LIMITS } from '/engines/rooms/rooms.js';
import { starRow } from './stars.js';
import * as memory from './games/memory.js';
import * as matching from './games/matching.js';
import * as wordsearch from './games/wordsearch.js';
import * as crossword from './games/crossword.js';
import * as hangman from './games/hangman.js';
import * as gapfill from './games/gapfill.js';
import * as drowning from './games/drowning.js';

const UI = { memory, matching, wordsearch, crossword, hangman, gapfill, drowning };
const fb = firebase('teacher');
const $app = document.getElementById('app');
const LOGO = '/img/brand/WordNerd_logo.png';

// ---------------------------------------------------------------------------------------------------
// texts
const REASON_TEXT = {
  insufficient: 'You do not have enough credits for this analysis.',
  'no-price': 'Analysis is not available right now. Please try again later.',
  unsuitable: 'This material cannot be used for vocabulary practice.',
  'model-unavailable': 'The AI service is not available right now. Your credits were not used.',
  'analysis-failed': 'The analysis did not work this time. Your credits were given back – please try again.',
  timeout: 'The analysis took too long. Your credits are given back if it failed – please check My lists, then try again.',
  network: 'The connection was lost. Please check your internet and try again.',
  'text-too-short': `The text is too short: at least ${INPUT_LIMITS.minWords} words.`,
  'text-too-long': `The text is too long: at most ${INPUT_LIMITS.maxWords} words. Use one reading or one lesson.`,
  'file-type': 'Use a PDF, PNG, JPEG or WebP file.',
  'file-data': 'The file could not be read. Please choose it again.',
  'file-too-large': 'The file is larger than 4 MB.',
  'support-language': 'Choose the translation language.',
  level: 'Choose the level.',
  count: 'Choose Auto or between 10 and 30 words.',
  kind: 'Paste a text or choose a file.',
  'teacher-only': 'Please sign in with your teacher account.',
  'sign-in': 'Please sign in again.',
  list: 'This list does not exist any more.',
  term: 'Every word needs at least two letters (no { } or _).',
  translation: 'Every word needs a translation.',
  definition: 'Every word needs a definition.',
  duplicate: 'This word is in the list twice.',
  'too-few-words': `A list needs at least ${EDIT_LIMITS.minItems} words.`,
  'too-many-words': `A list can have at most ${EDIT_LIMITS.maxItems} words.`,
  'unknown-word': 'The list changed meanwhile. Please reload the page.',
  'no-games': 'Choose at least one game.',
  'too-many-games': 'A room can have at most seven games.',
  'duplicate-game': 'Each game can be in a room once.',
  'unknown-game': 'Unknown game. Please reload the page.',
  'game-unavailable': 'One of the games cannot be built from this list.',
  room: 'This room does not exist any more.',
  'hub-pass': 'Closed rooms and their results are your History: they come with the Hub pass.',
  'no-code': 'No free room code right now. Please try again.',
};
const reasonText = (err) => REASON_TEXT[err?.reason] ?? 'Something went wrong. Please try again.';

const GAME_BLURB = {
  memory: 'Turn the cards and find the pairs.',
  matching: 'Drag each word onto its meaning.',
  wordsearch: 'Find the words in the letter grid.',
  crossword: 'Solve the rows, find the secret word.',
  hangman: 'Guess the words before the balloons pop.',
  gapfill: 'Drag the words into the text.',
  drowning: 'Type the word before the box fills with water.',
};

// ---------------------------------------------------------------------------------------------------
// state
const S = {
  user: undefined, // undefined = loading, null = signed out
  view: 'lists',
  error: '',
  note: '',
  busy: false,
  credits: null, // balance()
  price: null, // credits for wordnerd/analyze, null = not on the price list
  lists: null,
  list: null, // the open list as saved
  draft: null, // editable copy: { title, items: [{ id?, term, translation, definition, category, example? }] }
  dirty: false,
  rowError: null, // { index, reason }
  form: null, // new-list form state
  analyzing: false,
};
const SI = { email: '', busy: false };
// rooms (F4)
let roomTimer = null;
S.rooms = null;
S.room = null; // { room, players }
S.hubPass = false;

const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
const langName = (code) => SUPPORT_LANGS[code] ?? code;
const fmtDate = (ms) => (ms ? new Date(ms).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : '');

// ---------------------------------------------------------------------------------------------------
// auth
const REDIRECT_INSTEAD = ['auth/popup-blocked', 'auth/operation-not-supported-in-this-environment'];
async function googleSignIn() {
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  try { return await signInWithPopup(fb.auth, provider); } catch (err) {
    if (REDIRECT_INSTEAD.includes(err.code)) return signInWithRedirect(fb.auth, provider);
    if (err.code === 'auth/popup-closed-by-user' || err.code === 'auth/cancelled-popup-request') return null;
    throw err;
  }
}
async function signInStep(fn) {
  SI.busy = true; S.error = ''; S.note = ''; render();
  try { await fn(); } catch (err) { S.error = authErrorText(err); }
  SI.busy = false; render();
}
// One click from the Hub (#sso=<code>): redeemed before the first auth state is shown.
let ssoPending = null;
{
  const code = takeSsoCode();
  if (code) {
    ssoPending = redeemSso({ code, redeem: (d) => fb.call('redeemSsoCode', d), signIn: (tk) => signInWithCustomToken(fb.auth, tk) })
      .then(() => true)
      .catch((err) => { console.warn('Hub sign-in link', err?.code || err?.message); return false; })
      .finally(() => { ssoPending = null; });
  }
}
// Emulator only: a local test teacher with 50 credits (wnDevSeed exists only in the emulator).
const TEST_TEACHER = { email: 'test-teacher@wordnerd.test', password: 'emulator-only-teacher' };
async function testTeacherSignIn() {
  try { await signInWithEmailAndPassword(fb.auth, TEST_TEACHER.email, TEST_TEACHER.password); } catch {
    await createUserWithEmailAndPassword(fb.auth, TEST_TEACHER.email, TEST_TEACHER.password);
  }
  await fb.call('wnDevSeed', {});
}

let unsubUser = () => {};
let unsubPrice = () => {};
onAuthStateChanged(fb.auth, async (user) => {
  if (!user && ssoPending && await ssoPending) return; // the Hub link is signing the teacher in
  unsubUser(); unsubPrice();
  S.user = user && !user.isAnonymous ? user : null;
  S.lists = null; S.list = null; S.draft = null; S.dirty = false;
  if (S.user) {
    unsubUser = onSnapshot(doc(fb.db, 'users', S.user.uid), (snap) => { S.credits = balance(snap.data()?.credits); renderNamebar(); renderPanelIfNew(); },
      () => { S.credits = null; renderNamebar(); });
    unsubPrice = onSnapshot(doc(fb.db, 'settings', 'credits'), (snap) => { S.price = costFor(snap.data()?.prices, 'wordnerd', 'analyze'); renderPanelIfNew(); },
      () => { S.price = null; });
    route();
  } else render();
});

// ---------------------------------------------------------------------------------------------------
// routing: #lists, #new, #list/<id>, #rooms, #results
window.addEventListener('hashchange', () => route());
window.addEventListener('beforeunload', (e) => { if (S.dirty) { e.preventDefault(); e.returnValue = ''; } });

async function route() {
  if (!S.user) return;
  const [view, id] = (location.hash.slice(1) || 'lists').split('/');
  if (S.dirty && !(view === 'list' && id === S.list?.id)) {
    if (!confirm('You have unsaved changes in this list. Leave without saving?')) {
      history.replaceState(null, '', `#list/${S.list.id}`);
      return;
    }
    S.dirty = false;
  }
  // a note set just before navigating ("Your list is ready.") survives this one route change
  S.error = ''; S.note = S.flash ?? ''; S.flash = null; S.rowError = null;
  S.view = ['lists', 'new', 'list', 'rooms', 'room', 'results'].includes(view) ? view : 'lists';
  clearInterval(roomTimer);
  if (S.view !== 'room') S.room = null;
  render();
  try {
    if (S.view === 'lists') { S.lists = (await fb.call('wnListLists', {})).lists; }
    if (S.view === 'rooms') { const r = await fb.call('wnListRooms', {}); S.rooms = r.rooms; S.hubPass = r.hubPass; }
    if (S.view === 'room' && id) {
      if (S.room?.room.id !== id) { S.room = null; render(); }
      S.room = await fb.call('wnGetRoom', { roomId: id });
      // the player table refreshes itself while the room is open (the live monitor comes in F5)
      if (S.room.room.status === 'open') roomTimer = setInterval(refreshRoom, 10000);
    }
    if (S.view === 'list' && id) {
      if (S.list?.id !== id) { S.list = null; render(); S.list = (await fb.call('wnGetList', { id })).list; }
      S.draft = draftOf(S.list);
    }
    if (S.view === 'new' && !S.form) S.form = newForm();
  } catch (err) {
    S.error = reasonText(err);
  }
  render();
}
const go = (hash) => { if (location.hash === `#${hash}`) route(); else location.hash = hash; };

// ---------------------------------------------------------------------------------------------------
// rendering
function render() {
  closeOverlay();
  if (S.user === undefined) { $app.replaceChildren(h('div', { class: 'loading' }, h('img', { src: LOGO, alt: 'WordNerd', class: 'loading-logo' }))); return; }
  if (!S.user) { $app.replaceChildren(signInView()); return; }
  $app.replaceChildren(dashboard());
}

function errorLine() { return S.error ? h('p', { class: 'msg msg-error', role: 'alert' }, S.error) : null; }
function noteLine() { return S.note ? h('p', { class: 'msg msg-note', role: 'status' }, S.note) : null; }

// The sign-in page: the same structure and text as the other apps of the Hub.
function signInView() {
  const signup = hubAccountUrl({ signup: true, returnTo: `${location.origin}${location.pathname}` });
  const emailForm = h('form', { class: 'signin-form', novalidate: true, onsubmit: (e) => {
    e.preventDefault();
    const email = e.target.email.value.trim();
    const password = e.target.password.value;
    SI.email = email;
    signInStep(async () => {
      if (!isEmail(email)) throw { code: 'auth/invalid-email' };
      if (!password) throw { code: 'auth/missing-password' };
      await signInWithEmailAndPassword(fb.auth, email, password);
    });
  } },
  h('label', { class: 'field' }, 'Email', h('input', { type: 'email', name: 'email', autocomplete: 'email', inputmode: 'email', required: true, value: SI.email })),
  h('label', { class: 'field' }, 'Password', h('input', { type: 'password', name: 'password', autocomplete: 'current-password', required: true })),
  h('button', { class: 'btn btn-wide', disabled: SI.busy }, 'Sign in'));
  const reset = () => {
    const email = emailForm.email.value.trim();
    SI.email = email;
    if (!isEmail(email)) { S.error = 'Type your email above, then click "Forgot your password?" again.'; render(); return; }
    signInStep(async () => {
      try { await sendPasswordResetEmail(fb.auth, email); } catch (err) { if (err?.code !== 'auth/user-not-found') throw err; }
      S.note = `If ${email} has an account, a reset link is on its way.`;
    });
  };
  return h('div', { class: 'signin' },
    h('img', { src: LOGO, alt: 'WordNerd', class: 'signin-logo' }),
    h('div', { class: 'signin-card' },
      h('p', { class: 'eyebrow' }, 'WordNerd for teachers'),
      h('h1', {}, 'Sign in'),
      h('p', { class: 'muted' }, ONE_ACCOUNT_TEXT),
      errorLine(), noteLine(),
      h('button', { class: 'btn btn-primary btn-wide', type: 'button', disabled: SI.busy, onclick: () => signInStep(googleSignIn) }, 'Continue with Google'),
      h('p', { class: 'or' }, h('span', {}, 'or')),
      emailForm,
      h('p', { class: 'links' }, h('button', { class: 'link-btn', type: 'button', disabled: SI.busy, onclick: reset }, 'Forgot your password?')),
      h('p', { class: 'links' }, 'New here? ', h('a', { href: signup }, 'Create your account'))),
    USE_EMULATORS ? h('button', { class: 'btn', type: 'button', onclick: () => signInStep(testTeacherSignIn) }, 'Emulator: sign in as the test teacher') : null,
    h('p', { class: 'links' }, h('a', { href: '/' }, 'WordNerd home')));
}

// --- icons (simple outline SVGs, drawn here: no icon font) ---
const ICONS = {
  lists: 'M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3zM5 17a3 3 0 0 1 3-3h11M9 8h6',
  new: 'M6 3h8l4 4v14H6zM14 3v4h4M12 11v6M9 14h6',
  rooms: 'M5 4l14 8-14 8z',
  results: 'M4 20h16M7 16v-5M12 16V7M17 16v-8',
};
const icon = (name) => s('svg', { viewBox: '0 0 24 24', class: 'icon', 'aria-hidden': 'true' },
  s('path', { d: ICONS[name], fill: 'none', stroke: 'currentColor', 'stroke-width': 1.8, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }));

function tab(view, label, hash = view) {
  const active = S.view === view || (view === 'lists' && S.view === 'list') || (view === 'rooms' && S.view === 'room');
  return h('a', { href: `#${hash}`, class: `tab${active ? ' is-active' : ''}`, 'aria-current': active ? 'page' : null }, icon(view), h('span', {}, label));
}

let $namebar = null;
let $panel = null;
function dashboard() {
  $panel = h('main', { class: 'panel', id: 'panel' }, panelContent());
  $namebar = h('footer', { class: 'namebar' }, namebarContent());
  return h('div', { class: 'dash' },
    h('header', { class: 'dash-top' }, h('a', { href: '#lists', class: 'dash-logo' }, h('img', { src: LOGO, alt: 'WordNerd' }))),
    h('nav', { class: 'tabs tabs-left', 'aria-label': 'Lists' }, tab('lists', 'My lists'), tab('new', 'New list')),
    $panel,
    h('nav', { class: 'tabs tabs-right', 'aria-label': 'Rooms' }, tab('rooms', 'Rooms'), tab('results', 'Results')),
    $namebar);
}
function renderNamebar() { if ($namebar) $namebar.replaceChildren(...namebarContent()); }
// the credit line on the New list page follows the live balance
function renderPanelIfNew() { if (S.view === 'new' && !S.analyzing) renderPanel(); }

function namebarContent() {
  const u = S.user;
  const name = u.displayName || u.email || 'Teacher';
  const initials = name.replace(/@.*/, '').split(/[\s._-]+/).filter(Boolean).slice(0, 2).map((p) => p[0].toUpperCase()).join('') || 'T';
  const c = S.credits;
  const credits = c == null ? '…' : c.unlimited ? 'Unlimited credits' : plural(c.total, 'credit');
  return [
    h('span', { class: 'avatar', 'aria-hidden': 'true' }, initials),
    h('span', { class: 'who' }, h('span', { class: 'who-name' }, name), h('span', { class: 'who-credits' }, credits)),
    h('a', { class: 'btn btn-small', href: hubAccountUrl({ returnTo: location.href.split('#')[0] }) || HUB_ACCOUNT_URL }, 'Get credits'),
    h('button', { class: 'link-btn', type: 'button', onclick: () => { if (!S.dirty || confirm('Leave without saving?')) { S.dirty = false; signOut(fb.auth); } } }, 'Sign out'),
  ];
}

function panelContent() {
  switch (S.view) {
    case 'new': return newListView();
    case 'list': return listView();
    case 'rooms': return roomsView();
    case 'room': return roomView();
    case 'results': return comingSoon('Results', 'See what each student completed, and which words were the hardest. The history of past rooms comes with the Hub pass.');
    default: return listsView();
  }
}

function comingSoon(title, text) {
  return [h('h2', { class: 'panel-title' }, title), h('p', { class: 'muted' }, text)];
}

// ---------------------------------------------------------------------------------------------------
// My lists
function listsView() {
  const head = h('div', { class: 'panel-head' }, h('h2', { class: 'panel-title' }, 'My lists'),
    h('a', { href: '#new', class: 'btn btn-primary' }, 'New list'));
  if (S.lists == null) return [head, errorLine(), S.error ? null : h('p', { class: 'muted' }, 'Loading your lists…')];
  if (!S.lists.length) {
    return [head, errorLine(), h('div', { class: 'empty' },
      h('p', {}, 'No lists yet.'),
      h('p', { class: 'muted' }, 'Paste a reading text or upload a lesson page: WordNerd picks the vocabulary and builds seven games from it.'),
      h('a', { href: '#new', class: 'btn btn-primary' }, 'Make your first list'))];
  }
  return [head, errorLine(), h('ul', { class: 'cards' }, S.lists.map((l) => h('li', {},
    h('a', { href: `#list/${l.id}`, class: 'card' },
      h('span', { class: 'card-title' }, l.title),
      h('span', { class: 'card-meta' }, [l.topic, l.level, plural(l.words, 'word'), `→ ${langName(l.supportLang)}`].filter(Boolean).join(' · ')),
      h('span', { class: 'card-date' }, fmtDate(l.createdAt))))))];
}

// ---------------------------------------------------------------------------------------------------
// New list
function newForm() {
  let lang = '';
  try { lang = localStorage.getItem('wn.supportLang') || ''; } catch { /* private mode */ }
  if (!SUPPORT_LANGS[lang]) {
    const nav = (navigator.language || '').slice(0, 2);
    lang = SUPPORT_LANGS[nav] && nav !== 'en' ? nav : '';
  }
  return { kind: 'text', text: '', file: null, fileError: '', title: '', level: 'B1', supportLang: lang, count: 'auto', focus: '' };
}

function readFile(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(',')[1] ?? '');
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });
}

function newListView() {
  const F = S.form ?? (S.form = newForm());
  const words = (F.text.trim().match(/\S+/g) ?? []).length;
  const counter = h('span', { class: `counter${words && (words < INPUT_LIMITS.minWords || words > INPUT_LIMITS.maxWords) ? ' is-bad' : ''}` },
    `${words} words · ${INPUT_LIMITS.minWords}–${INPUT_LIMITS.maxWords}`);
  const kindBtn = (kind, label) => h('button', { type: 'button', class: `seg${F.kind === kind ? ' is-on' : ''}`, 'aria-pressed': String(F.kind === kind),
    onclick: () => { F.kind = kind; S.error = ''; renderPanel(); } }, label);

  const textArea = h('textarea', { class: 'src-text', rows: 12, placeholder: 'Paste a reading text or a lesson here…', oninput: (e) => {
    F.text = e.target.value;
    const n = (F.text.trim().match(/\S+/g) ?? []).length;
    counter.textContent = `${n} words · ${INPUT_LIMITS.minWords}–${INPUT_LIMITS.maxWords}`;
    counter.classList.toggle('is-bad', n > 0 && (n < INPUT_LIMITS.minWords || n > INPUT_LIMITS.maxWords));
  } });
  textArea.value = F.text;

  const fileInput = h('input', { type: 'file', accept: Object.keys(FILE_TYPES).join(','), class: 'visually-hidden', id: 'src-file', onchange: async (e) => {
    const file = e.target.files?.[0];
    F.file = null; F.fileError = '';
    if (file) {
      if (!FILE_TYPES[file.type]) F.fileError = REASON_TEXT['file-type'];
      else if (file.size > INPUT_LIMITS.maxFileBytes) F.fileError = REASON_TEXT['file-too-large'];
      else F.file = { name: file.name, size: file.size, mimeType: file.type, data: await readFile(file) };
    }
    renderPanel();
  } });
  const drop = h('label', { for: 'src-file', class: `dropzone${F.file ? ' has-file' : ''}`,
    ondragover: (e) => { e.preventDefault(); e.currentTarget.classList.add('is-over'); },
    ondragleave: (e) => e.currentTarget.classList.remove('is-over'),
    ondrop: (e) => { e.preventDefault(); const dt = new DataTransfer(); if (e.dataTransfer.files[0]) dt.items.add(e.dataTransfer.files[0]); fileInput.files = dt.files; fileInput.dispatchEvent(new Event('change')); } },
  F.file
    ? [h('strong', {}, F.file.name), h('span', { class: 'muted' }, ` · ${(F.file.size / 1024 / 1024).toFixed(2)} MB · click to change`)]
    : [h('strong', {}, 'Choose a file'), h('span', { class: 'muted' }, ' or drop it here · PDF or photo of a page · at most 4 MB')]);

  const select = (name, options, value, placeholder) => h('select', { name, onchange: (e) => {
    F[name] = name === 'count' && e.target.value !== 'auto' ? Number(e.target.value) : e.target.value;
    if (name === 'supportLang') { try { localStorage.setItem('wn.supportLang', F.supportLang); } catch { /* ignore */ } }
  } },
  placeholder ? h('option', { value: '', selected: !value, disabled: true }, placeholder) : null,
  options.map(([v, label]) => h('option', { value: v, selected: String(v) === String(value) }, label)));

  const langs = Object.entries(SUPPORT_LANGS).sort((a, b) => a[1].localeCompare(b[1]));
  const c = S.credits;
  const enough = c && (c.unlimited || (S.price != null && c.total >= S.price));
  const costLine = S.price == null
    ? h('p', { class: 'cost is-bad' }, 'Analysis is not available right now.')
    : h('p', { class: `cost${enough ? '' : ' is-bad'}` },
      `Analysing costs ${plural(S.price, 'credit')}. `,
      c == null ? '' : c.unlimited ? 'You have unlimited credits.' : `You have ${plural(c.total, 'credit')}.`,
      !enough && c ? [' ', h('a', { href: hubAccountUrl({ returnTo: location.href.split('#')[0] }) }, 'Get credits')] : null);

  const submit = async (e) => {
    e.preventDefault();
    const data = { kind: F.kind, level: F.level, supportLang: F.supportLang, count: F.count, focus: F.focus, title: F.title };
    if (F.kind === 'text') data.text = F.text;
    else data.file = F.file ? { mimeType: F.file.mimeType, data: F.file.data, name: F.file.name } : null;
    const checked = checkInput(data);
    if (!checked.ok) { S.error = REASON_TEXT[checked.reason] ?? reasonText({ reason: checked.reason }); renderPanel(); return; }
    S.analyzing = true; S.error = ''; openProgress();
    try {
      const res = await fb.call('wnAnalyze', data, { timeout: 330000 });
      S.analyzing = false; S.form = null; closeOverlay();
      S.flash = res.warnings ? `Your list is ready. ${plural(res.warnings, 'small problem')} in the AI answer were fixed automatically.` : 'Your list is ready. Check the words, then try the games.';
      S.list = null;
      location.hash = `list/${res.listId}`;
    } catch (err) {
      S.analyzing = false; closeOverlay();
      S.error = reasonText(err) + (err.reason === 'unsuitable' && err.details?.detail ? ` (${err.details.detail})` : '');
      renderPanel();
    }
  };

  return [
    h('div', { class: 'panel-head' }, h('h2', { class: 'panel-title' }, 'New list')),
    h('p', { class: 'muted' }, 'Give WordNerd one reading or lesson. It picks the most useful words for your level, writes definitions, translations, example sentences and a gapfill text, and builds seven games.'),
    errorLine(),
    h('form', { class: 'new-form', onsubmit: submit },
      h('div', { class: 'segs', role: 'group', 'aria-label': 'Material' }, kindBtn('text', 'Paste text'), kindBtn('file', 'Upload a file')),
      F.kind === 'text'
        ? h('div', { class: 'field' }, textArea, counter)
        : h('div', { class: 'field' }, fileInput, drop, F.fileError ? h('p', { class: 'msg msg-error' }, F.fileError) : null),
      h('div', { class: 'row' },
        h('label', { class: 'field' }, 'Level', select('level', LEVELS.map((l) => [l, l]), F.level)),
        h('label', { class: 'field' }, 'Translation language', select('supportLang', langs, F.supportLang, 'Choose…')),
        h('label', { class: 'field' }, 'Number of words', select('count', [['auto', 'Auto (all useful words, up to 40)'], ...[10, 12, 15, 20, 25, 30].map((n) => [n, n])], F.count))),
      h('label', { class: 'field' }, 'Title (optional)', h('input', { type: 'text', maxlength: INPUT_LIMITS.titleChars, value: F.title, oninput: (e) => { F.title = e.target.value; } })),
      h('label', { class: 'field' }, 'Focus on… (optional)', h('input', { type: 'text', maxlength: INPUT_LIMITS.focusChars, placeholder: 'e.g. phrasal verbs, adjectives for feelings', value: F.focus, oninput: (e) => { F.focus = e.target.value; } })),
      costLine,
      h('button', { class: 'btn btn-primary btn-big', disabled: S.price == null || S.analyzing }, 'Make the word list')),
  ];
}

// the waiting screen while the analysis runs (about half a minute)
const WAIT_LINES = ['Reading your text…', 'Choosing the most useful words…', 'Writing definitions and translations…', 'Writing example sentences…', 'Writing a gapfill text…', 'Checking everything…'];
let $overlay = null;
let waitTimer = null;
function openProgress() {
  closeOverlay();
  const line = h('p', { class: 'wait-line' }, WAIT_LINES[0]);
  let i = 0;
  waitTimer = setInterval(() => { i = Math.min(i + 1, WAIT_LINES.length - 1); line.textContent = WAIT_LINES[i]; }, 5000);
  $overlay = h('div', { class: 'overlay', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Making your word list' },
    h('div', { class: 'wait' }, h('img', { src: LOGO, alt: '', class: 'wait-logo' }), line, h('p', { class: 'muted' }, 'This takes about half a minute – up to a minute for a long list.')));
  document.body.append($overlay);
}
function closeOverlay() {
  clearInterval(waitTimer);
  if (previewMounted) { previewMounted.destroy(); previewMounted = null; }
  $overlay?.remove();
  $overlay = null;
  document.removeEventListener('keydown', escClose);
}
function renderPanel() { if ($panel) $panel.replaceChildren(...[panelContent()].flat().filter(Boolean)); }

// ---------------------------------------------------------------------------------------------------
// the list editor (the old "My dictionary" panel: words | games)
function draftOf(list) {
  return {
    title: list.title,
    items: list.items.map((it) => ({ id: it.id, term: it.term, translation: it.translation, definition: it.definition, category: it.category ?? '', example: it.example, added: it.added })),
  };
}
const patchOf = (d) => ({ title: d.title, items: d.items.map(({ id, term, translation, definition, category }) => ({ id, term, translation, definition, category })) });

function markDirty() {
  if (!S.dirty) { S.dirty = true; renderSaveBar(); }
}
let $saveBar = null;
function renderSaveBar() {
  if (!$saveBar) return;
  $saveBar.hidden = !S.dirty;
}

async function saveList() {
  const check = applyEdits(S.list, patchOf(S.draft));
  if (!check.ok) { S.rowError = { index: check.index, reason: check.reason }; S.error = REASON_TEXT[check.reason] ?? reasonText(check); renderPanel(); return; }
  S.busy = true; S.error = ''; renderPanel();
  try {
    const res = await fb.call('wnSaveList', { id: S.list.id, ...patchOf(S.draft) });
    S.list = res.list; S.draft = draftOf(S.list); S.dirty = false; S.rowError = null;
    S.note = 'Saved.';
    S.lists = null;
  } catch (err) {
    S.error = reasonText(err);
    if (err.details?.index != null) S.rowError = { index: err.details.index, reason: err.reason };
  }
  S.busy = false; renderPanel();
}

async function deleteList() {
  if (!confirm(`Delete "${S.list.title}"? This cannot be undone.`)) return;
  try {
    await fb.call('wnDeleteList', { id: S.list.id });
    S.dirty = false; S.list = null; S.draft = null; S.lists = null;
    go('lists');
  } catch (err) { S.error = reasonText(err); renderPanel(); }
}

function listView() {
  if (!S.list || !S.draft) return [h('h2', { class: 'panel-title' }, 'Word list'), errorLine(), S.error ? null : h('p', { class: 'muted' }, 'Opening the list…')];
  const L = S.list;
  const D = S.draft;

  const rows = D.items.map((it, index) => {
    const bad = S.rowError?.index === index;
    const input = (field, attrs = {}) => h('input', { type: 'text', value: it[field] ?? '', 'aria-label': `${field} ${index + 1}`, ...attrs,
      oninput: (e) => { it[field] = e.target.value; markDirty(); } });
    return h('li', { class: `word${bad ? ' is-bad' : ''}${it.added ? ' is-added' : ''}` },
      h('span', { class: 'word-num' }, index + 1),
      h('div', { class: 'word-fields' },
        input('term', { class: 'w-term', maxlength: EDIT_LIMITS.term, placeholder: 'word' }),
        input('translation', { class: 'w-tr', maxlength: EDIT_LIMITS.translation, placeholder: `in ${langName(L.supportLang)}` }),
        input('definition', { class: 'w-def', maxlength: EDIT_LIMITS.definition, placeholder: 'simple English definition' }),
        it.example ? h('p', { class: 'w-ex' }, it.example.text.replace('___', `[${it.example.answer}]`)) : it.added ? h('p', { class: 'w-ex' }, 'Added by hand: used in every game except the gapfill text.') : null),
      h('button', { type: 'button', class: 'icon-btn', 'aria-label': `Delete ${it.term}`, title: 'Delete this word', onclick: () => {
        D.items.splice(index, 1); markDirty(); S.rowError = null; renderPanel();
      } }, '×'));
  });

  $saveBar = h('div', { class: 'savebar', hidden: !S.dirty },
    h('span', {}, 'Unsaved changes'),
    h('button', { type: 'button', class: 'btn btn-ghost btn-small', onclick: () => { S.draft = draftOf(S.list); S.dirty = false; S.rowError = null; S.error = ''; renderPanel(); } }, 'Discard'),
    h('button', { type: 'button', class: 'btn btn-primary btn-small', disabled: S.busy, onclick: saveList }, S.busy ? 'Saving…' : 'Save'));

  const words = h('section', { class: 'words', 'aria-label': 'Words' },
    h('div', { class: 'words-head' }, h('span', {}, 'Word'), h('span', {}, `Translation (${langName(L.supportLang)})`)),
    h('ol', { class: 'word-list' }, rows),
    h('button', { type: 'button', class: 'btn btn-small', disabled: D.items.length >= EDIT_LIMITS.maxItems, onclick: () => {
      D.items.push({ term: '', translation: '', definition: '', category: '', added: true });
      markDirty(); renderPanel();
      const all = $panel.querySelectorAll('.w-term');
      all[all.length - 1]?.focus();
    } }, '+ Add a word'));

  const games = h('section', { class: 'games', 'aria-label': 'Games' },
    h('h3', {}, 'Games'),
    S.dirty ? h('p', { class: 'muted small' }, 'Save your changes to see them in the games.') : null,
    h('ul', { class: 'game-list' }, GAME_IDS.map((id) => {
      const test = generateGame(id, L, {}, 'check');
      return h('li', {}, h('button', { type: 'button', class: `game-btn${test.ok ? '' : ' is-off'}`, disabled: !test.ok, onclick: () => openPreview(id) },
        h('span', { class: 'game-name' }, GAMES[id].meta.title),
        h('span', { class: 'game-blurb' }, test.ok ? GAME_BLURB[id] : `Not available: ${test.reason}`)));
    })),
    h('button', { type: 'button', class: 'btn btn-primary btn-wide', onclick: () => { if (S.dirty) { S.error = 'Save or discard your changes first.'; renderPanel(); return; } openRoomSetup(); } }, 'Open a room'),
    h('p', { class: 'muted small' }, 'Your class joins with a code: no accounts, just a nickname.'));

  return [
    h('div', { class: 'panel-head' },
      h('a', { href: '#lists', class: 'back' }, '← My lists'),
      h('button', { type: 'button', class: 'link-btn danger', onclick: deleteList }, 'Delete list')),
    h('input', { class: 'list-title', value: D.title, 'aria-label': 'List title', maxlength: EDIT_LIMITS.title, oninput: (e) => { D.title = e.target.value; markDirty(); } }),
    h('p', { class: 'muted small' }, [L.topic, L.level, plural(L.items.length, 'word'), `translations in ${langName(L.supportLang)}`, L.createdAt ? `made ${fmtDate(L.createdAt)}` : null].filter(Boolean).join(' · ')),
    noteLine(), errorLine(),
    h('div', { class: 'editor' }, words, games),
    $saveBar,
  ];
}

// --- game preview overlay ---
let previewMounted = null;
const escClose = (e) => { if (e.key === 'Escape') closeOverlay(); };
function openPreview(gameId) {
  closeOverlay();
  let settings = { ...GAMES[gameId].defaults };
  let seed = `preview:${Date.now()}`;
  const stage = h('div', { class: 'pv-stage' });
  const result = h('p', { class: 'muted small pv-result' });
  const mount = () => {
    previewMounted?.destroy();
    const puzzle = generateGame(gameId, S.list, settings, seed);
    result.textContent = '';
    if (!puzzle.ok) { stage.replaceChildren(h('p', { class: 'msg msg-error' }, `Cannot build this game: ${puzzle.reason}`)); previewMounted = null; return; }
    previewMounted = UI[gameId].render(puzzle, { lang: S.list.targetLang, onFinish: (r) => { result.textContent = `Finished: ${r.score} / ${r.max}.`; } });
    stage.replaceChildren(previewMounted.el);
  };
  $overlay = h('div', { class: 'overlay', role: 'dialog', 'aria-modal': 'true', 'aria-label': `${GAMES[gameId].meta.title} preview`,
    onclick: (e) => { if (e.target === $overlay) closeOverlay(); } },
  h('div', { class: 'pv' },
    h('div', { class: 'pv-head' },
      h('h3', {}, `${GAMES[gameId].meta.title} – preview`),
      h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Close', onclick: closeOverlay }, '×')),
    h('details', { class: 'pv-settings' }, h('summary', {}, 'Game settings'),
      settingsForm(gameId, settings, (st) => { settings = st; mount(); }),
      h('p', {}, h('button', { type: 'button', class: 'btn btn-small', onclick: () => { seed = `preview:${Date.now()}`; mount(); } }, 'New puzzle'))),
    stage, result));
  document.body.append($overlay);
  document.addEventListener('keydown', escClose);
  mount();
}

// ---------------------------------------------------------------------------------------------------
// rooms (F4): open a room from a list, the room view with code and QR, the Rooms tab

async function refreshRoom() {
  if (S.view !== 'room' || !S.room) { clearInterval(roomTimer); return; }
  try {
    S.room = await fb.call('wnGetRoom', { roomId: S.room.room.id });
    if (S.room.room.status !== 'open') clearInterval(roomTimer);
    renderPanel();
  } catch { /* a missed refresh is fine; the next one tries again */ }
}

// the room set-up: which games, their settings, a title; every available game is on by default
function openRoomSetup() {
  closeOverlay();
  const L = S.list;
  const picks = GAME_IDS.map((type) => {
    const test = generateGame(type, L, {}, 'check');
    return { type, on: test.ok, ok: test.ok, reason: test.reason, settings: { ...GAMES[type].defaults } };
  });
  const title = h('input', { type: 'text', value: L.title, maxlength: ROOM_LIMITS.titleChars, 'aria-label': 'Room title' });
  const err = h('p', { class: 'msg msg-error', hidden: true, role: 'alert' });
  const rows = picks.map((p) => {
    const box = h('input', { type: 'checkbox', checked: p.on, disabled: !p.ok, onchange: (e) => { p.on = e.target.checked; } });
    return h('li', { class: `rs-game${p.ok ? '' : ' is-off'}` },
      h('label', { class: 'rs-pick' }, box, h('span', { class: 'game-name' }, GAMES[p.type].meta.title),
        h('span', { class: 'game-blurb' }, p.ok ? GAME_BLURB[p.type] : `Not available: ${p.reason}`)),
      p.ok ? h('details', { class: 'rs-settings' }, h('summary', {}, 'Settings'), settingsForm(p.type, p.settings, (st) => { p.settings = st; })) : null);
  });
  const create = h('button', { type: 'button', class: 'btn btn-primary', onclick: async () => {
    const games = picks.filter((p) => p.on).map((p) => ({ type: p.type, settings: p.settings }));
    if (!games.length) { err.textContent = REASON_TEXT['no-games']; err.hidden = false; return; }
    create.disabled = true; create.textContent = 'Opening…'; err.hidden = true;
    try {
      const res = await fb.call('wnCreateRoom', { listId: L.id, games, title: title.value });
      closeOverlay();
      S.rooms = null;
      location.hash = `room/${res.roomId}`;
    } catch (e) {
      err.textContent = reasonText(e); err.hidden = false;
      create.disabled = false; create.textContent = 'Open the room';
    }
  } }, 'Open the room');
  $overlay = h('div', { class: 'overlay', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Open a room', onclick: (e) => { if (e.target === $overlay) closeOverlay(); } },
    h('div', { class: 'pv rs' },
      h('div', { class: 'pv-head' }, h('h3', {}, 'Open a room'), h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Close', onclick: closeOverlay }, '×')),
      h('p', { class: 'muted small' }, `Students play the chosen games in this order and collect up to 3 stars in each. The room stays open until you close it, at most ${ROOM_LIMITS.maxDays} days.`),
      h('label', { class: 'field' }, 'Room title', title),
      h('ul', { class: 'rs-list' }, rows),
      err,
      h('p', { class: 'rs-actions' }, h('button', { type: 'button', class: 'btn btn-ghost', onclick: closeOverlay }, 'Cancel'), create)));
  document.body.append($overlay);
  document.addEventListener('keydown', escClose);
}

const joinUrl = (code) => `${publicBaseUrl()}/play?code=${code}`;
const fmtCode = (code) => `${code.slice(0, 3)} ${code.slice(3)}`;
const fmtDateTime = (ms) => (ms ? new Date(ms).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '');

// QR codes: qrcode-generator from jsDelivr (the Hubbaloo choice), loaded only when a room is shown
let qrLib = null;
function loadQr() {
  if (window.qrcode) return Promise.resolve(window.qrcode);
  qrLib ??= new Promise((resolve, reject) => {
    const tag = document.createElement('script');
    tag.src = 'https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/qrcode.js';
    tag.onload = () => resolve(window.qrcode);
    tag.onerror = () => { qrLib = null; reject(new Error('qr')); };
    document.head.append(tag);
  });
  return qrLib;
}
function qrBox(url) {
  const box = h('div', { class: 'qr', 'aria-label': `QR code for ${url}`, role: 'img' });
  loadQr().then((qrcode) => {
    const q = qrcode(0, 'M');
    q.addData(url);
    q.make();
    box.innerHTML = q.createSvgTag({ cellSize: 6, margin: 2, scalable: true });
  }).catch(() => { box.textContent = 'QR code unavailable'; });
  return box;
}

function roomsView() {
  const head = h('div', { class: 'panel-head' }, h('h2', { class: 'panel-title' }, 'Rooms'));
  if (S.rooms == null) return [head, noteLine(), errorLine(), S.error ? null : h('p', { class: 'muted' }, 'Loading your rooms…')];
  const open = S.rooms.filter((r) => r.status === 'open');
  const closed = S.rooms.filter((r) => r.status !== 'open');
  const card = (r) => h('li', {}, h('a', { href: `#room/${r.id}`, class: 'card' },
    h('span', { class: 'card-title' }, r.title),
    h('span', { class: 'card-meta' }, r.status === 'open' ? `Code ${fmtCode(r.code)} · ${plural(r.players, 'student')}` : `${plural(r.players, 'student')} · closed`),
    h('span', { class: 'card-date' }, r.status === 'open' ? `open until ${fmtDateTime(r.expiresAt)}` : fmtDate(r.closedAt ?? r.expiresAt))));
  return [head, noteLine(), errorLine(),
    open.length ? h('ul', { class: 'cards' }, open.map(card))
      : h('div', { class: 'empty' }, h('p', {}, 'No open rooms.'), h('p', { class: 'muted' }, 'Open a room from one of your lists: the class joins with a code.'), h('a', { href: '#lists', class: 'btn btn-primary' }, 'My lists')),
    h('h3', { class: 'section-title' }, 'History'),
    !closed.length ? h('p', { class: 'muted small' }, 'Closed rooms and their results will be here.')
      : S.hubPass ? h('ul', { class: 'cards' }, closed.map(card))
        : h('p', { class: 'muted' }, `${plural(closed.length, 'closed room')}. The History of closed rooms and their results comes with the Hub pass. `,
          h('a', { href: hubAccountUrl({ returnTo: location.href.split('#')[0] }) }, 'See the Hub pass'))];
}

function roomView() {
  if (!S.room) return [h('h2', { class: 'panel-title' }, 'Room'), errorLine(), S.error ? null : h('p', { class: 'muted' }, 'Opening the room…')];
  const { room, players } = S.room;
  const open = room.status === 'open';
  const url = joinUrl(room.code);
  const close = async () => {
    if (!confirm('Close this room? Students cannot join or play any more. The results stay.')) return;
    try {
      await fb.call('wnCloseRoom', { roomId: room.id });
      clearInterval(roomTimer);
      S.rooms = null;
      // a closed room is History (Hub pass): go back to the list, which says what happens to it
      S.flash = S.hubPass ? 'Room closed. You find it in the History below.' : 'Room closed. Its results are kept: the History of closed rooms comes with the Hub pass.';
      go('rooms');
    } catch (e) { S.error = reasonText(e); renderPanel(); }
  };
  const gameHead = room.games.map((g) => h('th', { scope: 'col' }, GAMES[g.type].meta.title));
  const table = players.length
    ? h('div', { class: 'tbl-wrap' }, h('table', { class: 'players' },
      h('thead', {}, h('tr', {}, h('th', { scope: 'col' }, 'Student'), gameHead, h('th', { scope: 'col' }, 'Stars'))),
      h('tbody', {}, players.map((p) => h('tr', {},
        h('th', { scope: 'row' }, p.nickname),
        room.games.map((g, i) => h('td', {}, p.results[i] ? starRow(p.results[i].stars, 3, 14) : h('span', { class: 'muted small' }, '–'))),
        h('td', { class: 'num' }, `${p.path.stars} / ${p.path.maxStars}`))))))
    : h('p', { class: 'muted' }, open ? 'Nobody has joined yet. Show the code or the QR code to your class.' : 'Nobody joined this room.');
  return [
    h('div', { class: 'panel-head' }, h('a', { href: '#rooms', class: 'back' }, '← Rooms'),
      open ? h('button', { type: 'button', class: 'link-btn danger', onclick: close }, 'Close room') : h('span', { class: 'muted small' }, 'Closed')),
    h('h2', { class: 'panel-title' }, room.title),
    h('p', { class: 'muted small' }, [room.listSnapshot.title, plural(room.games.length, 'game'), open ? `open until ${fmtDateTime(room.expiresAt)}` : `closed ${fmtDate(room.closedAt ?? room.expiresAt)}`].join(' · ')),
    errorLine(),
    open ? h('div', { class: 'join' },
      h('div', { class: 'join-text' },
        h('p', { class: 'join-label' }, 'Join at'),
        h('p', { class: 'join-url' }, `${publicBaseUrl().replace(/^https?:\/\//, '')}/play`),
        h('p', { class: 'join-label' }, 'with the code'),
        h('p', { class: 'join-code' }, fmtCode(room.code)),
        h('button', { type: 'button', class: 'btn btn-small', onclick: (e) => { navigator.clipboard?.writeText(url); e.currentTarget.textContent = 'Link copied'; } }, 'Copy the link')),
      qrBox(url)) : null,
    h('div', { class: 'panel-head' }, h('h3', { class: 'section-title' }, `Students (${players.length})`),
      open ? h('button', { type: 'button', class: 'btn btn-small', onclick: refreshRoom }, 'Refresh') : null),
    table,
  ];
}

render();
