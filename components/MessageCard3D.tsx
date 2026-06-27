"use client";

import { Canvas, useFrame } from "@react-three/fiber";
import { RoundedBox, Text } from "@react-three/drei";
import { useMemo, useRef } from "react";
// THREE.Timer replaces the deprecated THREE.Clock. In three 0.185 it lives in
// core and is exported from the package root (the older
// "three/addons/misc/Timer.js" path no longer exists in this version).
import { Timer, type Group } from "three";

interface CardProps {
  body: string;
  /** "neutral" while answering; tinted on reveal. */
  tone: "neutral" | "correct" | "wrong";
}

const TONE_COLOR: Record<CardProps["tone"], string> = {
  neutral: "#fffdf5",
  correct: "#a7f3d0",
  wrong: "#fecdd3",
};

/** Back-ease-out: overshoots past 1 then settles, for a springy pop. */
function backOut(x: number): number {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2);
}

/**
 * The chat-bubble card, rendered in the 3D layer with a playful, bouncy feel.
 * Plays a springy enter animation on mount (the parent remounts it per round via
 * `key`) and keeps a gentle game-show bob. Timing comes from a per-card
 * THREE.Timer (replacing the deprecated THREE.Clock); all animation runs through
 * useFrame — no per-frame React state, no allocations in the loop.
 */
function Card({ body, tone }: CardProps) {
  const group = useRef<Group>(null);
  const timer = useMemo(() => new Timer(), []);

  useFrame(() => {
    const g = group.current;
    if (!g) return;
    timer.update();
    const t = timer.getElapsed();

    // Springy enter with a little overshoot.
    const enter = Math.min(1, t / 0.6);
    const ease = backOut(enter);
    const settle = 1 - enter; // 1 -> 0 over the enter window

    const bob = tone === "correct" ? 0.14 : 0.07;
    g.scale.setScalar(0.55 + 0.45 * ease);
    g.position.y = Math.sin(t * 1.9) * bob * enter;
    // Wrong answers get a quick decaying shake.
    g.position.x = tone === "wrong" ? Math.sin(t * 42) * 0.07 * settle : 0;
    g.rotation.z = settle * -0.22 + Math.sin(t * 1.5) * 0.035 * enter;
    g.rotation.y = Math.sin(t * 1.0) * 0.12 * enter;
  });

  return (
    <group ref={group}>
      <RoundedBox args={[4.2, 2.5, 0.35]} radius={0.28} smoothness={4}>
        <meshStandardMaterial color={TONE_COLOR[tone]} roughness={0.4} metalness={0.05} />
      </RoundedBox>
      <Text
        position={[0, 0, 0.22]}
        maxWidth={3.5}
        fontSize={0.245}
        lineHeight={1.3}
        fontWeight={700}
        textAlign="center"
        anchorX="center"
        anchorY="middle"
        color="#1e1b4b"
      >
        {body}
      </Text>
    </group>
  );
}

export function MessageCard3D({
  body,
  roundKey,
  tone,
}: {
  body: string;
  roundKey: string;
  tone: CardProps["tone"];
}) {
  return (
    <Canvas
      camera={{ position: [0, 0, 6], fov: 42 }}
      dpr={[1, 2]}
      gl={{ antialias: true }}
    >
      <ambientLight intensity={0.9} />
      <directionalLight position={[3, 4, 5]} intensity={1.2} />
      <directionalLight position={[-4, -2, 2]} intensity={0.35} color="#f0abfc" />
      {/* key remounts the card each round so the enter animation replays. */}
      <Card key={roundKey} body={body} tone={tone} />
    </Canvas>
  );
}
