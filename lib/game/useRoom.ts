"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { getSupabase } from "../supabase/client";
import {
  HEARTBEAT_MS,
  REVEAL_MS,
  advanceRoom,
  clearIdentity,
  fetchAnswers,
  fetchPlayers,
  fetchRoomByCode,
  heartbeat,
  joinRoom,
  loadIdentity,
  saveIdentity,
  startRoom,
  submitAnswer,
  type PlayerIdentity,
  type Room,
  type RoomAnswer,
  type RoomPlayer,
} from "./rooms";

export type RoomConnStatus = "connecting" | "not-found" | "ready" | "error";

// Monotonic suffix so each channel subscription gets a unique topic. Without
// this, React StrictMode's double-mount (or a fast remount) would create two
// channels with the same `room:<id>` topic on the shared client; the second
// subscribe collides with the first still being torn down, and one tab ends up
// silently not receiving postgres_changes.
let channelSeq = 0;

export interface RoomState {
  status: RoomConnStatus;
  room: Room | null;
  players: RoomPlayer[];
  /** Answers for the current round only. */
  answers: RoomAnswer[];
  identity: PlayerIdentity | null;
  /** Player ids currently connected (Realtime Presence). */
  onlineIds: string[];
  error: string | null;
}

/**
 * Subscribes to a room's shared state over Supabase Realtime: the room row
 * (status / current round / reveal), the player roster + leaderboard, and the
 * current round's answers. Also drives presence, the activity heartbeat, and
 * the idempotent auto-advance after each reveal.
 */
export function useRoom(code: string) {
  const [state, setState] = useState<RoomState>({
    status: "connecting",
    room: null,
    players: [],
    answers: [],
    identity: null,
    onlineIds: [],
    error: null,
  });

  const roomIdRef = useRef<string | null>(null);
  const roundRef = useRef<number>(0);
  const identityRef = useRef<PlayerIdentity | null>(null);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const advanceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load any existing identity for this room on mount (per-session, no accounts).
  useEffect(() => {
    const id = loadIdentity(code);
    identityRef.current = id;
    setState((s) => ({ ...s, identity: id }));
  }, [code]);

  const refetchPlayers = useCallback(async () => {
    const roomId = roomIdRef.current;
    if (!roomId) return;
    const players = await fetchPlayers(roomId);
    setState((s) => ({ ...s, players }));
  }, []);

  const refetchAnswers = useCallback(async () => {
    const roomId = roomIdRef.current;
    if (!roomId) return;
    const answers = await fetchAnswers(roomId, roundRef.current);
    setState((s) => ({ ...s, answers }));
  }, []);

  // Track presence once we know who we are (channel is created in the main effect).
  const trackPresence = useCallback(() => {
    const id = identityRef.current;
    const ch = channelRef.current;
    if (id && ch) void ch.track({ playerId: id.playerId, name: id.name });
  }, []);

  const onRoom = useCallback(
    (room: Room) => {
      const roundChanged = room.current_round !== roundRef.current;
      roundRef.current = room.current_round;
      setState((s) => ({ ...s, room }));
      if (roundChanged) void refetchAnswers();

      // Auto-advance: any client schedules; advance_room is idempotent server-side.
      if (advanceTimer.current) {
        clearTimeout(advanceTimer.current);
        advanceTimer.current = null;
      }
      if (room.status === "playing" && room.round_phase === "reveal") {
        const roomId = room.id;
        advanceTimer.current = setTimeout(() => {
          void advanceRoom(roomId).catch(() => {});
        }, REVEAL_MS);
      }
    },
    [refetchAnswers],
  );

  // Resolve the room by code, hydrate state, and wire up the realtime channel.
  useEffect(() => {
    const sb = getSupabase();
    if (!sb) {
      setState((s) => ({ ...s, status: "error", error: "Multiplayer needs Supabase configured." }));
      return;
    }

    let cancelled = false;
    let channel: RealtimeChannel | null = null;

    (async () => {
      try {
        const room = await fetchRoomByCode(code);
        if (cancelled) return;
        if (!room) {
          setState((s) => ({ ...s, status: "not-found" }));
          return;
        }
        roomIdRef.current = room.id;
        roundRef.current = room.current_round;

        const [players, answers] = await Promise.all([
          fetchPlayers(room.id),
          fetchAnswers(room.id, room.current_round),
        ]);
        if (cancelled) return;
        setState((s) => ({ ...s, status: "ready", room, players, answers }));

        channel = sb
          .channel(`room:${room.id}:${++channelSeq}`, { config: { presence: { key: "" } } })
          .on(
            "postgres_changes",
            { event: "*", schema: "public", table: "rooms", filter: `id=eq.${room.id}` },
            (payload) => onRoom(payload.new as Room),
          )
          .on(
            "postgres_changes",
            { event: "*", schema: "public", table: "room_players", filter: `room_id=eq.${room.id}` },
            () => void refetchPlayers(),
          )
          .on(
            "postgres_changes",
            { event: "*", schema: "public", table: "room_answers", filter: `room_id=eq.${room.id}` },
            () => void refetchAnswers(),
          )
          .on("presence", { event: "sync" }, () => {
            const presence = channel?.presenceState() ?? {};
            const ids = Object.values(presence)
              .flat()
              .map((p) => (p as { playerId?: string }).playerId)
              .filter((x): x is string => Boolean(x));
            setState((s) => ({ ...s, onlineIds: Array.from(new Set(ids)) }));
          })
          .subscribe((status) => {
            if (status === "SUBSCRIBED") trackPresence();
          });
        channelRef.current = channel;
      } catch (e) {
        if (!cancelled) {
          setState((s) => ({
            ...s,
            status: "error",
            error: e instanceof Error ? e.message : "Failed to load room.",
          }));
        }
      }
    })();

    return () => {
      cancelled = true;
      if (advanceTimer.current) clearTimeout(advanceTimer.current);
      if (channel) void getSupabase()?.removeChannel(channel);
      channelRef.current = null;
    };
  }, [code, onRoom, refetchAnswers, refetchPlayers, trackPresence]);

  // Heartbeat so this player counts as active for the all-answered check.
  useEffect(() => {
    if (!state.identity) return;
    void heartbeat(state.identity).catch(() => {});
    const t = setInterval(() => {
      if (identityRef.current) void heartbeat(identityRef.current).catch(() => {});
    }, HEARTBEAT_MS);
    return () => clearInterval(t);
  }, [state.identity]);

  // --- Actions -------------------------------------------------------------

  const join = useCallback(
    async (name: string) => {
      const result = await joinRoom(code, name);
      const id: PlayerIdentity = {
        playerId: result.playerId,
        token: result.token,
        isHost: result.isHost,
        name: result.name,
      };
      saveIdentity(code, id);
      identityRef.current = id;
      setState((s) => ({ ...s, identity: id }));
      trackPresence();
      void refetchPlayers();
    },
    [code, refetchPlayers, trackPresence],
  );

  const start = useCallback(async () => {
    const id = identityRef.current;
    const roomId = roomIdRef.current;
    if (id && roomId) await startRoom(roomId, id);
  }, []);

  const answer = useCallback(
    async (value: string) => {
      const id = identityRef.current;
      const roomId = roomIdRef.current;
      if (!id || !roomId) return;
      const round = roundRef.current;
      // Optimistic: show the player as answered immediately.
      const correct = await submitAnswer(roomId, id, round, value);
      setState((s) =>
        s.answers.some((a) => a.player_id === id.playerId)
          ? s
          : {
              ...s,
              answers: [
                ...s.answers,
                {
                  id: `local-${id.playerId}`,
                  room_id: roomId,
                  round,
                  player_id: id.playerId,
                  answer: value,
                  is_correct: correct,
                },
              ],
            },
      );
    },
    [],
  );

  const leave = useCallback(() => {
    clearIdentity(code);
    identityRef.current = null;
    setState((s) => ({ ...s, identity: null }));
  }, [code]);

  // --- Derived -------------------------------------------------------------

  const me = useMemo(
    () => state.players.find((p) => p.id === state.identity?.playerId) ?? null,
    [state.players, state.identity],
  );

  const myAnswer = useMemo(
    () => state.answers.find((a) => a.player_id === state.identity?.playerId) ?? null,
    [state.answers, state.identity],
  );

  const answeredIds = useMemo(() => new Set(state.answers.map((a) => a.player_id)), [state.answers]);

  const leaderboard = useMemo(
    () => [...state.players].sort((a, b) => b.score - a.score || a.joined_at.localeCompare(b.joined_at)),
    [state.players],
  );

  return { state, me, myAnswer, answeredIds, leaderboard, join, start, answer, leave };
}
