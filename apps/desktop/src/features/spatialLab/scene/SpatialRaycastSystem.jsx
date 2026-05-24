import { useFrame, useThree } from "@react-three/fiber";
import { useRef } from "react";
import { INTERACTION_MODES } from "../engine/gestureStateMachine.js";
import { pickTargetLabel, raycastSpatialTargets } from "../engine/spatialRaycast.js";

function readInput(inputRef) {
  return inputRef.current ?? {};
}

/** Spatial raycast — gesto point selecciona nodos / planeta / bloques */
export function SpatialRaycastSystem({ inputRef, sceneStateRef }) {
  const lastPickRef = useRef(null);

  const { camera, scene } = useThree();

  useFrame(() => {
    const snap = readInput(inputRef);
    const { interaction, hands } = snap;

    if (interaction?.mode === INTERACTION_MODES.POINT && hands?.[0]) {
      const { hit } = raycastSpatialTargets(camera, scene, hands[0]);
      const pick = pickTargetLabel(hit);
      sceneStateRef.current.selectedNodeId = pick?.id ?? null;
      sceneStateRef.current.selectedLabel = pick?.label ?? null;
      lastPickRef.current = pick;
      return;
    }

    if (interaction?.mode !== INTERACTION_MODES.GRAB) {
      sceneStateRef.current.selectedNodeId = sceneStateRef.current.selectedNodeId ?? null;
    }
  });

  return null;
}
