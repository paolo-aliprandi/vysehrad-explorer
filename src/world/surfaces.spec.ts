import * as THREE from 'three';
import {
  elevation,
  unretainedElevation,
  retainedStreetCorridors,
  retainedStreetWalls,
  retainedStreetBanks,
  rotundaStreet,
  retainedStreetBankElevation,
  walls,
  wallProfile,
  wallThickness,
  gateFrame,
  features,
  exposedRocks,
  foundation,
  gateBuildings,
  projectRoute,
  pevnostiGrade,
  featureElevation,
  pathWidth,
  segmentDistance,
  cemeteryArcades,
  cemeteryArcadeFloor,
  standingElevation,
  blocked,
  aveMariaFrontage,
  aveMariaPoint,
  aveMariaCourtElevation,
  type Point,
} from './geo';
import {
  continuousWall,
  drapedPolygon,
  pathRibbon,
  ribbonEdges,
  samplePolyline,
  clipTerrainAtArcades,
  retainedStreetTerrain,
} from './surfaces';
import { makeCemeteryArcade } from './architecture';

describe('connected world surfaces', () => {
  it('seals the raised bank beside Ave Maria without closing the stair opening', () => {
    const terrain = retainedStreetTerrain();
    const material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
    const meshes = terrain.geometries.map(
      (geometry) => new THREE.Mesh(geometry, material),
    );
    const seams = [-6, -5, -4].map((u) => {
      const point = aveMariaPoint(u, 10.1);
      return {
        u,
        floor: aveMariaCourtElevation(...point),
        crest: terrain.heightAt(point),
      };
    });
    try {
      terrain.geometries.forEach((geometry) =>
        clipTerrainAtArcades(geometry, true, false),
      );
      for (const { u, floor, crest } of seams) {
        expect(crest - floor).toBeGreaterThan(0.15);
        const from = aveMariaPoint(u, 9.85);
        for (const fraction of [0.05, 0.5, 0.95]) {
          const ray = new THREE.Raycaster(
            new THREE.Vector3(
              from[0],
              floor + (crest - floor) * fraction,
              from[1],
            ),
            new THREE.Vector3(
              aveMariaFrontage.normal[0],
              0,
              aveMariaFrontage.normal[1],
            ),
            0,
            0.5,
          );
          expect(
            ray.intersectObjects(meshes).length,
            JSON.stringify({ u, fraction }),
          ).toBeGreaterThan(0);
        }
      }
      const opening = aveMariaPoint(0, 9.85);
      expect(
        new THREE.Raycaster(
          new THREE.Vector3(
            opening[0],
            aveMariaCourtElevation(...opening) + 0.2,
            opening[1],
          ),
          new THREE.Vector3(
            aveMariaFrontage.normal[0],
            0,
            aveMariaFrontage.normal[1],
          ),
          0,
          0.5,
        ).intersectObjects(meshes),
      ).toHaveLength(0);
    } finally {
      terrain.geometries.forEach((geometry) => geometry.dispose());
      material.dispose();
    }
  });

  it('keeps replacement soil below Brick Gate instead of pulling it up to the roof', () => {
    const terrain = retainedStreetTerrain();
    const point: Point = [-98, -76.7938];
    expect(terrain.heightAt(point)).toBeCloseTo(elevation(...point), 1);
    expect(terrain.heightAt(point)).toBeLessThan(32);
    terrain.geometries.forEach((geometry) => geometry.dispose());
  });

  it('closes the actual cut edge between the rotunda bank and replacement soil', () => {
    const terrain = retainedStreetTerrain();
    expect(Number.isFinite(terrain.heightAt([-77.888, -67.639]))).toBe(true);
    const point = samplePolyline(rotundaStreet.polygon, 0.25).sort(
      (a, b) =>
        Math.hypot(a[0] - 72.5, a[1] - 84) - Math.hypot(b[0] - 72.5, b[1] - 84),
    )[0];
    const geometry = new THREE.PlaneGeometry(8, 8, 2, 2)
      .rotateX(-Math.PI / 2)
      .translate(point[0], 0, point[1]);
    const positions = geometry.attributes.position;
    for (let i = 0; i < positions.count; i++)
      positions.setY(
        i,
        unretainedElevation(positions.getX(i), positions.getZ(i)),
      );
    const material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
    const mesh = new THREE.Mesh(geometry, material);
    const ray = new THREE.Raycaster(
      new THREE.Vector3(point[0], 100, point[1]),
      new THREE.Vector3(0, -1, 0),
    );
    const oldHeight = ray.intersectObject(mesh)[0].point.y;
    const floor = terrain.heightAt(point);
    expect(Math.abs(oldHeight - floor)).toBeGreaterThan(0.1);
    clipTerrainAtArcades(geometry, true, true, terrain.heightAt);
    ray.set(
      new THREE.Vector3(point[0] - 0.02, (oldHeight + floor) / 2, point[1]),
      new THREE.Vector3(1, 0, 0),
    );
    ray.far = 0.04;
    expect(ray.intersectObject(mesh).length).toBeGreaterThan(0);
    geometry.dispose();
    material.dispose();
    terrain.geometries.forEach((geometry) => geometry.dispose());
  });

  it('joins every outer and end bank edge back to existing ground without open height seams', () => {
    let maximumError = 0;
    for (const bank of retainedStreetBanks)
      for (const point of samplePolyline(bank.blendBoundary, 0.5))
        maximumError = Math.max(
          maximumError,
          Math.abs(
            retainedStreetBankElevation(bank, point) -
              unretainedElevation(...point),
          ),
        );
    expect(maximumError).toBeLessThan(0.002);
  });
  it('uses the graded street height, not the old court-bank height, across every rendered road vertex', () => {
    for (const corridor of retainedStreetCorridors) {
      const floor = drapedPolygon(corridor.polygon, 0, elevation);
      const positions = floor.attributes.position;
      let maximumError = 0;
      for (let i = 0; i < positions.count; i++)
        maximumError = Math.max(
          maximumError,
          Math.abs(
            positions.getY(i) - elevation(positions.getX(i), positions.getZ(i)),
          ),
        );
      expect(maximumError).toBeLessThan(0.002);
      floor.dispose();
    }
  });

  it('keeps the upper bank behind the masonry crest instead of draping it down through the road-side wall edge', () => {
    const bank = retainedStreetBanks.find(
      (bank) => bank.wall.points.length > 30,
    );
    if (!bank) throw new Error('Missing long street bank fixture.');
    const floor = drapedPolygon(bank.polygon, 0, (x, z) =>
      retainedStreetBankElevation(bank, [x, z]),
    );
    const positions = floor.attributes.position;
    let maximumError = 0;
    for (let i = 0; i < positions.count; i++)
      maximumError = Math.max(
        maximumError,
        Math.abs(
          positions.getY(i) -
            retainedStreetBankElevation(bank, [
              positions.getX(i),
              positions.getZ(i),
            ]),
        ),
      );
    expect(maximumError).toBeLessThan(0.002);
    const point = bank.wall.points[Math.floor(bank.wall.points.length / 2)];
    expect(retainedStreetBankElevation(bank, point)).toBeCloseTo(
      wallProfile(
        bank.wall,
        point,
        projectRoute(point, bank.wall.points).normal,
      ).top - 0.18,
      5,
    );
    floor.dispose();
  });

  it('excavates the old street bank mesh and replaces it with a cross-level floor and a raycastable retaining face', () => {
    const junction = new THREE.PlaneGeometry(10, 10, 2, 2)
      .rotateX(-Math.PI / 2)
      .translate(-20, 0, -40);
    const junctionPositions = junction.attributes.position;
    for (let i = 0; i < junctionPositions.count; i++)
      junctionPositions.setY(
        i,
        unretainedElevation(
          junctionPositions.getX(i),
          junctionPositions.getZ(i),
        ),
      );
    expect(() => clipTerrainAtArcades(junction)).not.toThrow();
    junction.dispose();
    const material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
    const ground = new THREE.PlaneGeometry(35, 35, 7, 7)
      .rotateX(-Math.PI / 2)
      .translate(-46, 0, -40);
    const positions = ground.attributes.position;
    for (let i = 0; i < positions.count; i++)
      positions.setY(
        i,
        unretainedElevation(positions.getX(i), positions.getZ(i)),
      );
    const oldBank = new THREE.Mesh(ground, material);
    const down = new THREE.Raycaster(
      new THREE.Vector3(-62, 80, -23),
      new THREE.Vector3(0, -1, 0),
    );
    const outsideBefore = down.intersectObject(oldBank)[0].point.y;
    clipTerrainAtArcades(ground);
    expect(down.intersectObject(oldBank)[0].point.y).toBeCloseTo(
      outsideBefore,
      5,
    );
    down.set(
      new THREE.Vector3(-46.11, 80, -39.77),
      new THREE.Vector3(0, -1, 0),
    );
    expect(down.intersectObject(oldBank)).toHaveLength(0);
    const corridor = retainedStreetCorridors[0];
    const floor = new THREE.Mesh(
      drapedPolygon(corridor.polygon, 0, elevation),
      material,
    );
    const normal = projectRoute([-46.11, -39.77], corridor.points).normal;
    for (const offset of [-4, 0, 4]) {
      const point: Point = [
        -46.11 + normal[0] * offset,
        -39.77 + normal[1] * offset,
      ];
      down.set(
        new THREE.Vector3(point[0], 80, point[1]),
        new THREE.Vector3(0, -1, 0),
      );
      expect(down.intersectObject(floor)[0].point.y).toBeCloseTo(
        elevation(...point),
        2,
      );
    }
    const wall = retainedStreetWalls.find((wall) => wall.points.length > 20);
    if (!wall) throw new Error('Missing continuous street retaining face.');
    const face = new THREE.Mesh(
      continuousWall(wall.points, 0.55, (point, normal) =>
        wallProfile(wall, point, normal),
      ),
      material,
    );
    const point = wall.points[Math.floor(wall.points.length / 2)];
    const centre = projectRoute(point, corridor.points).point;
    const from = new THREE.Vector3(
      centre[0],
      elevation(...centre) + 0.5,
      centre[1],
    );
    const target = new THREE.Vector3(point[0], from.y, point[1]);
    const ray = new THREE.Raycaster(
      from,
      target.clone().sub(from).normalize(),
      0,
      from.distanceTo(target) + 1,
    );
    expect(ray.intersectObject(face).length).toBeGreaterThan(0);
    for (const mesh of [oldBank, floor, face]) mesh.geometry.dispose();
    material.dispose();
  });

  it('excavates only mapped arcade interiors while preserving exterior soil and supporting the unchanged porch floor', () => {
    const arcade = cemeteryArcades.find(
      (arcade) => arcade.feature.id === -4226810,
    );
    if (!arcade) throw new Error('Missing northern cemetery arcade.');
    const floor = foundation(arcade.feature) + 0.05;
    const surface = new THREE.PlaneGeometry(12, 12, 12, 12)
      .rotateX(-Math.PI / 2)
      .translate(-125, 0, -26);
    const position = surface.attributes.position;
    for (let i = 0; i < position.count; i++) {
      position.setY(i, elevation(position.getX(i), position.getZ(i)));
      surface.attributes.uv.setXY(
        i,
        position.getX(i) * 0.1,
        position.getZ(i) * 0.1,
      );
    }
    const material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
    const earth = new THREE.Mesh(surface, material);
    const rayAt = (point: Point) =>
      new THREE.Raycaster(
        new THREE.Vector3(point[0], floor + 3, point[1]),
        new THREE.Vector3(0, -1, 0),
      );
    const porch: Point = [-125.761023, -24.433411];
    const exterior: Point = [-120.9, -24.5];
    const exteriorBefore = rayAt(exterior).intersectObject(earth)[0].point.y;
    const overlay = surface.clone();
    expect(
      rayAt(porch).intersectObject(earth)[0].point.y - floor,
    ).toBeGreaterThan(0.2);
    expect(clipTerrainAtArcades(surface)).toBe(surface);
    const boundary: Point = [-126.58, -26.71];
    const inward = new THREE.Vector3(20, 0, -1.9).normalize();
    const cutRay = (height: number) =>
      new THREE.Raycaster(
        new THREE.Vector3(boundary[0], height, boundary[1]).add(inward),
        inward.clone().negate(),
        0,
        1.02,
      );
    for (const height of [floor - 0.05, floor + 0.05, floor + 0.15]) {
      const hit = cutRay(height).intersectObject(earth)[0];
      expect(hit, `unsealed excavation at height ${height}`).toBeDefined();
      expect(hit.distance).toBeCloseTo(1, 4);
    }
    expect(cutRay(floor + 0.8).intersectObject(earth)).toHaveLength(0);
    clipTerrainAtArcades(overlay, false);
    expect(
      cutRay(floor + 0.15).intersectObject(new THREE.Mesh(overlay, material)),
    ).toHaveLength(0);
    expect(rayAt(porch).intersectObject(earth)).toHaveLength(0);
    expect(rayAt(exterior).intersectObject(earth)[0].point.y).toBeCloseTo(
      exteriorBefore,
      5,
    );
    const meshes: THREE.Mesh[] = [];
    makeCemeteryArcade(arcade.feature, (_color, geometry) =>
      meshes.push(new THREE.Mesh(geometry, material)),
    );
    for (const point of [
      porch,
      [-126.430379, -37.823489],
      [-154.599887, -47.41414],
    ] as Point[]) {
      expect(cemeteryArcadeFloor(point)).toBe(floor);
      expect(standingElevation(point)).toBe(floor);
      expect(blocked(point, floor)).toBe(false);
      expect(rayAt(point).intersectObjects(meshes)[0].point.y).toBeCloseTo(
        floor,
        5,
      );
    }
    expect(cemeteryArcadeFloor(exterior)).toBeUndefined();
    expect(standingElevation(exterior)).toBeCloseTo(elevation(...exterior), 6);
    const clipped = surface.attributes.position;
    for (let i = 0; i < clipped.count; i++) {
      expect(surface.attributes.uv.getX(i)).toBeCloseTo(
        clipped.getX(i) * 0.1,
        5,
      );
      expect(surface.attributes.uv.getY(i)).toBeCloseTo(
        clipped.getZ(i) * 0.1,
        5,
      );
    }
    expect(Array.from(clipped.array).every(Number.isFinite)).toBe(true);
    meshes.forEach((mesh) => mesh.geometry.dispose());
    surface.dispose();
    overlay.dispose();
    material.dispose();
  });
  it('handles empty and repeated-point surface runs without non-finite vertices', () => {
    expect(samplePolyline([])).toEqual([]);
    expect(() => samplePolyline([[0, 0]], 0)).toThrow(RangeError);
    for (const points of [
      [],
      [[0, 0]],
      [
        [0, 0],
        [0, 0],
      ],
    ] as const) {
      const wall = continuousWall(points, 0.5, 2);
      const path = pathRibbon(points, 2);
      expect(wall.attributes.position.count).toBe(0);
      expect(path.attributes.position.count).toBe(0);
      wall.dispose();
      path.dispose();
    }
  });
  it('clips actual mapped garden park overlays without degenerate boundary rings', () => {
    for (const id of [332088853, -4228990]) {
      const feature = features.find((feature) => feature.id === id);
      if (!feature) throw new Error(`Missing garden park ${id}.`);
      const geometry = drapedPolygon(feature.points, 0.025, elevation, [
        ...feature.holes,
        ...exposedRocks.map((rock) => rock.points),
      ]);
      const positions = geometry.getAttribute('position');
      expect(positions.count).toBeGreaterThan(0);
      expect(Array.from(positions.array).every(Number.isFinite)).toBe(true);
      geometry.dispose();
    }
  }, 15000);
  it('renders straight masonry crests rather than terrain ripples on the main rampart and both outer Tabor wings', () => {
    for (const [id, index] of [
      [33878732, 21],
      [8888302, 6],
      [1532977610, 67],
      [51666061, 7],
    ]) {
      const wall = walls.find((wall) => wall.id === id);
      if (!wall) throw new Error('Missing wall for crest regression.');
      const a = wall.points[index],
        b = wall.points[index + 1];
      const geometry = continuousWall(
        [a, b],
        (point) => wallThickness(wall, point),
        (point, normal) => wallProfile(wall, point, normal),
      );
      const material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
      const mesh = new THREE.Mesh(geometry, material);
      const heights = [0.1, 0.3, 0.5, 0.7, 0.9].map((t) => {
        const point: Point = [
          a[0] + (b[0] - a[0]) * t,
          a[1] + (b[1] - a[1]) * t,
        ];
        const hit = new THREE.Raycaster(
          new THREE.Vector3(point[0], 100, point[1]),
          new THREE.Vector3(0, -1, 0),
        ).intersectObject(mesh)[0];
        if (!hit) throw new Error(`Missing crest on wall ${id}.`);
        return hit.point.y;
      });
      const slope = (heights[4] - heights[0]) / 4;
      heights.forEach((height, index) =>
        expect(height, `wall ${id}`).toBeCloseTo(heights[0] + slope * index, 3),
      );
      geometry.dispose();
      material.dispose();
    }
  });
  it('keeps the groundskeeper-side garden wall low above the road instead of ramping toward Leopold Gate', () => {
    const wall = walls.find((wall) => wall.id === 698001346);
    if (!wall) throw new Error('Missing roadside vegetable-garden wall.');
    const geometry = continuousWall(
      wall.points,
      (point) => wallThickness(wall, point),
      (point, normal) => wallProfile(wall, point, normal),
    );
    const material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
    const mesh = new THREE.Mesh(geometry, material);
    const [a, b] = wall.points.slice(1);
    for (const t of [0.02, 0.25, 0.5, 0.75, 0.98]) {
      const point: Point = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
      const ray = new THREE.Raycaster(
        new THREE.Vector3(point[0], 80, point[1]),
        new THREE.Vector3(0, -1, 0),
      );
      const hit = ray.intersectObject(mesh)[0];
      expect(hit, `missing retaining wall at ${point}`).toBeDefined();
      const aboveRoad = hit.point.y - pevnostiGrade(point).level;
      expect(aboveRoad).toBeGreaterThan(0.95);
      expect(aboveRoad).toBeLessThan(1.2);
      ray.ray.origin.y = pevnostiGrade(point).level - 0.3;
      ray.ray.direction.set(1, 0, 0);
      ray.ray.origin.x -= 2;
      ray.far = 4;
      expect(ray.intersectObject(mesh)).not.toHaveLength(0);
    }
    geometry.dispose();
    material.dispose();
  });
  it('keeps actual road and sidewalk meshes on the shared smooth Leopold approach grade', () => {
    const gate = gateBuildings.find((gate) => gate.feature.id === 51718887);
    if (!gate) throw new Error('Missing Leopold Gate.');
    const query: Point = [
      gate.center[0] + gate.axis[1] * 18,
      gate.center[1] - gate.axis[0] * 18,
    ];
    for (const id of [494921190, 494921198, 494921210]) {
      const feature = features.find((feature) => feature.id === id);
      if (!feature) throw new Error('Missing approach paving.');
      const point = projectRoute(query, feature.points).point;
      const geometry = pathRibbon(
        feature.points,
        pathWidth(feature),
        0.055,
        (x, z) => featureElevation(feature, [x, z]),
      );
      const material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
      const hit = new THREE.Raycaster(
        new THREE.Vector3(point[0], 80, point[1]),
        new THREE.Vector3(0, -1, 0),
      ).intersectObject(new THREE.Mesh(geometry, material))[0];
      if (!hit) throw new Error('Missing approach road surface.');
      expect(
        Math.abs(hit.point.y - pevnostiGrade(point).level - 0.055),
        `paving ${id}`,
      ).toBeLessThan(0.04);
      material.dispose();
      geometry.dispose();
    }
  });
  it('renders the thicker entrance walls with a continuous level crest', () => {
    const wall = walls.find((wall) => wall.id === 8888302);
    const gate = features.find((feature) => feature.id === 49811189);
    if (!wall || !gate) throw new Error('Missing entrance geometry.');
    const points = wall.points.slice(0, 4);
    const geometry = continuousWall(
      points,
      (point) => wallThickness(wall, point),
      (point, normal) => wallProfile(wall, point, normal),
    );
    const material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
    const mesh = new THREE.Mesh(geometry, material);
    const point: Point = [
      (points[0][0] + points[1][0]) / 2,
      (points[0][1] + points[1][1]) / 2,
    ];
    const length = Math.hypot(
      points[1][0] - points[0][0],
      points[1][1] - points[0][1],
    );
    const normal = new THREE.Vector3(
      -(points[1][1] - points[0][1]) / length,
      0,
      (points[1][0] - points[0][0]) / length,
    );
    const origin = new THREE.Vector3(
      point[0],
      elevation(...point) + 4,
      point[1],
    ).addScaledVector(normal, 5);
    const hits = new THREE.Raycaster(
      origin,
      normal.clone().negate(),
      0,
      10,
    ).intersectObject(mesh);
    expect(hits.length).toBeGreaterThanOrEqual(2);
    expect(hits[hits.length - 1].distance - hits[0].distance).toBeGreaterThan(
      2.8,
    );
    const frame = gateFrame(gate);
    const tops = points.slice(1).map((b, i) => {
      const a = points[i];
      const hit = new THREE.Raycaster(
        new THREE.Vector3(
          (a[0] + b[0]) / 2,
          foundation(gate) + 12,
          (a[1] + b[1]) / 2,
        ),
        new THREE.Vector3(0, -1, 0),
      ).intersectObject(mesh)[0];
      if (!hit) throw new Error('Missing entrance wall crest.');
      return hit.point.y;
    });
    expect(tops.every((top) => top > elevation(...frame.center) + 6)).toBe(
      true,
    );
    expect(Math.max(...tops) - Math.min(...tops)).toBeLessThan(0.05);
    material.dispose();
    geometry.dispose();
  });
  it('builds a visible high retaining face without raising the low section alongside it', () => {
    const feature = walls.find((wall) => wall.id === 33878732);
    if (!feature) throw new Error('Missing southern fortification.');
    for (const [point, tall] of [
      [[228.875, 358], true],
      [[107.86, 235.91], false],
    ] as const) {
      const index = feature.points.findIndex(
        (b, i) =>
          i > 0 && segmentDistance(point, feature.points[i - 1], b) < 0.02,
      );
      if (index < 1) throw new Error('Test point is not on its mapped wall.');
      const a = feature.points[index - 1],
        b = feature.points[index];
      const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
      const dx = (b[0] - a[0]) / length,
        dz = (b[1] - a[1]) / length;
      const geometry = continuousWall(
        [
          [point[0] - dx * 3, point[1] - dz * 3],
          [point[0] + dx * 3, point[1] + dz * 3],
        ],
        0.65,
        (p, normal) => wallProfile(feature, p, normal),
      );
      const material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
      const mesh = new THREE.Mesh(geometry, material);
      const hits = new THREE.Raycaster(
        new THREE.Vector3(
          point[0] - dz * 5,
          elevation(...point) + 4,
          point[1] + dx * 5,
        ),
        new THREE.Vector3(dz, 0, -dx),
        0,
        7,
      ).intersectObject(mesh);
      expect(hits.length > 0).toBe(tall);
      geometry.dispose();
      material.dispose();
    }
  });

  it('samples polygon interiors instead of spanning a curved hill with one flat triangle', () => {
    const polygon: Point[] = [
      [-320, -80],
      [-210, -70],
      [-265, 20],
    ];
    const surface = drapedPolygon(polygon, 0.025, unretainedElevation);
    const positions = surface.attributes.position;
    expect(positions.count).toBeGreaterThan(3);
    for (let i = 0; i < positions.count; i++)
      expect(
        positions.getY(i) -
          unretainedElevation(positions.getX(i), positions.getZ(i)),
      ).toBeCloseTo(0.025, 3);
    for (let i = 0; i < positions.count; i += 3) {
      const x =
        (positions.getX(i) + positions.getX(i + 1) + positions.getX(i + 2)) / 3;
      const z =
        (positions.getZ(i) + positions.getZ(i + 1) + positions.getZ(i + 2)) / 3;
      const y =
        (positions.getY(i) + positions.getY(i + 1) + positions.getY(i + 2)) / 3;
      expect(y - unretainedElevation(x, z)).toBeCloseTo(0.025, 3);
    }
    surface.dispose();
  });

  it('joins closed walls at the same miter and keeps paths on the shared ground surface', () => {
    const points: Point[] = [
      [-280, -120],
      [-270, -120],
      [-270, -100],
      [-280, -120],
    ];
    const edges = ribbonEdges(points, 1);
    expect(edges[0]).toEqual(edges.at(-1));
    const wall = continuousWall(points, 1, 1.2);
    expect(wall.attributes.position.count).toBeGreaterThan(0);
    const path = pathRibbon(points, 2.7);
    const positions = path.attributes.position;
    for (let i = 0; i < positions.count; i++)
      expect(
        positions.getY(i) - elevation(positions.getX(i), positions.getZ(i)),
      ).toBeCloseTo(0.055, 3);
    for (let i = 0; i < positions.count; i += 3) {
      const x =
        (positions.getX(i) + positions.getX(i + 1) + positions.getX(i + 2)) / 3;
      const z =
        (positions.getZ(i) + positions.getZ(i + 1) + positions.getZ(i + 2)) / 3;
      const y =
        (positions.getY(i) + positions.getY(i + 1) + positions.getY(i + 2)) / 3;
      expect(y - elevation(x, z)).toBeCloseTo(0.055, 3);
    }
    wall.dispose();
    path.dispose();
  });
});
