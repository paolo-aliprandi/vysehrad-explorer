import { createServer } from 'vite';
import polygonClipping from 'polygon-clipping';
import { writeFile } from 'node:fs/promises';

// Native-world diagnostics, deliberately independent of the renderer and browser.
const server = await createServer({
  server: { middlewareMode: true },
  appType: 'custom',
});
try {
  const g = await server.ssrLoadModule('/src/world/geo.ts');
  const a = await server.ssrLoadModule('/src/world/architecture.ts');
  const s = await server.ssrLoadModule('/src/world/surfaces.ts');
  const detail = await server.ssrLoadModule('/src/world/site-details.ts');
  const passages = await server.ssrLoadModule('/src/world/passages.ts');
  const monuments = await server.ssrLoadModule('/src/world/monuments.ts');
  const distance = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1]);
  const report = {
    thresholds: {
      benchSupportRange: 0.24,
      benchApproach: 1.4,
      portalThresholdAbovePavement: 0.12,
      pathSampleSpacing: 1,
      abruptPathRise: 0.8,
      generatedTreeRoadShoulder: 0.5,
      buildingBurialWarning: 0.5,
      buildingOverlapAreaWarning: 0.1,
    },
    counts: {},
    invalidCoordinates: [],
    degenerateSegments: [],
    benches: [],
    portals: [],
    buildingSupport: [],
    buildingOverlaps: [],
    mappedTrees: [],
    generatedTrees: [],
    gates: [],
    paths: [],
    landmarks: [],
    parks: [],
    courtyards: [],
    genericDoors: [],
    businessDoors: [],
    omittedBenches: [],
    geometry: { batches: 0, vertices: 0, invalidVertices: 0 },
    exceptions: [
      'Building:part joins are not independent building collisions.',
      'Wall foundations, retaining walls and mapped rock/building contacts require contextual review, not automatic deletion.',
      'Outside-rampart paths can be intentionally steep/clipped; gates, posterns and bridges are audited at their own floor.',
      'Mapped trees are surveyed anchors; procedural planting must meet stricter road/park/open-space clearance.',
      'Closed cathedral doors are interaction transitions, not physical open passages.',
      'Generic house doors remain closed decoration; an obstructed private-house approach is not a public navigation destination.',
      'The retained -4226810 cemetery arcade deliberately keeps its established base and wall joins.',
      'Finite generated batches cover static architecture/details/passages/monuments, not renderer-owned terrain, trees, textures or dynamic avatars.',
    ],
  };
  for (const f of g.features) {
    for (const ring of [f.points, ...f.holes]) {
      for (const [i, p] of ring.entries()) {
        if (!p.every(Number.isFinite))
          report.invalidCoordinates.push({ id: f.id, i, p });
        if (i && distance(p, ring[i - 1]) < 0.001)
          report.degenerateSegments.push({ id: f.id, i });
      }
    }
  }
  const footprint = (point, angle, width, depth) =>
    [-1, 0, 1].flatMap((u) =>
      [-1, 0, 1].map((v) => [
        point[0] +
          (Math.cos(angle) * u * width) / 2 +
          (Math.sin(angle) * v * depth) / 2,
        point[1] -
          (Math.sin(angle) * u * width) / 2 +
          (Math.cos(angle) * v * depth) / 2,
      ]),
    );
  for (const site of a.streetFurniture.filter((site) => site.bench)) {
    const samples = footprint(site.point, site.angle, 1.8, 0.55);
    const levels = samples.map((p) => g.upperElevation(...p));
    const approach = [
      site.point[0] + Math.sin(site.angle) * 1.4,
      site.point[1] + Math.cos(site.angle) * 1.4,
    ];
    report.benches.push({
      point: site.point,
      id: site.id,
      angle: site.angle,
      supportRange: Math.max(...levels) - Math.min(...levels),
      obstructedSamples: samples.filter((p) =>
        g.blocked(p, g.upperElevation(...p), { ignoredFurniture: site.point }),
      ).length,
      approach,
      approachBlocked: g.blocked(approach, g.upperElevation(...approach)),
      approachRise: Math.abs(
        g.upperElevation(...approach) - g.upperElevation(...site.point),
      ),
      nearestPath: Math.min(
        ...g.paths
          .filter((p) => !p.tags.tunnel)
          .map((p) => g.projectRoute(site.point, p.points).distance),
      ),
    });
  }
  for (const [index, door] of a.cathedralEntrance.doors.entries()) {
    const part = g.parts.find(
      (p) => p.id === [454748868, 454748869, 454748870][index],
    );
    const approach = [
      door.point[0] + Math.sin(door.angle) * 1.4,
      door.point[1] + Math.cos(door.angle) * 1.4,
    ];
    report.portals.push({
      id: part.id,
      point: door.point,
      foundation: g.foundation(part),
      ground: g.elevation(...door.point),
      threshold: door.threshold ?? g.foundation(part) + 0.25,
      pavement: g.elevation(...door.point) + 0.059,
      approach,
      approachBlocked: g.blocked(approach),
    });
  }
  report.omittedBenches = g.siteDetails
    .filter(
      (detail) =>
        detail.tags.amenity === 'bench' &&
        detail.point[0] > g.bounds.minX &&
        detail.point[0] < g.bounds.maxX &&
        detail.point[1] > g.bounds.minZ &&
        detail.point[1] < g.bounds.maxZ &&
        !g.streetFurniture.some((site) => site.id === detail.id),
    )
    .map((detail) => ({
      id: detail.id,
      point: detail.point,
      insideFortress: g.inside(detail.point, g.courtBankBoundary),
      reason:
        'No clear, supported same-side placement within four native metres, including full path/prop/architecture clearance.',
    }));
  for (const feature of [...g.buildings, ...g.parts]) {
    const model = g.modelBuildingPart(feature);
    const parent = model.tags['building:part']
      ? g.buildings.find((building) =>
          g.inside(g.center(model.points), building.points),
        )
      : undefined;
    model.tags = { ...parent?.tags, ...model.tags };
    const door = a.buildingEntrance(
      model,
      Math.max(
        1,
        g.meters(model.tags.height, 9.3) -
          g.meters(model.tags['roof:height'], 0) -
          g.meters(model.tags.min_height, 0),
      ),
    );
    if (!door) continue;
    const projection = g.projectRoute(door.point, model.points);
    const [start, end] = door.wall;
    const length = distance(start, end);
    const along =
      ((door.face[0] - start[0]) * (end[0] - start[0]) +
        (door.face[1] - start[1]) * (end[1] - start[1])) /
      length;
    report.genericDoors.push({
      id: model.id,
      point: door.point,
      frameWallGap: projection.distance - 0.07,
      frameOverhang: Math.max(
        0,
        (door.width + 0.24) / 2 - Math.min(along, length - along),
      ),
      normalTangentDot:
        Math.abs(
          door.normal[0] * (end[0] - start[0]) +
            door.normal[1] * (end[1] - start[1]),
        ) / length,
      outward: !g.inside(
        [
          door.point[0] + door.normal[0] * 0.1,
          door.point[1] + door.normal[1] * 0.1,
        ],
        model.points,
      ),
      supportedStep: door.doorstep.every(
        (point) => g.upperElevation(...point) <= door.ground,
      ),
      approachBlocked: g.blocked([
        door.face[0] + door.normal[0] * 1.4,
        door.face[1] + door.normal[1] * 1.4,
      ]),
    });
  }
  for (const frame of g.streetFrontages)
    report.businessDoors.push({
      id: frame.detail.id,
      point: frame.facade,
      threshold: frame.doorGround,
      facadeGap: g.projectRoute(frame.facade, frame.building.points).distance,
      outward: !g.inside(
        [
          frame.facade[0] + frame.normal[0] * 0.1,
          frame.facade[1] + frame.normal[1] * 0.1,
        ],
        frame.building.points,
      ),
    });
  report.casemateDoor = g.casemateDoor;
  for (const building of g.buildings) {
    const samples = s.samplePolyline(building.points, 1);
    const levels = samples.map((p) => g.elevation(...p));
    report.buildingSupport.push({
      id: building.id,
      gate: building.tags.historic === 'city_gate',
      insideFortress: g.inside(g.center(building.points), g.courtBankBoundary),
      foundation: g.foundation(building),
      maxBurial: Math.max(...levels) - g.foundation(building),
      maxFoundationExposure: g.foundation(building) - Math.min(...levels),
      rockContact: samples.some((p) => g.exposedRockAt(p)),
    });
    for (const hole of building.holes) {
      const point = g.center(hole);
      report.courtyards.push({
        id: building.id,
        point,
        insideHole: g.inside(point, hole),
        blocked: g.blocked(point, g.standingElevation(point)),
      });
    }
  }
  const area = (polygon) =>
    Math.abs(
      polygon.reduce((sum, p, i) => {
        const q = polygon[(i + 1) % polygon.length];
        return sum + p[0] * q[1] - p[1] * q[0];
      }, 0),
    ) / 2;
  for (let i = 0; i < g.buildings.length; i++)
    for (let j = i + 1; j < g.buildings.length; j++) {
      const b = g.buildings[i],
        c = g.buildings[j];
      const overlap = polygonClipping.intersection(
        [b.points, ...b.holes],
        [c.points, ...c.holes],
      );
      const overlapArea = overlap.reduce(
        (sum, polygon) =>
          sum +
          area(polygon[0]) -
          polygon.slice(1).reduce((n, ring) => n + area(ring), 0),
        0,
      );
      if (overlapArea > 0.1)
        report.buildingOverlaps.push({ ids: [b.id, c.id], area: overlapArea });
    }
  const trees = g.treePositions();
  for (const point of trees) {
    const mapped = g.mappedTrees.some((p) => distance(p, point) < 0.001);
    const road = g.paths
      .filter((p) => !p.tags.tunnel)
      .map((p) => ({
        id: p.id,
        distance: g.projectRoute(point, p.points).distance - g.pathWidth(p) / 2,
      }))
      .sort((a, b) => a.distance - b.distance)[0];
    const entry = {
      point,
      blocked: g.blocked(point, g.upperElevation(...point)),
      insideFortress: g.inside(point, g.courtBankBoundary),
      road,
    };
    (mapped ? report.mappedTrees : report.generatedTrees).push(entry);
  }
  for (const area of g.features.filter((f) =>
    ['park', 'garden'].includes(f.tags.leisure),
  ))
    report.parks.push({
      id: area.id,
      name: area.tags.name,
      insideFortress: g.inside(g.center(area.points), g.courtBankBoundary),
      trees: trees.filter(
        (p) =>
          g.inside(p, area.points) && !area.holes.some((h) => g.inside(p, h)),
      ).length,
    });
  for (const gate of g.gateBuildings) {
    for (const opening of gate.openings) {
      const samples = [];
      for (let v = -gate.depth / 2 - 1; v <= gate.depth / 2 + 1; v += 0.5) {
        const point = [
          gate.center[0] + gate.axis[0] * opening.offset - gate.axis[1] * v,
          gate.center[1] + gate.axis[1] * opening.offset + gate.axis[0] * v,
        ];
        if (g.blocked(point, g.elevation(...point))) samples.push(point);
      }
      report.gates.push({
        id: gate.feature.id,
        offset: opening.offset,
        blockedSamples: samples,
      });
    }
  }
  for (const path of g.paths) {
    const samples = s.samplePolyline(path.points, 1);
    let previous;
    const obstructions = [],
      rises = [];
    for (const point of samples) {
      const height = g.featureElevation(path, point);
      if (g.blocked(point, height)) obstructions.push(point);
      if (previous && Math.abs(height - previous.height) > 0.8)
        rises.push({ point, rise: height - previous.height });
      previous = { point, height };
    }
    report.paths.push({
      id: path.id,
      tags: path.tags,
      samples: samples.length,
      blockedSamples: obstructions.length,
      firstBlocked: obstructions[0],
      abruptRises: rises.length,
      firstRise: rises[0],
      insideFortress: g.inside(g.center(path.points), g.courtBankBoundary),
    });
  }
  for (const landmark of g.landmarks)
    report.landmarks.push({
      id: landmark.id,
      point: landmark.view,
      blocked: g.blocked(landmark.view, g.standingElevation(landmark.view)),
      nearestPath: Math.min(
        ...g.paths.map((p) => g.projectRoute(landmark.view, p.points).distance),
      ),
    });
  // A coarse full-plateau flood fill supplements exact narrow-gate/postern probes.
  const step = 1,
    minX = -310,
    minZ = -200,
    columns = 601,
    rows = 529;
  const levels = new Float64Array(columns * rows);
  const open = new Uint8Array(columns * rows);
  const reached = new Uint8Array(columns * rows);
  const at = (index) => [
    minX + (index % columns) * step,
    minZ + Math.floor(index / columns) * step,
  ];
  for (let index = 0; index < open.length; index++) {
    const point = at(index);
    levels[index] = g.standingElevation(point);
    open[index] = Number(!g.blocked(point, levels[index]));
  }
  const seed =
    Math.round((g.spawn[1] - minZ) / step) * columns +
    Math.round((g.spawn[0] - minX) / step);
  const queue = [seed];
  reached[seed] = 1;
  for (let cursor = 0; cursor < queue.length; cursor++) {
    const index = queue[cursor];
    for (const offset of [
      -1,
      1,
      -columns,
      columns,
      -columns - 1,
      -columns + 1,
      columns - 1,
      columns + 1,
    ]) {
      const next = index + offset;
      if (
        next < 0 ||
        next >= open.length ||
        !open[next] ||
        reached[next] ||
        (Math.abs(offset) === 1 &&
          Math.floor(next / columns) !== Math.floor(index / columns)) ||
        Math.abs((next % columns) - (index % columns)) > 1 ||
        Math.abs(levels[next] - levels[index]) > 0.8
      )
        continue;
      const p = at(index),
        q = at(next);
      if (
        [0.25, 0.5, 0.75].some((t) => {
          const point = [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t];
          return g.blocked(point, g.standingElevation(point));
        })
      )
        continue;
      reached[next] = 1;
      queue.push(next);
    }
  }
  const targets = [
    ...g.landmarks.map((landmark) => ({
      id: landmark.id,
      point: landmark.view,
    })),
    ...a.cathedralEntrance.doors.map((door, index) => ({
      id: `cathedral-door-${index}`,
      point: [
        door.point[0] + Math.sin(door.angle) * 1.4,
        door.point[1] + Math.cos(door.angle) * 1.4,
      ],
    })),
    {
      id: 'casemate-exterior',
      point: [
        g.casemateEntrance.point[0] + g.casemateEntrance.normal[0] * 2,
        g.casemateEntrance.point[1] + g.casemateEntrance.normal[1] * 2,
      ],
    },
  ];
  report.reachability = {
    gridSpacing: step,
    sampledCells: open.length,
    reachableCells: queue.length,
    maxRisePerEdge: 0.8,
    sweptIntermediateSamples: 3,
    targets: targets.map((target) => {
      let nearestReached = Infinity;
      for (const index of queue)
        nearestReached = Math.min(
          nearestReached,
          distance(target.point, at(index)),
        );
      return {
        ...target,
        nearestReached,
        blocked: g.blocked(target.point, g.standingElevation(target.point)),
      };
    }),
    limitation:
      'One-metre plateau grid cannot prove sub-metre cemetery/gate connectivity or track both levels of a tunnel; exact opening centerlines and prior passage regressions cover those.',
  };
  const add = (_color, geometry) => {
    report.geometry.batches++;
    const positions = geometry.attributes.position;
    report.geometry.vertices += positions.count;
    for (const value of positions.array)
      if (!Number.isFinite(value)) report.geometry.invalidVertices++;
    geometry.dispose();
  };
  a.makeStreetFurniture(add);
  a.makeCathedralForecourt(add);
  a.makeSlavin(add);
  a.makeCemeteryGate(add);
  a.makeEnclosureDetails(add);
  a.makeCemetery(add);
  for (const gate of g.gateBuildings)
    a.makeGate(gate.feature, g.foundation(gate.feature), add);
  for (const arcade of g.cemeteryArcades)
    a.makeCemeteryArcade(arcade.feature, add);
  const rotunda = g.buildings.find((feature) => feature.id === 560209917);
  a.makeRotunda(rotunda, g.foundation(rotunda), add);
  for (const wall of g.walls) {
    if (wall.tags.barrier === 'fence')
      a.makeFence(wall.points, g.meters(wall.tags.height, 1.2), add);
    else
      add(
        '#ffffff',
        s.continuousWall(
          wall.points,
          (point) => g.wallThickness(wall, point),
          (point, normal) => g.wallProfile(wall, point, normal),
        ),
      );
  }
  for (const frame of g.streetFrontages) detail.makeStreetFrontage(frame, add);
  detail.makeSpickaShop(add);
  detail.makePhotoSiteDetails(add);
  passages.makePassages(add);
  monuments.makeMonuments(add);
  for (const feature of [...g.buildings, ...g.parts]) {
    const model = g.modelBuildingPart(feature);
    a.decorateBuilding(
      model,
      g.foundation(model),
      g.meters(model.tags.height, 10),
      add,
    );
  }
  report.counts = {
    features: g.features.length,
    buildings: g.buildings.length,
    parts: g.parts.length,
    walls: g.walls.length,
    paths: g.paths.length,
    pathSamples: report.paths.reduce((sum, path) => sum + path.samples, 0),
    trees: trees.length,
    benches: report.benches.length,
    sculptures: g.sculptures.length,
    graves: g.gravePlots.length,
    posterns: g.posterns.length,
    invalidCoordinates: report.invalidCoordinates.length,
    badBenches: report.benches.filter(
      (b) =>
        b.supportRange > 0.24 ||
        b.obstructedSamples ||
        b.approachBlocked ||
        b.approachRise > 0.4,
    ).length,
    burialWarnings: report.buildingSupport.filter(
      (b) => b.maxBurial > 0.5 && !b.gate,
    ).length,
    obstructedPaths: report.paths.filter((p) => p.blockedSamples).length,
    pathsWithAbruptRise: report.paths.filter((p) => p.abruptRises).length,
    mappedTreeObstructions: report.mappedTrees.filter((t) => t.blocked).length,
    generatedTreeObstructions: report.generatedTrees.filter((t) => t.blocked)
      .length,
    omittedMappedBenches: g.siteDetails.filter(
      (d) =>
        d.tags.amenity === 'bench' &&
        d.point[0] > g.bounds.minX &&
        d.point[0] < g.bounds.maxX &&
        d.point[1] > g.bounds.minZ &&
        d.point[1] < g.bounds.maxZ &&
        !g.streetFurniture.some((site) => site.id === d.id),
    ).length,
    relocatedBenches: g.streetFurniture.filter(
      (site) =>
        site.bench &&
        distance(
          site.point,
          g.siteDetails.find((d) => d.id === site.id).point,
        ) > 0.01,
    ).length,
    auditedGenericDoors: report.genericDoors.length,
    badDoorFrames: report.genericDoors.filter(
      (door) =>
        door.frameWallGap > 0.001 ||
        door.frameOverhang > 0.001 ||
        door.normalTangentDot > 0.001 ||
        !door.outward ||
        !door.supportedStep,
    ).length,
  };
  if (process.env.GEOMETRY_AUDIT_OUTPUT)
    await writeFile(
      process.env.GEOMETRY_AUDIT_OUTPUT,
      JSON.stringify(report, null, 2),
    );
  if (
    report.invalidCoordinates.length ||
    report.geometry.invalidVertices ||
    report.counts.badBenches ||
    report.counts.badDoorFrames ||
    report.gates.some((gate) => gate.blockedSamples.length) ||
    report.reachability.targets.some(
      (target) => target.blocked || target.nearestReached > 1.5,
    )
  )
    process.exitCode = 1;
  console.log(
    JSON.stringify(
      {
        counts: report.counts,
        geometry: report.geometry,
        portals: report.portals,
        gates: report.gates,
        fortressBurialWarnings: report.buildingSupport.filter(
          (b) => b.insideFortress && b.maxBurial > 0.5 && !b.gate,
        ),
        reachability: report.reachability,
        courtyards: report.courtyards,
        doorFrames: {
          generic: report.genericDoors.length,
          bad: report.counts.badDoorFrames,
          businesses: report.businessDoors,
          casemate: report.casemateDoor,
        },
      },
      null,
      2,
    ),
  );
} finally {
  await server.close();
}
