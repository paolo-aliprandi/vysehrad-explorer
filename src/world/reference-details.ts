import * as THREE from 'three';
import { gardenKioskSite, kioskShell } from './kiosks';
import polygonClipping, { type Polygon } from 'polygon-clipping';
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
  panoramaOpening,
  wallOpening,
  courtBankBoundary,
  buildings,
  foundation,
  unretainedElevation,
  artilleryEntrance,
  informationCentre,
  citadela,
  type Point,
  type Feature,
} from './geo';
import type { AddGeometry } from './architecture';
import { continuousWall, drapedPolygon, samplePolyline } from './surfaces';

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

export function makeInformationCentre(add: AddGeometry) {
  const site = informationCentre;
  add('#b8b1a0', drapedPolygon(site.apron, 0.085), 'cobble');
  add(
    '#b8b1a0',
    drapedPolygon(site.sidewalk, 0.085, () => site.ground),
    'cobble',
  );
  const emit = localEmitter(site.point, site.ground, site.angle, add);
  const w = site.width,
    d = site.depth,
    h = 3.05;
  const footprint = [
    site.at(-w / 2, -d / 2),
    site.at(w / 2, -d / 2),
    site.at(w / 2, d / 2),
    site.at(-w / 2, d / 2),
    site.at(-w / 2, -d / 2),
  ];
  for (const perimeter of [footprint, site.sidewalk])
    add(
      '#b8b3a5',
      continuousWall(perimeter, 0.18, (point) => ({
        bottom: Math.min(elevation(...point), site.ground) - 0.2,
        top: site.ground + 0.06,
      })),
      'stone',
    );
  const box = (
    width: number,
    height: number,
    depth: number,
    x: number,
    y: number,
    z: number,
    color: string,
    kind: Kind = 'brick',
  ) =>
    emit(
      new THREE.BoxGeometry(width, height, depth).translate(x, y, z),
      color,
      kind,
    );
  box(w, 0.18, d, 0, 0.01, 0, '#b8b3a5', 'stone');
  box(1.1, 0.12, d, w / 2 + 0.45, 0, 0, '#b8b3a5', 'stone');
  box(w, h, 0.2, 0, h / 2, -d / 2 + 0.1, '#a48168');
  box(0.2, h, d, -w / 2 + 0.1, h / 2, 0, '#a48168');
  const front = new THREE.Shape();
  front.moveTo(-w / 2, 0);
  front.lineTo(w / 2, 0);
  front.lineTo(w / 2, h);
  front.lineTo(-w / 2, h);
  front.closePath();
  const doorway = new THREE.Path();
  doorway.moveTo(-1.35, 0.08);
  doorway.lineTo(-1.35, 2.55);
  doorway.lineTo(1.35, 2.55);
  doorway.lineTo(1.35, 0.08);
  doorway.closePath();
  front.holes.push(doorway);
  emit(
    new THREE.ExtrudeGeometry(front, {
      depth: 0.2,
      bevelEnabled: false,
    }).translate(0, 0, d / 2 - 0.2),
    '#a48168',
    'brick',
  );
  box(2.62, 2.43, 0.035, 0, 1.315, d / 2 - 0.07, '#73837b', 'glass');
  for (const x of [-1.34, 0.62, 1.34])
    box(0.07, 2.52, 0.08, x, 1.32, d / 2, '#353d38', 'metal');
  for (const y of [0.09, 2.55])
    box(2.75, 0.08, 0.08, 0, y, d / 2, '#353d38', 'metal');
  box(0.045, 1.15, 0.08, 0.84, 1.12, d / 2 + 0.07, '#252f2c', 'metal');
  box(2.2, 0.85, 0.55, -0.3, 0.54, d / 2 - 1.05, '#c7baa0', 'wood');
  const windows = [-5.8, -2.5, 0.8, 4.1];
  const side = new THREE.Shape();
  side.moveTo(-d / 2, 0);
  side.lineTo(d / 2, 0);
  side.lineTo(d / 2, h);
  side.lineTo(-d / 2, h);
  side.closePath();
  for (const z of windows) {
    const opening = new THREE.Path();
    opening.moveTo(z - 0.3, 0.65);
    opening.lineTo(z - 0.3, 2.45);
    opening.lineTo(z + 0.3, 2.45);
    opening.lineTo(z + 0.3, 0.65);
    opening.closePath();
    side.holes.push(opening);
    box(0.035, 1.8, 0.6, w / 2 - 0.04, 1.55, -z, '#485b54', 'glass');
    for (const edge of [-0.32, 0.32])
      box(0.075, 1.9, 0.055, w / 2, 1.55, -z + edge, '#353d38', 'metal');
    for (const y of [0.62, 2.48])
      box(0.075, 0.055, 0.69, w / 2, y, -z, '#353d38', 'metal');
  }
  emit(
    new THREE.ExtrudeGeometry(side, { depth: 0.2, bevelEnabled: false })
      .rotateY(Math.PI / 2)
      .translate(w / 2 - 0.2, 0, 0),
    '#a48168',
    'brick',
  );
  box(w + 0.8, 0.18, d + 0.8, 0, 3.05, 0, '#d4d0be', 'plaster');
  box(w + 0.84, 0.12, d + 0.84, 0, 3.2, 0, '#48524d', 'metal');
  const roof = new THREE.BufferGeometry();
  const roofW = w / 2 + 0.35,
    roofD = d / 2 + 0.35;
  roof.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(
      [
        -roofW,
        3.28,
        -roofD,
        roofW,
        3.28,
        -roofD,
        roofW,
        3.28,
        roofD,
        -roofW,
        3.28,
        roofD,
        0,
        3.65,
        -roofD + 1.4,
        0,
        3.65,
        roofD - 1.4,
      ],
      3,
    ),
  );
  roof.setIndex([0, 4, 1, 1, 4, 5, 1, 5, 2, 2, 5, 3, 3, 5, 4, 3, 4, 0]);
  const covering = roof.toNonIndexed();
  roof.dispose();
  covering.computeVertexNormals();
  emit(covering, '#59635e', 'metal');
  for (const x of [-w / 2 - 0.35, w / 2 + 0.35])
    box(0.08, 0.12, d + 0.8, x, 3.3, 0, '#68716b', 'metal');
  for (const z of [-d / 2 - 0.35, d / 2 + 0.35])
    box(w + 0.8, 0.12, 0.08, 0, 3.3, z, '#68716b', 'metal');
  for (let z = -6; z <= 6; z += 3)
    box(0.025, 0.1, 0.12, w / 2 + 0.405, 3.02, z, '#293732', 'metal');
  const railZ = [-d / 2, -d / 2 + 3, -d / 2 + 6, -d / 2 + 9, d / 2 - 1.3];
  for (const z of railZ)
    box(0.045, 0.95, 0.045, w / 2 + 0.7, 0.52, z, '#37473c', 'metal');
  box(0.045, 0.045, d - 1.3, w / 2 + 0.7, 0.98, -0.65, '#37473c', 'metal');
  const board = localEmitter(
    site.board,
    elevation(...site.board) + 0.09,
    site.angle,
    add,
  );
  for (const x of [-0.32, 0.32]) {
    board(beam([x, 0, -0.36], [x, 1.12, 0], 0.035), '#8e7c5e', 'wood');
    board(beam([x, 0, 0.36], [x, 1.12, 0], 0.035), '#8e7c5e', 'wood');
  }
  board(
    new THREE.BoxGeometry(0.7, 0.83, 0.06)
      .rotateX(-0.3)
      .translate(0, 0.68, 0.15),
    '#294b3a',
    'wood',
  );
}

export function makeCitadela(add: AddGeometry) {
  const site = citadela;
  add('#b8b1a0', drapedPolygon(site.courtyard, 0.085), 'cobble');
  const emitAt = (point: Point, angle = site.angle, offset = 0.09) => {
    const ground = elevation(...point) + offset;
    return localEmitter(point, ground, angle, (color, geometry, kind) => {
      const positions = geometry.getAttribute('position');
      for (let i = 0; i < positions.count; i++) {
        const height = positions.getY(i) - ground;
        if (height < 0.15)
          positions.setY(
            i,
            elevation(positions.getX(i), positions.getZ(i)) + offset + height,
          );
      }
      geometry.computeVertexNormals();
      add(color, geometry, kind);
    });
  };
  for (const point of site.tables) {
    const emit = emitAt(point);
    emit(
      new THREE.CylinderGeometry(0.58, 0.58, 0.07, 20).translate(0, 0.76, 0),
      '#bcb7a6',
      'wood',
    );
    for (const x of [-0.36, 0.36])
      for (const z of [-0.36, 0.36])
        emit(
          new THREE.BoxGeometry(0.04, 0.73, 0.04).translate(x, 0.365, z),
          '#37453b',
          'metal',
        );
    for (const x of [-1, 1]) {
      emit(
        new THREE.BoxGeometry(0.48, 0.065, 0.5).translate(x, 0.44, 0),
        '#d0cbb8',
        'wood',
      );
      emit(
        new THREE.BoxGeometry(0.055, 0.48, 0.48).translate(
          x + Math.sign(x) * 0.22,
          0.71,
          0,
        ),
        '#d0cbb8',
        'wood',
      );
      for (const side of [-0.19, 0.19])
        for (const z of [-0.19, 0.19])
          emit(
            new THREE.BoxGeometry(0.035, 0.43, 0.035).translate(
              x + side,
              0.215,
              z,
            ),
            '#37453b',
            'metal',
          );
    }
    emit(
      new THREE.CylinderGeometry(0.11, 0.08, 0.18, 12).translate(0.18, 0.88, 0),
      '#ad8464',
      'terracotta',
    );
    emit(
      new THREE.SphereGeometry(0.15, 8, 6).translate(0.18, 1.02, 0),
      '#687e50',
      'foliage',
    );
  }
  for (const [index, point] of site.loungers.entries()) {
    const emit = emitAt(point, site.loungerAngle, 0.015);
    for (const side of [-0.34, 0.34]) {
      emit(
        beam([side, 0.04, -0.65], [side, 0.92, 0.5], 0.025),
        '#bca17c',
        'wood',
      );
      emit(
        beam([side, 0.04, 0.65], [side, 0.69, -0.42], 0.025),
        '#bca17c',
        'wood',
      );
    }
    for (const [y, z] of [
      [0.92, 0.5],
      [0.37, -0.22],
    ])
      emit(
        new THREE.CylinderGeometry(0.025, 0.025, 0.72, 8)
          .rotateZ(Math.PI / 2)
          .translate(0, y, z),
        '#bca17c',
        'wood',
      );
    const fabric = new THREE.BoxGeometry(0.61, 0.94, 0.018);
    fabric.rotateX(Math.atan2(0.72, 0.55));
    fabric.translate(0, 0.645, 0.14);
    emit(fabric, index % 3 === 0 ? '#d2b58f' : '#b6746e', 'plaster');
  }
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
  const face = site.depth / 2;
  const front = new THREE.Shape();
  front.moveTo(-site.width / 2, -1.5);
  front.lineTo(site.width / 2, -1.5);
  front.lineTo(site.width / 2, site.height);
  front.lineTo(-site.width / 2, site.height);
  front.closePath();
  const doorway = new THREE.Path();
  doorway.moveTo(-4.05, -0.1);
  doorway.lineTo(-2.75, -0.1);
  doorway.lineTo(-2.75, 2.3);
  doorway.lineTo(-4.05, 2.3);
  doorway.closePath();
  front.holes.push(doorway);
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
      new THREE.BoxGeometry(1.02, 1.65, 0.04).translate(x, 3.7, face - 0.25),
      '#252d2b',
      'wood',
    );
    for (let bar = -2; bar <= 2; bar++)
      emit(
        new THREE.BoxGeometry(0.025, 1.54, 0.04).translate(
          x + bar * 0.19,
          3.72,
          face + 0.03,
        ),
        '#4a4b41',
        'metal',
      );
    for (const y of [3.25, 3.78, 4.25])
      emit(
        new THREE.BoxGeometry(0.98, 0.025, 0.04).translate(x, y, face + 0.03),
        '#4a4b41',
        'metal',
      );
    emit(
      new THREE.BoxGeometry(1.15, 0.12, 0.34).translate(x, 2.92, face + 0.04),
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
    new THREE.BoxGeometry(0.26, 2.65, 0.22).translate(-4.19, 1.2, face + 0.02),
    '#a8a390',
    'rubble',
  );
  emit(
    new THREE.BoxGeometry(1.3, 2.3, 0.08).translate(-3.4, 1.15, face - 0.08),
    '#71937d',
    'wood',
  );
  for (const x of [-3.68, -3.12])
    for (const y of [0.6, 1.65])
      emit(
        new THREE.BoxGeometry(0.44, 0.88, 0.035).translate(x, y, face - 0.025),
        '#62816d',
        'wood',
      );
  emit(
    new THREE.BoxGeometry(0.26, 2.65, 0.22).translate(-2.61, 1.2, face + 0.02),
    '#a8a390',
  );
  emit(
    new THREE.BoxGeometry(1.84, 0.26, 0.22).translate(-3.4, 2.43, face + 0.02),
    '#a8a390',
  );
}

export function makeArtilleryEntrance(add: AddGeometry) {
  const site = artilleryEntrance;
  const emit = localEmitter(site.point, site.floor, site.angle, add);
  const arch = new THREE.Shape();
  arch.moveTo(-1.3, -0.2);
  arch.lineTo(1.3, -0.2);
  arch.lineTo(1.3, 1.8);
  arch.absarc(0, 1.8, 1.3, 0, Math.PI, false);
  arch.closePath();
  const hole = new THREE.Path();
  hole.moveTo(-0.88, -0.2);
  hole.lineTo(0.88, -0.2);
  hole.lineTo(0.88, 1.8);
  hole.absarc(0, 1.8, 0.88, 0, Math.PI, false);
  hole.closePath();
  arch.holes.push(hole);
  emit(
    new THREE.ExtrudeGeometry(arch, {
      depth: 0.45,
      bevelEnabled: false,
      curveSegments: 24,
    }),
    '#c2b59b',
  );
  emit(
    new THREE.ExtrudeGeometry(new THREE.Shape(hole.getPoints()), {
      depth: 0.12,
      bevelEnabled: false,
      curveSegments: 24,
    }).translate(0, 0, 0.06),
    '#405d4c',
    'wood',
  );
  for (const y of [0.55, 1.65])
    emit(
      new THREE.BoxGeometry(1.7, 0.06, 0.05).translate(0, y, 0.21),
      '#36433c',
      'metal',
    );
  emit(
    new THREE.BoxGeometry(0.12, 0.12, 0.1).translate(0.57, 1.15, 0.23),
    '#b5a16f',
    'metal',
  );
  add(
    '#b3aa97',
    new THREE.ShapeGeometry(
      new THREE.Shape(site.apron.map(([x, z]) => new THREE.Vector2(x, -z))),
    )
      .rotateX(-Math.PI / 2)
      .translate(0, site.floor + 0.045, 0),
    'cobble',
  );
  add(
    '#a9a38d',
    continuousWall(site.apron, 0.1, (point) => ({
      bottom: Math.min(unretainedElevation(...point) - 0.2, site.floor - 0.2),
      top: site.floor + 0.045,
    })),
    'stone',
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
    const samples = samplePolyline(wall.points, 0.75);
    for (let i = 1; i < samples.length; i++) {
      const a = samples[i - 1],
        b = samples[i];
      const brickApproach = a[0] >= -104 && a[0] <= 15 && a[1] <= -17;
      const recessedStreet =
        a[0] >= 15 && a[0] <= 65 && a[1] >= -20 && a[1] <= 63;
      if (!brickApproach && !recessedStreet) continue;
      const projection = projectRoute(a, wall.points);
      const normal = projection.normal;
      const crestA = wallProfile(wall, a, normal).top;
      const crestB = wallProfile(wall, b, normal).top;
      const crest = Math.min(crestA, crestB);
      const drop = Math.min(
        crest - elevation(...a) - 0.35,
        1.3 + 1.5 * (0.5 + 0.5 * Math.sin(i * 0.31)),
      );
      for (const sign of [-1, 1]) {
        const offset = sign * (wallThickness(wall, a) / 2 + 0.045);
        makeIvyClump(
          [
            (a[0] + b[0]) / 2 + normal[0] * offset,
            (a[1] + b[1]) / 2 + normal[1] * offset,
          ],
          crest,
          drop,
          -Math.atan2(b[1] - a[1], b[0] - a[0]),
          i,
          add,
        );
      }
    }
  }
  const shed = buildings.find((building) => building.id === 49811200);
  if (!shed) throw new Error('Missing long shed beside the park path.');
  const facade = projectRoute([141, 175], shed.points);
  const a = shed.points[facade.segment],
    b = shed.points[facade.segment + 1];
  const normal = facade.normal;
  const sign = inside(
    [facade.point[0] + normal[0] * 0.1, facade.point[1] + normal[1] * 0.1],
    shed.points,
  )
    ? -1
    : 1;
  const crest = foundation(shed) + 2.85;
  for (const [seed, t] of [0.18, 0.26, 0.56, 0.64, 0.83].entries())
    makeIvyClump(
      [
        a[0] + (b[0] - a[0]) * t + normal[0] * sign * 0.07,
        a[1] + (b[1] - a[1]) * t + normal[1] * sign * 0.07,
      ],
      crest,
      0.65 + 0.12 * (seed % 3),
      -Math.atan2(b[1] - a[1], b[0] - a[0]),
      seed,
      add,
    );
  makeRoyalWallIvy(add);
}

function makeIvyClump(
  point: Point,
  crest: number,
  drop: number,
  angle: number,
  seed: number,
  add: AddGeometry,
) {
  if (drop < 0.25) return;
  const emit = localEmitter(point, crest, angle, add);
  for (let row = 0; row <= Math.ceil(drop / 0.32); row++) {
    const down = Math.min(drop, row * 0.32);
    const taper = 1 - 0.55 * (down / drop) ** 3;
    emit(
      new THREE.SphereGeometry(1, 9, 6)
        .scale((0.42 + 0.08 * Math.sin(seed * 1.7 + row)) * taper, 0.24, 0.1)
        .rotateZ(0.2 * Math.sin(seed + row))
        .translate(0.12 * Math.sin(seed * 0.7 + row * 0.6), 0.06 - down, 0),
      (seed + row) % 3 ? '#405d3c' : '#506c42',
      'foliage',
    );
    if (row % 2 === 0)
      emit(
        new THREE.SphereGeometry(1, 7, 5)
          .scale(0.16, 0.12, 0.065)
          .translate(0.4 * taper, -down - 0.08, 0.02),
        '#5b7548',
        'foliage',
      );
  }
}

function makeRoyalWallIvy(add: AddGeometry) {
  const rampart = walls.find((wall) => wall.id === 1532977610);
  if (!rampart) throw new Error('Missing royal-precinct rampart.');
  const samples = samplePolyline(rampart.points, 0.7);
  for (let i = 1; i < samples.length; i++) {
    const a = samples[i - 1],
      b = samples[i];
    if (
      Math.hypot(a[0] + 279, a[1] - 116) > 48 ||
      wallOpening(a) ||
      wallOpening(b) ||
      panoramaOpening(a) ||
      panoramaOpening(b) ||
      riversideDoorways.some(
        (door) => Math.hypot(a[0] - door.point[0], a[1] - door.point[1]) < 1.65,
      )
    )
      continue;
    const projection = projectRoute(a, rampart.points);
    const normal = projection.normal;
    const inward = inside(
      [a[0] + normal[0] * 0.2, a[1] + normal[1] * 0.2],
      courtBankBoundary,
    )
      ? 1
      : -1;
    const profile = wallProfile(rampart, a, normal);
    const offsets = retainedWallOffsets(a, wallThickness(rampart, a), profile);
    const crest = Math.min(profile.top, wallProfile(rampart, b, normal).top);
    for (const side of [-1, 1]) {
      const offset =
        side > 0
          ? (offsets.inset + wallThickness(rampart, a) + 0.045) * inward
          : (offsets.outer - 0.045) * inward;
      const point: Point = [
        (a[0] + b[0]) / 2 + normal[0] * offset,
        (a[1] + b[1]) / 2 + normal[1] * offset,
      ];
      if (
        buildings.some(
          (building) =>
            inside(point, building.points) ||
            projectRoute(point, building.points).distance < 0.75,
        )
      )
        continue;
      const drop = Math.min(
        2.1 + 1.8 * (0.5 + 0.5 * Math.sin(i * 0.27)),
        crest -
          elevation(
            point[0] + normal[0] * side * inward,
            point[1] + normal[1] * side * inward,
          ) -
          0.2,
      );
      makeIvyClump(
        point,
        crest,
        drop,
        -Math.atan2(b[1] - a[1], b[0] - a[0]),
        i,
        add,
      );
    }
  }
}

export function makeGardenKiosk(add: AddGeometry) {
  const site = referenceSites.gardenKiosk;
  const ground = gardenKioskSite.ground;
  const emit = localEmitter(site.point, ground, site.angle, add);
  emit(
    new THREE.BoxGeometry(site.width + 0.3, 0.55, site.depth + 0.3).translate(
      0,
      -0.2,
      0,
    ),
    '#99917f',
  );
  emit(
    kioskShell(site.width, site.depth, 2.6, {
      center: -0.3,
      width: 3.55,
      sill: 1.04,
      head: 2.24,
    }),
    '#5a634c',
    'wood',
  );
  for (const u of [-site.width / 2 + 0.08, site.width / 2 - 0.08])
    emit(
      new THREE.BoxGeometry(0.15, 2.8, site.depth + 0.08).translate(u, 1.4, 0),
      '#484e3c',
      'wood',
    );
  emit(
    new THREE.BoxGeometry(3.55, 1.2, 0.08).translate(
      -0.3,
      1.64,
      -site.depth / 2 + 0.17,
    ),
    '#28342e',
    'wood',
  );
  for (const u of [-2.12, 1.52])
    emit(
      new THREE.BoxGeometry(0.1, 1.36, 0.12).translate(
        u,
        1.64,
        site.depth / 2 + 0.1,
      ),
      '#c1ae83',
      'wood',
    );
  emit(
    new THREE.BoxGeometry(3.95, 0.11, 0.55).translate(
      -0.3,
      1.06,
      site.depth / 2 + 0.24,
    ),
    '#b7a177',
    'wood',
  );
  emit(
    new THREE.BoxGeometry(3.95, 0.13, 1.25)
      .rotateX(-0.18)
      .translate(-0.3, 2.55, site.depth / 2 + 0.38),
    '#7a8a62',
    'wood',
  );
  emit(
    new THREE.BoxGeometry(site.width + 0.55, 0.16, site.depth + 0.5)
      .rotateX(-0.08)
      .translate(0, 2.91, 0),
    '#4a5650',
    'metal',
  );
  emit(
    new THREE.BoxGeometry(0.68, 0.95, 0.08).translate(
      2.13,
      1.56,
      site.depth / 2 + 0.08,
    ),
    '#293b31',
    'wood',
  );
  for (let i = 0; i < 4; i++)
    emit(
      new THREE.BoxGeometry(0.42 - i * 0.04, 0.023, 0.03).translate(
        2.13,
        1.82 - i * 0.17,
        site.depth / 2 + 0.13,
      ),
      '#d2c49b',
      'wood',
    );
  for (const u of [-1.4, -0.95, -0.5, 0.3, 0.75])
    emit(
      new THREE.CylinderGeometry(0.07, 0.055, 0.18, 8).translate(
        u,
        1.21,
        site.depth / 2 + 0.18,
      ),
      '#d7ceb1',
      'plaster',
    );
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

export function makeArcadeCeiling(
  bay: (typeof cemeteryArcadeBays)[number],
  ground: number,
  add: AddGeometry,
) {
  const { normal, depth, at } = arcadeInterior(bay);
  const radius = (bay.width - 0.42) / 2;
  if (radius < 0.4) return;
  const panel: Polygon = [
    [at(-radius, 0), at(radius, 0), at(radius, depth), at(-radius, depth)].map(
      ([x, z]) => [x, z],
    ),
  ];
  const ceiling: Polygon = [bay.feature.points, ...bay.feature.holes].map(
    (ring) => ring.map(([x, z]) => [x, z]),
  );
  for (const polygon of polygonClipping.intersection(panel, ceiling)) {
    const rings = polygon.map((ring) =>
      ring.map(([x, z]) => new THREE.Vector2(x, z)),
    );
    const shape = new THREE.Shape(rings[0]);
    shape.holes = rings.slice(1).map((ring) => new THREE.Path(ring));
    const geometry = new THREE.ShapeGeometry(shape).rotateX(Math.PI / 2);
    const position = geometry.attributes.position;
    const uv = geometry.attributes.uv;
    for (let i = 0; i < position.count; i++) {
      const dx = position.getX(i) - bay.center[0];
      const dz = position.getZ(i) - bay.center[1];
      uv.setXY(
        i,
        ((dx * bay.axis[0] + dz * bay.axis[1]) / radius + 1) / 2,
        (dx * normal[0] + dz * normal[1]) / depth,
      );
    }
    geometry.translate(0, ground + 4.045, 0);
    add('#e8dbc1', geometry, 'fresco');
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
  makeCitadela(add);
  makeGardenReferences(add);
  makeGardenKiosk(add);
  makeHiddenChurch(add);
  makeArtilleryEntrance(add);
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
