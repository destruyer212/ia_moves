import "./handLabStyles.css";

export function EventConsole({ events }) {
  return (
    <footer className="handlab-panel handlab-panel--console" aria-label="Consola de eventos">
      <header className="handlab-panel-header">
        <span className="handlab-chip handlab-chip--amber">LOG</span>
        <span className="handlab-panel-title">Stream eventos</span>
      </header>
      <div className="handlab-console-body">
        {(events?.length ? events : [{ time: "—", text: "Sin eventos recientes." }]).map((ev, index) => (
          <div key={`${ev.time}-${index}`} className="handlab-console-line">
            <time className="handlab-mono">{ev.time}</time>
            <p>{ev.text}</p>
          </div>
        ))}
      </div>
    </footer>
  );
}
