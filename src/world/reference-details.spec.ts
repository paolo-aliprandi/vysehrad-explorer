import * as THREE from 'three';
import {
  arcadeInterior,
  makeArcadeCeiling,
  makeGardenReferences,
  makeHiddenChurch,
  makeGardenKiosk,
  makeReferenceBankIvy,
} from './reference-details';
import {
  brickGateStairs,
  brickGateFenceLevel,
  upperElevation,
  upperCovers,
  coverElevation,
  originalElevation,
  cemeteryArcadeBays,
  elevation,
  referenceSites,
  sitePropBlocked,
  sculptures,
  stairElevation,
  panoramaDecks,
  aveMariaFrontage,
  aveMariaCourtCuts,
  aveMariaCourtElevation,
  aveMariaPoint,
  aveMariaFloor,
  foundation,
  unretainedElevation,
  karlachBorderBushes,
  retainedGardenGuards,
  paths,
  pathWidth,
  projectRoute,
  walls,
  wallProfile,
  wallThickness,
  riversideDoorways,
  blocked,
  slavin,
  aveMariaStairs,
  aveMariaStairCut,
  referenceBorderBushes,
  retainedStreetWalls,
  type Point,
} from './geo';
import { makeApproach, makePassages } from './passages';
import { makeMonuments } from './monuments';
import { clipTerrainAtArcades, drapedPolygon } from './surfaces';
import {
  makePanoramaLookouts,
  makeAveMariaWall,
  makeAveMaria,
  makeFence,
  makeSlavin,
  type AddGeometry,
} from './architecture';
import { pavingGeometry, pavingSurfaces } from './paving';

function geometryScene(
  make: (add: AddGeometry) => void,
  side: THREE.Side = THREE.FrontSide,
) {
  const material = new THREE.MeshBasicMaterial({ side });
  const meshes: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>[] =
    [];
  make((color, geometry, kind) => {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = `${kind}:${color}`;
    meshes.push(mesh);
  });
  return {
    meshes,
    dispose: () => {
      meshes.forEach((mesh) => mesh.geometry.dispose());
      material.dispose();
    },
  };
}

it('grades the lawn above Brick Gate into a straight crest while preserving its perimeter and the road beneath', () => {
  const cover = upperCovers.find((cover) => cover.id === 51700613);
  const fence = walls.find((wall) => wall.id === 1303806149);
  if (!cover || !fence) throw new Error('Missing Brick Gate crest.');
  const [a, b] = fence.points;
  const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const normal: Point = [-(b[1] - a[1]) / length, (b[0] - a[0]) / length];
  const scene = geometryScene(makePassages, THREE.DoubleSide);
  try {
    for (const t of [0.1, 0.3, 0.5, 0.7, 0.9]) {
      const axis: Point = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
      const level = brickGateFenceLevel(...axis) - 0.03;
      for (const side of [-2, 0, 2]) {
        const point: Point = [
          axis[0] + normal[0] * side,
          axis[1] + normal[1] * side,
        ];
        expect(upperElevation(...point)).toBeCloseTo(level, 6);
        const floor = new THREE.Raycaster(
          new THREE.Vector3(point[0], level + 0.5, point[1]),
          new THREE.Vector3(0, -1, 0),
          0,
          1,
        ).intersectObjects(scene.meshes)[0];
        expect(floor).toBeDefined();
        expect(Math.abs(floor.point.y - level)).toBeLessThan(0.003);
        expect(elevation(...point)).toBeLessThan(level - 5);
      }
    }
    for (const point of cover.footprint)
      expect(coverElevation(cover, ...point)).toBeCloseTo(
        originalElevation(...point),
        6,
      );
  } finally {
    scene.dispose();
  }
});

it('clears walkable side and rear gaps around the restored Ave Maria chapel to reach the hidden church doorway', () => {
  const scene = geometryScene((add) => {
    makeAveMariaWall(add);
    makeAveMaria(aveMariaFloor(), 4, add);
  }, THREE.DoubleSide);
  try {
    expect(foundation(aveMariaFrontage.feature)).toBeCloseTo(
      aveMariaFloor(),
      6,
    );
    expect(unretainedElevation(89.32, 34.71)).toBeGreaterThan(
      aveMariaFloor() + 0.6,
    );
    for (const [u, v] of [
      [0, 0.8],
      [0, 5],
      [0, 9.5],
      [3.55, -0.5],
      [3.55, -7],
      [-5.2, -4],
      [-5.2, -9.5],
      [0, -9.8],
      [-3.2, -10.2],
    ]) {
      const point = aveMariaPoint(u, v);
      const level = aveMariaCourtElevation(...point);
      expect(elevation(...point)).toBeCloseTo(level, 6);
      const floor = new THREE.Raycaster(
        new THREE.Vector3(point[0], level + 0.3, point[1]),
        new THREE.Vector3(0, -1, 0),
        0,
        0.5,
      ).intersectObjects(scene.meshes)[0];
      expect(floor).toBeDefined();
      expect(
        Math.abs(floor.point.y - level - 0.055),
        JSON.stringify({
          u,
          v,
          level,
          hit: floor.point.y,
          kind: floor.object.name,
        }),
      ).toBeLessThan(0.035);
      expect(blocked(point, level)).toBe(false);
    }
    for (let v = 0; v >= -10; v -= 0.15) {
      const point = aveMariaPoint(-5, v);
      expect(blocked(point, elevation(...point)), JSON.stringify(point)).toBe(
        false,
      );
    }
    const level = aveMariaFloor();
    const cast = (u: number) => {
      const start = aveMariaPoint(u, 1);
      return new THREE.Raycaster(
        new THREE.Vector3(start[0], level + 1.65, start[1]),
        new THREE.Vector3(
          -aveMariaFrontage.normal[0],
          0,
          -aveMariaFrontage.normal[1],
        ),
        0,
        2,
      ).intersectObjects(scene.meshes);
    };
    expect(cast(0)[0]?.object.name).toMatch(/^wood:/);
    expect(cast(3.55)).toHaveLength(0);
    for (const cut of aveMariaCourtCuts) {
      const soil = drapedPolygon(cut, 0, unretainedElevation);
      clipTerrainAtArcades(soil, false, false);
      const point: Point = [
        (cut[0][0] + cut[2][0]) / 2,
        (cut[0][1] + cut[2][1]) / 2,
      ];
      const material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
      expect(
        new THREE.Raycaster(
          new THREE.Vector3(point[0], 80, point[1]),
          new THREE.Vector3(0, -1, 0),
        ).intersectObject(new THREE.Mesh(soil, material)),
      ).toHaveLength(0);
      soil.dispose();
      material.dispose();
    }
    const legacy = geometryScene((add) => {
      for (const surface of pavingSurfaces(
        paths.filter((path) =>
          [255297766, 255297792, 515345427].includes(path.id),
        ),
      ))
        add('#ffffff', pavingGeometry(surface), 'cobble');
    }, THREE.DoubleSide);
    try {
      const point = aveMariaPoint(0, 4);
      expect(
        new THREE.Raycaster(
          new THREE.Vector3(point[0], 80, point[1]),
          new THREE.Vector3(0, -1, 0),
        ).intersectObjects(legacy.meshes),
      ).toHaveLength(0);
    } finally {
      legacy.dispose();
    }
  } finally {
    scene.dispose();
  }
});

it('joins the kiosk corner masonry, plants both marked frontages and renders the short Ave Maria approach as grounded steps', () => {
  const ends = [-9000103, -9001000].map((id) =>
    retainedStreetWalls.find((wall) => wall.id === id)?.points.at(-1),
  );
  expect(ends[0]).toEqual(ends[1]);
  expect(
    referenceBorderBushes.filter((bush) => bush.point[0] > 120).length,
  ).toBeGreaterThan(3);
  expect(
    referenceBorderBushes.filter((bush) => bush.point[0] < 70).length,
  ).toBeGreaterThan(1);
  const kioskBushes = referenceBorderBushes.filter(
    (bush) => bush.point[0] < 70,
  );
  expect(kioskBushes.some((bush) => bush.point[1] > 59)).toBe(true);
  expect(kioskBushes.some((bush) => bush.point[1] < 40)).toBe(true);
  for (const bush of kioskBushes) {
    const distance = Math.min(
      ...retainedStreetWalls
        .filter((wall) => [-9000103, -9001000].includes(wall.id))
        .map((wall) => projectRoute(bush.point, wall.points).distance),
    );
    expect(distance).toBeGreaterThan(0.7);
    expect(distance).toBeLessThan(1.2);
  }
  const scene = geometryScene(makeApproach, THREE.DoubleSide);
  try {
    if (!aveMariaStairs) throw new Error('Missing approach stairs.');
    const [a, b] = aveMariaStairs.feature.points;
    for (let i = 1; i < aveMariaStairs.count; i++) {
      const t = (i + 0.4) / aveMariaStairs.count;
      const point: Point = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
      const floor = stairElevation(aveMariaStairs, point);
      const hit = new THREE.Raycaster(
        new THREE.Vector3(point[0], floor + 0.2, point[1]),
        new THREE.Vector3(0, -1, 0),
        0,
        0.4,
      ).intersectObjects(scene.meshes)[0];
      expect(hit?.point.y).toBeCloseTo(floor + 0.05, 4);
    }
    const soil = drapedPolygon(aveMariaStairCut);
    clipTerrainAtArcades(soil);
    const midpoint: Point = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    expect(
      new THREE.Raycaster(
        new THREE.Vector3(midpoint[0], 80, midpoint[1]),
        new THREE.Vector3(0, -1, 0),
      ).intersectObject(new THREE.Mesh(soil, scene.meshes[0].material)),
    ).toHaveLength(0);
    soil.dispose();
  } finally {
    scene.dispose();
  }
});

it('plants the Karlach roadside border without closing garden paths or spreading onto the cobbled street', () => {
  expect(karlachBorderBushes.length).toBeGreaterThan(30);
  for (const bush of karlachBorderBushes) {
    expect(sitePropBlocked(bush.point, elevation(...bush.point))).toBe(true);
    for (const path of paths)
      expect(
        projectRoute(bush.point, path.points).distance,
      ).toBeGreaterThanOrEqual(pathWidth(path) / 2 + 0.89);
  }
  const street = paths.find((path) => path.id === 587280816);
  if (!street) throw new Error('Missing K Rotunde street.');
  for (const point of street.points.slice(1, -1))
    expect(blocked(point, elevation(...point))).toBe(false);
  const scene = geometryScene((add) => {
    for (const surface of pavingSurfaces([street]))
      add('#ffffff', pavingGeometry(surface), 'cobble');
  }, THREE.DoubleSide);
  try {
    for (const bush of karlachBorderBushes)
      expect(
        new THREE.Raycaster(
          new THREE.Vector3(bush.point[0], 80, bush.point[1]),
          new THREE.Vector3(0, -1, 0),
        ).intersectObjects(scene.meshes),
      ).toHaveLength(0);
  } finally {
    scene.dispose();
  }
});

it('puts a supported kiosk and its counter in the marked lawn without blocking the road or the Procopius niche', () => {
  const scene = geometryScene(makeGardenKiosk, THREE.DoubleSide);
  try {
    const kiosk = referenceSites.gardenKiosk;
    const ground = elevation(...kiosk.point);
    expect(sitePropBlocked(kiosk.point, ground)).toBe(true);
    const roof = new THREE.Raycaster(
      new THREE.Vector3(kiosk.point[0], ground + 8, kiosk.point[1]),
      new THREE.Vector3(0, -1, 0),
    ).intersectObjects(scene.meshes)[0];
    expect(roof?.object.name).toMatch(/^metal:/);
    expect(roof.point.y - ground).toBeGreaterThan(2.8);
    const front: Point = [
      kiosk.point[0] + Math.sin(kiosk.angle) * 3,
      kiosk.point[1] + Math.cos(kiosk.angle) * 3,
    ];
    const counter = new THREE.Raycaster(
      new THREE.Vector3(front[0], ground + 1.7, front[1]),
      new THREE.Vector3(-Math.sin(kiosk.angle), 0, -Math.cos(kiosk.angle)),
    ).intersectObjects(scene.meshes)[0];
    expect(counter?.object.name).toMatch(/^glass:/);
    expect(sitePropBlocked(front, elevation(...front))).toBe(false);
    const procopius = sculptures.find(
      (sculpture) => sculpture.id === 4294837398,
    );
    if (!procopius) throw new Error('Missing Procopius niche.');
    expect(
      Math.hypot(
        kiosk.point[0] - procopius.point[0],
        kiosk.point[1] - procopius.point[1],
      ),
    ).toBeGreaterThan(10);
  } finally {
    scene.dispose();
  }
});

it('hangs ivy down the marked bank and grounds its iron fence on the crest, while leaving riverside arches clear', () => {
  const scene = geometryScene((add) => {
    makeReferenceBankIvy(add);
    for (const guard of retainedGardenGuards)
      makeFence(guard.points, 1.05, add, (x, z) => {
        const projection = projectRoute([x, z], guard.wall.points);
        return (
          wallProfile(guard.wall, projection.point, projection.normal).top +
          0.05
        );
      });
  }, THREE.DoubleSide);
  try {
    const wall = walls.find((wall) => wall.id === -9000103);
    if (!wall) throw new Error('Missing marked garden retaining wall.');
    const projection = projectRoute([-48, -34], wall.points);
    const profile = wallProfile(wall, projection.point, projection.normal);
    const start = new THREE.Vector3(
      projection.point[0] + projection.normal[0] * 2,
      profile.top - 0.6,
      projection.point[1] + projection.normal[1] * 2,
    );
    const leaf = new THREE.Raycaster(
      start,
      new THREE.Vector3(-projection.normal[0], 0, -projection.normal[1]),
      0,
      3,
    ).intersectObjects(scene.meshes)[0];
    expect(leaf?.object.name).toMatch(/^foliage:/);
    expect(leaf.distance).toBeCloseTo(
      2 - wallThickness(wall, projection.point) / 2 - 0.1,
      0,
    );
    start.y = profile.top + 0.05 + 0.28;
    expect(
      new THREE.Raycaster(
        start,
        new THREE.Vector3(-projection.normal[0], 0, -projection.normal[1]),
        0,
        3,
      ).intersectObjects(scene.meshes)[0]?.object.name,
    ).toMatch(/^metal:/);
    for (const door of riversideDoorways) {
      const point = door.point;
      const ivy = new THREE.Raycaster(
        new THREE.Vector3(point[0], door.floor + 1.7, point[1]),
        new THREE.Vector3(door.frame.axis[1], 0, -door.frame.axis[0]),
        0,
        0.8,
      ).intersectObjects(scene.meshes);
      expect(ivy).toHaveLength(0);
    }
  } finally {
    scene.dispose();
  }
});

it('paints the photographed ceiling details flush beneath the porch slab without closing its walk-through bay', () => {
  for (const bay of [cemeteryArcadeBays[0], cemeteryArcadeBays.at(-1)]) {
    if (!bay) throw new Error('Missing cemetery bay fixture.');
    const { at, depth, normal } = arcadeInterior(bay);
    const floor = foundation(bay.feature);
    const scene = geometryScene((add) => makeArcadeCeiling(bay, floor, add));
    try {
      const point = at(0, depth / 2);
      const ceiling = new THREE.Raycaster(
        new THREE.Vector3(point[0], floor + 1.7, point[1]),
        new THREE.Vector3(0, 1, 0),
        0,
        3,
      ).intersectObjects(
        scene.meshes.filter((mesh) => mesh.name.startsWith('fresco:')),
      )[0];
      expect(ceiling?.object.name).toMatch(/^fresco:/);
      expect(ceiling.point.y - floor).toBeGreaterThan(2.7);
      expect(ceiling.face?.normal.y).toBeLessThan(0);
      expect(ceiling.point.y - floor).toBeGreaterThan(4.04);
      expect(ceiling.point.y - floor).toBeLessThan(4.05);
      for (const mesh of scene.meshes.filter((mesh) =>
        mesh.name.startsWith('fresco:'),
      )) {
        mesh.geometry.computeBoundingBox();
        const bounds = mesh.geometry.boundingBox;
        if (!bounds) throw new Error('Missing ceiling bounds.');
        expect(bounds.max.y - bounds.min.y).toBeLessThan(0.001);
      }
      const passage = new THREE.Raycaster(
        new THREE.Vector3(
          bay.center[0] - normal[0] * 0.1,
          floor + 1.7,
          bay.center[1] - normal[1] * 0.1,
        ),
        new THREE.Vector3(normal[0], 0, normal[1]),
        0,
        depth - 0.7,
      ).intersectObjects(scene.meshes);
      expect(passage).toHaveLength(0);
    } finally {
      scene.dispose();
    }
  }
});

it('supports the cemetery altar and each stair flight on masonry reaching the underlying ground', () => {
  const scene = geometryScene(makeSlavin, THREE.DoubleSide);
  const ground = elevation(...slavin.point);
  const at = (u: number, v: number): Point => [
    slavin.point[0] + Math.cos(slavin.angle) * u + Math.sin(slavin.angle) * v,
    slavin.point[1] - Math.sin(slavin.angle) * u + Math.cos(slavin.angle) * v,
  ];
  try {
    const altar = scene.meshes.find((mesh) => mesh.name === 'stone:#a79c83');
    if (!altar) throw new Error('Missing cemetery altar footing.');
    altar.geometry.computeBoundingBox();
    const bottom = altar.geometry.boundingBox?.min.y;
    for (const u of [-1.25, 0, 1.25])
      for (const v of [2.775, 3.6, 4.425]) {
        const point = at(u, v);
        expect(bottom).toBeLessThan(elevation(...point));
      }
    for (let i = 0; i < 7; i++) {
      const point = at(-6, 6.05 - i * 0.7);
      const hit = new THREE.Raycaster(
        new THREE.Vector3(point[0], elevation(...point) + 0.01, point[1]),
        new THREE.Vector3(0, 1, 0),
        0,
        5,
      ).intersectObjects(scene.meshes)[0];
      expect(hit?.face?.normal.y).toBeGreaterThan(0.9);
      expect(hit.point.y).toBeCloseTo(ground + (i + 1) * 0.15, 4);
    }
  } finally {
    scene.dispose();
  }
});

it('models a real fountain bowl and a pierced Gothic well cover at the garden references', () => {
  const scene = geometryScene(makeGardenReferences);
  try {
    const fountain = referenceSites.gardenFountain;
    const hit = new THREE.Raycaster(
      new THREE.Vector3(
        fountain.point[0] + 1.15,
        elevation(...fountain.point) + 3,
        fountain.point[1],
      ),
      new THREE.Vector3(0, -1, 0),
    ).intersectObjects(scene.meshes)[0];
    expect(hit?.point.y - elevation(...fountain.point)).toBeCloseTo(1.24, 1);
    const well = referenceSites.gardenWell;
    const window = new THREE.Raycaster(
      new THREE.Vector3(
        well.point[0],
        elevation(...well.point) + 1.65,
        well.point[1] + 4,
      ),
      new THREE.Vector3(0, 0, -1),
    ).intersectObjects(scene.meshes)[0];
    expect(window?.object.name).toBe('stone:#333a35');
    expect(sitePropBlocked(fountain.point, elevation(...fountain.point))).toBe(
      true,
    );
    expect(sitePropBlocked(well.point, elevation(...well.point))).toBe(true);
  } finally {
    scene.dispose();
  }
});

it('recesses the surviving hidden church windows behind actual openings, rather than painting panes on masonry', () => {
  const scene = geometryScene(makeHiddenChurch);
  try {
    const church = referenceSites.hiddenChurch;
    const floor = elevation(...church.point);
    const at = (x: number, y: number, z: number) =>
      new THREE.Vector3(x, y, z)
        .applyAxisAngle(new THREE.Vector3(0, 1, 0), church.angle)
        .add(new THREE.Vector3(church.point[0], floor, church.point[1]));
    const direction = new THREE.Vector3(0, 0, -1).applyAxisAngle(
      new THREE.Vector3(0, 1, 0),
      church.angle,
    );
    const window = new THREE.Raycaster(
      at(1.45, 3.6, 4),
      direction,
    ).intersectObjects(scene.meshes)[0];
    const wall = new THREE.Raycaster(at(0, 3.6, 4), direction).intersectObjects(
      scene.meshes,
    )[0];
    expect(window?.object.name).not.toMatch(/^brick:/);
    expect(window?.distance).toBeGreaterThan(2);
    expect(wall?.object.name).toMatch(/^brick:/);
    expect(wall?.distance).toBeCloseTo(4 - church.depth / 2, 4);
    const door = new THREE.Raycaster(
      at(-3.4, 1.2, 2),
      direction,
    ).intersectObjects(scene.meshes)[0];
    expect(door?.object.name).toMatch(/^wood:/);
    expect(door?.distance).toBeGreaterThan(2 - church.depth / 2);
  } finally {
    scene.dispose();
  }
});

it('excavates both northern stair channels even in grass overlays and renders all 56 separate treads', () => {
  const scene = geometryScene((add) => {
    makeApproach(add);
    makePassages(add);
  }, THREE.DoubleSide);
  try {
    for (const flight of brickGateStairs) {
      const a = flight.feature.points[0],
        b = flight.feature.points.at(-1);
      if (!b) throw new Error('Missing northern stair end.');
      const axis: Point = [
        (b[0] - a[0]) / flight.length,
        (b[1] - a[1]) / flight.length,
      ];
      const normal: Point = [-axis[1], axis[0]];
      expect(elevation(...a)).toBeCloseTo(flight.levels[0], 1);
      expect(elevation(...b)).toBeCloseTo(flight.levels[1], 1);
      const entry: Point = [
        a[0] + (b[0] - a[0]) * 0.1,
        a[1] + (b[1] - a[1]) * 0.1,
      ];
      expect(
        new THREE.Raycaster(
          new THREE.Vector3(
            entry[0],
            stairElevation(flight, entry) + 0.25,
            entry[1],
          ),
          new THREE.Vector3(0, 1, 0),
          0,
          1.8,
        )
          .intersectObjects(scene.meshes)
          .map((hit) => ({ name: hit.object.name, y: hit.point.y })),
      ).toEqual([]);
      const strip = [-1, 1].flatMap((side) =>
        (side < 0 ? [a, b] : [b, a]).map(
          (p) =>
            [
              p[0] + normal[0] * side * 0.8,
              p[1] + normal[1] * side * 0.8,
            ] as Point,
        ),
      );
      for (const streetCuts of [false, true]) {
        const terrain = drapedPolygon([...strip, strip[0]], 0);
        clipTerrainAtArcades(terrain, false, streetCuts);
        expect(terrain.attributes.position.count).toBe(0);
        terrain.dispose();
      }
      for (let i = 0; i < flight.count; i++) {
        const t = (i + 0.5) / flight.count;
        const point: Point = [
          a[0] + (b[0] - a[0]) * t,
          a[1] + (b[1] - a[1]) * t,
        ];
        const tread = new THREE.Raycaster(
          new THREE.Vector3(point[0], 100, point[1]),
          new THREE.Vector3(0, -1, 0),
        ).intersectObjects(
          scene.meshes.filter((mesh) => mesh.name.endsWith(':#c1b59e')),
        )[0];
        expect(tread?.point.y).toBeCloseTo(
          flight.levels[0] +
            ((flight.levels[1] - flight.levels[0]) * i) / flight.count +
            0.05,
          3,
        );
      }
    }
    expect(brickGateStairs[0].levels[1]).toBeCloseTo(
      brickGateStairs[1].levels[0],
      2,
    );
  } finally {
    scene.dispose();
  }
});

it('clears the old grass and soil from the timber lookout deck without removing its supporting platform', () => {
  const scene = geometryScene(makePanoramaLookouts);
  try {
    for (const deck of panoramaDecks) {
      const soil = drapedPolygon(deck.points, 0);
      clipTerrainAtArcades(soil, false, false);
      const point = [
        (deck.points[0][0] + deck.points[2][0]) / 2,
        (deck.points[0][1] + deck.points[2][1]) / 2,
      ];
      const terrain = new THREE.Mesh(
        soil,
        new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }),
      );
      expect(
        new THREE.Raycaster(
          new THREE.Vector3(point[0], deck.floor + 6, point[1]),
          new THREE.Vector3(0, -1, 0),
        ).intersectObject(terrain),
      ).toHaveLength(0);
      soil.dispose();
      terrain.material.dispose();
      const platform = new THREE.Raycaster(
        new THREE.Vector3(point[0], deck.floor + 1.5, point[1]),
        new THREE.Vector3(0, -1, 0),
      ).intersectObjects(
        scene.meshes.filter((mesh) => mesh.name === 'wood:#a18c69'),
      )[0];
      expect(platform?.point.y).toBeCloseTo(deck.floor, 4);
    }
  } finally {
    scene.dispose();
  }
});

it('adds the shortened Štulc bronze bust and keeps Karlach on his photographed low base', () => {
  const scene = geometryScene(makeMonuments);
  try {
    for (const [id, min, max] of [
      [1751591206, 3.2, 3.5],
      [3573420654, 2.7, 3.1],
    ]) {
      const monument = sculptures.find((sculpture) => sculpture.id === id);
      if (!monument) throw new Error(`Missing reference memorial ${id}.`);
      const floor = elevation(...monument.point);
      const top = new THREE.Raycaster(
        new THREE.Vector3(monument.point[0], floor + 6, monument.point[1]),
        new THREE.Vector3(0, -1, 0),
      ).intersectObjects(scene.meshes)[0];
      expect(top?.point.y - floor).toBeGreaterThan(min);
      expect(top?.point.y - floor).toBeLessThan(max);
    }
  } finally {
    scene.dispose();
  }
});
