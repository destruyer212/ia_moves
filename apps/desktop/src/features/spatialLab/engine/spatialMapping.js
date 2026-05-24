/** Landmarks MediaPipe → coordenadas espaciales normalizadas (mundo 3D) */

import { measureHandScale } from "./handMetrics.js";
import { pinchThresholdForScale, stablePalmNorm } from "./landmarkStabilizer.js";
import { resolveBimanualHands } from "./handRoles.js";

export function pinchFromLandmarks(hand) {
  if (!hand || hand.length < 9) return null;
  const thumb = hand[4];
  const index = hand[8];
  const distance = Math.hypot(thumb.x - index.x, thumb.y - index.y);
  const scale = measureHandScale(hand);
  const rel = distance / Math.max(scale, 0.06);
  const threshold = pinchThresholdForScale(scale);
  return {
    x: 1 - (thumb.x + index.x) * 0.5,
    y: (thumb.y + index.y) * 0.5,
    z: ((thumb.z ?? 0) + (index.z ?? 0)) * 0.5,
    distance,
    relDistance: rel,
    active: rel < 0.52 || distance < threshold,
  };
}

export function palmCenter(hand) {
  if (!hand?.length) return null;
  const w = hand[0];
  const m = hand[9] ?? hand[5];
  return {
    x: 1 - (w.x * 0.35 + m.x * 0.65),
    y: w.y * 0.25 + m.y * 0.75,
    z: (w.z ?? 0) * 0.35 + (m.z ?? 0) * 0.65,
  };
}

/** [-1,1] x/y, z relativo — listo para escalar en Three.js */
export function normToWorld(nx, ny, nz = 0, scale = { x: 5.2, y: 3.6, z: 2.6 }) {
  return {
    x: nx * scale.x,
    y: ny * scale.y,
    z: nz * scale.z,
  };
}

export function mapHandToSpatial(hand, proximity = null) {
  const palm = palmCenter(hand);
  if (!palm) return null;
  const stableNorm = stablePalmNorm(hand);
  const useStable = proximity?.nearCamera || (proximity?.quality ?? 1) < 0.75;
  const norm = useStable && stableNorm ? stableNorm : {
    x: palm.x * 2 - 1,
    y: -(palm.y * 2 - 1),
    z: (palm.z ?? 0) * 2,
  };
  const nx = norm.x;
  const ny = norm.y;
  const nz = norm.z ?? (palm.z ?? 0) * 2;
  return {
    palm: normToWorld(nx, ny, nz),
    norm: { x: nx, y: ny, z: nz },
    pinch: pinchFromLandmarks(hand),
    wrist: hand[0]
      ? normToWorld((1 - hand[0].x) * 2 - 1, -(hand[0].y * 2 - 1), (hand[0].z ?? 0) * 2)
      : null,
    proximity,
  };
}

export function mapHandsToSpatial(hands, proximities = [], handednesses = []) {
  const list = hands?.slice(0, 2) ?? [];
  const bimanual = resolveBimanualHands(list, proximities, handednesses);

  const left = bimanual.left
    ? mapHandToSpatial(bimanual.left.hand, bimanual.left.proximity)
    : null;
  const right = bimanual.right
    ? mapHandToSpatial(bimanual.right.hand, bimanual.right.proximity)
    : null;

  const primary = left ?? right ?? (list[0] ? mapHandToSpatial(list[0], proximities[0]) : null);
  const secondary = right ?? (list[1] ? mapHandToSpatial(list[1], proximities[1]) : null);
  const primaryProx = left?.proximity ?? proximities[0] ?? primary?.proximity ?? null;

  let handSpan = 0;
  if (list.length >= 2 && list[0][9] && list[1][9]) {
    const a = list[0][9];
    const b = list[1][9];
    handSpan = Math.hypot(a.x - b.x, a.y - b.y);
  }

  let palmSpeed = 0;
  if (primary?.norm) {
    palmSpeed = Math.hypot(primary.norm.x, primary.norm.y);
  }

  return {
    primary,
    secondary,
    left,
    right,
    leftPinch: left?.pinch ?? null,
    rightPinch: right?.pinch ?? null,
    primaryPinch: left?.pinch ?? primary?.pinch ?? null,
    secondaryPinch: right?.pinch ?? secondary?.pinch ?? null,
    handSpan,
    twoHands: list.length >= 2,
    bimanual,
    palmSpeed,
    proximity: primaryProx,
    nearCamera: !!primaryProx?.nearCamera || proximities.some((p) => p?.nearCamera),
  };
}
