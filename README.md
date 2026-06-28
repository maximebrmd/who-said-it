# who said it?

A *guess who said what* game played over real WhatsApp group chats. Each round
shows a single message on a 3D chat-bubble card and asks you to guess its author.

Two game modes, chosen on the start screen:

- **Yes / No** — one candidate name is shown; answer whether they really said it.
- **Pick the name** — tap who actually said it from a few plausible candidates.

Both modes share the same round/data logic (which message, who the real author
is); only the answer UI and scoring differ. Score and streak are tracked as you
play.

Play **solo**, or **with friends** in a real-time room (join by code / link,
synchronized rounds, live leaderboard) — see [Multiplayer rooms](#multiplayer-rooms).

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
app/page.tsx              Client page: solo start screen (mode + chat selector) and game screen
app/rooms/                Multiplayer: landing (create/join), create form, /rooms/[code] room
components/MessageCard3D  R3F Canvas + animated 3D chat-bubble card
components/PartyButton    Shared party-game button + palette (solo + rooms)
lib/parser/               WhatsApp .txt export parser (+ unit tests)
lib/game/round.ts         Pure, testable round building + grading (seedable RNG)
lib/game/useGame.ts       Solo game state hook (score, streak, round queue, prefetch)
lib/game/rooms.ts         Multiplayer: pre-generate rounds (tested) + RPC wrappers + identity
lib/game/useRoom.ts       Realtime room hook (subscriptions, presence, heartbeat, auto-advance)
lib/game/data.ts          Data source: random message batch from Supabase, or sample fallback
lib/supabase/             Browser client + generated DB types
supabase/migrations/      Schema + RLS migrations (single-player + multiplayer rooms)
scripts/load-chats.ts     Local-only loader: parse data/raw/*.txt -> Supabase
```

The game samples a pseudo-random batch of *playable* messages (long enough, not
emoji-only) for the chosen chat, builds rounds client-side, and prefetches more
as the queue drains.

## Multiplayer rooms

Anyone can spin up a room and play the same chat together in real time — no
accounts (a player is just a name per browser session). It's an additive mode:
solo play still works with no env and no Supabase.

**How it works**

- **Create** (`/rooms/new`) picks a name, mode, and chat. The creator's browser
  pre-generates all rounds (reusing the same `buildRound` logic as solo) and
  stores them; the host gets a short **room code** + shareable link
  (`/rooms/<CODE>`).
- **Join** by entering the code or opening the link, then picking a name.
- The **lobby** shows who's joined (with online dots via Realtime Presence). The
  host **starts** the game.
- **Synchronized rounds:** the current round's message + candidates are shared
  room state, so every client renders identically. Each player answers; the UI
  shows who has answered, then reveals who was right once everyone has answered.
- **Auto-advance:** when `answers == active players`, the round flips to a reveal,
  and after a short delay it advances automatically — **no host clicking**. A
  fixed `ROUNDS_PER_GAME` (default 10) then ends in a **final leaderboard**.
- A **live leaderboard** updates in real time as rounds resolve.

**Tech.** Supabase Realtime — Presence for who's online, and `postgres_changes`
on `rooms` / `room_players` / `room_answers` so every client reacts to joins,
answers, round advances, and score updates. Requires Supabase configured (the
**JWT `anon` key**, not a publishable key — Realtime needs the role claim for
RLS-scoped `postgres_changes`).

**Data model & RLS** (see `supabase/migrations/*_multiplayer_rooms.sql`):
`rooms` (code, mode, status, current round + the round's question), `room_players`
(name, score, per-session token), `room_answers` (one row per player/round), and
a **private** `room_rounds` holding the true authors (no anon access, so answers
can't be read ahead). **All writes go through `SECURITY DEFINER` RPCs** —
`create_room`, `join_room`, `start_room`, `submit_answer`, `advance_room`,
`heartbeat`. Base tables grant anon **SELECT only**, so clients can't tamper with
scores or round state; `submit_answer` grades server-side (no self-scoring), the
secret `token` is hidden via column grants, and `advance_room` is idempotent
(locks the room, only advances from a reveal) so any client can safely trigger it.

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
