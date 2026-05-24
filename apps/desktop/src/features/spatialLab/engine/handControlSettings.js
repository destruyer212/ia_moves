const STORAGE_KEY = "ia_moves_spatial_hand_config_v1";

export const DEFAULT_HAND_CONFIG = {
  orbitSpeed: 8,
  zoomSpeed: 7,
  panSpeed: 5,
  pinchDirectionBoost: 8,
  smoothing: 4,
  stillness: 2,
  invertOrbitX: false,
  invertOrbitY: false,
  enablePostFX: false,
  swapHands: false,
};

let active = { ...DEFAULT_HAND_CONFIG };
let listeners = new Set();

function clampNum(v, lo, hi) {
  return Math.min(hi, Math.max(lo, v));
}

function sanitize(cfg) {
  const out = { ...DEFAULT_HAND_CONFIG };
  for (const key of Object.keys(DEFAULT_HAND_CONFIG)) {
    const v = cfg[key];
    if (typeof DEFAULT_HAND_CONFIG[key] === "boolean") {
      out[key] = !!v;
    } else {
      const n = Number(v);
      out[key] = Number.isFinite(n) ? n : DEFAULT_HAND_CONFIG[key];
    }
  }
  return out;
}

export function loadHandControlConfig() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_HAND_CONFIG };
    return sanitize({ ...DEFAULT_HAND_CONFIG, ...JSON.parse(raw) });
  } catch {
    return { ...DEFAULT_HAND_CONFIG };
  }
}

export function saveHandControlConfig(cfg) {
  active = { ...active, ...cfg };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(active));
  } catch {
    /* ignore */
  }
  listeners.forEach((fn) => fn(active));
  return active;
}

export function resetHandControlConfig() {
  active = { ...DEFAULT_HAND_CONFIG };
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
  listeners.forEach((fn) => fn(active));
  return active;
}

export function getHandControlConfig() {
  return active;
}

export function subscribeHandControlConfig(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

active = loadHandControlConfig();

/** Coeficientes derivados para el motor de gestos */
export function handControlCoeffs(cfg = active) {
  const orbit = clampNum(cfg.orbitSpeed, 1, 10) / 5;
  const zoom = clampNum(cfg.zoomSpeed, 1, 10) / 6;
  const pan = clampNum(cfg.panSpeed, 1, 10) / 5;
  const pinch = clampNum(cfg.pinchDirectionBoost, 1, 10) / 5;
  const smooth = clampNum(cfg.smoothing, 1, 10);

  return {
    orbitGain: orbit * 1.35,
    zoomGain: zoom * 1.25,
    panGain: pan * 1.2,
    pinchOrbitBoost: pinch * 1.2,
    smoothAlpha: 0.14 + (1 - smooth / 10) * 0.32,
    maxStep: 0.038 + orbit * 0.055,
    stillnessEnterFrames: Math.round(28 - smooth * 1.4),
    deadZone: 0.0025 - smooth * 0.00015,
    invertOrbitX: !!cfg.invertOrbitX,
    invertOrbitY: !!cfg.invertOrbitY,
  };
}
