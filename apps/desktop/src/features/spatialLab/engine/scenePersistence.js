const STORAGE_KEY = "ia_moves_neural_sandbox_v1";
const SCHEMA_VERSION = 1;

export const DEFAULT_BLOCKS = [
  { id: "alpha", position: [2.2, 0.8, -0.5], color: "#62e9ff" },
  { id: "beta", position: [0.6, 1.1, 0.2], color: "#45ffb1" },
  { id: "gamma", position: [-1.8, 0.5, -0.3], color: "#ffc857" },
  { id: "delta", position: [-0.4, -0.2, 0.8], color: "#b388ff" },
  { id: "epsilon", position: [1.2, -0.6, 0.4], color: "#ff7b9c" },
];

export function defaultSandboxScene() {
  return {
    version: SCHEMA_VERSION,
    savedAt: null,
    globe: { rotation: [0, 0, 0, 1] },
    blocks: DEFAULT_BLOCKS.map((b) => ({
      id: b.id,
      position: [...b.position],
      rotation: [0, 0, 0, 1],
    })),
    selectedNodeId: null,
  };
}

export function loadSandboxScene() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultSandboxScene();
    const data = JSON.parse(raw);
    if (data?.version !== SCHEMA_VERSION || !Array.isArray(data.blocks)) {
      return defaultSandboxScene();
    }
    return {
      ...defaultSandboxScene(),
      ...data,
      blocks: data.blocks.length ? data.blocks : defaultSandboxScene().blocks,
    };
  } catch {
    return defaultSandboxScene();
  }
}

export function saveSandboxScene(scene) {
  try {
    const payload = {
      version: SCHEMA_VERSION,
      savedAt: new Date().toISOString(),
      globe: scene.globe ?? { rotation: [0, 0, 0, 1] },
      blocks: scene.blocks ?? [],
      selectedNodeId: scene.selectedNodeId ?? null,
    };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    return payload;
  } catch {
    return null;
  }
}
