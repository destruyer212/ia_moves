import { useFrame } from "@react-three/fiber";
import { useRef } from "react";
import * as THREE from "three";
import { normToWorld } from "../engine/spatialMapping.js";

function readInput(inputRef) {
  return inputRef.current ?? {};
}

/** Marcadores en cada pinza + línea (zoom con dos manos) */
export function DualHandGuide({ inputRef }) {
  const g0 = useRef(null);
  const g1 = useRef(null);
  const lineRef = useRef(null);

  useFrame(() => {
    const { dual, continuum } = readInput(inputRef);
    const show = dual?.active;
    if (g0.current) g0.current.visible = show;
    if (g1.current) g1.current.visible = show;
    if (lineRef.current) lineRef.current.visible = show && dual?.dualPinch;

    if (!show || !dual) return;

    const p0 = dual.pinch0 ?? dual.center;
    const p1 = dual.pinch1 ?? dual.center;
    const w0 = normToWorld(p0.x * 2 - 1, -(p0.y * 2 - 1), (p0.z ?? 0) * 2);
    const w1 = normToWorld(p1.x * 2 - 1, -(p1.y * 2 - 1), (p1.z ?? 0) * 2);

    const col = dual.dualPinch ? "#45ffb1" : "#62e9ff";
    if (g0.current) {
      g0.current.position.set(w0.x, w0.y, w0.z);
      g0.current.material.color.set(col);
      g0.current.scale.setScalar(dual.dualPinch ? 1.2 : 0.85);
    }
    if (g1.current) {
      g1.current.position.set(w1.x, w1.y, w1.z);
      g1.current.material.color.set(col);
      g1.current.scale.setScalar(dual.dualPinch ? 1.2 : 0.85);
    }

    if (lineRef.current?.geometry) {
      const pos = lineRef.current.geometry.attributes.position;
      pos.setXYZ(0, w0.x, w0.y, w0.z);
      pos.setXYZ(1, w1.x, w1.y, w1.z);
      pos.needsUpdate = true;
      lineRef.current.material.color.set(col);
    }
  });

  return (
    <group>
      <mesh ref={g0} visible={false}>
        <sphereGeometry args={[1, 12, 12]} />
        <meshBasicMaterial color="#62e9ff" transparent opacity={0.9} />
      </mesh>
      <mesh ref={g1} visible={false}>
        <sphereGeometry args={[1, 12, 12]} />
        <meshBasicMaterial color="#62e9ff" transparent opacity={0.9} />
      </mesh>
      <line ref={lineRef} visible={false}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" count={2} array={new Float32Array(6)} itemSize={3} />
        </bufferGeometry>
        <lineBasicMaterial color="#45ffb1" transparent opacity={0.75} linewidth={2} />
      </line>
    </group>
  );
}
