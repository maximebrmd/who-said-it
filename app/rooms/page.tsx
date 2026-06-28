"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { PartyButton, display } from "@/components/PartyButton";

export default function RoomsLanding() {
  const router = useRouter();
  const [code, setCode] = useState("");

  const go = () => {
    const c = code.trim().toUpperCase();
    if (c) router.push(`/rooms/${c}`);
  };

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-10 px-6 py-10 text-fuchsia-50">
      <div className="text-center">
        <h1
          className={`${display} text-5xl font-bold tracking-tight text-yellow-300 drop-shadow-[0_4px_0_rgba(0,0,0,0.25)] sm:text-6xl`}
        >
          Play with friends
        </h1>
        <p className="mt-4 max-w-md text-lg font-semibold text-fuchsia-100">
          Same chat, same messages, everyone guessing at once. 🎉
        </p>
      </div>

      <div className="w-full max-w-md space-y-7">
        <Link href="/rooms/new" className="block">
          <PartyButton variant="yellow" className="w-full text-2xl">
            ✨ Create a room
          </PartyButton>
        </Link>

        <div className="flex items-center gap-3 text-fuchsia-200/70">
          <span className="h-px flex-1 bg-fuchsia-200/30" />
          <span className={`${display} text-xs font-bold uppercase tracking-widest`}>or join</span>
          <span className="h-px flex-1 bg-fuchsia-200/30" />
        </div>

        <div className="space-y-3">
          <label
            htmlFor="code"
            className={`${display} block text-sm font-bold uppercase tracking-widest text-teal-200`}
          >
            Room code
          </label>
          <div className="flex gap-3">
            <input
              id="code"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              onKeyDown={(e) => e.key === "Enter" && go()}
              maxLength={6}
              placeholder="ABC123"
              autoCapitalize="characters"
              className={`${display} w-full rounded-2xl border-b-[6px] border-fuchsia-900/60 bg-white/10 px-4 py-3 text-2xl font-bold uppercase tracking-[0.3em] text-fuchsia-50 outline-none placeholder:text-fuchsia-200/40`}
            />
            <PartyButton variant="teal" onClick={go} disabled={!code.trim()} className="px-6">
              Go
            </PartyButton>
          </div>
        </div>

        <Link
          href="/"
          className={`${display} block text-center text-sm font-bold text-fuchsia-200/80 hover:text-fuchsia-100`}
        >
          ← Back to solo
        </Link>
      </div>
    </main>
  );
}
