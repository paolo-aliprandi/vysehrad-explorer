import { describe, expect, it } from 'vitest';
import { treeCrownGeometry, treeTrunkGeometry } from './trees';

describe('branching painterly trees', () => {
  it('keeps the existing root anchor while branching above walking headroom', () => {
    const geometry = treeTrunkGeometry();
    const positions = geometry.attributes.position;
    const outsideTrunk: number[] = [];
    for (let i = 0; i < positions.count; i++) {
      const x = positions.getX(i),
        y = positions.getY(i),
        z = positions.getZ(i);
      expect([x, y, z].every(Number.isFinite)).toBe(true);
      if (Math.hypot(x, z) > 0.5) outsideTrunk.push(y + 4.75);
    }
    geometry.computeBoundingBox();
    expect(geometry.boundingBox?.min.y).toBeCloseTo(-4.75);
    expect(outsideTrunk.length).toBeGreaterThan(0);
    expect(Math.min(...outsideTrunk)).toBeGreaterThan(2.2);
    geometry.dispose();
  });

  it.each([false, true])(
    'keeps deformed canopies watertight without split shading seams (evergreen=%s)',
    (evergreen) => {
      const geometry = treeCrownGeometry(evergreen);
      const positions = geometry.attributes.position;
      for (let i = 0; i < positions.count; i++) {
        const point = [positions.getX(i), positions.getY(i), positions.getZ(i)];
        expect(point.every(Number.isFinite)).toBe(true);
      }
      const edges = new Map<string, number>();
      const index = geometry.getIndex();
      expect(index).not.toBeNull();
      if (!index) throw new Error('Canopy has no connected triangles.');
      for (let i = 0; i < index.count; i += 3) {
        const triangle = [index.getX(i), index.getX(i + 1), index.getX(i + 2)];
        for (let j = 0; j < 3; j++) {
          const a = triangle[j],
            b = triangle[(j + 1) % 3];
          const key = `${Math.min(a, b)}:${Math.max(a, b)}`;
          edges.set(key, (edges.get(key) ?? 0) + 1);
        }
      }
      expect([...edges.values()].every((count) => count === 2)).toBe(true);
      geometry.dispose();
    },
  );
});
