import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import {
  DayNightClock,
  dayNightDuration,
  daylightAt,
  shadowTarget,
} from './lighting';

describe('continuous day and night', () => {
  it('wraps a full day and holds manual presets until cycling resumes', () => {
    const clock = new DayNightClock();
    const start = clock.hour;
    clock.advance(dayNightDuration);
    expect(clock.hour).toBeCloseTo(start);
    clock.set('night');
    clock.advance(100);
    expect(clock.hour).toBe(0);
    clock.set('cycle');
    clock.advance(dayNightDuration / 2);
    expect(clock.hour).toBeCloseTo(12);
  });

  it('smoothly lights dawn, dusk and midnight without abrupt intensity or color changes', () => {
    for (const hour of [0, 5, 6, 9, 14, 16, 18, 20, 24]) {
      const before = daylightAt(hour - 0.0001),
        after = daylightAt(hour + 0.0001);
      expect(Math.abs(before.direct - after.direct)).toBeLessThan(0.01);
      expect(Math.abs(before.ambient - after.ambient)).toBeLessThan(0.01);
      expect(
        Math.hypot(
          before.horizon.r - after.horizon.r,
          before.horizon.g - after.horizon.g,
          before.horizon.b - after.horizon.b,
        ),
      ).toBeLessThan(0.01);
    }
    expect(daylightAt(12).direct).toBeGreaterThan(daylightAt(0).direct);
    expect(daylightAt(0).night).toBe(1);
    expect(daylightAt(12).night).toBe(0);
  });
});

describe('stable close-range shadows', () => {
  it('snaps in the light plane rather than world axes for an oblique sun', () => {
    const sun = new THREE.Vector3(-0.45, 0.72, 0.53).normalize();
    const right = new THREE.Vector3(sun.z, 0, -sun.x).normalize();
    const up = new THREE.Vector3().crossVectors(sun, right);
    const point = new THREE.Vector3(219.37, 46.14, -207.24);
    const target = shadowTarget(point, sun, 65, 2048, new THREE.Vector3());
    const texel = 130 / 2048;
    for (const axis of [right, up]) {
      const coordinate = target.dot(axis) / texel;
      expect(coordinate).toBeCloseTo(Math.round(coordinate), 8);
    }
    expect(target.dot(sun)).toBeCloseTo(point.dot(sun), 8);
    expect(target.distanceTo(point)).toBeLessThan(texel);
  });

  it('does not shimmer for sub-texel motion within a snapped cell', () => {
    const sun = new THREE.Vector3(0, 0.8, 0.6);
    const right = new THREE.Vector3(1, 0, 0);
    const point = new THREE.Vector3(0, 0, 0);
    const a = shadowTarget(point, sun, 65, 2048, new THREE.Vector3());
    const b = shadowTarget(
      point.clone().addScaledVector(right, 0.01),
      sun,
      65,
      2048,
      new THREE.Vector3(),
    );
    expect(a.distanceTo(b)).toBeLessThan(0.00001);
  });

  it('supports an overhead sun without dividing by zero', () => {
    const point = new THREE.Vector3(4.123, 32, -8.456);
    const target = shadowTarget(
      point,
      new THREE.Vector3(0, 1, 0),
      65,
      2048,
      new THREE.Vector3(),
    );
    expect(target.y).toBe(point.y);
    expect(target.x / (130 / 2048)).toBeCloseTo(
      Math.round(target.x / (130 / 2048)),
      8,
    );
    expect(target.z / (130 / 2048)).toBeCloseTo(
      Math.round(target.z / (130 / 2048)),
      8,
    );
  });
});
