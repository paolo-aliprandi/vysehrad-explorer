import * as THREE from 'three';
import {
  riversideGallery,
  projectRoute,
  originalElevation,
  rawElevation,
  type Point,
} from './geo';
import {
  continuousWall,
  pathRibbon,
  ribbonEdges,
  samplePolyline,
} from './surfaces';
import type { AddGeometry } from './architecture';

export function makeRiversideGallery(add: AddGeometry) {
  const { road, pedestrian, levels, halfWidth, approaches } = riversideGallery;
  const floor = (x: number, z: number) => {
    const route = projectRoute([x, z], road.points);
    return levels[0] + ((levels[1] - levels[0]) * route.along) / route.length;
  };
  add(
    '#8b8980',
    continuousWall(
      road.points,
      halfWidth * 2,
      (point) => ({
        bottom: floor(...point) - 0.4,
        top: floor(...point) + 0.01,
      }),
      false,
    ),
    'stone',
  );
  add('#b2b5ae', pathRibbon(road.points, 7.2, 0.06, floor), 'cobble');
  add('#b3aea0', pathRibbon(pedestrian.points, 2, 0.2, floor), 'cobble');
  const samples = samplePolyline(road.points, 0.8);
  const edges = ribbonEdges(samples, halfWidth * 2);
  for (const side of ['left', 'right'] as const)
    add(
      '#9e9889',
      continuousWall(
        edges.map((edge) => edge[side]),
        0.5,
        (point) => ({
          bottom: floor(...point) - 0.3,
          top: floor(...point) + 3,
        }),
        false,
      ),
      'stone',
    );
  const vertices: number[] = [];
  for (let i = 1; i < samples.length; i++) {
    const a = samples[i - 1],
      b = samples[i];
    const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const normal: Point = [-(b[1] - a[1]) / length, (b[0] - a[0]) / length];
    const at = (point: Point, angle: number, outer: boolean) => [
      point[0] + normal[0] * Math.cos(angle) * (halfWidth + (outer ? 0.5 : 0)),
      floor(...point) + 3 + Math.sin(angle) * (outer ? 2.7 : 2.2),
      point[1] + normal[1] * Math.cos(angle) * (halfWidth + (outer ? 0.5 : 0)),
    ];
    for (let j = 0; j < 32; j++)
      for (const outer of [false, true]) {
        const p = at(a, (j * Math.PI) / 32, outer),
          q = at(b, (j * Math.PI) / 32, outer),
          r = at(a, ((j + 1) * Math.PI) / 32, outer),
          s = at(b, ((j + 1) * Math.PI) / 32, outer);
        vertices.push(...p, ...q, ...r, ...r, ...q, ...s);
      }
  }
  const vault = new THREE.BufferGeometry();
  vault.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  vault.computeVertexNormals();
  add('#9a9587', vault, 'stone');
  for (const approach of approaches) {
    const { end, outside, axis } = approach;
    const floorAlong = (x: number, z: number) => {
      const t = Math.max(
        0,
        Math.min(1, ((x - end[0]) * axis[0] + (z - end[1]) * axis[1]) / 24),
      );
      return (
        approach.floor +
        (rawElevation(...outside) - approach.floor) * t * t * (3 - 2 * t)
      );
    };
    add(
      '#a8a397',
      pathRibbon([end, outside], 14.6, 0.02, floorAlong),
      'cobble',
    );
    add('#b2b5ae', pathRibbon([end, outside], 7.2, 0.07, floorAlong), 'cobble');
    for (const side of [-1, 1]) {
      const points: Point[] = [end, outside].map((point) => [
        point[0] - axis[1] * side * 7.3,
        point[1] + axis[0] * side * 7.3,
      ]);
      add(
        '#9d9787',
        continuousWall(
          points,
          0.5,
          (point) => ({
            bottom: floorAlong(...point) - 0.4,
            top: Math.max(
              floorAlong(...point) + 0.25,
              originalElevation(...point) + 0.08,
            ),
          }),
          false,
        ),
        'stone',
      );
    }
    const height = 7.2;
    const angle = -Math.atan2(axis[0], -axis[1]);
    const local = (
      geometry: THREE.BufferGeometry,
      color: string,
      kind: Parameters<AddGeometry>[2] = 'stone',
    ) => {
      geometry.rotateY(angle);
      geometry.translate(end[0], approach.floor, end[1]);
      add(color, geometry, kind);
    };
    const outline = new THREE.Shape();
    outline.moveTo(-7.3, -0.5);
    outline.lineTo(-halfWidth, -0.5);
    outline.lineTo(-halfWidth, 3);
    outline.absellipse(0, 3, halfWidth, 2.2, Math.PI, 0, true, 0);
    outline.lineTo(halfWidth, -0.5);
    outline.lineTo(7.3, -0.5);
    outline.lineTo(7.3, height);
    outline.lineTo(-7.3, height);
    outline.closePath();
    const portal = new THREE.ExtrudeGeometry(outline, {
      depth: 1.4,
      bevelEnabled: false,
      curveSegments: 32,
    });
    portal.translate(0, 0, -0.7);
    local(portal, '#a29a88');
    add(
      '#807c74',
      continuousWall(
        [
          [end[0] - axis[1] * 7.3, end[1] + axis[0] * 7.3],
          [end[0] + axis[1] * 7.3, end[1] - axis[0] * 7.3],
        ],
        1.4,
        (point) => ({
          bottom: approach.floor + height - 0.1,
          top: Math.max(
            approach.floor + height,
            originalElevation(...point) + 0.5,
          ),
        }),
        false,
      ),
      'rock',
    );
    for (let i = 0; i < 24; i++) {
      const a = (i * Math.PI) / 24,
        b = ((i + 1) * Math.PI) / 24;
      const stone = new THREE.Shape();
      stone.moveTo(Math.cos(a) * halfWidth, 3 + Math.sin(a) * 2.2);
      stone.lineTo(Math.cos(b) * halfWidth, 3 + Math.sin(b) * 2.2);
      stone.lineTo(Math.cos(b) * (halfWidth + 0.4), 3 + Math.sin(b) * 2.6);
      stone.lineTo(Math.cos(a) * (halfWidth + 0.4), 3 + Math.sin(a) * 2.6);
      stone.closePath();
      local(
        new THREE.ExtrudeGeometry(stone, {
          depth: 0.25,
          bevelEnabled: false,
        }).translate(0, 0, -0.91),
        i % 3 ? '#c3bca7' : '#b5ad98',
      );
    }
    const frieze = new THREE.Shape();
    frieze.moveTo(-6.9, 6);
    for (let i = 0; i < 9; i++) {
      const x = -6.05 + i * 1.5;
      frieze.lineTo(x - 0.53, 6);
      frieze.absarc(x, 6, 0.53, Math.PI, 0, true);
      frieze.lineTo(x + 0.75, 6);
      const recess = new THREE.Shape();
      recess.moveTo(x - 0.53, 5.85);
      recess.lineTo(x - 0.53, 6);
      recess.absarc(x, 6, 0.53, Math.PI, 0, true);
      recess.lineTo(x + 0.53, 5.85);
      recess.closePath();
      local(new THREE.ShapeGeometry(recess).translate(0, 0, -0.72), '#575447');
      const medallion = new THREE.CylinderGeometry(0.23, 0.23, 0.12, 20);
      medallion.rotateX(Math.PI / 2);
      local(medallion.translate(x, 7.22, -1.02), '#bfb297');
    }
    frieze.lineTo(6.9, 7.15);
    frieze.lineTo(-6.9, 7.15);
    frieze.closePath();
    local(
      new THREE.ExtrudeGeometry(frieze, {
        depth: 0.45,
        bevelEnabled: false,
        curveSegments: 16,
      }).translate(0, 0, -1.15),
      '#b8ab90',
    );
    const turret = (axis[1] > 0 ? 1 : -1) * 7.1;
    local(
      new THREE.CylinderGeometry(1.16, 1.35, 8.7, 32).translate(
        turret,
        4.35,
        -0.25,
      ),
      '#a59c85',
    );
    for (const y of [0.4, 3.2, 8.5])
      local(
        new THREE.CylinderGeometry(1.38, 1.38, 0.2, 32).translate(
          turret,
          y,
          -0.25,
        ),
        '#c1b399',
      );
    for (let i = 0; i < 10; i++) {
      const theta = (i * Math.PI) / 5;
      const merlon = new THREE.BoxGeometry(0.5, 0.62, 0.42);
      merlon.rotateY(theta);
      local(
        merlon.translate(
          turret + Math.sin(theta) * 1.1,
          8.94,
          -0.25 + Math.cos(theta) * 1.1,
        ),
        '#b4a78d',
      );
      const niche = new THREE.Shape();
      niche.moveTo(-0.2, 0);
      niche.lineTo(0.2, 0);
      niche.lineTo(0.2, 0.65);
      niche.absarc(0, 0.65, 0.2, 0, Math.PI, false);
      niche.closePath();
      const panel = new THREE.ShapeGeometry(niche);
      panel.translate(0, 7.25, 1.18);
      panel.rotateY(theta);
      local(panel.translate(turret, 0, -0.25), '#5f5a4d');
    }
    add(
      '#b9ad92',
      continuousWall(
        [
          [end[0] - axis[1] * 7.4, end[1] + axis[0] * 7.4],
          [end[0] + axis[1] * 7.4, end[1] - axis[0] * 7.4],
        ],
        1.7,
        () => ({
          bottom: approach.floor + height - 0.15,
          top: approach.floor + height + 0.15,
        }),
        false,
      ),
      'stone',
    );
  }
  for (const offset of [-2.5175, -1.0825, 1.0825, 2.5175]) {
    const track = ribbonEdges(samples, Math.abs(offset) * 2).map((edge) =>
      offset < 0 ? edge.left : edge.right,
    );
    add('#767c79', pathRibbon(track, 0.055, 0.085, floor), 'metal');
  }
}
