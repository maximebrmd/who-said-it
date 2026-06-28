-- who-said-it: multiplayer hardening
-- ============================================================================
-- Two follow-up fixes to the multiplayer rooms feature:
--
-- 1. Move the per-player secret `token` out of `room_players` (which is in the
--    supabase_realtime publication) into a PRIVATE `room_player_secrets` table
--    that is unreadable by clients and NOT broadcast over Realtime. The old
--    column-level GRANT kept PostgREST from returning the token, but a client
--    subscribing directly to postgres_changes could read the raw row payload.
--    With the token in a separate, un-published, un-granted table, it can never
--    ride a broadcast row.
--
-- 2. A round could stall forever: the answered >= active-players reveal check
--    only ran inside submit_answer. If a player disconnects after everyone else
--    has answered, nothing re-evaluates the condition once the ghost ages out of
--    the 30s active window. `reconcile_room` lets any still-present client nudge
--    the room into 'reveal' when the active players have all answered.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Private per-player secrets (never published, never granted to clients).
-- ---------------------------------------------------------------------------
create table if not exists public.room_player_secrets (
  player_id uuid primary key references public.room_players (id) on delete cascade,
  token     uuid not null default gen_random_uuid()
);

alter table public.room_player_secrets enable row level security;
-- No policy + revoked grant → anon/authenticated cannot read it at all. It is
-- deliberately NOT added to the supabase_realtime publication.
revoke all on public.room_player_secrets from anon, authenticated;

-- Backfill secrets for any players that already exist.
insert into public.room_player_secrets (player_id, token)
  select id, token from public.room_players
  on conflict (player_id) do nothing;

-- ---------------------------------------------------------------------------
-- Recreate every RPC that touched room_players.token so it uses the new table.
-- Argument signatures are unchanged so database.types.ts Functions stay valid.
-- ---------------------------------------------------------------------------

-- create_room: insert the host, then mint their secret token in the new table.
create or replace function public.create_room(
  p_mode        text,
  p_chat_label  text,
  p_total_rounds int,
  p_host_name   text,
  p_rounds      jsonb
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
    returning id into v_player_id;
  insert into room_player_secrets (player_id)
    values (v_player_id)
    returning token into v_token;

  return query select v_room_id, v_code, v_player_id, v_token;
end;
$$;

-- join_room: insert the player, then mint their secret token in the new table.
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
    returning id into v_player_id;
  insert into room_player_secrets (player_id)
    values (v_player_id)
    returning token into v_token;

  return query select v_room.id, v_player_id, v_token;
end;
$$;

-- heartbeat: validate the token against the secrets table.
create or replace function public.heartbeat(p_player_id uuid, p_token uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update room_players set last_seen = now()
    where id = p_player_id
      and exists (
        select 1 from room_player_secrets s
        where s.player_id = p_player_id and s.token = p_token
      );
end;
$$;

-- start_room: validate the host token against the secrets table.
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
  select rp.is_host into v_is_host
    from room_players rp
    join room_player_secrets s on s.player_id = rp.id
    where rp.id = p_player_id and s.token = p_token and rp.room_id = p_room_id;
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

-- submit_answer: validate the token against the secrets table.
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
    where id = p_player_id and room_id = p_room_id
      and exists (
        select 1 from room_player_secrets s
        where s.player_id = p_player_id and s.token = p_token
      );
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

-- ---------------------------------------------------------------------------
-- The token column is now redundant; drop it so it can never be broadcast.
-- ---------------------------------------------------------------------------
alter table public.room_players drop column token;

-- ---------------------------------------------------------------------------
-- reconcile_room: re-evaluate the all-answered reveal check so a round can
-- recover when a player disconnects after everyone else has answered (the ghost
-- ages out of the 30s active window). Mirrors the reveal tail of submit_answer.
-- Idempotent and safe for any still-present client to call periodically.
-- ---------------------------------------------------------------------------
create or replace function public.reconcile_room(p_room_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_room rooms;
  v_active int;
  v_answered int;
  v_author text;
begin
  select * into v_room from rooms where id = p_room_id for update;
  if not found
     or v_room.status <> 'playing'
     or v_room.round_phase <> 'answering' then
    return;
  end if;

  select count(*) into v_active from room_players
    where room_id = p_room_id and last_seen > now() - interval '30 seconds';
  select count(*) into v_answered from room_answers
    where room_id = p_room_id and round = v_room.current_round;

  if v_answered >= v_active then
    select author into v_author from room_rounds
      where room_id = p_room_id and round = v_room.current_round;
    update rooms set
      round_phase = 'reveal', reveal_at = now(), round_message_author = v_author
      where id = p_room_id and current_round = v_room.current_round and round_phase = 'answering';
  end if;
end;
$$;

grant execute on function public.reconcile_room(uuid) to anon, authenticated;
