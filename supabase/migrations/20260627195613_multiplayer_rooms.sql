-- who-said-it: real-time multiplayer rooms
-- ============================================================================
-- An OPEN/public party game: anyone can create or join a room (no accounts —
-- a player is just a name + a per-session secret token). All shared game state
-- lives in Postgres and is streamed to clients via Supabase Realtime.
--
-- Design notes
-- ------------
-- * Rounds are pre-generated CLIENT-SIDE by the room creator (reusing the same
--   buildRound logic as single-player) and stored in the PRIVATE `room_rounds`
--   table — which has NO anon SELECT, so clients can never read the answers
--   ahead of time. The public `rooms` row mirrors only the CURRENT round's
--   *question* (body + claim/choices); the true author is written into
--   `round_message_author` ONLY when the round flips to 'reveal'.
-- * ALL writes go through SECURITY DEFINER RPCs (create/join/start/submit/
--   advance/heartbeat). The base tables grant anon SELECT only (RLS), so a
--   client cannot tamper with scores or round state directly. Correctness is
--   computed server-side inside submit_answer, so a client cannot inflate its
--   own score. join_room returns a per-player `token`; submit/heartbeat/start
--   require it, so a client cannot act as another player. The token column is
--   hidden from anon via column-level GRANTs.
-- * Auto-advance: when the number of answers for the current round reaches the
--   number of ACTIVE players (seen within 30s), submit_answer flips the round
--   to 'reveal'. Each client then calls advance_room after a short reveal
--   delay; advance_room locks the room row and only advances from 'reveal', so
--   it is idempotent — the first caller wins and the rest are no-ops. No host
--   clicking is required and the game does not depend on the host staying online.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table if not exists public.rooms (
  id           uuid primary key default gen_random_uuid(),
  code         text not null unique,
  mode         text not null check (mode in ('yes-no', 'pick-name')),
  chat_label   text not null default 'Group chat',
  status       text not null default 'lobby' check (status in ('lobby', 'playing', 'finished')),
  total_rounds int  not null default 10,
  current_round int not null default 0,
  round_phase  text not null default 'answering' check (round_phase in ('answering', 'reveal')),
  reveal_at    timestamptz,
  -- Public question fields for the current round (author hidden until reveal).
  round_message_id     text,
  round_message_body   text,
  round_claim          text,   -- yes-no: the claimed author shown to players
  round_choices        jsonb,  -- pick-name: shuffled candidate names
  round_message_author text,   -- NULL during 'answering'; set on 'reveal'
  created_at   timestamptz not null default now()
);

create table if not exists public.room_players (
  id        uuid primary key default gen_random_uuid(),
  room_id   uuid not null references public.rooms (id) on delete cascade,
  name      text not null,
  score     int  not null default 0,
  is_host   boolean not null default false,
  token     uuid not null default gen_random_uuid(),
  joined_at timestamptz not null default now(),
  last_seen timestamptz not null default now()
);
create index if not exists room_players_room_idx on public.room_players (room_id);

-- Private precomputed rounds (hold the true author / answer). NOT readable by
-- anon — only the SECURITY DEFINER RPCs touch this table.
create table if not exists public.room_rounds (
  room_id       uuid not null references public.rooms (id) on delete cascade,
  round         int  not null,
  message_id    text not null,
  body          text not null,
  author        text not null,
  claim         text,     -- yes-no
  claim_is_true boolean,  -- yes-no
  choices       jsonb,    -- pick-name
  primary key (room_id, round)
);

create table if not exists public.room_answers (
  id          uuid primary key default gen_random_uuid(),
  room_id     uuid not null references public.rooms (id) on delete cascade,
  round       int  not null,
  player_id   uuid not null references public.room_players (id) on delete cascade,
  answer      text not null,
  is_correct  boolean not null,
  answered_at timestamptz not null default now(),
  unique (room_id, round, player_id)
);
create index if not exists room_answers_room_round_idx on public.room_answers (room_id, round);

-- ---------------------------------------------------------------------------
-- Row Level Security + grants
-- ---------------------------------------------------------------------------

alter table public.rooms         enable row level security;
alter table public.room_players  enable row level security;
alter table public.room_rounds   enable row level security;
alter table public.room_answers  enable row level security;

-- rooms, room_answers: public read; all writes via SECURITY DEFINER RPCs.
drop policy if exists "read rooms" on public.rooms;
create policy "read rooms" on public.rooms
  for select to anon, authenticated using (true);

drop policy if exists "read room_answers" on public.room_answers;
create policy "read room_answers" on public.room_answers
  for select to anon, authenticated using (true);

-- room_players: public read of every column EXCEPT `token`. Column-level GRANTs
-- keep the secret token server-only while still allowing the lobby/leaderboard
-- to read names + scores. Writes go through RPCs.
drop policy if exists "read room_players" on public.room_players;
create policy "read room_players" on public.room_players
  for select to anon, authenticated using (true);

revoke select on public.room_players from anon, authenticated;
grant select (id, room_id, name, score, is_host, joined_at, last_seen)
  on public.room_players to anon, authenticated;

-- room_rounds: PRIVATE. No SELECT policy + revoked grant → anon cannot read it.
revoke all on public.room_rounds from anon, authenticated;

-- ---------------------------------------------------------------------------
-- Realtime: stream these tables to subscribed clients.
-- ---------------------------------------------------------------------------
do $$
begin
  alter publication supabase_realtime add table public.rooms;
exception when duplicate_object then null;
end $$;
do $$
begin
  alter publication supabase_realtime add table public.room_players;
exception when duplicate_object then null;
end $$;
do $$
begin
  alter publication supabase_realtime add table public.room_answers;
exception when duplicate_object then null;
end $$;

-- ---------------------------------------------------------------------------
-- Functions (all SECURITY DEFINER, owned by the migration role)
-- ---------------------------------------------------------------------------

-- Generate a short, unambiguous, unique room code (no 0/O/1/I/L).
create or replace function public.gen_room_code()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  alphabet text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  v_code text;
  i int;
begin
  loop
    v_code := '';
    for i in 1..6 loop
      v_code := v_code || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
    end loop;
    exit when not exists (select 1 from public.rooms r where r.code = v_code);
  end loop;
  return v_code;
end;
$$;

-- Create a room with its full set of pre-generated rounds, plus the host player.
create or replace function public.create_room(
  p_mode        text,
  p_chat_label  text,
  p_total_rounds int,
  p_host_name   text,
  p_rounds      jsonb  -- array of {message_id, body, author, claim?, claim_is_true?, choices?}
)
returns table (room_id uuid, code text, player_id uuid, token uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_room_id uuid;
  v_code text;
  v_player_id uuid;
  v_token uuid;
  v_count int;
  r jsonb;
  idx int := 0;
begin
  if p_mode not in ('yes-no', 'pick-name') then
    raise exception 'invalid mode';
  end if;
  if p_rounds is null or jsonb_typeof(p_rounds) <> 'array' or jsonb_array_length(p_rounds) = 0 then
    raise exception 'rounds required';
  end if;
  v_count := jsonb_array_length(p_rounds);

  v_code := gen_room_code();
  insert into rooms (code, mode, chat_label, total_rounds, status)
    values (
      v_code, p_mode,
      coalesce(nullif(trim(p_chat_label), ''), 'Group chat'),
      least(greatest(coalesce(p_total_rounds, v_count), 1), v_count),
      'lobby'
    )
    returning id into v_room_id;

  for r in select * from jsonb_array_elements(p_rounds) loop
    idx := idx + 1;
    insert into room_rounds (room_id, round, message_id, body, author, claim, claim_is_true, choices)
      values (
        v_room_id, idx,
        r ->> 'message_id', r ->> 'body', r ->> 'author',
        r ->> 'claim', (r ->> 'claim_is_true')::boolean, r -> 'choices'
      );
  end loop;

  insert into room_players (room_id, name, is_host)
    values (v_room_id, coalesce(nullif(trim(p_host_name), ''), 'Host'), true)
    returning id, room_players.token into v_player_id, v_token;

  return query select v_room_id, v_code, v_player_id, v_token;
end;
$$;

-- Join an existing room that is still in the lobby.
create or replace function public.join_room(p_code text, p_name text)
returns table (room_id uuid, player_id uuid, token uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_room rooms;
  v_player_id uuid;
  v_token uuid;
begin
  select * into v_room from rooms where code = upper(trim(p_code));
  if not found then
    raise exception 'room not found';
  end if;
  if v_room.status <> 'lobby' then
    raise exception 'game already started';
  end if;

  insert into room_players (room_id, name)
    values (v_room.id, coalesce(nullif(trim(p_name), ''), 'Player'))
    returning id, room_players.token into v_player_id, v_token;

  return query select v_room.id, v_player_id, v_token;
end;
$$;

-- Keep a player marked active (drives the "all answered" check).
create or replace function public.heartbeat(p_player_id uuid, p_token uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update room_players set last_seen = now()
    where id = p_player_id and token = p_token;
end;
$$;

-- Host starts the game: flip to 'playing' and activate round 1.
create or replace function public.start_room(p_room_id uuid, p_player_id uuid, p_token uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_is_host boolean;
  v_status text;
  v_r room_rounds;
begin
  select is_host into v_is_host
    from room_players
    where id = p_player_id and token = p_token and room_id = p_room_id;
  if not coalesce(v_is_host, false) then
    raise exception 'only the host can start the game';
  end if;

  select status into v_status from rooms where id = p_room_id for update;
  if v_status is distinct from 'lobby' then
    return; -- idempotent
  end if;

  select * into v_r from room_rounds where room_id = p_room_id and round = 1;
  update rooms set
    status = 'playing', current_round = 1, round_phase = 'answering', reveal_at = null,
    round_message_id = v_r.message_id, round_message_body = v_r.body,
    round_claim = v_r.claim, round_choices = v_r.choices, round_message_author = null
    where id = p_room_id;
end;
$$;

-- Submit a player's answer for a round. Grades server-side, scores once, and
-- flips the round to 'reveal' once every active player has answered.
create or replace function public.submit_answer(
  p_room_id   uuid,
  p_player_id uuid,
  p_token     uuid,
  p_round     int,
  p_answer    text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_room rooms;
  v_r room_rounds;
  v_correct boolean;
  v_active int;
  v_answered int;
begin
  -- Validate player + token, and refresh their activity.
  update room_players set last_seen = now()
    where id = p_player_id and token = p_token and room_id = p_room_id;
  if not found then
    raise exception 'invalid player';
  end if;

  select * into v_room from rooms where id = p_room_id for update;
  if v_room.status <> 'playing'
     or v_room.round_phase <> 'answering'
     or v_room.current_round <> p_round then
    -- Stale or duplicate submit: return the prior verdict if any.
    return coalesce(
      (select is_correct from room_answers
        where room_id = p_room_id and round = p_round and player_id = p_player_id),
      false);
  end if;

  select * into v_r from room_rounds where room_id = p_room_id and round = p_round;
  if v_room.mode = 'yes-no' then
    v_correct := (lower(p_answer) = 'yes') = v_r.claim_is_true;
  else
    v_correct := (p_answer = v_r.author);
  end if;

  insert into room_answers (room_id, round, player_id, answer, is_correct)
    values (p_room_id, p_round, p_player_id, p_answer, v_correct)
    on conflict (room_id, round, player_id) do nothing;
  if not found then
    return v_correct; -- already answered; don't double-score
  end if;

  if v_correct then
    update room_players set score = score + 1 where id = p_player_id;
  end if;

  select count(*) into v_active from room_players
    where room_id = p_room_id and last_seen > now() - interval '30 seconds';
  select count(*) into v_answered from room_answers
    where room_id = p_room_id and round = p_round;

  if v_answered >= v_active then
    update rooms set
      round_phase = 'reveal', reveal_at = now(), round_message_author = v_r.author
      where id = p_room_id and current_round = p_round and round_phase = 'answering';
  end if;

  return v_correct;
end;
$$;

-- Advance from a revealed round to the next one (or finish). Idempotent: only
-- advances from 'reveal', so any client can call it safely after the reveal delay.
create or replace function public.advance_room(p_room_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_room rooms;
  v_next int;
  v_r room_rounds;
begin
  select * into v_room from rooms where id = p_room_id for update;
  if v_room.status <> 'playing' or v_room.round_phase <> 'reveal' then
    return; -- idempotent
  end if;

  v_next := v_room.current_round + 1;
  if v_next > v_room.total_rounds then
    update rooms set status = 'finished' where id = p_room_id;
    return;
  end if;

  select * into v_r from room_rounds where room_id = p_room_id and round = v_next;
  if not found then
    update rooms set status = 'finished' where id = p_room_id;
    return;
  end if;

  update rooms set
    current_round = v_next, round_phase = 'answering', reveal_at = null,
    round_message_id = v_r.message_id, round_message_body = v_r.body,
    round_claim = v_r.claim, round_choices = v_r.choices, round_message_author = null
    where id = p_room_id;
end;
$$;

-- Expose the player-facing RPCs to the anon role. gen_room_code stays internal.
revoke all on function public.gen_room_code() from anon, authenticated;
grant execute on function
  public.create_room(text, text, int, text, jsonb),
  public.join_room(text, text),
  public.heartbeat(uuid, uuid),
  public.start_room(uuid, uuid, uuid),
  public.submit_answer(uuid, uuid, uuid, int, text),
  public.advance_room(uuid)
  to anon, authenticated;
