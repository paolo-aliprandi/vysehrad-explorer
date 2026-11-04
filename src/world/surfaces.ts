import * as THREE from 'three';
import polygonClipping, { type Polygon } from 'polygon-clipping';
import { polygonBoolean } from './polygons';
import {
  elevation,
  upperCovers,
  terrainField,
  approachTerrainField,
  taborTerrainField,
  gardenBankBounds,
  onGardenBankTerrain,
  gardenTerrainElevation,
  courtBankBoundary,
  courtBankBounds,
  courtBankElevation,
  onCourtBankTerrain,
  cliffTerrainBounds,
  cliffTerrainElevation,
  onCliffTerrain,
  retainedWallOffsets,
  riversideDoorways,
  riversideGallery,
  riversideGallerySupport,
  inside,
  cemeteryArcades,
  brickGateStairCuts,
  panoramaDecks,
  aveMariaCourtCuts,
  aveMariaStairCut,
  onAveMariaCourt,
  artilleryEntrance,
  foundation,
  casemateDoor,
  casemateRecess,
  casemateUphillExit,
  retainedStreetAreas,
  retainedStreetAccess,
  onRetainedStreetSurface,
  segmentDistance,
  type Point,
} from './geo';

const streetDrapeBounds = retainedStreetAreas.map(({ polygon }) => ({
  minX: Math.min(...polygon.map((point) => point[0])),
  maxX: Math.max(...polygon.map((point) => point[0])),
  minZ: Math.min(...polygon.map((point) => point[1])),
  maxZ: Math.max(...polygon.map((point) => point[1])),
}));
const streetAccessDrapeBounds =
  streetDrapeBounds[retainedStreetAreas.indexOf(retainedStreetAccess)];
const brickGateCover = upperCovers.find((cover) => cover.id === 51700613);
if (!brickGateCover) throw new Error('Missing Brick Gate terrain cover.');
const brickGateDrapeBounds = {
  minX: Math.min(...brickGateCover.footprint.map((point) => point[0])),
  maxX: Math.max(...brickGateCover.footprint.map((point) => point[0])),
  minZ: Math.min(...brickGateCover.footprint.map((point) => point[1])),
  maxZ: Math.max(...brickGateCover.footprint.map((point) => point[1])),
};

export function clipTerrainAtArcades(
  source: THREE.BufferGeometry,
  sealExcavation = true,
  streetCuts = true,
) {
  // Bound excavation to porch slabs and tunnel mouths, preserving rock above the entrance vault.
  const position = source.attributes.position;
  if (!position.count) return source;
  const outlines = [
    ...cemeteryArcades.map(({ feature }) => ({
      points: feature.points,
      floorBottom: foundation(feature) - 0.15,
      ceiling: Infinity,
    })),
    {
      points: casemateRecess,
      floorBottom: casemateDoor.floor - 0.15,
      ceiling: casemateDoor.floor + 2.7,
    },
    {
      points: casemateUphillExit.footprint,
      floorBottom: casemateUphillExit.floor - 1.8,
      ceiling: Infinity,
    },
  ].map((area) => ({ ...area, seal: true }));
  outlines.push(
    {
      points: aveMariaStairCut,
      floorBottom: 0,
      ceiling: Infinity,
      seal: false,
    },
    ...aveMariaCourtCuts.map((points) => ({
      points,
      floorBottom: 0,
      ceiling: Infinity,
      seal: false,
    })),
    {
      points: artilleryEntrance.apron,
      floorBottom: 0,
      ceiling: Infinity,
      seal: false,
    },
    ...panoramaDecks.map((deck) => ({
      points: deck.points,
      floorBottom: deck.floor - 0.16,
      ceiling: Infinity,
      seal: false,
    })),
    ...brickGateStairCuts.map((points) => ({
      points,
      floorBottom: 0,
      ceiling: Infinity,
      seal: false,
    })),
  );
  if (streetCuts)
    outlines.push(
      ...retainedStreetAreas.map((corridor) => ({
        points: corridor.polygon,
        floorBottom: 0,
        ceiling: Infinity,
        seal: false,
      })),
    );
  const areas = outlines.map((area) => ({
    ...area,
    polygon: [area.points.map(([x, z]) => [x, z])] as Polygon,
    minX: Math.min(...area.points.map((p) => p[0])),
    maxX: Math.max(...area.points.map((p) => p[0])),
    minZ: Math.min(...area.points.map((p) => p[1])),
    maxZ: Math.max(...area.points.map((p) => p[1])),
  }));
  source.computeBoundingBox();
  const box = source.boundingBox;
  if (
    !box ||
    !areas.some(
      (area) =>
        area.minX <= box.max.x &&
        area.maxX >= box.min.x &&
        area.minZ <= box.max.z &&
        area.maxZ >= box.min.z,
    )
  )
    return source;
  const attributes = Object.entries(source.attributes).map(
    ([name, attribute]) => ({
      name,
      attribute,
      output: [] as number[],
    }),
  );
  const emit = (
    point: Point,
    triangle: number[],
    height?: number,
    earthFace = false,
  ) => {
    const [a, b, c] = triangle;
    const ax = position.getX(a),
      az = position.getZ(a);
    const bx = position.getX(b),
      bz = position.getZ(b);
    const cx = position.getX(c),
      cz = position.getZ(c);
    const determinant = (bz - cz) * (ax - cx) + (cx - bx) * (az - cz);
    if (Math.abs(determinant) < 1e-10) return;
    const u =
      ((bz - cz) * (point[0] - cx) + (cx - bx) * (point[1] - cz)) / determinant;
    const v =
      ((cz - az) * (point[0] - cx) + (ax - cx) * (point[1] - cz)) / determinant;
    const weights = [u, v, 1 - u - v];
    for (const { name, attribute, output } of attributes) {
      for (let component = 0; component < attribute.itemSize; component++)
        output.push(
          name === 'position' && component === 1 && height !== undefined
            ? height
            : earthFace && name === 'color' && component < 3
              ? [0.42, 0.35, 0.26][component]
              : triangle.reduce(
                  (sum, index, i) =>
                    sum + weights[i] * attribute.getComponent(index, component),
                  0,
                ),
        );
    }
  };
  const count = source.index?.count ?? position.count;
  for (let i = 0; i < count; i += 3) {
    const triangle = [0, 1, 2].map((offset) =>
      source.index ? source.index.getX(i + offset) : i + offset,
    );
    const points = triangle.map(
      (index): Point => [position.getX(index), position.getZ(index)],
    );
    const xs = points.map((p) => p[0]),
      zs = points.map((p) => p[1]);
    const nearby = areas.filter(
      (area) =>
        triangle.some((index) => position.getY(index) < area.ceiling) &&
        area.minX <= Math.max(...xs) &&
        area.maxX >= Math.min(...xs) &&
        area.minZ <= Math.max(...zs) &&
        area.maxZ >= Math.min(...zs),
    );
    if (!nearby.length) {
      for (const index of triangle)
        for (const { attribute, output } of attributes) {
          for (let component = 0; component < attribute.itemSize; component++)
            output.push(attribute.getComponent(index, component));
        }
      continue;
    }
    const trianglePolygon: Polygon = [points.map(([x, z]) => [x, z])];
    const fragments = nearby.some((area) => !area.seal)
      ? polygonBoolean(
          'difference',
          [trianglePolygon],
          ...nearby.map((area) => [area.polygon]),
        )
      : polygonClipping.difference(
          trianglePolygon,
          ...nearby.map((area) => area.polygon),
        );
    for (const fragment of fragments) {
      const rings = fragment.map((ring) => ring.slice(0, -1));
      const vectors = rings.map((ring) =>
        ring.map(([x, z]) => new THREE.Vector2(x, -z)),
      );
      const flattened = rings.flat();
      const direction =
        (points[1][0] - points[0][0]) * (points[2][1] - points[0][1]) -
        (points[1][1] - points[0][1]) * (points[2][0] - points[0][0]);
      for (const face of THREE.ShapeUtils.triangulateShape(
        vectors[0],
        vectors.slice(1),
      )) {
        const [a, b, c] = face.map((index) => flattened[index]);
        const winding =
          (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
        if (winding * direction < 0) face.reverse();
        for (const index of face) emit(flattened[index], triangle);
      }
      if (sealExcavation)
        for (const ring of rings)
          for (let i = 0; i < ring.length; i++) {
            const a = ring[i],
              b = ring[(i + 1) % ring.length];
            const outline = nearby.find((area) =>
              area.points.some((p, index) => {
                if (!index) return false;
                const previous = area.points[index - 1];
                return (
                  segmentDistance(a, previous, p) < 1e-6 &&
                  segmentDistance(b, previous, p) < 1e-6
                );
              }),
            );
            if (!outline?.seal) continue;
            // Use this terrain triangle's interpolated crest, not a resampled height,
            // so the cut face joins its exact mesh edge without cracks.
            emit(a, triangle, undefined, true);
            emit(b, triangle, undefined, true);
            emit(a, triangle, outline.floorBottom, true);
            emit(b, triangle, undefined, true);
            emit(b, triangle, outline.floorBottom, true);
            emit(a, triangle, outline.floorBottom, true);
          }
    }
  }
  source.setIndex(null);
  for (const { name, attribute, output } of attributes)
    source.setAttribute(
      name,
      new THREE.Float32BufferAttribute(output, attribute.itemSize),
    );
  source.boundingBox = null;
  source.boundingSphere = null;
  return source;
}

function geometry(vertices: number[]) {
  const result = new THREE.BufferGeometry();
  result.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(vertices, 3),
  );
  result.computeVertexNormals();
  return result;
}

const courtBoundary: Polygon = [courtBankBoundary.map(([x, z]) => [x, z])];
const courtBoundaryEdges = courtBankBoundary.slice(1).map((b, index) => {
  const a = courtBankBoundary[index];
  return {
    a,
    b,
    minX: Math.min(a[0], b[0]),
    maxX: Math.max(a[0], b[0]),
    minZ: Math.min(a[1], b[1]),
    maxZ: Math.max(a[1], b[1]),
  };
});
const courtBoundaryIndex = new Map<string, typeof courtBoundaryEdges>();
for (const edge of courtBoundaryEdges)
  for (let x = Math.floor(edge.minX / 20); x <= Math.floor(edge.maxX / 20); x++)
    for (
      let z = Math.floor(edge.minZ / 20);
      z <= Math.floor(edge.maxZ / 20);
      z++
    ) {
      const key = `${x},${z}`;
      const entries = courtBoundaryIndex.get(key) ?? [];
      entries.push(edge);
      courtBoundaryIndex.set(key, entries);
    }
function crossesCourtBoundary(
  x: number,
  z: number,
  width: number,
  depth = width,
) {
  for (let col = Math.floor(x / 20); col <= Math.floor((x + width) / 20); col++)
    for (
      let row = Math.floor(z / 20);
      row <= Math.floor((z + depth) / 20);
      row++
    )
      if (
        courtBoundaryIndex
          .get(`${col},${row}`)
          ?.some(
            (edge) =>
              edge.minX <= x + width &&
              edge.maxX >= x &&
              edge.minZ <= z + depth &&
              edge.maxZ >= z &&
              segmentDistance([x + width / 2, z + depth / 2], edge.a, edge.b) <=
                Math.hypot(width, depth) / 2 + 1e-8,
          )
      )
        return true;
  return false;
}
function emitCourtBankPolygon(
  vertices: number[],
  polygon: Polygon,
  interior: boolean,
  offset = 0,
  sample?: (x: number, z: number) => number,
  ground = courtBankElevation,
  heightCache?: Map<string, number>,
) {
  const contours = polygon.map((ring) =>
    ring.slice(0, -1).map(([x, z]) => new THREE.Vector2(x, -z)),
  );
  const points = contours.flat();
  const heights = points.map((point) => {
    const region =
      ground === cliffTerrainElevation
        ? 'cliff'
        : ground === gardenTerrainElevation
          ? 'garden'
          : 'court';
    const key = `${region}|${interior}|${point.x},${point.y}`;
    const cached = heightCache?.get(key);
    if (cached !== undefined) return cached;
    const gallery =
      sample &&
      sample !== elevation &&
      riversideGallerySupport([point.x, -point.y]);
    const constructed =
      sample &&
      (onRetainedStreetSurface([point.x, -point.y]) ||
        onAveMariaCourt([point.x, -point.y]));
    const height =
      gallery || constructed
        ? sample(point.x, -point.y) + offset
        : ground([point.x, -point.y], interior) +
          offset +
          (sample && sample !== elevation
            ? sample(point.x, -point.y) - elevation(point.x, -point.y)
            : 0);
    heightCache?.set(key, height);
    return height;
  });
  const triangles = THREE.ShapeUtils.triangulateShape(
    contours[0],
    contours.slice(1),
  );
  for (const triangle of triangles) {
    const [a, b, c] = triangle.map((index) => points[index]);
    if ((b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x) < 0)
      triangle.reverse();
    for (const index of triangle) {
      const point = points[index];
      vertices.push(point.x, heights[index], -point.y);
    }
  }
}
export function courtBankTerrain() {
  const { minX, maxX, minZ, maxZ } = gardenBankBounds;
  return retainedTerrain(
    courtBankBounds,
    courtBankElevation,
    1,
    [],
    [
      [
        [minX, minZ],
        [maxX, minZ],
        [maxX, maxZ],
        [minX, maxZ],
        [minX, minZ],
      ],
    ],
  );
}
export function cliffTerrain() {
  return retainedTerrain(
    cliffTerrainBounds,
    cliffTerrainElevation,
    5,
    riversideDoorways.map((door) => door.frame.center),
    riversideGallery.approaches.map((approach) => approach.polygon),
  );
}
export function gardenBankTerrain() {
  return retainedTerrain(gardenBankBounds, gardenTerrainElevation, 1);
}
function retainedTerrain(
  bounds: typeof courtBankBounds,
  ground: typeof courtBankElevation,
  step = 5,
  detailedAt: readonly Point[] = [],
  cutouts: readonly (readonly Point[])[] = [],
) {
  const vertices: number[] = [];
  const heightCache = new Map<string, number>();
  for (let x = bounds.minX; x < bounds.maxX; x += step)
    for (let z = bounds.minZ; z < bounds.maxZ; z += step) {
      const localStep = detailedAt.some(
        (point) =>
          Math.abs(point[0] - x - step / 2) < 15 &&
          Math.abs(point[1] - z - step / 2) < 15,
      )
        ? 1
        : step;
      for (let dx = 0; dx < step; dx += localStep)
        for (let dz = 0; dz < step; dz += localStep)
          for (const triangle of [
            [
              [x + dx, z + dz],
              [x + dx + localStep, z + dz],
              [x + dx, z + dz + localStep],
              [x + dx, z + dz],
            ],
            [
              [x + dx + localStep, z + dz],
              [x + dx + localStep, z + dz + localStep],
              [x + dx, z + dz + localStep],
              [x + dx + localStep, z + dz],
            ],
          ]) {
            const polygon: Polygon = [triangle.map(([x, z]) => [x, z])];
            const holes = cutouts.filter((hole) => {
              const xs = hole.map((p) => p[0]),
                zs = hole.map((p) => p[1]);
              return (
                x + dx <= Math.max(...xs) &&
                x + dx + localStep >= Math.min(...xs) &&
                z + dz <= Math.max(...zs) &&
                z + dz + localStep >= Math.min(...zs)
              );
            });
            const fragments = holes.length
              ? polygonClipping.difference(
                  polygon,
                  ...holes.map(
                    (hole): Polygon => [hole.map(([x, z]) => [x, z])],
                  ),
                )
              : [polygon];
            if (!crossesCourtBoundary(x + dx, z + dz, localStep)) {
              const interior = inside(
                [x + dx + localStep / 2, z + dz + localStep / 2],
                courtBankBoundary,
              );
              for (const fragment of fragments)
                emitCourtBankPolygon(
                  vertices,
                  fragment,
                  interior,
                  0,
                  undefined,
                  ground,
                  heightCache,
                );
              continue;
            }
            for (const fragment of fragments) {
              for (const piece of polygonClipping.intersection(
                fragment,
                courtBoundary,
              ))
                emitCourtBankPolygon(
                  vertices,
                  piece,
                  true,
                  0,
                  undefined,
                  ground,
                  heightCache,
                );
              for (const piece of polygonClipping.difference(
                fragment,
                courtBoundary,
              ))
                emitCourtBankPolygon(
                  vertices,
                  piece,
                  false,
                  0,
                  undefined,
                  ground,
                  heightCache,
                );
            }
          }
    }
  return geometry(vertices);
}

function drapeTriangles(
  triangles: readonly (readonly Point[])[],
  offset: number,
  sample = elevation,
  planarStreetCells = false,
) {
  const vertices: number[] = [];
  const heightCache = new Map<string, number>();
  const sampleCache = new Map<string, number>();
  const coarseWidth =
    (terrainField.maxX - terrainField.minX) / terrainField.columns;
  const coarseDepth =
    (terrainField.maxZ - terrainField.minZ) / terrainField.rows;
  const clip = (polygon: readonly Point[], a: Point, b: Point): Point[] => {
    const result: Point[] = [];
    const side = (p: Point) =>
      (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]);
    for (const [i, p] of polygon.entries()) {
      const q = polygon[(i + 1) % polygon.length];
      const start = side(p),
        end = side(q);
      const startInside = start >= 0,
        endInside = end >= 0;
      if (startInside) result.push(p);
      if (startInside !== endInside) {
        const t = start / (start - end);
        result.push([p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t]);
      }
    }
    return result;
  };
  for (const triangle of triangles) {
    const xs = triangle.map((p) => p[0]),
      zs = triangle.map((p) => p[1]);
    const left = Math.floor(
        (Math.min(...xs) - terrainField.minX) / coarseWidth,
      ),
      right = Math.floor((Math.max(...xs) - terrainField.minX) / coarseWidth);
    const top = Math.floor((Math.min(...zs) - terrainField.minZ) / coarseDepth),
      bottom = Math.floor((Math.max(...zs) - terrainField.minZ) / coarseDepth);
    for (let row = top; row <= bottom; row++)
      for (let col = left; col <= right; col++) {
        const originX = terrainField.minX + col * coarseWidth,
          originZ = terrainField.minZ + row * coarseDepth;
        const streetDetail = streetDrapeBounds.some(
          (field) =>
            originX < field.maxX &&
            originX + coarseWidth > field.minX &&
            originZ < field.maxZ &&
            originZ + coarseDepth > field.minZ,
        );
        const detailed =
          streetDetail ||
          [
            brickGateDrapeBounds,
            approachTerrainField,
            courtBankBounds,
            gardenBankBounds,
            taborTerrainField,
          ].some(
            (field) =>
              originX < field.maxX &&
              originX + coarseWidth > field.minX &&
              originZ < field.maxZ &&
              originZ + coarseDepth > field.minZ,
          );
        const access =
          streetDetail &&
          originX < streetAccessDrapeBounds.maxX &&
          originX + coarseWidth > streetAccessDrapeBounds.minX &&
          originZ < streetAccessDrapeBounds.maxZ &&
          originZ + coarseDepth > streetAccessDrapeBounds.minZ;
        const cellWidth = access ? 0.5 : detailed ? 1 : coarseWidth,
          cellDepth = access ? 0.5 : detailed ? 1 : coarseDepth;
        if (detailed) {
          const corners: Point[] = [
            [originX, originZ],
            [originX + coarseWidth, originZ],
            [originX + coarseWidth, originZ + coarseDepth],
            [originX, originZ + coarseDepth],
          ];
          let intersection = [...triangle];
          for (let edge = 0; edge < 4 && intersection.length; edge++)
            intersection = clip(
              intersection,
              corners[edge],
              corners[(edge + 1) % 4],
            );
          if (intersection.length < 3) continue;
        }
        for (let dx = 0; dx < coarseWidth; dx += cellWidth)
          for (let dz = 0; dz < coarseDepth; dz += cellDepth) {
            const x = originX + dx,
              z = originZ + dz;
            const a: Point = [x, z],
              b: Point = [x + cellWidth, z],
              c: Point = [x, z + cellDepth],
              d: Point = [x + cellWidth, z + cellDepth];
            // Split at every ground triangle, not just at sampled vertices.
            for (const cell of [
              [a, b, c],
              [d, c, b],
            ]) {
              let polygon = [...triangle];
              for (let edge = 0; edge < 3 && polygon.length; edge++)
                polygon = clip(polygon, cell[edge], cell[(edge + 1) % 3]);
              if (polygon.length < 3) continue;
              let cellSample = sample;
              if (planarStreetCells && streetDetail) {
                const heights = cell.map((point) => {
                  const key = `${point[0]},${point[1]}`;
                  let height = sampleCache.get(key);
                  if (height === undefined) {
                    height = sample(...point);
                    sampleCache.set(key, height);
                  }
                  return height;
                });
                const [a, b, c] = cell;
                const determinant =
                  (b[1] - c[1]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[1] - c[1]);
                cellSample = (x, z) => {
                  if (Math.max(...heights) - Math.min(...heights) > 1)
                    return sample(x, z);
                  // Clipped soil and paving must share the same cell plane.
                  const u =
                    ((b[1] - c[1]) * (x - c[0]) + (c[0] - b[0]) * (z - c[1])) /
                    determinant;
                  const v =
                    ((c[1] - a[1]) * (x - c[0]) + (a[0] - c[0]) * (z - c[1])) /
                    determinant;
                  return (
                    u * heights[0] + v * heights[1] + (1 - u - v) * heights[2]
                  );
                };
              }
              const cliff = onCliffTerrain(
                x + cellWidth / 2,
                z + cellDepth / 2,
              );
              const garden = onGardenBankTerrain(
                x + cellWidth / 2,
                z + cellDepth / 2,
              );
              if (
                cliff ||
                garden ||
                onCourtBankTerrain(x + cellWidth / 2, z + cellDepth / 2)
              ) {
                // Cell intersections can produce almost coincident vertices.
                polygon = polygon
                  .map(
                    ([x, z]): Point => [
                      Math.round(x * 1e8) / 1e8,
                      Math.round(z * 1e8) / 1e8,
                    ],
                  )
                  .filter((point, index, points) => {
                    const next = points[(index + 1) % points.length];
                    return point[0] !== next[0] || point[1] !== next[1];
                  });
                if (polygon.length < 3) continue;
                const area = polygon.reduce((sum, p, i) => {
                  const next = polygon[(i + 1) % polygon.length];
                  return sum + p[0] * next[1] - p[1] * next[0];
                }, 0);
                if (Math.abs(area) < 0.0000001) continue;
                const ring: Polygon = [
                  [...polygon, polygon[0]].map(([x, z]) => [x, z]),
                ];
                const ground = cliff
                  ? cliffTerrainElevation
                  : garden
                    ? gardenTerrainElevation
                    : courtBankElevation;
                if (!crossesCourtBoundary(x, z, cellWidth, cellDepth)) {
                  emitCourtBankPolygon(
                    vertices,
                    ring,
                    inside(polygon[0], courtBankBoundary),
                    offset,
                    cellSample,
                    ground,
                    heightCache,
                  );
                  continue;
                }
                for (const piece of polygonClipping.intersection(
                  ring,
                  courtBoundary,
                ))
                  emitCourtBankPolygon(
                    vertices,
                    piece,
                    true,
                    offset,
                    cellSample,
                    ground,
                    heightCache,
                  );
                for (const piece of polygonClipping.difference(
                  ring,
                  courtBoundary,
                ))
                  emitCourtBankPolygon(
                    vertices,
                    piece,
                    false,
                    offset,
                    cellSample,
                    ground,
                    heightCache,
                  );
                continue;
              }
              for (let i = 1; i < polygon.length - 1; i++) {
                const p = polygon[0],
                  q = polygon[i],
                  r = polygon[i + 1];
                const area =
                  (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]);
                if (Math.abs(area) < 0.0000001) continue;
                for (const v of area > 0 ? [p, r, q] : [p, q, r]) {
                  const key = `${v[0]},${v[1]}`;
                  let height = heightCache.get(key);
                  if (height === undefined) {
                    height = cellSample(...v) + offset;
                    heightCache.set(key, height);
                  }
                  vertices.push(v[0], height, v[1]);
                }
              }
            }
          }
      }
  }
  return geometry(vertices);
}

export function drapedPolygon(
  points: readonly Point[],
  offset: number,
  sample = elevation,
  cutouts: readonly (readonly Point[])[] = [],
  planarStreetCells = false,
) {
  const outer: Polygon = [points.map(([x, z]) => [x, z])];
  const polygons = cutouts.length
    ? polygonClipping.difference(
        outer,
        ...cutouts.map((ring): Polygon => [ring.map(([x, z]) => [x, z])]),
      )
    : [outer];
  return drapeTriangles(
    polygons.flatMap((polygon) => {
      const rings = polygon.map((ring) =>
        ring.map(([x, z]) => new THREE.Vector2(x, z)),
      );
      const faces = THREE.ShapeUtils.triangulateShape(rings[0], rings.slice(1));
      const vertices = rings.flat();
      return faces.map((face) =>
        face.map((i): Point => [vertices[i].x, vertices[i].y]),
      );
    }),
    offset,
    sample,
    planarStreetCells,
  );
}

export function samplePolyline(points: readonly Point[], spacing = 2): Point[] {
  if (!Number.isFinite(spacing) || spacing <= 0)
    throw new RangeError(
      'Polyline sample spacing must be finite and positive.',
    );
  if (!points.length) return [];
  const samples: Point[] = [points[0]];
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1],
      b = points[i];
    const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (length < 0.001) continue;
    const steps = Math.ceil(length / spacing);
    for (let j = 1; j <= steps; j++)
      samples.push([
        a[0] + ((b[0] - a[0]) * j) / steps,
        a[1] + ((b[1] - a[1]) * j) / steps,
      ]);
  }
  return samples;
}

export function ribbonEdges(
  points: readonly Point[],
  width: number | ((point: Point) => number),
) {
  const closed =
    points.length > 2 &&
    points[0][0] === points.at(-1)?.[0] &&
    points[0][1] === points.at(-1)?.[1];
  return points.map((point, i) => {
    const half = (typeof width === 'number' ? width : width(point)) / 2;
    const previous =
      points[i - 1] ?? (closed ? points[points.length - 2] : point);
    const next = points[i + 1] ?? (closed ? points[1] : point);
    const normal = (a: Point, b: Point): Point => {
      const length = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
      return [-(b[1] - a[1]) / length, (b[0] - a[0]) / length];
    };
    let incoming = normal(previous, point),
      outgoing = normal(point, next);
    if (i === 0 && !closed) incoming = outgoing;
    if (i === points.length - 1 && !closed) outgoing = incoming;
    const length = Math.hypot(
      incoming[0] + outgoing[0],
      incoming[1] + outgoing[1],
    );
    const direction: Point =
      length < 0.001
        ? outgoing
        : [
            (incoming[0] + outgoing[0]) / length,
            (incoming[1] + outgoing[1]) / length,
          ];
    const projection = Math.abs(
      direction[0] * outgoing[0] + direction[1] * outgoing[1],
    );
    const miter = Math.min(half * 2, half / Math.max(projection, 0.1));
    return {
      left: [
        point[0] + direction[0] * miter,
        point[1] + direction[1] * miter,
      ] as Point,
      right: [
        point[0] - direction[0] * miter,
        point[1] - direction[1] * miter,
      ] as Point,
    };
  });
}

export function pathRibbon(
  points: readonly Point[],
  width: number,
  offset = 0.055,
  sample = elevation,
  cutouts: readonly Point[][] = [],
) {
  const edges = ribbonEdges(samplePolyline(points), width);
  const triangles: Point[][] = [];
  for (let i = 1; i < edges.length; i++) {
    const a = edges[i - 1],
      b = edges[i];
    triangles.push([a.left, b.left, a.right], [a.right, b.left, b.right]);
  }
  if (!cutouts.length) return drapeTriangles(triangles, offset, sample);
  const cuts = cutouts.map((ring): Polygon => [ring.map(([x, z]) => [x, z])]);
  const clipped = triangles.flatMap((triangle) =>
    polygonClipping
      .difference([triangle.map(([x, z]): [number, number] => [x, z])], ...cuts)
      .flatMap((polygon) => {
        const rings = polygon.map((ring) =>
          ring.slice(0, -1).map(([x, z]): Point => [x, z]),
        );
        const vectors = rings.map((ring) =>
          ring.map(([x, z]) => new THREE.Vector2(x, z)),
        );
        const faces = THREE.ShapeUtils.triangulateShape(
          vectors[0],
          vectors.slice(1),
        );
        const points = rings.flat();
        return faces.map((face) => face.map((index) => points[index]));
      }),
  );
  return drapeTriangles(clipped, offset, sample);
}

export function continuousWall(
  points: readonly Point[],
  width: number | ((point: Point) => number),
  height:
    | number
    | ((point: Point, normal: Point) => { bottom: number; top: number }),
  grounded = true,
  retainedBoundary?: readonly Point[],
) {
  const samples = samplePolyline(points);
  if (samples.length < 2) return geometry([]);
  const edges = ribbonEdges(samples, width);
  const vertices: number[] = [];
  const heights = edges.map((edge, i) => {
    const ground = elevation(...samples[i]);
    const minimum = Math.min(
      elevation(...edge.left),
      elevation(...edge.right),
      ground,
    );
    if (typeof height === 'number')
      return { bottom: minimum - 0.3, top: ground + height };
    const dx = edge.left[0] - edge.right[0],
      dz = edge.left[1] - edge.right[1];
    const length = Math.hypot(dx, dz);
    const profile = height(samples[i], [dx / length, dz / length]);
    return {
      ...profile,
      bottom: grounded
        ? Math.min(profile.bottom, minimum - 0.3)
        : profile.bottom,
    };
  });
  const sections = edges.map((edge, i) => {
    if (!retainedBoundary) return { top: edge, bottom: edge };
    const point = samples[i];
    const dx = edge.left[0] - edge.right[0],
      dz = edge.left[1] - edge.right[1],
      length = Math.hypot(dx, dz);
    let normal: Point = [dx / length, dz / length];
    const leftIsInward = inside(
      [point[0] + normal[0] * 0.2, point[1] + normal[1] * 0.2],
      retainedBoundary,
    );
    if (!leftIsInward) normal = [-normal[0], -normal[1]];
    const thickness = typeof width === 'number' ? width : width(point);
    const { inset, outer, footing, batter } = retainedWallOffsets(
      point,
      thickness,
      heights[i],
    );
    const at = (distance: number): Point => [
      point[0] + normal[0] * distance,
      point[1] + normal[1] * distance,
    ];
    return {
      top: leftIsInward
        ? { left: at(inset + thickness), right: at(outer) }
        : { left: at(outer), right: at(inset + thickness) },
      bottom: leftIsInward
        ? { left: at(footing), right: at(-batter) }
        : { left: at(-batter), right: at(footing) },
    };
  });
  const face = (a: number[], b: number[], c: number[], d: number[]) =>
    vertices.push(...a, ...b, ...c, ...c, ...b, ...d);
  for (let i = 1; i < sections.length; i++) {
    const a = sections[i - 1],
      b = sections[i],
      ha = heights[i - 1],
      hb = heights[i];
    const point = (p: Point, y: number) => [p[0], y, p[1]];
    face(
      point(a.bottom.left, ha.bottom),
      point(b.bottom.left, hb.bottom),
      point(a.top.left, ha.top),
      point(b.top.left, hb.top),
    );
    face(
      point(a.top.right, ha.top),
      point(b.top.right, hb.top),
      point(a.bottom.right, ha.bottom),
      point(b.bottom.right, hb.bottom),
    );
    face(
      point(a.top.left, ha.top),
      point(b.top.left, hb.top),
      point(a.top.right, ha.top),
      point(b.top.right, hb.top),
    );
    if (i === 1)
      face(
        point(a.bottom.left, ha.bottom),
        point(a.top.left, ha.top),
        point(a.bottom.right, ha.bottom),
        point(a.top.right, ha.top),
      );
    if (i === sections.length - 1)
      face(
        point(b.bottom.right, hb.bottom),
        point(b.top.right, hb.top),
        point(b.bottom.left, hb.bottom),
        point(b.top.left, hb.top),
      );
  }
  return geometry(vertices);
}
