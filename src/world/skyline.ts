import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Materials } from './materials';

export function makePragueSkyline(materials: Materials) {
  const group = new THREE.Group();
  group.name = 'Distant Prague Castle and St Vitus';
  group.position.set(-800, 0, -1580);
  group.rotation.y = 0.25;
  const batches = new Map<THREE.Material, THREE.BufferGeometry[]>();
  const paint = (
    color: string,
    kind: Parameters<Materials['get']>[0] = 'plaster',
  ) => {
    const material = materials.get(kind, color).clone();
    material.fog = true;
    return material;
  };
  const hill = paint('#879a8a', 'grass'),
    stone = paint('#aeb6ad', 'stone');
  const walls = paint('#bec0ad'),
    roof = paint('#929994', 'slate'),
    dark = paint('#737f7d', 'metal');
  const emit = (geometry: THREE.BufferGeometry, material: THREE.Material) => {
    const normalized = geometry.index ? geometry.toNonIndexed() : geometry;
    if (normalized !== geometry) geometry.dispose();
    const batch = batches.get(material) ?? [];
    batch.push(normalized);
    batches.set(material, batch);
  };
  const box = (
    w: number,
    h: number,
    d: number,
    x: number,
    y: number,
    z: number,
    material = walls,
  ) => emit(new THREE.BoxGeometry(w, h, d).translate(x, y, z), material);
  const cone = (
    radius: number,
    height: number,
    x: number,
    y: number,
    z: number,
    material = dark,
  ) =>
    emit(
      new THREE.ConeGeometry(radius, height, 8).translate(x, y, z),
      material,
    );
  const backdrop = new THREE.PlaneGeometry(5200, 5000, 40, 40);
  backdrop.rotateX(-Math.PI / 2);
  const positions = backdrop.attributes.position;
  for (let i = 0; i < positions.count; i++) {
    const x = positions.getX(i),
      z = positions.getZ(i);
    positions.setY(
      i,
      -80 + 14 * (1 + Math.sin(x * 0.002 + 0.6)) * (1 + Math.cos(z * 0.0025)),
    );
  }
  backdrop.computeVertexNormals();
  emit(backdrop, hill);
  emit(
    new THREE.SphereGeometry(1, 40, 16, 0, Math.PI * 2, 0, Math.PI / 2)
      .scale(400, 145, 235)
      .translate(0, -80, 0),
    hill,
  );
  box(320, 8, 95, 0, 62, 0, stone);
  const palace = (
    x: number,
    z: number,
    width: number,
    depth: number,
    height: number,
  ) => {
    box(width, height, depth, x, 66 + height / 2, z);
    emit(
      new THREE.ConeGeometry(1, 7, 4)
        .rotateY(Math.PI / 4)
        .scale(width / Math.SQRT2, 1, depth / Math.SQRT2)
        .translate(x, 66 + height + 3.5, z),
      roof,
    );
    for (let u = -width / 2 + 5; u < width / 2 - 3; u += 9)
      box(2, 3, 0.15, x + u, 66 + height * 0.6, z + depth / 2 + 0.1, dark);
  };
  palace(-104, 13, 105, 28, 17);
  palace(94, 13, 125, 28, 18);
  palace(-135, -24, 30, 65, 16);
  palace(134, -26, 30, 65, 16);
  palace(0, -40, 255, 24, 16);
  box(38, 27, 78, 0, 79.5, -8, stone);
  emit(
    new THREE.ConeGeometry(1, 19, 4)
      .rotateY(Math.PI / 4)
      .scale(42 / Math.SQRT2, 1, 84 / Math.SQRT2)
      .translate(0, 102.5, -8),
    roof,
  );
  for (const x of [-14, 14]) {
    box(11, 45, 12, x, 88.5, 28, stone);
    cone(7, 26, x, 124, 28);
    box(0.65, 5, 0.65, x, 139.5, 28, dark);
    box(3, 0.65, 0.65, x, 140.5, 28, dark);
    for (const dx of [-5, 5]) cone(1.3, 9, x + dx, 115, 33);
  }
  box(14, 57, 14, 28, 94.5, -7, stone);
  cone(10, 13, 28, 129.5, -7, roof);
  emit(
    new THREE.SphereGeometry(4, 12, 8).scale(1, 0.65, 1).translate(28, 138, -7),
    dark,
  );
  cone(3.2, 12, 28, 146, -7);
  for (let z = -38; z <= 18; z += 8)
    for (const side of [-1, 1]) {
      box(2.2, 30, 3, side * 20, 81, z, stone);
      cone(1.8, 6, side * 20, 99, z, stone);
    }
  for (const [material, geometries] of batches) {
    const geometry = mergeGeometries(geometries);
    if (!geometry)
      throw new Error('Could not assemble the distant Prague skyline.');
    geometries.forEach((item) => item.dispose());
    group.add(new THREE.Mesh(geometry, material));
  }
  return group;
}
