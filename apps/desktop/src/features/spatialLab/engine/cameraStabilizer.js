/**
 * Suaviza cámara/zoom para evitar sacudidas tipo "epilepsia" por jitter del tracker.
 */

import * as THREE from "three";

const cam = {
  yawVel: 0,
  pitchVel: 0,
  rollVel: 0,
  displayZoom: 1,
  panX: 0,
  panZ: 0,
};

const tmpScale = new THREE.Vector3();

function clamp(v, lo, hi) {
  return Math.min(hi, Math.max(lo, v));
}

export function resetCameraStabilizer() {
  cam.yawVel = 0;
  cam.pitchVel = 0;
  cam.rollVel = 0;
  cam.displayZoom = 1;
  cam.panX = 0;
  cam.panZ = 0;
}

export function applyStabilizedCamera(rig, root, continuum, delta) {
  if (!rig || !root) return;

  const dt = clamp(delta, 0.001, 0.05);
  const active = continuum?.active === true;
  const canOrbit = continuum?.orbitAllowed !== false;
  const canZoom = continuum?.zoomAllowed !== false;

  const yawIn = canOrbit && active ? continuum?.orbitYaw ?? 0 : 0;
  const pitchIn = canOrbit && active ? continuum?.orbitPitch ?? 0 : 0;
  const rollIn = canOrbit && active ? continuum?.orbitRoll ?? 0 : 0;

  const yawCap = 0.065;
  const pitchCap = 0.055;
  const rollCap = 0.04;

  cam.yawVel = cam.yawVel * 0.78 + clamp(yawIn, -yawCap, yawCap) * 0.22;
  cam.pitchVel = cam.pitchVel * 0.78 + clamp(pitchIn, -pitchCap, pitchCap) * 0.22;
  cam.rollVel = cam.rollVel * 0.8 + clamp(rollIn, -rollCap, rollCap) * 0.2;

  if (active && canOrbit) {
    rig.rotation.y += cam.yawVel;
    rig.rotation.x = clamp(rig.rotation.x + cam.pitchVel, -1.05, 1.05);
    rig.rotation.z += cam.rollVel;
  } else {
    cam.yawVel *= 0.85;
    cam.pitchVel *= 0.85;
    cam.rollVel *= 0.88;
    rig.rotation.z *= 0.96;
  }

  if (active && canOrbit) {
    const targetPanX = clamp(continuum?.panX ?? 0, -4.2, 4.2);
    const targetPanZ = clamp(continuum?.panZ ?? 0, -3.4, 3.4);
    cam.panX += (targetPanX - cam.panX) * 0.06;
    cam.panZ += (targetPanZ - cam.panZ) * 0.06;
  } else {
    cam.panX *= 0.94;
    cam.panZ *= 0.94;
  }

  rig.position.x += (cam.panX - rig.position.x) * 0.08;
  rig.position.z += (cam.panZ - rig.position.z) * 0.08;

  if (canZoom) {
    const targetZ = clamp(continuum?.smoothedZoom ?? 1, 0.42, 2.2);
    const maxStep = 0.028 * (dt * 60);
    const dz = clamp(targetZ - cam.displayZoom, -maxStep, maxStep);
    cam.displayZoom += dz;
    tmpScale.setScalar(cam.displayZoom);
    root.scale.lerp(tmpScale, 1 - 0.00008 ** dt);
  }
}
