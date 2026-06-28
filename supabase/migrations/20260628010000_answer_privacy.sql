-- who-said-it: close the mid-round answer leak at the Realtime layer
-- ============================================================================
-- The prior hardening migration hid `room_answers.answer` with a column-level
-- GRANT. That closes the REST/PostgREST path, but column GRANTs do NOT strip
-- columns from postgres_changes payloads: the WAL-derived broadcast row carries
-- every column regardless of grants, so a client subscribed directly to
-- room_answers Realtime still receives every player's raw guess mid-round (and,
-- in pick-name, a correct row reveals the author to a late answerer).
--
-- Fix it the same way the per-player token was fixed: move the actual guess into
-- a PRIVATE table that is unreadable by clients AND not in the realtime
-- publication, so it can never ride a broadcast row. `room_answers` keeps only
-- is_correct (safe without the guess: it never reveals the author or the claim
-- truth) plus the metadata the UI needs (who answered).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Private per-answer secret (never published, never granted to clients).
-- ---------------------------------------------------------------------------
create table if not exists public.room_answer_secrets (
  room_id   uuid not null references public.rooms (id) on delete cascade,
  round     int  not null,
  player_id uuid not null references public.room_players (id) on delete cascade,
  answer    text not null,
  primary key (room_id, round, player_id)
);

alter table public.room_answer_secrets enable row level security;
-- No policy + revoked grant → anon/authenticated cannot read it at all. It is
-- deliberately NOT added to the supabase_realtime publication.
revoke all on public.room_answer_secrets from anon, authenticated;

-- Backfill the guesses for any answers that already exist.
insert into public.room_answer_secrets (room_id, round, player_id, answer)
  select room_id, round, player_id, answer from public.room_answers
  on conflict (room_id, round, player_id) do nothing;

-- ---------------------------------------------------------------------------
-- submit_answer: write the guess to the private table; room_answers no longer
-- carries it. Insert the verdict row first, and only on a genuinely new row
-- (FOUND) record the secret guess, score, and run the all-answered reveal check.
-- ---------------------------------------------------------------------------
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
      (select a.is_correct from room_answers a
        where a.room_id = p_room_id and a.round = p_round and a.player_id = p_player_id),
      false);
  end if;

  select * into v_r from room_rounds where room_id = p_room_id and round = p_round;
  if v_room.mode = 'yes-no' then
    v_correct := (lower(p_answer) = 'yes') = v_r.claim_is_true;
  else
    v_correct := (p_answer = v_r.author);
  end if;

  insert into room_answers (room_id, round, player_id, is_correct)
    values (p_room_id, p_round, p_player_id, v_correct)
    on conflict (room_id, round, player_id) do nothing;
  if not found then
    return v_correct; -- already answered; don't double-score
  end if;

  insert into room_answer_secrets (room_id, round, player_id, answer)
    values (p_room_id, p_round, p_player_id, p_answer)
    on conflict (room_id, round, player_id) do nothing;

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
-- The guess column is now redundant; drop it so it can never be broadcast.
-- is_correct stays in room_answers (and is broadcast), which is safe: without
-- the guess it never reveals the author or the claim truth.
-- ---------------------------------------------------------------------------
alter table public.room_answers drop column answer;
