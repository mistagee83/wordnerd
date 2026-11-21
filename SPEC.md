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
| `example` = `{ text, answer }` (new sentence with exactly one `___` gap, and the exact form that fills it) | gapfill | `{ text: "Who will ___ the dog while we're away?", answer: "look after" }` |
| `distractors[3]` (same form as `example.answer`) | gapfill options, later quiz | take after, look for, look into |
| `family` | later: word formation | care, careful, careless |
| `synonyms`, `antonyms` | later: matching variants, odd one out | take care of |
| `category` (group inside the list) | later: assigning, odd one out | family / people |

List level: `title`, `topic`, `level`, `targetLang`, `supportLang`, and a **new short AI-written text** using the
chosen words (later: cloze). New text, not a copy of the source: copyright, and the gaps fall on list words.

**Languages.** Start: target language English, support language chosen by the teacher. The schema has no language
in field names. Adding target languages later stays cheap if: the prompt is parameterised; the letter games (word
search, hangman, crossword) handle letters through one per-language helper (alphabet, diacritics, upper case,
spaces and hyphens in expressions); language-specific fields (e.g. German article/gender) are optional extensions.

## 6. Games

All deterministic (list + settings + seed). First version (decided 2026-11-21): seven games.

| Game | Mono/bilingual | Source fields | Teacher settings (from the old skill tree) |
|---|---|---|---|
| Memory | both | term ↔ translation / definition | pairs (8 → 12), card flip time |
| Matching | both | term ↔ translation / definition | pairs (10 →) |
| Word search | both (clue: translation or definition) | term | grid size, directions (diagonal, backwards), number of words |
| Crossword (hidden word) | both | term + definition / translation | hidden word length (7 →), number of reveal helps |
| Hangman | both | term (+ clue) | drawing parts (12 → fewer) |
| Gapfill | monolingual | example + distractors | with options or free typing |
| Drowning (type against rising water) | bilingual | translation → term | water speed |

Later (fields already exist, no new analysis needed): quiz, anagrams, Oxford minute, cloze text, odd one out,
assigning, word formation.

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
- Gapfill: an item without exactly one gap, or (in options mode) without three distinct distractors, is skipped.
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

- `analyzeText` (callable, teacher) – size checks, credit spend, Gemini (`gemini-3.8-flash`; never change the
  name on your own; if unavailable, stop and ask), schema validation, refund on error, writes `wnLists`.
- `joinSession` (callable, anonymous) – code check, session open, nickname unique in the session.
- Later: `enrichItem`, cleanup of expired sessions and old data.

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

- Upload limits exactly (MB, words); photo upload in the first version or later.
- Manually added word: fill by hand or `wordnerd/enrich` for credits.
- Session expiry; can a closed session be reopened.
- Retention without a Hub pass (30 days?); deleting nicknames (GDPR); the Hub's account deletion must also remove
  WordNerd data.
- Results: narrow client writes or callable.
- Hosting: Cloudflare Pages or Firebase Hosting.
