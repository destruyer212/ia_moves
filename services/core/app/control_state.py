from dataclasses import dataclass
from math import hypot
from threading import Lock
from time import monotonic

import ctypes
import pyautogui

from .hand_classifier import Point
from .models import GestureName


@dataclass
class ControlSnapshot:
    mode: str
    mouse_enabled: bool
    last_action_at: float
    sensitivity: float
    smoothing: float
    deadzone: float
    invert_x: bool
    invert_y: bool
    pointer_mode: str
    dragging: bool


class ControlState:
    def __init__(self) -> None:
        self._lock = Lock()
        self.mode = "commands"
        self.mouse_enabled = False
        self.last_action_at = 0.0
        self._cursor_x: float | None = None
        self._cursor_y: float | None = None
        self._last_norm_x: float | None = None
        self._last_norm_y: float | None = None
        self._screen_left, self._screen_top, self._screen_width, self._screen_height = self._screen_bounds()
        self._screen_right = self._screen_left + self._screen_width - 1
        self._screen_bottom = self._screen_top + self._screen_height - 1
        self.sensitivity = 2200.0
        self.smoothing = 0.42
        self.deadzone = 0.0065
        self.max_delta = 0.035
        self.invert_x = True
        self.invert_y = False
        self.pointer_mode = "relative"
        self.dragging = False
        self._pinch_active = False
        self._pinch_dragging = False
        self._pinch_started_at = 0.0
        self._pinch_cooldown_until = 0.0
        self._pointer_ignore_until = 0.0

    def snapshot(self) -> ControlSnapshot:
        with self._lock:
            return ControlSnapshot(
                mode=self.mode,
                mouse_enabled=self.mouse_enabled,
                last_action_at=self.last_action_at,
                sensitivity=self.sensitivity,
                smoothing=self.smoothing,
                deadzone=self.deadzone,
                invert_x=self.invert_x,
                invert_y=self.invert_y,
                pointer_mode=self.pointer_mode,
                dragging=self.dragging,
            )

    def set_mode(self, mode: str) -> ControlSnapshot:
        if mode not in {"commands", "mouse"}:
            mode = "commands"
        with self._lock:
            self.mode = mode
            self.mouse_enabled = mode == "mouse"
            self._cursor_x = None
            self._cursor_y = None
            self._last_norm_x = None
            self._last_norm_y = None
            if self.dragging:
                pyautogui.mouseUp()
            self.dragging = False
            self._pinch_active = False
            self._pinch_dragging = False
            self._pinch_started_at = 0.0
            self._pinch_cooldown_until = 0.0
            self.last_action_at = monotonic()
        return self.snapshot()

    def toggle_mouse(self) -> ControlSnapshot:
        return self.set_mode("commands" if self.mode == "mouse" else "mouse")

    def configure(
        self,
        sensitivity: float | None = None,
        smoothing: float | None = None,
        deadzone: float | None = None,
        invert_x: bool | None = None,
        invert_y: bool | None = None,
        pointer_mode: str | None = None,
    ) -> ControlSnapshot:
        with self._lock:
            if sensitivity is not None:
                self.sensitivity = min(max(sensitivity, 800), 7000)
            if smoothing is not None:
                self.smoothing = min(max(smoothing, 0.08), 0.9)
            if deadzone is not None:
                self.deadzone = min(max(deadzone, 0), 0.03)
            if invert_x is not None:
                self.invert_x = invert_x
            if invert_y is not None:
                self.invert_y = invert_y
            if pointer_mode is not None:
                self.pointer_mode = "absolute" if pointer_mode == "absolute" else "relative"
        return self.snapshot()

    def update_from_hand(self, points: list[Point], gesture: GestureName, confidence: float) -> None:
        snapshot = self.snapshot()
        if not snapshot.mouse_enabled:
            return

        if len(points) < 9:
            return

        if gesture == GestureName.POINT and confidence >= 0.72:
            index_tip = points[8]
            self.move_pointer(index_tip.x, index_tip.y)

        self._update_pinch(points)

    def on_hand_lost(self) -> None:
        should_release = False
        with self._lock:
            if self._pinch_active:
                should_release = self.dragging
                self.dragging = False
                self._pinch_active = False
                self._pinch_dragging = False
                self._pinch_started_at = 0.0
                self._pinch_cooldown_until = monotonic() + 0.08
        if should_release:
            pyautogui.mouseUp()

    def reset_pointer_anchor(self, cooldown_ms: int = 220) -> None:
        with self._lock:
            self._last_norm_x = None
            self._last_norm_y = None
            current_x, current_y = self._cursor_position()
            self._cursor_x = float(current_x)
            self._cursor_y = float(current_y)
            self._pointer_ignore_until = monotonic() + (max(0, cooldown_ms) / 1000.0)

    def _update_pinch(self, points: list[Point]) -> None:
        thumb_tip = points[4]
        index_tip = points[8]
        distance = hypot(thumb_tip.x - index_tip.x, thumb_tip.y - index_tip.y)
        pinch_on = distance < 0.05
        pinch_off = distance > 0.072
        now = monotonic()

        should_click = False
        should_down = False
        should_up = False
        with self._lock:
            if pinch_on and not self._pinch_active and now >= self._pinch_cooldown_until:
                self._pinch_active = True
                self._pinch_dragging = False
                self._pinch_started_at = now

            if self._pinch_active and not self._pinch_dragging and now - self._pinch_started_at >= 0.22:
                self._pinch_dragging = True
                self.dragging = True
                should_down = True

            if self._pinch_active and pinch_off:
                duration = now - self._pinch_started_at
                if self._pinch_dragging:
                    self.dragging = False
                    should_up = True
                elif duration <= 0.24:
                    should_click = True

                self._pinch_active = False
                self._pinch_dragging = False
                self._pinch_started_at = 0.0
                self._pinch_cooldown_until = now + 0.12

        if should_down:
            pyautogui.mouseDown()
        elif should_up:
            pyautogui.mouseUp()
        elif should_click:
            pyautogui.click()

    def move_pointer(self, normalized_x: float, normalized_y: float) -> None:
        snapshot = self.snapshot()
        if not snapshot.mouse_enabled:
            return

        if snapshot.pointer_mode == "absolute":
            self._move_pointer_absolute(normalized_x, normalized_y)
            return

        with self._lock:
            if monotonic() < self._pointer_ignore_until:
                return
            current_x, current_y = self._cursor_position()

            if self._last_norm_x is None or self._last_norm_y is None:
                self._last_norm_x = normalized_x
                self._last_norm_y = normalized_y
                self._cursor_x = float(current_x)
                self._cursor_y = float(current_y)
                return

            delta_x = normalized_x - self._last_norm_x
            delta_y = normalized_y - self._last_norm_y
            self._last_norm_x = normalized_x
            self._last_norm_y = normalized_y

            # Recorta saltos anormales para evitar congelones al perder tracking brevemente.
            delta_x = min(max(delta_x, -self.max_delta), self.max_delta)
            delta_y = min(max(delta_y, -self.max_delta), self.max_delta)

            deadzone = self.deadzone
            if abs(delta_x) < deadzone:
                delta_x = 0
            if abs(delta_y) < deadzone:
                delta_y = 0
            if delta_x == 0 and delta_y == 0:
                return

            direction_x = -1 if self.invert_x else 1
            direction_y = -1 if self.invert_y else 1
            base_x = self._cursor_x if self._cursor_x is not None else float(current_x)
            base_y = self._cursor_y if self._cursor_y is not None else float(current_y)
            target_x = base_x + (delta_x * self.sensitivity * direction_x)
            target_y = base_y + (delta_y * self.sensitivity * direction_y)
            target_x = min(max(target_x, self._screen_left), self._screen_right)
            target_y = min(max(target_y, self._screen_top), self._screen_bottom)

            if self._cursor_x is None or self._cursor_y is None:
                self._cursor_x = float(current_x)
                self._cursor_y = float(current_y)
            else:
                movement = abs(delta_x) + abs(delta_y)
                adaptive_smoothing = self.smoothing
                if movement > 0.018:
                    adaptive_smoothing = min(self.smoothing + 0.1, 0.82)
                elif movement < 0.006:
                    adaptive_smoothing = max(self.smoothing - 0.08, 0.24)

                self._cursor_x = self._cursor_x + (target_x - self._cursor_x) * adaptive_smoothing
                self._cursor_y = self._cursor_y + (target_y - self._cursor_y) * adaptive_smoothing

            move_x = int(round(self._cursor_x))
            move_y = int(round(self._cursor_y))

        self._move_to(move_x, move_y)

    def _move_pointer_absolute(self, normalized_x: float, normalized_y: float) -> None:
        with self._lock:
            if monotonic() < self._pointer_ignore_until:
                return

            active_min_x = 0.18
            active_max_x = 0.82
            active_min_y = 0.16
            active_max_y = 0.84

            x = (normalized_x - active_min_x) / (active_max_x - active_min_x)
            y = (normalized_y - active_min_y) / (active_max_y - active_min_y)
            x = min(max(x, 0.0), 1.0)
            y = min(max(y, 0.0), 1.0)

            if self.invert_x:
                x = 1.0 - x
            if self.invert_y:
                y = 1.0 - y

            target_x = self._screen_left + (x * self._screen_width)
            target_y = self._screen_top + (y * self._screen_height)
            target_x = min(max(target_x, self._screen_left), self._screen_right)
            target_y = min(max(target_y, self._screen_top), self._screen_bottom)

            current_x, current_y = self._cursor_position()
            if self._cursor_x is None or self._cursor_y is None:
                self._cursor_x = float(current_x)
                self._cursor_y = float(current_y)

            adaptive_smoothing = min(max(self.smoothing + 0.12, 0.22), 0.88)
            self._cursor_x = self._cursor_x + (target_x - self._cursor_x) * adaptive_smoothing
            self._cursor_y = self._cursor_y + (target_y - self._cursor_y) * adaptive_smoothing
            self._last_norm_x = normalized_x
            self._last_norm_y = normalized_y
            move_x = int(round(self._cursor_x))
            move_y = int(round(self._cursor_y))

        self._move_to(move_x, move_y)

    def mouse_down(self) -> None:
        with self._lock:
            if self.dragging:
                return
            self.dragging = True
        pyautogui.mouseDown()

    def mouse_up(self) -> None:
        with self._lock:
            if not self.dragging:
                return
            self.dragging = False
        pyautogui.mouseUp()

    def click(self) -> None:
        pyautogui.click()

    def _map_to_screen(self, point: Point) -> tuple[float, float]:
        active_min_x = 0.18
        active_max_x = 0.82
        active_min_y = 0.16
        active_max_y = 0.84

        x = (point.x - active_min_x) / (active_max_x - active_min_x)
        y = (point.y - active_min_y) / (active_max_y - active_min_y)
        x = min(max(x, 0), 1)
        y = min(max(y, 0), 1)

        # Webcam preview behaves like a mirror for users, so invert horizontal motion.
        mapped_x = self._screen_left + ((1 - x) * self._screen_width)
        mapped_y = self._screen_top + (y * self._screen_height)
        return mapped_x, mapped_y

    def _screen_bounds(self) -> tuple[int, int, int, int]:
        # Windows multi-monitor: usa escritorio virtual para no limitarse al monitor principal.
        if hasattr(ctypes, "windll") and hasattr(ctypes.windll, "user32"):
            user32 = ctypes.windll.user32
            left = int(user32.GetSystemMetrics(76))   # SM_XVIRTUALSCREEN
            top = int(user32.GetSystemMetrics(77))    # SM_YVIRTUALSCREEN
            width = int(user32.GetSystemMetrics(78))  # SM_CXVIRTUALSCREEN
            height = int(user32.GetSystemMetrics(79)) # SM_CYVIRTUALSCREEN
            if width > 0 and height > 0:
                return left, top, width, height

        width, height = pyautogui.size()
        return 0, 0, int(width), int(height)

    def _cursor_position(self) -> tuple[int, int]:
        if hasattr(ctypes, "windll") and hasattr(ctypes.windll, "user32"):
            class POINT(ctypes.Structure):
                _fields_ = [("x", ctypes.c_long), ("y", ctypes.c_long)]

            point = POINT()
            if ctypes.windll.user32.GetCursorPos(ctypes.byref(point)):
                return int(point.x), int(point.y)
        pos = pyautogui.position()
        return int(pos.x), int(pos.y)

    def _move_to(self, x: int, y: int) -> None:
        if hasattr(ctypes, "windll") and hasattr(ctypes.windll, "user32"):
            ctypes.windll.user32.SetCursorPos(int(x), int(y))
            return
        pyautogui.moveTo(x, y, duration=0)


control_state = ControlState()
