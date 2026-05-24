import { getFluidDisplayHands } from "../../handLab/handMotion.js";
import { deriveInteractionState } from "./gestureStateMachine.js";
import { stabilizeHandsForSpatial } from "./landmarkStabilizer.js";
import { updateSpatialContinuum } from "./spatialContinuum.js";
import { mapHandsToSpatial } from "./spatialMapping.js";

/** Fusiona vision layer + gesture engine → snapshot para rendering/physics */
export function buildSpatialInput(trackingRef) {
  const track = trackingRef?.current ?? {};
  const gesture = track.gesture ?? { name: "unknown", confidence: 0, active: false };
  const raw = getFluidDisplayHands(track, performance.now(), { calm: true });
  const hands = stabilizeHandsForSpatial(raw, trackingRef);
  const proximities = track.spatialProximity ?? [];
  const spatial = mapHandsToSpatial(hands, proximities, track.handednesses ?? []);
  const continuum = updateSpatialContinuum(hands, gesture, spatial);
  const interaction = deriveInteractionState(gesture, spatial, continuum);

  const hintLabel = continuum?.label || interaction?.label;

  return {
    ts: performance.now(),
    hands,
    spatial,
    continuum,
    interaction: { ...interaction, label: hintLabel },
    gesture: gesture ?? { name: "unknown", confidence: 0 },
    cameraOn: !!track.cameraOn,
  };
}
