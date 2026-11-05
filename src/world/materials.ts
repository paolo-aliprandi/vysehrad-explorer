import * as THREE from 'three';

export type MaterialKind =
  | 'plaster'
  | 'stone'
  | 'rock'
  | 'rubble'
  | 'terracotta'
  | 'brick'
  | 'cobble'
  | 'asphalt'
  | 'mosaic'
  | 'fresco'
  | 'gravel'
  | 'grass'
  | 'foliage'
  | 'slate'
  | 'wood'
  | 'bark'
  | 'glass'
  | 'lamp'
  | 'metal';

const brushProfiles = [
  'M0 .48 Q.08 .12 .3 .22 L.84 .03 .76 .24 1 .3 .9 .48 .98 .68 .6 .76 .2 .92 .28 .72 .02 .78 .1 .6 Z',
  'M0 .35 .19 .16 .42 .26 .88 0 .8 .22 1 .4 .85 .6 .9 .8 .58 .73 .22 1 .25 .78 .02 .7 .13 .52 Z',
  'M0 .6 .12 .28 .34 .36 .67 .04 .64 .26 1 .2 .87 .48 .95 .63 .72 .68 .33 .95 .32 .76 .07 .84 Z',
];

function brushWash(
  context: CanvasRenderingContext2D,
  random: () => number,
  kind: MaterialKind,
) {
  const profiles = brushProfiles.map((profile) => new Path2D(profile));
  const tones =
    kind === 'grass'
      ? ['#d4d7ab', '#eee2bd', '#8e9d79', '#b6bb8c']
      : kind === 'rock'
        ? ['#e1ddc6', '#a8afa1', '#fff4d9', '#b7b5a8']
        : ['#fff8e4', '#b5b4aa', '#d2d3c5', '#ffffff'];
  for (let i = 0; i < 95; i++) {
    const x = random() * 512,
      y = random() * 512;
    const width = 24 + random() * (kind === 'grass' ? 100 : 55);
    const height = 5 + random() * 15;
    const angle = kind === 'bark' || kind === 'wood' ? Math.PI / 2 : -0.22;
    context.fillStyle = tones[i % tones.length];
    context.globalAlpha = 0.06 + random() * 0.09;
    for (const dx of [-512, 0, 512])
      for (const dy of [-512, 0, 512]) {
        context.save();
        context.translate(x + dx, y + dy);
        context.rotate(angle);
        context.scale(width, height);
        context.fill(profiles[i % profiles.length]);
        context.restore();
      }
  }
  context.globalAlpha = 1;
}

export class Materials {
  private textures = new Map<MaterialKind, THREE.CanvasTexture>();
  private materials = new Map<
    string,
    THREE.MeshStandardMaterial | THREE.MeshToonMaterial
  >();
  private time = { value: 0 };
  private gradient = (() => {
    const shades = [112, 163, 211, 255];
    const data = new Uint8Array(
      shades.flatMap((shade) => [shade, shade, shade, 255]),
    );
    const texture = new THREE.DataTexture(data, shades.length, 1);
    texture.minFilter = texture.magFilter = THREE.NearestFilter;
    texture.needsUpdate = true;
    return texture;
  })();

  get(kind: MaterialKind, color: string) {
    const key = `${kind}|${color}`;
    const existing = this.materials.get(key);
    if (existing) return existing;
    const textured = !['glass', 'metal', 'lamp', 'foliage'].includes(kind);
    const texture = textured ? this.texture(kind) : null;
    const pigment = new THREE.Color(color);
    if (kind === 'stone' || kind === 'rock')
      pigment.lerp(new THREE.Color('#9b9b94'), kind === 'rock' ? 0.12 : 0.04);
    if (kind === 'grass') pigment.lerp(new THREE.Color('#999d68'), 0.18);
    const parameters = {
      color: pigment,
      map: texture,
      bumpMap: texture,
      bumpScale:
        kind === 'rock'
          ? 0.045
          : ['grass', 'fresco'].includes(kind)
            ? 0
            : 0.012,
      side: THREE.DoubleSide,
    };
    const material = ['glass', 'metal', 'lamp'].includes(kind)
      ? new THREE.MeshStandardMaterial({
          ...parameters,
          roughness: kind === 'glass' ? 0.28 : 0.5,
          metalness: kind === 'metal' ? 0.45 : 0,
        })
      : new THREE.MeshToonMaterial({
          ...parameters,
          gradientMap: this.gradient,
        });
    if (kind === 'foliage') {
      material.onBeforeCompile = (shader) => {
        shader.uniforms.uWindTime = this.time;
        shader.vertexShader = `uniform float uWindTime;
          varying vec3 vPaintPosition;
          varying float vPaintTop;
          ${shader.vertexShader}`;
        shader.vertexShader = shader.vertexShader.replace(
          '#include <begin_vertex>',
          `#include <begin_vertex>
          vec3 windPosition = position;
          float windHeight = 0.0;
          #ifdef USE_INSTANCING
            windPosition = (instanceMatrix * vec4(position, 1.0)).xyz;
            windHeight = max(position.y, 0.0);
          #endif
          vPaintPosition = windPosition;
          vPaintTop = normal.y * 0.5 + 0.5;
          float sway = sin(windPosition.x * 0.085 + windPosition.z * 0.11 + uWindTime * 0.8);
          transformed.x += sway * 0.065 * windHeight;
          transformed.z += cos(windPosition.z * 0.09 + uWindTime * 0.65) * 0.035 * windHeight;`,
        );
        shader.fragmentShader = `varying vec3 vPaintPosition;
          varying float vPaintTop;
          ${shader.fragmentShader}`;
        shader.fragmentShader = shader.fragmentShader.replace(
          '#include <color_fragment>',
          `#include <color_fragment>
          float brush = sin(vPaintPosition.x * 1.35 + vPaintPosition.z * 0.87
                            + sin(vPaintPosition.y * 2.7))
                      * sin(vPaintPosition.y * 3.1 + vPaintPosition.z * 0.9);
          diffuseColor.rgb *= mix(vec3(0.82, 0.88, 0.84),
                                  vec3(1.05, 1.04, 0.92), vPaintTop)
                            * (0.97 + brush * 0.045);`,
        );
      };
      material.customProgramCacheKey = () => 'painted-foliage-brush-wind-v2';
    }
    this.materials.set(key, material);
    return material;
  }

  private texture(kind: MaterialKind) {
    const existing = this.textures.get(kind);
    if (existing) return existing;
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 512;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Could not create surface textures.');
    let seed = 139;
    const random = () => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return seed / 4294967296;
    };
    const mortar =
      kind === 'brick' ? '#9c978d' : kind === 'cobble' ? '#8e938d' : '#b0b0a7';
    context.fillStyle = mortar;
    context.fillRect(0, 0, 512, 512);
    if (['stone', 'brick', 'cobble', 'slate'].includes(kind)) {
      const rowHeight =
        kind === 'cobble'
          ? 32
          : kind === 'slate'
            ? 48
            : kind === 'brick'
              ? 32
              : 64;
      const cellWidth = kind === 'cobble' ? 42 : kind === 'brick' ? 100 : 125;
      for (let row = 0; row < 512 / rowHeight; row++)
        for (let col = -1; col <= 512 / cellWidth; col++) {
          const x = col * cellWidth + ((row % 2) * cellWidth) / 2;
          const y = row * rowHeight;
          const shade = Math.round(
            (kind === 'cobble' ? 184 : kind === 'brick' ? 194 : 210) +
              random() * (kind === 'cobble' ? 59 : 38),
          );
          const warm = kind === 'brick' ? Math.round(random() * 15) : 0;
          context.fillStyle = `rgb(${shade},${shade - warm},${shade - warm - 3})`;
          context.beginPath();
          context.roundRect(
            x + 2,
            y + 2,
            cellWidth - 4,
            rowHeight - 4,
            kind === 'cobble' ? 4 : 1,
          );
          context.fill();
          context.strokeStyle = '#ffffff18';
          context.lineWidth = 1;
          context.stroke();
        }
    } else if (kind === 'rubble') {
      for (let row = 0; row < 10; row++) {
        let x = -70 + (row % 2) * 35;
        while (x < 512) {
          const width = 38 + random() * 62,
            y = row * 52;
          const shade = Math.round(160 + random() * 85);
          const brick = random() < 0.1;
          context.fillStyle = `rgb(${shade},${shade - (brick ? 34 : 3)},${shade - (brick ? 47 : 10)})`;
          context.beginPath();
          context.moveTo(x + 5, y + 4 + random() * 7);
          context.lineTo(x + width * 0.5, y + 3);
          context.lineTo(x + width - 3, y + 8);
          context.lineTo(x + width - 5, y + 42 + random() * 5);
          context.lineTo(x + width * 0.45, y + 49);
          context.lineTo(x + 3, y + 43);
          context.closePath();
          context.fill();
          x += width;
        }
      }
    } else if (kind === 'fresco') {
      context.fillStyle = '#e6d9bb';
      context.fillRect(0, 0, 512, 512);
      for (let quarter = 0; quarter < 4; quarter++) {
        context.save();
        context.translate(256, 256);
        context.rotate((quarter * Math.PI) / 2);
        context.fillStyle = quarter % 2 ? '#dfd1af' : '#914b40';
        context.beginPath();
        context.moveTo(0, 0);
        context.lineTo(-256, -256);
        context.lineTo(256, -256);
        context.closePath();
        context.fill();
        context.strokeStyle = '#b19768';
        context.lineWidth = 5;
        context.beginPath();
        context.moveTo(-225, -238);
        context.lineTo(0, -22);
        context.lineTo(225, -238);
        context.stroke();
        for (const side of [-1, 1]) {
          context.strokeStyle = quarter % 2 ? '#a28460' : '#d0b386';
          context.lineWidth = 3;
          context.beginPath();
          context.moveTo(0, -70);
          context.bezierCurveTo(
            side * 115,
            -100,
            side * 115,
            -182,
            side * 38,
            -216,
          );
          context.stroke();
          for (let leaf = 0; leaf < 5; leaf++) {
            context.beginPath();
            context.ellipse(
              side * (40 + leaf * 9),
              -114 - leaf * 17,
              15,
              5,
              side * 0.6,
              0,
              Math.PI * 2,
            );
            context.stroke();
          }
        }
        context.fillStyle = '#a48c60';
        context.beginPath();
        context.ellipse(0, -182, 30, 36, 0, 0, Math.PI * 2);
        context.fill();
        context.fillStyle = '#6e8582';
        context.beginPath();
        context.arc(0, -182, 22, 0, Math.PI * 2);
        context.fill();
        context.restore();
      }
      context.strokeStyle = '#806653';
      context.lineWidth = 8;
      for (const side of [-1, 1]) {
        context.beginPath();
        context.moveTo(side < 0 ? 0 : 512, 0);
        context.lineTo(side < 0 ? 512 : 0, 512);
        context.stroke();
      }
      context.fillStyle = '#b5a16f';
      context.beginPath();
      context.arc(256, 256, 29, 0, Math.PI * 2);
      context.fill();
      context.fillStyle = '#6e8582';
      context.beginPath();
      context.arc(256, 256, 20, 0, Math.PI * 2);
      context.fill();
    } else if (kind === 'mosaic') {
      for (let row = 0; row < 32; row++)
        for (let col = 0; col < 32; col++) {
          const diamond = Math.abs((row % 8) - 3.5) + Math.abs((col % 8) - 3.5);
          const dark = row % 8 === 0 || col % 8 === 0 || diamond < 1.8;
          const shade = Math.round((dark ? 64 : 220) + random() * 22);
          context.fillStyle = `rgb(${shade},${shade + 2},${shade})`;
          context.fillRect(col * 16 + 1, row * 16 + 1, 14, 14);
        }
    } else {
      context.fillStyle = kind === 'grass' ? '#e4e9d3' : '#edece5';
      context.fillRect(0, 0, 512, 512);
    }
    if (kind === 'gravel' || kind === 'asphalt')
      for (let i = 0; i < 14000; i++) {
        const shade = Math.round(
          kind === 'asphalt' ? 175 + random() * 55 : 165 + random() * 80,
        );
        context.fillStyle =
          kind === 'asphalt'
            ? `rgb(${shade},${shade},${shade})`
            : `rgb(${shade},${shade - 4},${shade - 12})`;
        context.fillRect(
          random() * 512,
          random() * 512,
          1 + random() * (kind === 'asphalt' ? 1 : 3),
          1 + random() * (kind === 'asphalt' ? 1 : 2),
        );
      }
    if (!['mosaic', 'cobble', 'gravel', 'asphalt'].includes(kind))
      brushWash(context, random, kind);
    if (kind === 'rock') {
      for (let i = 0; i < 38; i++) {
        const x = random() * 512,
          y = random() * 512;
        const shade = Math.round(230 + random() * 15);
        context.fillStyle = `rgb(${shade},${shade},${shade - 6})`;
        context.beginPath();
        context.moveTo(x, y);
        context.lineTo(x + 12 + random() * 65, y - 10 + random() * 25);
        context.lineTo(x + 5 + random() * 55, y + 10 + random() * 60);
        context.lineTo(x - 15, y + random() * 35);
        context.closePath();
        context.fill();
      }
      for (let i = 0; i < 22; i++) {
        const x = random() * 512,
          y = random() * 512;
        context.strokeStyle = '#626c5f22';
        context.lineWidth = 0.8 + random() * 2;
        context.beginPath();
        context.moveTo(x, y);
        context.lineTo(x + 8, y + 18);
        context.lineTo(x - 4, y + 38 + random() * 55);
        context.stroke();
      }
    }
    for (let i = 0; i < 1800; i++) {
      const x = random() * 512,
        y = random() * 512;
      const bright = random() > 0.5;
      context.fillStyle = bright ? '#ffffff0d' : '#5863450b';
      context.fillRect(x, y, 1 + random() * 3, kind === 'grass' ? 5 : 2);
    }
    if (kind === 'stone' || kind === 'brick' || kind === 'slate') {
      for (let i = 0; i < 125; i++) {
        const x = random() * 512,
          y = random() * 512;
        context.strokeStyle = i % 3 ? '#ffffff19' : '#737b7220';
        context.lineWidth = 0.5 + random() * 1.2;
        context.beginPath();
        context.moveTo(x, y);
        context.lineTo(x + 4 + random() * 12, y - 1 + random() * 3);
        context.stroke();
      }
    }
    if (kind === 'wood' || kind === 'bark') {
      for (let i = 0; i < 130; i++) {
        const x = random() * 512;
        context.strokeStyle = '#42372a28';
        context.lineWidth = 1 + random() * 2;
        context.beginPath();
        context.moveTo(x, 0);
        context.bezierCurveTo(x + 15, 150, x - 15, 350, x + 5, 512);
        context.stroke();
      }
    }
    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 4;
    this.textures.set(kind, texture);
    return texture;
  }

  dispose() {
    this.materials.forEach((material) => material.dispose());
    this.textures.forEach((texture) => texture.dispose());
    this.gradient.dispose();
  }

  update(time: number) {
    this.time.value = time;
  }

  setNight(night: number) {
    for (const [key, material] of this.materials)
      if (key.startsWith('glass|') || key.startsWith('lamp|')) {
        material.emissive.set('#b39a65');
        material.emissiveIntensity =
          night * (key.startsWith('lamp|') ? 1.4 : 0.3);
      }
  }
}

export function spatialBatches(geometries: THREE.BufferGeometry[]) {
  const cells = new Map<string, THREE.BufferGeometry[]>();
  const center = new THREE.Vector3();
  for (const geometry of geometries) {
    geometry.computeBoundingBox();
    geometry.boundingBox?.getCenter(center);
    const key = `${Math.floor(center.x / 64)}|${Math.floor(center.z / 64)}`;
    const cell = cells.get(key) ?? [];
    cell.push(geometry);
    cells.set(key, cell);
  }
  return [...cells.values()];
}

export function prepareBatchGeometry(
  geometry: THREE.BufferGeometry,
  kind: MaterialKind,
) {
  if (!geometry.index) {
    const count = geometry.attributes.position.count;
    const indices =
      count > 65535 ? new Uint32Array(count) : new Uint16Array(count);
    for (let i = 0; i < count; i++) indices[i] = i;
    geometry.setIndex(new THREE.BufferAttribute(indices, 1));
  }
  if (kind !== 'fresco' || !geometry.getAttribute('uv'))
    worldUVs(geometry, kind);
  return geometry;
}

export function worldUVs(geometry: THREE.BufferGeometry, kind: MaterialKind) {
  const positions = geometry.attributes.position,
    normals = geometry.attributes.normal;
  const uv = new Float32Array(positions.count * 2);
  const scale =
    kind === 'rubble'
      ? 2
      : kind === 'rock'
        ? 8
        : kind === 'grass'
          ? 12
          : kind === 'mosaic'
            ? 2
            : kind === 'gravel'
              ? 3
              : kind === 'slate'
                ? 1.7
                : kind === 'cobble'
                  ? 1.7
                  : kind === 'brick'
                    ? 1.4
                    : kind === 'stone'
                      ? 3
                      : 4.5;
  for (let i = 0; i < positions.count; i++) {
    const x = positions.getX(i),
      y = positions.getY(i),
      z = positions.getZ(i);
    const vertical = Math.abs(normals.getY(i)) < 0.65;
    uv[i * 2] =
      (vertical && Math.abs(normals.getX(i)) > Math.abs(normals.getZ(i))
        ? z
        : x) / scale;
    uv[i * 2 + 1] = (vertical ? y : z) / scale;
  }
  geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
}

export function paintedSky() {
  return new THREE.Mesh(
    new THREE.SphereGeometry(1, 32, 16),
    new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: {
        time: { value: 0 },
        night: { value: 0 },
        zenith: { value: new THREE.Color('#72adc9') },
        horizon: { value: new THREE.Color('#d7e5cd') },
        cloud: { value: new THREE.Color('#fff7df') },
        sun: { value: new THREE.Vector3(-0.5, 0.6, 0.4).normalize() },
      },
      vertexShader: `
        varying vec3 vDirection;
        void main() {
          vDirection = position;
          vec4 clip = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          gl_Position = clip.xyww;
        }`,
      fragmentShader: `
        uniform float time, night;
        uniform vec3 zenith, horizon, cloud, sun;
        varying vec3 vDirection;
        float hash(vec2 p) {
          return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
        }
        float noise(vec2 p) {
          vec2 i = floor(p), f = fract(p);
          f = f * f * (3.0 - 2.0 * f);
          return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),
                     mix(hash(i + vec2(0.0, 1.0)), hash(i + 1.0), f.x), f.y);
        }
        void main() {
          vec3 direction = normalize(vDirection);
          float height = max(direction.y, 0.0);
          vec3 color = mix(horizon, zenith, smoothstep(0.0, 0.75, height));
          vec2 uv = direction.xz / (height + 0.25) * 5.0 + vec2(time * 0.006, 0.0);
          float field = noise(uv) * 0.55 + noise(uv * 2.0 + 8.3) * 0.25
                      + noise(uv * 4.0 - 3.7) * 0.13 + noise(uv * 8.0) * 0.07;
          float clouds = smoothstep(0.49, 0.68, field) * smoothstep(0.015, 0.15, height);
          color = mix(color, cloud, clouds * 0.75);
          color += cloud * pow(max(dot(direction, sun), 0.0), 96.0) * 0.2;
          vec2 starUV = vec2(atan(direction.z, direction.x), asin(clamp(direction.y, -1.0, 1.0))) * 180.0;
          float stars = step(0.992, hash(floor(starUV)))
            * (1.0 - smoothstep(0.03, 0.15, length(fract(starUV) - 0.5)));
          color += vec3(0.8, 0.88, 1.0) * stars * night * (1.0 - clouds) * smoothstep(0.0, 0.15, height);
          color += mix(vec3(1.0, 0.87, 0.57), vec3(0.8, 0.88, 1.0), night)
            * smoothstep(0.9996, 0.99985, dot(direction, sun)) * 0.8;
          gl_FragColor = vec4(color, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    }),
  );
}

export function paintedWater() {
  return new THREE.ShaderMaterial({
    fog: true,
    uniforms: THREE.UniformsUtils.merge([
      THREE.UniformsLib.fog,
      {
        time: { value: 0 },
        deep: { value: new THREE.Color('#327f8b') },
        shallow: { value: new THREE.Color('#70b2ac') },
        skyTint: { value: new THREE.Color('#d0e4d7') },
        sparkle: { value: 0.18 },
      },
    ]),
    vertexShader: `
      varying vec3 vWorldPosition;
      #include <fog_pars_vertex>
      void main() {
        vWorldPosition = (modelMatrix * vec4(position, 1.0)).xyz;
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: `
      uniform float time, sparkle;
      uniform vec3 deep, shallow, skyTint;
      varying vec3 vWorldPosition;
      #include <fog_pars_fragment>
      void main() {
        vec2 p = vWorldPosition.xz;
        float ripple = sin(p.x * 0.15 + p.y * 0.31 + time * 0.6) * 0.06
                     + sin(p.x * 0.28 - p.y * 0.1 - time * 0.4) * 0.04;
        float glint = pow(max(0.0, sin(p.y * 0.65 + sin(p.x * 0.11 + time * 0.2) * 1.8 + time * 0.5)), 22.0)
                    * smoothstep(0.35, 0.8, sin(p.x * 0.29 + p.y * 0.05));
        float fresnel = pow(1.0 - max(normalize(cameraPosition - vWorldPosition).y, 0.0), 2.0);
        vec3 color = mix(deep, shallow, 0.4 + ripple);
        color = mix(color, skyTint, fresnel * 0.42);
        color += glint * sparkle;
        gl_FragColor = vec4(color, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        #include <fog_fragment>
      }`,
  });
}
