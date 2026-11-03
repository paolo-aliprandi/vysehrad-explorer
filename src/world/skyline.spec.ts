import * as THREE from 'three';
import { expect, it, vi } from 'vitest';
import { Materials } from './materials';
import { makePragueSkyline } from './skyline';

it('grounds the distant castle hill in continuous backdrop terrain rather than a floating hemisphere', () => {
  const materials = new Materials();
  const get = vi
    .spyOn(materials, 'get')
    .mockImplementation(
      () => new THREE.MeshToonMaterial({ side: THREE.DoubleSide }),
    );
  const skyline = makePragueSkyline(materials);
  skyline.updateMatrixWorld(true);
  for (const [x, z] of [
    [450, 0],
    [0, 350],
    [-600, 500],
  ]) {
    const origin = new THREE.Vector3(x, 200, z).applyMatrix4(
      skyline.matrixWorld,
    );
    const ray = new THREE.Raycaster(
      origin,
      new THREE.Vector3(0, -1, 0),
      0,
      400,
    );
    const hits = ray.intersectObject(skyline, true);
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0].point.y).toBeLessThan(0);
  }
  get.mockRestore();
  materials.dispose();
  skyline.traverse((object) => {
    if (object instanceof THREE.Mesh) {
      object.geometry.dispose();
      const entries = Array.isArray(object.material)
        ? object.material
        : [object.material];
      entries.forEach((material) => material.dispose());
    }
  });
});
