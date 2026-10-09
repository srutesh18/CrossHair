"use client";

import { useMemo, useRef, useState } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import * as THREE from "three";

export interface Blip {
  id: string;
  name: string;
  domain: string;
  /** 0-100 opportunity score; -1 while the site is still being audited. */
  score: number;
}

const RADIUS = 4;
const MINT = new THREE.Color("#3ddc97");
const AMBER = new THREE.Color("#f2b544");
const GREY = new THREE.Color("#7c8597");
const PENDING = new THREE.Color("#5aa9ff");
const BEAM = new THREE.Color("#f2a07d");

/** Stable angle per company, so blips don't jump between renders. */
function angleFor(key: string): number {
  let h = 2166136261;
  for (let i = 0; i < key.length; i += 1) h = Math.imul(h ^ key.charCodeAt(i), 16777619);
  return ((h >>> 0) % 3600) / 3600 * Math.PI * 2;
}

function colorFor(score: number): THREE.Color {
  if (score < 0) return PENDING;
  if (score >= 60) return MINT;
  if (score >= 35) return AMBER;
  return GREY;
}

function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function Rings() {
  const rings = [1, 2, 3, 4];
  return (
    <group rotation={[-Math.PI / 2, 0, 0]}>
      <mesh>
        <circleGeometry args={[RADIUS, 96]} />
        <meshBasicMaterial color="#0e1a24" transparent opacity={0.92} />
      </mesh>
      {rings.map((r) => (
        <mesh key={r} position={[0, 0, 0.002]}>
          <ringGeometry args={[r - 0.012, r + 0.012, 128]} />
          <meshBasicMaterial color="#2f6f6a" transparent opacity={r === RADIUS ? 0.9 : 0.45} />
        </mesh>
      ))}
      {[0, Math.PI / 4, Math.PI / 2, (3 * Math.PI) / 4].map((a) => (
        <mesh key={a} rotation={[0, 0, a]} position={[0, 0, 0.003]}>
          <planeGeometry args={[RADIUS * 2, 0.012]} />
          <meshBasicMaterial color="#2f6f6a" transparent opacity={0.35} />
        </mesh>
      ))}
    </group>
  );
}

/** A smooth fading beam: one conic gradient painted on the disc, rotated. */
function useBeamTexture(): THREE.Texture | null {
  return useMemo(() => {
    if (typeof document === "undefined") return null;
    const size = 512;
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");
    if (!ctx || !("createConicGradient" in ctx)) return null;
    // Bright at the leading edge (angle 0), fading over ~70 degrees behind it.
    const g = ctx.createConicGradient(0, size / 2, size / 2);
    g.addColorStop(0, "rgba(242,160,125,0.55)");
    g.addColorStop(0.07, "rgba(242,160,125,0.18)");
    g.addColorStop(0.2, "rgba(242,160,125,0)");
    g.addColorStop(1, "rgba(242,160,125,0)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
    ctx.fill();
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }, []);
}

function Sweep({ angle }: { angle: React.MutableRefObject<number> }) {
  const group = useRef<THREE.Group>(null);
  const texture = useBeamTexture();
  useFrame(() => {
    if (group.current) group.current.rotation.y = -angle.current;
  });
  return (
    <group ref={group}>
      {texture ? (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.004, 0]}>
          <circleGeometry args={[RADIUS, 96]} />
          <meshBasicMaterial map={texture} transparent depthWrite={false} blending={THREE.AdditiveBlending} />
        </mesh>
      ) : null}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[RADIUS / 2, 0.006, 0]}>
        <planeGeometry args={[RADIUS, 0.025]} />
        <meshBasicMaterial color={BEAM} />
      </mesh>
    </group>
  );
}

function Beacon({
  blip,
  sweep,
  onHover,
  hovered,
}: {
  blip: Blip;
  sweep: React.MutableRefObject<number>;
  onHover: (id: string | null) => void;
  hovered: boolean;
}) {
  const theta = angleFor(blip.domain || blip.id);
  // Better opportunities sit closer to the centre.
  const r = blip.score < 0 ? RADIUS * 0.92 : 0.5 + (1 - blip.score / 100) * (RADIUS - 0.8);
  const x = Math.cos(theta) * r;
  const z = Math.sin(theta) * r;
  const height = blip.score < 0 ? 0.15 : 0.2 + (blip.score / 100) * 1.4;
  const color = colorFor(blip.score);
  const head = useRef<THREE.Mesh>(null);
  const glow = useRef<THREE.MeshBasicMaterial>(null);

  useFrame(() => {
    // Flash when the beam passes over this blip, then fade.
    const beam = ((sweep.current % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
    const behind = (((beam - theta) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
    const flash = Math.max(0, 1 - behind / 1.4);
    if (head.current) head.current.scale.setScalar(1 + flash * 0.9 + (hovered ? 0.6 : 0));
    if (glow.current) glow.current.opacity = 0.25 + flash * 0.6;
  });

  return (
    <group position={[x, 0, z]}>
      <mesh position={[0, height / 2, 0]}>
        <cylinderGeometry args={[0.012, 0.012, height, 6]} />
        <meshBasicMaterial color={color} transparent opacity={0.55} />
      </mesh>
      <mesh
        ref={head}
        position={[0, height, 0]}
        onPointerOver={(e) => {
          e.stopPropagation();
          onHover(blip.id);
        }}
        onPointerOut={() => onHover(null)}
      >
        <sphereGeometry args={[0.07, 16, 16]} />
        <meshBasicMaterial color={color} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.008, 0]}>
        <circleGeometry args={[0.16, 24]} />
        <meshBasicMaterial ref={glow} color={color} transparent opacity={0.3} depthWrite={false} />
      </mesh>
      {hovered ? (
        <Html position={[0, height + 0.3, 0]} center distanceFactor={9} zIndexRange={[20, 0]}>
          <div className="pointer-events-none rounded-md px-2 py-1 text-[11px] whitespace-nowrap text-white shadow-lg" style={{ background: "rgba(14,26,36,.92)", border: "1px solid #2f6f6a" }}>
            <b>{blip.name}</b>
            <span className="ml-1.5 opacity-70">{blip.score < 0 ? "auditing…" : `score ${blip.score}`}</span>
          </div>
        </Html>
      ) : null}
    </group>
  );
}

function Scene({ blips, scanning }: { blips: Blip[]; scanning: boolean }) {
  const sweep = useRef(0);
  const world = useRef<THREE.Group>(null);
  const [hovered, setHovered] = useState<string | null>(null);
  const still = useMemo(prefersReducedMotion, []);

  useFrame((_, delta) => {
    if (still) return;
    sweep.current += delta * (scanning ? 3.2 : 1.1);
    if (world.current) world.current.rotation.y += delta * 0.04;
  });

  return (
    <group ref={world} rotation={[0, 0.4, 0]}>
      <Rings />
      <Sweep angle={sweep} />
      {blips.map((b) => (
        <Beacon key={b.id} blip={b} sweep={sweep} hovered={hovered === b.id} onHover={setHovered} />
      ))}
      <mesh position={[0, 0.05, 0]}>
        <sphereGeometry args={[0.06, 16, 16]} />
        <meshBasicMaterial color={BEAM} />
      </mesh>
    </group>
  );
}

/** A tilted 3D radar: every company is a beacon, higher and nearer = better. */
export default function Radar3D({ blips, scanning }: { blips: Blip[]; scanning: boolean }) {
  return (
    <div className="relative h-full w-full" role="img" aria-label={`Radar showing ${blips.length} companies`}>
      <Canvas camera={{ position: [0, 6.6, 7.6], fov: 40 }} onCreated={({ camera }) => camera.lookAt(0, -0.6, 0)} dpr={[1, 2]} gl={{ antialias: true, alpha: true }}>
        <Scene blips={blips} scanning={scanning} />
      </Canvas>
    </div>
  );
}
