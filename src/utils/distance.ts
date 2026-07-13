export function euclideanDistance(x1: number, y1: number, x2: number, y2: number): number {
  const dx = x1 - x2;
  const dy = y1 - y2;
  return Math.sqrt(dx * dx + dy * dy);
}

/** Rounds to 5 decimal places to match the API's documented response precision. */
export function roundDistance(distance: number): number {
  return Math.round(distance * 1e5) / 1e5;
}
