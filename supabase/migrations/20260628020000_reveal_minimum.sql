-- Enforce a minimum reveal duration server-side. advance_room is anon-callable
-- with only p_room_id (any visitor who knows the room code can obtain it from
-- the public rooms read), so without a time check anyone could call it the
-- instant a round flips to 'reveal' and truncate the 4s reveal to zero for every
-- player — nobody would see the author. The guard below requires that at least 3
-- seconds have elapsed since reveal_at before advancing.
--
-- Client/server coupling: the client REVEAL_MS constant is 4000ms (the delay
-- after which every client schedules advance_room). The server minimum is 3s,
-- deliberately SHORTER than REVEAL_MS so the legitimate client advance always
-- passes, while an attacker calling immediately is blocked until ~3s of reveal
-- has been shown to everyone. Keep server 3s < client REVEAL_MS 4000ms.
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

  -- Server-side minimum reveal window (3s < client REVEAL_MS 4000ms).
  if v_room.reveal_at is null or now() < v_room.reveal_at + interval '3 seconds' then
    return;
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
