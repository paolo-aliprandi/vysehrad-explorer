import type { Point } from './geo';

type Walker = { point: Point; height: number; velocity: number };
type WalkingWorld = {
  terrain: (point: Point) => number;
  support: (point: Point, ceiling: number) => number;
  blocked: (point: Point, height: number) => boolean;
  steps: (point: Point) => boolean;
  headroom: (point: Point, height: number, rise: number) => number;
};

function steep(point: Point, terrain: WalkingWorld['terrain']) {
  const [x, z] = point;
  const dx = (terrain([x + 0.35, z]) - terrain([x - 0.35, z])) / 0.7;
  const dz = (terrain([x, z + 0.35]) - terrain([x, z - 0.35])) / 0.7;
  return Math.hypot(dx, dz) > 1;
}

export function stepWalker(
  state: Walker,
  motion: Point,
  delta: number,
  jump: boolean,
  world: WalkingWorld,
  scale: number,
): Walker {
  const step = 0.28 / scale;
  let point = state.point;
  let height = state.height;
  let velocity = state.velocity;
  const ground = world.support(point, height + 0.02);
  const grounded = velocity <= 0 && Math.abs(height - ground) < 0.03;
  if (
    jump &&
    grounded &&
    (ground > world.terrain(point) + 0.1 ||
      world.steps(point) ||
      !steep(point, world.terrain))
  )
    velocity = 9.6 / scale;
  velocity -= (24 * delta) / scale;
  const proposed = height + velocity * delta;
  if (proposed > height) {
    height = world.headroom(point, height, proposed - height);
    if (height < proposed - 0.00001) velocity = 0;
  } else height = proposed;

  const count = Math.max(1, Math.ceil((Math.hypot(...motion) * scale) / 0.25));
  const move = (next: Point) => {
    const floor = world.terrain(next);
    const allowance =
      grounded && velocity <= 0
        ? world.steps(next)
          ? 0.48 / scale
          : step
        : 0.02;
    if (floor > height + allowance) return;
    if (
      floor > world.terrain(point) + 0.0001 &&
      height < floor + step &&
      !world.steps(next) &&
      steep(next, world.terrain)
    )
      return;
    if (!world.blocked(next, height)) point = next;
  };
  for (let i = 0; i < count; i++) {
    move([point[0] + motion[0] / count, point[1]]);
    move([point[0], point[1] + motion[1] / count]);
  }
  const floor = world.support(
    point,
    Math.max(state.height, height) + (grounded && velocity <= 0 ? step : 0.02),
  );
  if (
    height <= floor ||
    (grounded &&
      velocity <= 0 &&
      height - floor < step &&
      (world.steps(point) || !steep(point, world.terrain)))
  ) {
    height = floor;
    velocity = 0;
  }
  return { point, height, velocity };
}
