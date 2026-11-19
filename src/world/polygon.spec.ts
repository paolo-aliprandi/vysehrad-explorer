import { inside, indexPolygon } from './polygon';
import type { Point } from './geo';

it('preserves concave, open and closed ring containment and boundary decisions after indexing', () => {
  const outline: Point[] = [
    [0, 0],
    [8, 0],
    [8, 8],
    [5, 8],
    [5, 3],
    [3, 3],
    [3, 8],
    [0, 8],
  ];
  for (const ring of [
    outline,
    [...outline, outline[0]],
    [...outline].reverse(),
  ]) {
    const probes = [-1, 0, 0.001, 2, 3, 4, 5, 7.999, 8, 9].flatMap((x) =>
      [-1, 0, 0.001, 2, 3, 4, 7.999, 8, 9].map((z) => [x, z] as Point),
    );
    const expected = probes.map((point) => inside(point, ring));
    const invalid: Point[] = [
      [NaN, 0],
      [0, NaN],
      [Infinity, 0],
      [0, -Infinity],
    ];
    const invalidExpected = invalid.map((point) => inside(point, ring));
    indexPolygon(ring);
    expect(invalid.map((point) => inside(point, ring))).toEqual(
      invalidExpected,
    );
    expect(probes.map((point) => inside(point, ring))).toEqual(expected);
    expect(inside([4, 6], ring)).toBe(false);
    expect(inside([2, 6], ring)).toBe(true);
  }
});

it('does not cache mutable construction rings or change their editable behavior', () => {
  const ring: Point[] = [
    [0, 0],
    [2, 0],
    [0, 2],
  ];
  expect(inside([3, 0.5], ring)).toBe(false);
  ring[1] = [8, 0];
  expect(inside([3, 0.5], ring)).toBe(true);
  expect(inside([0, 0], [])).toBe(false);
});
