import { chromium } from '@playwright/test';
import fs from 'node:fs/promises';

const folder = process.argv[2];
if (!folder) throw new Error('Provide a screenshot output directory.');
await fs.mkdir(folder, { recursive: true });
const browser = await chromium.launch({ args: ['--use-angle=metal'] });
try {
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
  });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  await page.goto('http://127.0.0.1:5173/');
  await page.getByRole('button', { name: 'Enter Vyšehrad' }).click();
  await page
    .getByRole('button', { name: 'Change time of day, currently golden' })
    .click();
  const canvas = page.getByRole('img', {
    name: 'Interactive 3D world of Vyšehrad',
  });
  if (process.argv[3] === '--road') {
    await page.waitForTimeout(900);
    await page.keyboard.press('p');
    await canvas.screenshot({ path: `${folder}/leopold-start.png` });
    await page.keyboard.press('p');
  }
  const pose = async () => {
    const transform = await page
      .locator('.minimap-card .world-map > g')
      .last()
      .getAttribute('transform');
    const match = transform?.match(
      /translate\(([-+\d.eE]+) ([-+\d.eE]+)\) rotate\(([-+\d.eE]+)\)/,
    );
    if (!match) throw new Error(`Missing player pose: ${transform}`);
    return {
      x: Number(match[1]),
      z: Number(match[2]),
      yaw: (Number(match[3]) * Math.PI) / 180,
    };
  };
  const turn = async (yaw, vertical = 0) => {
    const current = await pose();
    const delta = Math.atan2(
      Math.sin(yaw - current.yaw),
      Math.cos(yaw - current.yaw),
    );
    await page.mouse.move(700, 580);
    await page.mouse.down();
    await page.mouse.move(700 - delta / 0.005, 580 + vertical, { steps: 10 });
    await page.mouse.up();
    await page.waitForTimeout(250);
  };
  const altitude = async () => {
    const text = await page.locator('.expedition-footer').innerText();
    return Number(text.match(/(\d+) m up/)?.[1] ?? 0);
  };
  await page.getByRole('button', { name: 'Walking', exact: true }).click();
  const flyTo = async (x, z, height) => {
    for (let attempt = 0; attempt < 30; attempt++) {
      const current = await pose();
      const distance = Math.hypot(x - current.x, z - current.z);
      if (distance < 2) break;
      await turn(Math.atan2(x - current.x, current.z - z));
      await page.keyboard.down('w');
      await page.waitForTimeout(Math.min(1200, (distance / 32) * 1000));
      await page.keyboard.up('w');
      await page.waitForTimeout(250);
    }
    const current = await pose();
    if (Math.hypot(x - current.x, z - current.z) > 3)
      throw new Error(
        `Flight did not reach ${x}, ${z}; stopped at ${current.x}, ${current.z}.`,
      );
    for (let attempt = 0; attempt < 8; attempt++) {
      const difference = height - (await altitude());
      if (Math.abs(difference) < 2) break;
      const key = difference > 0 ? 'e' : 'q';
      await page.keyboard.down(key);
      await page.waitForTimeout(
        Math.min(1200, (Math.abs(difference) / 32) * 1000),
      );
      await page.keyboard.up(key);
      await page.waitForTimeout(250);
    }
  };
  const wallsOnly = process.argv[3] === '--walls';
  const riversideRepair = process.argv[3] === '--riverside-repair';
  const arcadeOnly = process.argv[3] === '--arcades';
  const galleryOnly = process.argv[3] === '--gallery';
  const styleOnly = process.argv[3] === '--style';
  const taborOnly = process.argv[3] === '--tabor';
  const detailsOnly =
    process.argv[3] === '--details' ||
    riversideRepair ||
    arcadeOnly ||
    galleryOnly ||
    styleOnly;
  const roadOnly = process.argv[3] === '--road';
  const cemeteryOnly = process.argv[3] === '--cemetery';
  const gradesOnly = process.argv[3] === '--grades';
  const joinsOnly = process.argv[3] === '--joins';
  const bridgeOnly = process.argv[3] === '--bridge';
  const cliffOnly = process.argv[3] === '--cliff' || bridgeOnly;
  const gardenOnly = process.argv[3] === '--garden-exit';
  const gateOnly = process.argv[3] === '--cihelna';
  const streetOnly = process.argv[3] === '--street' || gateOnly;
  const passagesOnly =
    process.argv[3] === '--passages' ||
    roadOnly ||
    cemeteryOnly ||
    gradesOnly ||
    joinsOnly ||
    cliffOnly ||
    gardenOnly ||
    streetOnly ||
    taborOnly;
  await turn(0, wallsOnly || detailsOnly || passagesOnly ? -30 : 210);
  let inspectionPitch = 0.33;
  let inspectionZoom = 17;
  const sculptureViews = new Set([
    'libuse-premysl',
    'lumir-song',
    'ctirad-sarka',
    'slavoj-zaboj',
    'karlach',
    'charles-iv',
    'saint-sebastian-wall',
  ]);
  const inspections = passagesOnly
    ? await page.evaluate(
        async ({
          roadOnly,
          cemeteryOnly,
          gradesOnly,
          joinsOnly,
          cliffOnly,
          gardenOnly,
          streetOnly,
          taborOnly,
        }) => {
          const world = await import('/src/world/geo.ts');
          const gate = world.gateBuildings.find(
            (gate) => gate.feature.id === 51700613,
          );
          const along = (gate, value) => [
            gate.center[0] - gate.axis[1] * value,
            gate.center[1] + gate.axis[0] * value,
          ];
          if (gardenOnly) {
            const door = world.posterns.find(
              (postern) => postern.feature.id === 12461779632,
            );
            if (!door) throw new Error('Missing garden exit.');
            const at = (u, v) => [
              door.frame.center[0] +
                door.frame.axis[0] * u -
                door.frame.axis[1] * v,
              door.frame.center[1] +
                door.frame.axis[1] * u +
                door.frame.axis[0] * v,
            ];
            const side = at(10, 9);
            return [
              ['garden-exit-front', ...at(0, 13), 4, -door.frame.angle],
              [
                'garden-exit-thickness',
                ...side,
                6,
                Math.atan2(
                  door.frame.center[0] - side[0],
                  side[1] - door.frame.center[1],
                ),
              ],
              [
                'garden-exit-outside',
                ...at(0, -12),
                4,
                -door.frame.angle + Math.PI,
              ],
              [
                'garden-exit-walk',
                ...at(0, 5),
                3,
                -door.frame.angle,
                [at(0, 1.5), at(0, 0), at(0, -1.5), at(0, -5)],
              ],
            ];
          }
          if (cliffOnly)
            return [
              ['riverside-cliff-contact', -390, 60, 26, Math.PI / 2],
              ['southern-cliff-contact', -285, 185, 20, 0],
              ['east-retaining-face', 125, 20, 11, -Math.PI / 2],
              ['rock-backed-bastion', -350, 205, 18, 1],
              ['bastion-earth-above-rock', -320, 180, 53, 0.9],
              ['nuselsky-from-rampart', 107, 40, 5, Math.PI / 2],
              ['nuselsky-bridge-overview', 320, -125, 45, Math.PI / 2],
              [
                'riverside-rampart-walk',
                -254,
                -150,
                3,
                Math.PI,
                [
                  [-254, -135],
                  [-254, -120],
                  [-254, -110],
                ],
              ],
            ];
          if (streetOnly) {
            const a = world.upperPromenade[0],
              b = world.upperPromenade[1];
            const atGate = (u, v) => [
              gate.center[0] + gate.axis[0] * u - gate.axis[1] * v,
              gate.center[1] + gate.axis[1] * u + gate.axis[0] * v,
            ];
            return [
              ['cihelna-clean-front', ...along(gate, 24), 3, -gate.angle],
              ['cihelna-left-join', ...atGate(-9, 20), 3, -gate.angle],
              [
                'cihelna-clean-back',
                ...along(gate, -24),
                3,
                -gate.angle + Math.PI,
              ],
              [
                'cihelna-lower-walk',
                ...along(gate, 16),
                3,
                -gate.angle,
                [along(gate, 5), along(gate, -5), along(gate, -18)],
              ],
              [
                'cihelna-upper-walk',
                ...a,
                3,
                Math.atan2(b[0] - a[0], a[1] - b[1]),
                [b],
              ],
              ...world.streetFrontages.map((frame) => {
                const at = (u, v) => [
                  frame.center[0] + frame.axis[0] * u - frame.axis[1] * v,
                  frame.center[1] + frame.axis[1] * u + frame.axis[0] * v,
                ];
                const shop = frame.detail.tags.shop;
                return shop
                  ? [
                      'frontage-boruvka-walk',
                      ...at(-5, frame.depth / 2 + 3.5),
                      2,
                      -frame.angle,
                      [
                        at(-3, frame.depth / 2 + 3.5),
                        at(3, frame.depth / 2 + 3.5),
                        at(5, frame.depth / 2 + 3.5),
                      ],
                    ]
                  : [
                      `frontage-${frame.detail.id}`,
                      ...at(0, frame.depth / 2 + 11),
                      2,
                      -frame.angle,
                    ];
              }),
              [
                'pevnosti-stair-cheeks-walk',
                225.23,
                286.83,
                3,
                0,
                [
                  [231.47, 279.69],
                  [227.79, 276.67],
                ],
              ],
              ['pevnosti-stair-close', 231.3, 282, 5, 0],
            ];
          }
          if (joinsOnly) {
            const leopold = world.gateBuildings.find(
              (gate) => gate.feature.id === 51718887,
            );
            if (!leopold) throw new Error('Missing Leopold Gate.');
            const at = (u, v) => [
              leopold.center[0] + leopold.axis[0] * u - leopold.axis[1] * v,
              leopold.center[1] + leopold.axis[1] * u + leopold.axis[0] * v,
            ];
            return [
              ['leopold-clean-facade', ...at(0, -18), 3, world.initialHeading],
              ...leopold.openings.map((opening, index) => [
                `leopold-arch-${index}-walk`,
                ...at(opening.offset, -10),
                3,
                world.initialHeading,
                [
                  at(opening.offset, -3),
                  at(opening.offset, 3),
                  at(opening.offset, 10),
                ],
              ]),
              [
                'leopold-clean-back',
                ...at(0, 16),
                3,
                world.initialHeading + Math.PI,
              ],
              ['east-rampart-soil', 92, 10, 6, 1.4],
              [
                'east-rampart-walk',
                80,
                -20,
                3,
                2.9,
                [
                  [89, 0],
                  [98, 20],
                  [107, 40],
                ],
              ],
              ['east-exterior-courts', 125, 20, 12, -Math.PI / 2],
            ];
          }
          if (gradesOnly) {
            const leopold = world.gateBuildings.find(
              (gate) => gate.feature.id === 51718887,
            );
            if (!leopold) throw new Error('Missing Leopold Gate.');
            const at = (u, v) => [
              leopold.center[0] + leopold.axis[0] * u - leopold.axis[1] * v,
              leopold.center[1] + leopold.axis[1] * u + leopold.axis[0] * v,
            ];
            return [
              [
                'leopold-approach-edges',
                ...at(0, -25),
                3,
                world.initialHeading,
              ],
              [
                'leopold-sidewalks-walk',
                ...at(-4.5, -32),
                3,
                world.initialHeading,
                [
                  at(-4.5, -24),
                  at(-4.5, -14),
                  at(4.5, -14),
                  at(4.5, -24),
                  at(4.5, -32),
                ],
              ],
              ['tabor-outer-right-crest', 316.46, 242.06, 16, -2.56],
              ['tabor-outer-south-crest', 301, 384, 16, -1.6],
              ['riverside-planar-crest', -280, 150, 16, 1.5],
              ['northeast-planar-crest', 145, 57, 15, -0.6],
            ];
          }
          if (cemeteryOnly || taborOnly) {
            const tabor = world.gateBuildings.find(
              (gate) => gate.feature.id === 49811189,
            );
            if (!tabor) throw new Error('Missing Tabor Gate.');
            const at = (u, v) => [
              world.slavin.point[0] +
                Math.cos(world.slavin.angle) * u +
                Math.sin(world.slavin.angle) * v,
              world.slavin.point[1] -
                Math.sin(world.slavin.angle) * u +
                Math.cos(world.slavin.angle) * v,
            ];
            const front = along(tabor, -24);
            const yaw = Math.atan2(
              tabor.center[0] - front[0],
              front[1] - tabor.center[1],
            );
            if (taborOnly)
              return [
                ['tabor-exterior', ...front, 3, yaw],
                [
                  'tabor-gate-walk',
                  ...front,
                  3,
                  yaw,
                  [
                    along(tabor, -6),
                    tabor.center,
                    along(tabor, 6),
                    along(tabor, 16),
                  ],
                ],
                ['tabor-tunnel-cover', 219, 286, 22, Math.PI],
                ['tabor-garden-cover', 202, 302, 16, Math.PI / 2],
                ['tabor-outer-postern', 242, 259, 16, -Math.PI / 2],
                ['tabor-stairs-close', 231.3, 282, 7, 0],
                ['tabor-outer-right-crest', 316.46, 242.06, 16, -2.56],
                ['tabor-outer-south-crest', 301, 384, 16, -1.6],
                ['cemetery-exit-outside', -106, 8.5, 3, -Math.PI / 2],
                ['cemetery-exit-inside', -130, 10.8, 3, Math.PI / 2],
                [
                  'cemetery-exit-walk',
                  -126,
                  10.4,
                  3,
                  Math.PI / 2,
                  [
                    [-122, 10],
                    [-118.6, 9.65],
                    [-114, 9.2],
                    [-110, 8.8],
                  ],
                ],
              ];
            return [
              ['tabor-exterior', ...front, 3, yaw],
              [
                'tabor-gate-walk',
                ...front,
                3,
                yaw,
                [
                  along(tabor, -6),
                  tabor.center,
                  along(tabor, 6),
                  along(tabor, 16),
                ],
              ],
              ['tabor-brick-wall', 289, 322, 13, -2.0],
              ['cemetery-east-wall', -108, -3, 3, -Math.PI / 2],
              [
                'cemetery-slavin-overview',
                ...at(0, 6),
                18,
                Math.atan2(-world.slavin.front[0], world.slavin.front[1]),
              ],
              [
                'cemetery-slavin',
                ...at(0, 9),
                4,
                Math.atan2(-world.slavin.front[0], world.slavin.front[1]),
              ],
              [
                'cemetery-slavin-walk',
                ...at(-3, 9),
                3,
                Math.atan2(-world.slavin.front[0], world.slavin.front[1]),
                [at(-3, 6.1), at(-3, 4.65), at(-3, 2)],
              ],
              ['cemetery-graves', -181, -28, 5, 1.5],
            ];
          }
          const leopold = world.gateBuildings.find(
            (gate) => gate.feature.id === 51718887,
          );
          const a = world.upperPromenade[0],
            b = world.upperPromenade[1];
          const lower = along(gate, -20),
            leo = along(leopold, -18);
          const cafe = world.cafeFrontage();
          const cafeView = [
            cafe.center[0] - cafe.axis[1] * 10,
            cafe.center[1] + cafe.axis[0] * 10,
          ];
          const premysl = world.sculptures.find(
            (sculpture) => sculpture.id === 1200812873,
          );
          const views = [
            [
              'brick-upper-walk',
              ...a,
              3,
              Math.atan2(b[0] - a[0], a[1] - b[1]),
              [b],
            ],
            [
              'brick-gallery-walk',
              ...lower,
              3,
              -2.88437,
              [along(gate, -5), along(gate, 5), along(gate, 20)],
            ],
            [
              'leopold-walk',
              ...leo,
              3,
              0,
              [
                along(leopold, -6),
                along(leopold, 0),
                along(leopold, 6),
                along(leopold, 18),
              ],
            ],
            ['northeast-corner', 107, -99, 12, -2.4],
            ['clay-court', 82, 188, 3, 0],
            ['vegetable-garden', 155, 136, 3, 0.3],
            [
              'garden-exit-walk',
              173.02,
              134.25,
              3,
              0,
              [
                [170, 128.42],
                [170.9, 125.54],
                [178, 121],
                [183.98, 117.38],
              ],
            ],
            [
              'postern-chain-walk',
              189.31,
              309.11,
              3,
              0,
              [
                [199.21, 303.45],
                [204.77, 299.91],
                [215.46, 290.21],
                [222.42, 282.93],
                [227.79, 276.67],
                [229.48, 274.67],
                [234.54, 266.95],
                [247.83, 255.22],
                [248.61, 250.34],
              ],
            ],
            [
              'stairs-walk',
              225.23,
              286.83,
              3,
              0,
              [
                [231.47, 279.69],
                [227.79, 276.67],
              ],
            ],
            ['stairs-close', 231.3, 282, 7, 0],
            [
              'premyslid-larger-walk',
              premysl.point[0] + Math.sin(premysl.angle) * 15,
              premysl.point[1] + Math.cos(premysl.angle) * 15,
              3,
              -premysl.angle,
            ],
            ['medieval-well-walk', -249.5, 48.5, 3, -0.94],
            ['stone-bridge-walk', -167, 43, 3, -0.07],
            [
              'cafe-terrace-walk',
              ...cafeView,
              3,
              Math.atan2(cafe.axis[1], cafe.axis[0]),
            ],
            ['park-furniture', -23, 36, 8, 0.5],
            ['lamps-night-walk', 73.34, 137.52, 3, -0.88],
          ];
          return roadOnly
            ? [
                [
                  'leopold-spawn-walk',
                  ...world.spawn,
                  3,
                  world.initialHeading,
                  [leopold.center, along(leopold, 12)],
                ],
                ['rotunda-south', 76, 106, 7, 0],
                ['rotunda-apse', 86, 90, 7, -1.91],
                ['pevnosti-garden-bank', 116, 180, 8, 0.45],
                [
                  'pevnosti-road-walk',
                  91.6,
                  152.6,
                  3,
                  2.2,
                  [
                    [139.33, 193.22],
                    [181.63, 251.34],
                    [201.81, 271.78],
                    [217.28, 284.46],
                    [225.22, 290.96],
                    [239.37, 300.39],
                    [256.66, 308.29],
                    [263.215, 310.68],
                    [269.77, 313.07],
                    [289.07, 321.17],
                  ],
                ],
                ...views.filter(([name]) =>
                  [
                    'postern-chain-walk',
                    'stairs-walk',
                    'stairs-close',
                  ].includes(name),
                ),
              ]
            : views;
        },
        {
          roadOnly,
          cemeteryOnly,
          gradesOnly,
          joinsOnly,
          cliffOnly,
          gardenOnly,
          streetOnly,
          taborOnly,
        },
      )
    : detailsOnly
      ? [
          ['libuse-premysl', -208, 56.5, 3, -Math.PI / 2],
          ['lumir-song', -208, 69, 3, -Math.PI / 2],
          ['ctirad-sarka', -171, 69.5, 3, Math.PI / 2],
          ['slavoj-zaboj', -171, 56.5, 3, Math.PI / 2],
          ['myslbek-garden', -188, 94, 36, 0],
          ['garden-portal-walk', -222.62, 38, 3, 0],
          ['saint-sebastian-wall', -252, -21, 0, -Math.PI / 2],
          ['cemetery-arcade-north', -183, -35, 0.5, 0],
          ['cemetery-arcade-west', -235, -35, 0.5, -Math.PI / 2],
          [
            'cemetery-arcade-walk',
            -194,
            -51.5,
            0,
            Math.PI / 2,
            [
              [-194, -51.5],
              [-188, -50.9],
              [-182, -50.3],
              [-176, -49.7],
              [-171, -49.2],
            ],
          ],
          ['road-gallery-north', -319.22, 83.04, 2, 2.6579],
          ['road-gallery-south', -305, 143, 2, 0.0553],
          [
            'road-gallery-walk',
            -319.22,
            83.04,
            0,
            2.6579,
            [
              [-319.22, 83.04],
              [-316.79, 87.91],
              [-313.64, 93.66],
              [-311.45, 97.83],
              [-308.81, 103.85],
              [-307.7, 107.59],
              [-307.05, 111.51],
              [-306.23, 120.62],
              [-305.72, 129.83],
              [-305.35, 139.65],
              [-305.06, 141.81],
            ],
          ],
          ['riverside-door-front', -270.72, 114.41, 1, -2.7312],
          [
            'riverside-door-walk',
            -272.1,
            117.6,
            0,
            -2.7312,
            [
              [-272.12, 117.62],
              [-272.91, 119.46],
              [-273.31, 120.37],
              [-273.71, 121.29],
              [-274.11, 122.21],
              [-274.51, 123.12],
            ],
          ],
          ['sebastian-door-front', -250, -6.5, 0, -1.8394],
          [
            'sebastian-door-walk',
            -250.37,
            -3.01,
            0,
            -1.8394,
            [
              [-250.37, -3.01],
              [-254.72, -1.74],
              [-255.22, -3.36],
              [-255.65, -4.78],
              [-256.73, -4.6],
              [-257.69, -4.34],
              [-258.65, -4.07],
              [-259.62, -3.81],
            ],
          ],
          ['brick-gate-exterior', -87, -118, 3, -2.897],
          ['brick-gate-walk', -91.35, -101.94, 3, -2.88437],
          ['brick-gate-upper', -118, -84, 16, Math.PI / 2],
          ['karlach', 9.92, -7, 3, Math.PI],
          ['softened-terrain', 122, -78, 10, -2.16],
          ['charles-iv', 568.5, -498.3, 3, 1.83],
        ]
      : wallsOnly
        ? [
            ['outer-wall-east', 316.46, 242.06, 16, -2.5603],
            ['outer-wall-south', 218.87, 369.18, 5, 0.73014],
            ['internal-retaining-wall', -58.75, -52.18, 4, -2.87123],
            ['low-parapet', -249.7, 138, 4, -0.31],
          ]
        : [
            ['cemetery', -185, -28, 36, 0],
            ['cemetery-close', -185, -28, 7, 0],
            ['cemetery-south-fence', -233, -3, 8, 0],
            ['basilica-roofs', -190, 8, 70, Math.PI / 2],
            ['park', 0, 50, 34, 0],
            ['rotunda', 86, 108, 8, 0],
            ['fortifications', -270, 145, 24, Math.PI / 2],
            ['rampart-walking', -249.7, 138, 4, -0.31],
          ];
  if (styleOnly)
    inspections.splice(
      0,
      inspections.length,
      ['style-basilica', -240, 25, 18, 1.3],
      ['style-meadow', 0, 50, 20, 0.6],
      ['style-river', -280, 140, 25, -Math.PI / 2],
      ['style-overlook', -200, 80, 65, 0],
      ['road-gallery-south', -305, 143, 2, 0.0553],
      ['road-gallery-north', -319.22, 83.04, 2, 2.6579],
    );
  const walkTo = async (target) => {
    for (let attempt = 0; attempt < 30; attempt++) {
      const current = await pose();
      const distance = Math.hypot(target[0] - current.x, target[1] - current.z);
      if (distance < 0.7) return;
      await turn(Math.atan2(target[0] - current.x, current.z - target[1]));
      await page.keyboard.down('w');
      await page.waitForTimeout(Math.min(600, (distance / 7) * 1000));
      await page.keyboard.up('w');
      await page.waitForTimeout(210);
      const next = await pose();
      if (Math.hypot(next.x - current.x, next.z - current.z) < 0.12)
        throw new Error(
          `Walking stalled toward ${JSON.stringify(target)} at ${JSON.stringify(next)}.`,
        );
    }
    throw new Error(`Walking did not reach ${JSON.stringify(target)}.`);
  };
  const startName = process.argv
    .find((argument) => argument.startsWith('--from='))
    ?.slice(7);
  const startIndex = startName
    ? inspections.findIndex((view) => view[0] === startName)
    : 0;
  if (startIndex < 0) throw new Error(`Unknown starting view: ${startName}`);
  const onlyName = process.argv
    .find((argument) => argument.startsWith('--only='))
    ?.slice(7);
  const onlyNames = onlyName?.split(',');
  const selected = inspections
    .slice(startIndex)
    .filter((view) => !onlyNames || onlyNames.includes(view[0]))
    .filter((view) => !gateOnly || view[0].startsWith('cihelna-'))
    .filter((view) => !arcadeOnly || view[0].startsWith('cemetery-arcade-'))
    .filter((view) => !galleryOnly || view[0].startsWith('road-gallery-'))
    .filter(
      (view) =>
        !riversideRepair ||
        view[0] === 'saint-sebastian-wall' ||
        view[0].startsWith('riverside-door-') ||
        view[0].startsWith('sebastian-door-'),
    )
    .filter((view) => !bridgeOnly || view[0].startsWith('nuselsky-'));
  if (onlyName && !selected.length)
    throw new Error(`Unknown inspection view: ${onlyName}`);
  for (const [name, x, z, height, yaw, route] of selected) {
    if (detailsOnly || passagesOnly) {
      const zoom =
        name === 'style-basilica'
          ? 50
          : name === 'style-overlook'
            ? 35
            : name === 'cemetery-slavin' ||
                name.startsWith('frontage-') ||
                name.startsWith('cemetery-arcade-')
              ? 9
              : name === 'cemetery-slavin-walk'
                ? 9
                : name.startsWith('cemetery-exit-')
                  ? 0.1
                  : name === 'premyslid-larger-walk'
                    ? 14
                    : [
                          'rotunda-south',
                          'rotunda-apse',
                          'cemetery-slavin',
                          'cemetery-slavin-walk',
                        ].includes(name)
                      ? 9
                      : [
                            'clay-court',
                            'vegetable-garden',
                            'pevnosti-garden-bank',
                          ].includes(name)
                        ? 35
                        : sculptureViews.has(name) ||
                            [
                              'premyslid-larger-walk',
                              'medieval-well-walk',
                              'stone-bridge-walk',
                              'cafe-terrace-walk',
                            ].includes(name)
                          ? 9
                          : 17;
      await canvas.hover();
      await page.mouse.wheel(0, (zoom - inspectionZoom) / 0.03);
      inspectionZoom = zoom;
    }
    await flyTo(x, z, height);
    const walking =
      name === 'cemetery-close' ||
      name === 'rampart-walking' ||
      name === 'low-parapet' ||
      name.endsWith('-walk') ||
      (detailsOnly && sculptureViews.has(name));
    if (walking)
      await page.getByRole('button', { name: 'Flying', exact: true }).click();
    const pitch = [
      'tabor-tunnel-cover',
      'tabor-garden-cover',
      'tabor-outer-postern',
    ].includes(name)
      ? 0.8
      : name.startsWith('style-')
        ? name === 'style-overlook'
          ? 0.6
          : 0.15
        : name.startsWith('nuselsky-')
          ? 0.03
          : [
                'riverside-cliff-contact',
                'southern-cliff-contact',
                'rock-backed-bastion',
              ].includes(name)
            ? -0.12
            : [
                  'myslbek-garden',
                  'clay-court',
                  'vegetable-garden',
                  'pevnosti-garden-bank',
                  'cemetery-slavin-overview',
                ].includes(name)
              ? 0.9
              : [
                    'rotunda-south',
                    'rotunda-apse',
                    'cemetery-slavin',
                    'cemetery-slavin-walk',
                    'tabor-exterior',
                    'cihelna-clean-front',
                    'cihelna-left-join',
                    'cihelna-clean-back',
                    'garden-exit-front',
                    'garden-exit-thickness',
                    'garden-exit-outside',
                    'saint-sebastian-wall',
                    'riverside-door-front',
                    'sebastian-door-front',
                    'cemetery-arcade-north',
                    'cemetery-arcade-west',
                    'road-gallery-north',
                    'road-gallery-south',
                  ].includes(name)
                ? 0.1
                : name === 'premyslid-larger-walk'
                  ? 0.15
                  : 0.33;
    await turn(
      yaw,
      detailsOnly || passagesOnly
        ? (pitch - inspectionPitch) / 0.003
        : walking && !wallsOnly
          ? -190
          : name === 'basilica-roofs'
            ? 190
            : 0,
    );
    inspectionPitch = pitch;
    if (
      name === 'rampart-walking' ||
      name === 'low-parapet' ||
      (name.endsWith('-walk') && !passagesOnly && !route)
    ) {
      const start = await pose();
      await page.keyboard.down('w');
      await page.waitForTimeout(name === 'brick-gate-walk' ? 5000 : 1400);
      await page.keyboard.up('w');
      const end = await pose();
      const minimum = name === 'brick-gate-walk' ? 28 : 3;
      if (Math.hypot(end.x - start.x, end.z - start.z) < minimum)
        throw new Error(
          `${name} is not walkable: ${JSON.stringify({ start, end })}.`,
        );
      if (name === 'garden-portal-walk') await turn(Math.PI);
    }
    if (route) {
      for (const [index, target] of route.entries()) {
        await walkTo(target);
        if (index === 0 || index === 3 || index === 7) {
          await page.keyboard.press('p');
          await canvas.screenshot({
            path: `${folder}/${name}-step-${index}.png`,
          });
          await page.keyboard.press('p');
        }
      }
      console.log('Verified walking route', name, await pose());
    }
    if (name.startsWith('lamps-night'))
      await page
        .getByRole('button', { name: 'Change time of day, currently day' })
        .click();
    await page.waitForTimeout(900);
    await page.keyboard.press('p');
    await canvas.screenshot({ path: `${folder}/${name}.png` });
    await page.keyboard.press('p');
    if (name === 'cafe-terrace-walk') {
      await page
        .getByRole('button', { name: 'Change time of day, currently day' })
        .click();
      await page.waitForTimeout(600);
      await page.keyboard.press('p');
      await canvas.screenshot({ path: `${folder}/cafe-fire-night.png` });
      await page.keyboard.press('p');
      await page
        .getByRole('button', { name: 'Change time of day, currently night' })
        .click();
      await page
        .getByRole('button', { name: 'Change time of day, currently golden' })
        .click();
    }
    console.log(
      name,
      await pose(),
      await page.locator('.expedition-footer').innerText(),
    );
    if (walking)
      await page.getByRole('button', { name: 'Walking', exact: true }).click();
  }
  console.log(
    'Scene content',
    await page.evaluate(async () => {
      const world = await import('/src/world/geo.ts');
      return {
        trees: world.treePositions().length,
        graves: world.gravePlots.length,
        cemeteries: world.cemeteries.length,
        sculptures: world.sculptures.map(({ id, tags }) => ({
          id,
          name: tags.name,
        })),
        brickGate: (() => {
          const gate = world.gateBuildings.find(
            (gate) => gate.feature.id === 51700613,
          );
          if (!gate) throw new Error('Missing Brick Gate.');
          return {
            road: world.elevation(...gate.center),
            upperRampart: world.rampartTerrace(gate.center)?.level,
          };
        })(),
        parkDepression: (() => {
          const point = [110, -70];
          const before = (x, z) => {
            const raw = world.rawElevation(x, z);
            const terrace = world.rampartTerrace([x, z]);
            return terrace ? raw + (terrace.level - raw) * terrace.weight : raw;
          };
          const depth = (sample) =>
            [
              [-5, 0],
              [5, 0],
              [0, -5],
              [0, 5],
            ].reduce(
              (sum, [dx, dz]) => sum + sample(point[0] + dx, point[1] + dz),
              0,
            ) /
              4 -
            sample(...point);
          return { before: depth(before), after: depth(world.elevation) };
        })(),
      };
    }),
  );
  if (errors.length) throw new Error(errors.join('\n'));
} finally {
  await browser.close();
}
