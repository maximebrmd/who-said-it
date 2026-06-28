# Project agent memory

`who-said-it` — a "guess who said what" game over real WhatsApp group chats.
Next.js 16 (App Router) + TS + Tailwind 4, React Three Fiber for the 3D message
card, Supabase Postgres read at runtime via the anon key.

## Build / test / run

- Package manager: **pnpm**. `pnpm dev | build | lint | test` (test = vitest).
- Tests are pure-logic only (parser + game), `environment: node`, no secrets.
- **pnpm 11 build-scripts gotcha:** `pnpm-workspace.yaml` must contain
  `allowBuilds: { sharp: true, unrs-resolver: true, esbuild: true }`. Without
  explicit `true` values, pnpm re-injects a placeholder block and the
  `verify-deps-before-run` pre-script hook fails any `pnpm <script>` with
  `ERR_PNPM_IGNORED_BUILDS`. Do not "clean up" that block to `onlyBuiltDependencies`.
- `tsconfig.json` has `allowImportingTsExtensions: true` so `scripts/load-chats.ts`
  can `import ... from "./x.ts"` and still run under `node` (Node 26 strips types).

## Architecture

- `lib/parser/` — WhatsApp `.txt` export parser. A line is a message **iff** it is
  `[ts] Sender: body`; anything else after a `[ts]` (encryption notice, "X added Y",
  media placeholders, etc.) is treated as a system line and dropped while still
  terminating the previous (multi-line) message. Timestamps parsed as UTC for
  deterministic tests. **Attached media** (`image omitted`, `<Media omitted>`,
  etc.) is stripped in-place (`stripMediaMarkers`); the message is dropped unless
  a substantial caption (≥8 letters) remains. **Links/locations are strict**:
  `containsLink` drops ANY message with a URL/bare-domain/map/location-pin (no
  incidental-link keeping — they aren't guessable). Sender names are normalised to a
  **title-cased first name** (`cleanFirstName`: strips `~`, parenthetical tags,
  emoji/non-Latin decorations, joke suffixes like "Big Ass"); within a chat,
  first-name clashes are disambiguated minimally (last initial → tag → number),
  e.g. redbar has `Luca` and `Luca (Average)`.
- `lib/game/round.ts` — pure round building + grading, takes an injectable
  `Rng` so logic is unit-tested deterministically. `useGame.ts` holds score/streak
  and a prefetched message queue (refills from `data.ts`).
- `lib/game/data.ts` — abstracts the data source: Supabase random batch (indexed
  `rand_key` cursor + wrap) when configured, else the committed synthetic
  `sample-data.ts`. App is fully runnable with **no** env set.
- `components/MessageCard3D.tsx` — single `<Canvas>`, the card mesh + drei `<Text>`,
  animated only via `useFrame` (no per-frame setState, no in-frame allocations).
  The card is keyed by message id so the enter animation replays each round.
  Timing uses a per-card **`THREE.Timer`** (replacing the deprecated `THREE.Clock`).
  **In three 0.185 `Timer` is in core** — `import { Timer } from "three"`, NOT
  `three/addons/misc/Timer.js` (that path no longer exists this version).
- Game-screen layout uses `h-dvh` + `flex-1 min-h-0` so the R3F Canvas gets a
  resolvable height (with `min-h-dvh` the canvas collapses to a tiny strip).
- **Visual theme** is a bright "Use Your Words"-style party-game look (Fredoka
  display font, saturated purple/magenta/teal/yellow, chunky `border-b` 3D
  buttons). Celebratory feedback on a correct answer: self-contained DOM/CSS
  `components/Confetti.tsx` (no dep; seeded mulberry32 PRNG so render is pure —
  `Math.random` in render trips the `react-hooks/purity` lint rule) + a guarded
  WebAudio chime in `lib/game/sound.ts`, fired inside the click gesture.

## Multiplayer rooms (Supabase Realtime)

- Additive mode under `app/rooms/` (`/rooms` join/create landing, `/rooms/new`
  create form, `/rooms/[code]` lobby+game+results). Solo (`app/page.tsx`) is
  unchanged and still runs with **no env**. Multiplayer **requires** Supabase.
- **Rounds are pre-generated client-side by the creator** (reusing `buildRound`)
  and stored in a **private** `room_rounds` table (no anon access) so clients
  can't read upcoming authors. The public `rooms` row mirrors only the *current*
  round's question; `round_message_author` is filled **only on reveal**.
- **All writes go through `SECURITY DEFINER` RPCs** (`create_room`, `join_room`,
  `start_room`, `submit_answer`, `advance_room`, `reconcile_room`, `heartbeat`);
  base tables grant anon **SELECT only**. `submit_answer` grades server-side (no
  client self-score) and flips to reveal when `answers == active players` (active
  = `last_seen` within 30s, kept fresh by `heartbeat`). `advance_room` is
  **idempotent** (locks the room, only advances from a reveal **after a 3s
  server-side minimum reveal window** — deliberately shorter than the client's
  `REVEAL_MS` 4000ms so the legit advance always passes but an attacker can't
  truncate the reveal to zero), so every client schedules it after the reveal
  delay and the first caller wins — no host clicking, no host dependency.
  `reconcile_room` re-runs the all-answered reveal check so a round can't stall
  if a player disconnects after everyone else has answered (the ghost ages out of
  the 30s window); any still-present client nudges it. Per-player secret `token`
  (returned by join) lives in a **private `room_player_secrets` table** (no anon
  grant, not in the realtime publication, so it can never ride a broadcast row)
  and authorizes submit/heartbeat/start. The submitted guess is likewise moved to
  a private **`room_answer_secrets`** table; `room_answers` keeps only
  `is_correct` + who answered (the `answer` column is dropped) so a late answerer
  can't read earlier guesses off `postgres_changes`. `lib/game/rooms.ts` = pure
  `buildRoundsPayload` (unit-tested) + RPC wrappers + sessionStorage identity;
  `lib/game/useRoom.ts` = realtime subscriptions + presence + heartbeat + advance
  + reconcile.
- **Realtime needs the JWT `anon` key, NOT a `sb_publishable_…` key.** PostgREST
  reads + RPCs work with either, but `postgres_changes` is silently delivered to
  nobody with a publishable key — Realtime needs the role claim in the JWT to run
  the RLS check. Use the legacy `anon` JWT in `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
- **Give each Realtime channel a unique topic** (`room:<id>:<seq>` via a module
  counter in `useRoom`). React StrictMode double-mounts the effect; two channels
  with the *same* topic on the shared client collide (the re-subscribe races the
  async teardown) and one tab silently stops receiving `postgres_changes`.
- `supabase-axi gen types typescript` **wraps** its output in a YAML-ish envelope
  (`types: "…\n…"`, truncated unless `--full`); it does **not** write raw TS. To
  regenerate `database.types.ts`, capture `--full` and JSON-unescape the `types:`
  string (see git history) — don't redirect it straight to the file.

## Supabase data pipeline

- All Supabase work via the **`supabase-axi`** CLI (not raw psql). Auth:
  `export SUPABASE_ACCESS_TOKEN="$(cat ~/.who-said-it-supabase-token)"`.
- Project ref lives in `supabase/config.toml` / `.temp/`. Schema is a migration
  (`supabase-axi db push`); data loaded with `node scripts/load-chats.ts` which
  batches `supabase-axi db query` INSERTs (200 msgs/call) and is idempotent
  (deletes the chat by slug first; cascades).
- Regenerate types after schema changes:
  `supabase gen types typescript --linked --schema public > lib/supabase/database.types.ts`.

## Privacy (public repo)

Never commit: raw `.txt` exports, real parsed chat content, `.env*` with keys, the
Supabase token. `data/raw/` is gitignored; `.env.example` is the one committed env
file. Real chats live only in Supabase behind anon-`SELECT`-only RLS. Committed
sample data is synthetic.
