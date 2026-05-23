import "./handLabStyles.css";

export function NearbyNodesPanel({ nodes, focusLabel }) {
  return (
    <aside className="handlab-nearby" aria-label="Nodos cercanos">
      <header className="handlab-nearby-head">
        <span className="handlab-nearby-title">NODOS CERCANOS</span>
      </header>
      <ul className="handlab-nearby-list">
        {(nodes?.length ? nodes : [{ label: "—", weight: 0 }]).map((node, i) => (
          <li key={node.id ?? `n-${i}`} className={i === 0 ? "handlab-nearby-row handlab-nearby-row--focus" : "handlab-nearby-row"}>
            <span className="handlab-nearby-label">{node.label}</span>
            <span className="handlab-nearby-bar" aria-hidden="true">
              <span className="handlab-nearby-fill" style={{ width: `${Math.max(8, node.weight ?? 0)}%` }} />
            </span>
            {i === 0 ? <span className="handlab-nearby-pct">{node.weight ?? 0}%</span> : null}
          </li>
        ))}
      </ul>
      {focusLabel ? (
        <p className="handlab-nearby-focus handlab-mono">{focusLabel}</p>
      ) : null}
    </aside>
  );
}
