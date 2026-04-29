from threading import Event, Lock, Thread
from time import sleep, time

import cv2
import mediapipe as mp
from mediapipe.tasks.python.core.base_options import BaseOptions
from mediapipe.tasks.python.vision.core.vision_task_running_mode import VisionTaskRunningMode
from mediapipe.tasks.python.vision.hand_landmarker import HandLandmarker, HandLandmarkerOptions

from .control_state import control_state
from .gesture_engine import gesture_engine
from .hand_classifier import Point, classify_hand
from .models import GestureName, GestureState

MODEL_PATH = "models/hand_landmarker.task"
HAND_CONNECTIONS = [
    (0, 1),
    (1, 2),
    (2, 3),
    (3, 4),
    (0, 5),
    (5, 6),
    (6, 7),
    (7, 8),
    (5, 9),
    (9, 10),
    (10, 11),
    (11, 12),
    (9, 13),
    (13, 14),
    (14, 15),
    (15, 16),
    (13, 17),
    (17, 18),
    (18, 19),
    (19, 20),
    (0, 17),
]


class CameraService:
    def __init__(self) -> None:
        self._thread: Thread | None = None
        self._stop = Event()
        self._lock = Lock()
        self._running = False
        self._error: str | None = None
        self._camera_index = 0
        self._latest_jpeg: bytes | None = None
        self._last_points: list[Point] | None = None
        self._last_gesture = GestureName.UNKNOWN
        self._last_confidence = 0.0

    def status(self) -> dict[str, object]:
        with self._lock:
            return {
                "running": self._running,
                "camera_index": self._camera_index,
                "error": self._error,
            }

    def start(self, camera_index: int = 0) -> dict[str, object]:
        with self._lock:
            if self._running:
                return {
                    "running": self._running,
                    "camera_index": self._camera_index,
                    "error": self._error,
                }
            self._camera_index = camera_index
            self._error = None
            self._running = True
            self._stop.clear()
            self._thread = Thread(target=self._run, daemon=True)
            self._thread.start()

        sleep(0.4)
        return self.status()

    def stop(self) -> dict[str, object]:
        self._stop.set()
        if self._thread and self._thread.is_alive():
            self._thread.join(timeout=2)
        with self._lock:
            self._running = False
        return self.status()

    def latest_jpeg(self) -> bytes | None:
        with self._lock:
            return self._latest_jpeg

    def _run(self) -> None:
        options = HandLandmarkerOptions(
            base_options=BaseOptions(model_asset_path=MODEL_PATH),
            running_mode=VisionTaskRunningMode.VIDEO,
            num_hands=1,
            min_hand_detection_confidence=0.62,
            min_hand_presence_confidence=0.58,
            min_tracking_confidence=0.58,
        )
        capture = cv2.VideoCapture(self._camera_index, cv2.CAP_DSHOW)
        capture.set(cv2.CAP_PROP_FRAME_WIDTH, 640)
        capture.set(cv2.CAP_PROP_FRAME_HEIGHT, 360)
        capture.set(cv2.CAP_PROP_FPS, 30)
        capture.set(cv2.CAP_PROP_BUFFERSIZE, 1)

        if not capture.isOpened():
            with self._lock:
                self._error = "No pude abrir la camara."
                self._running = False
            return

        with self._lock:
            self._running = True

        try:
            with HandLandmarker.create_from_options(options) as landmarker:
                last_detection_at = 0.0
                while not self._stop.is_set():
                    ok, frame = capture.read()
                    if not ok:
                        self._set_unknown("No pude leer frame de camara.")
                        sleep(0.1)
                        continue

                    now = time()
                    if now - last_detection_at >= 0.05:
                        last_detection_at = now
                        rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
                        image = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb)
                        timestamp_ms = int(now * 1000)
                        result = landmarker.detect_for_video(image, timestamp_ms)

                        if result.hand_landmarks:
                            hand = result.hand_landmarks[0]
                            points = [Point(landmark.x, landmark.y) for landmark in hand]
                            name, confidence = classify_hand(points)
                            self._last_points = points
                            self._last_gesture = name
                            self._last_confidence = confidence
                            control_state.update_from_hand(points, name, confidence)
                            gesture_engine.update(GestureState(name=name, confidence=confidence))
                        else:
                            self._last_points = None
                            self._last_gesture = GestureName.UNKNOWN
                            self._last_confidence = 0.1
                            control_state.on_hand_lost()
                            gesture_engine.update(GestureState(name=GestureName.UNKNOWN, confidence=0.1, active=False))

                    if self._last_points:
                        self._draw_hand_overlay(frame, self._last_points, self._last_gesture, self._last_confidence)
                    self._store_frame(frame, self._last_gesture, self._last_confidence)
                    sleep(0.008)
        except Exception as exc:
            self._set_unknown(f"Vision fallo: {exc}")
        finally:
            capture.release()
            with self._lock:
                self._running = False

    def _set_unknown(self, error: str) -> None:
        with self._lock:
            self._error = error
        gesture_engine.update(GestureState(name=GestureName.UNKNOWN, confidence=0, active=False))

    def _store_frame(self, frame, gesture: GestureName | None = None, confidence: float | None = None) -> None:
        preview = frame
        if gesture is not None and confidence is not None:
            label = f"{gesture.value} {int(confidence * 100)}%"
            cv2.putText(preview, label, (18, 34), cv2.FONT_HERSHEY_SIMPLEX, 0.8, (80, 255, 210), 2)
        ok, encoded = cv2.imencode(".jpg", preview, [int(cv2.IMWRITE_JPEG_QUALITY), 58])
        if ok:
            with self._lock:
                self._latest_jpeg = encoded.tobytes()

    def _draw_hand_overlay(self, frame, points: list[Point], gesture: GestureName, confidence: float) -> None:
        height, width = frame.shape[:2]
        pixel_points = [(int(point.x * width), int(point.y * height)) for point in points]

        for start, end in HAND_CONNECTIONS:
            cv2.line(frame, pixel_points[start], pixel_points[end], (35, 210, 255), 3)

        for index, point in enumerate(pixel_points):
            radius = 7 if index in [4, 8, 12, 16, 20] else 5
            color = (65, 255, 135) if index in [4, 8, 12, 16, 20] else (245, 190, 60)
            cv2.circle(frame, point, radius, color, -1)
            cv2.circle(frame, point, radius + 2, (255, 255, 255), 1)

        wrist = pixel_points[0]
        cv2.putText(
            frame,
            f"{gesture.value} {int(confidence * 100)}%",
            (max(wrist[0] - 20, 10), max(wrist[1] - 20, 30)),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.9,
            (80, 255, 210),
            2,
        )


def probe_cameras(max_index: int = 5) -> list[dict[str, object]]:
    cameras = []
    for index in range(max_index):
        capture = cv2.VideoCapture(index, cv2.CAP_DSHOW)
        available = capture.isOpened()
        has_frame = False
        if available:
            has_frame, _ = capture.read()
        capture.release()
        cameras.append({"index": index, "available": available, "has_frame": has_frame})
    return cameras


camera_service = CameraService()
