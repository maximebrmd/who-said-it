"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { MessageCard3D } from "@/components/MessageCard3D";
import { Confetti } from "@/components/Confetti";
import { PartyButton, VARIANTS, display, type Variant } from "@/components/PartyButton";
import { getChats } from "@/lib/game/data";
import { gradePickName, gradeYesNo } from "@/lib/game/round";
import { playCorrectChime } from "@/lib/game/sound";
import { useGame } from "@/lib/game/useGame";
import type { Chat, GameMode } from "@/lib/game/types";

const MODES: { id: GameMode; label: string; blurb: string; emoji: string }[] = [
  { id: "yes-no", label: "Yes / No", blurb: "We name someone — did they really say it?", emoji: "🤔" },
  { id: "pick-name", label: "Pick the name", blurb: "Tap who actually said it.", emoji: "🎯" },
];

export default function Home() {
  const { state, start, answerYesNo, answerPick, next, reset } = useGame();
  const [chats, setChats] = useState<Chat[]>([]);
  const [mode, setMode] = useState<GameMode>("yes-no");
  const [slug, setSlug] = useState("");

  useEffect(() => {
    getChats()
      .then((c) => {
        setChats(c);
        if (c[0]) setSlug((s) => s || c[0].slug);
      })
      .catch(() => setChats([]));
  }, []);

  // Celebrate inside the click gesture so audio is allowed to play.
  const onYesNo = (yes: boolean) => {
    if (state.round?.mode === "yes-no" && !state.result) {
      if (gradeYesNo(state.round, yes).correct) playCorrectChime();
    }
    answerYesNo(yes);
  };
  const onPick = (name: string) => {
    if (state.round?.mode === "pick-name" && !state.result) {
      if (gradePickName(state.round, name).correct) playCorrectChime();
    }
    answerPick(name);
  };

  if (state.status === "start" || state.status === "loading") {
    return (
      <StartScreen
        chats={chats}
        mode={mode}
        slug={slug}
        loading={state.status === "loading"}
        onMode={setMode}
        onSlug={setSlug}
        onStart={() => slug && start(mode, slug)}
      />
    );
  }

  const celebrate = Boolean(state.result?.correct);

  return (
    <main className="flex h-dvh flex-col text-fuchsia-50">
      <Hud state={state} onQuit={reset} />

      <div className="relative min-h-0 flex-1">
        {state.round && (
          <MessageCard3D
            body={state.round.message.body}
            roundKey={state.round.message.id}
            tone={state.result ? (state.result.correct ? "correct" : "wrong") : "neutral"}
          />
        )}
        {celebrate && state.round && <Confetti fireKey={state.round.message.id} />}
      </div>

      <div className="px-4 pb-8">
        {state.status === "error" && (
          <p className="mx-auto max-w-md text-center font-bold text-rose-200">{state.error}</p>
        )}
        {state.round &&
          (state.result ? (
            <Reveal result={state.result} onNext={next} />
          ) : state.round.mode === "yes-no" ? (
            <YesNoControls claim={state.round.claim} onAnswer={onYesNo} />
          ) : (
            <PickControls choices={state.round.choices} onAnswer={onPick} />
          ))}
      </div>
    </main>
  );
}

function StartScreen({
  chats,
  mode,
  slug,
  loading,
  onMode,
  onSlug,
  onStart,
}: {
  chats: Chat[];
  mode: GameMode;
  slug: string;
  loading: boolean;
  onMode: (m: GameMode) => void;
  onSlug: (s: string) => void;
  onStart: () => void;
}) {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-10 px-6 py-10 text-fuchsia-50">
      <div className="text-center">
        <h1
          className={`${display} text-6xl font-bold tracking-tight text-yellow-300 drop-shadow-[0_4px_0_rgba(0,0,0,0.25)] sm:text-7xl`}
        >
          who said it?
        </h1>
        <p className="mt-4 max-w-md text-lg font-semibold text-fuchsia-100">
          Guess who really sent each message from the group chat. 🎉
        </p>
      </div>

      <div className="w-full max-w-md space-y-7">
        <div>
          <p className={`${display} mb-3 text-sm font-bold uppercase tracking-widest text-teal-200`}>
            Game mode
          </p>
          <div className="grid grid-cols-2 gap-3">
            {MODES.map((m) => (
              <button
                key={m.id}
                onClick={() => onMode(m.id)}
                className={`rounded-3xl border-b-[6px] p-4 text-left transition-all duration-100 active:translate-y-1 active:border-b-2 ${
                  mode === m.id
                    ? "border-yellow-500 bg-yellow-300 text-purple-950"
                    : "border-fuchsia-900/60 bg-white/10 text-fuchsia-50 hover:bg-white/15"
                }`}
              >
                <span className={`${display} block text-lg font-bold`}>
                  {m.emoji} {m.label}
                </span>
                <span className="mt-1 block text-xs font-semibold opacity-80">{m.blurb}</span>
              </button>
            ))}
          </div>
        </div>

        <div>
          <label
            htmlFor="chat"
            className={`${display} mb-3 block text-sm font-bold uppercase tracking-widest text-teal-200`}
          >
            Chat
          </label>
          <select
            id="chat"
            value={slug}
            onChange={(e) => onSlug(e.target.value)}
            className={`${display} w-full rounded-2xl border-b-[6px] border-fuchsia-900/60 bg-white/10 px-4 py-3 text-lg font-bold text-fuchsia-50 outline-none`}
          >
            {chats.length === 0 && <option className="text-black">Loading…</option>}
            {chats.map((c) => (
              <option key={c.slug} value={c.slug} className="text-black">
                {c.name}
              </option>
            ))}
          </select>
        </div>

        <PartyButton variant="yellow" onClick={onStart} disabled={!slug || loading} className="w-full text-2xl">
          {loading ? "Loading…" : "Play solo! 🎈"}
        </PartyButton>

        <div className="flex items-center gap-3 text-fuchsia-200/70">
          <span className="h-px flex-1 bg-fuchsia-200/30" />
          <span className={`${display} text-xs font-bold uppercase tracking-widest`}>or</span>
          <span className="h-px flex-1 bg-fuchsia-200/30" />
        </div>

        <Link href="/rooms" className="block">
          <PartyButton variant="purple" className="w-full text-2xl">
            Play with friends 🎉
          </PartyButton>
        </Link>
      </div>
    </main>
  );
}

function Hud({
  state,
  onQuit,
}: {
  state: ReturnType<typeof useGame>["state"];
  onQuit: () => void;
}) {
  return (
    <header className="flex items-center justify-between px-4 py-4">
      <button
        onClick={onQuit}
        className={`${display} rounded-full bg-white/15 px-4 py-2 text-sm font-bold text-fuchsia-50 transition hover:bg-white/25`}
      >
        ← Menu
      </button>
      <div className="flex gap-2">
        <Stat label="Score" value={`${state.score}/${state.total}`} variant="teal" />
        <Stat label="Streak" value={`🔥 ${state.streak}`} variant="pink" />
        <Stat label="Best" value={state.bestStreak} variant="yellow" />
      </div>
    </header>
  );
}

function Stat({
  label,
  value,
  variant,
}: {
  label: string;
  value: string | number;
  variant: Variant;
}) {
  return (
    <div className={`${VARIANTS[variant]} rounded-2xl border-b-4 px-3 py-1.5 text-center`}>
      <div className={`${display} text-lg font-bold tabular-nums leading-none`}>{value}</div>
      <div className="text-[10px] font-bold uppercase tracking-wide opacity-70">{label}</div>
    </div>
  );
}

function YesNoControls({
  claim,
  onAnswer,
}: {
  claim: string;
  onAnswer: (yes: boolean) => void;
}) {
  return (
    <div className="mx-auto max-w-md text-center">
      <p className={`${display} mb-4 text-xl font-bold`}>
        Did <span className="text-yellow-300">{claim}</span> say this?
      </p>
      <div className="grid grid-cols-2 gap-3">
        <PartyButton variant="pink" onClick={() => onAnswer(false)} className="text-2xl">
          👎 No
        </PartyButton>
        <PartyButton variant="teal" onClick={() => onAnswer(true)} className="text-2xl">
          👍 Yes
        </PartyButton>
      </div>
    </div>
  );
}

function PickControls({
  choices,
  onAnswer,
}: {
  choices: string[];
  onAnswer: (name: string) => void;
}) {
  return (
    <div className="mx-auto max-w-md text-center">
      <p className={`${display} mb-4 text-xl font-bold`}>Who said this? 🕵️</p>
      <div className="grid grid-cols-2 gap-3">
        {choices.map((name, i) => (
          <PartyButton
            key={name}
            variant={(["purple", "teal", "pink", "yellow"] as Variant[])[i % 4]}
            onClick={() => onAnswer(name)}
            className="text-lg"
          >
            {name}
          </PartyButton>
        ))}
      </div>
    </div>
  );
}

function Reveal({
  result,
  onNext,
}: {
  result: { correct: boolean; author: string };
  onNext: () => void;
}) {
  return (
    <div className="mx-auto max-w-md text-center">
      <p
        className={`${display} animate-pop-in mb-1 text-4xl font-bold ${
          result.correct ? "text-teal-300" : "text-pink-300"
        }`}
      >
        {result.correct ? "🎉 Correct!" : "😬 Nope"}
      </p>
      <p className="mb-4 text-lg font-semibold text-fuchsia-100">
        It was <span className={`${display} font-bold text-yellow-300`}>{result.author}</span>.
      </p>
      <PartyButton variant="yellow" onClick={onNext} className="w-full text-2xl">
        Next round →
      </PartyButton>
    </div>
  );
}
