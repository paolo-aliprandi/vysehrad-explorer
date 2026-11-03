import {
  createVisitorRoutes,
  visitorExit,
  visitorRouteClear,
  VisitorStroll,
} from './pedestrians';

it('routes visitors across walkable castle paths and out through the actual Táborská arch', () => {
  const routes = createVisitorRoutes(() => 0.37);
  expect(routes).toHaveLength(6);
  const points = routes.flat();
  expect(Math.min(...points.map(([x]) => x))).toBeLessThan(-200);
  expect(Math.max(...points.map(([x]) => x))).toBeGreaterThan(150);
  expect(Math.min(...points.map(([, z]) => z))).toBeLessThan(-50);
  for (const route of routes) {
    expect(route.at(-1)).toEqual(visitorExit.point);
    expect(route.at(-2)).toEqual(visitorExit.center);
    for (let i = 1; i < route.length; i++)
      expect(visitorRouteClear(route[i - 1], route[i])).toBe(true);
    const last = route.at(-1);
    if (!last) throw new Error('Empty visitor itinerary.');
    const v =
      -(last[0] - visitorExit.center[0]) * visitorExit.axis[1] +
      (last[1] - visitorExit.center[1]) * visitorExit.axis[0];
    expect(v).toBeLessThan(-visitorExit.depth / 2);
  }
});

it('keeps visitors visible until the exit and retires them exactly when they finish crossing it', () => {
  const stroll = new VisitorStroll([
    [0, 0],
    [3, 0],
    [3, 4],
  ]);
  stroll.update(6.9, 1);
  expect(stroll.departed).toBe(false);
  expect(stroll.point[1]).toBeCloseTo(3.9);
  stroll.update(0.2, 1);
  expect(stroll.departed).toBe(true);
  expect(stroll.point).toEqual([3, 4]);
  stroll.update(20, 1);
  expect(stroll.point).toEqual([3, 4]);
  expect(stroll.distance).toBe(7);
});
