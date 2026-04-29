from itertools import cycle

from .models import GestureName, GestureState


class GestureEngine:
    def __init__(self) -> None:
        self._simulated_gestures = cycle(
            [
                GestureName.OPEN_PALM,
                GestureName.FIST,
                GestureName.POINT,
                GestureName.THUMB_UP,
                GestureName.VICTORY,
            ]
        )
        self._latest = GestureState(name=GestureName.UNKNOWN, confidence=0)

    def latest(self) -> GestureState:
        return self._latest

    def simulate_next(self) -> GestureState:
        self._latest = GestureState(name=next(self._simulated_gestures), confidence=0.92)
        return self._latest

    def update(self, gesture: GestureState) -> GestureState:
        self._latest = gesture
        return self._latest


gesture_engine = GestureEngine()

