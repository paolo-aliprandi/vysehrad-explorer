import * as THREE from 'three';
import {
  buildings,
  parts,
  center,
  elevation,
  foundation,
  inside,
  type Point,
} from './geo';
import { rectangularWindow, type AddGeometry } from './architecture';
import { continuousWall, drapedPolygon, samplePolyline } from './surfaces';

export const riversideSanatorium = (() => {
  const building = buildings.find((building) => building.id === 28811361);
  if (!building) throw new Error('Missing mapped Podoli sanatorium.');
  const ground = foundation(building);
  const eaves = ground + 17.71;
  const ridges: [Point, Point, number, number][] = [
    [[-155, 240], [-103, 241.7], 8.5, 6.4],
    [[-116.5, 211], [-79, 212.3], 7.7, 6],
    [[-78, 200], [-78.7, 244], 7.5, 6],
    [[-99, 247], [-78, 271], 9, 6.5],
    [[-77, 282], [-45, 283.2], 8, 6],
    [[-38, 291], [-25, 292], 9, 6],
    [[-78, 254], [-43, 252], 6, 4.8],
    [[-76, 212], [-48, 213], 7, 5.5],
    [[-148, 234], [-138, 234], 6, 5.5],
    [[-128, 235], [-119, 235], 6, 5.5],
  ];
  const roofLevel = (point: Point) =>
    eaves +
    0.04 +
    Math.max(
      0,
      ...ridges.map(([a, b, halfWidth, rise]) => {
        const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
        const dx = (b[0] - a[0]) / length,
          dz = (b[1] - a[1]) / length;
        const along = (point[0] - a[0]) * dx + (point[1] - a[1]) * dz;
        const across = Math.abs(
          (point[0] - a[0]) * dz - (point[1] - a[1]) * dx,
        );
        return (
          rise *
          Math.max(
            0,
            Math.min(
              1 - across / halfWidth,
              1 + along / halfWidth,
              1 + (length - along) / halfWidth,
            ),
          )
        );
      }),
    );
  const faces = building.points.slice(1).flatMap((b, i) => {
    const a = building.points[i];
    const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (length < 2.5) return [];
    const axis: Point = [(b[0] - a[0]) / length, (b[1] - a[1]) / length];
    const midpoint: Point = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    let normal: Point = [-axis[1], axis[0]];
    if (
      inside(
        [midpoint[0] + normal[0] * 0.2, midpoint[1] + normal[1] * 0.2],
        building.points,
      )
    )
      normal = [-normal[0], -normal[1]];
    return [
      { a, b, length, axis, normal, angle: Math.atan2(normal[0], normal[1]) },
    ];
  });
  const windows = faces.flatMap((face) => {
    const columns = Math.max(1, Math.floor(face.length / 3.2));
    return Array.from({ length: columns }, (_, i) => {
      const t = (i + 0.5) / columns;
      return {
        point: [
          face.a[0] + (face.b[0] - face.a[0]) * t + face.normal[0] * 0.055,
          face.a[1] + (face.b[1] - face.a[1]) * t + face.normal[1] * 0.055,
        ] as Point,
        normal: face.normal,
        angle: face.angle,
      };
    });
  });
  const dormers = faces
    .filter((face) => face.length > 10)
    .flatMap((face) => {
      const count = Math.max(1, Math.floor(face.length / 9));
      return Array.from({ length: count }, (_, i) => {
        const along = ((i + 0.5) * face.length) / count;
        const point: Point = [
          face.a[0] + face.axis[0] * along - face.normal[0] * 2.4,
          face.a[1] + face.axis[1] * along - face.normal[1] * 2.4,
        ];
        const ring: Point[] = [
          [-1.3, -1.6],
          [1.3, -1.6],
          [1.3, 1.6],
          [-1.3, 1.6],
          [-1.3, -1.6],
        ].map(([x, z]) => [
          point[0] + x * Math.cos(face.angle) + z * Math.sin(face.angle),
          point[1] - x * Math.sin(face.angle) + z * Math.cos(face.angle),
        ]);
        return {
          point,
          ring,
          angle: face.angle,
          normal: face.normal,
          floor: roofLevel(point) - 0.3,
        };
      }).filter((dormer) =>
        dormer.ring.every((point) => inside(point, building.points)),
      );
    });
  const cupolas = [456794623, 456794624, 525247513].map((id) => {
    const part = parts.find((part) => part.id === id);
    if (!part) throw new Error(`Missing sanatorium cupola ${id}.`);
    return {
      id,
      point: center(part.points),
      radius: id === 525247513 ? 2.7 : 4,
      floor: eaves - 0.7,
      drumHeight: id === 525247513 ? 4.2 : 5,
    };
  });
  return {
    building,
    ground,
    eaves,
    roofLevel,
    faces,
    windows,
    dormers: dormers.filter(
      (dormer) =>
        !cupolas.some(
          (cupola) =>
            Math.hypot(
              dormer.point[0] - cupola.point[0],
              dormer.point[1] - cupola.point[1],
            ) <
            cupola.radius + 2,
        ),
    ),
    cupolas,
  };
})();

export function makeRiversideSanatorium(
  add: AddGeometry,
  roof: typeof import('./engine').roof,
) {
  const site = riversideSanatorium;
  const outline = new THREE.Shape(
    site.building.points.map(([x, z]) => new THREE.Vector2(x, -z)),
  );
  const bottom =
    Math.min(
      site.ground,
      ...samplePolyline(site.building.points, 1).map((point) =>
        elevation(...point),
      ),
    ) - 1;
  const walls = new THREE.ExtrudeGeometry(outline, {
    depth: site.eaves - bottom,
    bevelEnabled: false,
  });
  walls.rotateX(-Math.PI / 2);
  walls.translate(0, bottom, 0);
  add('#e5dfcf', walls, 'plaster');
  add(
    '#934a39',
    drapedPolygon(
      site.building.points,
      0,
      (x, z) => site.roofLevel([x, z]),
      [],
      true,
      true,
    ),
    'slate',
  );
  add(
    '#934a39',
    continuousWall(
      site.building.points,
      0.08,
      (point) => ({
        bottom: site.eaves - 0.02,
        top: site.roofLevel(point) + 0.01,
      }),
      false,
    ),
    'slate',
  );
  for (const [height, width, thickness, color] of [
    [0.6, 0.28, 0.65, '#b9b1a2'],
    [5.1, 0.28, 0.32, '#9e6556'],
    [9.4, 0.28, 0.32, '#9e6556'],
    [13.7, 0.34, 0.45, '#9e6556'],
    [17.5, 0.45, 0.32, '#e6dfcd'],
  ] as const)
    add(
      color,
      continuousWall(
        site.building.points,
        width,
        () => ({
          bottom: site.ground + height - thickness / 2,
          top: site.ground + height + thickness / 2,
        }),
        false,
      ),
      'stone',
    );
  for (const window of site.windows)
    for (const floor of [2.4, 6.7, 11, 15.1]) {
      if (elevation(...window.point) > site.ground + floor - 1) continue;
      rectangularWindow(
        add,
        window.point,
        site.ground + floor,
        window.angle,
        1.15,
        1.9,
      );
    }
  const local = (
    geometry: THREE.BufferGeometry,
    point: Point,
    height: number,
    angle: number,
  ) => {
    geometry.rotateY(angle);
    geometry.translate(point[0], height, point[1]);
    return geometry;
  };
  for (const dormer of site.dormers) {
    const bottom = Math.min(...dormer.ring.map(site.roofLevel)) - 0.1;
    const top = dormer.floor + 1.8;
    add(
      '#e5dfcf',
      local(
        new THREE.BoxGeometry(2.2, top - bottom, 2.8),
        dormer.point,
        (bottom + top) / 2,
        dormer.angle,
      ),
      'plaster',
    );
    const cap = roof(dormer.ring, top, 0.8, 'hipped');
    add('#934a39', cap.surface, 'slate');
    add('#e5dfcf', cap.fascia, 'plaster');
    rectangularWindow(
      add,
      [
        dormer.point[0] + dormer.normal[0] * 1.41,
        dormer.point[1] + dormer.normal[1] * 1.41,
      ],
      dormer.floor + 0.35,
      dormer.angle,
      0.85,
      1.1,
    );
  }
  for (const dormer of site.dormers.filter((_, i) => i % 3 === 1)) {
    const point: Point = [
      dormer.point[0] - dormer.normal[0] * 2.2,
      dormer.point[1] - dormer.normal[1] * 2.2,
    ];
    if (!inside(point, site.building.points)) continue;
    const floor = site.roofLevel(point) - 0.15;
    add(
      '#c8b9a2',
      local(
        new THREE.BoxGeometry(0.9, 2.8, 0.9),
        point,
        floor + 1.4,
        dormer.angle,
      ),
      'stone',
    );
    add(
      '#aaa18e',
      local(
        new THREE.BoxGeometry(1.15, 0.18, 1.15),
        point,
        floor + 2.85,
        dormer.angle,
      ),
      'stone',
    );
  }
  for (const cupola of site.cupolas) {
    const { point, radius, floor, drumHeight } = cupola;
    add(
      '#e5dfcf',
      local(
        new THREE.CylinderGeometry(radius, radius, drumHeight, 20),
        point,
        floor + drumHeight / 2,
        0,
      ),
      'plaster',
    );
    for (const height of [0.12, drumHeight - 0.1])
      add(
        '#d5cebb',
        local(
          new THREE.CylinderGeometry(radius + 0.2, radius + 0.2, 0.22, 20),
          point,
          floor + height,
          0,
        ),
        'stone',
      );
    for (let i = 0; i < 8; i++) {
      const angle = (i * Math.PI) / 4;
      add(
        '#52605a',
        local(
          new THREE.CircleGeometry(0.32, 12),
          [
            point[0] + Math.sin(angle) * (radius + 0.025),
            point[1] + Math.cos(angle) * (radius + 0.025),
          ],
          floor + drumHeight - 1,
          angle,
        ),
        'glass',
      );
    }
    const profile = [
      [0, 0],
      [1.05, 0],
      [1.06, 0.08],
      [0.98, 0.2],
      [0.82, 0.34],
      [0.54, 0.48],
      [0.28, 0.6],
      [0.18, 0.7],
      [0.12, 0.94],
      [0, 1],
    ].map(([r, h]) => new THREE.Vector2(r * radius, h * 5.2));
    add(
      '#77a58e',
      local(new THREE.LatheGeometry(profile, 24), point, floor + drumHeight, 0),
      'metal',
    );
    add(
      '#657f70',
      local(
        new THREE.CylinderGeometry(0.045, 0.09, 1.5, 8),
        point,
        floor + drumHeight + 5.75,
        0,
      ),
      'metal',
    );
  }
}
