import * as THREE from 'three';
import dataset from '../data/world.json';
import {
  arcadeInterior,
  makeArcadeCeiling,
  makeGardenReferences,
  makeHiddenChurch,
  makeGardenKiosk,
  makeReferenceBankIvy,
  makeArtilleryEntrance,
  makeInformationCentre,
  makeCitadela,
  makeCemeteryLabyrinth,
  makeGardenHeraldry,
  makeLeopoldCurbs,
  makeVratislavaSidewalks,
  makeLeopoldInteriorSidewalks,
  leopoldInteriorPaving,
  leopoldSidewalks,
} from './reference-details';
import {
  brickGateStairs,
  brickGateFenceLevel,
  artilleryEntrance,
  upperElevation,
  upperCovers,
  coverElevation,
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
  retainedWallOffsets,
  informationCentre,
  citadela,
  cemeteryLabyrinth,
  gardenHeraldry,
  featureElevation,
  gateFrame,
  buildings,
  center,
  inside,
  pevnostiGrade,
  visitorFrontagePads,
  parts,
  stairwellFootprint,
  cafeFrontage,
  spickaFrontage,
  type Point,
} from './geo';
import { makeApproach, makePassages } from './passages';
import { makeMonuments } from './monuments';
import {
  clipTerrainAtArcades,
  drapedPolygon,
  retainedStreetTerrain,
} from './surfaces';
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

it('paints the cemetery labyrinth on asphalt north of the private garden fence without occupying either residence', () => {
  const scene = geometryScene(makeCemeteryLabyrinth, THREE.DoubleSide);
  try {
    const residences = buildings.filter((building) =>
      [49810594, 49810596].includes(building.id),
    );
    const asphalt = scene.meshes.find((mesh) =>
      mesh.name.startsWith('asphalt:'),
    );
    const paint = scene.meshes.find((mesh) => mesh.name.startsWith('plaster:'));
    if (!asphalt || !paint) throw new Error('Missing labyrinth surfaces.');
    const positions = paint.geometry.attributes.position;
    for (let i = 0; i < positions.count; i++) {
      const point: Point = [positions.getX(i), positions.getZ(i)];
      expect(inside(point, cemeteryLabyrinth.courtyard)).toBe(true);
      expect(point[1]).toBeLessThan(-86.81);
      expect(
        residences.some((building) => inside(point, building.points)),
      ).toBe(false);
      expect(positions.getY(i) - elevation(...point)).toBeCloseTo(0.097, 3);
    }
    const ray = new THREE.Raycaster(
      new THREE.Vector3(
        cemeteryLabyrinth.point[0],
        80,
        cemeteryLabyrinth.point[1],
      ),
      new THREE.Vector3(0, -1, 0),
    );
    expect(ray.intersectObject(asphalt).length).toBeGreaterThan(0);
    expect(positions.count).toBeLessThan(40000);
    const curb = scene.meshes.find((mesh) => mesh.name.startsWith('stone:'));
    if (!curb) throw new Error('Missing curved labyrinth border.');
    const edge = curb.geometry.attributes.position;
    let highest = -Infinity;
    for (let i = 0; i < edge.count; i++)
      highest = Math.max(
        highest,
        edge.getY(i) - elevation(edge.getX(i), edge.getZ(i)),
      );
    expect(highest).toBeCloseTo(0.095, 2);
    ray.ray.origin.set(-258, 80, -95);
    expect(ray.intersectObject(asphalt).length).toBeGreaterThan(0);
    ray.ray.origin.set(-260, 80, -102);
    expect(ray.intersectObject(asphalt)).toHaveLength(0);
  } finally {
    scene.dispose();
  }
});

it('connects narrow mosaic borders from Leopold Gate to the rotunda junction without paving the green triangle or blocking crossings', () => {
  const scene = geometryScene(makeLeopoldInteriorSidewalks, THREE.DoubleSide);
  const terrain = retainedStreetTerrain();
  const ray = new THREE.Raycaster();
  const at = (point: Point) => {
    ray.set(
      new THREE.Vector3(point[0], 80, point[1]),
      new THREE.Vector3(0, -1, 0),
    );
    return ray.intersectObjects(scene.meshes)[0];
  };
  try {
    let probes = 0;
    for (const side of leopoldInteriorPaving.sidewalks)
      for (const point of side.curb.filter(
        (_point, index) => index % 8 === 4,
      )) {
        const projection = projectRoute(point, side.feature.points);
        const dx = point[0] - projection.point[0],
          dz = point[1] - projection.point[1];
        const distance = Math.hypot(dx, dz);
        const probe: Point = [
          point[0] + (dx / distance) * 0.45,
          point[1] + (dz / distance) * 0.45,
        ];
        if (
          !side.polygons.some(
            (polygon) =>
              inside(probe, polygon[0]) &&
              !polygon.slice(1).some((hole) => inside(probe, hole)),
          )
        )
          continue;
        const hit = at(probe);
        expect(hit?.object.name, JSON.stringify(probe)).toBe('mosaic:#d0ccbd');
        expect(
          hit.point.y -
            (side.feature.id === 5016653
              ? terrain.heightAt(probe)
              : featureElevation(side.feature, probe)),
          JSON.stringify(probe),
        ).toBeCloseTo(0.075, 2);
        probes++;
      }
    expect(probes).toBeGreaterThan(20);
    expect(at([69.5, 106.7])?.object.name).toBe('mosaic:#d0ccbd');
    for (const point of [
      [74.5, 108],
      [75.5, 111],
      [80.06, 112.19],
      [76.82, 100.72],
    ] as Point[])
      expect(at(point), JSON.stringify(point)).toBeUndefined();
    expect(leopoldInteriorPaving.stairStrips.length).toBeGreaterThan(0);
    let stairProbes = 0;
    for (const point of leopoldSidewalks.runs[0].curb.filter(
      (point, index) => index % 8 === 0 && point[0] > 210 && point[0] < 240,
    )) {
      const projection = projectRoute(point, leopoldSidewalks.street.points);
      const dx = point[0] - projection.point[0],
        dz = point[1] - projection.point[1];
      const length = Math.hypot(dx, dz);
      for (const distance of [5.2, 7.6]) {
        const probe: Point = [
          projection.point[0] + (dx / length) * distance,
          projection.point[1] + (dz / length) * distance,
        ];
        if (
          !leopoldInteriorPaving.stairStrips.some(
            (polygon) =>
              inside(probe, polygon[0]) &&
              !polygon.slice(1).some((hole) => inside(probe, hole)),
          )
        )
          continue;
        const hit = at(probe);
        expect(hit?.object.name, JSON.stringify(probe)).toBe('mosaic:#d0ccbd');
        expect(hit.point.y - pevnostiGrade(probe).level).toBeCloseTo(0.075, 2);
        stairProbes++;
      }
    }
    expect(stairProbes).toBeGreaterThan(6);
    for (const point of stairwellFootprint
      .slice(0, -1)
      .map(
        (point): Point => [
          point[0] * 0.8 + center(stairwellFootprint)[0] * 0.2,
          point[1] * 0.8 + center(stairwellFootprint)[1] * 0.2,
        ],
      ))
      expect(at(point), 'Preserve stairwell excavation').toBeUndefined();
  } finally {
    scene.dispose();
    terrain.geometries.forEach((geometry) => geometry.dispose());
  }
});

it('keeps sidewalk cross-sections level above the fitted soil instead of climbing the roadside banks', () => {
  const scene = geometryScene(makeLeopoldInteriorSidewalks, THREE.DoubleSide);
  const terrain = retainedStreetTerrain();
  const ray = new THREE.Raycaster();
  try {
    let sections = 0;
    for (const side of leopoldInteriorPaving.sidewalks)
      for (const curb of side.curb.filter((_point, i) => i % 8 === 4)) {
        const road = projectRoute(curb, side.feature.points);
        const a = side.feature.points[road.segment],
          b = side.feature.points[road.segment + 1];
        const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
        if (Math.min(road.fraction, 1 - road.fraction) * length < 1.5) continue;
        const sign = Math.sign(
          (curb[0] - road.point[0]) * road.normal[0] +
            (curb[1] - road.point[1]) * road.normal[1],
        );
        const points = [0.18, 0.65, 1.12].map(
          (offset): Point => [
            curb[0] + road.normal[0] * sign * offset,
            curb[1] + road.normal[1] * sign * offset,
          ],
        );
        if (
          points.some(
            (point) =>
              projectRoute(point, side.feature.points).segment !== road.segment,
          )
        )
          continue;
        if (
          !points.every((point) =>
            side.polygons.some(
              (polygon) =>
                inside(point, polygon[0]) &&
                !polygon.slice(1).some((hole) => inside(point, hole)),
            ),
          )
        )
          continue;
        const heights = points.map((point) => {
          ray.set(
            new THREE.Vector3(point[0], 80, point[1]),
            new THREE.Vector3(0, -1, 0),
          );
          const hit = ray.intersectObjects(scene.meshes)[0];
          expect(hit?.object.name, JSON.stringify(point)).toBe(
            'mosaic:#d0ccbd',
          );
          expect(
            hit.point.y - terrain.heightAt(point),
            `Soil below ${JSON.stringify(point)}`,
          ).toBeGreaterThan(0.055);
          return hit.point.y;
        });
        expect(
          Math.max(...heights) - Math.min(...heights),
          JSON.stringify(points),
        ).toBeLessThan(0.003);
        sections++;
      }
    expect(sections).toBeGreaterThan(25);
    for (const point of [
      [60.5, 96],
      [60.2, 102],
      [60.7, 110],
    ] as Point[]) {
      ray.set(
        new THREE.Vector3(point[0], 80, point[1]),
        new THREE.Vector3(0, -1, 0),
      );
      expect(
        ray.intersectObjects(scene.meshes)[0]?.object.name,
        'Continue the western rotunda border',
      ).toBe('mosaic:#d0ccbd');
    }
  } finally {
    scene.dispose();
    for (const geometry of terrain.geometries) geometry.dispose();
  }
});

it('raises patterned Leopold sidewalks two centimetres above the road, leaving the gate and carriageway open', () => {
  const scene = geometryScene(makeLeopoldCurbs, THREE.DoubleSide);
  const street = leopoldSidewalks.street;
  const gate = buildings.find((building) => building.id === 51718887);
  if (!street || !gate) throw new Error('Missing curb fixtures.');
  const frame = gateFrame(gate);
  try {
    expect(
      scene.meshes.filter((mesh) => mesh.name.startsWith('stone:')).length,
    ).toBeGreaterThanOrEqual(2);
    expect(
      scene.meshes.filter((mesh) => mesh.name.startsWith('mosaic:')),
    ).toHaveLength(2);
    for (const mesh of scene.meshes) {
      const positions = mesh.geometry.attributes.position;
      let highest = -Infinity;
      for (let i = 0; i < positions.count; i++) {
        const point: Point = [positions.getX(i), positions.getZ(i)];
        const projection = projectRoute(point, street.points);
        expect(projection.distance).toBeGreaterThan(pathWidth(street) / 2);
        expect(projection.distance).toBeLessThan(11);
        expect(
          Math.hypot(point[0] - frame.center[0], point[1] - frame.center[1]),
        ).toBeGreaterThan(4.7);
        highest = Math.max(
          highest,
          positions.getY(i) - featureElevation(street, point) - 0.055,
        );
        if (mesh.name.startsWith('mosaic:'))
          expect(
            positions.getY(i) - featureElevation(street, point) - 0.055,
          ).toBeCloseTo(0.02, 3);
      }
      expect(highest).toBeCloseTo(0.02, 2);
    }
    const point = street.points[1];
    const ray = new THREE.Raycaster(
      new THREE.Vector3(point[0], 80, point[1]),
      new THREE.Vector3(0, -1, 0),
    );
    expect(ray.intersectObjects(scene.meshes)).toHaveLength(0);
    for (const run of leopoldSidewalks.runs) {
      const wallFront = run.frontage.slice(0, 2);
      const wallLength = Math.hypot(
        wallFront[1][0] - wallFront[0][0],
        wallFront[1][1] - wallFront[0][1],
      );
      const straight = run.curb.filter((point) => {
        const projection = projectRoute(point, wallFront);
        return projection.along > 3 && projection.along < wallLength - 3;
      });
      expect(straight.length).toBeGreaterThan(20);
      for (const point of straight)
        expect(
          projectRoute(point, wallFront).distance -
            wallThickness(run.wall, point) / 2,
        ).toBeCloseTo(1.325, 3);
      const midpoint = run.curb[Math.floor(run.curb.length / 2)];
      const roadPoint = projectRoute(midpoint, street.points).point;
      const dx = midpoint[0] - roadPoint[0],
        dz = midpoint[1] - roadPoint[1];
      const length = Math.hypot(dx, dz);
      const point: Point = [
        midpoint[0] + (dx / length) * 0.6,
        midpoint[1] + (dz / length) * 0.6,
      ];
      ray.ray.origin.set(point[0], 80, point[1]);
      const hit = ray.intersectObjects(scene.meshes)[0];
      expect(hit?.object.name).toBe('mosaic:#d0ccbd');
      expect(hit.point.y - featureElevation(street, point) - 0.055).toBeCloseTo(
        0.02,
        3,
      );
    }
  } finally {
    scene.dispose();
  }
});

it('keeps the eagle on the outer tip and moves the shield to the convex corner left of the garden junction', () => {
  const scene = geometryScene(makeGardenHeraldry, THREE.DoubleSide);
  try {
    const rampart = walls.find((wall) => wall.id === 1532977610);
    const garden = walls.find((wall) => wall.id === 8888302);
    if (!rampart || !garden) throw new Error('Missing heraldic wall fixtures.');
    const meeting = garden.points[garden.points.length - 1];
    const index = rampart.points.findIndex(
      (point) => point[0] === meeting[0] && point[1] === meeting[1],
    );
    expect(gardenHeraldry.corner).toEqual(rampart.points[index + 1]);
    expect(
      Math.hypot(
        gardenHeraldry.corner[0] - meeting[0],
        gardenHeraldry.corner[1] - meeting[1],
      ),
    ).toBeGreaterThan(25);
    for (const face of gardenHeraldry.faces) {
      const ray = new THREE.Raycaster(
        new THREE.Vector3(
          face.point[0] + face.normal[0] * 2,
          gardenHeraldry.crest - 2.25,
          face.point[1] + face.normal[1] * 2,
        ),
        new THREE.Vector3(-face.normal[0], 0, -face.normal[1]),
        0,
        3,
      );
      expect(ray.intersectObjects(scene.meshes).length).toBeGreaterThan(0);
    }
    const { point, angle } = gardenHeraldry.shield;
    const leftCorner = rampart.points[index - 2];
    expect(gardenHeraldry.shield.corner).toEqual(leftCorner);
    expect(
      Math.hypot(leftCorner[0] - meeting[0], leftCorner[1] - meeting[1]),
    ).toBeGreaterThan(30);
    expect(
      Math.hypot(point[0] - leftCorner[0], point[1] - leftCorner[1]),
    ).toBeLessThan(0.3);
    expect(gardenHeraldry.shield.faces).toHaveLength(2);
    const ray = new THREE.Raycaster(
      new THREE.Vector3(
        point[0] + Math.sin(angle) * 2,
        gardenHeraldry.shield.height,
        point[1] + Math.cos(angle) * 2,
      ),
      new THREE.Vector3(-Math.sin(angle), 0, -Math.cos(angle)),
      0,
      3,
    );
    expect(ray.intersectObjects(scene.meshes).length).toBeGreaterThan(0);
    expect(
      scene.meshes.every((mesh) => {
        mesh.geometry.computeBoundingBox();
        return (
          (mesh.geometry.boundingBox?.max.y ?? Infinity) <
          Math.max(gardenHeraldry.crest, gardenHeraldry.shield.crest) + 0.1
        );
      }),
    ).toBe(true);
  } finally {
    scene.dispose();
  }
});

it('continues the raised mosaic past the fence and in front of the setback school without narrowing the road', () => {
  const scene = geometryScene(makeLeopoldCurbs, THREE.DoubleSide);
  const run = leopoldSidewalks.runs.find(
    (run) => run.building.id === 494921208,
  );
  const school = buildings.find((building) => building.id === 49811192);
  const attached = buildings.find((building) => building.id === 55117753);
  const original = dataset.features.find(
    (building) => building.id === 49811192,
  );
  if (!run || !school || !attached || !original)
    throw new Error('Missing extension fixtures.');
  try {
    const edge = school.points.slice(-3);
    const oldEdge = original.points.slice(-3);
    const shift = Math.hypot(
      edge[0][0] - oldEdge[0][0],
      edge[0][1] - oldEdge[0][1],
    );
    expect(shift).toBeCloseTo(1.8, 3);
    const roof = parts.find((part) => part.id === 502676879);
    const originalRoof = dataset.features.find((part) => part.id === 502676879);
    if (!roof || !originalRoof) throw new Error('Missing concave school roof.');
    expect(roof.points[0][0] - originalRoof.points[0][0]).toBeCloseTo(
      edge[0][0] - oldEdge[0][0],
      5,
    );
    expect(roof.points[0][1] - originalRoof.points[0][1]).toBeCloseTo(
      edge[0][1] - oldEdge[0][1],
      5,
    );
    expect(
      attached.points.some(
        (point) =>
          Math.hypot(point[0] - edge[2][0], point[1] - edge[2][1]) < 0.001,
      ),
    ).toBe(true);
    const samples = run.curb.filter((point) => {
      const projection = projectRoute(point, edge);
      return projection.along > 3 && projection.along < 20;
    });
    expect(samples.length).toBeGreaterThan(15);
    const ray = new THREE.Raycaster(
      new THREE.Vector3(),
      new THREE.Vector3(0, -1, 0),
    );
    for (const point of samples) {
      expect(projectRoute(point, edge).distance).toBeGreaterThan(1.2);
      expect(projectRoute(point, edge).distance).toBeLessThan(2.6);
      const road = projectRoute(point, leopoldSidewalks.street.points).point;
      const dx = point[0] - road[0],
        dz = point[1] - road[1],
        length = Math.hypot(dx, dz);
      const band: Point = [
        point[0] + (dx / length) * 0.6,
        point[1] + (dz / length) * 0.6,
      ];
      ray.ray.origin.set(band[0], 80, band[1]);
      const hit = ray.intersectObjects(scene.meshes)[0];
      expect(hit?.object.name).toBe('mosaic:#d0ccbd');
      expect(hit.point.y - pevnostiGrade(band).level).toBeCloseTo(0.075, 3);
      expect(inside(band, school.points)).toBe(false);
      expect(blocked(band, elevation(...band))).toBe(false);
    }
    const curbLine = [samples[0], samples[samples.length - 1]];
    for (const point of samples)
      expect(projectRoute(point, curbLine).distance).toBeLessThan(0.001);
    for (const id of [49811192, 55117753, 55117756]) {
      const building = buildings.find((building) => building.id === id);
      if (!building) throw new Error('Missing paved frontage.');
      const face = building.points
        .slice(1)
        .map((point, index) => [building.points[index], point])
        .filter(([a, b]) => Math.hypot(b[0] - a[0], b[1] - a[1]) > 3.4)
        .sort(
          (a, b) =>
            projectRoute(center(a), leopoldSidewalks.street.points).distance -
            projectRoute(center(b), leopoldSidewalks.street.points).distance,
        )[0];
      for (const fraction of [0.2, 0.5, 0.8]) {
        const point: Point = [
          face[0][0] + (face[1][0] - face[0][0]) * fraction,
          face[0][1] + (face[1][1] - face[0][1]) * fraction,
        ];
        const road = projectRoute(point, leopoldSidewalks.street.points);
        const band: Point = [
          point[0] + ((road.point[0] - point[0]) * 0.15) / road.distance,
          point[1] + ((road.point[1] - point[1]) * 0.15) / road.distance,
        ];
        ray.ray.origin.set(band[0], 80, band[1]);
        expect(
          ray.intersectObjects(scene.meshes)[0]?.object.name,
          JSON.stringify({ id, band }),
        ).toBe('mosaic:#d0ccbd');
      }
    }
    for (const road of leopoldSidewalks.streets) {
      for (const point of road.points) {
        ray.ray.origin.set(point[0], 80, point[1]);
        expect(ray.intersectObjects(scene.meshes)).toHaveLength(0);
      }
    }
    for (const [index, sidewalk] of leopoldSidewalks.runs.entries())
      for (const point of sidewalk.curb.filter((point) =>
        index === 0
          ? point[0] > 134 && point[1] > 178
          : point[0] > 130 && point[1] > 196,
      )) {
        const road = projectRoute(point, leopoldSidewalks.street.points).point;
        const dx = point[0] - road[0],
          dz = point[1] - road[1],
          length = Math.hypot(dx, dz);
        const band: Point = [
          point[0] + (dx / length) * 0.6,
          point[1] + (dz / length) * 0.6,
        ];
        if (inside(band, stairwellFootprint)) continue;
        expect(
          blocked(band, pevnostiGrade(band).level),
          JSON.stringify(band),
        ).toBe(false);
      }
  } finally {
    scene.dispose();
  }
});

it('reaches Tábor Gate on both sides with the same raised mosaic and leaves the stairwell open', () => {
  for (const point of [
    [163.14824495933857, 238.27078141740859],
    [162.8590270187313, 238.4678930173486],
  ] as Point[])
    expect(elevation(...point)).toBeLessThan(
      pevnostiGrade(point).level + 0.055,
    );
  const scene = geometryScene(makeLeopoldCurbs, THREE.DoubleSide);
  const route = leopoldSidewalks.street.points;
  const end = projectRoute(route[route.length - 1], route).along;
  try {
    for (const run of leopoldSidewalks.runs) {
      expect(
        projectRoute(run.curb[run.curb.length - 1], route).along,
      ).toBeGreaterThan(end - 4);
      for (const point of run.curb.filter(
        (point, index) => index % 5 === 0 && point[0] > 145 && point[1] > 200,
      )) {
        const road = projectRoute(point, route);
        const dx = point[0] - road.point[0],
          dz = point[1] - road.point[1],
          length = Math.hypot(dx, dz);
        const band: Point = [
          point[0] + (dx / length) * 0.6,
          point[1] + (dz / length) * 0.6,
        ];
        if (inside(band, stairwellFootprint)) continue;
        const ray = new THREE.Raycaster(
          new THREE.Vector3(band[0], 80, band[1]),
          new THREE.Vector3(0, -1, 0),
        );
        expect(
          ray.intersectObjects(scene.meshes)[0]?.object.name,
          JSON.stringify(band),
        ).toBe('mosaic:#d0ccbd');
      }
    }
    for (const point of [
      [225.23, 286.83],
      [226, 285.5],
    ] as Point[]) {
      const ray = new THREE.Raycaster(
        new THREE.Vector3(point[0], 80, point[1]),
        new THREE.Vector3(0, -1, 0),
      );
      expect(ray.intersectObjects(scene.meshes)).toHaveLength(0);
    }
  } finally {
    scene.dispose();
  }
});

it('surrounds U Vratislava with connected mosaic up to the pump hedge line while preserving the garden and planting beds', () => {
  const scene = geometryScene(makeVratislavaSidewalks, THREE.DoubleSide);
  const cafe = cafeFrontage();
  const at = (u: number, v: number): Point => [
    cafe.center[0] + cafe.axis[0] * u - cafe.axis[1] * v,
    cafe.center[1] + cafe.axis[1] * u + cafe.axis[0] * v,
  ];
  const hit = (point: Point) =>
    new THREE.Raycaster(
      new THREE.Vector3(point[0], 80, point[1]),
      new THREE.Vector3(0, -1, 0),
    ).intersectObjects(scene.meshes)[0];
  try {
    for (const point of [
      at(-cafe.width / 2 - 0.95, 0),
      at(cafe.width / 2 + 0.95, 0),
      at(0, -cafe.depth / 2 - 0.95),
      spickaFrontage.at(-7, 3.45),
      spickaFrontage.at(7, 3.45),
      spickaFrontage.at(-7, -1.35),
      spickaFrontage.at(7, -1.35),
    ]) {
      expect(hit(point)?.object.name, JSON.stringify(point)).toBe(
        'mosaic:#d0ccbd',
      );
      expect(hit(point)?.point.y).toBeCloseTo(elevation(...point) + 0.075, 2);
      expect(blocked(point, elevation(...point)), JSON.stringify(point)).toBe(
        false,
      );
    }
    for (const point of [
      center(cafe.building.points),
      center(spickaFrontage.houseGarden),
      spickaFrontage.pump.point,
      at(0, 4.8),
      spickaFrontage.at(0, 4.6),
    ])
      expect(hit(point), JSON.stringify(point)).toBeUndefined();
  } finally {
    scene.dispose();
  }
});

it('grounds both visitor buildings on fixed frontage pads rather than uneven hillside samples', () => {
  for (const pad of visitorFrontagePads) {
    expect(foundation(pad.building)).toBe(pad.level);
    const samples = pad.building.points.flatMap((point, index, ring) => {
      const next = ring[(index + 1) % ring.length];
      return [
        point,
        [(point[0] + next[0]) / 2, (point[1] + next[1]) / 2] as Point,
      ];
    });
    for (const point of samples)
      expect(elevation(...point)).toBeCloseTo(pad.level, 3);
    expect(
      Math.abs(pad.level - pevnostiGrade(center(pad.building.points)).level),
    ).toBeLessThan(0.01);
  }
});

it('places the low brick information pavilion across the road from the preserved ivy-covered shed, with glazed entrance and slit windows', () => {
  const site = informationCentre;
  const shed = buildings.find((building) => building.id === 49811200);
  const street = paths.find((path) => path.id === 494921190);
  if (!shed || !street) throw new Error('Missing information-centre frontage.');
  const roadSide = (point: Point) => {
    const projection = projectRoute(point, street.points);
    return (
      (point[0] - projection.point[0]) * projection.normal[0] +
      (point[1] - projection.point[1]) * projection.normal[1]
    );
  };
  expect(roadSide(site.point) * roadSide(center(shed.points))).toBeLessThan(0);
  expect(site.building).not.toBe(shed);
  const scene = geometryScene(makeInformationCentre, THREE.DoubleSide);
  const normal = new THREE.Vector3(
    Math.sin(site.angle),
    0,
    Math.cos(site.angle),
  );
  const right = new THREE.Vector3(
    Math.cos(site.angle),
    0,
    -Math.sin(site.angle),
  );
  const ray = (
    u: number,
    v: number,
    height: number,
    direction: THREE.Vector3,
  ) => {
    const point = site.at(u, v);
    return new THREE.Raycaster(
      new THREE.Vector3(point[0], site.ground + height, point[1]),
      direction,
      0,
      1,
    ).intersectObjects(scene.meshes)[0]?.object.name;
  };
  try {
    expect(
      ray(-0.7, site.depth / 2 + 0.4, 1.4, normal.clone().negate()),
    ).toMatch(/^glass:/);
    for (const v of [5.8, 2.5, -0.8, -4.1])
      expect(ray(site.width / 2 + 0.4, v, 1.5, right.clone().negate())).toMatch(
        /^glass:/,
      );
    expect(ray(site.width / 2 + 0.4, 0, 1.5, right.clone().negate())).toMatch(
      /^brick:/,
    );
    for (const v of [-5, 0, 5]) {
      const point = site.at(site.width / 2 + 0.45, v);
      const support = new THREE.Raycaster(
        new THREE.Vector3(point[0], site.ground + 0.4, point[1]),
        new THREE.Vector3(0, -1, 0),
        0,
        1,
      ).intersectObjects(
        scene.meshes.filter((mesh) => mesh.name.startsWith('stone:')),
      )[0];
      expect(support).toBeDefined();
      expect(support.point.y).toBeCloseTo(site.ground + 0.06, 3);
    }
    for (const mesh of scene.meshes) {
      mesh.geometry.computeBoundingBox();
      const bounds = mesh.geometry.boundingBox;
      if (!bounds) throw new Error('Missing information-centre bounds.');
      expect(bounds.max.y).toBeLessThan(site.ground + 3.8);
    }
  } finally {
    scene.dispose();
  }
});

it('adds Citadela café tables, cobbled courtyard and two rows of grounded wooden sling chairs without blocking mapped access', () => {
  expect(citadela.tables.length).toBeGreaterThanOrEqual(3);
  expect(citadela.loungers.length).toBeGreaterThanOrEqual(8);
  const scene = geometryScene(makeCitadela, THREE.DoubleSide);
  const down = new THREE.Vector3(0, -1, 0);
  const floor = (point: Point) =>
    new THREE.Raycaster(
      new THREE.Vector3(point[0], elevation(...point) + 2, point[1]),
      down,
      0,
      3,
    ).intersectObjects(scene.meshes)[0];
  try {
    for (const point of citadela.tables) {
      expect(floor(point)?.object.name).toMatch(/^wood:/);
      expect(floor(point).point.y - elevation(...point)).toBeCloseTo(0.885, 3);
      expect(sitePropBlocked(point, elevation(...point))).toBe(true);
    }
    for (const point of citadela.loungers) {
      expect(floor(point)?.object.name).toMatch(/^plaster:/);
      expect(sitePropBlocked(point, elevation(...point))).toBe(true);
    }
    let groundedLegs = 0;
    for (const mesh of scene.meshes.filter(
      (mesh) => mesh.name === 'wood:#bca17c',
    )) {
      const positions = mesh.geometry.getAttribute('position');
      let clearance = Infinity;
      for (let i = 0; i < positions.count; i++)
        clearance = Math.min(
          clearance,
          positions.getY(i) - elevation(positions.getX(i), positions.getZ(i)),
        );
      if (clearance < 0.2) {
        expect(Math.abs(clearance)).toBeLessThan(0.08);
        groundedLegs++;
      }
    }
    expect(groundedLegs).toBe(citadela.loungers.length * 4);
    for (const u of [-12, 0, 12]) {
      const point = citadela.at(u, 6);
      expect(floor(point)?.object.name).toMatch(/^cobble:/);
      expect(
        Math.abs(floor(point).point.y - elevation(...point) - 0.085),
      ).toBeLessThan(0.04);
    }
    for (const id of [255297804, 26715955, 26694437]) {
      const path = paths.find((path) => path.id === id);
      if (!path) throw new Error('Missing Citadela access path.');
      for (let i = 1; i < path.points.length; i++) {
        const a = path.points[i - 1],
          b = path.points[i];
        for (let t = 0; t <= 1; t += 0.1) {
          const point: Point = [
            a[0] + (b[0] - a[0]) * t,
            a[1] + (b[1] - a[1]) * t,
          ];
          if (
            Math.hypot(
              point[0] - citadela.point[0],
              point[1] - citadela.point[1],
            ) < 22
          )
            expect(
              sitePropBlocked(point, elevation(...point)),
              JSON.stringify(point),
            ).toBe(false);
        }
      }
    }
  } finally {
    scene.dispose();
  }
});

it('grades the lawn and masonry perimeter above Brick Gate into one straight crest while preserving the road beneath', () => {
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
        brickGateFenceLevel(...point) - 0.03,
        6,
      );
  } finally {
    scene.dispose();
  }
});

it('embeds the artillery portal into the wall near the left corner and keeps its door and approach accessible', () => {
  const wall = walls.find((wall) => wall.id === 1532977610);
  if (!wall) throw new Error('Missing gallery rampart.');
  const site = artilleryEntrance;
  const projection = projectRoute(site.point, wall.points);
  const corner = wall.points[projection.segment];
  expect(
    Math.hypot(
      projection.point[0] - corner[0],
      projection.point[1] - corner[1],
    ),
  ).toBeCloseTo(2.3, 5);
  expect(
    Math.hypot(site.point[0] - 135.2, site.point[1] - 132.97),
  ).toBeGreaterThan(15);
  expect(blocked(site.approach, elevation(...site.approach))).toBe(false);
  const scene = geometryScene(makeArtilleryEntrance, THREE.DoubleSide);
  try {
    const frame = scene.meshes.find((mesh) => mesh.name === 'stone:#c2b59b');
    if (!frame) throw new Error('Missing gallery stone frame.');
    const positions = frame.geometry.attributes.position;
    const depths = Array.from(
      { length: positions.count },
      (_, i) =>
        (positions.getX(i) - projection.point[0]) * site.normal[0] +
        (positions.getZ(i) - projection.point[1]) * site.normal[1],
    );
    const face = -retainedWallOffsets(
      projection.point,
      wallThickness(wall, projection.point),
      wallProfile(wall, projection.point, projection.normal),
    ).outer;
    expect(Math.min(...depths)).toBeCloseTo(face - 0.08, 4);
    expect(Math.max(...depths)).toBeCloseTo(face + 0.37, 4);
    for (const height of [1.2, 2.45]) {
      const door = new THREE.Raycaster(
        new THREE.Vector3(
          site.point[0] + site.normal[0],
          site.floor + height,
          site.point[1] + site.normal[1],
        ),
        new THREE.Vector3(-site.normal[0], 0, -site.normal[1]),
        0,
        1,
      ).intersectObjects(scene.meshes)[0];
      expect(door?.object.name).toMatch(/^wood:/);
      expect(
        (door.point.x - projection.point[0]) * site.normal[0] +
          (door.point.z - projection.point[1]) * site.normal[1],
      ).toBeGreaterThan(face);
    }
    for (const v of [0.8, 1.8, 2.8])
      for (const u of [-1.25, 0, 1.25]) {
        const x = site.point[0] + site.normal[1] * u + site.normal[0] * v;
        const z = site.point[1] - site.normal[0] * u + site.normal[1] * v;
        const floor = new THREE.Raycaster(
          new THREE.Vector3(x, site.floor + 0.3, z),
          new THREE.Vector3(0, -1, 0),
          0,
          0.5,
        ).intersectObjects(scene.meshes)[0];
        expect(floor?.object.name).toMatch(/^cobble:/);
        expect(floor.point.y).toBeCloseTo(site.floor + 0.045, 4);
      }
    const soil = drapedPolygon(site.apron, 0, unretainedElevation);
    clipTerrainAtArcades(soil);
    const soilMesh = new THREE.Mesh(soil, scene.meshes[0].material);
    for (const v of [0.8, 1.8, 2.8]) {
      const x = site.point[0] + site.normal[0] * v;
      const z = site.point[1] + site.normal[1] * v;
      expect(
        new THREE.Raycaster(
          new THREE.Vector3(x, site.floor + 2, z),
          new THREE.Vector3(0, -1, 0),
          0,
          5,
        ).intersectObject(soilMesh),
      ).toHaveLength(0);
    }
    soil.dispose();
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
    expect(counter?.object.name).toMatch(/^wood:/);
    expect(counter?.distance).toBeGreaterThan(4);
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
    const shed = buildings.find((building) => building.id === 49811200);
    if (!shed) throw new Error('Missing ivy-covered shed.');
    const facade = projectRoute([141, 175], shed.points);
    const a = shed.points[facade.segment],
      b = shed.points[facade.segment + 1];
    const sign = inside(
      [
        facade.point[0] + facade.normal[0] * 0.1,
        facade.point[1] + facade.normal[1] * 0.1,
      ],
      shed.points,
    )
      ? -1
      : 1;
    for (const t of [0.18, 0.56, 0.83]) {
      const leaf = new THREE.Raycaster(
        new THREE.Vector3(
          a[0] + (b[0] - a[0]) * t + facade.normal[0] * sign,
          foundation(shed) + 2.55,
          a[1] + (b[1] - a[1]) * t + facade.normal[1] * sign,
        ),
        new THREE.Vector3(
          -facade.normal[0] * sign,
          0,
          -facade.normal[1] * sign,
        ),
        0,
        2,
      ).intersectObjects(scene.meshes)[0];
      expect(leaf?.object.name).toMatch(/^foliage:/);
    }
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
