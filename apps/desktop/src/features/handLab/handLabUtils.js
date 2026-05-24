import {
  PERF_PARTICLES,
  getParticleCount as getParticleCountPerf,
} from "./handLabPerf.js";

/** MediaPipe hand topology — same as legacy App.jsx */
export const HAND_CONNECTIONS = [
  [0, 1], [1, 2], [2, 3], [3, 4],
  [0, 5], [5, 6], [6, 7], [7, 8],
  [5, 9], [9, 10], [10, 11], [11, 12],
  [9, 13], [13, 14], [14, 15], [15, 16],
  [13, 17], [17, 18], [18, 19], [19, 20],
  [0, 17],
];

export const PERF_STORAGE_KEY = "ia_moves_hand_lab_perf_v1";

/** @deprecated usar handLabPerf — mantenido para localStorage */
export const PERF_PRESETS = PERF_PARTICLES;

export function getParticleCount(tier) {
  return getParticleCountPerf(tier);
}

/** Etiquetas estilo red de conocimiento (inspiración AR, sin copiar textos de referencia) */
export const NEURAL_NODE_LABELS = [
  "Vector sigma",
  "Campo gestual",
  "Ancla pinch",
  "Manifold A",
  "Nodo lambda",
  "Enlace táctil",
  "Capa órbita",
  "Pulso índice",
  "Matriz HUD",
  "Flujo neural",
  "Tensor mano",
  "Isócrona",
  "Bucle feedback",
  "Fase delta",
  "Umbral lock",
  "Eje palma",
  "Cluster vivo",
  "Sync WS",
];

export function loadPerfTier() {
  try {
    const v = window.localStorage.getItem(PERF_STORAGE_KEY);
    if (v && PERF_PARTICLES[v]) return v;
  } catch {
    /* ignore */
  }
  return "turbo";
}

export function savePerfTier(tier) {
  try {
    if (PERF_PARTICLES[tier]) window.localStorage.setItem(PERF_STORAGE_KEY, tier);
  } catch {
    /* ignore */
  }
}

export function atomDisplayLabel(atom, index) {
  if (atom?.label) return atom.label;
  const n = parseInt(String(atom?.id ?? "").replace(/\D/g, ""), 10);
  const i = Number.isFinite(n) ? n - 1 : index;
  return NEURAL_NODE_LABELS[i % NEURAL_NODE_LABELS.length];
}

/** Punto focal espejado (misma convención que pinch / vídeo) */
export function focalPointFromHands(hands, gesture) {
  if (!hands?.length) return { x: 0.5, y: 0.52 };
  const hand = hands[0];
  if (gesture?.name === "point" && hand?.[8]) {
    return { x: 1 - hand[8].x, y: hand[8].y };
  }
  const pinch = pinchFromHand(hand);
  if (pinch) return { x: pinch.x, y: pinch.y };
  if (hand?.[9]) return { x: 1 - hand[9].x, y: hand[9].y };
  if (hand?.[0]) return { x: 1 - hand[0].x, y: hand[0].y };
  return { x: 0.5, y: 0.52 };
}

export function computeNearbyNodes(atoms, focal, limit = 6) {
  if (!atoms?.length) return [];
  return atoms
    .map((atom, index) => {
      const ax = 1 - atom.x;
      const ay = atom.y;
      const dist = Math.hypot(ax - focal.x, ay - focal.y);
      const weight = Math.max(0, 1 - dist * 2.8);
      return {
        id: atom.id,
        label: atomDisplayLabel(atom, index),
        dist,
        weight: Math.round(weight * 100),
        hue: atom.hue ?? 190,
      };
    })
    .sort((a, b) => a.dist - b.dist)
    .slice(0, limit);
}

/** Gesture → HUD accent (neon) */
export function gesturePalette(name) {
  switch (name) {
    case "open_palm":
      return {
        primary: "rgba(0, 245, 212, 0.95)",
        secondary: "rgba(120, 255, 220, 0.65)",
        line: "rgba(0, 255, 234, 0.75)",
      };
    case "fist":
      return {
        primary: "rgba(255, 120, 80, 0.9)",
        secondary: "rgba(255, 180, 90, 0.55)",
        line: "rgba(255, 140, 70, 0.7)",
      };
    case "point":
      return {
        primary: "rgba(160, 120, 255, 0.95)",
        secondary: "rgba(200, 160, 255, 0.6)",
        line: "rgba(180, 130, 255, 0.85)",
      };
    case "pinch":
    case "thumb_up":
      return {
        primary: "rgba(69, 255, 177, 0.95)",
        secondary: "rgba(180, 255, 210, 0.65)",
        line: "rgba(69, 255, 177, 0.8)",
      };
    case "victory":
      return {
        primary: "rgba(255, 220, 90, 0.95)",
        secondary: "rgba(255, 240, 160, 0.65)",
        line: "rgba(255, 210, 100, 0.85)",
      };
    default:
      return {
        primary: "rgba(98, 233, 255, 0.92)",
        secondary: "rgba(140, 220, 255, 0.55)",
        line: "rgba(98, 233, 255, 0.72)",
      };
  }
}

export function pinchFromHand(hand) {
  if (!hand || hand.length < 9) return null;
  const thumb = hand[4];
  const index = hand[8];
  const distance = Math.hypot(thumb.x - index.x, thumb.y - index.y);
  return {
    x: 1 - ((thumb.x + index.x) * 0.5),
    y: (thumb.y + index.y) * 0.5,
    distance,
    active: distance < 0.055,
  };
}

export function triModeLabel(idx) {
  return ["LAB", "COMANDOS", "MOUSE"][idx] ?? "—";
}

export function fieldStateLabel(gestureName) {
  switch (gestureName) {
    case "open_palm":
      return "FIELD EXPANSION";
    case "fist":
      return "GRAVITY COLLAPSE";
    case "point":
      return "TARGET LOCK";
    case "victory":
      return "MODE VECTOR";
    case "thumb_up":
      return "CONFIRM PULSE";
    default:
      return "FIELD IDLE";
  }
}

export function zoomPercentFromGesture(gestureName, spread = 0.14) {
  const base = 100;
  if (gestureName === "open_palm") return Math.round(base + spread * 280);
  if (gestureName === "fist") return Math.round(base - 35);
  if (gestureName === "point") return Math.round(base + 45);
  if (gestureName === "pinch") return Math.round(base + 60);
  return Math.round(base + spread * 120);
}
