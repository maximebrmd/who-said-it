"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { PartyButton, display } from "@/components/PartyButton";
import { getChatData, getChats } from "@/lib/game/data";
import { ROUNDS_PER_GAME, buildRoundsPayload, createRoom, saveIdentity } from "@/lib/game/rooms";
import type { Chat, GameMode } from "@/lib/game/types";

const MODES: { id: GameMode; label: string; blurb: string; emoji: string }[] = [
  { id: "yes-no", label: "Yes / No", blurb: "We name someone — did they really say it?", emoji: "🤔" },
  { id: "pick-name", label: "Pick the name", blurb: "Tap who actually said it.", emoji: "🎯" },
];

const rng = () => Math.random();

export default function NewRoom() {
  const router = useRouter();
  const [chats, setChats] = useState<Chat[]>([]);
  const [name, setName] = useState("");
  const [mode, setMode] = useState<GameMode>("yes-no");
  const [slug, setSlug] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getChats()
      .then((c) => {
        setChats(c);
        if (c[0]) setSlug((s) => s || c[0].slug);
      })
      .catch(() => setChats([]));
  }, []);

  const create = async () => {
    if (!name.trim() || !slug) return;
    setBusy(true);
    setError(null);
    try {
      const data = await getChatData(slug);
      if (data.messages.length === 0) {
        throw new Error("This chat has no playable messages.");
      }
      const rounds = buildRoundsPayload(mode, data, ROUNDS_PER_GAME, rng);
      const chat = chats.find((c) => c.slug === slug);
      const result = await createRoom({
        mode,
        chatLabel: chat?.name ?? "Group chat",
        hostName: name.trim(),
        rounds,
      });
      saveIdentity(result.code, {
        playerId: result.playerId,
        token: result.token,
        isHost: true,
        name: name.trim(),
      });
      router.push(`/rooms/${result.code}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not create the room.");
      setBusy(false);
    }
  };

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-8 px-6 py-10 text-fuchsia-50">
      <h1
        className={`${display} text-center text-4xl font-bold tracking-tight text-yellow-300 drop-shadow-[0_4px_0_rgba(0,0,0,0.25)] sm:text-5xl`}
      >
        Create a room
      </h1>

      <div className="w-full max-w-md space-y-6">
        <div>
          <label
            htmlFor="name"
            className={`${display} mb-3 block text-sm font-bold uppercase tracking-widest text-teal-200`}
          >
            Your name
          </label>
          <input
            id="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={24}
            placeholder="e.g. Max"
            className={`${display} w-full rounded-2xl border-b-[6px] border-fuchsia-900/60 bg-white/10 px-4 py-3 text-lg font-bold text-fuchsia-50 outline-none placeholder:text-fuchsia-200/40`}
          />
        </div>

        <div>
          <p className={`${display} mb-3 text-sm font-bold uppercase tracking-widest text-teal-200`}>
            Game mode
          </p>
          <div className="grid grid-cols-2 gap-3">
            {MODES.map((m) => (
              <button
                key={m.id}
                onClick={() => setMode(m.id)}
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
            onChange={(e) => setSlug(e.target.value)}
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

        {error && <p className="text-center font-bold text-rose-200">{error}</p>}

        <PartyButton
          variant="yellow"
          onClick={create}
          disabled={!name.trim() || !slug || busy}
          className="w-full text-2xl"
        >
          {busy ? "Creating…" : "Create room 🎈"}
        </PartyButton>

        <Link
          href="/rooms"
          className={`${display} block text-center text-sm font-bold text-fuchsia-200/80 hover:text-fuchsia-100`}
        >
          ← Back
        </Link>
      </div>
    </main>
  );
}
