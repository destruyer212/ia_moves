import { FilesetResolver, HandLandmarker } from "@mediapipe/tasks-vision";
import { Suspense, lazy, useEffect, useMemo, useRef, useState } from "react";

const API_URL = "http://127.0.0.1:8766";
const MOUSE_SETTINGS_STORAGE_KEY = "ia_moves_mouse_settings_v2";
const HAND_MODEL_URL = "/models/hand_landmarker.task";

const gestureActions = {
  open_palm: "open_start",
  fist: "show_desktop",
  point: "click",
  thumb_up: "confirm",
  victory: "toggle_mouse_mode",
};

const pcActions = [
  { label: "Inicio", action: "open_start" },
  { label: "VS Code", action: "open_vscode" },
  { label: "Terminal", action: "open_terminal" },
  { label: "Ventana +", action: "next_window" },
  { label: "Ventana -", action: "previous_window" },
  { label: "Escritorio", action: "show_desktop" },
  { label: "Click", action: "click" },
  { label: "Escape", action: "escape" },
];

const mousePresets = {
  precision: { sensitivity: 1700, smoothing: 0.34, deadzone: 0.0085, invert_x: true, invert_y: false },
  normal: { sensitivity: 2200, smoothing: 0.42, deadzone: 0.0065, invert_x: true, invert_y: false },
  gaming: { sensitivity: 2800, smoothing: 0.5, deadzone: 0.0045, invert_x: true, invert_y: false },
  pro: { sensitivity: 2500, smoothing: 0.46, deadzone: 0.005, invert_x: true, invert_y: false },
};

const handConnections = [
  [0, 1], [1, 2], [2, 3], [3, 4],
  [0, 5], [5, 6], [6, 7], [7, 8],
  [5, 9], [9, 10], [10, 11], [11, 12],
  [9, 13], [13, 14], [14, 15], [15, 16],
  [13, 17], [17, 18], [18, 19], [19, 20],
  [0, 17],
];

const POINTER_REACQUIRE_RADIUS = 0.12;
const POINTER_REACQUIRE_FRAMES = 5;
const HAND_STALE_HOLD_MS = 650;
const AUTO_ACTION_COOLDOWN_MS = 900;
const CONFIG_SYNC_DEBOUNCE_MS = 140;
const WORKER_INIT_TIMEOUT_MS = 16000;
const HudScene3D = lazy(() => import("./HudScene3D").then((module) => ({ default: module.HudScene3D })));
const HologramRadar3D = lazy(() => import("./HologramRadar3D"));
const BabylonNeuralCore = lazy(() => import("./BabylonNeuralCore"));

const neuralStackCatalog = [
  { id: "mediapipe", label: "MediaPipe", sub: "Tasks Vision · Hands" },
  { id: "worker", label: "Web Worker", sub: "GPU/CPU delegate pool" },
  { id: "onnx", label: "ONNX Runtime", sub: "Edge models 2026-ready" },
  { id: "gpt", label: "GPT-5 class", sub: "Orchestración / tools" },
  { id: "claude", label: "Claude Opus", sub: "Razonamiento + código" },
  { id: "gemini", label: "Gemini Pro", sub: "Multimodal stack" },
];

const ATOM_LAB_COUNT = 18;
const ATOM_MIN_RADIUS = 12;
const ATOM_MAX_RADIUS = 54;

function createAtomField(count = ATOM_LAB_COUNT) {
  return Array.from({ length: count }, (_, index) => ({
    id: `atom-${index + 1}`,
    x: 0.15 + ((index % 6) * 0.14),
    y: 0.2 + (Math.floor(index / 6) * 0.2),
    radius: 18 + ((index % 4) * 5),
    hue: 180 + ((index * 19) % 160),
  }));
}

function normalizeMouseConfig(config) {
  return {
    sensitivity: Math.min(Math.max(config?.sensitivity ?? 2200, 800), 7000),
    smoothing: Math.min(Math.max(config?.smoothing ?? 0.42, 0.08), 0.9),
    deadzone: Math.min(Math.max(config?.deadzone ?? 0.0065, 0), 0.03),
    invert_x: config?.invert_x ?? true,
    invert_y: config?.invert_y ?? false,
    pointer_mode: config?.pointer_mode === "absolute" ? "absolute" : "relative",
  };
}

function getStablePointerPoint(hand) {
  if (!hand || hand.length < 18) return null;
  const wrist = hand[0];
  const indexBase = hand[5];
  const middleBase = hand[9];
  const ringBase = hand[13];
  const pinkyBase = hand[17];
  return {
    x: (wrist.x * 0.12) + (indexBase.x * 0.18) + (middleBase.x * 0.28) + (ringBase.x * 0.24) + (pinkyBase.x * 0.18),
    y: (wrist.y * 0.14) + (indexBase.y * 0.16) + (middleBase.y * 0.3) + (ringBase.y * 0.22) + (pinkyBase.y * 0.18),
  };
}

export function App() {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const visionRunningRef = useRef(false);
  const workerRef = useRef(null);
  const workerReadyRef = useRef(false);
  const workerBootTimerRef = useRef(null);
  const frameBusyRef = useRef(false);
  const rafRef = useRef(null);
  const wsRef = useRef(null);
  const pointerSendRef = useRef({ lastAt: 0, x: 0, y: 0 });
  const fallbackVisionRef = useRef({
    ready: false,
    loading: false,
    handLandmarker: null,
    previousHand: null,
    previousGesture: { name: "unknown", confidence: 0.1, active: false, stale: false },
    lastSeenAt: 0,
  });
  const pointFramesRef = useRef(0);
  const pinchRef = useRef({ active: false, dragging: false, startAt: 0 });
  const reacquireRef = useRef({ armed: false, centerFrames: 0, lastGoodAt: 0, notice: "Mano al centro para enganchar mouse" });
  const bootTimerRef = useRef(null);
  const controlRef = useRef({ mode: "commands", mouse_enabled: false });
  const mouseConfigRef = useRef(normalizeMouseConfig());
  const gestureRef = useRef({ name: "unknown", confidence: 0.1, active: false });
  const antiJitterRef = useRef(true);
  const autoActionRef = useRef({ lastAction: "", lastAt: 0 });
  const configSyncTimerRef = useRef(null);
  const mouseGestureTimerRef = useRef(null);
  const workerRecoveryRef = useRef({ attempts: 0, forcingCpu: false });
  const atomCanvasRef = useRef(null);
  const atomInteractionRef = useRef({
    left: { atomId: null, startDistance: 0, startRadius: 0 },
    right: { atomId: null, startDistance: 0, startRadius: 0 },
  });

  const [health, setHealth] = useState("desconectado");
  const [gesture, setGesture] = useState({ name: "unknown", confidence: 0.1, active: false, stale: false });
  const [vision, setVision] = useState({ running: false, error: null, source: "worker-gpu" });
  const [control, setControl] = useState({ mode: "commands", mouse_enabled: false, dragging: false });
  const [mouseConfig, setMouseConfig] = useState(normalizeMouseConfig());
  const [mouseGesture, setMouseGesture] = useState("READY");
  const [mouseAssist, setMouseAssist] = useState({ armed: false, centerFrames: 0, notice: "Mano al centro para enganchar mouse" });
  const [events, setEvents] = useState([]);
  const [message, setMessage] = useState("");
  const [answer, setAnswer] = useState("Sistema listo. Activa camara y comenzamos.");
  const [bootVisible, setBootVisible] = useState(true);
  const [cameras, setCameras] = useState([]);
  const [cameraIndex, setCameraIndex] = useState(0);
  const [autoMode, setAutoMode] = useState(false);
  const [antiJitter, setAntiJitter] = useState(true);
  const [perf, setPerf] = useState({ fps: 0, inferMs: 0, pointerHz: 0, staleFrames: 0 });
  const [neuralFocus, setNeuralFocus] = useState("mediapipe");
  const [trackedHands, setTrackedHands] = useState([]);
  const [atoms, setAtoms] = useState(() => createAtomField());

  const currentAction = useMemo(() => gestureActions[gesture.name] ?? "sin accion", [gesture.name]);

  useEffect(() => {
    controlRef.current = control;
  }, [control]);

  useEffect(() => {
    mouseConfigRef.current = mouseConfig;
  }, [mouseConfig]);

  useEffect(() => {
    gestureRef.current = gesture;
  }, [gesture]);

  useEffect(() => {
    antiJitterRef.current = antiJitter;
  }, [antiJitter]);

  useEffect(() => {
    visionRunningRef.current = vision.running;
  }, [vision.running]);

  useEffect(() => {
    drawAtomLab();
  }, [atoms]);

  useEffect(() => {
    checkHealth();
    checkControl();
    loadStoredMouseSettings();
    loadCameras();
    bootTimerRef.current = window.setTimeout(() => setBootVisible(false), 4200);

    return () => {
      if (bootTimerRef.current) window.clearTimeout(bootTimerRef.current);
      if (workerBootTimerRef.current) window.clearTimeout(workerBootTimerRef.current);
      if (configSyncTimerRef.current) window.clearTimeout(configSyncTimerRef.current);
      if (mouseGestureTimerRef.current) window.clearTimeout(mouseGestureTimerRef.current);
      stopVision();
      closeControlSocket();
      resetVisionWorker();
    };
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => {
      checkControl();
    }, 800);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (control.mouse_enabled || !autoMode || !gesture.active || gesture.stale || gesture.confidence < 0.82) return;
    const action = gestureActions[gesture.name];
    if (!action) return;
    const now = performance.now();
    if (action === autoActionRef.current.lastAction && now - autoActionRef.current.lastAt < AUTO_ACTION_COOLDOWN_MS) {
      return;
    }
    autoActionRef.current = { lastAction: action, lastAt: now };
    executeAction(action, `auto:${gesture.name}`);
  }, [autoMode, control.mouse_enabled, gesture.active, gesture.confidence, gesture.name, gesture.stale]);

  async function checkHealth() {
    try {
      const response = await fetch(`${API_URL}/health`);
      const data = await response.json();
      setHealth(data.status);
    } catch {
      setHealth("desconectado");
    }
  }

  async function checkControl() {
    try {
      const response = await fetch(`${API_URL}/control/status`);
      const data = await response.json();
      setControl(data);
      setMouseConfig((current) => ({
        ...current,
        sensitivity: data.sensitivity ?? current.sensitivity,
        smoothing: data.smoothing ?? current.smoothing,
        deadzone: data.deadzone ?? current.deadzone,
        invert_x: data.invert_x ?? current.invert_x,
        invert_y: data.invert_y ?? current.invert_y,
        pointer_mode: data.pointer_mode ?? current.pointer_mode,
      }));
    } catch {
      setControl({ mode: "desconectado", mouse_enabled: false, dragging: false });
    }
  }

  async function loadCameras() {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const videoInputs = devices.filter((device) => device.kind === "videoinput");
      setCameras(videoInputs);
      pushEvent("Camaras revisadas.");
    } catch {
      setCameras([]);
      pushEvent("No pude revisar camaras.");
    }
  }

  async function simulateGesture() {
    try {
      const response = await fetch(`${API_URL}/gestures/simulate`, { method: "POST" });
      const nextGesture = await response.json();
      setGesture(nextGesture);
      pushEvent(`Gesto detectado: ${nextGesture.name}`);
    } catch {
      pushEvent("No pude simular gesto.");
    }
  }

  function loadStoredMouseSettings() {
    try {
      const raw = window.localStorage.getItem(MOUSE_SETTINGS_STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      const normalized = normalizeMouseConfig(parsed);
      setMouseConfig(normalized);
      mouseConfigRef.current = normalized;
      setAntiJitter(parsed.anti_jitter !== false);
      updateMouseConfig(normalized, false, false);
    } catch {
      // ignore corrupt settings
    }
  }

  function persistMouseSettings(config, jitter = antiJitter) {
    try {
      window.localStorage.setItem(
        MOUSE_SETTINGS_STORAGE_KEY,
        JSON.stringify({ ...normalizeMouseConfig(config), anti_jitter: !!jitter }),
      );
    } catch {
      // ignore storage failures
    }
  }

  async function updateMouseConfig(nextConfig, announce = false, persist = true) {
    const merged = normalizeMouseConfig({ ...mouseConfigRef.current, ...nextConfig });
    setMouseConfig(merged);
    mouseConfigRef.current = merged;
    if (persist) persistMouseSettings(merged);
    if (configSyncTimerRef.current) window.clearTimeout(configSyncTimerRef.current);
    configSyncTimerRef.current = window.setTimeout(async () => {
      try {
        await fetch(`${API_URL}/control/config`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(mouseConfigRef.current),
        });
        if (announce) pushEvent("Calibracion mouse actualizada.");
      } catch {
        pushEvent("No pude sincronizar config con backend.");
      }
    }, CONFIG_SYNC_DEBOUNCE_MS);
  }

  function applyMousePreset(name) {
    const preset = mousePresets[name];
    if (!preset) return;
    updateMouseConfig(preset, true, true);
    pushEvent(`Preset ${name.toUpperCase()} aplicado.`);
  }

  function toggleAntiJitter() {
    const next = !antiJitter;
    setAntiJitter(next);
    persistMouseSettings(mouseConfigRef.current, next);
    pushEvent(`Anti-jitter ${next ? "ON" : "OFF"}.`);
  }

  function controlWsUrl() {
    return API_URL.replace("http://", "ws://").replace("https://", "wss://") + "/control/ws";
  }

  function ensureControlSocket() {
    if (wsRef.current && (wsRef.current.readyState === WebSocket.OPEN || wsRef.current.readyState === WebSocket.CONNECTING)) {
      return;
    }

    const socket = new WebSocket(controlWsUrl());
    socket.onopen = () => pushEvent("Canal control WS activo.");
    socket.onclose = () => {
      if (wsRef.current === socket) wsRef.current = null;
    };
    socket.onerror = () => {
      if (wsRef.current === socket) wsRef.current = null;
    };
    wsRef.current = socket;
  }

  function closeControlSocket() {
    if (!wsRef.current) return;
    try {
      wsRef.current.close();
    } catch {
      // no-op
    }
    wsRef.current = null;
  }

  function resetPointerAnchorBackend(cooldownMs = 220) {
    const payload = JSON.stringify({ type: "reset_pointer", cooldown_ms: Math.max(0, Math.round(cooldownMs)) });
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(payload);
      return;
    }
    fetch(`${API_URL}/control/reset-pointer?cooldown_ms=${Math.max(0, Math.round(cooldownMs))}`, { method: "POST" }).catch(
      () => {},
    );
  }

  function setMouseAssistState(next) {
    setMouseAssist((current) => {
      if (
        current.armed === next.armed
        && current.centerFrames === next.centerFrames
        && current.notice === next.notice
      ) {
        return current;
      }
      return next;
    });
  }

  function disarmPointerTracking(notice = "Mano al centro para enganchar mouse", cooldownMs = 260) {
    reacquireRef.current = {
      armed: false,
      centerFrames: 0,
      lastGoodAt: 0,
      notice,
    };
    setMouseAssistState({ armed: false, centerFrames: 0, notice });
    pointFramesRef.current = 0;
    pointerSendRef.current = { lastAt: 0, x: 0, y: 0 };
    resetPointerAnchorBackend(cooldownMs);
  }

  function armPointerTracking(notice = "Mouse enganchado") {
    reacquireRef.current = {
      armed: true,
      centerFrames: POINTER_REACQUIRE_FRAMES,
      lastGoodAt: performance.now(),
      notice,
    };
    setMouseAssistState({ armed: true, centerFrames: POINTER_REACQUIRE_FRAMES, notice });
    resetPointerAnchorBackend(140);
  }

  function updatePointerReacquire(hand, nextGesture) {
    if (!controlRef.current.mouse_enabled) {
      return false;
    }

    const now = performance.now();
    const pointerPoint = hand ? getStablePointerPoint(hand) : null;
    const hasValidPoint = Boolean(pointerPoint && (nextGesture.active || nextGesture.stale || nextGesture.confidence > 0.45));
    const trackingLost = !hand || (!hasValidPoint && !nextGesture.stale);

    if (trackingLost) {
      const elapsed = now - reacquireRef.current.lastGoodAt;
      if (reacquireRef.current.armed && elapsed > HAND_STALE_HOLD_MS) {
        disarmPointerTracking("Se perdio la mano. Vuelve al centro.", 320);
      } else if (!reacquireRef.current.armed) {
        setMouseAssistState({
          armed: false,
          centerFrames: reacquireRef.current.centerFrames,
          notice: "Mano al centro para enganchar mouse",
        });
      }
      return false;
    }

    reacquireRef.current.lastGoodAt = now;

    if (reacquireRef.current.armed) {
      setMouseAssistState({
        armed: true,
        centerFrames: POINTER_REACQUIRE_FRAMES,
        notice: controlRef.current.dragging ? "Arrastrando" : "Mouse enganchado",
      });
      return true;
    }

    const distanceToCenter = Math.hypot(pointerPoint.x - 0.5, pointerPoint.y - 0.5);
    if (distanceToCenter <= POINTER_REACQUIRE_RADIUS) {
      reacquireRef.current.centerFrames += 1;
      setMouseAssistState({
        armed: false,
        centerFrames: reacquireRef.current.centerFrames,
        notice: "Manten la mano al centro",
      });
      if (reacquireRef.current.centerFrames >= POINTER_REACQUIRE_FRAMES) {
        armPointerTracking("Mouse enganchado");
        pushEvent("Mouse reenganchado desde el centro.");
        return true;
      }
    } else {
      reacquireRef.current.centerFrames = 0;
      setMouseAssistState({
        armed: false,
        centerFrames: 0,
        notice: "Lleva la mano al centro",
      });
    }

    return false;
  }

  function ensureVisionWorker() {
    if (workerRef.current) return;
    const worker = new Worker(new URL("./visionWorker.js", import.meta.url), { type: "module" });
    worker.onmessage = onWorkerMessage;
    workerRef.current = worker;
  }

  function smoothLandmarks(prev, next, alpha = 0.34) {
    if (!next) return prev;
    if (!prev || prev.length !== next.length) {
      return next.map((point) => ({ ...point }));
    }

    return next.map((point, index) => ({
      x: prev[index].x + ((point.x - prev[index].x) * alpha),
      y: prev[index].y + ((point.y - prev[index].y) * alpha),
      z: (prev[index].z ?? 0) + (((point.z ?? 0) - (prev[index].z ?? 0)) * alpha),
    }));
  }

  function classifyHand(points) {
    if (!points || points.length < 21) return { name: "unknown", confidence: 0.1, active: false, stale: false };

    const extended = {
      index: points[8].y < points[6].y,
      middle: points[12].y < points[10].y,
      ring: points[16].y < points[14].y,
      pinky: points[20].y < points[18].y,
    };
    extended.thumb = Math.abs(points[4].x - points[0].x) > Math.abs(points[3].x - points[0].x);

    const count = Object.values(extended).filter(Boolean).length;
    if (count >= 4) return { name: "open_palm", confidence: 0.9, active: true, stale: false };
    if (count === 0) return { name: "fist", confidence: 0.88, active: true, stale: false };
    if (extended.thumb && !extended.index && !extended.middle && !extended.ring && !extended.pinky) {
      return { name: "thumb_up", confidence: 0.84, active: true, stale: false };
    }
    if (extended.index && !extended.middle && !extended.ring && !extended.pinky) {
      return { name: "point", confidence: 0.9, active: true, stale: false };
    }
    if (extended.index && extended.middle && !extended.ring && !extended.pinky) {
      return { name: "victory", confidence: 0.87, active: true, stale: false };
    }
    return { name: "unknown", confidence: 0.35, active: false, stale: false };
  }

  function pinchCenter(hand) {
    if (!hand || hand.length < 9) return null;
    const thumb = hand[4];
    const index = hand[8];
    const distance = Math.hypot(thumb.x - index.x, thumb.y - index.y);
    // La vista de camara se muestra espejada (scaleX(-1)), asi que espejamos X
    // para que el agarre de particulas siga la misma direccion visual.
    const x = 1 - ((thumb.x + index.x) * 0.5);
    const y = (thumb.y + index.y) * 0.5;
    return {
      x,
      y,
      distance,
      active: distance < 0.055,
    };
  }

  function nearestAtom(atomsState, center, maxDistance = 0.12) {
    let winner = null;
    let winnerDistance = maxDistance;
    for (const atom of atomsState) {
      const distance = Math.hypot(atom.x - center.x, atom.y - center.y);
      if (distance <= winnerDistance) {
        winner = atom;
        winnerDistance = distance;
      }
    }
    return winner;
  }

  function updateAtomLab(hands) {
    const leftPinch = pinchCenter(hands?.[0] ?? null);
    const rightPinch = pinchCenter(hands?.[1] ?? null);
    setAtoms((current) => {
      let next = current.map((atom) => ({ ...atom }));
      const interaction = atomInteractionRef.current;

      const attach = (slot, pinch) => {
        if (!pinch?.active) {
          interaction[slot] = { atomId: null, startDistance: 0, startRadius: 0 };
          return;
        }
        if (!interaction[slot].atomId) {
          const hit = nearestAtom(next, pinch);
          if (hit) {
            interaction[slot].atomId = hit.id;
            interaction[slot].startDistance = pinch.distance;
            interaction[slot].startRadius = hit.radius;
          }
        }
      };

      attach("left", leftPinch);
      attach("right", rightPinch);

      const leftAtomId = interaction.left.atomId;
      const rightAtomId = interaction.right.atomId;
      const sameAtom = leftAtomId && rightAtomId && leftAtomId === rightAtomId;

      if (sameAtom && leftPinch?.active && rightPinch?.active) {
        next = next.map((atom) => {
          if (atom.id !== leftAtomId) return atom;
          const baseDistance = Math.max(0.02, interaction.left.startDistance + interaction.right.startDistance);
          const currentDistance = Math.max(0.02, leftPinch.distance + rightPinch.distance);
          const scale = Math.min(2.4, Math.max(0.45, currentDistance / baseDistance));
          return {
            ...atom,
            x: (leftPinch.x + rightPinch.x) * 0.5,
            y: (leftPinch.y + rightPinch.y) * 0.5,
            radius: Math.min(ATOM_MAX_RADIUS, Math.max(ATOM_MIN_RADIUS, interaction.left.startRadius * scale)),
          };
        });
      } else {
        const drag = (slot, pinch) => {
          if (!pinch?.active || !interaction[slot].atomId) return;
          next = next.map((atom) => {
            if (atom.id !== interaction[slot].atomId) return atom;
            return {
              ...atom,
              x: (atom.x * 0.35) + (pinch.x * 0.65),
              y: (atom.y * 0.35) + (pinch.y * 0.65),
            };
          });
        };
        drag("left", leftPinch);
        drag("right", rightPinch);
      }

      return next.map((atom) => ({
        ...atom,
        x: Math.min(0.97, Math.max(0.03, atom.x)),
        y: Math.min(0.97, Math.max(0.03, atom.y)),
      }));
    });
  }

  function drawAtomLab() {
    const canvas = atomCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const width = canvas.clientWidth || 480;
    const height = canvas.clientHeight || 280;
    if (canvas.width !== width) canvas.width = width;
    if (canvas.height !== height) canvas.height = height;

    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = "rgba(5, 14, 24, 0.85)";
    ctx.fillRect(0, 0, width, height);

    for (const atom of atoms) {
      const x = atom.x * width;
      const y = atom.y * height;
      const glow = atom.radius * 1.8;
      const gradient = ctx.createRadialGradient(x, y, atom.radius * 0.15, x, y, glow);
      gradient.addColorStop(0, `hsla(${atom.hue}, 95%, 76%, 0.95)`);
      gradient.addColorStop(1, `hsla(${atom.hue}, 95%, 46%, 0.08)`);
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(x, y, glow, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = `hsla(${atom.hue}, 95%, 72%, 0.9)`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(x, y, atom.radius, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Cursores de pinch (mano izquierda/derecha) para feedback visual directo.
    const drawPinchCursor = (hand, color) => {
      const pinch = pinchCenter(hand);
      if (!pinch) return;
      const x = pinch.x * width;
      const y = pinch.y * height;
      ctx.beginPath();
      ctx.lineWidth = pinch.active ? 3 : 2;
      ctx.strokeStyle = color;
      ctx.arc(x, y, pinch.active ? 16 : 11, 0, Math.PI * 2);
      ctx.stroke();
      if (pinch.active) {
        ctx.fillStyle = color;
        ctx.globalAlpha = 0.22;
        ctx.beginPath();
        ctx.arc(x, y, 12, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
      }
    };

    drawPinchCursor(trackedHands[0], "rgba(98, 233, 255, 0.95)");
    drawPinchCursor(trackedHands[1], "rgba(255, 200, 87, 0.95)");
  }

  async function ensureFallbackVision() {
    const fallback = fallbackVisionRef.current;
    if (fallback.ready || fallback.loading) return;

    fallback.loading = true;
    try {
      const resolver = await FilesetResolver.forVisionTasks("/wasm");
      fallback.handLandmarker = await HandLandmarker.createFromOptions(resolver, {
        baseOptions: {
          modelAssetPath: HAND_MODEL_URL,
          delegate: "CPU",
        },
        runningMode: "VIDEO",
        numHands: 2,
        minHandDetectionConfidence: 0.32,
        minHandPresenceConfidence: 0.3,
        minTrackingConfidence: 0.3,
      });
      fallback.ready = true;
      setVision((current) => ({ ...current, error: null, source: "main-cpu-fallback" }));
      pushEvent("Tracking local de respaldo activo.");
    } catch (error) {
      setVision((current) => ({ ...current, error: error.message, source: "fallback-init" }));
      pushEvent(`Fallback vision fallo: ${error.message}`);
    } finally {
      fallback.loading = false;
    }
  }

  function processFallbackFrame(video, timestamp) {
    const fallback = fallbackVisionRef.current;
    if (!fallback.ready || !fallback.handLandmarker) return;

    const result = fallback.handLandmarker.detectForVideo(video, timestamp);
    const detectedHands = result.landmarks?.slice(0, 2) ?? [];
    const detected = detectedHands[0] ?? null;
    const now = performance.now();
    let hand = null;
    let nextGesture = { name: "unknown", confidence: 0.1, active: false, stale: false };

    if (detected) {
      hand = smoothLandmarks(fallback.previousHand, detected, 0.38);
      fallback.previousHand = hand;
      fallback.lastSeenAt = now;
      nextGesture = classifyHand(hand);
      fallback.previousGesture = nextGesture;
    } else if (fallback.previousHand && now - fallback.lastSeenAt < HAND_STALE_HOLD_MS) {
      hand = fallback.previousHand;
      nextGesture = {
        ...fallback.previousGesture,
        confidence: Math.max(0.36, (fallback.previousGesture.confidence ?? 0.8) - ((now - fallback.lastSeenAt) * 0.0007)),
        active: true,
        stale: true,
      };
    } else {
      fallback.previousHand = null;
      fallback.previousGesture = { name: "unknown", confidence: 0.1, active: false, stale: false };
    }

    setGesture(nextGesture);
    setTrackedHands(detectedHands);
    updateAtomLab(detectedHands);
    setPerf((current) => ({ ...current, inferMs: 0, source: "main-cpu-fallback" }));
    setVision((current) => (current.source === "main-cpu-fallback" ? current : { ...current, source: "main-cpu-fallback" }));
    drawOverlay(hand, nextGesture);

    const pointerArmed = updatePointerReacquire(hand, nextGesture);
    if (hand && controlRef.current.mouse_enabled && pointerArmed) {
      pointFramesRef.current += 1;
      const pointerPoint = getStablePointerPoint(hand);
      if (pointerPoint && pointFramesRef.current >= 2) {
        sendPointer(pointerPoint);
      }
    } else {
      pointFramesRef.current = 0;
    }

    if (hand && controlRef.current.mouse_enabled) {
      handlePinch(hand);
    } else {
      releasePinch();
    }
  }

  function resetVisionWorker() {
    try {
      workerRef.current?.terminate();
    } catch {
      // no-op
    }
    workerRef.current = null;
    workerReadyRef.current = false;
    frameBusyRef.current = false;
  }

  function requestVisionWorkerInit(forceCpu = false) {
    ensureVisionWorker();
    workerRef.current?.postMessage({
      type: "init",
      wasmPath: "/wasm",
      modelPath: HAND_MODEL_URL,
      forceCpu,
    });
  }

  function recoverVisionWorker(reason = "retry") {
    if (!visionRunningRef.current) return;
    if (workerBootTimerRef.current) {
      window.clearTimeout(workerBootTimerRef.current);
      workerBootTimerRef.current = null;
    }
    if (workerRecoveryRef.current.attempts >= 1) {
      setVision((current) => ({
        ...current,
        error: null,
        source: fallbackVisionRef.current.ready ? "main-cpu-fallback" : "fallback-init",
      }));
      ensureFallbackVision();
      pushEvent("Worker no responde. Activando tracking local.");
      return;
    }

    workerRecoveryRef.current = { attempts: workerRecoveryRef.current.attempts + 1, forcingCpu: true };
    resetVisionWorker();
    requestVisionWorkerInit(true);
    pushEvent("Reiniciando worker en modo CPU seguro...");
  }

  async function startVision() {
    try {
      stopVision(false);
      disarmPointerTracking("Mano al centro para enganchar mouse", 320);
      workerRecoveryRef.current = { attempts: 0, forcingCpu: false };
      workerReadyRef.current = false;
      visionRunningRef.current = true;
      setVision({ running: true, error: null, source: "worker-init" });
      requestVisionWorkerInit(false);
      if (workerBootTimerRef.current) window.clearTimeout(workerBootTimerRef.current);
      workerBootTimerRef.current = window.setTimeout(() => {
        if (visionRunningRef.current && !workerReadyRef.current && !fallbackVisionRef.current.ready) {
          setVision((current) => ({
            ...current,
            error: current.source === "main-cpu-fallback" ? null : "Vision worker tardando en inicializar.",
            source: current.source === "main-cpu-fallback" ? current.source : "worker-init",
          }));
          recoverVisionWorker("timeout");
        }
      }, WORKER_INIT_TIMEOUT_MS);
      ensureControlSocket();
      resetPointerAnchorBackend(280);

      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 960 },
          height: { ideal: 540 },
          frameRate: { ideal: 60, max: 60 },
          deviceId: cameras[cameraIndex]?.deviceId ? { exact: cameras[cameraIndex].deviceId } : undefined,
        },
        audio: false,
      });

      streamRef.current = stream;
      videoRef.current.srcObject = stream;
      await new Promise((resolve, reject) => {
        const video = videoRef.current;
        if (!video) {
          reject(new Error("No encontre el elemento de video."));
          return;
        }

        const cleanup = () => {
          video.onloadedmetadata = null;
          video.onerror = null;
        };

        video.onloadedmetadata = async () => {
          try {
            await video.play();
            cleanup();
            resolve();
          } catch (error) {
            cleanup();
            reject(error);
          }
        };

        video.onerror = () => {
          cleanup();
          reject(new Error("La camara no pudo iniciar video."));
        };
      });

      pointFramesRef.current = 0;
      frameBusyRef.current = false;
      rafRef.current = window.requestAnimationFrame(pumpVideoFrame);
      pushEvent("Camara activa. Tracking listo para arrancar.");
    } catch (error) {
      visionRunningRef.current = false;
      setVision({ running: false, error: error.message, source: "worker-init" });
      pushEvent(`No pude iniciar vision: ${error.message}`);
    }
  }

  function stopVision(announce = true) {
    visionRunningRef.current = false;
    if (workerBootTimerRef.current) window.clearTimeout(workerBootTimerRef.current);
    releasePinch();
    if (rafRef.current) window.cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    frameBusyRef.current = false;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    clearCanvas();
    setVision((current) => ({ ...current, running: false }));
    setGesture({ name: "unknown", confidence: 0.1, active: false, stale: false });
    setTrackedHands([]);
    setMouseGesture("READY");
    setMouseAssistState({ armed: false, centerFrames: 0, notice: "Mano al centro para enganchar mouse" });
    pointFramesRef.current = 0;
    pointerSendRef.current = { lastAt: 0, x: 0, y: 0 };
    fallbackVisionRef.current.previousHand = null;
    fallbackVisionRef.current.previousGesture = { name: "unknown", confidence: 0.1, active: false, stale: false };
    resetPointerAnchorBackend(240);
    workerRecoveryRef.current = { attempts: 0, forcingCpu: false };
    if (announce) pushEvent("Vision detenida.");
  }

  function pumpVideoFrame() {
    if (!visionRunningRef.current || !videoRef.current) return;
    if (videoRef.current.readyState < 2) {
      rafRef.current = window.requestAnimationFrame(pumpVideoFrame);
      return;
    }

    if (!workerReadyRef.current && fallbackVisionRef.current.ready) {
      processFallbackFrame(videoRef.current, performance.now());
      rafRef.current = window.requestAnimationFrame(pumpVideoFrame);
      return;
    }

    if (!workerReadyRef.current || frameBusyRef.current) {
      rafRef.current = window.requestAnimationFrame(pumpVideoFrame);
      return;
    }

    frameBusyRef.current = true;
    createImageBitmap(videoRef.current)
      .then((bitmap) => {
        workerRef.current?.postMessage(
          {
            type: "frame",
            bitmap,
            timestamp: performance.now(),
            antiJitter: antiJitterRef.current,
          },
          [bitmap],
        );
      })
      .catch(() => {
        frameBusyRef.current = false;
      })
      .finally(() => {
        rafRef.current = window.requestAnimationFrame(pumpVideoFrame);
      });
  }

  function onWorkerMessage(event) {
    const message = event.data;
    if (message.type === "ready") {
      workerReadyRef.current = true;
      if (workerBootTimerRef.current) window.clearTimeout(workerBootTimerRef.current);
      workerRecoveryRef.current = { attempts: 0, forcingCpu: message.source === "worker-cpu-fallback" };
      setVision((current) => ({
        ...current,
        error: null,
        source: message.source ?? "worker-gpu",
      }));
      pushEvent(`Vision worker listo (${message.source ?? "worker-gpu"}).`);
      return;
    }

    if (message.type === "engine") {
      setVision((current) => ({
        ...current,
        source: message.source ?? current.source,
        error: message.error ?? null,
      }));
      if (message.message) pushEvent(message.message);
      return;
    }

    if (message.type === "error") {
      frameBusyRef.current = false;
      workerReadyRef.current = false;
      setVision((current) => ({
        ...current,
        error: message.error,
        source: message.source ?? current.source,
      }));
      pushEvent(`Vision worker fallo: ${message.error}`);
      recoverVisionWorker("error");
      return;
    }

    if (message.type !== "result") return;

    frameBusyRef.current = false;
    const nextGesture = message.gesture ?? { name: "unknown", confidence: 0.1, active: false, stale: false };
    const hand = message.hand ?? null;
    const hands = message.hands ?? (hand ? [hand] : []);

    setGesture(nextGesture);
    setPerf({
      fps: Math.round(message.fps ?? 0),
      inferMs: Number((message.inferMs ?? 0).toFixed(1)),
      pointerHz: Math.round(message.pointerHz ?? 0),
      staleFrames: message.staleFrames ?? 0,
    });
    setVision((current) => (current.error ? { ...current, error: null } : current));
    if (message.source) {
      setVision((current) => (current.source === message.source ? current : { ...current, source: message.source }));
    }

    setTrackedHands(hands);
    updateAtomLab(hands);
    drawOverlay(hand, nextGesture);

    const pointerArmed = updatePointerReacquire(hand, nextGesture);

    if (hand && controlRef.current.mouse_enabled && pointerArmed) {
      pointFramesRef.current += 1;
      const pointerPoint = getStablePointerPoint(hand);
      if (pointerPoint && pointFramesRef.current >= 2) {
        sendPointer(pointerPoint);
      }
    } else {
      pointFramesRef.current = 0;
    }

    if (hand && controlRef.current.mouse_enabled) {
      handlePinch(hand);
    } else {
      releasePinch();
    }
  }

  function sendPointer(point) {
    const now = performance.now();
    const last = pointerSendRef.current;
    if (now - last.lastAt < 16) {
      return;
    }

    const payloadPoint = antiJitter ? point : point;
    if (Math.hypot(payloadPoint.x - last.x, payloadPoint.y - last.y) < 0.0015) {
      return;
    }
    pointerSendRef.current = { lastAt: now, x: payloadPoint.x, y: payloadPoint.y };
    const message = JSON.stringify({
      type: "pointer",
      x: Math.min(1, Math.max(0, payloadPoint.x)),
      y: Math.min(1, Math.max(0, payloadPoint.y)),
    });

    if (wsRef.current?.readyState === WebSocket.OPEN && wsRef.current.bufferedAmount < 4096) {
      wsRef.current.send(message);
      return;
    }

    fetch(`${API_URL}/control/pointer`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        x: Math.min(1, Math.max(0, payloadPoint.x)),
        y: Math.min(1, Math.max(0, payloadPoint.y)),
      }),
    }).catch(() => {});
  }

  function handlePinch(hand) {
    const thumb = hand[4];
    const index = hand[8];
    const distance = Math.hypot(thumb.x - index.x, thumb.y - index.y);
    const pinchOn = distance < 0.05;
    const releaseOn = distance > 0.075;
    const now = performance.now();

    if (pinchOn && !pinchRef.current.active) {
      pinchRef.current = { active: true, dragging: false, startAt: now };
      setMouseGesture("PINCH");
      return;
    }

    if (pinchRef.current.active && !pinchRef.current.dragging && now - pinchRef.current.startAt > 240) {
      pinchRef.current.dragging = true;
      sendMouseEvent("down");
      setMouseGesture("DRAG");
      return;
    }

    if (pinchRef.current.active && releaseOn) {
      const wasDragging = pinchRef.current.dragging;
      const duration = now - pinchRef.current.startAt;
      pinchRef.current = { active: false, dragging: false, startAt: 0 };

      if (wasDragging) {
        sendMouseEvent("up");
        setMouseGesture("RELEASE");
      } else if (duration < 240) {
        sendMouseEvent("click");
        setMouseGesture("CLICK");
      }

      if (mouseGestureTimerRef.current) window.clearTimeout(mouseGestureTimerRef.current);
      mouseGestureTimerRef.current = window.setTimeout(() => setMouseGesture("READY"), 420);
    }
  }

  function releasePinch() {
    if (mouseGestureTimerRef.current) {
      window.clearTimeout(mouseGestureTimerRef.current);
      mouseGestureTimerRef.current = null;
    }
    if (pinchRef.current.dragging) {
      sendMouseEvent("up");
    }
    pinchRef.current = { active: false, dragging: false, startAt: 0 };
    setMouseGesture("READY");
  }

  function sendMouseEvent(event) {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: "mouse_event", event }));
      return;
    }
    fetch(`${API_URL}/control/mouse-event`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ event }),
    }).catch(() => {});
  }

  function drawOverlay(hand, nextGesture) {
    const canvas = canvasRef.current;
    const video = videoRef.current;
    if (!canvas || !video) return;

    const width = video.videoWidth || 960;
    const height = video.videoHeight || 540;
    if (canvas.width !== width) canvas.width = width;
    if (canvas.height !== height) canvas.height = height;

    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, width, height);

    if (controlRef.current.mouse_enabled) {
      const centerX = width * 0.5;
      const centerY = height * 0.5;
      const radius = Math.min(width, height) * POINTER_REACQUIRE_RADIUS;
      ctx.save();
      ctx.beginPath();
      ctx.lineWidth = 2;
      ctx.setLineDash([10, 10]);
      ctx.strokeStyle = mouseAssist.armed ? "rgba(69, 255, 177, 0.55)" : "rgba(255, 200, 87, 0.85)";
      ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.beginPath();
      ctx.moveTo(centerX - 18, centerY);
      ctx.lineTo(centerX + 18, centerY);
      ctx.moveTo(centerX, centerY - 18);
      ctx.lineTo(centerX, centerY + 18);
      ctx.stroke();
      ctx.restore();
    }

    if (!hand) {
      ctx.fillStyle = "rgba(98, 233, 255, 0.72)";
      ctx.font = "24px Segoe UI";
      ctx.fillText("Buscando mano...", 24, 42);
      return;
    }

    ctx.lineWidth = 4;
    ctx.strokeStyle = nextGesture.stale ? "rgba(255, 200, 87, 0.82)" : "rgba(98, 233, 255, 0.95)";
    ctx.shadowBlur = 16;
    ctx.shadowColor = "rgba(98, 233, 255, 0.7)";
    handConnections.forEach(([from, to]) => {
      ctx.beginPath();
      ctx.moveTo(hand[from].x * width, hand[from].y * height);
      ctx.lineTo(hand[to].x * width, hand[to].y * height);
      ctx.stroke();
    });

    hand.forEach((point, index) => {
      const isTip = [4, 8, 12, 16, 20].includes(index);
      ctx.beginPath();
      ctx.fillStyle = isTip ? "#45ffb1" : "#ffc857";
      ctx.arc(point.x * width, point.y * height, isTip ? 8 : 5, 0, Math.PI * 2);
      ctx.fill();
    });

    if (controlRef.current.mouse_enabled) {
      const thumb = hand[4];
      const index = hand[8];
      const pinchDistance = Math.hypot(thumb.x - index.x, thumb.y - index.y);
      const pinching = pinchDistance < 0.075;
      ctx.beginPath();
      ctx.lineWidth = 5;
      ctx.strokeStyle = pinching ? "#45ffb1" : "rgba(255,255,255,0.55)";
      ctx.moveTo(thumb.x * width, thumb.y * height);
      ctx.lineTo(index.x * width, index.y * height);
      ctx.stroke();
    }

    ctx.shadowBlur = 0;
    ctx.fillStyle = "#62e9ff";
    ctx.font = "28px Segoe UI";
    const staleLabel = nextGesture.stale ? " hold" : "";
    ctx.fillText(`${nextGesture.name}${staleLabel} ${Math.round((nextGesture.confidence ?? 0) * 100)}%`, 24, 42);
  }

  function clearCanvas() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.getContext("2d").clearRect(0, 0, canvas.width, canvas.height);
  }

  async function executeAction(action = currentAction, source = "desktop") {
    if (action === "sin accion") {
      pushEvent("No hay accion asignada.");
      return;
    }

    try {
      const response = await fetch(`${API_URL}/actions/execute`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, source }),
      });
      if (!response.ok) throw new Error("request_failed");
      const result = await response.json();
      pushEvent(result.message);
    } catch {
      pushEvent(`No pude ejecutar accion: ${action}`);
    }
  }

  async function setControlMode(mode) {
    try {
      releasePinch();
      if (mode === "mouse") {
        disarmPointerTracking("Mano al centro para enganchar mouse", 320);
      } else {
        setMouseAssistState({ armed: false, centerFrames: 0, notice: "Modo comandos activo" });
        resetPointerAnchorBackend(260);
      }
      const response = await fetch(`${API_URL}/control/mode/${mode}`, { method: "POST" });
      if (!response.ok) throw new Error("request_failed");
      const data = await response.json();
      setControl(data);
      pushEvent(`Modo ${data.mode} activo.`);
    } catch {
      pushEvent("No pude cambiar modo de control.");
    }
  }

  async function sendMessage(event) {
    event.preventDefault();
    if (!message.trim()) return;

    try {
      setAnswer("Pensando...");
      const response = await fetch(`${API_URL}/ai/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message }),
      });
      if (!response.ok) throw new Error("request_failed");
      const data = await response.json();
      setAnswer(data.answer);
      setMessage("");
    } catch {
      setAnswer("No pude contactar al core de IA.");
      pushEvent("Fallo consulta IA.");
    }
  }

  function pushEvent(text) {
    setEvents((current) => [{ text, time: new Date().toLocaleTimeString() }, ...current].slice(0, 6));
  }

  function organizeAtoms() {
    setAtoms((current) => {
      const cols = 6;
      return current.map((atom, index) => ({
        ...atom,
        x: 0.11 + ((index % cols) * 0.145),
        y: 0.2 + (Math.floor(index / cols) * 0.24),
      }));
    });
    pushEvent("Atomos organizados en red.");
  }

  return (
    <main className="shell neo-shell">
      <Suspense fallback={null}>
        <HudScene3D intensity={vision.running ? 1 : 0.58} />
      </Suspense>
      <div className="hud-cosmos" aria-hidden="true">
        <span className="ring ring-a" />
        <span className="ring ring-b" />
        <span className="ring ring-c" />
        <span className="scanline scanline-a" />
        <span className="scanline scanline-b" />
      </div>

      {bootVisible ? (
        <div className="boot-screen boot-cinematic">
          <div className="boot-cinematic-bg" aria-hidden="true" />
          <div className="boot-cinematic-grid">
            <aside className="boot-panel boot-panel-left">
              <span className="boot-panel-kicker">STARK INDUSTRIES · 2026</span>
              <h3 className="boot-panel-title">J.A.R.V.I.S. NEURAL</h3>
              <p className="boot-panel-body">
                Enlace seguro. Vision worker activo. Control de escritorio en espera de tu gesto.
              </p>
              <ul className="boot-panel-list">
                <li>MediaPipe Tasks · HandLandmarker</li>
                <li>WebGL holographic deck</li>
                <li>Core Python · FastAPI</li>
              </ul>
            </aside>

            <div className="boot-hero">
              <div className="boot-core">
                <span className="boot-ring r1" />
                <span className="boot-ring r2" />
                <span className="boot-ring r3" />
                <strong className="boot-hero-mark">JESSI STARK</strong>
              </div>
              <div className="boot-hero-frame">
                <span className="bf-c" />
                <span className="bf-c" />
                <span className="bf-c" />
                <span className="bf-c" />
              </div>
            </div>

            <aside className="boot-panel boot-panel-right">
              <span className="boot-panel-kicker gold">TONY STARK MODE</span>
              <h3 className="boot-panel-title gold">Bienvenido al laboratorio</h3>
              <div className="boot-telemetry">
                <div><small>ESTADO</small><strong>ONLINE</strong></div>
                <div><small>CANAL</small><strong>NEURAL-LINK</strong></div>
                <div><small>CAPA</small><strong>HOLOGRAM 3D</strong></div>
                <div><small>IA</small><strong>READY</strong></div>
              </div>
              <p className="boot-panel-body subtle">
                Activa la cámara cuando quieras. Esto no es un radar cutre: es un volumen de tracking holográfico.
              </p>
            </aside>
          </div>
          <div className="boot-copy boot-copy-wide">
            <p>Inicializando consola gestual</p>
            <h2>Protocolo Stark · Jessi Stark OS</h2>
            <span>Vision · Control PC · Asistente · Holographic UI</span>
          </div>
        </div>
      ) : null}

      <section className="neo-header hud-panel">
        <div className="neo-brand">
          <p className="eyebrow">Jessi Stark OS / IA Moves</p>
          <h1>Neural Gesture Deck</h1>
        </div>
        <div className="neo-badges">
          <div className={`status ${health === "ok" ? "online" : "offline"}`}>
            <span />
            Core {health}
          </div>
          <div className={`status ${control.mouse_enabled ? "online" : "offline"}`}>
            <span />
            Modo {control.mode}
          </div>
          <div className="neo-badge-metric">FPS {perf.fps}</div>
          <div className="neo-badge-metric">INF {perf.inferMs}ms</div>
        </div>
      </section>

      <section className="bento-deck" aria-label="Panel principal">
        <div className="bento-tile bento-vision">
          <article className="hud-panel neo-card bento-card bento-card--hero">
            <div className="panel-title bento-panel-head">
              <div>
                <span className="bento-kicker">THREE.JS · RADAR</span>
                <span>Vision Matrix</span>
              </div>
              <div className="button-group">
                <button onClick={vision.running ? stopVision : startVision}>
                  {vision.running ? "Detener" : "Camara"}
                </button>
                <button onClick={() => setAutoMode((current) => !current)}>
                  Auto {autoMode ? "ON" : "OFF"}
                </button>
              </div>
            </div>
            <div className="camera-tools">
              <select value={cameraIndex} onChange={(event) => setCameraIndex(Number(event.target.value))}>
                {(cameras.length ? cameras : [null]).map((camera, index) => (
                  <option value={index} key={index}>
                    {camera?.label || `Cam ${index}`}
                  </option>
                ))}
              </select>
              <button onClick={loadCameras}>Probar camaras</button>
            </div>
            <div className={`scanner neo-scanner ${vision.running ? "" : "neo-scanner--idle"}`}>
              <div className="corner c1" />
              <div className="corner c2" />
              <div className="corner c3" />
              <div className="corner c4" />
              {vision.running ? (
                <div className="camera-stage">
                  <video ref={videoRef} className="camera-feed" playsInline muted />
                  <canvas ref={canvasRef} className="landmark-layer" />
                </div>
              ) : (
                <Suspense
                  fallback={
                    <div className="hologram-radar-fallback" role="status">
                      <span className="hrf-ring" />
                      <p>Cargando matriz holográfica…</p>
                    </div>
                  }
                >
                  <HologramRadar3D />
                </Suspense>
              )}
            </div>
            <div className="metric-row neo-metric-row">
              <div>
                <small>Gesto</small>
                <strong>{gesture.name}</strong>
              </div>
              <div>
                <small>Confianza</small>
                <strong>{Math.round((gesture.confidence ?? 0) * 100)}%</strong>
              </div>
              <div>
                <small>Accion</small>
                <strong>{currentAction}</strong>
              </div>
              <div>
                <small>Mouse</small>
                <strong>{mouseGesture}</strong>
              </div>
              <div>
                <small>Perf</small>
                <strong>{perf.fps}fps / {perf.pointerHz}Hz</strong>
              </div>
            </div>
            {control.mouse_enabled ? (
              <div className={`mouse-assist ${mouseAssist.armed ? "armed" : "seeking"}`}>
                <strong>{mouseAssist.armed ? "ENGANCHADO" : "REENGANCHE"}</strong>
                <span>{mouseAssist.notice}</span>
              </div>
            ) : null}
            <p className="warning">infer {perf.inferMs}ms | stale {perf.staleFrames} | source {vision.source}</p>
            {vision.error ? <p className="warning">{vision.error}</p> : null}
            <div className="dual-actions">
              <button className="primary" onClick={() => executeAction()}>
                Ejecutar accion
              </button>
              <button onClick={simulateGesture}>Simular</button>
            </div>
          </article>
        </div>

        <div className="bento-tile bento-babylon">
          <article className="hud-panel neo-card bento-card babylon-card">
            <div className="panel-title bento-panel-head">
              <div>
                <span className="bento-kicker gold">BABYLON.JS · CORE</span>
                <span>Neural volume</span>
              </div>
              <span className="pill">WebGL2</span>
            </div>
            <p className="bento-panel-blurb">
              Segundo motor 3D en vivo: nudo toroidal + ico-esfera emisiva. Sin captura de ratón.
            </p>
            <Suspense
              fallback={
                <div className="babylon-fallback" role="status">
                  <span className="hrf-ring" />
                  <span>Inicializando Babylon…</span>
                </div>
              }
            >
              <BabylonNeuralCore />
            </Suspense>
          </article>
        </div>

        <div className="bento-tile bento-stack">
          <article className="hud-panel neo-card bento-card stack-card">
            <div className="panel-title bento-panel-head">
              <div>
                <span className="bento-kicker">INTEL STACK · 2026</span>
                <span>Routing deck</span>
              </div>
            </div>
            <p className="bento-panel-blurb subtle">
              Selecciona capa activa (vista previa de arquitectura; el core sigue usando tu pipeline actual).
            </p>
            <div className="neural-chip-grid">
              {neuralStackCatalog.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={`neural-chip ${neuralFocus === item.id ? "neural-chip--on" : ""}`}
                  onClick={() => {
                    setNeuralFocus(item.id);
                    pushEvent(`Deck neural: ${item.label}`);
                  }}
                >
                  <strong>{item.label}</strong>
                  <span>{item.sub}</span>
                </button>
              ))}
            </div>
          </article>
        </div>

        <div className="bento-tile bento-atom">
          <article className="hud-panel neo-card bento-card atom-card">
            <div className="panel-title bento-panel-head">
              <div>
                <span className="bento-kicker">ATOM LAB · 2 HANDS</span>
                <span>Neural manipulation sandbox</span>
              </div>
              <button onClick={organizeAtoms}>Organizar</button>
            </div>
            <p className="bento-panel-blurb subtle">
              Pinch con una mano para agarrar y mover atomos. Pinch con ambas sobre el mismo atomo para expandir o achicar.
            </p>
            <canvas ref={atomCanvasRef} className="atom-lab-canvas" />
            <div className="metric-row neo-metric-row atom-lab-metrics">
              <div>
                <small>Manos</small>
                <strong>{trackedHands.length}</strong>
              </div>
              <div>
                <small>Atomos</small>
                <strong>{atoms.length}</strong>
              </div>
              <div>
                <small>Modo</small>
                <strong>Pinch lab</strong>
              </div>
            </div>
          </article>
        </div>

        <div className="bento-tile bento-control">
          <article className="hud-panel neo-card bento-card systems-panel">
            <div className="panel-title">
              <span>Control Deck</span>
              <button onClick={checkHealth}>Revisar</button>
            </div>
            <div className="action-grid">
              {pcActions.map((item) => (
                <button key={item.action} onClick={() => executeAction(item.action)}>
                  {item.label}
                </button>
              ))}
            </div>
            <div className="system-list neo-system-list">
              {[
                { label: "Vision", value: vision.running ? "activa" : "pausada" },
                { label: "Modo", value: control.mode },
                { label: "Fuente", value: vision.source },
                { label: "Tracking", value: gesture.stale ? "hold" : "live" },
                { label: "Deck IA", value: neuralStackCatalog.find((n) => n.id === neuralFocus)?.label ?? "—" },
              ].map((panel) => (
                <div key={panel.label} className="system-item">
                  <span>{panel.label}</span>
                  <strong>{panel.value}</strong>
                </div>
              ))}
            </div>
            <div className="mode-switch">
              <button className={control.mode === "commands" ? "selected" : ""} onClick={() => setControlMode("commands")}>
                Modo Comandos
              </button>
              <button className={control.mode === "mouse" ? "selected" : ""} onClick={() => setControlMode("mouse")}>
                Modo Mouse
              </button>
            </div>
          </article>
        </div>

        <div className="bento-tile bento-cal">
          <article className="hud-panel neo-card bento-card calibration">
            <div className="panel-title compact">
              <span>Calibracion Mouse</span>
              <span className="pill">live</span>
            </div>
            <div className="preset-row">
              <button onClick={() => applyMousePreset("precision")}>Precision</button>
              <button onClick={() => applyMousePreset("normal")}>Normal</button>
              <button onClick={() => applyMousePreset("gaming")}>Gaming</button>
              <button onClick={() => applyMousePreset("pro")}>PRO</button>
            </div>
            <div className="toggle-row">
              <button
                className={mouseConfig.pointer_mode === "relative" ? "selected" : ""}
                onClick={() => updateMouseConfig({ pointer_mode: "relative" }, true)}
              >
                Mouse Relativo
              </button>
              <button
                className={mouseConfig.pointer_mode === "absolute" ? "selected" : ""}
                onClick={() => updateMouseConfig({ pointer_mode: "absolute" }, true)}
              >
                Mouse Absoluto
              </button>
            </div>
            <div className="preset-row">
              <button className={antiJitter ? "selected" : ""} onClick={toggleAntiJitter}>
                Anti-jitter {antiJitter ? "ON" : "OFF"}
              </button>
            </div>
            <label>
              <span>Sensibilidad</span>
              <input
                type="range"
                min="800"
                max="7000"
                step="100"
                value={mouseConfig.sensitivity}
                onChange={(event) => updateMouseConfig({ sensitivity: Number(event.target.value) })}
              />
              <strong>{Math.round(mouseConfig.sensitivity)}</strong>
            </label>
            <label>
              <span>Suavizado</span>
              <input
                type="range"
                min="0.08"
                max="0.9"
                step="0.01"
                value={mouseConfig.smoothing}
                onChange={(event) => updateMouseConfig({ smoothing: Number(event.target.value) })}
              />
              <strong>{Math.round(mouseConfig.smoothing * 100)}%</strong>
            </label>
            <label>
              <span>Zona muerta</span>
              <input
                type="range"
                min="0"
                max="0.03"
                step="0.0005"
                value={mouseConfig.deadzone}
                onChange={(event) => updateMouseConfig({ deadzone: Number(event.target.value) })}
              />
              <strong>{mouseConfig.deadzone.toFixed(4)}</strong>
            </label>
            <div className="toggle-row">
              <button
                className={mouseConfig.invert_x ? "selected" : ""}
                onClick={() => updateMouseConfig({ invert_x: !mouseConfig.invert_x }, true)}
              >
                Invertir X
              </button>
              <button
                className={mouseConfig.invert_y ? "selected" : ""}
                onClick={() => updateMouseConfig({ invert_y: !mouseConfig.invert_y }, true)}
              >
                Invertir Y
              </button>
            </div>
          </article>
        </div>

        <div className="bento-tile bento-ai">
          <article className="hud-panel neo-card bento-card assistant-panel">
            <div className="panel-title bento-panel-head">
              <div>
                <span className="bento-kicker">ASISTENTE</span>
                <span>Core FastAPI</span>
              </div>
              <span className="pill">programacion</span>
            </div>
            <div className="answer">{answer}</div>
            <form onSubmit={sendMessage} className="prompt">
              <input
                value={message}
                onChange={(event) => setMessage(event.target.value)}
                placeholder="Ej: mejora el modo mouse para precision"
              />
              <button>Enviar</button>
            </form>
          </article>
        </div>

        <div className="bento-tile bento-log">
          <article className="hud-panel neo-card bento-card log-panel">
            <div className="panel-title">
              <span>Eventos</span>
              <span className="pill">live</span>
            </div>
            <div className="events">
              {events.length === 0 ? (
                <p>Sin eventos todavia.</p>
              ) : (
                events.map((event, index) => (
                  <div className="event" key={`${event.time}-${index}`}>
                    <span>{event.time}</span>
                    <p>{event.text}</p>
                  </div>
                ))
              )}
            </div>
          </article>
        </div>
      </section>
    </main>
  );
}
