import * as THREE from 'three';
import polygonClipping, { type MultiPolygon } from 'polygon-clipping';
import {
  courtBankBoundary,
  featureElevation,
  inside,
  paths,
  pathWidth,
  projectRoute,
  rampartTerrace,
  stairwellFootprint,
  rotundaStreet,
  elevation,
  gateFrame,
  gateOpenings,
  buildings,
  foundation,
  type Point,
} from './geo';
import {
  pavingFootprint,
  pavingGeometry,
  pavingStyle,
  pavingSurfaces,
} from './paving';
import { makeLeopoldInteriorSidewalks } from './reference-details';
import {
  drapedPolygon as groundPolygon,
  samplePolyline,
  retainedStreetTerrain,
} from './surfaces';

function way(id: number) {
  const feature = paths.find((feature) => feature.id === id);
  if (!feature) throw new Error(`Missing path fixture ${id}.`);
  return feature;
}
function contains(polygons: MultiPolygon, point: Point) {
  return polygons.some(
    (polygon) =>
      inside(point, polygon[0]) &&
      !polygon.slice(1).some((hole) => inside(point, hole)),
  );
}
function area(polygons: MultiPolygon) {
  return polygons.reduce(
    (sum, polygon) =>
      sum +
      polygon.reduce((total, ring, i) => {
        const area =
          Math.abs(
            ring
              .slice(1)
              .reduce(
                (sum, p, j) => sum + ring[j][0] * p[1] - p[0] * ring[j][1],
                0,
              ),
          ) / 2;
        return total + (i === 0 ? area : -area);
      }, 0),
    0,
  );
}
function steepTriangles(geometry: THREE.BufferGeometry) {
  const p = geometry.attributes.position;
  const a = new THREE.Vector3(),
    b = new THREE.Vector3(),
    c = new THREE.Vector3();
  const ab = new THREE.Vector3(),
    ac = new THREE.Vector3(),
    normal = new THREE.Vector3();
  let count = 0;
  for (let i = 0; i < p.count; i += 3) {
    a.fromBufferAttribute(p, i);
    b.fromBufferAttribute(p, i + 1);
    c.fromBufferAttribute(p, i + 2);
    normal.crossVectors(ab.subVectors(b, a), ac.subVectors(c, a));
    if (Math.hypot(normal.x, normal.z) > Math.abs(normal.y) * 0.551) count++;
  }
  return count;
}

describe('rationalized paving', () => {
  it('paves all Leopold side arches at their walking floor and keeps the rotunda grass triangle clear', () => {
    const gate = buildings.find((feature) => feature.id === 51718887);
    if (!gate) throw new Error('Missing Leopold Gate.');
    const frame = gateFrame(gate);
    const material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
    const meshes = pavingSurfaces([
      way(5016653),
      way(494921191),
      way(494921195),
      way(494921206),
      way(494921200),
      way(494921203),
      way(370193790),
      way(139507049),
    ]).map((surface) => new THREE.Mesh(pavingGeometry(surface), material));
    const ray = new THREE.Raycaster();
    try {
      for (const opening of gateOpenings(gate))
        for (const z of [-1.8, 0, 1.8]) {
          const point: Point = [
            frame.center[0] +
              Math.cos(frame.angle) * opening.offset +
              Math.sin(frame.angle) * z,
            frame.center[1] -
              Math.sin(frame.angle) * opening.offset +
              Math.cos(frame.angle) * z,
          ];
          ray.set(
            new THREE.Vector3(point[0], 60, point[1]),
            new THREE.Vector3(0, -1, 0),
          );
          const hit = ray.intersectObjects(meshes)[0];
          expect(hit, JSON.stringify(point)).toBeDefined();
          expect(hit.point.y - elevation(...point)).toBeCloseTo(0.055, 2);
          expect(hit.point.y).toBeGreaterThan(foundation(gate) - 0.1);
        }
      ray.set(new THREE.Vector3(74.5, 60, 108), new THREE.Vector3(0, -1, 0));
      expect(ray.intersectObjects(meshes)).toHaveLength(0);
      ray.set(
        new THREE.Vector3(69.25, 60, 106.76358),
        new THREE.Vector3(0, -1, 0),
      );
      expect(ray.intersectObjects(meshes)).toHaveLength(0);
    } finally {
      meshes.forEach((mesh) => mesh.geometry.dispose());
      material.dispose();
    }
  });
  it('keeps kiosk road-edge cells below the paving instead of sampling the raised garden outside the cut', () => {
    const terrain = retainedStreetTerrain();
    const material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
    const meshes = pavingSurfaces([way(587280816)]).map(
      (surface) => new THREE.Mesh(pavingGeometry(surface), material),
    );
    const ray = new THREE.Raycaster();
    for (const point of [
      [37.543447, 57.632085],
      [37.6, 57.7],
      [38, 57.8],
    ] as const) {
      const soil = terrain.heightAt(point);
      expect(soil).toBeCloseTo(elevation(...point), 1);
      ray.set(
        new THREE.Vector3(point[0], 100, point[1]),
        new THREE.Vector3(0, -1, 0),
      );
      const road = ray.intersectObjects(meshes, false)[0];
      expect(road, JSON.stringify(point)).toBeDefined();
      expect(road.point.y - soil).toBeGreaterThan(0.005);
    }
    meshes.forEach((mesh) => mesh.geometry.dispose());
    terrain.geometries.forEach((geometry) => geometry.dispose());
    material.dispose();
  });
  it('keeps Leopold, the rotunda branch and cathedral streets cobbled while preserving separate gravel park paths', () => {
    const roads = [
      4646722, 5016653, 587280816, 494921190, 494921191, 370193790, 494921186,
      163474148, 542561044,
    ].map(way);
    const surfaces = pavingSurfaces(roads);
    for (const road of roads) {
      expect(
        surfaces
          .filter((s) => s.feature.id === road.id)
          .every(
            (s) =>
              s.style.kind ===
              ([494921186, 163474148, 542561044].includes(road.id)
                ? 'gravel'
                : 'cobble'),
          ),
      ).toBe(true);
      expect(surfaces.some((s) => s.feature.id === road.id)).toBe(true);
    }
    const atCrossing = surfaces.filter((s) =>
      contains(s.polygons, [67.76, 121.12]),
    );
    expect(atCrossing).toHaveLength(1);
    expect(atCrossing[0].style.kind).toBe('cobble');
  });
  it('keeps restored streets uniformly cobbled without added contrasting sidewalk bands', () => {
    for (const id of [4646722, 587280816, 5016653, 494921190, 370193785]) {
      const feature = way(id);
      const surfaces = pavingSurfaces([feature]);
      expect(surfaces.length).toBeGreaterThan(0);
      expect(
        surfaces.every(
          (surface) =>
            surface.style.kind === 'cobble' &&
            surface.style.color === '#b2b5ae',
        ),
      ).toBe(true);
      for (const point of samplePolyline(feature.points, 3).slice(1, -1)) {
        expect(
          surfaces.some((surface) => contains(surface.polygons, point)),
          JSON.stringify({ id, point }),
        ).toBe(true);
      }
    }
  });
  it('keeps the rotunda street paved continuously above its replacement soil instead of leaving grass holes', () => {
    const material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
    const soil = new THREE.Mesh(
      groundPolygon(rotundaStreet.polygon, 0, elevation, [], true),
      material,
    );
    const paving = pavingSurfaces(
      paths.filter(
        (feature) =>
          feature.id === rotundaStreet.feature.id ||
          ((feature.tags.footway === 'sidewalk' ||
            [494921210, 494921219, 542667857].includes(feature.id)) &&
            feature.points.some(
              (point) => projectRoute(point, rotundaStreet.points).distance < 9,
            )),
      ),
    )
      .filter((surface) => surface.feature.id === rotundaStreet.feature.id)
      .map((surface) => new THREE.Mesh(pavingGeometry(surface), material));
    makeLeopoldInteriorSidewalks((_color, geometry, kind) => {
      const mesh = new THREE.Mesh(geometry, material);
      mesh.name = kind ?? '';
      paving.push(mesh);
    });
    try {
      for (const point of samplePolyline(rotundaStreet.points, 0.7).slice(
        1,
        -1,
      )) {
        const { normal } = projectRoute(point, rotundaStreet.points);
        for (const side of [-2, -1.5, 0, 1.5, 2]) {
          const x = point[0] + normal[0] * side,
            z = point[1] + normal[1] * side;
          const ray = new THREE.Raycaster(
            new THREE.Vector3(x, 70, z),
            new THREE.Vector3(0, -1, 0),
          );
          const road = ray.intersectObjects(paving)[0];
          const ground = ray.intersectObject(soil)[0];
          expect(road, JSON.stringify({ x, z, side })).toBeDefined();
          expect(ground).toBeDefined();
          expect(
            road.point.y - ground.point.y,
            JSON.stringify({ x, z, side }),
          ).toBeGreaterThan(0.01);
          expect(road.point.y - ground.point.y).toBeLessThan(0.1);
        }
      }
      for (const point of [
        [68.3082, 106.76358],
        [68.52926, 103.36625],
        [68.65567, 99.68444],
      ]) {
        const ray = new THREE.Raycaster(
          new THREE.Vector3(point[0], 70, point[1]),
          new THREE.Vector3(0, -1, 0),
        );
        const road = ray.intersectObjects(paving)[0];
        const ground = ray.intersectObject(soil)[0];
        expect(road, JSON.stringify(point)).toBeDefined();
        expect(ground).toBeDefined();
        expect(road.point.y - ground.point.y).toBeCloseTo(
          road.object.name ? 0.075 : 0.055,
          road.object.name ? 2 : 4,
        );
      }
    } finally {
      soil.geometry.dispose();
      paving.forEach((mesh) => mesh.geometry.dispose());
      material.dispose();
    }
  });
  it('fills the Charles IV plaza once instead of drawing a road around its perimeter over the crossing paths', () => {
    const statue: Point = [576.67, -496.15];
    const nearby = paths.filter(
      (feature) => projectRoute(statue, feature.points).distance < 22,
    );
    const plaza = way(1010695244);
    expect(plaza.tags.area).toBe('yes');
    expect(area(pavingFootprint(plaza))).toBeCloseTo(
      area([[plaza.points.map(([x, z]) => [x, z])]]),
      4,
    );
    const surfaces = pavingSurfaces(nearby);
    expect(surfaces.some((s) => s.feature.id === plaza.id)).toBe(true);
    let overlap = 0;
    for (let i = 0; i < surfaces.length; i++)
      for (let j = i + 1; j < surfaces.length; j++)
        overlap += area(
          polygonClipping.intersection(
            surfaces[i].polygons,
            surfaces[j].polygons,
          ),
        );
    expect(overlap).toBeLessThan(0.05);
  });

  it('gives intersecting park footpaths one owner without deleting their approaches', () => {
    const features = [
      163474146, 163474152, 483924012, 483924013, 483924014, 542547545,
    ].map(way);
    const surfaces = pavingSurfaces(features);
    expect(surfaces.every((surface) => surface.style.kind === 'gravel')).toBe(
      true,
    );
    let overlap = 0;
    for (let i = 0; i < surfaces.length; i++)
      for (let j = i + 1; j < surfaces.length; j++)
        overlap += area(
          polygonClipping.intersection(
            surfaces[i].polygons,
            surfaces[j].polygons,
          ),
        );
    expect(overlap).toBeLessThan(0.05);
    for (const feature of features) {
      const points = samplePolyline(feature.points, 5);
      expect(
        points.some((point) =>
          surfaces.some((surface) => contains(surface.polygons, point)),
        ),
      ).toBe(true);
    }
  });

  it('fills V Pevnosti across the retained roadbed without spreading paving onto the upper banks', () => {
    const feature = way(4646722);
    expect(Number(feature.tags.width)).toBe(11.5);
    const a = feature.points[5],
      b = feature.points[6];
    const middle: Point = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    const normal = projectRoute(middle, [a, b]).normal;
    const polygons = pavingFootprint(feature);
    expect(contains(polygons, middle)).toBe(true);
    expect(
      contains(polygons, [
        middle[0] + normal[0] * 4,
        middle[1] + normal[1] * 4,
      ]),
    ).toBe(true);
    expect(
      contains(polygons, [
        middle[0] + normal[0] * 8,
        middle[1] + normal[1] * 8,
      ]),
    ).toBe(false);
    expect(pathWidth(feature)).toBeLessThanOrEqual(5.2);
    for (const surface of pavingSurfaces([feature])) {
      const geometry = pavingGeometry(surface);
      expect(geometry.attributes.position.count).toBeGreaterThan(0);
      expect(steepTriangles(geometry)).toBe(0);
      geometry.dispose();
    }
  });

  it('keeps the uphill street-side path continuously gravel rather than cobbled fragments', () => {
    const feature = way(26454854);
    expect(pavingStyle(feature).kind).toBe('gravel');
    const surfaces = pavingSurfaces([feature]);
    const material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
    const meshes = surfaces.map(
      (surface) => new THREE.Mesh(pavingGeometry(surface), material),
    );
    for (const point of samplePolyline(feature.points, 1).slice(1, -1)) {
      const ray = new THREE.Raycaster(
        new THREE.Vector3(point[0], 80, point[1]),
        new THREE.Vector3(0, -1, 0),
      );
      const hit = ray.intersectObjects(meshes, false)[0];
      expect(hit, `missing uphill path at ${point}`).toBeDefined();
      expect(
        Math.abs(hit.point.y - featureElevation(feature, point) - 0.055),
      ).toBeLessThan(0.25);
    }
    meshes.forEach((mesh) => mesh.geometry.dispose());
    material.dispose();
  });

  it('stops upper-level paving at the ramparts but keeps lower hillside routes and real stairs', () => {
    const features = [
      351280742, 1303802776, 26694438, 26694442, 183917799, 183917810,
    ].map(way);
    let retained = 0;
    for (const surface of pavingSurfaces(features)) {
      const geometry = pavingGeometry(surface),
        p = geometry.attributes.position;
      retained += p.count;
      expect(steepTriangles(geometry)).toBe(0);
      for (let i = 0; i < p.count; i += 3) {
        const point: Point = [
          (p.getX(i) + p.getX(i + 1) + p.getX(i + 2)) / 3,
          (p.getZ(i) + p.getZ(i + 1) + p.getZ(i + 2)) / 3,
        ];
        const terrace = rampartTerrace(point);
        if (
          terrace &&
          featureElevation(surface.feature, point) > terrace.level - 1.3 &&
          !inside(point, courtBankBoundary)
        )
          expect(projectRoute(point, courtBankBoundary).distance).toBeLessThan(
            0.005,
          );
      }
      geometry.dispose();
    }
    expect(retained).toBeGreaterThan(0);
    expect(pavingFootprint(way(24376650)).length).toBeGreaterThan(0);
  });

  it('preserves the Karlachovy garden alignments and treats sand as a soft path rather than cobblestones', () => {
    for (const id of [24376653, 24376654, 24376655, 351536140, 351536142]) {
      const feature = way(id),
        polygons = pavingFootprint(feature);
      expect(pavingStyle(feature).kind).toBe('gravel');
      expect(pathWidth(feature)).toBe(2.7);
      for (const point of samplePolyline(feature.points, 5).slice(1, -1))
        expect(
          contains(polygons, point),
          `lost garden path ${id} at ${point}`,
        ).toBe(true);
    }
  });

  it('keeps separately mapped sidewalks narrow and does not pave through the Tabor stairwell', () => {
    expect(way(494921200).tags.footway).toBe('sidewalk');
    expect(pathWidth(way(494921200))).toBeLessThan(pathWidth(way(24376654)));
    const feature = way(494921219);
    const polygons = pavingFootprint(feature);
    expect(polygons.length).toBeGreaterThan(0);
    expect(
      area(
        polygonClipping.intersection(polygons, [
          [stairwellFootprint.map(([x, z]) => [x, z])],
        ]),
      ),
    ).toBeLessThan(0.001);
    expect(pavingStyle(feature).kind).toBe(pavingStyle(way(4646722)).kind);
    expect(pavingStyle(feature).color).toBe(pavingStyle(way(4646722)).color);
  });

  it('joins parallel street-side paving into the carriageway without grass seams or a mismatched mosaic stripe', () => {
    const streets = [
      4646722, 8885568, 587280816, 494921200, 494921219, 953013316, 1523801599,
      1523801601,
    ].map(way);
    const surfaces = pavingSurfaces(streets);
    const road = way(4646722);
    const sidewalk = way(494921200);
    let joined = 0;
    for (const point of samplePolyline(sidewalk.points, 5).slice(1, -1)) {
      const projection = projectRoute(point, road.points);
      if (projection.distance > 6 || projection.distance < 2.7) continue;
      if (projection.along === 0 || projection.along === projection.length)
        continue;
      const middle: Point = [
        (point[0] + projection.point[0]) / 2,
        (point[1] + projection.point[1]) / 2,
      ];
      if (
        Math.abs(
          featureElevation(road, point) -
            featureElevation(road, projection.point),
        ) > 0.3
      )
        continue;
      expect(
        surfaces.filter((s) => contains(s.polygons, middle)),
        `street gap at ${middle}`,
      ).toHaveLength(1);
      expect(surfaces.find((s) => contains(s.polygons, middle))?.style).toEqual(
        pavingStyle(road),
      );
      joined++;
    }
    expect(joined).toBeGreaterThan(5);
  });
});
