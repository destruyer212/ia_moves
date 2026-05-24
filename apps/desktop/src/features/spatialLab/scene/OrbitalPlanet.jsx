import { RigidBody } from "@react-three/rapier";
import { useFrame } from "@react-three/fiber";
import { useRef } from "react";
import * as THREE from "three";
import { INTERACTION_MODES } from "../engine/gestureStateMachine.js";
import { PlanetParticleRing } from "./ReactiveParticleField.jsx";

function readInput(inputRef) {
  return inputRef.current ?? {};
}

export function OrbitalPlanet({ inputRef, sceneStateRef }) {
  const groupRef = useRef(null);
  const atmosphereRef = useRef(null);

  useFrame((state) => {
    const g = groupRef.current;
    if (!g) return;

    g.position.y = 0.15 + Math.sin(state.clock.elapsedTime * 0.35) * 0.02;

    if (atmosphereRef.current) {
      atmosphereRef.current.scale.setScalar(1.02);
    }

    sceneStateRef.current.globe = {
      rotation: [g.rotation.x, g.rotation.y, g.rotation.z, 1],
    };
  });

  const selected = sceneStateRef.current?.selectedNodeId === "planet-core";

  return (
    <group ref={groupRef} position={[0, 0.15, -1.35]}>
      <RigidBody type="fixed" colliders="ball">
        <mesh
          userData={{
            spatialPickable: true,
            spatialNodeId: "planet-core",
            spatialLabel: "Planeta orbital · núcleo",
          }}
        >
          <sphereGeometry args={[1.18, 64, 64]} />
          <meshStandardMaterial
            color="#0c2238"
            emissive={selected ? "#3ad4ff" : "#1a5a7a"}
            emissiveIntensity={selected ? 0.85 : 0.45}
            metalness={0.4}
            roughness={0.35}
            wireframe
          />
        </mesh>
      </RigidBody>

      <mesh ref={atmosphereRef}>
        <sphereGeometry args={[1.28, 48, 48]} />
        <meshBasicMaterial
          color="#62e9ff"
          transparent
          opacity={0.07}
          side={THREE.BackSide}
          depthWrite={false}
        />
      </mesh>

      <mesh rotation={[Math.PI * 0.5, 0, 0]}>
        <ringGeometry args={[1.35, 1.52, 64]} />
        <meshBasicMaterial color="#45ffb1" transparent opacity={0.25} side={THREE.DoubleSide} />
      </mesh>

      <PlanetParticleRing radius={1.62} />

      <mesh>
        <sphereGeometry args={[1.14, 32, 32]} />
        <meshBasicMaterial color="#7be4ff" transparent opacity={0.04} wireframe />
      </mesh>
    </group>
  );
}
