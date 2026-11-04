import { describe, expect, it } from 'vitest';
import {
  Adventure,
  adventureStorageKey,
  enemySpawns,
  enemyMaxHealth,
  foodShops,
  arrowPickups,
  raidHouses,
  readAdventure,
  weaponPickups,
} from './adventure';
import { landmarks, standingElevation, type Point } from './geo';
import { visitorRouteClear } from './pedestrians';

describe('knight adventure', () => {
  it('saves missed arrows at their impact pose and recovers each arrow only once', () => {
    const adventure = new Adventure({
      explored: [],
      weapon: 'bow',
      defeated: [],
      hasBow: true,
      arrows: 2,
    });
    adventure.landedArrows.set('landed-arrow-test', {
      id: 'landed-arrow-test',
      position: [80, 31, 112],
      direction: [0, -0.6, -0.8],
    });
    const restored = new Adventure(
      readAdventure({ getItem: () => JSON.stringify(adventure.snapshot()) }),
    );
    expect(restored.landedArrows.get('landed-arrow-test')).toEqual(
      adventure.landedArrows.get('landed-arrow-test'),
    );
    expect(restored.interact('landed-arrow-test')).toBe('Recovered 1 arrow.');
    expect(restored.arrows).toBe(3);
    expect(restored.landedArrows.size).toBe(0);
    expect(() => restored.interact('landed-arrow-test')).toThrow(
      'Unknown adventure checkpoint',
    );
    expect(restored.arrows).toBe(3);
    expect(() =>
      readAdventure({
        getItem: () =>
          JSON.stringify({
            ...adventure.snapshot(),
            landedArrows: [
              {
                id: 'landed-arrow-bad',
                position: [0, 1, 2],
                direction: [0, 0, 0],
              },
            ],
          }),
      }),
    ).toThrow('invalid');
  });
  it('restarts cleared raids without erasing equipment, coins, arrows or the explored chart', () => {
    const adventure = new Adventure({
      explored: ['rotunda'],
      weapon: 'bow',
      melee: 'sword',
      hasBow: true,
      arrows: 7,
      coins: 19,
      health: 3,
      collectedArrows: [arrowPickups[0].id],
      defeated: enemySpawns.map((enemy) => enemy.id),
    });
    expect(adventure.restartRaids()).toContain('24 raiders');
    expect(adventure.defeated.size).toBe(0);
    expect(
      adventure.enemies.every((enemy) => enemy.health === enemyMaxHealth),
    ).toBe(true);
    expect(adventure.snapshot()).toMatchObject({
      weapon: 'bow',
      melee: 'sword',
      hasBow: true,
      arrows: 7,
      coins: 19,
      health: 3,
      explored: ['rotunda'],
      collectedArrows: [arrowPickups[0].id],
    });
    expect(adventure.restartRaids()).toContain('remaining');
    const saved = readAdventure({
      getItem: () => JSON.stringify(adventure.snapshot()),
    });
    expect(new Adventure(saved).defeated.size).toBe(0);
  });
  it('lets a controller interaction at a cleared checkpoint restore health and start another raid', () => {
    const adventure = new Adventure({
      explored: ['rotunda'],
      health: 2,
      defeated: enemySpawns.map((enemy) => enemy.id),
    });
    const checkpoint = landmarks.find((landmark) => landmark.id === 'rotunda');
    if (!checkpoint) throw new Error('Missing rotunda checkpoint.');
    const interaction = adventure.nearby(
      checkpoint.view,
      standingElevation(checkpoint.view),
      () => true,
    );
    expect(interaction?.id).toBe('checkpoint-rotunda');
    expect(interaction?.label).toContain('another raid');
    expect(adventure.interact('checkpoint-rotunda')).toContain('24 raiders');
    expect(adventure.health).toBe(5);
    expect(adventure.defeated.size).toBe(0);
    expect(adventure.explored.has('rotunda')).toBe(true);
  });
  it('marches the expanded raiding parties along real walkable approaches to house doors', () => {
    expect(enemySpawns.length).toBeGreaterThanOrEqual(24);
    for (const house of raidHouses) {
      const adventure = new Adventure();
      adventure.defeated = new Set(
        enemySpawns
          .filter((enemy) => enemy.houseId !== house.id)
          .map((enemy) => enemy.id),
      );
      const player: Point = [house.point[0] + 25, house.point[1]];
      let attacked = false;
      for (let frame = 0; frame < 100; frame++) {
        adventure.update(
          0.1,
          player,
          standingElevation(player),
          1.5,
          visitorRouteClear,
          visitorRouteClear,
        );
        attacked ||= adventure.snapshot().housesUnderAttack > 0;
      }
      expect(
        house.approaches.every((point) =>
          visitorRouteClear(point, house.point),
        ),
      ).toBe(true);
      expect(
        adventure.houses.find((item) => item.id === house.id)?.integrity,
        house.name,
      ).toBeLessThan(12);
      expect(attacked).toBe(true);
    }
  });

  it('attacks reachable civilians with a cooldown, gives them recovery time and respects walls', () => {
    const adventure = new Adventure();
    adventure.defeated = new Set(enemySpawns.slice(1).map((enemy) => enemy.id));
    const point = adventure.enemies[0].point;
    const player: Point = [point[0] + 25, point[1]];
    const civilians = [{ id: 'villager', point }];
    const tick = (delta: number, clear = true) =>
      adventure.update(
        delta,
        player,
        standingElevation(player),
        1.5,
        () => false,
        () => clear,
        civilians,
      );
    tick(0.1, false);
    expect(adventure.civilians.get('villager')?.health).toBe(3);
    adventure.enemies[0].rethink = 0;
    tick(0.1);
    expect(adventure.enemies[0].target.kind).toBe('civilian');
    expect(adventure.enemies[0].windup).toBeGreaterThan(0);
    expect(adventure.civilians.get('villager')?.health).toBe(3);
    tick(0.6);
    expect(adventure.civilians.get('villager')?.health).toBe(2);
    expect(adventure.snapshot().civiliansInDanger).toBe(1);
    tick(0.1);
    expect(adventure.civilians.get('villager')?.health).toBe(2);
    tick(1.5);
    tick(0.6);
    tick(1.5);
    tick(0.6);
    expect(adventure.civilians.get('villager')?.recovering).toBe(12);
    adventure.defeated.add(enemySpawns[0].id);
    tick(12);
    expect(adventure.civilians.get('villager')).toEqual({
      health: 3,
      frightened: 0,
      recovering: 0,
    });
  });

  it('lets the knight draw raiders away from a house and clear its raid without further damage', () => {
    const adventure = new Adventure();
    const enemy = adventure.enemies[3];
    const house = adventure.houses.find((item) => item.id === enemy.houseId);
    if (!house) throw new Error('Missing house for raiding party.');
    adventure.defeated = new Set(
      enemySpawns.filter((item) => item.id !== enemy.id).map((item) => item.id),
    );
    enemy.point = house.point;
    const player: Point = [house.point[0] + 25, house.point[1]];
    adventure.update(
      0.1,
      player,
      standingElevation(player),
      1.5,
      () => false,
      () => true,
    );
    expect(house.integrity).toBe(12);
    adventure.update(
      0.6,
      player,
      standingElevation(player),
      1.5,
      () => false,
      () => true,
    );
    expect(house.integrity).toBe(11);
    adventure.update(
      0.1,
      player,
      standingElevation(player),
      1.5,
      () => false,
      () => true,
    );
    expect(house.integrity).toBe(11);
    enemy.rethink = 0;
    adventure.update(
      0.1,
      enemy.point,
      standingElevation(enemy.point),
      1.5,
      () => false,
      () => true,
    );
    expect(enemy.target.kind).toBe('player');
    adventure.defeated.add(enemy.id);
    adventure.update(
      5,
      player,
      standingElevation(player),
      1.5,
      () => false,
      () => true,
    );
    expect(house.integrity).toBe(11);
    expect(adventure.snapshot().housesDefended).toBe(raidHouses.length);
    expect(adventure.snapshot().housesUnderAttack).toBe(0);
  });

  it('breaches a battered door without damaging buildings or attacking through an obstruction', () => {
    const adventure = new Adventure();
    const enemy = adventure.enemies[3];
    const house = adventure.houses.find((item) => item.id === enemy.houseId);
    if (!house) throw new Error('Missing house for raiding party.');
    adventure.defeated = new Set(
      enemySpawns.filter((item) => item.id !== enemy.id).map((item) => item.id),
    );
    enemy.point = house.point;
    house.integrity = 1;
    const player: Point = [house.point[0] + 25, house.point[1]];
    adventure.update(
      0.1,
      player,
      standingElevation(player),
      1.5,
      () => false,
      () => false,
    );
    expect(house.integrity).toBe(1);
    adventure.update(
      0.1,
      player,
      standingElevation(player),
      1.5,
      () => false,
      () => true,
    );
    expect(house.integrity).toBe(1);
    adventure.update(
      0.6,
      player,
      standingElevation(player),
      1.5,
      () => false,
      () => true,
    );
    expect(house.integrity).toBe(0);
    expect(adventure.snapshot().breachedHouses).toBe(1);
    adventure.update(
      2,
      player,
      standingElevation(player),
      1.5,
      () => false,
      () => true,
    );
    expect(enemy.target.kind).toBe('patrol');
    expect(house.integrity).toBe(0);
  });
  it('requires reachable pickups and banners, charts only raised checkpoints and validates its separate save', () => {
    const adventure = new Adventure();
    const pickup = weaponPickups[0].point;
    expect(adventure.snapshot().explored).toEqual([]);
    expect(
      adventure.nearby(pickup, standingElevation(pickup), () => false),
    ).toBeUndefined();
    expect(
      adventure.nearby(pickup, standingElevation(pickup), () => true)?.id,
    ).toBe('pickup-stick');
    adventure.interact('pickup-stick');
    expect(adventure.weapon).toBe('stick');
    adventure.health = 2;
    adventure.interact('checkpoint-gate');
    expect(adventure.health).toBe(5);
    expect(adventure.snapshot().explored).toEqual(['gate']);
    const saved = readAdventure({
      getItem: (key) =>
        key === adventureStorageKey
          ? JSON.stringify({
              ...adventure.snapshot(),
              explored: ['gate', 'gate', 'unknown'],
            })
          : null,
    });
    expect(new Adventure(saved).snapshot().explored).toEqual(['gate']);
    expect(() =>
      readAdventure({
        getItem: () => '{"explored":[],"defeated":[],"weapon":"laser"}',
      }),
    ).toThrow('invalid');
  });

  it('enforces weapon range, facing, walls and swing cooldown, with a stronger sword', () => {
    const home = enemySpawns[0].point;
    const origin: Point = [home[0], home[1] + 1];
    const height = standingElevation(origin);
    const adventure = new Adventure();
    adventure.attack(origin, height, 0, 1.5, () => true);
    expect(adventure.enemies[0].health).toBe(enemyMaxHealth);
    adventure.interact('pickup-sword');
    adventure.attack(origin, height, Math.PI, 1.5, () => true);
    expect(adventure.enemies[0].health).toBe(enemyMaxHealth);
    adventure.attackTime = 0;
    adventure.attack(origin, height, 0, 1.5, () => false);
    expect(adventure.enemies[0].health).toBe(enemyMaxHealth);
    adventure.attackTime = 0;
    adventure.attack([origin[0], origin[1] + 10], height, 0, 1.5, () => true);
    expect(adventure.enemies[0].health).toBe(enemyMaxHealth);
    adventure.attackTime = 0;
    adventure.attack(origin, height, 0, 1.5, () => true);
    expect(adventure.enemies[0].health).toBe(6);
    adventure.attack(origin, height, 0, 1.5, () => true);
    expect(adventure.enemies[0].health).toBe(6);
    adventure.update(
      0.5,
      origin,
      height,
      1.5,
      () => false,
      () => true,
    );
    adventure.attack(origin, height, 0, 1.5, () => true);
    expect(adventure.enemies[0].health).toBe(4);
    for (let i = 0; i < 2; i++) {
      adventure.attackTime = 0;
      adventure.attack(origin, height, 0, 1.5, () => true);
    }
    expect(adventure.defeated.has('gate-sprite')).toBe(true);
    expect(adventure.enemies[0].defeatTime).toBeGreaterThan(0);
    expect(adventure.coins).toBe(14);
    expect(adventure.hitEnemy('gate-sprite', 2, [0, 1])).toBe(false);
    expect(adventure.coins).toBe(14);
  });

  it('keeps enemies behind obstacles, grants hit immunity, and recovers at a checkpoint without losing gear', () => {
    const adventure = new Adventure();
    adventure.interact('pickup-stick');
    adventure.interact('checkpoint-rotunda');
    const point = enemySpawns[0].point;
    const height = standingElevation(point);
    adventure.update(
      0.1,
      point,
      height,
      1.5,
      () => false,
      () => false,
    );
    expect(adventure.health).toBe(5);
    adventure.enemies[0].rethink = 0;
    adventure.update(
      0.1,
      point,
      height,
      1.5,
      () => false,
      () => true,
    );
    expect(adventure.health).toBe(5);
    adventure.update(
      0.6,
      point,
      height,
      1.5,
      () => false,
      () => true,
    );
    expect(adventure.health).toBe(4);
    adventure.update(
      0.1,
      point,
      height,
      1.5,
      () => false,
      () => true,
    );
    expect(adventure.health).toBe(4);
    adventure.health = 1;
    adventure.invulnerability = 0;
    adventure.enemies[0].windup = 0.1;
    expect(
      adventure.update(
        0.1,
        point,
        height,
        1.5,
        () => false,
        () => true,
      ),
    ).toEqual(landmarks.find((item) => item.id === 'rotunda')?.view);
    expect(adventure.health).toBe(5);
    expect(adventure.weapon).toBe('stick');
    expect(adventure.snapshot().explored).toEqual(['rotunda']);
  });

  it('buys and eats reachable food at all three venues without charging at full health or without money', () => {
    const adventure = new Adventure();
    for (const shop of foodShops) {
      adventure.health = 1;
      adventure.eatTime = 0;
      expect(
        adventure.nearby(shop.point, standingElevation(shop.point), () => true)
          ?.id,
      ).toBe(`food-${shop.id}`);
      expect(
        adventure.nearby(
          shop.point,
          standingElevation(shop.point),
          () => false,
        ),
      ).toBeUndefined();
      adventure.interact(`food-${shop.id}`);
      expect(adventure.health).toBe(4);
      expect(adventure.eatTime).toBeGreaterThan(0);
    }
    expect(adventure.coins).toBe(3);
    expect(adventure.interact(`food-${foodShops[0].id}`)).toContain('Finish');
    expect(adventure.health).toBe(4);
    expect(adventure.coins).toBe(3);
    adventure.eatTime = 0;
    adventure.health = 5;
    adventure.interact(`food-${foodShops[0].id}`);
    expect(adventure.coins).toBe(3);
    adventure.health = 2;
    adventure.interact(`food-${foodShops[0].id}`);
    expect(adventure.health).toBe(5);
    expect(adventure.coins).toBe(0);
    adventure.health = 1;
    adventure.eatTime = 0;
    adventure.coins = 0;
    adventure.interact(`food-${foodShops[0].id}`);
    expect(adventure.health).toBe(1);
    const saved = readAdventure({
      getItem: () => JSON.stringify(adventure.snapshot()),
    });
    expect(new Adventure(saved).health).toBe(1);
    expect(new Adventure(saved).coins).toBe(0);
    expect(
      readAdventure({
        getItem: () => '{"explored":[],"weapon":null,"defeated":[]}',
      }).coins,
    ).toBe(12);
    expect(() =>
      readAdventure({
        getItem: () => '{"explored":[],"weapon":null,"defeated":[],"coins":-1}',
      }),
    ).toThrow('invalid');
  });

  it('collects finite arrows once, requires aiming, prevents rapid fire and preserves ammunition in saves', () => {
    const adventure = new Adventure();
    adventure.interact('pickup-stick');
    adventure.interact('pickup-bow');
    adventure.interact(arrowPickups[0].id);
    adventure.interact(arrowPickups[0].id);
    expect(adventure.arrows).toBe(8);
    adventure.looseArrow();
    expect(adventure.arrows).toBe(8);
    adventure.aiming = true;
    expect(adventure.looseArrow()).toBe('Arrow released.');
    expect(adventure.arrows).toBe(7);
    expect(adventure.looseArrow()).toBeNull();
    expect(adventure.arrows).toBe(7);
    const saved = readAdventure({
      getItem: () => JSON.stringify(adventure.snapshot()),
    });
    const restored = new Adventure(saved);
    expect(restored.arrows).toBe(7);
    expect(restored.collectedArrows.has(arrowPickups[0].id)).toBe(true);
    restored.switchWeapon();
    expect(restored.weapon).toBe('stick');
    restored.switchWeapon();
    expect(restored.weapon).toBe('bow');
    restored.aiming = true;
    restored.arrows = 0;
    expect(restored.looseArrow()).toContain('Out of arrows');
    expect(restored.arrows).toBe(0);
  });

  it('telegraphs attacks so they can be dodged, and damages only one melee target per swing', () => {
    const adventure = new Adventure();
    adventure.defeated = new Set(enemySpawns.slice(1).map((item) => item.id));
    const point = adventure.enemies[0].point;
    adventure.update(
      0.1,
      point,
      standingElevation(point),
      1.5,
      () => false,
      () => true,
    );
    expect(adventure.enemies[0].windup).toBeGreaterThan(0);
    expect(adventure.health).toBe(5);
    const away: Point = [point[0] + 15, point[1]];
    adventure.update(
      0.6,
      away,
      standingElevation(away),
      1.5,
      () => false,
      () => true,
    );
    expect(adventure.health).toBe(5);
    adventure.defeated.delete(enemySpawns[1].id);
    adventure.enemies[1].point = [point[0] + 0.6, point[1]];
    adventure.interact('pickup-sword');
    const origin: Point = [point[0], point[1] + 1];
    adventure.attack(origin, standingElevation(origin), 0, 1.5, () => true);
    expect(adventure.enemies[0].health).toBe(6);
    expect(adventure.enemies[1].health).toBe(8);
    expect(adventure.enemies[0].hurtTime).toBeGreaterThan(0);
  });
});
