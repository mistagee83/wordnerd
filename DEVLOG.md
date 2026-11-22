# WordNerd – DEVLOG

## F0 – Repo (2026-11-21)

**Decisions (András, 2026-11-21)**
- Name stays WordNerd. Address `wordnerd.mrandrewshub.com`; entitlement key and price-key prefix `wordnerd`;
  Firestore prefix `wn`.
- First-version games: Memory, Matching, Word search, Crossword, Hangman, Gapfill, Drowning. Teacher difficulty
  settings as in SPEC 6.
- Brand: the old logo as it is, the old colours as they were, dashboard modelled on the old one; the character is
  optional.
- No Netlify: test locally and on the live (unlisted, noindex) address.
- Docs and code in English; tests with `node:test`, no dependencies.
- GitHub: private repo `mistagee83/wordnerd`, branch `dev`.

**Built**
- Repo skeleton: `package.json` (no dependencies), `firebase.json` (codebase `wordnerd`, emulators, deny-deploy
  hooks for Firestore/Storage rules), `.firebaserc` (`mrashub`), `.gitignore`.
- Scripts: `serve.mjs` (dependency-free dev server), `build-web.mjs` (`public/` + `engines/` → `dist/`),
  `sync-hub.mjs` (Hub `entitlements.js`, `credits.js`, `sso.js` copied in), `sync-engines.mjs`, `deny-deploy.mjs`.
- `engines/prng.js`: seeded PRNG (FNV-1a hash + mulberry32) with `int`, `pick`, `shuffle`; tests in
  `tests/prng.test.mjs`.
- Brand: logo PNGs in `public/img/brand/`, vector sources (`.ai`, `.eps`) in `design/brand-source/`, old screens in
  `reference/screens/`; colour tokens from the old CSS in `public/css/tokens.css`, roles in `base.css`.
- Placeholder page `public/index.html` (logo, one line, noindex), `public/js/config.js` (Firebase web config from
  the Hub, `PUBLIC_BASE_URL`), `public/_headers` (Cloudflare Pages).
- `functions/` stub without dependencies (added in F2).
- Emulator copies of the Hub's `firestore.rules` and `storage.rules` (no WordNerd block yet).

**Not done / next**
- Hosting not set up (Cloudflare Pages or Firebase Hosting: SPEC 13). The Hub's `APP_ORIGINS` and Auth authorized
  domains do not include WordNerd yet (F3).
- Logo SVG export from the `.ai`/`.eps` sources.
- F1 (game engines) waits for approval.

## F1 – Game engines (2026-11-21)

**Built**
- `engines/lang.js`: per-language letter helper (graphemes via `Intl.Segmenter`, locale upper case, grid letters,
  hangman slots and keyboards, filler alphabets for en/hu/de/es/fr/it, answer normalising).
- `engines/games/`: Memory, Matching, Word search, Crossword (hidden word, the 2012 design), Hangman, Gapfill,
  Drowning, plus `common.js` and the registry `index.js` (`GAMES`, `generateGame`, `gameSeed`). Teacher settings
  per game as in SPEC 6, clamped to limits. Pure helpers for checking answers (`isPair`, `findWord`, `rowCorrect`,
  hangman `guess`/`status`, `isCorrect`, `waterLevel`) so the F4 student UI and the tests share the rules.
- `engines/fixtures/sample-family-b1.js`: 20 hand-written items in the analysis shape (phrasal verbs, a hyphenated
  and a two-word term).
- Schema detail fixed: `example` is `{ text, answer }` with exactly one `___`; distractors in the answer's form.
- `public/dev/preview.html`: developer preview, every game playable with editable settings and seed, puzzle JSON.

**Verified**
- `npm test`: 30 tests pass (PRNG, language helper incl. Hungarian, German ß, Turkish i, combining accents; every
  game with 300 seeds × default/min/max settings never fails or throws; word search reads every placed word back
  along its direction; crossword rows cross the hidden column at the right letter with no word used twice;
  hangman win/lose; gapfill options; drowning water rule; a Hungarian target-language list in the letter games).
- Browser (local server, built-in browser): all seven games played through by script (memory 8 pairs, matching with
  a deliberate mistake, word search all words, crossword solved and hidden word shown, a hangman round, gapfill
  9/10, three drowning answers); no console errors; at 375 px wide no game overflows (word search cells now scale
  with the grid size; a 16×16 grid overflowed before the fix).

**Deviations / notes**
- Word search with a fixed grid size leaves out words longer than the grid (found by the extreme-settings test).
- The preview is a developer tool, not the student UI; it ships under `/dev/` (noindex) and can be removed at launch.

**Next**
- F2 (analysis: schema, prompt, `analyzeText`, credits) waits for approval.

## F1 revision – game design after András's review (2026-11-21)

**Feedback (András) and decisions**
- Memory: more striking cards, always a square board, cards that really flip → square boards 3×3–6×6 (odd boards
  have a logo tile in the centre), 3D flip, wooden backs with the logo.
- Matching: too weak → definitions by default; drag the word onto its definition card (chosen from three concepts).
- Word search: drag instead of first/last click → pointer drag (mouse and touch), tap-tap still works.
- Crossword: jump to the next cell after a letter → auto-advance, Backspace back, arrows, paste fills on.
- Hangman: needs a picture that shows trouble → balloons (chosen from balloons / chalk gallows / melting snowman).
- Gapfill: should be a connected text with a drag-and-drop word bank and a check at the end, as in the old plan
  → new list field `cloze` (text with `{{n}}` gaps + gap list); the sentence version is parked for later.
- Drowning: needs a picture → red British telephone box filling with water (chosen from three concepts).
- Graphics now, as SVG/CSS, not in F4 (András).

**Built**
- Engines: `memory.js` (board setting, logo tile), `matching.js` (`targets` + `bank`), `gapfill.js` (cloze parser,
  word bank with extra words, `checkAll`), `wordsearch.js` (`lineCells` for drag highlighting).
- Game UIs as reusable modules in `public/js/games/` (one per game, plus `ui.js` helpers and `dnd.js` drag and drop
  with tap fallback), styles in `public/css/games.css`. Each calls `onFinish({ score, max, misses })`.
- Preview rewritten to mount those modules; `?game=<id>` opens a game directly; Restart button; result line.
- Sample list: a `cloze` text with 11 gaps.

**Verified**
- `npm test`: 33 pass (new: square boards and logo tile, short-list fallback, matching shape, cloze order/bank/extra
  words, check at the end, broken cloze texts, `lineCells`).
- Built-in browser, real pointer input: memory full game by script (result with misses), matching drag (correct
  snaps in, wrong flies back and counts), word search drag forwards, backwards and a rejected crooked drag,
  crossword typing with auto-advance and Backspace, hangman won and lost rounds (balloons pop, basket falls),
  gapfill drag + tap placement and check, drowning rising water and a correct answer. No console errors. At 375 px
  no game overflows (memory 3–6, word search 16×16).
- Bugs found and fixed on the way: CSS custom properties were dropped by `Object.assign(el.style)` (grids collapsed
  to one column); `.btn` overrode the `hidden` attribute (Next word showed too early); multi-letter input in the
  crossword (paste/autocomplete) now flows into the next cells; the logo tile looked like a card.

**Not verified**
- Real phone touch (only the emulated 375 px viewport with mouse-driven pointer events).

## F1 revision 2 – word search directions, crossword goal, hangman lives (2026-11-21)

**Feedback (András)**: word search showed mostly one direction – are diagonals used? Crossword: knowing the secret
word early does nothing – what is the goal? Hangman: 8 words is too many and 12 lives per word too many; the lives
should cover several words (e.g. 4 words with 12 lives). A goal for the whole set: later.

**Changed**
- Word search: directions balanced (least used direction first) and up to 12 seeded layout attempts. Over 300
  "medium" puzzles each of the four directions gets 24–26 % of the words (before: long words mostly across).
- Crossword: the goal is the secret word. New setting `guesses` (default 3), engine helper `secretCorrect`; the UI
  has a secret-word bar whose tiles fill from solved rows and a guess field; a right guess or all rows solved ends
  the game and shows the unsolved answers greyed. Result includes `secretFound`, `guessedEarly`, guesses and
  reveals used.
- Hangman: setting `parts` → `lives`, shared by all the words; defaults 4 words / 12 lives (limits 1–8 / 4–12).
  `newRound(missesSoFar)` carries the misses on. One balloon scene for the whole game, progress dots per word.
- SPEC 13: a proposal for a goal for the whole set (stars per game, path view), to decide in F4.

**Verified**
- `npm test`: 37 pass (new: shared lives carry over, default 4/12, secret-word guess, direction balance).
- Browser: crossword with 3 rows solved (tiles S I B), a wrong guess (2 left), then the right guess ends the game
  and greys the 4 unsolved rows; hangman two words won with 2 misses each (8 balloons left), third word lost the
  rest and the game ended (dots: won, won, lost). Word search layout shows across, down and diagonal words.

## F2 – Analysis (2026-11-21)

**Built**
- `engines/analysis/` (pure, tested, copied into functions by sync-engines): `languages.js` (target English,
  30 support languages, levels), `input.js` (request checks and limits), `schema.js` (the model's JSON schema),
  `prompt.js` (versioned prompt `analyze-v1`, prompt-injection guard), `normalize.js` (model answer → list
  document: ids, caps, dropped/cleared fields, gap repair and renumbering), `run.js` (the whole flow with injected
  credits/model/storage: spend → model → checks → save; one retry; refund on every failure).
- `engines/fixtures/sample-answer.js`: the sample list in the model's output shape.
- `functions/`: `index.js` (`wnAnalyze`, secret `WN_GEMINI_API_KEY`, 300 s, 512 MiB), `analyze.js` (teacher
  check, errors mapped to reasons), `credits.js` (the Hub's spend/refund pattern, app `wordnerd`), `common.js`,
  `config.js` (model `gemini-3.8-flash`, mock switch), `llm/gemini.js` (generateContent with inline file and JSON
  schema; unavailable model detected), `llm/mock.js`. Dependencies: firebase-admin, firebase-functions.
- `scripts/emulator-smoke.mjs` + `npm run test:emulator`: dependency-free end-to-end check over the emulators' REST
  APIs. WordNerd emulators moved to their own ports (the default ones were in use by another app's emulators).

**Verified**
- `npm test`: 56 pass (19 new: input limits incl. base64 size, prompt contents, schema, normalising the sample
  answer into a list all seven games accept, caps, dropped/cleared fields, gap repair, failure reasons; run:
  success, retry, double failure refund, unsuitable without retry, unavailable model, failed save refunded, no
  model call without credits, file sent as a file part).
- `npm run test:emulator`: 9 checks pass against real Auth/Firestore/Functions emulators with the mock model:
  success (3 credits spent, list with 20 items and 11 gaps stored), broken answer refunded, unsuitable refunded,
  unavailable model refunded, ledger 4 spends / 3 refunds with app `wordnerd`, bad input refused before spending,
  insufficient credits, anonymous and signed-out callers refused, missing price refused.

**Not verified / open**
- No real Gemini call yet: the `generateContent` request shape (inline file, `responseJsonSchema`,
  `thinkingLevel`) and the quality of the answers need one live run with a real key (costs a few cents).
- Secret `WN_GEMINI_API_KEY` does not exist yet in Secret Manager; no price `wordnerd/analyze` yet in the Hub's
  `settings/credits`; nothing deployed.
- Hub rules: no WordNerd block needed yet (only functions touch `wnLists`); the read rule for teachers comes in F3.

## F2 – first live runs with gemini-3.8-flash (2026-11-21)

Key: András put it in `functions/.secret.local` (gitignored; named `HB_GEMINI_API_KEY`, the live script accepts
both names). New `scripts/live-analyze.mjs`: the real model through the same `runAnalysis`, without Firebase or
credits; prints the list and token use, writes the JSON to `tmp-live/`.

1. **Schema refused** – HTTP 400 "The specified schema produces a constraint that has too many states for serving".
   Fix: removed `maxItems` and the level `enum` from the schema (code checks them anyway).
2. **Run 1 (analyze-v1, B1, hu, 20 words, text)**: ok in 28 s, 1004 in / 4161 out tokens, 20 items, 12 gaps,
   0 warnings, all seven games build. Weak spots: several distractors were fragments or other forms ("look forward",
   "get used" for "get around"), one distractor could fit ("nervous" for "furious"), an old-fashioned phrase in the
   gapfill text ("many an advantage"), a space before punctuation after the gap.
3. **Prompt analyze-v2**: distractors must be complete expressions of the same kind and form and must not fit;
   modern everyday English in the gapfill text; punctuation right after the gap. Code now also removes a space
   between the gap and punctuation.
4. **Run 2 (v2, same text)**: ok in 28 s, 1102 / 4106 tokens, 20 items, 10 gaps, 0 warnings; distractors complete
   and wrong (e.g. "get used to" → look out for / give up on / put away), text natural.
5. **Run 3 (v2, PDF made from the sample, A2, de, 12 words)**: ok in 18 s, 1282 / 2605 tokens, 12 items, 11 gaps,
   German translations; the file path (inline PDF part) works. At A2 some noun/adjective distractors are other list
   words; acceptable, worth watching.
- Cost (Hubbaloo price table, introductory price): ≈ $0.016 per 20-word analysis, ≈ $0.011 for 12 words; double
  from 2027. Suggested price: 2 credits (SPEC 13).
- `npm run test:emulator` now goes through `scripts/test-emulator.mjs`, which stops this repo's leftover Firestore
  emulator after the run (it blocked the next run twice). 9/9 checks pass; `npm test` 57/57.

**Still open before production**: secret `WN_GEMINI_API_KEY` in Secret Manager, the `wordnerd/analyze` price in the
Hub's `settings/credits`, the first deploy (all with András's approval).

## F3 – Teacher app (2026-11-21)

**Decisions (András)**: hosting on Cloudflare Pages from `main` (he creates the project and DNS). Correction of the
spec: the teacher's word lists (the library) are always visible; only the History of played sessions needs the
Hub pass (SPEC 7 and the Hub concept fixed). András renamed the local key to `WN_GEMINI_API_KEY` and set the price
of `wordnerd/analyze` in the Hub admin. Secret Manager still has no `WN_GEMINI_API_KEY` (checked: 404).

**Built**
- Server: `engines/lists/edit.js` (checked edits, gap repair after deleting a word, summaries) and
  `functions/lists.js`: `wnListLists`, `wnGetList`, `wnSaveList` (transaction), `wnDeleteList`; emulator-only
  `wnDevSeed`. No Hub rules change: only functions touch `wnLists`; the page reads the Hub's `users/{uid}` and
  `settings/credits`, which the Hub rules already allow.
- Front end: `teacher.html`, `js/teacher.js`, `js/firebase.js` (emulators with WordNerd's ports, `?live`),
  `css/app.css` (the old dashboard: wooden tabs, central panel, logo plank, name bar; bottom tab bar on phones),
  `js/games/settings.js` (settings form shared with the dev preview). Landing page links to the teacher page.
- Hub: `shared/sso.js` lists the WordNerd origin (Hub commit `de98f10` on `dev`, not pushed, not deployed);
  the copy in `public/js/hub/sso.js` is synced.

**Verified**
- `npm test` 63 pass (6 new for list edits); `npm run test:emulator` 11 checks (2 new: library list/open/edit/
  refusals, delete; another teacher and a student see nothing).
- Browser against the emulators (mock model): test-teacher sign-in with 50 credits; New list with a pasted text →
  waiting screen → editor (credits 50 → 48); edit a translation, delete a word, add a word, save, reload: all kept;
  Hangman preview from the edited list; My lists card; "unsuitable" material shows the model's reason and keeps the
  credits; a too-short text is refused before calling; delete list → empty library. Desktop 1280 px shows the old
  layout; at 375 px no view overflows (definition field and name bar fixed on the way). The success note was lost
  on navigation – fixed. Console: only the expected 400 of the test teacher's first sign-in attempt.

**Not verified / open**
- Nothing is live: Cloudflare Pages project, DNS, Auth authorized domain (András); Secret Manager secret, functions
  deploy, Hub functions deploy for one-click sign-in (with approval).
- Google sign-in and the Hub's one-click link were not tried (they need the real project and domain).
- A real phone.

## Backend live (2026-11-21, approved by András)

- Secret Manager: `WN_GEMINI_API_KEY` version 1, uploaded from `functions/.secret.local` through a temporary file
  that was deleted right after (the key was never printed). The deploy granted the compute service account
  `secretAccessor` on it.
- `firebase deploy --only functions:wordnerd`: `wnAnalyze`, `wnListLists`, `wnGetList`, `wnSaveList`,
  `wnDeleteList` created (Node 22, 2nd gen, europe-west1). `wnDevSeed` is not deployed (emulator only; 404 live).
- Check: each live function refuses an unauthenticated call with `sign-in`.
- Not done: a signed-in live analysis (needs a real teacher account: `http://localhost:5174/teacher.html?live`
  works before the domain exists, localhost is an authorized domain by default); Hub push + Hub functions deploy
  for one-click sign-in; Cloudflare Pages, DNS, authorized domain; `dev` → `main`.

## Hub one-click sign-in (2026-11-21, approved by András)

- Hub `dev` pushed (`de98f10`: `shared/sso.js` lists `https://wordnerd.mrandrewshub.com`), `functions:hub` deployed:
  `createSsoCode` / `redeemSsoCode` now accept the WordNerd origin (the deployed copy `functions/shared/sso.js`
  contains it).
- Not yet: the Hub site's `main` (its "Open app" button checks the same list in the browser). The push to the Hub's
  `main` was stopped by the permission check and waits for András's explicit go-ahead. `origin/main..dev` holds only
  docs, the already deployed `functions/.env.mrashub` and this `shared/sso.js` change.

## Type change (2026-11-21)

András did not like the old Tenor Sans + Source Sans; from four pairings shown side by side he chose Luckiest Guy
(headings) + Lexend (text). Luckiest Guy is used only for fixed English headings and the tab labels (capitals only,
no ő/ű); list titles, words, the drowning prompt and other teacher/AI text use Lexend. The telephone-box sign uses
Luckiest Guy. Checked in the browser: both fonts load, the computed families are right, no overflow.

## Hub main (2026-11-21, approved by András)

Hub `main` fast-forwarded to `dev` (`de98f10`) and pushed; Cloudflare Pages built it in about 20 s. Checked: the live
`https://mrandrewshub.com/shared/sso.js` lists the WordNerd origin, the Hub home answers 200. One-click sign-in from
the Hub is ready on the Hub side; it needs the WordNerd site at `wordnerd.mrandrewshub.com` (Pages, DNS, authorized
domain – András) and a Hub product with `appUrl` (F6).

## Site live (2026-11-21, done by Claude at András's request)

- Firebase Auth authorized domains: `wordnerd.mrandrewshub.com` appended through the Identity Toolkit admin API
  (gcloud token; read the list first, 14 → 15 domains, the others unchanged).
- WordNerd `main` created from `dev` (`b77c7a4`).
- Cloudflare Pages (in András's Chrome): project `wordnerd` from `mistagee83/wordnerd`, production branch `main`,
  build `node scripts/build-web.mjs`, output `dist`, no framework. First build: Node 22.23, 48 files uploaded; the
  repo's `functions/` folder was taken for Pages Functions, no routes found, skipped. Pages URL
  `wordnerd-ecl.pages.dev` (the name `wordnerd` was taken). Custom domain `wordnerd.mrandrewshub.com` activated
  (Cloudflare added the CNAME); the dashboard briefly showed "disconnected from your Git account", but the build
  settings show the repo connected and automatic deployments enabled.
- Checks: pages.dev 200; the custom domain answered 200 after about a minute, with `x-robots-tag: noindex`;
  `/teacher`, `/engines/games/index.js`, `/js/teacher.js`, `/js/hub/sso.js` 200 (`/teacher.html` → 308 `/teacher`);
  the live teacher page shows the sign-in panel without console errors and without the emulator button.
- Not tried: a real sign-in and analysis on the live site (needs András's account); the Hub's "Open app" (needs a
  Hub product with `appUrl`, F6).

## Naming: Rooms (2026-11-21)

András: "Sessions" is called **Rooms** – the tab, the button ("Open a room"), the placeholder texts, SPEC terms and
the planned collection `wnRooms` (was `wnSessions`); `gameSeed(roomSeed, gameIndex)`. Not live yet (dev only).

## Auto word count (2026-11-21)

András asked what happens without a number and when a text has 50 good words: the form always sent 10–30 (default
20) and the model took that many "most useful" ones. Now `count: "auto"` is the default: the prompt (`analyze-v3`)
lets the model choose every genuinely useful item between 10 and 40, fewer for short texts, no padding; the
normalizer caps at 40 (the editor's limit). The form offers "Auto (all useful words, up to 40)" first, then 10–30;
the waiting screen says up to a minute.

- Live run (sample text, 330 words, B1, hu, auto): 14 items, 12 gaps, 0 warnings, 22 s, 1149 in / 3162 out tokens
  (≈ $0.013); all seven games build.
- `npm test` 64 pass (auto input, prompt, cap at 40, no padding); `npm run test:emulator` 11/11 (its cleanup also
  stopped the background emulators started for manual testing – restart them when needed).
- Not live yet: needs `functions:wordnerd` deploy (prompt v3, input) and `main` push (the form).

## Pages auto-deploy fixed (2026-11-21)

The first `main` push after the Pages project was created did not deploy: the Cloudflare Workers and Pages GitHub
app had no access to `mistagee83/wordnerd` (GitHub asks for an e-mailed code before changing it, so András did that
step). Functions with Auto were deployed before; this commit on `main` checks that pushes now deploy by themselves.

## F4 – Rooms (2026-11-21)

**Decisions (András)**: stars 1–3 per game with a path; a room lives until closed, at most 7 days; replays allowed,
the best try counts.

**Built**: rooms engine and tests (`engines/rooms/rooms.js`, `tests/rooms.test.mjs`); seven room callables
(`functions/rooms.js`); teacher: room set-up dialog, room view with code, QR and students table, Rooms tab with
the Hub-pass History; student page `/play` with join, path, games, stars; home page join box; shared `js/stars.js`;
the local server serves extension-less pages like Pages.

**Verified**
- `npm test` 71 pass (7 new for rooms); `npm run test:emulator` 15 checks (4 new: open/join incl. rejoin, taken
  nickname, wrong code; play with checked results, stars, best try and first-try misses; teacher view and refusals;
  closing, and the History behind the Hub pass).
- Browser against the emulators: teacher opens a room with all seven games (code, QR shown); a student at 375 px joins
  with code + nickname, sees the path, plays Matching (3 stars, "Perfect!"), reloads and is back in with 3/21; a lost
  Hangman sends 0 stars; the teacher's table shows the student with 3 stars; closing the room disables play on the
  student's path; a room with only two games works. No overflow at 375 px.
- Fixed on the way: "null" printed under the stars (replaceChildren with a null, also in Hangman without a clue);
  after closing, the teacher's room view stayed "open" without a Hub pass – now it returns to Rooms with a note.

**Not verified**: a real phone; a whole class at once; the QR scanned by a phone camera.

## F4 live (2026-11-21, approved by András)

- `functions:wordnerd` deployed: the seven room callables created, the others updated.
- `main` pushed (`c0811c9`); Cloudflare Pages built it by itself in about 30 s. Note: Pages answers 200 for an
  unknown path (it serves the home page), so a live check must look for new content, not only the status.
- Checks: home page has the join box; `/play` is the student page and loads without console errors with
  `?code=` prefilled; `/js/play.js`, `/js/stars.js`, `/css/play.css`, `/engines/rooms/rooms.js` served; the teacher
  page has the room set-up; the room callables refuse unauthenticated calls with `sign-in`.
- Not tried live: opening a room and joining (needs András's teacher account; a test join would create an anonymous
  account in the production project).

## Fix: a closed room kept playing on the phone (2026-11-21)

András closed a live room and could still play on his phone. The live logs show no result submitted after the
close (the server refused nothing because nothing arrived; it would have refused with `room-closed`), but the
student page never asked the server again after loading the path. Now `js/play.js` checks the room before starting a
game, every 15 s on the path and during a game, and when the page comes back to the front; a closed room stops the
game and says "Your teacher closed the room…"; a result refused with `room-closed` says it could not be saved.
Checked against the emulators: closing while a student plays Drowning stopped the game after about 7 s with the
message, and the path's buttons were disabled.

## Rooms are started from the Rooms tab; the word list folds away (2026-11-22)

András's feedback before F5: on a phone the list page needed a lot of scrolling to reach "Open a room", and starting
a room belongs on the Rooms tab.
- List editor: the words are a folded section ("Words (n) · check and edit"), closed whenever a list is opened;
  it stays open while editing (deleting, adding, saving re-render the panel) and opens by itself on a row error.
  The "Open a room" button under the games stays.
- Rooms tab: a "Start a room" button in the header opens a list picker (always a fresh list of the teacher's
  lists; "New list" when there are none); choosing a list opens the same room set-up as from the list editor.
- Fixed on the way: a folded/unfolded `<details>` fires its `toggle` event late, also after the panel was
  replaced, which turned the stored state back; only a connected element updates it now.

**Verified** (emulators, built-in browser, 375 px and desktop): picker lists both test lists; choosing one opens
the set-up, "Open the room" opens the room with code and QR; the list opens folded, stays open through a delete
and a save, opens folded again from My lists and from another list; no horizontal overflow at 375 px; `npm test`
71 pass. **Not verified**: a real phone.

Live on 2026-11-22 (approved by András): `main` fast-forwarded to `a9a39ee`; Pages served the new `teacher.js`
(list picker, folded words) and `app.css` within a minute. Front end only, no functions deploy needed.
