import "./handLabStyles.css";

export function SystemStatusBar({
  visionRunning,
  visionSource,
  coreOk,
  aiActive,
  wsConnected,
}) {
  const items = [
    { id: "cam", label: "CAMERA", ok: visionRunning, sub: visionRunning ? "ONLINE" : "STANDBY" },
    { id: "mp", label: "MEDIAPIPE", ok: visionRunning, sub: visionRunning ? (visionSource || "ACTIVE") : "IDLE" },
    { id: "core", label: "CORE", ok: coreOk, sub: coreOk ? "CONNECTED" : "OFFLINE" },
    { id: "ws", label: "WS STREAM", ok: wsConnected, sub: wsConnected ? "LIVE" : "—" },
    { id: "ai", label: "AI", ok: aiActive, sub: aiActive ? "ACTIVE" : "STANDBY" },
  ];

  return (
    <header className="handlab-status-bar" role="status" aria-label="Estado del sistema">
      {items.map((item) => (
        <div key={item.id} className={`handlab-status-cell ${item.ok ? "handlab-status-cell--ok" : ""}`}>
          <span className="handlab-status-label">{item.label}</span>
          <span className="handlab-status-sub handlab-mono">{item.sub}</span>
        </div>
      ))}
    </header>
  );
}
