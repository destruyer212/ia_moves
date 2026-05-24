/**
 * Motor de movimiento fluido para landmarks (main thread + worker).
 * Interpolación + extrapolación ligera = sensación tipo TikTok en portátiles.
 */

export function smoothLandmarks(prev, next, alpha = 0.34) {
  if (!next) return prev;
  if (!prev || prev.length !== next.length) {
    return next.map((point) => ({ ...point }));
  }
  return next.map((point, index) => ({
    x: prev[index].x + (point.x - prev[index].x) * alpha,
    y: prev[index].y + (point.y - prev[index].y) * alpha,
    z: (prev[index].z ?? 0) + ((point.z ?? 0) - (prev[index].z ?? 0)) * alpha,
  }));
}

function palmSpeed(prev, next, dtSec) {
  if (!prev?.length || !next?.length || dtSec < 1e-4) return 0;
  const i = 9;
  const dx = (next[i].x - prev[i].x) / dtSec;
  const dy = (next[i].y - prev[i].y) / dtSec;
  return Math.hypot(dx, dy);
}

/** Suavizado que se relaja cuando la mano se mueve rápido (menos “arrastre”). */
export function fluidFilterLandmarks(prev, next, dtSec, turbo = true) {
  if (!next) return prev;
  const speed = palmSpeed(prev, next, dtSec);
  const alpha = turbo
    ? Math.min(0.82, 0.48 + speed * 2.4)
    : Math.min(0.55, 0.32 + speed * 1.1);
  return smoothLandmarks(prev, next, alpha);
}

export function lerpHands(prev, next, t) {
  if (!next?.length) return [];
  if (!prev?.length || t >= 1) return next;
  return next.map((hand, hi) => {
    const ph = prev[hi];
    if (!ph || ph.length !== hand.length) return hand;
    return hand.map((p, i) => ({
      x: ph[i].x + (p.x - ph[i].x) * t,
      y: ph[i].y + (p.y - ph[i].y) * t,
      z: (ph[i].z ?? 0) + ((p.z ?? 0) - (ph[i].z ?? 0)) * t,
    }));
  });
}

export function computeHandVelocities(prev, next, dtMs) {
  if (!prev?.length || !next?.length || dtMs < 1) return null;
  return next.map((hand, hi) => {
    const ph = prev[hi];
    if (!ph || ph.length !== hand.length) {
      return hand.map(() => ({ vx: 0, vy: 0 }));
    }
    const inv = 1000 / dtMs;
    return hand.map((p, i) => ({
      vx: (p.x - ph[i].x) * inv,
      vy: (p.y - ph[i].y) * inv,
    }));
  });
}

export function predictHands(hands, velocities, aheadMs) {
  if (!hands?.length || !velocities?.length || aheadMs <= 0) return hands;
  const t = aheadMs / 1000;
  return hands.map((hand, hi) => {
    const vels = velocities[hi];
    if (!vels) return hand;
    return hand.map((p, i) => ({
      x: Math.min(1, Math.max(0, p.x + (vels[i]?.vx ?? 0) * t)),
      y: Math.min(1, Math.max(0, p.y + (vels[i]?.vy ?? 0) * t)),
      z: p.z ?? 0,
    }));
  });
}

/** Manos para pintar overlay / fusión a 60 Hz entre paquetes del worker. */
export function getFluidDisplayHands(track, now = performance.now(), options = {}) {
  const calm = options.calm === true;
  const next = track.trackedHands ?? [];
  if (!next.length) return [];

  const prev = track.prevHands;
  const at = track.lastPacketAt ?? 0;
  if (!prev?.length || !at) return next;

  const since = now - at;
  const packetDt = track.packetDt ?? 32;
  const blend = calm ? 0.88 : 0.72;
  const alpha = Math.min(1, since / Math.max(packetDt * blend, 10));
  let hands = lerpHands(prev, next, alpha);

  const vel = track.velocities;
  if (vel && since < (calm ? 60 : 140)) {
    const palmV = vel[0]?.[9];
    const speed = palmV ? Math.hypot(palmV.vx ?? 0, palmV.vy ?? 0) : 0;
    const allowPredict = calm ? speed > 0.028 : true;
    if (allowPredict) {
      const ahead = calm
        ? Math.min(8, 2 + since * 0.08)
        : Math.min(32, 8 + since * 0.42);
      hands = predictHands(hands, vel, ahead);
    }
  }
  return hands;
}

export function nextMonotonicMediaTs(lastTs, incomingMs) {
  const base = Number.isFinite(incomingMs) ? incomingMs : performance.now();
  return Math.max(lastTs + 1, base);
}
