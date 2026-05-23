import { useEffect, useRef } from "react";
import {
  atomDisplayLabel,
  fieldStateLabel,
  gesturePalette,
  getParticleCount,
  pinchFromHand,
} from "./handLabUtils";
import {
  drawAmbientParticles,
  drawAtomGraph,
  drawHandTethers,
  drawMeshNodes,
  drawNeuralMesh,
  pickFocusAtomId as pickFocus,
} from "./handLabFusionDraw.js";

function initParticles(count) {
  const list = [];
  for (let i = 0; i < count; i += 1) {
    list.push({
      x: Math.random(),
      y: Math.random(),
      z: Math.random() * 0.85 + 0.1,
      vx: (Math.random() - 0.5) * 0.0004,
      vy: (Math.random() - 0.5) * 0.0004,
      phase: Math.random() * Math.PI * 2,
    });
  }
  return list;
}

function resizeParticles(list, target) {
  if (list.length === target) return list;
  if (list.length > target) return list.slice(0, target);
  const next = list.slice();
  while (next.length < target) {
    next.push({
      x: Math.random(),
      y: Math.random(),
      z: Math.random() * 0.85 + 0.1,
      vx: (Math.random() - 0.5) * 0.0004,
      vy: (Math.random() - 0.5) * 0.0004,
      phase: Math.random() * Math.PI * 2,
    });
  }
  return next;
}

export function useHandLabFusion(canvasRef, snapshotRef, perfTier) {
  const particlesRef = useRef([]);
  const nodeAnglesRef = useRef([]);
  const lastTsRef = useRef(0);
  const orbitPhaseRef = useRef(0);
  const focusAtomIdRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;

    let raf = 0;
    const nodeCount = 52;
    if (nodeAnglesRef.current.length !== nodeCount) {
      nodeAnglesRef.current = Array.from({ length: nodeCount }, (_, i) => (i / nodeCount) * Math.PI * 2);
    }

    const tick = (ts) => {
      const last = lastTsRef.current || ts;
      const dt = Math.min(32, ts - last);
      lastTsRef.current = ts;

      const snap = snapshotRef.current || {};
      const {
        cameraOn,
        hand,
        trackedHands: handsList,
        gesture,
        atoms,
        thumbFlashUntil = 0,
        focal,
      } = snap;

      const activeHands = handsList?.length ? handsList : (hand ? [hand] : []);

      const w = canvas.clientWidth || 640;
      const h = canvas.clientHeight || 360;
      if (canvas.width !== w) canvas.width = w;
      if (canvas.height !== h) canvas.height = h;

      const ctx = canvas.getContext("2d");
      if (!ctx) {
        raf = requestAnimationFrame(tick);
        return;
      }

      const tierCount = getParticleCount(perfTier);
      particlesRef.current = resizeParticles(particlesRef.current, tierCount);

      ctx.clearRect(0, 0, w, h);

      const pal = gesturePalette(gesture?.name || "unknown");
      const fieldLabel = fieldStateLabel(gesture?.name || "unknown");

      let ax = focal?.x ?? 0.5;
      let ay = focal?.y ?? 0.52;
      if (!focal && hand?.length) {
        ax = 1 - hand[0].x;
        ay = hand[0].y;
      } else if (!focal && !cameraOn) {
        orbitPhaseRef.current += dt * 0.0009;
        ax = 0.5 + Math.sin(orbitPhaseRef.current) * 0.08;
        ay = 0.52 + Math.cos(orbitPhaseRef.current * 0.8) * 0.06;
      }

      const centerX = ax * w;
      const centerY = ay * h;

      const pinchPoint =
        pinchFromHand(hand) || (activeHands[1] ? pinchFromHand(activeHands[1]) : null);

      let spread = 0.16;
      if (gesture?.name === "open_palm") spread = 0.28;
      if (gesture?.name === "fist") spread = 0.09;
      if (gesture?.name === "point") spread = 0.19;

      orbitPhaseRef.current += dt * 0.001;

      const nodes = [];
      const angles = nodeAnglesRef.current;
      const focalNorm = focal || { x: ax, y: ay };
      focusAtomIdRef.current = pickFocus(atoms, focalNorm);

      for (let i = 0; i < nodeCount; i += 1) {
        const omega = 0.00028 + (i % 7) * 0.000018;
        angles[i] += omega * dt;
        const layer = (i % 5) / 5;
        const ra = spread * (0.55 + layer * 0.45 + (i % 9) * 0.018);
        let nx = ax + Math.cos(angles[i] + orbitPhaseRef.current * 0.35) * ra;
        let ny = ay + Math.sin(angles[i] * 1.09 + orbitPhaseRef.current * 0.3) * ra * 0.88;
        const nz = 0.25 + layer * 0.55 + Math.sin(angles[i] * 2 + ts * 0.001) * 0.08;

        if (pinchPoint?.active) {
          const pull = 0.12;
          nx = nx * (1 - pull) + pinchPoint.x * pull;
          ny = ny * (1 - pull) + pinchPoint.y * pull;
        }

        const hot = gesture?.name === "point" && hand?.[8]
          ? Math.hypot(nx - (1 - hand[8].x), ny - hand[8].y) < 0.08
          : i % 11 === 0;

        nodes.push({ x: nx, y: ny, z: nz, i, hot });
      }

      drawNeuralMesh(ctx, w, h, nodes, centerX, centerY);

      const parts = particlesRef.current;
      const gx = gesture?.name === "point" && hand?.[8] ? 1 - hand[8].x : ax;
      const gy = gesture?.name === "point" && hand?.[8] ? hand[8].y : ay;

      for (const p of parts) {
        let fx = 0;
        let fy = 0;
        const dx = p.x - gx;
        const dy = p.y - gy;
        const dist = Math.hypot(dx, dy) + 1e-4;

        if (gesture?.name === "open_palm") {
          fx += (dx / dist) * 0.0001;
          fy += (dy / dist) * 0.0001;
        } else if (gesture?.name === "fist") {
          fx -= (dx / dist) * 0.00008;
          fy -= (dy / dist) * 0.00008;
        } else if (pinchPoint?.active) {
          const pdx = p.x - pinchPoint.x;
          const pdy = p.y - pinchPoint.y;
          const pd = Math.hypot(pdx, pdy) + 1e-4;
          fx -= (pdx / pd) * 0.00012;
          fy -= (pdy / pd) * 0.00012;
        } else {
          fx -= (dx / dist) * 0.000028;
          fy -= (dy / dist) * 0.000028;
        }

        p.vx += fx * dt;
        p.vy += fy * dt;
        p.vx += Math.sin(ts * 0.001 + p.phase) * 0.000016;
        p.vy += Math.cos(ts * 0.0009 + p.phase) * 0.000016;
        p.vx *= 0.984;
        p.vy *= 0.984;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        if (p.x < 0 || p.x > 1) p.vx *= -0.62;
        if (p.y < 0 || p.y > 1) p.vy *= -0.62;
        p.x = Math.min(1, Math.max(0, p.x));
        p.y = Math.min(1, Math.max(0, p.y));
      }

      drawAmbientParticles(ctx, w, h, parts, ts, gesture?.name);

      for (const activeHand of activeHands) {
        drawHandTethers(ctx, w, h, activeHand, nodes);
      }

      drawMeshNodes(ctx, w, h, nodes, pal);
      drawAtomGraph(ctx, w, h, atoms, nodes, focusAtomIdRef.current, ts);

      if (gesture?.name === "point" && hand?.[8]) {
        const ix = (1 - hand[8].x) * w;
        const iy = hand[8].y * h;
        ctx.save();
        ctx.strokeStyle = "rgba(180, 130, 255, 0.92)";
        ctx.lineWidth = 2;
        ctx.shadowBlur = 12;
        ctx.shadowColor = "rgba(180, 130, 255, 0.8)";
        ctx.setLineDash([5, 8]);
        const far = nodes.reduce((best, n) => {
          const d = Math.hypot(n.x * w - ix, n.y * h - iy);
          return d > (best.d ?? -1) ? { n, d } : best;
        }, { n: nodes[0], d: -1 });
        ctx.beginPath();
        ctx.moveTo(ix, iy);
        ctx.lineTo(far.n.x * w, far.n.y * h);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.restore();
      }

      const pinchPoints = activeHands.map((h) => pinchFromHand(h)).filter(Boolean);
      for (const pp of pinchPoints) {
        const pcx = pp.x * w;
        const pcy = pp.y * h;
        const rad = pp.active ? 26 + Math.sin(ts * 0.012) * 5 : 16;
        ctx.save();
        ctx.strokeStyle = pp.active ? "rgba(69,255,177,0.9)" : "rgba(200,220,255,0.4)";
        ctx.lineWidth = 2;
        ctx.shadowBlur = 14;
        ctx.shadowColor = "rgba(69,255,177,0.6)";
        ctx.beginPath();
        ctx.arc(pcx, pcy, rad, 0, Math.PI * 2);
        ctx.stroke();
        if (pp.active) {
          ctx.strokeStyle = "rgba(69,255,177,0.28)";
          ctx.beginPath();
          ctx.arc(pcx, pcy, rad + 18, 0, Math.PI * 2);
          ctx.stroke();
        }
        ctx.restore();
      }

      if (ts < thumbFlashUntil) {
        ctx.fillStyle = `rgba(69, 255, 177, ${0.08 + 0.06 * Math.sin(ts * 0.02)})`;
        ctx.fillRect(0, 0, w, h);
      }

      if (focusAtomIdRef.current && atoms?.length) {
        const focusAtom = atoms.find((a) => a.id === focusAtomIdRef.current);
        const fi = atoms.indexOf(focusAtom);
        if (focusAtom) {
          const lx = (1 - focusAtom.x) * w;
          const ly = focusAtom.y * h;
          ctx.save();
          ctx.font = '700 15px "Segoe UI", system-ui, sans-serif';
          ctx.fillStyle = "rgba(220, 252, 255, 0.92)";
          ctx.shadowBlur = 16;
          ctx.shadowColor = "rgba(0, 220, 255, 0.55)";
          const title = atomDisplayLabel(focusAtom, fi);
          const tw = ctx.measureText(title).width;
          ctx.fillText(title, lx - tw * 0.5, ly - 28);
          ctx.restore();
        }
      }

      ctx.save();
      ctx.font = '600 10px "Share Tech Mono", ui-monospace, monospace';
      ctx.fillStyle = "rgba(190, 235, 255, 0.65)";
      ctx.fillText(fieldLabel, 14, h - 12);
      ctx.restore();

      raf = requestAnimationFrame(tick);
    };

    particlesRef.current = initParticles(getParticleCount(perfTier));
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      lastTsRef.current = 0;
    };
  }, [canvasRef, perfTier, snapshotRef]);
}
