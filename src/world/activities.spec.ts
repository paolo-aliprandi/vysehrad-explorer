import {
  benchApproach,
  benches,
  casemates,
  uphillCasemates,
  indoorBlocked,
  nearbyActivity,
  safeSeat,
  type Activity,
} from './activities';
import { blocked, upperElevation, standingElevation, siteProps } from './geo';

describe('reachable activities', () => {
  it('offers the casemate entrance from an unblocked approach at the doorway', () => {
    for (const entry of [casemates, uphillCasemates]) {
      const height = standingElevation(entry.point);
      expect(blocked(entry.point, height)).toBe(false);
      expect(nearbyActivity([entry], entry.point, height)?.id).toBe(entry.id);
    }
  });
  it('can target the solid fireplace without making it walk-through', () => {
    const bowl = siteProps.find((prop) => prop.id === 'fire-bowl');
    if (!bowl) throw new Error('Missing fireplace bowl.');
    const height = upperElevation(...bowl.point);
    const fire: Activity = {
      id: 'fire',
      kind: 'fire',
      point: bowl.point,
      label: 'Rest',
    };
    expect(blocked(bowl.point, height)).toBe(true);
    expect(
      nearbyActivity(
        [fire],
        [bowl.point[0] + 2, bowl.point[1]],
        height,
        undefined,
        (point, activity) =>
          !blocked(point, height, {
            ignoredSiteProp: activity.kind === 'fire' ? 'fire-bowl' : undefined,
          }),
      )?.id,
    ).toBe('fire');
    expect(blocked(bowl.point, height)).toBe(true);
  });
  const bench: Activity & { kind: 'bench' } = {
    id: 'seat',
    kind: 'bench',
    point: [0, 0],
    label: 'Sit',
    angle: Math.PI / 2,
  };
  const tree: Activity = {
    id: 'tree',
    kind: 'tree',
    point: [2, 0],
    label: 'Chop',
    index: 0,
  };

  it('chooses a reachable activity instead of a closer one across a wall', () => {
    expect(
      nearbyActivity(
        [bench, tree],
        [0.2, 0],
        0,
        () => 0,
        (point) => point[0] > 1.5,
      )?.id,
    ).toBe('tree');
    expect(
      nearbyActivity(
        [bench, tree],
        [0.2, 0],
        0,
        () => 0,
        () => false,
      ),
    ).toBeUndefined();
  });

  it('does not reach trees from too far away or interact through another floor', () => {
    expect(nearbyActivity([tree], [-1, 0], 0, () => 0)).toBeUndefined();
    expect(nearbyActivity([tree], [2, 0], 4, () => 0)).toBeUndefined();
    expect(nearbyActivity([tree], [2, 0], 0, () => 4)).toBeUndefined();
    expect(nearbyActivity([bench], [3, 0], 0, () => 0)?.id).toBe('seat');
  });

  it('approaches the front of a rotated bench and refuses a seat on a different level', () => {
    expect(benchApproach(bench)[0]).toBeCloseTo(1.4);
    expect(benchApproach(bench)[1]).toBeCloseTo(0);
    const clearBench = benches.find(
      (item) =>
        !blocked(item.point, upperElevation(...item.point), {
          ignoredFurniture: item.point,
        }),
    );
    if (!clearBench)
      throw new Error('No walkable rendered bench is available.');
    const floor = upperElevation(...clearBench.point);
    expect(safeSeat(clearBench, floor)).toBe(true);
    expect(safeSeat(clearBench, floor - 5)).toBe(false);
  });

  it('interacts with a solid bench from its open front rather than tracing through the seat', () => {
    const seat = benches[0];
    const approach = benchApproach(seat);
    const height = upperElevation(...seat.point);
    expect(blocked(seat.point, height)).toBe(true);
    expect(blocked(approach, height)).toBe(false);
    expect(
      nearbyActivity(
        [seat],
        approach,
        height,
        undefined,
        (point) => !blocked(point, height),
      )?.id,
    ).toBe(seat.id);
    expect(safeSeat(seat, height)).toBe(true);
  });
});

it('keeps the cathedral central aisle open while blocking pews, columns, the altar and exterior', () => {
  for (let z = 13; z > -11; z -= 0.2) expect(indoorBlocked([0, z])).toBe(false);
  for (const point of [
    [3, 7],
    [-3, -4],
    [4.6, 12],
    [-4.6, 0],
    [0, -13],
    [9, 0],
    [0, 18],
  ] as const)
    expect(indoorBlocked([...point])).toBe(true);
  expect(indoorBlocked([7, 0])).toBe(false);
});

it('opens both side aisles for the full nave and connects all three entrance doors across the rear', () => {
  for (const x of [-6.8, 0, 6.8])
    for (let z = -10; z <= 14; z += 0.2)
      expect(indoorBlocked([x, z])).toBe(false);
  for (let x = -7; x < 7; x += 0.2) expect(indoorBlocked([x, 14])).toBe(false);
});
