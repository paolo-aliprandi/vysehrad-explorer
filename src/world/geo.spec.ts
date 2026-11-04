import {
  blocked,
  center,
  discoveredNear,
  inside,
  landmarks,
  meters,
  readProgress,
  safePosition,
  segmentDistance,
  spawn,
  initialHeading,
  foundation,
  features,
  paths,
  sampleGrid,
  gateBuildings,
  gatePassage,
  orientedBounds,
  elevation,
  unretainedElevation,
  retainedStreetCorridors,
  retainedStreetWalls,
  retainedStreetBanks,
  retainedStreetBankElevation,
  riverElevation,
  cemeteries,
  gravePlots,
  treePositions,
  mappedTrees,
  uncoveredBuilding,
  parts,
  modelBuildingPart,
  walls,
  wallOpening,
  gateNodes,
  wallProfile,
  rampartTerrace,
  rawElevation,
  sculptures,
  gardenPortal,
  originalElevation,
  upperElevation,
  standingElevation,
  upperPromenade,
  posterns,
  stairFlights,
  stairElevation,
  cafeFrontage,
  pevnostiRoad,
  pevnostiGrade,
  featureElevation,
  projectRoute,
  wallThickness,
  slavin,
  slavinPrecinct,
  approachTerrainField,
  columnShrine,
  streetFurniture,
  siteProps,
  sitePropBlocked,
  buildings,
  courtBankElevation,
  courtBankBoundary,
  aveMariaFrontage,
  gardenExitAccess,
  gardenExitFloor,
  cathedralGardenFence,
  requestedPlantingZones,
  summerTheatre,
  posternFloor,
  type Point,
} from './geo';

describe('screenshot geometry repairs', () => {
  it('cuts only the two main street corridors into cross-level roadbeds while preserving their uphill grades and other paths', () => {
    for (const corridor of retainedStreetCorridors) {
      for (const [index, end] of corridor.points.entries()) {
        if (!index) continue;
        const start = corridor.points[index - 1];
        if (Math.hypot(end[0] - start[0], end[1] - start[1]) < 25) continue;
        const point: Point = [(start[0] + end[0]) / 2, (start[1] + end[1]) / 2];
        const normal = projectRoute(point, corridor.points).normal;
        const level = elevation(...point);
        for (const side of [-4, 4])
          expect(
            elevation(point[0] + normal[0] * side, point[1] + normal[1] * side),
          ).toBeCloseTo(level, 5);
      }
      expect(
        Math.abs(
          elevation(...corridor.points[0]) -
            elevation(...corridor.points[corridor.points.length - 1]),
        ),
      ).toBeGreaterThan(1);
    }
    for (const point of [
      [79, 88],
      [139, 193],
      [-185, -143],
      [170.9, 125.54],
      [-150, 100],
    ] as Point[])
      expect(elevation(...point)).toBe(unretainedElevation(...point));
  });

  it('adds solid bank-height masonry only along recessed shoulders, leaving street centres and the gate approach walkable', () => {
    expect(retainedStreetWalls.length).toBeGreaterThan(0);
    for (const wall of retainedStreetWalls) {
      const point = wall.points[Math.floor(wall.points.length / 2)];
      const normal = projectRoute(point, wall.points).normal;
      const profile = wallProfile(wall, point, normal);
      const bank = retainedStreetBanks.find((bank) => bank.wall === wall);
      if (!bank) throw new Error('Missing reconstructed street bank.');
      expect(profile.top).toBeCloseTo(
        retainedStreetBankElevation(bank, point) + 0.18,
        5,
      );
      expect(profile.top - profile.bottom).toBeGreaterThan(0.55);
      expect(blocked(point, profile.bottom + 0.35)).toBe(true);
    }
    for (const point of [
      [-98.2, -74],
      [-46.11, -39.77],
      [32.18, 3.68],
      [-49.87, 44.96],
    ] as Point[])
      expect(blocked(point, standingElevation(point))).toBe(false);
  });

  it('removes the two screenshot buildings and their invisible footprint collisions while retaining the source survey', () => {
    for (const id of [49810432, 364471135, 49810586, 51700617]) {
      const source = features.find((feature) => feature.id === id);
      if (!source)
        throw new Error('Missing screenshot removal source footprint.');
      expect(buildings.some((building) => building.id === id)).toBe(false);
      const point = center(source.points);
      expect(blocked(point, elevation(...point))).toBe(false);
    }
  });
  it('removes redundant rampart railings from rendering and collision but preserves the masonry and stairwell guards', () => {
    for (const id of [
      949795352, 1303802771, 1303802773, 1303803612, 1303806147, 1303806151,
      1303806152,
    ]) {
      const source = features.find((feature) => feature.id === id);
      if (!source) throw new Error('Missing rampart railing survey.');
      expect(walls.some((wall) => wall.id === id)).toBe(false);
      for (let i = 1; i < source.points.length; i++) {
        const a = source.points[i - 1],
          b = source.points[i];
        const point: Point = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
        expect(blocked(point), `former railing ${id} at ${point}`).toBe(false);
      }
    }
    for (const id of [1532977610, 8888302, 33878732, 1303806155, 459551120])
      expect(walls.some((wall) => wall.id === id)).toBe(true);
    const wall = walls.find((wall) => wall.id === 1532977610);
    if (!wall) throw new Error('Missing main rampart.');
    const point: Point = [-80, 161.12];
    expect(projectRoute(point, wall.points).distance).toBeLessThan(0.1);
    expect(blocked(point, elevation(...point))).toBe(true);
  });
  it('plants the bare stair garden without putting trunks on its mapped walking routes', () => {
    const zone = requestedPlantingZones[2];
    const trees = treePositions().filter((point) => inside(point, zone));
    expect(trees.length).toBeGreaterThanOrEqual(10);
    for (const point of trees) {
      expect(blocked(point)).toBe(false);
      for (const path of paths.filter((path) => path.tags.highway === 'steps'))
        expect(projectRoute(point, path.points).distance).toBeGreaterThan(1.7);
    }
  });
  it('keeps the summer theatre seating and platform solid while leaving the centre aisle open', () => {
    for (const prop of [summerTheatre.stage, ...summerTheatre.seats])
      expect(sitePropBlocked(prop.point, prop.ground)).toBe(true);
    for (const along of [3, 5, 8, 11, 14])
      expect(blocked(summerTheatre.at(0, along))).toBe(false);
  });
  it('fills the tunnel roof shoulders into the surrounding earth without filling the lower passages', () => {
    for (const id of [8888304, 183917808]) {
      const tunnel = posterns.find((tunnel) => tunnel.feature.id === id);
      if (!tunnel) throw new Error('Missing screenshot tunnel.');
      const a = tunnel.feature.points.at(-2);
      const b = tunnel.feature.points.at(-1);
      if (!a || !b) throw new Error('Missing tunnel centreline.');
      const center: Point = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
      const { normal } = projectRoute(center, tunnel.feature.points);
      expect(elevation(...center)).toBeLessThan(
        posternFloor(tunnel, center) + 0.2,
      );
      for (const side of [-1, 1]) {
        const point: Point = [
          center[0] + normal[0] * side * 4.4,
          center[1] + normal[1] * side * 4.4,
        ];
        expect(
          Math.abs(elevation(...point) - pevnostiGrade(point).level),
        ).toBeLessThan(0.2);
      }
    }
  });
  it('clears the artificial rocky garden ridge without lowering the interior bastion', () => {
    for (const point of [
      [175, 114],
      [180, 114],
      [180, 120],
    ] as Point[])
      expect(elevation(...point)).toBeLessThanOrEqual(
        rawElevation(...point) + 1,
      );
    const upper: Point = [175, 108];
    expect(inside(upper, courtBankBoundary)).toBe(true);
    expect(elevation(...upper)).toBeGreaterThan(rawElevation(...upper) + 5);
  });
  it('allows feet above short wall coping but keeps the same wall solid below its crest', () => {
    const wall = walls.find((wall) => wall.id === 698001345);
    if (!wall) throw new Error('Missing roadside wall.');
    const point: Point = [99.145, 168.35];
    const projection = projectRoute(point, wall.points);
    const top = wallProfile(wall, point, projection.normal).top;
    expect(blocked(point, top - 0.3)).toBe(true);
    expect(blocked(point, top)).toBe(false);
    expect(blocked(point, top + 0.16)).toBe(false);
  });
  it('blends eastern court corrections continuously on both sides at the fourteen-metre influence boundary', () => {
    const courts = features.filter((feature) =>
      [53573787, 53573790].includes(feature.id),
    );
    let tested = 0;
    for (const court of courts)
      for (let i = 1; i < court.points.length; i++) {
        const a = court.points[i - 1],
          b = court.points[i];
        const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
        if (length < 5) continue;
        const mid: Point = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
        let normal: Point = [-(b[1] - a[1]) / length, (b[0] - a[0]) / length];
        if (inside([mid[0] + normal[0], mid[1] + normal[1]], court.points))
          normal = [-normal[0], -normal[1]];
        const at = (distance: number): Point => [
          mid[0] + normal[0] * distance,
          mid[1] + normal[1] * distance,
        ];
        if (
          courts.some(
            (other) => projectRoute(at(14.001), other.points).distance < 14,
          )
        )
          continue;
        for (const interior of [true, false])
          expect(
            Math.abs(
              courtBankElevation(at(14.001), interior) -
                courtBankElevation(at(13.999), interior),
            ),
          ).toBeLessThan(0.03);
        tested++;
      }
    expect(tested).toBeGreaterThan(3);
  });
  it('clears the chapel rear footway and removes only the duplicated interior rock-bank walls', () => {
    const rear = paths.find((path) => path.id === 515345427);
    if (!rear) throw new Error('Missing chapel rear path.');
    for (let i = 1; i < rear.points.length; i++) {
      const a = rear.points[i - 1],
        b = rear.points[i];
      const count = Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) * 2);
      for (let j = 0; j <= count; j++) {
        const point: Point = [
          a[0] + ((b[0] - a[0]) * j) / count,
          a[1] + ((b[1] - a[1]) * j) / count,
        ];
        expect(
          blocked(point, standingElevation(point)),
          `chapel rear ${point}`,
        ).toBe(false);
      }
    }
    for (const point of [
      [62.79, 59.99],
      [37.695, 30.395],
    ] as Point[])
      expect(blocked(point, standingElevation(point))).toBe(false);
    expect(aveMariaFrontage.feature.tags.name).toBe('Panna Marie Šancovská');
    const stairs = paths.find((path) => path.id === 255297754);
    if (!stairs) throw new Error('Missing mapped chapel approach.');
    const approach = stairs.points.at(-1) ?? stairs.points[0];
    expect(
      (approach[0] - aveMariaFrontage.point[0]) * aveMariaFrontage.normal[0] +
        (approach[1] - aveMariaFrontage.point[1]) * aveMariaFrontage.normal[1],
    ).toBeGreaterThan(8);
  });
  it('keeps the Tabor wing joined without reopening a consumed gate node beside the pier', () => {
    const gap: Point = [271.8, 321.3];
    expect(wallOpening(gap)).toBe(false);
    expect(blocked(gap, standingElevation(gap))).toBe(true);
    const gate = gateBuildings.find((gate) => gate.feature.id === 49811189);
    if (!gate) throw new Error('Missing Tabor Gate.');
    expect(gatePassage(gate.center)).toBe(true);
  });
  it('keeps the garden exit step-free and downhill, with clear terrain and solid guards', () => {
    const access = gardenExitAccess;
    const postern = posterns.find(
      (postern) => postern.feature.id === 12461779632,
    );
    if (!postern) throw new Error('Missing garden postern.');
    expect(Math.abs(access.levels[0] - postern.levels[0])).toBeLessThan(0.12);
    for (let i = 0; i < access.count; i++) {
      const point = access.point(i + 0.5);
      const height = gardenExitFloor(point);
      if (height === undefined) throw new Error('Missing garden exit floor.');
      expect(height).toBeCloseTo(
        (access.levels[i] + access.levels[i + 1]) / 2,
        8,
      );
      expect(standingElevation(point)).toBe(height);
      expect(blocked(point, height)).toBe(false);
      expect(access.levels[i + 1]).toBeLessThanOrEqual(
        access.levels[i] + 0.000001,
      );
      expect(Math.abs(access.levels[i + 1] - access.levels[i])).toBeLessThan(
        0.08,
      );
      const before = gardenExitFloor(access.point(i + 0.999));
      const after = gardenExitFloor(access.point(i + 1.001));
      if (before === undefined || after === undefined)
        throw new Error('Missing continuous garden exit floor.');
      expect(Math.abs(before - after)).toBeLessThan(0.001);
      for (const across of [-0.8, 0, 0.8])
        expect(elevation(...access.point(i + 0.5, across))).toBeLessThanOrEqual(
          height + 0.000001,
        );
      if (((i + 0.5) * access.length) / access.count > 2.2)
        expect(elevation(...point)).toBeLessThan(height - 0.03);
      const remaining = access.length * (1 - (i + 0.5) / access.count);
      if (remaining > 2 || remaining < 1)
        for (const side of [-1, 1])
          expect(
            sitePropBlocked(access.point(i + 0.5, side * 0.94), height),
          ).toBe(remaining > 2);
    }
    expect(access.levels.at(-1)).toBeCloseTo(rawElevation(...access.end), 6);
    for (const point of [
      [185.26, 121.85],
      [184.75, 112.69],
    ] as Point[]) {
      expect(elevation(...point)).toBeCloseTo(rawElevation(...point) - 0.06, 3);
      expect(blocked(point, standingElevation(point))).toBe(false);
    }
    for (const [a, b] of cathedralGardenFence) {
      const mid: Point = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
      expect(blocked(mid, standingElevation(mid))).toBe(true);
    }
    const left = cathedralGardenFence[0][1],
      right = cathedralGardenFence[1][0];
    const opening: Point = [(left[0] + right[0]) / 2, (left[1] + right[1]) / 2];
    expect(blocked(opening, standingElevation(opening))).toBe(false);
    const trees = treePositions();
    expect(
      trees.some((point) =>
        retainedStreetCorridors.some((corridor) =>
          inside(point, corridor.polygon),
        ),
      ),
    ).toBe(false);
    for (const zone of requestedPlantingZones.slice(1))
      expect(
        trees.filter((point) => inside(point, zone)).length,
      ).toBeGreaterThan(3);
    for (const point of [
      [149, 210],
      [153, 216],
      [156, 220],
    ])
      expect(trees).not.toContainEqual(point);
  });
});

describe('OSM world and movement', () => {
  it('keeps mapped seats supported, off route centerlines and physically solid with clear front approaches', () => {
    const seats = streetFurniture.filter((site) => site.bench);
    expect(seats.length).toBeGreaterThan(200);
    for (const seat of seats) {
      const levels: number[] = [];
      for (const u of [-0.9, 0, 0.9])
        for (const v of [-0.275, 0, 0.275]) {
          const point: Point = [
            seat.point[0] + Math.cos(seat.angle) * u + Math.sin(seat.angle) * v,
            seat.point[1] - Math.sin(seat.angle) * u + Math.cos(seat.angle) * v,
          ];
          levels.push(upperElevation(...point));
          expect(
            blocked(point, upperElevation(...point), {
              ignoredFurniture: seat.point,
            }),
            `seat ${seat.id} overlaps architecture at ${point}`,
          ).toBe(false);
        }
      expect(Math.max(...levels) - Math.min(...levels)).toBeLessThanOrEqual(
        0.24,
      );
      expect(seat.ground).toBeCloseTo(Math.max(...levels), 6);
      expect(blocked(seat.point, seat.ground)).toBe(true);
      const approach: Point = [
        seat.point[0] + Math.sin(seat.angle) * 1.4,
        seat.point[1] + Math.cos(seat.angle) * 1.4,
      ];
      expect(blocked(approach, upperElevation(...approach))).toBe(false);
    }
  });

  it('supports shared building floors above final terraced ground without moving the terrain', () => {
    for (const id of [49810585, -89545110, -89545120, -89545130]) {
      const feature = buildings.find((building) => building.id === id);
      if (!feature)
        throw new Error(`Missing support regression building ${id}.`);
      const floor = foundation(feature);
      for (let i = 1; i < feature.points.length; i++) {
        const a = feature.points[i - 1],
          b = feature.points[i];
        const steps = Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]));
        for (let j = 0; j <= steps; j++)
          expect(
            elevation(
              a[0] + ((b[0] - a[0]) * j) / steps,
              a[1] + ((b[1] - a[1]) * j) / steps,
            ) - floor,
            `buried building ${id}`,
          ).toBeLessThanOrEqual(0.001);
      }
    }
  });

  it('blocks rendered scenic tables, planters and low remains rather than their surrounding terraces', () => {
    for (const prop of siteProps)
      expect(
        sitePropBlocked(prop.point, elevation(...prop.point)),
        prop.id,
      ).toBe(true);
    const cafeTable = siteProps.find((prop) => prop.id === 'cafe-table-2.2');
    if (!cafeTable) throw new Error('Missing cafe table.');
    expect(blocked(cafeTable.point)).toBe(true);
    expect(
      sitePropBlocked(cafeTable.point, elevation(...cafeTable.point) + 2),
    ).toBe(false);
    expect(blocked([NaN, 0])).toBe(true);
    expect(blocked([0, Infinity])).toBe(true);
  });

  it('preserves surveyed courtyard voids and models the duplicate deanery outline as one connected building', () => {
    const courtyard = buildings.find((building) => building.id === -73509750);
    if (!courtyard) throw new Error('Missing courtyard building.');
    expect(blocked(center(courtyard.holes[0]))).toBe(false);
    const deanery = buildings.find((building) => building.id === 49810437);
    const roof = parts.find((part) => part.id === 502391574);
    if (!deanery || !roof) throw new Error('Missing shared deanery model.');
    expect(inside(center(roof.points), deanery.points)).toBe(true);
    expect(foundation(roof)).toBeCloseTo(foundation(deanery));
    expect(blocked(center(deanery.points))).toBe(true);
  });

  it('keeps the Romanesque bridge approach and its mapped staircase clear of the solid remains and protective fence', () => {
    for (const id of [542393604, 542547559]) {
      const path = paths.find((path) => path.id === id);
      if (!path) throw new Error('Missing bridge-remains access.');
      for (let i = 1; i < path.points.length; i++) {
        const a = path.points[i - 1],
          b = path.points[i];
        const steps = Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 0.25);
        for (let j = 0; j <= steps; j++) {
          const point: Point = [
            a[0] + ((b[0] - a[0]) * j) / steps,
            a[1] + ((b[1] - a[1]) * j) / steps,
          ];
          expect(
            blocked(point, standingElevation(point)),
            `bridge path ${id} at ${point}`,
          ).toBe(false);
        }
      }
    }
  });

  it('keeps the northern arcade-gap exit clear across the mapped walking approach', () => {
    for (const x of [-207.37, -207.02, -206.67])
      for (let z = -53; z >= -60; z -= 0.25)
        expect(blocked([x, z]), `arcade exit ${x}, ${z}`).toBe(false);
    for (const point of [
      [-208.4, -56.47],
      [-202.4, -55.92],
    ] as const)
      expect(blocked(point), `solid arcade enclosure ${point}`).toBe(true);
  });
  it('joins the soil beside the Tabor tunnel roof to the retained street terrace', () => {
    const postern = posterns.find((postern) => postern.feature.id === 8888304);
    if (!postern) throw new Error('Missing Tabor-side tunnel.');
    for (const side of [-1, 1]) {
      const point: Point = [
        postern.frame.center[0] +
          postern.frame.axis[0] * side * (postern.frame.width / 2 + 1.1),
        postern.frame.center[1] +
          postern.frame.axis[1] * side * (postern.frame.width / 2 + 1.1),
      ];
      expect(
        Math.abs(elevation(...point) - pevnostiGrade(point).level),
      ).toBeLessThan(0.08);
    }
  });
  it('keeps the mapped shrine column solid without closing the neighboring path', () => {
    expect(blocked(columnShrine.point)).toBe(true);
    const nearby = paths
      .filter((path) => !path.tags.tunnel)
      .map((path) => projectRoute(columnShrine.point, path.points))
      .sort((a, b) => a.distance - b.distance)[0];
    expect(blocked(nearby.point, standingElevation(nearby.point))).toBe(false);
  });
  it('raises and thickens the Tabor entrance wings without obstructing its roadway', () => {
    for (const id of [8888302, 33878732]) {
      const wall = walls.find((wall) => wall.id === id);
      if (!wall) throw new Error('Missing Tabor entrance wall.');
      const point =
        id === 8888302 ? wall.points[0] : wall.points[wall.points.length - 1];
      expect(
        wallProfile(wall, point, [1, 0]).top - elevation(...point),
      ).toBeGreaterThan(6);
      expect(wallThickness(wall, point)).toBeGreaterThan(2.8);
    }
    const gate = gateBuildings.find((gate) => gate.feature.id === 49811189);
    if (!gate) throw new Error('Missing Tabor Gate.');
    for (let i = -20; i <= 20; i++) {
      const point: Point = [
        gate.center[0] - gate.axis[1] * i,
        gate.center[1] + gate.axis[0] * i,
      ];
      expect(
        blocked(point, elevation(...point)),
        `Tabor roadway ${point}`,
      ).toBe(false);
    }
  });
  it('keeps the garden-side cemetery enclosure solid while preserving the gate and inward Slavin approach', () => {
    for (const id of [51666061, 51689840]) {
      const wall = walls.find((wall) => wall.id === id);
      if (!wall) throw new Error('Missing cemetery boundary.');
      const point = wall.points[0];
      expect(wall.tags.barrier).toBe('wall');
      expect(
        wallProfile(wall, point, [1, 0]).top - elevation(...point),
      ).toBeGreaterThan(3.5);
    }
    const gate: Point = [-118.6, 9.65];
    expect(wallOpening(gate)).toBe(true);
    expect(blocked(gate)).toBe(false);
    const front: Point = [
      slavin.point[0] + slavin.front[0] * 5,
      slavin.point[1] + slavin.front[1] * 5,
    ];
    expect(inside(front, cemeteries[0].points)).toBe(true);
    expect(gravePlots.some((grave) => slavinPrecinct(grave.point, 1))).toBe(
      false,
    );
    expect(blocked(slavin.point)).toBe(true);
    const at = (u: number, v: number): Point => [
      slavin.point[0] + Math.cos(slavin.angle) * u + Math.sin(slavin.angle) * v,
      slavin.point[1] - Math.sin(slavin.angle) * u + Math.cos(slavin.angle) * v,
    ];
    expect(blocked(at(-3, 4.65))).toBe(false);
    expect(standingElevation(at(-3, 4.65))).toBeCloseTo(
      elevation(...slavin.point) + 0.45,
    );
  });
  it('removes raised banks beside the Tabor stair landing without filling lower approaches', () => {
    for (const point of [
      [195, 285],
      [215, 265],
      [245, 275],
      [248, 282],
    ] as const) {
      expect(
        originalElevation(...point) - pevnostiGrade(point).level,
        `upper bank ${point}`,
      ).toBeLessThan(0.13);
    }
    for (const point of [
      [230, 275],
      [235, 280],
      [240, 280],
    ] as const)
      expect(
        originalElevation(...point),
        `continuous upper terrace ${point}`,
      ).toBeCloseTo(pevnostiGrade(point).level, 1);
    for (const point of [
      [227.79, 276.67],
      [234.54, 266.95],
      [210, 295],
    ] as const) {
      expect(elevation(...point)).toBeLessThan(pevnostiGrade(point).level - 3);
      expect(blocked(point, elevation(...point))).toBe(false);
    }
  });
  it('starts on the exterior Leopold approach facing the central gate passage', () => {
    const gate = gateBuildings.find((gate) => gate.feature.id === 51718887);
    if (!gate) throw new Error('Missing Leopold Gate.');
    const dx = gate.center[0] - spawn[0],
      dz = gate.center[1] - spawn[1];
    expect(Math.hypot(dx, dz)).toBeGreaterThan(15);
    expect(Math.hypot(dx, dz)).toBeLessThan(22);
    expect(spawn[1]).toBeGreaterThan(gate.center[1]);
    expect(blocked(spawn, elevation(...spawn))).toBe(false);
    expect(
      Math.sin(initialHeading) * dx - Math.cos(initialHeading) * dz,
    ).toBeCloseTo(Math.hypot(dx, dz));
    for (let i = 0; i < 20; i++) {
      const point: Point = [spawn[0] + (dx * i) / 20, spawn[1] + (dz * i) / 20];
      expect(blocked(point, elevation(...point))).toBe(false);
    }
  });
  it('keeps V Pevnosti on a gentle continuous grade across the underground crossing', () => {
    let previous = standingElevation(pevnostiRoad[0]);
    for (let i = 1; i < pevnostiRoad.length; i++) {
      const a = pevnostiRoad[i - 1],
        b = pevnostiRoad[i];
      const count = Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]));
      for (let j = 1; j <= count; j++) {
        const point: Point = [
          a[0] + ((b[0] - a[0]) * j) / count,
          a[1] + ((b[1] - a[1]) * j) / count,
        ];
        const next = standingElevation(point, previous);
        expect(
          Math.abs(next - pevnostiGrade(point).level),
          `road support ${point}`,
        ).toBeLessThan(0.1);
        expect(Math.abs(next - previous), `road bump ${point}`).toBeLessThan(
          0.12,
        );
        previous = next;
      }
    }
    const gate = features.find((feature) => feature.id === 49811189);
    if (!gate) throw new Error('Missing Tabor Gate.');
    expect(
      Math.abs(elevation(...center(gate.points)) - foundation(gate)),
    ).toBeLessThan(0.08);
  });
  it('holds a level road shoulder before a steeper garden-side bank', () => {
    const road: Point = [110.692, 168.848];
    const bank = (distance: number) =>
      elevation(road[0] + 0.648 * distance, road[1] - 0.762 * distance);
    expect(bank(0) - bank(8)).toBeLessThan(1.6);
    expect(bank(8) - bank(16)).toBeGreaterThan(4);
    expect(bank(0) - bank(16)).toBeGreaterThan(5);
  });
  it('keeps both Leopold approach sidewalks cross-level with the road instead of inheriting bank bumps', () => {
    const gate = gateBuildings.find((gate) => gate.feature.id === 51718887);
    if (!gate) throw new Error('Missing Leopold Gate.');
    for (let along = -32; along <= -4; along += 2) {
      const heights = [-6, -4, -2, 0, 2, 4, 6].map((across) => {
        const point: Point = [
          gate.center[0] + gate.axis[0] * across - gate.axis[1] * along,
          gate.center[1] + gate.axis[1] * across + gate.axis[0] * along,
        ];
        return standingElevation(point);
      });
      expect(
        Math.max(...heights) - Math.min(...heights),
        `Leopold shoulders ${along}`,
      ).toBeLessThan(0.05);
    }
  });
  it('joins the refined approach terrain to the surrounding terrain without a height seam', () => {
    const field = approachTerrainField;
    for (let t = 0.1; t < 1; t += 0.2) {
      const x = field.minX + (field.maxX - field.minX) * t;
      const z = field.minZ + (field.maxZ - field.minZ) * t;
      for (const edge of [field.minX, field.maxX])
        expect(
          Math.abs(elevation(edge - 0.001, z) - elevation(edge + 0.001, z)),
        ).toBeLessThan(0.01);
      for (const edge of [field.minZ, field.maxZ])
        expect(
          Math.abs(elevation(x, edge - 0.001) - elevation(x, edge + 0.001)),
        ).toBeLessThan(0.01);
    }
  });
  it('keeps the postern and upper street on independent levels at their actual crossing', () => {
    const postern = posterns.find((postern) => postern.feature.id === 28811769);
    const road = features.find((feature) => feature.id === 370193785);
    if (!postern || !road) throw new Error('Missing road underpass.');
    const point = projectRoute(postern.frame.center, road.points).point;
    const lower = elevation(...point),
      upper = featureElevation(road, point);
    expect(upper - lower).toBeGreaterThan(5);
    expect(standingElevation(point, lower)).toBeCloseTo(lower);
    expect(standingElevation(point, upper)).toBeCloseTo(upper);
    expect(blocked(point, lower)).toBe(false);
    expect(blocked(point, upper)).toBe(false);
    const stairs = stairFlights.find(
      (flight) => flight.feature.id === 284582284,
    );
    if (!stairs) throw new Error('Missing access stairs.');
    const top = stairs.feature.points[stairs.feature.points.length - 1];
    expect(stairs.levels[1]).toBeCloseTo(upperElevation(...top));
    expect(stairs.levels[1] - stairs.levels[0]).toBeGreaterThan(4.5);
  });
  it('restores the cafe terrace to its original long street-facing facade rather than rotating it onto the end wall', () => {
    const frame = cafeFrontage();
    const footprint = orientedBounds(frame.building.points);
    expect(
      Math.abs(
        frame.axis[0] * footprint.axis[0] + frame.axis[1] * footprint.axis[1],
      ),
    ).toBeCloseTo(1, 3);
    expect(frame.width).toBeGreaterThan(footprint.width * 0.95);
    const terrace: Point = [
      frame.center[0] - frame.axis[1] * 6.6,
      frame.center[1] + frame.axis[0] * 6.6,
    ];
    expect(terrace[0]).toBeLessThan(frame.center[0]);
    expect(blocked(terrace)).toBe(false);
    for (const prop of siteProps.filter(
      (prop) => prop.id.startsWith('cafe-') || prop.id === 'fire-bowl',
    )) {
      expect(prop.point[0]).toBeLessThan(frame.facade[0]);
      expect(sitePropBlocked(prop.point, elevation(...prop.point))).toBe(true);
    }
  });
  it('supports independent upper and lower walks at the Brick Gate without snapping between them', () => {
    const gate = gateBuildings.find((gate) => gate.feature.id === 51700613);
    if (!gate) throw new Error('Missing Brick Gate.');
    expect(
      standingElevation(gate.center, foundation(gate.feature)),
    ).toBeCloseTo(elevation(...gate.center));
    expect(standingElevation(gate.center)).toBeCloseTo(
      originalElevation(...gate.center),
    );
    const [a, b] = upperPromenade;
    let height = standingElevation(a);
    for (let i = 0; i <= 200; i++) {
      const point: Point = [
        a[0] + ((b[0] - a[0]) * i) / 200,
        a[1] + ((b[1] - a[1]) * i) / 200,
      ];
      expect(blocked(point, height), `upper promenade ${point}`).toBe(false);
      const next = standingElevation(point, height);
      expect(Math.abs(next - height)).toBeLessThan(0.5);
      expect(next).toBeGreaterThan(40);
      height = next;
    }
    for (let along = -18; along <= 18; along += 0.3) {
      const point: Point = [
        gate.center[0] - gate.axis[1] * along,
        gate.center[1] + gate.axis[0] * along,
      ];
      const floor = elevation(...point);
      expect(blocked(point, floor)).toBe(false);
      expect(standingElevation(point, floor)).toBeCloseTo(floor);
    }
  });
  it('unburies Leopold Gate and closes the spurious northeastern rampart trough', () => {
    const gate = features.find((feature) => feature.id === 51718887);
    if (!gate) throw new Error('Missing Leopold Gate.');
    expect(
      Math.abs(elevation(...center(gate.points)) - foundation(gate)),
    ).toBeLessThan(0.2);
    expect(elevation(91.5, -102.3874)).toBeGreaterThan(44);
    expect(
      Math.abs(elevation(91.5, -102.3874) - elevation(80, -102)),
    ).toBeLessThan(4);
    expect(elevation(99.5755, -102.3874)).toBeLessThan(
      elevation(91.5, -102.3874) - 5,
    );
  });
  it('keeps mapped posterns open below solid upper terrain and retains their sidewalls', () => {
    for (const postern of posterns) {
      const start = postern.feature.points[0],
        approach = postern.access[0];
      const entrance: Point = [
        start[0] + (approach[0] - start[0]) * 0.4,
        start[1] + (approach[1] - start[1]) * 0.4,
      ];
      expect(
        blocked(entrance, elevation(...entrance)),
        `approach ${postern.feature.id}`,
      ).toBe(false);
      for (const point of postern.feature.points) {
        const floor = elevation(...point);
        expect(
          upperElevation(...point) - floor,
          `headroom ${postern.feature.id}`,
        ).toBeGreaterThan(2.2);
        expect(blocked(point, floor), `passage ${postern.feature.id}`).toBe(
          false,
        );
        expect(standingElevation(point, floor)).toBeCloseTo(floor);
      }
      const point = postern.frame.center;
      const flank: Point = [
        point[0] + postern.frame.axis[0] * 3,
        point[1] + postern.frame.axis[1] * 3,
      ];
      expect(blocked(flank, posternFloor(postern, point))).toBe(true);
    }
  });
  it('uses the mapped stair counts and discrete walking treads at both flights', () => {
    expect(stairFlights.map((flight) => flight.count)).toEqual(
      expect.arrayContaining([35, 12]),
    );
    for (const flight of stairFlights) {
      const point = flight.feature.points[0];
      expect(stairElevation(flight, point)).toBeCloseTo(flight.levels[0]);
      expect(
        stairElevation(
          flight,
          flight.feature.points[flight.feature.points.length - 1],
        ),
      ).toBeCloseTo(flight.levels[1]);
      expect(standingElevation(point, flight.levels[0])).toBeCloseTo(
        flight.levels[0],
      );
    }
  });
  it('restores mapped sculptural groups and keeps their pedestals solid', () => {
    for (const id of [
      1200812856, 1200812866, 1200812873, 1200812876, 7016578061, 3573420654,
      1200790218,
    ]) {
      const sculpture = sculptures.find((monument) => monument.id === id);
      if (!sculpture) throw new Error(`Missing mapped sculpture ${id}.`);
      expect(blocked(sculpture.point)).toBe(true);
    }
  });

  it('keeps the Brick Gate road below the ramparts and connected through its arch', () => {
    const gate = gateBuildings.find((gate) => gate.feature.id === 51700613);
    if (!gate) throw new Error('Missing Brick Gate.');
    for (const along of [-8, 0, 8]) {
      const point: Point = [
        gate.center[0] - gate.axis[1] * along,
        gate.center[1] + gate.axis[0] * along,
      ];
      const terrace = rampartTerrace(point);
      if (!terrace) throw new Error('Missing upper rampart.');
      expect(terrace.level - elevation(...point)).toBeGreaterThan(9);
      expect(
        Math.abs(elevation(...point) - foundation(gate.feature)),
      ).toBeLessThan(0.7);
      expect(blocked(point)).toBe(false);
    }
    expect(gate.openings).toHaveLength(3);
    for (const opening of gate.openings) {
      const point: Point = [
        gate.center[0] + gate.axis[0] * opening.offset,
        gate.center[1] + gate.axis[1] * opening.offset,
      ];
      expect(blocked(point)).toBe(false);
    }
  });

  it('replaces the existing garden entrance with the arch and closes its former opening', () => {
    const point = center(gardenPortal.points);
    expect(point[0]).toBeCloseTo(-222.62);
    expect(point[1]).toBeCloseTo(31.02);
    expect(gatePassage(point)).toBe(true);
    expect(blocked(point)).toBe(false);
    expect(blocked([point[0] + 2.5, point[1]])).toBe(true);
    const formerOpening: Point = [-226.55, 31.06];
    expect(wallOpening(formerOpening)).toBe(false);
    expect(blocked(formerOpening)).toBe(true);
  });

  it('raises the chapter garden wall beside Saint Sebastian without raising the riverside parapet', () => {
    const wall = walls.find((wall) => wall.id === 1532977610);
    if (!wall) throw new Error('Missing main wall.');
    const point: Point = [-263.43, -20];
    expect(
      wallProfile(wall, point, [1, 0]).top - elevation(...point),
    ).toBeGreaterThan(4);
    expect(
      wallProfile(wall, [-261.58, -139.28], [1, 0]).top -
        elevation(-261.58, -139.28),
    ).toBeLessThan(1.7);
  });

  it('softens narrow park depressions without flattening the real outer hillside', () => {
    const point: Point = [110, -70];
    const unsmoothed = (x: number, z: number) => {
      const raw = rawElevation(x, z);
      const terrace = rampartTerrace([x, z]);
      return terrace ? raw + (terrace.level - raw) * terrace.weight : raw;
    };
    const depression = (sample: typeof elevation) =>
      [
        [-5, 0],
        [5, 0],
        [0, -5],
        [0, 5],
      ].reduce(
        (sum, [dx, dz]) => sum + sample(point[0] + dx, point[1] + dz),
        0,
      ) /
        4 -
      sample(...point);
    expect(elevation(...point)).toBeGreaterThan(rawElevation(...point) + 0.3);
    expect(depression(elevation)).toBeLessThan(depression(unsmoothed) * 0.8);
    expect(elevation(-280, 145)).toBeLessThan(elevation(-250, 145) - 5);
  });
  it('keeps lower exterior tennis pads from excavating the bridge-facing rampart soil', () => {
    const wall = walls.find((wall) => wall.id === 1532977610);
    if (!wall) throw new Error('Missing eastern rampart.');
    for (const point of [
      [80, -20],
      [100, 20],
      [100, 40],
    ] as const) {
      expect(inside(point, wall.points)).toBe(true);
      const terrace = rampartTerrace(point);
      if (!terrace) throw new Error('Missing eastern terrace.');
      expect(Math.abs(elevation(...point) - terrace.level)).toBeLessThan(0.35);
    }
    for (const id of [53573787, 53573790]) {
      const court = features.find((feature) => feature.id === id);
      if (!court) throw new Error('Missing exterior tennis court.');
      const point = center(court.points);
      expect(inside(point, wall.points)).toBe(false);
      const samples = [...court.points, point]
        .map((point) => rawElevation(...point))
        .sort((a, b) => a - b);
      expect(elevation(...point)).toBeCloseTo(
        samples[Math.floor(samples.length / 2)],
        1,
      );
      expect(elevation(...point)).toBeLessThan(40);
    }
  });

  it('makes steep fortification faces tall while preserving low sections of the same wall', () => {
    const wall = walls.find((feature) => feature.id === 33878732);
    if (!wall) throw new Error('Missing southern fortification.');
    const sample = (point: Point) => {
      const index = wall.points.findIndex(
        (b, i) => i > 0 && segmentDistance(point, wall.points[i - 1], b) < 0.02,
      );
      if (index < 1) throw new Error('Test point is not on its mapped wall.');
      const a = wall.points[index - 1],
        b = wall.points[index];
      const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
      return wallProfile(wall, point, [
        -(b[1] - a[1]) / length,
        (b[0] - a[0]) / length,
      ]);
    };
    const low: Point = [107.86, 235.91],
      high: Point = [228.875, 358];
    expect(sample(low).top - elevation(...low)).toBeGreaterThan(1);
    expect(sample(low).top - elevation(...low)).toBeLessThan(3);
    expect(sample(high).top - elevation(...high)).toBeGreaterThan(5);
  });

  it('restores the cathedral-side garden retaining wall without restoring the cleared rocky bank', () => {
    const source = features.find((feature) => feature.id === 51718886);
    const wall = walls.find((feature) => feature.id === 51718886);
    if (!source || !wall) throw new Error('Missing cathedral garden boundary.');
    expect(wall.points).toEqual(source.points.slice(16));
    const continuation = retainedStreetWalls.find((wall) =>
      wall.points.some((point) => point[0] === -84.26 && point[1] === -43.68),
    );
    expect(continuation?.points.slice(0, 4)).toEqual(
      source.points.slice(13, 17).reverse(),
    );
    for (let i = 1; i < wall.points.length; i++) {
      const a = wall.points[i - 1],
        b = wall.points[i];
      for (let t = 0.1; t < 1; t += 0.2) {
        const point: Point = [
          a[0] + (b[0] - a[0]) * t,
          a[1] + (b[1] - a[1]) * t,
        ];
        const profile = wallProfile(
          wall,
          point,
          projectRoute(point, [a, b]).normal,
        );
        expect(profile.top - elevation(...point)).toBeGreaterThan(0.7);
        if (!wallOpening(point)) expect(blocked(point)).toBe(true);
      }
    }
  });

  it('uses adjacent soil for retaining faces while preserving explicit heights and straight boundary crests', () => {
    const point: Point = [-62.755, -37.72],
      normal: Point = [0.26707757, -0.96367503];
    const retaining = features.find((feature) => feature.id === 51718886);
    if (!retaining)
      throw new Error('Missing surveyed retaining-profile fixture.');
    expect(walls).not.toContain(retaining);
    const profile = wallProfile(retaining, point, normal);
    const adjacentSoil = Math.max(
      ...[-1.5, -1, -0.5, 0.5, 1, 1.5].map((offset) =>
        upperElevation(
          point[0] + normal[0] * offset,
          point[1] + normal[1] * offset,
        ),
      ),
    );
    expect(profile.top - elevation(...point)).toBeGreaterThan(0.8);
    expect(profile.top).toBeLessThanOrEqual(adjacentSoil + 0.25);
    expect(wallProfile(retaining, point, [-normal[0], -normal[1]])).toEqual(
      profile,
    );
    const ordinary = wallProfile(
      { ...retaining, tags: { barrier: 'wall' } },
      point,
      normal,
    );
    expect(ordinary.top - elevation(...point)).toBeGreaterThan(1.3);
    expect(ordinary.top - elevation(...point)).toBeLessThan(2);
    expect(
      wallProfile(
        { ...retaining, tags: { ...retaining.tags, height: '4' } },
        point,
        normal,
      ).top - ordinary.top,
    ).toBeCloseTo(2.7, 6);
    expect(
      wallProfile(
        { ...retaining, tags: { ...retaining.tags, layer: '1' } },
        point,
        normal,
      ).top - ordinary.top,
    ).toBeCloseTo(-0.25, 6);
  });

  it('keeps the main promenade parapet low above the terrace despite the deep exterior foundation', () => {
    const wall = walls.find((feature) => feature.id === 1532977610);
    if (!wall) throw new Error('Missing main rampart.');
    const point: Point = [-261.58, -139.28];
    const terrace = rampartTerrace(point);
    if (!terrace) throw new Error('Missing main rampart terrace.');
    const profile = wallProfile(wall, point, [1, 0]);
    expect(profile.top - terrace.level).toBeCloseTo(1.5, 6);
    expect(blocked([point[0] + 1.2, point[1]])).toBe(true);
    expect(blocked([-254, point[1]])).toBe(false);
    expect(profile.top - profile.bottom).toBeGreaterThan(8);
  });

  it('restores mapped cemetery railings as solid barriers without sealing their gates', () => {
    const fence = walls.find((feature) => feature.id === 459551120);
    if (!fence) throw new Error('Missing mapped cemetery fence.');
    expect(fence.tags.barrier).toBe('fence');
    const a = fence.points[0],
      b = fence.points[1];
    expect(blocked([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2])).toBe(true);
    const tallFence = walls.find((feature) => feature.id === 382864627);
    expect(tallFence?.tags.height).toBe('3');
    const gates = gateNodes.filter((gate) =>
      fence.points.some(
        (point, index) =>
          index > 0 &&
          segmentDistance(gate, fence.points[index - 1], point) < 0.1,
      ),
    );
    expect(gates.length).toBeGreaterThan(0);
    for (const gate of gates) expect(wallOpening(gate)).toBe(true);
  });

  it('levels the promenade across its width, with the hillside dropping outside the rampart', () => {
    for (const z of [-120, 145]) {
      const heights = (
        z === 145 ? [-254, -250, -246] : [-258, -254, -250, -246]
      ).map((x) => elevation(x, z));
      expect(Math.max(...heights) - Math.min(...heights)).toBeLessThan(0.2);
      expect(elevation(-280, z)).toBeLessThan(Math.min(...heights) - 5);
    }
    expect(elevation(-250, 145) - elevation(-250, -120)).toBeGreaterThan(4);
    expect(elevation(-258, 145)).toBeLessThan(elevation(-254, 145) - 5);
  });

  it('fills only uncovered basilica footprint areas without masking the mapped parts', () => {
    const church = features.find((feature) => feature.id === 24376643);
    if (!church) throw new Error('Missing test basilica.');
    const remainder = uncoveredBuilding(church);
    const children = parts
      .filter((part) => inside(center(part.points), church.points))
      .map(modelBuildingPart);
    let preserved = 0;
    for (let x = -216.3; x < -158; x += 2)
      for (let z = -6.3; z < 25; z += 2) {
        const point = [x, z] as const;
        if (!inside(point, church.points)) continue;
        const covered = children.some((part) => inside(point, part.points));
        const retained = remainder.some(
          (part) =>
            inside(point, part.points) &&
            !part.holes.some((hole) => inside(point, hole)),
        );
        expect(retained).toBe(!covered);
        if (retained) preserved++;
      }
    expect(preserved).toBeGreaterThan(0);
  });
  it('recovers the multipart cemetery and places solid graves inside it, clear of buildings', () => {
    const cemetery = cemeteries.find((f) => f.tags.wikidata === 'Q118967');
    if (!cemetery) throw new Error('Missing Vyšehrad cemetery.');
    expect(gravePlots.length).toBeGreaterThan(0);
    for (const grave of gravePlots) {
      expect(inside(grave.point, cemetery.points)).toBe(true);
      expect(blocked(grave.point)).toBe(true);
    }
  });

  it('retains viable mapped trees and supplements mapped rows and the park grounds', () => {
    const trees = treePositions();
    const retainedMapped = mappedTrees.filter((tree) => trees.includes(tree));
    expect(trees.slice(0, retainedMapped.length)).toEqual(retainedMapped);
    expect(trees).not.toContainEqual([307.81, -149.19]);
    expect(trees.length).toBeGreaterThan(mappedTrees.length);
    const rotunda = features.find((feature) => feature.id === 560209917);
    if (!rotunda) throw new Error('Missing rotunda.');
    const [x, z] = center(rotunda.points);
    for (const tree of trees.slice(retainedMapped.length)) {
      expect(blocked(tree)).toBe(false);
      expect(Math.hypot(tree[0] - x, tree[1] - z)).toBeGreaterThanOrEqual(14);
    }
  });
  it('ignores the repeated closing node when locating polygon centers', () => {
    expect(
      center([
        [0, 0],
        [10, 0],
        [10, 10],
        [0, 10],
        [0, 0],
      ]),
    ).toEqual([5, 5]);
  });

  it('detects polygon interiors and distances to degenerate wall segments', () => {
    const polygon = [
      [0, 0],
      [10, 0],
      [10, 10],
      [0, 10],
    ] as const;
    expect(inside([5, 5], polygon)).toBe(true);
    expect(inside([15, 5], polygon)).toBe(false);
    expect(segmentDistance([3, 4], [0, 0], [0, 0])).toBe(5);
  });

  it('lands every actual destination outside buildings, walls and water', () => {
    expect(blocked(spawn)).toBe(false);
    for (const landmark of landmarks) {
      expect(blocked(landmark.view)).toBe(false);
      expect(discoveredNear(landmark.view)).toContain(landmark);
    }
    expect(blocked(landmarks[0].position)).toBe(true);
    expect(blocked([-500, 0])).toBe(true);
    expect(blocked(safePosition(landmarks[0].position))).toBe(false);
    expect(() => safePosition([-580, 0])).toThrow('No walkable landing spot');
    expect(discoveredNear([500, -300])).toEqual([]);
  });

  it('parses meter tags without interpreting unsupported units or bad heights', () => {
    expect(meters('60 m', 8)).toBe(60);
    expect(meters('12.5', 8)).toBe(12.5);
    for (const tag of ['60 ft', 'unknown', '-3', 'Infinity', '500', '0'])
      expect(meters(tag, 8)).toBe(8);
  });

  it('validates, deduplicates and filters stored discovery progress', () => {
    expect(
      readProgress({ getItem: () => '["gate","gate","not-a-landmark"]' }),
    ).toEqual(['gate']);
    expect(readProgress({ getItem: () => null })).toEqual([]);
    expect(() => readProgress({ getItem: () => '[42]' })).toThrow('invalid');
    expect(() => readProgress({ getItem: () => '{' })).toThrow();
  });

  it('samples raster pixel centers correctly and interpolates between them', () => {
    const grid = {
      width: 2,
      height: 2,
      minX: 0,
      maxX: 2,
      minZ: 0,
      maxZ: 2,
      values: [0, 10, 20, 30],
    };
    expect(sampleGrid(grid, 0.5, 0.5)).toBe(0);
    expect(sampleGrid(grid, 1, 1)).toBe(15);
    expect(sampleGrid(grid, 1.5, 1.5)).toBe(30);
    expect(sampleGrid(grid, -10, -10)).toBe(0);
  });

  it('keeps the mapped river channel below the continuous water surface', () => {
    const river = features.find((feature) => feature.tags.water === 'river');
    if (!river) throw new Error('Missing test river.');
    for (const point of [
      [-440, 0],
      [-440, 100],
      [-440, 200],
    ] as const) {
      expect(inside(point, river.points)).toBe(true);
      expect(elevation(...point)).toBeLessThan(riverElevation);
    }
  });

  it('keeps the basilica nave and both towers on one shared foundation', () => {
    const church = features.find((f) => f.id === 24376643);
    if (!church) throw new Error('Missing test landmark.');
    for (const id of [454748868, 454748869, 454748870]) {
      const part = features.find((f) => f.id === id);
      if (!part) throw new Error('Missing test building part.');
      expect(foundation(part)).toBeCloseTo(foundation(church), 8);
    }
  });

  it('orients rotated footprints and makes gate openings, not their posts, walkable', () => {
    const c = Math.SQRT1_2;
    const ring = [
      [0, 0],
      [10 * c, 10 * c],
      [8 * c, 12 * c],
      [-2 * c, 2 * c],
      [0, 0],
    ] as const;
    const frame = orientedBounds(ring);
    expect(frame.width).toBeCloseTo(10, 6);
    expect(frame.depth).toBeCloseTo(2, 6);
    const gate = gateBuildings.find((g) => g.feature.id === 51718887);
    if (!gate) throw new Error('Missing test gate.');
    expect(gatePassage(gate.center)).toBe(true);
    expect(blocked(gate.center)).toBe(false);
    for (const point of [
      [86.04, 148.01],
      [88.51, 150.05],
    ] as const) {
      expect(gatePassage(point)).toBe(true);
      expect(blocked(point)).toBe(false);
    }
    expect(
      gatePassage([
        gate.center[0] + gate.axis[0] * 3,
        gate.center[1] + gate.axis[1] * 3,
      ]),
    ).toBe(false);
  });
});
