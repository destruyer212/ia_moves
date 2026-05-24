import { Canvas, useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";

function HoloRings({ intensity }) {
  const groupRef = useRef(null);

  useFrame((state) => {
    if (!groupRef.current) return;
    const t = state.clock.getElapsedTime();
    groupRef.current.rotation.z = t * 0.08;
    groupRef.current.rotation.x = Math.sin(t * 0.15) * 0.06;
    groupRef.current.position.z = Math.sin(t * 0.25) * 0.24;
  });

  const glow = 0.45 + intensity * 0.35;

  return (
    <group ref={groupRef}>
      <mesh rotation={[Math.PI * 0.5, 0, 0]} position={[0, 0, -0.4]}>
        <torusGeometry args={[2.2, 0.024, 16, 96]} />
        <meshBasicMaterial color="#62e9ff" transparent opacity={0.2 + glow * 0.35} />
      </mesh>
      <mesh rotation={[Math.PI * 0.5, 0.24, 0]} position={[0, 0, -1.1]}>
        <torusGeometry args={[3.05, 0.026, 16, 96]} />
        <meshBasicMaterial color="#45ffb1" transparent opacity={0.12 + glow * 0.23} />
      </mesh>
      <mesh rotation={[Math.PI * 0.5, -0.3, 0.2]} position={[0, 0, -1.7]}>
        <torusGeometry args={[4.3, 0.028, 16, 96]} />
        <meshBasicMaterial color="#ffc857" transparent opacity={0.1 + glow * 0.2} />
      </mesh>
    </group>
  );
}

function ParticleField({ intensity }) {
  const pointsRef = useRef(null);
  const count = 280;

  const positions = useMemo(() => {
    const arr = new Float32Array(count * 3);
    for (let i = 0; i < count; i += 1) {
      const radius = 2 + Math.random() * 6.4;
      const theta = Math.random() * Math.PI * 2;
      const y = (Math.random() - 0.5) * 3.4;
      arr[i * 3] = Math.cos(theta) * radius;
      arr[i * 3 + 1] = y;
      arr[i * 3 + 2] = (Math.random() - 0.5) * 6.8;
    }
    return arr;
  }, []);

  const color = useMemo(() => new THREE.Color("#7be4ff"), []);

  useFrame((state) => {
    if (!pointsRef.current) return;
    const t = state.clock.getElapsedTime();
    pointsRef.current.rotation.y = t * 0.015;
    pointsRef.current.rotation.z = Math.sin(t * 0.12) * 0.04;
  });

  return (
    <points ref={pointsRef} position={[0, 0, -1.4]}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      <pointsMaterial
        color={color}
        size={0.022 + intensity * 0.02}
        sizeAttenuation
        transparent
        opacity={0.2 + intensity * 0.25}
        depthWrite={false}
      />
    </points>
  );
}

function EnergyPlane({ intensity }) {
  const materialRef = useRef(null);
  useFrame((state) => {
    if (!materialRef.current) return;
    const t = state.clock.getElapsedTime();
    materialRef.current.opacity = 0.08 + (Math.sin(t * 0.6) + 1) * 0.03 + intensity * 0.02;
  });

  return (
    <mesh position={[0, -0.7, -2.6]} rotation={[-Math.PI * 0.42, 0, 0]}>
      <planeGeometry args={[18, 8, 1, 1]} />
      <meshBasicMaterial ref={materialRef} color="#4dd6ff" transparent />
    </mesh>
  );
}

export function HudScene3D({ intensity = 0.75, active = true }) {
  return (
    <div className="hud-3d-layer" aria-hidden="true">
      <Canvas
        frameloop={active ? "always" : "never"}
        dpr={[1, 1.25]}
        camera={{ position: [0, 0.1, 8], fov: 46 }}
        gl={{ alpha: true, antialias: false, powerPreference: "high-performance" }}
      >
        <ambientLight intensity={0.25 + intensity * 0.2} />
        <pointLight position={[2.5, 2.5, 4]} intensity={1 + intensity * 1.1} color="#62e9ff" />
        <pointLight position={[-3, -1.2, 3]} intensity={0.65} color="#45ffb1" />
        <ParticleField intensity={intensity} />
        <HoloRings intensity={intensity} />
        <EnergyPlane intensity={intensity} />
      </Canvas>
    </div>
  );
}
