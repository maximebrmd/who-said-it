"use client";

import { useCallback, useRef, useState } from "react";
import { getChatData } from "./data";
import { buildRound, gradePickName, gradeYesNo, shuffle } from "./round";
import type { AnswerResult, GameMode, Message, Round } from "./types";

const rng = () => Math.random();
const REFILL_AT = 4;

export interface GameState {
  status: "start" | "loading" | "playing" | "error";
  mode: GameMode;
  round: Round | null;
  result: AnswerResult | null;
  score: number;
  streak: number;
  bestStreak: number;
  total: number;
  error: string | null;
}

const initialState: GameState = {
  status: "start",
  mode: "yes-no",
  round: null,
  result: null,
  score: 0,
  streak: 0,
  bestStreak: 0,
  total: 0,
  error: null,
};

export function useGame() {
  const [state, setState] = useState<GameState>(initialState);

  // Mutable round source — kept out of React state to avoid per-round churn.
  const queue = useRef<Message[]>([]);
  const participants = useRef<string[]>([]);
  const slug = useRef<string>("");
  const refilling = useRef(false);

  const refill = useCallback(async () => {
    if (refilling.current) return;
    refilling.current = true;
    try {
      const data = await getChatData(slug.current);
      participants.current = data.participants;
      queue.current.push(...shuffle(data.messages, rng));
    } finally {
      refilling.current = false;
    }
  }, []);

  const nextRound = useCallback(
    (mode: GameMode) => {
      const message = queue.current.shift();
      if (!message) {
        setState((s) => ({ ...s, status: "error", error: "No messages available." }));
        return;
      }
      if (queue.current.length < REFILL_AT) void refill();
      const round = buildRound(mode, message, participants.current, rng);
      setState((s) => ({ ...s, status: "playing", round, result: null }));
    },
    [refill],
  );

  const start = useCallback(
    async (mode: GameMode, chatSlug: string) => {
      slug.current = chatSlug;
      queue.current = [];
      setState({ ...initialState, status: "loading", mode });
      try {
        await refill();
        if (queue.current.length === 0) {
          setState((s) => ({ ...s, status: "error", error: "This chat has no playable messages." }));
          return;
        }
        nextRound(mode);
      } catch (e) {
        setState((s) => ({
          ...s,
          status: "error",
          error: e instanceof Error ? e.message : "Failed to load chat.",
        }));
      }
    },
    [refill, nextRound],
  );

  // Grade an answer and fold the result into the score/streak in one atomic
  // update. Ignores repeat answers once a round is already revealed.
  const settle = useCallback(
    (grade: (round: Round) => AnswerResult | null) => {
      setState((s) => {
        if (!s.round || s.result) return s;
        const result = grade(s.round);
        if (!result) return s;
        const streak = result.correct ? s.streak + 1 : 0;
        return {
          ...s,
          result,
          score: s.score + (result.correct ? 1 : 0),
          streak,
          bestStreak: Math.max(s.bestStreak, streak),
          total: s.total + 1,
        };
      });
    },
    [],
  );

  const answerYesNo = useCallback(
    (yes: boolean) =>
      settle((round) => (round.mode === "yes-no" ? gradeYesNo(round, yes) : null)),
    [settle],
  );

  const answerPick = useCallback(
    (name: string) =>
      settle((round) =>
        round.mode === "pick-name" ? gradePickName(round, name) : null,
      ),
    [settle],
  );

  const next = useCallback(() => nextRound(state.mode), [nextRound, state.mode]);

  const reset = useCallback(() => setState(initialState), []);

  return { state, start, answerYesNo, answerPick, next, reset };
}
