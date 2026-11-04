import * as THREE from 'three';
import {
  courts,
  elevation,
  originalElevation,
  upperCovers,
  coverElevation,
  posterns,
  posternFloor,
  posternVaultRoute,
  lowerPassage,
  gatePassage,
  orientedBounds,
  projectRoute,
  stairFlights,
  stairElevation,
  brickGateEnvelope,
  features,
  gardenWallCrest,
  riversideDoorways,
  walls,
  wallProfile,
  type Point,
} from './geo';
import {
  continuousWall,
  drapedPolygon,
  pathRibbon,
  ribbonEdges,
  samplePolyline,
} from './surfaces';
import { makeFence, type AddGeometry } from './architecture';

function routePoint(points: readonly Point[], distance: number): Point {
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1],
      b = points[i],
      length = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (distance <= length)
      return [
        a[0] + ((b[0] - a[0]) * distance) / length,
        a[1] + ((b[1] - a[1]) * distance) / length,
      ];
    distance -= length;
  }
  return points[points.length - 1];
}

export function makePassages(add: AddGeometry) {
  makeRiversideDoorways(add);
  const brickGate = features.find((feature) => feature.id === 51700613);
  if (!brickGate) throw new Error('The mapped Brick Gate is missing.');
  const brickRoof =
    Math.min(
      ...samplePolyline(brickGate.points).map((point) =>
        originalElevation(...point),
      ),
    ) - 0.3;
  for (const cover of upperCovers) {
    const garden = cover.id === 12461779632;
    const tabor = [8888304, 28811769, 183917808].includes(cover.id);
    const buried = [8888304, 183917808].includes(cover.id);
    add(
      garden ? '#9a735c' : buried ? '#9bb96a' : '#829363',
      drapedPolygon(cover.footprint, 0, (x, z) => coverElevation(cover, x, z)),
      garden ? 'stone' : 'grass',
    );
    if (buried) continue;
    let run: Point[] = [];
    const emit = () => {
      if (run.length > 1)
        add(
          garden ? '#a96751' : cover.id === 51700613 ? '#ad8971' : '#a2987e',
          continuousWall(
            run,
            0.22,
            (point) => {
              const passage = tabor
                ? posterns.find(
                    (postern) =>
                      projectRoute(point, postern.access).distance <
                      postern.width / 2,
                  )
                : undefined;
              return {
                bottom: passage
                  ? posternFloor(passage, point) +
                    1.5 +
                    Math.sqrt(
                      Math.max(
                        0,
                        (passage.width / 2) ** 2 -
                          projectRoute(point, passage.access).distance ** 2,
                      ),
                    )
                  : cover.id === 51700613 && brickGateEnvelope(point)
                    ? brickRoof - 0.05
                    : Math.min(
                        elevation(...point),
                        coverElevation(cover, ...point) - 0.25,
                      ) - 0.2,
                top: coverElevation(cover, ...point),
              };
            },
            false,
          ),
          cover.id === 51700613 || garden ? 'brick' : 'stone',
        );
      run = [];
    };
    for (const point of samplePolyline(cover.footprint, 0.35)) {
      if (
        !(cover.id === 51700613 && brickGateEnvelope(point)) &&
        (gatePassage(point, elevation(...point)) ||
          (!tabor && lowerPassage(point)))
      )
        emit();
      else run.push(point);
    }
    emit();
  }
  for (const postern of posterns) {
    const garden = postern.feature.id === 12461779632;
    const cover = upperCovers.find((cover) => cover.id === postern.feature.id);
    if (!cover) throw new Error('The postern has no upper ground cover.');
    const route = posternVaultRoute(postern);
    const samples = samplePolyline(route, 0.35);
    const edges = ribbonEdges(samples, postern.width + 0.5);
    for (const side of ['left', 'right'] as const)
      add(
        '#9e9682',
        continuousWall(
          edges.map((edge) => edge[side]),
          0.5,
          (point) => ({
            bottom: posternFloor(postern, point) - 0.4,
            top: posternFloor(postern, point) + 1.5,
          }),
          false,
        ),
        'stone',
      );
    const vertices: number[] = [];
    const section = (
      point: Point,
      normal: Point,
      angle: number,
      radius: number,
    ) => {
      const offset = Math.cos(angle) * radius;
      return [
        point[0] + normal[0] * offset,
        posternFloor(postern, point) + 1.5 + Math.sin(angle) * radius,
        point[1] + normal[1] * offset,
      ];
    };
    for (let i = 1; i < samples.length; i++) {
      const a = samples[i - 1],
        b = samples[i];
      const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
      const normal: Point = [-(b[1] - a[1]) / length, (b[0] - a[0]) / length];
      for (let j = 0; j < 20; j++) {
        const angles = [(j * Math.PI) / 20, ((j + 1) * Math.PI) / 20];
        for (const radius of [postern.width / 2, postern.width / 2 + 0.35]) {
          const p = section(a, normal, angles[0], radius),
            q = section(b, normal, angles[0], radius);
          const r = section(a, normal, angles[1], radius),
            s = section(b, normal, angles[1], radius);
          vertices.push(...p, ...q, ...r, ...r, ...q, ...s);
        }
      }
    }
    const vault = new THREE.BufferGeometry();
    vault.setAttribute(
      'position',
      new THREE.Float32BufferAttribute(vertices, 3),
    );
    vault.computeVertexNormals();
    add('#b0a38b', vault, 'stone');
    for (const [index, point] of route.entries()) {
      if (index !== 0 && index !== route.length - 1) continue;
      const projection = projectRoute(point, postern.feature.points);
      const floor = posternFloor(postern, point);
      const radius = postern.width / 2;
      const facade = new THREE.Shape();
      facade.moveTo(-postern.frame.width / 2, -0.4);
      facade.lineTo(-radius, -0.4);
      facade.lineTo(-radius, 1.5);
      facade.absarc(0, 1.5, radius, Math.PI, 0, true);
      facade.lineTo(radius, -0.4);
      facade.lineTo(postern.frame.width / 2, -0.4);
      const count = Math.ceil(postern.frame.width / 0.5);
      for (let j = 0; j <= count; j++) {
        const u = postern.frame.width / 2 - (postern.frame.width * j) / count;
        const edge: Point = [
          point[0] + projection.normal[0] * u,
          point[1] + projection.normal[1] * u,
        ];
        const stairs =
          postern.feature.id === 28811769
            ? stairFlights.find(
                (flight) =>
                  flight.feature.id === 284582284 &&
                  projectRoute(edge, flight.feature.points).distance < 2,
              )
            : undefined;
        let top = garden
          ? gardenWallCrest(edge)
          : stairs
            ? Math.min(
                coverElevation(cover, ...edge),
                stairElevation(stairs, edge) - 0.25,
              )
            : coverElevation(cover, ...edge);
        if (!garden && Math.abs(u) > radius + 0.35)
          top = Math.min(top, elevation(...edge) + 0.04);
        facade.lineTo(
          u,
          Math.max(
            !garden && Math.abs(u) > radius + 0.35 ? -0.4 : 1.5 + radius + 0.3,
            top - floor,
          ),
        );
      }
      facade.closePath();
      const geometry = new THREE.ExtrudeGeometry(facade, {
        depth: 0.45,
        bevelEnabled: false,
        curveSegments: 20,
      });
      geometry.translate(0, 0, -0.225);
      geometry.rotateY(-Math.atan2(projection.normal[1], projection.normal[0]));
      geometry.translate(point[0], floor, point[1]);
      add(garden ? '#a96751' : '#a59880', geometry, garden ? 'brick' : 'stone');
      {
        const outer = radius + 0.3;
        const trim = new THREE.Shape();
        trim.moveTo(-outer, -0.1);
        trim.lineTo(-outer, 1.5);
        trim.absarc(0, 1.5, outer, Math.PI, 0, true);
        trim.lineTo(outer, -0.1);
        trim.lineTo(radius, -0.1);
        trim.lineTo(radius, 1.5);
        trim.absarc(0, 1.5, radius, 0, Math.PI, false);
        trim.lineTo(-radius, -0.1);
        trim.closePath();
        const surround = new THREE.ExtrudeGeometry(trim, {
          depth: 0.55,
          bevelEnabled: false,
          curveSegments: 20,
        });
        surround.translate(0, 0, -0.275);
        surround.rotateY(
          -Math.atan2(projection.normal[1], projection.normal[0]),
        );
        surround.translate(point[0], floor, point[1]);
        add('#c3b9a2', surround, 'stone');
      }
    }
    add('#b7ac93', pathRibbon(route, postern.width, 0.07), 'gravel');
  }
}

export function makeRiversideDoorways(add: AddGeometry) {
  const wall = walls.find((wall) => wall.id === 1532977610);
  if (!wall) throw new Error('The riverside rampart is missing.');
  for (const door of riversideDoorways) {
    const { frame, floor, halfWidth, spring } = door;
    const at = (u: number): Point => [
      frame.center[0] + frame.axis[0] * u,
      frame.center[1] + frame.axis[1] * u,
    ];
    const profile = (u: number) =>
      wallProfile(wall, at(u), [-frame.axis[1], frame.axis[0]]);
    const bottom =
      Math.min(
        profile(-frame.width / 2).bottom,
        profile(frame.width / 2).bottom,
      ) - floor;
    const outline = new THREE.Shape();
    outline.moveTo(-frame.width / 2, bottom);
    outline.lineTo(frame.width / 2, bottom);
    const count = Math.ceil(frame.width / 0.5);
    for (let j = 0; j <= count; j++) {
      const u = frame.width / 2 - (frame.width * j) / count;
      outline.lineTo(u, Math.max(profile(u).top, door.top) - floor);
    }
    outline.closePath();
    const opening = new THREE.Path();
    opening.moveTo(-halfWidth, -0.15);
    opening.lineTo(-halfWidth, spring);
    opening.absarc(0, spring, halfWidth, Math.PI, 0, true);
    opening.lineTo(halfWidth, -0.15);
    opening.closePath();
    outline.holes.push(opening);
    const place = (geometry: THREE.BufferGeometry) => {
      geometry.rotateY(frame.angle);
      geometry.translate(frame.center[0], floor, frame.center[1]);
      return geometry;
    };
    const body = new THREE.ExtrudeGeometry(outline, {
      depth: frame.depth,
      bevelEnabled: false,
      curveSegments: 24,
    });
    body.translate(0, 0, -frame.depth / 2);
    add('#a68b76', place(body), 'brick');
    for (const side of [-1, 1]) {
      const trim = new THREE.Shape();
      trim.moveTo(-halfWidth - 0.25, -0.1);
      trim.lineTo(-halfWidth - 0.25, spring);
      trim.absarc(0, spring, halfWidth + 0.25, Math.PI, 0, true);
      trim.lineTo(halfWidth + 0.25, -0.1);
      trim.lineTo(halfWidth, -0.1);
      trim.lineTo(halfWidth, spring);
      trim.absarc(0, spring, halfWidth, 0, Math.PI, false);
      trim.lineTo(-halfWidth, -0.1);
      trim.closePath();
      const surround = new THREE.ExtrudeGeometry(trim, {
        depth: 0.18,
        bevelEnabled: false,
        curveSegments: 24,
      });
      surround.translate(0, 0, (side * frame.depth) / 2 - 0.09);
      add('#c3b9a2', place(surround), 'stone');
    }
  }
}

export function makeApproach(add: AddGeometry) {
  for (const court of courts) {
    const frame = orientedBounds(court.points);
    const local = (u: number, v: number): Point => [
      frame.center[0] + frame.axis[0] * u - frame.axis[1] * v,
      frame.center[1] + frame.axis[1] * u + frame.axis[0] * v,
    ];
    const garden = court.id === 53573788;
    const inactive = court.tags.note?.includes('mimo provoz') ?? false;
    if (!inactive || garden)
      add(
        garden
          ? '#8b8461'
          : court.tags.surface === 'clay'
            ? '#b77754'
            : '#809361',
        drapedPolygon(court.points, 0.07),
        garden || inactive ? 'grass' : 'cobble',
      );
    if (garden) {
      for (let u = -9; u <= 9; u += 4.5)
        for (const v of [-3.6, 1.8]) {
          const point = local(u, v),
            floor = elevation(...point);
          const bed = new THREE.BoxGeometry(3.2, 0.24, 2.2);
          bed.rotateY(frame.angle);
          bed.translate(point[0], floor + 0.16, point[1]);
          add('#66513b', bed, 'wood');
          for (let row = 0; row < 3; row++)
            for (let plant = 0; plant < 6; plant++) {
              const p = local(u - 1.2 + plant * 0.48, v - 0.7 + row * 0.7);
              add(
                '#64784c',
                new THREE.SphereGeometry(0.17, 6, 4)
                  .scale(1, 0.7, 1)
                  .translate(p[0], elevation(...p) + 0.4, p[1]),
                'grass',
              );
            }
        }
      continue;
    }
    if (inactive) continue;
    for (const v of [-5.485, -4.115, 4.115, 5.485])
      add(
        '#e8d9bf',
        pathRibbon([local(-11.885, v), local(11.885, v)], 0.07, 0.1),
        'stone',
      );
    for (const u of [-11.885, -6.4, 6.4, 11.885])
      add(
        '#e8d9bf',
        pathRibbon([local(u, -5.485), local(u, 5.485)], 0.07, 0.1),
        'stone',
      );
    add(
      '#e8d9bf',
      pathRibbon([local(-6.4, 0), local(6.4, 0)], 0.07, 0.1),
      'stone',
    );
    makeFence([local(0, -6.2), local(0, 6.2)], 0.9, add);
  }
  for (const flight of stairFlights) {
    const northern = [26454844, 1106803168].includes(flight.feature.id);
    const guardRuns = (points: Point[]) => {
      if (!northern) return [points];
      const runs: Point[][] = [];
      let run: Point[] = [];
      for (const point of samplePolyline(points, 0.15)) {
        if (
          stairFlights.some(
            (other) =>
              other !== flight &&
              [26454844, 1106803168].includes(other.feature.id) &&
              projectRoute(point, other.feature.points).distance < 1.65,
          )
        ) {
          if (run.length > 1) runs.push(run);
          run = [];
        } else run.push(point);
      }
      if (run.length > 1) runs.push(run);
      return runs;
    };
    const stepLength = flight.length / flight.count;
    const points = Array.from({ length: flight.count + 1 }, (_, i) =>
      routePoint(flight.feature.points, i * stepLength),
    );
    for (let i = 0; i < flight.count; i++) {
      const level =
        flight.levels[0] +
        ((flight.levels[1] - flight.levels[0]) * i) / flight.count;
      if (northern || flight.feature.id === 255297754) {
        const bottom = Math.min(...flight.levels) - 0.25;
        const height = level + 0.05 - bottom;
        const a = points[i],
          b = points[i + 1];
        add(
          '#c1b59e',
          new THREE.BoxGeometry(2.9, height, stepLength + 0.002)
            .rotateY(Math.atan2(b[0] - a[0], b[1] - a[1]))
            .translate(
              (a[0] + b[0]) / 2,
              bottom + height / 2,
              (a[1] + b[1]) / 2,
            ),
          'stone',
        );
      } else
        add(
          '#c1b59e',
          pathRibbon([points[i], points[i + 1]], 2.7, 0.05, () => level),
          'stone',
        );
      if (i === 0) continue;
      const edge = ribbonEdges([points[i], points[i + 1]], 2.7)[0];
      const previous =
        level - (flight.levels[1] - flight.levels[0]) / flight.count;
      add(
        '#a89b84',
        continuousWall(
          [edge.left, edge.right],
          0.08,
          () => ({
            bottom: Math.min(previous, level),
            top: Math.max(previous, level) + 0.05,
          }),
          false,
        ),
        'stone',
      );
    }
    if (northern) {
      const end = points[points.length - 1],
        before = points[points.length - 2];
      const angle = Math.atan2(end[0] - before[0], end[1] - before[1]);
      const bottom = Math.min(...flight.levels) - 0.25;
      const height = flight.levels[1] + 0.05 - bottom;
      add(
        '#c1b59e',
        new THREE.BoxGeometry(2.9, height, 0.16)
          .rotateY(angle)
          .translate(
            end[0] + Math.sin(angle) * 0.04,
            bottom + height / 2,
            end[1] + Math.cos(angle) * 0.04,
          ),
        'stone',
      );
    }
    if (flight.feature.tags.handrail === 'yes') {
      const edges = ribbonEdges(points, 3);
      for (const side of ['left', 'right'] as const)
        for (const route of guardRuns(edges.map((edge) => edge[side])))
          makeFence(
            northern ? [route[0], route[route.length - 1]] : route,
            0.9,
            add,
            (x, z) => {
              const t =
                projectRoute([x, z], flight.feature.points).along /
                flight.length;
              return (
                flight.levels[0] + (flight.levels[1] - flight.levels[0]) * t
              );
            },
          );
    }
    const edges = ribbonEdges(points, 3.2);
    for (const side of ['left', 'right'] as const) {
      for (const route of guardRuns(edges.map((edge) => edge[side]))) {
        const top = (point: Point) => {
          const t =
            projectRoute(point, flight.feature.points).along / flight.length;
          const crest =
            flight.levels[0] + (flight.levels[1] - flight.levels[0]) * t + 0.45;
          return northern ? Math.max(crest, elevation(...point) + 0.08) : crest;
        };
        add(
          '#a99d88',
          continuousWall(
            route,
            0.32,
            (point) => ({
              bottom: northern
                ? Math.min(...flight.levels) - 0.25
                : Math.min(elevation(...point), top(point) - 0.5) - 0.2,
              top: top(point),
            }),
            false,
          ),
          'stone',
        );
        add(
          '#d0c4ae',
          continuousWall(
            route,
            0.42,
            (point) => ({
              bottom: top(point),
              top: top(point) + 0.09,
            }),
            false,
          ),
          'stone',
        );
      }
    }
  }
}
