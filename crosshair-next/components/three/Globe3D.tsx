"use client";

import { useMemo, useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import { useActiveCanvas } from "./useActiveCanvas";

const R = 2;
const MINT = "#3ddc97";
const ORANGE = "#f2a07d";

function toVec(lat: number, lon: number, r = R): THREE.Vector3 {
  const phi = ((90 - lat) * Math.PI) / 180;
  const theta = ((lon + 180) * Math.PI) / 180;
  return new THREE.Vector3(-r * Math.sin(phi) * Math.cos(theta), r * Math.cos(phi), r * Math.sin(phi) * Math.sin(theta));
}

/** Evenly spread dots on a sphere (Fibonacci lattice). */
function useDots(count: number) {
  return useMemo(() => {
    const pos = new Float32Array(count * 3);
    const golden = Math.PI * (3 - Math.sqrt(5));
    for (let i = 0; i < count; i += 1) {
      const y = 1 - (i / (count - 1)) * 2;
      const r = Math.sqrt(1 - y * y);
      const t = golden * i;
      pos.set([Math.cos(t) * r * R, y * R, Math.sin(t) * r * R], i * 3);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    return g;
  }, [count]);
}

/** Business hubs: where the pings sit (illustrative). */
const HUBS: Array<[number, number, "mint" | "orange"]> = [
  [37.7, -122.4, "orange"], [40.7, -74, "mint"], [51.5, -0.1, "orange"], [52.5, 13.4, "mint"],
  [48.9, 2.35, "mint"], [43.7, -79.4, "orange"], [12.97, 77.6, "orange"], [19.1, 72.9, "mint"],
  [1.35, 103.8, "mint"], [-33.9, 151.2, "mint"], [35.7, 139.7, "orange"], [25.2, 55.3, "mint"],
  [-23.5, -46.6, "mint"], [59.3, 18.1, "orange"], [41.4, 2.2, "mint"],
];
const ARCS: Array<[number, number]> = [[0, 2], [1, 3], [5, 6], [2, 7], [4, 9], [10, 8], [11, 13], [12, 1], [14, 6]];

function Ping({ lat, lon, color, delay }: { lat: number; lon: number; color: string; delay: number }) {
  const ring = useRef<THREE.Mesh>(null);
  const mat = useRef<THREE.MeshBasicMaterial>(null);
  const pos = useMemo(() => toVec(lat, lon, R * 1.005), [lat, lon]);
  const quat = useMemo(() => new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), pos.clone().normalize()), [pos]);
  useFrame(({ clock }) => {
    const t = ((clock.getElapsedTime() + delay) % 2) / 2;
    if (ring.current) ring.current.scale.setScalar(0.4 + t * 2.4);
    if (mat.current) mat.current.opacity = 0.9 * (1 - t);
  });
  return (
    <group position={pos} quaternion={quat}>
      <mesh>
        <circleGeometry args={[0.035, 16]} />
        <meshBasicMaterial color={color} />
      </mesh>
      <mesh ref={ring}>
        <ringGeometry args={[0.05, 0.065, 32]} />
        <meshBasicMaterial ref={mat} color={color} transparent depthWrite={false} side={THREE.DoubleSide} />
      </mesh>
    </group>
  );
}

function Arc({ from, to, color, delay }: { from: THREE.Vector3; to: THREE.Vector3; color: string; delay: number }) {
  const { line, curve } = useMemo(() => {
    const mid = from.clone().add(to).multiplyScalar(0.5);
    mid.normalize().multiplyScalar(R + from.distanceTo(to) * 0.45);
    const c = new THREE.QuadraticBezierCurve3(from, mid, to);
    const g = new THREE.BufferGeometry().setFromPoints(c.getPoints(64));
    const m = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.35 });
    return { line: new THREE.Line(g, m), curve: c };
  }, [from, to, color]);
  const comet = useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => {
    const t = ((clock.getElapsedTime() * 0.35 + delay) % 1);
    if (comet.current) comet.current.position.copy(curve.getPoint(t));
  });
  return (
    <group>
      <primitive object={line} />
      <mesh ref={comet}>
        <sphereGeometry args={[0.03, 10, 10]} />
        <meshBasicMaterial color={color} />
      </mesh>
    </group>
  );
}

function Globe({ dotColor }: { dotColor: string }) {
  const dots = useDots(1400);
  const hubs = useMemo(() => HUBS.map(([lat, lon]) => toVec(lat, lon, R * 1.005)), []);
  return (
    <group rotation={[0.35, 0, 0.08]}>
      <mesh>
        <sphereGeometry args={[R * 0.985, 64, 64]} />
        <meshBasicMaterial color="#0f1a26" transparent opacity={0.92} />
      </mesh>
      <points geometry={dots}>
        <pointsMaterial color={dotColor} size={0.022} sizeAttenuation transparent opacity={0.55} />
      </points>
      {/* Atmosphere glow. */}
      <mesh scale={1.12}>
        <sphereGeometry args={[R, 48, 48]} />
        <meshBasicMaterial color={ORANGE} transparent opacity={0.06} side={THREE.BackSide} />
      </mesh>
      {HUBS.map(([lat, lon, c], i) => (
        <Ping key={i} lat={lat} lon={lon} color={c === "mint" ? MINT : ORANGE} delay={i * 0.37} />
      ))}
      {ARCS.map(([a, b], i) => {
        const from = hubs[a];
        const to = hubs[b];
        return from && to ? <Arc key={i} from={from} to={to} color={i % 2 ? MINT : ORANGE} delay={i * 0.21} /> : null;
      })}
    </group>
  );
}

/** Interactive globe: drag to spin; spins by itself; still for reduced motion. */
export default function Globe3D({ dotColor = "#7fd1c0" }: { dotColor?: string }) {
  const still = typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const { ref, frameloop } = useActiveCanvas<HTMLDivElement>();
  return (
    <div ref={ref} className="h-full w-full">
      <Canvas camera={{ position: [0, 0, 6.2], fov: 42 }} dpr={[1, 1.5]} gl={{ antialias: true, alpha: true }} frameloop={still ? "demand" : frameloop}>
        <Globe dotColor={dotColor} />
        <OrbitControls enableZoom={false} enablePan={false} autoRotate={!still} autoRotateSpeed={0.6} rotateSpeed={0.5} />
      </Canvas>
    </div>
  );
}
