import * as THREE from 'three';
import { MeshBVH, acceleratedRaycast } from 'three-mesh-bvh';
import { makePragueSkyline } from './skyline';
import { makeDrone } from './drone';
import { treeTrunkGeometry, treeCrownGeometry } from './trees';
import {
  DayNightClock,
  daylightAt,
  shadowTarget,
  type TimeOfDay,
} from './lighting';
import { idleController, type ControllerInput } from './gamepad';
import {
  chapelSites,
  chapelBlocked,
  makeChapelInterior,
  makeLawrenceExterior,
  type ChapelKind,
} from './chapels';
import {
  advanceArrow,
  launchArrow,
  type ArrowFlight,
  type ArrowImpact,
} from './arrow-physics';
import {
  Adventure,
  makeAdventureModels,
  makeDistressMarker,
  makeArrow,
  makeMeal,
  arrowPickups,
  enemyMaxHealth,
  makeWeapon,
  weaponPickups,
  type AdventureProgress,
  type AdventureSnapshot,
  type GameMode,
  type Weapon,
  type LandedArrow,
} from './adventure';
import {
  explorationPaths as paths,
  hillDetail,
  onHillDetail,
  splitRockySlopes,
} from './landscape';
import { pavingSurfaces, pavingGeometry, upperPromenadePaving } from './paving';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import {
  Materials,
  paintedSky,
  paintedWater,
  worldUVs,
  type MaterialKind,
} from './materials';
import {
  continuousWall,
  drapedPolygon as groundPolygon,
  samplePolyline,
  courtBankTerrain,
  cliffTerrain,
  gardenBankTerrain,
  clipTerrainAtArcades,
} from './surfaces';
import {
  decorateBuilding,
  makeGate,
  makeStreetFurniture,
  makeCemetery,
  makeCemeteryArcade,
  makeFence,
  makeRotunda,
  makeEnclosureDetails,
  makePanoramaLookouts,
} from './architecture';
import { makeMonuments } from './monuments';
import { makeNuselskyBridge } from './bridge';
import { makeRiversideGallery } from './gallery';
import { makePassages, makeApproach } from './passages';
import { makeSiteDetails, pevnostiHedges } from './site-details';
import { stepWalker } from './movement';
import {
  makeCasemateInterior,
  casemateBlocked,
  casemateNotes,
  casemateFloor,
} from './casemates';
import { createVisitorRoutes, VisitorStroll } from './pedestrians';
import {
  benches,
  groundskeeper,
  cathedral,
  casemates,
  uphillCasemates,
  cathedralExits,
  nearbyActivity,
  benchApproach,
  safeSeat,
  makeGroundskeeper,
  makeCathedralInterior,
  indoorBlocked,
  type Activity,
  type ActivityPrompt,
  type ActivityResult,
} from './activities';
import {
  blocked,
  bounds,
  buildings,
  center,
  discoveredNear,
  elevation,
  upperElevation,
  originalElevation,
  unretainedElevation,
  retainedStreetBanks,
  retainedStreetWalls,
  retainedStreetAreas,
  retainedStreetBankElevation,
  retainedStreetSection,
  standingElevation,
  coverAt,
  lowerPassage,
  upperPromenade,
  projectRoute,
  stairFlights,
  riverElevation,
  foundation,
  gardenPortal,
  casemateUphillExit,
  casemateDoor,
  casemateLocal,
  features,
  inside,
  initialHeading,
  landmarks,
  treePositions,
  meters,
  orientedBounds,
  parts,
  uncoveredBuilding,
  modelBuildingPart,
  pathWidth,
  safePosition,
  spawn,
  terrainField,
  approachTerrainField,
  onApproachTerrain,
  onGardenBankTerrain,
  onTaborTerrain,
  taborTerrainField,
  walls,
  wallOpening,
  wallProfile,
  wallThickness,
  rampartWallRuns,
  brickGateEnvelope,
  onCourtBankTerrain,
  courtBankBoundary,
  onCliffTerrain,
  onExposedRampartBank,
  panoramaSites,
  panoramaOpening,
  exposedRocks,
  cemeteryArcades,
  cemeteryArcadeWallIds,
  streetFurniture,
  summerTheatre,
  sculptureFootprintContains,
  riversideGallery,
  riversideGallerySupport,
  propContains,
  slavinPrecinct,
  type Feature,
  type Point,
} from './geo';

export type Snapshot = {
  position: Point;
  heading: number;
  distance: number;
  fps: number;
  altitude: number;
  interaction: ActivityPrompt | null;
  seated: boolean;
  indoors: boolean;
  interior: 'cathedral' | 'casemates' | ChapelKind | null;
  wood: number;
  hour: number;
  controller: string | null;
  controllerSupported: boolean;
  adventure: AdventureSnapshot | null;
};
export type { TimeOfDay } from './lighting';
type Callbacks = {
  onUpdate: (snapshot: Snapshot) => void;
  onDiscover: (id: string) => void;
  onCasemateNote: (id: string) => void;
  onError: (message: string) => void;
  onMessage?: (message: string) => void;
};

const palettes = ['#ded5bf', '#e4d3b2', '#d9c9bc', '#d9d3c7', '#e6dec9'];
const environmentScale = 1.5;
const avatarScale = 0.85;

function shape(points: readonly Point[], holes: readonly Point[][] = []) {
  const result = new THREE.Shape(
    points.map(([x, z]) => new THREE.Vector2(x, -z)),
  );
  result.holes = holes.map(
    (ring) => new THREE.Path(ring.map(([x, z]) => new THREE.Vector2(x, -z))),
  );
  return result;
}

function box(
  width: number,
  height: number,
  depth: number,
  x: number,
  y: number,
  z: number,
) {
  return new THREE.BoxGeometry(width, height, depth).translate(x, y, z);
}

export function roof(
  points: Point[],
  base: number,
  height: number,
  kind: string,
) {
  const frame = orientedBounds(points);
  const local = points.map(
    ([x, z]): Point => [
      (x - frame.center[0]) * frame.axis[0] +
        (z - frame.center[1]) * frame.axis[1],
      -(x - frame.center[0]) * frame.axis[1] +
        (z - frame.center[1]) * frame.axis[0],
    ],
  );
  const vertices: number[] = [];
  const ring =
    local[0][0] === local.at(-1)?.[0] && local[0][1] === local.at(-1)?.[1]
      ? local.slice(0, -1)
      : local;
  const [cx, cz] = center(ring);
  if (kind === 'pyramidal' || kind === 'conical') {
    ring.forEach((p, i) => {
      const next = ring[(i + 1) % ring.length];
      vertices.push(
        p[0],
        base,
        p[1],
        cx,
        base + height,
        cz,
        next[0],
        base,
        next[1],
      );
    });
  } else if (kind === 'hipped') {
    const halfX = Math.max(...ring.map((p) => Math.abs(p[0])));
    const halfZ = Math.max(...ring.map((p) => Math.abs(p[1])));
    const planes = [
      [0, 1 / halfZ, 1],
      [0, -1 / halfZ, 1],
      [1 / halfZ, 0, halfX / halfZ],
      [-1 / halfZ, 0, halfX / halfZ],
    ];
    for (const plane of planes) {
      let polygon = ring;
      for (const other of planes) {
        if (other === plane) continue;
        const clipped: Point[] = [];
        const distance = (p: Point) =>
          (plane[0] - other[0]) * p[0] +
          (plane[1] - other[1]) * p[1] +
          plane[2] -
          other[2];
        for (const [i, p] of polygon.entries()) {
          const next = polygon[(i + 1) % polygon.length];
          const a = distance(p),
            b = distance(next);
          if (a <= 0.00001) clipped.push(p);
          if (a * b < 0) {
            const t = a / (a - b);
            clipped.push([
              p[0] + (next[0] - p[0]) * t,
              p[1] + (next[1] - p[1]) * t,
            ]);
          }
        }
        polygon = clipped;
      }
      if (polygon.length < 3) continue;
      for (const face of THREE.ShapeUtils.triangulateShape(
        polygon.map(([x, z]) => new THREE.Vector2(x, z)),
        [],
      ))
        for (const index of face) {
          const [x, z] = polygon[index];
          vertices.push(
            x,
            base + Math.max(0, plane[0] * x + plane[1] * z + plane[2]) * height,
            z,
          );
        }
    }
  } else {
    const xs = ring.map((p) => p[0]);
    const zs = ring.map((p) => p[1]);
    const minX = Math.min(...xs),
      maxX = Math.max(...xs);
    const minZ = Math.min(...zs),
      maxZ = Math.max(...zs);
    const axis = maxX - minX > maxZ - minZ ? 1 : 0;
    const mid = axis === 0 ? (minX + maxX) / 2 : (minZ + maxZ) / 2;
    const half = axis === 0 ? (maxX - minX) / 2 : (maxZ - minZ) / 2;
    // Split at the ridge so triangulation preserves the two roof planes.
    for (const side of [-1, 1]) {
      const clipped: Point[] = [];
      ring.forEach((p, i) => {
        const next = ring[(i + 1) % ring.length];
        if ((p[axis] - mid) * side >= 0) clipped.push(p);
        if ((p[axis] - mid) * (next[axis] - mid) < 0) {
          const t = (mid - p[axis]) / (next[axis] - p[axis]);
          clipped.push([
            p[0] + (next[0] - p[0]) * t,
            p[1] + (next[1] - p[1]) * t,
          ]);
        }
      });
      if (clipped.length < 3) continue;
      const faces = THREE.ShapeUtils.triangulateShape(
        clipped.map(([x, z]) => new THREE.Vector2(x, z)),
        [],
      );
      for (const face of faces)
        for (const index of face) {
          const p = clipped[index];
          const factor =
            kind === 'skillion'
              ? (p[axis] - mid + half) / (2 * half || 1)
              : 1 - Math.abs(p[axis] - mid) / (half || 1);
          vertices.push(p[0], base + Math.max(0, factor) * height, p[1]);
        }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(vertices, 3),
  );
  geometry.computeVertexNormals();
  geometry.rotateY(frame.angle);
  geometry.translate(frame.center[0], 0, frame.center[1]);
  const halfX = Math.max(...ring.map((p) => Math.abs(p[0])));
  const halfZ = Math.max(...ring.map((p) => Math.abs(p[1])));
  const axis = halfX > halfZ ? 1 : 0;
  const half = axis === 0 ? halfX : halfZ;
  const boundaryHeight = (p: Point) => {
    if (kind === 'pyramidal' || kind === 'conical') return base;
    const factor =
      kind === 'hipped'
        ? Math.min(1 - Math.abs(p[1]) / halfZ, (halfX - Math.abs(p[0])) / halfZ)
        : kind === 'skillion'
          ? (p[axis] + half) / (2 * half)
          : 1 - Math.abs(p[axis]) / half;
    return base + Math.max(0, factor) * height;
  };
  const sides: number[] = [];
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i],
      b = ring[(i + 1) % ring.length];
    const edge: Point[] = [a];
    if (a[axis] * b[axis] < 0) {
      const t = -a[axis] / (b[axis] - a[axis]);
      edge.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
    }
    edge.push(b);
    for (let j = 1; j < edge.length; j++) {
      const p = edge[j - 1],
        q = edge[j],
        py = boundaryHeight(p),
        qy = boundaryHeight(q);
      if (Math.max(py, qy) - base < 0.0001) continue;
      sides.push(
        p[0],
        base,
        p[1],
        q[0],
        base,
        q[1],
        p[0],
        py,
        p[1],
        p[0],
        py,
        p[1],
        q[0],
        base,
        q[1],
        q[0],
        qy,
        q[1],
      );
    }
  }
  const fascia = new THREE.BufferGeometry();
  fascia.setAttribute('position', new THREE.Float32BufferAttribute(sides, 3));
  fascia.computeVertexNormals();
  fascia.rotateY(frame.angle);
  fascia.translate(frame.center[0], 0, frame.center[1]);
  return { surface: geometry, fascia };
}

export class World {
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(
    55,
    1,
    0.3,
    2500 * environmentScale,
  );
  private renderer: THREE.WebGLRenderer;
  private sunlight = new THREE.DirectionalLight('#ffe2b9', 2.8);
  private ambient = new THREE.HemisphereLight('#c8dcea', '#75805c', 1.2);
  private sky = paintedSky();
  private surfaceMaterials = new Materials();
  private riverMaterial = paintedWater();
  private sunDirection = new THREE.Vector3(-220, 340, 180).normalize();
  private avatar = new THREE.Group();
  private walker = new THREE.Group();
  private drone: ReturnType<typeof makeDrone>;
  private limbs: { pivot: THREE.Group; phase: number; arm: boolean }[] = [];
  private walkBlend = 0;
  private contactShadow: THREE.Mesh<
    THREE.PlaneGeometry,
    THREE.MeshBasicMaterial
  > | null = null;
  private markers: { id: string; ring: THREE.Mesh; light: THREE.Mesh }[] = [];
  private site: ReturnType<typeof makeSiteDetails>;
  private batches = new Map<
    string,
    { kind: MaterialKind; color: string; geometries: THREE.BufferGeometry[] }
  >();
  private blockers: THREE.Object3D[] = [];
  private foliage: { sphere: THREE.Sphere; tree: number }[] = [];
  private treePoints = treePositions();
  private treeMeshes: {
    trunk: THREE.InstancedMesh;
    leaves: THREE.InstancedMesh;
    evergreens: THREE.InstancedMesh;
  } | null = null;
  private treeHits = new Map<number, number>();
  private felled = new Map<
    number,
    { matrices: THREE.Matrix4[]; logs: THREE.Group }
  >();
  private wood = 0;
  private chopTime = 0;
  private axe: THREE.Group | null = null;
  private seat: {
    point: Point;
    angle: number;
    previous: THREE.Vector3;
  } | null = null;
  private npc: THREE.Group;
  private visitors: {
    model: THREE.Group;
    warning: THREE.Group;
    stroll: VisitorStroll;
    pace: number;
  }[] = [];
  private interior: ReturnType<typeof makeCathedralInterior>;
  private casemates: ReturnType<typeof makeCasemateInterior>;
  private chapels: Record<ChapelKind, ReturnType<typeof makeChapelInterior>>;
  private foundCasemateNotes = new Set<string>();
  private indoorReturn: {
    kind: 'cathedral' | 'casemates' | ChapelKind;
    position: THREE.Vector3;
    yaw: number;
    zoom: number;
    pitch: number;
  } | null = null;
  private exteriorVisibility = new Map<THREE.Object3D, boolean>();
  private outdoorActivities: Activity[] = [];
  private stones: {
    mesh: THREE.Mesh;
    velocity: THREE.Vector3;
    age: number;
    bounces: number;
  }[] = [];
  private stoneGeometry = new THREE.IcosahedronGeometry(0.13, 1);
  private lastThrow = -1;
  private daylight = new DayNightClock();
  private controller = idleController;
  private mode: GameMode = 'chill';
  private adventure = new Adventure();
  private adventureModels: ReturnType<typeof makeAdventureModels>;
  private knight = new THREE.Group();
  private explorerHat: THREE.Object3D[] = [];
  private heldWeapons: Partial<Record<Weapon, THREE.Group>> = {};
  private heldFood: THREE.Mesh | null = null;
  private slash = new THREE.Mesh(
    new THREE.TorusGeometry(0.85, 0.035, 4, 20, Math.PI * 0.9).rotateX(
      Math.PI / 2,
    ),
    new THREE.MeshBasicMaterial({
      color: '#e4f4f3',
      transparent: true,
      opacity: 0.65,
      depthWrite: false,
    }),
  );
  private playerImpact = new THREE.Mesh(
    new THREE.OctahedronGeometry(0.3),
    new THREE.MeshBasicMaterial({
      color: '#e79375',
      transparent: true,
      opacity: 0.8,
    }),
  );
  private arrows: (ArrowFlight & {
    model: THREE.Group;
  })[] = [];
  private landedArrowModels = new Map<string, THREE.Group>();
  private fireSeat: { point: Point; angle: number };
  private raycaster = new THREE.Raycaster();
  private movementRay = new THREE.Raycaster();
  private keys = new Set<string>();
  private observer: ResizeObserver;
  private frame = 0;
  private lastTime = 0;
  private updateTime = 0;
  private disposed = false;
  private position = new THREE.Vector3(spawn[0], elevation(...spawn), spawn[1]);
  private yaw = initialHeading;
  private pitch = 0.42;
  private zoom = 17;
  private jumpVelocity = 0;
  private distance = 0;
  private discovered = new Set<string>();
  private drag: { x: number; y: number } | null = null;
  private active = false;
  private paused = false;
  private flying = false;
  private fps = 60;
  private clock = 0;

  constructor(
    private host: HTMLElement,
    private callbacks: Callbacks,
  ) {
    // Keep OSM terrain and collision coordinates native; scale at the rendering boundary.
    this.scene.scale.setScalar(environmentScale);
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.NeutralToneMapping;
    this.renderer.toneMappingExposure = 1.02;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.domElement.setAttribute(
      'aria-label',
      'Interactive 3D world of Vyšehrad',
    );
    this.renderer.domElement.setAttribute('role', 'img');
    this.host.appendChild(this.renderer.domElement);
    this.scene.add(this.ambient, this.sunlight);
    this.sky.scale.setScalar(4000);
    this.scene.add(this.sky, this.sunlight.target);
    this.sunlight.position.set(-400, 400, 200);
    this.sunlight.castShadow = true;
    this.sunlight.shadow.mapSize.set(2048, 2048);
    Object.assign(this.sunlight.shadow.camera, {
      left: -650 * environmentScale,
      right: 650 * environmentScale,
      top: 650 * environmentScale,
      bottom: -650 * environmentScale,
      near: 1,
      far: 1400 * environmentScale,
    });
    this.sunlight.shadow.normalBias = 0.055;
    this.sunlight.shadow.bias = -0.00006;
    this.sunlight.shadow.radius = 1.5;
    this.makeTerrain();
    this.scene.add(makePragueSkyline(this.surfaceMaterials));
    this.makeFeatures();
    makeGate(
      gardenPortal,
      elevation(...center(gardenPortal.points)),
      this.batch.bind(this),
    );
    this.batch('#c2baaa', groundPolygon(gardenPortal.points, 0.055), 'cobble');
    makeMonuments(this.batch.bind(this));
    makeCemetery(this.batch.bind(this));
    makeEnclosureDetails(this.batch.bind(this));
    makeNuselskyBridge(this.batch.bind(this));
    makeRiversideGallery(this.batch.bind(this));
    this.makeTrees();
    this.makeMeadow();
    makeStreetFurniture(this.batch.bind(this));
    this.site = makeSiteDetails(this.batch.bind(this));
    this.scene.add(this.site.group);
    this.npc = makeGroundskeeper(this.surfaceMaterials);
    this.npc.scale.setScalar(1 / environmentScale);
    const coats = [
      '#a78263',
      '#748890',
      '#9583a0',
      '#a29c6e',
      '#678c79',
      '#ad826e',
    ];
    this.visitors = createVisitorRoutes().map((route, index) => {
      const model = makeGroundskeeper(this.surfaceMaterials, {
        coat: coats[index],
        hat: index % 2 ? '#705f4e' : '#697765',
      });
      const stroll = new VisitorStroll(route);
      const warning = makeDistressMarker();
      model.add(warning);
      model.name = `Wandering visitor ${index + 1}`;
      model.scale.setScalar(1 / environmentScale);
      model.position.set(
        stroll.point[0],
        standingElevation(stroll.point),
        stroll.point[1],
      );
      this.scene.add(model);
      return { model, warning, stroll, pace: 1.05 + Math.random() * 0.35 };
    });
    this.interior = makeCathedralInterior(this.surfaceMaterials);
    this.casemates = makeCasemateInterior(this.surfaceMaterials);
    this.chapels = {
      rotunda: makeChapelInterior('rotunda', this.surfaceMaterials),
      lawrence: makeChapelInterior('lawrence', this.surfaceMaterials),
    };
    this.scene.add(
      this.npc,
      this.interior.group,
      this.casemates.group,
      this.chapels.rotunda.group,
      this.chapels.lawrence.group,
    );
    this.outdoorActivities = [
      ...benches,
      groundskeeper,
      cathedral,
      ...(['rotunda', 'lawrence'] as const).map((kind) => ({
        id: kind,
        kind,
        point: chapelSites[kind].approach,
        label:
          kind === 'rotunda'
            ? 'Enter St. Martin’s Rotunda'
            : 'Explore St. Lawrence’s ruins',
      })),
      casemates,
      uphillCasemates,
      {
        id: 'fire',
        kind: 'fire',
        label: 'Rest by the fireplace',
        point: [this.site.fire.position.x, this.site.fire.position.z],
      },
      ...this.treePoints.map(
        (point, index): Activity => ({
          id: `tree-${index}`,
          kind: 'tree',
          point,
          index,
          label: 'Chop tree',
        }),
      ),
    ];
    const fire = this.outdoorActivities.find(
      (activity) => activity.kind === 'fire',
    );
    if (!fire) throw new Error('The fireplace interaction is missing.');
    const fireSeatPoint = safePosition([
      fire.point[0] + 1.7,
      fire.point[1] + 1.3,
    ]);
    this.fireSeat = {
      point: fireSeatPoint,
      angle: Math.atan2(
        fire.point[0] - fireSeatPoint[0],
        fire.point[1] - fireSeatPoint[1],
      ),
    };
    const fireLog = new THREE.CylinderGeometry(0.22, 0.24, 1.7, 12);
    fireLog.rotateZ(Math.PI / 2);
    fireLog.rotateY(this.fireSeat.angle);
    fireLog.translate(
      fireSeatPoint[0],
      upperElevation(...fireSeatPoint) + 0.23,
      fireSeatPoint[1],
    );
    this.batch('#827765', fireLog, 'bark');
    this.flushBatches();
    this.raycaster.firstHitOnly = true;
    this.movementRay.firstHitOnly = true;
    for (const mesh of [
      ...this.blockers,
      ...this.interior.blockers,
      ...this.casemates.blockers,
    ]) {
      if (!(mesh instanceof THREE.Mesh) || mesh.geometry.index?.count === 0)
        continue;
      mesh.geometry.boundsTree ??= new MeshBVH(mesh.geometry);
      mesh.raycast = acceleratedRaycast;
    }
    this.drone = makeDrone(this.surfaceMaterials);
    this.makeAvatar();
    this.makeMarkers();
    this.adventureModels = makeAdventureModels(
      this.surfaceMaterials,
      environmentScale,
    );
    this.scene.add(this.adventureModels.group);
    this.scene.traverse((object) => {
      if (object instanceof THREE.PointLight) {
        object.intensity *= environmentScale ** object.decay;
        object.distance *= environmentScale;
      }
    });
    this.setTime('cycle');
    this.observer = new ResizeObserver(() => this.resize());
    this.observer.observe(host);
    this.resize();
    window.addEventListener('keydown', this.keyDown);
    window.addEventListener('keyup', this.keyUp);
    window.addEventListener('blur', this.clearInput);
    document.addEventListener('visibilitychange', this.clearInput);
    host.addEventListener('pointerdown', this.pointerDown);
    host.addEventListener('pointermove', this.pointerMove);
    host.addEventListener('pointerup', this.pointerUp);
    host.addEventListener('pointercancel', this.pointerUp);
    host.addEventListener('wheel', this.wheel, { passive: false });
    this.renderer.domElement.addEventListener(
      'webglcontextlost',
      this.contextLost,
    );
    this.frame = requestAnimationFrame(this.animate);
  }

  private batch(
    color: string,
    geometry: THREE.BufferGeometry,
    kind: MaterialKind = 'plaster',
  ) {
    if (!geometry.attributes.position.count) {
      geometry.dispose();
      return;
    }
    const normalized = geometry.index ? geometry.toNonIndexed() : geometry;
    if (normalized !== geometry) geometry.dispose();
    worldUVs(normalized, kind);
    const key = `${kind}|${color}`;
    const existing = this.batches.get(key) ?? { kind, color, geometries: [] };
    existing.geometries.push(normalized);
    this.batches.set(key, existing);
  }

  private flushBatches() {
    for (const { color, kind, geometries } of this.batches.values()) {
      const geometry = mergeGeometries(geometries);
      if (!geometry) throw new Error('Could not assemble OSM geometry.');
      const mesh = new THREE.Mesh(
        geometry,
        this.surfaceMaterials.get(kind, color),
      );
      this.scene.add(mesh);
      mesh.castShadow = !['grass', 'cobble', 'glass'].includes(kind);
      mesh.receiveShadow = true;
      if (
        [
          'plaster',
          'stone',
          'rubble',
          'brick',
          'slate',
          'wood',
          'bark',
          'metal',
          'foliage',
        ].includes(kind)
      )
        this.blockers.push(mesh);
      geometries.forEach((g) => g.dispose());
    }
    this.batches.clear();
  }

  private batchGround(color: string, geometry: THREE.BufferGeometry) {
    clipTerrainAtArcades(geometry, false, false);
    const { ground, rock } = splitRockySlopes(geometry);
    this.batch(color, ground, 'grass');
    if (rock) this.batch('#a29a87', rock, 'rock');
  }

  private makeTerrain() {
    const terrain = new THREE.PlaneGeometry(
      1700,
      1500,
      terrainField.columns,
      terrainField.rows,
    );
    terrain.rotateX(-Math.PI / 2);
    const indices = terrain.getIndex();
    if (!indices) throw new Error('The terrain grid has no triangle indices.');
    const coarsePositions = terrain.attributes.position;
    const retained: number[] = [];
    for (let i = 0; i < indices.count; i += 3) {
      const triangle = [
        indices.getX(i),
        indices.getX(i + 1),
        indices.getX(i + 2),
      ];
      const x =
        triangle.reduce((sum, index) => sum + coarsePositions.getX(index), 0) /
        3;
      const z =
        triangle.reduce((sum, index) => sum + coarsePositions.getZ(index), 0) /
        3;
      if (
        !onApproachTerrain(x, z) &&
        !onHillDetail(x, z) &&
        !onTaborTerrain(x, z) &&
        !onGardenBankTerrain(x, z) &&
        !onCourtBankTerrain(x, z) &&
        !onCliffTerrain(x, z)
      )
        retained.push(...triangle);
    }
    terrain.setIndex(retained);
    const detailed = [approachTerrainField, taborTerrainField, hillDetail].map(
      (field) => {
        const surface = new THREE.PlaneGeometry(
          field.maxX - field.minX,
          field.maxZ - field.minZ,
          field.columns,
          field.rows,
        );
        surface.rotateX(-Math.PI / 2);
        surface.translate(
          (field.minX + field.maxX) / 2,
          0,
          (field.minZ + field.maxZ) / 2,
        );
        const indices = surface.getIndex();
        if (!indices)
          throw new Error('The detailed terrain grid has no indices.');
        const positions = surface.attributes.position,
          retained: number[] = [];
        for (let i = 0; i < indices.count; i += 3) {
          const triangle = [
            indices.getX(i),
            indices.getX(i + 1),
            indices.getX(i + 2),
          ];
          const x =
            triangle.reduce((sum, index) => sum + positions.getX(index), 0) / 3;
          const z =
            triangle.reduce((sum, index) => sum + positions.getZ(index), 0) / 3;
          const separate =
            field === hillDetail &&
            (onApproachTerrain(x, z) ||
              onTaborTerrain(x, z) ||
              onCliffTerrain(x, z) ||
              onCourtBankTerrain(x, z));
          if (
            !onGardenBankTerrain(x, z) &&
            !onCourtBankTerrain(x, z) &&
            !separate
          )
            retained.push(...triangle);
        }
        surface.setIndex(retained);
        return surface;
      },
    );
    const courtBanks = courtBankTerrain();
    const cliffs = cliffTerrain();
    const gardenBanks = gardenBankTerrain();
    const streetPolygons = retainedStreetAreas.map((area) => area.polygon);
    const streetBeds = retainedStreetAreas.map((area, index) => {
      const bank = retainedStreetBanks.find((bank) => bank === area);
      return groundPolygon(
        area.polygon,
        0,
        bank ? (x, z) => retainedStreetBankElevation(bank, [x, z]) : elevation,
        streetPolygons.slice(0, index),
      );
    });
    for (const surface of [
      terrain,
      ...detailed,
      courtBanks,
      cliffs,
      gardenBanks,
      ...streetBeds,
    ]) {
      const positions = surface.attributes.position;
      const colors = [];
      for (let i = 0; i < positions.count; i++) {
        const x = positions.getX(i),
          z = positions.getZ(i);
        const y =
          surface === courtBanks ||
          surface === cliffs ||
          surface === gardenBanks ||
          streetBeds.includes(surface)
            ? positions.getY(i)
            : unretainedElevation(x, z);
        positions.setY(i, y);
        const color = new THREE.Color(y > 25 ? '#9ebc6c' : '#b5bb87');
        color.multiplyScalar(0.96 + 0.04 * Math.sin(x * 0.035 + z * 0.045));
        colors.push(color.r, color.g, color.b);
      }
      surface.setAttribute(
        'color',
        new THREE.Float32BufferAttribute(colors, 3),
      );
      clipTerrainAtArcades(surface, true, !streetBeds.includes(surface));
      surface.computeVertexNormals();
      worldUVs(surface, 'grass');
      const material = this.surfaceMaterials.get('grass', '#ffffff').clone();
      material.vertexColors = true;
      const mesh = new THREE.Mesh(surface, material);
      mesh.name = 'Terrain';
      // Constructed soil banks are not exposed rock faces.
      const { rock } = streetBeds.includes(surface)
        ? { rock: null }
        : splitRockySlopes(surface);
      if (rock) {
        worldUVs(rock, 'rock');
        const rocky = new THREE.Mesh(
          rock,
          this.surfaceMaterials.get('rock', '#a29a87'),
        );
        rocky.receiveShadow = true;
        rocky.name = 'Terrain rock';
        this.scene.add(rocky);
        this.blockers.push(rocky);
      }
      this.scene.add(mesh);
      mesh.receiveShadow = true;
      this.blockers.push(mesh);
    }
    const riverFeature = features.find(
      (feature) => feature.tags.water === 'river',
    );
    if (!riverFeature) throw new Error('The mapped river polygon is missing.');
    const riverShape = shape(riverFeature.points);
    riverShape.holes = riverFeature.holes.map(
      (ring) => new THREE.Path(ring.map(([x, z]) => new THREE.Vector2(x, -z))),
    );
    const river = new THREE.Mesh(
      new THREE.ShapeGeometry(riverShape),
      this.riverMaterial,
    );
    river.rotation.x = -Math.PI / 2;
    river.position.set(0, riverElevation, 0);
    this.scene.add(river);
  }

  private makeFeatures() {
    makePassages(this.batch.bind(this));
    makeApproach(this.batch.bind(this));
    makePanoramaLookouts(this.batch.bind(this));
    for (const feature of features) {
      const { tags, points } = feature;
      if (points.length < 4) continue;
      if (
        tags.leisure === 'park' ||
        tags.leisure === 'garden' ||
        tags.landuse === 'grass' ||
        tags.landuse === 'cemetery'
      )
        this.batchGround(
          tags.landuse === 'cemetery' ? '#73805a' : '#7b8959',
          groundPolygon(points, 0.025, elevation, [
            ...feature.holes,
            ...retainedStreetAreas.map((area) => area.polygon),
            ...exposedRocks.map((rock) => rock.points),
            ...riversideGallery.approaches.map((approach) => approach.polygon),
          ]),
        );
      if (tags.natural === 'bare_rock')
        this.batch(
          '#807c74',
          groundPolygon(points, 0.04, elevation, [
            ...feature.holes,
            summerTheatre.enclosure.points,
            ...retainedStreetAreas.map((area) => area.polygon),
            ...riversideGallery.approaches.map((approach) => approach.polygon),
          ]),
          'rock',
        );
      if (tags.natural === 'water' && tags.water !== 'river')
        this.batch('#5c8177', groundPolygon(points, 0.08), 'glass');
    }
    const rotunda = buildings.find((feature) => feature.id === 560209917);
    for (const feature of [...buildings, ...parts]) {
      if (feature.id === 49811196) continue;
      if (riversideGallery.portalBuildingIds.has(feature.id)) continue;
      if (cemeteryArcades.some((arcade) => arcade.feature.id === feature.id)) {
        makeCemeteryArcade(feature, this.batch.bind(this));
        continue;
      }
      if (
        feature.tags['building:part'] &&
        cemeteryArcades.some((arcade) =>
          inside(center(feature.points), arcade.feature.points),
        )
      )
        continue;
      if (
        rotunda &&
        feature.tags['building:part'] &&
        inside(center(feature.points), rotunda.points)
      )
        continue;
      if (feature.id === 560209917) {
        this.makeBuilding(feature);
        continue;
      }
      const children = feature.tags.building
        ? parts.filter((p) => inside(center(p.points), feature.points))
        : [];
      if (children.length) {
        const lowWall = Math.min(
          ...children.map((p) =>
            Math.max(
              1,
              meters(p.tags.height, 9.3) - meters(p.tags['roof:height'], 0),
            ),
          ),
        );
        for (const uncovered of uncoveredBuilding(feature))
          this.makeBuilding({
            ...uncovered,
            tags: {
              ...feature.tags,
              height: String(
                Math.min(meters(feature.tags.height, lowWall), lowWall),
              ),
              'roof:shape': 'flat',
              'roof:height': '0',
            },
          });
      } else this.makeBuilding(feature);
    }
    this.makePaving();
    for (const feature of walls) {
      if (cemeteryArcadeWallIds.has(feature.id)) continue;
      for (const points of rampartWallRuns(feature)) {
        const samples = samplePolyline(points, 0.9);
        if (feature.id === 1532977610) {
          samples.push(
            ...panoramaSites
              .flatMap((site) => [
                site.at(-site.width / 2),
                site.at(site.width / 2),
              ])
              .filter((point) => projectRoute(point, points).distance < 0.01),
          );
          samples.sort(
            (a, b) =>
              projectRoute(a, points).along - projectRoute(b, points).along,
          );
        }
        let run: Point[] = [];
        const fence = feature.tags.barrier === 'fence';
        let suspended = false;
        const emit = () => {
          if (run.length > 1 && fence)
            makeFence(
              run,
              meters(feature.tags.height, 1.8),
              this.batch.bind(this),
              upperElevation,
            );
          else if (run.length > 1)
            this.batch(
              feature.tags.barrier === 'city_wall'
                ? [8888302, 33878732].includes(feature.id)
                  ? '#a96751'
                  : '#a68b76'
                : '#a29b87',
              continuousWall(
                run,
                (point) => wallThickness(feature, point),
                (point, normal) => {
                  const profile = wallProfile(feature, point, normal);
                  return suspended
                    ? {
                        ...profile,
                        bottom: Math.min(
                          profile.top,
                          (coverAt(point)
                            ? upperElevation(...point)
                            : originalElevation(...point)) - 0.25,
                        ),
                      }
                    : profile;
                },
                !suspended,
                feature.id === 1532977610 ? courtBankBoundary : undefined,
              ),
              feature.tags.barrier === 'city_wall'
                ? 'brick'
                : retainedStreetWalls.includes(feature)
                  ? 'rubble'
                  : 'stone',
            );
          run = [];
        };
        for (const point of samples) {
          const cover = coverAt(point);
          const nextSuspended =
            cover !== undefined ||
            lowerPassage(point) !== undefined ||
            brickGateEnvelope(point) ||
            (Number(feature.tags.layer ?? 0) > 0 &&
              riversideGallerySupport(point) !== undefined);
          if (nextSuspended !== suspended) {
            const previous = run.at(-1);
            emit();
            suspended = nextSuspended;
            if (previous) run.push(previous);
          }
          if (
            (feature.id === 1532977610 && panoramaOpening(point)) ||
            (fence && onExposedRampartBank(point)) ||
            (cover?.id === 51700613 &&
              !fence &&
              projectRoute(point, upperPromenade).distance < 1.8) ||
            (!nextSuspended && wallOpening(point))
          )
            emit();
          else run.push(point);
        }
        emit();
      }
    }
  }

  private makePaving() {
    const group = new THREE.Group();
    group.name = 'Paving';
    const batches = new Map<
      string,
      {
        style: ReturnType<typeof pavingSurfaces>[number]['style'];
        geometries: THREE.BufferGeometry[];
      }
    >();
    for (const surface of pavingSurfaces([...paths, upperPromenadePaving])) {
      const geometry = pavingGeometry(surface);
      if (!geometry.attributes.position.count) {
        geometry.dispose();
        continue;
      }
      worldUVs(geometry, surface.style.kind);
      const batch = batches.get(surface.style.kind) ?? {
        style: surface.style,
        geometries: [],
      };
      batch.geometries.push(geometry);
      batches.set(surface.style.kind, batch);
    }
    for (const { style, geometries } of batches.values()) {
      const geometry = mergeGeometries(geometries);
      if (!geometry) throw new Error('Could not assemble the paving network.');
      const mesh = new THREE.Mesh(
        geometry,
        this.surfaceMaterials.get(style.kind, style.color),
      );
      mesh.name = `Paving: ${style.kind}`;
      mesh.receiveShadow = true;
      group.add(mesh);
      geometries.forEach((geometry) => geometry.dispose());
    }
    this.scene.add(group);
  }

  private makeBuilding(feature: Feature) {
    feature = modelBuildingPart(feature);
    const points = feature.points;
    const [x, z] = center(points);
    const parent = feature.tags['building:part']
      ? buildings.find((building) => inside([x, z], building.points))
      : undefined;
    const tags = { ...parent?.tags, ...feature.tags };
    feature = { ...feature, tags };
    const ground = foundation(feature);
    if (feature.id === chapelSites.lawrence.feature.id) {
      makeLawrenceExterior(this.batch.bind(this));
      return;
    }
    if (feature.id === 560209917) {
      makeRotunda(feature, ground, this.batch.bind(this));
      return;
    }
    const footprint = orientedBounds(points);
    const roofKind =
      tags['roof:shape'] ??
      (feature.holes.length
        ? 'flat'
        : footprint.width < 65 && footprint.depth < 35
          ? 'gabled'
          : 'flat');
    const defaultRoof =
      roofKind === 'flat' ? 0 : Math.min(4, footprint.depth * 0.3);
    const total = meters(
      tags.height,
      meters(tags['building:levels'], 3) * 3.1 + defaultRoof,
    );
    const roofHeight =
      roofKind === 'flat'
        ? 0
        : Math.min(total * 0.65, meters(tags['roof:height'], defaultRoof));
    const minHeight = meters(tags.min_height, 0);
    const wallHeight = Math.max(1, total - roofHeight - minHeight);
    const color = tags['building:colour']?.match(/^#[0-9a-f]{6}$/i)
      ? tags['building:colour']
      : palettes[Math.abs(feature.id) % palettes.length];
    if (tags.historic === 'city_gate') {
      makeGate(feature, ground, this.batch.bind(this));
      return;
    }
    const bottom =
      minHeight > 0
        ? ground + minHeight
        : Math.min(
            ground,
            ...samplePolyline(points, 0.8).map((p) => elevation(...p)),
          ) - 1;
    const top = ground + minHeight + wallHeight;
    const geometry = new THREE.ExtrudeGeometry(shape(points, feature.holes), {
      depth: top - bottom,
      bevelEnabled: false,
    });
    geometry.rotateX(-Math.PI / 2);
    geometry.translate(0, bottom, 0);
    this.batch(
      color === '#52514f' ? '#565a55' : color,
      geometry,
      tags.building === 'church' || color === '#52514f' ? 'stone' : 'plaster',
    );
    if (roofHeight > 0) {
      const covering = roof(points, top, roofHeight, roofKind);
      this.batch(
        tags['roof:colour']?.match(/^#[0-9a-f]{6}$/i)
          ? tags['roof:colour']
          : color === '#52514f'
            ? '#737e7a'
            : '#a8775c',
        covering.surface,
        'slate',
      );
      this.batch(
        color,
        covering.fascia,
        tags.building === 'church' ? 'stone' : 'plaster',
      );
    }
    if (
      tags['building:part'] ||
      !tags.building ||
      !parts.some((p) => inside(center(p.points), points))
    )
      decorateBuilding(
        feature,
        ground + minHeight,
        wallHeight,
        this.batch.bind(this),
      );
    if (tags.height === '60' && tags['building:part']) {
      const crossY = ground + total + 1;
      this.batch('#d7c9a5', box(0.22, 2.4, 0.22, x, crossY, z), 'metal');
      this.batch('#d7c9a5', box(1.3, 0.22, 0.22, x, crossY + 0.5, z), 'metal');
    }
  }

  private makeTrees() {
    const trees = this.treePoints;
    const trunk = new THREE.InstancedMesh(
      treeTrunkGeometry(),
      this.surfaceMaterials.get('bark', '#827765'),
      trees.length,
    );
    const leaves = new THREE.InstancedMesh(
      treeCrownGeometry(),
      this.surfaceMaterials.get('foliage', '#ffffff'),
      trees.length * 4,
    );
    const evergreens = new THREE.InstancedMesh(
      treeCrownGeometry(true),
      this.surfaceMaterials.get('foliage', '#ffffff'),
      Math.ceil(trees.length / 8) * 4,
    );
    let evergreenIndex = 0;
    const dummy = new THREE.Object3D();
    const color = new THREE.Color();
    trees.forEach(([x, z], i) => {
      const y = upperElevation(x, z);
      const scale = 0.82 + (i % 11) * 0.048;
      const spread = i % 3 === 0 ? 1.16 : i % 3 === 1 ? 0.88 : 1;
      dummy.position.set(x, y + 4.75 * scale, z);
      dummy.rotation.set(0, i * 2.4, 0);
      dummy.scale.setScalar(scale);
      dummy.updateMatrix();
      trunk.setMatrixAt(i, dummy.matrix);
      for (let lobe = 0; lobe < 4; lobe++) {
        if (i % 8 === 0) {
          dummy.position.set(x, y + (4.8 + lobe * 1.65) * scale, z);
          const radius = (3.1 - lobe * 0.55) * scale;
          dummy.scale.set(radius, 4.2 * scale, radius);
          dummy.rotation.y = i + lobe * 0.6;
          dummy.updateMatrix();
          evergreens.setMatrixAt(evergreenIndex, dummy.matrix);
          evergreens.setColorAt(
            evergreenIndex++,
            color.set(lobe % 2 ? '#566d58' : '#687f60'),
          );
          this.foliage.push({
            sphere: new THREE.Sphere(dummy.position.clone(), radius),
            tree: i,
          });
          dummy.scale.setScalar(0);
          dummy.updateMatrix();
          leaves.setMatrixAt(i * 4 + lobe, dummy.matrix);
          continue;
        }
        const angle = (lobe * Math.PI * 2) / 3 + i * 0.45;
        const size = (lobe === 3 ? 3.1 : 2.5 + ((i + lobe) % 4) * 0.18) * scale;
        dummy.position.set(
          x + (lobe === 3 ? 0.35 : Math.cos(angle) * 2.1 * spread) * scale,
          y + (lobe === 3 ? 10.1 : 7.7 + ((i + lobe) % 3) * 0.45) * scale,
          z + (lobe === 3 ? -0.2 : Math.sin(angle) * 1.8) * scale,
        );
        dummy.scale.set(
          size * spread,
          size * (lobe === 3 ? 1.05 : 0.8),
          size * (lobe % 2 ? 0.92 : 1.05),
        );
        dummy.rotation.set(0.06 * Math.sin(i + lobe), i + lobe, 0);
        dummy.updateMatrix();
        leaves.setMatrixAt(i * 4 + lobe, dummy.matrix);
        this.foliage.push({
          sphere: new THREE.Sphere(
            dummy.position.clone(),
            size * Math.max(spread, 1.05) * 1.2,
          ),
          tree: i,
        });
        leaves.setColorAt(
          i * 4 + lobe,
          color.set(
            [
              '#8c9969',
              '#baab68',
              '#92a270',
              '#b29a60',
              '#7f986f',
              '#b6a476',
              '#a18c61',
            ][i % 7],
          ),
        );
      }
    });
    trunk.instanceMatrix.needsUpdate = true;
    leaves.instanceMatrix.needsUpdate = true;
    if (leaves.instanceColor) leaves.instanceColor.needsUpdate = true;
    evergreens.instanceMatrix.needsUpdate = true;
    if (evergreens.instanceColor) evergreens.instanceColor.needsUpdate = true;
    trunk.computeBoundingSphere();
    leaves.computeBoundingSphere();
    evergreens.computeBoundingSphere();
    this.scene.add(trunk, leaves, evergreens);
    this.treeMeshes = { trunk, leaves, evergreens };
    trunk.name = 'Branching tree trunks';
    leaves.name = 'Painted broadleaf canopies';
    evergreens.name = 'Layered evergreen canopies';
    trunk.castShadow = true;
    leaves.castShadow = true;
    leaves.receiveShadow = true;
    evergreens.castShadow = true;
    evergreens.receiveShadow = true;
    this.makeLeafLitter(trees);
  }

  private makeLeafLitter(trees: readonly Point[]) {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      'position',
      new THREE.Float32BufferAttribute(
        [
          0, 0, -0.12, 0.06, 0, -0.03, 0.04, 0.015, 0.08, 0, 0.01, 0.14, -0.06,
          0, 0.03, -0.035, 0.01, -0.065,
        ],
        3,
      ),
    );
    geometry.setIndex([0, 1, 5, 1, 2, 4, 1, 4, 5, 2, 3, 4]);
    geometry.computeVertexNormals();
    const leaves = new THREE.InstancedMesh(
      geometry,
      this.surfaceMaterials.get('plaster', '#ffffff'),
      trees.length * 28,
    );
    leaves.name = 'Autumn leaf litter';
    const dummy = new THREE.Object3D(),
      color = new THREE.Color();
    let count = 0;
    for (const [tree, origin] of trees.entries()) {
      if (tree % 8 === 0 || !inside(origin, courtBankBoundary)) continue;
      for (let leaf = 0; leaf < 28; leaf++) {
        const angle = leaf * 2.39996 + tree,
          radius = 0.8 + (leaf % 9) * 0.52;
        const point: Point = [
          origin[0] + Math.cos(angle) * radius,
          origin[1] + Math.sin(angle) * radius,
        ];
        const ground = upperElevation(...point);
        if (blocked(point, ground) || coverAt(point)) continue;
        dummy.position.set(point[0], ground + 0.09, point[1]);
        dummy.rotation.set(0, angle, 0);
        dummy.scale.setScalar(0.65 + (leaf % 5) * 0.17);
        dummy.updateMatrix();
        leaves.setMatrixAt(count, dummy.matrix);
        leaves.setColorAt(
          count++,
          color.set(['#b9a355', '#b48a48', '#aa7946', '#c4b468'][leaf % 4]),
        );
      }
    }
    leaves.count = count;
    leaves.instanceMatrix.needsUpdate = true;
    if (leaves.instanceColor) leaves.instanceColor.needsUpdate = true;
    leaves.computeBoundingSphere();
    leaves.receiveShadow = true;
    this.scene.add(leaves);
  }

  private makeMeadow() {
    const footprint = (feature: Feature) => ({
      feature,
      minX: Math.min(...feature.points.map(([x]) => x)),
      maxX: Math.max(...feature.points.map(([x]) => x)),
      minZ: Math.min(...feature.points.map(([, z]) => z)),
      maxZ: Math.max(...feature.points.map(([, z]) => z)),
    });
    const contains = (point: Point, area: ReturnType<typeof footprint>) =>
      point[0] >= area.minX &&
      point[0] <= area.maxX &&
      point[1] >= area.minZ &&
      point[1] <= area.maxZ &&
      inside(point, area.feature.points);
    const patches = features
      .filter(
        (feature) =>
          feature.tags.leisure === 'park' ||
          feature.tags.leisure === 'garden' ||
          feature.tags.landuse === 'grass',
      )
      .map(footprint);
    const excluded = [
      ...buildings,
      ...cemeteryArcades.map((arcade) => arcade.feature),
      ...features.filter((feature) => feature.tags.landuse === 'cemetery'),
      ...features.filter((feature) => feature.tags.leisure === 'playground'),
    ].map(footprint);
    const routes = paths.map((feature) => {
      const margin = pathWidth(feature) / 2 + 0.6;
      return {
        feature,
        margin,
        minX: Math.min(...feature.points.map(([x]) => x)) - margin,
        maxX: Math.max(...feature.points.map(([x]) => x)) + margin,
        minZ: Math.min(...feature.points.map(([, z]) => z)) - margin,
        maxZ: Math.max(...feature.points.map(([, z]) => z)) + margin,
      };
    });
    const points: Point[] = [];
    for (let x = -290; x < 210; x += 2.1)
      for (let z = -200; z < 320; z += 2.1) {
        const noise = Math.sin(x * 12.9898 + z * 78.233) * 43758.5453;
        const jitter = noise - Math.floor(noise);
        const point: Point = [
          x + (jitter - 0.5) * 2,
          z + Math.sin(noise) * 0.9,
        ];
        if (
          !patches.some(
            (patch) =>
              contains(point, patch) &&
              !patch.feature.holes.some((hole) => inside(point, hole)),
          ) ||
          excluded.some((area) => contains(point, area)) ||
          retainedStreetSection(point) ||
          exposedRocks.some((rock) => inside(point, rock.points)) ||
          routes.some(
            (route) =>
              point[0] >= route.minX &&
              point[0] <= route.maxX &&
              point[1] >= route.minZ &&
              point[1] <= route.maxZ &&
              projectRoute(point, route.feature.points).distance < route.margin,
          ) ||
          sculptureFootprintContains(point, 0.65) ||
          blocked(point, upperElevation(...point))
        )
          continue;
        points.push(point);
      }
    const blades = [0, Math.PI / 3, (2 * Math.PI) / 3].map((angle) => {
      const blade = new THREE.BufferGeometry();
      blade.setAttribute(
        'position',
        new THREE.Float32BufferAttribute(
          [
            -0.06, 0, 0, 0.06, 0, 0, 0.045, 0.24, 0, 0.11, 0.52, 0, -0.025,
            0.24, 0,
          ],
          3,
        ),
      );
      blade.setIndex([0, 1, 2, 0, 2, 4, 4, 2, 3]);
      blade.computeVertexNormals();
      blade.rotateY(angle);
      return blade;
    });
    const geometry = mergeGeometries(blades);
    if (!geometry) throw new Error('Could not assemble meadow grasses.');
    blades.forEach((blade) => blade.dispose());
    const grass = new THREE.InstancedMesh(
      geometry,
      this.surfaceMaterials.get('foliage', '#ffffff'),
      points.length,
    );
    const dummy = new THREE.Object3D();
    const color = new THREE.Color();
    points.forEach(([x, z], i) => {
      dummy.position.set(x, upperElevation(x, z) + 0.035, z);
      dummy.rotation.y = i * 2.4;
      dummy.scale.setScalar(0.6 + (i % 7) * 0.075);
      dummy.updateMatrix();
      grass.setMatrixAt(i, dummy.matrix);
      grass.setColorAt(i, color.set(i % 5 === 0 ? '#b8b07a' : '#9daa72'));
    });
    grass.computeBoundingSphere();
    grass.receiveShadow = true;
    this.scene.add(grass);
  }

  private makeAvatar() {
    const add = (
      geometry: THREE.BufferGeometry,
      color: string,
      y: number,
      z = 0,
    ) => {
      const mesh = new THREE.Mesh(
        geometry,
        this.surfaceMaterials.get('plaster', color),
      );
      mesh.position.set(0, y, z);
      mesh.castShadow = true;
      this.walker.add(mesh);
      return mesh;
    };
    add(new THREE.CapsuleGeometry(0.32, 0.55, 8, 20), '#c79d55', 1.15);
    add(new THREE.SphereGeometry(0.275, 24, 16), '#e4bd96', 1.91);
    this.explorerHat = [
      add(new THREE.CylinderGeometry(0.31, 0.33, 0.18, 24), '#36574a', 2.12),
      add(new THREE.CylinderGeometry(0.43, 0.43, 0.04, 24), '#36574a', 2.02),
    ];
    this.knight.name = 'Knight armor';
    const armor = (geometry: THREE.BufferGeometry, color: string) => {
      const mesh = new THREE.Mesh(
        geometry,
        this.surfaceMaterials.get('metal', color),
      );
      mesh.castShadow = true;
      this.knight.add(mesh);
    };
    armor(
      new THREE.CapsuleGeometry(0.35, 0.5, 6, 12).translate(0, 1.16, 0),
      '#8e9ba3',
    );
    armor(
      new THREE.SphereGeometry(0.3, 16, 12).translate(0, 1.97, 0),
      '#a5b0b4',
    );
    armor(
      new THREE.BoxGeometry(0.42, 0.07, 0.04).translate(0, 2, 0.28),
      '#2d4144',
    );
    armor(
      new THREE.BoxGeometry(0.08, 0.35, 0.3).translate(0, 2.3, -0.02),
      '#9a5247',
    );
    armor(
      new THREE.CylinderGeometry(0.32, 0.32, 0.08, 12)
        .rotateX(Math.PI / 2)
        .translate(-0.49, 1.1, 0.22),
      '#476e80',
    );
    armor(
      new THREE.BoxGeometry(0.1, 0.42, 0.04).translate(-0.49, 1.1, 0.28),
      '#dfc078',
    );
    this.knight.visible = false;
    this.walker.add(this.knight);
    add(
      new THREE.TorusGeometry(0.26, 0.065, 8, 24).rotateX(Math.PI / 2),
      '#945b45',
      1.62,
    );
    add(new THREE.BoxGeometry(0.48, 0.6, 0.22), '#785f45', 1.17, -0.31);
    for (const side of [-1, 1]) {
      for (const arm of [false, true]) {
        const pivot = new THREE.Group();
        pivot.position.set(side * (arm ? 0.41 : 0.18), arm ? 1.48 : 0.73, 0);
        const limb = new THREE.Mesh(
          new THREE.CapsuleGeometry(arm ? 0.1 : 0.13, arm ? 0.4 : 0.38, 6, 12),
          this.surfaceMaterials.get('plaster', arm ? '#c79d55' : '#334c48'),
        );
        limb.position.y = -0.31;
        limb.castShadow = true;
        const end = new THREE.Mesh(
          arm
            ? new THREE.SphereGeometry(0.105, 12, 8)
            : new THREE.CapsuleGeometry(0.12, 0.21, 6, 12).rotateX(Math.PI / 2),
          this.surfaceMaterials.get('plaster', arm ? '#e4bd96' : '#443e36'),
        );
        end.position.set(0, arm ? -0.62 : -0.64, arm ? 0 : 0.055);
        end.castShadow = true;
        pivot.add(limb, end);
        this.walker.add(pivot);
        this.limbs.push({
          pivot,
          arm,
          phase: (side === 1 ? Math.PI : 0) + (arm ? Math.PI : 0),
        });
      }
    }
    this.avatar.name = 'Player avatar';
    this.walker.name = 'Walking explorer';
    this.walker.scale.setScalar(avatarScale / environmentScale);
    this.drone.group.scale.setScalar(1 / environmentScale);
    this.drone.group.visible = false;
    this.avatar.add(this.walker, this.drone.group);
    const hand = this.limbs.find((limb) => limb.arm);
    if (hand) {
      this.axe = new THREE.Group();
      const handle = new THREE.Mesh(
        new THREE.CylinderGeometry(0.025, 0.03, 0.65, 8),
        this.surfaceMaterials.get('wood', '#826a4e'),
      );
      const blade = new THREE.Mesh(
        new THREE.BoxGeometry(0.28, 0.2, 0.08),
        this.surfaceMaterials.get('stone', '#a8aca0'),
      );
      blade.position.set(0.1, -0.3, 0);
      this.axe.add(handle, blade);
      this.axe.position.set(0, -0.6, 0.08);
      this.axe.visible = false;
      hand.pivot.add(this.axe);
      for (const kind of ['stick', 'sword', 'bow'] as const) {
        const weapon = makeWeapon(kind, this.surfaceMaterials);
        weapon.position.set(0, -0.6, 0.1);
        weapon.rotation.x = Math.PI / 2;
        weapon.visible = false;
        hand.pivot.add(weapon);
        this.heldWeapons[kind] = weapon;
      }
      this.heldFood = makeMeal(this.surfaceMaterials);
      this.heldFood.position.set(0, -0.65, 0.1);
      this.heldFood.visible = false;
      hand.pivot.add(this.heldFood);
    }
    this.slash.position.set(0, 1.15, 0.7);
    this.slash.visible = false;
    this.playerImpact.position.set(0, 1.4, 0);
    this.playerImpact.visible = false;
    this.walker.add(this.slash, this.playerImpact);
    this.scene.add(this.avatar);
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 128;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Could not create character contact shadow.');
    const gradient = context.createRadialGradient(64, 64, 8, 64, 64, 60);
    gradient.addColorStop(0, '#17231990');
    gradient.addColorStop(1, '#17231900');
    context.fillStyle = gradient;
    context.fillRect(0, 0, 128, 128);
    this.contactShadow = new THREE.Mesh(
      new THREE.PlaneGeometry(1.8, 1.8),
      new THREE.MeshBasicMaterial({
        map: new THREE.CanvasTexture(canvas),
        transparent: true,
        depthWrite: false,
      }),
    );
    this.contactShadow.rotation.x = -Math.PI / 2;
    this.contactShadow.scale.setScalar(1 / environmentScale);
    this.scene.add(this.contactShadow);
  }

  private makeMarkers() {
    for (const landmark of landmarks) {
      const [x, z] = landmark.view,
        y = elevation(x, z);
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(3.2, 0.09, 5, 48),
        new THREE.MeshBasicMaterial({ color: '#ffe0a1' }),
      );
      ring.rotation.x = Math.PI / 2;
      ring.position.set(x, y + 0.3, z);
      const light = new THREE.Mesh(
        new THREE.OctahedronGeometry(0.75),
        new THREE.MeshBasicMaterial({ color: '#ffe0a1' }),
      );
      light.position.set(x, y + 4, z);
      this.scene.add(ring, light);
      this.markers.push({ id: landmark.id, ring, light });
    }
  }

  setTime(time: TimeOfDay) {
    this.daylight.set(time);
    this.applyDaylight();
  }

  private applyDaylight() {
    const light = daylightAt(this.daylight.hour);
    if (!(this.scene.background instanceof THREE.Color))
      this.scene.background = new THREE.Color();
    this.scene.background.copy(light.horizon);
    if (!(this.scene.fog instanceof THREE.FogExp2))
      this.scene.fog = new THREE.FogExp2(light.horizon);
    this.scene.fog.color.copy(light.horizon);
    this.scene.fog.density = light.fog / environmentScale;
    const uniforms = this.sky.material.uniforms;
    uniforms.zenith.value.copy(light.zenith);
    uniforms.horizon.value.copy(light.horizon);
    uniforms.cloud.value.copy(light.cloud);
    uniforms.sun.value.copy(light.sun);
    uniforms.night.value = light.night;
    this.sunDirection.copy(light.sun);
    this.ambient.color.copy(light.ambientColor);
    this.ambient.groundColor.copy(light.groundColor);
    this.ambient.intensity = this.indoorReturn ? 0 : light.ambient;
    this.sunlight.intensity = this.indoorReturn ? 0 : light.direct;
    this.sunlight.color.copy(light.directColor);
    this.renderer.toneMappingExposure = light.exposure;
    this.riverMaterial.uniforms.deep.value.copy(light.deepWater);
    this.riverMaterial.uniforms.shallow.value.copy(light.shallowWater);
    this.riverMaterial.uniforms.skyTint.value.copy(light.horizon);
    this.riverMaterial.uniforms.sparkle.value = THREE.MathUtils.lerp(
      0.16,
      0.04,
      light.night,
    );
    this.surfaceMaterials.setNight(light.night);
    if (this.indoorReturn?.kind === 'casemates') {
      this.scene.background = new THREE.Color('#25251f');
      this.scene.fog = new THREE.FogExp2('#25251f', 0.012 / environmentScale);
      this.renderer.toneMappingExposure = 1.05;
    }
  }

  setControllerInput(input: ControllerInput) {
    this.controller = input;
  }

  setMode(mode: GameMode, progress?: AdventureProgress) {
    if (this.flying) this.setFlying(false);
    this.mode = mode;
    this.arrows.forEach((arrow) => this.removeArrow(arrow.model));
    this.arrows = [];
    this.landedArrowModels.forEach((model) => this.removeArrow(model));
    this.landedArrowModels.clear();
    this.adventure = new Adventure(progress);
    for (const arrow of this.adventure.landedArrows.values()) {
      const model = makeArrow(this.surfaceMaterials);
      this.placeArrow(
        model,
        new THREE.Vector3(...arrow.position),
        new THREE.Vector3(...arrow.direction),
      );
      this.adventureModels.group.add(model);
      this.landedArrowModels.set(arrow.id, model);
    }
    for (const weapon of Object.values(this.heldWeapons))
      weapon.visible = false;
    if (this.heldFood) this.heldFood.visible = false;
    this.adventureModels.group.visible = mode === 'adventure';
    this.knight.visible = mode === 'adventure';
    this.explorerHat.forEach((hat) => {
      hat.visible = mode === 'chill';
    });
    if (mode === 'adventure') this.setDiscoveries([...this.adventure.explored]);
    this.clearInput();
  }

  setActive(active: boolean) {
    this.active = active;
    const radius = (active ? 65 : 650) * environmentScale;
    Object.assign(this.sunlight.shadow.camera, {
      left: -radius,
      right: radius,
      top: radius,
      bottom: -radius,
    });
    this.sunlight.shadow.camera.updateProjectionMatrix();
    this.clearInput();
  }
  setPaused(paused: boolean) {
    this.paused = paused;
    if (paused) this.adventure.aiming = false;
    this.clearInput();
  }
  setDiscoveries(ids: string[]) {
    this.discovered = new Set(ids);
  }
  setCasemateNotes(ids: string[]) {
    this.foundCasemateNotes = new Set(
      casemateNotes
        .filter((note) => ids.includes(note.id))
        .map((note) => note.id),
    );
    for (const [id, marker] of this.casemates.markers)
      marker.visible = !this.foundCasemateNotes.has(id);
  }
  setFlying(flying: boolean) {
    if (flying && this.mode === 'adventure')
      throw new Error('Flight is disabled in Adventure mode.');
    if (this.indoorReturn)
      throw new Error(
        'Flight is unavailable inside buildings and underground.',
      );
    if (this.seat) this.stand();
    if (flying) this.position.y += 10 / environmentScale;
    else {
      const p = safePosition([this.position.x, this.position.z]);
      this.position.set(p[0], standingElevation(p), p[1]);
    }
    this.flying = flying;
    this.jumpVelocity = 0;
    this.clearInput();
  }
  travel(id: string) {
    if (this.mode === 'adventure' && !this.adventure.explored.has(id))
      throw new Error(
        'Raise this region’s checkpoint banner before traveling there.',
      );
    const landmark = landmarks.find((l) => l.id === id);
    if (!landmark) throw new Error('Unknown destination.');
    const p = safePosition(landmark.view);
    if (this.indoorReturn) this.leaveCathedral();
    this.seat = null;
    this.position.set(
      p[0],
      standingElevation(p) + (this.flying ? 12 : 0),
      p[1],
    );
    this.jumpVelocity = 0;
    this.yaw = Math.atan2(
      landmark.position[0] - p[0],
      p[1] - landmark.position[1],
    );
    this.camera.position
      .copy(this.position)
      .multiplyScalar(environmentScale)
      .add(new THREE.Vector3(0, 20, 30));
  }

  private support(point: Point, ceiling = this.position.y + 0.02) {
    if (this.indoorReturn) return this.indoorFloor(point);
    const ground = standingElevation(point, this.position.y);
    if (this.flying || ceiling < ground) return ground;
    this.movementRay.near = 0;
    this.movementRay.far = (ceiling + 0.11 - ground) * environmentScale;
    const radius = 0.32 / environmentScale;
    const offsets =
      this.position.y > ground + 0.18
        ? [
            [0, 0],
            [radius, 0],
            [-radius, 0],
            [0, radius],
            [0, -radius],
          ]
        : [[0, 0]];
    let floor = ground;
    for (const [dx, dz] of offsets) {
      this.movementRay.set(
        new THREE.Vector3(
          point[0] + dx,
          ceiling + 0.01,
          point[1] + dz,
        ).multiplyScalar(environmentScale),
        new THREE.Vector3(0, -1, 0),
      );
      const hit = this.movementRay
        .intersectObjects(this.blockers, false)
        .find((hit) => hit.face && hit.face.normal.y >= Math.SQRT1_2);
      if (hit) floor = Math.max(floor, hit.point.y / environmentScale);
    }
    return floor;
  }

  private jumpHeadroom(point: Point, height: number, rise: number) {
    this.movementRay.set(
      new THREE.Vector3(
        point[0],
        height + 1.65 / environmentScale,
        point[1],
      ).multiplyScalar(environmentScale),
      new THREE.Vector3(0, 1, 0),
    );
    this.movementRay.near = 0;
    this.movementRay.far = rise * environmentScale + 0.02;
    const hit = this.movementRay.intersectObjects(
      this.indoorReturn ? this.activeInterior.blockers : this.blockers,
      false,
    )[0];
    return (
      height +
      (hit ? Math.max(0, hit.distance / environmentScale - 0.02) : rise)
    );
  }

  private outdoorBlocked(
    point: Point,
    height = this.position.y,
    includePeople = true,
  ) {
    if (blocked(point, height)) return true;
    if (
      pevnostiHedges.some(
        (hedge) =>
          height + 1.6 / environmentScale >
            (hedge.ground ?? upperElevation(...hedge.point)) &&
          height <
            (hedge.ground ?? upperElevation(...hedge.point)) +
              hedge.height -
              0.02 &&
          propContains(hedge, point, 0.32 / environmentScale),
      )
    )
      return true;
    const playerRadius = 0.32 / environmentScale;
    for (let i = 0; i < this.treePoints.length; i++) {
      const tree = this.treePoints[i];
      const scale = 0.82 + (i % 11) * 0.048;
      const cut = this.felled.has(i);
      const radius = (cut ? 0.4 : 0.43 * scale) + playerRadius;
      const dx = point[0] - tree[0],
        dz = point[1] - tree[1];
      if (dx * dx + dz * dz >= radius * radius) continue;
      const floor = upperElevation(...tree);
      if (
        height < floor + (cut ? 0.5 : 9.5 * scale) &&
        height + 1.6 / environmentScale > floor
      )
        return true;
    }
    if (!includePeople) return false;
    const touchesPerson = (model: THREE.Group) =>
      Math.abs(height - model.position.y) < 1.9 / environmentScale &&
      Math.hypot(point[0] - model.position.x, point[1] - model.position.z) <
        (0.3 + 0.32) / environmentScale;
    return (
      touchesPerson(this.npc) ||
      this.visitors.some(
        ({ model, stroll }) => !stroll.departed && touchesPerson(model),
      )
    );
  }
  private activity():
    | Activity
    | (ActivityPrompt & { kind: 'adventure' | 'stand' })
    | undefined {
    if (!this.active || this.paused || this.flying) return undefined;
    if (this.seat) return { id: 'stand', label: 'Stand up', kind: 'stand' };
    const point: Point = [this.position.x, this.position.z];
    if (this.mode === 'adventure' && !this.indoorReturn) {
      const arrow = [...this.adventure.landedArrows.values()]
        .filter((arrow) => {
          const target: Point = [arrow.position[0], arrow.position[2]];
          if (
            Math.hypot(target[0] - point[0], target[1] - point[1]) >=
              1.8 / environmentScale ||
            Math.abs(arrow.position[1] - this.position.y) >=
              1.8 / environmentScale
          )
            return false;
          const from = this.position
            .clone()
            .add(new THREE.Vector3(0, 1 / environmentScale, 0));
          const to = new THREE.Vector3(...arrow.position).sub(from);
          this.raycaster.set(
            from.multiplyScalar(environmentScale),
            to.clone().normalize(),
          );
          this.raycaster.far = Math.max(
            0,
            to.length() * environmentScale - 0.12,
          );
          return (
            this.raycaster.intersectObjects(this.blockers, false).length === 0
          );
        })
        .sort(
          (a, b) =>
            this.position.distanceToSquared(new THREE.Vector3(...a.position)) -
            this.position.distanceToSquared(new THREE.Vector3(...b.position)),
        )[0];
      if (arrow)
        return {
          id: arrow.id,
          label: 'Recover arrow',
          kind: 'adventure' as const,
        };
    }
    if (!this.indoorReturn) {
      const church = nearbyActivity(
        this.outdoorActivities.filter(
          (activity) =>
            activity.kind === 'rotunda' || activity.kind === 'lawrence',
        ),
        point,
        this.position.y,
      );
      if (
        church &&
        Math.hypot(church.point[0] - point[0], church.point[1] - point[1]) < 2.1
      )
        return church;
    }
    if (this.mode === 'adventure' && !this.indoorReturn) {
      const activity = this.adventure.nearby(
        point,
        this.position.y,
        this.adventurePathClear,
      );
      if (activity) return { ...activity, kind: 'adventure' as const };
    }
    const activity = nearbyActivity(
      this.indoorReturn
        ? this.indoorReturn.kind === 'casemates'
          ? [
              {
                id: 'casemate-exit',
                kind: 'exit' as const,
                point: [0, 2.5] as Point,
                label: 'Leave the casemates',
              },
              {
                id: 'casemate-uphill-exit',
                kind: 'exit' as const,
                point: [38, -34.5] as Point,
                label: 'Exit uphill near Na Hradbách',
              },
              ...casemateNotes.map((note) => ({
                id: note.id,
                kind: 'casemate-note' as const,
                point: note.point,
                label: `${this.foundCasemateNotes.has(note.id) ? 'Re-read' : 'Record'}: ${note.title}`,
              })),
            ]
          : this.indoorReturn.kind === 'rotunda' ||
              this.indoorReturn.kind === 'lawrence'
            ? [
                {
                  id: 'chapel-exit',
                  kind: 'exit' as const,
                  point: chapelSites[this.indoorReturn.kind].exit,
                  label: 'Return to Vyšehrad',
                },
              ]
            : cathedralExits
        : this.outdoorActivities.filter(
            (item) => item.kind !== 'tree' || !this.felled.has(item.index),
          ),
      point,
      this.position.y,
      (p) => (this.indoorReturn ? this.indoorFloor(p) : standingElevation(p)),
      (target, candidate) => {
        const steps = Math.ceil(
          Math.hypot(target[0] - point[0], target[1] - point[1]) / 0.2,
        );
        for (let i = 1; i < steps; i++) {
          const sample: Point = [
            point[0] + ((target[0] - point[0]) * i) / steps,
            point[1] + ((target[1] - point[1]) * i) / steps,
          ];
          if (
            this.indoorReturn
              ? this.interiorBlocked(sample)
              : blocked(sample, this.position.y, {
                  ignoredSiteProp:
                    candidate.kind === 'fire' ? 'fire-bowl' : undefined,
                })
          )
            return false;
        }
        return true;
      },
    );
    if (activity?.kind === 'tree')
      return {
        ...activity,
        label: `Chop tree (${this.treeHits.get(activity.index) ?? 0}/3)`,
      };
    return activity;
  }

  interact(): ActivityResult {
    if (this.flying)
      return {
        kind: 'message',
        text: 'Land before interacting with the world.',
      };
    if (this.seat && this.active && !this.paused) {
      this.stand();
      return { kind: 'message', text: 'Back on your feet.' };
    }
    const activity = this.activity();
    if (!activity || !('kind' in activity))
      return {
        kind: 'message',
        text: this.indoorReturn
          ? this.indoorReturn.kind === 'casemates'
            ? 'Follow the lit corridors. F records a field note; return to the green entrance door to leave.'
            : 'Walk back to the cathedral doors and press F to leave.'
          : 'Walk closer to a bench, tree, fireplace, or the groundskeeper.',
      };
    switch (activity.kind) {
      case 'stand':
        this.stand();
        return { kind: 'message', text: 'Back on your feet.' };
      case 'adventure': {
        const text = this.adventure.interact(activity.id);
        const arrow = this.landedArrowModels.get(activity.id);
        if (arrow) {
          this.removeArrow(arrow);
          this.landedArrowModels.delete(activity.id);
        }
        if (activity.id.startsWith('checkpoint-')) {
          const id = activity.id.slice('checkpoint-'.length);
          if (!this.discovered.has(id)) {
            this.discovered.add(id);
            this.callbacks.onDiscover(id);
          }
        }
        return { kind: 'message', text };
      }
      case 'npc':
        this.clearInput();
        return { kind: 'npc' };
      case 'bench':
        if (!safeSeat(activity, this.position.y))
          return {
            kind: 'message',
            text: 'Approach this bench from the path at its own level.',
          };
        this.sit(activity.point, activity.angle);
        return {
          kind: 'message',
          text: 'Take a moment. F or a movement key to stand up.',
        };
      case 'fire': {
        this.regrowTrees();
        this.sit(this.fireSeat.point, this.fireSeat.angle);
        return {
          kind: 'rest',
          text: 'Resting by the fire. The grove has regrown. F or movement to stand.',
        };
      }
      case 'tree':
        return { kind: 'message', text: this.chopTree(activity.index) };
      case 'cathedral':
        this.enterCathedral();
        return {
          kind: 'message',
          text: 'Inside Saints Peter & Paul. An illustrative nave, not a surveyed interior. F at the doors to leave.',
        };
      case 'rotunda':
      case 'lawrence':
        this.enterInterior(activity.kind);
        return {
          kind: 'message',
          text:
            activity.kind === 'rotunda'
              ? 'Inside St. Martin’s Rotunda. An illustrative Romanesque interior; F at the door to leave.'
              : 'St. Lawrence’s archaeological remains. Low foundations and interpretive Romanesque floor tiles, not a reconstruction of a standing basilica. F at the entrance to leave.',
        };
      case 'casemates':
        this.enterInterior('casemates', activity.id === 'casemates-uphill');
        return {
          kind: 'message',
          text: 'Below the ramparts. Find three field notes and the Gorlice-inspired hall. This is an illustrative route, not a surveyed underground plan. F at the green entrance door to leave.',
        };
      case 'casemate-note': {
        const note = casemateNotes.find((note) => note.id === activity.id);
        if (!note) throw new Error('Unknown casemate field note.');
        if (!this.foundCasemateNotes.has(note.id)) {
          this.setCasemateNotes([...this.foundCasemateNotes, note.id]);
          this.callbacks.onCasemateNote(note.id);
        }
        return {
          kind: 'message',
          text: `${this.foundCasemateNotes.size === casemateNotes.length ? 'Underground field notes complete' : 'Underground field note'} (${this.foundCasemateNotes.size}/${casemateNotes.length}). ${note.text}`,
        };
      }
      case 'exit':
        if (this.indoorReturn?.kind === 'casemates') {
          const uphill = activity.id === 'casemate-uphill-exit';
          this.leaveCathedral();
          const point = uphill
            ? casemateUphillExit.point
            : casemateLocal(0, 0.65);
          this.position.set(
            point[0],
            uphill ? standingElevation(point) : casemateDoor.floor,
            point[1],
          );
          const direction = uphill
            ? casemateUphillExit.axis
            : casemateDoor.normal;
          this.yaw = Math.atan2(direction[0], -direction[1]);
          this.camera.position
            .copy(this.position)
            .multiplyScalar(environmentScale)
            .add(new THREE.Vector3(0, 4, 6));
          return {
            kind: 'message',
            text: uphill
              ? 'Back above ground near Na Hradbách. This connecting route is illustrative.'
              : 'Back at the rock-cut casemate entrance.',
          };
        }
        this.leaveCathedral();
        return { kind: 'message', text: 'Back in the fortress grounds.' };
    }
  }

  private sit(point: Point, angle: number) {
    this.seat = { point, angle, previous: this.position.clone() };
    const bench = streetFurniture.find(
      (site) =>
        site.bench && site.point[0] === point[0] && site.point[1] === point[1],
    );
    this.position.set(
      point[0],
      bench?.ground ?? upperElevation(...point),
      point[1],
    );
    this.avatar.rotation.y = angle;
    this.yaw = Math.PI - angle;
    this.jumpVelocity = 0;
    this.clearInput();
  }
  stand() {
    if (!this.seat) return;
    this.position.copy(this.seat.previous);
    this.seat = null;
    this.jumpVelocity = 0;
    this.clearInput();
  }
  travelActivity(id: string) {
    if (this.mode === 'adventure')
      throw new Error(
        'In Adventure mode, explore on foot or travel to a raised banner.',
      );
    const activity =
      id === 'bench'
        ? benches.find((bench) =>
            safeSeat(bench, upperElevation(...bench.point)),
          )
        : id === 'grove'
          ? this.outdoorActivities.find(
              (item) => item.kind === 'tree' && !this.felled.has(item.index),
            )
          : this.outdoorActivities.find((item) => item.id === id);
    if (!activity) throw new Error('This activity is unavailable.');
    const target =
      activity.kind === 'casemates'
        ? activity.id === 'casemates'
          ? casemateLocal(0, 1.8)
          : activity.point
        : activity.kind === 'bench'
          ? benchApproach(activity)
          : ([
              activity.point[0] + (activity.kind === 'tree' ? 1.8 : 1.6),
              activity.point[1] + 0.6,
            ] as Point);
    const destination = safePosition(target);
    if (this.indoorReturn) this.leaveCathedral();
    this.seat = null;
    this.flying = false;
    this.position.set(
      destination[0],
      standingElevation(destination),
      destination[1],
    );
    this.yaw = Math.atan2(
      activity.point[0] - destination[0],
      destination[1] - activity.point[1],
    );
    this.jumpVelocity = 0;
    this.clearInput();
    this.camera.position
      .copy(this.position)
      .multiplyScalar(environmentScale)
      .add(new THREE.Vector3(0, 8, 12));
  }

  private enterCathedral() {
    this.enterInterior('cathedral');
  }
  private get activeInterior() {
    return this.indoorReturn?.kind === 'casemates'
      ? this.casemates
      : this.indoorReturn?.kind === 'rotunda' ||
          this.indoorReturn?.kind === 'lawrence'
        ? this.chapels[this.indoorReturn.kind]
        : this.interior;
  }
  private interiorBlocked(point: Point) {
    return this.indoorReturn?.kind === 'casemates'
      ? casemateBlocked(point)
      : this.indoorReturn?.kind === 'rotunda' ||
          this.indoorReturn?.kind === 'lawrence'
        ? chapelBlocked(this.indoorReturn.kind, point)
        : indoorBlocked(point);
  }
  private indoorFloor(point: Point) {
    return this.indoorReturn?.kind === 'casemates' ? casemateFloor(point) : 0;
  }
  private enterInterior(
    kind: 'cathedral' | 'casemates' | ChapelKind,
    uphill = false,
  ) {
    this.indoorReturn = {
      kind,
      position: this.position.clone(),
      yaw: this.yaw,
      zoom: this.zoom,
      pitch: this.pitch,
    };
    this.clearStones();
    for (const child of this.scene.children)
      if (
        child !== this.avatar &&
        child !== this.activeInterior.group &&
        !(child instanceof THREE.Light)
      ) {
        this.exteriorVisibility.set(child, child.visible);
        child.visible = false;
      }
    this.activeInterior.group.visible = true;
    this.applyDaylight();
    this.position.set(
      uphill ? 38 : 0,
      uphill ? casemateFloor([38, -34.5]) : 0,
      uphill
        ? -34.5
        : kind === 'casemates'
          ? 2
          : kind === 'rotunda' || kind === 'lawrence'
            ? chapelSites[kind].spawn[1]
            : 13,
    );
    this.yaw = uphill ? -Math.PI / 2 : 0;
    this.zoom = 5;
    this.pitch = 0.18;
    this.jumpVelocity = 0;
    this.clearInput();
    this.camera.position
      .copy(this.position)
      .multiplyScalar(environmentScale)
      .add(new THREE.Vector3(0, 2.5, 2));
  }
  private leaveCathedral() {
    const previous = this.indoorReturn;
    if (!previous) return;
    this.activeInterior.group.visible = false;
    for (const [object, visible] of this.exteriorVisibility)
      object.visible = visible;
    this.exteriorVisibility.clear();
    this.indoorReturn = null;
    this.applyDaylight();
    this.position.copy(previous.position);
    this.yaw = previous.yaw;
    this.zoom = previous.zoom;
    this.pitch = previous.pitch;
    this.jumpVelocity = 0;
    this.clearInput();
    this.camera.position
      .copy(this.position)
      .multiplyScalar(environmentScale)
      .add(new THREE.Vector3(0, 8, 12));
  }

  private chopTree(index: number) {
    const meshes = this.treeMeshes;
    if (!meshes) throw new Error('Tree geometry is unavailable.');
    this.chopTime = 0.5;
    const hits = (this.treeHits.get(index) ?? 0) + 1;
    this.treeHits.set(index, hits);
    if (hits < 3)
      return `Chop ${hits}/3. Two feet on the ground, one tree at a time.`;
    const matrices: THREE.Matrix4[] = [];
    const trunk = new THREE.Matrix4();
    meshes.trunk.getMatrixAt(index, trunk);
    matrices.push(trunk.clone());
    const [x, z] = this.treePoints[index],
      floor = upperElevation(x, z);
    meshes.trunk.setMatrixAt(index, new THREE.Matrix4().makeScale(0, 0, 0));
    const crowns = index % 8 === 0 ? meshes.evergreens : meshes.leaves;
    for (let i = 0; i < 4; i++) {
      const crownIndex =
        index % 8 === 0 ? Math.floor(index / 8) * 4 + i : index * 4 + i;
      const matrix = new THREE.Matrix4();
      crowns.getMatrixAt(crownIndex, matrix);
      matrices.push(matrix.clone());
      crowns.setMatrixAt(crownIndex, new THREE.Matrix4().makeScale(0, 0, 0));
    }
    meshes.trunk.instanceMatrix.needsUpdate =
      crowns.instanceMatrix.needsUpdate = true;
    const logs = new THREE.Group();
    const stump = new THREE.Mesh(
      new THREE.CylinderGeometry(0.3, 0.4, 0.5, 10),
      this.surfaceMaterials.get('bark', '#827765'),
    );
    stump.name = 'Cut tree stump';
    stump.position.set(x, floor + 0.25, z);
    stump.castShadow = true;
    logs.add(stump);
    for (let i = 0; i < 3; i++) {
      const log = new THREE.Mesh(
        new THREE.CylinderGeometry(0.16, 0.2, 1.1, 10),
        this.surfaceMaterials.get('bark', '#827765'),
      );
      log.rotation.z = Math.PI / 2;
      log.rotation.y = i * 0.6;
      log.position.set(x + (i - 1) * 0.6, floor + 0.2, z + 0.9);
      log.castShadow = true;
      logs.add(log);
    }
    this.scene.add(logs);
    this.felled.set(index, { matrices, logs });
    this.wood += 3;
    return 'Tree cut. +3 wood. Rest at the fireplace to regrow the grove.';
  }
  private regrowTrees() {
    const meshes = this.treeMeshes;
    if (!meshes) throw new Error('Tree geometry is unavailable.');
    for (const [index, { matrices, logs }] of this.felled) {
      meshes.trunk.setMatrixAt(index, matrices[0]);
      const crowns = index % 8 === 0 ? meshes.evergreens : meshes.leaves;
      for (let i = 0; i < 4; i++)
        crowns.setMatrixAt(
          index % 8 === 0 ? Math.floor(index / 8) * 4 + i : index * 4 + i,
          matrices[i + 1],
        );
      crowns.instanceMatrix.needsUpdate = true;
      logs.removeFromParent();
      logs.traverse((object) => {
        if (object instanceof THREE.Mesh) object.geometry.dispose();
      });
    }
    meshes.trunk.instanceMatrix.needsUpdate = true;
    this.felled.clear();
    this.treeHits.clear();
  }

  throwStone() {
    if (this.mode === 'adventure') return this.attack();
    if (
      !this.active ||
      this.paused ||
      this.flying ||
      this.seat ||
      this.indoorReturn
    )
      return 'Stand outdoors on the ground to throw a stone.';
    if (this.clock - this.lastThrow < 0.4)
      return 'Give the last stone a moment.';
    this.lastThrow = this.clock;
    const mesh = new THREE.Mesh(
      this.stoneGeometry,
      this.surfaceMaterials.get('stone', '#a8aca0'),
    );
    mesh.position
      .copy(this.position)
      .add(
        new THREE.Vector3(
          (Math.sin(this.yaw) * 0.6) / environmentScale,
          1.35 / environmentScale,
          (-Math.cos(this.yaw) * 0.6) / environmentScale,
        ),
      );
    mesh.castShadow = true;
    if (this.stones.length >= 8) {
      const oldest = this.stones.shift();
      oldest?.mesh.removeFromParent();
    }
    this.scene.add(mesh);
    this.stones.push({
      mesh,
      velocity: new THREE.Vector3(
        (Math.sin(this.yaw) * 13) / environmentScale,
        6 / environmentScale,
        (-Math.cos(this.yaw) * 13) / environmentScale,
      ),
      age: 0,
      bounces: 0,
    });
    return 'Stone tossed.';
  }
  private clearStones() {
    for (const stone of this.stones) stone.mesh.removeFromParent();
    this.stones = [];
  }
  private updateStones(delta: number) {
    for (const stone of this.stones) {
      stone.age += delta;
      if (stone.velocity.lengthSq() > 0) {
        stone.velocity.y -= (16 * delta) / environmentScale;
        const offset = stone.velocity.clone().multiplyScalar(delta),
          length = offset.length();
        if (length) {
          this.raycaster.set(
            stone.mesh.position.clone().multiplyScalar(environmentScale),
            offset.normalize(),
          );
          this.raycaster.far = (length + 0.13) * environmentScale;
          const hit = this.raycaster.intersectObjects(this.blockers, false)[0];
          if (hit?.face) {
            const normal = hit.face.normal
              .clone()
              .transformDirection(hit.object.matrixWorld);
            stone.mesh.position
              .copy(hit.point)
              .divideScalar(environmentScale)
              .addScaledVector(normal, 0.16);
            stone.velocity.reflect(normal).multiplyScalar(0.35);
            stone.bounces++;
            if (normal.y > 0.65 && stone.bounces >= 2)
              stone.velocity.set(0, 0, 0);
          } else stone.mesh.position.addScaledVector(stone.velocity, delta);
        }
        const ground =
          elevation(stone.mesh.position.x, stone.mesh.position.z) + 0.14;
        if (stone.mesh.position.y < ground) {
          stone.mesh.position.y = ground;
          stone.velocity.y = Math.abs(stone.velocity.y) * 0.3;
          stone.velocity.x *= 0.5;
          stone.velocity.z *= 0.5;
          stone.bounces++;
          if (stone.bounces >= 2) stone.velocity.set(0, 0, 0);
        }
      }
    }
    this.stones = this.stones.filter((stone) => {
      if (stone.age < 9) return true;
      stone.mesh.removeFromParent();
      return false;
    });
  }

  private adventurePathClear = (a: Point, b: Point) => {
    const height = standingElevation(a);
    const steps = Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 0.15);
    for (let i = 1; i < steps; i++) {
      const point: Point = [
        a[0] + ((b[0] - a[0]) * i) / steps,
        a[1] + ((b[1] - a[1]) * i) / steps,
      ];
      if (this.outdoorBlocked(point, height, false)) return false;
    }
    return true;
  };

  attack() {
    if (
      this.mode !== 'adventure' ||
      !this.active ||
      this.paused ||
      this.indoorReturn ||
      this.seat
    )
      return 'Stand outdoors to use your weapon.';
    if (this.adventure.weapon === 'bow') return this.shoot();
    this.avatar.rotation.y = Math.PI - this.yaw;
    return this.adventure.attack(
      [this.position.x, this.position.z],
      this.position.y,
      this.yaw,
      environmentScale,
      this.adventurePathClear,
    );
  }

  restartRaids() {
    if (this.mode !== 'adventure' || !this.active || this.paused)
      return 'Enter Adventure to start another raid.';
    return this.adventure.restartRaids();
  }

  switchWeapon() {
    if (this.mode !== 'adventure' || !this.active || this.paused)
      return 'Enter Adventure to change weapons.';
    return this.adventure.switchWeapon();
  }

  shoot() {
    if (
      this.mode !== 'adventure' ||
      !this.active ||
      this.paused ||
      this.indoorReturn ||
      this.seat
    )
      return 'Stand outdoors to use your bow.';
    this.adventure.aiming =
      this.adventure.weapon === 'bow' &&
      (this.controller.aim || this.keys.has('KeyZ'));
    const result = this.adventure.looseArrow();
    if (result !== 'Arrow released.') return result;
    this.avatar.rotation.y = Math.PI - this.yaw;
    this.avatar.updateWorldMatrix(true, true);
    this.raycaster.setFromCamera(new THREE.Vector2(0, 0), this.camera);
    this.raycaster.far = 100;
    const hit = this.raycaster.intersectObjects(this.blockers, false)[0];
    const aimRay = this.raycaster.ray.clone();
    aimRay.origin.divideScalar(environmentScale);
    let target = hit
      ? hit.point.clone().divideScalar(environmentScale)
      : aimRay.at(100 / environmentScale, new THREE.Vector3());
    let nearest = aimRay.origin.distanceTo(target);
    for (const enemy of this.adventure.enemies) {
      if (this.adventure.defeated.has(enemy.id)) continue;
      const impact = aimRay.intersectSphere(
        this.enemyHitSphere(enemy.point),
        new THREE.Vector3(),
      );
      if (impact && aimRay.origin.distanceTo(impact) < nearest) {
        nearest = aimRay.origin.distanceTo(impact);
        target = impact;
      }
    }
    const bow = this.heldWeapons.bow;
    if (!bow) throw new Error('Missing equipped bow model.');
    const origin = bow
      .localToWorld(new THREE.Vector3(0, 0.5, 0))
      .divideScalar(environmentScale);
    if (
      target.clone().sub(origin).dot(aimRay.direction) <
      0.25 / environmentScale
    )
      target = origin
        .clone()
        .addScaledVector(aimRay.direction, 100 / environmentScale);
    const flight = launchArrow(
      origin,
      target,
      60 / environmentScale,
      9.8 / environmentScale,
    );
    const model = makeArrow(this.surfaceMaterials);
    model.name = 'Flying arrow';
    this.placeArrow(model, flight.position, flight.velocity);
    this.adventureModels.group.add(model);
    this.arrows.push({ model, ...flight });
    return result;
  }

  private placeArrow(
    model: THREE.Group,
    tip: THREE.Vector3,
    velocity: THREE.Vector3,
  ) {
    const direction = velocity.clone().normalize();
    model.scale.setScalar(1 / environmentScale);
    model.position
      .copy(tip)
      .addScaledVector(direction, -0.595 / environmentScale);
    model.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), direction);
  }

  private removeArrow(model: THREE.Group) {
    model.removeFromParent();
    model.traverse((object) => {
      if (object instanceof THREE.Mesh) object.geometry.dispose();
    });
  }

  private enemyHitSphere(point: Point) {
    return new THREE.Sphere(
      new THREE.Vector3(
        point[0],
        standingElevation(point) + 0.75 / environmentScale,
        point[1],
      ),
      0.55 / environmentScale,
    );
  }

  private updateArrows(delta: number) {
    this.arrows = this.arrows.filter((arrow) => {
      const impact = advanceArrow(
        arrow,
        delta,
        9.8 / environmentScale,
        (from, next) => {
          const distance = from.distanceTo(next);
          if (distance < 1e-8) return null;
          const direction = next.clone().sub(from).normalize();
          this.raycaster.set(
            from.clone().multiplyScalar(environmentScale),
            direction,
          );
          this.raycaster.far = distance * environmentScale;
          const wall = this.raycaster.intersectObjects(this.blockers, false)[0];
          let nearest = wall ? wall.distance / environmentScale : distance + 1;
          let hit: ArrowImpact | null = wall
            ? { point: wall.point.clone().divideScalar(environmentScale) }
            : null;
          const ray = new THREE.Ray(from, direction);
          for (const enemy of this.adventure.enemies) {
            if (this.adventure.defeated.has(enemy.id)) continue;
            const point = ray.intersectSphere(
              this.enemyHitSphere(enemy.point),
              new THREE.Vector3(),
            );
            const hitDistance = point ? from.distanceTo(point) : Infinity;
            if (point && hitDistance <= distance && hitDistance < nearest) {
              nearest = hitDistance;
              hit = { point, enemy: enemy.id };
            }
          }
          return hit;
        },
      );
      if (impact?.enemy) {
        const direction = arrow.velocity.clone().normalize();
        this.adventure.hitEnemy(impact.enemy, 3, [direction.x, direction.z]);
        this.removeArrow(arrow.model);
        return false;
      }
      this.placeArrow(arrow.model, arrow.position, arrow.velocity);
      if (impact) {
        const direction = arrow.velocity.clone().normalize();
        const landed: LandedArrow = {
          id: `landed-arrow-${crypto.randomUUID()}`,
          position: arrow.position.toArray(),
          direction: direction.toArray(),
        };
        arrow.model.name = 'Recoverable arrow';
        this.adventure.landedArrows.set(landed.id, landed);
        this.landedArrowModels.set(landed.id, arrow.model);
        return false;
      }
      return true;
    });
  }

  private updateAdventure(delta: number) {
    this.updateArrows(delta);
    const respawn = this.adventure.update(
      delta,
      [this.position.x, this.position.z],
      this.position.y,
      environmentScale,
      (from, to) =>
        !this.outdoorBlocked(to, standingElevation(from)) &&
        Math.abs(
          standingElevation(to, standingElevation(from)) -
            standingElevation(from),
        ) <
          0.28 / environmentScale,
      this.adventurePathClear,
      this.visitors
        .filter(({ stroll }) => !stroll.departed)
        .map(({ model, stroll }) => ({
          id: `visitor-${model.uuid}`,
          point: stroll.point,
        })),
    );
    if (respawn) {
      this.seat = null;
      this.position.set(respawn[0], standingElevation(respawn), respawn[1]);
      this.jumpVelocity = 0;
      this.clearInput();
      this.callbacks.onMessage?.(
        'Your banner calls you back. Health restored; your discoveries and equipment are safe.',
      );
    }
    this.adventureModels.enemies.forEach((model, index) => {
      const enemy = this.adventure.enemies[index];
      const dead = this.adventure.defeated.has(enemy.id);
      model.visible = !dead || enemy.defeatTime > 0;
      const recoil =
        (Math.sin((enemy.hurtTime / 0.4) * Math.PI) * 0.16) / environmentScale;
      model.position.set(
        enemy.point[0] + enemy.impact[0] * recoil,
        standingElevation(enemy.point),
        enemy.point[1] + enemy.impact[1] * recoil,
      );
      model.rotation.y = Math.atan2(
        enemy.target.point[0] - enemy.point[0],
        enemy.target.point[1] - enemy.point[1],
      );
      model.rotation.x =
        enemy.windup > 0
          ? -0.35 * (1 - enemy.windup / 0.6)
          : enemy.cooldown > 1.1
            ? Math.sin((1.4 - enemy.cooldown) * Math.PI * 6) * 0.25
            : 0;
      model.rotation.z = dead
        ? (1 - enemy.defeatTime / 0.65) * 1.8
        : Math.sin(enemy.hurtTime * 24) * enemy.hurtTime;
      const effects = this.adventureModels.enemyEffects[index];
      effects.impact.visible = enemy.hurtTime > 0;
      effects.impact.rotation.y = this.clock * 15;
      effects.impact.scale.setScalar(
        0.6 + Math.sin((enemy.hurtTime / 0.4) * Math.PI),
      );
      effects.health.visible = !dead && enemy.health < enemyMaxHealth;
      model
        .getWorldQuaternion(effects.health.quaternion)
        .invert()
        .multiply(this.camera.quaternion);
      effects.fill.scale.x = enemy.health / enemyMaxHealth;
      effects.arms.forEach((arm, side) => {
        arm.rotation.x =
          enemy.windup > 0
            ? -1.7 * (1 - enemy.windup / 0.6)
            : enemy.cooldown > 1.1
              ? 1.3
              : Math.sin(this.clock * 5 + side * Math.PI) * 0.15;
      });
      model.scale.setScalar(
        ((1 + Math.sin(this.clock * 4 + index) * 0.035) *
          (dead ? Math.max(0.01, enemy.defeatTime / 0.65) : 1)) /
          environmentScale,
      );
    });
    this.adventureModels.pickups.forEach((model, index) => {
      model.visible = this.adventure.canPickup(weaponPickups[index].id);
    });
    this.adventureModels.arrows.forEach((model, index) => {
      model.visible = !this.adventure.collectedArrows.has(
        arrowPickups[index].id,
      );
    });
    this.adventureModels.flags.forEach(({ flag }, index) => {
      flag.material.color.set(
        this.adventure.explored.has(landmarks[index].id)
          ? '#467e9e'
          : '#b5ada0',
      );
    });
    this.adventureModels.houses.forEach(({ ring, health }, index) => {
      const house = this.adventure.houses[index];
      const defended = this.adventure.enemies
        .filter((enemy) => enemy.houseId === house.id)
        .every((enemy) => this.adventure.defeated.has(enemy.id));
      const color = defended
        ? '#79ac91'
        : house.hitTime > 0 || house.integrity === 0
          ? '#d8755d'
          : '#d3a15e';
      ring.material.color.set(color);
      health.material.color.set(color);
      health.scale.x = house.integrity / 12;
      ring.scale.setScalar(
        house.hitTime > 0 ? 1 + Math.sin(this.clock * 7) * 0.08 : 1,
      );
    });
  }

  private resize() {
    const { width, height } = this.host.getBoundingClientRect();
    this.renderer.setSize(width, height);
    this.camera.aspect = width / Math.max(height, 1);
    this.camera.updateProjectionMatrix();
  }
  private clearInput = () => {
    this.keys.clear();
    this.drag = null;
    this.controller = idleController;
  };
  private keyDown = (event: KeyboardEvent) => {
    if (
      !this.active ||
      this.paused ||
      event.target instanceof HTMLInputElement ||
      event.target instanceof HTMLTextAreaElement ||
      (event.target instanceof HTMLElement && event.target.isContentEditable) ||
      (event.target instanceof HTMLButtonElement && event.code === 'Space')
    )
      return;
    const allowed = [
      'KeyW',
      'KeyA',
      'KeyS',
      'KeyD',
      'ArrowUp',
      'ArrowDown',
      'ArrowLeft',
      'ArrowRight',
      'Space',
      'ShiftLeft',
      'ShiftRight',
      'KeyQ',
      'KeyE',
      'KeyZ',
    ];
    if (allowed.includes(event.code)) {
      event.preventDefault();
      if (
        this.seat &&
        [
          'KeyW',
          'KeyA',
          'KeyS',
          'KeyD',
          'ArrowUp',
          'ArrowDown',
          'ArrowLeft',
          'ArrowRight',
          'Space',
        ].includes(event.code)
      )
        this.stand();
      this.keys.add(event.code);
    }
  };
  private keyUp = (event: KeyboardEvent) => {
    this.keys.delete(event.code);
  };
  private pointerDown = (event: PointerEvent) => {
    if (!this.active || this.paused) return;
    this.host.setPointerCapture(event.pointerId);
    this.drag = { x: event.clientX, y: event.clientY };
  };
  private pointerMove = (event: PointerEvent) => {
    if (!this.drag) return;
    this.yaw -= (event.clientX - this.drag.x) * 0.005;
    this.pitch = THREE.MathUtils.clamp(
      this.pitch + (event.clientY - this.drag.y) * 0.003,
      0.05,
      1.2,
    );
    this.drag = { x: event.clientX, y: event.clientY };
  };
  private pointerUp = () => {
    this.drag = null;
  };
  private wheel = (event: WheelEvent) => {
    if (!this.active || this.paused) return;
    event.preventDefault();
    this.zoom = THREE.MathUtils.clamp(this.zoom + event.deltaY * 0.03, 5, 90);
  };
  private contextLost = (event: Event) => {
    event.preventDefault();
    cancelAnimationFrame(this.frame);
    this.callbacks.onError(
      'The browser lost its 3D graphics context. Reload to return to the world.',
    );
  };

  private animate = (time: number) => {
    if (this.disposed) return;
    const elapsed = (time - (this.lastTime || time)) / 1000;
    const delta = Math.min(elapsed, 0.1);
    this.lastTime = time;
    this.clock += delta;
    if (this.active && !this.paused && document.visibilityState === 'visible') {
      this.daylight.advance(delta);
      if (this.daylight.mode === 'cycle') this.applyDaylight();
    }
    if (!this.paused) this.updateStones(delta);
    if (this.active && !this.paused && !this.indoorReturn)
      for (const { model, warning, stroll, pace } of this.visitors) {
        const state =
          this.mode === 'adventure'
            ? this.adventure.civilians.get(`visitor-${model.uuid}`)
            : undefined;
        warning.visible = Boolean(state?.frightened || state?.recovering);
        model.scale.y = (state?.recovering ? 0.65 : 1) / environmentScale;
        model.rotation.z = state?.recovering ? 0.25 : 0;
        if (
          !this.flying &&
          Math.abs(this.position.y - model.position.y) < 1.5 &&
          Math.hypot(
            this.position.x - model.position.x,
            this.position.z - model.position.z,
          ) < 0.65
        )
          continue;
        if (!state?.recovering)
          stroll.update(
            delta,
            (pace * (state?.frightened ? 2.5 : 1)) / environmentScale,
          );
        model.visible = !stroll.departed;
        if (stroll.departed) continue;
        model.position.set(
          stroll.point[0],
          standingElevation(stroll.point),
          stroll.point[1],
        );
        model.rotation.y = stroll.heading;
        for (const limb of model.children)
          if (limb.name.startsWith('leg-') || limb.name.startsWith('arm-')) {
            const phase = limb.name.endsWith('--1') ? Math.PI : 0;
            limb.rotation.x =
              Math.sin(stroll.distance * environmentScale * 5 + phase) *
              (limb.name.startsWith('leg-') ? 0.4 : -0.25);
          }
      }
    this.chopTime = Math.max(0, this.chopTime - delta);
    if (this.axe)
      this.axe.visible =
        this.chopTime > 0 && !this.seat && this.mode === 'chill';
    if (!this.indoorReturn && this.position.distanceTo(this.npc.position) < 12)
      this.npc.rotation.y = Math.atan2(
        this.position.x - this.npc.position.x,
        this.position.z - this.npc.position.z,
      );
    this.site.fire.scale.y =
      1 + Math.sin(this.clock * 9) * 0.1 + Math.sin(this.clock * 17) * 0.06;
    if (elapsed > 0) this.fps = this.fps * 0.95 + (1 / elapsed) * 0.05;
    let moving = false;
    let flightForward = 0;
    let flightRight = 0;
    if (this.active && !this.paused) {
      this.adventure.aiming =
        this.mode === 'adventure' &&
        !this.indoorReturn &&
        this.adventure.weapon === 'bow' &&
        (this.controller.aim || this.keys.has('KeyZ'));
      this.yaw += this.controller.look[0] * delta * 2.2;
      this.pitch = THREE.MathUtils.clamp(
        this.pitch + this.controller.look[1] * delta * 1.25,
        0.05,
        1.2,
      );
      if (!(this.mode === 'adventure' && this.adventure.weapon === 'bow'))
        this.zoom = THREE.MathUtils.clamp(
          this.zoom + this.controller.zoom * delta * 18,
          5,
          90,
        );
      if (
        this.seat &&
        (Math.hypot(...this.controller.move) > 0 ||
          this.controller.pressed.has('jump'))
      )
        this.stand();
    }
    if (this.active && !this.paused && !this.seat) {
      const held = (...keys: string[]) =>
        keys.some((key) => this.keys.has(key));
      let forward =
        Number(held('KeyW', 'ArrowUp')) -
        Number(held('KeyS', 'ArrowDown')) -
        this.controller.move[1];
      let right =
        Number(held('KeyD', 'ArrowRight')) -
        Number(held('KeyA', 'ArrowLeft')) +
        this.controller.move[0];
      const length = Math.hypot(forward, right);
      if (length > 1) {
        forward /= length;
        right /= length;
      }
      if (this.flying) {
        flightForward = forward;
        flightRight = right;
      }
      const speed =
        ((this.flying ? 32 : 7) *
          (held('ShiftLeft', 'ShiftRight') || this.controller.sprint
            ? 2.1
            : 1)) /
        environmentScale;
      const dx =
        (Math.sin(this.yaw) * forward + Math.cos(this.yaw) * right) *
        speed *
        delta;
      const dz =
        (-Math.cos(this.yaw) * forward + Math.sin(this.yaw) * right) *
        speed *
        delta;
      const oldX = this.position.x,
        oldZ = this.position.z;
      if (this.flying) {
        this.position.x = THREE.MathUtils.clamp(
          oldX + dx,
          bounds.minX + 5,
          bounds.maxX - 5,
        );
        this.position.z = THREE.MathUtils.clamp(
          oldZ + dz,
          bounds.minZ + 5,
          bounds.maxZ - 5,
        );
        this.position.y = THREE.MathUtils.clamp(
          this.position.y +
            (Number(held('Space', 'KeyE')) -
              Number(held('KeyQ')) +
              this.controller.lift) *
              speed *
              delta,
          upperElevation(this.position.x, this.position.z) +
            3 / environmentScale,
          220 / environmentScale,
        );
      } else {
        const jump = held('Space') || this.controller.pressed.has('jump');
        if (jump) this.keys.delete('Space');
        const next = stepWalker(
          {
            point: [oldX, oldZ],
            height: this.position.y,
            velocity: this.jumpVelocity,
          },
          [dx, dz],
          delta,
          jump,
          {
            terrain: (point) =>
              this.indoorReturn
                ? this.indoorFloor(point)
                : standingElevation(point, this.position.y),
            support: (point, ceiling) => this.support(point, ceiling),
            blocked: (point, height) =>
              this.indoorReturn
                ? this.interiorBlocked(point)
                : this.outdoorBlocked(point, height),
            steps: (point) =>
              !this.indoorReturn &&
              (slavinPrecinct(point) ||
                projectRoute(point, casemateUphillExit.stairs.points).distance <
                  1 ||
                stairFlights.some(
                  (flight) =>
                    projectRoute(point, flight.feature.points).distance < 1.35,
                )),
            headroom: (point, height, rise) =>
              this.jumpHeadroom(point, height, rise),
          },
          environmentScale,
        );
        this.position.set(next.point[0], next.height, next.point[1]);
        this.jumpVelocity = next.velocity;
      }
      const moved = Math.hypot(this.position.x - oldX, this.position.z - oldZ);
      this.distance += moved * environmentScale;
      moving = moved > 0.001 && !this.flying;
      if (length) this.avatar.rotation.y = Math.atan2(dx, dz);
      if (
        this.mode === 'chill' &&
        !this.indoorReturn &&
        this.position.y - elevation(this.position.x, this.position.z) < 18
      )
        for (const landmark of discoveredNear([
          this.position.x,
          this.position.z,
        ]))
          if (!this.discovered.has(landmark.id)) {
            this.discovered.add(landmark.id);
            this.callbacks.onDiscover(landmark.id);
          }
    }
    if (this.mode === 'adventure') {
      if (
        this.active &&
        !this.paused &&
        !this.indoorReturn &&
        document.visibilityState === 'visible'
      )
        this.updateAdventure(delta);
      for (const kind of ['stick', 'sword', 'bow'] as const) {
        const weapon = this.heldWeapons[kind];
        if (weapon)
          weapon.visible =
            this.adventure.weapon === kind && this.adventure.eatTime === 0;
      }
    }
    this.slash.visible =
      this.mode === 'adventure' && this.adventure.attackTime > 0;
    this.slash.rotation.y = (0.45 - this.adventure.attackTime) * 8;
    this.slash.scale.setScalar(
      Math.max(0.01, Math.sin((this.adventure.attackTime / 0.45) * Math.PI)),
    );
    this.playerImpact.visible =
      this.mode === 'adventure' && this.adventure.hurtTime > 0;
    this.playerImpact.rotation.y = this.clock * 15;
    if (this.heldFood)
      this.heldFood.visible =
        this.mode === 'adventure' && this.adventure.eatTime > 0;
    if (this.flying) {
      this.avatar.rotation.y = this.yaw + Math.PI;
      this.drone.update(delta, flightForward, flightRight);
    }
    this.walker.visible = !this.flying;
    this.drone.group.visible = this.flying;
    this.avatar.position.copy(this.position);
    if (this.mode === 'adventure') {
      const recoil =
        (Math.sin((this.adventure.hurtTime / 0.4) * Math.PI) * 0.18) /
        environmentScale;
      this.avatar.position.x += this.adventure.hurtDirection[0] * recoil;
      this.avatar.position.z += this.adventure.hurtDirection[1] * recoil;
      if (
        this.adventure.aiming ||
        this.adventure.attackTime > 0 ||
        this.adventure.shotTime > 0
      )
        this.avatar.rotation.y = Math.PI - this.yaw;
    }
    this.avatar.position.y += this.seat
      ? 0.45 - (0.73 * avatarScale) / environmentScale
      : 0.075;
    this.avatar.position.y += this.flying
      ? (Math.sin(this.clock * 3) * 0.15) / environmentScale
      : 0;
    this.avatar.visible = this.active;
    this.walkBlend = THREE.MathUtils.lerp(
      this.walkBlend,
      moving ? 0.48 : 0,
      1 - Math.exp(-12 * delta),
    );
    for (const { pivot, phase, arm } of this.limbs)
      pivot.rotation.x = this.seat
        ? arm
          ? -0.3
          : -Math.PI / 2
        : arm && this.mode === 'adventure' && this.adventure.eatTime > 0
          ? -2.2 + Math.sin(this.adventure.eatTime * 14) * 0.12
          : arm && this.mode === 'adventure' && this.adventure.aiming
            ? -Math.PI / 2 +
              this.pitch -
              0.45 +
              Math.sin((this.adventure.shotTime / 0.65) * Math.PI) * 0.18
            : arm && this.mode === 'adventure' && this.adventure.shotTime > 0
              ? -1.5 + this.adventure.shotTime * 0.4
              : arm &&
                  this.mode === 'adventure' &&
                  this.adventure.attackTime > 0
                ? -Math.sin(
                    ((0.45 - this.adventure.attackTime) / 0.45) * Math.PI,
                  ) * 1.8
                : arm && this.chopTime
                  ? -Math.sin((0.5 - this.chopTime) * Math.PI * 2) * 1.6
                  : Math.sin(this.distance * 4 + phase) * this.walkBlend;
    if (this.contactShadow) {
      this.contactShadow.position.set(
        this.position.x,
        this.support([this.position.x, this.position.z]) + 0.065,
        this.position.z,
      );
      this.contactShadow.material.opacity = Math.max(
        0,
        1 -
          ((this.position.y -
            this.support([this.position.x, this.position.z])) *
            environmentScale) /
            8,
      );
      this.contactShadow.visible = this.active;
    }
    if (this.active) {
      const radius = Math.max(
        this.flying ? 150 : 65,
        Math.min(180, this.zoom * 2),
      );
      if (this.sunlight.shadow.camera.right !== radius * environmentScale) {
        Object.assign(this.sunlight.shadow.camera, {
          left: -radius * environmentScale,
          right: radius * environmentScale,
          top: radius * environmentScale,
          bottom: -radius * environmentScale,
        });
        this.sunlight.shadow.camera.updateProjectionMatrix();
      }
      shadowTarget(
        this.position,
        this.sunDirection,
        radius,
        this.sunlight.shadow.mapSize.x,
        this.sunlight.target.position,
      );
      this.sunlight.position
        .copy(this.sunlight.target.position)
        .addScaledVector(this.sunDirection, 450);
    }
    this.surfaceMaterials.update(this.clock);
    this.sky.material.uniforms.time.value = this.clock;
    this.riverMaterial.uniforms.time.value = this.clock;
    for (const marker of this.markers) {
      marker.light.rotation.y = this.clock;
      marker.light.position.y =
        elevation(marker.light.position.x, marker.light.position.z) +
        4 +
        Math.sin(this.clock * 2) * 0.4;
      marker.light.visible =
        !this.indoorReturn && !this.discovered.has(marker.id);
      (marker.ring.material as THREE.MeshBasicMaterial).color.set(
        this.discovered.has(marker.id) ? '#81bc97' : '#ffe0a1',
      );
    }
    const target = this.position
      .clone()
      .multiplyScalar(environmentScale)
      .add(new THREE.Vector3(0, this.flying ? 0.15 : 1.6, 0));
    const aiming =
      this.mode === 'adventure' && this.adventure.aiming && !this.paused;
    const aimForward = new THREE.Vector3(
      Math.sin(this.yaw) * Math.cos(0.45 - this.pitch),
      Math.sin(0.45 - this.pitch),
      -Math.cos(this.yaw) * Math.cos(0.45 - this.pitch),
    );
    const desired = aiming
      ? target
          .clone()
          .addScaledVector(aimForward, -3.2)
          .add(
            new THREE.Vector3(
              Math.cos(this.yaw) * 0.65,
              0.2,
              Math.sin(this.yaw) * 0.65,
            ),
          )
      : this.active
        ? target
            .clone()
            .add(
              new THREE.Vector3(
                -Math.sin(this.yaw) * this.zoom * Math.cos(this.pitch),
                this.zoom * Math.sin(this.pitch),
                Math.cos(this.yaw) * this.zoom * Math.cos(this.pitch),
              ),
            )
        : new THREE.Vector3(
            -390 + Math.sin(this.clock * 0.035) * 35,
            210,
            280,
          ).multiplyScalar(environmentScale);
    if (this.active) {
      const direction = desired.clone().sub(target).normalize();
      this.raycaster.set(target, direction);
      this.raycaster.far = target.distanceTo(desired);
      const hit = this.raycaster.intersectObjects(
        this.indoorReturn ? this.activeInterior.blockers : this.blockers,
        false,
      )[0];
      if (hit)
        desired
          .copy(target)
          .addScaledVector(direction, Math.max(1.2, hit.distance - 0.5));
      const foliageHit = new THREE.Vector3();
      const foliageRay = this.raycaster.ray.clone();
      foliageRay.origin.divideScalar(environmentScale);
      for (const { sphere: canopy, tree } of this.indoorReturn
        ? []
        : this.foliage) {
        if (this.felled.has(tree)) continue;
        if (canopy.containsPoint(foliageRay.origin)) continue;
        if (foliageRay.intersectSphere(canopy, foliageHit)) {
          const distance =
            foliageRay.origin.distanceTo(foliageHit) * environmentScale;
          if (distance < target.distanceTo(desired))
            desired
              .copy(target)
              .addScaledVector(direction, Math.max(1.2, distance - 0.4));
        }
      }
    }
    this.camera.position.lerp(
      desired,
      this.active ? 1 - Math.exp(-10 * delta) : 1,
    );
    const fov = THREE.MathUtils.lerp(
      this.camera.fov,
      aiming ? 42 : 55,
      1 - Math.exp(-12 * delta),
    );
    if (Math.abs(fov - this.camera.fov) > 0.01) {
      this.camera.fov = fov;
      this.camera.updateProjectionMatrix();
    }
    this.camera.lookAt(
      aiming
        ? target.clone().addScaledVector(aimForward, 40)
        : this.active
          ? target
          : new THREE.Vector3(-105, 49, 40).multiplyScalar(environmentScale),
    );
    this.avatar.visible =
      this.active && this.camera.position.distanceTo(target) > 2.1;
    this.renderer.render(this.scene, this.camera);
    if (time - this.updateTime > 180) {
      this.updateTime = time;
      this.callbacks.onUpdate({
        position: this.indoorReturn
          ? [this.indoorReturn.position.x, this.indoorReturn.position.z]
          : [this.position.x, this.position.z],
        heading: this.indoorReturn?.yaw ?? this.yaw,
        distance: this.distance,
        fps: Math.round(this.fps),
        altitude: Math.round(
          (this.position.y - this.support([this.position.x, this.position.z])) *
            environmentScale,
        ),
        interaction: this.activity() ?? null,
        seated: this.seat !== null,
        indoors: this.indoorReturn !== null,
        interior: this.indoorReturn?.kind ?? null,
        wood: this.wood,
        hour: this.daylight.hour,
        controller: this.controller.name,
        controllerSupported: this.controller.supported,
        adventure: this.mode === 'adventure' ? this.adventure.snapshot() : null,
      });
    }
    this.frame = requestAnimationFrame(this.animate);
  };

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.frame);
    this.observer.disconnect();
    window.removeEventListener('keydown', this.keyDown);
    window.removeEventListener('keyup', this.keyUp);
    window.removeEventListener('blur', this.clearInput);
    document.removeEventListener('visibilitychange', this.clearInput);
    this.host.removeEventListener('pointerdown', this.pointerDown);
    this.host.removeEventListener('pointermove', this.pointerMove);
    this.host.removeEventListener('pointerup', this.pointerUp);
    this.host.removeEventListener('pointercancel', this.pointerUp);
    this.host.removeEventListener('wheel', this.wheel);
    this.renderer.domElement.removeEventListener(
      'webglcontextlost',
      this.contextLost,
    );
    this.scene.traverse((object) => {
      if (object instanceof THREE.Mesh) {
        delete object.geometry.boundsTree;
        object.geometry.dispose();
        const materials = Array.isArray(object.material)
          ? object.material
          : [object.material];
        materials.forEach((material) => material.dispose());
      }
    });
    this.renderer.dispose();
    this.surfaceMaterials.dispose();
    this.site.dispose();
    this.interior.dispose();
    this.stoneGeometry.dispose();
    this.contactShadow?.material.map?.dispose();
    this.renderer.forceContextLoss();
    this.renderer.domElement.remove();
  }
}
