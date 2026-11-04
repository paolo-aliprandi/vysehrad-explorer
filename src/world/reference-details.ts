import * as THREE from 'three';
import {
  referenceSites,
  paths,
  walls,
  gateNodes,
  center,
  elevation,
  inside,
  projectRoute,
  retainedStreetWalls,
  wallProfile,
  wallThickness,
  retainedWallOffsets,
  riversideDoorways,
  cemeteryArcadeBays,
  cemeteryGate,
  sculptures,
  slavin,
  panoramaSites,
  type Point,
  type Feature,
} from './geo';
import type { AddGeometry } from './architecture';
import { drapedPolygon, samplePolyline } from './surfaces';

type Vertex = readonly [number, number, number];
type Kind = Parameters<AddGeometry>[2];

function localEmitter(
  point: Point,
  ground: number,
  angle: number,
  add: AddGeometry,
) {
  return (
    geometry: THREE.BufferGeometry,
    color: string,
    kind: Kind = 'stone',
  ) => {
    geometry.rotateY(angle).translate(point[0], ground, point[1]);
    add(color, geometry, kind);
  };
}

function pointed(width: number, height: number, bottom = 0) {
  const shape = new THREE.Shape();
  shape.moveTo(-width / 2, bottom);
  shape.lineTo(width / 2, bottom);
  shape.lineTo(width / 2, height - width * 0.65);
  shape.quadraticCurveTo(width / 2, height - width * 0.25, 0, height);
  shape.quadraticCurveTo(
    -width / 2,
    height - width * 0.25,
    -width / 2,
    height - width * 0.65,
  );
  shape.closePath();
  return shape;
}

function beam(a: Vertex, b: Vertex, radius: number) {
  const from = new THREE.Vector3(...a),
    to = new THREE.Vector3(...b);
  return new THREE.CylinderGeometry(radius, radius, from.distanceTo(to), 8)
    .applyQuaternion(
      new THREE.Quaternion().setFromUnitVectors(
        new THREE.Vector3(0, 1, 0),
        to.clone().sub(from).normalize(),
      ),
    )
    .translate(...from.add(to).multiplyScalar(0.5).toArray());
}

export function makeGardenReferences(add: AddGeometry) {
  const well = referenceSites.gardenWell;
  const wellGround = elevation(...well.point);
  const emit = localEmitter(well.point, wellGround, well.angle, add);
  const pad: Point[] = Array.from({ length: 49 }, (_, i) => [
    well.point[0] + Math.sin((i * Math.PI) / 24) * 2.15,
    well.point[1] + Math.cos((i * Math.PI) / 24) * 2.15,
  ]);
  add('#aaa694', drapedPolygon(pad, 0.09), 'cobble');
  for (let side = 0; side < 6; side++) {
    const angle = (side * Math.PI) / 3;
    const face = new THREE.Shape();
    face.moveTo(-0.65, -0.15);
    face.lineTo(0.65, -0.15);
    face.lineTo(0.65, 2.2);
    face.lineTo(0.42, 2.2);
    face.lineTo(0, 2.98);
    face.lineTo(-0.42, 2.2);
    face.lineTo(-0.65, 2.2);
    face.closePath();
    face.holes.push(new THREE.Path(pointed(0.18, 2.03, 1.33).getPoints(12)));
    emit(
      new THREE.ExtrudeGeometry(face, { depth: 0.16, bevelEnabled: false })
        .translate(0, 0, 0.94)
        .rotateY(angle),
      '#e4dfcd',
      'plaster',
    );
    emit(
      new THREE.ShapeGeometry(pointed(0.18, 2.03, 1.33), 12)
        .translate(0, 0, 0.92)
        .rotateY(angle),
      '#333a35',
    );
    for (const x of [-0.6, 0.6])
      emit(
        new THREE.BoxGeometry(0.1, 2.35, 0.22)
          .translate(x, 1.04, 1.01)
          .rotateY(angle),
        '#c9c4b4',
        'plaster',
      );
  }
  emit(
    new THREE.ConeGeometry(1.43, 1.95, 6)
      .rotateY(Math.PI / 6)
      .translate(0, 3.25, 0),
    '#98634d',
    'slate',
  );
  const fountain = referenceSites.gardenFountain;
  const fountainEmit = localEmitter(
    fountain.point,
    elevation(...fountain.point),
    0,
    add,
  );
  const profile = [
    [0, -0.12],
    [0.85, -0.12],
    [0.95, 0.06],
    [0.78, 0.16],
    [0.34, 0.3],
    [0.3, 0.8],
    [0.72, 0.88],
    [1.12, 1.02],
    [1.24, 1.16],
    [1.24, 1.23],
    [1.08, 1.25],
    [0.96, 1.1],
    [0.42, 1.02],
    [0, 1.02],
  ].map(([x, y]) => new THREE.Vector2(x, y));
  fountainEmit(new THREE.LatheGeometry(profile, 40), '#918d80');
  fountainEmit(
    new THREE.CylinderGeometry(0.18, 0.27, 0.5, 16).translate(0, 1.24, 0),
    '#8e897a',
  );
  fountainEmit(
    new THREE.CylinderGeometry(0.42, 0.34, 0.1, 24).translate(0, 1.52, 0),
    '#a29b88',
  );
  fountainEmit(
    new THREE.CylinderGeometry(0.88, 0.88, 0.015, 40).translate(0, 1.065, 0),
    '#627168',
    'glass',
  );
}

export function makeHiddenChurch(add: AddGeometry) {
  const site = referenceSites.hiddenChurch;
  const ground = elevation(...site.point);
  const emit = localEmitter(site.point, ground, site.angle, add);
  const front = new THREE.Shape();
  front.moveTo(-site.width / 2, -1.5);
  front.lineTo(site.width / 2, -1.5);
  front.lineTo(site.width / 2, site.height);
  front.lineTo(-site.width / 2, site.height);
  front.closePath();
  const windows = [-1.4, 1.35, 3.4];
  for (const x of windows) {
    const hole = new THREE.Path();
    hole.moveTo(x - 0.51, 2.95);
    hole.lineTo(x + 0.51, 2.95);
    hole.lineTo(x + 0.51, 4.35);
    hole.quadraticCurveTo(x, 4.6, x - 0.51, 4.35);
    hole.closePath();
    front.holes.push(hole);
  }
  emit(
    new THREE.ExtrudeGeometry(front, {
      depth: site.depth,
      bevelEnabled: false,
    }).translate(0, 0, -site.depth / 2),
    '#a47b63',
    'brick',
  );
  for (const x of windows) {
    emit(
      new THREE.BoxGeometry(1.02, 1.65, 0.04).translate(x, 3.7, 1.68),
      '#252d2b',
      'wood',
    );
    for (let bar = -2; bar <= 2; bar++)
      emit(
        new THREE.BoxGeometry(0.025, 1.54, 0.04).translate(
          x + bar * 0.19,
          3.72,
          1.98,
        ),
        '#4a4b41',
        'metal',
      );
    for (const y of [3.25, 3.78, 4.25])
      emit(
        new THREE.BoxGeometry(0.98, 0.025, 0.04).translate(x, y, 1.98),
        '#4a4b41',
        'metal',
      );
    emit(
      new THREE.BoxGeometry(1.15, 0.12, 0.34).translate(x, 2.92, 1.95),
      '#a59f89',
    );
  }
  emit(
    new THREE.BoxGeometry(site.width + 0.15, 0.22, site.depth + 0.2).translate(
      0,
      site.height + 0.02,
      0,
    ),
    '#9e9a87',
  );
  emit(
    new THREE.BoxGeometry(2.4, 4.2, 0.16).translate(-3.35, 1.9, 2.05),
    '#a8a390',
    'rubble',
  );
  emit(
    new THREE.BoxGeometry(1.2, 2.3, 0.08).translate(-3.4, 1.15, 2.15),
    '#71937d',
    'wood',
  );
  for (const x of [-3.68, -3.12])
    for (const y of [0.6, 1.65])
      emit(
        new THREE.BoxGeometry(0.44, 0.88, 0.035).translate(x, y, 2.2),
        '#62816d',
        'wood',
      );
}

export function makeStairCross(add: AddGeometry) {
  const site = referenceSites.stairCross;
  const emit = localEmitter(
    site.point,
    elevation(...site.point),
    site.angle,
    add,
  );
  for (const [width, height, y] of [
    [1.05, 0.2, 0],
    [0.82, 0.55, 0.35],
    [0.95, 0.15, 0.7],
  ])
    emit(
      new THREE.BoxGeometry(width, height, width).translate(0, y, 0),
      '#a29c87',
    );
  emit(
    new THREE.BoxGeometry(0.13, 3.8, 0.14).translate(0, 2.65, 0),
    '#4e594d',
    'metal',
  );
  emit(
    new THREE.BoxGeometry(1.65, 0.13, 0.14).translate(0, 3.7, 0),
    '#4e594d',
    'metal',
  );
  emit(
    new THREE.SphereGeometry(1, 16, 12)
      .scale(0.16, 0.2, 0.14)
      .translate(-0.06, 3.58, 0.15),
    '#c5b898',
  );
  emit(
    new THREE.SphereGeometry(1, 16, 12)
      .scale(0.21, 0.43, 0.14)
      .translate(0, 3.03, 0.15),
    '#c5b898',
  );
  for (const side of [-1, 1]) {
    emit(
      beam([side * 0.12, 3.3, 0.15], [side * 0.72, 3.66, 0.17], 0.065),
      '#c5b898',
    );
    emit(
      beam([side * 0.1, 2.7, 0.16], [side * 0.05, 1.95, 0.23], 0.08),
      '#c5b898',
    );
  }
  emit(
    new THREE.ConeGeometry(0.28, 0.48, 12)
      .scale(1, 1, 0.7)
      .translate(0, 2.65, 0.17),
    '#d2c7af',
  );
  emit(
    new THREE.TorusGeometry(0.22, 0.025, 6, 24).translate(0, 4.45, 0),
    '#b7a56f',
    'metal',
  );
}

export function makeReferenceBankIvy(add: AddGeometry) {
  for (const wall of retainedStreetWalls) {
    const samples = samplePolyline(wall.points, 1.2);
    for (let i = 1; i < samples.length; i++) {
      const a = samples[i - 1],
        b = samples[i];
      if (Math.hypot(a[0] + 45, a[1] + 45) > 31) continue;
      const projection = projectRoute(a, wall.points);
      const normal = projection.normal;
      const crestA = wallProfile(wall, a, normal).top;
      const crestB = wallProfile(wall, b, normal).top;
      const drop = 0.65 + 0.9 * (0.5 + 0.5 * Math.sin(i * 2.3));
      const vertices: number[] = [];
      for (const sign of [-1, 1]) {
        const offset = sign * 0.57;
        const p = [
          a[0] + normal[0] * offset,
          crestA - 0.08,
          a[1] + normal[1] * offset,
        ];
        const q = [
          b[0] + normal[0] * offset,
          crestB - 0.08,
          b[1] + normal[1] * offset,
        ];
        const r = [p[0], p[1] - drop, p[2]],
          s = [q[0], q[1] - drop * 0.8, q[2]];
        vertices.push(...p, ...r, ...q, ...q, ...r, ...s);
      }
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute(
        'position',
        new THREE.Float32BufferAttribute(vertices, 3),
      );
      geometry.computeVertexNormals();
      add(i % 3 ? '#354e37' : '#40593b', geometry, 'foliage');
    }
  }
  makeRoyalWallIvy(add);
}

function makeRoyalWallIvy(add: AddGeometry) {
  const rampart = walls.find((wall) => wall.id === 1532977610);
  if (!rampart) throw new Error('Missing royal-precinct rampart.');
  const samples = samplePolyline(rampart.points, 0.7);
  for (let i = 1; i < samples.length; i++) {
    const a = samples[i - 1],
      b = samples[i];
    if (
      Math.hypot(a[0] + 279, a[1] - 116) > 19 ||
      riversideDoorways.some(
        (door) => Math.hypot(a[0] - door.point[0], a[1] - door.point[1]) < 1.65,
      )
    )
      continue;
    const projection = projectRoute(a, rampart.points);
    const normal = projection.normal;
    const inward = inside([a[0] + normal[0], a[1] + normal[1]], rampart.points)
      ? 1
      : -1;
    const profile = wallProfile(rampart, a, normal);
    const offsets = retainedWallOffsets(a, wallThickness(rampart, a), profile);
    const offset = (offsets.inset + wallThickness(rampart, a) + 0.08) * inward;
    const crest = Math.min(profile.top, wallProfile(rampart, b, normal).top);
    const bottom = Math.max(
      elevation(...a) + 0.25 + 0.45 * Math.sin(i * 1.7),
      crest - 2.8,
    );
    if (bottom >= crest) continue;
    const emit = localEmitter(
      [
        (a[0] + b[0]) / 2 + normal[0] * offset,
        (a[1] + b[1]) / 2 + normal[1] * offset,
      ],
      bottom,
      -Math.atan2(b[1] - a[1], b[0] - a[0]),
      add,
    );
    emit(
      new THREE.BoxGeometry(0.76, crest - bottom + 0.13, 0.15).translate(
        0,
        (crest - bottom) / 2,
        0,
      ),
      i % 3 ? '#354b36' : '#40593c',
      'foliage',
    );
    for (const y of [0.2, 0.65, 1]) {
      const height = (crest - bottom) * y;
      emit(
        new THREE.SphereGeometry(1, 7, 5)
          .scale(0.4, 0.25, 0.23)
          .translate(0, height, 0),
        i % 2 ? '#3d573b' : '#314c35',
        'foliage',
      );
    }
  }
}

export function makeProvostFrontage(
  feature: Feature,
  ground: number,
  add: AddGeometry,
) {
  const point: Point = [-208.75, -93.1],
    angle = 1.52;
  const emit = localEmitter(
    point,
    Math.min(ground, elevation(...point)),
    angle,
    add,
  );
  const doorway = pointed(2.2, 3.3);
  emit(
    new THREE.BoxGeometry(2.6, 0.15, 1.3).translate(0, -0.06, 0.5),
    '#b9ad91',
  );
  emit(
    new THREE.ShapeGeometry(doorway, 28).translate(0, 0, 0.14),
    '#3e3430',
    'wood',
  );
  const surround = pointed(2.75, 3.68, -0.05);
  surround.holes.push(new THREE.Path(doorway.getPoints(28)));
  emit(
    new THREE.ExtrudeGeometry(surround, {
      depth: 0.25,
      bevelEnabled: false,
    }).translate(0, 0, 0.06),
    '#c4b795',
  );
  for (const side of [-1, 1])
    for (const y of [0.6, 1.75])
      emit(
        new THREE.BoxGeometry(0.72, 0.9, 0.07).translate(side * 0.53, y, 0.22),
        '#67453e',
        'wood',
      );
  for (const [width, y, depth] of [
    [2.3, 3.5, 0.7],
    [2.8, 3.8, 0.9],
    [3.3, 4.12, 1.2],
  ])
    emit(
      new THREE.BoxGeometry(width, 0.28, depth).translate(0, y, depth / 2),
      '#c3b594',
    );
  const bay = new THREE.CylinderGeometry(1.6, 1.6, 3.7, 6);
  bay.rotateY(Math.PI / 6).translate(0, 6.05, 0.38);
  emit(bay, '#cebf9e', 'plaster');
  for (const turn of [-Math.PI / 3, 0, Math.PI / 3]) {
    const window = pointed(0.92, 3, 0.3);
    const geometry = new THREE.ShapeGeometry(window, 24)
      .translate(0, 4.55, 1.79)
      .rotateY(turn);
    emit(geometry, '#65595b', 'glass');
    const frame = pointed(1.13, 3.18, 0.22);
    frame.holes.push(new THREE.Path(window.getPoints(24)));
    emit(
      new THREE.ExtrudeGeometry(frame, { depth: 0.1, bevelEnabled: false })
        .translate(0, 4.55, 1.8)
        .rotateY(turn),
      '#b4a381',
    );
    for (const x of [-0.23, 0, 0.23])
      emit(
        new THREE.BoxGeometry(0.025, 2.23, 0.035)
          .translate(x, 6.02, 1.84)
          .rotateY(turn),
        '#d4ccb7',
        'metal',
      );
    for (const y of [5.3, 6.1, 6.9]) {
      emit(
        new THREE.BoxGeometry(0.88, 0.025, 0.035)
          .translate(0, y, 1.84)
          .rotateY(turn),
        '#d4ccb7',
        'metal',
      );
      emit(
        new THREE.TorusGeometry(0.12, 0.018, 5, 16)
          .translate(0, y + 0.23, 1.84)
          .rotateY(turn),
        '#ded6c0',
        'metal',
      );
    }
  }
  emit(
    new THREE.ConeGeometry(1.85, 2, 6)
      .rotateY(Math.PI / 6)
      .translate(0, 8.82, 0.38),
    '#646f67',
    'slate',
  );
  for (const side of [-1, 1])
    emit(beam([side * 1.9, 7.7, 0.18], [0, 10.1, 0.18], 0.13), '#c4b99e');
  const buildingCenter = center(feature.points);
  if (
    Math.hypot(buildingCenter[0] - point[0], buildingCenter[1] - point[1]) > 25
  )
    throw new Error('The New Provost frontage no longer matches its building.');
}

export function makeCanonGables(
  feature: Feature,
  ground: number,
  wallHeight: number,
  add: AddGeometry,
) {
  const road = paths.find((path) => path.id === 587280816);
  if (!road)
    throw new Error('Missing cathedral approach for the chapter façades.');
  const target = projectRoute(center(feature.points), road.points).point;
  const face = feature.points
    .slice(1)
    .map((b, i) => {
      const a = feature.points[i],
        width = Math.hypot(b[0] - a[0], b[1] - a[1]);
      return {
        point: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2] as Point,
        a,
        b,
        width,
      };
    })
    .filter((face) => face.width > 5)
    .sort(
      (a, b) =>
        Math.hypot(a.point[0] - target[0], a.point[1] - target[1]) -
        Math.hypot(b.point[0] - target[0], b.point[1] - target[1]),
    )[0];
  if (!face) throw new Error('Missing chapter gable frontage.');
  const angle = -Math.atan2(face.b[1] - face.a[1], face.b[0] - face.a[0]);
  const emit = localEmitter(face.point, ground, angle, add);
  const half = Math.min(7, face.width / 2);
  const outline = new THREE.Shape();
  outline.moveTo(-half, wallHeight - 0.1);
  for (let step = -3; step <= 3; step++) {
    const x = (step * half) / 3;
    const rise = 0.35 + (3 - Math.abs(step)) * 0.7;
    outline.lineTo(Math.max(-half, x - half / 6), wallHeight + rise);
    outline.lineTo(Math.min(half, x + half / 6), wallHeight + rise);
  }
  outline.lineTo(half, wallHeight - 0.1);
  outline.closePath();
  emit(
    new THREE.ExtrudeGeometry(outline, {
      depth: 0.22,
      bevelEnabled: false,
    }).translate(0, 0, -0.11),
    '#dbd3bc',
    'plaster',
  );
  for (const x of [-half * 0.68, -half * 0.34, 0, half * 0.34, half * 0.68]) {
    const y = wallHeight + 0.8 + (1 - Math.abs(x) / half) * 1.15;
    emit(
      new THREE.BoxGeometry(0.12, 0.58, 0.06).translate(x, y, -0.16),
      '#68675c',
    );
    emit(
      new THREE.BoxGeometry(0.12, 0.58, 0.06).translate(x, y, 0.16),
      '#68675c',
    );
  }
  emit(
    new THREE.BoxGeometry(0.8, 1, 0.08).translate(0, wallHeight + 0.7, 0.17),
    '#9a7660',
  );
}

export function arcadeInterior(bay: (typeof cemeteryArcadeBays)[number]) {
  let normal: Point = [-bay.axis[1], bay.axis[0]];
  if (
    !inside(
      [bay.center[0] + normal[0] * 0.6, bay.center[1] + normal[1] * 0.6],
      bay.feature.points,
    )
  )
    normal = [-normal[0], -normal[1]];
  let depth = 0.6;
  while (
    depth < 5 &&
    inside(
      [
        bay.center[0] + normal[0] * (depth + 0.1),
        bay.center[1] + normal[1] * (depth + 0.1),
      ],
      bay.feature.points,
    )
  )
    depth += 0.1;
  return {
    normal,
    depth,
    at: (u: number, v: number): Point => [
      bay.center[0] + bay.axis[0] * u + normal[0] * v,
      bay.center[1] + bay.axis[1] * u + normal[1] * v,
    ],
  };
}

export function makeArcadeVault(
  bay: (typeof cemeteryArcadeBays)[number],
  ground: number,
  add: AddGeometry,
) {
  const { normal, depth, at } = arcadeInterior(bay);
  const radius = (bay.width - 0.42) / 2;
  if (radius < 0.4) return;
  const rise = Math.min(1.5, radius);
  const point = (u: number, v: number): Vertex => {
    const [x, z] = at(u * radius, ((v + 1) * depth) / 2);
    return [
      x,
      ground +
        2.25 +
        rise *
          Math.max(
            Math.sqrt(Math.max(0, 1 - u * u)),
            Math.sqrt(Math.max(0, 1 - v * v)),
          ),
      z,
    ];
  };
  const vertices: number[] = [];
  const uvs: number[] = [];
  for (let row = 0; row < 12; row++)
    for (let col = 0; col < 16; col++) {
      const a = point(col / 8 - 1, row / 6 - 1),
        b = point((col + 1) / 8 - 1, row / 6 - 1),
        c = point(col / 8 - 1, (row + 1) / 6 - 1),
        d = point((col + 1) / 8 - 1, (row + 1) / 6 - 1);
      if (bay.axis[0] * normal[1] - bay.axis[1] * normal[0] > 0) {
        vertices.push(...a, ...b, ...c, ...c, ...b, ...d);
      } else {
        vertices.push(...a, ...c, ...b, ...c, ...d, ...b);
      }
      const u = col / 16,
        v = row / 12;
      if (bay.axis[0] * normal[1] - bay.axis[1] * normal[0] > 0)
        uvs.push(
          u,
          v,
          u + 1 / 16,
          v,
          u,
          v + 1 / 12,
          u,
          v + 1 / 12,
          u + 1 / 16,
          v,
          u + 1 / 16,
          v + 1 / 12,
        );
      else
        uvs.push(
          u,
          v,
          u,
          v + 1 / 12,
          u + 1 / 16,
          v,
          u,
          v + 1 / 12,
          u + 1 / 16,
          v + 1 / 12,
          u + 1 / 16,
          v,
        );
    }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(vertices, 3),
  );
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.computeVertexNormals();
  add('#e8dbc1', geometry, 'fresco');
  for (const direction of [-1, 1]) {
    const curve = new THREE.CatmullRomCurve3(
      Array.from({ length: 25 }, (_, i) => {
        const t = i / 12 - 1;
        const p = point(t, direction * t);
        return new THREE.Vector3(p[0], p[1] - 0.025, p[2]);
      }),
    );
    add('#b39170', new THREE.TubeGeometry(curve, 32, 0.035, 5, false));
  }
  const back = at(0, depth - 0.35);
  const angle = Math.atan2(-normal[0], -normal[1]);
  const emit = localEmitter(back, ground, angle, add);
  const width = Math.min(1.3, bay.width - 0.6);
  emit(
    new THREE.BoxGeometry(width + 0.22, 2.3, 0.2).translate(0, 1.25, 0),
    '#bdb29c',
  );
  emit(
    new THREE.BoxGeometry(width, 2.02, 0.04).translate(0, 1.23, 0.12),
    '#46504b',
    'metal',
  );
  for (let row = 0; row < 7; row++)
    emit(
      new THREE.BoxGeometry(
        width * (row % 2 ? 0.65 : 0.78),
        0.018,
        0.025,
      ).translate(0, 1.95 - row * 0.22, 0.15),
      '#b6ab8b',
      'metal',
    );
}

type Inscription = {
  point: Point;
  ground: number;
  angle: number;
  width: number;
  height: number;
  lines: string[];
  background: string;
  ink: string;
};

function wallPlaque(
  point: Point,
  width: number,
  height: number,
  lines: string[],
): Inscription {
  const wall = walls.find((wall) => wall.id === 1532977610);
  if (!wall)
    throw new Error('Missing rampart for the photographed inscriptions.');
  const lookout = panoramaSites.find(
    (site) =>
      !site.sheltered &&
      Math.hypot(point[0] - site.point[0], point[1] - site.point[1]) < 6,
  );
  const projected = projectRoute(
    lookout ? lookout.at(lookout.width / 2 + 0.8) : point,
    wall.points,
  );
  const normal = inside(
    [
      projected.point[0] + projected.normal[0],
      projected.point[1] + projected.normal[1],
    ],
    wall.points,
  )
    ? projected.normal
    : [-projected.normal[0], -projected.normal[1]];
  const profile = wallProfile(wall, projected.point, projected.normal);
  const thickness = wallThickness(wall, projected.point);
  const offset =
    thickness +
    retainedWallOffsets(projected.point, thickness, profile).inset +
    0.06;
  return {
    point: [
      projected.point[0] + normal[0] * offset,
      projected.point[1] + normal[1] * offset,
    ],
    ground: elevation(...point) + 1.6,
    angle: Math.atan2(normal[0], normal[1]),
    width,
    height,
    lines,
    background: '#b7ab8e',
    ink: '#4b4a3e',
  };
}

export function referenceInscriptions(): Inscription[] {
  const plaques = [
    wallPlaque([-267, -90], 0.9, 1.25, [
      'NOTARSKA SKOLA',
      'PRI VYSEHRADSKE KAPITULE',
      '1270',
      'JINDRICH Z ISERNIE',
    ]),
    wallPlaque([-260, -24], 0.55, 0.95, [
      'SOCHA SV. SEBESTIANA',
      'OCHRANCE PROTI MORU',
      'VYSEHRAD',
    ]),
  ];
  const entry = gateNodes.find(
    (point) => Math.hypot(point[0] + 214, point[1] + 8) < 3,
  );
  if (!entry) throw new Error('Missing cathedral-side cemetery entrance.');
  plaques.push({
    point: entry,
    ground: elevation(...entry) + 3.35,
    angle: Math.PI,
    width: 2.25,
    height: 0.38,
    lines: ['PAX VOBIS'],
    background: '#41473e',
    ink: '#d1c5a5',
  });
  const bust = sculptures.find((sculpture) => sculpture.id === 1751591206);
  if (!bust) throw new Error('Missing Štulc memorial.');
  plaques.push({
    point: [
      bust.point[0] + Math.sin(bust.angle) * 1.23,
      bust.point[1] + Math.cos(bust.angle) * 1.23,
    ],
    ground: elevation(...bust.point) + 1.2,
    angle: bust.angle,
    width: 1.7,
    height: 0.55,
    lines: ['VACLAV STULC', 'PROBOST VYSEHRADSKY'],
    background: '#97745d',
    ink: '#6b5647',
  });
  for (const [offset, lines] of [
    [
      -1.4,
      [
        'JOSEF KRAL',
        'RUZENA SVOBODOVA',
        'JAN V. NOVAK',
        'JAN KLECANDA',
        'JOSEF V. MYSLBEK',
      ],
    ],
    [
      0,
      [
        'JULIUS ZEYER',
        'VACLAV V. TOMEK',
        'JOSEF LAD. PIC',
        'JOSEF V. SLADEK',
        'JAROSLAV VRCHLICKY',
      ],
    ],
    [
      1.4,
      [
        'JAN STURSA',
        'JOSEF GRUBER',
        'VOJTECH HYNAIS',
        'EMA DESTINNOVA',
        'KAMIL HILBERT',
      ],
    ],
  ] as const)
    plaques.push({
      point: [
        slavin.point[0] +
          Math.cos(slavin.angle) * offset +
          Math.sin(slavin.angle) * 1.18,
        slavin.point[1] -
          Math.sin(slavin.angle) * offset +
          Math.cos(slavin.angle) * 1.18,
      ],
      ground: elevation(...slavin.point) + 3.55,
      angle: slavin.angle,
      width: 1.05,
      height: 2.2,
      lines: [...lines],
      background: '#3d453f',
      ink: '#c4b17e',
    });
  return plaques;
}

export function makeInscription(plaque: Inscription, unlit = false) {
  const canvas = document.createElement('canvas');
  canvas.width = 768;
  canvas.height = Math.max(
    128,
    Math.round((768 * plaque.height) / plaque.width),
  );
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Could not render the reference inscriptions.');
  context.fillStyle = plaque.background;
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.strokeStyle = plaque.ink;
  context.lineWidth = 3;
  context.strokeRect(14, 14, canvas.width - 28, canvas.height - 28);
  context.fillStyle = plaque.ink;
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  const lineHeight = (canvas.height - 40) / plaque.lines.length;
  const fontSize = Math.min(lineHeight * 0.4, canvas.width / 17);
  context.font = `${fontSize}px Georgia, serif`;
  plaque.lines.forEach((line, i) =>
    context.fillText(
      line,
      canvas.width / 2,
      20 + lineHeight * (i + 0.5),
      canvas.width - 55,
    ),
  );
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(plaque.width, plaque.height),
    unlit
      ? new THREE.MeshBasicMaterial({ map: texture, side: THREE.DoubleSide })
      : new THREE.MeshStandardMaterial({
          map: texture,
          roughness: 0.95,
          side: THREE.DoubleSide,
        }),
  );
  mesh.rotation.y = plaque.angle;
  mesh.position.set(plaque.point[0], plaque.ground, plaque.point[1]);
  return { mesh, texture };
}

export function makeReferenceLabels() {
  const group = new THREE.Group();
  group.name = 'Reference inscriptions';
  const textures: THREE.CanvasTexture[] = [];
  for (const plaque of referenceInscriptions()) {
    const { mesh, texture } = makeInscription(plaque);
    textures.push(texture);
    group.add(mesh);
  }
  return {
    group,
    dispose: () => textures.forEach((texture) => texture.dispose()),
  };
}

export function makeCemeteryEntranceDetails(add: AddGeometry) {
  const entry = gateNodes.find(
    (point) => Math.hypot(point[0] + 214, point[1] + 8) < 3,
  );
  if (!entry) throw new Error('Missing cathedral-side cemetery entrance.');
  const ground = elevation(...entry);
  const emit = localEmitter(entry, ground, Math.PI, add);
  for (const side of [-1, 1]) {
    for (const [width, height, y] of [
      [0.56, 2.9, 1.3],
      [0.72, 0.18, 2.84],
      [0.65, 0.15, 0],
    ])
      emit(
        new THREE.BoxGeometry(width, height, width).translate(
          side * 1.75,
          y,
          0,
        ),
        '#b5b09a',
      );
    for (let bar = 0; bar < 8; bar++) {
      emit(
        new THREE.BoxGeometry(0.035, 2.3, 0.035).translate(
          side * 1.5,
          1.25,
          bar * -0.18,
        ),
        '#41483e',
        'metal',
      );
    }
    for (const y of [0.28, 1.1, 2.28])
      emit(
        new THREE.BoxGeometry(0.05, 0.05, 1.38).translate(side * 1.5, y, -0.63),
        '#41483e',
        'metal',
      );
    emit(
      new THREE.TorusGeometry(0.25, 0.025, 6, 24)
        .rotateY(Math.PI / 2)
        .translate(side * 1.5, 1.5, -0.66),
      '#a89868',
      'metal',
    );
  }
  emit(beam([-1.75, 2.95, 0], [0, 3.52, 0], 0.035), '#41483e', 'metal');
  emit(beam([1.75, 2.95, 0], [0, 3.52, 0], 0.035), '#41483e', 'metal');
  const mosaic = (point: Point, width: number, depth: number) => {
    const pad: Point[] = [
      [-1, -1],
      [1, -1],
      [1, 1],
      [-1, 1],
      [-1, -1],
    ].map(([x, z]) => [point[0] + (x * width) / 2, point[1] + (z * depth) / 2]);
    add('#ddd6bd', drapedPolygon(pad, 0.095), 'mosaic');
    const ring = Array.from(
      { length: 65 },
      (_, i): Point => [
        point[0] + Math.sin((i * Math.PI) / 32) * 0.8,
        point[1] + Math.cos((i * Math.PI) / 32) * 0.8,
      ],
    );
    const shape = new THREE.Shape(
      ring.map(([x, z]) => new THREE.Vector2(x, -z)),
    );
    shape.holes.push(
      new THREE.Path(
        Array.from(
          { length: 65 },
          (_, i) =>
            new THREE.Vector2(
              point[0] + Math.sin((i * Math.PI) / 32) * 0.69,
              -point[1] - Math.cos((i * Math.PI) / 32) * 0.69,
            ),
        ),
      ),
    );
    const geometry = new THREE.ShapeGeometry(shape);
    geometry.rotateX(-Math.PI / 2).translate(0, elevation(...point) + 0.13, 0);
    add('#414b43', geometry, 'stone');
  };
  mosaic([entry[0], entry[1] + 1], 3.3, 2.5);
  mosaic([-206.95, -53.1], 2.7, 3.5);
  const { center: exit, axis } = cemeteryGate;
  const point: Point = [exit[0] - axis[1] * 1.9, exit[1] + axis[0] * 1.9];
  mosaic(point, 2.8, 2.8);
}

export function makeReferenceDetails(add: AddGeometry) {
  makeGardenReferences(add);
  makeHiddenChurch(add);
  makeStairCross(add);
  makeReferenceBankIvy(add);
  makeCemeteryEntranceDetails(add);
  for (const plaque of referenceInscriptions().slice(0, 2))
    localEmitter(
      plaque.point,
      plaque.ground,
      plaque.angle,
      add,
    )(
      new THREE.BoxGeometry(
        plaque.width + 0.08,
        plaque.height + 0.08,
        0.08,
      ).translate(0, 0, -0.055),
      plaque.background,
    );
}
