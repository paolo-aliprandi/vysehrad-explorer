import * as THREE from 'three';
import polygonClipping, { type Polygon } from 'polygon-clipping';
import {
  center,
  elevation,
  upperElevation,
  coverAt,
  paths,
  pathWidth,
  projectRoute,
  originalElevation,
  gateFrame,
  gateOpenings,
  gravePlots,
  inside,
  orientedBounds,
  meters,
  parts,
  buildings,
  walls,
  wallOpening,
  wallProfile,
  wallThickness,
  rampartWallRuns,
  cemeterySolidWallIds,
  cemeteryArcades,
  cemeteryArcadeBays,
  cemeteryArcadeWallThickness,
  cemeteryGate,
  gardenPortal,
  foundation,
  blocked,
  slavin,
  streetFrontages,
  streetFurniture,
  cathedralPortals,
  cathedralDoorLeaf,
  aveMariaFrontage,
  spickaGate,
  westFacade as buildingFront,
  type Feature,
  type Point,
} from './geo';
import type { MaterialKind } from './materials';
import {
  samplePolyline,
  continuousWall,
  drapedPolygon,
  pathRibbon,
} from './surfaces';
export { streetFurniture } from './geo';

export type AddGeometry = (
  color: string,
  geometry: THREE.BufferGeometry,
  kind?: MaterialKind,
) => void;

export function makeFence(
  points: readonly Point[],
  height: number,
  add: AddGeometry,
  sample = elevation,
) {
  const samples = samplePolyline(points, 1.8);
  const segment = (a: Point, b: Point, level: number, thickness: number) => {
    const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (length < 0.01) return;
    const start = new THREE.Vector3(a[0], sample(...a) + level, a[1]);
    const end = new THREE.Vector3(b[0], sample(...b) + level, b[1]);
    const beam = new THREE.BoxGeometry(
      thickness,
      start.distanceTo(end),
      thickness,
    );
    beam.applyQuaternion(
      new THREE.Quaternion().setFromUnitVectors(
        new THREE.Vector3(0, 1, 0),
        end.clone().sub(start).normalize(),
      ),
    );
    beam.translate(
      (start.x + end.x) / 2,
      (start.y + end.y) / 2,
      (start.z + end.z) / 2,
    );
    add('#414b43', beam, 'metal');
  };
  for (const [index, point] of samples.entries()) {
    const ground = sample(...point);
    add(
      '#98927e',
      new THREE.BoxGeometry(0.3, 0.28, 0.3).translate(
        point[0],
        ground + 0.08,
        point[1],
      ),
      'stone',
    );
    add(
      '#414b43',
      new THREE.BoxGeometry(0.085, height + 0.15, 0.085).translate(
        point[0],
        ground + height / 2,
        point[1],
      ),
      'metal',
    );
    add(
      '#414b43',
      new THREE.ConeGeometry(0.085, 0.16, 4).translate(
        point[0],
        ground + height + 0.1,
        point[1],
      ),
      'metal',
    );
    if (index === 0) continue;
    const previous = samples[index - 1];
    for (const level of [0.28, height - 0.17])
      segment(previous, point, level, 0.055);
    const count = Math.max(
      1,
      Math.ceil(
        Math.hypot(point[0] - previous[0], point[1] - previous[1]) / 0.22,
      ),
    );
    for (let i = 1; i < count; i++) {
      const x = previous[0] + ((point[0] - previous[0]) * i) / count;
      const z = previous[1] + ((point[1] - previous[1]) * i) / count;
      const y = sample(x, z);
      add(
        '#414b43',
        new THREE.BoxGeometry(0.035, height - 0.1, 0.035).translate(
          x,
          y + height / 2,
          z,
        ),
        'metal',
      );
    }
  }
}

function positioned(
  geometry: THREE.BufferGeometry,
  point: Point,
  y: number,
  angle = 0,
) {
  geometry.rotateY(angle);
  geometry.translate(point[0], y, point[1]);
  return geometry;
}

function pointed(width: number, height: number, bottom = 0) {
  const outline = new THREE.Shape();
  const shoulder = height - width * 0.65;
  outline.moveTo(-width / 2, bottom);
  outline.lineTo(width / 2, bottom);
  outline.lineTo(width / 2, shoulder);
  outline.quadraticCurveTo(width / 2, height - width * 0.25, 0, height);
  outline.quadraticCurveTo(
    -width / 2,
    height - width * 0.25,
    -width / 2,
    shoulder,
  );
  outline.closePath();
  return outline;
}

export function makeRotunda(
  feature: Feature,
  ground: number,
  add: AddGeometry,
) {
  const circle = (a: Point, b: Point, c: Point) => {
    const bx = b[0] - a[0],
      bz = b[1] - a[1],
      cx = c[0] - a[0],
      cz = c[1] - a[1];
    const determinant = 2 * (bx * cz - bz * cx);
    if (Math.abs(determinant) < 0.001)
      throw new Error('The mapped rotunda arc is degenerate.');
    const u =
      ((bx * bx + bz * bz) * cz - (cx * cx + cz * cz) * bz) / determinant;
    const v =
      (bx * (cx * cx + cz * cz) - cx * (bx * bx + bz * bz)) / determinant;
    return { point: [a[0] + u, a[1] + v] as Point, radius: Math.hypot(u, v) };
  };
  // Fit the two mapped arcs separately rather than stretching one cone over both.
  const drum = circle(
    feature.points[22],
    feature.points[28],
    feature.points[34],
  );
  const apse = circle(feature.points[2], feature.points[7], feature.points[12]);
  const axis = Math.atan2(
    apse.point[1] - drum.point[1],
    apse.point[0] - drum.point[0],
  );
  const south = axis + Math.PI / 2;
  const nave = parts.find((part) => part.id === 28550505);
  const apsePart = parts.find((part) => part.id === 457038754);
  const lantern = parts.find((part) => part.id === 457038755);
  if (!nave || !apsePart || !lantern)
    throw new Error('The mapped rotunda building parts are missing.');
  const wallHeight =
    meters(nave.tags.height, 12) - meters(nave.tags['roof:height'], 2.5);
  const apseHeight =
    meters(apsePart.tags.height, 6) - meters(apsePart.tags['roof:height'], 1);
  const roofBase = wallHeight + 0.22;
  const roofHeight =
    meters(nave.tags['roof:height'], 2.5) * (1 - 1.13 / (drum.radius + 0.32));
  const lanternBase = roofBase + roofHeight - 0.03;
  const lanternTop =
    meters(lantern.tags.height, 14.3) - meters(lantern.tags['roof:height'], 1);
  const roofTop = lanternTop + 0.14 + meters(lantern.tags['roof:height'], 1);
  const radial = (point: Point, radius: number, angle: number): Point => [
    point[0] + Math.cos(angle) * radius,
    point[1] + Math.sin(angle) * radius,
  ];
  const local = (
    geometry: THREE.BufferGeometry,
    point: Point,
    y: number,
    color: string,
    kind: MaterialKind = 'stone',
    angle = 0,
  ) => add(color, positioned(geometry, point, ground + y, angle), kind);
  const cylinder = (
    point: Point,
    radius: number,
    bottom: number,
    height: number,
    color: string,
    top = radius,
  ) =>
    local(
      new THREE.CylinderGeometry(top, radius, height, 96),
      point,
      bottom + height / 2,
      color,
    );
  const arch = (width: number, height: number, bottom = 0) => {
    const outline = new THREE.Shape();
    outline.moveTo(-width / 2, bottom);
    outline.lineTo(width / 2, bottom);
    outline.lineTo(width / 2, height - width / 2);
    outline.absarc(0, height - width / 2, width / 2, 0, Math.PI, false);
    outline.closePath();
    return outline;
  };
  const opening = (
    point: Point,
    angle: number,
    bottom: number,
    width: number,
    height: number,
    door = false,
  ) => {
    const rotation = Math.PI / 2 - angle;
    const surround = arch(width + 0.38, height + 0.2);
    surround.holes.push(
      new THREE.Path(arch(width, height, 0.04).getPoints(32)),
    );
    const recess = door
      ? drum.radius -
        Math.sqrt(Math.max(0, drum.radius ** 2 - ((width + 0.38) / 2) ** 2)) +
        0.04
      : 0;
    local(
      new THREE.ExtrudeGeometry(surround, {
        depth: door ? 0.27 + recess : 0.18,
        bevelEnabled: false,
        curveSegments: 24,
      }).translate(0, 0, -recess),
      point,
      bottom,
      door ? '#b59a72' : '#d0c7ae',
      'stone',
      rotation,
    );
    const infill = new THREE.ShapeGeometry(arch(width, height, 0.03), 24);
    infill.translate(0, 0, 0.025);
    local(
      infill,
      point,
      bottom,
      door ? '#3d362c' : '#28342f',
      door ? 'wood' : 'glass',
      rotation,
    );
    if (!door) {
      for (const x of [-width / 4, 0, width / 4])
        local(
          new THREE.BoxGeometry(0.025, height - width / 2, 0.04).translate(
            x,
            (height - width / 2) / 2,
            0.06,
          ),
          point,
          bottom,
          '#454941',
          'metal',
          rotation,
        );
      return;
    }
    const tympanum = new THREE.ShapeGeometry(arch(width, height, 2.25), 24);
    tympanum.translate(0, 0, 0.065);
    local(tympanum, point, bottom, '#b59a72', 'stone', rotation);
    for (const side of [-1, 1]) {
      local(
        new THREE.CylinderGeometry(0.12, 0.14, 2.28, 20).translate(
          side * (width / 2 + 0.12),
          1.2,
          0.21,
        ),
        point,
        bottom,
        '#c1aa82',
        'stone',
        rotation,
      );
      for (const y of [0.12, 2.38])
        local(
          new THREE.BoxGeometry(0.4, 0.18, 0.42).translate(
            side * (width / 2 + 0.12),
            y,
            0.17,
          ),
          point,
          bottom,
          '#ad9878',
          'stone',
          rotation,
        );
    }
    local(
      new THREE.BoxGeometry(width + 0.4, 0.16, 0.32).translate(0, 2.37, 0.15),
      point,
      bottom,
      '#b59a72',
      'stone',
      rotation,
    );
    for (const y of [0.65, 1.8])
      local(
        new THREE.BoxGeometry(width * 0.88, 0.055, 0.06).translate(0, y, 0.07),
        point,
        bottom,
        '#343c37',
        'metal',
        rotation,
      );
    local(
      new THREE.TorusGeometry(0.075, 0.017, 6, 20).translate(
        width * 0.27,
        1.12,
        0.095,
      ),
      point,
      bottom,
      '#4d5144',
      'metal',
      rotation,
    );
    for (const [w, h, y] of [
      [0.08, 0.48, 2.96],
      [0.37, 0.08, 3.04],
    ])
      local(
        new THREE.BoxGeometry(w, h, 0.04).translate(0, y, 0.095),
        point,
        bottom,
        '#7d684c',
        'stone',
        rotation,
      );
  };
  const tiledRoof = (
    point: Point,
    radius: number,
    topRadius: number,
    bottom: number,
    height: number,
  ) => {
    local(
      new THREE.CylinderGeometry(topRadius, radius, height, 96),
      point,
      bottom + height / 2,
      '#a56543',
      'slate',
    );
    const courses = Math.ceil(height / 0.22);
    for (let i = 0; i < courses; i++) {
      const t = i / courses;
      local(
        new THREE.TorusGeometry(
          radius + (topRadius - radius) * t,
          0.026,
          4,
          96,
        ).rotateX(Math.PI / 2),
        point,
        bottom + height * t,
        '#805339',
        'slate',
      );
    }
    const ribs = Math.ceil(radius * 16);
    for (let i = 0; i < ribs; i++) {
      const a = (i * Math.PI * 2) / ribs;
      const line = new THREE.LineCurve3(
        new THREE.Vector3(Math.cos(a) * radius, 0, Math.sin(a) * radius),
        new THREE.Vector3(
          Math.cos(a) * topRadius,
          height,
          Math.sin(a) * topRadius,
        ),
      );
      local(
        new THREE.TubeGeometry(line, 1, 0.023, 4, false),
        point,
        bottom,
        '#b47750',
        'slate',
      );
    }
  };
  const footprint = new THREE.Shape(
    feature.points.map(([x, z]) => new THREE.Vector2(x, -z)),
  );
  const base = new THREE.ExtrudeGeometry(footprint, {
    depth: 0.5,
    bevelEnabled: false,
  });
  base.rotateX(-Math.PI / 2);
  base.translate(0, ground - 0.35, 0);
  add('#958d79', base, 'stone');
  cylinder(drum.point, drum.radius, -0.1, wallHeight + 0.1, '#c0b49a');
  cylinder(apse.point, apse.radius, -0.1, apseHeight + 0.1, '#c0b49a');
  for (const [point, radius, height] of [
    [drum.point, drum.radius, wallHeight],
    [apse.point, apse.radius, apseHeight],
  ] as const) {
    cylinder(point, radius + 0.12, 0.03, 0.27, '#a59a80');
    cylinder(point, radius + 0.05, height - 0.18, 0.15, '#b0a58d');
    cylinder(point, radius + 0.15, height - 0.03, 0.13, '#c6bda8');
    cylinder(point, radius + 0.25, height + 0.1, 0.12, '#b1aa94');
  }
  tiledRoof(
    apse.point,
    apse.radius + 0.32,
    0,
    apseHeight + 0.22,
    meters(apsePart.tags['roof:height'], 1),
  );
  tiledRoof(drum.point, drum.radius + 0.32, 1.13, roofBase, roofHeight);
  cylinder(drum.point, 1.13, lanternBase, lanternTop - lanternBase, '#b9af96');
  cylinder(drum.point, 1.24, lanternTop - 0.02, 0.16, '#c8bea8');
  tiledRoof(
    drum.point,
    1.4,
    0.07,
    lanternTop + 0.14,
    meters(lantern.tags['roof:height'], 1),
  );
  for (let side = 0; side < 4; side++) {
    const angle = axis + (side * Math.PI) / 2;
    for (const shift of [-0.24, 0.24]) {
      const point = radial(drum.point, 1.135, angle + shift);
      opening(
        point,
        angle + shift,
        lanternBase + 0.2,
        0.39,
        lanternTop - lanternBase - 0.35,
      );
    }
  }
  for (const angle of [south, south + 1.6, south + 3.1])
    opening(
      radial(drum.point, drum.radius + 0.035, angle),
      angle,
      wallHeight - 3.8,
      1.25,
      2.8,
    );
  opening(
    radial(apse.point, apse.radius + 0.035, axis),
    axis,
    1.65,
    0.68,
    1.45,
  );
  for (let i = -3; i <= 3; i++) {
    const angle = axis + i * 0.34;
    const point = radial(apse.point, apse.radius + 0.04, angle);
    const blind = arch(0.7, 0.8);
    blind.holes.push(new THREE.Path(arch(0.52, 0.65).getPoints(20)));
    local(
      new THREE.ExtrudeGeometry(blind, {
        depth: 0.075,
        bevelEnabled: false,
        curveSegments: 20,
      }),
      point,
      apseHeight - 1.03,
      '#c9bfa6',
      'stone',
      Math.PI / 2 - angle,
    );
  }
  const door = radial(drum.point, drum.radius + 0.005, south);
  opening(door, south, 0.35, 1.7, 3.9, true);
  for (let i = 0; i < 3; i++)
    local(
      new THREE.BoxGeometry(2.15, 0.13, i === 2 ? 0.8 : 0.42).translate(
        0,
        0.065 + i * 0.13,
        1.05 - i * 0.34,
      ),
      door,
      0,
      '#a39c8b',
      'stone',
      Math.PI / 2 - south,
    );
  local(
    new THREE.CylinderGeometry(0.04, 0.075, 0.7, 16),
    drum.point,
    roofTop + 0.25,
    '#ac984e',
    'metal',
  );
  local(
    new THREE.SphereGeometry(0.14, 20, 12),
    drum.point,
    roofTop + 0.57,
    '#bba65b',
    'metal',
  );
  local(
    new THREE.BoxGeometry(0.045, 0.7, 0.045),
    drum.point,
    roofTop + 0.98,
    '#bba65b',
    'metal',
  );
  local(
    new THREE.BoxGeometry(0.4, 0.045, 0.045),
    drum.point,
    roofTop + 1.1,
    '#bba65b',
    'metal',
  );
}

function archWindow(
  add: AddGeometry,
  point: Point,
  y: number,
  angle: number,
  width: number,
  height: number,
  door = false,
) {
  const outer = pointed(width + 0.34, height + 0.28);
  outer.holes.push(new THREE.Path(pointed(width, height, 0.1).getPoints(20)));
  add(
    '#c8c0aa',
    positioned(
      new THREE.ExtrudeGeometry(outer, {
        depth: 0.16,
        bevelEnabled: true,
        bevelSize: 0.025,
        bevelThickness: 0.025,
        bevelSegments: 2,
        curveSegments: 16,
      }),
      point,
      y,
      angle,
    ),
    'stone',
  );
  const glass = new THREE.ShapeGeometry(
    pointed(width - 0.1, height - 0.1, 0.12),
    20,
  );
  glass.translate(0, 0, 0.02);
  add(
    door ? (width > 4 ? '#bcb29b' : '#617c8a') : '#536b73',
    positioned(glass, point, y, angle),
    door ? 'stone' : 'glass',
  );
  const local = (
    geometry: THREE.BufferGeometry,
    x: number,
    h: number,
    z: number,
    color = '#b5b29f',
    kind: MaterialKind = 'stone',
  ) => {
    geometry.translate(x, h, z);
    add(color, positioned(geometry, point, y, angle), kind);
  };
  if (door) {
    for (let band = 0; band < 3; band++) {
      const surround = pointed(
        width + 0.42 + band * 0.23,
        height + 0.33 + band * 0.18,
      );
      surround.holes.push(
        new THREE.Path(
          pointed(
            width + 0.24 + band * 0.23,
            height + 0.18 + band * 0.18,
          ).getPoints(32),
        ),
      );
      local(
        new THREE.ExtrudeGeometry(surround, {
          depth: 0.07,
          bevelEnabled: false,
          curveSegments: 24,
        }),
        0,
        0,
        0.1 + (2 - band) * 0.055,
        band % 2 ? '#c6bda8' : '#a9a38f',
      );
    }
    const leafWidth = width * cathedralDoorLeaf.widthRatio,
      leafHeight = height * cathedralDoorLeaf.heightRatio;
    local(
      new THREE.BoxGeometry(leafWidth, leafHeight, cathedralDoorLeaf.depth),
      0,
      leafHeight / 2,
      cathedralDoorLeaf.offset,
      '#464a50',
      'wood',
    );
    const cell = leafWidth / 5;
    for (let row = 0; row < Math.floor(leafHeight / cell); row++)
      for (let col = 0; col < 5; col++) {
        const diamond = new THREE.BoxGeometry(
          cell * 0.6,
          cell * 0.6,
          0.035,
        ).rotateZ(Math.PI / 4);
        local(
          diamond,
          (col - 2) * cell,
          (row + 0.5) * cell,
          0.15,
          (row + col) % 2 ? '#8d7481' : '#7b8b8b',
          'wood',
        );
        local(
          new THREE.BoxGeometry(cell * 0.24, cell * 0.24, 0.025).rotateZ(
            Math.PI / 4,
          ),
          (col - 2) * cell,
          (row + 0.5) * cell,
          0.18,
          '#b8b8a8',
        );
      }
    local(
      new THREE.BoxGeometry(0.055, leafHeight, 0.08),
      0,
      leafHeight / 2,
      0.2,
      '#c3c0ae',
    );
    local(
      new THREE.BoxGeometry(leafWidth + 0.25, 0.13, 0.28),
      0,
      leafHeight + 0.06,
      0.18,
      '#c5bba4',
    );
    const reliefY = height * 0.72;
    if (width > 4) {
      for (const x of [-width * 0.18, 0, width * 0.18]) {
        local(
          new THREE.SphereGeometry(0.13, 10, 8).scale(1, 1, 0.35),
          x,
          reliefY + 0.27,
          0.09,
          '#c7bca2',
        );
        local(
          new THREE.ConeGeometry(0.24, 0.65, 8).scale(1, 1, 0.3),
          x,
          reliefY - 0.12,
          0.08,
          '#b1a68e',
        );
      }
    } else {
      local(
        new THREE.TorusGeometry(width * 0.17, 0.07, 8, 32),
        0,
        reliefY + 0.12,
        0.12,
        '#d4b26b',
      );
      for (let i = 0; i < 8; i++) {
        const a = (i * Math.PI) / 4;
        local(
          new THREE.SphereGeometry(0.08, 8, 6).scale(1, 1.5, 0.3),
          Math.cos(a) * width * 0.29,
          reliefY + 0.12 + Math.sin(a) * width * 0.29,
          0.1,
          i % 2 ? '#bd796d' : '#c8b171',
        );
      }
      for (const side of [-1, 1])
        local(
          new THREE.TorusGeometry(width * 0.075, 0.035, 6, 24),
          side * width * 0.065,
          reliefY + 0.13,
          0.18,
          '#e0bf76',
        );
    }
    return;
  }
  for (const x of [-width / 6, width / 6])
    local(
      new THREE.BoxGeometry(0.065, height * 0.72, 0.12),
      x,
      height * 0.38,
      0.1,
    );
  for (let row = 1; row <= 3; row++)
    local(
      new THREE.BoxGeometry(width, 0.065, 0.12),
      0,
      (height * row) / 5,
      0.1,
    );
  if (!door && height > 3.5) {
    const roseY = height - width * 0.6;
    const circle = new THREE.TorusGeometry(width * 0.23, 0.055, 5, 24);
    local(circle, 0, roseY, 0.12);
    for (let i = 0; i < 6; i++) {
      const a = (i * Math.PI) / 3;
      local(
        new THREE.TorusGeometry(width * 0.09, 0.025, 4, 16),
        Math.cos(a) * width * 0.14,
        roseY + Math.sin(a) * width * 0.14,
        0.14,
      );
    }
  }
}

function rectangularWindow(
  add: AddGeometry,
  point: Point,
  y: number,
  angle: number,
  width: number,
  height: number,
) {
  const local = (
    geometry: THREE.BufferGeometry,
    x: number,
    h: number,
    z: number,
    color: string,
    kind: MaterialKind,
  ) => {
    geometry.translate(x, h, z);
    add(color, positioned(geometry, point, y, angle), kind);
  };
  local(
    new THREE.PlaneGeometry(width, height),
    0,
    height / 2,
    0.018,
    '#4e656d',
    'glass',
  );
  for (const side of [-1, 1]) {
    local(
      new THREE.BoxGeometry(0.105, height + 0.18, 0.14),
      side * (width / 2 + 0.04),
      height / 2,
      0.08,
      '#ddd5c3',
      'plaster',
    );
    local(
      new THREE.BoxGeometry(width + 0.2, 0.1, 0.14),
      0,
      side < 0 ? -0.04 : height + 0.04,
      0.08,
      '#ddd5c3',
      'plaster',
    );
  }
  local(
    new THREE.BoxGeometry(0.06, height, 0.06),
    0,
    height / 2,
    0.08,
    '#cfc8b6',
    'wood',
  );
  local(
    new THREE.BoxGeometry(width, 0.06, 0.06),
    0,
    height * 0.55,
    0.08,
    '#cfc8b6',
    'wood',
  );
  local(
    new THREE.BoxGeometry(width + 0.4, 0.14, 0.28),
    0,
    -0.12,
    0.12,
    '#b9ae9a',
    'stone',
  );
}

export const cathedralEntrance = (() => {
  const doors = cathedralPortals;
  const face = doors[1];
  return {
    ...face,
    doors,
    approach: [
      face.point[0] + Math.sin(face.angle) * 2.2,
      face.point[1] + Math.cos(face.angle) * 2.2,
    ] as Point,
  };
})();

export function makeCathedralForecourt(add: AddGeometry) {
  const face = cathedralEntrance;
  const at = (u: number, v: number): Point => [
    face.point[0] + Math.cos(face.angle) * u + Math.sin(face.angle) * v,
    face.point[1] - Math.sin(face.angle) * u + Math.cos(face.angle) * v,
  ];
  const doorPositions = face.doors.map((door) => ({
    u:
      (door.point[0] - face.point[0]) * Math.cos(face.angle) -
      (door.point[1] - face.point[1]) * Math.sin(face.angle),
    v:
      (door.point[0] - face.point[0]) * Math.sin(face.angle) +
      (door.point[1] - face.point[1]) * Math.cos(face.angle),
  }));
  const left = Math.min(...doorPositions.map((door) => door.u)) - 3.1;
  const right = Math.max(...doorPositions.map((door) => door.u)) + 3.1;
  const front = Math.max(...doorPositions.map((door) => door.v)) + 7.3;
  const outer = [
    at(left, 0.25),
    at(right, 0.25),
    at(right, front - 0.8),
    at(right - 0.8, front),
    at(left + 0.8, front),
    at(left, front - 0.8),
  ];
  const inset = [
    at(left + 0.26, 0.5),
    at(right - 0.26, 0.5),
    at(right - 0.26, front - 0.92),
    at(right - 0.92, front - 0.26),
    at(left + 0.92, front - 0.26),
    at(left + 0.26, front - 0.92),
  ];
  const route = paths.find((path) => path.id === 27762644);
  const approach = route?.points.at(-1);
  const previous = route?.points.at(-2);
  if (!route || !approach || !previous)
    throw new Error('The basilica approach path is missing.');
  const length = Math.hypot(
    previous[0] - approach[0],
    previous[1] - approach[1],
  );
  if (!length)
    throw new Error('The basilica approach has a zero-length segment.');
  const start: Point = [
    approach[0] + ((previous[0] - approach[0]) * 0.4) / length,
    approach[1] + ((previous[1] - approach[1]) * 0.4) / length,
  ];
  add(
    '#c6c2ad',
    pathRibbon(
      [start, at(0, front - 0.1)],
      pathWidth(route),
      0.058,
      elevation,
      [outer],
    ),
    'cobble',
  );
  add('#deded6', drapedPolygon(outer, 0.059), 'mosaic');
  add('#535952', drapedPolygon(outer, 0.062, elevation, [inset]), 'stone');
  for (const door of doorPositions) {
    const star = Array.from({ length: 16 }, (_, index) => {
      const angle = (index * Math.PI) / 8;
      const radius = index % 2 ? 0.35 : 0.88;
      return at(
        door.u + Math.cos(angle) * radius,
        3.35 + Math.sin(angle) * radius,
      );
    });
    add('#4a514b', drapedPolygon(star, 0.066), 'stone');
  }
  for (const v of [2.2, 4.6])
    add(
      '#62685f',
      drapedPolygon(
        [
          at(left + 0.3, v - 0.08),
          at(right - 0.3, v - 0.08),
          at(right - 0.3, v + 0.08),
          at(left + 0.3, v + 0.08),
        ],
        0.061,
      ),
      'stone',
    );
}

export function buildingEntrance(feature: Feature, wallHeight: number) {
  if (
    (!feature.tags.building && !feature.tags['building:part']) ||
    feature.tags.historic === 'city_gate' ||
    feature.id === 560209917 ||
    feature.id === aveMariaFrontage.feature.id ||
    feature.tags['building:colour'] === '#52514f' ||
    meters(feature.tags.min_height, 0) > 0 ||
    streetFrontages.some((frontage) => frontage.building.id === feature.id)
  )
    return;
  const midpoint = center(feature.points);
  const nearest = paths
    .filter((path) => !path.tags.tunnel)
    .reduce<ReturnType<typeof projectRoute> | undefined>((best, path) => {
      const projection = projectRoute(midpoint, path.points);
      return !best || projection.distance < best.distance ? projection : best;
    }, undefined);
  if (!nearest)
    throw new Error('Building entrances require a mapped approach.');
  const candidates: {
    wall: readonly [Point, Point];
    face: Point;
    point: Point;
    normal: Point;
    angle: number;
    width: number;
    height: number;
    ground: number;
    doorstep: Point[];
    score: number;
  }[] = [];
  for (let i = 1; i < feature.points.length; i++) {
    const a = feature.points[i - 1],
      b = feature.points[i];
    const dx = b[0] - a[0],
      dz = b[1] - a[1],
      length = Math.hypot(dx, dz);
    const width = Math.min(1.25, length - 0.44);
    const height = Math.min(2.2, wallHeight - 0.15);
    if (width < 0.65 || height < 1.6) continue;
    const endClearance = (width + 0.24) / 2 + 0.05;
    const t = Math.max(
      endClearance / length,
      Math.min(
        1 - endClearance / length,
        ((nearest.point[0] - a[0]) * dx + (nearest.point[1] - a[1]) * dz) /
          (length * length),
      ),
    );
    let nx = -dz / length,
      nz = dx / length;
    const face: Point = [a[0] + dx * t, a[1] + dz * t];
    if (inside([face[0] + nx * 0.1, face[1] + nz * 0.1], feature.points)) {
      nx = -nx;
      nz = -nz;
    }
    const approach: Point = [face[0] + nx * 1.4, face[1] + nz * 1.4];
    if (
      parts.some(
        (part) => part.id !== feature.id && inside(approach, part.points),
      ) ||
      buildings.some(
        (building) =>
          building.id !== feature.id &&
          inside(approach, building.points) &&
          !building.holes.some((hole) => inside(approach, hole)),
      )
    )
      continue;
    const point: Point = [face[0] + nx * 0.025, face[1] + nz * 0.025];
    const angle = Math.atan2(nx, nz);
    const at = (u: number, v: number): Point => [
      point[0] + Math.cos(angle) * u + nx * v,
      point[1] - Math.sin(angle) * u + nz * v,
    ];
    const doorstep = [
      at(-width / 2 - 0.12, 0),
      at(width / 2 + 0.12, 0),
      at(width / 2 + 0.12, 0.65),
      at(-width / 2 - 0.12, 0.65),
    ];
    const levels = [...doorstep, point].map((p) => upperElevation(...p));
    const ground = Math.max(...levels) + 0.05;
    if (
      doorstep.some((p) => inside(p, feature.points)) ||
      [-width / 2, 0, width / 2].some((u) => {
        const outer = at(u, 0.08),
          inner = at(u, -0.08);
        return inside(outer, feature.points) || !inside(inner, feature.points);
      })
    )
      continue;
    candidates.push({
      wall: [a, b],
      face,
      point,
      normal: [nx, nz],
      angle,
      width,
      height,
      ground,
      doorstep,
      score:
        Math.hypot(face[0] - nearest.point[0], face[1] - nearest.point[1]) +
        (Math.max(...levels) - Math.min(...levels)) * 20 +
        (blocked(approach, upperElevation(...approach)) ? 200 : 0),
    });
  }
  return candidates.sort((a, b) => a.score - b.score)[0];
}

export function makeBuildingDoor(
  door: NonNullable<ReturnType<typeof buildingEntrance>>,
  add: AddGeometry,
) {
  const { point, ground, angle, width, height, normal } = door;
  add(
    '#b9ae98',
    positioned(
      new THREE.BoxGeometry(width + 0.24, height + 0.18, 0.14),
      point,
      ground + height / 2 + 0.04,
      angle,
    ),
    'stone',
  );
  const front: Point = [point[0] + normal[0] * 0.1, point[1] + normal[1] * 0.1];
  add(
    '#59634d',
    positioned(
      new THREE.BoxGeometry(width, height, 0.08),
      front,
      ground + height / 2,
      angle,
    ),
    'wood',
  );
  const handle: Point = [
    front[0] + Math.cos(angle) * width * 0.3 + normal[0] * 0.07,
    front[1] - Math.sin(angle) * width * 0.3 + normal[1] * 0.07,
  ];
  add(
    '#b8a47a',
    positioned(
      new THREE.BoxGeometry(0.06, 0.2, 0.06),
      handle,
      ground + height * 0.48,
      angle,
    ),
    'metal',
  );
  add(
    '#b9b29f',
    drapedPolygon(door.doorstep, 0, () => ground),
    'stone',
  );
  add(
    '#b9b29f',
    continuousWall(
      [...door.doorstep, door.doorstep[0]],
      0.08,
      (point) => ({ bottom: upperElevation(...point) - 0.05, top: ground }),
      false,
    ),
    'stone',
  );
}

export function decorateBuilding(
  feature: Feature,
  ground: number,
  wallHeight: number,
  add: AddGeometry,
) {
  if (feature.id === aveMariaFrontage.feature.id) {
    makeAveMaria(ground, wallHeight, add);
    return;
  }
  const church = feature.tags['building:colour'] === '#52514f';
  const tower = church && feature.tags.height === '60';
  const entrance = buildingEntrance(feature, wallHeight);
  if (entrance) makeBuildingDoor(entrance, add);
  const [cx, cz] = center(feature.points);
  if (!church && Math.hypot(cx + 80, cz - 40) > 390) return;
  const ring = feature.points;
  const frontage = streetFrontages.find(
    (frontage) => frontage.building.id === feature.id,
  );
  const front = (z: number) => buildingFront(feature, z);
  let remaining = church ? 60 : 24;
  for (let i = 1; i < ring.length; i++) {
    const a = ring[i - 1],
      b = ring[i];
    const dx = b[0] - a[0],
      dz = b[1] - a[1],
      length = Math.hypot(dx, dz);
    if (length < 3.4) continue;
    let nx = -dz / length,
      nz = dx / length;
    const mid: Point = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    if (inside([mid[0] + nx, mid[1] + nz], ring)) {
      nx = -nx;
      nz = -nz;
    }
    if (
      feature.tags['building:part'] &&
      parts.some(
        (part) =>
          part.id !== feature.id &&
          inside([mid[0] + nx * 0.3, mid[1] + nz * 0.3], part.points),
      )
    )
      continue;
    const angle = Math.atan2(nx, nz);
    const portalFacade = church && nx < -0.6;
    const columns = Math.min(
      tower ? 2 : 8,
      Math.max(1, Math.floor(length / (church ? 6.5 : 3.8))),
    );
    const rows = tower
      ? [7, 20, 33]
      : church
        ? [4.5]
        : Array.from(
            { length: Math.min(3, Math.floor((wallHeight - 1) / 3.2)) },
            (_, row) => 1.8 + row * 3.2,
          );
    for (const floor of rows)
      for (let col = 0; col < columns && remaining > 0; col++) {
        remaining--;
        const t = (col + 0.5) / columns;
        const p: Point = [a[0] + dx * t + nx * 0.04, a[1] + dz * t + nz * 0.04];
        if (
          entrance &&
          Math.hypot(p[0] - entrance.point[0], p[1] - entrance.point[1]) <
            1.4 &&
          ground + floor < entrance.ground + entrance.height + 0.5
        )
          continue;
        if (church && (!portalFacade || (tower && floor >= 14)))
          archWindow(
            add,
            p,
            ground + floor,
            angle,
            tower ? 1.6 : 2.1,
            tower ? 5.3 : 8.5,
          );
        else if (
          !church &&
          !(
            frontage &&
            floor === 1.8 &&
            -nx * frontage.axis[1] + nz * frontage.axis[0] > 0.8
          )
        )
          rectangularWindow(add, p, ground + floor, angle, 1.1, 1.65);
      }
    const trimLevels = tower ? [1, 17, 30, wallHeight] : [0.35, wallHeight];
    for (const level of trimLevels) {
      if (portalFacade && level < 7) continue;
      const trimHeight = level === 0.35 ? 0.45 : 0.22;
      const doors = [
        ...(entrance
          ? [
              {
                point: entrance.face,
                width: entrance.width + 0.32,
                ground: entrance.ground,
                height: entrance.height + 0.18,
              },
            ]
          : []),
        ...(frontage
          ? [
              {
                point: [
                  frontage.center[0] +
                    (Math.sin(frontage.angle) * frontage.depth) / 2,
                  frontage.center[1] +
                    (Math.cos(frontage.angle) * frontage.depth) / 2,
                ] as Point,
                width: 1.4,
                ground: frontage.doorGround,
                height: 2.3,
              },
            ]
          : []),
      ];
      let spans = [[-0.05, length + 0.05]];
      for (const door of doors) {
        if (
          ground + level + trimHeight / 2 <= door.ground ||
          ground + level - trimHeight / 2 >= door.ground + door.height ||
          projectRoute(door.point, [a, b]).distance > 0.15
        )
          continue;
        const along =
          ((door.point[0] - a[0]) * dx + (door.point[1] - a[1]) * dz) / length;
        const left = along - door.width / 2,
          right = along + door.width / 2;
        spans = spans.flatMap(([start, end]) =>
          right <= start || left >= end
            ? [[start, end]]
            : [
                [start, Math.min(end, left)],
                [Math.max(start, right), end],
              ].filter(([start, end]) => end - start > 0.01),
        );
      }
      for (const [start, end] of spans) {
        const trim = new THREE.BoxGeometry(
          end - start,
          trimHeight,
          church ? 0.38 : 0.25,
        );
        trim.rotateY(-Math.atan2(dz, dx));
        trim.translate(
          a[0] + (dx * (start + end)) / (2 * length) + nx * 0.05,
          ground + level,
          a[1] + (dz * (start + end)) / (2 * length) + nz * 0.05,
        );
        add(church ? '#aaa38f' : '#c5bba5', trim, 'stone');
      }
    }
    if (church && !tower && length > 8) {
      for (let col = 0; col <= columns; col++) {
        const t = col / columns;
        const p: Point = [a[0] + dx * t + nx * 0.4, a[1] + dz * t + nz * 0.4];
        add(
          '#686c63',
          positioned(
            new THREE.BoxGeometry(0.6, 10, 0.85),
            p,
            ground + 5,
            angle,
          ),
          'stone',
        );
        add(
          '#676e6b',
          positioned(
            new THREE.ConeGeometry(0.6, 1.1, 4),
            p,
            ground + 10.5,
            angle,
          ),
          'slate',
        );
      }
    }
  }
  if (tower) {
    const frame = orientedBounds(feature.points);
    for (const sx of [-1, 1])
      for (const sz of [-1, 1]) {
        const x =
          frame.center[0] +
          frame.axis[0] * sx * frame.width * 0.49 -
          frame.axis[1] * sz * frame.depth * 0.49;
        const z =
          frame.center[1] +
          frame.axis[1] * sx * frame.width * 0.49 +
          frame.axis[0] * sz * frame.depth * 0.49;
        add(
          '#aaa38f',
          positioned(
            new THREE.BoxGeometry(0.65, wallHeight + 1.5, 0.65),
            [x, z],
            ground + (wallHeight + 1.5) / 2,
            frame.angle,
          ),
          'stone',
        );
        for (const level of [0.35, 17, 30, wallHeight])
          add(
            '#b3b29c',
            positioned(
              new THREE.BoxGeometry(0.95, 0.4, 0.95),
              [x, z],
              ground + level,
              frame.angle,
            ),
            'stone',
          );
        add(
          '#686d69',
          positioned(
            new THREE.ConeGeometry(0.35, 3.6, 8),
            [x, z],
            ground + wallHeight + 2.5,
          ),
          'slate',
        );
      }
  }
  if (feature.id === 454748869) {
    const face = front(7.9);
    archWindow(
      add,
      face.point,
      cathedralEntrance.doors[1].threshold,
      face.angle,
      4.6,
      6.5,
      true,
    );
    archWindow(add, face.point, ground + 9.0, face.angle, 4.3, 7.8);
    makeCathedralForecourt(add);
  }
  if (feature.id === 454748868 || feature.id === 454748870) {
    const face = front(feature.id === 454748868 ? -0.5 : 16.6);
    const door = cathedralEntrance.doors[feature.id === 454748868 ? 0 : 2];
    archWindow(add, face.point, door.threshold, face.angle, 2.9, 4.8, true);
    archWindow(add, face.point, ground + 7.5, face.angle, 0.95, 4.4);
  }
}

export function makeAveMaria(
  ground: number,
  wallHeight: number,
  add: AddGeometry,
) {
  const frame = aveMariaFrontage;
  const { point, normal, angle } = frame;
  const at = (u: number, v = 0): Point => [
    point[0] + Math.cos(angle) * u + normal[0] * v,
    point[1] - Math.sin(angle) * u + normal[1] * v,
  ];
  const doorstep = [at(-0.95), at(0.95), at(0.95, 0.65), at(-0.95, 0.65)];
  const floor = Math.max(...doorstep.map((p) => upperElevation(...p))) + 0.05;
  makeBuildingDoor(
    { ...frame, width: 1.65, height: 2.65, ground: floor, doorstep, score: 0 },
    add,
  );
  const top = ground + wallHeight;
  for (const side of [-1, 1]) {
    add(
      '#d1c9b5',
      positioned(
        new THREE.BoxGeometry(0.32, top - floor, 0.28),
        at(side * (frame.width / 2 - 0.14), 0.1),
        (top + floor) / 2,
        angle,
      ),
      'plaster',
    );
    add(
      '#d5cbb4',
      positioned(
        new THREE.BoxGeometry(0.3, 0.22, 0.36),
        at(side * (frame.width / 2 - 0.14), 0.12),
        top + 0.05,
        angle,
      ),
      'stone',
    );
    add(
      '#c7bea9',
      positioned(
        new THREE.SphereGeometry(0.17, 12, 8),
        at((side * frame.width) / 2, 0.08),
        top + 0.28,
      ),
      'stone',
    );
  }
  add(
    '#d7cfbb',
    positioned(
      new THREE.BoxGeometry(frame.width + 0.5, 0.22, 0.42),
      at(0, 0.1),
      top + 0.08,
      angle,
    ),
    'stone',
  );
  const pediment = new THREE.Shape();
  pediment.moveTo(-frame.width / 2, 0);
  pediment.lineTo(frame.width / 2, 0);
  pediment.lineTo(0, 1.04);
  pediment.closePath();
  const crest = new THREE.ExtrudeGeometry(pediment, {
    depth: 0.18,
    bevelEnabled: false,
  });
  crest.translate(0, top + 0.18, -0.09);
  crest.rotateY(angle);
  crest.translate(
    ...([at(0, 0.12)[0], 0, at(0, 0.12)[1]] as [number, number, number]),
  );
  add('#e5dfcd', crest, 'plaster');
  add(
    '#d6ceba',
    positioned(
      new THREE.CylinderGeometry(0.24, 0.28, 0.65, 8),
      at(0, -0.08),
      top + 1.48,
    ),
    'plaster',
  );
  add(
    '#796553',
    positioned(new THREE.ConeGeometry(0.38, 0.42, 8), at(0, -0.08), top + 2.0),
    'slate',
  );
  for (const geometry of [
    new THREE.BoxGeometry(0.055, 0.55, 0.055),
    new THREE.BoxGeometry(0.28, 0.055, 0.055),
  ])
    add(
      '#665f4b',
      positioned(geometry, at(0, -0.08), top + 2.35, angle),
      'metal',
    );
  for (const wall of frame.feature.points
    .slice(1)
    .map((b, i) => [frame.feature.points[i], b] as const)) {
    if (
      wall[0] === frame.wall[0] ||
      Math.hypot(wall[1][0] - wall[0][0], wall[1][1] - wall[0][1]) < 4
    )
      continue;
    const p: Point = [
      (wall[0][0] + wall[1][0]) / 2,
      (wall[0][1] + wall[1][1]) / 2,
    ];
    let nx = -(wall[1][1] - wall[0][1]),
      nz = wall[1][0] - wall[0][0];
    const length = Math.hypot(nx, nz);
    nx /= length;
    nz /= length;
    if (inside([p[0] + nx * 0.1, p[1] + nz * 0.1], frame.feature.points)) {
      nx = -nx;
      nz = -nz;
    }
    archWindow(
      add,
      [p[0] + nx * 0.03, p[1] + nz * 0.03],
      ground + 1.0,
      Math.atan2(nx, nz),
      0.8,
      1.65,
    );
  }
}

export function makeSpickaGate(add: AddGeometry) {
  const { frame, ground } = spickaGate;
  const place = (
    geometry: THREE.BufferGeometry,
    color: string,
    kind: MaterialKind = 'stone',
  ) =>
    add(color, positioned(geometry, frame.center, ground, frame.angle), kind);
  for (const opening of spickaGate.openings) {
    const { offset, halfWidth, spring } = opening;
    const pub = offset > 0;
    const left = pub ? 0 : -frame.width / 2;
    const right = pub ? frame.width / 2 : 0;
    const body = new THREE.Shape();
    body.moveTo(left, -1);
    body.lineTo(offset - halfWidth, -1);
    body.lineTo(offset - halfWidth, spring);
    body.quadraticCurveTo(
      offset - halfWidth,
      spring + halfWidth * 0.9,
      offset,
      spring + halfWidth * 1.35,
    );
    body.quadraticCurveTo(
      offset + halfWidth,
      spring + halfWidth * 0.9,
      offset + halfWidth,
      spring,
    );
    body.lineTo(offset + halfWidth, -1);
    body.lineTo(right, -1);
    if (pub) {
      body.lineTo(right, 4.6);
      body.lineTo(left, 4.6);
    } else {
      for (const [u, height] of [
        [0, 4.6],
        [-1.8, 4.5],
        [-3.4, 4.8],
        [-4.8, 4.45],
        [-5.8, 4.6],
        [-7.2, 4.35],
      ])
        body.lineTo(u, height);
    }
    body.closePath();
    place(
      new THREE.ExtrudeGeometry(body, {
        depth: pub ? 3.4 : frame.depth,
        bevelEnabled: false,
        curveSegments: 24,
      }).translate(0, 0, pub ? -0.2 : -frame.depth / 2),
      pub ? '#d9d0b9' : '#aaa18a',
      pub ? 'plaster' : 'stone',
    );
    for (const face of pub ? [1] : [-1, 1]) {
      const outer = halfWidth + 0.3;
      const trim = new THREE.Shape();
      trim.moveTo(offset - outer, -0.1);
      trim.lineTo(offset - outer, spring);
      trim.quadraticCurveTo(
        offset - outer,
        spring + outer * 0.9,
        offset,
        spring + outer * 1.35,
      );
      trim.quadraticCurveTo(
        offset + outer,
        spring + outer * 0.9,
        offset + outer,
        spring,
      );
      trim.lineTo(offset + outer, -0.1);
      trim.lineTo(offset + halfWidth, -0.1);
      trim.lineTo(offset + halfWidth, spring);
      trim.quadraticCurveTo(
        offset + halfWidth,
        spring + halfWidth * 0.9,
        offset,
        spring + halfWidth * 1.35,
      );
      trim.quadraticCurveTo(
        offset - halfWidth,
        spring + halfWidth * 0.9,
        offset - halfWidth,
        spring,
      );
      trim.closePath();
      place(
        new THREE.ExtrudeGeometry(trim, {
          depth: 0.16,
          bevelEnabled: false,
          curveSegments: 24,
        }).translate(0, 0, face * (frame.depth / 2 + 0.035) - 0.08),
        '#c5b89a',
      );
    }
  }
  for (const approach of spickaGate.approaches)
    add(
      '#b6ac98',
      pathRibbon(approach.points, approach.width, 0.055),
      'cobble',
    );
  place(
    new THREE.BoxGeometry(7.2, 5.6, 3).translate(3.6, 1.8, -1.7),
    '#d9d0b9',
    'plaster',
  );
  for (const side of [-1, 1])
    place(
      new THREE.BoxGeometry(7.7, 0.16, Math.hypot(3.5, 1.4))
        .rotateX(side * Math.atan2(1.4, 3.5))
        .translate(3.6, 5.3, side * 1.75),
      '#9f6649',
      'slate',
    );
  const gable = new THREE.BufferGeometry();
  gable.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(
      [
        0, 4.6, -3.2, 0, 4.6, 3.2, 0, 6, 0, 7.2, 4.6, 3.2, 7.2, 4.6, -3.2, 7.2,
        6, 0,
      ],
      3,
    ),
  );
  gable.computeVertexNormals();
  place(gable, '#d9d0b9', 'plaster');
  place(
    new THREE.BoxGeometry(1.4, 2.5, 0.12).translate(3.6, 1.25, -0.12),
    '#4b493c',
    'wood',
  );
  place(
    new THREE.BoxGeometry(0.95, 1.1, 0.04).translate(3.6, 1.65, -0.04),
    '#435958',
    'glass',
  );
  place(
    new THREE.BoxGeometry(0.045, 0.25, 0.08).translate(4.1, 1.1, 0),
    '#b69c67',
    'metal',
  );
}

export function makeGate(feature: Feature, ground: number, add: AddGeometry) {
  if (feature.id === spickaGate.feature.id) {
    makeSpickaGate(add);
    return;
  }
  const frame = gateFrame(feature);
  const width = frame.width;
  const depth = Math.max(2.2, frame.depth);
  if (feature.id === gardenPortal.id) {
    const place = (
      geometry: THREE.BufferGeometry,
      color = '#d5d1bd',
      kind: MaterialKind = 'plaster',
    ) =>
      add(color, positioned(geometry, frame.center, ground, frame.angle), kind);
    const opening = gateOpenings(feature)[0];
    const pier = (width / 2 - opening.halfWidth) / 2;
    const lintel = opening.spring + opening.halfWidth;
    for (const side of [-1, 1]) {
      const x = side * (opening.halfWidth + pier);
      place(
        new THREE.BoxGeometry(pier * 2, lintel + 0.35, frame.depth).translate(
          x,
          (lintel + 0.35) / 2,
          0,
        ),
      );
      place(
        new THREE.BoxGeometry(
          pier * 2 + 0.12,
          0.22,
          frame.depth + 0.2,
        ).translate(x, 0.11, 0),
        '#b5b3a5',
        'stone',
      );
    }
    place(
      new THREE.BoxGeometry(width, 0.35, frame.depth).translate(
        0,
        lintel + 0.175,
        0,
      ),
    );
    const triangle = new THREE.Shape();
    triangle.moveTo(-width * 0.45, lintel + 0.35);
    triangle.lineTo(width * 0.45, lintel + 0.35);
    triangle.lineTo(0, lintel + 1.6);
    triangle.closePath();
    place(
      new THREE.ExtrudeGeometry(triangle, {
        depth: frame.depth,
        bevelEnabled: false,
      }).translate(0, 0, -frame.depth / 2),
    );
    for (const face of [-1, 1]) {
      place(
        new THREE.CylinderGeometry(0.38, 0.38, 0.12, 8)
          .rotateX(Math.PI / 2)
          .translate(0, lintel + 0.78, face * (frame.depth / 2 + 0.05)),
        '#a9a48c',
        'stone',
      );
      for (const side of [-1, 1])
        place(
          new THREE.BoxGeometry(0.07, 0.52, 0.06)
            .rotateZ(side * 0.6)
            .translate(0, lintel + 0.78, face * (frame.depth / 2 + 0.14)),
          '#ccc5a8',
          'stone',
        );
    }
    return;
  }
  const openings = gateOpenings(feature);
  const height =
    feature.id === 51700613
      ? Math.min(
          ...samplePolyline(feature.points).map((point) =>
            originalElevation(...point),
          ),
        ) -
        ground -
        0.3
      : meters(feature.tags.height, feature.id === 51718887 ? 8.4 : 8);
  const bottom = feature.id === 51700613 ? -1.5 : 0;
  const outline = new THREE.Shape();
  outline.moveTo(-width / 2, bottom);
  for (const { offset, halfWidth, spring } of openings) {
    outline.lineTo(offset - halfWidth, bottom);
    outline.lineTo(offset - halfWidth, spring);
    outline.absarc(offset, spring, halfWidth, Math.PI, 0, true);
    outline.lineTo(offset + halfWidth, bottom);
  }
  outline.lineTo(width / 2, bottom);
  outline.lineTo(width / 2, height);
  outline.lineTo(-width / 2, height);
  outline.closePath();
  const body = new THREE.ExtrudeGeometry(outline, {
    depth,
    bevelEnabled: false,
    curveSegments: 24,
  });
  body.translate(0, 0, -depth / 2);
  add(
    feature.id === 51700613
      ? '#ad8971'
      : feature.id === 49811189
        ? '#e1dbc8'
        : '#c8b99b',
    positioned(body, frame.center, ground, frame.angle),
    feature.id === 51700613
      ? 'brick'
      : feature.id === 49811189
        ? 'plaster'
        : 'stone',
  );
  const local = (
    geometry: THREE.BufferGeometry,
    x: number,
    y: number,
    z: number,
    color = '#ded1b4',
  ) => {
    geometry.translate(x, y, z);
    add(
      color,
      positioned(geometry, frame.center, ground, frame.angle),
      'stone',
    );
  };
  for (const face of [-1, 1]) {
    for (const { offset, halfWidth, spring } of openings) {
      for (const x of [offset - halfWidth - 0.3, offset + halfWidth + 0.3])
        local(
          new THREE.BoxGeometry(0.45, spring + halfWidth + 0.7, 0.5),
          x,
          (spring + halfWidth + 0.7) / 2,
          face * (depth / 2 + 0.12),
        );
      for (let i = 0; i < 11; i++) {
        const a = (i * Math.PI) / 11,
          b = ((i + 1) * Math.PI) / 11;
        const sector = new THREE.Shape();
        sector.absarc(0, spring, halfWidth + 0.45, a, b, false);
        sector.absarc(0, spring, halfWidth + 0.05, b, a, true);
        sector.closePath();
        const stones = new THREE.ExtrudeGeometry(sector, {
          depth: 0.22,
          bevelEnabled: false,
          curveSegments: 6,
        });
        if (face < 0) stones.translate(0, 0, -0.22);
        local(stones, offset, 0, (face * depth) / 2);
      }
    }
    local(
      new THREE.BoxGeometry(width + 0.5, 0.35, 0.4),
      0,
      height - 1.2,
      (face * depth) / 2,
    );
  }
  if (feature.id === 51700613) return;
  if (feature.id === 49811189) {
    local(
      new THREE.BoxGeometry(width + 0.5, 0.22, depth + 0.5),
      0,
      height + 0.1,
      0,
      '#c7bfaa',
    );
    for (const face of [-1, 1]) {
      for (const x of [
        -width * 0.39,
        -width * 0.13,
        width * 0.13,
        width * 0.39,
      ]) {
        local(
          new THREE.CylinderGeometry(0.15, 0.19, 2.7, 20),
          x,
          height - 1.9,
          face * (depth / 2 + 0.1),
          '#d7d1bf',
        );
      }
      for (const x of [-width * 0.26, 0, width * 0.26]) {
        const recess = new THREE.Shape();
        recess.moveTo(-0.38, 0);
        recess.lineTo(0.38, 0);
        recess.lineTo(0.38, 0.85);
        recess.absarc(0, 0.85, 0.38, 0, Math.PI, false);
        recess.closePath();
        local(
          new THREE.ShapeGeometry(recess, 24),
          x,
          height - 2.7,
          face * (depth / 2 + 0.025),
          '#aaa897',
        );
        local(
          new THREE.BoxGeometry(0.17, 0.5, 0.04),
          x,
          height - 2.22,
          face * (depth / 2 + 0.055),
          '#42473e',
        );
      }
      local(
        new THREE.BoxGeometry(width + 0.4, 0.18, 0.35),
        0,
        height - 0.45,
        (face * depth) / 2,
        '#d7d1bf',
      );
    }
    const w = width / 2 + 0.35,
      d = depth / 2 + 0.35,
      ridge = Math.max(0.2, (depth - width) / 2);
    const a = [-w, 0, -d],
      b = [w, 0, -d],
      c = [w, 0, d],
      e = [-w, 0, d];
    const p = [0, 1.9, -ridge],
      q = [0, 1.9, ridge];
    const vertices = [
      ...a,
      ...p,
      ...b,
      ...b,
      ...p,
      ...q,
      ...b,
      ...q,
      ...c,
      ...c,
      ...q,
      ...e,
      ...e,
      ...q,
      ...p,
      ...e,
      ...p,
      ...a,
    ];
    const roof = new THREE.BufferGeometry();
    roof.setAttribute(
      'position',
      new THREE.Float32BufferAttribute(vertices, 3),
    );
    roof.computeVertexNormals();
    add(
      '#9e6347',
      positioned(roof, frame.center, ground + height + 0.22, frame.angle),
      'slate',
    );
    return;
  }
  if (feature.id === 51718887) {
    for (const face of [-1, 1]) {
      const surface = face * (depth / 2 + 0.18);
      let left = -width / 2;
      for (const opening of [
        ...openings,
        { offset: width / 2, halfWidth: 0, spring: 0 },
      ]) {
        const right = opening.offset - opening.halfWidth;
        if (right - left > 0.5) {
          const x = (left + right) / 2,
            w = Math.min(0.85, (right - left) * 0.85);
          local(
            new THREE.BoxGeometry(w, height - 0.7, 0.3),
            x,
            (height - 0.7) / 2,
            surface,
            '#c1bba8',
          );
          for (const y of [0.3, height - 1.35, height - 0.85])
            local(
              new THREE.BoxGeometry(w + 0.22, 0.24, 0.45),
              x,
              y,
              surface,
              '#d0c8b4',
            );
        }
        left = opening.offset + opening.halfWidth;
      }
      local(
        new THREE.BoxGeometry(width + 0.6, 0.28, 0.55),
        0,
        height,
        surface,
        '#b0aa98',
      );
      for (const side of [-1, 1]) {
        local(
          new THREE.TorusGeometry(0.43, 0.12, 8, 28).scale(0.8, 1.2, 1),
          side * width * 0.16,
          height + 0.75,
          surface + face * 0.08,
          '#8e8c80',
        );
        local(
          new THREE.SphereGeometry(0.19, 12, 8),
          side * width * 0.4,
          height + 0.45,
          surface,
          '#aaa694',
        );
      }
      local(
        new THREE.CylinderGeometry(0.4, 0.33, 0.18, 8).rotateX(Math.PI / 2),
        0,
        height + 1.25,
        surface + face * 0.08,
        '#85867d',
      );
    }
    const attic = new THREE.Shape();
    attic.moveTo(-width * 0.32, 0);
    attic.lineTo(width * 0.32, 0);
    attic.lineTo(width * 0.28, 1.35);
    attic.lineTo(0, 2.15);
    attic.lineTo(-width * 0.28, 1.35);
    attic.closePath();
    local(
      new THREE.ExtrudeGeometry(attic, {
        depth: depth + 0.15,
        bevelEnabled: false,
      }).translate(0, 0, -(depth + 0.15) / 2),
      0,
      height + 0.14,
      0,
      '#bcb49f',
    );
    local(
      new THREE.SphereGeometry(0.23, 12, 8),
      0,
      height + 2.45,
      0,
      '#8f9284',
    );
    return;
  }
  for (const side of [-1, 1]) {
    local(
      new THREE.BoxGeometry(width + 0.75, 0.28, depth + 0.55),
      0,
      height + side * 0.18,
      0,
    );
  }
  local(
    new THREE.BoxGeometry(width * 0.45, 1.2, depth * 0.85),
    0,
    height + 0.9,
    0,
    '#c8b99b',
  );
  local(
    new THREE.CylinderGeometry(0.8, 0.8, 0.25, 24).rotateX(Math.PI / 2),
    0,
    height - 0.45,
    -depth / 2 - 0.22,
    '#b2a48e',
  );
}

export function makeEnclosureDetails(add: AddGeometry) {
  for (const wall of walls) {
    const cemetery = cemeterySolidWallIds.has(wall.id);
    const streetWall = wall.id === 55117755;
    if (!cemetery && !streetWall && ![8888302, 33878732].includes(wall.id))
      continue;
    let run: Point[] = [];
    const emit = () => {
      if (run.length > 1)
        add(
          cemetery ? '#c2baa5' : '#9a735c',
          continuousWall(
            run,
            (point) => wallThickness(wall, point) + 0.2,
            (point, normal) => {
              const top = wallProfile(wall, point, normal).top;
              return { bottom: top - 0.04, top: top + 0.16 };
            },
            false,
          ),
          'stone',
        );
      run = [];
    };
    for (const points of rampartWallRuns(wall)) {
      for (const point of samplePolyline(points, 0.9)) {
        if (coverAt(point)?.id === 12461779632 || wallOpening(point)) emit();
        else run.push(point);
      }
      emit();
    }
    if (!cemetery) continue;
    for (const point of samplePolyline(wall.points, 6).filter(
      (_, i) => i % 2 === 0,
    )) {
      if (wallOpening(point)) continue;
      const projection = projectRoute(point, wall.points);
      const profile = wallProfile(wall, point, projection.normal);
      const ground = elevation(...point);
      const h = profile.top - ground;
      add(
        '#c0b59b',
        positioned(
          new THREE.BoxGeometry(1.15, h, 1.15),
          point,
          ground + h / 2,
          Math.atan2(projection.normal[0], projection.normal[1]),
        ),
        'stone',
      );
      add(
        '#c9c0aa',
        positioned(
          new THREE.BoxGeometry(1.35, 0.2, 1.35),
          point,
          profile.top + 0.16,
        ),
        'stone',
      );
    }
  }
}

export function makeSlavin(add: AddGeometry) {
  const ground = elevation(...slavin.point);
  const emit = (
    geometry: THREE.BufferGeometry,
    color = '#b5aa90',
    kind: MaterialKind = 'stone',
  ) =>
    add(color, positioned(geometry, slavin.point, ground, slavin.angle), kind);
  const block = (
    w: number,
    h: number,
    d: number,
    x: number,
    y: number,
    z: number,
    color = '#b5aa90',
    kind: MaterialKind = 'stone',
  ) => emit(new THREE.BoxGeometry(w, h, d).translate(x, y, z), color, kind);
  const sphere = (
    x: number,
    y: number,
    z: number,
    sx: number,
    sy: number,
    sz: number,
    color = '#817c5d',
  ) =>
    emit(
      new THREE.SphereGeometry(1, 20, 14).scale(sx, sy, sz).translate(x, y, z),
      color,
      'metal',
    );
  for (let i = 0; i < 7; i++) {
    const top = (i + 1) * 0.15;
    block(15.4, top + 0.3, 0.7, 0, (top - 0.3) / 2, 6.05 - i * 0.7, '#a9a28d');
  }
  block(15.4, 1.15, 3.8, 0, 0.475, 0, '#aaa28d');
  for (const side of [-1, 1]) {
    block(4.6, 2.7, 0.75, side * 5.2, 2.4, -1.05);
    block(4.85, 0.2, 1.05, side * 5.2, 3.85, -1.05, '#c9bfa6');
    for (const offset of [-1.35, 0, 1.35]) {
      block(
        1.06,
        1.75,
        0.08,
        side * 5.2 + offset,
        2.6,
        -0.62,
        '#44483f',
        'metal',
      );
      for (let row = 0; row < 5; row++)
        block(
          0.65 - (row % 2) * 0.1,
          0.022,
          0.035,
          side * 5.2 + offset,
          3.12 - row * 0.25,
          -0.56,
          '#b3a775',
          'metal',
        );
    }
    block(1.8, 0.85, 1.7, side * 3.65, 1.65, 0.3);
    emit(
      new THREE.ConeGeometry(0.58, 1.5, 28)
        .scale(1, 1, 0.8)
        .translate(side * 3.65, 2.65, 0.35),
      '#a69b81',
    );
    sphere(side * 3.65, 3.35, 0.25, 0.3, 0.48, 0.24, '#aaa084');
    sphere(side * 3.65, 3.94, 0.27, 0.2, 0.26, 0.21, '#aaa084');
    sphere(side * 3.4, 3.18, 0.68, 0.17, 0.48, 0.16, '#aaa084');
  }
  block(4.55, 4.55, 2.5, 0, 3.325, -0.2);
  block(4.95, 0.28, 2.8, 0, 5.75, -0.2, '#c6b99b');
  block(4.7, 0.2, 2.65, 0, 1.2, -0.2, '#c6b99b');
  for (const x of [-1.4, 0, 1.4]) {
    block(1.12, 2.5, 0.075, x, 3.55, 1.09, '#3d453f', 'metal');
    for (let row = 0; row < 8; row++)
      block(
        0.76 - (row % 3) * 0.1,
        0.028,
        0.03,
        x,
        4.54 - row * 0.27,
        1.145,
        '#b2a57a',
        'metal',
      );
  }
  for (const x of [-2.08, 2.08])
    block(0.22, 4.25, 0.25, x, 3.4, 1.14, '#c7b99b');
  block(3.6, 0.65, 1.55, 0, 6.25, -0.1, '#a99d81');
  block(3.95, 0.18, 1.75, 0, 6.67, -0.1, '#c4b799');
  sphere(0.9, 7.15, 0.38, 0.38, 0.65, 0.3);
  sphere(0.62, 7.94, 0.42, 0.23, 0.29, 0.24);
  sphere(0.82, 6.65, 0.82, 0.35, 0.75, 0.3);
  sphere(0.02, 7.06, 0.7, 0.65, 0.13, 0.14);
  for (const side of [-1, 1]) {
    const wing = new THREE.Shape();
    wing.moveTo(0.88, 7.2);
    wing.quadraticCurveTo(1.7, 8.65, 2.25, 8.95);
    wing.quadraticCurveTo(2.4, 7.9, 1.15, 7.15);
    wing.closePath();
    const feathers = new THREE.ExtrudeGeometry(wing, {
      depth: 0.12,
      bevelEnabled: false,
      curveSegments: 20,
    });
    feathers.translate(0, 0, -0.2 + side * 0.25);
    feathers.rotateY(side * 0.25);
    emit(feathers, '#817c5d', 'metal');
  }
  block(2.5, 0.4, 1.65, 0, 0.35, 3.6, '#a79c83');
  block(2.15, 1.05, 1.3, 0, 1.075, 3.6);
  block(2.65, 0.2, 1.8, 0, 1.7, 3.6, '#c2b69a');
  block(0.17, 1.75, 0.16, 0, 2.67, 3.65, '#52715c', 'metal');
  block(1.15, 0.17, 0.16, 0, 3.12, 3.65, '#52715c', 'metal');
  sphere(0, 2.93, 3.8, 0.16, 0.28, 0.1, '#5e725a');
}

export function makeStreetFurniture(add: AddGeometry) {
  for (const {
    point,
    angle,
    ground: y,
    bench,
    lamp: hasLamp,
  } of streetFurniture) {
    if (bench) {
      for (let slat = 0; slat < 5; slat++) {
        add(
          '#86694b',
          positioned(
            new THREE.BoxGeometry(1.8, 0.065, 0.095).translate(
              0,
              0.45,
              slat * 0.105 - 0.21,
            ),
            point,
            y,
            angle,
          ),
          'wood',
        );
        add(
          '#86694b',
          positioned(
            new THREE.BoxGeometry(1.8, 0.075, 0.07).translate(
              0,
              0.75 + slat * 0.08,
              -0.25,
            ),
            point,
            y,
            angle,
          ),
          'wood',
        );
      }

      for (const side of [-1, 1]) {
        const foot: Point = [
          point[0] + Math.cos(angle) * side * 0.72,
          point[1] - Math.sin(angle) * side * 0.72,
        ];
        const bottom =
          Math.min(
            ...[-0.275, 0.275].map((v) =>
              upperElevation(
                foot[0] + Math.sin(angle) * v,
                foot[1] + Math.cos(angle) * v,
              ),
            ),
          ) - 0.04;
        const top = y + 0.825;
        add(
          '#33443b',
          positioned(
            new THREE.BoxGeometry(0.09, top - bottom, 0.55).translate(
              side * 0.72,
              (top + bottom) / 2 - y,
              0,
            ),
            point,
            y,
            angle,
          ),
          'metal',
        );
      }
    }
    if (!hasLamp) continue;
    const lamp: Point = bench
      ? [point[0] + Math.cos(angle) * 3, point[1] - Math.sin(angle) * 3]
      : point;
    const ly = upperElevation(...lamp);
    add(
      '#3f4c44',
      positioned(
        new THREE.CylinderGeometry(0.055, 0.13, 4.2, 12),
        lamp,
        ly + 2.1,
      ),
      'metal',
    );
    add(
      '#4a554b',
      positioned(
        new THREE.CylinderGeometry(0.21, 0.25, 0.12, 8),
        lamp,
        ly + 4.15,
      ),
      'metal',
    );
    add(
      '#ead9a7',
      positioned(
        new THREE.CylinderGeometry(0.22, 0.14, 0.48, 4),
        lamp,
        ly + 4.43,
      ),
      'lamp',
    );
    add(
      '#3f4c44',
      positioned(new THREE.ConeGeometry(0.32, 0.26, 4), lamp, ly + 4.8),
      'metal',
    );
  }
}

export function makeCemeteryArcade(feature: Feature, add: AddGeometry) {
  const arcade = cemeteryArcades.find(
    (arcade) => arcade.feature.id === feature.id,
  );
  if (!arcade) throw new Error('Missing cemetery arcade alignment.');
  const ground = foundation(feature);
  const footprint = new THREE.Shape(
    feature.points.map(([x, z]) => new THREE.Vector2(x, -z)),
  );
  const slab = (bottom: number, height: number, color: string) => {
    const geometry = new THREE.ExtrudeGeometry(footprint, {
      depth: height,
      bevelEnabled: false,
    });
    geometry.rotateX(-Math.PI / 2);
    geometry.translate(0, ground + bottom, 0);
    add(color, geometry, 'stone');
  };
  slab(-0.15, 0.2, '#b7afa0');
  slab(4.05, 0.2, '#c6bca7');
  const roofVertices: number[] = [];
  const outline: Polygon = [feature.points.map(([x, z]) => [x, z])];
  const minX = Math.floor(Math.min(...feature.points.map((p) => p[0])) * 2) / 2;
  const maxX = Math.max(...feature.points.map((p) => p[0]));
  const minZ = Math.floor(Math.min(...feature.points.map((p) => p[1])) * 2) / 2;
  const maxZ = Math.max(...feature.points.map((p) => p[1]));
  // Roof hips need their own fine, shared-edge grid, not the five-metre terrain triangulation.
  for (let x = minX; x < maxX; x += 0.5)
    for (let z = minZ; z < maxZ; z += 0.5)
      for (const polygon of polygonClipping.intersection(outline, [
        [
          [x, z],
          [x + 0.5, z],
          [x + 0.5, z + 0.5],
          [x, z + 0.5],
          [x, z],
        ],
      ])) {
        const rings = polygon.map((ring) => ring.slice(0, -1));
        const points = rings.flat();
        const vectors = rings.map((ring) =>
          ring.map(([x, z]) => new THREE.Vector2(x, -z)),
        );
        for (const face of THREE.ShapeUtils.triangulateShape(
          vectors[0],
          vectors.slice(1),
        ))
          for (const index of face) {
            const [rx, rz] = points[index];
            roofVertices.push(
              rx,
              ground +
                4.25 +
                projectRoute([rx, rz], feature.points).distance * 0.3,
              rz,
            );
          }
      }
  const roof = new THREE.BufferGeometry();
  roof.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(roofVertices, 3),
  );
  roof.computeVertexNormals();
  add('#a4755c', roof, 'slate');
  for (const id of arcade.rearWalls) {
    const wall = walls.find((wall) => wall.id === id);
    if (!wall) throw new Error(`Missing arcade rear enclosure ${id}.`);
    add(
      '#b8ab8e',
      continuousWall(wall.points, cemeteryArcadeWallThickness, (point) => ({
        bottom: elevation(...point) - 0.3,
        top: ground + 4.08,
      })),
      'plaster',
    );
  }
  const columns = new Map<string, Point>();
  for (const bay of cemeteryArcadeBays.filter(
    (bay) => bay.feature.id === feature.id,
  )) {
    const radius = (bay.width - 0.42) / 2,
      spring = 2.25;
    const outline = new THREE.Shape();
    outline.moveTo(-bay.width / 2, spring);
    outline.lineTo(-radius, spring);
    outline.absarc(0, spring, radius, Math.PI, 0, true);
    outline.lineTo(bay.width / 2, spring);
    outline.lineTo(bay.width / 2, 4.12);
    outline.lineTo(-bay.width / 2, 4.12);
    outline.closePath();
    const arch = new THREE.ExtrudeGeometry(outline, {
      depth: 0.42,
      bevelEnabled: false,
      curveSegments: 24,
    });
    arch.translate(0, 0, -0.21);
    arch.rotateY(-Math.atan2(bay.axis[1], bay.axis[0]));
    arch.translate(bay.center[0], ground, bay.center[1]);
    add('#c8bda2', arch, 'plaster');
    for (const side of [-1, 1]) {
      const point: Point = [
        bay.center[0] + ((bay.axis[0] * bay.width) / 2) * side,
        bay.center[1] + ((bay.axis[1] * bay.width) / 2) * side,
      ];
      columns.set(point.map((v) => v.toFixed(3)).join(','), point);
    }
  }
  for (const point of columns.values()) {
    add(
      '#bfb49a',
      positioned(
        new THREE.CylinderGeometry(0.16, 0.2, 2.05, 20),
        point,
        ground + 1.18,
      ),
      'stone',
    );
    for (const height of [0.12, 2.23])
      add(
        '#d1c5a9',
        positioned(
          new THREE.BoxGeometry(0.46, 0.22, 0.46),
          point,
          ground + height,
        ),
        'stone',
      );
  }
}

export function makeCemeteryGate(add: AddGeometry) {
  const { center, axis, width, depth, halfWidth, spring, height } =
    cemeteryGate;
  const ground = elevation(...center),
    angle = -Math.atan2(axis[1], axis[0]);
  const local = (
    geometry: THREE.BufferGeometry,
    x: number,
    y: number,
    z: number,
    color: string,
    kind: MaterialKind = 'stone',
  ) => {
    geometry.translate(x, y, z);
    add(color, positioned(geometry, center, ground, angle), kind);
  };
  const outline = new THREE.Shape();
  outline.moveTo(-width / 2, -0.45);
  outline.lineTo(-halfWidth, -0.45);
  outline.lineTo(-halfWidth, spring);
  outline.absarc(0, spring, halfWidth, Math.PI, 0, true);
  outline.lineTo(halfWidth, -0.45);
  outline.lineTo(width / 2, -0.45);
  outline.lineTo(width / 2, height);
  outline.lineTo(-width / 2, height);
  outline.closePath();
  const body = new THREE.ExtrudeGeometry(outline, {
    depth,
    bevelEnabled: false,
    curveSegments: 32,
  });
  local(body, 0, 0, -depth / 2, '#c6bda5');
  for (const side of [-1, 1]) {
    const pier = side * (halfWidth + 0.5);
    for (const face of [-1, 1]) {
      local(
        new THREE.BoxGeometry(0.65, 3.95, 0.22),
        pier,
        1.9,
        face * (depth / 2 + 0.06),
        '#d5ccb7',
      );
    }
    for (const y of [0.08, 3.98])
      local(
        new THREE.BoxGeometry(1.05, 0.22, depth + 0.3),
        pier,
        y,
        0,
        '#b8af98',
      );
    const leaf = side * (halfWidth + 0.08);
    for (let i = 0; i <= 8; i++) {
      const z = -0.2 - (i * 1.5) / 8;
      local(
        new THREE.BoxGeometry(0.045, 2.45, 0.045),
        leaf,
        1.3,
        z,
        '#3c4942',
        'metal',
      );
      local(
        new THREE.ConeGeometry(0.065, 0.17, 4),
        leaf,
        2.6,
        z,
        '#3c4942',
        'metal',
      );
    }
    for (const y of [0.3, 0.7, 2.3])
      local(
        new THREE.BoxGeometry(0.07, 0.065, 1.58),
        leaf,
        y,
        -0.95,
        '#3c4942',
        'metal',
      );
    const scroll = new THREE.TorusGeometry(0.25, 0.025, 6, 24);
    scroll.rotateY(Math.PI / 2);
    local(scroll, leaf, 1.45, -0.95, '#3c4942', 'metal');
  }
  for (const face of [-1, 1])
    for (let i = 0; i < 13; i++) {
      const start = (i * Math.PI) / 13 + 0.008,
        end = ((i + 1) * Math.PI) / 13 - 0.008;
      const stone = new THREE.Shape();
      stone.absarc(0, spring, halfWidth + 0.35, start, end, false);
      stone.absarc(0, spring, halfWidth + 0.04, end, start, true);
      stone.closePath();
      local(
        new THREE.ExtrudeGeometry(stone, {
          depth: 0.15,
          bevelEnabled: false,
          curveSegments: 6,
        }),
        0,
        0,
        face < 0 ? -depth / 2 - 0.15 : depth / 2,
        '#d8d0bc',
      );
    }
  local(
    new THREE.BoxGeometry(width + 0.25, 0.2, depth + 0.3),
    0,
    height,
    0,
    '#b9b19c',
  );
  const pediment = new THREE.Shape();
  pediment.moveTo(-width / 2 - 0.13, height + 0.1);
  pediment.lineTo(width / 2 + 0.13, height + 0.1);
  pediment.lineTo(0, height + 0.85);
  pediment.closePath();
  local(
    new THREE.ExtrudeGeometry(pediment, {
      depth: depth + 0.15,
      bevelEnabled: false,
    }),
    0,
    0,
    -(depth + 0.15) / 2,
    '#cec5ae',
  );
  local(new THREE.BoxGeometry(0.11, 0.65, 0.12), 0, height + 1.1, 0, '#6d7163');
  local(new THREE.BoxGeometry(0.43, 0.1, 0.12), 0, height + 1.2, 0, '#6d7163');
}

export function makeCemetery(add: AddGeometry) {
  makeCemeteryGate(add);
  gravePlots.forEach(({ point, angle }, index) => {
    const ground = elevation(...point);
    const local = (
      geometry: THREE.BufferGeometry,
      x: number,
      y: number,
      z: number,
      color: string,
      kind: MaterialKind = 'stone',
    ) => {
      geometry.translate(x, y, z);
      add(color, positioned(geometry, point, ground, angle), kind);
    };
    const stone =
      index % 4 === 0 ? '#6d7370' : index % 3 === 0 ? '#b2aca0' : '#c4bdae';
    local(new THREE.BoxGeometry(1.15, 0.45, 2.1), 0, -0.1, 0, stone);
    if (index % 3 === 0)
      local(new THREE.BoxGeometry(1.02, 0.07, 1.95), 0, 0.17, 0, '#737c76');
    else {
      local(
        new THREE.BoxGeometry(0.93, 0.025, 1.74),
        0,
        0.14,
        0,
        '#556046',
        'grass',
      );
      for (const side of [-1, 1]) {
        local(
          new THREE.BoxGeometry(0.11, 0.12, 2.1),
          side * 0.52,
          0.21,
          0,
          stone,
        );
        local(
          new THREE.BoxGeometry(1.15, 0.12, 0.13),
          0,
          0.21,
          side * 0.99,
          stone,
        );
      }
    }
    const height = 0.75 + (index % 5) * 0.14;
    if (index % 7 === 0) {
      local(
        new THREE.CylinderGeometry(0.16, 0.28, 1.45, 4),
        0,
        0.92,
        -0.73,
        stone,
      );
      local(new THREE.ConeGeometry(0.22, 0.4, 4), 0, 1.85, -0.73, stone);
    } else {
      local(
        new THREE.BoxGeometry(0.84, height, 0.17),
        0,
        0.2 + height / 2,
        -0.8,
        stone,
      );
      local(
        new THREE.BoxGeometry(0.94, 0.12, 0.25),
        0,
        0.23 + height,
        -0.8,
        stone,
      );
      local(
        new THREE.PlaneGeometry(0.5, 0.32),
        0,
        0.38 + height / 2,
        -0.705,
        '#66706d',
        'metal',
      );
      for (let row = 0; row < 3; row++)
        local(
          new THREE.BoxGeometry(0.35 - row * 0.055, 0.013, 0.012),
          0,
          0.42 + height / 2 - row * 0.08,
          -0.693,
          '#c7bf9c',
          'metal',
        );
      if (index % 6 === 0) {
        local(
          new THREE.BoxGeometry(0.065, 0.65, 0.08),
          0,
          height + 0.46,
          -0.8,
          stone,
        );
        local(
          new THREE.BoxGeometry(0.4, 0.065, 0.08),
          0,
          height + 0.58,
          -0.8,
          stone,
        );
      }
    }
    if (index % 3 === 0) {
      local(
        new THREE.CylinderGeometry(0.1, 0.14, 0.22, 12),
        0.3,
        0.31,
        0.48,
        '#756e59',
        'stone',
      );
      for (let bloom = 0; bloom < 3; bloom++)
        local(
          new THREE.SphereGeometry(0.09, 10, 6),
          0.24 + bloom * 0.06,
          0.49 + (bloom % 2) * 0.06,
          0.48,
          index % 2 ? '#b8a4ab' : '#c5c1a0',
          'plaster',
        );
      local(
        new THREE.CylinderGeometry(0.045, 0.055, 0.12, 12),
        -0.32,
        0.26,
        0.57,
        '#c2ae82',
        'lamp',
      );
    }
  });
  makeSlavin(add);
}
