import { useEffect, useRef } from "react";

/**
 * Victory: avanza ciclo LAB / COMANDOS / MOUSE (edge + debounce).
 * Thumb up: pulso visual (callback).
 */
export function useHandLabInteraction({ gesture, onVictoryTriMode, onThumbAck }) {
  const prevRef = useRef("");
  const lastVictoryRef = useRef(0);
  const lastThumbRef = useRef(0);

  useEffect(() => {
    const g = gesture?.name;
    const prev = prevRef.current;

    if (g !== "victory") {
      prevRef.current = g;
    }

    if (g === "victory" && gesture?.active && !gesture?.stale && gesture.confidence >= 0.82) {
      if (prev !== "victory" && performance.now() - lastVictoryRef.current > 880) {
        lastVictoryRef.current = performance.now();
        onVictoryTriMode?.();
      }
      prevRef.current = g;
      return;
    }

    if (g === "thumb_up" && gesture?.active && !gesture?.stale && gesture.confidence >= 0.8) {
      if (prev !== "thumb_up" && performance.now() - lastThumbRef.current > 720) {
        lastThumbRef.current = performance.now();
        onThumbAck?.();
      }
    }

    prevRef.current = g;
  }, [gesture, onVictoryTriMode, onThumbAck]);
}
