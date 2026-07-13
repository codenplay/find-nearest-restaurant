const COORDINATE_PATTERN = /^x=(\d+(?:\.\d+)?),y=(\d+(?:\.\d+)?)$/;

export function formatCoordinates(x: number, y: number): string {
  return `x=${x},y=${y}`;
}

export function parseCoordinates(value: string): { x: number; y: number } {
  const match = COORDINATE_PATTERN.exec(value.trim());
  if (!match) {
    throw new Error(
      `Invalid coordinates string: "${value}". Expected format "x=<number>,y=<number>".`,
    );
  }
  const [, xRaw, yRaw] = match;
  return { x: Number(xRaw), y: Number(yRaw) };
}
