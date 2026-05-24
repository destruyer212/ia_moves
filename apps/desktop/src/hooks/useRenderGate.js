import { useEffect, useState } from "react";

/**
 * true solo si el documento está visible y el elemento intersecta el viewport.
 * Usar para pausar RAF / WebGL fuera de pantalla.
 */
export function useRenderGate(targetRef) {
  const [active, setActive] = useState(() =>
    typeof document !== "undefined" ? document.visibilityState === "visible" : true,
  );

  useEffect(() => {
    const el = targetRef?.current;
    if (!el) return undefined;

    let intersecting = true;

    const sync = () => {
      setActive(document.visibilityState === "visible" && intersecting);
    };

    const onVisibility = () => sync();
    document.addEventListener("visibilitychange", onVisibility);

    const io = new IntersectionObserver(
      (entries) => {
        intersecting = entries.some((e) => e.isIntersecting);
        sync();
      },
      { root: null, threshold: 0.04, rootMargin: "40px" },
    );
    io.observe(el);
    sync();

    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      io.disconnect();
    };
  }, [targetRef]);

  return active;
}
