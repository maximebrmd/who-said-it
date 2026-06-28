"use client";

import Link from "next/link";
import { use, useEffect, useState } from "react";
import { Confetti } from "@/components/Confetti";
import { MessageCard3D } from "@/components/MessageCard3D";
import { PartyButton, VARIANTS, display, type Variant } from "@/components/PartyButton";
import { playCorrectChime } from "@/lib/game/sound";
import type { Room, RoomPlayer } from "@/lib/game/rooms";
import { useRoom } from "@/lib/game/useRoom";

const PICK_VARIANTS: Variant[] = ["purple", "teal", "pink", "yellow"];

export default function RoomPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = use(params);
  const upper = code.toUpperCase();
  const room = useRoom(upper);
  const { state } = room;

  if (state.status === "connecting") {
    return <Centered>Connecting…</Centered>;
  }
  if (state.status === "not-found") {
    return (
      <Centered>
        <p className={`${display} mb-4 text-2xl font-bold text-yellow-300`}>Room {upper} not found 🤷</p>
        <Link href="/rooms">
          <PartyButton variant="teal">Back to rooms</PartyButton>
        </Link>
      </Centered>
    );
  }
  if (state.status === "error" || !state.room) {
    return (
      <Centered>
        <p className={`${display} mb-4 text-xl font-bold text-rose-200`}>{state.error ?? "Something went wrong."}</p>
        <Link href="/rooms">
          <PartyButton variant="teal">Back to rooms</PartyButton>
        </Link>
      </Centered>
    );
  }

  if (!state.identity) {
    return <NameGate onJoin={room.join} room={state.room} />;
  }

  if (state.room.status === "lobby") {
    return <Lobby room={room} />;
  }
  if (state.room.status === "finished") {
    return <Results room={room} />;
  }
  return <GameView room={room} />;
}

// --- Shared bits -----------------------------------------------------------

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-4 px-6 text-center text-fuchsia-50">
      {children}
    </main>
  );
}

function Leaderboard({
  players,
  onlineIds,
  meId,
  answeredIds,
  compact,
}: {
  players: RoomPlayer[];
  onlineIds: string[];
  meId?: string;
  answeredIds?: Set<string>;
  compact?: boolean;
}) {
  const online = new Set(onlineIds);
  return (
    <ul className="space-y-2">
      {players.map((p, i) => (
        <li
          key={p.id}
          className={`flex items-center gap-2 rounded-2xl px-3 py-2 ${
            p.id === meId ? "bg-yellow-300/90 text-purple-950" : "bg-white/10 text-fuchsia-50"
          }`}
        >
          {!compact && <span className={`${display} w-5 text-center text-sm font-bold opacity-70`}>{i + 1}</span>}
          <span
            className={`h-2.5 w-2.5 shrink-0 rounded-full ${online.has(p.id) ? "bg-teal-300" : "bg-fuchsia-200/30"}`}
            title={online.has(p.id) ? "online" : "offline"}
          />
          <span className={`${display} flex-1 truncate font-bold`}>
            {p.name}
            {p.is_host ? " 👑" : ""}
          </span>
          {answeredIds?.has(p.id) && <span title="answered">✅</span>}
          <span className={`${display} tabular-nums font-bold`}>{p.score}</span>
        </li>
      ))}
    </ul>
  );
}

// --- Name gate -------------------------------------------------------------

function NameGate({ onJoin, room }: { onJoin: (name: string) => Promise<void>; room: Room }) {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const join = async () => {
    if (!name.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await onJoin(name.trim());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not join.");
      setBusy(false);
    }
  };

  return (
    <Centered>
      <p className={`${display} text-sm font-bold uppercase tracking-widest text-teal-200`}>Room {room.code}</p>
      <h1 className={`${display} mb-2 text-4xl font-bold text-yellow-300`}>{room.chat_label}</h1>
      {room.status !== "lobby" ? (
        <p className="max-w-xs font-semibold text-fuchsia-100">
          This game has already started. Ask the host to start a new room. 🙃
        </p>
      ) : (
        <div className="w-full max-w-xs space-y-4">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && join()}
            maxLength={24}
            placeholder="Pick a name"
            autoFocus
            className={`${display} w-full rounded-2xl border-b-[6px] border-fuchsia-900/60 bg-white/10 px-4 py-3 text-center text-xl font-bold text-fuchsia-50 outline-none placeholder:text-fuchsia-200/40`}
          />
          {error && <p className="font-bold text-rose-200">{error}</p>}
          <PartyButton variant="yellow" onClick={join} disabled={!name.trim() || busy} className="w-full text-xl">
            {busy ? "Joining…" : "Join the game 🎉"}
          </PartyButton>
        </div>
      )}
    </Centered>
  );
}

// --- Lobby -----------------------------------------------------------------

function Lobby({ room }: { room: ReturnType<typeof useRoom> }) {
  const { state, leaderboard } = room;
  const [copied, setCopied] = useState(false);
  const code = state.room!.code;

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard may be blocked — the code is shown on screen anyway.
    }
  };

  const [starting, setStarting] = useState(false);
  const start = async () => {
    setStarting(true);
    try {
      await room.start();
    } catch {
      setStarting(false);
    }
  };

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-lg flex-col gap-7 px-6 py-10 text-fuchsia-50">
      <div className="text-center">
        <p className={`${display} text-sm font-bold uppercase tracking-widest text-teal-200`}>{state.room!.chat_label}</p>
        <h1 className={`${display} text-3xl font-bold text-yellow-300`}>Lobby</h1>
      </div>

      <div className="rounded-3xl border-b-[6px] border-fuchsia-900/50 bg-white/10 p-5 text-center">
        <p className="text-xs font-bold uppercase tracking-widest text-teal-200">Room code</p>
        <button
          onClick={() => copy(code)}
          className={`${display} mt-1 text-5xl font-bold tracking-[0.3em] text-yellow-300 transition hover:brightness-110`}
          title="Tap to copy"
        >
          {code}
        </button>
        <div className="mt-4 flex justify-center">
          <PartyButton
            variant="teal"
            onClick={() => copy(`${window.location.origin}/rooms/${code}`)}
            className="text-base"
          >
            {copied ? "Copied! ✅" : "Copy invite link 🔗"}
          </PartyButton>
        </div>
      </div>

      <div className="flex-1">
        <p className={`${display} mb-3 text-sm font-bold uppercase tracking-widest text-teal-200`}>
          Players ({leaderboard.length})
        </p>
        <Leaderboard players={leaderboard} onlineIds={state.onlineIds} meId={state.identity?.playerId} compact />
      </div>

      <div className="space-y-2">
        <p className="text-center text-sm font-semibold text-fuchsia-100">
          {state.room!.mode === "yes-no" ? "🤔 Yes / No" : "🎯 Pick the name"} · {state.room!.total_rounds} rounds
        </p>
        {state.identity?.isHost ? (
          <PartyButton
            variant="yellow"
            onClick={start}
            disabled={starting || leaderboard.length < 1}
            className="w-full text-2xl"
          >
            {starting ? "Starting…" : "Start game! 🚀"}
          </PartyButton>
        ) : (
          <p className={`${display} text-center text-lg font-bold text-fuchsia-100`}>
            Waiting for the host to start… ⏳
          </p>
        )}
      </div>
    </main>
  );
}

// --- Game ------------------------------------------------------------------

function GameView({ room }: { room: ReturnType<typeof useRoom> }) {
  const { state, myAnswer, answeredIds, leaderboard } = room;
  const r = state.room!;
  const revealing = r.round_phase === "reveal";
  const answered = Boolean(myAnswer);

  // Celebrate once when the reveal lands and this player was right.
  useEffect(() => {
    if (revealing && myAnswer?.is_correct) playCorrectChime();
  }, [revealing, myAnswer?.is_correct]);

  // Lock submission while a round's answer is in flight; `answer()` resolves
  // before the round advances, so the lock clears itself in `finally`.
  const [busy, setBusy] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const onAnswer = async (value: string) => {
    if (answered || busy) return;
    setBusy(true);
    setSubmitError(null);
    try {
      await room.answer(value);
    } catch {
      setSubmitError("Couldn't submit — tap to try again.");
    } finally {
      setBusy(false);
    }
  };

  const tone: "neutral" | "correct" | "wrong" = revealing
    ? myAnswer?.is_correct
      ? "correct"
      : "wrong"
    : "neutral";

  const choices = (r.round_choices as string[] | null) ?? [];
  const answeredCount = answeredIds.size;
  const totalPlayers = leaderboard.length;

  return (
    <main className="flex h-dvh flex-col text-fuchsia-50 lg:flex-row">
      <div className="flex min-h-0 flex-1 flex-col">
        <header className="flex items-center justify-between px-4 py-3">
          <Link
            href="/rooms"
            className={`${display} rounded-full bg-white/15 px-4 py-2 text-sm font-bold text-fuchsia-50 transition hover:bg-white/25`}
          >
            ← Leave
          </Link>
          <span className={`${display} rounded-2xl border-b-4 ${VARIANTS.teal} px-3 py-1.5 text-sm font-bold`}>
            Round {r.current_round}/{r.total_rounds}
          </span>
        </header>

        <div className="relative min-h-0 flex-1">
          {r.round_message_body && (
            <MessageCard3D body={r.round_message_body} roundKey={`${r.current_round}`} tone={tone} />
          )}
          {revealing && myAnswer?.is_correct && <Confetti fireKey={`${r.current_round}`} />}
        </div>

        <div className="px-4 pb-6">
          {revealing ? (
            <Reveal author={r.round_message_author ?? "—"} correct={Boolean(myAnswer?.is_correct)} />
          ) : answered ? (
            <p className={`${display} text-center text-xl font-bold text-fuchsia-100`}>
              Answered! Waiting for others… ({answeredCount}/{totalPlayers}) ⏳
            </p>
          ) : (
            <>
              {r.mode === "yes-no" ? (
                <YesNoControls claim={r.round_claim ?? "Someone"} onAnswer={onAnswer} />
              ) : (
                <PickControls choices={choices} onAnswer={onAnswer} />
              )}
              {submitError && (
                <p className={`${display} mt-3 text-center text-sm font-bold text-rose-200`}>{submitError}</p>
              )}
            </>
          )}
        </div>
      </div>

      <aside className="border-fuchsia-900/40 bg-black/15 px-4 py-4 lg:w-72 lg:border-l">
        <div className="mb-2 flex items-center justify-between">
          <p className={`${display} text-sm font-bold uppercase tracking-widest text-teal-200`}>Leaderboard</p>
          <span className="text-xs font-bold text-fuchsia-200/80">
            {answeredCount}/{totalPlayers} answered
          </span>
        </div>
        <Leaderboard
          players={leaderboard}
          onlineIds={state.onlineIds}
          meId={state.identity?.playerId}
          answeredIds={revealing ? undefined : answeredIds}
        />
      </aside>
    </main>
  );
}

function YesNoControls({ claim, onAnswer }: { claim: string; onAnswer: (v: string) => void }) {
  return (
    <div className="mx-auto max-w-md text-center">
      <p className={`${display} mb-4 text-xl font-bold`}>
        Did <span className="text-yellow-300">{claim}</span> say this?
      </p>
      <div className="grid grid-cols-2 gap-3">
        <PartyButton variant="pink" onClick={() => onAnswer("no")} className="text-2xl">
          👎 No
        </PartyButton>
        <PartyButton variant="teal" onClick={() => onAnswer("yes")} className="text-2xl">
          👍 Yes
        </PartyButton>
      </div>
    </div>
  );
}

function PickControls({ choices, onAnswer }: { choices: string[]; onAnswer: (v: string) => void }) {
  return (
    <div className="mx-auto max-w-md text-center">
      <p className={`${display} mb-4 text-xl font-bold`}>Who said this? 🕵️</p>
      <div className="grid grid-cols-2 gap-3">
        {choices.map((name, i) => (
          <PartyButton key={name} variant={PICK_VARIANTS[i % 4]} onClick={() => onAnswer(name)} className="text-lg">
            {name}
          </PartyButton>
        ))}
      </div>
    </div>
  );
}

function Reveal({ author, correct }: { author: string; correct: boolean }) {
  return (
    <div className="mx-auto max-w-md text-center">
      <p className={`${display} animate-pop-in mb-1 text-4xl font-bold ${correct ? "text-teal-300" : "text-pink-300"}`}>
        {correct ? "🎉 Correct!" : "😬 Nope"}
      </p>
      <p className="text-lg font-semibold text-fuchsia-100">
        It was <span className={`${display} font-bold text-yellow-300`}>{author}</span>.
      </p>
      <p className="mt-2 text-sm font-semibold text-fuchsia-200/80">Next round coming up… ⏭️</p>
    </div>
  );
}

// --- Results ---------------------------------------------------------------

function Results({ room }: { room: ReturnType<typeof useRoom> }) {
  const { state, leaderboard } = room;
  const winner = leaderboard[0];
  const meId = state.identity?.playerId;
  const iWon = winner && winner.id === meId;

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-lg flex-col items-center gap-7 px-6 py-10 text-fuchsia-50">
      <Confetti fireKey="results" />
      <div className="text-center">
        <h1 className={`${display} text-5xl font-bold text-yellow-300 drop-shadow-[0_4px_0_rgba(0,0,0,0.25)]`}>
          {iWon ? "You win! 🏆" : "Game over!"}
        </h1>
        {winner && (
          <p className="mt-3 text-lg font-semibold text-fuchsia-100">
            🥇 <span className={`${display} font-bold text-yellow-300`}>{winner.name}</span> with {winner.score}{" "}
            {winner.score === 1 ? "point" : "points"}
          </p>
        )}
      </div>

      <div className="w-full">
        <p className={`${display} mb-3 text-sm font-bold uppercase tracking-widest text-teal-200`}>Final scores</p>
        <Leaderboard players={leaderboard} onlineIds={state.onlineIds} meId={meId} />
      </div>

      <div className="flex w-full flex-col gap-3">
        <Link href="/rooms/new" className="block">
          <PartyButton variant="yellow" className="w-full text-xl">
            Play again 🔁
          </PartyButton>
        </Link>
        <Link
          href="/"
          className={`${display} block text-center text-sm font-bold text-fuchsia-200/80 hover:text-fuchsia-100`}
        >
          ← Home
        </Link>
      </div>
    </main>
  );
}
