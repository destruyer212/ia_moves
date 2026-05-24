import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";
import { INTERACTION_MODES } from "../engine/gestureStateMachine.js";

function readInput(inputRef) {
  return inputRef.current ?? {};
}

export function ReactiveParticleField({ inputRef, count = 1600 }) {
  const pointsRef = useRef(null);
  const base = useMemo(() => {
    const pos = new Float32Array(count * 3);
    const vel = new Float32Array(count * 3);
    for (let i = 0; i < count; i += 1) {
      const r = 2 + Math.random() * 11;
      const theta = Math.random() * Math.PI * 2;
      const phi = (Math.random() - 0.5) * Math.PI;
      pos[i * 3] = Math.cos(theta) * Math.cos(phi) * r;
      pos[i * 3 + 1] = Math.sin(phi) * r * 0.6;
      pos[i * 3 + 2] = Math.sin(theta) * Math.cos(phi) * r - 1;
    }
    return { pos, vel };
  }, [count]);

  useFrame((state, delta) => {
    const pts = pointsRef.current;
    if (!pts) return;
    const snap = readInput(inputRef);
    const { interaction, spatial, continuum } = snap;
    const palm = spatial?.primary?.palm;
    const frozen = continuum?.idle === true;
    const pinch = spatial?.leftPinch?.active || spatial?.rightPinch?.active;
    const calm = frozen || pinch;
    const strength = calm ? 0.04 : (interaction?.fieldStrength ?? 0.12) * 0.65;
    const pushBoost = calm ? 1 : continuum?.pushing ? 1.12 : 1;
    const dt = Math.min(delta, 0.05);
    const t = state.clock.elapsedTime;
    const attr = pts.geometry.attributes.position;
    const arr = attr.array;

    for (let i = 0; i < count; i += 1) {
      const ix = i * 3;
      let vx = base.vel[ix] + Math.sin(t * 0.25 + i * 0.07) * 0.00035;
      let vy = base.vel[ix + 1] + Math.cos(t * 0.22 + i * 0.05) * 0.00035;
      let vz = base.vel[ix + 2];

      if (palm && !frozen && interaction?.mode !== INTERACTION_MODES.IDLE) {
        const dx = palm.x - arr[ix];
        const dy = palm.y - arr[ix + 1];
        const dz = palm.z - arr[ix + 2];
        const dist = Math.hypot(dx, dy, dz) + 0.04;
        const sign = interaction.mode === INTERACTION_MODES.FORCE ? -1.2 : 1;
        const pull = sign * strength * 0.62 * pushBoost / dist;
        vx += dx * pull * dt;
        vy += dy * pull * dt;
        vz += dz * pull * 0.4 * dt;
      }

      if (!calm && interaction?.mode === INTERACTION_MODES.FIELD) {
        vx += (Math.random() - 0.5) * 0.012 * strength;
        vy += (Math.random() - 0.5) * 0.012 * strength;
        vz += (Math.random() - 0.5) * 0.008 * strength;
      }

      arr[ix] += vx;
      arr[ix + 1] += vy;
      arr[ix + 2] += vz;
      base.vel[ix] = vx * 0.93;
      base.vel[ix + 1] = vy * 0.93;
      base.vel[ix + 2] = vz * 0.93;

      const lim = 6.5;
      if (Math.abs(arr[ix]) > lim) arr[ix] *= 0.9;
      if (Math.abs(arr[ix + 1]) > lim * 0.55) arr[ix + 1] *= 0.9;
      if (arr[ix + 2] > 2.5 || arr[ix + 2] < -5) arr[ix + 2] *= 0.88;
    }
    attr.needsUpdate = true;
    pts.rotation.y = t * 0.012;
  });

  return (
    <points ref={pointsRef} frustumCulled={false}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[base.pos.slice(), 3]} />
      </bufferGeometry>
      <pointsMaterial
        color="#8ef4ff"
        size={0.038}
        transparent
        opacity={0.48}
        sizeAttenuation
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </points>
  );
}

/** Anillo de partículas orbitando el planeta */
export function PlanetParticleRing({ radius = 1.55 }) {
  const ref = useRef(null);
  const count = 320;
  const positions = useMemo(() => {
    const arr = new Float32Array(count * 3);
    for (let i = 0; i < count; i += 1) {
      const a = (i / count) * Math.PI * 2;
      arr[i * 3] = Math.cos(a) * radius;
      arr[i * 3 + 1] = (Math.random() - 0.5) * 0.08;
      arr[i * 3 + 2] = Math.sin(a) * radius;
    }
    return arr;
  }, [radius]);

  useFrame((state) => {
    if (ref.current) ref.current.rotation.y = state.clock.elapsedTime * 0.25;
  });

  return (
    <points ref={ref}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      <pointsMaterial
        color="#45ffb1"
        size={0.028}
        transparent
        opacity={0.65}
        sizeAttenuation
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </points>
  );
}
