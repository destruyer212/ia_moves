import { atomDisplayLabel, pinchFromHand } from "./handLabUtils";

const TIP_INDICES = [4, 8, 12, 16, 20];

function drawGlowLine(ctx, x1, y1, x2, y2, alpha = 0.55, width = 1) {
  ctx.save();
  ctx.strokeStyle = `rgba(255, 255, 255, ${alpha})`;
  ctx.lineWidth = width;
  ctx.shadowBlur = 10;
  ctx.shadowColor = "rgba(200, 245, 255, 0.85)";
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
  ctx.restore();
}

function nearestNodes(nodes, px, py, k, w, h) {
  return nodes
    .map((n) => ({
      n,
      d: Math.hypot(n.x * w - px, n.y * h - py),
    }))
    .sort((a, b) => a.d - b.d)
    .slice(0, k)
    .map((x) => x.n);
}

export function drawNeuralMesh(ctx, w, h, nodes, centerX, centerY) {
  const maxNormDist = 0.14;

  for (let i = 0; i < nodes.length; i += 1) {
    const a = nodes[i];
    drawGlowLine(ctx, centerX, centerY, a.x * w, a.y * h, 0.22, 0.85);
  }

  for (let i = 0; i < nodes.length; i += 1) {
    const a = nodes[i];
    for (let j = i + 1; j < nodes.length; j += 1) {
      const b = nodes[j];
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      if (dist < maxNormDist) {
        const fade = 1 - dist / maxNormDist;
        drawGlowLine(ctx, a.x * w, a.y * h, b.x * w, b.y * h, 0.08 + fade * 0.28, 0.75);
      }
    }
  }

  for (let i = 0; i < nodes.length; i += 5) {
    const a = nodes[i];
    const b = nodes[(i + 13) % nodes.length];
    drawGlowLine(ctx, a.x * w, a.y * h, b.x * w, b.y * h, 0.14, 0.6);
  }
}

export function drawHandTethers(ctx, w, h, hand, nodes) {
  if (!hand?.length) return;
  TIP_INDICES.forEach((idx, ti) => {
    const tip = hand[idx];
    const px = tip.x * w;
    const py = tip.y * h;
    const near = nearestNodes(nodes, px, py, 2, w, h);
    near.forEach((n) => {
      const accent = ti === 1 ? 0.72 : 0.38;
      ctx.save();
      ctx.strokeStyle = ti === 1 ? `rgba(255, 160, 90, ${accent})` : `rgba(120, 240, 255, ${accent})`;
      ctx.lineWidth = ti === 1 ? 1.5 : 1;
      ctx.shadowBlur = 8;
      ctx.shadowColor = "rgba(255, 200, 120, 0.5)";
      ctx.beginPath();
      ctx.moveTo(px, py);
      ctx.lineTo(n.x * w, n.y * h);
      ctx.stroke();
      ctx.restore();
    });
  });
}

export function drawMeshNodes(ctx, w, h, nodes, pal) {
  for (const n of nodes) {
    const depth = n.z ?? 0.5;
    const r = (2.2 + depth * 2.8) * (n.hot ? 1.35 : 1);
    const px = n.x * w;
    const py = n.y * h - depth * 18;
    const hue = n.hot ? 28 : 190;
    ctx.save();
    ctx.fillStyle = n.hot
      ? `hsla(${hue}, 100%, 65%, ${0.85 + depth * 0.1})`
      : `hsla(195, 100%, ${72 + depth * 8}%, ${0.7 + depth * 0.15})`;
    ctx.shadowBlur = n.hot ? 18 : 12;
    ctx.shadowColor = n.hot ? "rgba(255, 150, 80, 0.9)" : pal.secondary;
    ctx.beginPath();
    ctx.arc(px, py, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

export function drawAtomGraph(ctx, w, h, atoms, nodes, focusId, ts) {
  if (!atoms?.length) return;

  atoms.forEach((atom, index) => {
    const axm = 1 - atom.x;
    const aym = atom.y;
    const sx = axm * w;
    const sy = aym * h;
    const isFocus = atom.id === focusId;
    const near = nearestNodes(nodes, sx, sy, 2, w, h);

    near.forEach((n) => {
      drawGlowLine(ctx, n.x * w, n.y * h, sx, sy, isFocus ? 0.55 : 0.25, isFocus ? 1.2 : 0.8);
    });

    const pulse = isFocus ? 1 + Math.sin(ts * 0.008) * 0.15 : 1;
    const radius = (isFocus ? 9 : 5) * pulse;

    ctx.save();
    const grd = ctx.createRadialGradient(sx, sy, 0, sx, sy, radius * 3);
    grd.addColorStop(0, isFocus ? "rgba(255, 180, 90, 0.95)" : "rgba(120, 250, 255, 0.75)");
    grd.addColorStop(0.4, isFocus ? "rgba(255, 120, 60, 0.45)" : "rgba(98, 233, 255, 0.35)");
    grd.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = grd;
    ctx.beginPath();
    ctx.arc(sx, sy, radius * 3, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = isFocus ? "#fff8f0" : "#e8fcff";
    ctx.shadowBlur = 14;
    ctx.shadowColor = isFocus ? "rgba(255, 160, 80, 1)" : "rgba(98, 233, 255, 0.8)";
    ctx.beginPath();
    ctx.arc(sx, sy, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    const label = atomDisplayLabel(atom, index);
    ctx.save();
    ctx.font = '600 11px "Share Tech Mono", ui-monospace, monospace';
    ctx.fillStyle = isFocus ? "rgba(255, 230, 200, 0.95)" : "rgba(160, 240, 255, 0.72)";
    ctx.shadowBlur = 6;
    ctx.shadowColor = "rgba(0, 200, 255, 0.5)";
    ctx.fillText(label, sx + 12, sy - 8);
    ctx.restore();

    if (isFocus) {
      const bracket = 14 + Math.sin(ts * 0.01) * 2;
      ctx.save();
      ctx.strokeStyle = "rgba(98, 233, 255, 0.9)";
      ctx.lineWidth = 1.5;
      ctx.shadowBlur = 8;
      ctx.shadowColor = "rgba(98, 233, 255, 0.6)";
      ctx.beginPath();
      ctx.arc(sx, sy, bracket + 10, 0, Math.PI * 2);
      ctx.stroke();
      const L = bracket;
      [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([sxm, sym]) => {
        ctx.beginPath();
        ctx.moveTo(sx + sxm * (L + 10), sy + sym * L);
        ctx.lineTo(sx + sxm * L, sy + sym * L);
        ctx.lineTo(sx + sxm * L, sy + sym * (L + 10));
        ctx.stroke();
      });
      ctx.restore();
    }
  });
}

export function drawAmbientParticles(ctx, w, h, parts, ts, gestureName) {
  for (const p of parts) {
    const z = p.z;
    const sx = p.x * w;
    const sy = p.y * h - z * 12;
    const pr = (0.8 + z * 1.4) * (gestureName === "victory" ? 1.15 : 1);
    const cyan = p.phase % 1 > 0.5;
    ctx.fillStyle = cyan
      ? `rgba(80, 240, 255, ${0.15 + z * 0.35})`
      : `rgba(255, 140, 70, ${0.12 + z * 0.3})`;
    ctx.shadowBlur = 6;
    ctx.shadowColor = cyan ? "rgba(0,255,255,0.5)" : "rgba(255,120,0,0.4)";
    ctx.beginPath();
    ctx.arc(sx + Math.sin(ts * 0.002 + p.phase) * 2, sy, pr, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.shadowBlur = 0;
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
