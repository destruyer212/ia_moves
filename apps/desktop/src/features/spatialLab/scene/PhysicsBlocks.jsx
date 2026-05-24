import { RigidBody } from "@react-three/rapier";
import { useFrame } from "@react-three/fiber";
import { useEffect, useRef } from "react";
import * as THREE from "three";
import { INTERACTION_MODES } from "../engine/gestureStateMachine.js";

function readInput(inputRef) {
  return inputRef.current ?? {};
}

function pinchToWorld(pinch) {
  if (!pinch) return null;
  return new THREE.Vector3(
    (pinch.x * 2 - 1) * 4.6,
    -(pinch.y * 2 - 1) * 3.1,
    (pinch.z ?? 0) * 2.2,
  );
}

export function PhysicsBlock({ block, inputRef, sceneStateRef, grabbedIdRef }) {
  const bodyRef = useRef(null);
  const meshRef = useRef(null);
  const home = useRef(
    new THREE.Vector3(block.position[0], block.position[1], block.position[2]),
  );

  useFrame((_, delta) => {
    const body = bodyRef.current;
    if (!body) return;
    const { interaction, spatial, continuum } = readInput(inputRef);
    if (continuum?.twoHandZoom && continuum?.dual?.dualPinch) return;
    const pinch =
      spatial?.leftPinch?.active ? spatial.leftPinch : spatial?.primaryPinch;
    const palm = spatial?.primary?.palm;
    const isGrabbed = grabbedIdRef.current === block.id;

    if (interaction?.grab && pinch?.active) {
      const target = pinchToWorld(pinch) ?? (palm ? new THREE.Vector3(palm.x, palm.y, palm.z) : null);
      if (!target) return;

      if (!isGrabbed) {
        const pos = body.translation();
        const dist = Math.hypot(pos.x - target.x, pos.y - target.y, pos.z - target.z);
        if (dist < 1.35) grabbedIdRef.current = block.id;
      }

      if (grabbedIdRef.current === block.id) {
        body.setBodyType("kinematicPosition", true);
        const pos = body.translation();
        const t = 1 - 0.00003 ** delta;
        body.setNextKinematicTranslation({
          x: pos.x + (target.x - pos.x) * t,
          y: pos.y + (target.y - pos.y) * t,
          z: pos.z + (target.z - pos.z) * t,
        });
        body.setAngvel({ x: 0, y: 0, z: 0 }, true);
      }
    } else if (isGrabbed) {
      body.setBodyType("dynamic", true);
      grabbedIdRef.current = null;
    }
  });

  useEffect(() => {
    const interval = window.setInterval(() => {
      const body = bodyRef.current;
      if (!body || grabbedIdRef.current === block.id) return;
      const t = body.translation();
      const r = body.rotation();
      sceneStateRef.current.blocks = sceneStateRef.current.blocks.map((b) =>
        b.id === block.id
          ? { ...b, position: [t.x, t.y, t.z], rotation: [r.x, r.y, r.z, r.w] }
          : b,
      );
    }, 400);
    return () => window.clearInterval(interval);
  }, [block.id, sceneStateRef, grabbedIdRef]);

  const selected = sceneStateRef.current?.selectedNodeId === `block-${block.id}`;

  return (
    <RigidBody
      ref={bodyRef}
      position={block.position}
      colliders="cuboid"
      restitution={0.42}
      friction={0.65}
      linearDamping={0.35}
      angularDamping={0.45}
      mass={0.85}
    >
      <mesh
        ref={meshRef}
        castShadow
        userData={{
          spatialPickable: true,
          spatialNodeId: `block-${block.id}`,
          spatialLabel: `Bloque ${block.id}`,
        }}
      >
        <boxGeometry args={[0.44, 0.44, 0.44]} />
        <meshStandardMaterial
          color={block.color ?? "#62e9ff"}
          emissive={block.color ?? "#62e9ff"}
          emissiveIntensity={selected ? 1.1 : 0.5}
          metalness={0.65}
          roughness={0.2}
        />
      </mesh>
    </RigidBody>
  );
}

export function PhysicsBlocks({ blocks, inputRef, sceneStateRef, grabbedIdRef }) {
  return (
    <>
      {blocks.map((block) => (
        <PhysicsBlock
          key={block.id}
          block={block}
          inputRef={inputRef}
          sceneStateRef={sceneStateRef}
          grabbedIdRef={grabbedIdRef}
        />
      ))}
    </>
  );
}
