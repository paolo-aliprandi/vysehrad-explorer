import * as THREE from 'three';
import {
  paths,
  inside,
  courtBankBoundary,
  featureElevation,
  onExposedRampartBank,
  type Feature,
  type Point,
} from './geo';
import { samplePolyline } from './surfaces';

export const hillDetail = {
  minX: -350,
  maxX: 325,
  minZ: -250,
  maxZ: 350,
  columns: 270,
  rows: 240,
};
export function onHillDetail(x: number, z: number) {
  return (
    x >= hillDetail.minX &&
    x <= hillDetail.maxX &&
    z >= hillDetail.minZ &&
    z <= hillDetail.maxZ
  );
}

export function splitSteepPath(
  points: readonly Point[],
  height: (point: Point) => number,
  exterior: (point: Point) => boolean,
) {
  const runs: Point[][] = [];
  let run: Point[] = [points[0]],
    removed = false;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1],
      b = points[i];
    const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const middle: Point = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    if (
      length > 0 &&
      exterior(middle) &&
      Math.abs(height(b) - height(a)) / length > 0.45
    ) {
      if (run.length > 1) runs.push(run);
      run = [b];
      removed = true;
    } else run.push(b);
  }
  if (run.length > 1) runs.push(run);
  return { runs, removed };
}

export function landscapePaths(feature: Feature): Feature[] {
  if (
    !['footway', 'path', 'track', 'cycleway'].includes(
      feature.tags.highway ?? '',
    ) ||
    feature.tags.tunnel ||
    feature.tags.bridge ||
    feature.points.length < 2
  )
    return [feature];
  const result = splitSteepPath(
    samplePolyline(feature.points, 2),
    (point) => featureElevation(feature, point),
    (point) => !inside(point, courtBankBoundary),
  );
  return result.removed
    ? result.runs.map((points) => ({ ...feature, points }))
    : [feature];
}
export const explorationPaths = paths.flatMap(landscapePaths);

export function splitRockySlopes(source: THREE.BufferGeometry) {
  const positions = source.attributes.position,
    indices = source.index;
  const grass: number[] = [],
    stone: number[] = [];
  const a = new THREE.Vector3(),
    b = new THREE.Vector3(),
    c = new THREE.Vector3();
  const ab = new THREE.Vector3(),
    ac = new THREE.Vector3(),
    normal = new THREE.Vector3();
  for (let i = 0; i < (indices?.count ?? positions.count); i += 3) {
    const triangle = [0, 1, 2].map((offset) =>
      indices ? indices.getX(i + offset) : i + offset,
    );
    a.fromBufferAttribute(positions, triangle[0]);
    b.fromBufferAttribute(positions, triangle[1]);
    c.fromBufferAttribute(positions, triangle[2]);
    normal.crossVectors(ab.subVectors(b, a), ac.subVectors(c, a));
    const slope =
      Math.hypot(normal.x, normal.z) / Math.max(0.00001, Math.abs(normal.y));
    const exterior = !inside(
      [(a.x + b.x + c.x) / 3, (a.z + b.z + c.z) / 3],
      courtBankBoundary,
    );
    const exposed =
      exterior &&
      onExposedRampartBank([(a.x + b.x + c.x) / 3, (a.z + b.z + c.z) / 3]);
    (exposed || slope > (exterior ? 0.55 : 0.9) ? stone : grass).push(
      ...triangle,
    );
  }
  if (!stone.length) return { ground: source, rock: null };
  const rocky = source.clone();
  rocky.setIndex(stone);
  const rock = rocky.toNonIndexed();
  rocky.dispose();
  source.setIndex(grass);
  return { ground: source, rock };
}
