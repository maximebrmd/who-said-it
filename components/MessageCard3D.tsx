"use client";

import { Canvas, useFrame } from "@react-three/fiber";
import { RoundedBox, Text } from "@react-three/drei";
import { useRef } from "react";
import type { Group } from "three";

interface CardProps {
  body: string;
  /** "neutral" while answering; tinted on reveal. */
  tone: "neutral" | "correct" | "wrong";
}

const TONE_COLOR: Record<CardProps["tone"], string> = {
  neutral: "#f8fafc",
  correct: "#dcfce7",
  wrong: "#fee2e2",
};

/**
 * The chat-bubble card, rendered in the 3D layer. Plays an enter animation on
 * mount (the parent remounts it per round via `key`) and gently floats. All
 * animation runs through useFrame — no per-frame React state, no allocations.
 */
function Card({ body, tone }: CardProps) {
  const group = useRef<Group>(null);
  const start = useRef<number | null>(null);

  useFrame(({ clock }) => {
    const g = group.current;
    if (!g) return;
    if (start.current === null) start.current = clock.elapsedTime;
    const t = clock.elapsedTime - start.current;

    // Enter: ease-out scale + a small rotateY swing that settles to 0.
    const enter = Math.min(1, t / 0.5);
    const ease = 1 - Math.pow(1 - enter, 3);
    g.scale.setScalar(0.85 + 0.15 * ease);
    const swing = (1 - ease) * 0.4;
    // Idle float once settled.
    g.rotation.y = swing * Math.sin(t * 12) + Math.sin(clock.elapsedTime * 0.6) * 0.05 * ease;
    g.position.y = Math.sin(clock.elapsedTime * 0.9) * 0.06 * ease;
  });

  return (
    <group ref={group}>
      <RoundedBox args={[4.2, 2.4, 0.25]} radius={0.18} smoothness={4}>
        <meshStandardMaterial color={TONE_COLOR[tone]} roughness={0.55} metalness={0.05} />
      </RoundedBox>
      <Text
        position={[0, 0, 0.16]}
        maxWidth={3.6}
        fontSize={0.235}
        lineHeight={1.3}
        textAlign="center"
        anchorX="center"
        anchorY="middle"
        color="#0f172a"
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
      <ambientLight intensity={0.85} />
      <directionalLight position={[3, 4, 5]} intensity={1.1} />
      <directionalLight position={[-4, -2, 2]} intensity={0.3} />
      {/* key remounts the card each round so the enter animation replays. */}
      <Card key={roundKey} body={body} tone={tone} />
    </Canvas>
  );
}
