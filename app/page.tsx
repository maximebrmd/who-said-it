"use client";

import { useEffect, useState } from "react";
import { MessageCard3D } from "@/components/MessageCard3D";
import { getChats } from "@/lib/game/data";
import { useGame } from "@/lib/game/useGame";
import type { Chat, GameMode } from "@/lib/game/types";

const MODES: { id: GameMode; label: string; blurb: string }[] = [
  { id: "yes-no", label: "Yes / No", blurb: "We name someone — did they really say it?" },
  { id: "pick-name", label: "Pick the name", blurb: "Tap who actually said it." },
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

  return (
    <main className="flex h-dvh flex-col bg-gradient-to-b from-slate-900 via-slate-800 to-slate-900 text-slate-100">
      <Hud state={state} onQuit={reset} />

      <div className="relative min-h-0 flex-1">
        {state.round && (
          <MessageCard3D
            body={state.round.message.body}
            roundKey={state.round.message.id}
            tone={state.result ? (state.result.correct ? "correct" : "wrong") : "neutral"}
          />
        )}
      </div>

      <div className="px-4 pb-8">
        {state.status === "error" && (
          <p className="mx-auto max-w-md text-center text-rose-300">{state.error}</p>
        )}
        {state.round &&
          (state.result ? (
            <Reveal result={state.result} onNext={next} />
          ) : state.round.mode === "yes-no" ? (
            <YesNoControls claim={state.round.claim} onAnswer={answerYesNo} />
          ) : (
            <PickControls choices={state.round.choices} onAnswer={answerPick} />
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
    <main className="flex min-h-dvh flex-col items-center justify-center gap-8 bg-gradient-to-b from-slate-900 via-slate-800 to-slate-900 px-6 text-slate-100">
      <div className="text-center">
        <h1 className="text-5xl font-black tracking-tight">who said it?</h1>
        <p className="mt-3 max-w-md text-slate-400">
          Guess who really sent each message from the group chat.
        </p>
      </div>

      <div className="w-full max-w-md space-y-6">
        <div>
          <p className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-400">
            Game mode
          </p>
          <div className="grid grid-cols-2 gap-3">
            {MODES.map((m) => (
              <button
                key={m.id}
                onClick={() => onMode(m.id)}
                className={`rounded-2xl border p-4 text-left transition ${
                  mode === m.id
                    ? "border-emerald-400 bg-emerald-400/10"
                    : "border-slate-700 bg-slate-800/50 hover:border-slate-500"
                }`}
              >
                <span className="block font-bold">{m.label}</span>
                <span className="mt-1 block text-xs text-slate-400">{m.blurb}</span>
              </button>
            ))}
          </div>
        </div>

        <div>
          <label
            htmlFor="chat"
            className="mb-2 block text-sm font-semibold uppercase tracking-wide text-slate-400"
          >
            Chat
          </label>
          <select
            id="chat"
            value={slug}
            onChange={(e) => onSlug(e.target.value)}
            className="w-full rounded-xl border border-slate-700 bg-slate-800 px-4 py-3 text-slate-100"
          >
            {chats.length === 0 && <option>Loading…</option>}
            {chats.map((c) => (
              <option key={c.slug} value={c.slug}>
                {c.name}
              </option>
            ))}
          </select>
        </div>

        <button
          onClick={onStart}
          disabled={!slug || loading}
          className="w-full rounded-xl bg-emerald-500 px-4 py-4 text-lg font-bold text-slate-950 transition hover:bg-emerald-400 disabled:opacity-50"
        >
          {loading ? "Loading…" : "Play"}
        </button>
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
      <button onClick={onQuit} className="text-sm text-slate-400 hover:text-slate-200">
        ← Menu
      </button>
      <div className="flex gap-5 text-sm">
        <Stat label="Score" value={`${state.score}/${state.total}`} />
        <Stat label="Streak" value={state.streak} />
        <Stat label="Best" value={state.bestStreak} />
      </div>
    </header>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="text-center">
      <div className="text-lg font-bold tabular-nums">{value}</div>
      <div className="text-[10px] uppercase tracking-wide text-slate-500">{label}</div>
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
      <p className="mb-4 text-lg">
        Did <span className="font-bold text-emerald-300">{claim}</span> say this?
      </p>
      <div className="grid grid-cols-2 gap-3">
        <button
          onClick={() => onAnswer(false)}
          className="rounded-xl bg-rose-500 px-4 py-4 text-lg font-bold text-white transition hover:bg-rose-400"
        >
          No
        </button>
        <button
          onClick={() => onAnswer(true)}
          className="rounded-xl bg-emerald-500 px-4 py-4 text-lg font-bold text-slate-950 transition hover:bg-emerald-400"
        >
          Yes
        </button>
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
      <p className="mb-4 text-lg">Who said this?</p>
      <div className="grid grid-cols-2 gap-3">
        {choices.map((name) => (
          <button
            key={name}
            onClick={() => onAnswer(name)}
            className="rounded-xl bg-slate-700 px-4 py-4 font-semibold text-slate-100 transition hover:bg-slate-600"
          >
            {name}
          </button>
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
        className={`mb-1 text-2xl font-black ${
          result.correct ? "text-emerald-300" : "text-rose-300"
        }`}
      >
        {result.correct ? "Correct!" : "Nope"}
      </p>
      <p className="mb-4 text-slate-300">
        It was <span className="font-bold">{result.author}</span>.
      </p>
      <button
        onClick={onNext}
        className="w-full rounded-xl bg-emerald-500 px-4 py-4 text-lg font-bold text-slate-950 transition hover:bg-emerald-400"
      >
        Next →
      </button>
    </div>
  );
}
