import * as THREE from 'three';
import { rawElevation, type Point } from './geo';
import type { AddGeometry } from './architecture';
import alignment from '../data/nuselsky-bridge.json';

const [first, second] = alignment.carriageways;
export const nuselskyBridge = {
  start: [
    (first.start[0] + second.start[0]) / 2,
    (first.start[1] + second.start[1]) / 2,
  ] as Point,
  end: [
    (first.end[0] + second.end[0]) / 2,
    (first.end[1] + second.end[1]) / 2,
  ] as Point,
  width: 26.5,
  structuralLength: 485,
  source: alignment.sourceUrl,
};

export function makeNuselskyBridge(add: AddGeometry) {
  const { start, end, width, structuralLength } = nuselskyBridge;
  const dx = end[0] - start[0],
    dz = end[1] - start[1];
  const length = Math.hypot(dx, dz),
    axis: Point = [dx / length, dz / length];
  const angle = -Math.atan2(axis[1], axis[0]);
  const levels = [rawElevation(...start) + 0.4, rawElevation(...end) + 0.4];
  const at = (u: number, v: number): Point => [
    start[0] + axis[0] * u - axis[1] * v,
    start[1] + axis[1] * u + axis[0] * v,
  ];
  const level = (u: number) =>
    levels[0] + ((levels[1] - levels[0]) * u) / length;
  const prism = (
    from: number,
    to: number,
    across: number,
    w: number,
    bottom: number,
    top: number,
    color: string,
    kind: 'plaster' | 'metal' = 'plaster',
  ) => {
    const a = at(from, across - w / 2),
      b = at(to, across - w / 2);
    const c = at(from, across + w / 2),
      d = at(to, across + w / 2);
    const vertices: number[] = [];
    const p = (point: Point, u: number, h: number) => [
      point[0],
      level(u) + h,
      point[1],
    ];
    const face = (a: number[], b: number[], c: number[], d: number[]) =>
      vertices.push(...a, ...b, ...c, ...c, ...b, ...d);
    face(p(a, from, top), p(c, from, top), p(b, to, top), p(d, to, top));
    face(
      p(a, from, bottom),
      p(b, to, bottom),
      p(c, from, bottom),
      p(d, to, bottom),
    );
    face(p(a, from, bottom), p(a, from, top), p(b, to, bottom), p(b, to, top));
    face(p(c, from, top), p(c, from, bottom), p(d, to, top), p(d, to, bottom));
    face(
      p(a, from, bottom),
      p(c, from, bottom),
      p(a, from, top),
      p(c, from, top),
    );
    face(p(b, to, top), p(d, to, top), p(b, to, bottom), p(d, to, bottom));
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      'position',
      new THREE.Float32BufferAttribute(vertices, 3),
    );
    geometry.computeVertexNormals();
    add(color, geometry, kind);
  };
  prism(0, length, 0, width, -1, 0, '#aaa99e');
  prism(0, length, 0, width - 5, 0.01, 0.08, '#4d5152', 'metal');
  const approach = (length - structuralLength) / 2;
  prism(approach, length - approach, 0, 13, -6.5, -1, '#94958f');
  for (const side of [-1, 1]) {
    prism(0, length, side * (width / 2 - 1.2), 2.4, 0, 0.18, '#b3b1a6');
    prism(0, length, side * (width / 2 - 0.25), 0.4, 0.15, 0.85, '#a4a69e');
    prism(
      0,
      length,
      side * (width / 2 - 0.25),
      0.08,
      2.4,
      2.48,
      '#727b79',
      'metal',
    );
    for (let u = 0; u <= length; u += 6) {
      const p = at(u, side * (width / 2 - 0.25));
      add(
        '#727b79',
        new THREE.BoxGeometry(0.1, 1.65, 0.1).translate(
          p[0],
          level(u) + 1.62,
          p[1],
        ),
        'metal',
      );
    }
    for (const lane of [3.6, 7.2])
      for (let u = 6; u < length - 6; u += 12)
        prism(u, u + 5, side * lane, 0.14, 0.085, 0.095, '#d7d4be', 'metal');
  }
  prism(0, length, 0, 0.65, 0.08, 0.65, '#a5a79f');
  for (const distance of [68.5, 184, 299.5, 415]) {
    const u = approach + distance;
    for (const side of [-1, 1]) {
      const p = at(u, side * 4.5),
        ground = rawElevation(...p) - 0.6;
      const top = level(u) - 5.8,
        h = top - ground;
      if (h <= 0)
        throw new Error(
          'Nuselsky Bridge pier has no clearance above the terrain.',
        );
      const pier = new THREE.BoxGeometry(4, h, 2.6);
      pier.rotateY(angle);
      pier.translate(p[0], ground + h / 2, p[1]);
      add('#a7a89f', pier, 'plaster');
    }
    prism(u - 2.7, u + 2.7, 0, 17, -7.2, -5.7, '#a1a39a');
  }
}
