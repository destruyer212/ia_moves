/** Gesture Mapping Engine + modos táctil (1 y 2 manos) */

export const INTERACTION_MODES = {
  IDLE: "idle",
  FIELD: "volumetric_field",
  GRAB: "physics_grab",
  ORBIT: "orbital_nav",
  ZOOM: "depth_push_zoom",
  TWO_HAND_PINCH: "stereo_pinch_zoom",
  BIMANUAL: "bimanual_stereo",
  POINT: "spatial_raycast",
  FORCE: "force_field",
  PALM_DRIVE: "palm_6dof_drive",
};

const MODE_LABELS = {
  [INTERACTION_MODES.IDLE]: "STANDBY",
  [INTERACTION_MODES.FIELD]: "CAMPO VOLUMÉTRICO",
  [INTERACTION_MODES.GRAB]: "AGARRE 3D",
  [INTERACTION_MODES.ORBIT]: "GIRO ORBITAL",
  [INTERACTION_MODES.ZOOM]: "ZOOM · UNA MANO",
  [INTERACTION_MODES.TWO_HAND_PINCH]: "ZOOM · DOS MANOS",
  [INTERACTION_MODES.BIMANUAL]: "BIMANUAL · 2050",
  [INTERACTION_MODES.POINT]: "RAYCAST",
  [INTERACTION_MODES.FORCE]: "CAMPO DE FUERZA",
  [INTERACTION_MODES.PALM_DRIVE]: "CONDUCIR PALMA",
};

export function modeLabel(mode) {
  return MODE_LABELS[mode] ?? "SPATIAL INTERFACE";
}

export function deriveInteractionState(gesture, spatial, continuum) {
  const g = gesture?.name ?? "unknown";
  const conf = gesture?.confidence ?? 0;
  const handActive = continuum?.active;
  const dual = continuum?.dual;
  const singlePinch = spatial?.primaryPinch?.active && !dual?.dualPinch;
  const bimanual = spatial?.bimanual?.bothVisible;
  const leftPinch = spatial?.leftPinch?.active;
  const rightPinch = spatial?.rightPinch?.active;
  const anyPinch = leftPinch || rightPinch;

  if (bimanual) {
    if (anyPinch) {
      return {
        mode: INTERACTION_MODES.GRAB,
        fieldStrength: 0.58,
        orbit: true,
        grab: true,
        label: continuum?.label ?? "Pinza: agarra · mueve la otra mano para girar",
      };
    }
    if (continuum?.palmDrive || Math.abs(continuum?.orbitYaw ?? 0) > 1e-5) {
      return {
        mode: INTERACTION_MODES.BIMANUAL,
        fieldStrength: 0.72,
        orbit: true,
        grab: false,
        label: continuum?.label ?? "Derecha: arrastra para girar en 3D",
      };
    }
    return {
      mode: INTERACTION_MODES.BIMANUAL,
      fieldStrength: 0.5,
      orbit: true,
      grab: false,
      label: continuum?.label ?? "Izquierda pinza · derecha orbita",
    };
  }

  if (dual?.active && dual.dualPinch) {
    return {
      mode: INTERACTION_MODES.TWO_HAND_PINCH,
      fieldStrength: 0.55,
      orbit: true,
      grab: false,
      label:
        continuum?.label ??
        "Pellisca con ambas manos y separa o junta para zoom (como en el móvil)",
    };
  }

  if (dual?.active && (continuum?.twoHandZoom || spatial?.handSpan > 0.12)) {
    return {
      mode: INTERACTION_MODES.TWO_HAND_PINCH,
      fieldStrength: 0.5,
      orbit: true,
      grab: false,
      label:
        continuum?.label ??
        "Dos manos visibles: aléjalas o acércalas para zoom",
    };
  }

  if (singlePinch) {
    return {
      mode: INTERACTION_MODES.GRAB,
      fieldStrength: 0.5,
      orbit: true,
      grab: true,
      label: "Pinch con una mano: agarra cubos o gira el planeta",
    };
  }

  if (handActive && (continuum?.pushing || continuum?.pulling) && !dual?.active) {
    return {
      mode: INTERACTION_MODES.ZOOM,
      fieldStrength: 0.45,
      orbit: false,
      grab: false,
      label: continuum?.label ?? "Acerca o aleja una mano",
    };
  }

  if ((g === "open_palm" || continuum?.palmDrive) && !dual?.active && !singlePinch) {
    return {
      mode: INTERACTION_MODES.PALM_DRIVE,
      fieldStrength: 0.7,
      orbit: true,
      grab: false,
      label: continuum?.label ?? "Palma abierta: arrastra para girar la escena",
    };
  }

  if (g === "fist" && conf > 0.72) {
    return {
      mode: INTERACTION_MODES.FORCE,
      fieldStrength: 1.2,
      orbit: false,
      grab: false,
      label: "Puño: repulsión de partículas",
    };
  }

  if (g === "point" && conf > 0.5) {
    return {
      mode: INTERACTION_MODES.POINT,
      fieldStrength: 0.35,
      orbit: false,
      grab: false,
      label: "Índice: seleccionar nodos",
    };
  }

  if (handActive) {
    return {
      mode: INTERACTION_MODES.FIELD,
      fieldStrength: 0.3,
      orbit: false,
      grab: false,
      label: continuum?.label ?? "Muestra dos manos para zoom tipo pinch",
    };
  }

  return {
    mode: INTERACTION_MODES.IDLE,
    fieldStrength: 0.08,
    orbit: false,
    grab: false,
    label: "Activa la cámara · usa dos manos para zoom",
  };
}
