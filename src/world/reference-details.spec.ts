import * as THREE from 'three';
import {
  arcadeInterior,
  makeArcadeVault,
  makeGardenReferences,
  makeHiddenChurch,
} from './reference-details';
import {
  brickGateStairs,
  cemeteryArcadeBays,
  elevation,
  referenceSites,
  sitePropBlocked,
  sculptures,
  stairElevation,
  panoramaDecks,
  type Point,
} from './geo';
import { makeApproach, makePassages } from './passages';
import { makeMonuments } from './monuments';
import { clipTerrainAtArcades, drapedPolygon } from './surfaces';
import { makePanoramaLookouts, type AddGeometry } from './architecture';

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

it('renders each photographed cemetery vault from below without closing its walk-through bay', () => {
  for (const bay of [cemeteryArcadeBays[0], cemeteryArcadeBays.at(-1)]) {
    if (!bay) throw new Error('Missing cemetery bay fixture.');
    const { at, depth, normal } = arcadeInterior(bay);
    const floor = elevation(...bay.center);
    const scene = geometryScene((add) => makeArcadeVault(bay, floor, add));
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
    expect(wall?.distance).toBeCloseTo(2, 4);
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
