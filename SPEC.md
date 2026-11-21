# WordNerd – SPEC v0.1

Single source of truth for this repo. Translated and tightened from the Hub concept
(`D:\dev\Edtechhub\docs\koncepcio-wordnerd.md`, Hungarian, 2026-11-21). If the two disagree, this file wins for
WordNerd; shared Hub rules (accounts, credits, entitlements, Security Rules) are owned by the Hub's `docs/spec-v1.md`.

Owner: András. Background: WordNerd ran at wordnerd.hu in 2014–2017 (PHP + PostgreSQL, gamified vocabulary site).
Only the games and their rules carry over; no old code. The old material is at
`D:\Dokumentumok\Tanári segédanyagok\WordNerd` (read only).

## 1. Product in one sentence

A teacher uploads a reading text or a lesson, AI extracts the vocabulary once with everything any game will ever
need, and the app builds vocabulary games from that list deterministically, without AI. The teacher shares them
with students through a code and sees what each student completed.

## 2. Out of scope (decided 2026-11-21)

Exercise map (fixed topics × levels), student accounts, XP and levels, skill tree, achievements, room, characters,
shop, PvP arena, Wordpong. The old skill-tree difficulty steps survive as **teacher settings** (section 6).

## 3. Principles

1. **One AI call, all content up front.** The analysis produces every field any game can use. The teacher pays
   credits once; every game after that is free and instant.
2. **Games are functions, not stored copies:** `puzzle = generator(list, settings, seed)`. Same input, same puzzle,
   on every device. All students in a session get the same word search; nothing per game is stored.
3. **The model never decides structure.** Grid placement, crossword layout, which word goes where: code. The model
   only fills data fields, validated against a JSON schema.
4. **Students never talk to AI** and never see other students' answers.
5. **Nothing English-specific in engines.** `targetLang` and `supportLang` are data (section 5).
6. **No model API key in the client.** All model calls go through Cloud Functions that spend credits first.
7. **Phone first** for students; the teacher dashboard works on phone and desktop.

## 4. Flow

1. **Sign in** – teacher with the Hub account (Google or e-mail; one-click SSO from the Hub).
2. **Upload** – pasted text, PDF, or photo of a textbook page. Limit: a few MB file, about 1500–2000 words of
   extracted text (a reading or a lesson, not a book). Options: level (A1–C1), support language (translation
   language), number of words (about 15–30), optional focus (e.g. only verbs, phrasal verbs).
3. **Analysis – AI, costs credits** (`wordnerd/analyze`). Cloud Function: spend credits in a transaction, call
   Gemini with structured JSON output, validate the schema, refund on failure. The uploaded file is deleted after
   the analysis; only the source sentences of the chosen words are kept.
4. **Edit the list** – delete, rewrite, reorder. Manually added words: fields filled by hand, or a small AI call
   (`wordnerd/enrich`, open question).
5. **Build the set** – choose games (all proposed by default), difficulty settings, optionally a subset of words.
   Preview of every game.
6. **Share** – "Start session" gives a 6-character code and a QR code. Students open the WordNerd address, enter
   the code and a nickname (anonymous Firebase account, as in Hubbaloo) and play at their own pace. The session
   lives until the teacher closes it or it expires (7 days, open question).
7. **Monitor** – live table: student × game (done / in progress / score / time), plus **per-word error stats**
   ("most students missed *reluctant*").

## 5. The word list (what the AI produces)

Per item (`term` may be a multi-word expression):

| Field | Used by | Example |
|---|---|---|
| `id` | everything (stable within the list) | `w07` |
| `term`, `lemma` | all games | *looked after* / *look after* |
| `pos` | grouping, word formation | phrasal verb |
| `level` | filtering | B1 |
| `definition` (target language, simple) | monolingual matching, crossword clues | to take care of someone |
| `translation` (support language) | bilingual games | gondoskodik valakiről |
| `sourceSentence` | context | *She looked after her little brother.* |
| `example` = `{ text, answer }` (new sentence with exactly one `___` gap, and the exact form that fills it) | later: quiz, sentence gapfill | `{ text: "Who will ___ the dog while we're away?", answer: "look after" }` |
| `distractors[3]` (same form as `example.answer`) | extra wrong words in the gapfill bank, later quiz | take after, look for, look into |
| `family` | later: word formation | care, careful, careless |
| `synonyms`, `antonyms` | later: matching variants, odd one out | take care of |
| `category` (group inside the list) | later: assigning, odd one out | family / people |

List level: `title`, `topic`, `level`, `targetLang`, `supportLang`, and **`cloze`: a new connected text written by
the AI** with the list words, the gaps marked (the gapfill game, decided 2026-11-21, as in the old WordNerd
"complex gapfill"):

```
cloze: {
  text: "Every summer all our {{1}} meet at my grandparents' farm. My father {{2}} there…",
  gaps: [ { n: 1, itemId: "w07", answer: "relatives" }, { n: 2, itemId: "w05", answer: "grew up" } ]
}
```

Every `{{n}}` has exactly one gap entry and vice versa; `answer` is the form that fits (it may be inflected).
About 8–12 gaps, roughly 120–200 words. New text, not a copy of the source: copyright, and the gaps fall on list
words.

**Languages.** Start: target language English, support language chosen by the teacher. The schema has no language
in field names. Adding target languages later stays cheap if: the prompt is parameterised; the letter games (word
search, hangman, crossword) handle letters through one per-language helper (alphabet, diacritics, upper case,
spaces and hyphens in expressions); language-specific fields (e.g. German article/gender) are optional extensions.

## 6. Games

All deterministic (list + settings + seed). First version (decided 2026-11-21): seven games.

| Game | Mono/bilingual | Source fields | Teacher settings (from the old skill tree) |
|---|---|---|---|
| Memory | both | term ↔ translation / definition | square board 3×3 / 4×4 / 5×5 / 6×6 (4 / 8 / 12 / 18 pairs; odd boards have a logo tile in the centre), wrong-pair display time |
| Matching | definition by default (translation possible) | term → definition | pairs (4–10) |
| Word search | both (clue: translation or definition) | term | grid size, directions (diagonal, backwards), number of words |
| Crossword (hidden word) | both | term + definition / translation | hidden word length (7 →), number of reveal helps, guesses at the secret word (default 3) |
| Hangman (balloons) | both | term (+ clue) | number of words (default 4) and lives shared by them (default 12, 4–12) |
| Gapfill (connected text) | monolingual | `cloze` + distractors | extra wrong words in the bank (0–4) |
| Drowning (type against rising water) | bilingual | translation → term | water speed |

Later (fields already exist, no new analysis needed): quiz, anagrams, Oxford minute, sentence gapfill, odd one out,
assigning, word formation.

**How the games play (decided 2026-11-21, after András tried the F1 preview):**

- **Memory** – wooden cards with the logo that flip in 3D; a found pair glows green; the board is always square.
- **Matching** – definition cards in a column, the words in a bank above; drag a word onto its definition (or tap
  the word, then the definition). Correct: it snaps in and the card turns green. Wrong: the card shakes, the word
  flies back, and it counts as a mistake.
- **Word search** – drag across the letters (mouse or finger); a found word gets a coloured capsule; tapping the
  first and the last letter still works. Directions are balanced: on "medium" about a quarter of the words go
  across, down, and along each diagonal.
- **Crossword** – the goal is the secret word in the yellow column. Each solved row turns green and puts its letter
  into the secret-word tiles; the student can guess the secret word at any time (3 guesses by default). A right
  guess, or solving every row, ends the game; unsolved rows then show their answers greyed, so the words are still
  seen. Typing moves the cursor to the next cell and on to the next row; Backspace goes back, arrow keys move; a
  paste or mobile autocomplete fills the following cells. "Reveal a letter" fills the focused cell. Result:
  rows solved, secret found, early or not, guesses and reveals used.
- **Hangman** – a game is several words (default 4) with one shared set of lives (default 12 balloons). A basket of
  books hangs from the balloons; every wrong letter pops one and the basket sinks; with the last one gone it falls
  and the game ends. Dots under the basket show the words won and lost; after the last word it flies away.
- **Gapfill** – the connected text with gaps and a word bank (answers + extra wrong words); drag words into gaps,
  swap or move them back, check everything at the end. Wrong words are marked and the answer shown.
- **Drowning** – a red British telephone box fills with water, a mortarboard floats on the surface; a correct
  answer drains some water; Skip sends the word to the end of the queue.

Game UIs: `public/js/games/<game>.js`, each `render(puzzle, ctx) → { el, destroy }` with
`ctx.onFinish({ score, max, misses })`; drag and drop with tap fallback in `public/js/games/dnd.js`; styles in
`public/css/games.css`; graphics are inline SVG/CSS (no image files besides the logo). The F4 student pages use
these modules as they are.

Generators are pure ES modules in `engines/games/`, use only `engines/prng.js` for randomness, and are covered by
`node:test` tests: same seed → same puzzle; every word placed or explicitly reported as skipped; the crossword is
connected; output works for multi-word terms and non-ASCII letters.

Engine contract (built in F1): each game module exports `meta`, `defaults`, `limits`, `normalizeSettings()` and
`generate(list, settings, seed)`, which returns `{ ok: true, game, settings, … }` or `{ ok: false, reason }` and
never throws. Settings are clamped to `limits`; unknown values fall back to the defaults. The seed of one game in a
session is `gameSeed(sessionSeed, gameIndex)`. Rules settled in F1:

- Letter games use `engines/lang.js`: graphemes (an accented letter is one letter), locale upper case (a letter
  whose upper case is longer, like German ß, stays as it is), grid letters without spaces/hyphens/apostrophes,
  per-language filler alphabets and hangman keyboards (en, hu, de, es, fr, it; other languages fall back to Latin
  plus the list's own letters). Typed answers ignore case, extra spaces and typographic apostrophes; accents count.
- Word search: automatic grid size (8–16) unless the teacher fixes it; with a fixed size, words longer than the grid
  are left out. Every position is tried in seeded order, so a word is skipped only if it truly cannot fit.
- Crossword: the hidden word is 0–3 letters longer than the asked length; rows are assigned rarest letter first.
  If no layout exists the game reports it instead of producing a broken puzzle.
- Gapfill: the text must have at least 4 gaps and match its gap list one to one, otherwise the game reports it.
  Extra bank words come from the distractors of the gap words and are never an answer anywhere in the text.
- Memory: a list too short for the asked board gets the largest square board it can fill.
- Word search: up to 12 seeded layout attempts; the first one with every word placed wins, otherwise the one that
  placed the most.
- Drowning: water fills in 60 / 40 / 25 seconds (slow / normal / fast); a correct answer drains 20 / 15 / 12 %.

Local preview of all seven games with the sample list: `npm run serve`, then `/dev/preview.html`.

## 7. Access and credits

| What | Condition |
|---|---|
| Analysis (`wordnerd/analyze`) | credit balance (signup gift counts), no subscription needed |
| Editing the list, previewing all games, starting a session, live monitor of a running session | signed-in teacher, free |
| **History**: results of closed sessions, saved list library, restarting from an old list | **Hub pass** (`entitlements.wordnerd` or `entitlements.all` active) |

Data without a Hub pass is kept for 30 days (open question), so a teacher who subscribes later sees earlier work.
Credit prices come from the Hub's `settings/credits` (`"wordnerd/analyze"`, `"wordnerd/enrich"`); numbers are set
by András after testing. No Stripe code in this repo; buying happens on the Hub's `/account`.

## 8. Data model (draft)

Firestore, collections prefixed `wn`. The rules block lives in the Hub's `firestore.rules` between
`// ---- WordNerd` and `// ---- end WordNerd` markers; this repo keeps a copy for the emulators only.

- `wnLists/{listId}` – `ownerUid`, `title`, `topic`, `level`, `targetLang`, `supportLang`, `items[]` (section 5),
  `text` (the new AI text), `source` (`{ kind: text|pdf|image, title, wordCount }`, never the file),
  `createdAt`, `updatedAt`. Owner reads; the analysis function creates; the owner edits allowed fields.
- `wnSessions/{sessionId}` – `ownerUid`, `code`, `listSnapshot` (copy at start, so later edits do not change a
  running set), `games[]` (`{ type, settings }`), `seed`, `status` (open|closed), `expiresAt`, `createdAt`.
- `wnSessions/{sessionId}/players/{anonUid}` – `nickname`, `joinedAt`, `results{ <gameIndex>: { score, max,
  timeMs, completedAt, misses: { <itemId>: n } } }`.
- `wnCodes/{code}` → `sessionId` (function only).
- `users/{uid}` and `creditLedger` belong to the Hub: read only, except the credit spend/refund that the Hub's
  credit pattern prescribes for every app (copy of `shared/credits.js` in `engines/hub/`).

Open: students write their own results through narrow rules (simple, cheap; cheating risk accepted for a
vocabulary practice tool) or through a callable.

## 9. Functions

Codebase `wordnerd`, Node 22, 2nd gen, europe-west1, secrets in Secret Manager.

- `wnAnalyze` (callable, teacher; built in F2) – see "Analysis" below.
- `joinSession` (callable, anonymous) – code check, session open, nickname unique in the session.
- Later: `enrichItem`, cleanup of expired sessions and old data.

### Analysis (F2)

Flow (`functions/analyze.js`, logic in the pure `engines/analysis/`, so it is testable without Firebase):

1. Teacher check (signed in, not anonymous) → `teacher-only` / `sign-in`.
2. Input check (`engines/analysis/input.js`, the same rules run in the browser in F3), before any credit is spent:
   `kind` `text` (40–2500 words, at most 20 000 characters) or `file` (PDF, PNG, JPEG or WebP, base64 in the
   request, at most 4 MB before encoding); `level` A1–C1; `supportLang` from `engines/analysis/languages.js`
   (30 languages); `count` 10–30 (default 20); optional `focus` (120 chars) and `title` (80 chars).
   Target language: English only for now.
3. Credits: `wordnerd/analyze` spent in a transaction (the Hub's pattern) → `insufficient` (with balance and cost)
   or `no-price` (no price in `settings/credits`: never a free call).
4. Model: `gemini-3.8-flash` through the `generateContent` endpoint (the file goes in as an inline part), JSON
   answer bound to `engines/analysis/schema.js`; versioned prompt `engines/analysis/prompt.js` (`analyze-v1`).
   The material is treated as data (prompt-injection guard in the system text). Secret: `WN_GEMINI_API_KEY`.
5. Code checks (`engines/analysis/normalize.js`): bad or duplicate items dropped; a broken example sentence or
   distractor list cleared (the games skip that word); the teacher's count caps the list; ids `w01…`; gapfill
   gaps that do not point at a list word are written into the text and the rest renumbered; at least 8 items and
   4 gaps, else the answer is unusable. One retry after a broken or unusable answer.
6. Success: `wnLists/{id}` written (list + `ownerUid`, `analysis: { promptVersion, model, attempts[] }` with token
   usage per attempt, for pricing), returns `{ listId, cost, warnings }`. Failure after the spend: credits
   refunded; `unsuitable` (the model says the material is not usable, with its reason; no retry),
   `model-unavailable` (stop and tell András), `analysis-failed`.
7. The uploaded file is never stored; it lives only in the request.

Mock model in the emulator (`functions/llm/mock.js`): answers with the sample list; "MOCK:BROKEN",
"MOCK:UNSUITABLE", "MOCK:UNAVAILABLE" in the text trigger the failure paths.

## 10. Brand and UI (decided 2026-11-21)

WordNerd keeps its own look, not the Hub design system (apps have their own brand; only the sign-in panel text and
structure are shared with the Hub).

- **Logo as it is:** `public/img/brand/WordNerd_logo.png` (flat) and `_bump.png` (embossed); vector sources in
  `design/brand-source/` (`.ai`, `.eps`). Never redraw or recolour. An SVG export is still to do.
- **Colours as they were:** dark textured brown board, wooden tabs and panels, amber/orange lettering. Tokens in
  `public/css/tokens.css`, role variables only in `public/css/base.css`.
- **Dashboard modelled on the old one** (`reference/screens/dashboard-empty.jpg`, `dictionary.png`): main panel in
  the middle, wooden tabs on both sides, name bar at the bottom.

  | Old | New |
  |---|---|
  | My dictionary: word list \| word groups \| game picker + "Load exercise" | **My lists**: list editor \| the teacher's lists \| games + settings + "Start session" |
  | My statistics | **Results**: live monitor; History (Hub pass) |
  | Exercise map, Rewards, Skills, Shop, Room | gone; in their place **New list** (upload) and **Sessions** |
  | Name bar: player name, level, XP bar, basket | teacher name, credit balance, "Get credits" (→ Hub `/account`) |

- The old character (Word Nerd figure) is optional decoration at most (empty states, loading).
- Modern, phone-first translation: textures as small repeating images or CSS, side tabs become a bottom bar on
  narrow screens, the three columns stack. The flags, leaves and columns of the old background are not used.
- Old game graphics (`mentés/images/hangman`, `memory_game`, `drowing`) may be reused if they were made for
  WordNerd; third-party images are not.
- UI text in English, sentence case.

## 11. Hosting

- Address: `https://wordnerd.mrandrewshub.com` (decided 2026-11-21).
- No Netlify (decided 2026-11-21): testing happens on the live address, which is fine while the Hub does not list
  WordNerd (the Hub is not advertised before December 2026). The site is `noindex` until launch.
- Static front end on Cloudflare Pages from `main` (build `node scripts/build-web.mjs`, output `dist`), like the Hub
  and Hubbaloo. Open: Cloudflare Pages vs Firebase Hosting (WR, QotD) – decide in F3.
- The Hub must add the origin to `shared/sso.js` `APP_ORIGINS` / `APP_NAMES` and to Firebase Auth authorized
  domains (Hub repo change, F3).

## 12. Phases

Each phase ends with a DEVLOG entry, a demo of what was built and how it was verified, then a stop for approval.

- **F0 Repo** – skeleton, scripts, Hub copies, brand files, placeholder page, SPEC/CLAUDE/DEVLOG, GitHub repo.
- **F1 Game engines** – the seven generators with settings, a fixture word list, tests; a local preview page.
- **F2 Analysis** – JSON schema, versioned prompt, `analyzeText` with credit spend/refund, emulator tests,
  Hub rules block, price row in `settings/credits`.
- **F3 Teacher app** – sign-in and SSO, dashboard in the old layout, upload, list editor, game previews; hosting.
- **F4 Sessions** – start session (code, QR), student join, the seven games playable on a phone, results.
- **F5 Monitor and History** – live monitor with per-word stats, History behind the Hub pass, retention.
- **F6 Launch** – Hub product (`slug: wordnerd`), end-to-end test with a new teacher account, Hub listing.

## 13. Open questions

- **A goal for the whole set (András, 2026-11-21: "later").** Proposal to decide in F4: each game ends with
  1–3 stars from its own result (e.g. memory moves, matching mistakes, crossword rows before the secret word);
  the student sees the set as a path of games with their stars and a total; the teacher's monitor shows the same.
  No accounts, so it lives only inside the session.

- Upload limits: set in F2 as 40–2500 words of text or a 4 MB PDF/image (photo upload included); to revisit after
  real use.
- Price of `wordnerd/analyze`: to set after measuring real token use (stored per list in `analysis.attempts`).
- Manually added word: fill by hand or `wordnerd/enrich` for credits.
- Session expiry; can a closed session be reopened.
- Retention without a Hub pass (30 days?); deleting nicknames (GDPR); the Hub's account deletion must also remove
  WordNerd data.
- Results: narrow client writes or callable.
- Hosting: Cloudflare Pages or Firebase Hosting.
