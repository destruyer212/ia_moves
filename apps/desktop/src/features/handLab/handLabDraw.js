import { HAND_CONNECTIONS } from "./handLabUtils";

const FINGERTIPS = [4, 8, 12, 16, 20];

function drawReferenceHand(ctx, width, height, hand, gesture, mouseEnabled, accentIndex = 0) {
  ctx.save();
  ctx.lineWidth = 1.25;
  ctx.strokeStyle = "rgba(255, 255, 255, 0.42)";
  ctx.shadowBlur = 4;
  ctx.shadowColor = "rgba(255, 255, 255, 0.35)";

  HAND_CONNECTIONS.forEach(([from, to]) => {
    ctx.beginPath();
    ctx.moveTo(hand[from].x * width, hand[from].y * height);
    ctx.lineTo(hand[to].x * width, hand[to].y * height);
    ctx.stroke();
  });
  ctx.restore();

  hand.forEach((point, index) => {
    if (!FINGERTIPS.includes(index) && index !== 0) return;
    const isIndex = index === 8;
    const isThumb = index === 4;
    const r = isIndex ? 11 : isThumb ? 9 : index === 0 ? 5 : 8;
    const px = point.x * width;
    const py = point.y * height;

    ctx.save();
    ctx.beginPath();
    ctx.fillStyle = "rgba(255, 255, 255, 0.95)";
    ctx.shadowBlur = isIndex ? 20 : 14;
    ctx.shadowColor = isIndex ? "rgba(255, 160, 90, 0.95)" : "rgba(120, 250, 255, 0.8)";
    ctx.arc(px, py, r * 0.45, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = isIndex
      ? "rgba(255, 150, 70, 0.9)"
      : (accentIndex === 1 ? "rgba(160, 120, 255, 0.75)" : "rgba(0, 245, 220, 0.75)");
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(px, py, r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  });

  if (mouseEnabled && accentIndex === 0) {
    const thumb = hand[4];
    const index = hand[8];
    const pinchDistance = Math.hypot(thumb.x - index.x, thumb.y - index.y);
    const pinching = pinchDistance < 0.075;
    ctx.save();
    ctx.lineWidth = 2;
    ctx.strokeStyle = pinching ? "rgba(69, 255, 177, 0.9)" : "rgba(255,255,255,0.35)";
    ctx.shadowBlur = pinching ? 10 : 0;
    ctx.beginPath();
    ctx.moveTo(thumb.x * width, thumb.y * height);
    ctx.lineTo(index.x * width, index.y * height);
    ctx.stroke();
    ctx.restore();
  }

}

export function drawHandTrackingOverlay(
  ctx,
  width,
  height,
  {
    hand,
    hands,
    gesture,
    mouseEnabled,
    mouseAssist,
    pointerReacquireRadius,
  },
) {
  ctx.clearRect(0, 0, width, height);

  if (mouseEnabled) {
    const centerX = width * 0.5;
    const centerY = height * 0.5;
    const radius = Math.min(width, height) * pointerReacquireRadius;
    ctx.save();
    ctx.beginPath();
    ctx.lineWidth = 1.5;
    ctx.setLineDash([8, 12]);
    ctx.strokeStyle = mouseAssist.armed ? "rgba(69, 255, 177, 0.4)" : "rgba(255, 200, 87, 0.55)";
    ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
  }

  const handList = hands?.length ? hands.slice(0, 2) : hand ? [hand] : [];

  if (!handList.length) {
    return;
  }

  handList.forEach((h, i) => drawReferenceHand(ctx, width, height, h, gesture, mouseEnabled, i));
}
