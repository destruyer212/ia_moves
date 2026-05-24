/**
 * Navegación por palma — un canal de suavizado POR mano (evita mezclar izq/der).
 */

import { getHandControlConfig, handControlCoeffs } from "./handControlSettings.js";

const channels = new Map();

function getChannel(id = "default") {
  if (!channels.has(id)) {
    channels.set(id, { smoothed: null, last: null });
  }
  return channels.get(id);
}

function clamp(v, lo, hi) {
  return Math.min(hi, Math.max(lo, v));
}

export function resetPalmNavigation() {
  channels.clear();
}

export function clearPalmNavigation(id) {
  if (id) channels.delete(id);
  else channels.clear();
}

function smoothPoint(nav, target, alpha, coeffs, near, bimanualOrbit) {
  if (!nav.smoothed) {
    nav.smoothed = { x: target.x, y: target.y };
    nav.last = { x: target.x, y: target.y };
    return { dx: 0, dy: 0, ready: false };
  }

  const jump = Math.hypot(target.x - nav.smoothed.x, target.y - nav.smoothed.y);
  const jumpLimit = bimanualOrbit ? 0.52 : near ? 0.38 : 0.28;
  if (jump > jumpLimit) {
    nav.smoothed = { x: target.x, y: target.y };
    nav.last = { x: target.x, y: target.y };
    return { dx: 0, dy: 0, ready: false };
  }

  const useAlpha = jump > 0.06 ? Math.min(0.55, alpha * 1.35) : alpha;
  nav.smoothed.x += (target.x - nav.smoothed.x) * useAlpha;
  nav.smoothed.y += (target.y - nav.smoothed.y) * useAlpha;

  let dx = nav.smoothed.x - nav.last.x;
  let dy = nav.smoothed.y - nav.last.y;
  nav.last = { x: nav.smoothed.x, y: nav.smoothed.y };

  const dead = (coeffs?.deadZone ?? 0.002) * (bimanualOrbit ? 0.35 : near ? 0.65 : 1);
  if (Math.abs(dx) < dead) dx = 0;
  if (Math.abs(dy) < dead) dy = 0;

  const maxStep = (coeffs?.maxStep ?? 0.045) * (bimanualOrbit ? 1.35 : near ? 1.15 : 1);
  dx = clamp(dx, -maxStep, maxStep);
  dy = clamp(dy, -maxStep, maxStep);

  return { dx, dy, ready: Math.abs(dx) + Math.abs(dy) > 1e-6 };
}

/** channel: 'left' | 'right' | 'single' */
export function palmDriveDeltas(norm, options = {}) {
  if (!norm) return { orbitYaw: 0, orbitPitch: 0, panDX: 0, panDZ: 0 };
  if (options.idle) {
    return { orbitYaw: 0, orbitPitch: 0, panDX: 0, panDZ: 0 };
  }

  const channelId = options.channel ?? "default";
  const nav = getChannel(channelId);
  const bimanualOrbit = options.bimanualOrbit === true;
  const near = !bimanualOrbit && options.nearCamera === true;
  const coeffs = handControlCoeffs(getHandControlConfig());
  const alpha = coeffs.smoothAlpha * (bimanualOrbit ? 0.42 : near ? 0.55 : 0.75);
  const { dx, dy, ready } = smoothPoint(nav, norm, alpha, coeffs, near, bimanualOrbit);
  if (!ready) return { orbitYaw: 0, orbitPitch: 0, panDX: 0, panDZ: 0 };

  let gain = coeffs.orbitGain * (bimanualOrbit ? 4.2 : near ? 3.6 : 4.8);
  let pitchGain = coeffs.orbitGain * (bimanualOrbit ? 3.6 : near ? 2.9 : 4);
  if (options.pinchBoost && !bimanualOrbit) {
    gain *= coeffs.pinchOrbitBoost * 0.85;
    pitchGain *= coeffs.pinchOrbitBoost * 0.85;
  }

  let orbitYaw = dx * gain;
  let orbitPitch = -dy * pitchGain;
  if (coeffs.invertOrbitX) orbitYaw *= -1;
  if (coeffs.invertOrbitY) orbitPitch *= -1;

  return {
    orbitYaw,
    orbitPitch,
    panDX: dx * coeffs.panGain * (bimanualOrbit ? 0.85 : near ? 0.55 : 0.75),
    panDZ: dy * coeffs.panGain * (bimanualOrbit ? 0.72 : near ? 0.42 : 0.58),
  };
}

export function dualDriveDeltas(normCenter, angle, dualPinch, options = {}) {
  if (!normCenter) return { orbitYaw: 0, panDX: 0, panDZ: 0 };
  const drive = palmDriveDeltas(normCenter, {
    ...options,
    channel: options.channel ?? "dual-center",
  });
  let orbitYaw = drive.orbitYaw * 0.65;
  const lastAngle = options._lastAngle;
  if (!dualPinch && lastAngle != null) {
    let da = angle - lastAngle;
    if (da > Math.PI) da -= Math.PI * 2;
    if (da < -Math.PI) da += Math.PI * 2;
    orbitYaw += clamp(da, -0.12, 0.12) * 1.4;
  }
  if (options._lastAngleRef) options._lastAngleRef.current = angle;
  return { orbitYaw, panDX: drive.panDX, panDZ: drive.panDZ };
}
