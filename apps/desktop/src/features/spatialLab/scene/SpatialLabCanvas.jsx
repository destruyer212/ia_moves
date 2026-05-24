import { Canvas, useFrame } from "@react-three/fiber";
import { Physics, RigidBody } from "@react-three/rapier";
import { Suspense, useRef } from "react";
import * as THREE from "three";
import { buildSpatialInput } from "../engine/buildSpatialInput.js";
import { DEFAULT_BLOCKS } from "../engine/scenePersistence.js";
import { HolographicRig } from "./HolographicRig.jsx";
import { OrbitalPlanet } from "./OrbitalPlanet.jsx";
import { PhysicsBlocks } from "./PhysicsBlocks.jsx";
import { ReactiveParticleField } from "./ReactiveParticleField.jsx";
import { SelectableNodes } from "./SelectableNodes.jsx";
import { SpatialPostFX } from "./SpatialPostFX.jsx";
import { BimanualGuides } from "./BimanualGuides.jsx";
import { PalmAffordance } from "./PalmAffordance.jsx";
import { WorkspaceArena } from "./WorkspaceArena.jsx";
import { SpatialRaycastSystem } from "./SpatialRaycastSystem.jsx";

function readInput(inputRef) {
  return inputRef.current ?? {};
}

function SceneRoot({ inputRef, trackingRef, sceneStateRef, initialBlocks }) {
  const rootRef = useRef(null);
  const camRigRef = useRef(null);
  const grabbedIdRef = useRef(null);
  const blocks =
    initialBlocks?.length > 0
      ? initialBlocks.map((b, i) => ({
          ...b,
          color: DEFAULT_BLOCKS[i % DEFAULT_BLOCKS.length]?.color ?? "#62e9ff",
        }))
      : DEFAULT_BLOCKS;

  useFrame((_, delta) => {
    if (trackingRef?.current) {
      inputRef.current = buildSpatialInput(trackingRef);
    }
    const root = rootRef.current;
    const rig = camRigRef.current;
    if (!root || !rig) return;
    const { interaction, continuum } = readInput(inputRef);
    const dt = Math.min(delta, 0.05);

    const zoomFrozen = continuum?.zoomFrozen === true;
    const orbitFrozen = continuum?.orbitFrozen === true;

    if (!zoomFrozen) {
      const z = continuum?.smoothedZoom ?? 1;
      root.scale.lerp(new THREE.Vector3(z, z, z), 1 - 0.00015 ** delta);
    }

    const yaw = orbitFrozen ? 0 : continuum?.orbitYaw ?? 0;
    const pitch = orbitFrozen ? 0 : continuum?.orbitPitch ?? 0;
    const roll = orbitFrozen ? 0 : continuum?.orbitRoll ?? 0;
    if (continuum?.active && !orbitFrozen && (Math.abs(yaw) > 1e-5 || Math.abs(pitch) > 1e-5)) {
      rig.rotation.y += yaw;
      rig.rotation.x = THREE.MathUtils.clamp(rig.rotation.x + pitch, -1.15, 1.15);
    }
    if (continuum?.active && !orbitFrozen && Math.abs(roll) > 1e-5) {
      rig.rotation.z += roll;
    } else if (!orbitFrozen) {
      rig.rotation.z *= 0.94;
    }

    if (continuum?.active && !orbitFrozen) {
      const panLerp = continuum.palmDrive ? 0.08 : 0.1;
      rig.position.x = THREE.MathUtils.lerp(rig.position.x, continuum.panX ?? 0, panLerp);
      rig.position.z = THREE.MathUtils.lerp(rig.position.z, continuum.panZ ?? 0, panLerp);
    } else if (!continuum?.active) {
      rig.position.x = THREE.MathUtils.lerp(rig.position.x, 0, 0.06);
      rig.position.z = THREE.MathUtils.lerp(rig.position.z, 0, 0.06);
    }
  });

  return (
    <group ref={camRigRef}>
      <group ref={rootRef}>
        <ambientLight intensity={0.32} />
        <pointLight position={[5, 4, 3]} intensity={1.35} color="#62e9ff" />
        <pointLight position={[-4, -1, 4]} intensity={0.85} color="#45ffb1" />
        <directionalLight position={[-3, 6, 2]} intensity={0.4} color="#b8f0ff" />

        <WorkspaceArena />
        <ReactiveParticleField inputRef={inputRef} count={2200} />
        <PalmAffordance inputRef={inputRef} />
        <BimanualGuides inputRef={inputRef} />

        <Physics gravity={[0, -6, 0]} timeStep="vary" colliders={false}>
          <RigidBody type="fixed" friction={1} restitution={0.2} colliders="cuboid" position={[0, -1.92, 0]}>
            <mesh visible={false}>
              <boxGeometry args={[52, 0.35, 52]} />
            </mesh>
          </RigidBody>

          <OrbitalPlanet inputRef={inputRef} sceneStateRef={sceneStateRef} />
          <PhysicsBlocks
            blocks={blocks}
            inputRef={inputRef}
            sceneStateRef={sceneStateRef}
            grabbedIdRef={grabbedIdRef}
          />
        </Physics>

        <SelectableNodes sceneStateRef={sceneStateRef} />
        <HolographicRig inputRef={inputRef} />
        <SpatialRaycastSystem inputRef={inputRef} sceneStateRef={sceneStateRef} />

      </group>
    </group>
  );
}

export function SpatialLabCanvas({ inputRef, trackingRef, sceneStateRef, initialScene }) {
  if (!sceneStateRef.current.blocks?.length) {
    sceneStateRef.current.blocks = initialScene?.blocks ?? DEFAULT_BLOCKS.map((b) => ({
      id: b.id,
      position: [...b.position],
      rotation: [0, 0, 0, 1],
    }));
  }

  return (
    <div className="spatial-canvas-host">
      <Canvas
        className="spatial-canvas"
        camera={{ position: [0, 0.65, 8.8], fov: 54, near: 0.1, far: 180 }}
        gl={{ antialias: true, alpha: false, powerPreference: "high-performance" }}
        dpr={[1, 1.75]}
        shadows
      >
        <color attach="background" args={["#010208"]} />
        <fog attach="fog" args={["#0a0820", 14, 52]} />
        <Suspense fallback={null}>
          <SceneRoot
            inputRef={inputRef}
            trackingRef={trackingRef}
            sceneStateRef={sceneStateRef}
            initialBlocks={initialScene?.blocks}
          />
          <SpatialPostFX />
        </Suspense>
      </Canvas>
    </div>
  );
}
