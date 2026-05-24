/**
 * Control continuo: una mano (profundidad) + dos manos (pellizcar y separar/juntar = zoom táctil).
 */

import { mapDualHandMetrics } from "./dualHandMetrics.js";
import { measureHandScale } from "./handMetrics.js";
import {
  depthRatioFromBaseline,
  updateDepthBaseline,
} from "./landmarkStabilizer.js";
import { dualDriveDeltas, resetPalmNavigation } from "./palmNavigation.js";
import { updateBimanualContinuum, updateSingleHandContinuum } from "./bimanualControl.js";
import { resetStillnessGate, updateStillnessChannels } from "./stillnessGate.js";

export { measureHandScale };

const state = {
  baselineScale: null,
  lastNorm: null,
  lastTs: 0,
  smoothedZoom: 1,
  orbitVelY: 0,
  orbitVelX: 0,
  panX: 0,
  panZ: 0,
  palmVX: 0,
  palmVY: 0,
  dualBaselineSpan: null,
  dualBaselineDepth: null,
  lastDualAngle: null,
  lastDualCenter: null,
  twoHandMode: false,
};

export function resetSpatialContinuum() {
  state.baselineScale = null;
  state.lastNorm = null;
  state.smoothedZoom = 1;
  state.orbitVelY = 0;
  state.orbitVelX = 0;
  state.orbitYaw = 0;
  state.orbitPitch = 0;
  state.orbitRoll = 0;
  state.panX = 0;
  state.panZ = 0;
  state.palmVX = 0;
  state.palmVY = 0;
  state.dualBaselineSpan = null;
  state.dualBaselineDepth = null;
  state.lastDualAngle = null;
  state.lastDualCenter = null;
  state.twoHandMode = false;
  resetPalmNavigation();
  resetStillnessGate();
}

function clamp(v, lo, hi) {
  return Math.min(hi, Math.max(lo, v));
}

export function updateSpatialContinuum(hands, gesture, spatial) {
  const hand = hands?.[0];
  const dual = mapDualHandMetrics(hands, spatial);
  const now = performance.now();
  const dt = state.lastTs ? Math.min(0.05, (now - state.lastTs) / 1000) : 1 / 60;
  state.lastTs = now;

  state.orbitYaw = 0;
  state.orbitPitch = 0;

  if (!hand || !spatial?.primary) {
    state.lastNorm = null;
    state.dualBaselineSpan = null;
    state.dualBaselineDepth = null;
    state.lastDualAngle = null;
    state.lastDualCenter = null;
    state.twoHandMode = false;
    state.palmVX *= 0.85;
    state.palmVY *= 0.85;
    state.orbitVelY *= 0.92;
    state.orbitVelX *= 0.92;
    state.smoothedZoom += (1 - state.smoothedZoom) * 0.03;
    return { ...state, active: false, dual };
  }

  const proximity = spatial.proximity ?? spatial.primary?.proximity ?? null;
  const zoomHand =
    spatial.bimanual?.left?.hand ?? spatial.bimanual?.right?.hand ?? hand;
  const scaleEarly = measureHandScale(zoomHand);
  const orbitNorm =
    spatial.right?.norm ?? spatial.left?.norm ?? spatial.primary?.norm;
  const still = updateStillnessChannels({
    scale: scaleEarly,
    orbitNorm,
  });
  const idleOpts = {
    idle: still.idle,
    nearCamera: proximity?.nearCamera,
  };

  let targetZoom = state.smoothedZoom;
  let label = "";

  if (spatial.bimanual?.bothVisible || (hands?.length ?? 0) >= 2) {
    return updateBimanualContinuum(state, spatial, gesture, still, hands);
  }

  if (spatial.left || spatial.right || spatial.primary) {
    return updateSingleHandContinuum(state, spatial, gesture, still, idleOpts);
  }

  if (dual.active) {
    state.twoHandMode = true;
    const spanMetric = dual.dualPinch ? dual.pinchSpan : dual.palmSpan;

    if (!state.dualBaselineSpan) {
      state.dualBaselineSpan = spanMetric;
      state.dualBaselineDepth = dual.avgDepth;
    } else {
      const jump = spanMetric / Math.max(state.dualBaselineSpan, 1e-4);
      if (jump > 1.55 || jump < 0.58) {
        state.dualBaselineSpan = state.dualBaselineSpan * 0.82 + spanMetric * 0.18;
        state.dualBaselineDepth = state.dualBaselineDepth * 0.82 + dual.avgDepth * 0.18;
      }
    }

    const spanRatio =
      state.dualBaselineSpan > 1e-4 ? spanMetric / state.dualBaselineSpan : 1;

    const depthRatio =
      state.dualBaselineDepth > 1e-4 ? dual.avgDepth / state.dualBaselineDepth : 1;

    targetZoom = clamp(spanRatio * (0.85 + depthRatio * 0.2), 0.42, 2.35);

    if (dual.dualPinch) {
      label =
        spanRatio > 1.05
          ? "Dos manos: separa pinzas para ampliar"
          : spanRatio < 0.95
            ? "Dos manos: junta pinzas para reducir"
            : "Dos manos en pinza: separa o junta para zoom";
    } else {
      label = spatial.nearCamera
        ? "Manos cerca de la cámara: aléjalas un poco para zoom estable"
        : "Dos manos: aléjalas o acércalas (zoom)";
    }

    const dualNav = dualDriveDeltas(dual.normCenter, dual.angle, dual.dualPinch, {
      idle: still.orbitFrozen,
    });
    if (!still.zoomFrozen || !still.orbitFrozen) {
      state.orbitYaw = dualNav.orbitYaw;
      state.panX = clamp(state.panX + dualNav.panDX, -2.2, 2.2);
      state.panZ = clamp(state.panZ + dualNav.panDZ, -1.6, 1.6);
      state.smoothedZoom += (targetZoom - state.smoothedZoom) * 0.18;
    }
    state.orbitPitch = 0;
    state.orbitVelY = 0;
    state.orbitVelX = 0;
    state.lastNorm = null;

    return {
      ...state,
      active: true,
      dual,
      dualPinch: dual.dualPinch,
      spanRatio,
      depthRatio,
      targetZoom,
      twoHandZoom: true,
      palmDrive: false,
      pushing: spanRatio > 1.03 || depthRatio > 1.03,
      pulling: spanRatio < 0.97 || depthRatio < 0.97,
      label: still.idle ? "Mano quieta · mueve para controlar" : label,
      idle: still.idle,
    };
  }

  return updateSingleHandContinuum(state, spatial, gesture, still, idleOpts);
}
