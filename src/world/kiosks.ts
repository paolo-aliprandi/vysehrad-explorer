import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { Polygon } from 'polygon-clipping';
import {
  buildings,
  elevation,
  foundation,
  referenceSites,
  spickaShop,
  type Feature,
  type Point,
} from './geo';
import { polygonBoolean } from './polygons';
import type { AddGeometry } from './architecture';

function kiosk(
  id: string,
  name: string,
  face: Point,
  angle: number,
  ground: number,
  meal: string,
  greetings: string[],
  access: Point[] = [],
) {
  const normal: Point = [Math.sin(angle), Math.cos(angle)];
  const at = (u: number, v: number): Point => [
    face[0] + Math.cos(angle) * u + normal[0] * v,
    face[1] - Math.sin(angle) * u + normal[1] * v,
  ];
  return {
    id,
    name,
    face,
    angle,
    ground,
    meal,
    greetings,
    normal,
    at,
    attendant: at(0, -0.55),
    approach: at(0, 1.65),
    access,
  };
}

const garden = referenceSites.gardenKiosk;
const gardenGround = Math.max(
  ...[-1, 1].flatMap((u) =>
    [-1, 1].map((v) =>
      elevation(
        garden.point[0] +
          (Math.cos(garden.angle) * u * garden.width) / 2 +
          (Math.sin(garden.angle) * v * garden.depth) / 2,
        garden.point[1] -
          (Math.sin(garden.angle) * u * garden.width) / 2 +
          (Math.cos(garden.angle) * v * garden.depth) / 2,
      ),
    ),
  ),
);
export const gardenKioskSite = kiosk(
  'garden',
  'Garden kiosk',
  [
    garden.point[0] -
      Math.cos(garden.angle) * 0.3 +
      (Math.sin(garden.angle) * garden.depth) / 2,
    garden.point[1] +
      Math.sin(garden.angle) * 0.3 +
      (Math.cos(garden.angle) * garden.depth) / 2,
  ],
  garden.angle,
  gardenGround,
  'warm pastry',
  [
    'Welcome to the garden kiosk! Take a breather by the greenery.',
    'St. Martin’s Rotunda is just along the cobbled street.',
    'Follow the garden paths to the benches; the counter will be here when you return.',
  ],
  [[35, 56]],
);
export const spickaKioskSite = kiosk(
  'okenko',
  'Okénko',
  [
    spickaShop.center[0] + spickaShop.axis[0] * 0.6 - spickaShop.axis[1] * 2.5,
    spickaShop.center[1] + spickaShop.axis[1] * 0.6 + spickaShop.axis[0] * 2.5,
  ],
  spickaShop.angle,
  spickaShop.ground,
  'fresh pastry',
  [
    'Hello from Okénko! The café garden is beside the kiosk.',
    'Keep following V Pevnosti to explore the gates and ramparts.',
    'There is a quiet spot at the garden tables if you need a rest.',
  ],
);
const deanery = buildings.find((feature) => feature.id === 49810587);
if (!deanery) throw new Error('Missing building beside St. Lawrence’s ruins.');
const a = deanery.points[deanery.points.length - 2],
  b = deanery.points[0];
const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
export const lawrenceKioskSite = {
  ...kiosk(
    'lawrence',
    'St. Lawrence kiosk',
    [a[0] + (b[0] - a[0]) * 0.72, a[1] + (b[1] - a[1]) * 0.72],
    Math.atan2((b[1] - a[1]) / length, -(b[0] - a[0]) / length),
    foundation(deanery),
    'bread and cheese',
    [
      'Welcome! St. Lawrence’s Romanesque ruins are immediately beside this building.',
      'You can explore the archaeological remains through their separate entrance.',
      'Enjoy the walk. The basilica and rampart viewpoints are worth a visit too.',
    ],
  ),
  building: deanery,
};
export const kioskSites = [gardenKioskSite, spickaKioskSite, lawrenceKioskSite];

export function kioskReply(id: string, visit: number) {
  const site = kioskSites.find((site) => site.id === id);
  if (!site) throw new Error(`Unknown kiosk ${id}.`);
  return `${site.name}: ${site.greetings[visit % site.greetings.length]}`;
}

export function kioskShell(
  width: number,
  depth: number,
  height: number,
  opening: { center: number; width: number; sill: number; head: number },
) {
  const pieces: THREE.BufferGeometry[] = [];
  const box = (
    w: number,
    h: number,
    d: number,
    x: number,
    y: number,
    z: number,
  ) => pieces.push(new THREE.BoxGeometry(w, h, d).translate(x, y, z));
  box(width, height, 0.16, 0, height / 2, -depth / 2 + 0.08);
  for (const side of [-1, 1])
    box(0.16, height, depth, side * (width / 2 - 0.08), height / 2, 0);
  const left = opening.center - opening.width / 2;
  const right = opening.center + opening.width / 2;
  box(
    left + width / 2,
    height,
    0.16,
    (left - width / 2) / 2,
    height / 2,
    depth / 2 - 0.08,
  );
  box(
    width / 2 - right,
    height,
    0.16,
    (right + width / 2) / 2,
    height / 2,
    depth / 2 - 0.08,
  );
  box(
    opening.width,
    opening.sill,
    0.16,
    opening.center,
    opening.sill / 2,
    depth / 2 - 0.08,
  );
  box(
    opening.width,
    height - opening.head,
    0.16,
    opening.center,
    (height + opening.head) / 2,
    depth / 2 - 0.08,
  );
  box(width, 0.1, depth, 0, -0.05, 0);
  const result = mergeGeometries(pieces);
  pieces.forEach((piece) => piece.dispose());
  if (!result) throw new Error('Could not construct open kiosk walls.');
  return result;
}

export function kioskBuildingGeometry(
  feature: Feature,
  bottom: number,
  top: number,
) {
  const site = lawrenceKioskSite;
  const notch = [
    [-1.6, 0.5],
    [1.6, 0.5],
    [1.6, -1.1],
    [-1.6, -1.1],
    [-1.6, 0.5],
  ].map(([u, v]): [number, number] => [...site.at(u, v)]);
  const footprint: Polygon = [feature.points, ...feature.holes].map((ring) =>
    ring.map(([x, z]) => [x, z]),
  );
  const recessed = polygonBoolean('difference', [footprint], [[notch]]);
  const pieces: THREE.BufferGeometry[] = [];
  const layer = (
    rings: readonly (readonly Point[])[],
    start: number,
    end: number,
  ) => {
    const shape = new THREE.Shape(
      rings[0].map(([x, z]) => new THREE.Vector2(x, -z)),
    );
    shape.holes = rings
      .slice(1)
      .map(
        (ring) =>
          new THREE.Path(ring.map(([x, z]) => new THREE.Vector2(x, -z))),
      );
    pieces.push(
      new THREE.ExtrudeGeometry(shape, {
        depth: end - start,
        bevelEnabled: false,
      }).translate(0, 0, start - bottom),
    );
  };
  layer(footprint, bottom, site.ground + 1.02);
  for (const polygon of recessed)
    layer(polygon, site.ground + 1.02, site.ground + 2.35);
  layer(footprint, site.ground + 2.35, top);
  const result = mergeGeometries(pieces);
  pieces.forEach((piece) => piece.dispose());
  if (!result) throw new Error('Could not open the St. Lawrence kiosk window.');
  return result;
}

export function makeLawrenceKiosk(add: AddGeometry) {
  const site = lawrenceKioskSite;
  const box = (
    w: number,
    h: number,
    d: number,
    u: number,
    y: number,
    v: number,
    color: string,
  ) => {
    const point = site.at(u, v);
    add(
      color,
      new THREE.BoxGeometry(w, h, d)
        .rotateY(site.angle)
        .translate(point[0], site.ground + y, point[1]),
      'wood',
    );
  };
  box(3.2, 1.3, 0.08, 0, 1.68, -1.02, '#28342e');
  for (const u of [-1.64, 1.64])
    box(0.12, 1.46, 0.16, u, 1.68, 0.03, '#657253');
  box(3.45, 0.12, 0.65, 0, 1.05, 0.2, '#b7a177');
  box(3.6, 0.15, 1.15, 0, 2.48, 0.42, '#657253');
  for (const u of [-1, -0.65, 0.85])
    box(0.12, 0.16, 0.12, u, 1.19, 0.23, '#ded5bf');
}
