import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { Materials } from './materials';
import type { Point } from './geo';

export const cathedralLayout = {
  columnX: 4.6,
  columns: [-12, -6, 0, 6, 12],
  pews: [-8.4, -6.2, -4, -1.8, 0.4, 2.6, 4.8, 7, 9.2],
  exits: [-6.8, 0, 6.8],
};

const pointed = (t: number) =>
  Math.sqrt(Math.max(0, 4 - (1 + Math.abs(2 * t - 1)) ** 2)) / Math.sqrt(3);

export function cathedralVault(
  width: number,
  depth: number,
  spring: number,
  rise: number,
) {
  const geometry = new THREE.PlaneGeometry(width, depth, 32, 24);
  geometry.rotateX(-Math.PI / 2);
  const vertices = geometry.attributes.position;
  for (let i = 0; i < vertices.count; i++) {
    const u = vertices.getX(i) / width + 0.5;
    const v = vertices.getZ(i) / depth + 0.5;
    vertices.setY(
      i,
      spring + Math.max(pointed(u) * rise, pointed(v) * rise * 0.62),
    );
  }
  geometry.computeVertexNormals();
  return geometry;
}

function paintedTexture(kind: 'vault' | 'wall' | 'column' | 'glass' | 'floor') {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = kind === 'column' ? 2048 : 1024;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error(`Could not paint cathedral ${kind} textures.`);
  const w = canvas.width,
    h = canvas.height;
  ctx.fillStyle =
    kind === 'column' ? '#699689' : kind === 'glass' ? '#243c55' : '#d4bd8d';
  ctx.fillRect(0, 0, w, h);
  const flower = (x: number, y: number, size: number, color = '#80577d') => {
    ctx.fillStyle = color;
    for (let petal = 0; petal < 6; petal++) {
      const a = (petal * Math.PI) / 3;
      ctx.beginPath();
      ctx.ellipse(
        x + Math.cos(a) * size * 0.55,
        y + Math.sin(a) * size * 0.55,
        size * 0.5,
        size * 0.23,
        a,
        0,
        Math.PI * 2,
      );
      ctx.fill();
    }
    ctx.fillStyle = '#d4a34f';
    ctx.beginPath();
    ctx.arc(x, y, size * 0.22, 0, Math.PI * 2);
    ctx.fill();
  };
  const vine = (x: number, y: number, height: number, direction: number) => {
    ctx.strokeStyle = '#486956';
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.bezierCurveTo(
      x + 75 * direction,
      y - height * 0.35,
      x - 65 * direction,
      y - height * 0.6,
      x + 15 * direction,
      y - height,
    );
    ctx.stroke();
    for (let i = 1; i < 9; i++) {
      const t = i / 9,
        px = x + Math.sin(t * Math.PI * 3) * 28 * direction,
        py = y - height * t;
      ctx.fillStyle = i % 2 ? '#668361' : '#3e6250';
      ctx.beginPath();
      ctx.ellipse(
        px + (i % 2 ? 15 : -15),
        py,
        23,
        8,
        i % 2 ? -0.6 : 0.6,
        0,
        Math.PI * 2,
      );
      ctx.fill();
      if (i % 3 === 0) flower(px + 20 * direction, py, 18);
    }
  };
  const border = (x: number, y: number, width: number, height: number) => {
    ctx.strokeStyle = '#b39148';
    ctx.lineWidth = 12;
    ctx.strokeRect(x, y, width, height);
    ctx.strokeStyle = '#365f79';
    ctx.lineWidth = 5;
    ctx.strokeRect(x + 10, y + 10, width - 20, height - 20);
    for (let px = x + 28; px < x + width - 15; px += 48) {
      flower(px, y + 20, 11, '#725475');
      flower(px, y + height - 20, 11, '#725475');
    }
  };
  if (kind === 'floor') {
    for (let row = 0; row < 8; row++)
      for (let col = 0; col < 8; col++) {
        ctx.fillStyle = (row + col) % 2 ? '#823f4a' : '#dbd1b5';
        ctx.fillRect(col * 128 + 2, row * 128 + 2, 124, 124);
      }
  } else if (kind === 'glass') {
    const colors = ['#b84f5f', '#477b9c', '#c7a559', '#657b57', '#927394'];
    for (let row = -1; row < 9; row++)
      for (let col = -1; col < 7; col++) {
        const x = col * 170 + (row % 2) * 85,
          y = row * 145;
        ctx.fillStyle = colors[((row + col + 20) * 7) % colors.length];
        ctx.strokeStyle = '#293f45';
        ctx.lineWidth = 14;
        ctx.beginPath();
        ctx.moveTo(x, y - 140);
        ctx.lineTo(x + 85, y);
        ctx.lineTo(x, y + 140);
        ctx.lineTo(x - 85, y);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        flower(x, y, 24, '#dfc687');
      }
    border(12, 12, 1000, 1000);
  } else if (kind === 'column') {
    for (const y of [20, 170, 620, 1180, 1830, 2015]) {
      ctx.fillStyle = '#b39759';
      ctx.fillRect(0, y, w, 22);
      ctx.fillStyle = '#466974';
      ctx.fillRect(0, y + 22, w, 15);
      for (let x = 40; x < w; x += 90) flower(x, y + 50, 15, '#905b71');
    }
    for (let x = 70; x < w; x += 170)
      for (let y = 540; y < h; y += 440) vine(x, y, 340, x % 3 ? 1 : -1);
  } else {
    for (let row = 0; row < 4; row++)
      for (let col = 0; col < 5; col++) {
        const x = 90 + col * 205,
          y = 210 + row * 245;
        vine(x, y, 180, col % 2 ? -1 : 1);
        flower(x + 55, y - 100, 24);
      }
    if (kind === 'wall') {
      for (let i = 0; i < 3; i++) {
        const x = 200 + i * 310,
          y = 360;
        ctx.fillStyle = ['#426e75', '#994c59', '#9b8a52'][i];
        ctx.beginPath();
        ctx.moveTo(x - 45, y + 65);
        ctx.bezierCurveTo(x - 120, y + 170, x - 100, y + 400, x - 125, y + 470);
        ctx.quadraticCurveTo(x, y + 510, x + 120, y + 470);
        ctx.bezierCurveTo(x + 95, y + 300, x + 110, y + 150, x + 40, y + 65);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = '#cba751';
        ctx.lineWidth = 7;
        ctx.beginPath();
        ctx.arc(x, y + 10, 72, 0, Math.PI * 2);
        ctx.stroke();
        ctx.fillStyle = '#bc9870';
        ctx.beginPath();
        ctx.ellipse(x, y + 15, 40, 56, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#665343';
        ctx.beginPath();
        ctx.ellipse(x, y - 17, 41, 25, 0, Math.PI, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#d5c19b';
        ctx.lineWidth = 5;
        for (let fold = -2; fold <= 2; fold++) {
          ctx.beginPath();
          ctx.moveTo(x + fold * 15, y + 125);
          ctx.lineTo(x + fold * 36, y + 455);
          ctx.stroke();
        }
        ctx.fillStyle = '#c6a17b';
        ctx.beginPath();
        ctx.ellipse(x - 52, y + 195, 15, 26, -0.6, 0, Math.PI * 2);
        ctx.fill();
        flower(x + 55, y + 270, 20, '#e1cc9c');
      }
    } else {
      ctx.strokeStyle = '#a88c50';
      ctx.lineWidth = 8;
      for (const radius of [95, 130]) {
        ctx.beginPath();
        ctx.arc(512, 512, radius, 0, Math.PI * 2);
        ctx.stroke();
      }
      for (let i = 0; i < 12; i++)
        flower(
          512 + Math.cos((i * Math.PI) / 6) * 105,
          512 + Math.sin((i * Math.PI) / 6) * 105,
          22,
        );
      flower(512, 512, 55, '#94714d');
    }
    border(8, 8, w - 16, h - 16);
  }
  // Original painted decoration, not a texture extracted from the reference photographs.
  for (let i = 0; i < 1800; i++) {
    ctx.fillStyle = i % 2 ? '#fff9df08' : '#53443308';
    ctx.fillRect((i * 193) % w, (i * 347) % h, 3 + (i % 8), 2 + (i % 5));
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  if (kind === 'floor') {
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(3.5, 7);
    texture.center.set(0.5, 0.5);
    texture.rotation = Math.PI / 4;
  }
  return texture;
}

export function makeCathedralInterior(materials: Materials) {
  const group = new THREE.Group();
  group.name = 'Three-aisled painted cathedral';
  const blockers: THREE.Object3D[] = [];
  const textures = (['vault', 'wall', 'column', 'glass', 'floor'] as const).map(
    paintedTexture,
  );
  const [vaultMap, wallMap, columnMap, glassMap, floorMap] = textures;
  const painted = (map: THREE.Texture, emissive = 0.025) =>
    new THREE.MeshStandardMaterial({
      map,
      roughness: 0.92,
      side: THREE.DoubleSide,
      emissive: '#e0bd79',
      emissiveMap: map,
      emissiveIntensity: emissive,
    });
  const vault = painted(vaultMap),
    wall = painted(wallMap),
    column = painted(columnMap);
  const glass = painted(glassMap, 0.65),
    floor = painted(floorMap);
  const gold = new THREE.MeshStandardMaterial({
    color: '#b89a55',
    roughness: 0.48,
    metalness: 0.35,
  });
  const blue = new THREE.MeshStandardMaterial({
    color: '#365c77',
    roughness: 0.8,
  });
  const cream = materials.get('plaster', '#d5c7a4');
  const wood = materials.get('wood', '#684b3b');
  const batches = new Map<THREE.Material, THREE.BufferGeometry[]>();
  const add = (geometry: THREE.BufferGeometry, material: THREE.Material) => {
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
    material: THREE.Material,
  ) => {
    const geometry = new THREE.BoxGeometry(w, h, d);
    if (material === wall && (w > 5 || d > 5)) {
      const positions = geometry.attributes.position,
        normals = geometry.attributes.normal,
        uv = geometry.attributes.uv;
      for (let i = 0; i < positions.count; i++) {
        const along =
          Math.abs(normals.getX(i)) > 0.5
            ? positions.getZ(i) + d / 2
            : positions.getX(i) + w / 2;
        uv.setX(i, along / 5);
      }
    }
    add(geometry.translate(x, y, z), material);
  };
  const cylinder = (
    top: number,
    bottom: number,
    height: number,
    x: number,
    y: number,
    z: number,
    material: THREE.Material,
  ) =>
    add(
      new THREE.CylinderGeometry(top, bottom, height, 16).translate(x, y, z),
      material,
    );
  const sphere = (
    radius: number,
    x: number,
    y: number,
    z: number,
    material: THREE.Material,
  ) =>
    add(new THREE.SphereGeometry(radius, 12, 8).translate(x, y, z), material);
  const tube = (
    points: THREE.Vector3[],
    radius: number,
    material: THREE.Material,
  ) =>
    add(
      new THREE.TubeGeometry(
        new THREE.CatmullRomCurve3(points),
        40,
        radius,
        6,
        false,
      ),
      material,
    );
  const rib = (points: THREE.Vector3[]) => {
    tube(points, 0.11, gold);
    tube(
      points.map((point) => point.clone().add(new THREE.Vector3(0, -0.07, 0))),
      0.074,
      blue,
    );
  };
  const arch = (
    cx: number,
    z: number,
    width: number,
    spring: number,
    rise: number,
    alongZ = false,
  ) => {
    const points = Array.from({ length: 49 }, (_, i) => {
      const t = i / 48;
      return new THREE.Vector3(
        cx + (alongZ ? 0 : (t - 0.5) * width),
        spring + pointed(t) * rise,
        z + (alongZ ? (t - 0.5) * width : 0),
      );
    });
    rib(points);
  };
  const window = (
    x: number,
    z: number,
    width: number,
    bottom: number,
    height: number,
  ) => {
    const shape = new THREE.Shape();
    shape.moveTo(-width / 2, 0);
    shape.lineTo(width / 2, 0);
    shape.lineTo(width / 2, height * 0.7);
    shape.quadraticCurveTo(width * 0.3, height * 0.9, 0, height);
    shape.quadraticCurveTo(
      -width * 0.3,
      height * 0.9,
      -width / 2,
      height * 0.7,
    );
    shape.closePath();
    const geometry = new THREE.ShapeGeometry(shape, 24);
    const uv = geometry.attributes.uv,
      positions = geometry.attributes.position;
    for (let i = 0; i < uv.count; i++)
      uv.setXY(i, positions.getX(i) / width + 0.5, positions.getY(i) / height);
    geometry.rotateY(Math.PI / 2);
    geometry.translate(x, bottom, z);
    add(geometry, glass);
    box(
      0.1,
      height * 0.75,
      0.055,
      x - Math.sign(x) * 0.04,
      bottom + height * 0.375,
      z,
      gold,
    );
    box(
      0.1,
      0.075,
      width,
      x - Math.sign(x) * 0.04,
      bottom + height * 0.45,
      z,
      gold,
    );
  };
  const wallBand = (
    x: number,
    z: number,
    low: (t: number) => number,
    high: (t: number) => number,
  ) => {
    const positions: number[] = [],
      uvs: number[] = [];
    for (let i = 0; i < 32; i++) {
      const a = i / 32,
        b = (i + 1) / 32;
      const za = z - 3 + a * 6,
        zb = z - 3 + b * 6;
      positions.push(
        x,
        low(a),
        za,
        x,
        high(a),
        za,
        x,
        low(b),
        zb,
        x,
        low(b),
        zb,
        x,
        high(a),
        za,
        x,
        high(b),
        zb,
      );
      uvs.push(a, 0, a, 1, b, 0, b, 0, a, 1, b, 1);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      'position',
      new THREE.Float32BufferAttribute(positions, 3),
    );
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geometry.computeVertexNormals();
    add(geometry, vault);
  };
  box(18, 0.4, 36, 0, -0.2, 0, floor);
  for (const side of [-1, 1]) {
    box(0.4, 9.2, 36, side * 9, 4.6, 0, wall);
    box(0.1, 1.4, 36, side * 8.74, 0.7, 0, column);
    box(0.14, 0.09, 36, side * 8.65, 1.43, 0, gold);
    box(0.22, 3.4, 36, side * 4.6, 8.8, 0, wall);
    box(0.32, 0.14, 36, side * 4.6, 7.0, 0, gold);
    for (const z of cathedralLayout.columns) {
      const x = side * cathedralLayout.columnX;
      box(1.05, 0.18, 1.05, x, 0.09, z, cream);
      cylinder(0.4, 0.47, 4.55, x, 2.45, z, column);
      for (const [dx, dz] of [
        [0.35, 0],
        [-0.35, 0],
        [0, 0.35],
        [0, -0.35],
      ])
        cylinder(0.11, 0.13, 4.5, x + dx, 2.44, z + dz, column);
      for (const y of [0.28, 4.65, 4.82])
        cylinder(0.57, 0.6, 0.14, x, y, z, gold);
      for (let petal = 0; petal < 8; petal++)
        sphere(
          0.12,
          x + Math.cos((petal * Math.PI) / 4) * 0.48,
          4.72,
          z + Math.sin((petal * Math.PI) / 4) * 0.48,
          gold,
        );
      cylinder(0.13, 0.17, 5.55, x - side * 0.15, 7.7, z, column);
      cylinder(0.12, 0.16, 5.3, side * 8.7, 2.85, z, column);
      for (const aisle of [
        { x: 0, width: 9.2, spring: 10.5, rise: 3.7 },
        { x: side * 6.8, width: 4.4, spring: 5.6, rise: 2.9 },
      ])
        if (side === -1 || aisle.x !== 0)
          arch(aisle.x, z, aisle.width, aisle.spring, aisle.rise);
    }
    for (let z = -15; z <= 15; z += 6) {
      window(side * 8.72, z, 1.8, 2.0, 3.6);
      window(side * 4.43, z, 1.4, 7.6, 2.45);
      arch(side * 4.6, z, 6, 4.85, 2.1, true);
      wallBand(
        side * 4.6,
        z,
        (t) => 4.85 + pointed(t) * 2.1,
        () => 7.3,
      );
      wallBand(
        side * 4.6,
        z,
        () => 10.5,
        (t) => 10.5 + pointed(t) * 3.7 * 0.62,
      );
      for (const aisle of [
        { x: 0, width: 9.2, spring: 10.5, rise: 3.7 },
        { x: side * 6.8, width: 4.4, spring: 5.6, rise: 2.9 },
      ]) {
        if (aisle.x === 0 && side === 1) continue;
        add(
          cathedralVault(aisle.width, 6, aisle.spring, aisle.rise).translate(
            aisle.x,
            0,
            z,
          ),
          vault,
        );
        for (const direction of [-1, 1]) {
          const points = Array.from({ length: 49 }, (_, i) => {
            const t = i / 48;
            return new THREE.Vector3(
              aisle.x + (t - 0.5) * aisle.width,
              aisle.spring +
                Math.max(
                  pointed(t) * aisle.rise,
                  pointed(t) * aisle.rise * 0.62,
                ),
              z + (t - 0.5) * 6 * direction,
            );
          });
          rib(points);
        }
        arch(
          aisle.x - aisle.width / 2,
          z,
          6,
          aisle.spring,
          aisle.rise * 0.62,
          true,
        );
        arch(
          aisle.x + aisle.width / 2,
          z,
          6,
          aisle.spring,
          aisle.rise * 0.62,
          true,
        );
        sphere(0.19, aisle.x, aisle.spring + aisle.rise - 0.1, z, gold);
      }
    }
    for (const z of cathedralLayout.pews) {
      const x = side * 2.8;
      box(3, 0.16, 0.64, x, 0.53, z, wood);
      box(3, 0.82, 0.12, x, 0.9, z + 0.32, wood);
      box(2.9, 0.09, 0.13, x, 1.34, z + 0.32, wood);
      for (const end of [-1, 1]) {
        box(0.13, 1.0, 0.76, x + end * 1.5, 0.5, z, wood);
        sphere(0.09, x + end * 1.5, 1.09, z + 0.25, wood);
        box(0.12, 0.45, 0.18, x + end * 1.25, 0.23, z - 0.2, wood);
      }
    }
    box(2.1, 0.9, 0.9, side * 6.8, 0.6, -15, cream);
    box(2.3, 0.12, 1.05, side * 6.8, 1.12, -15, gold);
  }
  box(18, 14.3, 0.4, 0, 7.15, -18, wall);
  box(18, 14.3, 0.4, 0, 7.15, 18, wall);
  for (const x of cathedralLayout.exits) {
    box(x ? 2.5 : 3.6, x ? 3.0 : 3.8, 0.12, x, x ? 1.5 : 1.9, 17.72, wood);
    arch(x, 17.64, x ? 2.5 : 3.6, x ? 2.3 : 2.8, 1.0);
    box(0.06, 2.4, 0.09, x, 1.3, 17.6, gold);
  }
  for (let step = 0; step < 3; step++)
    box(
      7 - step * 0.4,
      0.15,
      4.8 - step * 0.6,
      0,
      0.075 + step * 0.15,
      -14.0,
      cream,
    );
  box(2.8, 1.0, 1.2, 0, 0.95, -13.7, gold);
  box(3.15, 0.14, 1.4, 0, 1.52, -13.7, cream);
  box(2.85, 0.75, 0.035, 0, 1.1, -13.05, wall);
  for (let i = -2; i <= 2; i++) {
    const x = i * 1.18,
      height = i === 0 ? 7.4 : Math.abs(i) === 1 ? 6.0 : 4.8;
    box(1.03, height, 0.28, x, 0.55 + height / 2, -17.2, wood);
    box(0.9, height - 0.4, 0.07, x, 0.7 + (height - 0.4) / 2, -16.99, wall);
    cylinder(
      0.045,
      0.11,
      height + 0.45,
      x - 0.54,
      height / 2 + 0.55,
      -16.9,
      gold,
    );
    cylinder(
      0.045,
      0.11,
      height + 0.45,
      x + 0.54,
      height / 2 + 0.55,
      -16.9,
      gold,
    );
    const pinnacle = new THREE.ConeGeometry(0.25, 1.25, 6).translate(
      x,
      height + 1.1,
      -17.0,
    );
    add(pinnacle, gold);
    box(1.07, 0.13, 0.16, x, height + 0.55, -16.84, gold);
  }
  box(0.09, 1.8, 0.1, 0, 9.0, -17.0, gold);
  box(0.9, 0.09, 0.1, 0, 9.35, -17.0, gold);
  const flame = new THREE.MeshStandardMaterial({
    color: '#ffe2a4',
    emissive: '#ffba5a',
    emissiveIntensity: 1.5,
  });
  for (const side of [-1, 1])
    for (let i = 0; i < 3; i++) {
      const x = side * (1.9 + i * 0.3);
      cylinder(0.05, 0.13, 0.68, x, 1.82, -13.9, gold);
      cylinder(0.055, 0.055, 0.28, x, 2.3, -13.9, cream);
      sphere(0.045, x, 2.5, -13.9, flame);
    }
  for (const [material, geometries] of batches) {
    const geometry = mergeGeometries(geometries);
    if (!geometry)
      throw new Error('Could not assemble cathedral interior geometry.');
    geometries.forEach((item) => item.dispose());
    const mesh = new THREE.Mesh(geometry, material);
    mesh.receiveShadow = true;
    mesh.castShadow = material === wood;
    group.add(mesh);
    if (material !== glass && material !== flame) blockers.push(mesh);
  }
  group.add(new THREE.HemisphereLight('#dce3f0', '#a68a70', 1.9));
  for (const z of [-12, 0, 12]) {
    const light = new THREE.PointLight('#ffe7bb', 10, 20, 1);
    light.position.set(0, 8, z);
    group.add(light);
  }
  const altarLight = new THREE.PointLight('#ffd58a', 15, 16, 1);
  altarLight.position.set(0, 5, -13);
  group.add(altarLight);
  group.visible = false;
  return {
    group,
    blockers,
    dispose: () => textures.forEach((texture) => texture.dispose()),
  };
}

export function indoorBlocked(point: Point) {
  if (Math.abs(point[0]) > 8.3 || Math.abs(point[1]) > 17) return true;
  if (point[1] < -11 && Math.abs(point[0]) < 4) return true;
  if (
    point[1] < -13.8 &&
    point[1] > -16.2 &&
    Math.abs(Math.abs(point[0]) - 6.8) < 1.35
  )
    return true;
  for (const side of [-1, 1])
    for (const z of cathedralLayout.columns)
      if (
        Math.hypot(point[0] - side * cathedralLayout.columnX, point[1] - z) <
        0.8
      )
        return true;
  for (const z of cathedralLayout.pews)
    if (
      Math.abs(point[0]) > 1.25 &&
      Math.abs(point[0]) < 4.5 &&
      Math.abs(point[1] - z) < 0.7
    )
      return true;
  return false;
}
