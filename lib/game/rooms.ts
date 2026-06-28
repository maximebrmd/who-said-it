/**
 * Multiplayer room logic: pure round pre-generation (unit-tested) plus thin
 * wrappers over the Supabase SECURITY DEFINER RPCs and the per-session player
 * identity. See `supabase/migrations/*_multiplayer_rooms.sql` for the server
 * contract and the RLS / cheat-resistance rationale.
 */

import { getSupabase } from "../supabase/client";
import type { Json, Tables } from "../supabase/database.types";
import { buildRound, shuffle, type Rng } from "./round";
import type { ChatData } from "./data";
import type { GameMode } from "./types";

/** Default number of rounds in a multiplayer game. */
export const ROUNDS_PER_GAME = 10;
/** How long the reveal stays up before the round auto-advances (ms). */
export const REVEAL_MS = 4000;
/** Heartbeat cadence so a player counts as "active" for the all-answered check (ms). */
export const HEARTBEAT_MS = 10_000;

/** Row shape stored privately in `room_rounds` and passed to `create_room`. */
export interface RoundPayload {
  message_id: string;
  body: string;
  author: string;
  claim?: string;
  claim_is_true?: boolean;
  choices?: string[];
}

/**
 * Pre-generate the full set of rounds for a room from a chat's data, reusing the
 * single-player `buildRound`. Pure (takes an injectable Rng) so it is unit-tested
 * deterministically. Caps at the number of available messages.
 */
export function buildRoundsPayload(
  mode: GameMode,
  data: ChatData,
  count: number,
  rng: Rng,
): RoundPayload[] {
  const chosen = shuffle(data.messages, rng).slice(0, Math.max(1, count));
  return chosen.map((message) => {
    const round = buildRound(mode, message, data.participants, rng);
    const base = { message_id: message.id, body: message.body, author: message.author };
    return round.mode === "yes-no"
      ? { ...base, claim: round.claim, claim_is_true: round.claimIsTrue }
      : { ...base, choices: round.choices };
  });
}

// --- RPC wrappers ----------------------------------------------------------

function requireSupabase() {
  const sb = getSupabase();
  if (!sb) {
    throw new Error("Multiplayer needs a Supabase project — set NEXT_PUBLIC_SUPABASE_* env.");
  }
  return sb;
}

export interface PlayerIdentity {
  playerId: string;
  token: string;
  isHost: boolean;
  name: string;
}

export async function createRoom(opts: {
  mode: GameMode;
  chatLabel: string;
  hostName: string;
  rounds: RoundPayload[];
}): Promise<PlayerIdentity & { roomId: string; code: string }> {
  const { data, error } = await requireSupabase().rpc("create_room", {
    p_mode: opts.mode,
    p_chat_label: opts.chatLabel,
    p_total_rounds: opts.rounds.length,
    p_host_name: opts.hostName,
    p_rounds: opts.rounds as unknown as Json,
  });
  if (error) throw error;
  const row = data![0];
  return {
    roomId: row.room_id,
    code: row.code,
    playerId: row.player_id,
    token: row.token,
    isHost: true,
    name: opts.hostName,
  };
}

export async function joinRoom(
  code: string,
  name: string,
): Promise<PlayerIdentity & { roomId: string }> {
  const { data, error } = await requireSupabase().rpc("join_room", {
    p_code: code,
    p_name: name,
  });
  if (error) throw error;
  const row = data![0];
  return { roomId: row.room_id, playerId: row.player_id, token: row.token, isHost: false, name };
}

export async function startRoom(roomId: string, id: PlayerIdentity): Promise<void> {
  const { error } = await requireSupabase().rpc("start_room", {
    p_room_id: roomId,
    p_player_id: id.playerId,
    p_token: id.token,
  });
  if (error) throw error;
}

export async function submitAnswer(
  roomId: string,
  id: PlayerIdentity,
  round: number,
  answer: string,
): Promise<boolean> {
  const { data, error } = await requireSupabase().rpc("submit_answer", {
    p_room_id: roomId,
    p_player_id: id.playerId,
    p_token: id.token,
    p_round: round,
    p_answer: answer,
  });
  if (error) throw error;
  return Boolean(data);
}

export async function advanceRoom(roomId: string): Promise<void> {
  const { error } = await requireSupabase().rpc("advance_room", { p_room_id: roomId });
  if (error) throw error;
}

/**
 * Re-evaluate the all-answered reveal check so a round recovers when a player
 * disconnects after everyone else has answered. Idempotent server-side.
 */
export async function reconcileRoom(roomId: string): Promise<void> {
  const { error } = await requireSupabase().rpc("reconcile_room", { p_room_id: roomId });
  if (error) throw error;
}

export async function heartbeat(id: PlayerIdentity): Promise<void> {
  await requireSupabase().rpc("heartbeat", { p_player_id: id.playerId, p_token: id.token });
}

// --- Reads -----------------------------------------------------------------

export type Room = Tables<"rooms">;
/** Public player columns (the secret `token` is never selected client-side). */
export type RoomPlayer = Pick<
  Tables<"room_players">,
  "id" | "room_id" | "name" | "score" | "is_host" | "joined_at" | "last_seen"
>;
export type RoomAnswer = Pick<
  Tables<"room_answers">,
  "id" | "room_id" | "round" | "player_id" | "answer" | "is_correct"
>;

const PLAYER_COLS = "id, room_id, name, score, is_host, joined_at, last_seen";
const ANSWER_COLS = "id, room_id, round, player_id, answer, is_correct";

export async function fetchRoomByCode(code: string): Promise<Room | null> {
  const { data, error } = await requireSupabase()
    .from("rooms")
    .select("*")
    .eq("code", code.toUpperCase())
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function fetchPlayers(roomId: string): Promise<RoomPlayer[]> {
  const { data, error } = await requireSupabase()
    .from("room_players")
    .select(PLAYER_COLS)
    .eq("room_id", roomId)
    .order("joined_at");
  if (error) throw error;
  return (data ?? []) as RoomPlayer[];
}

export async function fetchAnswers(roomId: string, round: number): Promise<RoomAnswer[]> {
  const { data, error } = await requireSupabase()
    .from("room_answers")
    .select(ANSWER_COLS)
    .eq("room_id", roomId)
    .eq("round", round);
  if (error) throw error;
  return (data ?? []) as RoomAnswer[];
}

// --- Per-session identity (no accounts) ------------------------------------

const idKey = (code: string) => `wsi:room:${code.toUpperCase()}`;

export function saveIdentity(code: string, id: PlayerIdentity): void {
  try {
    sessionStorage.setItem(idKey(code), JSON.stringify(id));
  } catch {
    // sessionStorage may be unavailable (SSR / privacy mode) — non-fatal.
  }
}

export function loadIdentity(code: string): PlayerIdentity | null {
  try {
    const raw = sessionStorage.getItem(idKey(code));
    return raw ? (JSON.parse(raw) as PlayerIdentity) : null;
  } catch {
    return null;
  }
}

export function clearIdentity(code: string): void {
  try {
    sessionStorage.removeItem(idKey(code));
  } catch {
    // ignore
  }
}
