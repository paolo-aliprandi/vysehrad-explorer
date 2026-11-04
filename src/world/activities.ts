import * as THREE from 'three';
import {
  blocked,
  elevation,
  safePosition,
  spawn,
  standingElevation,
  casemateDoor,
  casemateUphillExit,
  upperElevation,
  type Point,
} from './geo';
import { streetFurniture, cathedralEntrance } from './architecture';
import type { Materials } from './materials';
import { cathedralLayout } from './cathedral';
export { makeCathedralInterior, indoorBlocked } from './cathedral';

export type ActivityKind =
  | 'bench'
  | 'fire'
  | 'npc'
  | 'tree'
  | 'cathedral'
  | 'rotunda'
  | 'lawrence'
  | 'casemates'
  | 'casemate-note'
  | 'exit';
type ActivityLocation = {
  id: string;
  point: Point;
  label: string;
};
export type Activity = ActivityLocation &
  (
    | { kind: 'bench'; angle: number }
    | { kind: 'tree'; index: number }
    | {
        kind:
          | 'fire'
          | 'npc'
          | 'cathedral'
          | 'rotunda'
          | 'lawrence'
          | 'casemates'
          | 'casemate-note'
          | 'exit';
      }
  );
export type ActivityPrompt = Pick<Activity, 'id' | 'label'>;
export type ActivityResult =
  | { kind: 'message'; text: string }
  | { kind: 'npc' }
  | { kind: 'rest'; text: string };
export const benches: (ActivityLocation & { kind: 'bench'; angle: number })[] =
  streetFurniture
    .filter((site) => site.bench)
    .map((site, index) => ({
      id: `bench-${index}`,
      kind: 'bench',
      point: site.point,
      angle: site.angle,
      label: 'Sit on bench',
    }));
export const groundskeeper: Activity = {
  id: 'groundskeeper',
  kind: 'npc',
  point: safePosition([spawn[0] + 4, spawn[1] + 2]),
  label: 'Talk to the groundskeeper',
};
export const cathedral: Activity = {
  id: 'cathedral',
  kind: 'cathedral',
  point: cathedralEntrance.approach,
  label: 'Enter the cathedral',
};
export const casemates: Activity = {
  id: 'casemates',
  kind: 'casemates',
  point: [
    casemateDoor.point[0] - casemateDoor.normal[0],
    casemateDoor.point[1] - casemateDoor.normal[1],
  ],
  label: 'Enter the casemates',
};
export const uphillCasemates: Activity = {
  id: 'casemates-uphill',
  kind: 'casemates',
  point: casemateUphillExit.point,
  label: 'Enter the uphill casemate passage',
};
export const cathedralExits: Activity[] = cathedralLayout.exits.map(
  (x, index) => ({
    id: `exit-${index}`,
    kind: 'exit',
    point: [x, 15.5],
    label: 'Return to Vyšehrad',
  }),
);

export function nearbyActivity(
  activities: readonly Activity[],
  point: Point,
  height: number,
  floor: (point: Point) => number = (point) => standingElevation(point),
  clear: (point: Point, activity: Activity) => boolean = () => true,
) {
  return activities
    .filter(
      (activity) =>
        Math.hypot(
          activity.point[0] - point[0],
          activity.point[1] - point[1],
        ) <= (activity.kind === 'tree' ? 2.8 : 3.8) &&
        Math.abs(floor(activity.point) - height) < 1.6 &&
        clear(
          activity.kind === 'bench' ? benchApproach(activity) : activity.point,
          activity,
        ),
    )
    .sort(
      (a, b) =>
        Math.hypot(a.point[0] - point[0], a.point[1] - point[1]) -
        Math.hypot(b.point[0] - point[0], b.point[1] - point[1]),
    )[0];
}

export function benchApproach(bench: Activity & { kind: 'bench' }): Point {
  const angle = bench.angle;
  return [
    bench.point[0] + Math.sin(angle) * 1.4,
    bench.point[1] + Math.cos(angle) * 1.4,
  ];
}
export function safeSeat(bench: Activity, height: number) {
  const floor = upperElevation(...bench.point);
  return (
    !blocked(bench.point, floor, { ignoredFurniture: bench.point }) &&
    Math.abs(floor - height) < 0.8
  );
}

export function makeGroundskeeper(
  materials: Materials,
  appearance = { coat: '#6f8d78', hat: '#68624c' },
) {
  const group = new THREE.Group();
  const part = (geometry: THREE.BufferGeometry, color: string, y: number) => {
    const mesh = new THREE.Mesh(geometry, materials.get('plaster', color));
    mesh.position.y = y;
    mesh.castShadow = true;
    group.add(mesh);
    return mesh;
  };
  part(new THREE.CapsuleGeometry(0.3, 0.55, 6, 12), appearance.coat, 1.05);
  part(new THREE.SphereGeometry(0.25, 16, 12), '#c99f7c', 1.75);
  part(new THREE.CylinderGeometry(0.29, 0.32, 0.15, 16), appearance.hat, 1.98);
  part(new THREE.CylinderGeometry(0.4, 0.4, 0.04, 16), appearance.hat, 1.9);
  for (const side of [-1, 1]) {
    const eye = part(new THREE.SphereGeometry(0.025, 8, 6), '#394e48', 1.79);
    eye.position.set(side * 0.085, 1.79, 0.224);
  }
  for (const side of [-1, 1]) {
    const leg = part(
      new THREE.CapsuleGeometry(0.11, 0.55, 6, 10),
      '#394e48',
      0.39,
    );
    leg.position.x = side * 0.17;
    leg.name = `leg-${side}`;
    const arm = part(
      new THREE.CapsuleGeometry(0.09, 0.42, 6, 10),
      appearance.coat,
      1,
    );
    arm.position.x = side * 0.4;
    arm.name = `arm-${side}`;
  }
  group.position.set(
    groundskeeper.point[0],
    elevation(...groundskeeper.point),
    groundskeeper.point[1],
  );
  return group;
}
