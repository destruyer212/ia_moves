/**
 * Estabilización de landmarks: mano muy cerca, saltos de frame y pérdidas breves.
 */

import { measureHandScale } from "./handMetrics.js";
import { stillnessDampAlpha } from "./stillnessGate.js";

const HOLD_MS = 200;
const NEAR_SCALE = 0.26;
const FAR_SCALE = 0.07;

function clamp(v, lo, hi) {
  return Math.min(hi, Math.max(lo, v));
}

function clampPoint(p) {
  return {
    x: clamp(p.x, 0.02, 0.98),
    y: clamp(p.y, 0.02, 0.98),
    z: p.z ?? 0,
  };
}

/** Caja de la mano en coords normalizadas de imagen */
export function handBounds(hand) {
  if (!hand?.length) return null;
  let minX = 1;
  let minY = 1;
  let maxX = 0;
  let maxY = 0;
  for (const p of hand) {
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  }
  return {
    minX,
    minY,
    maxX,
    maxY,
    width: maxX - minX,
    height: maxY - minY,
  };
}

export function analyzeHandProximity(hand) {
  const scale = measureHandScale(hand);
  const bounds = handBounds(hand);
  if (!bounds) {
    return { scale: 0, nearCamera: false, inFrame: true, quality: 0 };
  }

  const inFrame =
    bounds.minX > 0.01 &&
    bounds.maxX < 0.99 &&
    bounds.minY > 0.01 &&
    bounds.maxY < 0.99;

  const nearCamera = scale >= NEAR_SCALE || bounds.width > 0.55 || bounds.height > 0.62;
  const farCamera = scale <= FAR_SCALE;

  let quality = 1;
  if (!inFrame) quality *= 0.45;
  if (nearCamera) quality *= 0.72;
  if (bounds.width > 0.72) quality *= 0.35;

  return { scale, nearCamera, farCamera, inFrame, quality, bounds };
}

/** Suaviza landmarks; limita saltos cuando la mano está pegada a la lente */
function handMotionSpeed(hand, prevHand) {
  if (!hand?.length || !prevHand?.length) return 0;
  const i = 9;
  return Math.hypot(hand[i].x - prevHand[i].x, hand[i].y - prevHand[i].y);
}

export function stabilizeHandLandmarks(hand, prevHand, forceIdle = false) {
  if (!hand?.length) return null;

  const prox = analyzeHandProximity(hand);
  const motion = handMotionSpeed(hand, prevHand);
  const microStill = forceIdle || motion < 0.004;
  let alpha = prox.nearCamera ? 0.24 : prox.quality < 0.6 ? 0.28 : 0.34;
  if (microStill) alpha = 0.09;
  alpha = stillnessDampAlpha(microStill, alpha);

  let out;
  if (!prevHand?.length || prevHand.length !== hand.length) {
    out = hand.map((p) => clampPoint(p));
  } else {
    out = hand.map((p, i) => {
      const ph = prevHand[i];
      let x = ph.x + (p.x - ph.x) * alpha;
      let y = ph.y + (p.y - ph.y) * alpha;
      let z = (ph.z ?? 0) + ((p.z ?? 0) - (ph.z ?? 0)) * alpha;

      const jump = Math.hypot(p.x - ph.x, p.y - ph.y);
      const maxJump = prox.nearCamera ? 0.045 : 0.09;
      if (jump > maxJump) {
        x = ph.x + (p.x - ph.x) * (maxJump / jump);
        y = ph.y + (p.y - ph.y) * (maxJump / jump);
      }

      return clampPoint({ x, y, z });
    });
  }

  return { hand: out, proximity: prox };
}

const holdState = { hands: null, prev: null, until: 0 };

export function stabilizeHandsForSpatial(hands, trackRef) {
  const now = performance.now();
  const track = trackRef?.current;

  if (!hands?.length) {
    if (holdState.hands && now < holdState.until) {
      return holdState.hands;
    }
    holdState.hands = null;
    holdState.prev = null;
    return [];
  }

  const prevList = holdState.prev ?? track?.spatialPrevHands ?? null;
  const stabilized = [];
  const proximities = [];

  for (let i = 0; i < hands.length; i++) {
    const res = stabilizeHandLandmarks(hands[i], prevList?.[i]);
    if (res) {
      stabilized.push(res.hand);
      proximities.push(res.proximity);
    }
  }

  holdState.hands = stabilized;
  holdState.prev = stabilized.map((h) => h.map((p) => ({ ...p })));
  holdState.until = now + HOLD_MS;

  if (track) {
    track.spatialPrevHands = holdState.prev;
    track.spatialProximity = proximities;
  }

  return stabilized;
}

/** Norma de palma estable: menos drift cuando la mano llena el encuadre */
export function stablePalmNorm(hand) {
  if (!hand?.length) return null;
  const w = hand[0];
  const m = hand[9] ?? hand[5];
  const scale = Math.max(measureHandScale(hand), 0.08);

  const ux = (m.x - w.x) / scale;
  const uy = (m.y - w.y) / scale;

  const cx = 1 - w.x + ux * 0.11;
  const cy = w.y * 0.28 + m.y * 0.72 + uy * 0.09;

  return {
    x: clamp(cx * 2 - 1, -0.92, 0.92),
    y: clamp(-(cy * 2 - 1), -0.92, 0.92),
    z: clamp((m.z ?? 0) * 2, -0.6, 0.6),
  };
}

/** Actualiza baseline de profundidad sin disparos al acercar la mano */
export function updateDepthBaseline(state, scale, proximity, gestureName) {
  if (!scale || scale < 0.02) return state.baselineScale;

  if (!state.baselineScale) {
    state.baselineScale = scale;
    return scale;
  }

  const ratio = scale / state.baselineScale;

  if (proximity?.nearCamera) {
    if (ratio > 1.2) {
      state.baselineScale += (scale - state.baselineScale) * 0.04;
    }
    return state.baselineScale;
  }

  if (ratio > 1.45 || ratio < 0.62) {
    const pull = Math.log(ratio) * 0.06;
    state.baselineScale *= 1 + clamp(pull, -0.035, 0.035);
    return state.baselineScale;
  }

  if (gestureName === "open_palm" || gestureName === "unknown") {
    state.baselineScale = state.baselineScale * 0.996 + scale * 0.004;
  }

  return state.baselineScale;
}

export function depthRatioFromBaseline(baseline, scale, proximity) {
  if (!baseline || baseline < 1e-4) return 1;
  let ratio = scale / baseline;
  ratio = clamp(ratio, 0.7, 1.45);
  if (proximity?.nearCamera) {
    ratio = clamp(ratio, 0.78, 1.28);
  }
  return ratio;
}

/** Pinch relativo al tamaño de la mano (válido cerca de la cámara) */
export function pinchThresholdForScale(scale) {
  const base = 0.072;
  return clamp(base * (0.14 / Math.max(scale, 0.1)), 0.048, 0.11);
}

export function resetLandmarkStabilizer(trackRef) {
  holdState.hands = null;
  holdState.prev = null;
  holdState.until = 0;
  const track = trackRef?.current;
  if (track) {
    track.spatialPrevHands = null;
    track.spatialProximity = null;
  }
}
