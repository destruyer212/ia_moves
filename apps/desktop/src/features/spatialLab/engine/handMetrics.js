const FINGERTIPS = [4, 8, 12, 16, 20];

export function measureHandScale(hand) {
  if (!hand?.length) return 0;
  const w = hand[0];
  let sum = 0;
  for (const i of FINGERTIPS) {
    sum += Math.hypot(hand[i].x - w.x, hand[i].y - w.y);
  }
  const spread = sum / FINGERTIPS.length;
  const z = hand[9]?.z ?? 0;
  return spread * (1 - z * 0.35);
}
