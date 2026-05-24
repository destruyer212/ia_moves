/**
 * Asigna mano izquierda / derecha (vista espejo de webcam).
 * MediaPipe handedness: "Left" = mano izquierda de la persona.
 */

import { getHandControlConfig } from "./handControlSettings.js";

/** Webcam espejada: muñeca a la izquierda del frame ≈ mano derecha del usuario. */
function inferSideFromWrist(hand) {
  if (!hand?.[0]) return "unknown";
  return hand[0].x < 0.52 ? "right" : "left";
}

function normalizeSide(label) {
  const s = String(label ?? "").toLowerCase();
  if (s.startsWith("left")) return "left";
  if (s.startsWith("right")) return "right";
  return "unknown";
}

export function resolveBimanualHands(hands, proximities = [], handednesses = []) {
  if (!hands?.length) {
    return { left: null, right: null, bothVisible: false, ordered: [] };
  }

  const tagged = hands.map((hand, i) => ({
    hand,
    proximity: proximities[i] ?? null,
    side: normalizeSide(handednesses[i]) !== "unknown"
      ? normalizeSide(handednesses[i])
      : inferSideFromWrist(hand),
  }));

  let left = tagged.find((t) => t.side === "left") ?? null;
  let right = tagged.find((t) => t.side === "right") ?? null;

  if (hands.length >= 2 && (!left || !right)) {
    const sorted = [...tagged].sort((a, b) => b.hand[0].x - a.hand[0].x);
    left = left ?? sorted[0];
    right = right ?? sorted[1];
    if (left === right) right = sorted.find((t) => t !== left) ?? null;
  }

  if (hands.length === 1) {
    const only = tagged[0];
    if (only.side === "left") left = only;
    else if (only.side === "right") right = only;
    else left = only;
  }

  const bothVisible = !!(left && right);

  let leftOut = left ? { hand: left.hand, proximity: left.proximity, side: "left" } : null;
  let rightOut = right ? { hand: right.hand, proximity: right.proximity, side: "right" } : null;

  if (getHandControlConfig().swapHands) {
    const tmp = leftOut;
    leftOut = rightOut;
    rightOut = tmp;
  }

  return {
    left: leftOut,
    right: rightOut,
    bothVisible,
    ordered: [leftOut?.hand, rightOut?.hand].filter(Boolean),
  };
}

/** Inclinación de la mano en el plano imagen → roll de cámara */
export function handRollRadians(hand) {
  if (!hand?.[9] || !hand?.[0]) return 0;
  const w = hand[0];
  const m = hand[9];
  return Math.atan2(m.y - w.y, m.x - w.x);
}
