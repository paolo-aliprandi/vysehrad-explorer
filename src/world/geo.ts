import dataset from '../data/world.json';
import terrain from '../data/terrain.json';
import polygonClipping, { type Pair, type Polygon } from 'polygon-clipping';

export type Point = readonly [number, number];
export type Feature = {
  id: number;
  points: Point[];
  tags: Record<string, string | undefined>;
  holes: Point[][];
};
export type Landmark = {
  id: string;
  title: string;
  short: string;
  subtitle: string;
  description: string;
  position: Point;
  view: Point;
};
export type Monument = {
  id: number;
  point: Point;
  tags: Feature['tags'];
};

const sourceFeatures: {
  id: number;
  points: number[][];
  holes: number[][][];
  tags: Record<string, string | undefined>;
}[] = dataset.features;
export const features: Feature[] = sourceFeatures.map((f) => ({
  ...f,
  points: f.points.map(([x, z]): Point => [x, z]),
  holes: f.holes.map((ring) => ring.map(([x, z]): Point => [x, z])),
}));
// OSM carries the deanery twice: its articulated outline and its roof footprint.
// Keep both surveyed rings, but model the latter as a part of the same building.
const deaneryOutline = features.find((feature) => feature.id === 49810437);
const deaneryRoof = features.find((feature) => feature.id === 502391574);
if (
  !deaneryOutline ||
  !deaneryRoof ||
  deaneryOutline.tags.name !== deaneryRoof.tags.name ||
  !inside(center(deaneryRoof.points), deaneryOutline.points)
)
  throw new Error(
    'The overlapping deanery outlines no longer describe one building.',
  );
deaneryRoof.tags = {
  ...deaneryRoof.tags,
  building: undefined,
  'building:part': 'yes',
  'building:levels': deaneryOutline.tags['building:levels'],
};
const aveMariaFeature = features.find((feature) => feature.id === -89545110);
const aveMariaRetaining = features.find((feature) => feature.id === 515345432);
if (!aveMariaFeature || !aveMariaRetaining)
  throw new Error(
    'The mapped Panna Marie Šancovská chapel or rear wall is missing.',
  );
aveMariaFeature.tags = {
  ...aveMariaFeature.tags,
  height: '5.2',
  'roof:height': '1.2',
  'roof:shape': 'gabled',
  'building:colour': '#e5e0cf',
};
export const exposedRocks = features.filter(
  (feature) => feature.tags.natural === 'bare_rock',
);
// Preserve the mapped street alignment while setting the gift shop and Špička remnant back from its shoulder.
const pevnostiSetbacks = new Map<number, Point>();
const setbackRoad = features.find((feature) => feature.id === 370193785);
if (!setbackRoad) throw new Error('The V Pevnosti frontage road is missing.');
for (const id of [55117756, 49811195, 49811196]) {
  const feature = features.find((feature) => feature.id === id);
  if (!feature)
    throw new Error(`The V Pevnosti roadside building ${id} is missing.`);
  const midpoint = center(feature.points);
  const projection = projectRoute(midpoint, setbackRoad.points);
  const dx = midpoint[0] - projection.point[0],
    dz = midpoint[1] - projection.point[1];
  const length = Math.hypot(dx, dz);
  if (length < 0.001)
    throw new Error(`Roadside building ${id} has no setback direction.`);
  const setback = id === 49811196 ? 10 - projection.distance : 2;
  const offset: Point = [(dx * setback) / length, (dz * setback) / length];
  pevnostiSetbacks.set(id, offset);
  feature.points = feature.points.map(
    ([x, z]): Point => [x + offset[0], z + offset[1]],
  );
  if (id === 49811195 || id === 49811196) {
    const frame = orientedBounds(feature.points);
    const axis: Point = [-dz / length, dx / length];
    const width = id === 49811195 ? 14.4 : 6;
    const halfDepth = id === 49811195 ? 3.2 : 2.5;
    feature.points = [
      [-1, -1],
      [1, -1],
      [1, 1],
      [-1, 1],
      [-1, -1],
    ].map(
      ([u, v]): Point => [
        frame.center[0] + (axis[0] * u * width) / 2 - axis[1] * v * halfDepth,
        frame.center[1] + (axis[1] * u * width) / 2 + axis[0] * v * halfDepth,
      ],
    );
    if (id === 49811195) feature.tags = { ...feature.tags, height: '4.6' };
  }
}
export function exposedRockAt(point: Point, margin = 0) {
  return exposedRocks.some(
    (rock) =>
      (inside(point, rock.points) &&
        !rock.holes.some((hole) => inside(point, hole))) ||
      (margin > 0 && projectRoute(point, rock.points).distance < margin),
  );
}
export const metadata = {
  ...dataset.meta,
  terrain:
    'Resampled ČÚZK DMR 5G elevation with foundation and rampart terrace grading',
};
export const terrainMetadata = terrain.meta;
export const mappedTrees: Point[] = dataset.trees.map(([x, z]) => [x, z]);
export const cemeteries = features.filter((f) => f.tags.landuse === 'cemetery');
export const bounds = { minX: -590, maxX: 600, minZ: -530, maxZ: 540 };
export const monuments: Monument[] = dataset.monuments.map((monument) => ({
  ...monument,
  point: [monument.point[0], monument.point[1]],
}));
const giftShopSetback = pevnostiSetbacks.get(55117756);
if (!giftShopSetback)
  throw new Error('The gift shop has no reconstructed setback.');
export const siteDetails: Monument[] = dataset.details.map((detail) => ({
  ...detail,
  point: [
    detail.point[0] + (detail.id === 693177442 ? giftShopSetback[0] : 0),
    detail.point[1] + (detail.id === 693177442 ? giftShopSetback[1] : 0),
  ],
}));
export const columnShrine = (() => {
  const shrine = monuments.find((monument) => monument.id === 660103145);
  if (!shrine) throw new Error('The mapped Vyšehrad column shrine is missing.');
  return shrine;
})();
const myslbekIds = new Set([1200812856, 1200812866, 1200812873, 1200812876]);
const modeledSculptureIds = new Set([
  ...myslbekIds,
  1200790218,
  1200790222,
  3573420654,
  3573420655,
  1751591206,
  4294837398,
  7016578061,
  12229297494,
]);
const portalNode = monuments.find((monument) => monument.id === 4429512305);
if (!portalNode) throw new Error('The mapped armory garden portal is missing.');
const gardenEntrance = dataset.gates
  .map(([x, z]): Point => [x, z])
  .sort(
    (a, b) =>
      Math.hypot(a[0] - portalNode.point[0], a[1] - portalNode.point[1]) -
      Math.hypot(b[0] - portalNode.point[0], b[1] - portalNode.point[1]),
  )[0];
const gardenBoundary = features.find((feature) => feature.id === 382869596);
if (
  !gardenEntrance ||
  Math.hypot(
    gardenEntrance[0] - portalNode.point[0],
    gardenEntrance[1] - portalNode.point[1],
  ) > 6 ||
  !gardenBoundary
)
  throw new Error('The existing church-to-garden entrance is missing.');
const boundaryStart = gardenBoundary.points[0];
const boundaryEnd = gardenBoundary.points[gardenBoundary.points.length - 1];
const boundaryLength = Math.hypot(
  boundaryEnd[0] - boundaryStart[0],
  boundaryEnd[1] - boundaryStart[1],
);
const gardenAxis: Point = [
  (boundaryEnd[0] - boundaryStart[0]) / boundaryLength,
  (boundaryEnd[1] - boundaryStart[1]) / boundaryLength,
];
export const gardenPortal: Feature = {
  id: portalNode.id,
  points: [
    [-3.4, -0.7],
    [3.4, -0.7],
    [3.4, 0.7],
    [-3.4, 0.7],
    [-3.4, -0.7],
  ].map(
    ([across, along]): Point => [
      gardenEntrance[0] + gardenAxis[0] * across - gardenAxis[1] * along,
      gardenEntrance[1] + gardenAxis[1] * across + gardenAxis[0] * along,
    ],
  ),
  tags: { ...portalNode.tags, historic: 'city_gate', height: '5.5' },
  holes: [],
};

export function center(points: readonly Point[]): Point {
  const ring =
    points.length > 1 &&
    points[0][0] === points.at(-1)?.[0] &&
    points[0][1] === points.at(-1)?.[1]
      ? points.slice(0, -1)
      : points;
  return [
    ring.reduce((sum, p) => sum + p[0], 0) / ring.length,
    ring.reduce((sum, p) => sum + p[1], 0) / ring.length,
  ];
}

export function inside(point: Point, polygon: readonly Point[]): boolean {
  let result = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [xi, zi] = polygon[i];
    const [xj, zj] = polygon[j];
    const aboveI = zi > point[1];
    const aboveJ = zj > point[1];
    const crosses = aboveI !== aboveJ;
    if (crosses && point[0] < ((xj - xi) * (point[1] - zi)) / (zj - zi) + xi)
      result = !result;
  }
  return result;
}

export function segmentDistance(p: Point, a: Point, b: Point): number {
  const dx = b[0] - a[0];
  const dz = b[1] - a[1];
  const lengthSquared = dx * dx + dz * dz;
  const t = lengthSquared
    ? Math.max(
        0,
        Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / lengthSquared),
      )
    : 0;
  return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dz);
}

function smooth(value: number) {
  const t = Math.max(0, Math.min(1, value));
  return t * t * (3 - 2 * t);
}

export function sampleGrid(
  grid: {
    width: number;
    height: number;
    values: readonly number[];
    minX: number;
    maxX: number;
    minZ: number;
    maxZ: number;
  },
  x: number,
  z: number,
): number {
  const u = Math.max(
    0,
    Math.min(
      grid.width - 1,
      ((x - grid.minX) / (grid.maxX - grid.minX)) * grid.width - 0.5,
    ),
  );
  const v = Math.max(
    0,
    Math.min(
      grid.height - 1,
      ((z - grid.minZ) / (grid.maxZ - grid.minZ)) * grid.height - 0.5,
    ),
  );
  const x0 = Math.floor(u),
    z0 = Math.floor(v);
  const x1 = Math.min(x0 + 1, grid.width - 1),
    z1 = Math.min(z0 + 1, grid.height - 1);
  const top =
    grid.values[z0 * grid.width + x0] * (1 - (u - x0)) +
    grid.values[z0 * grid.width + x1] * (u - x0);
  const bottom =
    grid.values[z1 * grid.width + x0] * (1 - (u - x0)) +
    grid.values[z1 * grid.width + x1] * (u - x0);
  return top * (1 - (v - z0)) + bottom * (v - z0);
}

export function rawElevation(x: number, z: number): number {
  return sampleGrid(terrain, x, z) - terrain.datum;
}

export function meters(tag: string | undefined, fallback: number): number {
  if (!tag || !/^\d+(\.\d+)?(\s*m)?$/.test(tag)) return fallback;
  const value = Number.parseFloat(tag);
  return Number.isFinite(value) && value > 0 && value < 250 ? value : fallback;
}

export const buildings = features.filter(
  (f) =>
    f.tags.building &&
    f.points.length >= 4 &&
    ![49810432, 364471135, 49810586, 51700617].includes(f.id),
);
export const parts = features.filter(
  (f) => f.tags['building:part'] && f.points.length >= 4,
);
export const cemeteryArcades = [
  {
    id: -4229100,
    rearWalls: [51668939, 380922814, 458296778],
    fronts: [
      [
        [-251.91, -55.34],
        [-247.16, -19.01],
      ],
      [
        [-247.16, -19.01],
        [-246.65, -13.63],
      ],
      [
        [-246.65, -13.63],
        [-250.98, -13.07],
      ],
      [
        [-251.2, -55.93],
        [-214.66, -52.31],
      ],
      [
        [-214.66, -52.31],
        [-209.57, -50.96],
      ],
      [
        [-209.57, -50.96],
        [-208.16, -56.45],
      ],
    ],
  },
  {
    id: -4229090,
    rearWalls: [51668944, 380940856, 380940858],
    fronts: [
      [
        [-199.59, -50.76],
        [-165.74, -47.33],
      ],
      [
        [-204.97, -50.63],
        [-199.59, -50.76],
      ],
      [
        [-205.29, -56.16],
        [-204.97, -50.63],
      ],
    ],
  },
  {
    id: -4226810,
    rearWalls: [51668942],
    fronts: [
      [
        [-159.86, -46.73],
        [-129.01, -43.67],
      ],
      [
        [-128.1, -42.71],
        [-126.2, -22.71],
      ],
    ],
  },
].map(({ id, rearWalls, fronts }) => {
  const feature = buildings.find((building) => building.id === id);
  if (!feature) throw new Error(`Missing mapped cemetery arcade ${id}.`);
  return {
    feature,
    rearWalls,
    fronts: fronts.map((front) => front.map(([x, z]): Point => [x, z])),
  };
});
export const cemeteryArcadeWallThickness = 0.45;
export const cemeteryArcadeWallIds = new Set(
  cemeteryArcades.flatMap((arcade) => arcade.rearWalls),
);
export const cemeteryArcadeBays = cemeteryArcades.flatMap((arcade) =>
  arcade.fronts.flatMap(([a, b]) => {
    const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const count = Math.max(1, Math.ceil(length / 3.7));
    const axis: Point = [(b[0] - a[0]) / length, (b[1] - a[1]) / length];
    return Array.from({ length: count }, (_, index) => ({
      feature: arcade.feature,
      axis,
      width: length / count,
      center: [
        a[0] + (axis[0] * length * (index + 0.5)) / count,
        a[1] + (axis[1] * length * (index + 0.5)) / count,
      ] as Point,
    }));
  }),
);
export const cemeteryArcadeColumns = cemeteryArcadeBays.flatMap((bay) =>
  [-1, 1].map(
    (side): Point => [
      bay.center[0] + ((bay.axis[0] * bay.width) / 2) * side,
      bay.center[1] + ((bay.axis[1] * bay.width) / 2) * side,
    ],
  ),
);
export function modelBuildingPart(feature: Feature): Feature {
  if (!feature.tags['building:part']) return feature;
  const parent = buildings.find((building) =>
    inside(center(feature.points), building.points),
  );
  if (!parent) return feature;
  return {
    ...feature,
    points: feature.points.map((point) => {
      let nearest = point;
      let distance = 0.5;
      for (let i = 1; i < parent.points.length; i++) {
        const a = parent.points[i - 1],
          b = parent.points[i];
        const dx = b[0] - a[0],
          dz = b[1] - a[1];
        const t = Math.max(
          0,
          Math.min(
            1,
            ((point[0] - a[0]) * dx + (point[1] - a[1]) * dz) /
              (dx * dx + dz * dz || 1),
          ),
        );
        const candidate: Point = [a[0] + t * dx, a[1] + t * dz];
        const separation = Math.hypot(
          point[0] - candidate[0],
          point[1] - candidate[1],
        );
        if (separation < distance) {
          nearest = candidate;
          distance = separation;
        }
      }
      return nearest;
    }),
  };
}
export function uncoveredBuilding(feature: Feature): Feature[] {
  const children = parts
    .filter(
      (part) =>
        meters(part.tags.min_height, 0) === 0 &&
        inside(center(part.points), feature.points),
    )
    .map(modelBuildingPart);
  if (!children.length) return [feature];
  const polygon = (f: Feature): Polygon =>
    [f.points, ...f.holes].map((ring) => ring.map(([x, z]): Pair => [x, z]));
  return polygonClipping
    .difference(polygon(feature), ...children.map(polygon))
    .map((rings) => ({
      ...feature,
      points: rings[0].map(([x, z]): Point => [x, z]),
      holes: rings.slice(1).map((ring) => ring.map(([x, z]): Point => [x, z])),
    }));
}
const riversideTunnelIds = new Set([4890563, 78879996]);
const posternIds = new Set([8888304, 28811769, 183917808]);
export const paths = features.filter(
  (f) =>
    f.tags.highway &&
    (f.tags.tunnel !== 'yes' ||
      posternIds.has(f.id) ||
      riversideTunnelIds.has(f.id) ||
      buildings.some(
        (building) =>
          building.tags.historic === 'city_gate' &&
          inside(center(f.points), building.points),
      )) &&
    !['proposed', 'construction'].includes(f.tags.highway),
);
// These interior survey lines duplicate the exposed rock bank; the short chapel
// fence crosses its mapped rear footway rather than protecting an actual edge.
const omittedWallIds = new Set([
  56084053, 515345429,
  // Rampart-side railings duplicate the existing solid masonry parapets.
  949795352, 1303802771, 1303802773, 1303803612, 1303806147, 1303806151,
  1303806152,
]);
export const walls = features
  .filter((f) => f.tags.barrier && !omittedWallIds.has(f.id))
  .map((wall) =>
    wall.id === 51718886
      ? { ...wall, points: wall.points.slice(13) }
      : // This survey line duplicates the house facade; only its garden extension is a wall.
        wall.id === 55987209
        ? { ...wall, points: wall.points.slice(5) }
        : wall.id === 1532977610
          ? {
              ...wall,
              // Remove the short doubled-back tip, not the bastion's retaining edge.
              points: wall.points.filter(
                ([x, z]) => !(x > 99 && x < 101 && z < -100),
              ),
            }
          : wall,
  );
export const gardenLatticeWallIds = new Set([377578898, 351536139]);
const brickGateFence = walls.find((wall) => wall.id === 1303806149);
if (!brickGateFence) throw new Error('Missing Brick Gate garden fence.');
const brickGateFenceSurvey = [...brickGateFence.points];
brickGateFence.points = [
  brickGateFence.points[0],
  brickGateFence.points[brickGateFence.points.length - 1],
];
export const aveMariaFrontage = (() => {
  const stairs = features.find((feature) => feature.id === 255297754);
  if (!stairs) throw new Error('The chapel approach stairs are missing.');
  const approach = stairs.points.at(-1) ?? stairs.points[0];
  const edges = aveMariaFeature.points
    .slice(1)
    .map((b, i) => {
      const a = aveMariaFeature.points[i];
      const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
      const face: Point = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
      let normal: Point = [-(b[1] - a[1]) / length, (b[0] - a[0]) / length];
      if (
        inside(
          [face[0] + normal[0] * 0.1, face[1] + normal[1] * 0.1],
          aveMariaFeature.points,
        )
      )
        normal = [-normal[0], -normal[1]];
      return {
        wall: [a, b] as const,
        face,
        normal,
        width: length,
        distance: Math.hypot(face[0] - approach[0], face[1] - approach[1]),
      };
    })
    .filter((edge) => edge.width > 3.5)
    .sort((a, b) => a.distance - b.distance);
  const edge = edges[0];
  if (!edge)
    throw new Error('The chapel has no facade facing its mapped stairs.');
  return {
    ...edge,
    feature: aveMariaFeature,
    approach,
    angle: Math.atan2(...edge.normal),
    point: [
      edge.face[0] + edge.normal[0] * 0.025,
      edge.face[1] + edge.normal[1] * 0.025,
    ] as Point,
  };
})();
export function aveMariaPoint(u: number, v: number): Point {
  const { point, normal, angle } = aveMariaFrontage;
  return [
    point[0] + Math.cos(angle) * u + normal[0] * v,
    point[1] - Math.sin(angle) * u + normal[1] * v,
  ];
}
const aveMariaCourtBounds = [[-6.2, 6.6, -11.8, 10.1]];
export const aveMariaCourtCuts = aveMariaCourtBounds.map(
  ([left, right, back, front]) => [
    aveMariaPoint(left, back),
    aveMariaPoint(right, back),
    aveMariaPoint(right, front),
    aveMariaPoint(left, front),
    aveMariaPoint(left, back),
  ],
);
export function onAveMariaCourt([x, z]: Point) {
  const { point, normal, angle } = aveMariaFrontage;
  const dx = x - point[0],
    dz = z - point[1];
  const u = dx * Math.cos(angle) - dz * Math.sin(angle);
  const v = dx * normal[0] + dz * normal[1];
  return aveMariaCourtBounds.some(
    ([left, right, back, front]) =>
      u >= left - 1e-6 &&
      u <= right + 1e-6 &&
      v >= back - 1e-6 &&
      v <= front + 1e-6,
  );
}
export function aveMariaFloor() {
  return unretainedElevation(...aveMariaFrontage.point);
}
export function aveMariaCourtElevation(x: number, z: number) {
  const { point, normal } = aveMariaFrontage;
  const v = (x - point[0]) * normal[0] + (z - point[1]) * normal[1];
  const floor = aveMariaFloor();
  if (v >= 0)
    return (
      floor +
      ((unretainedElevation(...aveMariaFrontage.approach) - floor) * v) / 9.9
    );
  const u =
    (x - point[0]) * Math.cos(aveMariaFrontage.angle) -
    (z - point[1]) * Math.sin(aveMariaFrontage.angle);
  return (
    floor +
    (unretainedElevation(87.36, 28.13) - floor) *
      Math.min(1, -v / 9.3) *
      smooth((u - 2.8) / 3.8)
  );
}
aveMariaRetaining.points = [
  [78.05, 25.37],
  aveMariaPoint(-6.2, -11.8),
  aveMariaPoint(-6.2, 0),
];
walls.push({
  id: -89545111,
  tags: { barrier: 'retaining_wall' },
  holes: [],
  points: [aveMariaPoint(6.6, 0), aveMariaPoint(6.6, -11.8)],
});
const chapelRearFence = walls.find((wall) => wall.id === 644962722);
if (!chapelRearFence) throw new Error('Missing rear chapel garden fence.');
chapelRearFence.points = [chapelRearFence.points[0], aveMariaPoint(-6.5, -8.8)];
export const casemateEntrance = (() => {
  const wall = walls.find((feature) => feature.id === 377578901);
  if (!wall) throw new Error('The surveyed casemate entrance wall is missing.');
  const point: Point = [50.79, -79.78];
  const projection = projectRoute(point, wall.points);
  if (projection.distance > 0.25)
    throw new Error('The surveyed casemate doorway no longer meets its wall.');
  return { point, normal: projection.normal, wall };
})();
export const playgroundEquipment = (() => {
  const feature = features.find((feature) => feature.id === 122555875);
  if (!feature) throw new Error('The Old Czech Legends playground is missing.');
  const frame = orientedBounds(feature.points);
  const at = (u: number, v: number): Point => [
    frame.center[0] + frame.axis[0] * u - frame.axis[1] * v,
    frame.center[1] + frame.axis[1] * u + frame.axis[0] * v,
  ];
  const candidates = [-0.4, -0.3, -0.2, -0.1, 0, 0.1, 0.2, 0.3, 0.4].flatMap(
    (u) =>
      [-0.3, -0.15, 0, 0.15, 0.3].map((v) =>
        at(u * frame.width, v * frame.depth),
      ),
  );
  const equipment: {
    kind: 'tower' | 'swings';
    point: Point;
    angle: number;
    width: number;
    depth: number;
    footprint: Point[];
  }[] = [];
  for (const kind of ['tower', 'swings'] as const) {
    const width = kind === 'tower' ? 3 : 5,
      depth = 3;
    const point = candidates.find(
      (point) =>
        inside(point, feature.points) &&
        projectRoute(point, feature.points).distance > 3 &&
        mappedTrees.every(
          (tree) => Math.hypot(point[0] - tree[0], point[1] - tree[1]) > 4,
        ) &&
        paths.every(
          (path) =>
            projectRoute(point, path.points).distance > pathWidth(path) / 2 + 3,
        ) &&
        equipment.every(
          (item) =>
            Math.hypot(point[0] - item.point[0], point[1] - item.point[1]) > 7,
        ),
    );
    if (!point)
      throw new Error(`No path-safe space for the playground ${kind}.`);
    const footprint = [
      [-1, -1],
      [1, -1],
      [1, 1],
      [-1, 1],
      [-1, -1],
    ].map(
      ([u, v]): Point => [
        point[0] +
          (frame.axis[0] * u * width) / 2 -
          (frame.axis[1] * v * depth) / 2,
        point[1] +
          (frame.axis[1] * u * width) / 2 +
          (frame.axis[0] * v * depth) / 2,
      ],
    );
    equipment.push({
      kind,
      point,
      angle: frame.angle,
      width,
      depth,
      footprint,
    });
  }
  return equipment;
})();
export const cemeterySolidWallIds = new Set([51666061, 51689840]);
const slavinNode = monuments.find((monument) => monument.id === 3406896761);
const slavinWall = walls.find((wall) => wall.id === 51666061);
if (!slavinNode || !slavinWall || !cemeteries.length)
  throw new Error(
    'The mapped Slavin memorial and cemetery enclosure are missing.',
  );
const slavinProjection = projectRoute(slavinNode.point, slavinWall.points);
const slavinSide = inside(
  [
    slavinNode.point[0] + slavinProjection.normal[0] * 3,
    slavinNode.point[1] + slavinProjection.normal[1] * 3,
  ],
  cemeteries[0].points,
)
  ? 1
  : -1;
export const slavin = {
  point: slavinNode.point,
  front: [
    slavinProjection.normal[0] * slavinSide,
    slavinProjection.normal[1] * slavinSide,
  ] as Point,
  angle: Math.atan2(
    slavinProjection.normal[0] * slavinSide,
    slavinProjection.normal[1] * slavinSide,
  ),
};
export function slavinCoordinates(point: Point): Point {
  const dx = point[0] - slavin.point[0],
    dz = point[1] - slavin.point[1];
  return [
    dx * Math.cos(slavin.angle) - dz * Math.sin(slavin.angle),
    dx * Math.sin(slavin.angle) + dz * Math.cos(slavin.angle),
  ];
}
export function slavinPrecinct(point: Point, margin = 0) {
  const [u, v] = slavinCoordinates(point);
  return Math.abs(u) < 7.7 + margin && v > -1.9 - margin && v < 6.4 + margin;
}
const riverRegions = features.filter((f) => f.tags.water === 'river');
export const riverElevation = rawElevation(-440, 0) + 0.12;
export const riversideGallery = (() => {
  const road = features.find((feature) => feature.id === 4890563);
  const pedestrian = features.find((feature) => feature.id === 78879996);
  if (!road || !pedestrian)
    throw new Error('The mapped riverside tunnel is missing.');
  if (road.points.length < 2)
    throw new Error('The riverside tunnel alignment is incomplete.');
  const ends = [road.points[0], road.points[road.points.length - 1]];
  const neighbors = [road.points[1], road.points[road.points.length - 2]];
  const approaches = ends.map((end, index) => {
    const neighbor = neighbors[index];
    const length = Math.hypot(end[0] - neighbor[0], end[1] - neighbor[1]);
    const axis: Point = [
      (end[0] - neighbor[0]) / length,
      (end[1] - neighbor[1]) / length,
    ];
    const outside: Point = [end[0] + axis[0] * 24, end[1] + axis[1] * 24];
    const floor = Math.max(
      riverElevation + 1.6,
      Math.min(
        ...[12, 18, 24].map((distance) =>
          rawElevation(
            end[0] + axis[0] * distance,
            end[1] + axis[1] * distance,
          ),
        ),
      ),
    );
    const width = 7.3;
    const polygon: Point[] = [
      [end[0] - axis[1] * width, end[1] + axis[0] * width],
      [outside[0] - axis[1] * width, outside[1] + axis[0] * width],
      [outside[0] + axis[1] * width, outside[1] - axis[0] * width],
      [end[0] + axis[1] * width, end[1] - axis[0] * width],
      [end[0] - axis[1] * width, end[1] + axis[0] * width],
    ];
    return { end, outside, axis, floor, polygon };
  });
  return {
    road,
    pedestrian,
    approaches,
    halfWidth: 6.4,
    levels: approaches.map((approach) => approach.floor),
    bounds: {
      minX: Math.min(
        ...approaches.flatMap((approach) => approach.polygon.map(([x]) => x)),
        ...road.points.map(([x]) => x - 6.4),
      ),
      maxX: Math.max(
        ...approaches.flatMap((approach) => approach.polygon.map(([x]) => x)),
        ...road.points.map(([x]) => x + 6.4),
      ),
      minZ: Math.min(
        ...approaches.flatMap((approach) => approach.polygon.map(([, z]) => z)),
        ...road.points.map(([, z]) => z - 6.4),
      ),
      maxZ: Math.max(
        ...approaches.flatMap((approach) => approach.polygon.map(([, z]) => z)),
        ...road.points.map(([, z]) => z + 6.4),
      ),
    },
    portalBuildingIds: new Set([546612750, 546612751, 546612754]),
  };
})();
export function riversideGallerySupport(point: Point) {
  const { bounds } = riversideGallery;
  if (
    point[0] < bounds.minX ||
    point[0] > bounds.maxX ||
    point[1] < bounds.minZ ||
    point[1] > bounds.maxZ
  )
    return undefined;
  for (const approach of riversideGallery.approaches) {
    const dx = point[0] - approach.end[0],
      dz = point[1] - approach.end[1];
    const along = dx * approach.axis[0] + dz * approach.axis[1];
    const across = Math.abs(-dx * approach.axis[1] + dz * approach.axis[0]);
    if (along >= 0 && along <= 24 && across < 7.3)
      return {
        floor:
          approach.floor +
          (rawElevation(...approach.outside) - approach.floor) *
            smooth(along / 24),
        across,
        underground: false,
      };
  }
  const route = projectRoute(point, riversideGallery.road.points);
  if (
    route.distance > riversideGallery.halfWidth ||
    Math.min(
      ...riversideGallery.approaches.map(
        (a) =>
          (point[0] - a.end[0]) * a.axis[0] + (point[1] - a.end[1]) * a.axis[1],
      ),
    ) > 0
  )
    return undefined;
  return {
    floor:
      riversideGallery.levels[0] +
      ((riversideGallery.levels[1] - riversideGallery.levels[0]) *
        route.along) /
        route.length,
    across: route.distance,
    underground: true,
  };
}
function inRiver(point: Point) {
  return riverRegions.some(
    (river) =>
      inside(point, river.points) &&
      !river.holes.some((hole) => inside(point, hole)),
  );
}
export const gateNodes: Point[] = dataset.gates.map(([x, z]) => [x, z]);
const cemeteryExitWall = walls.find((wall) => wall.id === 51666061);
if (!cemeteryExitWall) throw new Error('The cemetery exit wall is missing.');
const cemeteryExit = gateNodes.find(
  (point) => projectRoute(point, cemeteryExitWall.points).distance < 0.1,
);
if (!cemeteryExit) throw new Error('The mapped cemetery exit is missing.');
const cemeteryExitNormal = projectRoute(
  cemeteryExit,
  cemeteryExitWall.points,
).normal;
export const cemeteryGate = {
  center: cemeteryExit,
  axis: [cemeteryExitNormal[1], -cemeteryExitNormal[0]] as Point,
  width: 5.8,
  depth: 1.35,
  halfWidth: 1.55,
  spring: 2.15,
  height: 4.3,
};
type RiversideDoorway = {
  point: Point;
  floor: number;
  top: number;
  halfWidth: number;
  spring: number;
  frame: ReturnType<typeof gateFrame>;
};
export const riversideDoorways: RiversideDoorway[] = [];
const rampartWallId = 1532977610;
const rampartOutline = walls.find((wall) => wall.id === rampartWallId);
if (!rampartOutline)
  throw new Error('The main Vyšehrad rampart outline is missing.');
const rampartBoundary = rampartOutline.points;
const surveyedRampart = features.find(
  (feature) => feature.id === rampartWallId,
);
if (!surveyedRampart) throw new Error('The surveyed rampart is missing.');
const surveyedRampartPoints = surveyedRampart.points;
// Local wall repairs must not shift the terrain sampling around the entire ring.
const rampartLengths = [0];
for (let i = 1; i < surveyedRampartPoints.length; i++)
  rampartLengths.push(
    rampartLengths[i - 1] +
      Math.hypot(
        surveyedRampartPoints[i][0] - surveyedRampartPoints[i - 1][0],
        surveyedRampartPoints[i][1] - surveyedRampartPoints[i - 1][1],
      ),
  );
const rampartLength = rampartLengths[rampartLengths.length - 1];
function rampartPoint(distance: number): Point {
  const along = ((distance % rampartLength) + rampartLength) % rampartLength;
  const index = rampartLengths.findIndex((length) => length > along);
  const a = surveyedRampartPoints[index - 1],
    b = surveyedRampartPoints[index];
  const t =
    (along - rampartLengths[index - 1]) /
    (rampartLengths[index] - rampartLengths[index - 1]);
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
}
const rampartCount = Math.ceil(rampartLength / 4);
export const rampartStations = Array.from(
  { length: rampartCount },
  (_, index) => {
    const along = (index * rampartLength) / rampartCount;
    const point = rampartPoint(along),
      before = rampartPoint(along - 8),
      after = rampartPoint(along + 8);
    const length = Math.hypot(after[0] - before[0], after[1] - before[1]);
    let inward: Point = [
      -(after[1] - before[1]) / length,
      (after[0] - before[0]) / length,
    ];
    if (
      !inside(
        [point[0] + inward[0] * 4, point[1] + inward[1] * 4],
        rampartBoundary,
      )
    )
      inward = [-inward[0], -inward[1]];
    const levels = [4, 8, 12, 16]
      .map((offset) =>
        rawElevation(
          point[0] + inward[0] * offset,
          point[1] + inward[1] * offset,
        ),
      )
      .sort((a, b) => a - b);
    return { point, inward, level: levels[2] };
  },
);
const sourceRampartLevels = rampartStations.map((station) => station.level);
for (const [index, station] of rampartStations.entries()) {
  let total = 0,
    weight = 0;
  for (let offset = -3; offset <= 3; offset++) {
    const w = 4 - Math.abs(offset);
    total +=
      sourceRampartLevels[(index + offset + rampartCount) % rampartCount] * w;
    weight += w;
  }
  station.level = total / weight;
}
// Close short troughs caused by inward samples crossing the far side of a narrow bastion.
const dilatedRampartLevels = rampartStations.map((_, index) =>
  Math.max(
    ...Array.from(
      { length: 17 },
      (_, offset) =>
        rampartStations[(index + offset - 8 + rampartCount) % rampartCount]
          .level,
    ),
  ),
);
for (const [index, station] of rampartStations.entries())
  station.level = Math.max(
    station.level,
    Math.min(
      ...Array.from(
        { length: 17 },
        (_, offset) =>
          dilatedRampartLevels[
            (index + offset - 8 + rampartCount) % rampartCount
          ],
      ),
    ),
  );
const rockSeats = rampartStations.map(({ point, inward }) => {
  const samples = [8, 10, 12]
    .map((distance) =>
      rawElevation(
        point[0] - inward[0] * distance,
        point[1] - inward[1] * distance,
      ),
    )
    .sort((a, b) => a - b);
  return samples[1];
});
const smoothRockSeats = rockSeats.map((_, index) => {
  let total = 0,
    weight = 0;
  for (let offset = -3; offset <= 3; offset++) {
    const w = 4 - Math.abs(offset);
    total += rockSeats[(index + offset + rampartCount) % rampartCount] * w;
    weight += w;
  }
  return total / weight;
});
const rampartCorners = rampartBoundary.map((point) => {
  const station =
    (projectRoute(point, surveyedRampartPoints).along / rampartLength) *
    rampartCount;
  const start = Math.floor(station);
  const a = rampartStations[start % rampartCount],
    b = rampartStations[(start + 1) % rampartCount];
  const seatA = smoothRockSeats[start % rampartCount],
    seatB = smoothRockSeats[(start + 1) % rampartCount];
  return {
    point,
    level: a.level + (b.level - a.level) * (station - start),
    rockSeat: seatA + (seatB - seatA) * (station - start),
  };
});
type RampartSegment = {
  a: (typeof rampartCorners)[number];
  b: (typeof rampartCorners)[number];
};
const rampartIndex = new Map<string, RampartSegment[]>();
for (const [index, a] of rampartCorners.slice(0, -1).entries()) {
  const b = rampartCorners[index + 1];
  for (
    let x = Math.floor((Math.min(a.point[0], b.point[0]) - 26) / 20);
    x <= Math.floor((Math.max(a.point[0], b.point[0]) + 26) / 20);
    x++
  )
    for (
      let z = Math.floor((Math.min(a.point[1], b.point[1]) - 26) / 20);
      z <= Math.floor((Math.max(a.point[1], b.point[1]) + 26) / 20);
      z++
    ) {
      const key = `${x},${z}`,
        entries = rampartIndex.get(key) ?? [];
      entries.push({ a, b });
      rampartIndex.set(key, entries);
    }
}
export function rampartTerrace(point: Point) {
  let distance = 26;
  let level: number | undefined;
  for (const { a, b } of rampartIndex.get(
    `${Math.floor(point[0] / 20)},${Math.floor(point[1] / 20)}`,
  ) ?? []) {
    const dx = b.point[0] - a.point[0],
      dz = b.point[1] - a.point[1];
    const t = Math.max(
      0,
      Math.min(
        1,
        ((point[0] - a.point[0]) * dx + (point[1] - a.point[1]) * dz) /
          (dx * dx + dz * dz || 1),
      ),
    );
    const separation = Math.hypot(
      point[0] - a.point[0] - dx * t,
      point[1] - a.point[1] - dz * t,
    );
    if (separation < distance) {
      distance = separation;
      level = a.level + (b.level - a.level) * t;
    }
  }
  if (level === undefined) return undefined;
  const interior = inside(point, rampartBoundary);
  const core = interior ? 18 : 5,
    edge = interior ? 26 : 11;
  if (distance >= edge) return undefined;
  return { level, weight: 1 - smooth((distance - core) / (edge - core)) };
}
const platforms = buildings
  .filter((f) => f.tags.historic !== 'city_gate' && !f.tags.min_height)
  .map((feature) => {
    const [x, z] = center(feature.points);
    const samples = feature.points
      .map((p) => rawElevation(...p))
      .sort((a, b) => a - b);
    const level =
      (rawElevation(x, z) + samples[Math.floor(samples.length / 2)]) / 2;
    return { feature, level };
  });
const supportedFoundations = new Map<number, number>();
const platformIndex = new Map<string, typeof platforms>();
for (const platform of platforms) {
  const xs = platform.feature.points.map((p) => p[0]);
  const zs = platform.feature.points.map((p) => p[1]);
  for (
    let x = Math.floor((Math.min(...xs) - 2) / 20);
    x <= Math.floor((Math.max(...xs) + 2) / 20);
    x++
  )
    for (
      let z = Math.floor((Math.min(...zs) - 2) / 20);
      z <= Math.floor((Math.max(...zs) + 2) / 20);
      z++
    ) {
      const key = `${x},${z}`;
      const entries = platformIndex.get(key) ?? [];
      entries.push(platform);
      platformIndex.set(key, entries);
    }
}

const brickGateId = 51700613;
const brickGate = buildings.find((feature) => feature.id === brickGateId);
if (!brickGate) throw new Error('The mapped Brick Gate is missing.');
const brickGateFrame = gateFrame(brickGate);
export function brickGateEnvelope(point: Point, margin = 0.45) {
  const dx = point[0] - brickGateFrame.center[0],
    dz = point[1] - brickGateFrame.center[1];
  return (
    Math.abs(dx * brickGateFrame.axis[0] + dz * brickGateFrame.axis[1]) <
      brickGateFrame.width / 2 + margin &&
    Math.abs(-dx * brickGateFrame.axis[1] + dz * brickGateFrame.axis[0]) <
      brickGateFrame.depth / 2 + margin
  );
}
const brickGateLevels = [-1, 1].map((side) => {
  const samples = [18, 20, 22]
    .map((offset) =>
      rawElevation(
        brickGateFrame.center[0] - brickGateFrame.axis[1] * offset * side,
        brickGateFrame.center[1] + brickGateFrame.axis[0] * offset * side,
      ),
    )
    .sort((a, b) => a - b);
  return samples[1];
});
function brickGateGrade(point: Point) {
  const dx = point[0] - brickGateFrame.center[0],
    dz = point[1] - brickGateFrame.center[1];
  const across = dx * brickGateFrame.axis[0] + dz * brickGateFrame.axis[1];
  const along = -dx * brickGateFrame.axis[1] + dz * brickGateFrame.axis[0];
  const t = Math.max(0, Math.min(1, (along + 20) / 40));
  return {
    level: brickGateLevels[0] + (brickGateLevels[1] - brickGateLevels[0]) * t,
    weight:
      (1 - smooth((Math.abs(across) - brickGateFrame.width / 2) / 4)) *
      (1 - smooth((Math.abs(along) - 18) / 12)),
  };
}
const leopoldGate = buildings.find((feature) => feature.id === 51718887);
if (!leopoldGate) throw new Error('The mapped Leopold Gate is missing.');
const leopoldFrame = gateFrame(leopoldGate);
const leopoldLevel = rawElevation(...leopoldFrame.center);
const taborGate = buildings.find((feature) => feature.id === 49811189);
if (!taborGate) throw new Error('The mapped Tabor Gate is missing.');
const taborFrame = gateFrame(taborGate);
const taborGateNodeExclusion = framePolygon(
  taborFrame,
  taborFrame.width + 8,
  taborFrame.depth + 12,
);
const taborLevel = [-1, 1].reduce((total, side) => {
  const samples = [18, 22, 26]
    .map((offset) =>
      rawElevation(
        taborFrame.center[0] - taborFrame.axis[1] * offset * side,
        taborFrame.center[1] + taborFrame.axis[0] * offset * side,
      ),
    )
    .sort((a, b) => a - b);
  return total + samples[1] / 2;
}, 0);
const pevnostiIds = [
  5016653, 494921191, 494921190, 370193785, 93524713, 93524749,
];
const northPevnosti = paths.find((feature) => feature.id === 4646722);
if (!northPevnosti)
  throw new Error('The northern V Pevnosti street is missing.');
const northPevnostiPoints = northPevnosti.points;
const northPevnostiLevels = northPevnostiPoints.map((point) =>
  rawElevation(...point),
);
const brickGateApproach = paths.find((feature) => feature.id === 53573884);
if (!brickGateApproach) throw new Error('The Brick Gate approach is missing.');
function streetOutline(points: Point[]) {
  const corners = points.filter((point, index) => {
    const before = points[(index + points.length - 1) % points.length];
    const after = points[(index + 1) % points.length];
    return (
      Math.abs(
        (point[0] - before[0]) * (after[1] - point[1]) -
          (point[1] - before[1]) * (after[0] - point[0]),
      ) > 1e-7
    );
  });
  return [...corners, corners[0]];
}
export const retainedStreetCorridors = [4646722, 587280816].map((id) => {
  const feature = paths.find((path) => path.id === id);
  if (!feature) throw new Error(`Missing recessed street ${id}.`);
  const points =
    id === 4646722
      ? [brickGateApproach.points[0], ...feature.points]
      : feature.points;
  const levels = points.map((point, index) =>
    id === 4646722 && index === 0
      ? brickGateGrade(point).level
      : rawElevation(...point),
  );
  const boundaryWalls = walls.filter((wall) =>
    [51718886, 55987208, 55987209, 377578900, 56084052].includes(wall.id),
  );
  let along = 0;
  const sections = points.flatMap((b, i) => {
    if (!i) return [];
    const a = points[i - 1];
    const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const count = Math.ceil(length / 2);
    const samples = Array.from(
      { length: count + (i === points.length - 1 ? 1 : 0) },
      (_, j) => {
        const t = j / count;
        const point: Point = [
          a[0] + (b[0] - a[0]) * t,
          a[1] + (b[1] - a[1]) * t,
        ];
        const normal: Point = [-(b[1] - a[1]) / length, (b[0] - a[0]) / length];
        const edges = ([-1, 1] as const).map((side) => {
          const mapped = boundaryWalls
            .map((wall) => ({ wall, ...projectRoute(point, wall.points) }))
            .filter((edge) => {
              const dx = edge.point[0] - point[0],
                dz = edge.point[1] - point[1];
              return (
                edge.distance >= 5 &&
                edge.distance <= 8.5 &&
                (dx * normal[0] + dz * normal[1]) * side > 0 &&
                Math.abs(dx * normal[1] - dz * normal[0]) < 1.5
              );
            })
            .sort((a, b) => a.distance - b.distance)[0];
          return {
            point:
              mapped?.point ??
              ([
                point[0] + normal[0] * side * 6.5,
                point[1] + normal[1] * side * 6.5,
              ] as Point),
            mapped: Boolean(mapped),
          };
        });
        return {
          point,
          along: along + length * t,
          level: levels[i - 1] + (levels[i] - levels[i - 1]) * t,
          edges,
        };
      },
    );
    along += length;
    return samples;
  });
  const polygon = streetOutline([
    ...sections.map((section) => section.edges[0].point),
    ...sections.map((section) => section.edges[1].point).reverse(),
  ]);
  return {
    feature,
    points,
    levels,
    sections,
    polygon,
    length: along,
    minX: Math.min(...polygon.map((point) => point[0])),
    maxX: Math.max(...polygon.map((point) => point[0])),
    minZ: Math.min(...polygon.map((point) => point[1])),
    maxZ: Math.max(...polygon.map((point) => point[1])),
  };
});

export function retainedStreetSection(point: Point) {
  let nearest:
    | {
        level: number;
        distance: number;
        width: number;
        weight: number;
      }
    | undefined;
  for (const corridor of retainedStreetCorridors) {
    if (
      point[0] < corridor.minX - 0.002 ||
      point[0] > corridor.maxX + 0.002 ||
      point[1] < corridor.minZ - 0.002 ||
      point[1] > corridor.maxZ + 0.002
    )
      continue;
    if (
      !inside(point, corridor.polygon) &&
      projectRoute(point, corridor.polygon).distance > 0.002
    )
      continue;
    const route = projectRoute(point, corridor.points);
    let low = 0,
      high = corridor.sections.length - 1;
    while (high - low > 1) {
      const mid = Math.floor((low + high) / 2);
      if (corridor.sections[mid].along <= route.along) low = mid;
      else high = mid;
    }
    const a = corridor.sections[low],
      b = corridor.sections[high];
    const t = (route.along - a.along) / (b.along - a.along || 1);
    const signed =
      (point[0] - route.point[0]) * route.normal[0] +
      (point[1] - route.point[1]) * route.normal[1];
    const side = signed < 0 ? 0 : 1;
    const widthA = Math.hypot(
      a.edges[side].point[0] - a.point[0],
      a.edges[side].point[1] - a.point[1],
    );
    const widthB = Math.hypot(
      b.edges[side].point[0] - b.point[0],
      b.edges[side].point[1] - b.point[1],
    );
    const width = widthA + (widthB - widthA) * t;
    if (nearest && route.distance >= nearest.distance) continue;
    nearest = {
      level:
        corridor.levels[route.segment] +
        (corridor.levels[route.segment + 1] - corridor.levels[route.segment]) *
          route.fraction,
      distance: route.distance,
      width,
      weight: smooth(Math.min(route.along, corridor.length - route.along) / 5),
    };
  }
  return nearest;
}

function retainedStreetElevation(
  section: NonNullable<ReturnType<typeof retainedStreetSection>>,
  ground: number,
) {
  // Keep the carriageway and sidewalks level across the cut, not the whole hill.
  const shoulder =
    1 -
    smooth(section.distance - section.width + 1) *
      (1 - smooth((Math.abs(ground - section.level) - 0.35) / 0.2));
  return ground + (section.level - ground) * section.weight * shoulder;
}
export const pevnostiRoad: Point[] = pevnostiIds.flatMap((id, index) => {
  const feature = features.find((feature) => feature.id === id);
  if (!feature) throw new Error(`Missing V Pevnosti segment ${id}.`);
  return index === 0 ? feature.points.slice(-3) : feature.points.slice(1);
});
const roadAnchors = [
  { point: pevnostiRoad[0], level: rawElevation(...pevnostiRoad[0]) },
  { point: leopoldFrame.center, level: leopoldLevel },
  { point: [139.33, 193.22] as Point, level: rawElevation(139.33, 193.22) },
  { point: [201.81, 271.78] as Point, level: rawElevation(201.81, 271.78) },
  { point: taborFrame.center, level: taborLevel },
  {
    point: pevnostiRoad[pevnostiRoad.length - 1],
    level: rawElevation(...pevnostiRoad[pevnostiRoad.length - 1]),
  },
].map((anchor) => ({
  ...anchor,
  along: projectRoute(anchor.point, pevnostiRoad).along,
}));
export function pevnostiGrade(point: Point) {
  const projection = projectRoute(point, pevnostiRoad);
  const index = roadAnchors.findIndex(
    (anchor) => anchor.along >= projection.along,
  );
  const end = roadAnchors[index < 0 ? roadAnchors.length - 1 : index];
  const start =
    roadAnchors[Math.max(0, (index < 0 ? roadAnchors.length - 1 : index) - 1)];
  const t =
    end.along === start.along
      ? 0
      : smooth((projection.along - start.along) / (end.along - start.along));
  const signed =
    (point[0] - projection.point[0]) * projection.normal[0] +
    (point[1] - projection.point[1]) * projection.normal[1];
  const gardenBank =
    signed < 0
      ? smooth((projection.along - roadAnchors[1].along - 6) / 8) *
        (1 - smooth((projection.along - roadAnchors[2].along + 10) / 12))
      : 0;
  return {
    ...projection,
    level: start.level + (end.level - start.level) * t,
    weight: 1 - smooth((projection.distance - 8.5) / (6 - 3 * gardenBank)),
  };
}
const taborPosternTerraces = features
  .filter((feature) => posternIds.has(feature.id))
  .map((feature) => {
    const start = feature.points[0],
      end = feature.points[feature.points.length - 1];
    const length = Math.hypot(end[0] - start[0], end[1] - start[1]);
    return {
      center: [(start[0] + end[0]) / 2, (start[1] + end[1]) / 2] as Point,
      direction: [
        (end[0] - start[0]) / length,
        (end[1] - start[1]) / length,
      ] as Point,
      length,
    };
  });
function taborPosternGrade(point: Point, level: number) {
  if (point[0] < 175 || point[0] > 275 || point[1] < 225 || point[1] > 325)
    return level;
  let weight = 0;
  for (const terrace of taborPosternTerraces) {
    const dx = point[0] - terrace.center[0],
      dz = point[1] - terrace.center[1];
    const along = dx * terrace.direction[0] + dz * terrace.direction[1];
    const across = Math.abs(
      -dx * terrace.direction[1] + dz * terrace.direction[0],
    );
    weight = Math.max(
      weight,
      (1 - smooth((across - 14) / 6)) *
        (1 - smooth((Math.abs(along) - terrace.length / 2) / 5)),
    );
  }
  const target = pevnostiGrade(point).level;
  const terrace = level + (target - level) * weight;
  const bank = Math.min(
    smooth((point[0] - 185) / 10),
    smooth((270 - point[0]) / 10),
    smooth((point[1] - 235) / 10),
    smooth((325 - point[1]) / 10),
  );
  const fill = terrace < target ? smooth((point[0] - 195) / 7) : 1;
  return terrace + (target - terrace) * bank * fill;
}
function leopoldGrade(point: Point) {
  const dx = point[0] - leopoldFrame.center[0],
    dz = point[1] - leopoldFrame.center[1];
  const across = dx * leopoldFrame.axis[0] + dz * leopoldFrame.axis[1];
  const along = -dx * leopoldFrame.axis[1] + dz * leopoldFrame.axis[0];
  return {
    level: leopoldLevel,
    weight:
      (1 - smooth((Math.abs(across) - leopoldFrame.width / 2) / 5)) *
      (1 - smooth((Math.abs(along) - 5) / 18)),
  };
}
export function taborWallWeight(feature: Feature, point: Point) {
  return [8888302, 33878732].includes(feature.id)
    ? 1 -
        smooth(
          (Math.hypot(
            point[0] - taborFrame.center[0],
            point[1] - taborFrame.center[1],
          ) -
            28) /
            35,
        )
    : 0;
}
export function wallThickness(feature: Feature, point: Point) {
  if (cemeteryArcadeWallIds.has(feature.id)) return cemeteryArcadeWallThickness;
  if (cemeterySolidWallIds.has(feature.id)) return 0.95;
  if (feature.id === 8888302)
    return (
      1.5 +
      0.3 * gardenWallWeight(point) +
      1.5 * taborWallWeight(feature, point)
    );
  if (feature.id === 33878732)
    return 1.5 + 1.5 * taborWallWeight(feature, point);
  return feature.tags.barrier === 'retaining_wall'
    ? 0.75
    : 0.65 + 2.35 * taborWallWeight(feature, point);
}
function gardenWallWeight(point: Point) {
  return 1 - smooth((point[1] - 208.73) / 20);
}
export function gardenWallCrest(point: Point) {
  const start: Point = [165.57, 117.68],
    end: Point = [199.45, 208.73];
  const terrace = rampartTerrace(start);
  if (!terrace) throw new Error('Missing garden wall rampart junction.');
  const upper =
    Math.max(
      originalElevation(...end),
      originalElevation(end[0] - 8, end[1]),
      originalElevation(end[0], end[1] - 8),
    ) + 1.5;
  const t = projectRoute(point, [start, end]).fraction;
  return terrace.level + 1.5 + (upper - terrace.level - 1.5) * t;
}
export function rampartWallRuns(feature: Feature): Point[][] {
  if ([8888302, 33878732].includes(feature.id)) {
    const thickness = wallThickness(feature, taborFrame.center);
    const apron = {
      ...taborFrame,
      center: framePoint(taborFrame, 0, -12),
      width: taborFrame.width + thickness + 0.1,
      depth: taborFrame.depth + 24,
    };
    let runs = wallRunsOutsideFrame(feature, feature.points, apron);
    const start = feature.id === 8888302;
    const run = start ? runs[0] : runs[runs.length - 1];
    if (!run)
      throw new Error('The Tabor fortification has no remaining wall run.');
    const endpoint = start
      ? feature.points[0]
      : feature.points[feature.points.length - 1];
    const side = Math.sign(
      (endpoint[0] - taborFrame.center[0]) * taborFrame.axis[0] +
        (endpoint[1] - taborFrame.center[1]) * taborFrame.axis[1],
    );
    const join = framePoint(
      taborFrame,
      side * (taborFrame.width / 2 + thickness / 2),
      -taborFrame.depth / 2 + thickness / 2,
    );
    if (start) run.unshift(join);
    else run.push(join);
    if (feature.id === 8888302)
      runs = runs.flatMap((points) =>
        wallRunsOutsideFrame(
          feature,
          points,
          posterns[posterns.length - 1].frame,
        ),
      );
    return runs;
  }
  const frames =
    feature.id === rampartWallId
      ? [leopoldFrame, ...riversideDoorways.map((door) => door.frame)]
      : [];
  if (frames.length)
    return frames.reduce(
      (runs, frame) =>
        runs.flatMap((points) => wallRunsOutsideFrame(feature, points, frame)),
      [feature.points],
    );
  const frame = feature.id === 51700612 ? brickGateFrame : undefined;
  if (!frame) return [feature.points];
  return wallRunsOutsideFrame(feature, feature.points, frame);
}
function wallRunsOutsideFrame(
  feature: Feature,
  points: readonly Point[],
  frame: ReturnType<typeof gateFrame>,
): Point[][] {
  const half = [
    frame.width / 2,
    frame.depth / 2 + wallThickness(feature, frame.center) / 2 + 0.05,
  ];
  const local = (point: Point): Point => {
    const dx = point[0] - frame.center[0],
      dz = point[1] - frame.center[1];
    return [
      dx * frame.axis[0] + dz * frame.axis[1],
      -dx * frame.axis[1] + dz * frame.axis[0],
    ];
  };
  const runs: Point[][] = [];
  let run: Point[] = [];
  const append = (point: Point) => {
    const previous = run.at(-1);
    if (
      !previous ||
      Math.hypot(point[0] - previous[0], point[1] - previous[1]) > 0.000001
    )
      run.push(point);
  };
  const finish = () => {
    if (run.length > 1) runs.push(run);
    run = [];
  };
  // The mapped rampart follows the facade; the gatehouse replaces that whole span.
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1],
      b = points[i];
    const start = local(a),
      end = local(b);
    let enter = 0,
      exit = 1;
    for (let axis = 0; axis < 2; axis++) {
      const delta = end[axis] - start[axis];
      if (Math.abs(delta) < 0.000001) {
        if (Math.abs(start[axis]) > half[axis]) enter = Infinity;
      } else {
        const first = (-half[axis] - start[axis]) / delta;
        const last = (half[axis] - start[axis]) / delta;
        enter = Math.max(enter, Math.min(first, last));
        exit = Math.min(exit, Math.max(first, last));
      }
    }
    if (enter >= exit) {
      append(a);
      append(b);
      continue;
    }
    const at = (t: number): Point => [
      a[0] + (b[0] - a[0]) * t,
      a[1] + (b[1] - a[1]) * t,
    ];
    if (enter > 0) {
      append(a);
      append(at(enter));
    }
    finish();
    if (exit < 1) {
      append(at(exit));
      append(b);
    }
  }
  finish();
  const first = runs[0]?.[0],
    last = runs.at(-1)?.at(-1);
  if (
    runs.length > 1 &&
    first &&
    last &&
    first[0] === last[0] &&
    first[1] === last[1]
  ) {
    const tail = runs.pop();
    if (tail) runs[0] = [...tail.slice(0, -1), ...runs[0]];
  }
  return runs;
}
export const courts = features.filter(
  (feature) => feature.tags.sport === 'tennis',
);
const courtPads = courts.map((feature) => {
  const samples = [...feature.points, center(feature.points)]
    .map((point) => rawElevation(...point))
    .sort((a, b) => a - b);
  return {
    feature,
    level: samples[Math.floor(samples.length / 2)],
    interior: inside(center(feature.points), rampartBoundary),
  };
});
const easternCourtPads = courtPads.filter((pad) =>
  [53573787, 53573788, 53573789, 53573790, 53573791].includes(pad.feature.id),
);
const easternCourtPoints = easternCourtPads.flatMap(
  (pad) => pad.feature.points,
);
export const courtBankBounds = {
  minX:
    Math.floor(
      (Math.min(...easternCourtPoints.map((point) => point[0])) - 20) / 5,
    ) * 5,
  maxX:
    Math.ceil(
      (Math.max(...easternCourtPoints.map((point) => point[0])) + 20) / 5,
    ) * 5,
  minZ: Math.min(
    -115,
    Math.floor(
      (Math.min(...easternCourtPoints.map((point) => point[1])) - 20) / 5,
    ) * 5,
  ),
  maxZ:
    Math.ceil(
      (Math.max(...easternCourtPoints.map((point) => point[1])) + 20) / 5,
    ) * 5,
};
export const courtBankBoundary = rampartBoundary;
const rockPoints = exposedRocks.flatMap((rock) => rock.points);
if (!rockPoints.length)
  throw new Error('The mapped riverside bare-rock area is missing.');
export const cliffTerrainBounds = {
  minX: Math.floor((Math.min(...rockPoints.map((p) => p[0])) - 10) / 5) * 5,
  maxX: Math.ceil((Math.max(...rockPoints.map((p) => p[0])) + 10) / 5) * 5,
  minZ: Math.floor((Math.min(...rockPoints.map((p) => p[1])) - 10) / 5) * 5,
  maxZ: Math.ceil((Math.max(...rockPoints.map((p) => p[1])) + 10) / 5) * 5,
};
export function onCliffTerrain(x: number, z: number) {
  return (
    x >= cliffTerrainBounds.minX &&
    x <= cliffTerrainBounds.maxX &&
    z >= cliffTerrainBounds.minZ &&
    z <= cliffTerrainBounds.maxZ
  );
}
export function onExposedRampartBank(point: Point) {
  if (
    !onCliffTerrain(...point) &&
    !(point[0] > -285 && point[0] < -130 && point[1] > -250 && point[1] < -100)
  )
    return false;
  return (
    !inside(point, rampartBoundary) &&
    projectRoute(point, rampartBoundary).distance < 45
  );
}
function restoreCliff(
  point: Point,
  height: number,
  interior = inside(point, rampartBoundary),
) {
  if (!onCliffTerrain(...point)) return height;
  if (!interior) {
    let level = fieldElevation(cliffExteriorField, ...point);
    for (const door of riversideDoorways) {
      const dx = point[0] - door.frame.center[0],
        dz = point[1] - door.frame.center[1];
      const u = dx * door.frame.axis[0] + dz * door.frame.axis[1],
        v = -dx * door.frame.axis[1] + dz * door.frame.axis[0];
      const across = 1 - smooth((Math.abs(u) - door.halfWidth - 0.1) / 0.8);
      const along = 1 - smooth((-v - door.frame.depth / 2) / 8);
      if (v <= door.frame.depth / 2)
        level += Math.max(0, door.floor - level) * across * along;
    }
    return level;
  }
  const terrace = rampartTerrace(point);
  return terrace
    ? Math.max(
        height,
        terrace.level * terrace.weight + height * (1 - terrace.weight),
      )
    : height;
}
export function cliffTerrainElevation(point: Point, interior: boolean) {
  return restoreCliff(point, fieldElevation(terrainField, ...point), interior);
}
export function onCourtBankTerrain(x: number, z: number) {
  return (
    x >= courtBankBounds.minX &&
    x <= courtBankBounds.maxX &&
    z >= courtBankBounds.minZ &&
    z <= courtBankBounds.maxZ
  );
}
function restoreCourtBank(point: Point, height: number, interior?: boolean) {
  if (!onCourtBankTerrain(...point)) return height;
  if (!(interior ?? inside(point, rampartBoundary))) {
    const distance = projectRoute(point, rampartBoundary).distance;
    return (
      height +
      (gradedElevation(...point, false, true, false) - height) *
        (1 - smooth((distance - 8) / 3))
    );
  }
  const padDistance = Math.min(
    ...easternCourtPads.map(
      (pad) => projectRoute(point, pad.feature.points).distance,
    ),
  );
  const influence = Math.max(
    smooth((-45 - point[1]) / 20),
    1 - smooth((padDistance - 10) / 4),
  );
  if (influence === 0) return height;
  const terrace = rampartTerrace(point);
  return terrace
    ? height + Math.max(0, terrace.level - height) * terrace.weight * influence
    : height;
}
export function courtBankElevation(point: Point, interior: boolean) {
  return clearGardenExit(
    point,
    restoreCourtBank(
      point,
      fieldElevation(
        onApproachTerrain(...point) ? approachTerrainField : terrainField,
        ...point,
      ),
      interior,
    ),
    interior,
  );
}

export function projectRoute(point: Point, points: readonly Point[]) {
  let distance = Infinity,
    along = 0,
    nearestAlong = 0,
    segment = 0,
    fraction = 0;
  let projected: Point = points[0];
  let normal: Point = [0, 1];
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1],
      b = points[i];
    const dx = b[0] - a[0],
      dz = b[1] - a[1];
    const length = Math.hypot(dx, dz);
    if (length < 0.001) continue;
    const t = Math.max(
      0,
      Math.min(
        1,
        ((point[0] - a[0]) * dx + (point[1] - a[1]) * dz) / (length * length),
      ),
    );
    const candidate: Point = [a[0] + dx * t, a[1] + dz * t];
    const separation = Math.hypot(
      point[0] - candidate[0],
      point[1] - candidate[1],
    );
    if (separation < distance) {
      distance = separation;
      projected = candidate;
      nearestAlong = along + length * t;
      segment = i - 1;
      fraction = t;
      normal = [-dz / length, dx / length];
    }
    along += length;
  }
  return {
    distance,
    point: projected,
    along: nearestAlong,
    length: along,
    normal,
    segment,
    fraction,
  };
}

function framePoint(
  frame: ReturnType<typeof gateFrame>,
  across: number,
  along: number,
): Point {
  return [
    frame.center[0] + frame.axis[0] * across - frame.axis[1] * along,
    frame.center[1] + frame.axis[1] * across + frame.axis[0] * along,
  ];
}
function framePolygon(
  frame: ReturnType<typeof gateFrame>,
  width: number,
  depth: number,
): Point[] {
  return [
    [-1, -1],
    [1, -1],
    [1, 1],
    [-1, 1],
    [-1, -1],
  ].map(([u, v]) => framePoint(frame, (u * width) / 2, (v * depth) / 2));
}
const landscapedAreas = features.filter(
  (feature) =>
    feature.tags.leisure === 'park' ||
    feature.tags.leisure === 'garden' ||
    feature.tags.landuse === 'grass',
);
const landscapeWallIndex = indexLines(
  walls.filter((wall) => wall.tags.barrier !== 'fence'),
  () => 8,
);
function rockElevation(x: number, z: number, exterior = false) {
  const raw = rawElevation(x, z);
  const point: Point = [x, z];
  if (
    exposedRockAt(point, exterior ? 8 : 0) &&
    (exterior || !inside(point, rampartBoundary))
  ) {
    const projection = projectRoute(point, rampartBoundary);
    if (projection.distance > 14) return raw;
    const a = rampartCorners[projection.segment],
      b = rampartCorners[projection.segment + 1];
    const seat = a.rockSeat + (b.rockSeat - a.rockSeat) * projection.fraction;
    return (
      raw +
      (Math.min(raw, seat - projection.distance * 0.12) - raw) *
        (1 - smooth((projection.distance - 7) / 7))
    );
  }
  return raw;
}
function terracedElevation(x: number, z: number) {
  const raw = rawElevation(x, z);
  if (exposedRockAt([x, z]) && !inside([x, z], rampartBoundary))
    return rockElevation(x, z);
  const terrace = rampartTerrace([x, z]);
  return terrace ? raw + (terrace.level - raw) * terrace.weight : raw;
}
function softenedLandscape(x: number, z: number) {
  const raw = terracedElevation(x, z);
  const point: Point = [x, z];
  const area = landscapedAreas.find(
    (feature) =>
      inside(point, feature.points) &&
      !feature.holes.some((hole) => inside(point, hole)),
  );
  if (
    !area ||
    (
      landscapeWallIndex.get(`${Math.floor(x / 20)},${Math.floor(z / 20)}`) ??
      []
    ).some(({ a, b }) => segmentDistance(point, a, b) < 8)
  )
    return raw;
  const edge = Math.min(
    ...[area.points, ...area.holes].flatMap((ring) =>
      ring.slice(1).map((b, i) => segmentDistance(point, ring[i], b)),
    ),
  );
  const weights = [1, 4, 6, 4, 1];
  let average = 0;
  for (let i = -2; i <= 2; i++)
    for (let j = -2; j <= 2; j++)
      average +=
        (terracedElevation(x + i * 5, z + j * 5) *
          weights[i + 2] *
          weights[j + 2]) /
        256;
  return raw + Math.max(0, average - raw) * 0.9 * smooth(edge / 8);
}

export function foundation(feature: Feature): number {
  if (feature.id === aveMariaFrontage.feature.id) return aveMariaFloor();
  if (feature.id === brickGateId)
    return brickGateGrade(brickGateFrame.center).level;
  if (feature.id === 51718887) return leopoldLevel;
  if (feature.id === 49811189) return taborLevel;
  if (feature.id === 49811195)
    return pevnostiGrade(center(feature.points)).level;
  const p = center(feature.points);
  const parent = platforms.find(
    (platform) =>
      platform.feature.id === feature.id ||
      (feature.tags['building:part'] && inside(p, platform.feature.points)),
  );
  if (!parent) return rawElevation(...p);
  if (cemeteryArcades.some((arcade) => arcade.feature.id === parent.feature.id))
    return parent.level;
  const cached = supportedFoundations.get(parent.feature.id);
  if (cached !== undefined) return cached;
  // The meshed terrace/rock interpolant can rise above the original DMR pad.
  // Raise the shared floor, not the terrain or individual attached building parts.
  let level = Math.max(
    parent.level,
    elevation(...center(parent.feature.points)),
  );
  for (const ring of [parent.feature.points, ...parent.feature.holes])
    for (let i = 1; i < ring.length; i++) {
      const a = ring[i - 1],
        b = ring[i];
      const steps = Math.max(
        1,
        Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1])),
      );
      for (let j = 0; j <= steps; j++)
        level = Math.max(
          level,
          elevation(
            a[0] + ((b[0] - a[0]) * j) / steps,
            a[1] + ((b[1] - a[1]) * j) / steps,
          ),
        );
    }
  supportedFoundations.set(parent.feature.id, level);
  return level;
}

// Preserve the hill outside building pads and the rampart's level promenade bench.
function gradedElevation(
  x: number,
  z: number,
  interior = inside([x, z], rampartBoundary),
  cliffExterior = false,
  upperTerrace = true,
): number {
  const landscape = cliffExterior
    ? rockElevation(x, z, true)
    : softenedLandscape(x, z);
  const raw = upperTerrace ? taborPosternGrade([x, z], landscape) : landscape;
  if (inRiver([x, z])) return Math.min(raw, riverElevation - 0.4);
  const candidates =
    platformIndex.get(`${Math.floor(x / 20)},${Math.floor(z / 20)}`) ?? [];
  let nearest = 2;
  let result = raw;
  for (const platform of candidates) {
    if (inside([x, z], platform.feature.points)) {
      result = platform.level;
      break;
    }
    const distance = Math.min(
      ...platform.feature.points
        .slice(1)
        .map((p, i) => segmentDistance([x, z], platform.feature.points[i], p)),
    );
    if (distance < nearest) {
      nearest = distance;
      result = raw + (platform.level - raw) * (1 - smooth(distance / 2));
    }
  }
  for (const pad of courtPads) {
    if (pad.interior !== interior) continue;
    const distance = inside([x, z], pad.feature.points)
      ? 0
      : Math.min(
          ...pad.feature.points
            .slice(1)
            .map((b, i) => segmentDistance([x, z], pad.feature.points[i], b)),
        );
    if (distance < 14)
      result += (pad.level - result) * (1 - smooth((distance - 6) / 8));
  }
  const gate = leopoldGrade([x, z]);
  result += (gate.level - result) * gate.weight;
  if (x > -110 && x < 80 && z > -80 && z < 85) {
    const road = projectRoute([x, z], northPevnostiPoints);
    const level =
      northPevnostiLevels[road.segment] +
      (northPevnostiLevels[road.segment + 1] -
        northPevnostiLevels[road.segment]) *
        road.fraction;
    result += (level - result) * (1 - smooth((road.distance - 5.5) / 4));
  }
  if (x > 45 && x < 315 && z > 100 && z < 345) {
    const road = pevnostiGrade([x, z]);
    result += (road.level - result) * road.weight;
  }
  return result;
}

export const upperTerrainField = {
  minX: -850,
  maxX: 850,
  minZ: -750,
  maxZ: 750,
  columns: 340,
  rows: 300,
  heights: new Float32Array(341 * 301),
};
for (let z = 0; z <= upperTerrainField.rows; z++)
  for (let x = 0; x <= upperTerrainField.columns; x++)
    upperTerrainField.heights[z * 341 + x] = gradedElevation(
      upperTerrainField.minX + x * 5,
      upperTerrainField.minZ + z * 5,
    );
const cliffExteriorField = {
  ...cliffTerrainBounds,
  columns: (cliffTerrainBounds.maxX - cliffTerrainBounds.minX) / 5,
  rows: (cliffTerrainBounds.maxZ - cliffTerrainBounds.minZ) / 5,
  heights: new Float32Array(
    ((cliffTerrainBounds.maxX - cliffTerrainBounds.minX) / 5 + 1) *
      ((cliffTerrainBounds.maxZ - cliffTerrainBounds.minZ) / 5 + 1),
  ),
};
for (let row = 0; row <= cliffExteriorField.rows; row++)
  for (let col = 0; col <= cliffExteriorField.columns; col++)
    cliffExteriorField.heights[row * (cliffExteriorField.columns + 1) + col] =
      gradedElevation(
        cliffExteriorField.minX + col * 5,
        cliffExteriorField.minZ + row * 5,
        false,
        true,
      );

function fieldElevation(
  field: typeof upperTerrainField,
  x: number,
  z: number,
): number {
  const width = (field.maxX - field.minX) / field.columns;
  const depth = (field.maxZ - field.minZ) / field.rows;
  const stride = field.columns + 1;
  const u = Math.max(
    0,
    Math.min(field.columns - 0.00001, (x - field.minX) / width),
  );
  const v = Math.max(
    0,
    Math.min(field.rows - 0.00001, (z - field.minZ) / depth),
  );
  const col = Math.floor(u),
    row = Math.floor(v),
    du = u - col,
    dv = v - row;
  const a = field.heights[row * stride + col],
    b = field.heights[row * stride + col + 1];
  const c = field.heights[(row + 1) * stride + col],
    d = field.heights[(row + 1) * stride + col + 1];
  return du + dv <= 1
    ? a + (b - a) * du + (c - a) * dv
    : d + (c - d) * (1 - du) + (b - d) * (1 - dv);
}

// Resolve the narrow street shoulders without widening the pad over the garden bank.
export const approachTerrainField = {
  minX: 60,
  maxX: 150,
  minZ: 120,
  maxZ: 205,
  columns: 90,
  rows: 85,
  heights: new Float32Array(91 * 86),
};
export function onApproachTerrain(x: number, z: number) {
  return (
    x >= approachTerrainField.minX &&
    x <= approachTerrainField.maxX &&
    z >= approachTerrainField.minZ &&
    z <= approachTerrainField.maxZ
  );
}
for (let row = 0; row <= approachTerrainField.rows; row++)
  for (let col = 0; col <= approachTerrainField.columns; col++) {
    const x = approachTerrainField.minX + col,
      z = approachTerrainField.minZ + row;
    const edge = Math.min(
      x - approachTerrainField.minX,
      approachTerrainField.maxX - x,
      z - approachTerrainField.minZ,
      approachTerrainField.maxZ - z,
    );
    const coarse = fieldElevation(upperTerrainField, x, z);
    approachTerrainField.heights[row * 91 + col] =
      coarse + (gradedElevation(x, z) - coarse) * smooth(edge / 5);
  }

export function originalElevation(x: number, z: number) {
  return restoreCliff(
    [x, z],
    restoreCourtBank(
      [x, z],
      fieldElevation(
        onApproachTerrain(x, z) ? approachTerrainField : upperTerrainField,
        x,
        z,
      ),
    ),
  );
}
const gardenDoorCenter: Point = [170.9, 125.54];
const gardenExitWall = walls.find((wall) => wall.id === 8888302);
if (!gardenExitWall)
  throw new Error('The mapped vegetable garden exit wall is missing.');
const gardenWallNormal = projectRoute(
  gardenDoorCenter,
  gardenExitWall.points,
).normal;
const gardenDoorRoute: Feature = {
  id: 12461779632,
  points: [
    [
      gardenDoorCenter[0] - gardenWallNormal[0] * 1.1,
      gardenDoorCenter[1] - gardenWallNormal[1] * 1.1,
    ],
    gardenDoorCenter,
    [
      gardenDoorCenter[0] + gardenWallNormal[0] * 1.1,
      gardenDoorCenter[1] + gardenWallNormal[1] * 1.1,
    ],
  ],
  tags: {
    highway: 'footway',
    tunnel: 'yes',
    name: 'Garden postern',
    width: '1.8',
  },
  holes: [],
};
export const posterns = [
  ...features.filter((feature) => posternIds.has(feature.id)),
  gardenDoorRoute,
].map((feature) => {
  const start = feature.points[0],
    end = feature.points[feature.points.length - 1];
  const route = projectRoute(start, feature.points);
  const width = feature.id === gardenDoorRoute.id ? 1.8 : 2.5;
  let levels = [start, end].map((point, index) => {
    const neighbor =
      index === 0
        ? feature.points[1]
        : feature.points[feature.points.length - 2];
    const length = Math.hypot(point[0] - neighbor[0], point[1] - neighbor[1]);
    return Math.min(
      rawElevation(...point),
      ...[4, 8].map((offset) =>
        rawElevation(
          point[0] + ((point[0] - neighbor[0]) / length) * offset,
          point[1] + ((point[1] - neighbor[1]) / length) * offset,
        ),
      ),
    );
  });
  const clearance =
    feature.id === gardenDoorRoute.id
      ? 0
      : Math.max(
          0,
          ...feature.points.map((point) => {
            const p = projectRoute(point, feature.points);
            return (
              levels[0] +
              ((levels[1] - levels[0]) * p.along) / route.length +
              2.7 -
              Math.min(originalElevation(...point), rawElevation(...point))
            );
          }),
        );
  levels =
    feature.id === gardenDoorRoute.id
      ? [rawElevation(170.9, 125.54), rawElevation(170.9, 125.54)]
      : levels.map((level) => level - clearance);
  const dx = end[0] - start[0],
    dz = end[1] - start[1],
    length = Math.hypot(dx, dz);
  const frame = {
    center: [(start[0] + end[0]) / 2, (start[1] + end[1]) / 2] as Point,
    axis: [-dz / length, dx / length] as Point,
    width:
      feature.id === gardenDoorRoute.id
        ? 4.4
        : feature.id === 8888304
          ? 10
          : feature.id === 183917808
            ? 8
            : 18,
    depth: length,
    angle: -Math.atan2(dx / length, -dz / length),
  };
  const extend = (point: Point, neighbor: Point): Point => {
    const length = Math.hypot(point[0] - neighbor[0], point[1] - neighbor[1]);
    return [
      point[0] + ((point[0] - neighbor[0]) * 6) / length,
      point[1] + ((point[1] - neighbor[1]) * 6) / length,
    ];
  };
  const access = [
    extend(start, feature.points[1]),
    ...feature.points,
    extend(end, feature.points[feature.points.length - 2]),
  ];
  return {
    feature,
    access,
    width,
    levels,
    length: route.length,
    frame,
    footprint: framePolygon(frame, frame.width, frame.depth),
  };
});
export function posternFloor(postern: (typeof posterns)[number], point: Point) {
  const route = projectRoute(point, postern.feature.points);
  return (
    postern.levels[0] +
    ((postern.levels[1] - postern.levels[0]) * route.along) / postern.length
  );
}
export const upperCovers = [
  {
    id: brickGateId,
    footprint: framePolygon(
      brickGateFrame,
      brickGateFrame.width + 22,
      brickGateFrame.depth,
    ),
  },
  ...posterns.map((postern) => ({
    id: postern.feature.id,
    footprint:
      postern.feature.id === 28811769
        ? roadBridgeFootprint(postern.footprint)
        : postern.footprint,
  })),
];
function roadBridgeFootprint(footprint: Point[]): Point[] {
  const road = features.find((feature) => feature.id === 370193785);
  if (!road) throw new Error('The upper road above the postern is missing.');
  const first = road.points.findIndex(
    (point) => point[0] === 201.81 && point[1] === 271.78,
  );
  const last = road.points.findIndex(
    (point) => point[0] === 239.37 && point[1] === 300.39,
  );
  if (first < 0 || last <= first)
    throw new Error(
      'The upper road crossing has no complete bridge alignment.',
    );
  const points = road.points.slice(first, last + 1);
  const polygons: Polygon[] = [[footprint.map(([x, z]): Pair => [x, z])]];
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1],
      b = points[i],
      length = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const normal: Point = [
      (-(b[1] - a[1]) * 8.5) / length,
      ((b[0] - a[0]) * 8.5) / length,
    ];
    polygons.push([
      [
        [a[0] + normal[0], a[1] + normal[1]],
        [b[0] + normal[0], b[1] + normal[1]],
        [b[0] - normal[0], b[1] - normal[1]],
        [a[0] - normal[0], a[1] - normal[1]],
        [a[0] + normal[0], a[1] + normal[1]],
      ],
    ]);
  }
  for (const point of points)
    polygons.push([
      Array.from(
        { length: 25 },
        (_, i): Pair => [
          point[0] + Math.cos((i * Math.PI) / 12) * 8.5,
          point[1] + Math.sin((i * Math.PI) / 12) * 8.5,
        ],
      ),
    ]);
  const merged = polygonClipping.union(polygons[0], ...polygons.slice(1));
  if (merged.length !== 1 || merged[0].length !== 1)
    throw new Error(
      'The road and postern covers must form one uninterrupted deck.',
    );
  return merged[0][0].map(([x, z]): Point => [x, z]);
}
const coverBounds = new WeakMap<
  (typeof upperCovers)[number],
  {
    footprint: Point[];
    minX: number;
    maxX: number;
    minZ: number;
    maxZ: number;
  }
>();
export function coverAt(point: Point) {
  return upperCovers.find((cover) => {
    let bounds = coverBounds.get(cover);
    if (!bounds || bounds.footprint !== cover.footprint) {
      bounds = {
        footprint: cover.footprint,
        minX: Math.min(...cover.footprint.map(([x]) => x)) - 0.02,
        maxX: Math.max(...cover.footprint.map(([x]) => x)) + 0.02,
        minZ: Math.min(...cover.footprint.map(([, z]) => z)) - 0.02,
        maxZ: Math.max(...cover.footprint.map(([, z]) => z)) + 0.02,
      };
      coverBounds.set(cover, bounds);
    }
    return (
      point[0] >= bounds.minX &&
      point[0] <= bounds.maxX &&
      point[1] >= bounds.minZ &&
      point[1] <= bounds.maxZ &&
      (inside(point, cover.footprint) ||
        cover.footprint
          .slice(1)
          .some((b, i) => segmentDistance(point, cover.footprint[i], b) < 0.02))
    );
  });
}
export const upperPromenade: Point[] = [
  framePoint(brickGateFrame, -brickGateFrame.width / 2 - 13, 6),
  framePoint(brickGateFrame, brickGateFrame.width / 2 + 13, 6),
];
const lowerGatePathIds = new Set(
  features
    .filter(
      (feature) =>
        feature.tags.tunnel && inside(center(feature.points), brickGate.points),
    )
    .map((feature) => feature.id),
);
const lowerEndpoints = features
  .filter((feature) => lowerGatePathIds.has(feature.id))
  .flatMap((feature) => feature.points)
  .concat(posterns.flatMap((postern) => postern.feature.points));
for (const feature of paths)
  if (
    feature.points.some((point) =>
      lowerEndpoints.some(
        (end) => Math.hypot(point[0] - end[0], point[1] - end[1]) < 0.05,
      ),
    )
  )
    lowerGatePathIds.add(feature.id);
const lowerApproaches = paths.filter((path) => lowerGatePathIds.has(path.id));
export const terrainField = {
  ...upperTerrainField,
  heights: upperTerrainField.heights.slice(),
};
export const taborTerrainField = {
  minX: 185,
  maxX: 275,
  minZ: 235,
  maxZ: 325,
  columns: 90,
  rows: 90,
  heights: new Float32Array(91 * 91),
};
export function onTaborTerrain(x: number, z: number) {
  return (
    x >= taborTerrainField.minX &&
    x <= taborTerrainField.maxX &&
    z >= taborTerrainField.minZ &&
    z <= taborTerrainField.maxZ
  );
}
function excavatePostern(
  postern: (typeof posterns)[number],
  point: Point,
  level: number,
) {
  const projection = projectRoute(point, postern.feature.points);
  const garden = postern.feature.id === gardenDoorRoute.id;
  const core = garden ? postern.width / 2 + 0.25 : postern.width / 2 + 0.5;
  const weight = 1 - smooth((projection.distance - core) / (garden ? 1.6 : 4));
  return Math.min(
    level,
    level + (posternFloor(postern, point) - level) * weight,
  );
}
function excavatedElevation(point: Point) {
  const gate = brickGateGrade(point);
  const upper = gradedElevation(...point);
  let level = upper + (gate.level - upper) * gate.weight;
  if (point[0] > 175 && point[0] < 275 && point[1] > 225 && point[1] < 325) {
    const distance = Math.min(
      ...lowerApproaches.map(
        (path) => projectRoute(point, path.points).distance,
      ),
    );
    const weight = 1 - smooth((distance - 8) / 4);
    if (weight) {
      const lower = gradedElevation(
        ...point,
        inside(point, rampartBoundary),
        false,
        false,
      );
      level += Math.min(0, lower - level) * weight;
    }
  }
  for (const postern of posterns) {
    level = excavatePostern(postern, point, level);
  }
  return level;
}
for (let row = 0; row <= terrainField.rows; row++)
  for (let col = 0; col <= terrainField.columns; col++) {
    terrainField.heights[row * 341 + col] = excavatedElevation([
      terrainField.minX + col * 5,
      terrainField.minZ + row * 5,
    ]);
  }
for (let row = 0; row <= taborTerrainField.rows; row++)
  for (let col = 0; col <= taborTerrainField.columns; col++)
    taborTerrainField.heights[row * 91 + col] = fieldElevation(
      terrainField,
      taborTerrainField.minX + col,
      taborTerrainField.minZ + row,
    );
export const gardenTerrainField = {
  minX: 155,
  maxX: 185,
  minZ: 110,
  maxZ: 145,
  columns: 30,
  rows: 35,
  heights: new Float32Array(31 * 36),
};
export function onGardenTerrain(x: number, z: number) {
  return (
    x >= gardenTerrainField.minX &&
    x <= gardenTerrainField.maxX &&
    z >= gardenTerrainField.minZ &&
    z <= gardenTerrainField.maxZ
  );
}
export const gardenBankBounds = { minX: 120, maxX: 185, minZ: 105, maxZ: 150 };
export function onGardenBankTerrain(x: number, z: number) {
  return (
    x >= gardenBankBounds.minX &&
    x <= gardenBankBounds.maxX &&
    z >= gardenBankBounds.minZ &&
    z <= gardenBankBounds.maxZ
  );
}
const gardenExitFootway = paths.find((path) => path.id === 1372221841);
const gardenExitOuterPath = paths.find((path) => path.id === 183917810);
if (!gardenExitFootway || !gardenExitOuterPath)
  throw new Error('The mapped garden exit paths are missing.');
const gardenExitEnd = gardenExitFootway.points[0];
const gardenExitOuterRoute = gardenExitOuterPath.points;
function gardenExitGrade(point: Point) {
  const projection = projectRoute(point, [gardenDoorCenter, gardenExitEnd]);
  const floor = rawElevation(...gardenDoorCenter);
  return (
    floor +
    (rawElevation(...gardenExitEnd) - floor) *
      smooth((projection.along - 1.4) / (projection.length - 1.4))
  );
}
function clearGardenExit(point: Point, height: number, interior?: boolean) {
  const end = gardenExitEnd;
  if (
    point[0] < end[0] - 28 ||
    point[0] > end[0] + 28 ||
    point[1] < end[1] - 28 ||
    point[1] > end[1] + 28
  )
    return height;
  const exit = projectRoute(point, [gardenDoorCenter, end]);
  const outer = projectRoute(point, gardenExitOuterRoute);
  const exitWeight = 1 - smooth((exit.distance - 1.25) / 3);
  const outerWeight =
    (1 - smooth((outer.distance - 1.25) / 3)) *
    (1 - smooth((Math.hypot(point[0] - end[0], point[1] - end[1]) - 12) / 12));
  const weight = Math.max(exitWeight, outerWeight);
  const inset = 0.06 * smooth((exit.along - 1.1) / 0.8);
  const exteriorWeight =
    (interior ?? inside(point, rampartBoundary))
      ? 0
      : 1 -
        smooth((Math.hypot(point[0] - end[0], point[1] - end[1]) - 16) / 12);
  const exteriorFloor =
    rawElevation(...point) * (1 - exitWeight) +
    gardenExitGrade(point) * exitWeight;
  const cleared =
    height + Math.min(0, exteriorFloor - inset - height) * exteriorWeight;
  if (!weight) return cleared;
  const outerBlend = outerWeight * smooth((exit.distance - 1.25) / 1.5);
  const floor =
    gardenExitGrade(point) * (1 - outerBlend) +
    rawElevation(...outer.point) * outerBlend;
  return cleared + Math.min(0, floor - inset - cleared) * weight;
}
export function gardenTerrainElevation(point: Point, interior: boolean) {
  const [x, z] = point;
  const field = onGardenTerrain(x, z)
    ? gardenTerrainField
    : onApproachTerrain(x, z)
      ? approachTerrainField
      : terrainField;
  const height = restoreCourtBank(point, fieldElevation(field, x, z), interior);
  const edge = Math.min(
    x - gardenBankBounds.minX,
    gardenBankBounds.maxX - x,
    z - gardenBankBounds.minZ,
    gardenBankBounds.maxZ - z,
  );
  const weight = smooth(edge / 5);
  if (interior) {
    const terrace = rampartTerrace(point);
    const level = terrace
      ? height + Math.max(0, terrace.level - height) * terrace.weight * weight
      : height;
    return clearGardenExit(point, level, interior);
  }
  let level = gradedElevation(x, z, false);
  for (const postern of posterns)
    level = excavatePostern(postern, point, level);
  return clearGardenExit(point, height + (level - height) * weight, interior);
}
for (let row = 0; row <= gardenTerrainField.rows; row++)
  for (let col = 0; col <= gardenTerrainField.columns; col++) {
    const x = gardenTerrainField.minX + col,
      z = gardenTerrainField.minZ + row;
    const edge = Math.min(
      x - gardenTerrainField.minX,
      gardenTerrainField.maxX - x,
      z - gardenTerrainField.minZ,
      gardenTerrainField.maxZ - z,
    );
    const coarse = fieldElevation(terrainField, x, z);
    let level = gradedElevation(x, z);
    for (const postern of posterns)
      level = excavatePostern(postern, [x, z], level);
    gardenTerrainField.heights[row * 31 + col] =
      coarse + (level - coarse) * smooth(edge / 5);
  }
// Ground and roof decks use the same triangle interpolant as their rendered surfaces.
export function unretainedElevation(x: number, z: number) {
  const gallery = riversideGallerySupport([x, z]);
  if (gallery && !gallery.underground) return gallery.floor;
  if (onGardenBankTerrain(x, z))
    return gardenTerrainElevation([x, z], inside([x, z], rampartBoundary));
  const level = restoreCliff(
    [x, z],
    restoreCourtBank(
      [x, z],
      fieldElevation(
        onGardenTerrain(x, z)
          ? gardenTerrainField
          : onApproachTerrain(x, z)
            ? approachTerrainField
            : onTaborTerrain(x, z)
              ? taborTerrainField
              : terrainField,
        x,
        z,
      ),
    ),
  );
  if (x > 175 && x < 275 && z > 225 && z < 325) {
    const cover = coverAt([x, z]);
    // Keep buried soil and grass overlays below the independent, level roof surface.
    if (cover && posternIds.has(cover.id))
      return Math.min(level, coverElevation(cover, x, z) - 0.08);
  }
  return clearGardenExit([x, z], level);
}
export function elevation(x: number, z: number) {
  if (onAveMariaCourt([x, z])) return aveMariaCourtElevation(x, z);
  const ground = unretainedElevation(x, z);
  const section = retainedStreetSection([x, z]);
  if (section) return retainedStreetElevation(section, ground);
  const bank = retainedStreetBanks.find(
    (bank) =>
      x >= bank.minX &&
      x <= bank.maxX &&
      z >= bank.minZ &&
      z <= bank.maxZ &&
      inside([x, z], bank.polygon),
  );
  const bankGround = bank ? retainedStreetBankElevation(bank, [x, z]) : ground;
  if (
    x >= retainedStreetAccess.minX &&
    x <= retainedStreetAccess.maxX &&
    z >= retainedStreetAccess.minZ &&
    z <= retainedStreetAccess.maxZ &&
    inside([x, z], retainedStreetAccess.polygon)
  ) {
    const access = projectRoute([x, z], retainedStreetAccess.points);
    const level =
      retainedStreetAccess.levels[0] +
      (retainedStreetAccess.levels[1] - retainedStreetAccess.levels[0]) *
        (access.along / access.length);
    return (
      bankGround +
      (level - bankGround) *
        (1 -
          smooth(
            (access.distance - pathWidth(retainedStreetAccess.feature) / 2) / 4,
          ))
    );
  }
  return bankGround;
}
export const retainedStreetWalls: Feature[] = retainedStreetCorridors.flatMap(
  (corridor, index) => {
    const result: Feature[] = [];
    for (const side of [0, 1]) {
      let run: Point[] = [];
      const emit = () => {
        if (
          run.length > 1 &&
          projectRoute(run.at(-1) ?? run[0], run).length > 2.5
        )
          result.push({
            id: -9000000 - index * 1000 - side * 100 - result.length,
            points: run,
            holes: [],
            tags: { barrier: 'retaining_wall', material: 'stone' },
          });
        run = [];
      };
      for (const section of corridor.sections) {
        const edge = section.edges[side];
        const dx = edge.point[0] - section.point[0];
        const dz = edge.point[1] - section.point[1];
        const distance = Math.hypot(dx, dz);
        const bankHeight = Math.max(
          unretainedElevation(...edge.point),
          unretainedElevation(
            edge.point[0] + (dx / distance) * 3,
            edge.point[1] + (dz / distance) * 3,
          ),
        );
        const opening = paths.some(
          (path) =>
            path !== corridor.feature &&
            path.tags.footway !== 'sidewalk' &&
            path.tags.footway !== 'crossing' &&
            path.points.some((point) =>
              Boolean(retainedStreetSection(point)),
            ) &&
            projectRoute(edge.point, path.points).distance <
              pathWidth(path) / 2 + 0.4,
        );
        if (
          !edge.mapped &&
          !opening &&
          section.along > 5 &&
          section.along < corridor.length - 5 &&
          bankHeight - section.level > 0.8
        ) {
          run.push(edge.point);
        } else emit();
      }
      emit();
    }
    return result;
  },
);
const kioskCorner: Point = [60.75, 62.1];
for (const id of [-9000103, -9001000]) {
  const wall = retainedStreetWalls.find((item) => item.id === id);
  if (!wall) throw new Error(`Missing kiosk corner wall ${id}.`);
  if (id === -9000103) wall.points = [...wall.points.slice(0, -2), kioskCorner];
  else wall.points.push(kioskCorner);
}
const chapelApproachSteps = paths.find((path) => path.id === 255297754);
if (!chapelApproachSteps) throw new Error('Missing chapel approach staircase.');
for (const id of [-9000001, -9000002]) {
  const wall = retainedStreetWalls.find((item) => item.id === id);
  if (!wall) throw new Error(`Missing chapel roadside wall ${id}.`);
  const end =
    id === -9000001 ? wall.points[wall.points.length - 1] : wall.points[0];
  const projection = projectRoute(end, chapelApproachSteps.points);
  const side = Math.sign(
    (end[0] - projection.point[0]) * projection.normal[0] +
      (end[1] - projection.point[1]) * projection.normal[1],
  );
  const cheek: Point = [
    projection.point[0] + projection.normal[0] * side * 1.76,
    projection.point[1] + projection.normal[1] * side * 1.76,
  ];
  if (id === -9000001) wall.points.push(cheek);
  else wall.points.unshift(cheek);
}
const brickApproachWall = walls.find((wall) => wall.id === 51718886);
if (!brickApproachWall)
  throw new Error('Missing mapped Brick Gate street wall.');
const joinedStreetWall = retainedStreetWalls.find(
  (wall) =>
    Math.hypot(
      wall.points[0][0] - brickApproachWall.points[0][0],
      wall.points[0][1] - brickApproachWall.points[0][1],
    ) < 1,
);
if (!joinedStreetWall)
  throw new Error('The Brick Gate retaining wall has no street continuation.');
joinedStreetWall.points = [
  ...brickApproachWall.points.slice(0, 4).reverse(),
  ...joinedStreetWall.points.slice(1),
];
brickApproachWall.points = brickApproachWall.points.slice(3);
walls.push(...retainedStreetWalls);
const streetBankWidth = 12;
export const retainedStreetBanks = retainedStreetWalls.map((wall) => {
  const corridor = retainedStreetCorridors.reduce((a, b) =>
    projectRoute(wall.points[0], a.points).distance <
    projectRoute(wall.points[0], b.points).distance
      ? a
      : b,
  );
  const outer = wall.points.map((point) => {
    const road = projectRoute(point, corridor.points);
    const dx = point[0] - road.point[0],
      dz = point[1] - road.point[1];
    const length = Math.hypot(dx, dz);
    return [
      point[0] + (dx / length) * streetBankWidth,
      point[1] + (dz / length) * streetBankWidth,
    ] as Point;
  });
  const sampledCrests = wall.points.map((point, index) =>
    Math.max(
      unretainedElevation(...point),
      unretainedElevation(...outer[index]),
    ),
  );
  const crests = wall.points.map((point) => {
    let total = 0,
      weight = 0;
    for (const [index, neighbor] of wall.points.entries()) {
      const distance = Math.hypot(
        point[0] - neighbor[0],
        point[1] - neighbor[1],
      );
      const contribution = Math.max(0, 1 - distance / 10);
      total += sampledCrests[index] * contribution;
      weight += contribution;
    }
    return total / weight;
  });
  const blendBoundary = [
    wall.points[wall.points.length - 1],
    ...outer.reverse(),
    wall.points[0],
  ];
  const polygon = streetOutline([...wall.points, ...outer]);
  const blendEdges = blendBoundary.slice(1).map((b, index) => {
    const a = blendBoundary[index];
    return {
      a,
      b,
      minX: Math.min(a[0], b[0]) - 3,
      maxX: Math.max(a[0], b[0]) + 3,
      minZ: Math.min(a[1], b[1]) - 3,
      maxZ: Math.max(a[1], b[1]) + 3,
    };
  });
  return {
    wall,
    crests,
    polygon,
    blendBoundary,
    blendEdges,
    minX: Math.min(...polygon.map((point) => point[0])),
    maxX: Math.max(...polygon.map((point) => point[0])),
    minZ: Math.min(...polygon.map((point) => point[1])),
    maxZ: Math.max(...polygon.map((point) => point[1])),
  };
});
const kioskBanks = retainedStreetBanks.filter((bank) =>
  [-9000103, -9001000].includes(bank.wall.id),
);
const kioskCornerCrest = Math.max(
  ...kioskBanks.map((bank) => bank.crests[bank.crests.length - 1]),
);
for (const bank of kioskBanks)
  bank.crests[bank.crests.length - 1] = kioskCornerCrest;
export const retainedStreetAccess = (() => {
  const feature = paths.find((path) => path.id === 26454854);
  if (!feature) throw new Error('Missing uphill street-side footpath.');
  const width = pathWidth(feature) + 8;
  const edges = feature.points.map((point) => {
    const { normal } = projectRoute(point, feature.points);
    return [-1, 1].map(
      (side): Point => [
        point[0] + (normal[0] * side * width) / 2,
        point[1] + (normal[1] * side * width) / 2,
      ],
    );
  });
  const polygon = streetOutline([
    ...edges.map((edge) => edge[0]),
    ...edges.map((edge) => edge[1]).reverse(),
  ]);
  return {
    feature,
    points: feature.points,
    width,
    levels: [
      retainedStreetSection(feature.points[0])?.level ??
        unretainedElevation(...feature.points[0]),
      unretainedElevation(...feature.points[feature.points.length - 1]),
    ],
    polygon,
    minX: Math.min(...polygon.map((point) => point[0])),
    maxX: Math.max(...polygon.map((point) => point[0])),
    minZ: Math.min(...polygon.map((point) => point[1])),
    maxZ: Math.max(...polygon.map((point) => point[1])),
  };
})();
export const retainedStreetAreas = [
  ...retainedStreetCorridors,
  retainedStreetAccess,
  ...retainedStreetBanks,
];
const retainedStreetBounds = retainedStreetAreas.map(({ polygon }) => ({
  polygon,
  minX: Math.min(...polygon.map((point) => point[0])) - 0.002,
  maxX: Math.max(...polygon.map((point) => point[0])) + 0.002,
  minZ: Math.min(...polygon.map((point) => point[1])) - 0.002,
  maxZ: Math.max(...polygon.map((point) => point[1])) + 0.002,
}));

export function retainedStreetBankElevation(
  bank: (typeof retainedStreetBanks)[number],
  point: Point,
) {
  const ground = unretainedElevation(...point);
  let blendDistance = 3;
  for (const edge of bank.blendEdges)
    if (
      point[0] >= edge.minX &&
      point[0] <= edge.maxX &&
      point[1] >= edge.minZ &&
      point[1] <= edge.maxZ
    )
      blendDistance = Math.min(
        blendDistance,
        segmentDistance(point, edge.a, edge.b),
      );
  if (blendDistance < 1e-8) return ground;
  const projection = projectRoute(point, bank.wall.points);
  const crest = streetBankCrest(bank, projection);
  return (
    ground +
    (crest - ground) *
      (1 - smooth((projection.distance - 0.6) / (streetBankWidth - 0.6))) *
      smooth(blendDistance / 3)
  );
}

export function onRetainedStreetSurface(point: Point) {
  return retainedStreetBounds.some(
    (area) =>
      point[0] >= area.minX &&
      point[0] <= area.maxX &&
      point[1] >= area.minZ &&
      point[1] <= area.maxZ &&
      (inside(point, area.polygon) ||
        projectRoute(point, area.polygon).distance < 0.002),
  );
}

function streetBankCrest(
  bank: (typeof retainedStreetBanks)[number],
  projection: ReturnType<typeof projectRoute>,
) {
  const crest =
    bank.crests[projection.segment] +
    (bank.crests[projection.segment + 1] - bank.crests[projection.segment]) *
      projection.fraction;
  const ground = unretainedElevation(...projection.point);
  const joinedStart = bank.wall.id === -9000002;
  const joinedEnd = [-9000001, -9000103, -9001000].includes(bank.wall.id);
  return (
    ground +
    (crest - ground) *
      smooth(
        Math.min(
          joinedStart ? Infinity : projection.along,
          joinedEnd ? Infinity : projection.length - projection.along,
        ) / 6,
      )
  );
}
export function upperElevation(x: number, z: number) {
  const cover = coverAt([x, z]);
  return cover ? coverElevation(cover, x, z) : elevation(x, z);
}
export function coverElevation(
  cover: (typeof upperCovers)[number],
  x: number,
  z: number,
) {
  if (cover.id === brickGateId) {
    const original = originalElevation(x, z);
    const blend = smooth(projectRoute([x, z], cover.footprint).distance / 3);
    return original + (brickGateCrestElevation(x, z) - original) * blend;
  }
  return cover.id === gardenDoorRoute.id
    ? gardenWallCrest([x, z]) + 0.16
    : posternIds.has(cover.id)
      ? pevnostiGrade([x, z]).level
      : originalElevation(x, z);
}
export function posternVaultRoute(postern: (typeof posterns)[number]): Point[] {
  if (postern.feature.id === gardenDoorRoute.id) return postern.feature.points;
  const points = [...postern.feature.points];
  for (const index of [0, points.length - 1]) {
    const point = points[index];
    const neighbor = points[index === 0 ? 1 : index - 1];
    const length = Math.hypot(point[0] - neighbor[0], point[1] - neighbor[1]);
    for (let distance = 0.1; distance <= 6; distance += 0.1) {
      const extended: Point = [
        point[0] + ((point[0] - neighbor[0]) * distance) / length,
        point[1] + ((point[1] - neighbor[1]) * distance) / length,
      ];
      if (!coverAt(extended)) break;
      points[index] = extended;
    }
  }
  return points;
}
export const stairFlights = features
  .filter((feature) =>
    [284582284, 183917805, 26454844, 1106803168, 255297754].includes(
      feature.id,
    ),
  )
  .map((feature) => ({
    feature,
    count: Number(feature.tags.step_count),
    levels: [
      ...[feature.points[0], feature.points[feature.points.length - 1]].map(
        (point) =>
          coverAt(point) ? originalElevation(...point) : elevation(...point),
      ),
    ],
    length: projectRoute(feature.points[0], feature.points).length,
  }));
export const brickGateStairs = stairFlights.filter((flight) =>
  [26454844, 1106803168].includes(flight.feature.id),
);
export const brickGateStairCuts = brickGateStairs.map((flight) => {
  const a = flight.feature.points[0],
    b = flight.feature.points[flight.feature.points.length - 1];
  const axis: Point = [
    (b[0] - a[0]) / flight.length,
    (b[1] - a[1]) / flight.length,
  ];
  return [
    [-0.12, -1.6],
    [flight.length + 0.12, -1.6],
    [flight.length + 0.12, 1.6],
    [-0.12, 1.6],
    [-0.12, -1.6],
  ].map(
    ([u, v]): Point => [
      a[0] + axis[0] * u - axis[1] * v,
      a[1] + axis[1] * u + axis[0] * v,
    ],
  );
});
export const aveMariaStairs = stairFlights.find(
  (flight) => flight.feature.id === 255297754,
);
if (!aveMariaStairs) throw new Error('Missing Ave Maria approach steps.');
export const aveMariaStairCut = (() => {
  const [a, b] = aveMariaStairs.feature.points;
  const normal = projectRoute(a, [a, b]).normal;
  const offset = (p: Point, side: number): Point => [
    p[0] + normal[0] * side * 1.65,
    p[1] + normal[1] * side * 1.65,
  ];
  return [
    offset(a, -1),
    offset(b, -1),
    offset(b, 1),
    offset(a, 1),
    offset(a, -1),
  ];
})();
export const artilleryEntrance = (() => {
  const wall = walls.find((item) => item.id === 1532977610);
  if (!wall) throw new Error('Missing gallery rampart wall.');
  const projection = projectRoute([135.2, 132.97], wall.points);
  const sign = inside(
    [
      projection.point[0] + projection.normal[0],
      projection.point[1] + projection.normal[1],
    ],
    rampartBoundary,
  )
    ? -1
    : 1;
  const normal: Point = [
    projection.normal[0] * sign,
    projection.normal[1] * sign,
  ];
  const point: Point = [
    projection.point[0] + normal[0] * 0.9,
    projection.point[1] + normal[1] * 0.9,
  ];
  const approach: Point = [
    point[0] + normal[0] * 1.5,
    point[1] + normal[1] * 1.5,
  ];
  return {
    point,
    normal,
    approach,
    angle: Math.atan2(normal[0], normal[1]),
    floor: unretainedElevation(...approach),
  };
})();
function brickGateCrestElevation(x: number, z: number) {
  const fence = walls.find((wall) => wall.id === 1303806149);
  if (!fence) throw new Error('Missing Brick Gate garden fence.');
  const first = fence.points[0],
    last = fence.points[fence.points.length - 1];
  const route = [first, last];
  const start = originalElevation(...first),
    end = originalElevation(...last);
  const projection = projectRoute([x, z], route);
  let lift = 0;
  for (const point of brickGateFenceSurvey) {
    const t = projectRoute(point, route).fraction;
    lift = Math.max(
      lift,
      originalElevation(...point) - start - (end - start) * t,
    );
  }
  return start + (end - start) * projection.fraction + lift;
}
export function brickGateFenceLevel(x: number, z: number) {
  return brickGateCrestElevation(x, z) + 0.03;
}
const accessStairs = stairFlights.find(
  (flight) => flight.feature.id === 284582284,
);
const roadCover = upperCovers.find((cover) => cover.id === 28811769);
const stairwellPostern = posterns.find(
  (postern) => postern.feature.id === 28811769,
);
if (!accessStairs || !roadCover || !stairwellPostern)
  throw new Error('The road crossing stairwell is missing.');
accessStairs.levels[0] = posternFloor(
  stairwellPostern,
  stairwellPostern.feature.points[stairwellPostern.feature.points.length - 1],
);
const bend = accessStairs.feature.points[1],
  landing = accessStairs.feature.points[2];
const stairRun = Math.hypot(landing[0] - bend[0], landing[1] - bend[1]);
const cutEnd = landing;
const stairNormal: Point = [
  (-(landing[1] - bend[1]) * 1.65) / stairRun,
  ((landing[0] - bend[0]) * 1.65) / stairRun,
];
const opening: Pair[] = [
  [bend[0] + stairNormal[0], bend[1] + stairNormal[1]],
  [cutEnd[0] + stairNormal[0], cutEnd[1] + stairNormal[1]],
  [cutEnd[0] - stairNormal[0], cutEnd[1] - stairNormal[1]],
  [bend[0] - stairNormal[0], bend[1] - stairNormal[1]],
  [bend[0] + stairNormal[0], bend[1] + stairNormal[1]],
];
const notched = polygonClipping.difference(
  [roadCover.footprint.map(([x, z]): Pair => [x, z])],
  [opening],
);
export const stairwellFootprint: Point[] = opening.map(([x, z]) => [x, z]);
if (notched.length !== 1 || notched[0].length !== 1)
  throw new Error(
    'The access stairwell must open onto the side of the road deck.',
  );
roadCover.footprint = notched[0][0].map(([x, z]): Point => [x, z]);
const taborVaults = posterns
  .filter((postern) => posternIds.has(postern.feature.id))
  .map((postern) => ({ postern, route: posternVaultRoute(postern) }));
for (let row = 0; row <= terrainField.rows; row++)
  for (let col = 0; col <= terrainField.columns; col++) {
    const point: Point = [
      terrainField.minX + col * 5,
      terrainField.minZ + row * 5,
    ];
    for (const flight of stairFlights) {
      // Exact channel cuts preserve the northern landings; coarse-grid excavation sinks them.
      if (brickGateStairs.includes(flight)) continue;
      const projection = projectRoute(point, flight.feature.points);
      if (projection.distance >= 5) continue;
      const level =
        flight.levels[0] +
        ((flight.levels[1] - flight.levels[0]) * projection.along) /
          flight.length -
        0.3;
      const index = row * 341 + col;
      const weight = 1 - smooth((projection.distance - 2) / 3);
      terrainField.heights[index] = Math.min(
        terrainField.heights[index],
        terrainField.heights[index] +
          (level - terrainField.heights[index]) * weight,
      );
    }
  }
for (let row = 0; row <= taborTerrainField.rows; row++)
  for (let col = 0; col <= taborTerrainField.columns; col++) {
    const point: Point = [
      taborTerrainField.minX + col,
      taborTerrainField.minZ + row,
    ];
    let level = excavatedElevation(point);
    const cover = coverAt(point);
    const stairDistance = Math.min(
      ...stairFlights.map(
        (flight) => projectRoute(point, flight.feature.points).distance,
      ),
    );
    const approaches = posterns
      .filter((postern) =>
        [8888304, 28811769, 183917808].includes(postern.feature.id),
      )
      .map((postern) => ({
        postern,
        weight:
          1 -
          smooth(
            (projectRoute(point, postern.access).distance -
              postern.width / 2 -
              0.35) /
              1,
          ),
      }));
    const approachWeight = Math.max(
      ...approaches.map((approach) => approach.weight),
    );
    const stairWeight = 1 - smooth((stairDistance - 1.65) / 3);
    if (cover)
      for (const { postern, route } of taborVaults) {
        const distance = projectRoute(point, route).distance;
        const weight = 1 - smooth((distance - postern.width / 2 - 0.5) / 1.5);
        level +=
          Math.min(0, posternFloor(postern, point) - 0.12 - level) * weight;
      }
    if (cover && [8888304, 183917808].includes(cover.id)) {
      const postern = approaches.find(
        ({ postern }) => postern.feature.id === cover.id,
      )?.postern;
      if (!postern)
        throw new Error('The Tabor tunnel soil support is missing.');
      const distance = projectRoute(point, postern.feature.points).distance;
      const weight = smooth((distance - postern.width / 2 - 0.5) / 1);
      level += (coverElevation(cover, ...point) - 0.1 - level) * weight;
    }
    if (!cover && !lowerPassage(point)) {
      const distance = Math.min(
        ...upperCovers
          .filter((cover) => posternIds.has(cover.id))
          .map((cover) => projectRoute(point, cover.footprint).distance),
      );
      const weight = 1 - smooth((distance - 1.5) / 3.5);
      level +=
        (pevnostiGrade(point).level - level) *
        weight *
        (1 - approachWeight) *
        (1 - stairWeight);
    }
    if (!cover)
      for (const { postern, weight } of approaches)
        level +=
          Math.min(0, posternFloor(postern, point) - 0.12 - level) * weight;
    if (!cover) {
      const exit =
        stairwellPostern.feature.points[
          stairwellPostern.feature.points.length - 1
        ];
      const stairBase = accessStairs.feature.points[0];
      const forecourt = projectRoute(point, [exit, stairBase]);
      const weight = 1 - smooth((forecourt.distance - 2) / 2);
      const floor =
        posternFloor(stairwellPostern, exit) +
        (accessStairs.levels[0] - posternFloor(stairwellPostern, exit)) *
          (forecourt.along / forecourt.length);
      level += (floor - 0.12 - level) * weight;
    }
    for (const flight of stairFlights) {
      let along = 0;
      for (let index = 1; index < flight.feature.points.length; index++) {
        const projection = projectRoute(
          point,
          flight.feature.points.slice(index - 1, index + 1),
        );
        const clearance = flight.feature.id === 284582284 ? 2.5 : 1.65;
        const weight = 1 - smooth((projection.distance - clearance) / 3);
        const step = Math.floor(
          ((along + projection.along) / flight.length) * flight.count,
        );
        const floor =
          flight.levels[0] +
          ((flight.levels[1] - flight.levels[0]) * step) / flight.count;
        level += Math.min(0, floor - 0.3 - level) * weight;
        along += projection.length;
      }
    }
    const edge = Math.min(
      point[0] - taborTerrainField.minX,
      taborTerrainField.maxX - point[0],
      point[1] - taborTerrainField.minZ,
      taborTerrainField.maxZ - point[1],
    );
    taborTerrainField.heights[row * 91 + col] =
      fieldElevation(terrainField, ...point) +
      (level - fieldElevation(terrainField, ...point)) * smooth(edge / 5);
  }
export function stairElevation(
  flight: (typeof stairFlights)[number],
  point: Point,
) {
  const t = projectRoute(point, flight.feature.points).along / flight.length;
  const step = Math.min(flight.count, Math.floor(t * flight.count + 1e-8));
  return (
    flight.levels[0] +
    ((flight.levels[1] - flight.levels[0]) * step) / flight.count
  );
}
export const gardenExitAccess = (() => {
  const feature = paths.find((path) => path.id === 1372221841);
  const door = posterns.find((postern) => postern.feature.id === 12461779632);
  if (!feature || !door)
    throw new Error('The mapped garden exit footway is missing.');
  const start = gardenDoorCenter;
  const end = feature.points[0];
  const length = Math.hypot(end[0] - start[0], end[1] - start[1]);
  const axis: Point = [
    (end[0] - start[0]) / length,
    (end[1] - start[1]) / length,
  ];
  const normal: Point = [-axis[1], axis[0]];
  const count = Math.ceil(length / 0.25);
  const point = (index: number, across = 0): Point => [
    start[0] + (axis[0] * length * index) / count + normal[0] * across,
    start[1] + (axis[1] * length * index) / count + normal[1] * across,
  ];
  const floor = posternFloor(door, start);
  const levels = Array.from({ length: count + 1 }, (_, index) =>
    (index * length) / count < 1.4 ? floor : gardenExitGrade(point(index)),
  );
  return {
    feature,
    start,
    end,
    axis,
    normal,
    length,
    count,
    levels,
    point,
    width: 1.6,
    height: (along: number) => {
      const index = Math.min(count - 1, Math.floor(along));
      return (
        levels[index] + (levels[index + 1] - levels[index]) * (along - index)
      );
    },
  };
})();
export function gardenExitFloor(point: Point) {
  const access = gardenExitAccess;
  const projection = projectRoute(point, [access.start, access.end]);
  if (projection.distance > access.width / 2 + 0.02) return;
  return access.height((projection.along / access.length) * access.count);
}
export function standingElevation(point: Point, previousHeight = Infinity) {
  if (
    inside(point, casemateUphillExit.footprint) &&
    previousHeight < casemateUphillExit.floor + 0.4
  )
    return casemateUphillFloor(point);
  const [casemateU, casemateV] = casemateCoordinates(point);
  if (
    Math.abs(casemateU) < 0.86 &&
    casemateV >= -4.25 &&
    casemateV <= 0.7 &&
    previousHeight < casemateDoor.floor + 2.5
  )
    return casemateDoor.floor;
  const gallery = riversideGallerySupport(point);
  if (gallery && (!gallery.underground || previousHeight < gallery.floor + 5.3))
    return gallery.floor;
  const exitFloor = gardenExitFloor(point);
  if (exitFloor !== undefined) return exitFloor;
  const arcadeFloor = cemeteryArcadeFloor(point);
  if (arcadeFloor !== undefined) return arcadeFloor;
  if (slavinPrecinct(point)) {
    const [, v] = slavinCoordinates(point);
    const step = Math.max(0, Math.min(7, Math.ceil((6.4 - v) / 0.7)));
    return Math.max(
      elevation(...point),
      elevation(...slavin.point) + step * 0.15,
    );
  }
  const upper = upperElevation(...point);
  if (coverAt(point) && previousHeight >= upper - 0.8) return upper;
  const stairs = stairFlights.find(
    (flight) => projectRoute(point, flight.feature.points).distance < 1.35,
  );
  return stairs ? stairElevation(stairs, point) : elevation(...point);
}
export function featureElevation(feature: Feature, point: Point) {
  if (feature.id === gardenExitAccess.feature.id) {
    const floor = gardenExitFloor(point);
    if (floor !== undefined) return floor - 0.085;
  }
  const arcadeFloor = cemeteryArcadeFloor(point);
  if (arcadeFloor !== undefined) return arcadeFloor - 0.05;
  const stairs = stairFlights.find(
    (flight) => flight.feature.id === feature.id,
  );
  if (stairs) return stairElevation(stairs, point);
  if (
    riversideTunnelIds.has(feature.id) ||
    ['Rašínovo nábřeží', 'Podolské nábřeží'].includes(feature.tags.name ?? '')
  ) {
    const gallery = riversideGallerySupport(point);
    if (gallery) return gallery.floor + (feature.id === 78879996 ? 0.18 : 0);
  }
  if (pevnostiIds.includes(feature.id)) return originalElevation(...point);
  return lowerGatePathIds.has(feature.id) ||
    posternIds.has(feature.id) ||
    feature.tags.tunnel ||
    Number(feature.tags.layer) < 0
    ? elevation(...point)
    : upperElevation(...point);
}

export function cemeteryArcadeFloor(point: Point) {
  const arcade = cemeteryArcades.find((arcade) =>
    inside(point, arcade.feature.points),
  );
  return arcade ? foundation(arcade.feature) + 0.05 : undefined;
}

function terrainWallProfile(feature: Feature, point: Point, normal: Point) {
  const ground =
    feature.id === 51700612 ? elevation(...point) : upperElevation(...point);
  const city = feature.tags.barrier === 'city_wall';
  const retaining = feature.tags.barrier === 'retaining_wall';
  const height = meters(feature.tags.height, 0);
  const minimum = Math.min(
    ground,
    ...[-0.5, 0.5].map((offset) =>
      elevation(point[0] + normal[0] * offset, point[1] + normal[1] * offset),
    ),
  );
  const bottom = minimum - (retaining ? 1.5 : 0.3);
  if ([515345432, -89545111].includes(feature.id))
    return {
      bottom: Math.min(bottom, aveMariaFloor() - 0.5),
      top: aveMariaFloor() + 4.4,
    };
  if (feature.id === 51700612) return { bottom, top: ground + 1.05 };
  if (feature.id === 55117755) return { bottom, top: ground + 0.95 };
  if (gardenLatticeWallIds.has(feature.id))
    return { bottom, top: ground + 1.95 };
  if (cemeterySolidWallIds.has(feature.id))
    return { bottom, top: ground + 3.6 };
  if (height) return { bottom, top: ground + height };
  if (
    feature.id === 698001346 &&
    projectRoute(point, feature.points.slice(1)).distance < 0.02
  )
    return { bottom, top: pevnostiGrade(point).level + 1.05 };
  if (
    (!city && !retaining) ||
    feature.tags.building ||
    Number(feature.tags.layer) > 0
  )
    return { bottom, top: ground + (city ? 1.5 : retaining ? 1.05 : 1.3) };
  if (feature.id === rampartWallId) {
    const terrace = rampartTerrace(point);
    if (!terrace)
      throw new Error('A rampart wall lies outside its terrace profile.');
    const foot = Math.min(
      ...[-12, -8, -4, 4, 8, 12].map((offset) =>
        rawElevation(
          point[0] + normal[0] * offset,
          point[1] + normal[1] * offset,
        ),
      ),
    );
    const chapterWall =
      point[0] < -250
        ? smooth((point[1] + 105) / 8) * (1 - smooth((point[1] + 10) / 7))
        : 0;
    return {
      bottom: Math.min(minimum, foot) - 1.5,
      top: terrace.level + 1.5 + chapterWall * 3,
    };
  }
  const upper = Math.max(
    ground,
    ...[-1, 1].map((side) => {
      const samples = (retaining ? [0.5, 1, 1.5] : [4, 8, 12])
        .map((offset) =>
          (retaining ? upperElevation : elevation)(
            point[0] + normal[0] * offset * side,
            point[1] + normal[1] * offset * side,
          ),
        )
        .sort((a, b) => a - b);
      return samples[1];
    }),
  );
  const rise = upper - ground;
  const supportedGround = ground + rise * smooth((rise - 0.5) / 1.5);
  const entranceWeight = taborWallWeight(feature, point);
  const existingTop = supportedGround + 1.5;
  const top =
    existingTop +
    (Math.max(taborLevel + 7, ground + 2.4) - existingTop) * entranceWeight;
  return {
    bottom,
    top: retaining
      ? Math.max(ground + 1.05, supportedGround + 0.25)
      : feature.id === 8888302
        ? top + (gardenWallCrest(point) - top) * gardenWallWeight(point)
        : top,
  };
}

const wallCrests = new WeakMap<Feature, number[]>();
export function wallProfile(feature: Feature, point: Point, normal: Point) {
  const bank = retainedStreetBanks.find(
    (bank) =>
      bank.wall.id === feature.id &&
      projectRoute(point, bank.wall.points).distance < 0.01,
  );
  if (bank) {
    const projection = projectRoute(point, bank.wall.points);
    return {
      bottom:
        (retainedStreetSection(point)?.level ?? elevation(...point)) - 0.3,
      top: [-9000001, -9000002, -9000103, -9001000].includes(feature.id)
        ? streetBankCrest(bank, projection) + 0.18
        : retainedStreetBankElevation(bank, projection.point) + 0.18,
    };
  }
  const profile = terrainWallProfile(feature, point, normal);
  if (
    feature.id === 51718886 &&
    feature.tags.barrier === 'retaining_wall' &&
    !meters(feature.tags.height, 0) &&
    !(Number(feature.tags.layer) > 0)
  )
    return profile;
  if (feature.tags.barrier === 'fence') return profile;
  let crests = wallCrests.get(feature);
  if (!crests) {
    const points = feature.points;
    const closed =
      points.length > 2 &&
      points[0][0] === points.at(-1)?.[0] &&
      points[0][1] === points.at(-1)?.[1];
    crests = points.map((point, index) => {
      const before =
        points[index - 1] ?? (closed ? points[points.length - 2] : point);
      const after = points[index + 1] ?? (closed ? points[1] : point);
      const dx = after[0] - before[0],
        dz = after[1] - before[1];
      const length = Math.hypot(dx, dz) || 1;
      return terrainWallProfile(feature, point, [-dz / length, dx / length])
        .top;
    });
    const anchors = [...crests];
    const inferredRetaining =
      feature.tags.barrier === 'retaining_wall' &&
      !meters(feature.tags.height, 0) &&
      !(Number(feature.tags.layer) > 0);
    for (let i = 1; i < points.length && !inferredRetaining; i++) {
      const a = points[i - 1],
        b = points[i];
      const dx = b[0] - a[0],
        dz = b[1] - a[1];
      const length = Math.hypot(dx, dz);
      if (length < 0.001) continue;
      const count = Math.ceil(length / 4);
      let lift = 0;
      for (let j = 1; j < count; j++) {
        const t = j / count;
        const sample: Point = [a[0] + dx * t, a[1] + dz * t];
        const top = terrainWallProfile(feature, sample, [
          -dz / length,
          dx / length,
        ]).top;
        lift = Math.max(
          lift,
          top - anchors[i - 1] - (anchors[i] - anchors[i - 1]) * t,
        );
      }
      crests[i - 1] = Math.max(crests[i - 1], anchors[i - 1] + lift);
      crests[i] = Math.max(crests[i], anchors[i] + lift);
    }
    if (closed)
      crests[0] = crests[crests.length - 1] = Math.max(
        crests[0],
        crests[crests.length - 1],
      );
    wallCrests.set(feature, crests);
  }
  const { segment, fraction } = projectRoute(point, feature.points);
  const top =
    crests[segment] + (crests[segment + 1] - crests[segment]) * fraction;
  let crest =
    feature.id === 8888302 && point[1] <= 208.73 ? gardenWallCrest(point) : top;
  if (feature.id === 1532977610) {
    const distance = Math.hypot(point[0] + 279, point[1] - 116);
    if (distance < 19)
      crest +=
        Math.max(0, originalElevation(-273.65, 121.15) + 3.15 - crest) *
        (1 - smooth(Math.max(0, distance - 12) / 7));
  }
  return {
    bottom: brickGateEnvelope(point)
      ? Math.min(
          crest,
          Math.max(profile.bottom, originalElevation(...point) - 0.25),
        )
      : profile.bottom,
    top: crest,
  };
}

export function retainedWallOffsets(
  point: Point,
  thickness: number,
  profile: { bottom: number; top: number },
) {
  return {
    inset: Math.min(0.35, thickness / 2),
    outer: Math.min(0.02, thickness / 20),
    footing: Math.max(2.4, thickness + (profile.top - profile.bottom) * 0.14),
    batter: exposedRockAt(point, 1)
      ? Math.min(2, (profile.top - profile.bottom) * 0.12)
      : 0,
  };
}
const mainRampart = walls.find((wall) => wall.id === rampartWallId);
if (!mainRampart) throw new Error('The main rampart is missing.');

export const cemeteryCornerShrine = (() => {
  const feature = buildings.find((building) => building.id === 459551122);
  const street = paths.find((path) => path.id === 27762643);
  if (!feature || !street)
    throw new Error('The cemetery corner shrine alignment is missing.');
  const point = center(feature.points);
  const toward = projectRoute(point, street.points).point;
  return {
    feature,
    point,
    ground: foundation(feature),
    angle: Math.atan2(toward[0] - point[0], toward[1] - point[1]),
  };
})();
export const sculptures = monuments
  .filter(
    ({ id, point, tags }) =>
      modeledSculptureIds.has(id) &&
      tags.name &&
      (tags.artwork_type === 'statue' ||
        tags.memorial === 'statue' ||
        tags.memorial === 'bust') &&
      point[0] > bounds.minX &&
      point[0] < bounds.maxX &&
      point[1] > bounds.minZ &&
      point[1] < bounds.maxZ &&
      !cemeteries.some((cemetery) => inside(point, cemetery.points)),
  )
  .map((monument) => {
    let point = monument.point;
    if (monument.id === 1200790218) {
      const projection = projectRoute(point, mainRampart.points);
      const normal = projection.normal;
      const inward = inside(
        [projection.point[0] + normal[0], projection.point[1] + normal[1]],
        mainRampart.points,
      )
        ? normal
        : ([-normal[0], -normal[1]] as const);
      const thickness = wallThickness(mainRampart, projection.point);
      const profile = wallProfile(mainRampart, projection.point, normal);
      const offsets = retainedWallOffsets(projection.point, thickness, profile);
      const ground = elevation(...point) - 0.3;
      const t = Math.max(
        0,
        Math.min(1, (ground - profile.bottom) / (profile.top - profile.bottom)),
      );
      const face =
        offsets.footing + (offsets.inset + thickness - offsets.footing) * t;
      const clearance = face + 0.3;
      point = [
        projection.point[0] + inward[0] * clearance,
        projection.point[1] + inward[1] * clearance,
      ];
    }
    return {
      ...monument,
      point,
      angle: myslbekIds.has(monument.id)
        ? monument.point[0] < -190
          ? (() => {
              const p = projectRoute(point, mainRampart.points);
              const sign = inside(
                [p.point[0] + p.normal[0], p.point[1] + p.normal[1]],
                mainRampart.points,
              )
                ? 1
                : -1;
              return Math.atan2(p.normal[0] * sign, p.normal[1] * sign);
            })()
          : -Math.PI / 2
        : monument.id === 1751591206
          ? Math.PI * 0.35
          : monument.id === 4294837398
            ? (() => {
                const wall = walls.find((wall) => wall.id === 56084052);
                if (!wall) throw new Error('Missing St. Procopius enclosure.');
                const { normal } = projectRoute(point, wall.points);
                return Math.atan2(normal[0], normal[1]);
              })()
            : monument.id === 1200790218
              ? Math.PI / 2
              : Math.PI -
                (Number(monument.tags.direction ?? 0) * Math.PI) / 180,
      scale: myslbekIds.has(monument.id)
        ? 1.35
        : monument.id === 4294837398
          ? 0.72
          : monument.id === 1200790218
            ? 0.85
            : 1,
      width: myslbekIds.has(monument.id)
        ? 4.4 * 1.35
        : monument.id === 3573420654
          ? 1
          : monument.id === 1751591206
            ? 3.2
            : monument.id === 4294837398
              ? 1.25
              : 2.2,
      depth:
        monument.id === 1200790222
          ? 3.8
          : monument.id === 1200790218
            ? 1.1
            : monument.id === 3573420654
              ? 1
              : monument.id === 1751591206
                ? 2.8
                : monument.id === 4294837398
                  ? 0.95
                  : myslbekIds.has(monument.id)
                    ? 2.4 * 1.35
                    : 2.4,
    };
  });
sculptures.push({
  id: -91010,
  point: cemeteryCornerShrine.point,
  tags: { name: 'Cemetery corner niche statue', material: 'stone' },
  angle: cemeteryCornerShrine.angle,
  scale: 0.8,
  width: 0.95,
  depth: 0.85,
});

export function sculptureFootprintContains(point: Point, margin = 0.4) {
  return sculptures.some((sculpture) => {
    const dx = point[0] - sculpture.point[0],
      dz = point[1] - sculpture.point[1];
    return (
      Math.abs(
        dx * Math.cos(sculpture.angle) - dz * Math.sin(sculpture.angle),
      ) <
        sculpture.width / 2 + margin &&
      Math.abs(
        dx * Math.sin(sculpture.angle) + dz * Math.cos(sculpture.angle),
      ) <
        sculpture.depth / 2 + margin
    );
  });
}

riversideDoorways.push(
  ...gateNodes
    .filter(
      (point, index) =>
        point[0] < -230 &&
        point[1] > -10 &&
        point[1] < 150 &&
        projectRoute(point, mainRampart.points).distance < 1 &&
        !gateNodes
          .slice(0, index)
          .some(
            (other) =>
              Math.hypot(point[0] - other[0], point[1] - other[1]) < 0.1,
          ),
    )
    .flatMap((point) => {
      const projection = projectRoute(point, mainRampart.points);
      const profile = wallProfile(
        mainRampart,
        projection.point,
        projection.normal,
      );
      const floor = elevation(...point);
      const thickness = wallThickness(mainRampart, projection.point);
      const offsets = retainedWallOffsets(projection.point, thickness, profile);
      const inner = inside(
        [
          projection.point[0] + projection.normal[0],
          projection.point[1] + projection.normal[1],
        ],
        mainRampart.points,
      )
        ? projection.normal
        : ([-projection.normal[0], -projection.normal[1]] as const);
      const outer = -offsets.batter - 0.3;
      const front =
        point[1] < 0 ? 1.6 : Math.max(2.4, offsets.inset + thickness) + 0.5;
      const center: Point = [
        projection.point[0] + (inner[0] * (front + outer)) / 2,
        projection.point[1] + (inner[1] * (front + outer)) / 2,
      ];
      const axis: Point = [inner[1], -inner[0]];
      return [
        {
          point,
          floor,
          top: Math.max(profile.top, floor + 3.15),
          halfWidth: 0.95,
          spring: 1.55,
          frame: {
            center,
            axis,
            width: 4.4,
            depth: front - outer,
            angle: -Math.atan2(axis[1], axis[0]),
          },
        },
      ];
    }),
);

export function pathWidth(feature: Feature): number {
  const cemeteryPath =
    ['footway', 'path'].includes(feature.tags.highway ?? '') &&
    cemeteries.some((cemetery) =>
      inside(center(feature.points), cemetery.points),
    );
  const width = meters(
    feature.tags.width,
    cemeteryPath
      ? 1.25
      : feature.tags.footway === 'sidewalk'
        ? 1.8
        : ['footway', 'path', 'steps'].includes(feature.tags.highway ?? '')
          ? 2.7
          : feature.tags.highway === 'pedestrian'
            ? 4.6
            : feature.tags.highway === 'service'
              ? 3.6
              : ['cycleway', 'track'].includes(feature.tags.highway ?? '')
                ? 2.8
                : 6.5,
  );
  // Keep the enlarged game's street continuous instead of expanding one survey
  // section across the separately mapped sidewalks and adjacent rock banks.
  return feature.tags.name?.replace(/\s/g, ' ') === 'V Pevnosti'
    ? Math.min(width, 5.2)
    : width;
}

function indexLines(
  lines: readonly Feature[],
  margin: (feature: Feature) => number,
  routes: (feature: Feature) => readonly (readonly Point[])[] = (feature) => [
    feature.points,
  ],
) {
  const index = new Map<
    string,
    { a: Point; b: Point; clearance: number; feature: Feature }[]
  >();
  for (const feature of lines) {
    const clearance = margin(feature);
    for (const points of routes(feature))
      for (let i = 1; i < points.length; i++) {
        const a = points[i - 1],
          b = points[i];
        const segment = { a, b, clearance, feature };
        for (
          let x = Math.floor((Math.min(a[0], b[0]) - clearance) / 20);
          x <= Math.floor((Math.max(a[0], b[0]) + clearance) / 20);
          x++
        )
          for (
            let z = Math.floor((Math.min(a[1], b[1]) - clearance) / 20);
            z <= Math.floor((Math.max(a[1], b[1]) + clearance) / 20);
            z++
          ) {
            const key = `${x},${z}`;
            const entries = index.get(key) ?? [];
            entries.push(segment);
            index.set(key, entries);
          }
      }
  }
  return index;
}
const pathIndex = indexLines(paths, (path) => pathWidth(path) / 2 + 1.5);
const wallIndex = indexLines(
  walls,
  (feature) =>
    feature.points.reduce(
      (width, point) =>
        Math.max(width, wallThickness(feature, point) / 2 + 0.45),
      2,
    ),
  (feature) =>
    [8888302, 33878732].includes(feature.id)
      ? rampartWallRuns(feature)
      : [feature.points],
);
const lineCell = (point: Point) =>
  `${Math.floor(point[0] / 20)},${Math.floor(point[1] / 20)}`;

export function orientedBounds(points: readonly Point[]) {
  let best:
    | {
        center: Point;
        axis: Point;
        width: number;
        depth: number;
        angle: number;
      }
    | undefined;
  let area = Infinity;
  for (let i = 1; i < points.length; i++) {
    const dx = points[i][0] - points[i - 1][0],
      dz = points[i][1] - points[i - 1][1];
    const length = Math.hypot(dx, dz);
    if (length < 0.01) continue;
    let ux = dx / length,
      uz = dz / length;
    let us = points.map(([x, z]) => x * ux + z * uz);
    let vs = points.map(([x, z]) => -x * uz + z * ux);
    if (Math.max(...vs) - Math.min(...vs) > Math.max(...us) - Math.min(...us)) {
      [ux, uz] = [-uz, ux];
      us = points.map(([x, z]) => x * ux + z * uz);
      vs = points.map(([x, z]) => -x * uz + z * ux);
    }
    const width = Math.max(...us) - Math.min(...us),
      depth = Math.max(...vs) - Math.min(...vs);
    if (width * depth < area) {
      area = width * depth;
      const cu = (Math.min(...us) + Math.max(...us)) / 2,
        cv = (Math.min(...vs) + Math.max(...vs)) / 2;
      best = {
        center: [cu * ux - cv * uz, cu * uz + cv * ux],
        axis: [ux, uz],
        width,
        depth,
        angle: -Math.atan2(uz, ux),
      };
    }
  }
  if (!best) throw new Error('Cannot orient a degenerate footprint.');
  return best;
}

function businessFrontage(id: number) {
  const detail = siteDetails.find((detail) => detail.id === id);
  if (!detail) throw new Error(`The mapped street business ${id} is missing.`);
  const name = detail.tags.name;
  if (!name) throw new Error(`Street business ${id} has no mapped name.`);
  const building = buildings.find((building) =>
    inside(detail.point, building.points),
  );
  if (!building) throw new Error(`Business ${id} has no mapped footprint.`);
  const frame = orientedBounds(building.points);
  // Preserve the café's original long frontage instead of its nearest-path end wall.
  const nearest: Point =
    id === 3475173902
      ? [
          frame.center[0] + (frame.axis[1] * frame.depth) / 2,
          frame.center[1] - (frame.axis[0] * frame.depth) / 2,
        ]
      : paths
          .map((path) => projectRoute(frame.center, path.points))
          .sort((a, b) => a.distance - b.distance)[0].point;
  const facades = building.points.slice(1).flatMap((b, index) => {
    const a = building.points[index];
    const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (length < 4) return [];
    const midpoint: Point = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    let normal: Point = [-(b[1] - a[1]) / length, (b[0] - a[0]) / length];
    if (
      inside(
        [midpoint[0] + normal[0] * 0.1, midpoint[1] + normal[1] * 0.1],
        building.points,
      )
    )
      normal = [-normal[0], -normal[1]];
    return [
      {
        midpoint,
        normal,
        width: length,
        score: Math.hypot(midpoint[0] - nearest[0], midpoint[1] - nearest[1]),
      },
    ];
  });
  const facade = facades.sort((a, b) => a.score - b.score)[0];
  if (!facade) throw new Error(`Business ${id} has no supported facade.`);
  const axis: Point = [facade.normal[1], -facade.normal[0]];
  const facadeCenter: Point = [
    facade.midpoint[0] - (facade.normal[0] * frame.depth) / 2,
    facade.midpoint[1] - (facade.normal[1] * frame.depth) / 2,
  ];
  const doorGround =
    Math.max(
      ...[-0.72, 0, 0.72].map((u) =>
        upperElevation(
          facade.midpoint[0] + axis[0] * u + facade.normal[0] * 0.3,
          facade.midpoint[1] + axis[1] * u + facade.normal[1] * 0.3,
        ),
      ),
    ) + 0.06;
  return {
    ...frame,
    center: facadeCenter,
    width: facade.width,
    facade: facade.midpoint,
    normal: facade.normal,
    axis,
    angle: -Math.atan2(axis[1], axis[0]),
    detail,
    name,
    building,
    ground: foundation(building),
    doorGround,
  };
}
export function cafeFrontage() {
  return businessFrontage(3475173902);
}
export const streetFrontages = [3475173902, 693177442, 264494769].map(
  businessFrontage,
);
export const spickaShop = (() => {
  const ruins = buildings.find((feature) => feature.id === 49811196);
  if (!ruins)
    throw new Error('The Špička-side shop has no roadside reference.');
  const midpoint = orientedBounds(ruins.points).center,
    road = projectRoute(midpoint, pevnostiRoad);
  const dx = midpoint[0] - road.point[0],
    dz = midpoint[1] - road.point[1];
  const length = Math.hypot(dx, dz);
  if (length < 0.001)
    throw new Error('The Špička-side shop has no street-facing direction.');
  const shopCenter: Point = [midpoint[0], midpoint[1]];
  const axis: Point = [-dz / length, dx / length];
  const footprint: Point[] = [
    [-3, -2.5],
    [3, -2.5],
    [3, 2.5],
    [-3, 2.5],
    [-3, -2.5],
  ].map(([u, v]) => [
    shopCenter[0] + axis[0] * u - axis[1] * v,
    shopCenter[1] + axis[1] * u + axis[0] * v,
  ]);
  return {
    center: shopCenter,
    axis,
    footprint,
    width: 6,
    depth: 5,
    angle: -Math.atan2(axis[1], axis[0]),
    ground: Math.max(...footprint.map((point) => elevation(...point))) + 0.02,
  };
})();

export const spickaGate = (() => {
  const feature = buildings.find((feature) => feature.id === 49811195);
  if (!feature) throw new Error('The mapped Špička gate remains are missing.');
  const bounds = orientedBounds(feature.points);
  const { normal } = projectRoute(bounds.center, pevnostiRoad);
  const axis: Point = [normal[1], -normal[0]];
  const frame = {
    ...bounds,
    axis,
    angle: -Math.atan2(axis[1], axis[0]),
  };
  const at = (u: number, v: number): Point => [
    frame.center[0] + axis[0] * u + normal[0] * v,
    frame.center[1] + axis[1] * u + normal[1] * v,
  ];
  const sidewalk = paths.find((path) => path.id === 494921219);
  if (!sidewalk) throw new Error('The Špička gate sidewalk is missing.');
  const openings = [-3.6, 3.6].map((offset) => ({
    offset,
    halfWidth: 1.55,
    spring: 1.65,
  }));
  const approaches = openings.map(({ offset, halfWidth }) => {
    const mouth = at(offset, frame.depth / 2);
    const projection = projectRoute(mouth, sidewalk.points);
    const setback = pathWidth(sidewalk) / 2;
    const pavementEdge: Point = [
      projection.point[0] +
        ((mouth[0] - projection.point[0]) * setback) / projection.distance,
      projection.point[1] +
        ((mouth[1] - projection.point[1]) * setback) / projection.distance,
    ];
    return {
      points: [pavementEdge, mouth, at(offset, -frame.depth / 2 - 1)],
      width: halfWidth * 2,
    };
  });
  return {
    feature,
    frame,
    at,
    ground: foundation(feature),
    openings,
    approaches,
  };
})();

export const spickaFrontage = (() => {
  const pump = siteDetails.find((detail) => detail.id === 6589611393);
  const sidewalk = paths.find((path) => path.id === 494921219);
  const house = buildings.find((building) => building.id === 49811193);
  if (!pump || !sidewalk || !house)
    throw new Error(
      'The historic pump and neighboring house frontage are missing.',
    );
  const { normal } = projectRoute(pump.point, sidewalk.points);
  const axis: Point = [normal[1], -normal[0]];
  const at = (u: number, v: number): Point => [
    pump.point[0] + axis[0] * u + normal[0] * v,
    pump.point[1] + axis[1] * u + normal[1] * v,
  ];
  const hedges: SiteProp[] = [];
  for (const [start, end, v, height] of [
    [-14, 11, 1.8, 1.8],
    [-14, -1.6, -0.5, 0.7],
    [1.6, 11, -0.5, 0.7],
  ]) {
    const count = Math.ceil((end - start) / 1.8);
    for (let index = 0; index < count; index++) {
      const point = at(start + ((index + 0.5) * (end - start)) / count, v);
      hedges.push({
        id: `spicka-hedge-${hedges.length}`,
        point,
        angle: -Math.atan2(axis[1], axis[0]),
        width: (end - start) / count + 0.04,
        depth: 0.75,
        height,
        ground: elevation(...point),
      });
    }
  }
  const frame = orientedBounds(house.points);
  const road = projectRoute(frame.center, pevnostiRoad);
  const sign =
    -frame.axis[1] * road.normal[0] + frame.axis[0] * road.normal[1] > 0
      ? 1
      : -1;
  const houseAxis: Point = [frame.axis[0] * sign, frame.axis[1] * sign];
  const houseAt = (u: number, v: number): Point => [
    frame.center[0] + houseAxis[0] * u - houseAxis[1] * v,
    frame.center[1] + houseAxis[1] * u + houseAxis[0] * v,
  ];
  const face = frame.depth / 2 + 1.1;
  const fences = [
    [houseAt(-10, face - 1.1), houseAt(-10, face), houseAt(-1.6, face)],
    [houseAt(1.6, face), houseAt(10, face), houseAt(10, face - 1.1)],
  ];
  return {
    pump,
    pumpAngle: Math.atan2(-normal[0], -normal[1]),
    pumpApron: [at(-1.6, -1.7), at(1.6, -1.7), at(1.6, 2.2), at(-1.6, 2.2)],
    plantingPlot: [at(-15, -1.7), at(12, -1.7), at(12, 2.8), at(-15, 2.8)],
    at,
    hedges,
    curb: [at(-14, 1.8), at(11, 1.8)],
    fences,
    house,
    houseEntrance: houseAt(0, face),
  };
})();

export function westFacade(feature: Feature, z: number) {
  let x = Infinity;
  let angle = -Math.PI / 2;
  let point: Point = [0, z];
  for (let i = 1; i < feature.points.length; i++) {
    const a = feature.points[i - 1],
      b = feature.points[i];
    if (
      Math.abs(b[1] - a[1]) < 0.001 ||
      z < Math.min(a[1], b[1]) ||
      z > Math.max(a[1], b[1])
    )
      continue;
    const candidate = a[0] + ((b[0] - a[0]) * (z - a[1])) / (b[1] - a[1]);
    if (candidate >= x) continue;
    x = candidate;
    const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const nx = -Math.abs(b[1] - a[1]) / length;
    const nz = ((b[0] - a[0]) / length) * Math.sign(b[1] - a[1]);
    angle = Math.atan2(nx, nz);
    point = [x + nx * 0.005, z + nz * 0.005];
  }
  if (!Number.isFinite(x))
    throw new Error('The basilica portal has no supporting facade.');
  return { point, angle };
}

export const cathedralDoorLeaf = {
  widthRatio: 0.68,
  heightRatio: 0.55,
  depth: 0.18,
  offset: 0.045,
};
export const cathedralPortals = [
  [454748868, -0.5],
  [454748869, 7.9],
  [454748870, 16.6],
].map(([id, z]) => {
  const part = parts.find((part) => part.id === id);
  if (!part) throw new Error(`The basilica entrance ${id} is missing.`);
  const face = westFacade(modelBuildingPart(part), z);
  return {
    ...face,
    id,
    width: id === 454748869 ? 4.6 : 2.9,
    height: id === 454748869 ? 6.5 : 4.8,
    threshold: elevation(...face.point) + 0.059,
  };
});

function buildingClearance(feature: Feature, point: Point) {
  if (feature.id === -89545110) return 0.45;
  if (
    feature.id === 24376643 &&
    cathedralPortals.some((door) => {
      const dx = point[0] - door.point[0],
        dz = point[1] - door.point[1];
      const u = dx * Math.cos(door.angle) - dz * Math.sin(door.angle);
      const v = dx * Math.sin(door.angle) + dz * Math.cos(door.angle);
      return Math.abs(u) < door.width * 0.34 && v >= 0 && v < 2;
    })
  )
    return 0.27;
  return 0.7;
}

export function gateFrame(feature: Feature) {
  if (feature.id === 49811195) return spickaGate.frame;
  const passage = features.find(
    (path) =>
      path.tags.tunnel === 'building_passage' &&
      path.points.length >= 2 &&
      inside(center(path.points), feature.points),
  );
  if (!passage) return orientedBounds(feature.points);
  const start = passage.points[0],
    end = passage.points[passage.points.length - 1];
  const dx = end[0] - start[0],
    dz = end[1] - start[1],
    depth = Math.hypot(dx, dz);
  if (depth < 0.01) throw new Error('A mapped gate passage is degenerate.');
  const midpoint: Point = [(start[0] + end[0]) / 2, (start[1] + end[1]) / 2];
  const axis: Point = [-dz / depth, dx / depth];
  // Attached wing walls must not rotate or thicken the actual gate facade.
  const facade = feature.points.filter(
    ([x, z]) =>
      Math.abs(((x - midpoint[0]) * dx + (z - midpoint[1]) * dz) / depth) <
      depth / 2 + 0.75,
  );
  if (facade.length < 2) throw new Error('A mapped gate facade is missing.');
  return {
    center: midpoint,
    axis,
    width:
      2 *
      Math.max(
        ...facade.map(([x, z]) =>
          Math.abs((x - midpoint[0]) * axis[0] + (z - midpoint[1]) * axis[1]),
        ),
      ),
    depth,
    angle: -Math.atan2(axis[1], axis[0]),
  };
}

export function gateOpenings(feature: Feature) {
  const frame = gateFrame(feature);
  if (feature.id === 49811195) return spickaGate.openings;
  const openings = [
    { offset: 0, halfWidth: Math.min(2.25, frame.width * 0.22), spring: 3 },
  ];
  for (const passage of features.filter(
    (candidate) =>
      candidate.tags.tunnel === 'yes' &&
      candidate.tags.highway === 'footway' &&
      inside(center(candidate.points), feature.points),
  )) {
    const point = center(passage.points);
    const offset =
      (point[0] - frame.center[0]) * frame.axis[0] +
      (point[1] - frame.center[1]) * frame.axis[1];
    if (Math.abs(offset) < 2.8) continue;
    openings.push({ offset, halfWidth: 0.95, spring: 2.5 });
  }
  for (const opening of openings.slice(1))
    openings[0].halfWidth = Math.min(
      openings[0].halfWidth,
      Math.abs(opening.offset) - opening.halfWidth - 0.6,
    );
  return openings.sort((a, b) => a.offset - b.offset);
}

export const gateBuildings = [...buildings, gardenPortal]
  .filter((f) => f.tags.historic === 'city_gate')
  .map((feature) => ({
    feature,
    ...gateFrame(feature),
    openings: gateOpenings(feature),
  }));

export const casemateDoor = (() => {
  const { point, normal, wall } = casemateEntrance;
  const offset = wallThickness(wall, point) / 2 + 0.04;
  const face: Point = [
    point[0] + normal[0] * offset,
    point[1] + normal[1] * offset,
  ];
  const axis: Point = [normal[1], -normal[0]];
  const floor =
    Math.max(
      ...[-1.2, 0, 1.2].flatMap((u) =>
        [-0.1, 0.6].map((v) =>
          upperElevation(
            face[0] + axis[0] * u + normal[0] * v,
            face[1] + axis[1] * u + normal[1] * v,
          ),
        ),
      ),
    ) + 0.05;
  return {
    point: face,
    normal,
    angle: Math.atan2(normal[0], normal[1]),
    floor,
  };
})();
export function casemateLocal(u: number, v: number): Point {
  const { point, angle } = casemateDoor;
  return [
    point[0] + Math.cos(angle) * u + Math.sin(angle) * v,
    point[1] - Math.sin(angle) * u + Math.cos(angle) * v,
  ];
}
export function casemateCoordinates(point: Point): Point {
  const dx = point[0] - casemateDoor.point[0],
    dz = point[1] - casemateDoor.point[1];
  return [
    dx * Math.cos(casemateDoor.angle) - dz * Math.sin(casemateDoor.angle),
    dx * Math.sin(casemateDoor.angle) + dz * Math.cos(casemateDoor.angle),
  ];
}
export const casemateRecess = [
  casemateLocal(-1.2, 0.7),
  casemateLocal(1.2, 0.7),
  casemateLocal(1.2, -4.5),
  casemateLocal(-1.2, -4.5),
  casemateLocal(-1.2, 0.7),
];
export const casemateUphillExit = (() => {
  const stairs = features.find((feature) => feature.id === 515345435);
  if (!stairs)
    throw new Error('The mapped stairs beside Na hradbach are missing.');
  const start = stairs.points[0],
    end = stairs.points[stairs.points.length - 1];
  const length = Math.hypot(end[0] - start[0], end[1] - start[1]);
  const axis: Point = [
    (end[0] - start[0]) / length,
    (end[1] - start[1]) / length,
  ];
  const point: Point = [end[0] + axis[0] * 1.3, end[1] + axis[1] * 1.3];
  const floor = upperElevation(...end);
  const normal: Point = [-axis[1], axis[0]];
  const at = (along: number, across: number): Point => [
    start[0] + axis[0] * along + normal[0] * across,
    start[1] + axis[1] * along + normal[1] * across,
  ];
  return {
    stairs,
    start,
    end,
    axis,
    normal,
    point,
    floor,
    length,
    at,
    footprint: [
      at(-0.2, -1),
      at(length + 0.3, -1),
      at(length + 0.3, 1),
      at(-0.2, 1),
      at(-0.2, -1),
    ],
  };
})();
export function casemateUphillFloor(point: Point) {
  const exit = casemateUphillExit,
    projection = projectRoute(point, [exit.start, exit.end]);
  return (
    exit.floor -
    1.6 +
    Math.min(8, Math.floor((projection.along / exit.length) * 8)) * 0.2
  );
}

export type SiteProp = {
  id: string;
  point: Point;
  angle: number;
  width: number;
  depth: number;
  height: number;
  ground?: number;
};
export const siteProps: SiteProp[] = [];
const gardenKiosk = {
  point: [46.5, 55.2] as Point,
  angle: 0.196,
  width: 5.4,
  depth: 3.6,
  height: 3.5,
};
const kioskBorder = (() => {
  const front = retainedStreetWalls.find((wall) => wall.id === -9001000);
  const side = retainedStreetWalls.find((wall) => wall.id === -9000103);
  if (!front || !side) throw new Error('Missing kiosk border walls.');
  const route = [
    ...front.points.slice(3),
    ...side.points
      .filter(([x, z]) => x > 35 && z > 18)
      .slice(0, -1)
      .reverse(),
  ];
  return route
    .slice(1)
    .flatMap((b, index) => {
      const a = route[index],
        length = Math.hypot(b[0] - a[0], b[1] - a[1]);
      const count = Math.ceil(length / 1.3);
      return Array.from({ length: count }, (_, i): Point => {
        const t = (i + 0.5) / count;
        const edge: Point = [
          a[0] + (b[0] - a[0]) * t,
          a[1] + (b[1] - a[1]) * t,
        ];
        const road = retainedStreetCorridors
          .map((corridor) => projectRoute(edge, corridor.points))
          .reduce((a, b) => (a.distance < b.distance ? a : b));
        const normal: Point = [-(b[1] - a[1]) / length, (b[0] - a[0]) / length];
        const sign = Math.sign(
          (edge[0] - road.point[0]) * normal[0] +
            (edge[1] - road.point[1]) * normal[1],
        );
        if (!sign)
          throw new Error('Kiosk planting border overlaps the street centre.');
        return [
          edge[0] + normal[0] * sign * 1.1,
          edge[1] + normal[1] * sign * 1.1,
        ];
      });
    })
    .filter(
      (point) =>
        [front, side].every(
          (wall) => projectRoute(point, wall.points).distance > 0.8,
        ) &&
        Math.hypot(
          point[0] - gardenKiosk.point[0] - Math.sin(gardenKiosk.angle) * 3,
          point[1] - gardenKiosk.point[1] - Math.cos(gardenKiosk.angle) * 3,
        ) > 2.2,
    );
})();
export const referenceBorderBushes = [
  ...Array.from(
    { length: 8 },
    (_, i): Point => [136 + i * 1.45, 179.5 - i * 1.25],
  ),
  ...kioskBorder,
]
  .filter(
    (point) =>
      !paths.some(
        (path) =>
          projectRoute(point, path.points).distance < pathWidth(path) / 2 + 0.8,
      ) &&
      !buildings.some(
        (building) =>
          inside(point, building.points) ||
          projectRoute(point, building.points).distance < 0.8,
      ),
  )
  .map((point, i) => ({
    id: `reference-border-${i}`,
    point,
    angle: point[0] > 120 ? 0.71 : -0.2,
    width: 1.4,
    depth: 1.1,
    height: 0.85,
  }));
siteProps.push(...referenceBorderBushes);
export const karlachBorderBushes = (() => {
  const garden = features.find((feature) => feature.id === 380920698);
  if (!garden) throw new Error('Missing Karlach garden boundary.');
  return garden.points.slice(15).flatMap((b, index, boundary) => {
    if (!index) return [];
    const a = boundary[index - 1];
    const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const normal: Point = [-(b[1] - a[1]) / length, (b[0] - a[0]) / length];
    const middle: Point = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    const sign = inside(
      [middle[0] + normal[0], middle[1] + normal[1]],
      garden.points,
    )
      ? 1
      : -1;
    return Array.from({ length: Math.floor(length / 1.35) }, (_, i) => {
      const t = (i + 0.5) / Math.floor(length / 1.35);
      return [
        a[0] + (b[0] - a[0]) * t + normal[0] * sign * 0.85,
        a[1] + (b[1] - a[1]) * t + normal[1] * sign * 0.85,
      ] as Point;
    })
      .filter(
        (point) =>
          !paths.some(
            (path) =>
              projectRoute(point, path.points).distance <
              pathWidth(path) / 2 + 0.9,
          ) &&
          !siteDetails.some(
            (seat) =>
              seat.tags.amenity === 'bench' &&
              Math.hypot(point[0] - seat.point[0], point[1] - seat.point[1]) <
                2.1,
          ),
      )
      .map((point, i) => ({
        id: `karlach-border-${index}-${i}`,
        point,
        angle: -Math.atan2(b[1] - a[1], b[0] - a[0]),
        width: 1.8,
        depth: 1.15,
        height: 0.85,
      }));
  });
})();
export const karlachBorderBeds = (() => {
  const beds = karlachBorderBushes.map(
    (bush): Polygon => [
      [
        [-1, -1],
        [1, -1],
        [1, 1],
        [-1, 1],
        [-1, -1],
      ].map(
        ([u, v]): Pair => [
          bush.point[0] +
            Math.cos(bush.angle) * u * 0.9 +
            Math.sin(bush.angle) * v * 0.78,
          bush.point[1] -
            Math.sin(bush.angle) * u * 0.9 +
            Math.cos(bush.angle) * v * 0.78,
        ],
      ),
    ],
  );
  const first = beds[0];
  if (!first)
    throw new Error('The Karlach border has no viable planting beds.');
  return polygonClipping.union(first, ...beds.slice(1));
})();
export const retainedGardenGuards = retainedStreetWalls
  .filter((wall) => wall.id === -9000103)
  .map((wall) => ({
    wall,
    points: wall.points.filter(([x, z]) => x > -104 && x < 15 && z < -17),
  }));
siteProps.push(...karlachBorderBushes);
for (const guard of retainedGardenGuards)
  for (let i = 1; i < guard.points.length; i++) {
    const a = guard.points[i - 1],
      b = guard.points[i];
    const point: Point = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    const projection = projectRoute(point, guard.wall.points);
    siteProps.push({
      id: `retained-garden-guard-${i}`,
      point,
      angle: -Math.atan2(b[1] - a[1], b[0] - a[0]),
      width: Math.hypot(b[0] - a[0], b[1] - a[1]),
      depth: 0.14,
      height: 1.1,
      ground:
        wallProfile(guard.wall, projection.point, projection.normal).top + 0.05,
    });
  }
export const referenceSites = {
  gardenWell: {
    point: [-30.19, 5.53] as Point,
    angle: 0,
    width: 2.25,
    depth: 2.25,
    height: 4.5,
  },
  gardenFountain: {
    point: [-12.5, 28.5] as Point,
    angle: 0,
    width: 2.5,
    depth: 2.5,
    height: 1.55,
  },
  stairCross: {
    point: [-124, -63.1] as Point,
    angle: Math.PI / 2,
    width: 1.1,
    depth: 1.1,
    height: 5.1,
  },
  hiddenChurch: {
    point: aveMariaPoint(0.2, -11.8),
    angle: aveMariaFrontage.angle,
    width: 12.8,
    depth: 0.7,
    height: 4.8,
  },
  gardenKiosk,
};
siteProps.push(
  ...Object.entries(referenceSites).map(([id, site]) => ({
    id: `reference-${id}`,
    ...site,
  })),
);
const procopius = sculptures.find((sculpture) => sculpture.id === 4294837398);
if (!procopius) throw new Error('The mapped St. Procopius niche is missing.');
const procopiusNicheCenter = procopius.point;
const procopiusNichePoint = (u: number, v: number): Point => [
  procopius.point[0] +
    (Math.cos(procopius.angle) * u + Math.sin(procopius.angle) * v) *
      procopius.scale,
  procopius.point[1] +
    (-Math.sin(procopius.angle) * u + Math.cos(procopius.angle) * v) *
      procopius.scale,
];
for (const side of [-1, 1])
  siteProps.push({
    id: `procopius-niche-${side}`,
    point: procopiusNichePoint(side * 1.575, -0.08),
    angle: procopius.angle,
    width: 1.25 * procopius.scale,
    depth: 0.6 * procopius.scale,
    height: 4.4 * procopius.scale,
    ground: elevation(...procopius.point),
  });
siteProps.push({
  id: 'procopius-niche-back',
  point: procopiusNichePoint(0, -0.37),
  angle: procopius.angle,
  width: 1.9 * procopius.scale,
  depth: 0.08 * procopius.scale,
  height: 4.1 * procopius.scale,
  ground: elevation(...procopius.point),
});
siteProps.push(
  {
    id: 'spicka-pub-rear',
    point: spickaGate.at(3.6, -1.7),
    angle: spickaGate.frame.angle,
    width: 7.2,
    depth: 3,
    height: 5.6,
    ground: spickaGate.ground - 1,
  },
  {
    id: 'historic-pump',
    point: spickaFrontage.pump.point,
    angle: spickaFrontage.pumpAngle,
    width: 0.5,
    depth: 0.5,
    height: 2.5,
  },
  {
    id: 'historic-pump-basin',
    point: spickaFrontage.at(0, -0.7),
    angle: spickaFrontage.pumpAngle,
    width: 0.62,
    depth: 0.62,
    height: 0.55,
  },
  ...spickaFrontage.hedges,
);
for (const [runIndex, run] of spickaFrontage.fences.entries())
  for (let index = 1; index < run.length; index++) {
    const a = run[index - 1],
      b = run[index];
    siteProps.push({
      id: `spicka-frontage-fence-${runIndex}-${index}`,
      point: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2],
      angle: -Math.atan2(b[1] - a[1], b[0] - a[0]),
      width: Math.hypot(b[0] - a[0], b[1] - a[1]),
      depth: 0.14,
      height: 0.95,
    });
  }
export const summerTheatre = (() => {
  const enclosure = walls.find((wall) => wall.id === 1532975411);
  if (!enclosure)
    throw new Error('The northern summer-stage redan is missing.');
  const angle = Math.atan2(0.35, 0.94);
  const at = (u: number, v: number): Point => [
    -278 + Math.cos(angle) * u + Math.sin(angle) * v,
    -232 - Math.sin(angle) * u + Math.cos(angle) * v,
  ];
  const stage: SiteProp = {
    id: 'summer-theatre-stage',
    point: at(0, 0),
    angle,
    width: 8,
    depth: 3.2,
    height: 0.35,
    ground:
      Math.max(
        ...[-4, 4].flatMap((u) =>
          [-1.6, 1.6].map((v) => elevation(...at(u, v))),
        ),
      ) + 0.02,
  };
  const seats: SiteProp[] = Array.from({ length: 5 }, (_, row) =>
    [-1, 1].map((side) => {
      const point = at(side * 2.3, 5 + row * 1.8);
      return {
        id: `summer-theatre-seat-${row}-${side}`,
        point,
        angle,
        width: 2.8,
        depth: 0.75,
        height: 1.05,
        ground: elevation(...point),
      };
    }),
  ).flat();
  const backdrop: SiteProp = {
    id: 'summer-theatre-backdrop',
    point: at(0, -1.4),
    angle,
    width: 7.6,
    depth: 0.18,
    height: 2.8,
    ground: stage.ground,
  };
  for (const prop of [stage, backdrop, ...seats])
    if (
      [-1, 1].some((u) =>
        [-1, 1].some(
          (v) =>
            !inside(
              [
                prop.point[0] +
                  (Math.cos(angle) * u * prop.width) / 2 +
                  (Math.sin(angle) * v * prop.depth) / 2,
                prop.point[1] -
                  (Math.sin(angle) * u * prop.width) / 2 +
                  (Math.cos(angle) * v * prop.depth) / 2,
              ],
              enclosure.points,
            ),
        ),
      )
    )
      throw new Error(`The theatre prop ${prop.id} crosses its enclosure.`);
  siteProps.push(stage, backdrop, ...seats);
  return { enclosure, stage, backdrop, seats, at };
})();
const propAt = (
  frame: { center: Point; axis: Point },
  u: number,
  v: number,
): Point => [
  frame.center[0] + frame.axis[0] * u - frame.axis[1] * v,
  frame.center[1] + frame.axis[1] * u + frame.axis[0] * v,
];
for (const frame of streetFrontages) {
  for (const u of [-1, 1].map(
    (side) => side * Math.min(2.4, frame.width * 0.29),
  ))
    siteProps.push({
      id: `frontage-pot-${frame.detail.id}-${u}`,
      point: propAt(frame, u, frame.depth / 2 + 0.75),
      angle: frame.angle,
      width: 0.48,
      depth: 0.48,
      height: 0.9,
    });
  if (frame.detail.tags.amenity === 'pub')
    for (const u of [-3.6, 3.6])
      siteProps.push({
        id: `pub-table-${u}`,
        point: propAt(frame, u, frame.depth / 2 + 8.4),
        angle: frame.angle,
        width: 2.2,
        depth: 2,
        height: 0.83,
      });
}
for (const u of [6.3, 10.7])
  siteProps.push({
    id: `shop-table-${u}`,
    point: propAt(spickaShop, u, 0),
    angle: spickaShop.angle,
    width: 1.9,
    depth: 2.05,
    height: 0.89,
  });
for (const u of [5, 8.5, 12])
  siteProps.push({
    id: `shop-planter-${u}`,
    point: propAt(spickaShop, u, -2.3),
    angle: spickaShop.angle,
    width: 0.9,
    depth: 0.7,
    height: 1.1,
  });
export const shopGardenFence: Point[][] = [
  [
    [4, 3],
    [4, -3],
    [13, -3],
    [13, 3],
    [10.3, 3],
  ].map(([u, v]) => propAt(spickaShop, u, v)),
  [
    [4, 3],
    [7.7, 3],
  ].map(([u, v]) => propAt(spickaShop, u, v)),
];
export const cathedralGardenFence = (() => {
  const building = buildings.find((building) => building.id === 1054906226);
  const street = paths.find((path) => path.id === 587280816);
  if (!building || !street)
    throw new Error('The cathedral-side garden frontage is missing.');
  const edge = building.points
    .slice(1)
    .map((b, i) => {
      const a = building.points[i];
      const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
      const mid: Point = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
      return {
        a,
        b,
        length,
        distance: projectRoute(mid, street.points).distance,
      };
    })
    .filter((edge) => edge.length > 10)
    .sort((a, b) => a.distance - b.distance)[0];
  if (!edge) throw new Error('The garden has no street-facing wall.');
  const axis: Point = [
    (edge.b[0] - edge.a[0]) / edge.length,
    (edge.b[1] - edge.a[1]) / edge.length,
  ];
  let normal: Point = [-axis[1], axis[0]];
  if (
    inside(
      [
        edge.a[0] + axis[0] + normal[0] * 0.1,
        edge.a[1] + axis[1] + normal[1] * 0.1,
      ],
      building.points,
    )
  )
    normal = [-normal[0], -normal[1]];
  const near = paths
    .map((path) => projectRoute(center(building.points), path.points))
    .sort((a, b) => a.distance - b.distance)[0];
  const door = projectRoute(near.point, [edge.a, edge.b]).along;
  const at = (u: number): Point => [
    edge.a[0] + axis[0] * u + normal[0] * 3,
    edge.a[1] + axis[1] * u + normal[1] * 3,
  ];
  return [
    [at(0), at(Math.max(0, door - 1.5))],
    [at(Math.min(edge.length, door + 1.5)), at(edge.length)],
  ];
})();
export const gardenExitFenceRuns = [-1, 1].map((side) => [
  gardenExitAccess.point(0, side * 0.94),
  gardenExitAccess.point(
    gardenExitAccess.count * (1 - 1.6 / gardenExitAccess.length),
    side * 0.94,
  ),
]);
for (const [prefix, runs, height] of [
  ['cathedral-garden-fence', cathedralGardenFence, 1],
  ['garden-exit-guard', gardenExitFenceRuns, 1.05],
] as const)
  for (const [runIndex, run] of runs.entries()) {
    const a = run[0],
      b = run[1];
    const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const count = Math.ceil(length / 0.5);
    for (let i = 0; i < count; i++) {
      const t = (i + 0.5) / count;
      const point: Point = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
      siteProps.push({
        id: `${prefix}-${runIndex}-${i}`,
        point,
        angle: -Math.atan2(b[1] - a[1], b[0] - a[0]),
        width: length / count,
        depth: 0.08,
        height,
        ground:
          prefix === 'garden-exit-guard'
            ? gardenExitAccess.height(
                (projectRoute(point, [
                  gardenExitAccess.start,
                  gardenExitAccess.end,
                ]).along /
                  gardenExitAccess.length) *
                  gardenExitAccess.count,
              )
            : undefined,
      });
    }
  }
for (const [runIndex, run] of shopGardenFence.entries())
  for (let i = 1; i < run.length; i++) {
    const a = run[i - 1],
      b = run[i];
    siteProps.push({
      id: `shop-fence-${runIndex}-${i}`,
      point: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2],
      angle: -Math.atan2(b[1] - a[1], b[0] - a[0]),
      width: Math.hypot(b[0] - a[0], b[1] - a[1]),
      depth: 0.12,
      height: 0.85,
    });
  }
const cafe = cafeFrontage();
export const cafeTableOffsets = [-2.9, 2.2];
for (const u of cafeTableOffsets) {
  siteProps.push({
    id: `cafe-table-${u}`,
    point: propAt(cafe, u, 4.4),
    angle: cafe.angle,
    width: 1.24,
    depth: 1.24,
    height: 0.83,
  });
  for (const offset of [-1, 1])
    siteProps.push({
      id: `cafe-chair-${u}-${offset}`,
      point: propAt(cafe, u + offset, 4.4),
      angle: cafe.angle,
      width: 0.52,
      depth: 0.52,
      height: 1,
    });
}
siteProps.push({
  id: 'fire-bowl',
  point: propAt(cafe, 3.5, 5.1),
  angle: 0,
  width: 1,
  depth: 1,
  height: 0.6,
});
const romanBridge = monuments.find((monument) => monument.id === 3406793339);
if (!romanBridge) throw new Error('The Romanesque bridge remains are missing.');
const bridgeApproach = paths.find((path) => path.id === 542547559);
if (!bridgeApproach)
  throw new Error('The Romanesque bridge approach is missing.');
const bridgeProjection = projectRoute(romanBridge.point, bridgeApproach.points);
if (bridgeProjection.distance < 0.001)
  throw new Error(
    'The bridge remains have no safe approach-side setback direction.',
  );
const bridgeSetback = Math.max(
  0,
  pathWidth(bridgeApproach) / 2 + 0.8 + 0.3 - bridgeProjection.distance,
);
const bridgeDirection: Point = [
  (romanBridge.point[0] - bridgeProjection.point[0]) /
    bridgeProjection.distance,
  (romanBridge.point[1] - bridgeProjection.point[1]) /
    bridgeProjection.distance,
];
const bridgePoint: Point = [
  romanBridge.point[0] + bridgeDirection[0] * bridgeSetback,
  romanBridge.point[1] + bridgeDirection[1] * bridgeSetback,
];
siteProps.push({
  id: 'roman-bridge',
  point: bridgePoint,
  angle: 0,
  width: 7.6,
  depth: 1.6,
  height: 1.8,
});
export const romanBridgeFenceRuns: Point[][] = [];
let bridgeFenceRun: Point[] = [];
const flushBridgeFence = () => {
  if (bridgeFenceRun.length > 1) romanBridgeFenceRuns.push(bridgeFenceRun);
  bridgeFenceRun = [];
};
for (let index = 0; index <= 90; index++) {
  const point: Point = [
    bridgePoint[0] - 4.5 + index * 0.1,
    bridgePoint[1] + 2.1,
  ];
  if (
    paths.some(
      (path) =>
        ['footway', 'path', 'steps'].includes(path.tags.highway ?? '') &&
        projectRoute(point, path.points).distance < pathWidth(path) / 2 + 0.4,
    )
  )
    flushBridgeFence();
  else bridgeFenceRun.push(point);
}
flushBridgeFence();
for (const [index, run] of romanBridgeFenceRuns.entries()) {
  const a = run[0],
    b = run[run.length - 1];
  siteProps.push({
    id: `roman-bridge-fence-${index}`,
    point: [(a[0] + b[0]) / 2, a[1]],
    angle: 0,
    width: b[0] - a[0],
    depth: 0.12,
    height: 1,
  });
}
const sitePropIndex = new Map<string, SiteProp[]>();
for (const prop of siteProps) {
  const radius = Math.hypot(prop.width, prop.depth) / 2 + 0.3;
  for (
    let x = Math.floor((prop.point[0] - radius) / 5);
    x <= Math.floor((prop.point[0] + radius) / 5);
    x++
  )
    for (
      let z = Math.floor((prop.point[1] - radius) / 5);
      z <= Math.floor((prop.point[1] + radius) / 5);
      z++
    ) {
      const key = `${x},${z}`;
      const entries = sitePropIndex.get(key) ?? [];
      entries.push(prop);
      sitePropIndex.set(key, entries);
    }
}
export function sitePropBlocked(
  point: Point,
  height: number,
  ignoredProp?: string,
) {
  return (
    sitePropIndex.get(
      `${Math.floor(point[0] / 5)},${Math.floor(point[1] / 5)}`,
    ) ?? []
  ).some((prop) => {
    if (prop.id === ignoredProp) return false;
    return (
      height < (prop.ground ?? elevation(...prop.point)) + prop.height - 0.02 &&
      propContains(prop, point, 0.25)
    );
  });
}
export function propContains(prop: SiteProp, point: Point, padding = 0) {
  const dx = point[0] - prop.point[0],
    dz = point[1] - prop.point[1];
  return (
    Math.abs(dx * Math.cos(prop.angle) - dz * Math.sin(prop.angle)) <
      prop.width / 2 + padding &&
    Math.abs(dx * Math.sin(prop.angle) + dz * Math.cos(prop.angle)) <
      prop.depth / 2 + padding
  );
}

export function lowerPassage(point: Point) {
  return posterns.find(
    (postern) =>
      projectRoute(point, postern.access).distance < postern.width / 2 - 0.25,
  );
}
export function gatePassage(
  point: Point,
  height = elevation(...point),
): boolean {
  return gateBuildings.some((gate) => {
    const dx = point[0] - gate.center[0],
      dz = point[1] - gate.center[1];
    const u = dx * gate.axis[0] + dz * gate.axis[1];
    const v = -dx * gate.axis[1] + dz * gate.axis[0];
    return (
      !(
        gate.feature.id === brickGateId &&
        height >= originalElevation(...point) - 0.8
      ) &&
      gate.openings.some(
        (opening) => Math.abs(u - opening.offset) < opening.halfWidth - 0.45,
      ) &&
      Math.abs(v) < gate.depth / 2 + 2
    );
  });
}

export function wallOpening(
  point: Point,
  height = elevation(...point),
): boolean {
  if (
    Math.hypot(
      point[0] - procopiusNicheCenter[0],
      point[1] - procopiusNicheCenter[1],
    ) < 1.25
  )
    return true;
  if (
    projectRoute(point, [casemateUphillExit.start, casemateUphillExit.point])
      .distance < 1 &&
    height < casemateUphillExit.floor + 2
  )
    return true;
  const [u, v] = casemateCoordinates(point);
  if (
    Math.abs(u) < 0.95 &&
    v > -4.25 &&
    v < 0.8 &&
    height < casemateDoor.floor + 2.45
  )
    return true;
  const doorway = riversideDoorways.find(
    (door) =>
      projectRoute(point, [
        framePoint(door.frame, 0, -door.frame.depth / 2 - 0.5),
        framePoint(door.frame, 0, door.frame.depth / 2 + 0.5),
      ]).distance < door.halfWidth,
  );
  if (doorway) {
    const u =
      (point[0] - doorway.frame.center[0]) * doorway.frame.axis[0] +
      (point[1] - doorway.frame.center[1]) * doorway.frame.axis[1];
    return (
      height <
      doorway.floor +
        doorway.spring +
        Math.sqrt(Math.max(0, doorway.halfWidth ** 2 - u ** 2))
    );
  }
  return (
    gatePassage(point, height) ||
    (lowerPassage(point) !== undefined &&
      (!coverAt(point) || height < upperElevation(...point) - 0.8)) ||
    ((!coverAt(point) || height < upperElevation(...point) - 0.8) &&
      gateNodes.some(
        (p) =>
          !inside(p, taborGateNodeExclusion) &&
          Math.hypot(p[0] - point[0], p[1] - point[1]) < 1.7,
      ))
  );
}

export const gravePlots = cemeteries.flatMap((cemetery) => {
  const frame = orientedBounds(cemetery.points);
  const plots: { point: Point; angle: number; axis: Point }[] = [];
  for (let u = -frame.width / 2 + 2; u < frame.width / 2 - 2; u += 2.7)
    for (let v = -frame.depth / 2 + 2; v < frame.depth / 2 - 2; v += 3.5) {
      const point: Point = [
        frame.center[0] + frame.axis[0] * u - frame.axis[1] * v,
        frame.center[1] + frame.axis[1] * u + frame.axis[0] * v,
      ];
      const corners = [-1, 1].flatMap((sx) =>
        [-1, 1].map(
          (sz): Point => [
            point[0] + frame.axis[0] * sx * 0.65 - frame.axis[1] * sz * 1.2,
            point[1] + frame.axis[1] * sx * 0.65 + frame.axis[0] * sz * 1.2,
          ],
        ),
      );
      if (
        corners.some(
          (p) =>
            !inside(p, cemetery.points) ||
            cemetery.holes.some((hole) => inside(p, hole)),
        ) ||
        slavinPrecinct(point, 1.3) ||
        buildings.some((building) =>
          corners.some((p) => inside(p, building.points)),
        ) ||
        (pathIndex.get(lineCell(point)) ?? []).some(
          ({ a, b, clearance }) =>
            segmentDistance(point, a, b) < clearance - 0.15,
        ) ||
        (wallIndex.get(lineCell(point)) ?? []).some(
          ({ a, b }) => segmentDistance(point, a, b) < 1.6,
        )
      )
        continue;
      plots.push({ point, angle: frame.angle, axis: frame.axis });
    }
  return plots;
});
const graveIndex = new Map<string, typeof gravePlots>();
for (const grave of gravePlots) {
  for (
    let x = Math.floor((grave.point[0] - 2) / 10);
    x <= Math.floor((grave.point[0] + 2) / 10);
    x++
  )
    for (
      let z = Math.floor((grave.point[1] - 2) / 10);
      z <= Math.floor((grave.point[1] + 2) / 10);
      z++
    ) {
      const key = `${x},${z}`;
      const entries = graveIndex.get(key) ?? [];
      entries.push(grave);
      graveIndex.set(key, entries);
    }
}

export type StreetFurniture = {
  id: number;
  point: Point;
  angle: number;
  ground: number;
  bench?: boolean;
  lamp?: boolean;
};
export const streetFurniture: StreetFurniture[] = [];
const furnitureIndex = new Map<string, StreetFurniture[]>();
const furnitureCell = (point: Point) =>
  `${Math.floor(point[0] / 5)},${Math.floor(point[1] / 5)}`;

export function furnitureBlocked(
  point: Point,
  height: number,
  ignoredFurniture?: Point,
) {
  return (furnitureIndex.get(furnitureCell(point)) ?? []).some((site) => {
    if (
      ignoredFurniture &&
      site.point[0] === ignoredFurniture[0] &&
      site.point[1] === ignoredFurniture[1]
    )
      return false;
    if (height > site.ground + (site.bench ? 1.2 : 4.9)) return false;
    const dx = point[0] - site.point[0],
      dz = point[1] - site.point[1];
    return site.bench
      ? Math.abs(dx * Math.cos(site.angle) - dz * Math.sin(site.angle)) <
          1.15 &&
          Math.abs(dx * Math.sin(site.angle) + dz * Math.cos(site.angle)) < 0.55
      : Math.hypot(dx, dz) < 0.36;
  });
}

export function blocked(
  point: Point,
  height = elevation(...point),
  options: { ignoredFurniture?: Point; ignoredSiteProp?: string } = {},
): boolean {
  if (!point.every(Number.isFinite) || !Number.isFinite(height)) return true;
  if (
    point[0] < bounds.minX + 4 ||
    point[0] > bounds.maxX - 4 ||
    point[1] < bounds.minZ + 4 ||
    point[1] > bounds.maxZ - 4 ||
    point[0] < -353
  )
    return true;
  if (inRiver(point)) return true;
  const [casemateU, casemateV] = casemateCoordinates(point);
  if (
    Math.abs(casemateU) < 4.2 &&
    casemateV >= -4.3 &&
    casemateV < 0.04 &&
    height < casemateDoor.floor + 4.1 &&
    height + 1.6 > casemateDoor.floor
  )
    return Math.abs(casemateU) > 0.58 || casemateV < -3.95;
  if (furnitureBlocked(point, height, options.ignoredFurniture)) return true;
  if (sitePropBlocked(point, height, options.ignoredSiteProp)) return true;
  if (
    cathedralPortals.some((door) => {
      const dx = point[0] - door.point[0],
        dz = point[1] - door.point[1];
      const u = dx * Math.cos(door.angle) - dz * Math.sin(door.angle);
      const v = dx * Math.sin(door.angle) + dz * Math.cos(door.angle);
      return (
        height < door.threshold + door.height * cathedralDoorLeaf.heightRatio &&
        height + 1.6 > door.threshold &&
        Math.abs(u) < (door.width * cathedralDoorLeaf.widthRatio) / 2 + 0.27 &&
        Math.abs(v - cathedralDoorLeaf.offset) <
          cathedralDoorLeaf.depth / 2 + 0.27
      );
    })
  )
    return true;
  if (
    playgroundEquipment.some(
      (item) =>
        inside(point, item.footprint) ||
        projectRoute(point, item.footprint).distance < 0.25,
    )
  )
    return true;
  if (
    inside(point, spickaShop.footprint) ||
    projectRoute(point, spickaShop.footprint).distance < 0.35
  )
    return true;
  if (
    Math.hypot(
      point[0] - columnShrine.point[0],
      point[1] - columnShrine.point[1],
    ) < 0.95
  )
    return true;
  const gallery = riversideGallerySupport(point);
  if (gallery && height < gallery.floor + 2.4 && height >= gallery.floor - 0.5)
    return false;
  if (slavinPrecinct(point)) {
    const [u, v] = slavinCoordinates(point);
    if (
      (v < 1.7 && Math.abs(u) < 7.4) ||
      (Math.abs(u) < 1.5 && v > 2.3 && v < 4.8)
    )
      return true;
  }
  if (
    siteDetails.some(
      (detail) =>
        detail.id === 390278816 &&
        Math.hypot(point[0] - detail.point[0], point[1] - detail.point[1]) <
          1.2,
    )
  )
    return true;
  const cover = coverAt(point);
  const onUpper =
    cover !== undefined && height >= upperElevation(...point) - 0.8;
  const passage = lowerPassage(point);
  if (passage && !onUpper) return false;
  if (cover && cover.id !== brickGateId && !onUpper) return true;
  if (sculptureFootprintContains(point)) return true;
  const exitDx = point[0] - cemeteryGate.center[0],
    exitDz = point[1] - cemeteryGate.center[1];
  const exitU = Math.abs(
      exitDx * cemeteryGate.axis[0] + exitDz * cemeteryGate.axis[1],
    ),
    exitV = -exitDx * cemeteryGate.axis[1] + exitDz * cemeteryGate.axis[0];
  if (
    (exitU > cemeteryGate.halfWidth &&
      exitU < cemeteryGate.width / 2 &&
      Math.abs(exitV) < cemeteryGate.depth / 2 + 0.2) ||
    (exitU > cemeteryGate.halfWidth - 0.05 &&
      exitU < cemeteryGate.halfWidth + 0.18 &&
      exitV < -0.1 &&
      exitV > -1.8)
  )
    return true;
  for (const door of riversideDoorways) {
    const dx = point[0] - door.frame.center[0],
      dz = point[1] - door.frame.center[1];
    const u = dx * door.frame.axis[0] + dz * door.frame.axis[1],
      v = -dx * door.frame.axis[1] + dz * door.frame.axis[0];
    if (
      Math.abs(u) <= door.frame.width / 2 &&
      Math.abs(v) <= door.frame.depth / 2 &&
      height <= door.top + 0.1
    )
      return !wallOpening(point, height);
  }
  if (
    gateBuildings.some(
      (g) =>
        inside(point, g.feature.points) &&
        !(onUpper && g.feature.id === brickGateId),
    ) &&
    !gatePassage(point, height)
  )
    return true;
  if (wallOpening(point, height)) return false;
  if (
    (
      graveIndex.get(
        `${Math.floor(point[0] / 10)},${Math.floor(point[1] / 10)}`,
      ) ?? []
    ).some((grave) => {
      const dx = point[0] - grave.point[0],
        dz = point[1] - grave.point[1];
      return (
        Math.abs(dx * grave.axis[0] + dz * grave.axis[1]) < 0.82 &&
        Math.abs(-dx * grave.axis[1] + dz * grave.axis[0]) < 1.25
      );
    })
  )
    return true;
  if (
    cemeteryArcadeColumns.some(
      (column) => Math.hypot(point[0] - column[0], point[1] - column[1]) < 0.45,
    )
  )
    return true;
  if (
    (
      platformIndex.get(
        `${Math.floor(point[0] / 20)},${Math.floor(point[1] / 20)}`,
      ) ?? []
    ).some(
      ({ feature: f }) =>
        !cemeteryArcades.some((arcade) => arcade.feature.id === f.id) &&
        ((inside(point, f.points) &&
          !f.holes.some((hole) => inside(point, hole))) ||
          [f.points, ...f.holes].some((ring) =>
            ring.some(
              (p, i) =>
                i > 0 &&
                segmentDistance(point, ring[i - 1], p) <
                  buildingClearance(f, point),
            ),
          )),
    )
  )
    return true;
  return (wallIndex.get(lineCell(point)) ?? []).some(({ a, b, feature }) => {
    if (feature.tags.barrier === 'fence' && onExposedRampartBank(point))
      return false;
    const distance = segmentDistance(point, a, b);
    const halfWidth = wallThickness(feature, point) / 2;
    const clearance = Math.max(
      feature.id === rampartWallId
        ? 2
        : cemeteryArcadeWallIds.has(feature.id)
          ? 0
          : 1,
      halfWidth + 0.45,
    );
    if (distance >= clearance) return false;
    const top = wallProfile(
      feature,
      point,
      projectRoute(point, [a, b]).normal,
    ).top;
    if (height >= top - 0.02) return false;
    if (top - elevation(...point) < 2 && distance >= halfWidth + 0.27)
      return false;
    return !(
      onUpper &&
      cover?.id === brickGateId &&
      feature.tags.barrier !== 'fence' &&
      projectRoute(point, upperPromenade).distance < 1.8
    );
  });
}

const pubGarden = streetFrontages.find(
  (frontage) => frontage.detail.id === 264494769,
);
if (!pubGarden) throw new Error('The Na hradbách garden frontage is missing.');
export const gardenBenchIds = [-91001, -91002, -91003, -91004];
for (const [index, [u, v]] of [
  [-7, 14],
  [-3.5, 18],
  [3.5, 18],
  [7, 14],
].entries())
  siteDetails.push({
    id: gardenBenchIds[index],
    point: propAt(pubGarden, u, pubGarden.depth / 2 + v),
    tags: {
      amenity: 'bench',
      direction: String((-pubGarden.angle * 180) / Math.PI),
    },
  });

// Keep surveyed seats; additions are confined to the pub garden.
for (const detail of siteDetails) {
  const bench = detail.tags.amenity === 'bench',
    lamp = detail.tags.highway === 'street_lamp';
  if (!bench && !lamp) continue;
  if (
    onExposedRampartBank(detail.point) &&
    !paths.some(
      (path) =>
        ['tertiary', 'residential', 'cycleway'].includes(
          path.tags.highway ?? '',
        ) &&
        projectRoute(detail.point, path.points).distance <
          pathWidth(path) / 2 + 2,
    )
  )
    continue;
  const nearest = paths
    .filter((path) => !path.tags.tunnel)
    .map((path) => ({ path, ...projectRoute(detail.point, path.points) }))
    .sort((a, b) => a.distance - b.distance)[0];
  if (!nearest) continue;
  const direction = Number(detail.tags.direction);
  const angle =
    detail.tags.direction !== undefined && Number.isFinite(direction)
      ? Math.PI - (direction * Math.PI) / 180
      : Math.atan2(
          nearest.point[0] - detail.point[0],
          nearest.point[1] - detail.point[1],
        );
  const candidates: Point[] = [detail.point];
  if (bench)
    for (let radius = 0.5; radius <= 4; radius += 0.5)
      for (let step = 0; step < 16; step++) {
        const theta = (step * Math.PI) / 8;
        candidates.push([
          detail.point[0] + Math.cos(theta) * radius,
          detail.point[1] + Math.sin(theta) * radius,
        ]);
      }
  for (const point of candidates) {
    // Keep a relocated seat on its surveyed side of the nearest route.
    const projection = projectRoute(point, nearest.path.points);
    if (
      bench &&
      ((point[0] - projection.point[0]) * (detail.point[0] - nearest.point[0]) +
        (point[1] - projection.point[1]) *
          (detail.point[1] - nearest.point[1]) <
        0 ||
        projection.distance < pathWidth(nearest.path) / 2 + 0.275)
    )
      continue;
    const samples = bench
      ? [-1, 0, 1].flatMap((u) =>
          [-1, 0, 1].map(
            (v): Point => [
              point[0] +
                Math.cos(angle) * u * 0.9 +
                Math.sin(angle) * v * 0.275,
              point[1] -
                Math.sin(angle) * u * 0.9 +
                Math.cos(angle) * v * 0.275,
            ],
          ),
        )
      : [point];
    const levels = samples.map((p) => upperElevation(...p));
    const ground = Math.max(...levels);
    const approach: Point = [
      point[0] + Math.sin(angle) * 1.4,
      point[1] + Math.cos(angle) * 1.4,
    ];
    if (
      samples.some((p) => blocked(p, upperElevation(...p))) ||
      (bench && samples.some((p) => gatePassage(p))) ||
      (bench &&
        samples.some((p) =>
          spickaGate.approaches.some(
            (approach) =>
              projectRoute(p, approach.points).distance <
              approach.width / 2 + 0.3,
          ),
        )) ||
      (bench &&
        samples.some((p) =>
          (pathIndex.get(lineCell(p)) ?? []).some(
            ({ a, b, feature, clearance }) =>
              segmentDistance(p, a, b) < clearance - 1.5 &&
              Math.abs(featureElevation(feature, p) - upperElevation(...p)) <
                1.5,
          ),
        )) ||
      mappedTrees.some(
        (tree) =>
          Math.hypot(point[0] - tree[0], point[1] - tree[1]) <
          (bench ? 1.6 : 0.5),
      ) ||
      (bench &&
        (ground - Math.min(...levels) > 0.24 ||
          blocked(approach, upperElevation(...approach)) ||
          Math.abs(upperElevation(...approach) - ground) > 0.4 ||
          Math.abs(upperElevation(...approach) - upperElevation(...point)) >
            0.4))
    )
      continue;
    const site = { id: detail.id, point, angle, ground, bench, lamp };
    streetFurniture.push(site);
    for (
      let x = Math.floor((point[0] - 1.4) / 5);
      x <= Math.floor((point[0] + 1.4) / 5);
      x++
    )
      for (
        let z = Math.floor((point[1] - 1.4) / 5);
        z <= Math.floor((point[1] + 1.4) / 5);
        z++
      ) {
        const key = `${x},${z}`;
        const entries = furnitureIndex.get(key) ?? [];
        entries.push(site);
        furnitureIndex.set(key, entries);
      }
    break;
  }
}

export const requestedPlantingZones: Point[][] = [
  [
    [137, 210],
    [157, 208],
    [176, 224],
    [179, 246],
    [159, 258],
    [135, 242],
  ],
  [
    [206, 271],
    [224, 264],
    [241, 273],
    [248, 296],
    [220, 296],
    [206, 283],
  ],
  [
    [266, 259],
    [322, 267],
    [316, 302],
    [277, 300],
  ],
];
export function treePositions(): Point[] {
  const atStreetWallJoin = (point: Point) =>
    Math.hypot(point[0] + 85.5, point[1] + 41.5) < 1.6;
  const trees: Point[] = mappedTrees.filter(
    (point) =>
      !atStreetWallJoin(point) &&
      !inside(point, spickaFrontage.plantingPlot) &&
      !(
        platformIndex.get(
          `${Math.floor(point[0] / 20)},${Math.floor(point[1] / 20)}`,
        ) ?? []
      ).some(
        ({ feature }) =>
          inside(point, feature.points) &&
          !feature.holes.some((hole) => inside(point, hole)) &&
          !cemeteryArcades.some((arcade) => arcade.feature.id === feature.id),
      ),
  );
  const rotunda = buildings.find((feature) => feature.id === 560209917);
  if (!rotunda) throw new Error('The mapped Saint Martin rotunda is missing.');
  const rotundaCenter = center(rotunda.points);
  const greenAreas = features.filter(
    (f) =>
      ['park', 'garden'].includes(f.tags.leisure ?? '') ||
      ['grass', 'forest', 'cemetery'].includes(f.tags.landuse ?? '') ||
      ['wood', 'scrub'].includes(f.tags.natural ?? ''),
  );
  const add = (point: Point) => {
    if (
      atStreetWallJoin(point) ||
      retainedStreetSection(point) ||
      blocked(point) ||
      inside(point, spickaFrontage.plantingPlot) ||
      exposedRockAt(point) ||
      slavinPrecinct(point, 5) ||
      Math.hypot(point[0] - rotundaCenter[0], point[1] - rotundaCenter[1]) <
        14 ||
      courts.some((court) => inside(point, court.points)) ||
      cemeteryArcades.some((arcade) => inside(point, arcade.feature.points)) ||
      siteDetails.some(
        (detail) =>
          [390278816, 3475173902].includes(detail.id) &&
          Math.hypot(point[0] - detail.point[0], point[1] - detail.point[1]) <
            (detail.id === 3475173902 ? 10 : 4),
      ) ||
      monuments.some(
        (detail) =>
          detail.id === 3406793339 &&
          Math.hypot(point[0] - detail.point[0], point[1] - detail.point[1]) <
            6,
      ) ||
      sculptures.some(
        (sculpture) =>
          Math.hypot(
            sculpture.point[0] - point[0],
            sculpture.point[1] - point[1],
          ) < 8,
      ) ||
      trees.some(
        (tree) => Math.hypot(tree[0] - point[0], tree[1] - point[1]) < 4,
      )
    )
      return;
    if (
      (pathIndex.get(lineCell(point)) ?? []).some(
        ({ a, b, clearance }) => segmentDistance(point, a, b) < clearance - 0.8,
      )
    )
      return;
    trees.push(point);
  };
  for (const row of features.filter((f) => f.tags.natural === 'tree_row')) {
    for (let i = 1; i < row.points.length; i++) {
      const a = row.points[i - 1],
        b = row.points[i];
      const count = Math.max(
        1,
        Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 9),
      );
      for (let j = 0; j <= count; j++)
        add([
          a[0] + ((b[0] - a[0]) * j) / count,
          a[1] + ((b[1] - a[1]) * j) / count,
        ]);
    }
  }
  for (let x = -330; x < 285; x += 11)
    for (let z = -220; z < 340; z += 11) {
      const p: Point = [x + Math.sin(x * z) * 2.5, z + Math.cos(x + z) * 2.5];
      if (
        greenAreas.some(
          (area) =>
            inside(p, area.points) &&
            !area.holes.some((hole) => inside(p, hole)),
        )
      )
        add(p);
    }
  for (const [index, zone] of requestedPlantingZones.entries()) {
    const spacing = index === 0 ? 2 : 8;
    const inset = index === 0 ? 2 : 3;
    for (
      let x = Math.min(...zone.map((p) => p[0])) + inset;
      x < Math.max(...zone.map((p) => p[0]));
      x += spacing
    )
      for (
        let z = Math.min(...zone.map((p) => p[1])) + inset;
        z < Math.max(...zone.map((p) => p[1]));
        z += spacing
      ) {
        const point: Point =
          index === 0
            ? [x, z]
            : [x + Math.sin(x + z) * 1.2, z + Math.cos(x - z)];
        if (
          !inside(point, zone) ||
          buildings.some(
            (building) =>
              inside(point, building.points) ||
              projectRoute(point, building.points).distance < 4,
          ) ||
          paths.some(
            (path) =>
              projectRoute(point, path.points).distance <
              pathWidth(path) / 2 + 1.1,
          ) ||
          stairFlights.some(
            (flight) => projectRoute(point, flight.feature.points).distance < 3,
          ) ||
          posterns.some(
            (postern) =>
              projectRoute(point, postern.access).distance <
              postern.width / 2 + 2,
          )
        )
          continue;
        add(point);
      }
  }
  return trees.filter(
    ([x, z]) =>
      !(
        (x === 149 && z === 210) ||
        (x === 153 && z === 216) ||
        (x === 156 && z === 220)
      ) &&
      !panoramaSites.some((site) => {
        const dx = x - site.point[0],
          dz = z - site.point[1];
        const u = dx * site.axis[0] + dz * site.axis[1];
        const v = dx * site.inward[0] + dz * site.inward[1];
        return (
          site.sheltered && Math.abs(u) < site.width / 2 + 0.8 && v > 0 && v < 5
        );
      }),
  );
}

export const panoramaSites = [
  { point: [-268, -34] as Point, width: 8.4, sheltered: true },
  { point: [-269.77, -92.08] as Point, width: 6.6, sheltered: false },
].map((site) => {
  const projection = projectRoute(site.point, mainRampart.points);
  const axis: Point = [projection.normal[1], -projection.normal[0]];
  const inward: Point = inside(
    [
      projection.point[0] + projection.normal[0],
      projection.point[1] + projection.normal[1],
    ],
    rampartBoundary,
  )
    ? projection.normal
    : [-projection.normal[0], -projection.normal[1]];
  const at = (u: number, v = 0): Point => [
    projection.point[0] + axis[0] * u + inward[0] * v,
    projection.point[1] + axis[1] * u + inward[1] * v,
  ];
  return {
    ...site,
    point: projection.point,
    axis,
    inward,
    at,
    floor: upperElevation(...at(0, 4)),
    wall: mainRampart,
  };
});

export const panoramaDecks = panoramaSites
  .filter((site) => site.sheltered)
  .map((site) => ({
    floor: site.floor,
    points: [
      site.at(-site.width / 2 - 0.15, 0.9),
      site.at(site.width / 2 + 0.15, 0.9),
      site.at(site.width / 2 + 0.15, 4),
      site.at(-site.width / 2 - 0.15, 4),
      site.at(-site.width / 2 - 0.15, 0.9),
    ],
  }));

export function panoramaOpening(point: Point) {
  return panoramaSites.find((site) => {
    const dx = point[0] - site.point[0],
      dz = point[1] - site.point[1];
    return (
      Math.abs(dx * site.axis[0] + dz * site.axis[1]) < site.width / 2 - 1e-5 &&
      Math.abs(dx * site.inward[0] + dz * site.inward[1]) < 0.1
    );
  });
}

export function safePosition(target: Point): Point {
  if (!blocked(target, standingElevation(target))) return target;
  for (let radius = 3; radius <= 90; radius += 3) {
    for (let angle = 0; angle < Math.PI * 2; angle += Math.PI / 12) {
      const p: Point = [
        target[0] + Math.cos(angle) * radius,
        target[1] + Math.sin(angle) * radius,
      ];
      if (!blocked(p, standingElevation(p))) return p;
    }
  }
  throw new Error('No walkable landing spot near this destination.');
}

function mappedPosition(id: number): Point {
  const feature = features.find((f) => f.id === id);
  if (!feature) throw new Error(`Missing OSM landmark ${id}.`);
  return center(feature.points);
}

export const landmarks: Landmark[] = [
  {
    id: 'basilica',
    title: 'Saints Peter & Paul',
    short: 'The basilica',
    subtitle: 'TWO SPIRES, ONE SKYLINE',
    description:
      'The twin-spired basilica anchors the Vyšehrad skyline. Its mapped building parts include 60 m towers; this MVP turns those OSM volumes into a stylized exterior.',
    position: mappedPosition(24376643),
    view: safePosition([-236, 8]),
  },
  {
    id: 'rotunda',
    title: 'Rotunda of Saint Martin',
    short: 'The rotunda',
    subtitle: 'A LITTLE ROMANESQUE TIME CAPSULE',
    description:
      'A Romanesque round church with an eastern apse, round-arched south portal, tiled roofs and a small lantern. Its mapped footprint anchors an original, approximate exterior model, not a surveyed reconstruction.',
    position: mappedPosition(560209917),
    view: safePosition([91, 83]),
  },
  {
    id: 'gate',
    title: 'Leopold Gate',
    short: 'The gate',
    subtitle: 'ENTER THE FORTRESS',
    description:
      'A gateway through the fortifications. Walk beneath its stylized arch and follow the mapped paths into the park. Gate detail and wall heights are approximate.',
    position: mappedPosition(51718887),
    view: safePosition([100, 160]),
  },
  {
    id: 'river',
    title: 'Above the Vltava',
    short: 'The river view',
    subtitle: 'PRAGUE, WITH A LITTLE PERSPECTIVE',
    description:
      'Pause above the river on the western side of Vyšehrad. The hill follows resampled Czech DMR 5G elevation; the distant scenery and materials remain illustrative.',
    position: [-365, 126],
    view: safePosition([-255, 126]),
  },
];

export const spawn = safePosition(framePoint(leopoldFrame, 0, -18));
export const initialHeading = Math.atan2(
  leopoldFrame.center[0] - spawn[0],
  spawn[1] - leopoldFrame.center[1],
);

export function discoveredNear(point: Point): Landmark[] {
  return landmarks.filter(
    (l) => Math.hypot(point[0] - l.view[0], point[1] - l.view[1]) < 19,
  );
}

export function readProgress(storage: Pick<Storage, 'getItem'>): string[] {
  const raw = storage.getItem('vysehrad-discoveries-v1');
  if (!raw) return [];
  const parsed: unknown = JSON.parse(raw);
  if (!Array.isArray(parsed) || parsed.some((id) => typeof id !== 'string'))
    throw new Error('Saved discoveries are invalid.');
  return [
    ...new Set(parsed.filter((id) => landmarks.some((l) => l.id === id))),
  ];
}
