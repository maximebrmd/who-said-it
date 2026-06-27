"use client";

import { useMemo } from "react";

const COLORS = [
  "#fde047",
  "#f472b6",
  "#a855f7",
  "#22d3ee",
  "#34d399",
  "#fb7185",
  "#60a5fa",
  "#fb923c",
];

const PIECES = 40;

/** Deterministic PRNG (mulberry32) so render stays pure — seeded per burst. */
function makeRng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hash(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/**
 * Lightweight celebratory confetti — pure DOM + CSS, no dependency. Mount it
 * with a changing `fireKey` (e.g. the round id) so React remounts it and the
 * burst replays. Renders nothing intrusive: a non-interactive overlay.
 */
export function Confetti({ fireKey }: { fireKey: string }) {
  const pieces = useMemo(() => {
    const rnd = makeRng(hash(fireKey));
    return Array.from({ length: PIECES }, (_, i) => ({
      color: COLORS[i % COLORS.length],
      left: rnd() * 100,
      dx: (rnd() - 0.5) * 360,
      dy: 220 + rnd() * 320,
      rot: (rnd() - 0.5) * 720,
      delay: rnd() * 0.12,
      duration: 0.9 + rnd() * 0.7,
      size: 8 + rnd() * 8,
    }));
  }, [fireKey]);

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
      {pieces.map((p, i) => (
        <span
          key={i}
          className="confetti-piece absolute top-[35%]"
          style={
            {
              left: `${p.left}%`,
              width: p.size,
              height: p.size * 0.6,
              background: p.color,
              animationDelay: `${p.delay}s`,
              animationDuration: `${p.duration}s`,
              "--dx": `${p.dx}px`,
              "--dy": `${p.dy}px`,
              "--rot": `${p.rot}deg`,
            } as React.CSSProperties
          }
        />
      ))}
    </div>
  );
}
