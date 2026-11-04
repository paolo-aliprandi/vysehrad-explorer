import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { worldUVs, type Materials } from './materials';
import type { Point } from './geo';

// An authored interpretation, not a surveyed plan or a connection between OSM tunnels.
// Historical context: https://prague.eu/en/objevujte/vysehrad/
export const casemateNotes = [
  {
    id: 'ramparts',
    point: [0, -8] as Point,
    title: 'Inside the ramparts',
    text: 'These protected passages let troops move within the bastion fortifications. Vyšehrad has four independent casemate sections, not one continuous tunnel.',
  },
  {
    id: 'passages',
    point: [18, -32] as Point,
    title: 'A hidden network',
    text: 'The real casemates total 1,017 metres. This shortened, wider route is an illustrative game layout; the real visitor entrance is at the Brick Gate.',
  },
  {
    id: 'gorlice',
    point: [18, -59] as Point,
    title: 'Gorlice',
    text: 'The real Gorlice hall covers 330 square metres under a 13-metre vault. It once served troops and stores; today it shelters six original Charles Bridge statues. These sculptures are interpretations.',
  },
];
type Side = 'north' | 'south' | 'east' | 'west';
type Room = {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  spring: number;
  rise: number;
  axis: 'x' | 'z';
  exitRise?: number;
  openings: { side: Side; from: number; to: number }[];
};
export const casemateRooms: Room[] = [
  {
    minX: -1.5,
    maxX: 1.5,
    minZ: -24,
    maxZ: 4,
    spring: 2,
    rise: 1.2,
    axis: 'z',
    openings: [{ side: 'east', from: -24, to: -21 }],
  },
  {
    minX: 1.5,
    maxX: 19.5,
    minZ: -24,
    maxZ: -21,
    spring: 2,
    rise: 1.2,
    axis: 'x',
    openings: [
      { side: 'west', from: -24, to: -21 },
      { side: 'north', from: 16.5, to: 19.5 },
    ],
  },
  {
    minX: 16.5,
    maxX: 19.5,
    minZ: -46,
    maxZ: -24,
    spring: 2,
    rise: 1.2,
    axis: 'z',
    openings: [
      { side: 'south', from: 16.5, to: 19.5 },
      { side: 'north', from: 16.5, to: 19.5 },
      { side: 'east', from: -36, to: -33 },
    ],
  },
  {
    minX: 10.5,
    maxX: 25.5,
    minZ: -68,
    maxZ: -46,
    spring: 5.5,
    rise: 7.5,
    axis: 'z',
    openings: [{ side: 'south', from: 16.5, to: 19.5 }],
  },
  {
    minX: 19.5,
    maxX: 39.5,
    minZ: -36,
    maxZ: -33,
    spring: 2,
    rise: 1.2,
    axis: 'x',
    exitRise: 4,
    openings: [{ side: 'west', from: -36, to: -33 }],
  },
];
export const artilleryRooms: Room[] = [
  {
    minX: -1.5,
    maxX: 1.5,
    minZ: -8,
    maxZ: 4,
    spring: 2,
    rise: 1.2,
    axis: 'z',
    openings: [{ side: 'north', from: -1.5, to: 1.5 }],
  },
  {
    minX: -6,
    maxX: 6,
    minZ: -29,
    maxZ: -8,
    spring: 3.2,
    rise: 2.8,
    axis: 'z',
    openings: [{ side: 'south', from: -1.5, to: 1.5 }],
  },
];
export const artilleryCannons: Point[] = [-13, -21].flatMap((z): Point[] => [
  [-4.1, z],
  [4.1, z],
]);
export function artilleryBlocked(point: Point) {
  if (!point.every(Number.isFinite)) return true;
  for (let i = 0; i < 8; i++) {
    const a = (i * Math.PI) / 4;
    const x = point[0] + Math.cos(a) * 0.28,
      z = point[1] + Math.sin(a) * 0.28;
    if (
      !artilleryRooms.some(
        (room) =>
          x >= room.minX && x <= room.maxX && z >= room.minZ && z <= room.maxZ,
      )
    )
      return true;
  }
  return (
    artilleryCannons.some(
      (p) =>
        Math.abs(point[0] - p[0]) < 1.5 && Math.abs(point[1] - p[1]) < 1.35,
    ) ||
    (Math.abs(point[0]) < 2.5 && point[1] < -26.2)
  );
}
export function casemateFloor(point: Point) {
  const ramp = casemateRooms.find(
    (room) =>
      room.exitRise &&
      point[0] >= room.minX &&
      point[0] <= room.maxX &&
      point[1] >= room.minZ &&
      point[1] <= room.maxZ,
  );
  return ramp && ramp.exitRise !== undefined
    ? ((point[0] - ramp.minX) / (ramp.maxX - ramp.minX)) * ramp.exitRise
    : 0;
}
export const casemateSculptures: Point[] = [-51, -57, -63].flatMap(
  (z): Point[] => [
    [12.3, z],
    [23.7, z],
  ],
);
const within = ([x, z]: Point) =>
  casemateRooms.some(
    (room) =>
      x >= room.minX && x <= room.maxX && z >= room.minZ && z <= room.maxZ,
  );
export function casemateBlocked(point: Point) {
  if (!point.every(Number.isFinite)) return true;
  for (let i = 0; i < 8; i++) {
    const a = (i * Math.PI) / 4;
    if (!within([point[0] + Math.cos(a) * 0.28, point[1] + Math.sin(a) * 0.28]))
      return true;
  }
  return casemateSculptures.some(
    (p) => Math.abs(point[0] - p[0]) < 0.95 && Math.abs(point[1] - p[1]) < 0.95,
  );
}
export function readCasemateNotes(storage: Pick<Storage, 'getItem'>) {
  const saved: unknown = JSON.parse(
    storage.getItem('vysehrad-casemates-v1') ?? '[]',
  );
  if (!Array.isArray(saved)) throw new Error('Invalid saved casemate notes.');
  return casemateNotes
    .filter((note) => saved.includes(note.id))
    .map((note) => note.id);
}
export function casemateVault(
  width: number,
  length: number,
  spring: number,
  rise: number,
) {
  const geometry = new THREE.PlaneGeometry(
    width,
    length,
    32,
    Math.ceil(length / 2),
  );
  geometry.rotateX(-Math.PI / 2);
  const positions = geometry.attributes.position;
  for (let i = 0; i < positions.count; i++) {
    const x = positions.getX(i) / (width / 2);
    positions.setY(i, spring + Math.sqrt(Math.max(0, 1 - x * x)) * rise);
  }
  geometry.computeVertexNormals();
  return geometry;
}

export function makeCasemateInterior(
  materials: Pick<Materials, 'get'>,
  artillery = false,
) {
  const group = new THREE.Group();
  group.name = artillery
    ? 'Illustrative artillery casemate gallery'
    : 'Illustrative Vysehrad casemates and Gorlice';
  group.visible = false;
  const blockers: THREE.Object3D[] = [];
  const batches = new Map<THREE.Material, THREE.BufferGeometry[]>();
  const brick = materials.get('brick', '#926e53');
  const stone = materials.get('stone', '#b6ad98');
  const gravel = materials.get('gravel', '#8e8a77');
  const metal = materials.get('metal', '#394942');
  const glow = new THREE.MeshStandardMaterial({
    color: '#ffe1a0',
    emissive: '#ffc16b',
    emissiveIntensity: 2,
  });
  const add = (geometry: THREE.BufferGeometry, material: THREE.Material) => {
    const normalized = geometry.index ? geometry.toNonIndexed() : geometry;
    if (normalized !== geometry) geometry.dispose();
    const batch = batches.get(material) ?? [];
    batch.push(normalized);
    batches.set(material, batch);
  };
  const box = (
    w: number,
    h: number,
    d: number,
    x: number,
    y: number,
    z: number,
    mat = brick,
  ) => add(new THREE.BoxGeometry(w, h, d).translate(x, y, z), mat);
  for (const room of artillery ? artilleryRooms : casemateRooms) {
    const width = room.maxX - room.minX,
      depth = room.maxZ - room.minZ;
    const x = (room.maxX + room.minX) / 2,
      z = (room.maxZ + room.minZ) / 2;
    const grade = (geometry: THREE.BufferGeometry) => {
      if (room.exitRise) {
        const p = geometry.attributes.position;
        for (let i = 0; i < p.count; i++)
          p.setY(
            i,
            p.getY(i) +
              ((p.getX(i) - room.minX) / (room.maxX - room.minX)) *
                room.exitRise,
          );
        geometry.computeVertexNormals();
      }
      return geometry;
    };
    const roomBox = (
      w: number,
      h: number,
      d: number,
      x: number,
      y: number,
      z: number,
      mat = brick,
    ) => add(grade(new THREE.BoxGeometry(w, h, d).translate(x, y, z)), mat);
    roomBox(width, 0.2, depth, x, -0.1, z, gravel);
    const vault = casemateVault(
      room.axis === 'z' ? width : depth,
      room.axis === 'z' ? depth : width,
      room.spring,
      room.rise,
    );
    if (room.axis === 'x') vault.rotateY(Math.PI / 2);
    add(grade(vault.translate(x, 0, z)), brick);
    for (const side of ['north', 'south', 'east', 'west'] as const) {
      const horizontal = side === 'north' || side === 'south';
      const low = horizontal ? room.minX : room.minZ;
      const high = horizontal ? room.maxX : room.maxZ;
      const fixed =
        side === 'north'
          ? room.minZ
          : side === 'south'
            ? room.maxZ
            : side === 'west'
              ? room.minX
              : room.maxX;
      const portals = room.openings
        .filter((p) => p.side === side)
        .sort((a, b) => a.from - b.from);
      let start = low;
      const wall = (
        from: number,
        to: number,
        bottom = 0,
        top = room.spring,
      ) => {
        if (to - from < 0.001 || top <= bottom) return;
        roomBox(
          horizontal ? to - from : 0.3,
          top - bottom,
          horizontal ? 0.3 : to - from,
          horizontal ? (from + to) / 2 : fixed,
          (bottom + top) / 2,
          horizontal ? fixed : (from + to) / 2,
        );
      };
      for (const portal of portals) {
        wall(start, portal.from);
        wall(portal.from, portal.to, Math.min(2.8, room.spring));
        start = portal.to;
      }
      wall(start, high);
      const endCap = (room.axis === 'z') === horizontal;
      if (endCap && (!portals.length || room.spring > 2.8)) {
        const shape = new THREE.Shape();
        shape.moveTo(low, room.spring);
        for (let i = 0; i <= 32; i++) {
          const a = Math.PI - (i * Math.PI) / 32;
          shape.lineTo(
            (low + high) / 2 + (Math.cos(a) * (high - low)) / 2,
            room.spring + Math.sin(a) * room.rise,
          );
        }
        shape.closePath();
        const cap = new THREE.ShapeGeometry(shape);
        if (horizontal) cap.translate(0, 0, fixed);
        else cap.rotateY(-Math.PI / 2).translate(fixed, 0, 0);
        add(grade(cap), brick);
      }
    }
    const run = room.axis === 'z' ? depth : width;
    for (let along = 2; along < run - 1; along += room.rise > 2 ? 5.5 : 4) {
      const rib = new THREE.TubeGeometry(
        new THREE.CatmullRomCurve3(
          Array.from({ length: 33 }, (_, i) => {
            const a = (i * Math.PI) / 32;
            return new THREE.Vector3(
              (Math.cos(a) * (room.axis === 'z' ? width : depth)) / 2,
              room.spring + Math.sin(a) * room.rise - 0.045,
              0,
            );
          }),
        ),
        32,
        0.07,
        6,
        false,
      );
      if (room.axis === 'x') rib.rotateY(Math.PI / 2);
      add(
        grade(
          rib.translate(
            room.axis === 'z' ? x : room.minX + along,
            0,
            room.axis === 'z' ? room.minZ + along : z,
          ),
        ),
        stone,
      );
    }
  }
  // The six silhouettes evoke the display without claiming to reproduce its artworks.
  for (const [index, [x, z]] of (artillery
    ? []
    : casemateSculptures
  ).entries()) {
    box(1.3, 0.6, 1.3, x, 0.3, z, stone);
    box(1.45, 0.16, 1.45, x, 0.68, z, stone);
    add(
      new THREE.ConeGeometry(0.62, 2.2, 12)
        .scale(1, 1, 0.65)
        .translate(x, 1.8, z),
      stone,
    );
    add(new THREE.SphereGeometry(0.25, 16, 12).translate(x, 3.08, z), stone);
    add(
      new THREE.CapsuleGeometry(0.14, 0.8, 4, 8)
        .rotateZ(index % 2 ? 0.8 : -0.65)
        .translate(x + 0.45, 2.35, z),
      stone,
    );
    add(
      new THREE.CapsuleGeometry(0.13, 0.7, 4, 8)
        .rotateZ(-0.45)
        .translate(x - 0.4, 2.25, z),
      stone,
    );
  }
  if (artillery) {
    const timber = materials.get('wood', '#72573c');
    const bronze = materials.get('metal', '#77734e');
    for (const [index, [x, z]] of artilleryCannons.entries()) {
      const angle = x < 0 ? Math.PI / 2 : -Math.PI / 2;
      const cannon = (
        geometry: THREE.BufferGeometry,
        material: THREE.Material,
      ) => add(geometry.rotateY(angle).translate(x, 0, z), material);
      for (const side of [-1, 1]) {
        cannon(
          new THREE.BoxGeometry(0.18, 0.55, 1.65).translate(
            side * 0.38,
            0.55,
            0,
          ),
          timber,
        );
        cannon(
          new THREE.TorusGeometry(0.58, 0.095, 8, 24)
            .rotateY(Math.PI / 2)
            .translate(side * 0.72, 0.62, 0.2),
          timber,
        );
        cannon(
          new THREE.CylinderGeometry(0.12, 0.12, 0.22, 12)
            .rotateZ(Math.PI / 2)
            .translate(side * 0.72, 0.62, 0.2),
          metal,
        );
        for (let spoke = 0; spoke < 8; spoke++)
          cannon(
            new THREE.BoxGeometry(0.08, 1.04, 0.055)
              .rotateX((spoke * Math.PI) / 4)
              .translate(side * 0.72, 0.62, 0.2),
            timber,
          );
      }
      cannon(
        new THREE.BoxGeometry(1.3, 0.18, 0.85).translate(0, 0.55, 0.2),
        timber,
      );
      const profile = [
        [0, -0.95],
        [0.19, -0.95],
        [0.29, -0.7],
        [0.23, 0.8],
        [0.28, 1.05],
        [0.16, 1.05],
        [0.145, 0.55],
        [0, 0.55],
      ].map(([r, y]) => new THREE.Vector2(r, y));
      cannon(
        new THREE.LatheGeometry(profile, 32)
          .rotateX(Math.PI / 2)
          .rotateX(-0.08)
          .translate(0, 1.05, 0),
        index % 2 ? metal : bronze,
      );
      for (let row = 0; row < 2; row++)
        for (let ball = 0; ball < 3 - row; ball++)
          cannon(
            new THREE.SphereGeometry(0.15, 12, 8).translate(
              0.95 + ball * 0.3,
              0.16 + row * 0.25,
              -0.65 + row * 0.12,
            ),
            metal,
          );
    }
    box(4.5, 0.45, 1.4, 0, 0.225, -27.6, stone);
    for (const x of [-1.4, 0, 1.4]) {
      add(
        new THREE.SphereGeometry(
          0.38,
          16,
          12,
          0,
          Math.PI * 2,
          0,
          Math.PI / 2,
        ).translate(x, 0.65, -27.4),
        metal,
      );
      add(
        new THREE.SphereGeometry(0.52, 16, 12)
          .scale(1, 1.2, 0.16)
          .translate(x, 1.55, -28.15),
        bronze,
      );
      for (const direction of [-1, 1])
        add(
          new THREE.BoxGeometry(0.055, 1.65, 0.05)
            .rotateZ(direction * 0.6)
            .translate(x, 2.5, -28.25),
          metal,
        );
      box(0.58, 0.06, 0.08, x, 1.95, -28.2, bronze);
    }
    for (const side of [-1, 1]) {
      box(0.06, 3.6, 0.06, side * 4.7, 1.8, -27, timber);
      box(
        1.1,
        1.5,
        0.04,
        side * 4.2,
        2.65,
        -27,
        materials.get('plaster', side < 0 ? '#94624b' : '#697c6a'),
      );
      add(
        new THREE.CylinderGeometry(0.48, 0.48, 0.6, 20).translate(
          side * 3.2,
          0.34,
          -27,
        ),
        timber,
      );
    }
  }
  const lamps: Point[] = artillery
    ? [
        [-1.25, 1],
        [-1.25, -5],
        [-5.7, -11],
        [5.7, -11],
        [-5.7, -19],
        [5.7, -19],
        [-5.7, -27],
        [5.7, -27],
      ]
    : [
        [-1.25, 1],
        [-1.25, -7],
        [-1.25, -15],
        [-1.25, -22],
        [8, -23.7],
        [18, -23.7],
        [19.25, -30],
        [19.25, -38],
        [19.25, -44],
        [11, -52],
        [25, -52],
        [11, -63],
        [25, -63],
        [24, -35.7],
        [31, -35.7],
        [38, -35.7],
      ];
  for (const [x, z] of lamps) {
    const floor = casemateFloor([x, z]);
    box(0.18, 0.42, 0.18, x, floor + 1.8, z, metal);
    box(0.12, 0.25, 0.12, x, floor + 1.85, z, glow);
    const light = new THREE.PointLight(
      '#ffd29a',
      artillery || z < -46 ? 28 : 12,
      artillery || z < -46 ? 20 : 10,
      2,
    );
    light.position.set(x, floor + (z < -46 ? 5 : 2), z);
    group.add(light);
  }
  const markers = new Map<string, THREE.Mesh>();
  for (const note of artillery ? [] : casemateNotes) {
    const marker = new THREE.Mesh(
      new THREE.TorusGeometry(0.22, 0.045, 8, 24),
      glow,
    );
    marker.rotation.x = -Math.PI / 2;
    marker.position.set(note.point[0], 0.12, note.point[1]);
    group.add(marker);
    markers.set(note.id, marker);
  }
  // Mark the return door independently of the field-note markers.
  box(2, 2.2, 0.08, 0, 1.1, 3.8, materials.get('wood', '#536c60'));
  box(0.85, 0.12, 0.12, 0, 2.6, 3.7, glow);
  if (!artillery) {
    box(
      0.08,
      2.2,
      1.8,
      39.3,
      casemateFloor([39.3, -34.5]) + 1.1,
      -34.5,
      materials.get('wood', '#536c60'),
    );
    box(
      0.12,
      0.12,
      0.85,
      39.2,
      casemateFloor([39.2, -34.5]) + 2.6,
      -34.5,
      glow,
    );
  }
  for (const [material, geometries] of batches) {
    const geometry = mergeGeometries(geometries);
    if (!geometry) throw new Error('Could not assemble casemate geometry.');
    geometries.forEach((item) => item.dispose());
    worldUVs(
      geometry,
      material === brick ? 'brick' : material === gravel ? 'gravel' : 'stone',
    );
    const mesh = new THREE.Mesh(geometry, material);
    mesh.receiveShadow = true;
    group.add(mesh);
    if (material !== glow) blockers.push(mesh);
  }
  group.add(new THREE.HemisphereLight('#ccbaa2', '#555441', 0.85));
  return { group, blockers, markers };
}
