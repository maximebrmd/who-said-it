# who said it?

A *guess who said what* game played over real WhatsApp group chats. Each round
shows a single message on a 3D chat-bubble card and asks you to guess its author.

Two game modes, chosen on the start screen:

- **Yes / No** — one candidate name is shown; answer whether they really said it.
- **Pick the name** — tap who actually said it from a few plausible candidates.

Both modes share the same round/data logic (which message, who the real author
is); only the answer UI and scoring differ. Score and streak are tracked as you
play.

## Stack

- **Next.js 16 (App Router) + TypeScript + Tailwind CSS 4** — Vercel-ready.
- **React Three Fiber** (`@react-three/fiber` + `@react-three/drei`) for the 3D
  message card. One `<Canvas>`; geometry/material allocated once and animated via
  `useFrame` (no per-frame React state). The Yes/No buttons, name choices and
  score are a plain DOM overlay above the canvas.
- **Supabase Postgres** read at runtime in the browser via `@supabase/supabase-js`
  (anon key, RLS public read-only). The repo is public, so **no real chat content
  is committed** — it lives only in Supabase.

## Run locally

```bash
pnpm install
cp .env.example .env.local   # fill in your Supabase URL + anon key
pnpm dev                     # http://localhost:3000
```

**Without Supabase env set**, the app falls back to a committed **synthetic**
sample chat (made-up names/messages in `lib/game/sample-data.ts`) so it runs and
is testable with no secrets.

Other scripts:

```bash
pnpm build   # production build
pnpm lint    # eslint
pnpm test    # vitest (parser + game logic)
```

## Architecture

```
app/page.tsx              Client page: start screen (mode + chat selector) and game screen
components/MessageCard3D  R3F Canvas + animated 3D chat-bubble card
lib/parser/               WhatsApp .txt export parser (+ unit tests)
lib/game/round.ts         Pure, testable round building + grading (seedable RNG)
lib/game/useGame.ts       Game state hook (score, streak, round queue, prefetch)
lib/game/data.ts          Data source: random message batch from Supabase, or sample fallback
lib/supabase/             Browser client + generated DB types
supabase/migrations/      Schema + RLS migration
scripts/load-chats.ts     Local-only loader: parse data/raw/*.txt -> Supabase
```

The game samples a pseudo-random batch of *playable* messages (long enough, not
emoji-only) for the chosen chat, builds rounds client-side, and prefetches more
as the queue drains.

## Data pipeline (Supabase, via `supabase-axi`)

All Supabase work is done through the `supabase-axi` CLI. Auth is read from the
`SUPABASE_ACCESS_TOKEN` env var:

```bash
export SUPABASE_ACCESS_TOKEN="$(cat ~/.who-said-it-supabase-token)"
supabase-axi whoami
```

1. **Project** — a dedicated free-tier project (`who-said-it`, eu-central-1):

   ```bash
   supabase-axi projects create who-said-it --org <org> --db-password <pw> --region eu-central-1
   supabase-axi link --project-ref <ref>
   ```

2. **Schema + RLS** — applied as a migration. Three tables
   (`chats` → `participants` → `messages`) with FKs, an index for random
   sampling (`rand_key`), RLS enabled, and **anon `SELECT`-only** policies:

   ```bash
   supabase-axi db push
   ```

3. **Load chats** — the raw WhatsApp exports are copied into the gitignored
   `data/raw/` directory, parsed, and loaded via `supabase-axi db query`:

   ```bash
   node scripts/load-chats.ts   # reads data/raw/*.txt, batches INSERTs
   ```

4. **Types** — regenerate the committed TS types after schema changes:

   ```bash
   supabase gen types typescript --linked --schema public > lib/supabase/database.types.ts
   ```

## Privacy

This repo is **public**. The following are never committed (see `.gitignore`):
the raw `.txt` exports, any real parsed chat content, `.env*` files with keys,
and the Supabase access token. Real chat data lives **only** in Supabase, behind
read-only RLS. The committed sample data is entirely synthetic.
