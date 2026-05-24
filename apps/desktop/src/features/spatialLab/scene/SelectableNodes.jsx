import { Text } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import { NEURAL_NODE_LABELS } from "../../handLab/handLabUtils.js";

const NODE_COUNT = 8;

export function SelectableNodes({ sceneStateRef }) {
  const nodes = useMemo(() => {
    return Array.from({ length: NODE_COUNT }, (_, i) => {
      const angle = (i / NODE_COUNT) * Math.PI * 2;
      const r = 3.4;
      return {
        id: `node-${i}`,
        label: NEURAL_NODE_LABELS[i % NEURAL_NODE_LABELS.length],
        position: [Math.cos(angle) * r, 0.3 + (i % 3) * 0.25, Math.sin(angle) * r - 0.8],
      };
    });
  }, []);

  return (
    <group>
      {nodes.map((node) => (
        <SelectableNode key={node.id} node={node} sceneStateRef={sceneStateRef} />
      ))}
    </group>
  );
}

function SelectableNode({ node, sceneStateRef }) {
  const meshRef = useRef(null);
  const selected = sceneStateRef.current?.selectedNodeId === node.id;

  useFrame((state) => {
    const m = meshRef.current;
    if (!m) return;
    const t = state.clock.elapsedTime;
    m.position.y = node.position[1] + Math.sin(t * 1.2 + node.id.length) * 0.06;
    const s = selected ? 1.35 : 1;
    m.scale.setScalar(s + Math.sin(t * 2) * 0.04);
  });

  return (
    <group position={node.position}>
      <mesh
        ref={meshRef}
        userData={{
          spatialPickable: true,
          spatialNodeId: node.id,
          spatialLabel: node.label,
        }}
      >
        <octahedronGeometry args={[0.14, 0]} />
        <meshStandardMaterial
          color={selected ? "#ffc857" : "#62e9ff"}
          emissive={selected ? "#ffc857" : "#62e9ff"}
          emissiveIntensity={selected ? 1.2 : 0.55}
          metalness={0.5}
          roughness={0.2}
        />
      </mesh>
      {selected ? (
        <Text
          position={[0, 0.32, 0]}
          fontSize={0.11}
          color="#e8fbff"
          anchorX="center"
          anchorY="bottom"
          outlineWidth={0.012}
          outlineColor="#02060c"
        >
          {node.label}
        </Text>
      ) : null}
    </group>
  );
}
