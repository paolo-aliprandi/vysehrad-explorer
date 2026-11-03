import * as THREE from 'three';
import polygonClipping from 'polygon-clipping';
import {
  makeFence,
  makeGate,
  makeRotunda,
  makeSlavin,
  makeCemeteryArcade,
  makeEnclosureDetails,
  makeCemeteryGate,
  makeCathedralForecourt,
  cathedralEntrance,
  buildingEntrance,
  makeBuildingDoor,
  decorateBuilding,
} from './architecture';
import {
  elevation,
  features,
  buildings,
  gateFrame,
  gateOpenings,
  gardenPortal,
  sculptures,
  foundation,
  modelBuildingPart,
  originalElevation,
  upperPromenade,
  posterns,
  posternFloor,
  posternVaultRoute,
  stairFlights,
  stairwellFootprint,
  stairElevation,
  featureElevation,
  pathWidth,
  paths,
  type Point,
  pevnostiGrade,
  projectRoute,
  slavin,
  walls,
  rampartWallRuns,
  wallThickness,
  wallProfile,
  streetFrontages,
  courtBankBoundary,
  inside,
  exposedRocks,
  exposedRockAt,
  gardenWallCrest,
  rawElevation,
  riversideDoorways,
  blocked,
  cemeteryArcades,
  cemeteryArcadeBays,
  riversideGallery,
  standingElevation,
  upperElevation,
  spickaShop,
  spickaGate,
  spickaFrontage,
  propContains,
  upperCovers,
  coverElevation,
  cemeteryGate,
  wallOpening,
  casemateEntrance,
  casemateDoor,
  casemateUphillExit,
  casemateUphillFloor,
  playgroundEquipment,
  treePositions,
  meters,
  center,
  taborTerrainField,
  aveMariaFrontage,
  gardenExitAccess,
  summerTheatre,
} from './geo';
import {
  pathRibbon,
  continuousWall,
  courtBankTerrain,
  cliffTerrain,
  gardenBankTerrain,
  drapedPolygon,
} from './surfaces';
import { makeMonuments } from './monuments';
import { makePassages, makeApproach, makeRiversideDoorways } from './passages';
import { roof } from './engine';
import {
  makeStreetFrontage,
  pevnostiHedgePoints,
  makeSpickaShop,
  makeSpickaFrontage,
  makePhotoSiteDetails,
  makeGardenAccessDetails,
  makeSummerTheatre,
} from './site-details';
import { makeNuselskyBridge, nuselskyBridge } from './bridge';
import { makeRiversideGallery } from './gallery';

describe('screenshot geometry repairs', () => {
  it('supports the tower-side cemetery roof corner and its return with grounded solid columns', () => {
    const feature = buildings.find((building) => building.id === -4229100);
    if (!feature) throw new Error('Missing tower-side cemetery arcade.');
    const ground = foundation(feature);
    const material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
    const columns: THREE.Mesh[] = [];
    makeCemeteryArcade(feature, (color, geometry) => {
      if (color === '#bfb49a' || color === '#d1c5a9')
        columns.push(new THREE.Mesh(geometry, material));
      else geometry.dispose();
    });
    for (const point of [
      [-246.65, -13.63],
      [-250.98, -13.07],
    ] as Point[]) {
      for (const height of [0.12, 1.18, 2.23]) {
        const ray = new THREE.Raycaster(
          new THREE.Vector3(point[0] + 1, ground + height, point[1]),
          new THREE.Vector3(-1, 0, 0),
          0,
          1.3,
        );
        expect(
          ray.intersectObjects(columns),
          `missing corner support at ${point}`,
        ).not.toHaveLength(0);
      }
      expect(blocked(point, ground + 0.05)).toBe(true);
    }
    columns.forEach((column) => column.geometry.dispose());
    material.dispose();
  });
  it.each([1054906226])(
    'keeps doorway %i free of facade trims and duplicate survey walls',
    (id) => {
      const feature = buildings.find((building) => building.id === id);
      if (!feature) throw new Error('Missing court-side house.');
      const door = buildingEntrance(feature, 6);
      if (!door) throw new Error('Missing long-house door.');
      const material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
      const trims: THREE.Mesh[] = [];
      decorateBuilding(feature, foundation(feature), 6, (color, geometry) => {
        if (color === '#c5bba5') trims.push(new THREE.Mesh(geometry, material));
        else geometry.dispose();
      });
      for (const wall of walls.filter(
        (wall) => projectRoute(door.point, wall.points).distance < 3,
      ))
        trims.push(
          new THREE.Mesh(
            continuousWall(
              wall.points,
              (point) => wallThickness(wall, point),
              (point, normal) => wallProfile(wall, point, normal),
            ),
            material,
          ),
        );
      const ray = new THREE.Raycaster(
        new THREE.Vector3(
          door.point[0] + door.normal[0] * 2,
          foundation(feature) + 0.35,
          door.point[1] + door.normal[1] * 2,
        ),
        new THREE.Vector3(-door.normal[0], 0, -door.normal[1]),
        0,
        2.4,
      );
      expect(ray.intersectObjects(trims)).toHaveLength(0);
      ray.ray.origin.y = door.ground + 0.7;
      expect(ray.intersectObjects(trims)).toHaveLength(0);
      expect(trims.length).toBeGreaterThan(0);
      trims.forEach((mesh) => mesh.geometry.dispose());
      material.dispose();
    },
  );
  it('keeps the cemetery northwest hip roof continuous at its intended rise instead of folding onto coarse terrain triangles', () => {
    const feature = buildings.find((building) => building.id === -4229100);
    if (!feature) throw new Error('Missing northwest cemetery arcade.');
    const material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
    const roofs: THREE.Mesh[] = [];
    makeCemeteryArcade(feature, (_color, geometry, kind) => {
      if (kind === 'slate') roofs.push(new THREE.Mesh(geometry, material));
      else geometry.dispose();
    });
    for (const point of [
      [-253.4, -48.4],
      [-254, -52.6],
      [-253.4, -47.8],
    ] as Point[]) {
      const expected =
        foundation(feature) +
        4.25 +
        projectRoute(point, feature.points).distance * 0.3;
      const hit = new THREE.Raycaster(
        new THREE.Vector3(point[0], 80, point[1]),
        new THREE.Vector3(0, -1, 0),
      ).intersectObjects(roofs)[0];
      expect(hit).toBeDefined();
      expect(Math.abs(hit.point.y - expected)).toBeLessThan(0.08);
    }
    roofs.forEach((mesh) => mesh.geometry.dispose());
    material.dispose();
  });
  it('models the identified Ave Maria chapel with a staircase-facing portal rather than house windows on its facade', () => {
    const frame = aveMariaFrontage;
    const material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
    const glass: THREE.Mesh[] = [],
      leaves: THREE.Mesh[] = [];
    decorateBuilding(
      frame.feature,
      foundation(frame.feature),
      4,
      (_color, geometry, kind) => {
        if (kind === 'glass') glass.push(new THREE.Mesh(geometry, material));
        else if (kind === 'wood')
          leaves.push(new THREE.Mesh(geometry, material));
        else geometry.dispose();
      },
    );
    const cast = (y: number) =>
      new THREE.Raycaster(
        new THREE.Vector3(
          frame.point[0] + frame.normal[0],
          y,
          frame.point[1] + frame.normal[1],
        ),
        new THREE.Vector3(-frame.normal[0], 0, -frame.normal[1]),
        0,
        1.4,
      );
    expect(
      cast(foundation(frame.feature) + 1.8).intersectObjects(glass),
    ).toHaveLength(0);
    expect(
      cast(upperElevation(...frame.point) + 1.6).intersectObjects(leaves)
        .length,
    ).toBeGreaterThan(0);
    [...glass, ...leaves].forEach((mesh) => mesh.geometry.dispose());
    material.dispose();
  });
  it('renders a continuous garden-exit surface at the shared walking height without risers', () => {
    const material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
    const meshes: THREE.Mesh[] = [];
    makeGardenAccessDetails((_color, geometry) =>
      meshes.push(new THREE.Mesh(geometry, material)),
    );
    const access = gardenExitAccess;
    for (let i = 0; i < access.count; i++) {
      const heights: number[] = [];
      for (const fraction of [0.1, 0.5, 0.9]) {
        const point = access.point(i + fraction);
        const hit = new THREE.Raycaster(
          new THREE.Vector3(point[0], access.levels[i] + 0.5, point[1]),
          new THREE.Vector3(0, -1, 0),
        ).intersectObjects(meshes)[0];
        expect(hit).toBeDefined();
        expect(hit.point.y).toBeCloseTo(standingElevation(point), 4);
        expect(hit.face?.normal.y).toBeGreaterThan(0.95);
        heights.push(hit.point.y);
      }
      if (access.levels[i] - access.levels[i + 1] > 0.001)
        expect(heights[0]).toBeGreaterThan(heights[2]);
    }
    meshes.forEach((mesh) => mesh.geometry.dispose());
    material.dispose();
  });
  it('grounds guard pickets on the supplied path grade rather than the adjacent bank', () => {
    const material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
    const meshes: THREE.Mesh[] = [];
    const grade = (x: number) => 100 + x * 0.1;
    makeFence(
      [
        [0, 0],
        [3.6, 0],
      ],
      1.05,
      (_color, geometry) => meshes.push(new THREE.Mesh(geometry, material)),
      grade,
    );
    const hit = (x: number) =>
      new THREE.Raycaster(
        new THREE.Vector3(x, grade(x) + 0.5, -1),
        new THREE.Vector3(0, 0, 1),
        0,
        2,
      ).intersectObjects(meshes);
    expect(hit(0.2).length).toBeGreaterThan(0);
    expect(hit(0.1)).toHaveLength(0);
    meshes.forEach((mesh) => mesh.geometry.dispose());
    material.dispose();
  });
});

it('paves the main cathedral doorway and joins its forecourt to the mapped approach without a raised walking barrier', () => {
  const geometry: THREE.BufferGeometry[] = [];
  makeCathedralForecourt((_color, item) => geometry.push(item));
  const material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
  const meshes = geometry.map((item) => new THREE.Mesh(item, material));
  for (const mesh of meshes) mesh.updateMatrixWorld(true);
  const face = cathedralEntrance;
  const at = (v: number): Point => [
    face.point[0] + Math.sin(face.angle) * v,
    face.point[1] + Math.cos(face.angle) * v,
  ];
  const route = paths.find((path) => path.id === 27762644);
  const start = route?.points.at(-1);
  if (!start) throw new Error('Missing mapped cathedral approach.');
  const points = [start, at(9), at(7.3), at(5), at(2.2)];
  for (const point of points) {
    const ground = elevation(...point);
    expect(blocked(point, ground), `Walking at ${point.join(', ')}`).toBe(
      false,
    );
    const ray = new THREE.Raycaster(
      new THREE.Vector3(point[0], ground + 2, point[1]),
      new THREE.Vector3(0, -1, 0),
    );
    const hit = ray.intersectObjects(meshes)[0];
    expect(hit, `Pavement at ${point.join(', ')}`).toBeDefined();
    expect(hit.point.y - ground).toBeGreaterThan(0.05);
    expect(hit.point.y - ground).toBeLessThan(0.08);
  }
  for (const door of cathedralEntrance.doors) {
    const point: Point = [
      door.point[0] + Math.sin(door.angle) * 2.2,
      door.point[1] + Math.cos(door.angle) * 2.2,
    ];
    const ray = new THREE.Raycaster(
      new THREE.Vector3(point[0], elevation(...point) + 2, point[1]),
      new THREE.Vector3(0, -1, 0),
    );
    expect(
      ray.intersectObjects(meshes)[0],
      `Shared paving outside door at ${door.point}`,
    ).toBeDefined();
  }
  geometry.forEach((item) => item.dispose());
  material.dispose();
});

it('grounds all three closed cathedral door leaves on their actual mosaic thresholds', () => {
  for (const [index, id] of [454748868, 454748869, 454748870].entries()) {
    const feature = features.find((feature) => feature.id === id);
    if (!feature) throw new Error('Missing cathedral door part.');
    const door = cathedralEntrance.doors[index];
    const leafBottoms: number[] = [];
    decorateBuilding(
      modelBuildingPart(feature),
      foundation(feature),
      35,
      (_color, geometry, kind) => {
        if (kind === 'wood' && _color === '#464a50') {
          geometry.computeBoundingBox();
          if (geometry.boundingBox)
            leafBottoms.push(geometry.boundingBox.min.y);
        }
        geometry.dispose();
      },
    );
    expect(door.threshold).toBeCloseTo(elevation(...door.point) + 0.059, 6);
    expect(Math.min(...leafBottoms)).toBeCloseTo(door.threshold, 4);
    const approach: Point = [
      door.point[0] + Math.sin(door.angle) * 1.4,
      door.point[1] + Math.cos(door.angle) * 1.4,
    ];
    expect(blocked(door.point)).toBe(true);
    expect(blocked(approach)).toBe(false);
  }
});

it('allows a human-radius close cathedral approach at the rendered doorway floor while keeping each closed leaf solid', () => {
  const material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
  for (const door of cathedralEntrance.doors) {
    const feature = features.find((feature) => feature.id === door.id);
    if (!feature) throw new Error('Missing cathedral facade.');
    const leaves: THREE.Mesh[] = [];
    decorateBuilding(
      modelBuildingPart(feature),
      foundation(feature),
      35,
      (color, geometry, kind) => {
        if (kind === 'wood' && color === '#464a50')
          leaves.push(new THREE.Mesh(geometry, material));
        else geometry.dispose();
      },
    );
    const at = (distance: number): Point => [
      door.point[0] + Math.sin(door.angle) * distance,
      door.point[1] + Math.cos(door.angle) * distance,
    ];
    for (let distance = 1.4; distance >= 0.42; distance -= 0.02) {
      const point = at(distance);
      expect(
        blocked(point, standingElevation(point)),
        `door ${door.id} at ${distance}`,
      ).toBe(false);
    }
    const near = at(0.42);
    expect(blocked(near, standingElevation(near))).toBe(false);
    expect(door.threshold - standingElevation(near)).toBeLessThan(0.12);
    expect(blocked(at(0.39), standingElevation(at(0.39)))).toBe(true);
    const ray = new THREE.Raycaster(
      new THREE.Vector3(near[0], door.threshold + 1.1, near[1]),
      new THREE.Vector3(-Math.sin(door.angle), 0, -Math.cos(door.angle)),
    );
    const leaf = ray.intersectObjects(leaves)[0];
    expect(leaf, `actual rendered closed leaf ${door.id}`).toBeDefined();
    expect(leaf.distance).toBeGreaterThan(0.32 / 1.2);
    expect(leaf.distance).toBeLessThan(0.3);
    leaves.forEach((mesh) => mesh.geometry.dispose());
  }
  material.dispose();
});

it('lines the stair-side grass with bushes without blocking the sidewalk or stair mouth', () => {
  const hedges = pevnostiHedgePoints();
  const sidewalk = paths.find((path) => path.id === 494921219);
  const stairs = stairFlights.find((flight) => flight.feature.id === 284582284);
  if (!sidewalk || !stairs)
    throw new Error('Missing stair-side pedestrian access.');
  expect(hedges.length).toBeGreaterThanOrEqual(12);
  for (const point of hedges) {
    expect(projectRoute(point, sidewalk.points).distance).toBeGreaterThan(
      pathWidth(sidewalk) / 2 + 0.7,
    );
    expect(
      projectRoute(point, stairs.feature.points).distance,
    ).toBeGreaterThanOrEqual(2.6);
    expect(blocked(point, upperElevation(...point))).toBe(false);
  }
});

it('keeps generic west-facade glazing above the three decorated cathedral portals', () => {
  for (const id of [454748868, 454748869, 454748870]) {
    const feature = features.find((feature) => feature.id === id);
    if (!feature) throw new Error('Missing cathedral facade part.');
    const parent = buildings.find((building) =>
      inside(center(feature.points), building.points),
    );
    const model = { ...feature, tags: { ...parent?.tags, ...feature.tags } };
    const ground = foundation(model);
    decorateBuilding(
      model,
      ground,
      meters(model.tags.height, 35),
      (_color, geometry, kind) => {
        if (kind === 'glass' && geometry.attributes.normal.getX(0) < -0.6) {
          geometry.computeBoundingBox();
          if (!geometry.boundingBox) throw new Error('Missing glazing bounds.');
          expect(geometry.boundingBox.min.y - ground).toBeGreaterThanOrEqual(7);
        }
        geometry.dispose();
      },
    );
  }
});

it('opens both Špička arches while retaining the pub behind its recessed entrance and solid masonry piers', () => {
  const feature = features.find((feature) => feature.id === 49811195);
  if (!feature) throw new Error('Missing Špička arch.');
  const frame = gateFrame(feature);
  const geometries: THREE.BufferGeometry[] = [];
  makeGate(feature, foundation(feature), (_color, geometry) =>
    geometries.push(geometry),
  );
  const material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
  const meshes = geometries.map(
    (geometry) => new THREE.Mesh(geometry, material),
  );
  for (const mesh of meshes) mesh.updateMatrixWorld(true);
  expect(gateOpenings(feature)).toHaveLength(2);
  const direction = new THREE.Vector3(frame.axis[1], 0, -frame.axis[0]);
  for (const { offset } of spickaGate.openings) {
    const point = spickaGate.at(offset, frame.depth / 2 + 1);
    const ray = new THREE.Raycaster(
      new THREE.Vector3(point[0], spickaGate.ground + 1.4, point[1]),
      direction,
      0,
      offset < 0 ? frame.depth + 2 : 3.8,
    );
    expect(ray.intersectObjects(meshes), `clear arch ${offset}`).toHaveLength(
      0,
    );
    expect(blocked(spickaGate.at(offset, 1.5))).toBe(false);
    expect(blocked(spickaGate.at(offset, 4.2))).toBe(false);
    if (offset > 0) {
      ray.far = frame.depth + 2;
      expect(ray.intersectObjects(meshes)[0]?.distance).toBeGreaterThan(4);
      expect(blocked(spickaGate.at(offset, -0.5))).toBe(true);
    } else {
      expect(blocked(spickaGate.at(offset, -1.5))).toBe(false);
    }
  }
  const pier = spickaGate.at(0, frame.depth / 2 + 0.8);
  expect(
    new THREE.Raycaster(
      new THREE.Vector3(pier[0], spickaGate.ground + 1.4, pier[1]),
      direction,
      0,
      2,
    ).intersectObjects(meshes).length,
  ).toBeGreaterThan(0);
  expect(blocked(frame.center)).toBe(true);
  for (const approach of spickaGate.approaches) {
    const [street, mouth] = approach.points;
    for (let step = 0; step <= 8; step++)
      expect(
        blocked([
          street[0] + ((mouth[0] - street[0]) * step) / 8,
          street[1] + ((mouth[1] - street[1]) * step) / 8,
        ]),
        `clear paved approach ${step}`,
      ).toBe(false);
  }
  geometries.forEach((geometry) => geometry.dispose());
  material.dispose();
});

it('renders the historic hand pump and hollow stone basin beside planted hedges and an open house-front gate', () => {
  const geometries: THREE.BufferGeometry[] = [];
  makeSpickaFrontage((_color, geometry) => geometries.push(geometry));
  const material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
  const meshes = geometries.map(
    (geometry) => new THREE.Mesh(geometry, material),
  );
  const down = (point: Point) =>
    new THREE.Raycaster(
      new THREE.Vector3(point[0], elevation(...point) + 4, point[1]),
      new THREE.Vector3(0, -1, 0),
    ).intersectObjects(meshes)[0];
  const pump = spickaFrontage.pump.point;
  expect(down(pump)?.point.y - elevation(...pump)).toBeGreaterThan(2.2);
  expect(blocked(pump)).toBe(true);
  const basin = spickaFrontage.at(0, -0.7);
  expect(down(basin)?.point.y - elevation(...pump)).toBeCloseTo(0.4625, 3);
  expect(blocked(basin)).toBe(true);
  const trees = treePositions();
  expect(trees.some((tree) => inside(tree, spickaFrontage.pumpApron))).toBe(
    false,
  );
  expect(trees.some((tree) => inside(tree, spickaFrontage.plantingPlot))).toBe(
    false,
  );
  for (const hedge of spickaFrontage.hedges) {
    expect(blocked(hedge.point)).toBe(true);
    expect(trees.some((tree) => propContains(hedge, tree, 0.6))).toBe(false);
  }
  expect(blocked(spickaFrontage.houseEntrance)).toBe(false);
  const houseDoor = buildingEntrance(spickaFrontage.house, 6.2);
  if (!houseDoor) throw new Error('Missing neighboring house door.');
  expect(
    blocked([
      houseDoor.point[0] + houseDoor.normal[0] * 1.1,
      houseDoor.point[1] + houseDoor.normal[1] * 1.1,
    ]),
  ).toBe(false);
  geometries.forEach((geometry) => geometry.dispose());
  material.dispose();
});

it('recesses the casemate door behind a deep, open rock-cut vault instead of a flat facade', () => {
  const geometries: THREE.BufferGeometry[] = [];
  makePhotoSiteDetails((_color, geometry) => geometries.push(geometry));
  const material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
  const meshes = geometries.map(
    (geometry) => new THREE.Mesh(geometry, material),
  );
  meshes.forEach((mesh) => mesh.updateMatrixWorld(true));
  const { point, normal } = casemateEntrance;
  const ray = new THREE.Raycaster(
    new THREE.Vector3(
      point[0] + normal[0] * 2,
      casemateDoor.floor + 1,
      point[1] + normal[1] * 2,
    ),
    new THREE.Vector3(-normal[0], 0, -normal[1]),
    0,
    8,
  );
  const hit = ray.intersectObjects(meshes)[0];
  expect(hit).toBeDefined();
  expect(hit.distance).toBeGreaterThan(5.5);
  expect(hit.distance).toBeLessThan(6.5);
  expect(blocked(point, casemateDoor.floor)).toBe(false);
  const exit = casemateUphillExit;
  for (let i = 0; i < 8; i++) {
    const point = exit.at(((i + 0.5) * exit.length) / 8, 0);
    const floor = casemateUphillFloor(point);
    ray.set(
      new THREE.Vector3(point[0], floor + 0.1, point[1]),
      new THREE.Vector3(0, -1, 0),
    );
    ray.far = 0.3;
    expect(ray.intersectObjects(meshes)[0]?.point.y).toBeCloseTo(floor, 4);
  }
  const landing = exit.at(exit.length + 0.25, 0);
  ray.set(
    new THREE.Vector3(landing[0], exit.floor + 0.1, landing[1]),
    new THREE.Vector3(0, -1, 0),
  );
  expect(ray.intersectObjects(meshes)[0]?.point.y).toBeCloseTo(exit.floor, 4);
  geometries.forEach((geometry) => geometry.dispose());
  material.dispose();
});

it('keeps wooden playground equipment inside the mapped park and off pedestrian routes', () => {
  const park = features.find((feature) => feature.id === 122555875);
  if (!park) throw new Error('Missing mapped playground.');
  const trees = treePositions();
  for (const item of playgroundEquipment) {
    expect(item.footprint.every((point) => inside(point, park.points))).toBe(
      true,
    );
    expect(blocked(item.point)).toBe(true);
    expect(trees.some((point) => inside(point, item.footprint))).toBe(false);
    for (const path of paths)
      expect(projectRoute(item.point, path.points).distance).toBeGreaterThan(
        pathWidth(path) / 2 + 3,
      );
  }
});

it('adds a supported roadside shop and leaves its café garden accessible', () => {
  const geometries: THREE.BufferGeometry[] = [];
  makeSpickaShop((_color, geometry) => geometries.push(geometry));
  const material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
  const meshes = geometries.map(
    (geometry) => new THREE.Mesh(geometry, material),
  );
  for (const mesh of meshes) mesh.updateMatrixWorld(true);
  const at = (u: number, v: number): Point => [
    spickaShop.center[0] + spickaShop.axis[0] * u - spickaShop.axis[1] * v,
    spickaShop.center[1] + spickaShop.axis[1] * u + spickaShop.axis[0] * v,
  ];
  for (const side of [-1, 1]) {
    const point = at(side * 2.7, 2.9);
    const direction = new THREE.Vector3(
      spickaShop.axis[1],
      0,
      -spickaShop.axis[0],
    );
    const ray = new THREE.Raycaster(
      new THREE.Vector3(point[0], elevation(...point) + 0.15, point[1]),
      direction,
      0,
      1,
    );
    expect(ray.intersectObjects(meshes).length).toBeGreaterThan(0);
  }
  expect(blocked(spickaShop.center)).toBe(true);
  expect(blocked(at(8.5, 0))).toBe(false);
  geometries.forEach((geometry) => geometry.dispose());
  material.dispose();
});

it('keeps the reconstructed Špička gate separate from neighboring mapped buildings and the roadside kiosk', () => {
  const arch = features.find((feature) => feature.id === 49811195);
  if (!arch) throw new Error('Missing Špička arch.');
  const ring = (points: readonly Point[]) =>
    points.map(([x, z]): [number, number] => [x, z]);
  for (const building of buildings) {
    if (building.id === arch.id) continue;
    expect(
      polygonClipping.intersection(
        [ring(arch.points)],
        [ring(building.points)],
      ),
      `Arch overlaps building ${building.id}`,
    ).toHaveLength(0);
  }
});

it('adds a supported street-facing house door and never places doors on a road', () => {
  const house = features.find((feature) => feature.id === 49811193);
  const road = features.find((feature) => feature.id === 370193785);
  if (!house || !road) throw new Error('Missing street entrance references.');
  const door = buildingEntrance(house, 6.2);
  if (!door) throw new Error('The ordinary roadside house has no entrance.');
  const geometries: {
    geometry: THREE.BufferGeometry;
    kind: string | undefined;
  }[] = [];
  makeBuildingDoor(door, (_color, geometry, kind) =>
    geometries.push({ geometry, kind }),
  );
  const material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
  const meshes = geometries.map(({ geometry, kind }) => {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = kind ?? '';
    mesh.updateMatrixWorld(true);
    return mesh;
  });
  const normal = new THREE.Vector3(door.normal[0], 0, door.normal[1]);
  const origin = new THREE.Vector3(
    door.point[0],
    door.ground + 1.1,
    door.point[1],
  ).addScaledVector(normal, 2);
  const hit = new THREE.Raycaster(
    origin,
    normal.negate(),
    0,
    3,
  ).intersectObjects(meshes)[0];
  expect(hit.object.name).toBe('wood');
  const stepRay = new THREE.Raycaster(
    new THREE.Vector3(
      door.point[0] + door.normal[0] * 0.3,
      door.ground + 1,
      door.point[1] + door.normal[1] * 0.3,
    ),
    new THREE.Vector3(0, -1, 0),
  );
  expect(stepRay.intersectObjects(meshes)[0].point.y).toBeCloseTo(
    door.ground,
    5,
  );
  expect(buildingEntrance(road, 3)).toBeUndefined();
  geometries.forEach(({ geometry }) => geometry.dispose());
  material.dispose();
});

it('fits rotated and concave building door frames to a real facade segment with a flat supported threshold', () => {
  for (const angle of [0.63, -1.17]) {
    const ring = [
      [0, 0],
      [4, 0],
      [4, 1.3],
      [1.3, 1.3],
      [1.3, 4],
      [0, 4],
      [0, 0],
    ];
    const feature = {
      id: -9999999,
      points: ring.map(
        ([x, z]): Point => [
          Math.cos(angle) * x + Math.sin(angle) * z,
          -Math.sin(angle) * x + Math.cos(angle) * z,
        ],
      ),
      tags: { building: 'yes' },
      holes: [],
    };
    const door = buildingEntrance(feature, 6);
    if (!door) throw new Error('No supported concave facade doorway.');
    const [a, b] = door.wall;
    const dx = b[0] - a[0],
      dz = b[1] - a[1];
    const length = Math.hypot(dx, dz);
    const along =
      ((door.face[0] - a[0]) * dx + (door.face[1] - a[1]) * dz) / length;
    expect(Math.abs(dx * door.normal[0] + dz * door.normal[1])).toBeLessThan(
      0.00001,
    );
    expect(Math.min(along, length - along)).toBeGreaterThan(
      (door.width + 0.24) / 2,
    );
    expect(
      projectRoute(door.point, feature.points).distance - 0.07,
    ).toBeLessThan(0);
    for (const p of door.doorstep) {
      expect(inside(p, feature.points)).toBe(false);
      expect(upperElevation(...p)).toBeLessThan(door.ground);
    }
    const leaf: THREE.BufferGeometry[] = [];
    makeBuildingDoor(door, (_color, geometry, kind) => {
      if (kind === 'wood') leaf.push(geometry);
      else geometry.dispose();
    });

    leaf[0].computeBoundingBox();
    expect(leaf[0].boundingBox?.min.y).toBeCloseTo(door.ground, 4);
    leaf.forEach((geometry) => geometry.dispose());
  }
});

it('embeds the rotunda portal frame into its curved wall rather than floating a tangent arch ahead of it', () => {
  const feature = buildings.find((building) => building.id === 560209917);
  if (!feature) throw new Error('Missing rotunda.');
  let drum: THREE.Box3 | undefined;
  const frame: THREE.BufferGeometry[] = [];
  makeRotunda(feature, foundation(feature), (color, geometry) => {
    if (color === '#c0b49a' && !drum) {
      geometry.computeBoundingBox();
      drum = geometry.boundingBox?.clone();
    }
    if (color === '#b59a72') frame.push(geometry);
    else geometry.dispose();
  });
  if (!drum || !frame.length)
    throw new Error('Missing rotunda wall or doorway.');
  const midpoint = drum.getCenter(new THREE.Vector3());
  const radius = (drum.max.x - drum.min.x) / 2;
  const positions = frame[0].attributes.position;
  let minRadius = Infinity,
    maxRadius = 0;
  for (let i = 0; i < positions.count; i++) {
    const distance = Math.hypot(
      positions.getX(i) - midpoint.x,
      positions.getZ(i) - midpoint.z,
    );
    minRadius = Math.min(minRadius, distance);
    maxRadius = Math.max(maxRadius, distance);
  }
  expect(minRadius).toBeLessThan(radius);
  expect(maxRadius).toBeGreaterThan(radius);
  frame.forEach((geometry) => geometry.dispose());
});

it('sets street-business and casemate doors on actual facade planes instead of bounding-box or wall-center ground', () => {
  for (const frame of streetFrontages) {
    expect(
      projectRoute(frame.facade, frame.building.points).distance,
    ).toBeLessThan(0.00001);
    expect(
      inside(
        [
          frame.facade[0] + frame.normal[0] * 0.1,
          frame.facade[1] + frame.normal[1] * 0.1,
        ],
        frame.building.points,
      ),
    ).toBe(false);
  }
  const { point, normal, wall } = casemateEntrance;
  expect(projectRoute(casemateDoor.point, wall.points).distance).toBeCloseTo(
    wallThickness(wall, point) / 2 + 0.04,
  );
  expect(casemateDoor.floor).toBeGreaterThan(
    upperElevation(...casemateDoor.point),
  );
  expect(casemateDoor.normal).toEqual(normal);
});

it('gives the cemetery exit a solid arched gateway with open iron leaves and a clear walking threshold', () => {
  const geometries: THREE.BufferGeometry[] = [];
  makeCemeteryGate((_color, geometry) => geometries.push(geometry));
  const material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
  const meshes = geometries.map(
    (geometry) => new THREE.Mesh(geometry, material),
  );
  const gate = cemeteryGate,
    ground = elevation(...gate.center);
  const at = (u: number, v: number, y = 0) =>
    new THREE.Vector3(
      gate.center[0] + gate.axis[0] * u - gate.axis[1] * v,
      ground + y,
      gate.center[1] + gate.axis[1] * u + gate.axis[0] * v,
    );
  const direction = new THREE.Vector3(-gate.axis[1], 0, gate.axis[0]);
  for (const u of [-1.2, 0, 1.2]) {
    expect(
      new THREE.Raycaster(at(u, -4, 1.75), direction, 0, 8).intersectObjects(
        meshes,
      ),
    ).toHaveLength(0);
    for (const v of [-1, 0, 1]) {
      const point = at(u, v);
      expect(blocked([point.x, point.z], ground)).toBe(false);
    }
  }
  for (const [u, y] of [
    [-2.1, 1.75],
    [2.1, 1.75],
    [0, 4],
    [0, 4.65],
  ])
    expect(
      new THREE.Raycaster(at(u, -4, y), direction, 0, 8).intersectObjects(
        meshes,
      ).length,
    ).toBeGreaterThan(0);
  for (const side of [-1, 1]) {
    const pier = at(side * 2.1, 0),
      leaf = at(side * 1.63, -1);
    expect(blocked([pier.x, pier.z], ground)).toBe(true);
    expect(blocked([leaf.x, leaf.z], ground)).toBe(true);
  }
  geometries.forEach((geometry) => geometry.dispose());
  material.dispose();
});

it('continues stone coping across the full outer brick fortifications, not just near Tabor Gate', () => {
  const geometries: THREE.BufferGeometry[] = [];
  makeEnclosureDetails((_color, geometry) => geometries.push(geometry));
  const material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
  const meshes = geometries.map(
    (geometry) => new THREE.Mesh(geometry, material),
  );
  for (const id of [8888302, 33878732]) {
    const wall = walls.find((wall) => wall.id === id);
    if (!wall) throw new Error('Missing outer fortification.');
    const index =
      id === 33878732
        ? 0
        : wall.points.findIndex((point) => point[1] > 220 && point[1] < 245);
    if (index < 0) throw new Error('Missing outer wall coping sample.');
    const a = wall.points[index],
      b = wall.points[index + 1];
    const point = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2] as const;
    expect(wallOpening(point)).toBe(false);
    const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const normal = [-(b[1] - a[1]) / length, (b[0] - a[0]) / length] as const;
    const crest = wallProfile(wall, point, normal).top;
    for (const offset of [-0.6, 0, 0.6]) {
      const hit = new THREE.Raycaster(
        new THREE.Vector3(
          point[0] + normal[0] * offset,
          crest + 0.8,
          point[1] + normal[1] * offset,
        ),
        new THREE.Vector3(0, -1, 0),
        0,
        1.2,
      ).intersectObjects(meshes)[0];
      expect(hit?.point.y, `coping ${id}, ${offset}`).toBeCloseTo(
        crest + 0.16,
        2,
      );
    }
  }
  geometries.forEach((geometry) => geometry.dispose());
  material.dispose();
});

it('opens the mapped cemetery arcades beneath roofs and between solid columns', () => {
  const geometries: THREE.BufferGeometry[] = [];
  const material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
  for (const arcade of cemeteryArcades) {
    makeCemeteryArcade(arcade.feature, (_color, geometry) =>
      geometries.push(geometry),
    );
    const bay = cemeteryArcadeBays.find(
      (bay) => bay.feature.id === arcade.feature.id,
    );
    if (!bay) throw new Error('Missing cemetery arcade bay.');
    const meshes = geometries.map(
      (geometry) => new THREE.Mesh(geometry, material),
    );
    const normal = new THREE.Vector3(-bay.axis[1], 0, bay.axis[0]);
    if (
      !inside(
        [bay.center[0] + normal.x, bay.center[1] + normal.z],
        arcade.feature.points,
      )
    )
      normal.negate();
    const ground = foundation(arcade.feature);
    const front = new THREE.Vector3(
      bay.center[0],
      ground + 1.5,
      bay.center[1],
    ).addScaledVector(normal, -0.8);
    expect(
      new THREE.Raycaster(front, normal, 0, 1.6).intersectObjects(meshes),
    ).toHaveLength(0);
    const column = front
      .clone()
      .add(
        new THREE.Vector3(bay.axis[0], 0, bay.axis[1]).multiplyScalar(
          bay.width / 2,
        ),
      );
    expect(
      new THREE.Raycaster(column, normal, 0, 1.6).intersectObjects(meshes)
        .length,
    ).toBeGreaterThan(0);
    const beneath = front.clone().addScaledVector(normal, 1.8);
    expect(
      new THREE.Raycaster(
        beneath,
        new THREE.Vector3(0, 1, 0),
        0,
        5,
      ).intersectObjects(meshes).length,
    ).toBeGreaterThan(0);
    expect(blocked([beneath.x, beneath.z])).toBe(false);
    expect(
      blocked([column.x + normal.x * 0.8, column.z + normal.z * 0.8]),
    ).toBe(true);
  }
  geometries.forEach((geometry) => geometry.dispose());
  material.dispose();
});

it('finishes the cemetery exit with open front and return arches instead of bare porch ends', () => {
  const geometries: THREE.BufferGeometry[] = [];
  for (const arcade of cemeteryArcades.slice(0, 2))
    makeCemeteryArcade(arcade.feature, (_color, geometry) =>
      geometries.push(geometry),
    );
  const material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
  const meshes = geometries.map(
    (geometry) => new THREE.Mesh(geometry, material),
  );
  for (const point of [
    [-211, -51.34],
    [-208.5, -55.08],
    [-203.62, -50.66],
    [-205.2, -54.78],
  ] as const) {
    const bay = cemeteryArcadeBays.find(
      (bay) =>
        Math.hypot(bay.center[0] - point[0], bay.center[1] - point[1]) < 1,
    );
    if (!bay) throw new Error(`Missing exit porch bay at ${point}.`);
    const ground = foundation(bay.feature);
    const direction = new THREE.Vector3(-bay.axis[1], 0, bay.axis[0]);
    const ray = (height: number) =>
      new THREE.Raycaster(
        new THREE.Vector3(
          bay.center[0],
          ground + height,
          bay.center[1],
        ).addScaledVector(direction, -0.6),
        direction,
        0,
        1.2,
      ).intersectObjects(meshes);
    expect(ray(1.8)).toHaveLength(0);
    expect(ray(4).length).toBeGreaterThan(0);
  }
  for (const x of [-207.35, -206.7, -206])
    for (let z = -62; z <= -47; z++)
      expect(blocked([x, z], standingElevation([x, z]))).toBe(false);
  for (const point of [
    [-208.75, -51.98],
    [-205.49, -51.52],
  ] as const) {
    const arcade = cemeteryArcades.find((arcade) =>
      arcade.feature.points.some(
        (vertex) => vertex[0] === point[0] && vertex[1] === point[1],
      ),
    );
    if (!arcade) throw new Error('Missing porch-end roof corner.');
    const ground = foundation(arcade.feature);
    const centerPoint = center(arcade.feature.points);
    const hit = new THREE.Raycaster(
      new THREE.Vector3(
        point[0] + (centerPoint[0] - point[0]) * 0.0001,
        ground + 6,
        point[1] + (centerPoint[1] - point[1]) * 0.0001,
      ),
      new THREE.Vector3(0, -1, 0),
      0,
      3,
    ).intersectObjects(meshes)[0];
    expect(hit).toBeDefined();
    expect(hit.point.y - ground).toBeCloseTo(4.25, 2);
  }
  geometries.forEach((geometry) => geometry.dispose());
  material.dispose();
});

it('puts open arched portals at the exterior tunnel mouths rather than rectangular slots through the road cover', () => {
  const geometries: THREE.BufferGeometry[] = [];
  makePassages((_color, geometry) => geometries.push(geometry));
  const material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
  const meshes = geometries.map(
    (geometry) => new THREE.Mesh(geometry, material),
  );
  for (const tunnel of posterns.filter((tunnel) =>
    [8888304, 28811769, 183917808].includes(tunnel.feature.id),
  )) {
    const route = posternVaultRoute(tunnel);
    for (const endpoint of [0, route.length - 1]) {
      const point = route[endpoint];
      const neighbor = route[endpoint === 0 ? 1 : endpoint - 1];
      const inward = new THREE.Vector3(
        neighbor[0] - point[0],
        0,
        neighbor[1] - point[1],
      ).normalize();
      const floor = posternFloor(tunnel, point);
      for (const lateral of [-0.8, 0, 0.8]) {
        const origin = new THREE.Vector3(
          point[0] - inward.z * lateral,
          floor + 1.25,
          point[1] + inward.x * lateral,
        ).addScaledVector(inward, -1);
        expect(
          new THREE.Raycaster(origin, inward, 0, 1.5).intersectObjects(meshes),
          `open mouth ${tunnel.feature.id}, end ${endpoint}, side ${lateral}`,
        ).toHaveLength(0);
        origin.y =
          floor +
          1.5 +
          Math.sqrt((tunnel.width / 2) ** 2 - lateral ** 2) +
          0.12;
        const arch = new THREE.Raycaster(
          origin,
          inward,
          0,
          1.5,
        ).intersectObjects(meshes)[0];
        expect(
          arch,
          `exterior arch ${tunnel.feature.id}, end ${endpoint}`,
        ).toBeDefined();
        expect(arch.distance).toBeLessThan(1.3);
      }
    }
  }
  geometries.forEach((geometry) => geometry.dispose());
  material.dispose();
});

it('keeps the full Tabor tunnel approaches free of terrain at walking height', () => {
  const field = taborTerrainField;
  const geometry = new THREE.PlaneGeometry(
    field.maxX - field.minX,
    field.maxZ - field.minZ,
    field.columns,
    field.rows,
  );
  geometry.rotateX(-Math.PI / 2);
  geometry.translate(
    (field.minX + field.maxX) / 2,
    0,
    (field.minZ + field.maxZ) / 2,
  );
  const positions = geometry.attributes.position;
  for (let index = 0; index < positions.count; index++)
    positions.setY(
      index,
      elevation(positions.getX(index), positions.getZ(index)),
    );
  const material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
  const mesh = new THREE.Mesh(geometry, material);
  for (const tunnel of posterns.filter((tunnel) =>
    [8888304, 28811769, 183917808].includes(tunnel.feature.id),
  )) {
    for (const endpoint of [0, tunnel.feature.points.length - 1]) {
      const point = tunnel.feature.points[endpoint];
      const neighbor = tunnel.feature.points[endpoint === 0 ? 1 : endpoint - 1];
      const direction = new THREE.Vector3(
        neighbor[0] - point[0],
        0,
        neighbor[1] - point[1],
      ).normalize();
      for (const lateral of [-0.85, 0, 0.85]) {
        const origin = new THREE.Vector3(
          point[0] - direction.z * lateral,
          posternFloor(tunnel, point) + 1.25,
          point[1] + direction.x * lateral,
        ).addScaledVector(direction, -6);
        expect(
          new THREE.Raycaster(origin, direction, 0, 6.25).intersectObject(mesh),
          `Tunnel ${tunnel.feature.id}, endpoint ${endpoint}, side ${lateral}`,
        ).toHaveLength(0);
      }
    }
  }
  geometry.dispose();
  material.dispose();
});

it('keeps the riverside road gallery open below the rock and its approaches free of terrain plugs', () => {
  const geometries: THREE.BufferGeometry[] = [];
  makeRiversideGallery((_color, geometry) => geometries.push(geometry));
  const material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
  const meshes = geometries.map(
    (geometry) => new THREE.Mesh(geometry, material),
  );
  const terrain = cliffTerrain();
  for (const approach of riversideGallery.approaches) {
    const inward = new THREE.Vector3(-approach.axis[0], 0, -approach.axis[1]);
    const eye = new THREE.Vector3(
      approach.end[0],
      approach.floor + 1.5,
      approach.end[1],
    ).addScaledVector(inward, -2);
    expect(
      new THREE.Raycaster(eye, inward, 0, 5).intersectObjects(meshes),
    ).toHaveLength(0);
    expect(
      new THREE.Raycaster(eye, inward, 0, 5).intersectObject(
        new THREE.Mesh(terrain, material),
      ),
    ).toHaveLength(0);
    const above = eye.clone().add(new THREE.Vector3(0, 4.5, 0));
    expect(
      new THREE.Raycaster(above, inward, 0, 5).intersectObjects(meshes).length,
    ).toBeGreaterThan(0);
    const point = [eye.x, eye.z] as const;
    expect(
      new THREE.Raycaster(
        new THREE.Vector3(eye.x, 70, eye.z),
        new THREE.Vector3(0, -1, 0),
      ).intersectObject(new THREE.Mesh(terrain, material)),
    ).toHaveLength(0);
    expect(standingElevation(point, approach.floor + 0.2)).toBeCloseTo(
      approach.floor,
      0,
    );
    expect(elevation(...point)).toBeCloseTo(
      standingElevation(point, approach.floor),
      4,
    );
    const circle = Array.from(
      { length: 17 },
      (_, i): readonly [number, number] => [
        approach.end[0] + Math.cos((i * Math.PI) / 8) * 2,
        approach.end[1] + Math.sin((i * Math.PI) / 8) * 2,
      ],
    );
    const junction = drapedPolygon(circle, 0.056, (x, z) =>
      featureElevation(riversideGallery.road, [x, z]),
    );
    expect(
      new THREE.Raycaster(eye, inward, 0, 5).intersectObject(
        new THREE.Mesh(junction, material),
      ),
    ).toHaveLength(0);
    junction.dispose();
  }
  const point = riversideGallery.road.points[3];
  const floor = standingElevation(point, 5);
  expect(elevation(...point) - floor).toBeGreaterThan(15);
  expect(standingElevation(point, elevation(...point))).toBeCloseTo(
    elevation(...point),
  );
  expect(blocked(point, floor)).toBe(false);
  geometries.forEach((geometry) => geometry.dispose());
  terrain.dispose();
  material.dispose();
});

it('mounts Saint Sebastian and his shallow niche against the rampart instead of on a detached projecting pedestal', () => {
  const statue = sculptures.find((statue) => statue.id === 1200790218);
  const wall = walls.find((wall) => wall.id === 1532977610);
  if (!statue || !wall) throw new Error('Missing Saint Sebastian or rampart.');
  const material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
  const geometries = rampartWallRuns(wall).map((points) =>
    continuousWall(
      points,
      (p) => wallThickness(wall, p),
      (p, n) => wallProfile(wall, p, n),
      true,
      courtBankBoundary,
    ),
  );
  const meshes = geometries.map((g) => new THREE.Mesh(g, material));
  const ground = elevation(...statue.point);
  const figures: THREE.Mesh[] = [];
  makeMonuments((_color, geometry) => {
    geometries.push(geometry);
    figures.push(new THREE.Mesh(geometry, material));
  });
  for (const height of [0.5, 2, 3.2]) {
    const ray = new THREE.Raycaster(
      new THREE.Vector3(statue.point[0] + 6, ground + height, statue.point[1]),
      new THREE.Vector3(-1, 0, 0),
      0,
      8,
    );
    const masonry = ray.intersectObjects(meshes)[0];
    const figure = ray.intersectObjects(figures)[0];
    expect(masonry).toBeDefined();
    expect(figure).toBeDefined();
    expect(masonry.distance - figure.distance).toBeGreaterThan(0);
    expect(masonry.distance - figure.distance).toBeLessThan(1.25);
  }
  expect(blocked(statue.point)).toBe(true);
  geometries.forEach((g) => g.dispose());
  material.dispose();
});

it('gives the summer theatre a continuous walkable stage and grounded rows of seating', () => {
  const material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
  const meshes: THREE.Mesh[] = [];
  makeSummerTheatre((_color, geometry) =>
    meshes.push(new THREE.Mesh(geometry, material)),
  );
  const stage = summerTheatre.stage;
  const floor = (stage.ground ?? elevation(...stage.point)) + stage.height;
  for (const u of [-3.5, 0, 3.5])
    for (const v of [-1.4, 0, 1.4]) {
      const point = summerTheatre.at(u, v);
      const hit = new THREE.Raycaster(
        new THREE.Vector3(point[0], floor + 0.1, point[1]),
        new THREE.Vector3(0, -1, 0),
        0,
        0.2,
      ).intersectObjects(meshes)[0];
      expect(hit).toBeDefined();
      expect(Math.abs(hit.point.y - floor)).toBeLessThan(0.025);
    }
  for (const seat of summerTheatre.seats) {
    const floor = seat.ground ?? elevation(...seat.point);
    const hit = new THREE.Raycaster(
      new THREE.Vector3(seat.point[0], floor + 0.7, seat.point[1]),
      new THREE.Vector3(0, -1, 0),
      0,
      0.3,
    ).intersectObjects(meshes)[0];
    expect(hit).toBeDefined();
    expect(hit.point.y).toBeCloseTo(floor + 0.58);
  }
  meshes.forEach((mesh) => mesh.geometry.dispose());
  material.dispose();
});

it('encloses riverside doorways with solid masonry above the arch instead of full-height wall breaks', () => {
  expect(riversideDoorways.length).toBeGreaterThanOrEqual(2);
  const wall = walls.find((wall) => wall.id === 1532977610);
  if (!wall) throw new Error('Missing riverside rampart.');
  const material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
  const geometries = rampartWallRuns(wall).map((points) =>
    continuousWall(
      points,
      (p) => wallThickness(wall, p),
      (p, n) => wallProfile(wall, p, n),
      true,
      courtBankBoundary,
    ),
  );
  makeRiversideDoorways((_color, geometry) => geometries.push(geometry));
  const meshes = geometries.map((g) => new THREE.Mesh(g, material));
  const groundGeometry = cliffTerrain();
  const groundMesh = new THREE.Mesh(groundGeometry, material);
  for (const door of riversideDoorways) {
    const { frame, floor } = door;
    const normal = new THREE.Vector3(-frame.axis[1], 0, frame.axis[0]);
    for (const distance of [-frame.depth / 2 + 0.1, 0, frame.depth / 2 - 0.1]) {
      const x = frame.center[0] + normal.x * distance,
        z = frame.center[1] + normal.z * distance;
      expect(elevation(x, z)).toBeCloseTo(floor, 0);
      if (door.point[1] > 100) {
        const hit = new THREE.Raycaster(
          new THREE.Vector3(x, floor + 1, z),
          new THREE.Vector3(0, -1, 0),
        ).intersectObject(groundMesh)[0];
        expect(hit?.point.y).toBeCloseTo(floor, 0);
      }
    }
    const ray = (u: number, height: number) =>
      new THREE.Raycaster(
        new THREE.Vector3(
          frame.center[0] + frame.axis[0] * u,
          floor + height,
          frame.center[1] + frame.axis[1] * u,
        ).addScaledVector(normal, -frame.depth / 2 - 1),
        normal,
        0,
        frame.depth + 2,
      );
    for (const u of [-0.6, 0, 0.6])
      expect(
        ray(u, 1.4).intersectObjects(meshes),
        `Door at ${door.point}`,
      ).toHaveLength(0);
    for (const u of [-1.6, 0, 1.6])
      expect(ray(u, 2.9).intersectObjects(meshes).length).toBeGreaterThan(0);
    expect(blocked(frame.center, floor + 1.4)).toBe(false);
    expect(blocked(frame.center, floor + 2.9)).toBe(true);
  }
  geometries.forEach((g) => g.dispose());
  groundGeometry.dispose();
  material.dispose();
});

it('carries Nuselsky Bridge across the valley above grounded piers without filling the clearance beneath its spans', () => {
  const geometries: THREE.BufferGeometry[] = [];
  makeNuselskyBridge((_color, geometry) => geometries.push(geometry));
  const material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
  const meshes = geometries.map(
    (geometry) => new THREE.Mesh(geometry, material),
  );
  const { start, end } = nuselskyBridge;
  for (const t of [0.35, 0.55]) {
    const p: readonly [number, number] = [
      start[0] + (end[0] - start[0]) * t,
      start[1] + (end[1] - start[1]) * t,
    ];
    const hit = new THREE.Raycaster(
      new THREE.Vector3(p[0], 100, p[1]),
      new THREE.Vector3(0, -1, 0),
    ).intersectObjects(meshes)[0];
    if (!hit) throw new Error('Missing elevated Nuselsky Bridge deck.');
    expect(hit.point.y - rawElevation(...p)).toBeGreaterThan(30);
    const through = new THREE.Raycaster(
      new THREE.Vector3(p[0] - 30, rawElevation(...p) + 10, p[1]),
      new THREE.Vector3(1, 0, 0),
      0,
      60,
    );
    expect(through.intersectObjects(meshes)).toHaveLength(0);
  }
  geometries.forEach((geometry) => geometry.dispose());
  material.dispose();
});

it('clips upper garden-bank soil and grass at the retaining wall instead of stretching spikes over the lower plots', () => {
  const wall = walls.find((wall) => wall.id === 1532977610);
  if (!wall) throw new Error('Missing garden-side rampart.');
  const projection = projectRoute([152, 125], wall.points);
  const p = projection.point,
    n = projection.normal;
  const side = inside([p[0] + n[0], p[1] + n[1]], wall.points) ? 1 : -1;
  const terrain = gardenBankTerrain();
  const grass = drapedPolygon(
    [
      [120, 105],
      [185, 105],
      [185, 150],
      [120, 150],
      [120, 105],
    ],
    0.025,
  );
  const material = new THREE.MeshBasicMaterial();
  const sample = (distance: number) => {
    const x = p[0] + n[0] * side * distance,
      z = p[1] + n[1] * side * distance;
    const ray = new THREE.Raycaster(
      new THREE.Vector3(x, 80, z),
      new THREE.Vector3(0, -1, 0),
    );
    const ground = ray.intersectObject(new THREE.Mesh(terrain, material))[0];
    const overlay = ray.intersectObject(new THREE.Mesh(grass, material))[0];
    expect(ground?.point.y).toBeCloseTo(elevation(x, z), 1);
    expect(overlay?.point.y).toBeCloseTo(ground.point.y + 0.025, 2);
    return ground.point.y;
  };
  expect(sample(1) - sample(-1)).toBeGreaterThan(5);
  terrain.dispose();
  grass.dispose();
  material.dispose();
});

it('retains the upper bastion earth while exposing mapped rock below a sloping, grounded masonry face', () => {
  const material = new THREE.MeshBasicMaterial();
  const terrain = cliffTerrain();
  const rock = exposedRocks.find((rock) => rock.id === 387679433);
  const wall = walls.find((wall) => wall.id === 1532977610);
  if (!rock || !wall)
    throw new Error('Missing mapped riverside rock or bastion.');
  const rockSurface = drapedPolygon(rock.points, 0.04);
  const grass = drapedPolygon(
    [
      [-340, 40],
      [-220, 40],
      [-220, 235],
      [-340, 235],
      [-340, 40],
    ],
    0.025,
    elevation,
    exposedRocks.map((rock) => rock.points),
  );
  const ray = (point: readonly [number, number]) =>
    new THREE.Raycaster(
      new THREE.Vector3(point[0], 80, point[1]),
      new THREE.Vector3(0, -1, 0),
    );
  for (const point of [
    [-260, 170],
    [-270, 170],
    [-310, 120],
  ] as const) {
    expect(exposedRockAt(point)).toBe(true);
    const terrainHit = ray(point).intersectObject(
      new THREE.Mesh(terrain, material),
    )[0];
    const rockHit = ray(point).intersectObject(
      new THREE.Mesh(rockSurface, material),
    )[0];
    expect(terrainHit?.point.y).toBeCloseTo(elevation(...point), 1);
    expect(rockHit?.point.y).toBeCloseTo(terrainHit.point.y + 0.04, 1);
    expect(
      ray(point).intersectObject(new THREE.Mesh(grass, material)),
    ).toHaveLength(0);
  }
  const upper = ray([-254, 145]).intersectObject(
    new THREE.Mesh(terrain, material),
  )[0];
  const lower = ray([-258, 145]).intersectObject(
    new THREE.Mesh(terrain, material),
  )[0];
  expect(upper.point.y - lower.point.y).toBeGreaterThan(5);
  const projection = projectRoute([-260, 150], wall.points);
  const p = projection.point,
    n = projection.normal;
  const inward = inside([p[0] + n[0], p[1] + n[1]], wall.points)
    ? n
    : ([-n[0], -n[1]] as const);
  const at = (u: number, v: number): readonly [number, number] => [
    p[0] + inward[0] * u - inward[1] * v,
    p[1] + inward[1] * u + inward[0] * v,
  ];
  const masonry = continuousWall(
    [at(0, -2), at(0, 2)],
    0.65,
    (point, normal) => wallProfile(wall, point, normal),
    true,
    courtBankBoundary,
  );
  const profile = wallProfile(wall, p, inward);
  const exterior = at(-4, 0);
  const hit = new THREE.Raycaster(
    new THREE.Vector3(exterior[0], elevation(...at(-1, 0)) + 1, exterior[1]),
    new THREE.Vector3(inward[0], 0, inward[1]),
  ).intersectObject(new THREE.Mesh(masonry, material))[0];
  expect(hit).toBeDefined();
  if (!hit) throw new Error('Missing battered retaining face.');
  expect(
    (hit.point.x - p[0]) * inward[0] + (hit.point.z - p[1]) * inward[1],
  ).toBeLessThan(-0.2);
  expect(profile.bottom).toBeLessThan(elevation(...at(-1.5, 0)) - 0.5);
  [terrain, rockSurface, grass, masonry].forEach((geometry) =>
    geometry.dispose(),
  );
  material.dispose();
});

it('joins the thick garden exit wall and planar coping to an aligned, unobstructed doorway', () => {
  const wall = walls.find((wall) => wall.id === 8888302);
  const door = posterns.find((postern) => postern.feature.id === 12461779632);
  if (!wall || !door) throw new Error('Missing garden exit.');
  const material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
  const geometries = rampartWallRuns(wall).map((points) =>
    continuousWall(
      points,
      (p) => wallThickness(wall, p),
      (p, n) => wallProfile(wall, p, n),
    ),
  );
  makePassages((_color, geometry) => geometries.push(geometry));
  const meshes = geometries.map(
    (geometry) => new THREE.Mesh(geometry, material),
  );
  for (const point of wall.points.filter((p) => p[1] < 195)) {
    expect(wallProfile(wall, point, door.frame.axis).top).toBeCloseTo(
      gardenWallCrest(point),
      4,
    );
    expect(wallThickness(wall, point)).toBeGreaterThan(1.7);
  }
  const at = (u: number, v: number) =>
    new THREE.Vector3(
      door.frame.center[0] + door.frame.axis[0] * u - door.frame.axis[1] * v,
      posternFloor(door, door.frame.center) + 1.6,
      door.frame.center[1] + door.frame.axis[1] * u + door.frame.axis[0] * v,
    );
  const direction = new THREE.Vector3(
    -door.frame.axis[1],
    0,
    door.frame.axis[0],
  );
  for (const u of [-0.45, 0, 0.45])
    expect(
      new THREE.Raycaster(at(u, -3), direction, 0, 6).intersectObjects(meshes),
    ).toHaveLength(0);
  for (const u of [-1.4, 1.4])
    expect(
      new THREE.Raycaster(at(u, -3), direction, 0, 6).intersectObjects(meshes)
        .length,
    ).toBeGreaterThan(0);
  for (const point of door.feature.points)
    expect(elevation(...point)).toBeCloseTo(posternFloor(door, point), 2);
  const center = at(0, 0);
  center.y = gardenWallCrest(door.frame.center) + 2;
  const header = new THREE.Raycaster(
    center,
    new THREE.Vector3(0, -1, 0),
  ).intersectObjects(meshes)[0];
  expect(header?.point.y).toBeCloseTo(
    gardenWallCrest(door.frame.center) + 0.16,
    2,
  );
  geometries.forEach((geometry) => geometry.dispose());
  material.dispose();
});

it('embeds the rampart footing into the retained hill rather than extending a thin curtain outside the cliff', () => {
  const wall = walls.find((feature) => feature.id === 1532977610);
  if (!wall) throw new Error('Missing rampart.');
  const source = projectRoute([-261.58, -139.28], wall.points);
  const point = source.point;
  const inward = inside(
    [point[0] + source.normal[0], point[1] + source.normal[1]],
    wall.points,
  )
    ? source.normal
    : ([-source.normal[0], -source.normal[1]] as const);
  const at = (u: number, v: number): readonly [number, number] => [
    point[0] + inward[0] * u - inward[1] * v,
    point[1] + inward[1] * u + inward[0] * v,
  ];
  const profile = wallProfile(wall, point, inward);
  const geometry = continuousWall(
    [at(0, -3), at(0, 3)],
    0.65,
    (point, normal) => wallProfile(wall, point, normal),
    false,
    courtBankBoundary,
  );
  const material = new THREE.MeshBasicMaterial();
  const mesh = new THREE.Mesh(geometry, material);
  const hit = (u: number) => {
    const p = at(u, 0);
    return new THREE.Raycaster(
      new THREE.Vector3(p[0], profile.top + 2, p[1]),
      new THREE.Vector3(0, -1, 0),
    ).intersectObject(mesh);
  };
  expect(hit(-0.15)).toHaveLength(0);
  expect(hit(0.65)[0]?.point.y).toBeCloseTo(profile.top, 1);
  const footing = hit(1.7)[0];
  expect(footing).toBeDefined();
  if (!footing) throw new Error('Missing embedded footing.');
  expect(footing.point.y).toBeLessThan(elevation(...at(1.7, 0)) - 2);
  const exterior = at(-2, 0);
  const face = new THREE.Raycaster(
    new THREE.Vector3(exterior[0], profile.top - 3, exterior[1]),
    new THREE.Vector3(inward[0], 0, inward[1]),
  ).intersectObject(mesh)[0];
  expect(face).toBeDefined();
  if (!face) throw new Error('Missing outward-facing masonry.');
  expect(inside([face.point.x, face.point.z], courtBankBoundary)).toBe(true);
  geometry.dispose();
  material.dispose();
});
it('ends upper eastern soil at the mapped rampart instead of stretching grass spikes over its exterior face', () => {
  const geometry = courtBankTerrain();
  const material = new THREE.MeshBasicMaterial();
  const mesh = new THREE.Mesh(geometry, material);
  const height = (x: number, z: number) =>
    new THREE.Raycaster(
      new THREE.Vector3(x, 70, z),
      new THREE.Vector3(0, -1, 0),
    ).intersectObject(mesh)[0]?.point.y;
  for (const point of [
    [82, -20],
    [107, 40],
  ] as const) {
    expect(height(...point)).toBeCloseTo(elevation(...point), 1);
    expect(height(...point)).toBeGreaterThan(48);
  }
  expect(height(104, 20)).toBeLessThan(45);
  const overlay = drapedPolygon(
    [
      [70, -30],
      [140, -30],
      [140, 50],
      [70, 50],
    ],
    0.04,
  );
  const overlayMesh = new THREE.Mesh(overlay, material);
  for (const x of [101.9, 102.2, 103]) {
    const ray = new THREE.Raycaster(
      new THREE.Vector3(x, 70, 20),
      new THREE.Vector3(0, -1, 0),
    );
    const terrainHit = ray.intersectObject(mesh)[0];
    const overlayHit = ray.intersectObject(overlayMesh)[0];
    expect(terrainHit?.point.y).toBeLessThan(38);
    expect(overlayHit?.point.y).toBeCloseTo(terrainHit.point.y + 0.04, 2);
  }
  for (const id of [53573787, 53573790]) {
    const court = features.find((feature) => feature.id === id);
    if (!court) throw new Error('Missing exterior court.');
    const point = court.points[0];
    expect(height(...point)).toBeCloseTo(elevation(...point), 1);
    expect(height(...point)).toBeLessThan(40);
  }
  geometry.dispose();
  overlay.dispose();
  material.dispose();
}, 15000);

it('places mapped street storefront glazing and overhead awnings on their actual facades', () => {
  const material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
  for (const frame of streetFrontages) {
    const geometries: THREE.BufferGeometry[] = [];
    const glass: THREE.Mesh[] = [];
    const canopies: THREE.Mesh[] = [];
    makeStreetFrontage(frame, (_color, geometry, kind) => {
      geometries.push(geometry);
      if (kind === 'glass') glass.push(new THREE.Mesh(geometry, material));
      if (kind === 'plaster') canopies.push(new THREE.Mesh(geometry, material));
    });
    const at = (u: number, y: number, v: number) =>
      new THREE.Vector3(u, y, v)
        .applyAxisAngle(new THREE.Vector3(0, 1, 0), frame.angle)
        .add(new THREE.Vector3(frame.center[0], frame.ground, frame.center[1]));
    expect(
      projectRoute(frame.facade, frame.building.points).distance,
    ).toBeLessThan(0.00001);
    for (const [u, y] of [
      [0, frame.doorGround - frame.ground + 1.45],
      [-Math.min(2.4, frame.width * 0.29), 1.28],
      [Math.min(2.4, frame.width * 0.29), 1.28],
    ]) {
      const ray = new THREE.Raycaster(
        at(u, y, frame.depth / 2 + 1.5),
        new THREE.Vector3(-frame.normal[0], 0, -frame.normal[1]),
        0,
        1.5,
      );
      const pane = ray.intersectObjects(glass)[0];
      expect(pane, `${frame.name} glazing at facade offset ${u}`).toBeDefined();
      if (!pane) throw new Error(`Missing ${frame.name} glazing.`);
      expect(
        projectRoute([pane.point.x, pane.point.z], frame.building.points)
          .distance,
      ).toBeLessThan(0.18);
      expect(pane.point.y).toBeCloseTo(frame.ground + y, 5);
    }
    const down = new THREE.Raycaster(
      at(0, 3.2, frame.depth / 2 + 0.6),
      new THREE.Vector3(0, -1, 0),
      0,
      1,
    );
    const canopy = down.intersectObjects(canopies)[0];
    expect(canopy, frame.name).toBeDefined();
    if (!canopy) throw new Error(`Missing ${frame.name} canopy.`);
    expect(canopy.point.y - frame.ground).toBeGreaterThan(2.4);
    const positions = (canopy.object as THREE.Mesh).geometry.attributes
      .position;
    let rear = Infinity;
    for (let i = 0; i < positions.count; i++)
      rear = Math.min(
        rear,
        (positions.getX(i) - frame.facade[0]) * frame.normal[0] +
          (positions.getZ(i) - frame.facade[1]) * frame.normal[1],
      );
    expect(rear, `${frame.name} canopy attached to wall`).toBeLessThan(0);
    geometries.forEach((geometry) => geometry.dispose());
  }
  material.dispose();
});

it('renders Slavin facing into the cemetery with walkable steps and a raised altar cross', () => {
  const geometries: THREE.BufferGeometry[] = [];
  makeSlavin((_color, geometry) => geometries.push(geometry));
  const material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
  const meshes = geometries.map(
    (geometry) => new THREE.Mesh(geometry, material),
  );
  const at = (u: number, y: number, v: number) =>
    new THREE.Vector3(u, y, v)
      .applyAxisAngle(new THREE.Vector3(0, 1, 0), slavin.angle)
      .add(
        new THREE.Vector3(
          slavin.point[0],
          elevation(...slavin.point),
          slavin.point[1],
        ),
      );
  const down = new THREE.Raycaster(
    at(-3, 3, 4.65),
    new THREE.Vector3(0, -1, 0),
  );
  expect(down.intersectObjects(meshes)[0]?.point.y).toBeCloseTo(
    elevation(...slavin.point) + 0.45,
    3,
  );
  const forward = new THREE.Vector3(-slavin.front[0], 0, -slavin.front[1]);
  const altar = new THREE.Raycaster(at(0, 3.12, 7), forward, 0, 4);
  expect(altar.intersectObjects(meshes).length).toBeGreaterThan(0);
  const memorial = new THREE.Raycaster(at(0, 5, 7), forward);
  expect(memorial.intersectObjects(meshes).length).toBeGreaterThan(0);
  const riser = new THREE.Raycaster(
    at(-9, 0.5, 2.55),
    new THREE.Vector3(Math.cos(slavin.angle), 0, -Math.sin(slavin.angle)),
    0,
    2,
  );
  expect(riser.intersectObjects(meshes).length).toBeGreaterThan(0);
  geometries.forEach((geometry) => geometry.dispose());
  material.dispose();
});

it('gives the rotunda a lower apse roof and a separate lantern above the round nave', () => {
  const feature = features.find((feature) => feature.id === 560209917);
  if (!feature) throw new Error('Missing Saint Martin rotunda.');
  const ground = foundation(feature);
  const geometries: THREE.BufferGeometry[] = [];
  makeRotunda(feature, ground, (_color, geometry) => geometries.push(geometry));
  const material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
  const meshes = geometries.map(
    (geometry) => new THREE.Mesh(geometry, material),
  );
  const height = (x: number, z: number) =>
    new THREE.Raycaster(
      new THREE.Vector3(x, ground + 20, z),
      new THREE.Vector3(0, -1, 0),
    ).intersectObjects(meshes)[0]?.point.y;
  const lantern = height(75.43, 93.77),
    nave = height(73, 93.7),
    apse = height(81.4, 92.8);
  expect(lantern).toBeGreaterThan(ground + 12);
  expect(nave).toBeGreaterThan(ground + 9.5);
  expect(apse).toBeLessThan(ground + 6);
  expect(apse).toBeGreaterThan(ground + 4);
  for (const geometry of geometries)
    expect(
      Array.from(geometry.getAttribute('position').array).every(
        Number.isFinite,
      ),
    ).toBe(true);
  geometries.forEach((geometry) => geometry.dispose());
  material.dispose();
});

it('levels the Tabor-side tunnel earth to the street grade without lowering the vaults', () => {
  const geometries: THREE.BufferGeometry[] = [];
  makePassages((_color, geometry) => geometries.push(geometry));
  const material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
  const meshes = geometries.map(
    (geometry) => new THREE.Mesh(geometry, material),
  );
  for (const postern of posterns.filter((postern) =>
    [8888304, 28811769, 183917808].includes(postern.feature.id),
  )) {
    const cover = upperCovers.find((cover) => cover.id === postern.feature.id);
    if (!cover) throw new Error('Missing Tabor-side tunnel cover.');
    const buriedGrass = drapedPolygon(cover.footprint, 0.025, elevation);
    geometries.push(buriedGrass);
    meshes.push(new THREE.Mesh(buriedGrass, material));
    const positions = buriedGrass.getAttribute('position');
    for (let i = 0; i < positions.count; i++)
      expect(
        positions.getY(i) -
          coverElevation(cover, positions.getX(i), positions.getZ(i)),
        `buried grass ${postern.feature.id}`,
      ).toBeLessThan(-0.04);
    for (const across of [
      -Math.min(5, postern.frame.width / 2 - 0.6),
      0,
      Math.min(5, postern.frame.width / 2 - 0.6),
    ]) {
      const point = [
        postern.frame.center[0] + postern.frame.axis[0] * across,
        postern.frame.center[1] + postern.frame.axis[1] * across,
      ] as const;
      const level = pevnostiGrade(point).level;
      expect(coverElevation(cover, ...point)).toBeCloseTo(level, 4);
      const hit = new THREE.Raycaster(
        new THREE.Vector3(point[0], level + 0.8, point[1]),
        new THREE.Vector3(0, -1, 0),
        0,
        1.5,
      ).intersectObjects(meshes)[0];
      expect(
        hit?.point.y,
        `upper earth ${postern.feature.id}, ${across}`,
      ).toBeCloseTo(level, 2);
      expect(level - posternFloor(postern, point)).toBeGreaterThan(3);
    }
    const midpoint = postern.frame.center;
    expect(
      Math.abs(originalElevation(...midpoint) - pevnostiGrade(midpoint).level),
    ).toBeLessThan(0.35);
  }
  geometries.forEach((geometry) => geometry.dispose());
  material.dispose();
});

it('exposes the full exterior Tabor Gate facade and joins its brick returns outside the forecourt', () => {
  const gate = features.find((feature) => feature.id === 49811189);
  if (!gate) throw new Error('Missing Tabor Gate.');
  const frame = gateFrame(gate),
    level = foundation(gate);
  const at = (u: number, v: number) =>
    new THREE.Vector3(
      frame.center[0] + frame.axis[0] * u - frame.axis[1] * v,
      level,
      frame.center[1] + frame.axis[1] * u + frame.axis[0] * v,
    );
  const forward = new THREE.Vector3(-frame.axis[1], 0, frame.axis[0]);
  const geometries: THREE.BufferGeometry[] = [];
  for (const wall of walls.filter((wall) =>
    [8888302, 33878732].includes(wall.id),
  ))
    for (const points of rampartWallRuns(wall))
      geometries.push(
        continuousWall(
          points,
          (point) => wallThickness(wall, point),
          (point, normal) => wallProfile(wall, point, normal),
          false,
        ),
      );
  makeEnclosureDetails((_color, geometry) => geometries.push(geometry));
  const material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
  const meshes = geometries.map(
    (geometry) => new THREE.Mesh(geometry, material),
  );
  for (const u of [-4.5, -3.2, 3.2, 4.5])
    for (const height of [1.2, 3.8, 5.8]) {
      const eye = at(u, -26);
      eye.y += height;
      expect(
        new THREE.Raycaster(
          eye,
          forward,
          0,
          26 - frame.depth / 2,
        ).intersectObjects(meshes),
        `facade ${u}, ${height}`,
      ).toHaveLength(0);
    }
  for (const side of [-1, 1]) {
    const clear = at(side * 3.5, -14);
    expect(blocked([clear.x, clear.z], level)).toBe(false);
    const join = at(side * (frame.width / 2 + 1.5), -8);
    expect(blocked([join.x, join.z], level)).toBe(true);
    const eye = at(side * (frame.width / 2 + 1.5), -24);
    eye.y += 2;
    expect(
      new THREE.Raycaster(eye, forward, 0, 18).intersectObjects(meshes).length,
    ).toBeGreaterThan(0);
  }
  makeGate(gate, level, (_color, geometry) => {
    geometries.push(geometry);
    meshes.push(new THREE.Mesh(geometry, material));
  });
  for (const u of [-3.2, 3.2]) {
    const eye = at(u, -26);
    eye.y += 3.8;
    const hit = new THREE.Raycaster(eye, forward, 0, 30).intersectObjects(
      meshes,
    )[0];
    expect(hit?.distance).toBeGreaterThan(26 - frame.depth / 2 - 1);
    expect(hit?.distance).toBeLessThan(26 - frame.depth / 2 + 1);
  }
  geometries.forEach((geometry) => geometry.dispose());
  material.dispose();
});

it('renders a solid upper promenade and genuinely open lower galleries, not earth-filled arches', () => {
  const geometries: THREE.BufferGeometry[] = [];
  makePassages((_color, geometry) => geometries.push(geometry));
  for (const id of [370193785, 494921219]) {
    const road = features.find((feature) => feature.id === id);
    if (!road) throw new Error('Missing upper road or sidewalk.');
    geometries.push(
      pathRibbon(
        road.points,
        pathWidth(road),
        0.055,
        (x, z) => featureElevation(road, [x, z]),
        road.id === 494921219 ? [stairwellFootprint] : [],
      ),
    );
  }
  const gate = features.find((feature) => feature.id === 51700613);
  if (!gate) throw new Error('Missing Brick Gate.');
  makeGate(gate, foundation(gate), (_color, geometry) =>
    geometries.push(geometry),
  );
  for (const wall of walls.filter(
    (wall) =>
      wall.tags.barrier !== 'fence' &&
      projectRoute(gateFrame(gate).center, wall.points).distance < 15,
  )) {
    for (const route of rampartWallRuns(wall))
      geometries.push(
        continuousWall(
          route,
          (point) => wallThickness(wall, point),
          (point, normal) => wallProfile(wall, point, normal),
          false,
        ),
      );
  }
  const material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
  const meshes = geometries.map(
    (geometry) => new THREE.Mesh(geometry, material),
  );
  const a = upperPromenade[0],
    b = upperPromenade[1];
  const point = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2] as const;
  const upper = originalElevation(...point);
  const down = new THREE.Raycaster(
    new THREE.Vector3(point[0], upper + 0.6, point[1]),
    new THREE.Vector3(0, -1, 0),
    0,
    0.8,
  );
  expect(down.intersectObjects(meshes)[0]?.point.y).toBeCloseTo(
    upper + 0.06,
    3,
  );
  const frame = gateFrame(gate);
  const forward = new THREE.Vector3(-frame.axis[1], 0, frame.axis[0]);
  const ray = new THREE.Raycaster(
    new THREE.Vector3(frame.center[0], foundation(gate) + 1.6, frame.center[1]),
    forward,
    0,
    frame.depth / 2 + 1,
  );
  expect(ray.intersectObjects(meshes)).toHaveLength(0);
  for (const opening of gateOpenings(gate)) {
    const origin = new THREE.Vector3(
      frame.center[0] + frame.axis[0] * opening.offset,
      foundation(gate) + 1.6,
      frame.center[1] + frame.axis[1] * opening.offset,
    );
    expect(
      new THREE.Raycaster(
        origin,
        forward,
        0,
        frame.depth / 2 + 0.35,
      ).intersectObjects(meshes),
      `Brick Gate opening ${opening.offset}`,
    ).toHaveLength(0);
  }
  const postern = posterns.find((postern) => postern.feature.id === 28811769);
  const road = features.find((feature) => feature.id === 370193785);
  if (!postern || !road) throw new Error('Missing road crossing.');
  const crossing = projectRoute(postern.frame.center, road.points).point;
  const roadLevel = pevnostiGrade(crossing).level;
  const roadHit = new THREE.Raycaster(
    new THREE.Vector3(crossing[0], roadLevel + 2, crossing[1]),
    new THREE.Vector3(0, -1, 0),
  ).intersectObjects(meshes)[0];
  expect(roadHit?.point.y).toBeCloseTo(
    featureElevation(road, crossing) + 0.055,
    3,
  );
  for (const postern of posterns)
    for (let i = 1; i < postern.feature.points.length; i++) {
      const start = postern.feature.points[i - 1],
        end = postern.feature.points[i];
      const from = new THREE.Vector3(
        start[0],
        posternFloor(postern, start) + 1.6,
        start[1],
      );
      const to = new THREE.Vector3(
        end[0],
        posternFloor(postern, end) + 1.6,
        end[1],
      );
      const direction = to.clone().sub(from).normalize();
      const ray = new THREE.Raycaster(
        from.clone().addScaledVector(direction, 0.1),
        direction,
        0,
        from.distanceTo(to) - 0.2,
      );
      expect(
        ray.intersectObjects(meshes),
        `postern ${postern.feature.id}`,
      ).toHaveLength(0);
    }
  material.dispose();
  geometries.forEach((geometry) => geometry.dispose());
});

it('matches rendered stair treads to their discrete walking surfaces', () => {
  const geometries: THREE.BufferGeometry[] = [];
  makeApproach((_color, geometry) => geometries.push(geometry));
  makePassages((_color, geometry) => geometries.push(geometry));
  for (const id of [370193785, 494921219]) {
    const feature = features.find((feature) => feature.id === id);
    if (!feature) throw new Error('Missing upper road or sidewalk.');
    geometries.push(
      pathRibbon(
        feature.points,
        pathWidth(feature),
        0.055,
        (x, z) => featureElevation(feature, [x, z]),
        feature.id === 494921219 ? [stairwellFootprint] : [],
      ),
    );
  }
  const material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
  const meshes = geometries.map(
    (geometry) => new THREE.Mesh(geometry, material),
  );
  for (const flight of stairFlights) {
    for (let i = 1; i < flight.feature.points.length; i++) {
      const start = flight.feature.points[i - 1],
        end = flight.feature.points[i];
      for (let j = 1; j < 10; j++) {
        const point = [
          start[0] + ((end[0] - start[0]) * j) / 10,
          start[1] + ((end[1] - start[1]) * j) / 10,
        ] as const;
        const ray = new THREE.Raycaster(
          new THREE.Vector3(
            point[0],
            stairElevation(flight, point) + 0.25,
            point[1],
          ),
          new THREE.Vector3(0, 1, 0),
          0,
          1.8,
        );
        expect(
          ray.intersectObjects(meshes),
          `covered stairwell ${point}`,
        ).toHaveLength(0);
      }
    }
    const a = flight.feature.points[0],
      b = flight.feature.points[1];
    const point = [
      a[0] + (b[0] - a[0]) * 0.47,
      a[1] + (b[1] - a[1]) * 0.47,
    ] as const;
    const hit = new THREE.Raycaster(
      new THREE.Vector3(point[0], 80, point[1]),
      new THREE.Vector3(0, -1, 0),
    ).intersectObjects(meshes)[0];
    expect(hit?.point.y).toBeCloseTo(stairElevation(flight, point) + 0.05, 3);
  }
  material.dispose();
  geometries.forEach((geometry) => geometry.dispose());
});

it('renders two sculpted figures above the Libuse and Premysl pedestal', () => {
  const sculpture = sculptures.find((monument) => monument.id === 1200812873);
  if (!sculpture) throw new Error('Missing Libuse and Premysl.');
  const geometries: THREE.BufferGeometry[] = [];
  makeMonuments((_color, geometry) => geometries.push(geometry));
  const material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
  const meshes = geometries.map(
    (geometry) => new THREE.Mesh(geometry, material),
  );
  for (const x of [-0.78, 0.7]) {
    const origin = new THREE.Vector3(
      x * sculpture.scale,
      3.8 * sculpture.scale,
      8 * sculpture.scale,
    )
      .applyAxisAngle(new THREE.Vector3(0, 1, 0), sculpture.angle)
      .add(
        new THREE.Vector3(
          sculpture.point[0],
          elevation(...sculpture.point),
          sculpture.point[1],
        ),
      );
    const direction = new THREE.Vector3(0, 0, -1).applyAxisAngle(
      new THREE.Vector3(0, 1, 0),
      sculpture.angle,
    );
    expect(
      new THREE.Raycaster(origin, direction).intersectObjects(meshes).length,
    ).toBeGreaterThan(0);
  }
  material.dispose();
  geometries.forEach((geometry) => geometry.dispose());
});

it('opens all three Brick Gate passages and the separate garden arch in the actual mesh', () => {
  const brickGate = features.find((feature) => feature.id === 51700613);
  if (!brickGate) throw new Error('Missing Brick Gate.');
  const material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
  for (const gate of [brickGate, gardenPortal]) {
    const geometries: THREE.BufferGeometry[] = [];
    makeGate(gate, 0, (_color, geometry) => geometries.push(geometry));
    const frame = gateFrame(gate);
    const meshes = geometries.map((geometry) => {
      const body = geometry.clone();
      body.translate(-frame.center[0], 0, -frame.center[1]);
      body.rotateY(-frame.angle);
      return new THREE.Mesh(body, material);
    });
    const hit = (x: number, y: number) =>
      new THREE.Raycaster(
        new THREE.Vector3(x, y, 20),
        new THREE.Vector3(0, 0, -1),
      ).intersectObjects(meshes);
    for (const opening of gateOpenings(gate))
      expect(hit(opening.offset, 2)).toHaveLength(0);
    expect(hit(frame.width / 2 - 0.5, 2).length).toBeGreaterThan(0);
    expect(hit(0, gate === brickGate ? 10 : 5).length).toBeGreaterThan(0);
    meshes.forEach((mesh) => mesh.geometry.dispose());
    geometries.forEach((geometry) => geometry.dispose());
  }
  material.dispose();
});

it('renders see-through cemetery railings with solid posts and pickets, not an opaque wall', () => {
  const geometries: THREE.BufferGeometry[] = [];
  makeFence(
    [
      [-260, -120],
      [-256.4, -120],
    ],
    1.8,
    (_color, geometry) => geometries.push(geometry),
  );
  const material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
  const meshes = geometries.map(
    (geometry) => new THREE.Mesh(geometry, material),
  );
  const hit = (x: number) =>
    new THREE.Raycaster(
      new THREE.Vector3(x, elevation(x, -120) + 0.8, -122),
      new THREE.Vector3(0, 0, 1),
    ).intersectObjects(meshes);
  expect(hit(-260).length).toBeGreaterThan(0);
  expect(hit(-259.8).length).toBeGreaterThan(0);
  expect(hit(-259.9)).toHaveLength(0);
  material.dispose();
  geometries.forEach((geometry) => geometry.dispose());
});

it('joins the rampart beside Leopold without drawing brick masonry over its facade or side arches', () => {
  const gate = features.find((feature) => feature.id === 51718887);
  const wall = walls.find((wall) => wall.id === 1532977610);
  if (!gate || !wall) throw new Error('Missing Leopold gatehouse or rampart.');
  const frame = gateFrame(gate);
  const material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
  const geometries = rampartWallRuns(wall).map((points) =>
    continuousWall(
      points,
      (point) => wallThickness(wall, point),
      (point, normal) => wallProfile(wall, point, normal),
      true,
      courtBankBoundary,
    ),
  );
  const meshes = geometries.map(
    (geometry) => new THREE.Mesh(geometry, material),
  );
  const point = (u: number, y: number, v: number) =>
    new THREE.Vector3(u, y, v)
      .applyAxisAngle(new THREE.Vector3(0, 1, 0), frame.angle)
      .add(
        new THREE.Vector3(frame.center[0], foundation(gate), frame.center[1]),
      );
  const direction = new THREE.Vector3(-frame.axis[1], 0, frame.axis[0]);
  for (const u of [-7, -5, -3, 0, 3, 5, 7]) {
    const ray = new THREE.Raycaster(point(u, 4, -5), direction, 0, 10);
    expect(
      ray.intersectObjects(meshes),
      `Brick over facade at ${u}`,
    ).toHaveLength(0);
  }
  for (const u of [-10, 10])
    expect(
      new THREE.Raycaster(point(u, 4, -6), direction, 0, 12).intersectObjects(
        meshes,
      ).length,
    ).toBeGreaterThan(0);
  makeGate(gate, foundation(gate), (_color, geometry) => {
    geometries.push(geometry);
    meshes.push(new THREE.Mesh(geometry, material));
  });
  for (const opening of gateOpenings(gate))
    for (const offset of [-0.65, 0, 0.65])
      expect(
        new THREE.Raycaster(
          point(opening.offset + offset, 1.5, -5),
          direction,
          0,
          10,
        ).intersectObjects(meshes),
        `Opening ${opening.offset}, sample ${offset}`,
      ).toHaveLength(0);
  expect(
    new THREE.Raycaster(point(7, 4, -5), direction, 0, 10).intersectObjects(
      meshes,
    ).length,
  ).toBeGreaterThan(0);
  geometries.forEach((geometry) => geometry.dispose());
  material.dispose();
});

it('keeps the lower Brick Gate retaining wall below the facade instead of raising it to the promenade', () => {
  const gate = features.find((feature) => feature.id === 51700613);
  const wall = walls.find((feature) => feature.id === 51700612);
  if (!gate || !wall) throw new Error('Missing Brick Gate retaining wall.');
  const frame = gateFrame(gate);
  const corner = wall.points[1];
  expect(
    wallProfile(wall, corner, frame.axis).top - elevation(...corner),
  ).toBeCloseTo(1.05, 3);
  const geometries = rampartWallRuns(wall).map((route) =>
    continuousWall(
      route,
      (point) => wallThickness(wall, point),
      (point, normal) => wallProfile(wall, point, normal),
      false,
    ),
  );
  const material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
  const meshes = geometries.map(
    (geometry) => new THREE.Mesh(geometry, material),
  );
  const origin = new THREE.Vector3(-4.925, 5, 16)
    .applyAxisAngle(new THREE.Vector3(0, 1, 0), frame.angle)
    .add(new THREE.Vector3(frame.center[0], foundation(gate), frame.center[1]));
  const toward = new THREE.Vector3(frame.axis[1], 0, -frame.axis[0]);
  expect(
    new THREE.Raycaster(origin, toward, 0, 12).intersectObjects(meshes),
  ).toHaveLength(0);
  const end = wall.points[wall.points.length - 1];
  expect(
    wallProfile(wall, end, frame.axis).top - elevation(...end),
  ).toBeLessThan(2);
  geometries.forEach((geometry) => geometry.dispose());
  material.dispose();
});

it('leaves the ground-level gate arch genuinely open through both facade caps', () => {
  for (const id of [51718887, 49811189]) {
    const gate = features.find((feature) => feature.id === id);
    if (!gate) throw new Error('Missing test gate.');
    const geometries: THREE.BufferGeometry[] = [];
    makeGate(gate, 0, (_color, geometry) => geometries.push(geometry));
    const frame = gateFrame(gate);
    const material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
    const meshes = geometries.map((geometry) => {
      geometry.translate(-frame.center[0], 0, -frame.center[1]);
      geometry.rotateY(-frame.angle);
      return new THREE.Mesh(geometry, material);
    });
    const hit = (x: number, y: number) =>
      new THREE.Raycaster(
        new THREE.Vector3(x, y, frame.depth / 2 + 5),
        new THREE.Vector3(0, 0, -1),
      ).intersectObjects(meshes);
    expect(hit(0, 2)).toHaveLength(0);
    expect(hit(0, 4.5)).toHaveLength(0);
    expect(hit(3.5, 2).length).toBeGreaterThan(0);
    expect(hit(0, 7).length).toBeGreaterThan(0);
    material.dispose();
    geometries.forEach((geometry) => geometry.dispose());
  }
});

it('closes gable ends and the raised edge of a skillion roof down to their walls', () => {
  const footprint = [
    [0, 0],
    [20, 0],
    [20, 10],
    [0, 10],
    [0, 0],
  ] as const;
  const material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
  for (const kind of ['gabled', 'skillion']) {
    const covering = roof([...footprint], 10, 4, kind);
    const wall = new THREE.Mesh(covering.fascia, material);
    const origin =
      kind === 'gabled'
        ? new THREE.Vector3(-2, 12, 5)
        : new THREE.Vector3(10, 12, 12);
    const direction =
      kind === 'gabled'
        ? new THREE.Vector3(1, 0, 0)
        : new THREE.Vector3(0, 0, -1);
    expect(
      new THREE.Raycaster(origin, direction).intersectObject(wall).length,
    ).toBeGreaterThan(0);
    covering.surface.dispose();
    covering.fascia.dispose();
  }
  material.dispose();
});
