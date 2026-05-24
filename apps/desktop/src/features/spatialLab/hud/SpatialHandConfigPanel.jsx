import { useCallback, useEffect, useState } from "react";
import {
  getHandControlConfig,
  resetHandControlConfig,
  saveHandControlConfig,
  subscribeHandControlConfig,
} from "../engine/handControlSettings.js";
import { resetPalmNavigation } from "../engine/palmNavigation.js";
import { resetStillnessGate } from "../engine/stillnessGate.js";

function Slider({ label, hint, value, min, max, onChange }) {
  return (
    <label className="spatial-config__row">
      <span className="spatial-config__label">
        {label}
        {hint ? <em>{hint}</em> : null}
      </span>
      <div className="spatial-config__slider-line">
        <input
          type="range"
          min={min}
          max={max}
          step={1}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
        />
        <span className="spatial-config__value">{value}</span>
      </div>
    </label>
  );
}

export function SpatialHandConfigPanel() {
  const [open, setOpen] = useState(true);
  const [cfg, setCfg] = useState(() => ({ ...getHandControlConfig() }));

  useEffect(() => subscribeHandControlConfig(setCfg), []);

  const patch = useCallback((partial) => {
    const next = saveHandControlConfig(partial);
    setCfg({ ...next });
    resetPalmNavigation();
    resetStillnessGate();
  }, []);

  const onReset = () => {
    const next = resetHandControlConfig();
    setCfg({ ...next });
    resetPalmNavigation();
    resetStillnessGate();
  };

  return (
    <aside className={`spatial-config ${open ? "spatial-config--open" : ""}`}>
      <button
        type="button"
        className="spatial-config__toggle"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        {open ? "▾" : "▸"} Manos
      </button>

      {open ? (
        <div className="spatial-config__body">
          <header className="spatial-config__head">
            <span className="spatial-config__chip">CONTROL MANOS</span>
            <p>Ajusta en vivo · se guarda solo</p>
          </header>

          <Slider
            label="Giro / dirección"
            hint="pinza + mueve la otra mano"
            min={1}
            max={10}
            value={cfg.orbitSpeed}
            onChange={(v) => patch({ orbitSpeed: v })}
          />
          <Slider
            label="Impulso con pinza"
            hint="más rápido al pellizcar y arrastrar"
            min={1}
            max={10}
            value={cfg.pinchDirectionBoost}
            onChange={(v) => patch({ pinchDirectionBoost: v })}
          />
          <Slider
            label="Zoom"
            hint="acerca / aleja"
            min={1}
            max={10}
            value={cfg.zoomSpeed}
            onChange={(v) => patch({ zoomSpeed: v })}
          />
          <Slider
            label="Desplazamiento"
            min={1}
            max={10}
            value={cfg.panSpeed}
            onChange={(v) => patch({ panSpeed: v })}
          />
          <Slider
            label="Respuesta"
            hint="alto = menos suavizado, más rápido"
            min={1}
            max={10}
            value={cfg.smoothing}
            onChange={(v) => patch({ smoothing: v })}
          />
          <Slider
            label="Quietud"
            hint="bajo = casi no se congela"
            min={1}
            max={10}
            value={cfg.stillness}
            onChange={(v) => patch({ stillness: v })}
          />

          <div className="spatial-config__checks">
            <label>
              <input
                type="checkbox"
                checked={cfg.swapHands}
                onChange={(e) => patch({ swapHands: e.target.checked })}
              />
              Intercambiar izquierda / derecha
            </label>
            <label>
              <input
                type="checkbox"
                checked={cfg.enablePostFX}
                onChange={(e) => patch({ enablePostFX: e.target.checked })}
              />
              Efectos bloom (puede fallar en algunas GPUs)
            </label>
            <label>
              <input
                type="checkbox"
                checked={cfg.invertOrbitX}
                onChange={(e) => patch({ invertOrbitX: e.target.checked })}
              />
              Invertir horizontal
            </label>
            <label>
              <input
                type="checkbox"
                checked={cfg.invertOrbitY}
                onChange={(e) => patch({ invertOrbitY: e.target.checked })}
              />
              Invertir vertical
            </label>
          </div>

          <div className="spatial-config__actions">
            <button type="button" className="spatial-config__btn" onClick={onReset}>
              Restaurar
            </button>
          </div>

          <p className="spatial-config__tip">
            Para girar rápido: sube <strong>Giro</strong> e <strong>Impulso pinza</strong>, sube{" "}
            <strong>Respuesta</strong> a 8–10.
          </p>
        </div>
      ) : null}
    </aside>
  );
}
