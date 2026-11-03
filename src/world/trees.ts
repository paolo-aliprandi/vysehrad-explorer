import * as THREE from 'three';
import {
  mergeGeometries,
  mergeVertices,
} from 'three/addons/utils/BufferGeometryUtils.js';

export function treeTrunkGeometry() {
  const stem = new THREE.CylinderGeometry(0.16, 0.43, 9.5, 10, 4);
  const positions = stem.attributes.position;
  for (let i = 0; i < positions.count; i++) {
    const height = (positions.getY(i) + 4.75) / 9.5;
    positions.setX(i, positions.getX(i) + height * height * 0.28);
  }
  stem.computeVertexNormals();
  const branches = [
    [1.65, 3.7, 0.4],
    [-1.25, 3.2, 1.15],
    [-0.5, 4.1, -1.5],
  ].map(([x, y, z]) => {
    const start = new THREE.Vector3(0.1, 0.8, 0);
    const end = new THREE.Vector3(x, y, z);
    const direction = end.clone().sub(start);
    const branch = new THREE.CylinderGeometry(
      0.055,
      0.17,
      direction.length(),
      7,
    );
    branch.applyQuaternion(
      new THREE.Quaternion().setFromUnitVectors(
        new THREE.Vector3(0, 1, 0),
        direction.normalize(),
      ),
    );
    branch.translate(...start.add(end).multiplyScalar(0.5).toArray());
    return branch;
  });
  const geometry = mergeGeometries([stem, ...branches]);
  stem.dispose();
  branches.forEach((branch) => branch.dispose());
  if (!geometry) throw new Error('Could not assemble branching tree trunks.');
  return geometry;
}

export function treeCrownGeometry(evergreen = false) {
  const source = evergreen
    ? new THREE.ConeGeometry(1, 1, 16, 4)
    : new THREE.SphereGeometry(1, 16, 10);
  const positions = source.attributes.position;
  for (let i = 0; i < positions.count; i++) {
    const x = positions.getX(i),
      y = positions.getY(i),
      z = positions.getZ(i);
    const angle = Math.atan2(z, x);
    const radial = evergreen
      ? 1 + 0.1 * Math.sin(angle * 6 + y * 3) * Math.cos(y * 4)
      : 1 +
        0.1 * Math.sin(angle * 3 + y * 2) * Math.cos(y * 3 - angle) +
        0.035 * Math.sin(angle * 7 + y * 5);
    positions.setXYZ(
      i,
      x * radial,
      y + (evergreen ? 0.035 : 0.065) * Math.sin(x * 7 + z * 5),
      z * radial,
    );
  }
  source.deleteAttribute('normal');
  source.deleteAttribute('uv');
  const geometry = mergeVertices(source, 0.00001);
  source.dispose();
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}
