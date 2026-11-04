import polygonClipping, {
  type MultiPolygon,
  type Pair,
} from 'polygon-clipping';

export function polygonBoolean(
  operation: 'union' | 'intersection' | 'difference',
  ...shapes: MultiPolygon[]
): MultiPolygon {
  // Shared millimetre coordinates keep coincident road and terrain cuts stable.
  const inputs = shapes.map((shape) =>
    shape.flatMap((polygon) => {
      const rings = polygon.map((ring) => {
        const points = ring
          .map(([x, z]): Pair => [Math.round(x * 1000), Math.round(z * 1000)])
          .filter(
            (point, i, points) =>
              i === 0 ||
              point[0] !== points[i - 1][0] ||
              point[1] !== points[i - 1][1],
          );
        if (
          points.length &&
          (points[0][0] !== points.at(-1)?.[0] ||
            points[0][1] !== points.at(-1)?.[1])
        )
          points.push([...points[0]]);
        const area = points
          .slice(1)
          .reduce(
            (sum, p, i) => sum + points[i][0] * p[1] - p[0] * points[i][1],
            0,
          );
        return points.length >= 4 && Math.abs(area) > 0.5 ? points : [];
      });
      return rings[0]?.length
        ? [[rings[0], ...rings.slice(1).filter((ring) => ring.length)]]
        : [];
    }),
  );
  if (
    !inputs[0]?.length ||
    (operation === 'intersection' && inputs.some((input) => !input.length))
  )
    return [];
  const clips = inputs.slice(1).filter((input) => input.length);
  return polygonClipping[operation](inputs[0], ...clips).map((polygon) =>
    polygon.map((ring) =>
      ring.map(([x, z]): Pair => [Math.round(x) / 1000, Math.round(z) / 1000]),
    ),
  );
}
