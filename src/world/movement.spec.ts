import { stepWalker } from './movement';
import type { Point } from './geo';

type WalkingWorld = Parameters<typeof stepWalker>[4];
const flat: WalkingWorld = {
  terrain: () => 0,
  support: () => 0,
  blocked: () => false,
  steps: () => false,
  headroom: (_point, height, rise) => height + rise,
};
const initial = { point: [0, 0] as Point, height: 0, velocity: 0 };

it.each([30, 60, 120])(
  'lands on a short solid wall after a useful jump at %i FPS',
  (fps) => {
    const wall = (p: Point) => p[0] >= 1.2 && p[0] <= 2.8;
    const world = {
      ...flat,
      blocked: (p: Point, height: number) => wall(p) && height < 1.1 - 0.02,
      support: (p: Point, ceiling: number) =>
        wall(p) && ceiling >= 1.1 ? 1.1 : 0,
    };
    let state = initial;
    let apex = 0;
    for (let frame = 0; frame < fps * 1.5; frame++) {
      state = stepWalker(
        state,
        [state.point[0] < 2 ? 5 / fps : 0, 0],
        1 / fps,
        frame === 0,
        world,
        1.2,
      );
      apex = Math.max(apex, state.height);
    }
    expect(apex * 1.2).toBeGreaterThan(1.7);
    expect(state.point[0]).toBeGreaterThan(1.2);
    expect(state.height).toBeCloseTo(1.1);
    expect(state.velocity).toBe(0);
  },
);

it('cannot walk through low obstacles or jump through a tall wall', () => {
  for (const [height, jump] of [
    [0.88, false],
    [3, true],
  ] as const) {
    const world = {
      ...flat,
      blocked: (p: Point, y: number) => p[0] >= 1.2 && y < height,
    };
    let state = initial;
    for (let frame = 0; frame < 90; frame++)
      state = stepWalker(
        state,
        [0.1, 0],
        1 / 60,
        jump && frame === 0,
        world,
        1.2,
      );
    expect(state.point[0]).toBeLessThan(1.2);
    expect(state.height).toBe(0);
  }
});

it('rejects cliff climbing even when each individual movement rises less than the step allowance', () => {
  const terrain = ([x]: Point) => Math.max(0, x) * 3;
  const world = { ...flat, terrain, support: terrain };
  let state = { ...initial, point: [-0.5, 0] as Point };
  for (let frame = 0; frame < 120; frame++)
    state = stepWalker(state, [0.04, 0], 1 / 60, false, world, 1.2);
  expect(state.height).toBeLessThan(0.1);
  expect(state.point[0]).toBeLessThan(0.04);
});

it('does not allow repeated jumps to ratchet up a steep hillside', () => {
  const terrain = ([x]: Point) => Math.max(0, x) * 3;
  const world = { ...flat, terrain, support: terrain };
  let state = { ...initial, point: [-0.5, 0] as Point };
  let highest = 0;
  for (let frame = 0; frame < 300; frame++) {
    state = stepWalker(state, [0.06, 0], 1 / 60, frame % 45 === 0, world, 1.2);
    highest = Math.max(highest, state.height);
  }
  expect(highest).toBeLessThan(1.65);
});

it('preserves ordinary slopes and authored stair risers', () => {
  for (const stairs of [false, true]) {
    const terrain = ([x]: Point) =>
      stairs ? Math.floor(x / 0.3) * 0.32 : x * 0.5;
    const world = { ...flat, terrain, support: terrain, steps: () => stairs };
    let state = initial;
    for (let frame = 0; frame < 60; frame++)
      state = stepWalker(state, [0.05, 0], 1 / 60, false, world, 1.2);
    expect(state.point[0]).toBeCloseTo(3);
    expect(state.height).toBeCloseTo(terrain(state.point));
  }
});

it('falls off a ledge instead of snapping to the lower floor or hovering on the old support', () => {
  const terrain = ([x]: Point) => (x < 1 ? 2 : 0);
  const world = { ...flat, terrain, support: terrain };
  let state = stepWalker(
    { ...initial, point: [0.95, 0], height: 2 },
    [0.1, 0],
    1 / 60,
    false,
    world,
    1.2,
  );
  expect(state.height).toBeGreaterThan(1.9);
  expect(state.velocity).toBeLessThan(0);
  for (let frame = 0; frame < 60; frame++)
    state = stepWalker(state, [0, 0], 1 / 60, false, world, 1.2);
  expect(state.height).toBe(0);
});

it('stops rising at a low ceiling and falls back without passing through it', () => {
  const world = {
    ...flat,
    headroom: (_p: Point, height: number, rise: number) =>
      Math.min(0.5, height + rise),
  };
  let state = initial;
  let apex = 0;
  for (let frame = 0; frame < 90; frame++) {
    state = stepWalker(state, [0, 0], 1 / 60, frame === 0, world, 1.2);
    apex = Math.max(apex, state.height);
  }
  expect(apex).toBeCloseTo(0.5);
  expect(state.height).toBe(0);
});
