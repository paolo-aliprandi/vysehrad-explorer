import * as THREE from 'three';
import { cathedralVault } from './cathedral';

it('builds raised ribbed vault surfaces rather than flat ceilings, with a higher central nave', () => {
  const central = cathedralVault(9.2, 6, 10.5, 3.7);
  const side = cathedralVault(4.4, 6, 5.6, 2.9);
  const material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
  const mesh = (geometry: THREE.BufferGeometry) => {
    const result = new THREE.Mesh(geometry, material);
    result.updateMatrixWorld(true);
    return result;
  };
  const middleRay = new THREE.Raycaster(
    new THREE.Vector3(0, 16, 0),
    new THREE.Vector3(0, -1, 0),
  );
  const centralHeight = middleRay.intersectObject(mesh(central))[0].point.y;
  const sideHeight = middleRay.intersectObject(mesh(side))[0].point.y;
  expect(centralHeight).toBeCloseTo(14.2);
  expect(sideHeight).toBeCloseTo(8.5);
  const cornerRay = new THREE.Raycaster(
    new THREE.Vector3(4.5, 16, 2.9),
    new THREE.Vector3(0, -1, 0),
  );
  expect(cornerRay.intersectObject(mesh(central))[0].point.y).toBeLessThan(12);
  expect(centralHeight - sideHeight).toBeGreaterThan(5);
  central.dispose();
  side.dispose();
  material.dispose();
});
