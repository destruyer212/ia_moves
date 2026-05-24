/**
 * Regla fija: pinza IZQUIERDA (cerca o lejos) → zoom/agarre.
 * Mano DERECHA libre → giro 3D en todos los ángulos (yaw + pitch).
 */

import { measureHandScale } from "./handMetrics.js";
import {
  depthRatioFromBaseline,
  updateDepthBaseline,
} from "./landmarkStabilizer.js";
import { handRollRadians } from "./handRoles.js";
import { getHandControlConfig, handControlCoeffs } from "./handControlSettings.js";
import { clearPalmNavigation, palmDriveDeltas } from "./palmNavigation.js";
import { mapDualHandMetrics } from "./dualHandMetrics.js";

function clamp(v, lo, hi) {
  return Math.min(hi, Math.max(lo, v));
}

const PAN_X = 5.8;
const PAN_Z = 4.6;
const PINCH_ZOOM_SIDE = "left";
const ORBIT_SIDE = "right";

function pickPinchSide(spatial) {
  if (spatial.leftPinch?.active) return "left";
  if (spatial.rightPinch?.active) return "right";
  return null;
}

/** Siempre la mano contraria a la pinza; nunca orbitar con la mano que pinza */
function pickOrbitSide(spatial, pinchSide) {
  if (pinchSide === "left") {
    if (spatial.right?.norm || spatial.right?.palm) return "right";
    if (spatial.secondary?.norm) return "right";
    return ORBIT_SIDE;
  }
  if (pinchSide === "right") {
    if (spatial.left?.norm || spatial.left?.palm) return "left";
    return "left";
  }
  if (spatial.right?.norm) return "right";
  if (spatial.left?.norm) return "left";
  return ORBIT_SIDE;
}

function handBundle(spatial, side) {
  if (side === "left") {
    return {
      spatial: spatial.left,
      hand: spatial.bimanual?.left?.hand,
      prox: spatial.bimanual?.left?.proximity,
      pinch: spatial.leftPinch,
    };
  }
  if (side === "right") {
    return {
      spatial: spatial.right,
      hand: spatial.bimanual?.right?.hand,
      prox: spatial.bimanual?.right?.proximity,
      pinch: spatial.rightPinch,
    };
  }
  return null;
}

function orbitNormForBundle(bundle, spatial, side) {
  if (bundle?.spatial?.norm) return bundle.spatial.norm;
  const hand = bundle?.hand;
  if (!hand?.length) return null;
  const w = hand[0];
  const m = hand[9] ?? hand[5];
  return {
    x: clamp((1 - (w.x * 0.35 + m.x * 0.65)) * 2 - 1, -0.95, 0.95),
    y: clamp(-(w.y * 0.25 + m.y * 0.75) * 2 + 1, -0.95, 0.95),
    z: (m.z ?? 0) * 2,
  };
}

function bimanualControlFlags(pinchSide) {
  return {
    zoomAllowed: true,
    orbitAllowed: true,
    zoomFrozen: false,
    orbitFrozen: false,
  };
}

export function updateBimanualContinuum(state, spatial, gesture, still, hands = []) {
  let pinchSide = pickPinchSide(spatial);
  if (!pinchSide && spatial.leftPinch) pinchSide = spatial.leftPinch.active ? "left" : null;

  const orbitSide = pickOrbitSide(spatial, pinchSide) ?? ORBIT_SIDE;
  const zoomSide = pinchSide ?? PINCH_ZOOM_SIDE;

  if (pinchSide && state._lastPinchSide !== pinchSide) {
    clearPalmNavigation(pinchSide === "left" ? "left" : "right");
  }
  state._lastPinchSide = pinchSide;

  const orbitBundle = handBundle(spatial, orbitSide);
  const zoomBundle = handBundle(spatial, zoomSide) ?? orbitBundle;

  let label =
    pinchSide === "left"
      ? "Pinza izquierda (cerca o lejos) · mueve la DERECHA para girar"
      : "Pinza + mano libre: mueve la otra mano para explorar";

  state.orbitYaw = 0;
  state.orbitPitch = 0;
  state.orbitRoll = 0;
  state.palmDrive = false;

  const dual = mapDualHandMetrics(
    hands?.length ? hands : [spatial.bimanual?.left?.hand, spatial.bimanual?.right?.hand].filter(Boolean),
    spatial,
  );

  const coeffs = handControlCoeffs(getHandControlConfig());
  const orbitNorm = orbitNormForBundle(orbitBundle, spatial, orbitSide);
  const leftPinchLocked = pinchSide === "left" || (!pinchSide && spatial.leftPinch?.active);

  if (orbitNorm) {
    const drive = palmDriveDeltas(orbitNorm, {
      idle: false,
      channel: `orbit-${orbitSide}`,
      nearCamera: false,
      bimanualOrbit: true,
      pinchBoost: false,
    });
    state.orbitYaw = drive.orbitYaw;
    state.orbitPitch = drive.orbitPitch;
    state.panX = 0;
    state.panZ = 0;
    state.palmDrive = Math.abs(drive.orbitYaw) + Math.abs(drive.orbitPitch) > 1e-5;

    const oh = orbitBundle?.hand;
    if (oh && state._lastOrbitRoll != null) {
      let dr = handRollRadians(oh) - state._lastOrbitRoll;
      if (dr > Math.PI) dr -= Math.PI * 2;
      if (dr < -Math.PI) dr += Math.PI * 2;
      if (Math.abs(dr) > 0.002) state.orbitRoll = clamp(dr * 1.15, -0.16, 0.16);
    }
    if (oh) state._lastOrbitRoll = handRollRadians(oh);

    if (leftPinchLocked) {
      label = "Pinza izquierda activa · mueve la mano DERECHA en cualquier dirección";
    }
  } else if (pinchSide) {
    label = "Mantén la pinza izquierda y muestra la mano derecha en cuadro para girar";
  }

  let targetZoom = state.smoothedZoom;
  let depthRatio = 1;

  if (dual.active && dual.dualPinch) {
    if (!state.dualBaselineSpan) state.dualBaselineSpan = dual.pinchSpan;
    const spanRatio = dual.pinchSpan / Math.max(state.dualBaselineSpan, 1e-4);
    targetZoom = clamp(spanRatio, 0.45, 2.2);
    state.smoothedZoom += (targetZoom - state.smoothedZoom) * 0.22;
    label = "Dos pinzas: separa para ampliar · junta para reducir";
    state.twoHandZoom = true;
  } else if (zoomBundle?.hand) {
    state.twoHandZoom = false;
    const scale = measureHandScale(zoomBundle.hand);
    if (pinchSide && !state._pinchZoomBase) state._pinchZoomBase = scale;
    if (!pinchSide) state._pinchZoomBase = null;

    updateDepthBaseline(state, scale, zoomBundle.prox, gesture?.name ?? "unknown");
    if (pinchSide && state._pinchZoomBase) {
      depthRatio = clamp(scale / Math.max(state._pinchZoomBase, 0.04), 0.5, 2);
      targetZoom = clamp(0.52 + (depthRatio - 1) * 4 * coeffs.zoomGain, 0.35, 2.5);
    } else {
      depthRatio = depthRatioFromBaseline(state.baselineScale, scale, zoomBundle.prox);
      targetZoom = clamp(0.55 + (depthRatio - 1) * 3.6 * coeffs.zoomGain, 0.35, 2.45);
    }
    const zGain = (pinchSide ? 0.14 : 0.1) * coeffs.zoomGain;
    const dz = clamp(targetZoom - state.smoothedZoom, -0.035, 0.035);
    state.smoothedZoom += dz * zGain;
  }

  state.bimanualMode = true;
  state.leftPinchActive = pinchSide === "left";
  state.rightPinchActive = pinchSide === "right";
  state.orbitHandSide = orbitSide;

  const flags = bimanualControlFlags(pinchSide);

  return {
    ...state,
    active: true,
    dual: { ...dual, active: true, bimanual: true },
    depthRatio,
    targetZoom,
    pushing: depthRatio > 1.04,
    pulling: depthRatio < 0.96,
    proximity: zoomBundle?.prox ?? orbitBundle?.prox,
    nearCamera: !!(zoomBundle?.prox?.nearCamera || orbitBundle?.prox?.nearCamera),
    idle: still.idle && !pinchSide,
    ...flags,
    label,
  };
}

/** Una sola mano visible: zoom por profundidad + giro por arrastre */
export function updateSingleHandContinuum(state, spatial, gesture, still, idleOpts) {
  const side = spatial.left ? "left" : spatial.right ? "right" : "primary";
  const bundle =
    side === "left"
      ? {
          spatial: spatial.left,
          hand: spatial.bimanual?.left?.hand,
          prox: spatial.bimanual?.left?.proximity,
          pinch: spatial.leftPinch,
        }
      : side === "right"
        ? {
            spatial: spatial.right,
            hand: spatial.bimanual?.right?.hand,
            prox: spatial.bimanual?.right?.proximity,
            pinch: spatial.rightPinch,
          }
        : {
            spatial: spatial.primary,
            hand: spatial.bimanual?.left?.hand ?? spatial.bimanual?.right?.hand,
            prox: spatial.proximity,
            pinch: spatial.primaryPinch,
          };

  const hand = bundle.hand;
  const norm = bundle.spatial?.norm ?? spatial.primary?.norm;
  const pinch = !!bundle.pinch?.active;
  let label = "Una mano: arrastra para girar · acerca/aleja para zoom";

  state.orbitYaw = 0;
  state.orbitPitch = 0;
  state.orbitRoll = 0;
  state.palmDrive = false;

  const coeffs = handControlCoeffs(getHandControlConfig());

  if (hand) {
    const scale = measureHandScale(hand);
    if (!still.zoomFrozen || pinch) {
      if (pinch && !state._pinchZoomBase) state._pinchZoomBase = scale;
      if (!pinch) state._pinchZoomBase = null;

      updateDepthBaseline(state, scale, bundle.prox, gesture?.name ?? "unknown");
      let depthRatio;
      let targetZoom;
      if (pinch && state._pinchZoomBase) {
        depthRatio = clamp(scale / Math.max(state._pinchZoomBase, 0.04), 0.55, 1.9);
        targetZoom = clamp(0.55 + (depthRatio - 1) * 3.8 * coeffs.zoomGain, 0.35, 2.45);
      } else {
        depthRatio = depthRatioFromBaseline(state.baselineScale, scale, bundle.prox);
        targetZoom = clamp(0.55 + (depthRatio - 1) * 3.6 * coeffs.zoomGain, 0.35, 2.4);
      }
      const dz = clamp(targetZoom - state.smoothedZoom, -0.035, 0.035);
      state.smoothedZoom += dz * 0.16 * coeffs.zoomGain;
      state.depthRatio = depthRatio;
    }
  }

  if (norm) {
    const drive = palmDriveDeltas(norm, {
      idle: false,
      channel: side === "primary" ? "single" : side,
      nearCamera: bundle.prox?.nearCamera ?? idleOpts?.nearCamera,
      pinchBoost: pinch,
      bimanualOrbit: pinch && side === "left",
    });
    state.orbitYaw = drive.orbitYaw;
    state.orbitPitch = drive.orbitPitch;
    if (!pinch) {
      state.panX = clamp(state.panX + drive.panDX, -PAN_X, PAN_X);
      state.panZ = clamp(state.panZ + drive.panDZ, -PAN_Z, PAN_Z);
    }
    state.palmDrive = Math.abs(drive.orbitYaw) + Math.abs(drive.orbitPitch) > 1e-5;
    label = pinch
      ? "Pinza izquierda: acerca/aleja zoom · si solo ves una mano, muestra la derecha para girar"
      : "Arrastra la palma para girar · acerca/aleja para zoom";
  }

  return {
    ...state,
    active: true,
    singleHand: true,
    leftPinchActive: side === "left" && pinch,
    rightPinchActive: side === "right" && pinch,
    zoomAllowed: !still.zoomFrozen || pinch,
    orbitAllowed: !still.orbitFrozen || pinch || state.palmDrive,
    zoomFrozen: still.zoomFrozen && !pinch,
    orbitFrozen: still.orbitFrozen && !pinch && !state.palmDrive,
    label: still.idle && !pinch ? "Mueve la mano para tomar control" : label,
    idle: still.idle,
  };
}
