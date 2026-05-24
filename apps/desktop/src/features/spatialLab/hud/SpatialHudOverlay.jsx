import { modeLabel } from "../engine/gestureStateMachine.js";

export function SpatialHudOverlay({ snapshot, perf, vision }) {
  const mode = snapshot?.interaction?.mode ?? "idle";
  const gesture = snapshot?.gesture?.name ?? "unknown";
  const conf = Math.round((snapshot?.gesture?.confidence ?? 0) * 100);
  const strength = Math.round((snapshot?.interaction?.fieldStrength ?? 0) * 100);

  return (
    <div className="spatial-hud" aria-live="polite">
      <header className="spatial-hud__brand">
        <span className="spatial-hud__kicker">IA MOVES · SPATIAL COMPUTING</span>
        <h2 className="spatial-hud__title">Neural Sandbox 2050</h2>
        <p className="spatial-hud__subtitle">Bimanual volumetric rig · plano ampliado</p>
      </header>

      <div className="spatial-hud__mode">
        <span className="spatial-hud__chip">INTERACTION STATE</span>
        <strong className="spatial-hud__mode-label">{modeLabel(mode)}</strong>
        {(snapshot?.interaction?.label || snapshot?.continuum?.label) ? (
          <p className="spatial-hud__hint-line">
            {snapshot.continuum?.label || snapshot.interaction.label}
          </p>
        ) : null}
      </div>

      <dl className="spatial-hud__telemetry">
        <div>
          <dt>Gesto</dt>
          <dd>{gesture}</dd>
        </div>
        <div>
          <dt>Confianza</dt>
          <dd>{conf}%</dd>
        </div>
        <div>
          <dt>Campo</dt>
          <dd>{strength}%</dd>
        </div>
        <div>
          <dt>FPS / INF</dt>
          <dd>{perf?.fps ?? 0} · {perf?.inferMs ?? 0} ms</dd>
        </div>
        <div>
          <dt>Cámara</dt>
          <dd>{vision?.running ? "LIVE" : "OFF"}</dd>
        </div>
        <div>
          <dt>Manos</dt>
          <dd>{snapshot?.hands?.length ?? 0}</dd>
        </div>
        <div>
          <dt>Distancia</dt>
          <dd>
            {snapshot?.continuum?.nearCamera || snapshot?.spatial?.nearCamera
              ? "Muy cerca · retrocede"
              : "OK"}
          </dd>
        </div>
        <div>
          <dt>Giro/zoom</dt>
          <dd>
            Y{(snapshot?.continuum?.orbitYaw ?? 0).toFixed(3)} Z
            {(snapshot?.continuum?.smoothedZoom ?? 1).toFixed(2)}
          </dd>
        </div>
        <div>
          <dt>Raycast</dt>
          <dd className="spatial-hud__pick">
            {snapshot?.selectedLabel ?? snapshot?.selectedNodeId ?? "—"}
          </dd>
        </div>
        <div>
          <dt>Sandbox</dt>
          <dd>
            {snapshot?.lastSavedAt
              ? new Date(snapshot.lastSavedAt).toLocaleTimeString()
              : "sin guardar"}
          </dd>
        </div>
      </dl>

      <aside className="spatial-hud__help">
        <span className="spatial-hud__chip spatial-hud__chip--amber">GESTURE MAP</span>
        <ul>
          <li><strong>Pinza (izq.)</strong> + <strong>mueve la derecha</strong> = girar (no hace falta palma perfecta)</li>
          <li><strong>Dos pinzas</strong> separar/juntar = zoom · <strong>una mano</strong> acerca/aleja = zoom</li>
          <li><strong>Solo una mano</strong>: acerca/aleja zoom · arrastra = girar</li>
          <li>Plano amplio: puedes desplazarte más sin perder la escena</li>
          <li>Mano muy cerca → aléjala 15–25 cm para estabilidad</li>
          <li>Una sola mano: palma abierta sigue girando la vista</li>
          <li>Una mano acerca/aleja → zoom simple</li>
          <li>Índice → seleccionar nodos</li>
        </ul>
        <p className="spatial-hud__note">
          Cursor oculto en la escena · solo gestos · los botones de arriba sí usan ratón
        </p>
      </aside>
    </div>
  );
}
