import { lazy, Suspense, useCallback, useEffect, useRef, useState } from "react";
import { navigateToDeck } from "../../surfaceRouting.js";
import { buildSpatialInput } from "./engine/buildSpatialInput.js";
import { resetLandmarkStabilizer } from "./engine/landmarkStabilizer.js";
import { resetSpatialContinuum } from "./engine/spatialContinuum.js";
import { resetStillnessGate } from "./engine/stillnessGate.js";
import { loadSandboxScene, saveSandboxScene } from "./engine/scenePersistence.js";
import { SpatialHudOverlay } from "./hud/SpatialHudOverlay.jsx";
import { drawHandTrackingOverlay } from "../handLab/handLabDraw.js";
import "./spatialLabStyles.css";

const SpatialLabCanvas = lazy(() =>
  import("./scene/SpatialLabCanvas.jsx").then((m) => ({ default: m.SpatialLabCanvas })),
);

export function SpatialLabSurface({
  videoRef,
  landmarkCanvasRef,
  vision,
  perf,
  trackingRef,
  onToggleCamera,
  isStandaloneWindow = false,
}) {
  const [initialScene] = useState(() => loadSandboxScene());
  const sceneStateRef = useRef({
    blocks: initialScene.blocks,
    globe: initialScene.globe,
    selectedNodeId: initialScene.selectedNodeId,
    selectedLabel: null,
    lastSavedAt: initialScene.savedAt,
  });
  const spatialInputRef = useRef(buildSpatialInput(trackingRef));
  const [snapshot, setSnapshot] = useState(() => ({
    ...spatialInputRef.current,
    selectedNodeId: null,
    selectedLabel: null,
    lastSavedAt: initialScene.savedAt,
  }));
  const [saveFlash, setSaveFlash] = useState("");

  const persistScene = useCallback(() => {
    const payload = saveSandboxScene({
      blocks: sceneStateRef.current.blocks,
      globe: sceneStateRef.current.globe,
      selectedNodeId: sceneStateRef.current.selectedNodeId,
    });
    if (payload) {
      sceneStateRef.current.lastSavedAt = payload.savedAt;
      setSaveFlash(`Guardado ${new Date(payload.savedAt).toLocaleTimeString()}`);
      window.setTimeout(() => setSaveFlash(""), 2400);
    }
  }, []);

  useEffect(() => {
    let raf = 0;
    const tick = () => {
      spatialInputRef.current = buildSpatialInput(trackingRef);
      setSnapshot({
        ...spatialInputRef.current,
        selectedNodeId: sceneStateRef.current.selectedNodeId,
        selectedLabel: sceneStateRef.current.selectedLabel,
        lastSavedAt: sceneStateRef.current.lastSavedAt,
      });
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [trackingRef]);

  useEffect(() => {
    const timer = window.setInterval(persistScene, 8000);
    return () => window.clearInterval(timer);
  }, [persistScene]);

  useEffect(() => {
    if (vision?.running) {
      resetSpatialContinuum();
      resetLandmarkStabilizer(trackingRef);
      resetStillnessGate();
    }
  }, [vision?.running, trackingRef]);

  useEffect(() => {
    if (!vision?.running) return undefined;
    let raf = 0;
    const paintPiP = () => {
      raf = requestAnimationFrame(paintPiP);
      const canvas = landmarkCanvasRef.current;
      const video = videoRef.current;
      if (!canvas || !video || video.readyState < 2) return;
      const w = 200;
      const h = 112;
      if (canvas.width !== w) {
        canvas.width = w;
        canvas.height = h;
      }
      const ctx = canvas.getContext("2d", { alpha: true, desynchronized: true });
      if (!ctx) return;
      const snap = spatialInputRef.current;
      drawHandTrackingOverlay(ctx, w, h, {
        hand: snap.hands?.[0] ?? null,
        hands: snap.hands,
        gesture: snap.gesture,
        mouseEnabled: false,
        mouseAssist: { armed: false },
        pointerReacquireRadius: 0.12,
      });
    };
    raf = requestAnimationFrame(paintPiP);
    return () => cancelAnimationFrame(raf);
  }, [vision?.running, landmarkCanvasRef, videoRef]);

  const reloadScene = () => {
    const data = loadSandboxScene();
    sceneStateRef.current = {
      blocks: data.blocks,
      globe: data.globe,
      selectedNodeId: data.selectedNodeId,
      selectedLabel: null,
      lastSavedAt: data.savedAt,
    };
    window.location.reload();
  };

  return (
    <div className="spatial-surface">
      <header className="spatial-surface__bar">
        <div>
          <span className="spatial-surface__kicker">NEURAL SANDBOX · 2050 · BIMANUAL</span>
          <h1>Spatial Sandbox</h1>
        </div>
        <div className="spatial-surface__actions">
          {!isStandaloneWindow ? (
            <button type="button" className="spatial-btn" onClick={() => navigateToDeck()}>
              ← Command Deck
            </button>
          ) : null}
          <button type="button" className="spatial-btn" onClick={persistScene}>
            GUARDAR ESCENA
          </button>
          <button type="button" className="spatial-btn" onClick={reloadScene}>
            CARGAR
          </button>
          <button type="button" className="spatial-btn spatial-btn--cam" onClick={onToggleCamera}>
            {vision?.running ? "DETENER CÁMARA" : "ACTIVAR CÁMARA"}
          </button>
        </div>
      </header>

      {saveFlash ? <div className="spatial-save-toast">{saveFlash}</div> : null}

      <div className="spatial-surface__stage">
        <Suspense fallback={<div className="spatial-loading">Cargando Rapier · Bloom · Raycast…</div>}>
          <SpatialLabCanvas
            inputRef={spatialInputRef}
            trackingRef={trackingRef}
            sceneStateRef={sceneStateRef}
            initialScene={initialScene}
          />
        </Suspense>

        <SpatialHudOverlay snapshot={snapshot} perf={perf} vision={vision} />

        <div className="spatial-pip">
          <video
            ref={videoRef}
            className={`spatial-pip__video ${vision?.running ? "spatial-pip__video--live" : ""}`}
            playsInline
            muted
          />
          <canvas ref={landmarkCanvasRef} className="spatial-pip__overlay" aria-hidden="true" />
          {!vision?.running ? (
            <span className="spatial-pip__hint">Activa la cámara para tracking espacial</span>
          ) : null}
        </div>
      </div>
    </div>
  );
}
