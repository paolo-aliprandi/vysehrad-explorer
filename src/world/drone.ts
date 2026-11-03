import * as THREE from 'three';
import { Materials } from './materials';

export function makeDrone(materials: Materials) {
  const group = new THREE.Group();
  group.name = 'Flight drone';
  const box = new THREE.BoxGeometry(1, 1, 1);
  const motor = new THREE.CylinderGeometry(0.035, 0.03, 0.055, 12);
  const lens = new THREE.CylinderGeometry(0.028, 0.028, 0.016, 16);
  const blade = new THREE.BoxGeometry(0.32, 0.007, 0.025);
  const sweep = new THREE.CircleGeometry(0.16, 24).rotateX(-Math.PI / 2);
  const blur = new THREE.MeshBasicMaterial({
    color: '#343a3d',
    transparent: true,
    opacity: 0.12,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const shell = materials.get('plaster', '#bec4c2');
  const dark = materials.get('metal', '#343b3e');
  const rotors: THREE.Group[] = [];
  const add = (
    geometry: THREE.BufferGeometry,
    material: THREE.Material,
    position: [number, number, number],
    scale: [number, number, number] = [1, 1, 1],
  ) => {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(...position);
    mesh.scale.set(...scale);
    mesh.castShadow = true;
    group.add(mesh);
    return mesh;
  };
  add(box, shell, [0, 0.06, 0], [0.19, 0.12, 0.32]);
  add(box, shell, [0, 0.12, -0.025], [0.15, 0.035, 0.21]);
  add(box, dark, [0, -0.025, 0.135], [0.07, 0.075, 0.06]);
  add(box, dark, [0, -0.065, 0.17], [0.09, 0.06, 0.065]);
  add(lens, materials.get('glass', '#183b49'), [0, -0.065, 0.21]).rotation.x =
    Math.PI / 2;
  for (const x of [-1, 1]) {
    for (const z of [-1, 1]) {
      const start = new THREE.Vector3(x * 0.075, 0.035, z * 0.105);
      const end = new THREE.Vector3(x * 0.25, 0.015, z * 0.23);
      const direction = end.clone().sub(start);
      const midpoint = start.clone().add(end).multiplyScalar(0.5);
      const arm = add(box, shell, midpoint.toArray(), [
        0.035,
        0.035,
        direction.length(),
      ]);
      arm.quaternion.setFromUnitVectors(
        new THREE.Vector3(0, 0, 1),
        direction.normalize(),
      );
      add(motor, dark, [end.x, 0.035, end.z]);
      add(box, dark, [end.x, -0.045, end.z], [0.018, 0.1, 0.025]);
      add(
        box,
        materials.get('lamp', z === 1 ? '#b66155' : '#77a68a'),
        [end.x, -0.075, end.z],
        [0.024, 0.012, 0.028],
      );
      const rotor = new THREE.Group();
      rotor.name = `Drone rotor ${rotors.length + 1}`;
      rotor.position.set(end.x, 0.073, end.z);
      rotor.rotation.y = x * z;
      const propeller = new THREE.Mesh(blade, dark);
      propeller.castShadow = true;
      const disc = new THREE.Mesh(sweep, blur);
      disc.position.y = 0.003;
      rotor.add(propeller, disc);
      group.add(rotor);
      rotors.push(rotor);
    }
  }
  return {
    group,
    update(delta: number, forward: number, right: number) {
      const blend = 1 - Math.exp(-8 * delta);
      group.rotation.x = THREE.MathUtils.lerp(
        group.rotation.x,
        forward * 0.18,
        blend,
      );
      group.rotation.z = THREE.MathUtils.lerp(
        group.rotation.z,
        right * 0.22,
        blend,
      );
      for (const [index, rotor] of rotors.entries())
        rotor.rotation.y =
          (rotor.rotation.y +
            (index === 0 || index === 3 ? 1 : -1) * delta * 80) %
          (Math.PI * 2);
    },
  };
}
