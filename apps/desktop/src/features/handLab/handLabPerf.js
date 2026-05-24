/** Presets de rendimiento — turbo prioriza latencia de gesto sobre densidad visual */

export const PERF_PARTICLES = {
  turbo: 28,
  low: 70,
  medium: 200,
  cinematic: 420,
};

export const PERF_MESH_NODES = {
  turbo: 10,
  low: 18,
  medium: 28,
  cinematic: 36,
};

export const PERF_TARGET_FPS = {
  turbo: 30,
  low: 24,
  medium: 30,
  cinematic: 45,
};

export const PERF_DPR_CAP = {
  turbo: 1,
  low: 1,
  medium: 1.15,
  cinematic: 1.35,
};

/** Ancho máx. del frame enviado al worker MediaPipe (menos px = menos ms de inferencia) */
export const PERF_INFERENCE_WIDTH = {
  turbo: 320,
  low: 420,
  medium: 520,
  cinematic: 640,
};

export function getParticleCount(tier) {
  return PERF_PARTICLES[tier] ?? PERF_PARTICLES.medium;
}

export function getMeshNodeCount(tier) {
  return PERF_MESH_NODES[tier] ?? PERF_MESH_NODES.medium;
}

export function getTargetFps(tier) {
  return PERF_TARGET_FPS[tier] ?? PERF_TARGET_FPS.medium;
}

export function getDprCap(tier) {
  return PERF_DPR_CAP[tier] ?? PERF_DPR_CAP.medium;
}

export function getInferenceMaxWidth(tier) {
  return PERF_INFERENCE_WIDTH[tier] ?? PERF_INFERENCE_WIDTH.turbo;
}
