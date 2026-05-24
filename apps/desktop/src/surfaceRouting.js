/** Rutas de superficie sin react-router: hash #hand-lab | #spatial-lab */

export const SURFACE_DECK = "deck";
export const SURFACE_HAND_LAB = "handlab";
export const SURFACE_SPATIAL_LAB = "spatiallab";

export function getSurfaceFromLocation(loc = window.location) {
  const hash = (loc.hash || "").replace(/^#/, "").toLowerCase();
  if (hash === "spatial-lab" || hash === "spatiallab" || hash === "spatial") {
    return SURFACE_SPATIAL_LAB;
  }
  if (hash === "hand-lab" || hash === "handlab") return SURFACE_HAND_LAB;
  return SURFACE_DECK;
}

export function isDedicatedHandLabWindow(loc = window.location) {
  const params = new URLSearchParams(loc.search || "");
  return params.get("dedicated") === "handlab";
}

export function handLabUrl(baseUrl = window.location.href) {
  const url = new URL(baseUrl);
  url.searchParams.set("dedicated", "handlab");
  url.hash = "hand-lab";
  return url.toString();
}

export function deckUrl(baseUrl = window.location.href) {
  const url = new URL(baseUrl);
  url.hash = "";
  return url.toString();
}

export function navigateToHandLab() {
  if (getSurfaceFromLocation() === SURFACE_HAND_LAB) return;
  window.location.hash = "hand-lab";
  window.dispatchEvent(new HashChangeEvent("hashchange"));
}

export function navigateToSpatialLab() {
  if (getSurfaceFromLocation() === SURFACE_SPATIAL_LAB) return;
  window.location.hash = "spatial-lab";
  window.dispatchEvent(new HashChangeEvent("hashchange"));
}

export function navigateToDeck() {
  if (getSurfaceFromLocation() === SURFACE_DECK) return;
  window.history.replaceState(null, "", deckUrl());
  window.dispatchEvent(new HashChangeEvent("hashchange"));
}

export async function openHandLabWindow() {
  if (window.iaMoves?.openHandLabWindow) {
    await window.iaMoves.openHandLabWindow();
    return;
  }
  const features = "width=1240,height=820,menubar=no,toolbar=no,location=no,status=no";
  window.open(handLabUrl(), "ia-moves-hand-lab", features);
}
