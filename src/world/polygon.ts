import type { Point } from './geo';

type Edge = readonly [number, number, number, number];
type PolygonIndex = {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  step: number;
  rows: Edge[][];
};
const indexes = new WeakMap<readonly Point[], PolygonIndex>();

export function indexPolygon(polygon: readonly Point[]) {
  if (indexes.has(polygon) || polygon.length < 3) return;
  let minX = Infinity,
    maxX = -Infinity,
    minZ = Infinity,
    maxZ = -Infinity;
  for (const point of polygon) {
    minX = Math.min(minX, point[0]);
    maxX = Math.max(maxX, point[0]);
    minZ = Math.min(minZ, point[1]);
    maxZ = Math.max(maxZ, point[1]);
    Object.freeze(point);
  }
  Object.freeze(polygon);
  const count = Math.min(64, Math.max(1, Math.ceil(Math.sqrt(polygon.length))));
  const rows: Edge[][] = Array.from({ length: count }, () => []);
  const step = (maxZ - minZ) / count || 1;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [x, z] = polygon[i],
      [previousX, previousZ] = polygon[j];
    if (z === previousZ) continue;
    const edge: Edge = [x, z, previousX, previousZ];
    const start = Math.max(
      0,
      Math.floor((Math.min(z, previousZ) - minZ) / step),
    );
    const end = Math.min(
      count - 1,
      Math.floor((Math.max(z, previousZ) - minZ) / step),
    );
    for (let row = start; row <= end; row++) rows[row].push(edge);
  }
  indexes.set(polygon, { minX, maxX, minZ, maxZ, step, rows });
}

export function inside(point: Point, polygon: readonly Point[]): boolean {
  const index = indexes.get(polygon);
  let result = false;
  if (index) {
    const [x, z] = point;
    if (!Number.isFinite(x) || !Number.isFinite(z)) return false;
    if (x < index.minX || x > index.maxX || z < index.minZ || z >= index.maxZ)
      return false;
    const row =
      index.rows[
        Math.min(
          index.rows.length - 1,
          Math.floor((z - index.minZ) / index.step),
        )
      ];
    for (const [xi, zi, xj, zj] of row) {
      const aboveI = zi > z,
        aboveJ = zj > z;
      if (aboveI !== aboveJ && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi)
        result = !result;
    }
    return result;
  }
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [xi, zi] = polygon[i],
      [xj, zj] = polygon[j];
    const aboveI = zi > point[1],
      aboveJ = zj > point[1];
    if (
      aboveI !== aboveJ &&
      point[0] < ((xj - xi) * (point[1] - zi)) / (zj - zi) + xi
    )
      result = !result;
  }
  return result;
}
