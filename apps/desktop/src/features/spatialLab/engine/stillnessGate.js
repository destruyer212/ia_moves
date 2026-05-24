/**
 * Quietud por canal: zoom (escala) y órbita (norma) no se bloquean entre sí.
 */

const zoomGate = { idle: false, calmFrames: 0, moveFrames: 0, lastScale: null };
const orbitGate = { idle: false, calmFrames: 0, moveFrames: 0, lastNorm: null };

const ENTER_CALM = 28;
const EXIT_MOVE = 2;
const IDLE_SCALE = 0.004;
const EXIT_SCALE = 0.012;
const IDLE_NORM = 0.003;
const EXIT_NORM = 0.01;

export function resetStillnessGate() {
  zoomGate.idle = false;
  zoomGate.calmFrames = 0;
  zoomGate.moveFrames = 0;
  zoomGate.lastScale = null;
  orbitGate.idle = false;
  orbitGate.calmFrames = 0;
  orbitGate.moveFrames = 0;
  orbitGate.lastNorm = null;
}

function stepGate(gate, speed, idleTh, exitTh) {
  const calm = speed < (gate.idle ? exitTh : idleTh);
  if (calm) {
    gate.calmFrames += 1;
    gate.moveFrames = 0;
  } else {
    gate.moveFrames += 1;
    gate.calmFrames = Math.max(0, gate.calmFrames - 1);
  }
  if (!gate.idle && gate.calmFrames >= ENTER_CALM) gate.idle = true;
  if (gate.idle && gate.moveFrames >= EXIT_MOVE) {
    gate.idle = false;
    gate.calmFrames = 0;
  }
  return gate.idle;
}

export function updateStillnessChannels({ scale, orbitNorm }) {
  let zoomSpeed = 0;
  if (zoomGate.lastScale != null && scale != null) {
    zoomSpeed = Math.abs(scale - zoomGate.lastScale) * 2.4;
  }
  if (scale != null) zoomGate.lastScale = scale;

  let orbitSpeed = 0;
  if (orbitGate.lastNorm && orbitNorm) {
    orbitSpeed = Math.hypot(
      orbitNorm.x - orbitGate.lastNorm.x,
      orbitNorm.y - orbitGate.lastNorm.y,
    );
  }
  if (orbitNorm) orbitGate.lastNorm = { x: orbitNorm.x, y: orbitNorm.y };

  const zoomFrozen = stepGate(zoomGate, zoomSpeed, IDLE_SCALE, EXIT_SCALE);
  const orbitFrozen = stepGate(orbitGate, orbitSpeed, IDLE_NORM, EXIT_NORM);

  return {
    idle: zoomFrozen && orbitFrozen,
    zoomFrozen,
    orbitFrozen,
    zoomSpeed,
    orbitSpeed,
  };
}

export function stillnessDampAlpha(idle, baseAlpha) {
  if (idle) return Math.min(baseAlpha, 0.1);
  return baseAlpha;
}
