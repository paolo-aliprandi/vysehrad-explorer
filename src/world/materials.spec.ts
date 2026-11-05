import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { prepareBatchGeometry, spatialBatches, worldUVs } from './materials';

describe('indexed material batches', () => {
  it('culls distant cells while retaining complete geometry crossing a cell boundary', () => {
    const near = new THREE.BoxGeometry(2, 2, 2).translate(1, 0, 1);
    const far = new THREE.BoxGeometry(2, 2, 2).translate(200, 0, 200);
    const crossing = new THREE.BoxGeometry(140, 2, 2).translate(20, 0, 1);
    const chunks = spatialBatches([near, far, crossing]);
    expect(chunks).toHaveLength(2);
    expect(chunks.flat()).toHaveLength(3);
    expect(new Set(chunks.flat())).toEqual(new Set([near, far, crossing]));
    const camera = new THREE.OrthographicCamera(-5, 5, 5, -5, 0.1, 100);
    camera.position.set(-45, 0, 10);
    camera.lookAt(-45, 0, 0);
    camera.updateMatrixWorld();
    const frustum = new THREE.Frustum().setFromProjectionMatrix(
      new THREE.Matrix4().multiplyMatrices(
        camera.projectionMatrix,
        camera.matrixWorldInverse,
      ),
    );
    const merged = chunks.map((chunk) => {
      const geometry = mergeGeometries(chunk);
      if (!geometry) throw new Error('Could not merge spatial test geometry.');
      return geometry;
    });
    const material = new THREE.MeshBasicMaterial();
    const visible = merged.filter((geometry) =>
      frustum.intersectsObject(new THREE.Mesh(geometry, material)),
    );
    expect(visible).toHaveLength(1);
    const ray = new THREE.Raycaster(
      camera.position,
      new THREE.Vector3(0, 0, -1),
    );
    expect(
      ray.intersectObject(new THREE.Mesh(visible[0], material)),
    ).not.toHaveLength(0);
    [near, far, crossing, ...merged].forEach((geometry) => geometry.dispose());
    material.dispose();
  });

  it('keeps shared primitive vertices while preserving every rendered attribute and collision', () => {
    const sources = [
      new THREE.BoxGeometry(2, 3, 4),
      new THREE.SphereGeometry(1, 12, 8).translate(5, 0, 0),
      new THREE.PlaneGeometry(3, 2).toNonIndexed().translate(-5, 0, 0),
    ];
    const expanded = sources.map((source) => {
      const geometry = source.index ? source.toNonIndexed() : source.clone();
      worldUVs(geometry, 'stone');
      return geometry;
    });
    const expected = mergeGeometries(expanded);
    const actual = mergeGeometries(
      sources.map((geometry) => prepareBatchGeometry(geometry, 'stone')),
    );
    if (!expected || !actual) throw new Error('Could not merge test geometry.');
    const rendered = actual.toNonIndexed();
    for (const name of Object.keys(expected.attributes))
      expect(rendered.getAttribute(name).array).toEqual(
        expected.getAttribute(name).array,
      );
    expect(actual.attributes.position.count).toBeLessThan(
      expected.attributes.position.count / 2,
    );
    const material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
    const ray = new THREE.Raycaster(
      new THREE.Vector3(0, 0, 10),
      new THREE.Vector3(0, 0, -1),
    );
    expect(
      ray.intersectObject(new THREE.Mesh(actual, material))[0].point,
    ).toEqual(ray.intersectObject(new THREE.Mesh(expected, material))[0].point);
    [...sources, ...expanded, expected, actual, rendered].forEach((geometry) =>
      geometry.dispose(),
    );
    material.dispose();
  });

  it('preserves painted fresco UVs and indexes large unindexed meshes without overflow', () => {
    const fresco = new THREE.PlaneGeometry(2, 3);
    const uv = fresco.getAttribute('uv');
    const index = fresco.index;
    prepareBatchGeometry(fresco, 'fresco');
    expect(fresco.getAttribute('uv')).toBe(uv);
    expect(fresco.index).toBe(index);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      'position',
      new THREE.BufferAttribute(new Float32Array(65538 * 3), 3),
    );
    geometry.setAttribute(
      'normal',
      new THREE.BufferAttribute(new Float32Array(65538 * 3), 3),
    );
    prepareBatchGeometry(geometry, 'stone');
    expect(geometry.index?.getX(65537)).toBe(65537);
    geometry.dispose();
    fresco.dispose();
  });
});
