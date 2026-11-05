import * as THREE from 'three';
import { kioskShell, lawrenceKioskSite } from './kiosks';
import {
  elevation,
  upperElevation,
  siteDetails,
  cafeFrontage,
  cafeTableOffsets,
  informationCentre,
  citadela,
  streetFrontages,
  features,
  paths,
  pathWidth,
  featureElevation,
  pevnostiRoad,
  stairFlights,
  projectRoute,
  spickaShop,
  spickaGate,
  spickaFrontage,
  blocked,
  casemateDoor,
  casemateUphillExit,
  playgroundEquipment,
  siteProps,
  summerTheatre,
  shopGardenFence,
  romanBridgeFenceRuns,
  cathedralGardenFence,
  gardenExitAccess,
  gardenExitFenceRuns,
  aveMariaFrontage,
  retainedGardenGuards,
  karlachBorderBushes,
  referenceBorderBushes,
  karlachBorderBeds,
  wallProfile,
  type Point,
  type SiteProp,
} from './geo';
import { makeFence, type AddGeometry } from './architecture';
import { drapedPolygon, samplePolyline, continuousWall } from './surfaces';
import { makeInscription } from './reference-details';

function siteProp(id: string) {
  const prop = siteProps.find((prop) => prop.id === id);
  if (!prop) throw new Error(`Missing site prop ${id}.`);
  return prop;
}

export function pevnostiHedgePoints() {
  const stairs = stairFlights.find((flight) => flight.feature.id === 284582284);
  const road = features.find((feature) => feature.id === 370193785);
  const sidewalk = paths.find((path) => path.id === 494921219);
  if (!stairs || !road || !sidewalk)
    throw new Error('The Tabor stair-side landscaping alignment is missing.');
  const top = stairs.feature.points[stairs.feature.points.length - 1];
  const landing = projectRoute(top, pevnostiRoad);
  const sign = Math.sign(
    (top[0] - landing.point[0]) * landing.normal[0] +
      (top[1] - landing.point[1]) * landing.normal[1],
  );
  if (!sign)
    throw new Error('The stair opening has no street-side orientation.');
  return samplePolyline(pevnostiRoad, 1.6).flatMap((sample) => {
    const projection = projectRoute(sample, pevnostiRoad);
    if (Math.abs(projection.along - landing.along) > 25) return [];
    const offset = pathWidth(road) / 2 + pathWidth(sidewalk) + 1.2;
    const point: Point = [
      sample[0] + projection.normal[0] * sign * offset,
      sample[1] + projection.normal[1] * sign * offset,
    ];
    if (
      blocked(point, upperElevation(...point)) ||
      projectRoute(point, stairs.feature.points).distance < 2.6 ||
      paths.some((path) => {
        const projection = projectRoute(point, path.points);
        return (
          projection.distance < pathWidth(path) / 2 + 0.7 &&
          Math.abs(
            featureElevation(path, projection.point) - upperElevation(...point),
          ) < 1.5
        );
      })
    )
      return [];
    return [point];
  });
}
export const pevnostiHedges: SiteProp[] = pevnostiHedgePoints().map(
  (point, index) => {
    const projection = projectRoute(point, pevnostiRoad);
    return {
      id: `pevnosti-hedge-${index}`,
      point,
      ground: upperElevation(...point),
      angle: Math.atan2(projection.normal[0], projection.normal[1]),
      width: 1.7,
      depth: 1.05,
      height: 0.88,
    };
  },
);

export function makeStreetFrontage(
  frame: (typeof streetFrontages)[number],
  add: AddGeometry,
) {
  const pub = frame.detail.tags.amenity === 'pub';
  const color = pub
    ? '#73583e'
    : frame.detail.tags.shop
      ? '#784e59'
      : '#365c4b';
  const face = frame.depth / 2;
  const doorLevel = frame.doorGround - frame.ground;
  const place = (
    geometry: THREE.BufferGeometry,
    u: number,
    y: number,
    v: number,
    color: string,
    kind: Parameters<AddGeometry>[2] = 'wood',
  ) => {
    geometry.translate(u, y, v);
    geometry.rotateY(frame.angle);
    geometry.translate(frame.center[0], frame.ground, frame.center[1]);
    add(color, geometry, kind);
  };
  place(
    new THREE.BoxGeometry(1.12, 2.2, 0.1),
    0,
    doorLevel + 1.1,
    face + 0.025,
    color,
  );
  place(
    new THREE.BoxGeometry(0.82, 1.3, 0.04),
    0,
    doorLevel + 1.45,
    face + 0.08,
    '#455f61',
    'glass',
  );
  place(
    new THREE.BoxGeometry(0.05, 0.28, 0.09),
    0.38,
    doorLevel + 1.08,
    face + 0.13,
    '#c6b58c',
    'metal',
  );
  for (const side of [-1, 1]) {
    const u = side * Math.min(2.4, frame.width * 0.29);
    const width = Math.min(2.1, frame.width * 0.26);
    place(
      new THREE.BoxGeometry(width + 0.18, 1.9, 0.12),
      u,
      1.28,
      face + 0.07,
      color,
    );
    place(
      new THREE.BoxGeometry(width, 1.68, 0.04),
      u,
      1.28,
      face + 0.15,
      '#435b5b',
      'glass',
    );
    place(
      new THREE.BoxGeometry(0.055, 1.72, 0.06),
      u,
      1.28,
      face + 0.19,
      '#c6ba9b',
    );
    place(
      new THREE.BoxGeometry(width + 0.3, 0.13, 0.3),
      u,
      0.35,
      face + 0.17,
      '#bdb09b',
      'stone',
    );
    const prop = siteProp(`frontage-pot-${frame.detail.id}-${u}`);
    const pot = prop.point;
    const floor = elevation(...pot);
    const box = new THREE.BoxGeometry(prop.width, 0.55, prop.depth);
    box.rotateY(frame.angle);
    box.translate(pot[0], floor + 0.275, pot[1]);
    add('#9b7052', box, 'plaster');
    for (let i = 0; i < 3; i++)
      add(
        '#637a48',
        new THREE.SphereGeometry(0.22, 8, 6).translate(
          pot[0] + frame.axis[0] * (i - 1) * 0.12,
          floor + 0.68,
          pot[1] + frame.axis[1] * (i - 1) * 0.12,
        ),
        'grass',
      );
  }
  const canopyWidth = Math.min(5.3, frame.width - 0.6);
  for (let stripe = 0; stripe < 10; stripe++) {
    const width = canopyWidth / 10;
    place(
      new THREE.BoxGeometry(width, 0.07, 1.25).rotateX(0.18),
      (stripe - 4.5) * width,
      2.57,
      face + 0.57,
      stripe % 2 ? '#dfd4b8' : color,
      'plaster',
    );
    place(
      new THREE.BoxGeometry(width, 0.2, 0.06),
      (stripe - 4.5) * width,
      2.36,
      face + 1.17,
      stripe % 2 ? '#dfd4b8' : color,
      'plaster',
    );
  }
  place(
    new THREE.BoxGeometry(1.45, 0.12, 0.5),
    0,
    doorLevel - 0.06,
    face + 0.28,
    '#b6ab95',
    'stone',
  );
  if (!pub) return;
  for (const u of [-3.6, 3.6]) {
    const prop = siteProp(`pub-table-${u}`);
    const point = prop.point;
    const ground = elevation(...point) - frame.ground;
    for (const v of [-0.85, 0, 0.85])
      place(
        new THREE.BoxGeometry(prop.width, 0.1, v === 0 ? 0.7 : 0.3),
        u,
        ground + (v === 0 ? 0.78 : 0.43),
        face + 8.4 + v,
        '#b0976b',
      );
    for (const side of [-0.8, 0.8])
      place(
        new THREE.BoxGeometry(0.12, 0.72, 1.8),
        u + side,
        ground + 0.36,
        face + 8.4,
        color,
      );
  }
}

export function makeSpickaShop(add: AddGeometry) {
  const frame = spickaShop;
  const at = (u: number, v: number): Point => [
    frame.center[0] + frame.axis[0] * u - frame.axis[1] * v,
    frame.center[1] + frame.axis[1] * u + frame.axis[0] * v,
  ];
  const place = (
    geometry: THREE.BufferGeometry,
    u: number,
    y: number,
    v: number,
    color: string,
    kind: Parameters<AddGeometry>[2] = 'plaster',
  ) => {
    geometry
      .translate(u, y, v)
      .rotateY(frame.angle)
      .translate(frame.center[0], frame.ground, frame.center[1]);
    add(color, geometry, kind);
  };
  add(
    '#ad9b7f',
    continuousWall(
      frame.footprint,
      0.2,
      (point) => ({
        bottom: Math.min(elevation(...point), frame.ground) - 0.2,
        top: frame.ground + 0.08,
      }),
      false,
    ),
    'stone',
  );
  place(
    kioskShell(6, 5, 3.2, {
      center: 0.6,
      width: 2.75,
      sill: 0.965,
      head: 2.135,
    }),
    0,
    0,
    0,
    '#d6c7ad',
  );
  for (const side of [-1, 1])
    place(
      new THREE.BoxGeometry(6.6, 0.16, Math.hypot(2.8, 1.3)).rotateX(
        side * Math.atan2(1.3, 2.8),
      ),
      0,
      3.85,
      side * 1.4,
      '#a56e50',
      'slate',
    );
  const gables = new THREE.BufferGeometry();
  gables.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(
      [
        -3, 3.2, -2.5, -3, 3.2, 2.5, -3, 4.5, 0, 3, 3.2, 2.5, 3, 3.2, -2.5, 3,
        4.5, 0,
      ],
      3,
    ),
  );
  gables.computeVertexNormals();
  place(gables, 0, 0, 0, '#d6c7ad');
  place(
    new THREE.BoxGeometry(1.05, 2.2, 0.1),
    -2,
    1.1,
    2.55,
    '#526b58',
    'wood',
  );
  for (const u of [-0.84, 2.04])
    place(
      new THREE.BoxGeometry(0.12, 1.4, 0.12),
      u,
      1.55,
      2.57,
      '#655743',
      'wood',
    );
  for (const y of [0.91, 2.19])
    place(
      new THREE.BoxGeometry(3, 0.12, 0.12),
      0.6,
      y,
      2.57,
      '#655743',
      'wood',
    );
  place(
    new THREE.BoxGeometry(2.75, 1.17, 0.05),
    0.6,
    1.55,
    -2.32,
    '#3f6064',
    'wood',
  );
  place(
    new THREE.BoxGeometry(3.2, 0.12, 0.65),
    0.6,
    0.93,
    2.8,
    '#958060',
    'wood',
  );
  for (let stripe = 0; stripe < 10; stripe++)
    place(
      new THREE.BoxGeometry(0.34, 0.08, 1.3).rotateX(0.15),
      -0.93 + stripe * 0.34,
      2.48,
      3.0,
      stripe % 2 ? '#e5d7b5' : '#55765d',
      'plaster',
    );
  const garden = [at(4, -3), at(13, -3), at(13, 3), at(4, 3), at(4, -3)];
  add('#b9b29a', drapedPolygon(garden, 0.04), 'cobble');
  for (const run of shopGardenFence) makeFence(run, 0.7, add);
  for (const u of [6.3, 10.7]) {
    const v = 0,
      point = siteProp(`shop-table-${u}`).point,
      ground = elevation(...point) - frame.ground;
    place(
      new THREE.BoxGeometry(siteProp(`shop-table-${u}`).width, 0.12, 0.85),
      u,
      ground + 0.83,
      v,
      '#ad9268',
      'wood',
    );
    for (const side of [-1, 1]) {
      place(
        new THREE.BoxGeometry(1.9, 0.12, 0.35),
        u,
        ground + 0.45,
        v + side * 0.85,
        '#ad9268',
        'wood',
      );
      place(
        new THREE.BoxGeometry(0.15, 0.75, 1.9),
        u + side * 0.65,
        ground + 0.375,
        v,
        '#5d6e55',
        'metal',
      );
    }
  }
  for (const u of [5, 8.5, 12]) {
    const prop = siteProp(`shop-planter-${u}`);
    const point = prop.point,
      ground = elevation(...point) - frame.ground;
    place(
      new THREE.BoxGeometry(prop.width, 0.5, prop.depth),
      u,
      ground + 0.25,
      -2.3,
      '#9e7052',
    );
    place(
      new THREE.SphereGeometry(0.65, 12, 8).scale(1, 0.7, 0.8),
      u,
      ground + 0.65,
      -2.3,
      '#829760',
      'foliage',
    );
  }
  for (let step = 0; step < 3; step++) {
    const point = at(-2, 2.7 + step * 0.35),
      ground = elevation(...point);
    const top = frame.ground - step * 0.18;
    if (top > ground)
      place(
        new THREE.BoxGeometry(1.25, top - ground + 0.06, 0.4),
        -2,
        (top + ground) / 2 - frame.ground,
        2.7 + step * 0.35,
        '#b8af98',
        'stone',
      );
  }
}

export function makeSpickaFrontage(add: AddGeometry) {
  for (const [index, hedge] of spickaFrontage.hedges.entries()) {
    const ground = hedge.ground ?? elevation(...hedge.point);
    const place = (geometry: THREE.BufferGeometry) => {
      geometry
        .rotateY(hedge.angle)
        .translate(hedge.point[0], ground, hedge.point[1]);
      add(index % 3 ? '#45643d' : '#506c40', geometry, 'foliage');
    };
    place(
      new THREE.BoxGeometry(
        hedge.width,
        hedge.height * 0.85,
        hedge.depth,
      ).translate(0, hedge.height * 0.425, 0),
    );
    place(
      new THREE.SphereGeometry(1, 10, 6)
        .scale(hedge.width / 2, hedge.height * 0.16, hedge.depth / 2)
        .translate(0, hedge.height * 0.84, 0),
    );
  }
  add(
    '#aca48c',
    continuousWall(
      spickaFrontage.curb,
      0.9,
      (point) => ({
        bottom: elevation(...point) - 0.18,
        top: elevation(...point) + 0.22,
      }),
      false,
    ),
    'stone',
  );
  for (const run of spickaFrontage.fences) makeFence(run, 0.95, add);

  const pump = siteProp('historic-pump');
  const floor = elevation(...pump.point);
  const place = (
    geometry: THREE.BufferGeometry,
    color = '#5c806c',
    kind: Parameters<AddGeometry>[2] = 'metal',
  ) => {
    geometry.rotateY(pump.angle).translate(pump.point[0], floor, pump.point[1]);
    add(color, geometry, kind);
  };
  const pad = [
    spickaFrontage.at(-0.9, 0.5),
    spickaFrontage.at(0.9, 0.5),
    spickaFrontage.at(0.9, -1.3),
    spickaFrontage.at(-0.9, -1.3),
    spickaFrontage.at(-0.9, 0.5),
  ];
  add('#aaa794', drapedPolygon(pad, 0.035), 'stone');
  for (const [radius, height, y] of [
    [0.26, 0.12, 0.1],
    [0.2, 0.18, 0.23],
    [0.14, 1.65, 1.1],
    [0.2, 0.12, 1.95],
    [0.22, 0.2, 2.1],
  ])
    place(
      new THREE.CylinderGeometry(radius, radius * 1.05, height, 8).translate(
        0,
        y,
        0,
      ),
    );
  for (const y of [0.36, 1.02, 1.88, 2.2])
    place(
      new THREE.TorusGeometry(0.155, 0.025, 6, 12)
        .rotateX(Math.PI / 2)
        .translate(0, y, 0),
      '#997953',
    );
  place(new THREE.ConeGeometry(0.28, 0.16, 8).translate(0, 2.28, 0), '#82684c');
  const handle = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0.15, 2.08, 0),
    new THREE.Vector3(0.4, 2.36, 0),
    new THREE.Vector3(0.58, 2.25, 0),
    new THREE.Vector3(0.5, 2.03, 0),
    new THREE.Vector3(0.39, 1.55, 0),
    new THREE.Vector3(0.27, 0.76, 0),
  ]);
  place(new THREE.TubeGeometry(handle, 28, 0.035, 8, false), '#7d7957');
  const spout = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 1.03, 0.12),
    new THREE.Vector3(0, 1.03, 0.36),
    new THREE.Vector3(0, 1.01, 0.55),
    new THREE.Vector3(0, 0.92, 0.59),
  ]);
  place(new THREE.TubeGeometry(spout, 12, 0.045, 8, false), '#7c7961');
  place(
    new THREE.CylinderGeometry(0.19, 0.25, 0.4, 4)
      .rotateY(Math.PI / 4)
      .translate(0, 0.24, 0.7),
    '#a8a38e',
    'stone',
  );
  const rim = new THREE.Shape();
  rim.moveTo(-0.31, -0.31);
  rim.lineTo(0.31, -0.31);
  rim.lineTo(0.31, 0.31);
  rim.lineTo(-0.31, 0.31);
  rim.closePath();
  const bowl = new THREE.Path();
  bowl.moveTo(-0.22, -0.22);
  bowl.lineTo(-0.22, 0.22);
  bowl.lineTo(0.22, 0.22);
  bowl.lineTo(0.22, -0.22);
  bowl.closePath();
  rim.holes.push(bowl);
  place(
    new THREE.ExtrudeGeometry(rim, { depth: 0.1, bevelEnabled: false })
      .rotateX(-Math.PI / 2)
      .translate(0, 0.45, 0.7),
    '#c1baa2',
    'stone',
  );
  place(
    new THREE.BoxGeometry(0.43, 0.025, 0.43).translate(0, 0.45, 0.7),
    '#6b6d5f',
    'stone',
  );
  place(
    new THREE.BoxGeometry(0.43, 0.025, 0.43).translate(0.6, 0.06, 0.25),
    '#494c43',
  );
  for (let index = 0; index < 6; index++)
    place(
      new THREE.BoxGeometry(0.025, 0.025, 0.38).translate(
        0.44 + index * 0.065,
        0.08,
        0.25,
      ),
      '#777b6b',
    );
}

function makeHedges(add: AddGeometry) {
  for (const bed of karlachBorderBeds) {
    add(
      '#657e47',
      drapedPolygon(bed[0], 0.06, elevation, bed.slice(1)),
      'grass',
    );
    add(
      '#a9a38d',
      continuousWall(
        bed[0],
        0.09,
        (point) => ({
          bottom: elevation(...point) - 0.06,
          top: elevation(...point) + 0.08,
        }),
        false,
      ),
      'stone',
    );
  }
  for (const [index, bush] of [
    ...karlachBorderBushes,
    ...referenceBorderBushes,
  ].entries())
    for (const [u, radius] of [
      [-0.42, 0.48],
      [0, 0.62],
      [0.42, 0.46],
    ]) {
      const x = bush.point[0] + Math.cos(bush.angle) * u;
      const z = bush.point[1] - Math.sin(bush.angle) * u;
      add(
        index % 3 ? '#506a40' : '#637b48',
        new THREE.SphereGeometry(1, 12, 8)
          .scale(radius, bush.height / 2, 0.55)
          .rotateY(bush.angle)
          .translate(x, upperElevation(x, z) + bush.height / 2 - 0.025, z),
        'foliage',
      );
    }
  for (const { wall, points } of retainedGardenGuards)
    makeFence(points, 1.05, add, (x, z) => {
      const projection = projectRoute([x, z], wall.points);
      return wallProfile(wall, projection.point, projection.normal).top + 0.05;
    });
  for (const [index, hedge] of pevnostiHedges.entries()) {
    const { point, angle } = hedge;
    const ground = upperElevation(...point);
    add(
      index % 3 ? '#536746' : '#62754d',
      new THREE.BoxGeometry(1.7, 0.88, 1.05)
        .rotateY(angle)
        .translate(point[0], ground + 0.44, point[1]),
      'foliage',
    );
    for (const [dx, dz, size] of [
      [0, 0, 0.63],
      [0.4, 0.2, 0.4],
      [-0.3, -0.2, 0.43],
    ]) {
      const geometry = new THREE.SphereGeometry(1, 12, 8)
        .scale(size, size * 0.2, size)
        .translate(
          point[0] + dx,
          ground + 0.83 + (index % 3) * 0.015,
          point[1] + dz,
        );
      add(index % 3 ? '#667b4c' : '#566e47', geometry, 'foliage');
    }
  }
}

export function makeSummerTheatre(add: AddGeometry) {
  add(
    '#7b8959',
    drapedPolygon(summerTheatre.enclosure.points, 0.025, elevation),
    'grass',
  );
  const place = (
    geometry: THREE.BufferGeometry,
    prop: SiteProp,
    color: string,
    kind: Parameters<AddGeometry>[2] = 'wood',
  ) => {
    geometry.rotateY(prop.angle);
    geometry.translate(
      prop.point[0],
      prop.ground ?? elevation(...prop.point),
      prop.point[1],
    );
    add(color, geometry, kind);
  };
  const stage = summerTheatre.stage;
  for (let i = 0; i < 19; i++)
    place(
      new THREE.BoxGeometry(0.39, 2.45, 0.16).translate(
        -3.6 + i * 0.4,
        stage.height + 1.225,
        -1.4,
      ),
      stage,
      i % 2 ? '#715b43' : '#796149',
    );
  place(
    new THREE.BoxGeometry(stage.width, 0.18, stage.depth).translate(
      0,
      stage.height - 0.1,
      0,
    ),
    stage,
    '#8c6b47',
  );
  for (let i = 0; i < 16; i++)
    place(
      new THREE.BoxGeometry(
        stage.width,
        0.18,
        stage.depth / 16 - 0.01,
      ).translate(
        0,
        stage.height - 0.09,
        -stage.depth / 2 + ((i + 0.5) * stage.depth) / 16,
      ),
      stage,
      i % 2 ? '#8c6b47' : '#987650',
    );
  place(
    new THREE.BoxGeometry(stage.width, 0.28, 0.12).translate(
      0,
      0.14,
      stage.depth / 2,
    ),
    stage,
    '#69563e',
  );
  for (const u of [-3.6, 0, 3.6])
    for (const v of [-1.25, 1.25]) {
      const point = summerTheatre.at(u, v);
      const bottom = elevation(...point) - 0.08;
      const height =
        (stage.ground ?? elevation(...stage.point)) + stage.height - bottom;
      place(
        new THREE.BoxGeometry(0.18, height, 0.18).translate(
          u,
          stage.height - height / 2,
          v,
        ),
        stage,
        '#69563e',
      );
    }
  for (const seat of summerTheatre.seats) {
    for (const v of [-0.22, 0, 0.22])
      place(
        new THREE.BoxGeometry(seat.width, 0.12, 0.21).translate(0, 0.52, v),
        seat,
        '#9e8053',
      );
    for (const u of [-1.05, 1.05]) {
      place(
        new THREE.BoxGeometry(0.1, 0.52, 0.52).translate(u, 0.26, 0),
        seat,
        '#4c5146',
        'metal',
      );
      place(
        new THREE.BoxGeometry(0.08, 0.65, 0.08).translate(u, 0.725, 0.31),
        seat,
        '#4c5146',
        'metal',
      );
    }
    place(
      new THREE.BoxGeometry(seat.width, 0.32, 0.1).translate(0, 0.89, 0.31),
      seat,
      '#9e8053',
    );
  }
}

export function makePhotoSiteDetails(add: AddGeometry) {
  makeSummerTheatre(add);
  const { point, angle, floor } = casemateDoor;
  const placeDoor = (
    geometry: THREE.BufferGeometry,
    color: string,
    kind: Parameters<AddGeometry>[2] = 'stone',
  ) => {
    geometry.rotateY(angle).translate(point[0], floor, point[1]);
    add(color, geometry, kind);
  };
  const arch = (radius: number, spring: number, bottom = 0) => {
    const shape = new THREE.Shape();
    shape.moveTo(-radius, bottom);
    shape.lineTo(radius, bottom);
    shape.lineTo(radius, spring);
    shape.absarc(0, spring, radius, 0, Math.PI, false);
    shape.closePath();
    return shape;
  };
  const surround = arch(1.15, 1.65, -0.15);
  surround.holes.push(new THREE.Path(arch(0.85, 1.6).getPoints(32)));
  const headwall = new THREE.Shape();
  headwall.moveTo(-4.2, -0.15);
  headwall.lineTo(4.2, -0.15);
  headwall.lineTo(4.5, 1.1);
  headwall.lineTo(3.2, 3.4);
  headwall.lineTo(0.7, 4.1);
  headwall.lineTo(-2.6, 3.8);
  headwall.lineTo(-4.6, 1.2);
  headwall.closePath();
  headwall.holes.push(new THREE.Path(arch(0.85, 1.6).getPoints(32)));
  placeDoor(
    new THREE.ExtrudeGeometry(headwall, {
      depth: 4.3,
      bevelEnabled: false,
      curveSegments: 24,
    }).translate(0, 0, -4.3),
    '#999583',
    'rock',
  );
  placeDoor(
    new THREE.ExtrudeGeometry(surround, {
      depth: 4.4,
      bevelEnabled: false,
      curveSegments: 24,
    }).translate(0, 0, -4.25),
    '#aaa797',
  );
  placeDoor(
    new THREE.ShapeGeometry(arch(0.85, 1.6), 32).translate(0, 0, -4.2),
    '#252d2c',
    'wood',
  );
  for (const side of [-1, 1])
    placeDoor(
      new THREE.BoxGeometry(0.045, 1.5, 0.045).translate(
        side * 0.48,
        0.75,
        -4.16,
      ),
      '#454b41',
      'metal',
    );
  placeDoor(
    new THREE.BoxGeometry(1.7, 0.1, 4.9).translate(0, -0.05, -1.85),
    '#9c9e92',
  );
  const uphill = casemateUphillExit;
  const shaftAngle = Math.atan2(uphill.axis[0], uphill.axis[1]);
  const base = uphill.floor - 1.6;
  for (let i = 0; i < 8; i++) {
    const point = uphill.at(((i + 0.5) * uphill.length) / 8, 0);
    add(
      '#b3aa96',
      new THREE.BoxGeometry(1.8, 0.2, uphill.length / 8)
        .rotateY(shaftAngle)
        .translate(point[0], base + i * 0.2 - 0.1, point[1]),
      'stone',
    );
  }
  const topLanding = uphill.at(uphill.length + 0.8, 0);
  add(
    '#b3aa96',
    new THREE.BoxGeometry(1.8, 0.2, 1.6)
      .rotateY(shaftAngle)
      .translate(topLanding[0], uphill.floor - 0.1, topLanding[1]),
    'stone',
  );
  for (const side of [-1, 1]) {
    const points = [
      uphill.at(-0.2, side),
      uphill.at(uphill.length + 0.3, side),
    ];
    add(
      '#a59c86',
      continuousWall(
        points,
        0.22,
        (point) => {
          const along = projectRoute(point, [uphill.start, uphill.end]).along;
          return {
            bottom: base - 0.25,
            top: base + (along / uphill.length) * 1.6 + 0.55,
          };
        },
        false,
      ),
      'stone',
    );
  }
  const throat = arch(1.12, 0.9, -0.35);
  throat.holes.push(new THREE.Path(arch(0.9, 0.9, -0.25).getPoints(32)));
  const uphillVault = new THREE.ExtrudeGeometry(throat, {
    depth: 1.2,
    bevelEnabled: false,
    curveSegments: 24,
  });
  const vaultVertices = uphillVault.attributes.position;
  for (let i = 0; i < vaultVertices.count; i++)
    vaultVertices.setY(
      i,
      vaultVertices.getY(i) + (vaultVertices.getZ(i) / uphill.length) * 1.6,
    );
  uphillVault.computeVertexNormals();
  add(
    '#a99a81',
    uphillVault
      .rotateY(shaftAngle)
      .translate(uphill.start[0], base, uphill.start[1]),
    'stone',
  );
  for (const item of playgroundEquipment) {
    const ground = Math.max(
      ...item.footprint.map((point) => elevation(...point)),
    );
    const place = (
      geometry: THREE.BufferGeometry,
      color = '#76543d',
      kind: Parameters<AddGeometry>[2] = 'wood',
    ) => {
      geometry
        .rotateY(item.angle)
        .translate(item.point[0], ground, item.point[1]);
      add(color, geometry, kind);
    };
    add('#b1a184', drapedPolygon(item.footprint, 0.035), 'gravel');
    if (item.kind === 'tower') {
      for (const x of [-1, 1])
        for (const z of [-1, 1]) {
          place(
            new THREE.CylinderGeometry(0.11, 0.14, 2.8, 8).translate(x, 1.4, z),
          );
          place(new THREE.BoxGeometry(0.12, 0.8, 2.1).translate(x, 1.75, 0));
        }
      place(
        new THREE.BoxGeometry(2.2, 0.12, 2.2).translate(0, 1.35, 0),
        '#99754d',
      );
      place(
        new THREE.ConeGeometry(1.85, 1.0, 4)
          .rotateY(Math.PI / 4)
          .translate(0, 3.0, 0),
        '#805b42',
      );
      for (let rung = 0; rung < 5; rung++)
        place(
          new THREE.BoxGeometry(1.7, 0.07, 0.2).translate(
            0,
            0.2 + rung * 0.24,
            1.05,
          ),
        );
    } else {
      for (const x of [-2, 2])
        for (const side of [-1, 1])
          place(
            new THREE.CylinderGeometry(0.09, 0.13, 2.9, 8)
              .rotateX(side * 0.3)
              .translate(x, 1.35, side * 0.42),
          );
      place(
        new THREE.CylinderGeometry(0.11, 0.11, 4.5, 8)
          .rotateZ(Math.PI / 2)
          .translate(0, 2.7, 0),
      );
      for (const x of [-0.9, 0.9]) {
        place(
          new THREE.BoxGeometry(0.65, 0.07, 0.4).translate(x, 0.5, 0),
          '#453d33',
        );
        for (const side of [-1, 1])
          place(
            new THREE.CylinderGeometry(0.014, 0.014, 2.15, 6).translate(
              x + side * 0.25,
              1.6,
              0,
            ),
            '#60685e',
            'metal',
          );
      }
    }
  }
}

export function makeGardenAccessDetails(add: AddGeometry) {
  for (const run of cathedralGardenFence)
    makeFence(run, 1, add, upperElevation);
  const access = gardenExitAccess;
  const vertices: number[] = [];
  for (let i = 0; i < access.count; i++) {
    const corners = [
      access.point(i, -access.width / 2),
      access.point(i, access.width / 2),
      access.point(i + 1, -access.width / 2),
      access.point(i + 1, access.width / 2),
    ];
    for (const index of [0, 1, 2, 2, 1, 3]) {
      const point = corners[index];
      vertices.push(
        point[0],
        access.levels[i + (index >= 2 ? 1 : 0)],
        point[1],
      );
    }
  }
  const paving = new THREE.BufferGeometry();
  paving.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(vertices, 3),
  );
  paving.computeVertexNormals();
  add('#b5aa94', paving, 'cobble');
  const railGround = (x: number, z: number) => {
    const projection = projectRoute([x, z], [access.start, access.end]);
    return access.height((projection.along / access.length) * access.count);
  };
  for (const run of gardenExitFenceRuns) makeFence(run, 1.05, add, railGround);
}

export function makeSiteDetails(add: AddGeometry) {
  makeSpickaShop(add);
  makeSpickaFrontage(add);
  makePhotoSiteDetails(add);
  makeHedges(add);
  makeGardenAccessDetails(add);
  const group = new THREE.Group();
  const textures: THREE.Texture[] = [];
  const place = (
    geometry: THREE.BufferGeometry,
    point: Point,
    y: number,
    color: string,
    kind: Parameters<AddGeometry>[2] = 'stone',
    angle = 0,
  ) => {
    geometry.rotateY(angle);
    geometry.translate(point[0], y, point[1]);
    add(color, geometry, kind);
  };
  const sign = (
    text: string,
    point: Point,
    y: number,
    width: number,
    angle = 0,
    pale = false,
  ) => {
    const { mesh, texture } = makeInscription(
      {
        point,
        ground: y,
        width,
        height: (width * 144) / 768,
        angle,
        lines: [text],
        background: pale ? '#e5dfcd' : '#283c34',
        ink: pale ? '#9a8456' : '#f0e2bf',
      },
      true,
    );
    textures.push(texture);
    group.add(mesh);
  };
  const chapel = aveMariaFrontage;
  sign(
    'AVE MARIA',
    [
      chapel.point[0] + chapel.normal[0] * 0.2,
      chapel.point[1] + chapel.normal[1] * 0.2,
    ],
    upperElevation(...chapel.point) + 3.2,
    3.0,
    chapel.angle,
    true,
  );
  const well = siteDetails.find((detail) => detail.id === 390278816);
  if (!well) throw new Error('The mapped medieval well is missing.');
  const floor = upperElevation(...well.point);
  const ring = new THREE.Shape();
  ring.absarc(0, 0, 1.05, 0, Math.PI * 2, false);
  const hole = new THREE.Path();
  hole.absarc(0, 0, 0.72, 0, Math.PI * 2, true);
  ring.holes.push(hole);
  const curb = new THREE.ExtrudeGeometry(ring, {
    depth: 0.95,
    bevelEnabled: false,
    curveSegments: 16,
  });
  curb.rotateX(-Math.PI / 2);
  place(curb, well.point, floor, '#b4ac96');
  place(
    new THREE.CylinderGeometry(0.7, 0.7, 0.04, 24),
    well.point,
    floor + 0.08,
    '#242d29',
  );
  for (let i = 0; i < 8; i++) {
    const angle = (i * Math.PI) / 4;
    const point: Point = [
      well.point[0] + Math.cos(angle) * 0.86,
      well.point[1] + Math.sin(angle) * 0.86,
    ];
    place(
      new THREE.CylinderGeometry(0.035, 0.035, 1.5, 8),
      point,
      floor + 1.65,
      '#3c5147',
      'metal',
    );
  }
  for (const height of [1.05, 2.1])
    place(
      new THREE.TorusGeometry(0.86, 0.04, 6, 24).rotateX(Math.PI / 2),
      well.point,
      floor + height,
      '#3c5147',
      'metal',
    );
  place(
    new THREE.ConeGeometry(1.3, 1.1, 8),
    well.point,
    floor + 2.8,
    '#52695e',
    'metal',
  );
  place(
    new THREE.SphereGeometry(0.09, 8, 6),
    well.point,
    floor + 3.4,
    '#adb590',
    'metal',
  );
  sign(
    'GOTICKÁ STUDNA',
    [well.point[0], well.point[1] + 1.07],
    floor + 0.6,
    1.5,
  );

  const bridge = siteProp('roman-bridge');
  const bridgeFloor = elevation(...bridge.point);
  const outline = new THREE.Shape();
  outline.moveTo(-3.8, -0.5);
  outline.lineTo(-1, -0.5);
  outline.lineTo(-1, 0.25);
  outline.absarc(0, 0.25, 1, Math.PI, 0, true);
  outline.lineTo(1, -0.5);
  outline.lineTo(3.8, -0.5);
  outline.lineTo(3.8, 1.6);
  outline.lineTo(2.7, 1.45);
  outline.lineTo(1.8, 1.75);
  outline.lineTo(-1.6, 1.7);
  outline.lineTo(-2.7, 1.35);
  outline.lineTo(-3.8, 1.55);
  outline.closePath();
  const remains = new THREE.ExtrudeGeometry(outline, {
    depth: 1.6,
    bevelEnabled: false,
    curveSegments: 20,
  });
  remains.translate(0, 0, -0.8);
  place(remains, bridge.point, bridgeFloor, '#b9ae8e');
  for (let i = 0; i < 12; i++)
    place(
      new THREE.BoxGeometry(0.35 + (i % 3) * 0.12, 0.2, 0.4).rotateY(i * 0.7),
      [bridge.point[0] - 3.4 + i * 0.6, bridge.point[1] - 1.3 - (i % 3) * 0.24],
      elevation(
        bridge.point[0] - 3.4 + i * 0.6,
        bridge.point[1] - 1.3 - (i % 3) * 0.24,
      ) + 0.1,
      '#aaa186',
    );
  for (const run of romanBridgeFenceRuns) makeFence(run, 0.85, add);
  sign(
    'ROMÁNSKÝ MOST',
    [bridge.point[0], bridge.point[1] + 2.13],
    bridgeFloor + 0.7,
    2,
  );

  for (const frontage of streetFrontages) {
    makeStreetFrontage(frontage, add);
    const point: Point = [
      frontage.center[0] - frontage.axis[1] * (frontage.depth / 2 + 0.16),
      frontage.center[1] + frontage.axis[0] * (frontage.depth / 2 + 0.16),
    ];
    sign(
      frontage.name,
      point,
      frontage.ground + 2.84,
      Math.min(3.2, frontage.width - 0.7),
      frontage.angle,
    );
  }
  sign(
    'OKÉNKO VYŠEHRAD',
    [
      spickaShop.center[0] - spickaShop.axis[1] * 2.7,
      spickaShop.center[1] + spickaShop.axis[0] * 2.7,
    ],
    spickaShop.ground + 2.9,
    3.5,
    spickaShop.angle,
  );
  sign(
    'ST. LAWRENCE KIOSK',
    lawrenceKioskSite.at(0, 0.15),
    lawrenceKioskSite.ground + 2.85,
    3.4,
    lawrenceKioskSite.angle,
  );
  sign(
    'OLD PUB · ŠPIČKA',
    spickaGate.at(3.6, spickaGate.frame.depth / 2 + 0.16),
    spickaGate.ground + 4.3,
    2.6,
    spickaGate.frame.angle,
  );
  sign(
    'INFOCENTRUM VYŠEHRAD',
    informationCentre.at(0, informationCentre.depth / 2 + 0.12),
    informationCentre.ground + 2.79,
    2.9,
    informationCentre.angle,
  );
  const citadelaSign = citadela.at(0, 0.1);
  sign(
    'BYSTRO CAFÉ CITADELA',
    citadelaSign,
    elevation(...citadelaSign) + 2.65,
    3.4,
    citadela.angle,
  );
  const frame = cafeFrontage();
  const local = (u: number, v: number): Point => [
    frame.center[0] + frame.axis[0] * u - frame.axis[1] * v,
    frame.center[1] + frame.axis[1] * u + frame.axis[0] * v,
  ];
  const terrace = [
    local(-5, 2.3),
    local(5, 2.3),
    local(5, 7.3),
    local(-5, 7.3),
    local(-5, 2.3),
  ];
  add('#b6ab93', drapedPolygon(terrace, 0.07), 'cobble');
  for (const u of cafeTableOffsets) {
    const prop = siteProp(`cafe-table-${u}`);
    const point = prop.point,
      ground = elevation(...point);
    place(
      new THREE.CylinderGeometry(prop.width / 2, prop.width / 2, 0.09, 24),
      point,
      ground + 0.78,
      '#b99b71',
      'wood',
    );
    place(
      new THREE.CylinderGeometry(0.065, 0.12, 0.7, 10),
      point,
      ground + 0.35,
      '#424d44',
      'metal',
    );
    for (const offset of [-1, 1]) {
      const chairProp = siteProp(`cafe-chair-${u}-${offset}`);
      const chair = chairProp.point,
        height = elevation(...chair);
      place(
        new THREE.BoxGeometry(chairProp.width, 0.08, chairProp.depth),
        chair,
        height + 0.45,
        '#ad8c60',
        'wood',
        frame.angle,
      );
      for (const x of [-0.19, 0.19])
        place(
          new THREE.BoxGeometry(0.04, 0.44, 0.4).translate(x, 0, 0),
          chair,
          height + 0.22,
          '#425046',
          'metal',
          frame.angle,
        );
      place(
        new THREE.BoxGeometry(0.52, 0.5, 0.06).translate(0, 0, -0.23),
        chair,
        height + 0.75,
        '#ad8c60',
        'wood',
        frame.angle,
      );
    }
    place(
      new THREE.CylinderGeometry(0.035, 0.04, 2.6, 8),
      point,
      ground + 1.3,
      '#d7c6a1',
      'wood',
    );
    place(
      new THREE.ConeGeometry(1.65, 0.55, 8),
      point,
      ground + 2.5,
      '#e1d4b8',
      'plaster',
    );
  }
  const firePoint = local(3.5, 5.1),
    fireFloor = elevation(...firePoint);
  const bowlProfile = [
    new THREE.Vector2(0, 0),
    new THREE.Vector2(0.24, 0),
    new THREE.Vector2(0.43, 0.16),
    new THREE.Vector2(0.5, 0.3),
  ];
  place(
    new THREE.LatheGeometry(bowlProfile, 24),
    firePoint,
    fireFloor + 0.25,
    '#4e4c40',
    'metal',
  );
  place(
    new THREE.TorusGeometry(0.5, 0.035, 8, 24).rotateX(Math.PI / 2),
    firePoint,
    fireFloor + 0.55,
    '#575448',
    'metal',
  );
  for (const angle of [0, Math.PI / 2]) {
    const log = new THREE.CylinderGeometry(0.055, 0.075, 0.63, 8);
    log.rotateZ(Math.PI / 2);
    log.rotateY(angle);
    place(log, firePoint, fireFloor + 0.45, '#4b392a', 'wood');
  }
  const fire = new THREE.Group();
  fire.position.set(firePoint[0], fireFloor + 0.5, firePoint[1]);
  for (let i = 0; i < 5; i++) {
    const flame = new THREE.Mesh(
      new THREE.ConeGeometry(i === 0 ? 0.17 : 0.09, i === 0 ? 0.55 : 0.32, 7),
      new THREE.MeshBasicMaterial({
        color: i === 0 ? '#ffca65' : '#f18a35',
        transparent: true,
        opacity: 0.85,
        depthWrite: false,
      }),
    );
    flame.position.set(
      i === 0 ? 0 : Math.cos((i * Math.PI) / 2) * 0.16,
      i === 0 ? 0.27 : 0.15,
      i === 0 ? 0 : Math.sin((i * Math.PI) / 2) * 0.16,
    );
    fire.add(flame);
  }
  const light = new THREE.PointLight('#ffb15c', 5, 7, 2);
  light.position.y = 0.4;
  fire.add(light);
  group.add(fire);
  return {
    group,
    fire,
    dispose: () => textures.forEach((texture) => texture.dispose()),
  };
}
