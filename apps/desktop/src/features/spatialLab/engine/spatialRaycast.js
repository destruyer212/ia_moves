import * as THREE from "three";

/** Punta del índice → NDC para Raycaster (cámara espejada como el vídeo) */
export function indexTipToNdc(hand) {
  if (!hand?.[8]) return null;
  const tip = hand[8];
  return new THREE.Vector2((1 - tip.x) * 2 - 1, -(tip.y * 2 - 1));
}

export function raycastSpatialTargets(camera, scene, hand, options = {}) {
  const ndc = indexTipToNdc(hand);
  if (!ndc || !camera || !scene) return { hit: null, hits: [] };

  const raycaster = new THREE.Raycaster();
  raycaster.setFromCamera(ndc, camera);
  const hits = raycaster.intersectObjects(scene.children, true);
  const filtered = hits.filter((h) => h.object.userData?.spatialPickable);
  const hit = filtered[0] ?? null;
  return { hit, hits: filtered, ndc };
}

export function pickTargetLabel(hit) {
  if (!hit?.object) return null;
  let o = hit.object;
  while (o) {
    if (o.userData?.spatialNodeId) {
      return {
        id: o.userData.spatialNodeId,
        label: o.userData.spatialLabel ?? o.userData.spatialNodeId,
      };
    }
    o = o.parent;
  }
  return null;
}
