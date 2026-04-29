from datetime import datetime
from enum import StrEnum

from pydantic import BaseModel, Field


class GestureName(StrEnum):
    OPEN_PALM = "open_palm"
    FIST = "fist"
    POINT = "point"
    THUMB_UP = "thumb_up"
    VICTORY = "victory"
    SWIPE_LEFT = "swipe_left"
    SWIPE_RIGHT = "swipe_right"
    UNKNOWN = "unknown"


class GestureState(BaseModel):
    name: GestureName
    confidence: float = Field(ge=0, le=1)
    active: bool = True
    detected_at: datetime = Field(default_factory=datetime.utcnow)


class ActionRequest(BaseModel):
    action: str
    source: str = "manual"


class ActionResult(BaseModel):
    action: str
    ok: bool
    message: str


class ChatRequest(BaseModel):
    message: str
    context: str | None = None


class ChatResponse(BaseModel):
    answer: str


class PointerRequest(BaseModel):
    x: float = Field(ge=0, le=1)
    y: float = Field(ge=0, le=1)
    source: str = "frontend"


class ControlConfigRequest(BaseModel):
    sensitivity: float | None = None
    smoothing: float | None = None
    deadzone: float | None = None
    invert_x: bool | None = None
    invert_y: bool | None = None
    pointer_mode: str | None = None


class MouseEventRequest(BaseModel):
    event: str
    source: str = "frontend"
