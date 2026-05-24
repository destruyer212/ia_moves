import { measureHandScale } from "./handMetrics.js";
import { pinchFromLandmarks, palmCenter } from "./spatialMapping.js";

/** Métricas de dos manos — pinch spread, centro, ángulo (como multitáctil) */
export function mapDualHandMetrics(hands, spatial) {
  if (!hands?.length || hands.length < 2) {
    return { active: false };
  }

  const h0 = hands[0];
  const h1 = hands[1];
  const pinch0 = spatial.primaryPinch ?? pinchFromLandmarks(h0);
  const pinch1 = spatial.secondaryPinch ?? pinchFromLandmarks(h1);
  const dualPinch = !!(pinch0?.active && pinch1?.active);

  const c0 = pinch0 ?? palmCenter(h0);
  const c1 = pinch1 ?? palmCenter(h1);
  if (!c0 || !c1) return { active: false };

  const pinchSpan = Math.hypot(c0.x - c1.x, c0.y - c1.y);
  const palmSpan = spatial.handSpan ?? pinchSpan;

  const center = {
    x: (c0.x + c1.x) * 0.5,
    y: (c0.y + c1.y) * 0.5,
    z: ((c0.z ?? 0) + (c1.z ?? 0)) * 0.5,
  };

  const angle = Math.atan2(c1.y - c0.y, c1.x - c0.x);
  const avgDepth = (measureHandScale(h0) + measureHandScale(h1)) * 0.5;

  const normCenter = {
    x: center.x * 2 - 1,
    y: -(center.y * 2 - 1),
  };

  return {
    active: true,
    dualPinch,
    pinchSpan,
    palmSpan,
    center,
    normCenter,
    angle,
    avgDepth,
    pinch0,
    pinch1,
  };
}
