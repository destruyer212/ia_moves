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
  const orbitVel = useRef({ x: 0, y: 0 });
  const atmosphereRef = useRef(null);

  useFrame((state, delta) => {
    const g = groupRef.current;
    if (!g) return;
    const { interaction, spatial, continuum } = readInput(inputRef);
    const pinch =
      spatial?.leftPinch?.active ? true : spatial?.primaryPinch?.active;

    const drag = continuum?.palmDrag;
    if (pinch && continuum?.active && !continuum?.twoHandZoom && drag) {
      g.rotation.y += drag.orbitYaw * 1.25;
      g.rotation.x += drag.orbitPitch * 0.95;
    } else {
      orbitVel.current.x *= 0.94;
      orbitVel.current.y *= 0.94;
    }
    g.position.y = 0.15 + Math.sin(state.clock.elapsedTime * 0.9) * 0.06;

    if (atmosphereRef.current) {
      const pulse = 1 + (interaction?.fieldStrength ?? 0.1) * 0.08;
      atmosphereRef.current.scale.setScalar(pulse);
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
