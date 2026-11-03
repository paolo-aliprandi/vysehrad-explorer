import * as THREE from 'three';
import { splitSteepPath, splitRockySlopes, landscapePaths } from './landscape';
import {
  elevation,
  stairFlights,
  stairElevation,
  type Feature,
  type Point,
} from './geo';
import { courtBankTerrain, drapedPolygon, samplePolyline } from './surfaces';

it('removes steep exterior trail climbs without deleting their level approaches or interior paths', () => {
  const points: Point[] = [
    [0, 0],
    [2, 0],
    [4, 0],
    [6, 0],
    [8, 0],
  ];
  const height = ([x]: Point) => (x < 4 ? 0 : 4);
  expect(splitSteepPath(points, height, () => true).runs).toEqual([
    points.slice(0, 2),
    points.slice(2),
  ]);
  expect(splitSteepPath(points, height, () => false).removed).toBe(false);
  const stairs: Feature = {
    id: 1,
    points,
    tags: { highway: 'steps' },
    holes: [],
  };
  expect(landscapePaths(stairs)).toEqual([stairs]);
  const passage = { ...stairs, tags: { highway: 'footway', tunnel: 'yes' } };
  expect(landscapePaths(passage)).toEqual([passage]);
});

it('exposes steep exterior faces as rock without turning level terrain into stone', () => {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(
      [
        400, 0, 400, 410, 0, 400, 400, 0, 410, 420, 0, 400, 430, 0, 400, 420,
        10, 410,
      ],
      3,
    ),
  );
  const split = splitRockySlopes(geometry);
  expect(split.ground.index?.count).toBe(3);
  expect(split.rock?.attributes.position.count).toBe(3);
  expect(split.rock?.attributes.position.getY(2)).toBe(10);
  split.ground.dispose();
  split.rock?.dispose();
});

it('keeps gentle interior banks grassy but exposes their steep retaining cuts', () => {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(
      [90, 0, 80, 91, 0, 80, 90, 0.7, 81, 92, 0, 80, 93, 0, 80, 92, 4, 81],
      3,
    ),
  );
  const split = splitRockySlopes(geometry);
  expect(split.ground.index?.count).toBe(3);
  expect(split.rock?.attributes.position.count).toBe(3);
  expect(split.rock?.attributes.position.getY(2)).toBe(4);
  split.ground.dispose();
  split.rock?.dispose();
});

it('keeps eastern court soil and rock overlays on the same detailed bank surface', () => {
  const terrain = courtBankTerrain();
  const overlay = drapedPolygon(
    [
      [100, -55],
      [150, -55],
      [150, 60],
      [100, 60],
    ],
    0.025,
  );
  const material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
  const ground = new THREE.Mesh(terrain, material);
  const rock = new THREE.Mesh(overlay, material);
  for (const point of [
    [140.3, 42.4],
    [144.2, 45.4],
    [110.3, -50.4],
    [130.2, 43.4],
  ] as Point[]) {
    const ray = new THREE.Raycaster(
      new THREE.Vector3(point[0], 100, point[1]),
      new THREE.Vector3(0, -1, 0),
    );
    const floor = ray.intersectObject(ground)[0];
    const cover = ray.intersectObject(rock)[0];
    expect(floor, `missing bank at ${point}`).toBeDefined();
    expect(cover, `missing overlay at ${point}`).toBeDefined();
    expect(cover.point.y - floor.point.y).toBeCloseTo(0.025, 4);
    expect(Math.abs(floor.point.y - elevation(...point))).toBeLessThan(0.2);
  }
  const gardenOverlay = drapedPolygon(
    [
      [185, 108],
      [191, 108],
      [191, 134],
      [185, 134],
      [185, 108],
    ],
    0.025,
  );
  const gardenRock = new THREE.Mesh(gardenOverlay, material);
  for (const point of [
    [185.3, 122],
    [187.7, 130.7],
    [186.6, 110.3],
  ] as Point[]) {
    const ray = new THREE.Raycaster(
      new THREE.Vector3(point[0], 100, point[1]),
      new THREE.Vector3(0, -1, 0),
    );
    const floor = ray.intersectObject(ground)[0];
    const overlayHit = ray.intersectObject(gardenRock)[0];
    expect(floor).toBeDefined();
    expect(overlayHit).toBeDefined();
    expect(Math.abs(floor.point.y - elevation(...point))).toBeLessThan(0.2);
    expect(overlayHit.point.y - floor.point.y).toBeCloseTo(0.025, 4);
  }
  gardenOverlay.dispose();
  terrain.dispose();
  overlay.dispose();
  material.dispose();
}, 15000);

it('keeps the Tabor stairwell clear of the surrounding excavated soil', () => {
  const flight = stairFlights.find((flight) => flight.feature.id === 284582284);
  if (!flight) throw new Error('Missing Tabor access stairwell.');
  const points = samplePolyline(flight.feature.points, 0.4);
  for (let i = 1; i < points.length - 1; i++) {
    const before = points[i - 1],
      after = points[i + 1],
      point = points[i];
    const length = Math.hypot(after[0] - before[0], after[1] - before[1]);
    const normal = [
      -(after[1] - before[1]) / length,
      (after[0] - before[0]) / length,
    ];
    for (const across of [-1.2, 0, 1.2]) {
      const sample: Point = [
        point[0] + normal[0] * across,
        point[1] + normal[1] * across,
      ];
      expect(elevation(...sample), `buried stair at ${sample}`).toBeLessThan(
        stairElevation(flight, point) - 0.04,
      );
    }
  }
});
