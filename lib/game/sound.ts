"use client";

/**
 * Tiny celebratory chime synthesised with the Web Audio API — no audio asset.
 * Best-effort and fully guarded: if audio is unavailable or blocked it silently
 * no-ops. Triggered from a click handler, so it runs inside a user gesture.
 */
let ctx: AudioContext | null = null;

export function playCorrectChime(): void {
  try {
    const Ctor =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!Ctor) return;
    ctx ??= new Ctor();
    if (ctx.state === "suspended") void ctx.resume();

    const now = ctx.currentTime;
    // A cheerful little major arpeggio: C5 - E5 - G5.
    [523.25, 659.25, 783.99].forEach((freq, i) => {
      const osc = ctx!.createOscillator();
      const gain = ctx!.createGain();
      osc.type = "triangle";
      osc.frequency.value = freq;
      const start = now + i * 0.08;
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.18, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.22);
      osc.connect(gain).connect(ctx!.destination);
      osc.start(start);
      osc.stop(start + 0.24);
    });
  } catch {
    // Audio is a nice-to-have; never let it break the game.
  }
}
