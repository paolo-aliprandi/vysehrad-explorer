import * as THREE from 'three';
import {
  buildings,
  landmarks,
  safePosition,
  spawn,
  initialHeading,
  standingElevation,
  streetFrontages,
  spickaShop,
  type Point,
} from './geo';
import type { Materials } from './materials';
import { buildingEntrance } from './architecture';
import { visitorRouteClear } from './pedestrians';

export type GameMode = 'chill' | 'adventure';
export type Weapon = 'stick' | 'sword' | 'bow';
export const enemyMaxHealth = 8;
export type AdventureProgress = {
  explored: string[];
  weapon: Weapon | null;
  defeated: string[];
  coins?: number;
  health?: number;
  hasBow?: boolean;
  melee?: 'stick' | 'sword' | null;
  arrows?: number;
  collectedArrows?: string[];
};
export type AdventureSnapshot = AdventureProgress & {
  health: number;
  recovering: boolean;
  coins: number;
  hurt: boolean;
  eating: boolean;
  aiming: boolean;
  hasBow: boolean;
  melee: 'stick' | 'sword' | null;
  arrows: number;
  collectedArrows: string[];
  civiliansInDanger: number;
  housesUnderAttack: number;
  housesDefended: number;
  breachedHouses: number;
};
export type RaidCivilian = { id: string; point: Point };
type RaidTarget = {
  kind: 'player' | 'civilian' | 'house' | 'patrol';
  point: Point;
  id?: string;
};
type Enemy = {
  id: string;
  point: Point;
  health: number;
  houseId?: string;
  target: RaidTarget;
  cooldown: number;
  rethink: number;
  hurtTime: number;
  defeatTime: number;
  impact: Point;
  windup: number;
};
export const foodShops = [
  ...[264494769, 3475173902].map((id) => {
    const frontage = streetFrontages.find((item) => item.detail.id === id);
    if (!frontage) throw new Error(`Missing food shop frontage ${id}.`);
    return {
      id: String(id),
      name: frontage.name,
      meal: id === 264494769 ? 'warm soup' : 'bread and cheese',
      point: safePosition([
        frontage.facade[0] + frontage.normal[0] * 2.2,
        frontage.facade[1] + frontage.normal[1] * 2.2,
      ]),
    };
  }),
  {
    id: 'okenko',
    name: 'Okénko',
    meal: 'fresh pastry',
    point: safePosition([
      spickaShop.center[0] +
        spickaShop.axis[0] * 0.6 -
        spickaShop.axis[1] * 4.2,
      spickaShop.center[1] +
        spickaShop.axis[1] * 0.6 +
        spickaShop.axis[0] * 4.2,
    ]),
  },
];
export const raidHouses = [
  49811200, 49811193, 49810435, 49810430, 1054906226, 49810585, 49810594,
].map((id) => {
  const building = buildings.find((item) => item.id === id);
  if (!building) throw new Error(`Missing raidable house ${id}.`);
  const door = buildingEntrance(building, 6);
  if (!door) throw new Error(`Missing raid entrance for house ${id}.`);
  const point: Point = [
    door.point[0] + door.normal[0] * 1.4,
    door.point[1] + door.normal[1] * 1.4,
  ];
  const approaches: Point[] = [];
  for (const distance of [3, 5, 7, 2, 4, 6])
    for (const side of [0, -2, 2]) {
      const start: Point = [
        point[0] + door.normal[0] * distance + door.normal[1] * side,
        point[1] + door.normal[1] * distance - door.normal[0] * side,
      ];
      if (visitorRouteClear(start, point)) approaches.push(start);
    }
  if (approaches.length < 3)
    throw new Error(`House ${id} has no walkable raid approach.`);
  return {
    id: String(id),
    name: building.tags.name ?? 'Village house',
    point,
    approaches: approaches.slice(0, 3),
  };
});
export const adventureStorageKey = 'vysehrad-adventure-v1';
export const adventureRegions = [
  { id: 'basilica', x: -380, z: -220, width: 310, depth: 315 },
  { id: 'rotunda', x: -70, z: -220, width: 450, depth: 315 },
  { id: 'gate', x: -70, z: 95, width: 450, depth: 285 },
  { id: 'river', x: -380, z: 95, width: 310, depth: 285 },
];
export const weaponPickups: { id: Weapon; point: Point }[] = [
  {
    id: 'stick',
    point: safePosition([
      spawn[0] + Math.sin(initialHeading) * 3,
      spawn[1] - Math.cos(initialHeading) * 3,
    ]),
  },
  { id: 'sword', point: safePosition([80, 90]) },
  { id: 'bow', point: safePosition([76, 86]) },
];
export const arrowPickups = [
  { id: 'gate-arrows', point: safePosition([103, 154]) },
  { id: 'rotunda-arrows', point: safePosition([79, 87]) },
  { id: 'river-arrows', point: safePosition([-249, 124]) },
  { id: 'basilica-arrows', point: safePosition([-231, 10]) },
  {
    id: 'okenko-arrows',
    point: safePosition([spickaShop.center[0] + 8, spickaShop.center[1] + 6]),
  },
  { id: 'hradby-arrows', point: safePosition([110, 97]) },
];
export const enemySpawns: { id: string; point: Point; houseId?: string }[] = [
  { id: 'gate-sprite', point: safePosition([99, 136]) },
  { id: 'rotunda-sprite', point: safePosition([88, 99]) },
  { id: 'river-sprite', point: safePosition([-243, 117]) },
  ...raidHouses.flatMap((house) =>
    house.approaches.map((point, index) => ({
      id: `house-${house.id}-sprite-${index}`,
      point,
      houseId: house.id,
    })),
  ),
];

export function readAdventure(
  storage: Pick<Storage, 'getItem'>,
): AdventureProgress {
  const raw = storage.getItem(adventureStorageKey);
  if (!raw) return { explored: [], weapon: null, defeated: [] };
  const value: unknown = JSON.parse(raw);
  if (
    !value ||
    typeof value !== 'object' ||
    !('explored' in value) ||
    !Array.isArray(value.explored) ||
    value.explored.some((id) => typeof id !== 'string') ||
    !('defeated' in value) ||
    !Array.isArray(value.defeated) ||
    value.defeated.some((id) => typeof id !== 'string') ||
    !('weapon' in value) ||
    (value.weapon !== null &&
      value.weapon !== 'stick' &&
      value.weapon !== 'sword' &&
      value.weapon !== 'bow') ||
    ('coins' in value &&
      (typeof value.coins !== 'number' ||
        !Number.isSafeInteger(value.coins) ||
        value.coins < 0)) ||
    ('health' in value &&
      (typeof value.health !== 'number' ||
        !Number.isInteger(value.health) ||
        value.health < 1 ||
        value.health > 5)) ||
    ('hasBow' in value && typeof value.hasBow !== 'boolean') ||
    ('melee' in value &&
      value.melee !== null &&
      value.melee !== 'stick' &&
      value.melee !== 'sword') ||
    ('arrows' in value &&
      (typeof value.arrows !== 'number' ||
        !Number.isSafeInteger(value.arrows) ||
        value.arrows < 0)) ||
    ('collectedArrows' in value &&
      (!Array.isArray(value.collectedArrows) ||
        value.collectedArrows.some((id) => typeof id !== 'string')))
  )
    throw new Error('Saved adventure progress is invalid.');
  return {
    explored: [
      ...new Set(
        value.explored.filter((id) =>
          landmarks.some((landmark) => landmark.id === id),
        ),
      ),
    ],
    defeated: [
      ...new Set(
        value.defeated.filter((id) =>
          enemySpawns.some((enemy) => enemy.id === id),
        ),
      ),
    ],
    weapon: value.weapon,
    coins:
      'coins' in value && typeof value.coins === 'number' ? value.coins : 12,
    health:
      'health' in value && typeof value.health === 'number' ? value.health : 5,
    hasBow:
      value.weapon === 'bow' || ('hasBow' in value && value.hasBow === true),
    melee:
      'melee' in value && (value.melee === 'stick' || value.melee === 'sword')
        ? value.melee
        : value.weapon === 'stick' || value.weapon === 'sword'
          ? value.weapon
          : null,
    arrows:
      'arrows' in value && typeof value.arrows === 'number' ? value.arrows : 0,
    collectedArrows:
      'collectedArrows' in value && Array.isArray(value.collectedArrows)
        ? [
            ...new Set(
              value.collectedArrows.filter(
                (id): id is string =>
                  typeof id === 'string' &&
                  arrowPickups.some((item) => item.id === id),
              ),
            ),
          ]
        : [],
  };
}

export class Adventure {
  health = 5;
  weapon: Weapon | null;
  explored: Set<string>;
  defeated: Set<string>;
  attackTime = 0;
  invulnerability = 0;
  hurtTime = 0;
  eatTime = 0;
  hurtDirection: Point = [0, 0];
  coins: number;
  hasBow: boolean;
  melee: 'stick' | 'sword' | null;
  arrows: number;
  collectedArrows: Set<string>;
  aiming = false;
  shotTime = 0;
  lastCheckpoint: string | null;
  civilians = new Map<
    string,
    { health: number; frightened: number; recovering: number }
  >();
  houses = raidHouses.map((house) => ({
    ...house,
    integrity: 12,
    hitTime: 0,
  }));
  enemies: Enemy[] = enemySpawns.map((enemy) => ({
    ...enemy,
    point: [...enemy.point] satisfies Point,
    health: enemyMaxHealth,
    target: { kind: 'patrol', point: enemy.point },
    cooldown: 0,
    rethink: 0,
    hurtTime: 0,
    defeatTime: 0,
    impact: [0, 0],
    windup: 0,
  }));

  constructor(
    progress: AdventureProgress = { explored: [], weapon: null, defeated: [] },
  ) {
    this.weapon = progress.weapon;
    this.coins = progress.coins ?? 12;
    this.health = progress.health ?? 5;
    this.hasBow = progress.hasBow ?? progress.weapon === 'bow';
    this.melee =
      progress.melee ??
      (progress.weapon === 'stick' || progress.weapon === 'sword'
        ? progress.weapon
        : null);
    this.arrows = progress.arrows ?? 0;
    this.collectedArrows = new Set(progress.collectedArrows ?? []);
    this.explored = new Set(progress.explored);
    this.defeated = new Set(progress.defeated);
    this.lastCheckpoint = progress.explored.at(-1) ?? null;
  }

  snapshot(): AdventureSnapshot {
    return {
      health: this.health,
      weapon: this.weapon,
      explored: [...this.explored],
      defeated: [...this.defeated],
      recovering: this.invulnerability > 0,
      coins: this.coins,
      hurt: this.hurtTime > 0,
      eating: this.eatTime > 0,
      aiming: this.aiming,
      hasBow: this.hasBow,
      melee: this.melee,
      arrows: this.arrows,
      collectedArrows: [...this.collectedArrows],
      civiliansInDanger: [...this.civilians.values()].filter(
        (civilian) => civilian.frightened > 0 || civilian.recovering > 0,
      ).length,
      housesUnderAttack: this.houses.filter((house) => house.hitTime > 0)
        .length,
      housesDefended: this.houses.filter((house) =>
        this.enemies
          .filter((enemy) => enemy.houseId === house.id)
          .every((enemy) => this.defeated.has(enemy.id)),
      ).length,
      breachedHouses: this.houses.filter((house) => house.integrity === 0)
        .length,
    };
  }

  nearby(point: Point, height: number, clear: (a: Point, b: Point) => boolean) {
    return [
      ...foodShops.map((shop) => ({
        id: `food-${shop.id}`,
        label: `Buy & eat ${shop.meal} · ${shop.name} (3 coins, +3 health)`,
        point: shop.point,
      })),
      ...weaponPickups
        .filter((item) => this.canPickup(item.id))
        .map((item) => ({
          id: `pickup-${item.id}`,
          label: `Pick up ${item.id}`,
          point: item.point,
        })),
      ...arrowPickups
        .filter((item) => !this.collectedArrows.has(item.id))
        .map((item) => ({
          id: item.id,
          label: 'Collect 8 arrows',
          point: item.point,
        })),
      ...landmarks.map((item) => ({
        id: `checkpoint-${item.id}`,
        label: this.explored.has(item.id)
          ? this.defeated.size === enemySpawns.length
            ? 'Rest and start another raid'
            : 'Rest at checkpoint'
          : `Raise the ${item.short.toLowerCase()} banner`,
        point: item.view,
      })),
    ]
      .filter(
        (item) =>
          Math.hypot(item.point[0] - point[0], item.point[1] - point[1]) < 3 &&
          Math.abs(standingElevation(item.point) - height) < 1.4 &&
          clear(point, item.point),
      )
      .sort(
        (a, b) =>
          Math.hypot(a.point[0] - point[0], a.point[1] - point[1]) -
          Math.hypot(b.point[0] - point[0], b.point[1] - point[1]),
      )[0];
  }

  interact(id: string) {
    const arrows = arrowPickups.find((item) => item.id === id);
    if (arrows) {
      if (this.collectedArrows.has(id))
        return 'You already collected these arrows.';
      this.collectedArrows.add(id);
      this.arrows += 8;
      return 'Collected 8 arrows. Hold ZL to aim; press ZR to shoot. L switches weapons.';
    }
    if (id.startsWith('food-')) {
      const shop = foodShops.find((item) => `food-${item.id}` === id);
      if (!shop) throw new Error('Unknown food shop.');
      if (this.eatTime > 0) return 'Finish your meal first.';
      if (this.health === 5)
        return 'Your health is full. Save your coins for later.';
      if (this.coins < 3)
        return 'Food costs 3 coins. Defeat raiders to earn 2 coins each.';
      this.coins -= 3;
      this.health = Math.min(5, this.health + 3);
      this.eatTime = 1.1;
      return `You eat ${shop.meal} at ${shop.name}. Health restored.`;
    }
    if (id.startsWith('pickup-')) {
      const weapon = weaponPickups.find((item) => `pickup-${item.id}` === id);
      if (!weapon) throw new Error('Unknown adventure weapon.');
      this.weapon = weapon.id;
      if (weapon.id === 'bow') this.hasBow = true;
      else this.melee = weapon.id;
      return weapon.id === 'bow'
        ? 'Equipped bow. Collect arrows; hold ZL / Z to aim, then ZR / R to fire. L / C swaps weapons.'
        : `Equipped ${weapon.id}. R / Y swings it toward the camera direction.`;
    }
    const checkpoint = landmarks.find((item) => `checkpoint-${item.id}` === id);
    if (!checkpoint) throw new Error('Unknown adventure checkpoint.');
    this.explored.add(checkpoint.id);
    this.lastCheckpoint = checkpoint.id;
    this.health = 5;
    if (this.defeated.size === enemySpawns.length)
      return `${checkpoint.short}: health restored. ${this.restartRaids()}`;
    return `${checkpoint.short}: region charted, health restored, checkpoint saved.`;
  }

  restartRaids() {
    if (this.enemies.some((enemy) => !this.defeated.has(enemy.id)))
      return 'Defeat the remaining raiders before starting another raid.';
    const next = new Adventure({ ...this.snapshot(), defeated: [] });
    this.enemies = next.enemies;
    this.houses = next.houses;
    this.defeated.clear();
    this.civilians.clear();
    return `A new wave of ${this.enemies.length} raiders is approaching. Your equipment, coins and chart are safe.`;
  }

  attack(
    point: Point,
    height: number,
    yaw: number,
    scale: number,
    clear: (a: Point, b: Point) => boolean,
  ) {
    if (!this.weapon)
      return 'Pick up the glowing stick near the entrance, or find a sword.';
    if (this.weapon === 'bow')
      return 'Hold ZL / Z to aim, then ZR / R to shoot.';
    if (this.attackTime > 0) return null;
    if (this.eatTime > 0) return 'Finish your meal before swinging.';
    this.attackTime = 0.45;
    let hits = 0;
    for (const enemy of [...this.enemies].sort(
      (a, b) =>
        Math.hypot(a.point[0] - point[0], a.point[1] - point[1]) -
        Math.hypot(b.point[0] - point[0], b.point[1] - point[1]),
    )) {
      if (this.defeated.has(enemy.id)) continue;
      const dx = enemy.point[0] - point[0],
        dz = enemy.point[1] - point[1],
        distance = Math.hypot(dx, dz);
      if (
        distance > 2.8 / scale ||
        Math.abs(standingElevation(enemy.point) - height) > 1.4 / scale ||
        (distance > 0.01 &&
          (dx * Math.sin(yaw) - dz * Math.cos(yaw)) / distance < 0.2) ||
        !clear(point, enemy.point)
      )
        continue;
      this.hitEnemy(
        enemy.id,
        this.weapon === 'sword' ? 2 : 1,
        distance > 0.01 ? [dx / distance, dz / distance] : [0, -1],
      );
      hits++;
      break;
    }
    return hits
      ? 'A moss sprite staggers! Defeated sprites dissolve harmlessly.'
      : 'You swing through the air. Face a nearby sprite to hit it.';
  }

  canPickup(weapon: Weapon) {
    return weapon === 'bow'
      ? !this.hasBow
      : weapon === 'sword'
        ? this.melee !== 'sword'
        : this.melee === null;
  }

  switchWeapon() {
    if (!this.hasBow || !this.melee)
      return 'Find the bow and a melee weapon to switch equipment.';
    this.weapon = this.weapon === 'bow' ? this.melee : 'bow';
    this.aiming = false;
    return `Equipped ${this.weapon}.`;
  }

  looseArrow() {
    if (this.weapon !== 'bow' || !this.aiming)
      return 'Equip the bow and hold ZL / Z to aim first.';
    if (this.eatTime > 0 || this.shotTime > 0) return null;
    if (this.arrows <= 0)
      return 'Out of arrows. Collect a glowing arrow bundle.';
    this.arrows--;
    this.shotTime = 0.65;
    return 'Arrow released.';
  }

  hitEnemy(id: string, damage: number, direction: Point) {
    const enemy = this.enemies.find((item) => item.id === id);
    if (!enemy || this.defeated.has(id)) return false;
    enemy.health = Math.max(0, enemy.health - damage);
    enemy.hurtTime = 0.4;
    enemy.impact = direction;
    if (enemy.health === 0) {
      this.defeated.add(id);
      enemy.defeatTime = 0.65;
      this.coins += 2;
    }
    return true;
  }
  update(
    delta: number,
    player: Point,
    height: number,
    scale: number,
    canMove: (from: Point, to: Point) => boolean,
    clear: (a: Point, b: Point) => boolean,
    civilians: readonly RaidCivilian[] = [],
  ): Point | null {
    this.attackTime = Math.max(0, this.attackTime - delta);
    this.invulnerability = Math.max(0, this.invulnerability - delta);
    this.hurtTime = Math.max(0, this.hurtTime - delta);
    this.eatTime = Math.max(0, this.eatTime - delta);
    this.shotTime = Math.max(0, this.shotTime - delta);
    for (const house of this.houses)
      house.hitTime = Math.max(0, house.hitTime - delta);
    for (const civilian of civilians)
      if (!this.civilians.has(civilian.id))
        this.civilians.set(civilian.id, {
          health: 3,
          frightened: 0,
          recovering: 0,
        });
    for (const state of this.civilians.values()) {
      state.frightened = Math.max(0, state.frightened - delta);
      if (state.recovering > 0) {
        state.recovering = Math.max(0, state.recovering - delta);
        if (state.recovering === 0) state.health = 3;
      }
    }
    for (const [index, enemy] of this.enemies.entries()) {
      enemy.hurtTime = Math.max(0, enemy.hurtTime - delta);
      enemy.defeatTime = Math.max(0, enemy.defeatTime - delta);
      if (this.defeated.has(enemy.id)) continue;
      enemy.cooldown = Math.max(0, enemy.cooldown - delta);
      enemy.rethink = Math.max(0, enemy.rethink - delta);
      const home = enemySpawns[index].point;
      const distance = Math.hypot(
        player[0] - enemy.point[0],
        player[1] - enemy.point[1],
      );
      const sameLevel =
        Math.abs(standingElevation(enemy.point) - height) < 1.4 / scale;
      if (enemy.rethink === 0 && enemy.windup === 0) {
        enemy.rethink = 0.5 + (index % 4) * 0.1;
        const civilian = civilians
          .filter(
            (item) =>
              !this.civilians.get(item.id)?.recovering &&
              Math.hypot(
                item.point[0] - enemy.point[0],
                item.point[1] - enemy.point[1],
              ) <
                14 / scale &&
              Math.abs(
                standingElevation(item.point) - standingElevation(enemy.point),
              ) <
                1.4 / scale,
          )
          .sort(
            (a, b) =>
              Math.hypot(
                a.point[0] - enemy.point[0],
                a.point[1] - enemy.point[1],
              ) -
              Math.hypot(
                b.point[0] - enemy.point[0],
                b.point[1] - enemy.point[1],
              ),
          )
          .find((item) => clear(enemy.point, item.point));
        const house = this.houses.find((item) => item.id === enemy.houseId);
        enemy.target =
          sameLevel && distance < 12 / scale && clear(enemy.point, player)
            ? { kind: 'player', point: player }
            : civilian
              ? { kind: 'civilian', id: civilian.id, point: civilian.point }
              : house &&
                  house.integrity > 0 &&
                  Math.hypot(
                    player[0] - house.point[0],
                    player[1] - house.point[1],
                  ) <
                    65 / scale
                ? { kind: 'house', id: house.id, point: house.point }
                : { kind: 'patrol', point: home };
      }
      if (enemy.target.kind === 'player') enemy.target.point = player;
      if (enemy.target.kind === 'civilian') {
        const civilian = civilians.find((item) => item.id === enemy.target.id);
        const state = civilian && this.civilians.get(civilian.id);
        if (!civilian || !state || state.recovering > 0) {
          enemy.rethink = 0;
          continue;
        }
        enemy.target.point = civilian.point;
        state.frightened = 2;
      }
      const target = enemy.target.point;
      const dx = target[0] - enemy.point[0],
        dz = target[1] - enemy.point[1],
        length = Math.hypot(dx, dz);
      const winding = enemy.windup > 0;
      enemy.windup = Math.max(0, enemy.windup - delta);
      const strike = winding && enemy.windup === 0;
      if (strike) enemy.cooldown = 1.4;
      if (length > 0.7 / scale && !winding && enemy.hurtTime === 0) {
        const step = Math.min(length - 0.6 / scale, (2.1 * delta) / scale);
        const next: Point = [
          enemy.point[0] + (dx / length) * step,
          enemy.point[1] + (dz / length) * step,
        ];
        if (canMove(enemy.point, next)) enemy.point = next;
      }
      const inReach =
        Math.hypot(target[0] - enemy.point[0], target[1] - enemy.point[1]) <
        1.65 / scale;
      if (
        !winding &&
        !strike &&
        enemy.cooldown === 0 &&
        enemy.target.kind !== 'patrol' &&
        inReach &&
        clear(enemy.point, target)
      )
        enemy.windup = 0.6;
      if (
        strike &&
        enemy.target.kind !== 'player' &&
        enemy.target.kind !== 'patrol' &&
        inReach &&
        clear(enemy.point, target)
      ) {
        if (enemy.target.kind === 'civilian') {
          const state = enemy.target.id
            ? this.civilians.get(enemy.target.id)
            : undefined;
          if (state && !state.recovering) {
            state.health--;
            if (state.health <= 0) state.recovering = 12;
          }
        } else {
          const house = this.houses.find((item) => item.id === enemy.target.id);
          if (house) {
            house.integrity = Math.max(0, house.integrity - 1);
            house.hitTime = 3;
            if (house.integrity === 0) enemy.rethink = 0;
          }
        }
      }
      if (
        strike &&
        enemy.target.kind === 'player' &&
        sameLevel &&
        inReach &&
        this.invulnerability === 0 &&
        clear(enemy.point, player)
      ) {
        this.health--;
        this.invulnerability = 1.5;
        this.hurtTime = 0.4;
        this.hurtDirection =
          distance > 0.01
            ? [
                (player[0] - enemy.point[0]) / distance,
                (player[1] - enemy.point[1]) / distance,
              ]
            : [0, 1];
        if (this.health <= 0) {
          this.health = 5;
          this.invulnerability = 3;
          for (const [i, sprite] of this.enemies.entries()) {
            sprite.point = [...enemySpawns[i].point];
            sprite.rethink = 0;
            sprite.windup = 0;
            sprite.cooldown = 1.4;
          }
          return (
            landmarks.find((item) => item.id === this.lastCheckpoint)?.view ??
            spawn
          );
        }
      }
    }
    return null;
  }
}

export function makeWeapon(kind: Weapon, materials: Materials) {
  const group = new THREE.Group();
  const add = (geometry: THREE.BufferGeometry, color: string) => {
    const mesh = new THREE.Mesh(
      geometry,
      materials.get(kind === 'sword' ? 'metal' : 'wood', color),
    );
    mesh.castShadow = true;
    group.add(mesh);
    return mesh;
  };
  if (kind === 'stick') {
    add(
      new THREE.CylinderGeometry(0.035, 0.06, 1.1, 8).translate(0, 0.45, 0),
      '#99754d',
    );
  } else if (kind === 'bow') {
    add(
      new THREE.TorusGeometry(0.48, 0.035, 6, 24, Math.PI)
        .rotateZ(-Math.PI / 2)
        .translate(0, 0.5, 0),
      '#96744b',
    );
    add(
      new THREE.CylinderGeometry(0.008, 0.008, 0.96, 4).translate(0, 0.5, 0),
      '#e6d9bb',
    );
  } else {
    add(
      new THREE.BoxGeometry(0.13, 0.85, 0.045).translate(0, 0.7, 0),
      '#d1d8da',
    );
    add(new THREE.ConeGeometry(0.065, 0.15, 4).translate(0, 1.2, 0), '#e4e6df');
    add(
      new THREE.BoxGeometry(0.38, 0.07, 0.09).translate(0, 0.25, 0),
      '#c7a55c',
    );
    add(
      new THREE.CylinderGeometry(0.045, 0.045, 0.28, 8).translate(0, 0.07, 0),
      '#67513c',
    );
  }
  return group;
}

export function makeArrow(materials: Materials) {
  const arrow = new THREE.Group();
  arrow.add(
    new THREE.Mesh(
      new THREE.CylinderGeometry(0.018, 0.018, 0.9, 5).rotateX(Math.PI / 2),
      materials.get('wood', '#c4aa78'),
    ),
    new THREE.Mesh(
      new THREE.ConeGeometry(0.045, 0.15, 4)
        .rotateX(Math.PI / 2)
        .translate(0, 0, 0.52),
      materials.get('metal', '#d2dadb'),
    ),
    new THREE.Mesh(
      new THREE.BoxGeometry(0.15, 0.015, 0.2).translate(0, 0, -0.3),
      materials.get('plaster', '#e7dfc9'),
    ),
  );
  return arrow;
}

export function makeMeal(materials: Materials) {
  return new THREE.Mesh(
    new THREE.SphereGeometry(0.14, 10, 6).scale(1.3, 0.75, 1),
    materials.get('plaster', '#d5a35b'),
  );
}

export function makeDistressMarker() {
  const marker = new THREE.Group();
  marker.name = 'Civilian distress';
  const material = new THREE.MeshBasicMaterial({ color: '#f0b55c' });
  marker.add(
    new THREE.Mesh(
      new THREE.CylinderGeometry(0.055, 0.055, 0.36, 6).translate(0, 2.7, 0),
      material,
    ),
    new THREE.Mesh(
      new THREE.SphereGeometry(0.065, 6, 6).translate(0, 2.4, 0),
      material,
    ),
  );
  marker.visible = false;
  return marker;
}

export function makeAdventureModels(materials: Materials, scale: number) {
  const group = new THREE.Group();
  group.name = 'Knight adventure';
  group.visible = false;
  const enemyEffects: {
    impact: THREE.Mesh<THREE.OctahedronGeometry, THREE.MeshBasicMaterial>;
    health: THREE.Group;
    fill: THREE.Mesh;
    arms: THREE.Group[];
  }[] = [];
  const enemies = enemySpawns.map((enemy) => {
    const model = new THREE.Group();
    model.name = enemy.id;
    const add = (geometry: THREE.BufferGeometry, color: string) => {
      const mesh = new THREE.Mesh(geometry, materials.get('plaster', color));
      mesh.castShadow = true;
      model.add(mesh);
      return mesh;
    };
    add(
      new THREE.IcosahedronGeometry(0.42, 1)
        .scale(1, 1.3, 0.8)
        .translate(0, 0.6, 0),
      '#6f855a',
    );
    add(new THREE.SphereGeometry(0.32, 12, 8).translate(0, 1.1, 0), '#91a86c');
    for (const side of [-1, 1]) {
      add(
        new THREE.ConeGeometry(0.13, 0.38, 5)
          .rotateZ(-side * 0.8)
          .translate(side * 0.3, 1.3, 0),
        '#91a86c',
      );
      add(
        new THREE.SphereGeometry(0.045, 8, 6).translate(
          side * 0.11,
          1.15,
          0.28,
        ),
        '#303d35',
      );
      add(
        new THREE.BoxGeometry(0.2, 0.18, 0.28).translate(
          side * 0.2,
          0.13,
          0.05,
        ),
        '#4a6246',
      );
    }
    const arms = [-1, 1].map((side) => {
      const pivot = new THREE.Group();
      pivot.position.set(side * 0.39, 0.92, 0);
      pivot.add(
        add(
          new THREE.CapsuleGeometry(0.09, 0.23, 3, 6).translate(0, -0.15, 0),
          '#6f855a',
        ),
      );
      model.add(pivot);
      return pivot;
    });
    const impact = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.3),
      new THREE.MeshBasicMaterial({
        color: '#fff1b1',
        transparent: true,
        opacity: 0.9,
      }),
    );
    impact.position.set(0, 1.1, 0.15);
    impact.visible = false;
    const health = new THREE.Group();
    health.position.set(0, 1.65, 0);
    health.add(
      new THREE.Mesh(
        new THREE.BoxGeometry(0.8, 0.09, 0.06),
        new THREE.MeshBasicMaterial({ color: '#283c36' }),
      ),
    );
    const fill = new THREE.Mesh(
      new THREE.BoxGeometry(0.76, 0.055, 0.075).translate(0.38, 0, 0),
      new THREE.MeshBasicMaterial({ color: '#cc765e' }),
    );
    fill.position.x = -0.38;
    health.add(fill);
    health.visible = false;
    model.add(impact, health);
    enemyEffects.push({ impact, health, fill, arms });
    model.scale.setScalar(1 / scale);
    group.add(model);
    return model;
  });
  const pickups = weaponPickups.map((item) => {
    const model = new THREE.Group();
    model.name = `Ground ${item.id}`;
    const weapon = makeWeapon(item.id, materials);
    weapon.rotation.z = Math.PI / 2;
    weapon.position.y = 0.15;
    model.add(weapon);
    const glow = new THREE.Mesh(
      new THREE.TorusGeometry(0.75, 0.025, 6, 32),
      new THREE.MeshBasicMaterial({ color: '#f0d58b' }),
    );
    glow.rotation.x = Math.PI / 2;
    glow.position.y = 0.05;
    model.add(glow);
    model.scale.setScalar(1 / scale);
    model.position.set(
      item.point[0],
      standingElevation(item.point) + 0.05,
      item.point[1],
    );
    group.add(model);
    return model;
  });
  const flags = landmarks.map((item) => {
    const model = new THREE.Group();
    model.name = `Checkpoint ${item.id}`;
    const pole = new THREE.Mesh(
      new THREE.CylinderGeometry(0.035, 0.045, 2.7, 8).translate(0, 1.35, 0),
      materials.get('wood', '#8e7653'),
    );
    const flag = new THREE.Mesh(
      new THREE.BoxGeometry(0.85, 0.65, 0.035).translate(0.43, 2.15, 0),
      new THREE.MeshStandardMaterial({
        color: '#b5ada0',
        side: THREE.DoubleSide,
      }),
    );
    model.add(pole, flag);
    model.scale.setScalar(1 / scale);
    model.position.set(
      item.view[0],
      standingElevation(item.view),
      item.view[1],
    );
    group.add(model);
    return { model, flag };
  });
  const houses = raidHouses.map((house) => {
    const model = new THREE.Group();
    model.name = `Raid at ${house.name}`;
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(1.1, 0.045, 6, 24).rotateX(Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: '#d3a15e' }),
    );
    ring.position.y = 0.07;
    const health = new THREE.Mesh(
      new THREE.BoxGeometry(1.5, 0.1, 0.08).translate(0.75, 0, 0),
      new THREE.MeshBasicMaterial({ color: '#d3a15e' }),
    );
    health.position.set(-0.75, 2.9, 0);
    model.add(ring, health);
    model.scale.setScalar(1 / scale);
    model.position.set(
      house.point[0],
      standingElevation(house.point),
      house.point[1],
    );
    group.add(model);
    return { model, ring, health };
  });
  const food = foodShops.map((shop) => {
    const model = new THREE.Group();
    const loaf = makeMeal(materials);
    loaf.scale.setScalar(2.4);
    loaf.position.y = 1.6;
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(0.65, 0.035, 6, 24).rotateX(Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: '#a9d194' }),
    );
    ring.position.y = 0.06;
    model.add(loaf, ring);
    model.scale.setScalar(1 / scale);
    model.position.set(
      shop.point[0],
      standingElevation(shop.point),
      shop.point[1],
    );
    group.add(model);
    return model;
  });
  const arrows = arrowPickups.map((item) => {
    const model = new THREE.Group();
    for (const x of [-0.12, 0, 0.12]) {
      const arrow = makeArrow(materials);
      arrow.position.set(x, 0.15, 0);
      model.add(arrow);
    }
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(0.65, 0.025, 6, 24).rotateX(Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: '#f0d58b' }),
    );
    ring.position.y = 0.04;
    model.add(ring);
    model.scale.setScalar(1 / scale);
    model.position.set(
      item.point[0],
      standingElevation(item.point),
      item.point[1],
    );
    group.add(model);
    return model;
  });
  return { group, enemies, enemyEffects, pickups, flags, houses, food, arrows };
}
