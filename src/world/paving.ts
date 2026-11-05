import * as THREE from 'three';
import type { MultiPolygon, Polygon, Pair } from 'polygon-clipping';
import { polygonBoolean } from './polygons';
import {
  casemateEntrance,
  casemateUphillExit,
  courtBankBoundary,
  featureElevation,
  features,
  center,
  inside,
  pathWidth,
  projectRoute,
  rampartTerrace,
  onExposedRampartBank,
  upperPromenade,
  stairFlights,
  stairwellFootprint,
  retainedStreetCorridors,
  retainedStreetSurfaceElevation,
  rotundaStreet,
  aveMariaCourtCuts,
  aveMariaFrontage,
  karlachBorderBeds,
  buildings,
  meters,
  retainedStreetWalls,
  wallThickness,
  type Feature,
  type Point,
} from './geo';
import { drapedPolygon, ribbonEdges, samplePolyline } from './surfaces';
import { leopoldSidewalks } from './reference-details';

type PavingKind = 'cobble' | 'gravel';
export type PavingSurface = {
  feature: Feature;
  polygons: MultiPolygon;
  style: { kind: PavingKind; color: string };
};
export const upperPromenadePaving: Feature = {
  id: -51700613,
  points: upperPromenade,
  holes: [],
  tags: { highway: 'footway', surface: 'compacted', bridge: 'yes', width: '3' },
};

const parks = features.filter(
  (feature) =>
    ['park', 'garden'].includes(feature.tags.leisure ?? '') ||
    feature.tags.landuse === 'grass',
);
const isSidewalk = (feature: Feature) =>
  feature.tags.footway === 'sidewalk' ||
  [494921210, 494921219, 542667857].includes(feature.id);
const streetKinds = new Set([
  'pedestrian',
  'tertiary',
  'secondary',
  'residential',
  'living_street',
  'service',
]);
const streetRoadIds = new Set([
  4646722, 587280816, 5016653, 494921190, 370193785,
]);
const streetWallFootprints: MultiPolygon = retainedStreetWalls.flatMap(
  (wall) => {
    const edges = ribbonEdges(wall.points, (point) =>
      wallThickness(wall, point),
    );
    return edges
      .slice(1)
      .map(
        (edge, i): Polygon => [
          [
            [...edges[i].left],
            [...edge.left],
            [...edge.right],
            [...edges[i].right],
            [...edges[i].left],
          ],
        ],
      );
  },
);

function streetBuildings(feature: Feature) {
  return buildings.filter(
    (building) =>
      building.tags.historic !== 'city_gate' &&
      !meters(building.tags.min_height, 0) &&
      projectRoute(center(building.points), feature.points).distance < 22,
  );
}

export function pavingStyle(feature: Feature): PavingSurface['style'] {
  if (isSidewalk(feature)) return { kind: 'cobble', color: '#b2b5ae' };
  if (
    [
      370193790, 494921186, 255297801, 163474148, 163474150, 784512319,
      784512324, 255297764, 255297771, 698001342, 1303802775, 33879791,
      542561031, 542561044, 255297803, 542561034, 26454854,
    ].includes(feature.id) ||
    (['footway', 'path'].includes(feature.tags.highway ?? '') &&
      feature.tags.area !== 'yes' &&
      (feature.points.some((point) => inside(point, courtBankBoundary)) ||
        parks.some((park) => inside(center(feature.points), park.points)))) ||
    [
      'unpaved',
      'compacted',
      'fine_gravel',
      'gravel',
      'ground',
      'dirt',
      'sand',
      'pebblestone',
    ].includes(feature.tags.surface ?? '') ||
    (['path', 'track'].includes(feature.tags.highway ?? '') &&
      !feature.tags.surface) ||
    (feature.tags.highway === 'footway' &&
      projectRoute(casemateEntrance.point, feature.points).distance < 1)
  )
    return { kind: 'gravel', color: '#b7ac93' };
  return { kind: 'cobble', color: '#b2b5ae' };
}

function clearance(
  feature: Feature,
  point: Point,
  center: Point,
  centerHeight = featureElevation(feature, center),
) {
  if (feature.tags.highway === 'steps' || feature.tags.area === 'yes')
    return Infinity;
  if (
    ['footway', 'path', 'track'].includes(feature.tags.highway ?? '') &&
    !isSidewalk(feature) &&
    !feature.tags.tunnel &&
    !feature.tags.bridge &&
    onExposedRampartBank(point)
  )
    return -Infinity;
  const height = featureElevation(feature, point);
  const crossfall = streetKinds.has(feature.tags.highway ?? '') ? 0.08 : 0.3;
  let margin =
    0.16 +
    Math.hypot(point[0] - center[0], point[1] - center[1]) * crossfall -
    Math.abs(height - centerHeight);
  if (!feature.tags.tunnel && !feature.tags.bridge) {
    const terrace = rampartTerrace(point);
    if (terrace && height > terrace.level - 1.3) {
      const boundary = projectRoute(point, courtBankBoundary).distance;
      margin = Math.min(
        margin,
        inside(point, courtBankBoundary) ? boundary - 1.3 : -boundary - 1.3,
      );
    }
  }
  return margin;
}

function boundedEdge(
  feature: Feature,
  center: Point,
  edge: Point,
  centerHeight = featureElevation(feature, center),
): Point {
  const length = Math.hypot(edge[0] - center[0], edge[1] - center[1]);
  const at = (distance: number): Point => [
    center[0] + ((edge[0] - center[0]) * distance) / length,
    center[1] + ((edge[1] - center[1]) * distance) / length,
  ];
  if (length < 1e-8) return center;
  if (
    clearance(feature, edge, center, centerHeight) >= 0 &&
    clearance(feature, at(length / 2), center, centerHeight) >= 0
  )
    return edge;
  let previous = 0;
  for (
    let distance = Math.min(0.4, length);
    ;
    distance = Math.min(distance + 0.4, length)
  ) {
    const point = at(distance);
    if (clearance(feature, point, center, centerHeight) < 0) {
      let low = previous,
        high = distance;
      for (let i = 0; i < 8; i++) {
        const middle = (low + high) / 2;
        if (clearance(feature, at(middle), center, centerHeight) >= 0)
          low = middle;
        else high = middle;
      }
      return at(low);
    }
    if (distance === length) return edge;
    previous = distance;
  }
}

export function pavingFootprint(feature: Feature): MultiPolygon {
  const width =
    feature.id === rotundaStreet.feature.id
      ? rotundaStreet.width
      : pathWidth(feature);
  if (feature.points.length < 2) return [];
  const corridor = retainedStreetCorridors.find(
    (corridor) => corridor.feature.id === feature.id,
  );
  if (corridor) return [[corridor.polygon.map(([x, z]) => [x, z])]];
  if (feature.id === rotundaStreet.feature.id)
    return [[rotundaStreet.pavingPolygon.map(([x, z]) => [x, z])]];
  if (feature.tags.area === 'yes') {
    return [
      [
        feature.points.map(([x, z]): Pair => [x, z]),
        ...feature.holes.map((ring) => ring.map(([x, z]): Pair => [x, z])),
      ],
    ];
  }
  const points = samplePolyline(feature.points, 2);
  const edges = ribbonEdges(points, width).map((edge, i) => {
    const height = featureElevation(feature, points[i]);
    const valid = clearance(feature, points[i], points[i], height) >= 0;
    return {
      left: valid
        ? boundedEdge(feature, points[i], edge.left, height)
        : points[i],
      right: valid
        ? boundedEdge(feature, points[i], edge.right, height)
        : points[i],
      valid,
    };
  });
  const pieces: Polygon[] = [];
  for (let i = 1; i < points.length; i++) {
    const a = edges[i - 1],
      b = edges[i];
    if (!a.valid || !b.valid) continue;
    const length = Math.hypot(
      points[i][0] - points[i - 1][0],
      points[i][1] - points[i - 1][1],
    );
    if (
      feature.tags.highway !== 'steps' &&
      Math.abs(
        featureElevation(feature, points[i]) -
          featureElevation(feature, points[i - 1]),
      ) /
        length >
        0.45
    )
      continue;
    if (
      Math.hypot(a.left[0] - a.right[0], a.left[1] - a.right[1]) < 0.7 ||
      Math.hypot(b.left[0] - b.right[0], b.left[1] - b.right[1]) < 0.7
    )
      continue;
    pieces.push([
      [[...a.left], [...b.left], [...b.right], [...a.right], [...a.left]],
    ]);
  }
  if (!pieces.length) return [];
  for (const endpoint of [0, points.length - 1]) {
    if (!edges[endpoint].valid) continue;
    const center = points[endpoint];
    const ring = Array.from(
      { length: 13 },
      (_, i): Point => [
        center[0] + (Math.cos((i * Math.PI) / 6) * width) / 2,
        center[1] + (Math.sin((i * Math.PI) / 6) * width) / 2,
      ],
    );
    if (ring.every((point) => clearance(feature, point, center) >= 0))
      pieces.push([ring.map(([x, z]) => [x, z])]);
  }
  let polygons = polygonBoolean('union', pieces);
  if (feature.id === 494921219)
    polygons = polygonBoolean('difference', polygons, [
      [stairwellFootprint.map(([x, z]): Pair => [x, z])],
    ]);
  return polygons;
}

const cellSize = 24;
function cells(polygons: MultiPolygon) {
  const points = polygons.flat(2);
  if (!points.length) return [];
  const xs = points.map((p) => p[0]),
    zs = points.map((p) => p[1]),
    keys: string[] = [];
  for (
    let x = Math.floor(Math.min(...xs) / cellSize);
    x <= Math.floor(Math.max(...xs) / cellSize);
    x++
  )
    for (
      let z = Math.floor(Math.min(...zs) / cellSize);
      z <= Math.floor(Math.max(...zs) / cellSize);
      z++
    )
      keys.push(`${x},${z}`);
  return keys;
}
function priority(feature: Feature) {
  return feature.tags.area === 'yes'
    ? 90
    : pavingStyle(feature).kind === 'gravel' ||
        ['footway', 'path', 'steps', 'track', 'cycleway'].includes(
          feature.tags.highway ?? '',
        )
      ? 10
      : 50;
}

function streetSidewalks(features: readonly Feature[]) {
  const index = new Map<string, Feature[]>();
  const additions = new Map<number, Polygon[]>();
  const cutouts = new Set<number>();
  for (const feature of features) {
    if (
      !streetKinds.has(feature.tags.highway ?? '') ||
      feature.tags.area === 'yes'
    )
      continue;
    for (const key of cells([[feature.points.map(([x, z]) => [x, z])]])) {
      const entries = index.get(key) ?? [];
      entries.push(feature);
      index.set(key, entries);
    }
  }
  for (const sidewalk of features.filter(isSidewalk)) {
    const points = samplePolyline(sidewalk.points, 2);
    const edges = ribbonEdges(points, pathWidth(sidewalk));
    const connections = points.map((point, i) => {
      const before = points[Math.max(0, i - 1)];
      const after = points[Math.min(points.length - 1, i + 1)];
      const length = Math.hypot(after[0] - before[0], after[1] - before[1]);
      if (!length) return undefined;
      const candidates = new Set<Feature>();
      const x = Math.floor(point[0] / cellSize);
      const z = Math.floor(point[1] / cellSize);
      for (let dx = -1; dx <= 1; dx++)
        for (let dz = -1; dz <= 1; dz++)
          for (const road of index.get(`${x + dx},${z + dz}`) ?? [])
            candidates.add(road);
      const nearest = [...candidates]
        .map((road) => ({ road, projection: projectRoute(point, road.points) }))
        .filter(
          ({ road, projection }) =>
            projection.distance < 9 &&
            Math.abs(
              ((after[0] - before[0]) * projection.normal[0] +
                (after[1] - before[1]) * projection.normal[1]) /
                length,
            ) < 0.35 &&
            Math.abs(
              featureElevation(road, point) - featureElevation(sidewalk, point),
            ) < 0.15,
        )
        .sort((a, b) => a.projection.distance - b.projection.distance)[0];
      if (!nearest) return undefined;
      const { road, projection } = nearest;
      if (clearance(road, projection.point, projection.point) < 0)
        return undefined;
      const edge = [edges[i].left, edges[i].right].sort(
        (a, b) =>
          Math.hypot(b[0] - projection.point[0], b[1] - projection.point[1]) -
          Math.hypot(a[0] - projection.point[0], a[1] - projection.point[1]),
      )[0];
      return {
        road,
        point: projection.point,
        edge: boundedEdge(road, projection.point, edge),
      };
    });
    for (let i = 1; i < connections.length; i++) {
      const a = connections[i - 1],
        b = connections[i];
      if (!a || !b || a.road.id !== b.road.id) continue;
      const pieces = additions.get(a.road.id) ?? [];
      pieces.push([
        [a.point, b.point, b.edge, a.edge, a.point].map(
          ([x, z]): Pair => [x, z],
        ),
      ]);
      additions.set(a.road.id, pieces);
      if (sidewalk.id === 494921219) cutouts.add(a.road.id);
    }
  }
  return { additions, cutouts };
}

export function pavingSurfaces(features: readonly Feature[]): PavingSurface[] {
  const surfaces: PavingSurface[] = [];
  const index = new Map<string, PavingSurface[]>();
  const { additions, cutouts } = streetSidewalks(features);
  const ordered = features
    .filter(
      (feature) =>
        feature.id !== casemateUphillExit.stairs.id &&
        !stairFlights.some((flight) => flight.feature.id === feature.id),
    )
    .sort(
      (a, b) =>
        priority(b) - priority(a) || pathWidth(b) - pathWidth(a) || a.id - b.id,
    );
  for (const feature of ordered) {
    let full = pavingFootprint(feature);
    if (leopoldSidewalks.streets.some((street) => street.id === feature.id))
      full = polygonBoolean(
        'union',
        full,
        leopoldSidewalks.runs.flatMap((run) =>
          run.roads
            .filter((road) => road.street.id === feature.id)
            .map((road): Polygon => [road.polygon.map(([x, z]) => [x, z])]),
        ),
      );
    const sidewalks = retainedStreetCorridors.some(
      (corridor) => corridor.feature.id === feature.id,
    )
      ? undefined
      : additions.get(feature.id);
    if (sidewalks?.length) full = polygonBoolean('union', full, sidewalks);
    if (feature.points.some(([x, z]) => x > -120 && x < 20 && z > 20 && z < 60))
      full = polygonBoolean('difference', full, karlachBorderBeds);
    if (projectRoute(aveMariaFrontage.point, feature.points).distance < 20)
      full = polygonBoolean(
        'difference',
        full,
        aveMariaCourtCuts.map((cut) => [cut.map(([x, z]): Pair => [x, z])]),
      );
    if (cutouts.has(feature.id))
      full = polygonBoolean('difference', full, [
        [stairwellFootprint.map(([x, z]): Pair => [x, z])],
      ]);
    if (streetRoadIds.has(feature.id))
      full = polygonBoolean(
        'difference',
        full,
        streetBuildings(feature).map(
          (building): Polygon => [
            building.points.map(([x, z]) => [x, z]),
            ...building.holes.map((ring) => ring.map(([x, z]): Pair => [x, z])),
          ],
        ),
        streetWallFootprints,
      );
    const style = pavingStyle(feature);
    for (const key of cells(full)) {
      const [x, z] = key
        .split(',')
        .map(Number)
        .map((value) => value * cellSize);
      let polygons = polygonBoolean('intersection', full, [
        [
          [
            [x, z],
            [x + cellSize, z],
            [x + cellSize, z + cellSize],
            [x, z + cellSize],
            [x, z],
          ],
        ],
      ]);
      if (!polygons.length) continue;
      const entries = index.get(key) ?? [];
      for (const previous of entries) {
        const intersections = polygonBoolean(
          'intersection',
          polygons,
          previous.polygons,
        );
        const shared = intersections.filter((polygon) =>
          polygon
            .flat()
            .every(
              ([x, z]) =>
                Math.abs(
                  featureElevation(feature, [x, z]) -
                    featureElevation(previous.feature, [x, z]),
                ) < 0.15,
            ),
        );
        if (shared.length)
          polygons = polygonBoolean(
            'difference',
            polygons,
            ...(shared.length === intersections.length
              ? [previous.polygons]
              : [shared]),
          );
        if (!polygons.length) break;
      }
      if (!polygons.length) continue;
      const surface = { feature, polygons, style };
      surfaces.push(surface);
      entries.push(surface);
      index.set(key, entries);
    }
  }
  return surfaces;
}

export function pavingGeometry(surface: PavingSurface) {
  const { feature } = surface;
  const road = [...retainedStreetCorridors, rotundaStreet].find(
    (area) => area.feature.id === feature.id,
  );
  const vertices: number[] = [];
  for (const polygon of surface.polygons) {
    const rings = polygon.map((ring) => ring.map(([x, z]): Point => [x, z]));
    const source = drapedPolygon(
      rings[0],
      0.055,
      road
        ? (x, z) => retainedStreetSurfaceElevation(road, [x, z])
        : (x, z) => featureElevation(feature, [x, z]),
      rings.slice(1),
      !!road,
      [494921190, 494921198, 494921210, 370193785].includes(feature.id),
    );
    const positions = source.attributes.position;
    const a = new THREE.Vector3(),
      b = new THREE.Vector3(),
      c = new THREE.Vector3();
    const ab = new THREE.Vector3(),
      ac = new THREE.Vector3(),
      normal = new THREE.Vector3();
    for (let i = 0; i < positions.count; i += 3) {
      a.fromBufferAttribute(positions, i);
      b.fromBufferAttribute(positions, i + 1);
      c.fromBufferAttribute(positions, i + 2);
      normal.crossVectors(ab.subVectors(b, a), ac.subVectors(c, a));
      if (
        feature.tags.highway !== 'steps' &&
        Math.hypot(normal.x, normal.z) > Math.abs(normal.y) * 0.55
      )
        continue;
      for (const point of [a, b, c]) vertices.push(point.x, point.y, point.z);
    }
    source.dispose();
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(vertices, 3),
  );
  geometry.computeVertexNormals();
  return geometry;
}
