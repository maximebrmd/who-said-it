-- who-said-it: core schema
-- Read-only public game over imported WhatsApp group chats.
-- Three tables: chats -> participants -> messages.
-- RLS is enabled with public (anon) SELECT only; no anon writes.

create table if not exists public.chats (
  id   uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null
);

create table if not exists public.participants (
  id           uuid primary key default gen_random_uuid(),
  chat_id      uuid not null references public.chats (id) on delete cascade,
  display_name text not null,
  unique (chat_id, display_name)
);

create table if not exists public.messages (
  id             uuid primary key default gen_random_uuid(),
  chat_id        uuid not null references public.chats (id) on delete cascade,
  participant_id uuid not null references public.participants (id) on delete cascade,
  body           text not null,
  sent_at        timestamptz not null,
  seq            integer not null,
  unique (chat_id, seq)
);

-- Lookups by chat (the game samples within a single chat).
create index if not exists messages_chat_id_idx on public.messages (chat_id);
create index if not exists participants_chat_id_idx on public.participants (chat_id);

-- Random sampling support: a stable, indexable random key per message so the
-- client can fetch a pseudo-random batch with `order by rand_key` + a cursor.
alter table public.messages
  add column if not exists rand_key double precision not null default random();

create index if not exists messages_rand_key_idx on public.messages (chat_id, rand_key);

-- Row Level Security: public read-only game. Enable RLS, grant anon SELECT only.
alter table public.chats        enable row level security;
alter table public.participants enable row level security;
alter table public.messages     enable row level security;

drop policy if exists "Public read chats" on public.chats;
create policy "Public read chats"
  on public.chats for select
  to anon, authenticated
  using (true);

drop policy if exists "Public read participants" on public.participants;
create policy "Public read participants"
  on public.participants for select
  to anon, authenticated
  using (true);

drop policy if exists "Public read messages" on public.messages;
create policy "Public read messages"
  on public.messages for select
  to anon, authenticated
  using (true);
