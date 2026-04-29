from time import sleep
from pathlib import Path

from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, StreamingResponse

from .action_engine import action_engine
from .ai_client import ai_client
from .camera_service import camera_service, probe_cameras
from .control_state import control_state
from .gesture_engine import gesture_engine
from .models import (
    ActionRequest,
    ActionResult,
    ChatRequest,
    ChatResponse,
    ControlConfigRequest,
    GestureState,
    MouseEventRequest,
    PointerRequest,
)

app = FastAPI(title="IA Moves Core", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_origin_regex=r"^https?://(localhost|127\.0\.0\.1)(:\d+)?$",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

MODELS_DIR = Path(__file__).resolve().parent.parent / "models"


@app.get("/")
def root() -> dict[str, object]:
    return {
        "name": "IA Moves Core",
        "status": "ok",
        "docs": "/docs",
        "health": "/health",
        "vision": ["/vision/status", "/vision/start", "/vision/stop"],
    }


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok", "service": "ia-moves-core"}


@app.get("/gestures/latest", response_model=GestureState)
def latest_gesture() -> GestureState:
    return gesture_engine.latest()


@app.post("/gestures/simulate", response_model=GestureState)
def simulate_gesture() -> GestureState:
    return gesture_engine.simulate_next()


@app.post("/gestures/update", response_model=GestureState)
def update_gesture(gesture: GestureState) -> GestureState:
    return gesture_engine.update(gesture)


@app.get("/vision/status")
def vision_status() -> dict[str, object]:
    return camera_service.status()


@app.get("/vision/cameras")
def vision_cameras() -> dict[str, object]:
    return {"cameras": probe_cameras()}


@app.get("/models/{filename}")
def model_file(filename: str) -> FileResponse:
    safe_name = Path(filename).name
    target = (MODELS_DIR / safe_name).resolve()
    if target.parent != MODELS_DIR.resolve() or not target.exists():
        raise HTTPException(status_code=404, detail="model_not_found")
    return FileResponse(path=str(target), media_type="application/octet-stream")


@app.post("/vision/start")
def vision_start(camera_index: int = 0) -> dict[str, object]:
    return camera_service.start(camera_index)


@app.post("/vision/stop")
def vision_stop() -> dict[str, object]:
    return camera_service.stop()


@app.get("/vision/stream")
def vision_stream() -> StreamingResponse:
    def frames():
        while True:
            frame = camera_service.latest_jpeg()
            if frame is not None:
                yield b"--frame\r\nContent-Type: image/jpeg\r\n\r\n" + frame + b"\r\n"
            sleep(0.045)

    return StreamingResponse(frames(), media_type="multipart/x-mixed-replace; boundary=frame")


@app.get("/actions")
def actions() -> dict[str, list[str]]:
    return {"allowed": action_engine.allowed_actions}


@app.get("/control/status")
def control_status() -> dict[str, object]:
    snapshot = control_state.snapshot()
    return {
        "mode": snapshot.mode,
        "mouse_enabled": snapshot.mouse_enabled,
        "last_action_at": snapshot.last_action_at,
        "sensitivity": snapshot.sensitivity,
        "smoothing": snapshot.smoothing,
        "deadzone": snapshot.deadzone,
        "invert_x": snapshot.invert_x,
        "invert_y": snapshot.invert_y,
        "pointer_mode": snapshot.pointer_mode,
        "dragging": snapshot.dragging,
    }


@app.post("/control/mode/{mode}")
def control_mode(mode: str) -> dict[str, object]:
    snapshot = control_state.set_mode(mode)
    return {"mode": snapshot.mode, "mouse_enabled": snapshot.mouse_enabled}


@app.post("/control/config")
def control_config(request: ControlConfigRequest) -> dict[str, object]:
    snapshot = control_state.configure(
        sensitivity=request.sensitivity,
        smoothing=request.smoothing,
        deadzone=request.deadzone,
        invert_x=request.invert_x,
        invert_y=request.invert_y,
        pointer_mode=request.pointer_mode,
    )
    return {
        "mode": snapshot.mode,
        "mouse_enabled": snapshot.mouse_enabled,
        "sensitivity": snapshot.sensitivity,
        "smoothing": snapshot.smoothing,
        "deadzone": snapshot.deadzone,
        "invert_x": snapshot.invert_x,
        "invert_y": snapshot.invert_y,
        "pointer_mode": snapshot.pointer_mode,
        "dragging": snapshot.dragging,
    }


@app.post("/control/pointer")
def control_pointer(request: PointerRequest) -> dict[str, bool]:
    control_state.move_pointer(request.x, request.y)
    return {"ok": True}


@app.post("/control/reset-pointer")
def control_reset_pointer(cooldown_ms: int = 220) -> dict[str, bool]:
    control_state.reset_pointer_anchor(cooldown_ms=cooldown_ms)
    return {"ok": True}


@app.post("/control/mouse-event")
def control_mouse_event(request: MouseEventRequest) -> dict[str, bool]:
    if request.event == "down":
        control_state.mouse_down()
    elif request.event == "up":
        control_state.mouse_up()
    elif request.event == "click":
        control_state.click()
    else:
        return {"ok": False}
    return {"ok": True}


@app.websocket("/control/ws")
async def control_ws(websocket: WebSocket) -> None:
    await websocket.accept()
    try:
        while True:
            message = await websocket.receive_json()
            message_type = message.get("type")

            if message_type == "pointer":
                x = message.get("x")
                y = message.get("y")
                if isinstance(x, (int, float)) and isinstance(y, (int, float)):
                    control_state.move_pointer(float(x), float(y))
                else:
                    await websocket.send_json({"ok": False, "error": "invalid_pointer"})
            elif message_type == "mouse_event":
                event = message.get("event")
                if event == "down":
                    control_state.mouse_down()
                elif event == "up":
                    control_state.mouse_up()
                elif event == "click":
                    control_state.click()
                else:
                    await websocket.send_json({"ok": False, "error": "invalid_mouse_event"})
                    continue
            elif message_type == "reset_pointer":
                try:
                    cooldown_ms = int(message.get("cooldown_ms", 220))
                except (TypeError, ValueError):
                    cooldown_ms = 220
                control_state.reset_pointer_anchor(cooldown_ms=cooldown_ms)
            else:
                await websocket.send_json({"ok": False, "error": "unknown_type"})
    except WebSocketDisconnect:
        return


@app.post("/actions/execute", response_model=ActionResult)
def execute_action(request: ActionRequest) -> ActionResult:
    return action_engine.run(request.action)


@app.post("/ai/chat", response_model=ChatResponse)
def chat(request: ChatRequest) -> ChatResponse:
    return ChatResponse(answer=ai_client.chat(request.message, request.context))
