import { ArcRotateCamera } from "@babylonjs/core/Cameras/arcRotateCamera";
import { Engine } from "@babylonjs/core/Engines/engine";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight";
import { PointLight } from "@babylonjs/core/Lights/pointLight";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Color3, Color4 } from "@babylonjs/core/Maths/math.color";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { CreateIcoSphere } from "@babylonjs/core/Meshes/Builders/icoSphereBuilder";
import { CreateTorus } from "@babylonjs/core/Meshes/Builders/torusBuilder";
import { CreateTorusKnot } from "@babylonjs/core/Meshes/Builders/torusKnotBuilder";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { Scene } from "@babylonjs/core/scene";
import { useEffect, useRef } from "react";

import { useRenderGate } from "./hooks/useRenderGate.js";

/**
 * Visor Babylon.js — render loop pausado fuera de viewport o pestaña oculta.
 */
export default function BabylonNeuralCore() {
  const hostRef = useRef(null);
  const canvasRef = useRef(null);
  const renderActive = useRenderGate(hostRef);
  const engineRef = useRef(null);
  const renderLoopRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const host = hostRef.current;
    if (!canvas || !host) return undefined;

    const engine = new Engine(canvas, true, {
      alpha: true,
      stencil: false,
      antialias: false,
      powerPreference: "high-performance",
      premultipliedAlpha: false,
    });

    const scene = new Scene(engine);
    scene.clearColor = new Color4(0, 0, 0, 0);

    const camera = new ArcRotateCamera("arc", 0.95, 1.12, 3.35, new Vector3(0, 0.12, 0), scene);
    camera.lowerRadiusLimit = 2.7;
    camera.upperRadiusLimit = 4.4;

    const hemi = new HemisphericLight("hemi", new Vector3(0.35, 1, 0.25), scene);
    hemi.intensity = 0.62;

    const key = new PointLight("key", new Vector3(1.4, 1.6, 1.2), scene);
    key.intensity = 1.05;
    key.diffuse = new Color3(0.35, 0.92, 1);

    const core = CreateIcoSphere("core", { radius: 0.34, subdivisions: 2 }, scene);
    const coreMat = new StandardMaterial("coreMat", scene);
    coreMat.emissive = new Color3(0.12, 0.55, 0.85);
    core.material = coreMat;

    const orbit = new TransformNode("orbit", scene);
    core.parent = orbit;

    const knot = CreateTorusKnot(
      "knot",
      { radius: 0.52, tube: 0.085, radialSegments: 32, tubularSegments: 8, p: 2, q: 3 },
      scene,
    );
    knot.parent = orbit;
    const knotMat = new StandardMaterial("knotMat", scene);
    knotMat.wireframe = true;
    knotMat.emissive = new Color3(0.15, 0.88, 0.55);
    knotMat.alpha = 0.42;
    knot.material = knotMat;

    const halo = CreateTorus("halo", { diameter: 1.35, thickness: 0.018, tessellation: 48 }, scene);
    halo.rotation.x = Math.PI / 2.15;
    const haloMat = new StandardMaterial("haloMat", scene);
    haloMat.emissive = new Color3(0.25, 0.75, 1);
    haloMat.alpha = 0.28;
    halo.material = haloMat;

    let disposed = false;
    engineRef.current = engine;

    renderLoopRef.current = () => {
      if (disposed) return;
      orbit.rotation.y += 0.011;
      core.rotation.y += 0.016;
      camera.alpha += 0.0011;
      scene.render();
    };

    const resize = () => engine.resize();
    const ro = new ResizeObserver(resize);
    ro.observe(host);
    window.addEventListener("resize", resize);
    resize();

    return () => {
      disposed = true;
      engineRef.current = null;
      renderLoopRef.current = null;
      engine.stopRenderLoop();
      ro.disconnect();
      window.removeEventListener("resize", resize);
      scene.dispose();
      engine.dispose();
    };
  }, []);

  useEffect(() => {
    const engine = engineRef.current;
    const loop = renderLoopRef.current;
    if (!engine || !loop) return undefined;
    if (renderActive) {
      engine.runRenderLoop(loop);
    } else {
      engine.stopRenderLoop();
    }
    return () => engine.stopRenderLoop();
  }, [renderActive]);

  return (
    <div ref={hostRef} className="babylon-neural-host">
      <canvas ref={canvasRef} className="babylon-neural-canvas" />
    </div>
  );
}
