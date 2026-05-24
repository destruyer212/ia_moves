/**
 * Pinza (cualquier mano) → agarre + zoom · La otra mano → giro 3D siempre que se mueva.
 */

import { measureHandScale } from "./handMetrics.js";
import {
  depthRatioFromBaseline,
  updateDepthBaseline,
} from "./landmarkStabilizer.js";
import { handRollRadians } from "./handRoles.js";
import { palmDriveDeltas } from "./palmNavigation.js";
import { mapDualHandMetrics } from "./dualHandMetrics.js";

function clamp(v, lo, hi) {
  return Math.min(hi, Math.max(lo, v));
}

const PAN_X = 5.8;
const PAN_Z = 4.6;

function pickPinchSide(spatial) {
  if (spatial.leftPinch?.active) return "left";
  if (spatial.rightPinch?.active) return "right";
  return null;
}

function pickOrbitSide(spatial, pinchSide) {
  if (pinchSide === "left" && spatial.right?.norm) return "right";
  if (pinchSide === "right" && spatial.left?.norm) return "left";
  if (spatial.right?.norm) return "right";
  if (spatial.left?.norm) return "left";
  return null;
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

export function updateBimanualContinuum(state, spatial, gesture, still, hands = []) {
  const pinchSide = pickPinchSide(spatial);
  const orbitSide = pickOrbitSide(spatial, pinchSide);
  const orbitBundle = handBundle(spatial, orbitSide);
  const zoomSide = pinchSide ?? "left";
  const zoomBundle = handBundle(spatial, zoomSide) ?? orbitBundle;

  let label = "Izquierda pinza + mueve la derecha para girar · o acerca/aleja para zoom";
  state.orbitYaw = 0;
  state.orbitPitch = 0;
  state.orbitRoll = 0;

  const dual = mapDualHandMetrics(
    hands?.length ? hands : [spatial.bimanual?.left?.hand, spatial.bimanual?.right?.hand].filter(Boolean),
    spatial,
  );

  const orbitChannel = orbitSide ?? "right";

  if (orbitBundle?.spatial?.norm) {
    const allowOrbit = !still.orbitFrozen || pinchSide != null;
    const drive = palmDriveDeltas(orbitBundle.spatial.norm, {
      idle: false,
      channel: orbitChannel,
      nearCamera: orbitBundle.prox?.nearCamera,
    });
    if (allowOrbit) {
      state.orbitYaw = drive.orbitYaw;
      state.orbitPitch = drive.orbitPitch;
    }
    if (allowOrbit) {
      state.panX = clamp(state.panX + drive.panDX * 1.25, -PAN_X, PAN_X);
      state.panZ = clamp(state.panZ + drive.panDZ * 1.2, -PAN_Z, PAN_Z);
      state.palmDrive = Math.abs(drive.orbitYaw) + Math.abs(drive.orbitPitch) > 1e-5;
    }

    const oh = orbitBundle.hand;
    if (oh && state._lastRightRoll != null) {
      let dr = handRollRadians(oh) - state._lastRightRoll;
      if (dr > Math.PI) dr -= Math.PI * 2;
      if (dr < -Math.PI) dr += Math.PI * 2;
      if (Math.abs(dr) > 0.004) state.orbitRoll = clamp(dr * 0.9, -0.1, 0.1);
    }
    if (oh) state._lastRightRoll = handRollRadians(oh);
    label =
      pinchSide === "left"
        ? "Mueve la mano derecha para girar (pinza izquierda activa)"
        : "Mueve la otra mano para girar la escena";
  } else {
    state.palmDrive = false;
    state._lastRightRoll = orbitBundle?.hand ? handRollRadians(orbitBundle.hand) : null;
  }

  let targetZoom = state.smoothedZoom;
  let depthRatio = 1;

  if (dual.active && dual.dualPinch && !still.zoomFrozen) {
    if (!state.dualBaselineSpan) {
      state.dualBaselineSpan = dual.pinchSpan;
    }
    const spanRatio = dual.pinchSpan / Math.max(state.dualBaselineSpan, 1e-4);
    targetZoom = clamp(spanRatio, 0.45, 2.2);
    state.smoothedZoom += (targetZoom - state.smoothedZoom) * 0.2;
    label = "Dos pinzas: separa para ampliar · junta para reducir";
    state.twoHandZoom = true;
  } else if (zoomBundle?.hand) {
    state.twoHandZoom = false;
    const scale = measureHandScale(zoomBundle.hand);
    if (!still.zoomFrozen) {
      updateDepthBaseline(state, scale, zoomBundle.prox, gesture?.name ?? "unknown");
    }
    depthRatio = depthRatioFromBaseline(state.baselineScale, scale, zoomBundle.prox);
    targetZoom = clamp(0.62 + (depthRatio - 1) * 2.8, 0.42, 2.1);

    if (!still.zoomFrozen) {
      state.smoothedZoom += (targetZoom - state.smoothedZoom) * (pinchSide ? 0.18 : 0.12);
    }

    if (pinchSide) {
      state.palmDrag = palmDriveDeltas(zoomBundle.spatial.norm, {
        idle: false,
        channel: zoomSide,
        nearCamera: zoomBundle.prox?.nearCamera,
      });
      label =
        "Pinza: agarra · acerca/aleja la mano con pinza para zoom · mueve la otra para girar";
    } else {
      state.palmDrag = null;
      label = "Sin pinza: acerca o aleja cualquier mano para zoom · mueve la derecha para girar";
    }
  }

  state.bimanualMode = true;
  state.leftPinchActive = pinchSide === "left";
  state.rightPinchActive = pinchSide === "right";

  return {
    ...state,
    active: true,
    dual: { ...dual, active: true, bimanual: true },
    depthRatio,
    targetZoom,
    pushing: depthRatio > 1.03,
    pulling: depthRatio < 0.97,
    proximity: zoomBundle?.prox ?? orbitBundle?.prox,
    nearCamera: !!(zoomBundle?.prox?.nearCamera || orbitBundle?.prox?.nearCamera),
    idle: still.idle,
    zoomFrozen: still.zoomFrozen,
    orbitFrozen: still.orbitFrozen,
    label:
      still.orbitFrozen && still.zoomFrozen
        ? "Manos quietas · mueve la derecha o acerca/aleja para zoom"
        : label,
  };
}

/** Una sola mano visible: zoom + giro en la misma mano */
export function updateSingleHandContinuum(state, spatial, gesture, still, idleOpts) {
  const side = spatial.left ? "left" : spatial.right ? "right" : "primary";
  const bundle =
    side === "left"
      ? { spatial: spatial.left, hand: spatial.bimanual?.left?.hand, prox: spatial.bimanual?.left?.proximity, pinch: spatial.leftPinch }
      : side === "right"
        ? { spatial: spatial.right, hand: spatial.bimanual?.right?.hand, prox: spatial.bimanual?.right?.proximity, pinch: spatial.rightPinch }
        : { spatial: spatial.primary, hand: null, prox: spatial.proximity, pinch: spatial.primaryPinch };

  const hand = bundle.hand ?? spatial.bimanual?.left?.hand ?? spatial.bimanual?.right?.hand;
  const norm = bundle.spatial?.norm ?? spatial.primary?.norm;
  const pinch = bundle.pinch?.active;
  let label = "Una mano: acerca/aleja = zoom · palma y arrastra = girar";

  state.orbitYaw = 0;
  state.orbitPitch = 0;
  state.orbitRoll = 0;

  if (hand && !still.zoomFrozen) {
    const scale = measureHandScale(hand);
    updateDepthBaseline(state, scale, bundle.prox, gesture?.name ?? "unknown");
    const depthRatio = depthRatioFromBaseline(state.baselineScale, scale, bundle.prox);
    const targetZoom = clamp(0.62 + (depthRatio - 1) * 3, 0.4, 2.2);
    state.smoothedZoom += (targetZoom - state.smoothedZoom) * 0.14;
  }

  if (norm && !pinch) {
    const drive = palmDriveDeltas(norm, {
      idle: false,
      channel: "single",
      nearCamera: bundle.prox?.nearCamera,
    });
    state.orbitYaw = drive.orbitYaw;
    state.orbitPitch = drive.orbitPitch;
    state.panX = clamp(state.panX + drive.panDX, -PAN_X, PAN_X);
    state.panZ = clamp(state.panZ + drive.panDZ, -PAN_Z, PAN_Z);
    state.palmDrive = true;
    label = "Una mano: arrastra para girar · acerca/aleja para zoom";
  } else if (norm && pinch) {
    state.palmDrag = palmDriveDeltas(norm, { idle: false, channel: "single" });
    state.palmDrive = false;
    label = "Pinza: agarra · acerca/aleja para zoom";
  }

  return {
    ...state,
    active: true,
    singleHand: true,
    palmDrive: !!state.palmDrive,
    label: still.idle ? "Mueve la mano para zoom o giro" : label,
    idle: still.idle,
    zoomFrozen: still.zoomFrozen,
    orbitFrozen: still.orbitFrozen,
  };
}
