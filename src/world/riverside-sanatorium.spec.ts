import * as THREE from 'three';
import {
  makeRiversideSanatorium,
  riversideSanatorium as site,
} from './riverside-sanatorium';
import { roof } from './engine';
import {
  courtBankBoundary,
  elevation,
  buildings,
  foundation,
  inside,
  type Point,
} from './geo';

function model() {
  const material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
  const meshes: THREE.Mesh[] = [];
  makeRiversideSanatorium((color, geometry, kind) => {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = `${kind}:${color}`;
    meshes.push(mesh);
  }, roof);
  return {
    meshes,
    dispose() {
      meshes.forEach((mesh) => mesh.geometry.dispose());
      material.dispose();
    },
  };
}

it('covers the articulated hospital wings with pitched tiles while leaving the open courtyards and ramparts clear', () => {
  const scene = model();
  const tiles = scene.meshes.filter((mesh) => mesh.name === 'slate:#934a39');
  const mainRoof = tiles[0];
  const positions = mainRoof.geometry.attributes.position;
  const ray = new THREE.Raycaster();
  try {
    for (const mesh of scene.meshes)
      expect(
        Array.from(mesh.geometry.attributes.position.array).every(
          Number.isFinite,
        ),
        mesh.name,
      ).toBe(true);
    expect(positions.count).toBeGreaterThan(300);
    const heights: number[] = [];
    for (let i = 0; i < positions.count; i += 3) {
      const point: Point = [
        (positions.getX(i) + positions.getX(i + 1) + positions.getX(i + 2)) / 3,
        (positions.getZ(i) + positions.getZ(i + 1) + positions.getZ(i + 2)) / 3,
      ];
      expect(inside(point, site.building.points), JSON.stringify(point)).toBe(
        true,
      );
      expect(inside(point, courtBankBoundary), JSON.stringify(point)).toBe(
        false,
      );
      heights.push(positions.getY(i));
    }
    expect(Math.max(...heights) - Math.min(...heights)).toBeGreaterThan(4);
    expect(Math.max(...heights)).toBeLessThan(elevation(-30, 160));
    for (const point of [
      [-150, 240],
      [-125, 240],
      [-100, 245],
      [-78, 280],
      [-58, 284],
      [-30, 292],
    ] as Point[]) {
      ray.set(
        new THREE.Vector3(point[0], 80, point[1]),
        new THREE.Vector3(0, -1, 0),
      );
      expect(
        ray.intersectObjects(tiles)[0],
        JSON.stringify(point),
      ).toBeDefined();
    }
    for (const point of [
      [-100, 230],
      [-100, 265],
      [-30, 160],
    ] as Point[]) {
      ray.set(
        new THREE.Vector3(point[0], 80, point[1]),
        new THREE.Vector3(0, -1, 0),
      );
      expect(
        ray.intersectObjects(scene.meshes),
        JSON.stringify(point),
      ).toHaveLength(0);
    }
  } finally {
    scene.dispose();
  }
});

it('grounds the lower sanatorium and renders its repeated windows, facade bands and roof dormers', () => {
  const scene = model();
  const ray = new THREE.Raycaster();
  try {
    expect(foundation(site.building)).toBeCloseTo(elevation(-150, 240), 3);
    const annex = buildings.find((building) => building.id === 494921183);
    if (!annex) throw new Error('Missing hospital annex.');
    expect(foundation(annex) + 12.4).toBeLessThan(site.eaves + 3);
    const facade = site.windows.find(
      (window) => window.point[0] < -140 && window.normal[1] > 0.9,
    );
    if (!facade) throw new Error('Missing river-wing facade reference.');
    const cast = (height: number) => {
      ray.set(
        new THREE.Vector3(
          facade.point[0] + facade.normal[0] * 2 + facade.normal[1] * 0.25,
          site.ground + height,
          facade.point[1] + facade.normal[1] * 2 - facade.normal[0] * 0.25,
        ),
        new THREE.Vector3(-facade.normal[0], 0, -facade.normal[1]),
      );
      ray.far = 3;
      return ray.intersectObjects(scene.meshes)[0]?.object.name;
    };
    for (const floor of [2.4, 6.7, 11, 15.1])
      expect(cast(floor + 0.2)).toBe('glass:#4e656d');
    expect(cast(9.4)).toBe('stone:#9e6556');
    for (const dormer of site.dormers.slice(0, 3)) {
      ray.set(
        new THREE.Vector3(dormer.point[0], 80, dormer.point[1]),
        new THREE.Vector3(0, -1, 0),
      );
      ray.far = 100;
      const hit = ray.intersectObjects(scene.meshes)[0];
      expect(hit.object.name).toBe('slate:#934a39');
      expect(hit.point.y - site.roofLevel(dormer.point)).toBeGreaterThan(1.5);
    }
  } finally {
    scene.dispose();
  }
});

it('models the mapped cupolas as copper curved roofs with visible drum oculi rather than generic gables', () => {
  const scene = model();
  const ray = new THREE.Raycaster();
  const copper = scene.meshes.filter((mesh) => mesh.name === 'metal:#77a58e');
  try {
    for (const cupola of site.cupolas) {
      const point: Point = [
        cupola.point[0] + cupola.radius * 0.6,
        cupola.point[1],
      ];
      ray.set(
        new THREE.Vector3(point[0], 80, point[1]),
        new THREE.Vector3(0, -1, 0),
      );
      ray.far = 100;
      const hit = ray.intersectObjects(copper)[0];
      expect(hit).toBeDefined();
      expect(hit.point.y).toBeGreaterThan(cupola.floor + 4);
      ray.set(
        new THREE.Vector3(
          cupola.point[0],
          cupola.floor + cupola.drumHeight - 1,
          cupola.point[1] + cupola.radius + 1,
        ),
        new THREE.Vector3(0, 0, -1),
      );
      ray.far = 2;
      expect(ray.intersectObjects(scene.meshes)[0]?.object.name).toBe(
        'glass:#52605a',
      );
    }
  } finally {
    scene.dispose();
  }
});
