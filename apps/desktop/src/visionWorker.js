import { FilesetResolver, HandLandmarker } from "@mediapipe/tasks-vision";

let handLandmarker = null;
let scratchCanvas = null;
let scratchContext = null;
let previousHand = null;
let previousHands = [];
let previousGesture = { name: "unknown", confidence: 0.1, active: false, stale: false };
let lastSeenAt = 0;
let windowStartedAt = performance.now();
let frameCount = 0;
let inferTotalMs = 0;
let inferSamples = 0;
let staleFrames = 0;
let currentSource = "booting";
let resolverPromise = null;
let initPromise = null;
let initConfig = { wasmPath: "", modelPath: "", forceCpu: false };
const HAND_STALE_HOLD_MS = 650;
const INIT_TIMEOUT_MS = 15000;

function smoothingAlpha(cutoff, dt) {
  const tau = 1 / (2 * Math.PI * cutoff);
  return 1 / (1 + tau / Math.max(dt, 1e-4));
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

function applyOneEuroFilter(prev, next, dt) {
  if (!prev) return next.map((point) => ({ ...point }));

  return next.map((point, index) => {
    const previous = prev[index];
    const dx = (point.x - previous.x) / Math.max(dt, 1e-4);
    const dy = (point.y - previous.y) / Math.max(dt, 1e-4);
    const speed = Math.hypot(dx, dy);
    const cutoff = 1.1 + (0.03 * speed);
    const alpha = smoothingAlpha(cutoff, dt);
    return {
      x: previous.x + ((point.x - previous.x) * alpha),
      y: previous.y + ((point.y - previous.y) * alpha),
      z: (previous.z ?? 0) + (((point.z ?? 0) - (previous.z ?? 0)) * alpha),
    };
  });
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

function perfSnapshot(lastInferMs) {
  frameCount += 1;
  inferTotalMs += lastInferMs;
  inferSamples += 1;

  const now = performance.now();
  const elapsed = now - windowStartedAt;
  if (elapsed < 550) {
    return {
      fps: (frameCount * 1000) / Math.max(elapsed, 1),
      inferMs: inferSamples ? inferTotalMs / inferSamples : 0,
      staleFrames,
    };
  }

  const snapshot = {
    fps: (frameCount * 1000) / elapsed,
    inferMs: inferSamples ? inferTotalMs / inferSamples : 0,
    staleFrames,
  };
  windowStartedAt = now;
  frameCount = 0;
  inferTotalMs = 0;
  inferSamples = 0;
  staleFrames = 0;
  return snapshot;
}

async function getResolver(wasmPath) {
  if (!resolverPromise) {
    resolverPromise = FilesetResolver.forVisionTasks(wasmPath);
  }
  return resolverPromise;
}

async function withTimeout(promise, timeoutMs, label) {
  let timerId = null;
  const timeoutPromise = new Promise((_, reject) => {
    timerId = setTimeout(() => {
      reject(new Error(`${label} timeout`));
    }, timeoutMs);
  });
  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timerId) clearTimeout(timerId);
  }
}

function sourceFromDelegate(delegate) {
  return delegate === "CPU" ? "worker-cpu-fallback" : "worker-gpu";
}

async function createLandmarker(delegate) {
  try {
    handLandmarker?.close?.();
  } catch {
    // no-op
  }
  const resolver = await withTimeout(getResolver(initConfig.wasmPath), INIT_TIMEOUT_MS, "resolver");
  const baseOptions = {
    modelAssetPath: initConfig.modelPath,
  };
  if (delegate === "GPU") {
    baseOptions.delegate = "GPU";
  }

  const next = await withTimeout(HandLandmarker.createFromOptions(resolver, {
    baseOptions,
    runningMode: "VIDEO",
    numHands: 2,
    minHandDetectionConfidence: 0.32,
    minHandPresenceConfidence: 0.3,
    minTrackingConfidence: 0.3,
  }), INIT_TIMEOUT_MS, `${delegate.toLowerCase()}_landmarker`);
  handLandmarker = next;
  currentSource = sourceFromDelegate(delegate);
  resetTrackingState();
}

async function bootstrapVision() {
  if (!initConfig.wasmPath || !initConfig.modelPath) {
    throw new Error("Vision config incompleta.");
  }
  if (initConfig.forceCpu) {
    await createLandmarker("CPU");
    self.postMessage({ type: "engine", source: currentSource, message: "Worker forzado a CPU." });
    return;
  }
  try {
    await createLandmarker("GPU");
    self.postMessage({ type: "engine", source: currentSource, message: "Worker vision usando GPU." });
  } catch (gpuError) {
    self.postMessage({
      type: "engine",
      source: "worker-init",
      error: gpuError.message,
      message: "GPU no disponible, activando fallback CPU.",
    });
    await createLandmarker("CPU");
    self.postMessage({ type: "engine", source: currentSource, message: "Fallback CPU activo en worker." });
  }
}

async function ensureInitialized() {
  if (handLandmarker) return;
  if (!initPromise) {
    initPromise = bootstrapVision().finally(() => {
      initPromise = null;
    });
  }
  await initPromise;
}

function resetTrackingState() {
  previousHand = null;
  previousHands = [];
  previousGesture = { name: "unknown", confidence: 0.1, active: false, stale: false };
  lastSeenAt = 0;
  staleFrames = 0;
}

function inferFromCanvas(timestamp, antiJitter) {
  const startedAt = performance.now();
  const result = handLandmarker.detectForVideo(scratchCanvas, timestamp);
  const inferMs = performance.now() - startedAt;
  const detectedHands = result.landmarks ?? [];
  const detected = detectedHands[0] ?? null;
  const now = performance.now();

  let hand = null;
  let gesture = { name: "unknown", confidence: 0.1, active: false, stale: false };

  if (detected) {
    const dt = Math.max((now - lastSeenAt) / 1000, 1 / 60);
    const hands = detectedHands
      .slice(0, 2)
      .map((landmarks, index) => {
        const previous = previousHands[index] ?? null;
        return antiJitter
          ? applyOneEuroFilter(previous, landmarks, dt)
          : smoothLandmarks(previous, landmarks, 0.34);
      });
    previousHands = hands;

    const filtered = antiJitter
      ? applyOneEuroFilter(previousHand, detected, dt)
      : smoothLandmarks(previousHand, detected, 0.34);
    previousHand = filtered;
    lastSeenAt = now;
    hand = filtered;
    gesture = classifyHand(filtered);
    previousGesture = gesture;
  } else if (previousHand && now - lastSeenAt < HAND_STALE_HOLD_MS) {
    staleFrames += 1;
    hand = previousHand;
    gesture = {
      ...previousGesture,
      confidence: Math.max(0.38, (previousGesture.confidence ?? 0.8) - ((now - lastSeenAt) * 0.0007)),
      active: true,
      stale: true,
    };
  } else {
    resetTrackingState();
  }

  const perf = perfSnapshot(inferMs);
  return {
    type: "result",
    hand,
    hands: previousHands,
    gesture,
    fps: perf.fps,
    inferMs: perf.inferMs,
    staleFrames: perf.staleFrames,
    pointerHz: perf.fps,
    source: currentSource,
  };
}

self.onmessage = async (event) => {
  const data = event.data;

  if (data.type === "init") {
    try {
      initConfig = {
        wasmPath: data.wasmPath,
        modelPath: data.modelPath,
        forceCpu: data.forceCpu === true,
      };
      resetTrackingState();
      handLandmarker = null;
      currentSource = "worker-init";
      await ensureInitialized();
      self.postMessage({ type: "ready", source: currentSource });
    } catch (error) {
      handLandmarker = null;
      currentSource = "worker-init";
      self.postMessage({ type: "error", error: error.message, source: currentSource });
    }
    return;
  }

  if (data.type !== "frame") return;

  const bitmap = data.bitmap;
  try {
    await ensureInitialized();
    if (!scratchCanvas || scratchCanvas.width !== bitmap.width || scratchCanvas.height !== bitmap.height) {
      scratchCanvas = new OffscreenCanvas(bitmap.width, bitmap.height);
      scratchContext = scratchCanvas.getContext("2d", { alpha: false, desynchronized: true });
    }

    scratchContext.clearRect(0, 0, scratchCanvas.width, scratchCanvas.height);
    scratchContext.drawImage(bitmap, 0, 0, scratchCanvas.width, scratchCanvas.height);
    let payload;
    try {
      payload = inferFromCanvas(data.timestamp, data.antiJitter);
    } catch (error) {
      if (currentSource === "worker-gpu") {
        self.postMessage({
          type: "engine",
          source: "worker-init",
          error: error.message,
          message: "Error GPU en runtime, cambiando a fallback CPU.",
        });
        await createLandmarker("CPU");
        payload = inferFromCanvas(data.timestamp, data.antiJitter);
      } else {
        throw error;
      }
    }
    self.postMessage(payload);
  } catch (error) {
    handLandmarker = null;
    currentSource = "worker-init";
    self.postMessage({ type: "error", error: error.message, source: currentSource });
  } finally {
    try {
      bitmap.close();
    } catch {
      // no-op
    }
  }
};
