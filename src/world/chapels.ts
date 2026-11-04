import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import {
  buildings,
  center,
  foundation,
  elevation,
  safePosition,
  aveMariaPoint,
  type Point,
} from './geo';
import type { AddGeometry } from './architecture';
import { worldUVs, type Materials } from './materials';
import { drapedPolygon } from './surfaces';
import { casemateVault } from './casemates';

export type ChapelKind = 'rotunda' | 'lawrence' | 'john';
function building(id: number) {
  const feature = buildings.find((item) => item.id === id);
  if (!feature) throw new Error(`Missing church footprint ${id}.`);
  return feature;
}
const lawrence = building(49810588);
const a = lawrence.points[1],
  b = lawrence.points[2];
const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
const outward: Point = [(b[1] - a[1]) / length, -(b[0] - a[0]) / length];
const door: Point = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
export const chapelSites = {
  rotunda: {
    feature: building(560209917),
    approach: [76.82, 100.72] as Point,
    title: 'Rotunda of St. Martin',
    spawn: [0, 2.7] as Point,
    exit: [0, 3.8] as Point,
  },
  lawrence: {
    feature: lawrence,
    approach: safePosition([
      door[0] + outward[0] * 2.1,
      door[1] + outward[1] * 2.1,
    ]),
    title: 'Basilica of St. Lawrence',
    spawn: [0, 7.6] as Point,
    exit: [0, 8.8] as Point,
  },
  john: {
    approach: aveMariaPoint(-3.2, -10.2),
    title: 'Church of St. John the Baptist',
    spawn: [0, 4] as Point,
    exit: [0, 5.2] as Point,
  },
};

function arch(width: number, height: number) {
  const shape = new THREE.Shape();
  shape.moveTo(-width / 2, 0);
  shape.lineTo(width / 2, 0);
  shape.lineTo(width / 2, height - width / 2);
  shape.absarc(0, height - width / 2, width / 2, 0, Math.PI, false);
  shape.closePath();
  return shape;
}

export function makeLawrenceRuins(add: AddGeometry) {
  add(
    '#a99b80',
    new THREE.BoxGeometry(9.2, 0.1, 19.2).translate(0, -0.05, 0),
    'gravel',
  );
  for (const x of [-3.65, 3.65])
    add(
      '#9e9683',
      new THREE.BoxGeometry(0.65, 0.55, 13.5).translate(x, 0.275, -0.6),
      'stone',
    );
  for (const x of [-2.2, 2.2])
    for (const z of [-5, -1.8, 1.4, 4.6]) {
      add(
        '#b3aa95',
        new THREE.CylinderGeometry(0.4, 0.5, 0.35, 12).translate(x, 0.175, z),
        'stone',
      );
      add(
        '#a69b84',
        new THREE.CylinderGeometry(
          0.28,
          0.31,
          z === -1.8 ? 0.65 : 0.25,
          12,
        ).translate(x, z === -1.8 ? 0.65 : 0.45, z),
        'stone',
      );
    }
  for (const [x, radius] of [
    [0, 2.1],
    [-2.8, 0.95],
    [2.8, 0.95],
  ]) {
    const shape = new THREE.Shape();
    shape.absarc(x, -6.1, radius + 0.4, Math.PI, Math.PI * 2, false);
    shape.absarc(x, -6.1, radius, Math.PI * 2, Math.PI, true);
    shape.closePath();
    const wall = new THREE.ExtrudeGeometry(shape, {
      depth: 0.65,
      bevelEnabled: false,
      curveSegments: 28,
    });
    wall.rotateX(Math.PI / 2);
    wall.translate(0, 0.65, 0);
    add('#a49a85', wall, 'stone');
  }
  const palette = ['#a96943', '#b57b4e', '#c39861', '#995a3d'];
  for (let row = 0; row < 24; row++)
    for (let col = 0; col < 9; col++) {
      if ((row * 17 + col * 11) % 31 < 3) continue;
      const x = (col - 4) * 0.36 + (row % 2) * 0.18,
        z = (row - 11.5) * 0.312;
      add(
        palette[(row + col) % palette.length],
        new THREE.CylinderGeometry(0.202, 0.202, 0.035, 6).translate(
          x,
          0.024,
          z,
        ),
        'terracotta',
      );
      if ((row + col) % 3 === 0) {
        add(
          '#704b34',
          new THREE.TorusGeometry(0.115, 0.008, 3, 12)
            .rotateX(-Math.PI / 2)
            .translate(x, 0.045, z),
          'terracotta',
        );
        for (const side of [-1, 1])
          add(
            '#d1a878',
            new THREE.BoxGeometry(0.032, 0.009, 0.15)
              .rotateY(side * 0.45)
              .translate(x + side * 0.025, 0.048, z),
            'terracotta',
          );
      }
    }
}

export function makeLawrenceExterior(add: AddGeometry) {
  const feature = chapelSites.lawrence.feature,
    ground = foundation(feature);
  const tangent: Point = [-outward[1], outward[0]];
  const roof = new THREE.Shape(
    feature.points.map(([x, z]) => new THREE.Vector2(x, -z)),
  );
  add(
    '#a49f91',
    new THREE.ExtrudeGeometry(roof, {
      depth: 0.18,
      bevelEnabled: false,
    })
      .rotateX(-Math.PI / 2)
      .translate(0, ground + 2.7, 0),
    'plaster',
  );
  const apron: Point[] = [
    [-1.05, 0.02],
    [1.05, 0.02],
    [1.05, 2.8],
    [-1.05, 2.8],
    [-1.05, 0.02],
  ].map(([u, v]) => [
    door[0] + tangent[0] * u + outward[0] * v,
    door[1] + tangent[1] * u + outward[1] * v,
  ]);
  add('#aaa38f', drapedPolygon(apron, 0.04, elevation), 'stone');
  for (let i = 0; i < feature.points.length - 1; i++) {
    const p = feature.points[i],
      q = feature.points[i + 1];
    const width = Math.hypot(q[0] - p[0], q[1] - p[1]);
    const height = 2.7;
    const shape = new THREE.Shape();
    shape.moveTo(-width / 2, -0.25);
    shape.lineTo(width / 2, -0.25);
    shape.lineTo(width / 2, height);
    shape.lineTo(-width / 2, height);
    shape.closePath();
    if (i === 1)
      shape.holes.push(new THREE.Path(arch(1.65, 2.3).getPoints(28)));
    const position = (geometry: THREE.BufferGeometry) =>
      geometry
        .rotateY(-Math.atan2(q[1] - p[1], q[0] - p[0]))
        .translate((p[0] + q[0]) / 2, ground, (p[1] + q[1]) / 2);
    add(
      '#9b9686',
      position(
        new THREE.ExtrudeGeometry(shape, { depth: 0.48, bevelEnabled: false }),
      ),
      'rubble',
    );
    add(
      '#a76d4b',
      position(
        new THREE.BoxGeometry(width + 0.08, 0.09, 0.64).translate(
          0,
          height + 0.035,
          0.2,
        ),
      ),
      'slate',
    );
    const tiles = Math.ceil(width / 0.28);
    for (let tile = 0; tile < tiles; tile++)
      add(
        '#aa7252',
        position(
          new THREE.CylinderGeometry(
            0.2,
            0.2,
            width / tiles + 0.025,
            8,
            1,
            true,
            0,
            Math.PI,
          )
            .rotateZ(Math.PI / 2)
            .translate(
              -width / 2 + ((tile + 0.5) * width) / tiles,
              height + 0.06,
              0.2,
            ),
        ),
        'slate',
      );
    if (i === 1) {
      const surround = arch(2.12, 2.58);
      surround.holes.push(new THREE.Path(arch(1.65, 2.3).getPoints(28)));
      add(
        '#8e8777',
        position(
          new THREE.ExtrudeGeometry(surround, {
            depth: 0.13,
            bevelEnabled: false,
          }).translate(0, 0, -0.06),
        ),
        'stone',
      );
      add(
        '#3c362d',
        position(
          new THREE.ExtrudeGeometry(arch(1.6, 2.26), {
            depth: 0.06,
            bevelEnabled: false,
          }).translate(0, 0.015, 0.2),
        ),
        'wood',
      );
      for (const y of [0.55, 1.5])
        add(
          '#393c35',
          position(
            new THREE.BoxGeometry(1.4, 0.055, 0.07).translate(0, y, 0.16),
          ),
          'metal',
        );
    }
  }
  const midpoint = center(feature.points.slice(0, -1));
  const angle = Math.atan2(outward[0], outward[1]);
  makeLawrenceRuins((color, geometry, kind) =>
    add(
      color,
      geometry
        .rotateY(angle)
        .translate(midpoint[0], ground + 0.02, midpoint[1]),
      kind,
    ),
  );
}

export function chapelBlocked(kind: ChapelKind, [x, z]: Point) {
  if (kind === 'john')
    return (
      !Number.isFinite(x) ||
      !Number.isFinite(z) ||
      Math.abs(x) > 3.65 ||
      Math.abs(z) > 5.65 ||
      (Math.abs(x) < 1.4 && z < -3.8) ||
      (Math.abs(Math.abs(x) - 2.45) < 0.65 && z > -1.7 && z < 2.4)
    );
  if (kind === 'rotunda')
    return (
      !(Math.hypot(x, z) < 3.65 || Math.hypot(x, z + 4.1) < 1.85) ||
      (z < -4.7 && Math.abs(x) < 1.1) ||
      (Math.abs(Math.abs(x) - 2.65) < 0.6 &&
        [-1.6, 0.2, 1.9].some((row) => Math.abs(z - row) < 0.7))
    );
  return (
    Math.abs(x) > 4.15 ||
    Math.abs(z) > 9.05 ||
    (Math.abs(x) > 3.1 && Math.abs(x) < 4.1 && z > -7.7 && z < 6.5) ||
    [-2.2, 2.2].some((column) =>
      [-5, -1.8, 1.4, 4.6].some(
        (row) => Math.hypot(x - column, z - row) < 0.55,
      ),
    ) ||
    (z < -6.1 && Math.abs(x) < 2.5 && Math.hypot(x, z + 6.1) > 1.8)
  );
}

export function makeChapelInterior(
  kind: ChapelKind,
  materials: Pick<Materials, 'get'>,
) {
  const group = new THREE.Group();
  group.name = `${chapelSites[kind].title} interior`;
  const blockers: THREE.Object3D[] = [];
  const batches = new Map<
    string,
    {
      color: string;
      kind: Parameters<AddGeometry>[2];
      geometries: THREE.BufferGeometry[];
    }
  >();
  const add: AddGeometry = (color, geometry, materialKind = 'stone') => {
    const key = `${color}:${materialKind}`;
    const batch = batches.get(key) ?? {
      color,
      kind: materialKind,
      geometries: [],
    };
    batch.geometries.push(geometry.index ? geometry.toNonIndexed() : geometry);
    if (geometry.index) geometry.dispose();
    batches.set(key, batch);
  };
  if (kind === 'john') {
    add(
      '#b7ae97',
      new THREE.BoxGeometry(8, 0.2, 12).translate(0, -0.1, 0),
      'stone',
    );
    for (const x of [-4, 4])
      add(
        '#c2b79f',
        new THREE.BoxGeometry(0.35, 2.8, 12).translate(x, 1.4, 0),
        'rubble',
      );
    for (const z of [-6, 6])
      add(
        '#c2b79f',
        new THREE.BoxGeometry(8.35, 4.65, 0.35).translate(0, 2.325, z),
        'rubble',
      );
    add('#d2c7af', casemateVault(8, 12, 2.8, 1.8), 'plaster');
    add(
      '#aaa18b',
      new THREE.BoxGeometry(2.4, 0.2, 1.8).translate(0, 0.1, -4.7),
      'stone',
    );
    add(
      '#b2a68c',
      new THREE.BoxGeometry(1.7, 0.95, 0.8).translate(0, 0.675, -4.7),
      'stone',
    );
    add(
      '#e0d3b6',
      new THREE.BoxGeometry(2.05, 0.15, 1).translate(0, 1.225, -4.7),
      'stone',
    );
    add(
      '#766040',
      new THREE.BoxGeometry(0.1, 1.5, 0.1).translate(0, 2.25, -5.55),
      'wood',
    );
    add(
      '#766040',
      new THREE.BoxGeometry(0.8, 0.1, 0.1).translate(0, 2.55, -5.55),
      'wood',
    );
    for (const side of [-1, 1]) {
      for (const z of [-1, 1.5]) {
        add(
          '#735a41',
          new THREE.BoxGeometry(0.8, 0.12, 1.1).translate(side * 2.45, 0.5, z),
          'wood',
        );
        add(
          '#735a41',
          new THREE.BoxGeometry(0.12, 0.8, 1.1).translate(side * 2.8, 0.7, z),
          'wood',
        );
      }
      for (const z of [-3, 2.5]) {
        add(
          '#d4c18b',
          new THREE.ShapeGeometry(arch(0.65, 1.2))
            .rotateY((side * Math.PI) / 2)
            .translate(side * 3.8, 1.5, z),
          'glass',
        );
        const light = new THREE.PointLight('#ffe3af', 12, 12);
        light.position.set(side * 3.3, 2.6, z);
        group.add(light);
      }
    }
  } else if (kind === 'lawrence') {
    makeLawrenceRuins(add);
    add(
      '#bdb7a6',
      new THREE.BoxGeometry(9.75, 0.18, 20.25).translate(0, 2.79, 0),
      'plaster',
    );
    for (const z of [-5, 1, 7]) {
      add(
        '#eadbb3',
        new THREE.BoxGeometry(0.65, 0.035, 0.3).translate(0, 2.68, z),
        'glass',
      );
      const light = new THREE.PointLight('#ffe9c2', 10, 10);
      light.position.set(0, 2.5, z);
      group.add(light);
    }
    for (const x of [-4.6, 4.6])
      add(
        '#a29a88',
        new THREE.BoxGeometry(0.55, 2.7, 19.7).translate(x, 1.35, 0),
        'rubble',
      );
    for (const z of [-9.6, 9.6])
      add(
        '#a29a88',
        new THREE.BoxGeometry(9.2, 2.7, 0.55).translate(0, 1.35, z),
        'rubble',
      );
  } else {
    add(
      '#bbb19a',
      new THREE.CylinderGeometry(4.15, 4.15, 0.12, 80).translate(0, -0.06, 0),
      'stone',
    );
    add(
      '#b8ad96',
      new THREE.CylinderGeometry(2.2, 2.2, 0.12, 64).translate(0, -0.06, -4.1),
      'stone',
    );
    add(
      '#c8bda4',
      new THREE.CylinderGeometry(
        4.1,
        4.1,
        5.2,
        80,
        1,
        true,
        Math.PI + 0.53,
        Math.PI * 2 - 1.06,
      ).translate(0, 2.6, 0),
      'stone',
    );
    add(
      '#c8bda4',
      new THREE.CylinderGeometry(
        2.15,
        2.15,
        3.6,
        64,
        1,
        true,
        Math.PI / 2,
        Math.PI,
      ).translate(0, 1.8, -4.1),
      'stone',
    );
    const apseArch = new THREE.Shape();
    apseArch.moveTo(-2.1, 0);
    apseArch.lineTo(2.1, 0);
    apseArch.lineTo(2.1, 5.2);
    apseArch.lineTo(-2.1, 5.2);
    apseArch.closePath();
    apseArch.holes.push(new THREE.Path(arch(3.7, 3.65).getPoints(32)));
    add(
      '#c8bda4',
      new THREE.ExtrudeGeometry(apseArch, {
        depth: 0.35,
        bevelEnabled: false,
      }).translate(0, 0, -3.55),
      'stone',
    );
    add(
      '#d6cbb6',
      new THREE.SphereGeometry(4.12, 64, 24, 0, Math.PI * 2, 0, Math.PI / 2)
        .scale(1, 0.65, 1)
        .translate(0, 5.18, 0),
      'plaster',
    );
    add(
      '#d6cbb6',
      new THREE.SphereGeometry(2.17, 48, 20, 0, Math.PI * 2, 0, Math.PI / 2)
        .scale(1, 0.65, 1)
        .translate(0, 3.58, -4.1),
      'plaster',
    );
    add(
      '#b39e7a',
      new THREE.BoxGeometry(1.8, 0.8, 0.8).translate(0, 0.4, -5.15),
      'stone',
    );
    add(
      '#e0d3b6',
      new THREE.BoxGeometry(2.1, 0.14, 1).translate(0, 0.87, -5.15),
      'stone',
    );
    for (const [w, h, y] of [
      [0.08, 1.1, 1.8],
      [0.58, 0.08, 1.95],
    ])
      add(
        '#8e6d3c',
        new THREE.BoxGeometry(w, h, 0.08).translate(0, y, -5.45),
        'wood',
      );
    for (const side of [-1, 1])
      for (const z of [-1.6, 0.2, 1.9]) {
        add(
          '#735a41',
          new THREE.BoxGeometry(0.7, 0.1, 1.05).translate(side * 2.65, 0.5, z),
          'wood',
        );
        add(
          '#735a41',
          new THREE.BoxGeometry(0.08, 0.9, 1.05).translate(
            side * 2.95,
            0.65,
            z,
          ),
          'wood',
        );
      }
    for (const angle of [-Math.PI / 2, Math.PI / 2]) {
      add(
        '#dccd93',
        new THREE.ShapeGeometry(arch(0.65, 1.55))
          .rotateY(angle)
          .translate(Math.sin(angle) * 4.07, 2.65, 0),
        'glass',
      );
      const light = new THREE.PointLight('#ffe3af', 7, 11);
      light.position.set(Math.sin(angle) * 3.5, 3.2, 0);
      group.add(light);
    }
  }
  const exitZ = chapelSites[kind].exit[1] + 0.15;
  add(
    '#4b4233',
    new THREE.ExtrudeGeometry(arch(1.55, 2.25), {
      depth: 0.08,
      bevelEnabled: false,
    }).translate(0, 0, exitZ),
    'wood',
  );
  for (const { color, kind: materialKind, geometries } of batches.values()) {
    const geometry = mergeGeometries(geometries);
    if (!geometry) throw new Error('Could not assemble church interior.');
    geometries.forEach((item) => item.dispose());
    worldUVs(geometry, materialKind ?? 'stone');
    const mesh = new THREE.Mesh(
      geometry,
      materials.get(materialKind ?? 'stone', color),
    );
    mesh.name =
      materialKind === 'terracotta'
        ? 'Romanesque floor tiles'
        : `${kind} ${materialKind}`;
    mesh.receiveShadow = true;
    group.add(mesh);
    if (materialKind !== 'glass') blockers.push(mesh);
  }
  group.add(
    new THREE.HemisphereLight(
      '#e9e4d8',
      '#8e7c63',
      kind === 'lawrence' ? 2.2 : 1.5,
    ),
  );
  group.visible = false;
  return { group, blockers };
}
