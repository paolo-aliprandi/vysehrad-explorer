import {
  blocked,
  gateBuildings,
  standingElevation,
  streetFrontages,
  streetFurniture,
  gardenBenchIds,
  type Point,
} from './geo';
import { explorationPaths as paths } from './landscape';
import { kioskSites } from './kiosks';

type Node = { point: Point; edges: Map<number, number> };
const distance = (a: Point, b: Point) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const gate = gateBuildings.find((item) => item.feature.id === 49811189);
if (!gate) throw new Error('Táborská Gate is missing from the visitor routes.');
export const visitorExit = {
  center: gate.center,
  axis: gate.axis,
  depth: gate.depth,
  point: [
    gate.center[0] + gate.axis[1] * (gate.depth / 2 + 0.6),
    gate.center[1] - gate.axis[0] * (gate.depth / 2 + 0.6),
  ] as Point,
};
export const shopStops = [
  ...streetFrontages.map((frontage) => ({
    name: frontage.name,
    access: [],
    point: [
      frontage.facade[0] + frontage.normal[0] * 2,
      frontage.facade[1] + frontage.normal[1] * 2,
    ] as Point,
    heading: Math.atan2(-frontage.normal[0], -frontage.normal[1]),
    duration: 7,
  })),
  ...kioskSites.map((site) => ({
    name: site.name,
    access: site.access,
    point: site.approach,
    heading: Math.atan2(-site.normal[0], -site.normal[1]),
    duration: 7,
  })),
];
export type VisitorStop = { heading: number; duration: number };
export function visitorShopStops(route: readonly Point[]) {
  const stops = new Map<number, VisitorStop>();
  route.forEach((point, index) => {
    const shop = shopStops.find((shop) => distance(shop.point, point) < 0.01);
    if (shop) stops.set(index, shop);
  });
  return stops;
}

export function kioskVisitorRoutes(routes: readonly (readonly Point[])[]) {
  return kioskSites.flatMap((site) => {
    const itinerary = routes.find((route) => route.includes(site.approach));
    if (!itinerary) throw new Error(`No visitors reach ${site.name}.`);
    const index = itinerary.indexOf(site.approach);
    return [-1, 1].map((direction) => {
      const branch: Point[] = [site.approach];
      let remaining = 14;
      for (
        let i = index + direction;
        i >= 0 && i < itinerary.length && remaining > 0;
        i += direction
      ) {
        const previous = branch[branch.length - 1],
          next = itinerary[i];
        const length = distance(previous, next);
        if (!length) continue;
        const t = Math.min(1, remaining / length);
        branch.push([
          previous[0] + (next[0] - previous[0]) * t,
          previous[1] + (next[1] - previous[1]) * t,
        ]);
        remaining -= length;
      }
      if (branch.length < 2)
        throw new Error(`No return route from ${site.name}.`);
      branch.reverse();
      return [...branch, ...branch.slice(0, -1).reverse()];
    });
  });
}

export function gardenVisitorRoute() {
  const points = gardenBenchIds.map((id) => {
    const bench = streetFurniture.find((site) => site.id === id);
    if (!bench) throw new Error(`Missing Na hradbách garden bench ${id}.`);
    return [
      bench.point[0] + Math.sin(bench.angle) * 1.5,
      bench.point[1] + Math.cos(bench.angle) * 1.5,
    ] as Point;
  });
  points.push(points[0]);
  for (let i = 1; i < points.length; i++)
    if (!visitorRouteClear(points[i - 1], points[i]))
      throw new Error('The Na hradbách garden stroll is obstructed.');
  return points;
}

const routeClearance = new Map<string, boolean>();
export function visitorRouteClear(a: Point, b: Point) {
  // Routes use immutable geographic collisions, not the moving crowd.
  const ends = [a.join(','), b.join(',')].sort();
  const key = ends.join('|');
  const cached = routeClearance.get(key);
  if (cached !== undefined) return cached;
  const clear = scanVisitorRoute(a, b);
  routeClearance.set(key, clear);
  return clear;
}

function scanVisitorRoute(a: Point, b: Point) {
  const steps = Math.max(1, Math.ceil(distance(a, b) / 0.6));
  let previous = standingElevation(a);
  for (let i = 0; i <= steps; i++) {
    const point: Point = [
      a[0] + ((b[0] - a[0]) * i) / steps,
      a[1] + ((b[1] - a[1]) * i) / steps,
    ];
    const height = standingElevation(point);
    if (blocked(point, height) || Math.abs(height - previous) > 0.8)
      return false;
    previous = height;
  }
  return true;
}

export function createVisitorRoutes(random = Math.random): Point[][] {
  const nodes: Node[] = [];
  const indices = new Map<string, number>();
  const node = (point: Point) => {
    const key = point.map((value) => value.toFixed(2)).join(',');
    const existing = indices.get(key);
    if (existing !== undefined) return existing;
    const index = nodes.length;
    indices.set(key, index);
    nodes.push({ point, edges: new Map() });
    return index;
  };
  const connect = (a: number, b: number) => {
    const length = distance(nodes[a].point, nodes[b].point);
    if (!length || !visitorRouteClear(nodes[a].point, nodes[b].point)) return;
    nodes[a].edges.set(b, length);
    nodes[b].edges.set(a, length);
  };
  const insideCastle = ([x, z]: Point) => {
    const v =
      -(x - visitorExit.center[0]) * visitorExit.axis[1] +
      (z - visitorExit.center[1]) * visitorExit.axis[0];
    return (
      x > -315 &&
      x < 280 &&
      z > -195 &&
      z < 325 &&
      (z < 275 || x > 180) &&
      (distance([x, z], visitorExit.center) > 35 || v >= -visitorExit.depth / 2)
    );
  };
  for (const path of paths) {
    if (path.tags.tunnel === 'yes') continue;
    for (let i = 1; i < path.points.length; i++) {
      const a = path.points[i - 1],
        b = path.points[i];
      if (insideCastle(a) && insideCastle(b)) connect(node(a), node(b));
    }
  }
  const pathNodeCount = nodes.length;
  const shopIndices = shopStops.map((shop) => {
    const target = node(shop.point);
    let entrance = target;
    for (const point of shop.access) {
      const next = node(point);
      connect(entrance, next);
      if (!nodes[entrance].edges.has(next))
        throw new Error(`${shop.name} has an obstructed garden approach.`);
      entrance = next;
    }
    const anchor = nodes[entrance].point;
    const approach = nodes
      .map((item, index) => ({
        index,
        distance: distance(item.point, anchor),
      }))
      .filter(
        (item) =>
          item.index !== entrance &&
          item.index < pathNodeCount &&
          item.distance < (shop.access.length ? 40 : 30) &&
          nodes[item.index].edges.size,
      )
      .sort((a, b) => a.distance - b.distance)
      .find((item) => visitorRouteClear(anchor, nodes[item.index].point));
    if (!approach)
      throw new Error(
        `${shop.name} at ${shop.point.join(',')} has no walkable visitor approach.`,
      );
    connect(entrance, approach.index);
    return target;
  });
  const inner: Point = [
    visitorExit.center[0] - visitorExit.axis[1] * (visitorExit.depth / 2 + 2),
    visitorExit.center[1] + visitorExit.axis[0] * (visitorExit.depth / 2 + 2),
  ];
  const innerIndex = node(inner),
    gateIndex = node(visitorExit.center),
    exit = node(visitorExit.point);
  const nearby = nodes
    .map((item, index) => ({ index, distance: distance(item.point, inner) }))
    .filter(
      (item) =>
        item.index !== innerIndex &&
        item.distance < 25 &&
        nodes[item.index].edges.size,
    )
    .sort((a, b) => a.distance - b.distance)
    .find((item) => visitorRouteClear(inner, nodes[item.index].point));
  if (!nearby) throw new Error('The castle paths do not reach Táborská Gate.');
  connect(innerIndex, nearby.index);
  connect(innerIndex, gateIndex);
  connect(gateIndex, exit);

  const routeCache = new Map<
    number,
    { costs: Map<number, number>; next: Map<number, number> }
  >();
  const routesTo = (target: number) => {
    const cached = routeCache.get(target);
    if (cached) return cached;
    const costs = new Map<number, number>([[target, 0]]);
    const next = new Map<number, number>();
    const pending = new Set<number>([target]);
    while (pending.size) {
      let current = -1,
        cheapest = Infinity;
      for (const index of pending) {
        const cost = costs.get(index);
        if (cost !== undefined && cost < cheapest) {
          current = index;
          cheapest = cost;
        }
      }
      if (current < 0)
        throw new Error('Visitor route search could not make progress.');
      pending.delete(current);
      for (const [neighbor, length] of nodes[current].edges) {
        const cost = cheapest + length;
        if (cost < (costs.get(neighbor) ?? Infinity)) {
          costs.set(neighbor, cost);
          next.set(neighbor, current);
          pending.add(neighbor);
        }
      }
    }
    const result = { costs, next };
    routeCache.set(target, result);
    return result;
  };
  const outbound = routesTo(exit);
  const candidates = [...outbound.costs.keys()].filter(
    (index) =>
      nodes[index].edges.size > 1 &&
      distance(nodes[index].point, visitorExit.center) > 40,
  );
  if (!candidates.length)
    throw new Error('There are no connected castle paths for visitors.');
  const nearest = (point: Point) =>
    candidates.reduce((best, index) =>
      distance(nodes[index].point, point) < distance(nodes[best].point, point)
        ? index
        : best,
    );
  const append = (
    route: Point[],
    start: number,
    target: number,
    next: Map<number, number>,
  ) => {
    let current = start;
    while (current !== target) {
      const successor = next.get(current);
      if (successor === undefined)
        throw new Error('A visitor itinerary is disconnected.');
      route.push(nodes[successor].point);
      current = successor;
    }
  };
  const starts: Point[] = [
    [-251, 37],
    [-130, -75],
    [-30, 48],
    [91, 83],
    [100, 160],
    [200, 240],
  ];
  return starts.map((point, index) => {
    let current = nearest(point);
    const route = [nodes[current].point];
    const shop = shopIndices[index % shopIndices.length];
    if (!outbound.costs.has(shop))
      throw new Error('A shop is disconnected from the castle visitor paths.');
    append(route, current, shop, routesTo(shop).next);
    current = shop;
    for (let stop = 0; stop < 2; stop++) {
      const currentPoint = nodes[current].point;
      const choices = candidates.filter(
        (index) => distance(nodes[index].point, currentPoint) > 45,
      );
      if (!choices.length)
        throw new Error('Visitor stroll destinations are unavailable.');
      const target = choices[Math.floor(random() * choices.length)];
      append(route, current, target, routesTo(target).next);
      current = target;
    }
    append(route, current, exit, outbound.next);
    return route;
  });
}

export class VisitorStroll {
  point: Point;
  heading = 0;
  distance = 0;
  departed = false;
  waiting = 0;
  private next = 1;
  constructor(
    readonly route: readonly Point[],
    readonly stops: ReadonlyMap<number, VisitorStop> = new Map(),
    readonly loop = false,
  ) {
    if (
      route.length < 2 ||
      !route.some((point) => distance(point, route[0]) > 0)
    )
      throw new Error('A visitor needs a route to the exit.');
    this.point = [...route[0]];
  }
  update(delta: number, speed: number) {
    let remaining = delta;
    if (speed <= 0) return;
    while (remaining > 0 && !this.departed) {
      if (this.waiting > 0) {
        const waited = Math.min(remaining, this.waiting);
        this.waiting -= waited;
        remaining -= waited;
        if (!remaining) return;
      }
      const target = this.route[this.next];
      const length = distance(this.point, target);
      this.heading = Math.atan2(
        target[0] - this.point[0],
        target[1] - this.point[1],
      );
      const travelled = remaining * speed;
      if (travelled < length) {
        this.point = [
          this.point[0] + ((target[0] - this.point[0]) * travelled) / length,
          this.point[1] + ((target[1] - this.point[1]) * travelled) / length,
        ];
        this.distance += travelled;
        return;
      }
      this.point = [...target];
      this.distance += length;
      remaining -= length / speed;
      const stop = this.stops.get(this.next);
      if (stop) {
        this.waiting = stop.duration;
        this.heading = stop.heading;
      }
      this.next++;
      if (this.next >= this.route.length) {
        if (this.loop) this.next = 1;
        else this.departed = true;
      }
    }
  }
}
