import { useFrame } from "@react-three/fiber";
import { useRef } from "react";
import * as THREE from "three";

function readInput(inputRef) {
  return inputRef.current ?? {};
}

export function HolographicRig({ inputRef }) {
  const ringRef = useRef(null);

  useFrame((state) => {
    const ring = ringRef.current;
    if (!ring) return;
    const { spatial, interaction } = readInput(inputRef);
    const palm = spatial?.primary?.palm;
    const t = state.clock.elapsedTime;
    ring.rotation.z = t * 0.35;

    if (palm) {
      ring.position.lerp(new THREE.Vector3(palm.x, palm.y, palm.z + 0.2), 0.04);
      const s = 0.7 + (interaction?.fieldStrength ?? 0.2) * 0.55;
      ring.scale.setScalar(s);
    }
  });

  return (
    <group ref={ringRef}>
      <mesh rotation={[Math.PI * 0.5, 0, 0]}>
        <torusGeometry args={[0.55, 0.012, 12, 64]} />
        <meshBasicMaterial color="#62e9ff" transparent opacity={0.7} />
      </mesh>
      <mesh rotation={[Math.PI * 0.5, 0.6, 0]}>
        <torusGeometry args={[0.72, 0.008, 12, 64]} />
        <meshBasicMaterial color="#45ffb1" transparent opacity={0.45} />
      </mesh>
    </group>
  );
}
