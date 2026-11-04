import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { advanceArrow, launchArrow } from './arrow-physics';

describe('ballistic arrows', () => {
  it('reaches the aimed point on a low arc at bow speed rather than lobbing upward', () => {
    const origin = new THREE.Vector3(7, 3, -9);
    const target = new THREE.Vector3(7, 4, -39);
    const flight = launchArrow(origin, target, 60, 9.8);
    expect(flight.velocity.length()).toBeCloseTo(60, 8);
    expect(flight.velocity.y).toBeLessThan(6);
    const time = (target.z - origin.z) / flight.velocity.z;
    advanceArrow(flight, time, 9.8, () => null);
    expect(flight.position.distanceTo(target)).toBeLessThan(1e-8);
    expect(flight.velocity.y).toBeLessThan(0);
  });

  it('has the same gravity-driven trajectory at different frame rates, without an age expiry', () => {
    const fast = launchArrow(
      new THREE.Vector3(0, 100, 0),
      new THREE.Vector3(0, 100, -100),
      60,
      9.8,
    );
    const slow = {
      position: fast.position.clone(),
      velocity: fast.velocity.clone(),
    };
    for (let frame = 0; frame < 480; frame++)
      advanceArrow(fast, 1 / 120, 9.8, () => null);
    for (let frame = 0; frame < 80; frame++)
      advanceArrow(slow, 1 / 20, 9.8, () => null);
    expect(fast.position.distanceTo(slow.position)).toBeLessThan(1e-8);
    expect(fast.velocity.distanceTo(slow.velocity)).toBeLessThan(1e-8);
  });

  it('sweeps the arrow tip through thin surfaces and stops exactly at the first contact', () => {
    const flight = launchArrow(
      new THREE.Vector3(0, 2, 0),
      new THREE.Vector3(0, 2, -30),
      60,
      9.8,
    );
    const wall = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0.21);
    const impact = advanceArrow(flight, 0.05, 9.8, (from, to) => {
      const contact = wall.intersectLine(
        new THREE.Line3(from, to),
        new THREE.Vector3(),
      );
      return contact ? { point: contact } : null;
    });
    expect(impact?.point.z).toBeCloseTo(-0.21, 8);
    if (!impact) throw new Error('The arrow missed the thin wall.');
    expect(flight.position.equals(impact.point)).toBe(true);
  });
});
