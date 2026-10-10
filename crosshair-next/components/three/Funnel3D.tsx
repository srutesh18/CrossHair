"use client";

import { useRef, useState } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { useActiveCanvas } from "./useActiveCanvas";

export interface FunnelStage {
  label: string;
  value: number;
  color: string;
}

function Layer({
  stage,
  index,
  total,
  max,
  hovered,
  onHover,
}: {
  stage: FunnelStage;
  index: number;
  total: number;
  max: number;
  hovered: boolean;
  onHover: (i: number | null) => void;
}) {
  // Each layer narrows; its height grows a little with its share.
  const top = 1.6 - (index / total) * 1.1;
  const bottom = 1.6 - ((index + 1) / total) * 1.1;
  const h = 0.42;
  const y = (total / 2 - index) * (h + 0.08) - h / 2;
  const mesh = useRef<THREE.Mesh>(null);
  useFrame(() => {
    if (mesh.current) mesh.current.position.x = THREE.MathUtils.lerp(mesh.current.position.x, hovered ? 0.18 : 0, 0.15);
  });
  const fill = max ? stage.value / max : 0;
  return (
    <group position={[0, y, 0]}>
      <mesh
        ref={mesh}
        onPointerOver={(e) => {
          e.stopPropagation();
          onHover(index);
        }}
        onPointerOut={() => onHover(null)}
      >
        <cylinderGeometry args={[top, bottom, h, 48, 1, true]} />
        <meshStandardMaterial color={stage.color} transparent opacity={0.35 + fill * 0.5} side={THREE.DoubleSide} roughness={0.35} metalness={0.1} emissive={stage.color} emissiveIntensity={hovered ? 0.55 : 0.18} />
      </mesh>

    </group>
  );
}

function Scene({ stages, hovered, setHovered }: { stages: FunnelStage[]; hovered: number | null; setHovered: (i: number | null) => void }) {
  const max = Math.max(1, ...stages.map((s) => s.value));
  return (
    <>
      <ambientLight intensity={0.7} />
      <directionalLight position={[3, 4, 5]} intensity={1.2} />
      <group rotation={[0.28, 0, 0]} position={[-0.7, 0, 0]}>
        {stages.map((s, i) => (
          <Layer key={s.label} stage={s} index={i} total={stages.length} max={max} hovered={hovered === i} onHover={setHovered} />
        ))}
      </group>
    </>
  );
}

/** A 3D funnel of the pipeline with a DOM legend; hover either to highlight. */
export default function Funnel3D({ stages }: { stages: FunnelStage[] }) {
  const [hovered, setHovered] = useState<number | null>(null);
  const { ref, frameloop } = useActiveCanvas<HTMLDivElement>();
  return (
    <div ref={ref} className="relative h-full w-full">
      <Canvas camera={{ position: [0, 0.6, 6], fov: 38 }} dpr={[1, 1.5]} frameloop={frameloop} gl={{ antialias: true, alpha: true }}>
        <Scene stages={stages} hovered={hovered} setHovered={setHovered} />
      </Canvas>
      <ul className="absolute top-1/2 right-4 -translate-y-1/2 space-y-2.5">
        {stages.map((s, i) => (
          <li
            key={s.label}
            onMouseEnter={() => setHovered(i)}
            onMouseLeave={() => setHovered(null)}
            className="flex cursor-default items-center gap-2 text-[12px] transition"
            style={{ color: hovered === i ? "#fff" : "rgba(255,255,255,.72)" }}
          >
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: s.color, boxShadow: hovered === i ? `0 0 0 4px ${s.color}33` : "none" }} />
            <b className="w-6 text-right text-[14px]" style={{ fontFamily: "var(--font-mono)" }}>{s.value}</b>
            {s.label}
          </li>
        ))}
      </ul>
    </div>
  );
}
