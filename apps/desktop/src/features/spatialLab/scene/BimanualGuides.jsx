import { useFrame } from "@react-three/fiber";
import { useRef } from "react";
import * as THREE from "three";
import { normToWorld } from "../engine/spatialMapping.js";

function readInput(inputRef) {
  return inputRef.current ?? {};
}

function handMarker(pinch, color) {
  if (!pinch) return null;
  const nx = pinch.x * 2 - 1;
  const ny = -(pinch.y * 2 - 1);
  return normToWorld(nx, ny, (pinch.z ?? 0) * 2);
}

/** Izquierda = ámbar (pinza) · Derecha = violeta/cian (giro) */
export function BimanualGuides({ inputRef }) {
  const leftRef = useRef(null);
  const rightRef = useRef(null);
  const arcRef = useRef(null);

  useFrame((state) => {
    const { spatial, continuum } = readInput(inputRef);
    const show = spatial?.bimanual?.bothVisible;
    const t = state.clock.elapsedTime;

    if (leftRef.current) leftRef.current.visible = show;
    if (rightRef.current) rightRef.current.visible = show;
    if (arcRef.current) arcRef.current.visible = show;

    if (!show) return;

    const lw = handMarker(spatial.leftPinch ?? spatial.left?.pinch, "#ffb347");
    const rw = handMarker(spatial.right?.pinch ?? spatial.right?.palm, "#b388ff");

    if (leftRef.current && lw) {
      leftRef.current.position.set(lw.x, lw.y, lw.z);
      leftRef.current.scale.setScalar(spatial.leftPinch?.active ? 1.15 : 0.92);
    }
    if (rightRef.current && rw) {
      rightRef.current.position.set(rw.x, rw.y, rw.z);
      rightRef.current.scale.setScalar(continuum?.palmDrive ? 1.12 : 1);
      if (rightRef.current.material) {
        rightRef.current.material.opacity = continuum?.palmDrive ? 0.82 : 0.58;
      }
    }

    if (arcRef.current) {
      arcRef.current.rotation.z = t * 0.12;
      arcRef.current.position.y = 0.2;
    }
  });

  return (
    <group>
      <mesh ref={leftRef} visible={false}>
        <octahedronGeometry args={[0.11, 0]} />
        <meshBasicMaterial color="#ffb347" transparent opacity={0.92} wireframe />
      </mesh>
      <mesh ref={rightRef} visible={false}>
        <torusGeometry args={[0.14, 0.035, 10, 32]} />
        <meshBasicMaterial color="#c77dff" transparent opacity={0.85} />
      </mesh>
      <mesh ref={arcRef} visible={false} rotation={[Math.PI * 0.5, 0, 0]}>
        <torusGeometry args={[0.55, 0.01, 8, 48]} />
        <meshBasicMaterial color="#62e9ff" transparent opacity={0.4} />
      </mesh>
    </group>
  );
}
