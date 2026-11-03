import * as THREE from 'three';
import { elevation, sculptures, columnShrine } from './geo';
import type { AddGeometry } from './architecture';

type Vertex = readonly [number, number, number];
type Figure = {
  x: number;
  z?: number;
  seated?: boolean;
  robe?: boolean;
  beard?: boolean;
  crown?: boolean;
  left?: readonly Vertex[];
  right?: readonly Vertex[];
};

export function makeMonuments(add: AddGeometry) {
  const shrineGround = elevation(...columnShrine.point);
  const stone = '#c5bda6';
  const shrine = (geometry: THREE.BufferGeometry, color = stone) => {
    geometry.translate(
      columnShrine.point[0],
      shrineGround,
      columnShrine.point[1],
    );
    add(color, geometry, 'stone');
  };
  for (const [width, height, y] of [
    [1.5, 0.18, 0.09],
    [1.2, 0.18, 0.27],
    [0.86, 0.65, 0.685],
    [0.75, 0.13, 1.075],
    [0.72, 0.16, 3.35],
    [0.87, 0.12, 4.22],
  ])
    shrine(new THREE.BoxGeometry(width, height, width).translate(0, y, 0));
  shrine(new THREE.CylinderGeometry(0.21, 0.31, 2.1, 16).translate(0, 2.19, 0));
  shrine(new THREE.BoxGeometry(0.68, 0.74, 0.68).translate(0, 3.79, 0));
  for (let face = 0; face < 4; face++) {
    const angle = (face * Math.PI) / 2;
    shrine(
      new THREE.BoxGeometry(0.42, 0.52, 0.025)
        .translate(0, 3.8, 0.348)
        .rotateY(angle),
      '#58615c',
    );
    shrine(
      new THREE.BoxGeometry(0.055, 0.3, 0.03)
        .translate(0, 3.8, 0.365)
        .rotateY(angle),
    );
    shrine(
      new THREE.BoxGeometry(0.2, 0.055, 0.03)
        .translate(0, 3.86, 0.365)
        .rotateY(angle),
    );
  }
  shrine(
    new THREE.ConeGeometry(0.67, 0.46, 4)
      .rotateY(Math.PI / 4)
      .translate(0, 4.51, 0),
  );
  shrine(
    new THREE.BoxGeometry(0.065, 0.46, 0.065).translate(0, 4.91, 0),
    '#5b655d',
  );
  shrine(
    new THREE.BoxGeometry(0.27, 0.065, 0.065).translate(0, 5.01, 0),
    '#5b655d',
  );
  for (const monument of sculptures) {
    const width = monument.width / monument.scale,
      depth = monument.depth / monument.scale;
    const ground = elevation(...monument.point);
    const stone = monument.tags.material === 'wood' ? '#9a7954' : '#c4bb9f';
    const emit = (
      geometry: THREE.BufferGeometry,
      color = stone,
      kind: Parameters<AddGeometry>[2] = 'plaster',
    ) => {
      geometry.scale(monument.scale, monument.scale, monument.scale);
      geometry.rotateY(monument.angle);
      geometry.translate(monument.point[0], ground, monument.point[1]);
      add(color, geometry, kind);
    };
    const block = (
      width: number,
      height: number,
      depth: number,
      x: number,
      y: number,
      z: number,
      color = stone,
    ) =>
      emit(
        new THREE.BoxGeometry(width, height, depth).translate(x, y, z),
        color,
      );
    const ellipsoid = (at: Vertex, scale: Vertex, color = stone) =>
      emit(
        new THREE.SphereGeometry(1, 16, 12).scale(...scale).translate(...at),
        color,
      );
    const beam = (a: Vertex, b: Vertex, radius: number, color = stone) => {
      const start = new THREE.Vector3(...a),
        end = new THREE.Vector3(...b);
      const geometry = new THREE.CylinderGeometry(
        radius * 0.85,
        radius,
        start.distanceTo(end),
        12,
      );
      geometry.applyQuaternion(
        new THREE.Quaternion().setFromUnitVectors(
          new THREE.Vector3(0, 1, 0),
          end.clone().sub(start).normalize(),
        ),
      );
      geometry.translate(...start.add(end).multiplyScalar(0.5).toArray());
      emit(geometry, color);
    };
    const footing = Math.min(
      ground - 0.15,
      ...[-1, 1].flatMap((sx) =>
        [-1, 1].map((sz) => {
          const x = (sx * monument.width) / 2,
            z = (sz * monument.depth) / 2;
          return (
            elevation(
              monument.point[0] +
                x * Math.cos(monument.angle) +
                z * Math.sin(monument.angle),
              monument.point[1] -
                x * Math.sin(monument.angle) +
                z * Math.cos(monument.angle),
            ) - 0.15
          );
        }),
      ),
    );
    block(
      width,
      ground - footing + 0.22,
      depth,
      0,
      (footing - ground + 0.22) / 2,
      0,
      '#a39c87',
    );
    block(width - 0.3, 0.18, depth - 0.2, 0, 0.31, 0);
    block(width - 0.65, 1, depth - 0.55, 0, 0.9, 0);
    block(width - 0.28, 0.22, depth - 0.15, 0, 1.49, 0);
    const plinth = 1.6;
    const figure = (pose: Figure, lift = 0) => {
      const base = plinth + lift;
      const move = ([x, y, z]: Vertex): Vertex => [
        x + pose.x,
        y + base,
        z + (pose.z ?? 0),
      ];
      const sphere = (at: Vertex, scale: Vertex, color = stone) =>
        ellipsoid(move(at), scale, color);
      const limb = (points: readonly Vertex[], radius: number) => {
        for (let i = 1; i < points.length; i++) {
          beam(move(points[i - 1]), move(points[i]), radius);
          sphere(points[i], [radius, radius, radius]);
        }
      };
      const shoulder = pose.seated ? 1.55 : 1.95;
      const head = shoulder + 0.42;
      if (pose.robe) {
        const profile = [
          [0.43, 0.04],
          [0.44, 0.22],
          [0.37, 0.7],
          [0.3, shoulder - 0.65],
          [0.35, shoulder - 0.3],
          [0.43, shoulder - 0.12],
          [0.24, shoulder + 0.03],
          [0.13, shoulder + 0.12],
        ].map(([x, y]) => new THREE.Vector2(x, y));
        const robe = new THREE.LatheGeometry(profile, 32);
        const positions = robe.getAttribute('position');
        for (let i = 0; i < positions.count; i++) {
          const angle = Math.atan2(positions.getZ(i), positions.getX(i));
          const fold =
            1 +
            Math.sin(angle * 9 + positions.getY(i) * 0.7) *
              0.055 *
              Math.max(0, 1 - positions.getY(i) / shoulder);
          positions.setXYZ(
            i,
            positions.getX(i) * fold,
            positions.getY(i),
            positions.getZ(i) * fold * 0.76,
          );
        }
        robe.computeVertexNormals();
        emit(robe.translate(...move([0, 0, 0])));
      } else {
        sphere([0, shoulder - 0.38, 0], [0.37, 0.49, 0.24]);
        sphere([0, shoulder - 0.85, 0], [0.32, 0.22, 0.25]);
        for (const side of [-1, 1]) {
          const knee: Vertex = pose.seated
            ? [side * 0.25, 0.62, 0.65]
            : [side * 0.2, 0.56, 0.04];
          const foot: Vertex = [side * 0.24, 0.13, pose.seated ? 0.68 : 0.1];
          limb([[side * 0.19, shoulder - 0.9, 0], knee, foot], 0.14);
          sphere(foot, [0.14, 0.09, 0.28]);
        }
      }
      sphere([0, shoulder + 0.15, 0], [0.12, 0.22, 0.12]);
      sphere([0, head, 0.015], [0.2, 0.27, 0.2]);
      sphere([0, head + 0.035, -0.07], [0.215, 0.24, 0.18], '#b4aa91');
      sphere([0, head - 0.015, 0.205], [0.055, 0.075, 0.075]);
      if (pose.beard)
        sphere([0, head - 0.22, 0.13], [0.14, 0.2, 0.11], '#b4aa91');
      if (pose.crown) {
        emit(
          new THREE.CylinderGeometry(0.215, 0.215, 0.12, 16).translate(
            ...move([0, head + 0.19, 0]),
          ),
        );
        for (let i = 0; i < 8; i++) {
          const angle = (i * Math.PI) / 4;
          emit(
            new THREE.ConeGeometry(0.055, 0.15, 6).translate(
              ...move([
                Math.sin(angle) * 0.18,
                head + 0.31,
                Math.cos(angle) * 0.18,
              ]),
            ),
          );
        }
      }
      limb(
        [
          [-0.34, shoulder, 0],
          ...(pose.left ?? [
            [-0.48, shoulder - 0.35, 0.1],
            [-0.3, shoulder - 0.65, 0.25],
          ]),
        ],
        0.115,
      );
      limb(
        [
          [0.34, shoulder, 0],
          ...(pose.right ?? [
            [0.48, shoulder - 0.35, 0.1],
            [0.3, shoulder - 0.65, 0.25],
          ]),
        ],
        0.115,
      );
    };
    if (monument.id === 1200812873) {
      figure({
        x: -0.78,
        robe: true,
        crown: true,
        right: [
          [0.65, 2.1, -0.25],
          [1.05, 2.38, -0.65],
        ],
      });
      figure({ x: 0.7, beard: true });
      beam([0.85, plinth + 0.15, 0.7], [1.45, plinth + 1.4, 0.45], 0.08);
      beam([0.4, plinth + 0.2, 0.9], [1.65, plinth + 0.25, 0.9], 0.07);
    } else if (monument.id === 1200812866) {
      block(1.05, 0.7, 0.8, -0.75, plinth + 0.35, -0.2);
      figure({ x: -0.75, seated: true, beard: true });
      figure({ x: 0.7, robe: true });
      for (const x of [-0.32, 0.38])
        beam([x, plinth + 0.65, 0.7], [x, plinth + 1.7, 0.7], 0.07);
      beam([-0.32, plinth + 1.7, 0.7], [0.38, plinth + 1.7, 0.7], 0.09);
      beam([-0.32, plinth + 0.65, 0.7], [0.38, plinth + 0.65, 0.7], 0.08);
      for (let i = 1; i < 6; i++)
        beam(
          [-0.32 + i * 0.117, plinth + 0.7, 0.7],
          [-0.32 + i * 0.117, plinth + 1.65, 0.7],
          0.012,
        );
    } else if (monument.id === 1200812876) {
      figure({
        x: -0.7,
        right: [
          [0.6, 1.65, 0.25],
          [0.9, 1.4, 0.4],
        ],
      });
      figure({ x: 0.75, seated: true, robe: true });
      beam([-1.2, plinth + 0.05, 0.4], [-1.12, plinth + 1.25, 0.4], 0.035);
      beam([-1.35, plinth + 1.05, 0.4], [-0.9, plinth + 1.05, 0.4], 0.045);
    } else if (monument.id === 1200812856) {
      figure({ x: -0.72, beard: true });
      figure({
        x: 0.7,
        beard: true,
        right: [
          [0.6, 2.15, 0],
          [0.75, 2.55, 0.15],
        ],
      });
      ellipsoid([-1.15, plinth + 0.85, 0.4], [0.42, 0.55, 0.1]);
    } else if (monument.id === 1200790222) {
      ellipsoid([0, plinth + 1.15, 0], [0.48, 0.52, 1.05]);
      beam([0, plinth + 1.25, 0.65], [0, plinth + 2.05, 0.9], 0.23);
      ellipsoid([0, plinth + 2.05, 1.15], [0.25, 0.27, 0.43]);
      for (const side of [-1, 1])
        for (const z of [-0.7, 0.55])
          beam(
            [side * 0.33, plinth + 1.05, z],
            [side * 0.38, plinth + 0.05, z + 0.1],
            0.095,
          );
      beam([0, plinth + 1.3, -0.9], [0, plinth + 0.5, -1.35], 0.09);
      figure({ x: 0, seated: true, robe: true, crown: true }, 1.4);
    } else if (monument.id === 1200790218) {
      for (const x of [-1.04, 1.04])
        block(0.24, 2.3, 0.5, x, plinth + 1.15, 0.2);
      const backing = new THREE.Shape();
      backing.moveTo(-0.92, plinth);
      backing.lineTo(0.92, plinth);
      backing.lineTo(0.92, plinth + 2.3);
      backing.absarc(0, plinth + 2.3, 0.92, 0, Math.PI, false);
      backing.closePath();
      emit(
        new THREE.ShapeGeometry(backing, 24).translate(0, 0, -0.15),
        '#716b5b',
        'stone',
      );
      const hood = new THREE.Shape();
      hood.absarc(0, plinth + 2.3, 1.16, Math.PI, 0, true);
      hood.lineTo(0.92, plinth + 2.3);
      hood.absarc(0, plinth + 2.3, 0.92, 0, Math.PI, false);
      hood.closePath();
      emit(
        new THREE.ExtrudeGeometry(hood, {
          depth: 0.45,
          bevelEnabled: false,
          curveSegments: 20,
        }).translate(0, 0, 0),
      );
      figure({
        x: 0,
        left: [
          [-0.45, 2.2, -0.1],
          [-0.2, 2.7, -0.12],
        ],
        right: [
          [0.45, 2.15, -0.1],
          [0.2, 2.65, -0.12],
        ],
      });
      beam([0, plinth, -0.25], [0.06, plinth + 2.8, -0.25], 0.14, '#a69b83');
      for (const y of [0.9, 1.45])
        beam(
          [0.55, plinth + y, 0.65],
          [0.05, plinth + y + 0.15, 0.12],
          0.018,
          '#827b69',
        );
    } else {
      figure({
        x: 0,
        robe: true,
        beard: true,
        crown: monument.id === 7016578061,
        left: [
          [-0.45, 1.65, 0.3],
          [-0.22, 1.45, 0.45],
        ],
      });
      block(0.4, 0.34, 0.12, -0.15, plinth + 1.4, 0.45);
      if (monument.id === 7016578061)
        ellipsoid([0.38, plinth + 1.4, 0.32], [0.13, 0.13, 0.13]);
    }
  }
}
