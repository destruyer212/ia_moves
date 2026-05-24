import "./handLabStyles.css";
import { triModeLabel } from "./handLabUtils";

export function GestureHudPanel({
  gesture,
  perf,
  triModeIndex,
  controlMode,
  suggestedAction,
  wsConnected,
  compact = false,
}) {
  const g = gesture?.name ?? "unknown";
  const conf = Math.round((gesture?.confidence ?? 0) * 100);

  return (
    <aside
      className={`handlab-panel handlab-panel--right ${compact ? "handlab-panel--compact" : ""}`}
      aria-label="Telemetría gestual"
    >
      <header className="handlab-panel-header">
        <span className="handlab-chip">SIGNAL</span>
        <span className="handlab-panel-title">Telemetría</span>
      </header>
      <dl className="handlab-dl">
        <div className="handlab-dl-row">
          <dt>Gesto</dt>
          <dd className="handlab-mono handlab-glow">{g}{gesture?.stale ? " · HOLD" : ""}</dd>
        </div>
        <div className="handlab-dl-row">
          <dt>Confianza</dt>
          <dd className="handlab-mono">{conf}%</dd>
        </div>
        <div className="handlab-dl-row">
          <dt>FPS / INF</dt>
          <dd className="handlab-mono">{perf?.fps ?? "—"} fps · {perf?.inferMs ?? "—"} ms</dd>
        </div>
        <div className="handlab-dl-row">
          <dt>Modo control</dt>
          <dd className="handlab-mono">
            {controlMode === "desconectado" ? "backend offline" : (controlMode ?? "—")}
          </dd>
        </div>
        <div className="handlab-dl-row">
          <dt>Modo lab</dt>
          <dd className="handlab-mono handlab-accent">{triModeLabel(triModeIndex)}</dd>
        </div>
        <div className="handlab-dl-row">
          <dt>Acción</dt>
          <dd className="handlab-mono handlab-dim">{suggestedAction ?? "—"}</dd>
        </div>
        <div className="handlab-dl-row">
          <dt>WS stream</dt>
          <dd className={`handlab-mono ${wsConnected ? "handlab-ok" : "handlab-warn"}`}>
            {wsConnected ? "SYNC" : "IDLE"}
          </dd>
        </div>
      </dl>
    </aside>
  );
}
