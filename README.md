# IA Moves

IA Moves es una base para una aplicacion de escritorio tipo "estacion Tony Stark": control por gestos, voz, acciones del sistema y ayuda para programar.

## Que trae esta primera arquitectura

- `apps/desktop`: app Electron + React + Vite para el HUD visual.
- `services/core`: API Python + FastAPI para gestos, acciones e IA.
- `docs`: arquitectura, roadmap y mapa inicial de gestos.
- `scripts`: comandos de setup y ejecucion para Windows.

## Requisitos

- Node.js 20 o superior.
- Python 3.11 o superior.
- Camara web.
- Windows 10/11.

Ahora mismo tu maquina tiene Node, pero no encontre Python en el `PATH`. Instala Python desde https://www.python.org/downloads/ y marca `Add python.exe to PATH`.

## Inicio rapido

1. Copia `.env.example` a `.env` y agrega tu `OPENAI_API_KEY` cuando quieras activar IA real.
2. Instala dependencias del frontend:

```powershell
.\scripts\setup-desktop.ps1
```

3. Crea el entorno Python:

```powershell
.\scripts\setup-backend.ps1
```

4. Levanta backend y desktop en terminales separadas:

```powershell
.\scripts\run-backend.ps1
.\scripts\run-desktop.ps1
```

Para probar solo en navegador mientras desarrollas:

```powershell
cd apps/desktop
npm.cmd run web
```

Abre `http://127.0.0.1:5173`.

## Control inicial de PC

El panel `Control PC` ya puede ejecutar acciones reales en Windows:

- abrir Inicio;
- abrir VS Code;
- abrir Terminal;
- cambiar de ventana;
- mostrar escritorio;
- hacer click;
- enviar Escape.

## Primer objetivo

El MVP es:

- detectar 5 gestos por webcam;
- mostrar el gesto activo en el HUD;
- mapear gestos a acciones seguras;
- conectar un panel de asistente para programar;
- luego agregar voz en tiempo real.
