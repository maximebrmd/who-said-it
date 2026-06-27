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
