import * as THREE from 'three';

export type TimeOfDay = 'cycle' | 'golden' | 'day' | 'night';
export const dayNightDuration = 24 * 60;
const presetHours = { golden: 16, day: 12, night: 0 };

export class DayNightClock {
  hour = presetHours.golden;
  mode: TimeOfDay = 'cycle';

  set(mode: TimeOfDay) {
    this.mode = mode;
    if (mode !== 'cycle') this.hour = presetHours[mode];
  }

  advance(seconds: number) {
    if (this.mode === 'cycle')
      this.hour = (this.hour + (seconds * 24) / dayNightDuration) % 24;
  }
}

const lightColors = {
  night: [
    '#354b66',
    '#172c4e',
    '#7186a1',
    '#a3bfdf',
    '#7a8aa0',
    '#afc9f0',
    '#244b65',
    '#52758a',
  ],
  golden: [
    '#e3dfce',
    '#86afb3',
    '#f9eacc',
    '#dce7ef',
    '#aaa998',
    '#ffe9bd',
    '#387f8a',
    '#81b8ad',
  ],
  day: [
    '#dce5df',
    '#70abc9',
    '#fff7df',
    '#dce7ef',
    '#aaa998',
    '#f5f1e4',
    '#387f8a',
    '#81b8ad',
  ],
};
const palettes = Object.fromEntries(
  Object.entries(lightColors).map(([name, colors]) => [
    name,
    colors.map((color) => new THREE.Color(color)),
  ]),
) as Record<keyof typeof lightColors, THREE.Color[]>;
const lightLevels = {
  night: { ambient: 1.25, direct: 0.8, exposure: 0.85, fog: 0.00115, night: 1 },
  golden: { ambient: 1.7, direct: 2.6, exposure: 1, fog: 0.0007, night: 0 },
  day: { ambient: 1.75, direct: 2.8, exposure: 1, fog: 0.0006, night: 0 },
};
const keyframes: readonly (readonly [number, keyof typeof lightColors])[] = [
  [0, 'night'],
  [5, 'night'],
  [6, 'golden'],
  [9, 'day'],
  [14, 'day'],
  [16, 'golden'],
  [18, 'golden'],
  [20, 'night'],
  [24, 'night'],
];

export function daylightAt(hour: number) {
  const wrapped = ((hour % 24) + 24) % 24;
  const next = keyframes.findIndex(([time]) => time > wrapped);
  const [start, a] = keyframes[next - 1];
  const [end, b] = keyframes[next];
  const t = THREE.MathUtils.smoothstep(wrapped, start, end);
  const colors = palettes[a].map((color, i) =>
    color.clone().lerp(palettes[b][i], t),
  );
  const interpolate = (key: keyof (typeof lightLevels)['night']) =>
    THREE.MathUtils.lerp(lightLevels[a][key], lightLevels[b][key], t);
  const angle = ((wrapped - 6) / 24) * Math.PI * 2;
  const sun = new THREE.Vector3(
    Math.cos(angle),
    Math.sin(angle) * Math.sin(Math.PI / 3),
    Math.sin(angle) * Math.cos(Math.PI / 3),
  );
  const moonlight = sun.y < 0;
  if (moonlight) sun.negate();
  return {
    horizon: colors[0],
    zenith: colors[1],
    cloud: colors[2],
    ambientColor: colors[3],
    groundColor: colors[4],
    directColor: colors[5],
    deepWater: colors[6],
    shallowWater: colors[7],
    ambient: interpolate('ambient'),
    direct: interpolate('direct') * Math.min(1, sun.y * 8),
    exposure: interpolate('exposure'),
    fog: interpolate('fog'),
    night: interpolate('night'),
    sun,
  };
}

export function shadowTarget(
  position: THREE.Vector3,
  sun: THREE.Vector3,
  radius: number,
  resolution: number,
  target: THREE.Vector3,
) {
  const horizontal = Math.hypot(sun.x, sun.z);
  const rx = horizontal < 0.00001 ? 1 : sun.z / horizontal,
    rz = horizontal < 0.00001 ? 0 : -sun.x / horizontal;
  const vx = sun.y * rz,
    vy = horizontal,
    vz = -sun.y * rx;
  const texel = (radius * 2) / resolution;
  const u = position.x * rx + position.z * rz;
  const v = position.x * vx + position.y * vy + position.z * vz;
  const du = Math.round(u / texel) * texel - u;
  const dv = Math.round(v / texel) * texel - v;
  return target.set(
    position.x + rx * du + vx * dv,
    position.y + vy * dv,
    position.z + rz * du + vz * dv,
  );
}
