import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CameraLayer } from "./CameraLayer.jsx";
import { EventConsole } from "./EventConsole.jsx";
import { GestureHudPanel } from "./GestureHudPanel.jsx";
import { LabSceneChrome } from "./LabSceneChrome.jsx";
import { NearbyNodesPanel } from "./NearbyNodesPanel.jsx";
import { SystemStatusBar } from "./SystemStatusBar.jsx";
import {
  computeNearbyNodes,
  fieldStateLabel,
  focalPointFromHands,
  loadPerfTier,
  savePerfTier,
  triModeLabel,
} from "./handLabUtils.js";
import { useHandLabFusion } from "./useHandLabFusion.js";
import { useHandLabInteraction } from "./useHandLabInteraction.js";
import { useRenderGate } from "../../hooks/useRenderGate.js";

import "./handLabStyles.css";

export function CinematicHandLab({
  videoRef,
  landmarkCanvasRef,
  vision,
  gesture,
  perf,
  control,
  events,
  health,
  atoms,
  trackedHands,
  trackingRef,
  wsConnected,
  suggestedAction,
  triModeIndex,
  onAdvanceTriMode,
  onOrganizeAtoms,
  onToggleCamera,
  answer,
  hideChrome = false,
}) {
  const fusionRef = useRef(null);
  const stageRef = useRef(null);
  const renderActive = useRenderGate(stageRef);
  const snapshotRef = useRef({});
  const thumbFlashUntilRef = useRef(0);
  const [perfTier, setPerfTier] = useState(() => loadPerfTier());
  const [showInit, setShowInit] = useState(true);
  const [dockOpen, setDockOpen] = useState(false);

  useEffect(() => {
    const t = window.setTimeout(() => setShowInit(false), 1400);
    return () => window.clearTimeout(t);
  }, []);

  const onThumbAck = useCallback(() => {
    thumbFlashUntilRef.current = performance.now() + 520;
  }, []);

  useHandLabInteraction({
    gesture,
    onVictoryTriMode: onAdvanceTriMode,
    onThumbAck,
  });

  const primaryHand = trackedHands?.[0] ?? null;
  const focal = useMemo(
    () => focalPointFromHands(trackedHands, gesture),
    [trackedHands, gesture],
  );

  const nearbyNodes = useMemo(
    () => computeNearbyNodes(atoms, focal, 6),
    [atoms, focal],
  );

  const focusTitle = useMemo(() => {
    if (!nearbyNodes.length) return null;
    return nearbyNodes[0].label;
  }, [nearbyNodes]);

  const live = trackingRef?.current;
  snapshotRef.current = {
    cameraOn: !!vision?.running,
    hand: live?.hand ?? primaryHand,
    trackedHands: live?.trackedHands ?? trackedHands,
    gesture: live?.gesture ?? gesture,
    atoms: live?.atoms ?? atoms,
    focal: live?.focal ?? focal,
    thumbFlashUntil: thumbFlashUntilRef.current,
  };

  useHandLabFusion(fusionRef, snapshotRef, perfTier, renderActive, trackingRef);

  const coreOk = health === "ok";
  const aiActive = useMemo(() => {
    if (!answer || typeof answer !== "string") return false;
    const t = answer.trim();
    if (t.length < 8) return false;
    return !t.startsWith("Sistema listo.");
  }, [answer]);

  const floatLabel = fieldStateLabel(gesture?.name ?? "unknown");

  return (
    <article
      className={`handlab-root neo-card ${
        hideChrome ? "handlab-root--fullscreen handlab-root--cinema" : "bento-card handlab-root--immersive"
      }`}
    >
      {!hideChrome ? (
        <SystemStatusBar
          visionRunning={!!vision?.running}
          visionSource={vision?.source ?? "—"}
          coreOk={coreOk}
          aiActive={aiActive}
          wsConnected={!!wsConnected}
        />
      ) : null}

      <div ref={stageRef} className="handlab-stage handlab-stage--immersive">
        <CameraLayer videoRef={videoRef} cameraOn={!!vision?.running} scanline>
          <canvas ref={fusionRef} className="handlab-fusion" aria-hidden="true" />
          <canvas ref={landmarkCanvasRef} className="handlab-landmarks" aria-hidden="true" />

          <div className="handlab-hud-layer">
            <LabSceneChrome
              visionRunning={!!vision?.running}
              gesture={gesture}
              focusTitle={focusTitle}
              onToggleCamera={hideChrome ? undefined : onToggleCamera}
              triModeLabel={triModeLabel(triModeIndex)}
            />

            <div className="handlab-hud-br">
              <NearbyNodesPanel
                nodes={nearbyNodes}
                focusLabel={floatLabel}
              />
              <GestureHudPanel
                gesture={gesture}
                perf={perf}
                triModeIndex={triModeIndex}
                controlMode={control?.mode ?? "—"}
                suggestedAction={suggestedAction}
                wsConnected={wsConnected}
                compact
              />
            </div>
          </div>

          <span className="handlab-corner-frame" aria-hidden="true" />

          {showInit ? (
            <div className="handlab-init-banner" role="status">
              INITIALIZING HAND CONTROL LAB
            </div>
          ) : null}

          {!vision?.running ? (
            <div className="handlab-demo-overlay">
              <strong>CAMERA OFF · DEMO FIELD</strong>
              <span>Activa la cámara para fusionar vídeo, red neural y gestos en una sola escena.</span>
            </div>
          ) : null}
        </CameraLayer>
      </div>

      {hideChrome ? (
        <button
          type="button"
          className="handlab-dock-toggle"
          onClick={() => setDockOpen((v) => !v)}
          aria-expanded={dockOpen}
        >
          {dockOpen ? "OCULTAR PANEL" : "AJUSTES · LOG"}
        </button>
      ) : null}

      <div className={`handlab-dock ${hideChrome ? "handlab-dock--overlay" : ""} ${dockOpen || !hideChrome ? "handlab-dock--open" : ""}`}>
        <div className="handlab-toolbar">
          <label>
            Densidad
            <select
              value={perfTier}
              onChange={(e) => {
                const v = e.target.value;
                setPerfTier(v);
                savePerfTier(v);
              }}
            >
              <option value="turbo">TURBO · 320px · ultra fluido</option>
              <option value="low">LOW · 70 px · 24 FPS</option>
              <option value="medium">MED · 200 px · 30 FPS</option>
              <option value="cinematic">CINEMATIC · 420 px · 45 FPS</option>
            </select>
          </label>
          <button type="button" className="handlab-btn" onClick={onOrganizeAtoms}>
            REORGANIZAR RED
          </button>
          <span className="handlab-toolbar-hint handlab-mono">
            {triModeLabel(triModeIndex)} · {floatLabel}
            {focusTitle ? ` · ${focusTitle}` : ""}
          </span>
        </div>

        <EventConsole events={events} />
      </div>
    </article>
  );
}
