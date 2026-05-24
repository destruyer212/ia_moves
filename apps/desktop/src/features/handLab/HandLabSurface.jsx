import { CinematicHandLab } from "./CinematicHandLab.jsx";
import { navigateToDeck } from "../../surfaceRouting.js";
import "./handLabStyles.css";

/**
 * Pantalla dedicada del laboratorio gestual (pantalla completa o ventana aparte).
 */
export function HandLabSurface({
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
  isStandaloneWindow = false,
}) {
  return (
    <div className="handlab-surface handlab-surface--cinema">
      <header className="handlab-surface-bar handlab-surface-bar--overlay hud-panel">
        <div className="handlab-surface-brand">
          <span className="handlab-breadcrumb-kicker">IA MOVES · NEURAL FIELD</span>
          <h1 className="handlab-surface-title">Cinematic Hand Control Lab</h1>
        </div>
        <div className="handlab-surface-actions">
          {!isStandaloneWindow ? (
            <button type="button" className="handlab-btn" onClick={() => navigateToDeck()}>
              ← Volver al Command Deck
            </button>
          ) : null}
          <button
            type="button"
            className="handlab-btn handlab-btn--cam"
            onClick={onToggleCamera}
          >
            {vision?.running ? "DETENER CÁMARA" : "ACTIVAR CÁMARA"}
          </button>
        </div>
      </header>

      <div className="handlab-surface-body handlab-surface-body--cinema">
        <CinematicHandLab
          videoRef={videoRef}
          landmarkCanvasRef={landmarkCanvasRef}
          vision={vision}
          gesture={gesture}
          perf={perf}
          control={control}
          events={events}
          health={health}
          atoms={atoms}
          trackedHands={trackedHands}
          wsConnected={wsConnected}
          suggestedAction={suggestedAction}
          triModeIndex={triModeIndex}
          onAdvanceTriMode={onAdvanceTriMode}
          onOrganizeAtoms={onOrganizeAtoms}
          onToggleCamera={onToggleCamera}
          answer={answer}
          hideChrome
        />
      </div>
    </div>
  );
}
