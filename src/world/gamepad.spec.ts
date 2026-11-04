import { describe, expect, it } from 'vitest';
import { ControllerReader } from './gamepad';

function pad(axes = [0, 0, 0, 0], down: number[] = [], index = 0): Gamepad {
  return {
    id: 'Nintendo Switch Pro Controller',
    index,
    connected: true,
    mapping: 'standard',
    axes,
    buttons: Array.from({ length: 17 }, (_, i) => ({
      pressed: down.includes(i),
      touched: down.includes(i),
      value: down.includes(i) ? 1 : 0,
    })),
    timestamp: 0,
    vibrationActuator: null,
  };
}

describe('Switch controller input', () => {
  it('uses D-pad reading actions without changing A interactions or B jumps', () => {
    const reader = new ControllerReader();
    expect(reader.read([pad(undefined, [12])], 0).pressed.has('read')).toBe(
      true,
    );
    expect(reader.read([pad(undefined, [12])], 10).pressed.has('read')).toBe(
      false,
    );
    expect(
      reader.read([pad(undefined, [13])], 20).pressed.has('readScroll'),
    ).toBe(true);
    expect(reader.read([pad(undefined, [1])], 30).pressed.has('interact')).toBe(
      true,
    );
    expect(reader.read([pad(undefined, [0])], 40).pressed.has('jump')).toBe(
      true,
    );
  });
  it('keeps B separate from photo mode and reads ZL aim with edge-triggered ZR shots', () => {
    const reader = new ControllerReader();
    expect([...reader.read([pad(undefined, [0])], 0).pressed]).toEqual([
      'jump',
    ]);
    const aiming = reader.read([pad(undefined, [6, 7])], 1);
    expect(aiming.aim).toBe(true);
    expect(aiming.pressed.has('shoot')).toBe(true);
    expect(reader.read([pad(undefined, [6, 7])], 2).pressed.has('shoot')).toBe(
      false,
    );
    expect(reader.read([pad()], 3).aim).toBe(false);
  });
  it('removes stick drift while preserving slow movement and bounded diagonals', () => {
    const reader = new ControllerReader();
    expect(reader.read([pad([0.1, -0.1, 0.08, 0.03])], 0).move).toEqual([0, 0]);
    const slow = reader.read([pad([0.5, 0, 0, -0.6])], 1);
    expect(slow.move[0]).toBeGreaterThan(0);
    expect(slow.move[0]).toBeLessThan(0.5);
    expect(slow.look[1]).toBeLessThan(0);
    expect(Math.hypot(...reader.read([pad([1, 1])], 2).move)).toBeCloseTo(1);
  });

  it('edges Nintendo face buttons once, repeats menu navigation and releases on disconnect', () => {
    const reader = new ControllerReader();
    expect([...reader.read([pad(undefined, [0, 1, 8, 9])], 0).pressed]).toEqual(
      ['jump', 'interact', 'map', 'menu'],
    );
    expect(reader.read([pad(undefined, [0, 1, 8, 9])], 10).pressed.size).toBe(
      0,
    );
    expect(reader.read([pad(undefined, [13])], 20).pressed.has('next')).toBe(
      true,
    );
    expect(reader.read([pad(undefined, [13])], 200).pressed.size).toBe(0);
    expect(reader.read([pad(undefined, [13])], 421).pressed.has('next')).toBe(
      true,
    );
    const disconnected = reader.read([null], 500);
    expect(disconnected.move).toEqual([0, 0]);
    expect(disconnected.pressed.size).toBe(0);
    expect(disconnected.name).toBeNull();
    expect(reader.read([pad(undefined, [0])], 510).pressed.has('jump')).toBe(
      true,
    );
  });

  it('handles sparse slots, selects a mapped pad, and refuses unknown raw layouts', () => {
    const reader = new ControllerReader();
    const raw = { ...pad([1, 1]), mapping: '' as GamepadMappingType };
    expect(reader.read([raw], 0).supported).toBe(false);
    expect(
      reader.read([null, raw, pad([0, -1], [4, 7, 10], 2)], 1),
    ).toMatchObject({
      supported: true,
      move: [0, -1],
      sprint: true,
      lift: -1,
      zoom: -1,
    });
  });
});
