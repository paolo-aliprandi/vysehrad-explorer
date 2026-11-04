import * as THREE from 'three';
import {
  casemateBlocked,
  casemateFloor,
  casemateNotes,
  casemateSculptures,
  makeCasemateInterior,
  readCasemateNotes,
  artilleryBlocked,
  artilleryCannons,
} from './casemates';

it('connects the entrance, both corridor turns, all field notes and the hall without crossing solid walls', () => {
  const route = [
    [0, 2],
    [0, -22.5],
    [18, -22.5],
    [18, -59],
    [18, -66],
  ] as const;
  for (let i = 1; i < route.length; i++) {
    const a = route[i - 1],
      b = route[i],
      length = Math.hypot(b[0] - a[0], b[1] - a[1]);
    for (let d = 0; d <= length; d += 0.1)
      expect(
        casemateBlocked([
          a[0] + ((b[0] - a[0]) * d) / length,
          a[1] + ((b[1] - a[1]) * d) / length,
        ]),
      ).toBe(false);
  }
  for (const note of casemateNotes)
    expect(casemateBlocked(note.point)).toBe(false);
  for (let x = 18; x <= 38; x += 0.1)
    expect(casemateBlocked([x, -34.5])).toBe(false);
  expect(casemateFloor([18, -34.5])).toBe(0);
  expect(casemateFloor([38, -34.5])).toBeCloseTo(3.7);
  for (const point of [[2, -8], [4, -30], [18, -70], ...casemateSculptures] as [
    number,
    number,
  ][])
    expect(casemateBlocked(point)).toBe(true);
});

it('gives the separate artillery gallery a clear entrance and central aisle, solid vault, and collidable cannon displays', () => {
  const material = new THREE.MeshStandardMaterial({ side: THREE.DoubleSide });
  const interior = makeCasemateInterior({ get: () => material }, true);
  interior.group.updateMatrixWorld(true);
  try {
    for (let z = 2; z >= -25; z -= 0.25) {
      expect(artilleryBlocked([0, z])).toBe(false);
      const ray = new THREE.Raycaster(
        new THREE.Vector3(0, 0.15, z),
        new THREE.Vector3(0, -1, 0),
        0,
        0.3,
      );
      expect(ray.intersectObjects(interior.blockers)[0]?.point.y).toBeCloseTo(
        0,
      );
      ray.set(new THREE.Vector3(0, 1.6, z), new THREE.Vector3(0, 1, 0));
      ray.far = 10;
      expect(
        ray.intersectObjects(interior.blockers)[0]?.point.y,
      ).toBeGreaterThan(2.7);
    }
    const along = new THREE.Raycaster(
      new THREE.Vector3(0, 1.3, 2),
      new THREE.Vector3(0, 0, -1),
      0,
      26,
    );
    expect(along.intersectObjects(interior.blockers)).toHaveLength(0);
    for (const point of artilleryCannons)
      expect(artilleryBlocked(point)).toBe(true);
    expect(artilleryBlocked([0, -27])).toBe(true);
    expect(artilleryBlocked([7, -15])).toBe(true);
    expect(interior.markers.size).toBe(0);
  } finally {
    interior.group.traverse((object) => {
      if (object instanceof THREE.Mesh) object.geometry.dispose();
    });
    material.dispose();
  }
});

it('renders continuous floors, open connections and solid vaulted ceilings over the actual walking route', () => {
  const interior = makeCasemateInterior({
    get: () => new THREE.MeshStandardMaterial({ side: THREE.DoubleSide }),
  });
  interior.group.updateMatrixWorld(true);
  for (const [x, z] of [
    [0, 2],
    [0, -8],
    [0, -22.5],
    [1.5, -22.5],
    [10, -22.5],
    [18, -24],
    [18, -32],
    [18, -46],
    [18, -59],
    [19.5, -34.5],
    [25, -34.5],
    [38, -34.5],
  ]) {
    const level = casemateFloor([x, z]);
    const ray = new THREE.Raycaster(
      new THREE.Vector3(x, level + 0.1, z),
      new THREE.Vector3(0, -1, 0),
      0,
      0.3,
    );
    expect(ray.intersectObjects(interior.blockers)[0]?.point.y).toBeCloseTo(
      level,
    );
    ray.set(new THREE.Vector3(x, level + 1.5, z), new THREE.Vector3(0, 1, 0));
    ray.far = 15;
    expect(ray.intersectObjects(interior.blockers).length).toBeGreaterThan(0);
  }
  const corners = [
    [0, -22.5],
    [18, -22.5],
    [18, -59],
  ] as const;
  for (let i = 1; i < corners.length; i++) {
    const a = new THREE.Vector3(corners[i - 1][0], 1.2, corners[i - 1][1]);
    const b = new THREE.Vector3(corners[i][0], 1.2, corners[i][1]);
    const ray = new THREE.Raycaster(
      a,
      b.clone().sub(a).normalize(),
      0,
      a.distanceTo(b),
    );
    expect(ray.intersectObjects(interior.blockers)).toHaveLength(0);
  }
  interior.group.traverse((object) => {
    if (object instanceof THREE.Mesh) {
      object.geometry.dispose();
      const materials = Array.isArray(object.material)
        ? object.material
        : [object.material];
      materials.forEach((material) => material.dispose());
    }
  });
});

it('restores only known, unique field notes and reports malformed stored progress', () => {
  expect(
    readCasemateNotes({
      getItem: () => '["gorlice","unknown","gorlice",null]',
    }),
  ).toEqual(['gorlice']);
  expect(() => readCasemateNotes({ getItem: () => '{}' })).toThrow(
    'Invalid saved',
  );
  expect(() => readCasemateNotes({ getItem: () => '{' })).toThrow();
});
