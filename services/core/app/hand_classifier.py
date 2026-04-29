from dataclasses import dataclass

from .models import GestureName


@dataclass(frozen=True)
class Point:
    x: float
    y: float


FINGER_TIPS = {
    "thumb": 4,
    "index": 8,
    "middle": 12,
    "ring": 16,
    "pinky": 20,
}

FINGER_PIPS = {
    "index": 6,
    "middle": 10,
    "ring": 14,
    "pinky": 18,
}


def classify_hand(landmarks: list[Point]) -> tuple[GestureName, float]:
    if len(landmarks) < 21:
        return GestureName.UNKNOWN, 0

    fingers = _extended_fingers(landmarks)
    extended_count = sum(fingers.values())

    if extended_count >= 4:
        return GestureName.OPEN_PALM, 0.9

    if extended_count == 0:
        return GestureName.FIST, 0.88

    if fingers["thumb"] and not any(fingers[name] for name in ["index", "middle", "ring", "pinky"]):
        return GestureName.THUMB_UP, 0.84

    if fingers["index"] and not any(fingers[name] for name in ["middle", "ring", "pinky"]):
        return GestureName.POINT, 0.86

    if fingers["index"] and fingers["middle"] and not fingers["ring"] and not fingers["pinky"]:
        return GestureName.VICTORY, 0.87

    return GestureName.UNKNOWN, 0.35


def _extended_fingers(landmarks: list[Point]) -> dict[str, bool]:
    fingers = {
        name: landmarks[FINGER_TIPS[name]].y < landmarks[FINGER_PIPS[name]].y
        for name in ["index", "middle", "ring", "pinky"]
    }

    wrist = landmarks[0]
    thumb_tip = landmarks[FINGER_TIPS["thumb"]]
    thumb_ip = landmarks[3]
    fingers["thumb"] = abs(thumb_tip.x - wrist.x) > abs(thumb_ip.x - wrist.x)

    return fingers

