/**
 * Quietud por canal: zoom y órbita independientes.
 * Con pinza activa no se congela el control (evita “no hace nada”).
 */

import { getHandControlConfig, handControlCoeffs } from "./handControlSettings.js";

const EXIT_MOVE = 2;

const zoomGate = { idle: false, calmFrames: 0, moveFrames: 0, lastScale: null };
const orbitGate = { idle: false, calmFrames: 0, moveFrames: 0, lastNorm: null };

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

function stepGate(gate, speed, idleTh, exitTh, enterCalm) {
  const calm = speed < (gate.idle ? exitTh : idleTh);
  if (calm) {
    gate.calmFrames += 1;
    gate.moveFrames = 0;
  } else {
    gate.moveFrames += 1;
    gate.calmFrames = Math.max(0, gate.calmFrames - 1);
  }
  if (!gate.idle && gate.calmFrames >= enterCalm) gate.idle = true;
  if (gate.idle && gate.moveFrames >= EXIT_MOVE) {
    gate.idle = false;
    gate.calmFrames = 0;
  }
  return gate.idle;
}

function combinedNorm(norms) {
  const valid = norms.filter(Boolean);
  if (!valid.length) return null;
  if (valid.length === 1) return valid[0];
  return {
    x: valid.reduce((s, n) => s + n.x, 0) / valid.length,
    y: valid.reduce((s, n) => s + n.y, 0) / valid.length,
  };
}

function orbitSpeedFromNorms(orbitNorms) {
  const norm = combinedNorm(orbitNorms);
  if (!norm) return 0;
  let speed = 0;
  if (orbitGate.lastNorm) {
    speed = Math.hypot(norm.x - orbitGate.lastNorm.x, norm.y - orbitGate.lastNorm.y);
  }
  orbitGate.lastNorm = { x: norm.x, y: norm.y };
  return speed;
}

export function updateStillnessChannels({
  scale,
  orbitNorm,
  orbitNorms,
  pinchActive = false,
  palmDriving = false,
  bimanualPinch = false,
}) {
  const coeffs = handControlCoeffs(getHandControlConfig());
  const enterCalm = Math.max(48, coeffs.stillnessEnterFrames + 12);
  const idleScale = 0.014;
  const exitScale = idleScale * 2.4;
  const idleNorm = 0.011;
  const exitNorm = idleNorm * 2.5;

  const norms = orbitNorms?.length
    ? orbitNorms.filter(Boolean)
    : orbitNorm
      ? [orbitNorm]
      : [];

  let zoomSpeed = 0;
  if (zoomGate.lastScale != null && scale != null) {
    zoomSpeed = Math.abs(scale - zoomGate.lastScale) * 2.2;
  }
  if (scale != null) zoomGate.lastScale = scale;

  const orbitSpeed = orbitSpeedFromNorms(norms);

  let zoomFrozen = stepGate(zoomGate, zoomSpeed, idleScale, exitScale, enterCalm);
  let orbitFrozen = stepGate(orbitGate, orbitSpeed, idleNorm, exitNorm, enterCalm);

  if (pinchActive || bimanualPinch) {
    zoomFrozen = false;
    orbitFrozen = false;
    zoomGate.idle = false;
    orbitGate.idle = false;
    zoomGate.calmFrames = 0;
    orbitGate.calmFrames = 0;
  }

  if (palmDriving) {
    orbitFrozen = false;
    orbitGate.idle = false;
    orbitGate.calmFrames = 0;
  }

  return {
    idle: zoomFrozen && orbitFrozen,
    zoomFrozen,
    orbitFrozen,
    zoomSpeed,
    orbitSpeed,
  };
}

export function stillnessDampAlpha(idle, baseAlpha) {
  if (idle) return Math.min(baseAlpha, 0.14);
  return baseAlpha;
}
