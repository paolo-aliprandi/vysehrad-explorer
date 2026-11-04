import {
  createVisitorRoutes,
  visitorExit,
  visitorRouteClear,
  VisitorStroll,
  visitorShopStops,
  shopStops,
  gardenVisitorRoute,
} from './pedestrians';

it('routes visitors across walkable castle paths and out through the actual Táborská arch', () => {
  const routes = createVisitorRoutes(() => 0.37);
  expect(routes).toHaveLength(6);
  const points = routes.flat();
  expect(Math.min(...points.map(([x]) => x))).toBeLessThan(-200);
  expect(Math.max(...points.map(([x]) => x))).toBeGreaterThan(150);
  expect(Math.min(...points.map(([, z]) => z))).toBeLessThan(-50);
  for (const route of routes) {
    expect(visitorShopStops(route).size).toBeGreaterThan(0);
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
  for (const shop of shopStops)
    expect(
      routes.some((route) => route.some((point) => point === shop.point)),
    ).toBe(true);
});

it('waits at a shop, faces its window, then continues without walking during the stop', () => {
  const stroll = new VisitorStroll(
    [
      [0, 0],
      [2, 0],
      [4, 0],
    ],
    new Map([[1, { duration: 7, heading: -1 }]]),
  );
  stroll.update(3, 1);
  expect(stroll.point).toEqual([2, 0]);
  expect(stroll.waiting).toBe(6);
  expect(stroll.heading).toBe(-1);
  stroll.update(5, 1);
  expect(stroll.distance).toBe(2);
  stroll.update(2, 1);
  expect(stroll.point).toEqual([3, 0]);
  expect(stroll.waiting).toBe(0);
});

it('keeps garden strolls walkable and circulating rather than permanently retiring their visitors', () => {
  const route = gardenVisitorRoute();
  for (let i = 1; i < route.length; i++)
    expect(visitorRouteClear(route[i - 1], route[i])).toBe(true);
  const stroll = new VisitorStroll(route, new Map(), true);
  stroll.update(300, 1);
  expect(stroll.departed).toBe(false);
  expect(stroll.distance).toBeCloseTo(300);
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
