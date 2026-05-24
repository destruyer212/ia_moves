import { useEffect, useRef } from "react";
import { getFluidDisplayHands } from "./handMotion.js";
import {
  atomDisplayLabel,
  fieldStateLabel,
  pinchFromHand,
} from "./handLabUtils";
import {
  getDprCap,
  getMeshNodeCount,
  getParticleCount,
  getTargetFps,
} from "./handLabPerf.js";
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

function setupCanvasSize(canvas, dprCap) {
  const cssW = canvas.clientWidth || 640;
  const cssH = canvas.clientHeight || 360;
  const dpr = Math.min(window.devicePixelRatio || 1, dprCap);
  const w = Math.round(cssW * dpr);
  const h = Math.round(cssH * dpr);
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
  }
  return { w, h, dpr };
}

/**
 * @param {React.RefObject<HTMLCanvasElement>} canvasRef
 * @param {React.MutableRefObject<object>} snapshotRef
 * @param {string} perfTier
 * @param {boolean} renderActive — pausar si no visible
 */
export function useHandLabFusion(canvasRef, snapshotRef, perfTier, renderActive = true, trackingRef = null) {
  const particlesRef = useRef([]);
  const nodeAnglesRef = useRef([]);
  const lastTsRef = useRef(0);
  const accumRef = useRef(0);
  const orbitPhaseRef = useRef(0);
  const focusAtomIdRef = useRef(null);
  const sizeKeyRef = useRef("");

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;

    let raf = 0;
    const nodeCount = getMeshNodeCount(perfTier);
    const targetFps = getTargetFps(perfTier);
    const frameBudget = 1000 / targetFps;
    const dprCap = getDprCap(perfTier);
    const drawAllLabels = perfTier === "cinematic";

    if (nodeAnglesRef.current.length !== nodeCount) {
      nodeAnglesRef.current = Array.from({ length: nodeCount }, (_, i) => (i / nodeCount) * Math.PI * 2);
    }

    const tick = (ts) => {
      raf = requestAnimationFrame(tick);

      if (!renderActive) return;

      const last = lastTsRef.current || ts;
      const dt = Math.min(32, ts - last);
      lastTsRef.current = ts;
      accumRef.current += dt;
      if (accumRef.current < frameBudget) return;
      accumRef.current = 0;

      const snap = snapshotRef.current || {};
      const live = trackingRef?.current;
      const {
        cameraOn,
        hand: snapHand,
        trackedHands: snapHands,
        gesture: snapGesture,
        atoms: snapAtoms,
        thumbFlashUntil = 0,
        focal: snapFocal,
      } = snap;
      const fluidHands = live ? getFluidDisplayHands(live) : [];
      const handsList = fluidHands.length ? fluidHands : (live?.trackedHands ?? snapHands);
      const hand = handsList[0] ?? live?.hand ?? snapHand;
      const gesture = live?.gesture ?? snapGesture;
      const atoms = live?.atoms ?? snapAtoms;
      const focal = live?.focal ?? snapFocal;

      const activeHands = handsList?.length ? handsList : (hand ? [hand] : []);
      const { w, h, dpr } = setupCanvasSize(canvas, dprCap);
      const sizeKey = `${w}x${h}`;
      if (sizeKey !== sizeKeyRef.current) sizeKeyRef.current = sizeKey;

      const ctx = canvas.getContext("2d", { alpha: true, desynchronized: true });
      if (!ctx) return;

      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.scale(dpr, dpr);
      const cssW = w / dpr;
      const cssH = h / dpr;

      const tierCount = getParticleCount(perfTier);
      particlesRef.current = resizeParticles(particlesRef.current, tierCount);

      ctx.clearRect(0, 0, cssW, cssH);

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

      const centerX = ax * cssW;
      const centerY = ay * cssH;
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
        const nz = 0.25 + layer * 0.55;

        if (pinchPoint?.active) {
          const pull = cameraOn ? 0.2 : 0.12;
          nx = nx * (1 - pull) + pinchPoint.x * pull;
          ny = ny * (1 - pull) + pinchPoint.y * pull;
        }

        const hot = gesture?.name === "point" && hand?.[8]
          ? Math.hypot(nx - (1 - hand[8].x), ny - hand[8].y) < 0.08
          : i % 11 === 0;

        nodes.push({ x: nx, y: ny, z: nz, i, hot });
      }

      drawNeuralMesh(ctx, cssW, cssH, nodes, centerX, centerY);

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
        p.vx *= 0.984;
        p.vy *= 0.984;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        if (p.x < 0 || p.x > 1) p.vx *= -0.62;
        if (p.y < 0 || p.y > 1) p.vy *= -0.62;
        p.x = Math.min(1, Math.max(0, p.x));
        p.y = Math.min(1, Math.max(0, p.y));
      }

      drawAmbientParticles(ctx, cssW, cssH, parts, ts);

      for (const activeHand of activeHands) {
        drawHandTethers(ctx, cssW, cssH, activeHand, nodes);
      }

      drawMeshNodes(ctx, cssW, cssH, nodes);
      drawAtomGraph(ctx, cssW, cssH, atoms, nodes, focusAtomIdRef.current, ts, drawAllLabels);

      if (gesture?.name === "point" && hand?.[8]) {
        const ix = (1 - hand[8].x) * cssW;
        const iy = hand[8].y * cssH;
        let far = nodes[0];
        let md = -1;
        for (const n of nodes) {
          const d = Math.hypot(n.x * cssW - ix, n.y * cssH - iy);
          if (d > md) {
            md = d;
            far = n;
          }
        }
        ctx.strokeStyle = "rgba(180, 130, 255, 0.85)";
        ctx.lineWidth = 1.5;
        ctx.setLineDash([4, 6]);
        ctx.beginPath();
        ctx.moveTo(ix, iy);
        ctx.lineTo(far.x * cssW, far.y * cssH);
        ctx.stroke();
        ctx.setLineDash([]);
      }

      const pinchPoints = activeHands.map((h) => pinchFromHand(h)).filter(Boolean);
      for (const pp of pinchPoints) {
        const pcx = pp.x * cssW;
        const pcy = pp.y * cssH;
        const rad = pp.active ? 24 + Math.sin(ts * 0.012) * 4 : 14;
        ctx.strokeStyle = pp.active ? "rgba(69,255,177,0.85)" : "rgba(200,220,255,0.35)";
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(pcx, pcy, rad, 0, Math.PI * 2);
        ctx.stroke();
      }

      if (ts < thumbFlashUntil) {
        ctx.fillStyle = `rgba(69, 255, 177, ${0.06 + 0.04 * Math.sin(ts * 0.02)})`;
        ctx.fillRect(0, 0, cssW, cssH);
      }

      if (focusAtomIdRef.current && atoms?.length) {
        const focusAtom = atoms.find((a) => a.id === focusAtomIdRef.current);
        const fi = atoms.indexOf(focusAtom);
        if (focusAtom) {
          const lx = (1 - focusAtom.x) * cssW;
          const ly = focusAtom.y * cssH;
          ctx.font = '700 14px "Segoe UI", system-ui, sans-serif';
          ctx.fillStyle = "rgba(220, 252, 255, 0.92)";
          const title = atomDisplayLabel(focusAtom, fi);
          const tw = ctx.measureText(title).width;
          ctx.fillText(title, lx - tw * 0.5, ly - 22);
        }
      }

      ctx.font = '600 10px "Share Tech Mono", ui-monospace, monospace';
      ctx.fillStyle = "rgba(190, 235, 255, 0.6)";
      ctx.fillText(fieldLabel, 12, cssH - 10);
    };

    particlesRef.current = initParticles(getParticleCount(perfTier));
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      lastTsRef.current = 0;
      accumRef.current = 0;
    };
  }, [canvasRef, perfTier, snapshotRef, renderActive, trackingRef]);
}
