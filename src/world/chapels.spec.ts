import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { blocked, foundation, standingElevation } from './geo';
import {
  chapelBlocked,
  chapelSites,
  makeChapelInterior,
  makeLawrenceExterior,
} from './chapels';

describe('accessible Romanesque churches', () => {
  it('places both entrances on reachable outdoor ground and keeps interior routes clear of walls and furnishings', () => {
    for (const kind of ['rotunda', 'lawrence'] as const) {
      const site = chapelSites[kind];
      expect(
        blocked(site.approach, standingElevation(site.approach)),
        kind,
      ).toBe(false);
      expect(chapelBlocked(kind, site.spawn)).toBe(false);
      expect(chapelBlocked(kind, [0, site.exit[1] - 0.6])).toBe(false);
    }
    for (const z of [2.7, 0, -2, -3.8, -4.4])
      expect(chapelBlocked('rotunda', [0, z])).toBe(false);
    expect(chapelBlocked('rotunda', [0, -5.2])).toBe(true);
    expect(chapelBlocked('rotunda', [2.65, 0.2])).toBe(true);
    expect(chapelBlocked('lawrence', [2.2, -1.8])).toBe(true);
    expect(chapelBlocked('lawrence', [4.6, 0])).toBe(true);
  });

  it('builds a domed rotunda and flat-covered basilica remains, preserving the raised hexagonal floor below the ceiling', () => {
    const material = new THREE.MeshStandardMaterial({ side: THREE.DoubleSide });
    const interiors = (['rotunda', 'lawrence'] as const).map((kind) =>
      makeChapelInterior(kind, { get: () => material }),
    );
    const ray = new THREE.Raycaster(
      new THREE.Vector3(0, 20, -0.468),
      new THREE.Vector3(0, -1, 0),
    );
    const [rotunda, ruins] = interiors;
    for (const interior of interiors) interior.group.updateMatrixWorld(true);
    expect(
      ray.intersectObjects(rotunda.blockers, false)[0].point.y,
    ).toBeGreaterThan(7);
    expect(ray.intersectObjects(ruins.blockers, false)[0].point.y).toBeCloseTo(
      2.88,
    );
    ray.set(new THREE.Vector3(0, 2, -0.468), new THREE.Vector3(0, -1, 0));
    const floor = ray.intersectObjects(ruins.blockers, false)[0];
    expect(floor.object.name).toBe('Romanesque floor tiles');
    expect(floor.point.y).toBeGreaterThan(0.03);
    expect(floor.point.y).toBeLessThan(0.1);
    for (const interior of interiors)
      interior.group.traverse((object) => {
        if (object instanceof THREE.Mesh) object.geometry.dispose();
      });
    material.dispose();
  });

  it('covers the reference stone enclosure with a flat roof without blocking its arched wooden entrance', () => {
    const material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
    const meshes: THREE.Mesh[] = [],
      stone: THREE.Mesh[] = [];
    makeLawrenceExterior((color, geometry, kind) => {
      const mesh = new THREE.Mesh(geometry, material);
      mesh.updateMatrixWorld(true);
      meshes.push(mesh);
      if (kind === 'rubble') stone.push(mesh);
    });
    const site = chapelSites.lawrence,
      p = site.feature.points;
    const door = new THREE.Vector3(
      (p[1][0] + p[2][0]) / 2,
      foundation(site.feature) + 1.4,
      (p[1][1] + p[2][1]) / 2,
    );
    const origin = new THREE.Vector3(
      site.approach[0],
      door.y,
      site.approach[1],
    );
    const ray = new THREE.Raycaster(
      origin,
      door.clone().sub(origin).normalize(),
      0,
      origin.distanceTo(door) + 0.4,
    );
    expect(ray.intersectObjects(stone, false)).toHaveLength(0);
    expect(ray.intersectObjects(meshes, false).length).toBeGreaterThan(0);
    ray.set(
      new THREE.Vector3(-101, door.y + 20, 95.7),
      new THREE.Vector3(0, -1, 0),
    );
    ray.far = 40;
    const roofHeight = foundation(site.feature) + 2.88;
    expect(ray.intersectObjects(meshes, false)[0].point.y).toBeCloseTo(
      roofHeight,
    );
    ray.set(
      new THREE.Vector3(-98, door.y + 20, 96),
      new THREE.Vector3(0, -1, 0),
    );
    expect(ray.intersectObjects(meshes, false)[0].point.y).toBeCloseTo(
      roofHeight,
    );
    meshes.forEach((mesh) => mesh.geometry.dispose());
    material.dispose();
  });
});
