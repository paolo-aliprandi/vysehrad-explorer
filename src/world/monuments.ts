import * as THREE from 'three';
import {
  elevation,
  sculptures,
  columnShrine,
  cemeteryCornerShrine,
} from './geo';
import type { AddGeometry } from './architecture';

type Vertex = readonly [number, number, number];
type Figure = {
  x: number;
  z?: number;
  seated?: boolean;
  mounted?: boolean;
  robe?: boolean;
  beard?: boolean;
  crown?: boolean;
  cloak?: boolean;
  lean?: number;
  yaw?: number;
  left?: readonly Vertex[];
  right?: readonly Vertex[];
};

export function makeMonuments(add: AddGeometry) {
  makeCemeteryCornerShrine(add);
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
    const corner = monument.id === -91010;
    const procopius = monument.id === 4294837398;
    const karlach = monument.id === 3573420654;
    const myslbek = monument.tags.artist_name === 'Josef Václav Myslbek';
    const ground = corner
      ? cemeteryCornerShrine.ground
      : elevation(...monument.point);
    const stone =
      monument.tags.material === 'wood'
        ? '#9a7954'
        : myslbek
          ? '#96998e'
          : '#c4bb9f';
    const detailStone = myslbek ? '#81877e' : '#b4aa91';
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
    if (monument.id === 1751591206) {
      for (const [w, h, d, y] of [
        [3.1, 0.18, 2.7, 0.25],
        [2.8, 0.2, 2.45, 0.44],
        [2.4, 1.1, 2.1, 1.08],
        [2.8, 0.17, 2.4, 1.72],
        [2.95, 0.13, 2.55, 1.88],
        [1.1, 0.2, 0.95, 2.04],
      ])
        block(w, h, d, 0, y, 0, '#97745d');
      for (const x of [-1.12, 1.12]) {
        block(0.35, 0.42, 0.52, x, 2.12, -0.5, '#94735c');
        block(0.45, 0.12, 0.64, x, 2.38, -0.5, '#a28268');
      }
      ellipsoid([0, 2.4, 0], [0.58, 0.34, 0.3], '#465d50');
      ellipsoid([0, 2.72, 0], [0.16, 0.25, 0.15], '#465d50');
      ellipsoid([0, 3.04, 0.04], [0.25, 0.3, 0.23], '#4c6254');
      ellipsoid([0, 3.05, 0.275], [0.065, 0.075, 0.075], '#4b5c4d');
      ellipsoid([0, 2.91, 0.21], [0.14, 0.07, 0.08], '#405246');
      for (const side of [-1, 1]) {
        ellipsoid([side * 0.1, 3.11, 0.25], [0.065, 0.025, 0.025], '#324538');
        beam([side * 0.35, 2.56, 0.2], [0, 2.32, 0.3], 0.025, '#82917a');
      }
      continue;
    }
    if (karlach) {
      block(width - 0.1, 0.12, depth - 0.1, 0, 0.16, 0);
    } else if (corner || procopius) {
      block(width - 0.1, 0.15, depth - 0.1, 0, 0.3, 0);
      block(width - 0.25, 0.4, depth - 0.2, 0, 0.575, 0);
      block(width, 0.12, depth, 0, 0.835, 0);
    } else {
      block(width - 0.3, 0.18, depth - 0.2, 0, 0.31, 0);
      block(width - 0.65, 1, depth - 0.55, 0, 0.9, 0);
      block(width - 0.28, 0.22, depth - 0.15, 0, 1.49, 0);
    }
    const plinth = karlach ? 0.22 : corner || procopius ? 0.9 : 1.6;
    const figure = (pose: Figure, lift = 0) => {
      const base = plinth + lift;
      const move = ([x, y, z]: Vertex): Vertex => {
        const yaw = pose.yaw ?? 0;
        return [
          x * Math.cos(yaw) + z * Math.sin(yaw) + pose.x + (pose.lean ?? 0) * y,
          y + base,
          -x * Math.sin(yaw) + z * Math.cos(yaw) + (pose.z ?? 0),
        ];
      };
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
      if (pose.cloak) {
        const cloth = new THREE.Shape();
        cloth.moveTo(-0.3, 0.25);
        cloth.bezierCurveTo(-0.85, 0.65, -0.9, 1.4, -0.39, shoulder);
        cloth.lineTo(0.35, shoulder);
        cloth.bezierCurveTo(0.72, 1.7, 0.87, 0.65, 0.55, 0.12);
        cloth.quadraticCurveTo(0, -0.02, -0.3, 0.25);
        const geometry = new THREE.ExtrudeGeometry(cloth, {
          depth: 0.11,
          bevelEnabled: true,
          bevelSize: 0.04,
          bevelThickness: 0.04,
          bevelSegments: 2,
          curveSegments: 16,
        });
        const positions = geometry.getAttribute('position');
        for (let i = 0; i < positions.count; i++) {
          const x = positions.getX(i),
            y = positions.getY(i);
          positions.setXYZ(
            i,
            ...move([
              x,
              y,
              positions.getZ(i) - 0.28 + Math.sin(x * 13 + y * 0.5) * 0.045,
            ]),
          );
        }
        geometry.computeVertexNormals();
        emit(geometry, detailStone);
      }
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
        for (let i = 0; i < positions.count; i++)
          positions.setXYZ(
            i,
            ...move([positions.getX(i), positions.getY(i), positions.getZ(i)]),
          );
        robe.computeVertexNormals();
        emit(robe);
      } else {
        sphere([0, shoulder - 0.38, 0], [0.37, 0.49, 0.24]);
        sphere([0, shoulder - 0.85, 0], [0.32, 0.22, 0.25]);
        for (const side of [-1, 1]) {
          const knee: Vertex = pose.seated
            ? [side * (pose.mounted ? 0.58 : 0.25), 0.62, 0.65]
            : [side * 0.2, 0.56, 0.04];
          const foot: Vertex = [
            side * (pose.mounted ? 0.62 : 0.24),
            0.13,
            pose.seated ? 0.68 : 0.1,
          ];
          limb([[side * 0.19, shoulder - 0.9, 0], knee, foot], 0.14);
          sphere(foot, [0.14, 0.09, 0.28]);
        }
      }
      sphere([0, shoulder + 0.15, 0], [0.12, 0.22, 0.12]);
      sphere([0, head, 0.015], [0.2, 0.27, 0.2]);
      sphere([0, head + 0.035, -0.07], [0.215, 0.24, 0.18], detailStone);
      sphere([0, head - 0.015, 0.205], [0.055, 0.075, 0.075]);
      for (const side of [-1, 1])
        sphere(
          [side * 0.085, head + 0.055, 0.19],
          [0.052, 0.018, 0.022],
          detailStone,
        );
      sphere([0, head - 0.1, 0.2], [0.075, 0.014, 0.014], detailStone);
      if (pose.beard)
        sphere([0, head - 0.22, 0.13], [0.14, 0.2, 0.11], detailStone);
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
    if (procopius) {
      figure({
        x: -0.12,
        robe: true,
        beard: true,
        left: [
          [-0.42, 1.65, 0.22],
          [-0.1, 1.75, 0.34],
        ],
        right: [
          [0.45, 1.45, 0.18],
          [0.65, 1.1, 0.24],
        ],
      });
      const mitre = new THREE.Shape();
      mitre.moveTo(-0.24, plinth + 2.52);
      mitre.quadraticCurveTo(-0.4, plinth + 2.88, -0.12, plinth + 3.22);
      mitre.quadraticCurveTo(0.2, plinth + 2.95, 0.08, plinth + 2.52);
      mitre.closePath();
      emit(
        new THREE.ExtrudeGeometry(mitre, {
          depth: 0.3,
          bevelEnabled: false,
        }).translate(0, 0, -0.12),
      );
      block(0.075, 0.6, 0.07, -0.23, plinth + 1.65, 0.41);
      block(0.34, 0.075, 0.07, -0.23, plinth + 1.78, 0.41);
      ellipsoid([0.63, plinth + 0.36, 0.23], [0.27, 0.3, 0.22]);
      ellipsoid([0.61, plinth + 0.81, 0.21], [0.2, 0.22, 0.2]);
      for (const side of [-1, 1])
        emit(
          new THREE.ConeGeometry(0.055, 0.21, 8)
            .rotateZ(-side * 0.35)
            .translate(0.61 + side * 0.16, plinth + 1, 0.21),
        );
      const profile = new THREE.Shape();
      profile.moveTo(-2.2, -0.2);
      profile.lineTo(-2.2, 4.35);
      profile.lineTo(2.2, 4.35);
      profile.lineTo(2.2, -0.2);
      profile.lineTo(0.95, -0.2);
      profile.lineTo(0.95, 3.15);
      profile.absarc(0, 3.15, 0.95, 0, Math.PI, false);
      profile.lineTo(-0.95, -0.2);
      profile.closePath();
      emit(
        new THREE.ExtrudeGeometry(profile, {
          depth: 0.6,
          bevelEnabled: false,
          curveSegments: 28,
        }).translate(0, 0, -0.38),
        '#b6b09b',
        'rubble',
      );
      emit(
        new THREE.BoxGeometry(1.9, 4.1, 0.08).translate(0, 1.9, -0.37),
        '#b6bdba',
        'plaster',
      );
      emit(
        new THREE.BoxGeometry(4.65, 0.12, 0.9)
          .rotateZ(0.07)
          .translate(0, 4.4, -0.08),
        '#a26a52',
        'slate',
      );
    } else if (karlach) {
      figure({
        x: 0,
        robe: true,
        left: [
          [-0.45, 1.55, 0.18],
          [-0.05, 1.35, 0.36],
        ],
        right: [
          [0.45, 1.5, 0.2],
          [0.12, 1.65, 0.35],
        ],
      });
      block(0.42, 0.16, 0.38, 0, plinth + 2.55, 0);
      for (const side of [-1, 1])
        block(0.08, 0.18, 0.4, side * 0.14, plinth + 2.64, 0);
      beam([-0.15, plinth + 1.6, 0.4], [0.37, plinth + 1.24, 0.4], 0.07);
    } else if (corner) {
      figure({
        x: 0,
        robe: true,
        left: [
          [-0.42, 1.7, 0.12],
          [-0.12, 1.95, 0.3],
        ],
        right: [
          [0.45, 1.4, 0.12],
          [0.2, 1.2, 0.3],
        ],
      });
    } else if (monument.id === 1200812873) {
      figure({
        x: -0.78,
        robe: true,
        cloak: true,
        yaw: -0.15,
        crown: true,
        right: [
          [0.65, 2.1, -0.25],
          [1.05, 2.38, -0.65],
        ],
      });
      figure({
        x: 0.7,
        beard: true,
        cloak: true,
        yaw: 0.15,
        right: [
          [0.55, 2.25, 0.1],
          [0.82, 2.75, 0.16],
        ],
      });
      for (let i = 0; i < 8; i++) {
        const angle = (i * Math.PI) / 4;
        beam(
          [
            1.52 + Math.sin(angle) * 0.25,
            plinth + 2.75 + Math.cos(angle) * 0.25,
            0.16,
          ],
          [
            1.52 + Math.sin(angle + Math.PI / 4) * 0.25,
            plinth + 2.75 + Math.cos(angle + Math.PI / 4) * 0.25,
            0.16,
          ],
          0.028,
        );
      }
      beam([0.85, plinth + 0.15, 0.7], [1.45, plinth + 1.4, 0.45], 0.08);
      beam([0.4, plinth + 0.2, 0.9], [1.65, plinth + 0.25, 0.9], 0.07);
    } else if (monument.id === 1200812866) {
      block(1.05, 0.7, 0.8, -0.75, plinth + 0.35, -0.2);
      figure({ x: -0.75, seated: true, beard: true, cloak: true, yaw: 0.2 });
      figure({ x: 0.7, robe: true, cloak: true, yaw: -0.2 });
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
        x: -0.65,
        robe: true,
        cloak: true,
        lean: -0.22,
        yaw: 0.25,
        left: [
          [-0.6, 2.3, 0.02],
          [-0.65, 2.65, -0.1],
        ],
        right: [
          [0.6, 2.15, 0.25],
          [0.9, 1.85, 0.3],
        ],
      });
      figure({
        x: 0.75,
        seated: true,
        beard: true,
        cloak: true,
        lean: -0.12,
        yaw: -0.4,
        left: [
          [-0.55, 1.5, 0.25],
          [-0.9, 1.9, 0.3],
        ],
      });
      beam([-1.2, plinth + 0.05, 0.4], [-1.12, plinth + 1.25, 0.4], 0.035);
      beam([-1.35, plinth + 1.05, 0.4], [-0.9, plinth + 1.05, 0.4], 0.045);
    } else if (monument.id === 1200812856) {
      figure({ x: -0.72, beard: true, cloak: true, yaw: 0.2 });
      figure({
        x: 0.7,
        beard: true,
        cloak: true,
        yaw: -0.12,
        right: [
          [0.6, 2.15, 0],
          [0.75, 2.55, 0.15],
        ],
      });
      ellipsoid([-1.15, plinth + 0.85, 0.4], [0.42, 0.55, 0.1]);
    } else if (monument.id === 1200790222) {
      const curve = (
        points: readonly Vertex[],
        radius: number,
        color = stone,
      ) =>
        emit(
          new THREE.TubeGeometry(
            new THREE.CatmullRomCurve3(
              points.map(([x, y, z]) => new THREE.Vector3(x, plinth + y, z)),
            ),
            24,
            radius,
            8,
            false,
          ),
          color,
        );
      ellipsoid([0, plinth + 1.5, -0.1], [0.55, 0.64, 1.05]);
      ellipsoid([0, plinth + 1.68, 0.64], [0.48, 0.71, 0.49]);
      const neck = new THREE.Shape();
      neck.moveTo(-0.4, 1.75);
      neck.bezierCurveTo(-0.45, 2.4, -0.7, 3.05, -1.05, 3.05);
      neck.bezierCurveTo(-1.4, 3.05, -1.48, 2.8, -1.3, 2.51);
      neck.bezierCurveTo(-0.98, 2.16, -1.1, 1.52, -0.4, 1.75);
      emit(
        new THREE.ExtrudeGeometry(neck, {
          depth: 0.42,
          bevelEnabled: true,
          bevelSize: 0.12,
          bevelThickness: 0.08,
          bevelSegments: 3,
          curveSegments: 24,
        })
          .translate(0, plinth, -0.21)
          .rotateY(Math.PI / 2),
      );
      emit(
        new THREE.SphereGeometry(1, 24, 16)
          .scale(0.26, 0.28, 0.45)
          .rotateX(0.4)
          .translate(0, plinth + 2.73, 1.29),
      );
      ellipsoid([0, plinth + 2.48, 1.55], [0.23, 0.2, 0.23]);
      for (const side of [-1, 1]) {
        emit(
          new THREE.ConeGeometry(0.09, 0.36, 12)
            .rotateX(-0.2)
            .translate(side * 0.18, plinth + 3.08, 1.03),
        );
        ellipsoid(
          [side * 0.245, plinth + 2.81, 1.3],
          [0.025, 0.025, 0.045],
          '#756f60',
        );
        for (let i = 0; i < 7; i++)
          curve(
            [
              [side * 0.13, 3.03 - i * 0.1, 0.99 - i * 0.065],
              [side * 0.3, 2.95 - i * 0.13, 0.84 - i * 0.065],
              [side * 0.31, 2.82 - i * 0.14, 0.92 - i * 0.07],
            ],
            0.045,
            detailStone,
          );
        const leg: Vertex[] =
          side < 0
            ? [
                [-0.34, 1.65, 0.65],
                [-0.4, 1.15, 1.18],
                [-0.43, 0.85, 0.95],
              ]
            : [
                [0.34, 1.6, 0.65],
                [0.39, 0.75, 0.84],
                [0.4, 0.12, 1.03],
              ];
        for (let i = 1; i < leg.length; i++) {
          const a = leg[i - 1],
            b = leg[i];
          beam(
            [a[0], plinth + a[1], a[2]],
            [b[0], plinth + b[1], b[2]],
            i === 1 ? 0.145 : 0.105,
          );
          ellipsoid([b[0], plinth + b[1], b[2]], [0.12, 0.13, 0.13]);
        }
        const hoof = leg[2];
        block(
          0.24,
          0.17,
          0.32,
          hoof[0],
          plinth + hoof[1] - 0.04,
          hoof[2] + 0.07,
          detailStone,
        );
        curve(
          [
            [side * 0.36, 1.45, -0.72],
            [side * 0.41, 0.65, -0.84],
            [side * 0.43, 0.14, -1.03],
          ],
          0.12,
        );
        block(0.24, 0.17, 0.32, side * 0.43, plinth + 0.1, -0.96, detailStone);
        curve(
          [
            [side * 0.27, 2.85, 1.1],
            [side * 0.28, 2.47, 1.52],
            [side * 0.26, 2.4, 1.55],
          ],
          0.018,
          '#52605a',
        );
        curve(
          [
            [side * 0.26, 2.44, 1.55],
            [side * 0.48, 2.3, 0.85],
            [side * 0.25, 2.8, 0.35],
          ],
          0.016,
          '#52605a',
        );
      }
      curve(
        [
          [0, 1.63, -1],
          [0.12, 1.35, -1.25],
          [0.18, 0.62, -1.45],
          [0.05, 0.25, -1.29],
        ],
        0.13,
        detailStone,
      );
      ellipsoid([0, plinth + 2.03, -0.12], [0.54, 0.12, 0.65], detailStone);
      figure(
        {
          x: 0,
          seated: true,
          mounted: true,
          cloak: true,
          beard: true,
          left: [
            [-0.5, 1.65, 0.27],
            [-0.65, 1.8, 0.65],
          ],
          right: [
            [0.42, 1.2, 0.4],
            [0.25, 1.3, 0.35],
          ],
        },
        1.5,
      );
      ellipsoid([0, plinth + 3.68, -0.035], [0.23, 0.1, 0.22], detailStone);
      beam(
        [-0.65, plinth + 0.65, 0.5],
        [-0.65, plinth + 4.25, 0.85],
        0.025,
        '#52605a',
      );
      const flag = new THREE.Shape();
      flag.moveTo(0, 0);
      flag.bezierCurveTo(0.5, -0.12, 0.92, 0.15, 1.4, 0.03);
      flag.lineTo(1.05, -0.23);
      flag.lineTo(1.45, -0.44);
      flag.bezierCurveTo(0.92, -0.3, 0.45, -0.62, 0, -0.5);
      flag.closePath();
      emit(
        new THREE.ExtrudeGeometry(flag, {
          depth: 0.014,
          bevelEnabled: false,
          curveSegments: 20,
        })
          .rotateY(-Math.PI / 2)
          .translate(-0.65, plinth + 4.1, 0.84),
        '#dedbcd',
        'plaster',
      );
      const eagle = new THREE.Shape();
      eagle.moveTo(0.55, -0.1);
      for (const [x, y] of [
        [0.65, -0.05],
        [0.68, -0.12],
        [0.86, -0.08],
        [0.98, -0.1],
        [0.84, -0.18],
        [0.99, -0.18],
        [0.81, -0.25],
        [0.7, -0.25],
        [0.77, -0.39],
        [0.62, -0.34],
        [0.52, -0.43],
        [0.51, -0.28],
        [0.35, -0.31],
        [0.22, -0.29],
        [0.38, -0.23],
        [0.2, -0.2],
        [0.36, -0.18],
        [0.22, -0.12],
        [0.42, -0.13],
        [0.55, -0.18],
      ])
        eagle.lineTo(x, y);
      eagle.closePath();
      emit(
        new THREE.ExtrudeGeometry(eagle, { depth: 0.022, bevelEnabled: false })
          .rotateY(-Math.PI / 2)
          .translate(-0.646, plinth + 4.1, 0.84),
        '#3b4540',
        'plaster',
      );
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

export function makeCemeteryCornerShrine(add: AddGeometry) {
  const { point, ground, angle } = cemeteryCornerShrine;
  const emit = (
    geometry: THREE.BufferGeometry,
    color: string,
    kind: Parameters<AddGeometry>[2] = 'plaster',
  ) => {
    geometry.rotateY(angle);
    geometry.translate(point[0], ground, point[1]);
    add(color, geometry, kind);
  };
  emit(
    new THREE.CylinderGeometry(
      1.13,
      1.17,
      4.3,
      40,
      1,
      false,
      0.88,
      Math.PI * 2 - 1.76,
    ).translate(0, 2.15, 0),
    '#dad3be',
  );
  emit(
    new THREE.BoxGeometry(1.55, 3.7, 0.15).translate(0, 1.85, -0.3),
    '#99927e',
    'stone',
  );
  const arch = new THREE.Shape();
  arch.moveTo(-0.88, 0);
  arch.lineTo(-0.71, 0);
  arch.lineTo(-0.71, 2.7);
  arch.absarc(0, 2.7, 0.71, Math.PI, 0, true);
  arch.lineTo(0.71, 0);
  arch.lineTo(0.88, 0);
  arch.lineTo(0.88, 4.3);
  arch.lineTo(-0.88, 4.3);
  arch.closePath();
  emit(
    new THREE.ExtrudeGeometry(arch, {
      depth: 0.24,
      bevelEnabled: false,
      curveSegments: 24,
    }).translate(0, 0, 0.62),
    '#ded7c3',
  );
  emit(
    new THREE.CylinderGeometry(1.2, 1.2, 0.12, 40).translate(0, 0.06, 0),
    '#bcb39e',
    'stone',
  );
  for (const [radius, y] of [
    [1.18, 3.95],
    [1.23, 4.25],
  ] as const)
    emit(
      new THREE.CylinderGeometry(radius, radius, 0.12, 40).translate(0, y, 0),
      '#c9c0aa',
      'stone',
    );
  for (let i = 0; i < 16; i++) {
    const theta = (i * Math.PI) / 8;
    emit(
      new THREE.TorusGeometry(0.17, 0.035, 5, 12, Math.PI)
        .translate(0, 3.93, 1.13)
        .rotateY(theta),
      '#c9c0aa',
      'stone',
    );
  }
  emit(
    new THREE.ConeGeometry(1.36, 0.7, 40).translate(0, 4.68, 0),
    '#92674f',
    'slate',
  );
  for (let ring = 0; ring < 4; ring++)
    emit(
      new THREE.TorusGeometry(1.32 * (1 - ring / 4), 0.045, 5, 40)
        .rotateX(Math.PI / 2)
        .translate(0, 4.35 + ring * 0.17, 0),
      '#a77a59',
      'slate',
    );
}
