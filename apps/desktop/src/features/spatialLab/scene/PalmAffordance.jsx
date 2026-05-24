import { useFrame } from "@react-three/fiber";
import { useRef } from "react";
import * as THREE from "three";

function readInput(inputRef) {
  return inputRef.current ?? {};
}

/** Indicador 3D en la palma — feedback táctil visual */
export function PalmAffordance({ inputRef }) {
  const coreRef = useRef(null);
  const ringRef = useRef(null);

  useFrame((state, delta) => {
    const { spatial, continuum, interaction } = readInput(inputRef);
    const palm = spatial?.primary?.palm;
    const core = coreRef.current;
    const ring = ringRef.current;
    if (!core || !ring) return;

    if (!palm) {
      core.visible = false;
      ring.visible = false;
      return;
    }

    core.visible = true;
    ring.visible = true;
    const target = new THREE.Vector3(palm.x, palm.y, palm.z + 0.05);
    core.position.lerp(target, 1 - 0.0002 ** delta);
    ring.position.copy(core.position);

    const z = continuum?.smoothedZoom ?? 1;
    const s = 0.06 + (interaction?.fieldStrength ?? 0.2) * 0.05 + (z - 1) * 0.04;
    core.scale.setScalar(s);
    ring.scale.setScalar(1.55);
    ring.rotation.z = state.clock.elapsedTime * 0.15;

    if (continuum?.pushing) core.material.color.set("#45ffb1");
    else if (continuum?.pulling) core.material.color.set("#ffc857");
    else core.material.color.set("#62e9ff");
  });

  return (
    <group>
      <mesh ref={coreRef} visible={false}>
        <sphereGeometry args={[1, 16, 16]} />
        <meshBasicMaterial color="#62e9ff" transparent opacity={0.85} />
      </mesh>
      <mesh ref={ringRef} visible={false} rotation={[Math.PI * 0.5, 0, 0]}>
        <torusGeometry args={[0.12, 0.008, 8, 32]} />
        <meshBasicMaterial color="#62e9ff" transparent opacity={0.5} />
      </mesh>
    </group>
  );
}
