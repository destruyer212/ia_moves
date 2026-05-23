import "./handLabStyles.css";
import { fieldStateLabel, zoomPercentFromGesture } from "./handLabUtils";

export function LabSceneChrome({
  visionRunning,
  gesture,
  focusTitle,
  onToggleCamera,
  triModeLabel: triLabel,
}) {
  const zoom = zoomPercentFromGesture(gesture?.name ?? "unknown");
  const field = fieldStateLabel(gesture?.name ?? "unknown");

  return (
    <>
      <div className="handlab-chrome handlab-chrome--top">
        <h2 className="handlab-hero-title">Neural Field</h2>
        {onToggleCamera ? (
          <button type="button" className="handlab-pill-btn" onClick={onToggleCamera}>
            {visionRunning ? "DESACTIVAR" : "ACTIVAR"}
          </button>
        ) : null}
      </div>

      {focusTitle ? (
        <div className="handlab-chrome handlab-chrome--center" aria-live="polite">
          <span className="handlab-focus-title">{focusTitle}</span>
          <span className="handlab-focus-sub handlab-mono">{field}</span>
        </div>
      ) : null}

      <div className="handlab-chrome handlab-chrome--bl">
        <div className="handlab-zoom-pill">
          <span className="handlab-zoom-label">ZOOM</span>
          <strong className="handlab-mono">{zoom}%</strong>
        </div>
        <div className="handlab-cursor-pill">
          <span className="handlab-cursor-icon" aria-hidden="true">◎</span>
          <span className="handlab-mono">CURSOR</span>
          <span className="handlab-cursor-mode">{triLabel ?? "LAB"}</span>
        </div>
      </div>

      <div className="handlab-chrome handlab-chrome--gesture">
        <span className="handlab-gesture-nav">GESTURE NAV</span>
      </div>
    </>
  );
}
