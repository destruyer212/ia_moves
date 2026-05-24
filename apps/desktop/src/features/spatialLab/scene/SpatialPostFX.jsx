import { Bloom, EffectComposer, Vignette } from "@react-three/postprocessing";

/** Bloom + viñeta cinematográfica */
export function SpatialPostFX() {
  return (
    <EffectComposer multisampling={0}>
      <Bloom
        intensity={1.45}
        luminanceThreshold={0.12}
        luminanceSmoothing={0.92}
        mipmapBlur
      />
      <Vignette eskil={false} offset={0.18} darkness={0.72} />
    </EffectComposer>
  );
}
