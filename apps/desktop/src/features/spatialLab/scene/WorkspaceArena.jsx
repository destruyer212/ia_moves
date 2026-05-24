import { useFrame } from "@react-three/fiber";
import { useRef } from "react";
import * as THREE from "three";

/** Plano volumétrico amplio — estética 2050 */
export function WorkspaceArena() {
  const ringRef = useRef(null);

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    if (ringRef.current) {
      ringRef.current.rotation.z = t * 0.08;
      ringRef.current.rotation.x = Math.PI * 0.5;
    }
  });

  return (
    <group position={[0, -1.78, 0]}>
      <gridHelper args={[48, 64, "#2a8aaa", "#0c1a28"]} />
      <mesh rotation={[-Math.PI * 0.5, 0, 0]} position={[0, 0.02, 0]}>
        <planeGeometry args={[52, 52, 1, 1]} />
        <meshBasicMaterial color="#14384a" transparent opacity={0.12} wireframe />
      </mesh>

      <group ref={ringRef}>
        <mesh>
          <torusGeometry args={[14, 0.04, 8, 128]} />
          <meshBasicMaterial color="#62e9ff" transparent opacity={0.35} />
        </mesh>
        <mesh rotation={[0, 0.4, 0]}>
          <torusGeometry args={[18, 0.025, 8, 128]} />
          <meshBasicMaterial color="#a855f7" transparent opacity={0.22} />
        </mesh>
      </group>

      {[12, 18, 24].map((r, i) => (
        <mesh key={r} rotation={[-Math.PI * 0.5, 0, 0]} position={[0, 0.03 + i * 0.01, 0]}>
          <ringGeometry args={[r - 0.2, r, 64]} />
          <meshBasicMaterial
            color={i === 1 ? "#45ffb1" : "#62e9ff"}
            transparent
            opacity={0.06 + i * 0.02}
            side={THREE.DoubleSide}
          />
        </mesh>
      ))}
    </group>
  );
}
