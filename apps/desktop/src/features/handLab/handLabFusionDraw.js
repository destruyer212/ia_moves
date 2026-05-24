import { atomDisplayLabel, pinchFromHand } from "./handLabUtils";

const TIP_INDICES = [4, 8, 12, 16, 20];

/** Líneas en batch — sin shadowBlur (evita copias offscreen por trazo). */
function strokeLines(ctx, segments, strokeStyle, lineWidth = 1) {
  if (!segments.length) return;
  ctx.strokeStyle = strokeStyle;
  ctx.lineWidth = lineWidth;
  ctx.beginPath();
  for (const [x1, y1, x2, y2] of segments) {
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
  }
  ctx.stroke();
}

function nearestNodes(nodes, px, py, k, w, h) {
  const scored = [];
  for (const n of nodes) {
    const d = Math.hypot(n.x * w - px, n.y * h - py);
    if (scored.length < k) {
      scored.push({ n, d });
      scored.sort((a, b) => a.d - b.d);
    } else if (d < scored[scored.length - 1].d) {
      scored[scored.length - 1] = { n, d };
      scored.sort((a, b) => a.d - b.d);
    }
  }
  return scored.map((x) => x.n);
}

export function drawNeuralMesh(ctx, w, h, nodes, centerX, centerY) {
  const hub = [];
  const ring = [];
  const chords = [];
  const len = nodes.length;

  for (let i = 0; i < len; i += 1) {
    const a = nodes[i];
    const ax = a.x * w;
    const ay = a.y * h;
    hub.push([centerX, centerY, ax, ay]);
    const b = nodes[(i + 1) % len];
    ring.push([ax, ay, b.x * w, b.y * h]);
    const c = nodes[(i + 5) % len];
    chords.push([ax, ay, c.x * w, c.y * h]);
  }

  strokeLines(ctx, hub, "rgba(255, 255, 255, 0.14)", 0.75);
  strokeLines(ctx, ring, "rgba(200, 235, 255, 0.22)", 0.85);
  strokeLines(ctx, chords, "rgba(130, 210, 255, 0.1)", 0.65);
}

export function drawHandTethers(ctx, w, h, hand, nodes) {
  if (!hand?.length) return;
  const segs = [];
  TIP_INDICES.forEach((idx, ti) => {
    if (ti > 2) return;
    const tip = hand[idx];
    const px = tip.x * w;
    const py = tip.y * h;
    nearestNodes(nodes, px, py, 1, w, h).forEach((n) => {
      segs.push([px, py, n.x * w, n.y * h]);
    });
  });
  strokeLines(ctx, segs, "rgba(120, 240, 255, 0.35)", 1);
  if (hand[8]) {
    const ix = hand[8].x * w;
    const iy = hand[8].y * h;
    nearestNodes(nodes, ix, iy, 1, w, h).forEach((n) => {
      strokeLines(ctx, [[ix, iy, n.x * w, n.y * h]], "rgba(255, 160, 90, 0.55)", 1.2);
    });
  }
}

export function drawMeshNodes(ctx, w, h, nodes) {
  for (const n of nodes) {
    const depth = n.z ?? 0.5;
    const r = (2 + depth * 2.2) * (n.hot ? 1.25 : 1);
    const px = n.x * w;
    const py = n.y * h - depth * 14;
    ctx.fillStyle = n.hot ? "rgba(255, 170, 90, 0.9)" : "rgba(120, 240, 255, 0.75)";
    ctx.beginPath();
    ctx.arc(px, py, r, 0, Math.PI * 2);
    ctx.fill();
  }
}

export function drawAtomGraph(ctx, w, h, atoms, nodes, focusId, ts, drawAllLabels = false) {
  if (!atoms?.length) return;

  const linkSegs = [];
  atoms.forEach((atom) => {
    const sx = (1 - atom.x) * w;
    const sy = atom.y * h;
    const isFocus = atom.id === focusId;
    nearestNodes(nodes, sx, sy, 1, w, h).forEach((n) => {
      linkSegs.push([n.x * w, n.y * h, sx, sy]);
    });
    const pulse = isFocus ? 1 + Math.sin(ts * 0.008) * 0.12 : 1;
    const radius = (isFocus ? 7 : 4) * pulse;
    ctx.fillStyle = isFocus ? "rgba(255, 180, 90, 0.95)" : "rgba(160, 235, 255, 0.65)";
    ctx.beginPath();
    ctx.arc(sx, sy, radius, 0, Math.PI * 2);
    ctx.fill();
    if (isFocus) {
      ctx.strokeStyle = "rgba(98, 233, 255, 0.75)";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(sx, sy, radius + 12, 0, Math.PI * 2);
      ctx.stroke();
    }
  });
  strokeLines(ctx, linkSegs, "rgba(255, 255, 255, 0.2)", 0.8);

  atoms.forEach((atom, index) => {
    const isFocus = atom.id === focusId;
    if (!isFocus && !drawAllLabels) return;
    const sx = (1 - atom.x) * w;
    const sy = atom.y * h;
    const label = atomDisplayLabel(atom, index);
    ctx.font = '600 10px "Share Tech Mono", ui-monospace, monospace';
    ctx.fillStyle = isFocus ? "rgba(255, 230, 200, 0.95)" : "rgba(160, 240, 255, 0.55)";
    ctx.fillText(label, sx + 10, sy - 6);
  });
}

export function drawAmbientParticles(ctx, w, h, parts, ts) {
  const n = parts.length;
  for (let i = 0; i < n; i += 1) {
    const p = parts[i];
    const z = p.z;
    const sx = p.x * w + Math.sin(ts * 0.002 + p.phase) * 1.5;
    const sy = p.y * h - z * 10;
    const pr = 0.7 + z * 1.1;
    ctx.fillStyle = p.phase % 1 > 0.5
      ? `rgba(80, 240, 255, ${0.12 + z * 0.22})`
      : `rgba(255, 140, 70, ${0.1 + z * 0.18})`;
    ctx.beginPath();
    ctx.arc(sx, sy, pr, 0, Math.PI * 2);
    ctx.fill();
  }
}

export function pickFocusAtomId(atoms, focal) {
  if (!atoms?.length) return null;
  let best = atoms[0];
  let bestD = Infinity;
  for (const atom of atoms) {
    const d = Math.hypot(1 - atom.x - focal.x, atom.y - focal.y);
    if (d < bestD) {
      bestD = d;
      best = atom;
    }
  }
  return best?.id ?? null;
}

export { pinchFromHand, nearestNodes };
