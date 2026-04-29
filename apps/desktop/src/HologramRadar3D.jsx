import { Canvas, useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";

/** Approximate “hand constellation” in normalized space (same vibe as old CSS nodes). */
const NODE_POS = [
  new THREE.Vector3(0.02, 0.52, 0.02),
  new THREE.Vector3(0.38, 0.22, -0.04),
  new THREE.Vector3(0.06, -0.06, 0.05),
  new THREE.Vector3(-0.4, 0.12, -0.02),
  new THREE.Vector3(-0.16, -0.48, 0.04),
];
const NODE_COLORS = ["#7cf8ff", "#62e9ff", "#5af0d2", "#62e9ff", "#ffc857"];
const LINKS = [
  [2, 0],
  [2, 1],
  [2, 3],
  [2, 4],
  [0, 1],
  [3, 0],
];

const holoFloorVertex = `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const holoFloorFragment = `
uniform float uTime;
varying vec2 vUv;
void main() {
  vec2 p = (vUv - 0.5) * 2.0;
  float r = length(p);
  float rings = sin(r * 24.0 - uTime * 2.2) * 0.5 + 0.5;
  float grid = abs(sin(p.x * 40.0 + uTime)) * abs(sin(p.y * 40.0 - uTime * 0.7));
  float mask = smoothstep(1.05, 0.15, r);
  vec3 c1 = vec3(0.25, 0.92, 1.0);
  vec3 c2 = vec3(0.2, 1.0, 0.55);
  vec3 col = mix(c1, c2, rings * 0.6 + r * 0.25);
  float alpha = mask * (0.08 + rings * 0.12 + grid * 0.06);
  gl_FragColor = vec4(col, alpha);
}
`;

function HolographicDisc({ materialRef }) {
  useFrame((s) => {
    if (materialRef.current?.uniforms?.uTime) {
      materialRef.current.uniforms.uTime.value = s.clock.elapsedTime;
    }
  });
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.42, 0]}>
      <circleGeometry args={[1.15, 96]} />
      <shaderMaterial
        ref={materialRef}
        transparent
        depthWrite={false}
        side={THREE.DoubleSide}
        uniforms={{ uTime: { value: 0 } }}
        vertexShader={holoFloorVertex}
        fragmentShader={holoFloorFragment}
      />
    </mesh>
  );
}

function NeuralLinks() {
  const geom = useMemo(() => {
    const pts = [];
    for (const [a, b] of LINKS) {
      pts.push(NODE_POS[a].clone(), NODE_POS[b].clone());
    }
    return new THREE.BufferGeometry().setFromPoints(pts);
  }, []);
  return (
    <lineSegments geometry={geom}>
      <lineBasicMaterial color="#62e9ff" transparent opacity={0.45} />
    </lineSegments>
  );
}

function TrackingNodes() {
  const group = useRef(null);
  useFrame((s) => {
    if (!group.current) return;
    const t = s.clock.elapsedTime;
    group.current.children.forEach((child, i) => {
      if (child.isMesh) {
        const pulse = 1 + Math.sin(t * 3.2 + i * 0.9) * 0.08;
        child.scale.setScalar(0.055 * pulse);
      }
    });
  });
  return (
    <group ref={group}>
      {NODE_POS.map((pos, i) => (
        <mesh key={i} position={pos} scale={[0.055, 0.055, 0.055]}>
          <sphereGeometry args={[1, 20, 20]} />
          <meshStandardMaterial
            color={NODE_COLORS[i]}
            emissive={NODE_COLORS[i]}
            emissiveIntensity={1.8}
            metalness={0.35}
            roughness={0.25}
            transparent
            opacity={0.92}
          />
        </mesh>
      ))}
    </group>
  );
}

function CoreLattice() {
  const ref = useRef(null);
  useFrame((s) => {
    if (!ref.current) return;
    const t = s.clock.elapsedTime;
    ref.current.rotation.x = t * 0.7;
    ref.current.rotation.y = t * 0.55;
  });
  return (
    <mesh ref={ref} position={[0, 0.08, 0]} scale={0.11}>
      <icosahedronGeometry args={[1, 1]} />
      <meshBasicMaterial color="#7cf8ff" wireframe transparent opacity={0.55} />
    </mesh>
  );
}

function OrbitalRings() {
  const g = useRef(null);
  useFrame((s) => {
    if (!g.current) return;
    const t = s.clock.elapsedTime;
    g.current.rotation.y = t * 0.35;
    g.current.rotation.x = Math.sin(t * 0.4) * 0.12;
  });
  return (
    <group ref={g} position={[0, 0.02, 0]}>
      <mesh rotation={[Math.PI / 2.4, 0.2, 0]}>
        <torusGeometry args={[0.72, 0.008, 12, 120]} />
        <meshBasicMaterial color="#62e9ff" transparent opacity={0.35} />
      </mesh>
      <mesh rotation={[Math.PI / 2.1, -0.35, 0.5]}>
        <torusGeometry args={[0.88, 0.006, 12, 120]} />
        <meshBasicMaterial color="#45ffb1" transparent opacity={0.22} />
      </mesh>
      <mesh rotation={[Math.PI / 2.6, 0.5, -0.3]}>
        <torusGeometry args={[1.02, 0.005, 10, 100]} />
        <meshBasicMaterial color="#ffc857" transparent opacity={0.18} />
      </mesh>
    </group>
  );
}

function SweepBeam() {
  const ref = useRef(null);
  useFrame((s) => {
    if (!ref.current) return;
    ref.current.rotation.y = s.clock.elapsedTime * 1.1;
  });
  return (
    <mesh ref={ref} position={[0, 0.05, 0]}>
      <planeGeometry args={[1.4, 0.06]} />
      <meshBasicMaterial color="#aefcff" transparent opacity={0.22} side={THREE.DoubleSide} depthWrite={false} />
    </mesh>
  );
}

function DustMotes() {
  const ref = useRef(null);
  const count = 420;
  const positions = useMemo(() => {
    const arr = new Float32Array(count * 3);
    for (let i = 0; i < count; i += 1) {
      arr[i * 3] = (Math.random() - 0.5) * 2.4;
      arr[i * 3 + 1] = (Math.random() - 0.5) * 1.4;
      arr[i * 3 + 2] = (Math.random() - 0.5) * 2.4;
    }
    return arr;
  }, []);

  useFrame((s) => {
    if (!ref.current) return;
    ref.current.rotation.y = s.clock.elapsedTime * 0.05;
  });

  return (
    <points ref={ref}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      <pointsMaterial color="#9ef0ff" size={0.012} transparent opacity={0.35} depthWrite={false} sizeAttenuation />
    </points>
  );
}

function HoloScene() {
  const root = useRef(null);
  const floorMat = useRef(null);

  useFrame((s) => {
    if (!root.current) return;
    const t = s.clock.elapsedTime;
    root.current.rotation.y = Math.sin(t * 0.25) * 0.18;
    root.current.rotation.x = Math.sin(t * 0.18) * 0.06;
  });

  return (
    <group ref={root}>
      <fog attach="fog" args={["#030810", 1.2, 5.5]} />
      <ambientLight intensity={0.35} />
      <pointLight position={[1.2, 1.4, 1.6]} intensity={1.4} color="#62e9ff" />
      <pointLight position={[-1.4, -0.6, 0.8]} intensity={0.6} color="#ffc857" />
      <HolographicDisc materialRef={floorMat} />
      <OrbitalRings />
      <NeuralLinks />
      <TrackingNodes />
      <CoreLattice />
      <SweepBeam />
      <DustMotes />
    </group>
  );
}

/**
 * Full-screen-within-parent WebGL “holographic radar” — replaces flat CSS dots.
 */
export default function HologramRadar3D() {
  return (
    <div className="hologram-radar-root">
      <div className="hologram-radar-chrome" aria-hidden="true">
        <span className="hrc-tag">HOLOGRAPH · LAYER 07</span>
        <span className="hrc-tag">NEURAL TRACK · STANDBY</span>
        <span className="hrc-ring-label">ARC REACTOR FIELD</span>
      </div>
      <Canvas
        className="hologram-radar-canvas"
        dpr={[1, 1.75]}
        camera={{ position: [0, 0.35, 2.15], fov: 42 }}
        gl={{ alpha: true, antialias: true, powerPreference: "high-performance" }}
        onCreated={({ gl }) => {
          gl.setClearColor(0x000000, 0);
        }}
      >
        <HoloScene />
      </Canvas>
      <div className="hologram-radar-footer">
        <span className="hrc-mono">SYNC · AWAITING OPTICAL FEED</span>
        <span className="hrc-mono">RES · 4K NEURAL PIPE</span>
      </div>
    </div>
  );
}
