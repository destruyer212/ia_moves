/**
 * Navegación por palma — un canal de suavizado POR mano (evita mezclar izq/der).
 */

const channels = new Map();

function getChannel(id = "default") {
  if (!channels.has(id)) {
    channels.set(id, { smoothed: null, last: null, acquireFrames: 0 });
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
  else {
    channels.clear();
  }
}

function smoothPoint(nav, target, alpha) {
  if (!nav.smoothed) {
    nav.smoothed = { x: target.x, y: target.y };
    nav.last = { x: target.x, y: target.y };
    nav.acquireFrames = 3;
    return { dx: 0, dy: 0, ready: false };
  }

  const jump = Math.hypot(target.x - nav.smoothed.x, target.y - nav.smoothed.y);
  if (jump > 0.2) {
    nav.smoothed = { x: target.x, y: target.y };
    nav.last = { x: target.x, y: target.y };
    nav.acquireFrames = 2;
    return { dx: 0, dy: 0, ready: false };
  }

  const useAlpha = jump > 0.08 ? Math.min(alpha, 0.22) : alpha;
  nav.smoothed.x += (target.x - nav.smoothed.x) * useAlpha;
  nav.smoothed.y += (target.y - nav.smoothed.y) * useAlpha;

  if (nav.acquireFrames > 0) {
    nav.acquireFrames -= 1;
    nav.last = { x: nav.smoothed.x, y: nav.smoothed.y };
    return { dx: 0, dy: 0, ready: false };
  }

  let dx = nav.smoothed.x - nav.last.x;
  let dy = nav.smoothed.y - nav.last.y;
  nav.last = { x: nav.smoothed.x, y: nav.smoothed.y };

  const dead = 0.002;
  if (Math.abs(dx) < dead) dx = 0;
  if (Math.abs(dy) < dead) dy = 0;

  const maxStep = 0.045;
  dx = clamp(dx, -maxStep, maxStep);
  dy = clamp(dy, -maxStep, maxStep);

  return { dx, dy, ready: true };
}

/** channel: 'left' | 'right' | 'single' — obligatorio en bimanual */
export function palmDriveDeltas(norm, options = {}) {
  if (!norm) return { orbitYaw: 0, orbitPitch: 0, panDX: 0, panDZ: 0 };
  if (options.idle) {
    return { orbitYaw: 0, orbitPitch: 0, panDX: 0, panDZ: 0 };
  }

  const channelId = options.channel ?? "default";
  const nav = getChannel(channelId);
  const near = options.nearCamera === true;
  const { dx, dy, ready } = smoothPoint(nav, norm, near ? 0.18 : 0.28);
  if (!ready) return { orbitYaw: 0, orbitPitch: 0, panDX: 0, panDZ: 0 };

  const gain = near ? 2.8 : 4.2;
  const pitchGain = near ? 2.0 : 3.2;
  return {
    orbitYaw: dx * gain,
    orbitPitch: -dy * pitchGain,
    panDX: dx * (near ? 0.35 : 0.5),
    panDZ: dy * (near ? 0.22 : 0.38),
  };
}

export function dualDriveDeltas(normCenter, angle, dualPinch, options = {}) {
  if (!normCenter) return { orbitYaw: 0, panDX: 0, panDZ: 0 };
  const drive = palmDriveDeltas(normCenter, {
    ...options,
    channel: options.channel ?? "dual-center",
  });
  let orbitYaw = drive.orbitYaw * 0.5;
  if (!dualPinch && options._lastAngle != null) {
    let da = angle - options._lastAngle;
    if (da > Math.PI) da -= Math.PI * 2;
    if (da < -Math.PI) da += Math.PI * 2;
    orbitYaw += clamp(da, -0.1, 0.1) * 1.2;
  }
  options._lastAngle = angle;
  return { orbitYaw, panDX: drive.panDX, panDZ: drive.panDZ };
}

dualDriveDeltas._lastAngle = null;
