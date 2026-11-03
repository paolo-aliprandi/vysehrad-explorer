import { expect, test } from '@playwright/test';

test('renders OSM world, moves, flies, discovers landmarks and persists progress', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  await page.goto('/');
  const enter = page.getByRole('button', { name: 'Enter Vyšehrad' });
  await expect(enter).toBeEnabled();
  await expect(
    page.getByRole('img', { name: 'Interactive 3D world of Vyšehrad' }),
  ).toBeVisible();
  await page.screenshot({ path: 'test-results/welcome.png' });
  await enter.click();
  await expect(page.getByText('1 / 4')).toBeVisible();
  await page.keyboard.down('w');
  await expect
    .poll(async () => {
      const text = await page.locator('.expedition-footer').innerText();
      return Number.parseInt(text);
    })
    .toBeGreaterThan(2);
  await page.keyboard.up('w');

  const cdp = await page.context().newCDPSession(page);
  const { result: prototype } = await cdp.send('Runtime.evaluate', {
    expression:
      "import(performance.getEntriesByType('resource').find(entry => new URL(entry.name).pathname === '/src/world/engine.ts').name).then(module => module.World.prototype)",
    awaitPromise: true,
  });
  const { objects } = await cdp.send('Runtime.queryObjects', {
    prototypeObjectId: prototype.objectId,
  });
  const avatarState = async () => {
    const result = await cdp.send('Runtime.callFunctionOn', {
      objectId: objects.objectId,
      returnByValue: true,
      functionDeclaration: `function() {
        const game = this.find(world => !world.disposed);
        const drone = game.scene.getObjectByName('Flight drone');
        return {
          walking: game.scene.getObjectByName('Walking explorer').visible,
          flying: drone.visible,
          rotor: drone.getObjectByName('Drone rotor 1').rotation.y,
          pitch: drone.rotation.x,
          bank: drone.rotation.z
        };
      }`,
    });
    if (result.exceptionDetails)
      throw new Error('Could not inspect the rendered player model.');
    return result.result.value;
  };
  expect(await avatarState()).toMatchObject({ walking: true, flying: false });
  await page.getByRole('button', { name: 'Walking', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Flying', exact: true }),
  ).toHaveAttribute('aria-pressed', 'true');
  await expect
    .poll(avatarState)
    .toMatchObject({ walking: false, flying: true });
  const rotor = (await avatarState()).rotor;
  await expect
    .poll(async () => Math.abs(Math.sin((await avatarState()).rotor - rotor)))
    .toBeGreaterThan(0.05);
  await page.keyboard.down('w');
  await page.keyboard.down('d');
  await expect
    .poll(async () => (await avatarState()).pitch)
    .toBeGreaterThan(0.05);
  await expect
    .poll(async () => (await avatarState()).bank)
    .toBeGreaterThan(0.05);
  await page.keyboard.up('w');
  await page.keyboard.up('d');
  await expect
    .poll(async () => Math.abs((await avatarState()).bank))
    .toBeLessThan(0.01);
  await page.screenshot({ path: 'test-results/flight-drone.png' });
  await page.keyboard.down('e');
  await expect
    .poll(async () => {
      const text = await page.locator('.expedition-footer').innerText();
      return Number(text.match(/(\d+) m up/)?.[1]);
    })
    .toBeGreaterThan(10);
  await page.keyboard.up('e');
  await page.getByRole('button', { name: 'Flying', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Walking', exact: true }),
  ).toBeVisible();
  await expect
    .poll(avatarState)
    .toMatchObject({ walking: true, flying: false });
  const riverRoads = await cdp.send('Runtime.callFunctionOn', {
    objectId: objects.objectId,
    returnByValue: true,
    awaitPromise: true,
    functionDeclaration: `async function() {
      const game = this.find(world => !world.disposed);
      const geo = await import(performance.getEntriesByType('resource').find(entry => new URL(entry.name).pathname === '/src/world/geo.ts').name);
      game.scene.updateMatrixWorld(true);
      return [363523246, 525247500].map(id => {
        const road = geo.features.find(feature => feature.id === id);
        const a = road.points[0], b = road.points[1];
        const x = (a[0] + b[0]) / 2, z = (a[1] + b[1]) / 2;
        const floor = geo.featureElevation(road, [x, z]), scale = game.scene.scale.x;
        const ray = new game.raycaster.constructor(
          new game.position.constructor(x * scale, (floor + 1.5) * scale, z * scale),
          new game.position.constructor(0, -1, 0), 0, 3 * scale);
        const hit = ray.intersectObject(game.scene, true)[0];
        const material = hit && (Array.isArray(hit.object.material) ? hit.object.material[hit.face.materialIndex] : hit.object.material);
        return { id, color: material?.color.getHexString(), gap: hit ? hit.point.y / scale - floor : null };
      });
    }`,
  });
  expect(riverRoads.exceptionDetails).toBeUndefined();
  for (const road of riverRoads.result.value) {
    expect(road.color, `riverside road ${road.id}`).toBe('b2b5ae');
    expect(Math.abs(road.gap), `riverside road ${road.id}`).toBeLessThan(0.12);
  }
  await cdp.detach();

  for (const [index, title] of [
    'The basilica',
    'The rotunda',
    'The gate',
    'The river view',
  ].entries()) {
    await page.getByRole('button', { name: 'Open exploration map' }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await dialog
      .locator('.destination-list')
      .getByRole('button', { name: new RegExp(title, 'i') })
      .click();
    await dialog.getByRole('button', { name: 'Travel here' }).click();
    await expect(page.getByText(`${[2, 3, 3, 4][index]} / 4`)).toBeVisible();
    if (index === 0 || index === 2) {
      await page.waitForTimeout(1000);
      await page.screenshot({
        path: `test-results/${index === 0 ? 'basilica' : 'gate'}.png`,
      });
    }
  }
  await expect(page.getByText('A little world, discovered.')).toBeVisible();
  await page.getByRole('button', { name: 'Close landmark details' }).click();
  await page.screenshot({ path: 'test-results/exploring.png' });
  await page
    .getByRole('button', { name: 'Change time of day, currently cycle' })
    .click();
  await page
    .getByRole('button', { name: 'Change time of day, currently golden' })
    .click();
  await expect(page.getByText('DAYLIGHT')).toBeVisible();
  const scene = page.getByRole('img', {
    name: 'Interactive 3D world of Vyšehrad',
  });
  const daylight = await scene.screenshot({
    path: 'test-results/painterly-day.png',
  });
  await page
    .getByRole('button', { name: 'Change time of day, currently day' })
    .click();
  await expect(page.getByText('BLUE NIGHT')).toBeVisible();
  const night = await scene.screenshot({
    path: 'test-results/painterly-night.png',
  });
  const [dayBrightness, nightBrightness] = await page.evaluate(
    async (images) => {
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = 32;
      const context = canvas.getContext('2d');
      if (!context) throw new Error('Cannot inspect rendered lighting.');
      const brightness: number[] = [];
      for (const data of images) {
        const image = new Image();
        image.src = `data:image/png;base64,${data}`;
        await image.decode();
        context.drawImage(image, 0, 0, 32, 32);
        const pixels = context.getImageData(0, 0, 32, 32).data;
        let total = 0;
        for (let i = 0; i < pixels.length; i += 4)
          total +=
            pixels[i] * 0.2126 +
            pixels[i + 1] * 0.7152 +
            pixels[i + 2] * 0.0722;
        brightness.push(total / (32 * 32));
      }
      return brightness;
    },
    [daylight.toString('base64'), night.toString('base64')],
  );
  expect(dayBrightness).toBeGreaterThan(nightBrightness + 20);
  await page.getByRole('button', { name: 'Photo mode', exact: true }).click();
  await expect(page.locator('.topbar')).not.toBeVisible();
  await expect(
    page.getByRole('link', { name: '© OpenStreetMap contributors' }),
  ).toBeVisible();
  await page.keyboard.press('p');
  await expect(page.locator('.topbar')).toBeVisible();
  await page.reload();
  await page.getByRole('button', { name: 'Enter Vyšehrad' }).click();
  await expect(page.getByText('4 / 4')).toBeVisible();
  expect(errors).toEqual([]);
});

test('explains graphics failure rather than showing a success-shaped empty world', async ({
  page,
}) => {
  await page.addInitScript(() => {
    HTMLCanvasElement.prototype.getContext = () => null;
  });
  await page.goto('/');
  await expect(page.getByRole('alert')).toContainText('WebGL2');
  await expect(page.getByRole('button', { name: 'Try again' })).toBeVisible();
});

test('plays the bench, groundskeeper, grove, fireplace, cathedral and stone interactions', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Enter Vyšehrad' }).click();
  const activity = async (name: string) => {
    await page.getByRole('button', { name: 'Open exploration map' }).click();
    await page
      .getByRole('dialog')
      .getByRole('button', { name, exact: true })
      .click();
  };
  const pose = () =>
    page
      .locator('.minimap-card .world-map > g')
      .last()
      .getAttribute('transform');

  await activity('Meet the groundskeeper');
  await expect(
    page.getByRole('button', { name: 'Talk to the groundskeeper' }),
  ).toBeVisible();
  await page.keyboard.press('f');
  const conversation = page.getByRole('dialog', {
    name: 'The groundskeeper',
  });
  await expect(conversation).toBeVisible();
  const pausedPose = await pose();
  await page.keyboard.press('w');
  await page.keyboard.press('r');
  expect(await pose()).toBe(pausedPose);
  await conversation
    .getByRole('button', { name: 'Can I go inside the cathedral?' })
    .click();
  await expect(conversation).toContainText('not a surveyed reconstruction');
  await conversation
    .getByRole('button', { name: 'How does tree cutting work?' })
    .click();
  await expect(conversation).toContainText('three pieces of wood');
  await page.screenshot({ path: 'test-results/groundskeeper.png' });
  await conversation.getByRole('button', { name: 'Back to wandering' }).click();

  await activity('Find a bench');
  await expect(
    page.getByRole('button', { name: 'Sit on bench', exact: true }),
  ).toBeVisible();
  const benchApproach = await pose();
  await page.getByRole('button', { name: 'Sit on bench', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Stand up', exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Toss a stone' }),
  ).toBeDisabled();
  await page.screenshot({ path: 'test-results/seated.png' });
  await page.keyboard.press('f');
  await expect(
    page.getByRole('button', { name: 'Sit on bench', exact: true }),
  ).toBeVisible();
  expect((await pose())?.split(' rotate')[0]).toBe(
    benchApproach?.split(' rotate')[0],
  );
  await page.keyboard.press('f');
  await expect(
    page.getByRole('button', { name: 'Stand up', exact: true }),
  ).toBeVisible();
  await page.keyboard.press('w');
  await expect(
    page.getByRole('button', { name: 'Stand up', exact: true }),
  ).not.toBeVisible();

  await activity('Explore the tree grove');
  await expect(
    page.getByRole('button', { name: 'Chop tree (0/3)', exact: true }),
  ).toBeVisible();
  const grovePose = await pose();
  const cdp = await page.context().newCDPSession(page);
  const { result: prototype } = await cdp.send('Runtime.evaluate', {
    expression:
      "import(performance.getEntriesByType('resource').find(entry => new URL(entry.name).pathname === '/src/world/engine.ts').name).then(module => module.World.prototype)",
    awaitPromise: true,
  });
  const { objects } = await cdp.send('Runtime.queryObjects', {
    prototypeObjectId: prototype.objectId,
  });
  const groveGeometry = async () => {
    const result = await cdp.send('Runtime.callFunctionOn', {
      objectId: objects.objectId,
      returnByValue: true,
      functionDeclaration: `function() {
        const game = this.find(world => !world.disposed);
        const trunk = game.treeMeshes.trunk, matrix = trunk.matrix.clone();
        let hiddenTrunks = 0, stumps = 0;
        for (let i = 0; i < trunk.count; i++) {
          trunk.getMatrixAt(i, matrix);
          if (matrix.determinant() === 0) hiddenTrunks++;
        }
        game.scene.traverse(object => { if (object.name === 'Cut tree stump') stumps++; });
        return { hiddenTrunks, stumps };
      }`,
    });
    if (result.exceptionDetails)
      throw new Error('Could not inspect tree cutting and regrowth.');
    return result.result.value;
  };
  expect(await groveGeometry()).toEqual({ hiddenTrunks: 0, stumps: 0 });
  await page.screenshot({ path: 'test-results/grove-before.png' });
  for (let hit = 0; hit < 3; hit++) {
    await page.keyboard.press('f');
    if (hit < 2)
      await expect(
        page.getByRole('button', {
          name: `Chop tree (${hit + 1}/3)`,
          exact: true,
        }),
      ).toBeVisible();
  }
  await expect(page.locator('.expedition-footer')).toContainText('Wood: 3');
  expect(await groveGeometry()).toEqual({ hiddenTrunks: 1, stumps: 1 });
  await page.screenshot({ path: 'test-results/grove-cut.png' });

  await page.keyboard.press('r');
  await expect(page.getByRole('status')).toContainText('Stone tossed');
  await page.waitForTimeout(300);
  await page.screenshot({ path: 'test-results/tossed-stone.png' });

  await activity('Visit the fireplace');
  await page
    .getByRole('button', { name: 'Rest by the fireplace', exact: true })
    .click();
  await expect(
    page.getByRole('button', { name: 'Stand up', exact: true }),
  ).toBeVisible();
  await expect(page.getByRole('status')).toContainText('grove has regrown');
  expect(await groveGeometry()).toEqual({ hiddenTrunks: 0, stumps: 0 });
  await page.screenshot({ path: 'test-results/resting.png' });
  await activity('Explore the tree grove');
  await expect(
    page.getByRole('button', { name: 'Chop tree (0/3)', exact: true }),
  ).toBeVisible();
  expect(await pose()).toBe(grovePose);
  await expect(page.locator('.expedition-footer')).toContainText('Wood: 3');
  await page.getByRole('button', { name: 'Walking', exact: true }).click();
  await page.keyboard.press('f');
  await expect(page.getByRole('status')).toContainText(
    'Land before interacting',
  );
  await expect(
    page.getByRole('button', { name: 'Chop tree (0/3)', exact: true }),
  ).not.toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Toss a stone' }),
  ).toBeDisabled();
  await page.getByRole('button', { name: 'Flying', exact: true }).click();

  await page.getByRole('button', { name: 'Open exploration map' }).click();
  const map = page.getByRole('dialog');
  await map
    .locator('.destination-list')
    .getByRole('button', { name: /the basilica/i })
    .click();
  await map.getByRole('button', { name: 'Travel here' }).click();
  await page.keyboard.down('w');
  await expect(
    page.getByRole('button', { name: 'Enter the cathedral', exact: true }),
  ).toBeVisible();
  await page.keyboard.up('w');
  await page.screenshot({ path: 'test-results/cathedral-forecourt.png' });
  const outside = await pose();
  await page.keyboard.press('f');
  await expect(page.getByText('An illustrative cathedral nave.')).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Walking', exact: true }),
  ).toBeDisabled();
  await page.screenshot({ path: 'test-results/cathedral-interior.png' });
  const distance = async () => {
    const result = await cdp.send('Runtime.callFunctionOn', {
      objectId: objects.objectId,
      returnByValue: true,
      functionDeclaration:
        'function() { return this.find(world => !world.disposed).distance; }',
    });
    if (result.exceptionDetails)
      throw new Error('Could not inspect cathedral walking distance.');
    return Number(result.result.value);
  };
  const before = await distance();
  await page.keyboard.down('w');
  await expect.poll(distance).toBeGreaterThan(before + 4);
  await page.keyboard.up('w');
  await page.keyboard.press('f');
  await expect(page.getByText('An illustrative cathedral nave.')).toBeVisible();
  await expect(page.getByRole('status')).toContainText(
    'Walk back to the cathedral doors',
  );
  await expect(
    page.getByRole('button', { name: 'Return to Vyšehrad', exact: true }),
  ).not.toBeVisible();
  await page.keyboard.down('w');
  await expect.poll(distance).toBeGreaterThan(before + 28);
  await page.waitForTimeout(500);
  await page.keyboard.up('w');
  expect(await distance()).toBeLessThan(before + 30);
  await page.screenshot({ path: 'test-results/cathedral-altar.png' });
  await page.keyboard.down('s');
  await expect(
    page.getByRole('button', { name: 'Return to Vyšehrad', exact: true }),
  ).toBeVisible();
  await page.keyboard.up('s');
  await page.keyboard.press('f');
  await expect(
    page.getByText('An illustrative cathedral nave.'),
  ).not.toBeVisible();
  await expect.poll(pose).toBe(outside);
  await expect(
    page.getByRole('button', { name: 'Walking', exact: true }),
  ).toBeEnabled();
  await cdp.detach();
  expect(errors).toEqual([]);
});
test('a failed landing leaves flight controls usable', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Enter Vyšehrad' }).click();
  await page.getByRole('button', { name: 'Walking', exact: true }).click();
  await page.getByRole('button', { name: 'Open exploration map' }).click();
  const dialog = page.getByRole('dialog');
  await dialog
    .locator('.destination-list')
    .getByRole('button', { name: /the river view/i })
    .click();
  await dialog.getByRole('button', { name: 'Travel here' }).click();
  await page.keyboard.down('Shift');
  await page.keyboard.down('w');
  await expect
    .poll(
      async () => {
        const transform = await page
          .locator('.minimap-card .world-map > g')
          .last()
          .getAttribute('transform');
        return Number(transform?.match(/translate\(([-\d.]+)/)?.[1]);
      },
      { timeout: 20000 },
    )
    .toBeLessThan(-480);
  await page.keyboard.up('w');
  await page.keyboard.up('Shift');
  await page.getByRole('button', { name: 'Flying', exact: true }).click();
  await expect(
    page.getByRole('status').filter({ hasText: 'No safe landing spot' }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Flying', exact: true }),
  ).toBeVisible();
  const altitude = async () => {
    const text = await page.locator('.expedition-footer').innerText();
    return Number(text.match(/(\d+) m up/)?.[1]);
  };
  const before = await altitude();
  await page.keyboard.down('e');
  await expect.poll(altitude).toBeGreaterThan(before + 3);
  await page.keyboard.up('e');
});

test('jumps onto low walls and bushes without walking through them or climbing steep banks', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Enter Vyšehrad' }).click();
  await expect(
    page.getByRole('button', { name: 'Walking', exact: true }),
  ).toBeVisible();
  const cdp = await page.context().newCDPSession(page);
  const { result: prototype } = await cdp.send('Runtime.evaluate', {
    expression:
      "import(performance.getEntriesByType('resource').find(entry => new URL(entry.name).pathname === '/src/world/engine.ts').name).then(module => module.World.prototype)",
    awaitPromise: true,
  });
  const { objects } = await cdp.send('Runtime.queryObjects', {
    prototypeObjectId: prototype.objectId,
  });
  const inspect = async (functionDeclaration: string) => {
    const result = await cdp.send('Runtime.callFunctionOn', {
      objectId: objects.objectId,
      functionDeclaration,
      returnByValue: true,
      awaitPromise: true,
    });
    if (result.exceptionDetails)
      throw new Error('Could not inspect the walking controller.');
    return result.result.value;
  };
  const targets: {
    point: number[];
    start: number[];
    ground: number;
    top: number;
  }[] = await inspect(`async function() {
      const game = this.find(world => !world.disposed);
      const g = await import('/src/world/geo.ts'), s = await import('/src/world/site-details.ts');
      const wall = g.walls.find(wall => wall.id === 698001345);
      const a = wall.points[0], b = wall.points[1], length = Math.hypot(b[0]-a[0],b[1]-a[1]);
      const normal = [-(b[1]-a[1])/length,(b[0]-a[0])/length];
      const point = [(a[0]+b[0])/2,(a[1]+b[1])/2];
      const start = [point[0]-normal[0]*2.7,point[1]-normal[1]*2.7];
      const targets = [{point,start,ground:g.standingElevation(start),top:g.wallProfile(wall,point,normal).top}];
      for (const hedge of s.pevnostiHedges) {
        const start = [hedge.point[0]-Math.sin(hedge.angle)*2.7,hedge.point[1]-Math.cos(hedge.angle)*2.7];
        const ground = g.standingElevation(start);
        if (!game.outdoorBlocked(start,ground) && Math.abs(ground-hedge.ground)<0.2) {
          targets.push({point:hedge.point,start,ground,top:hedge.ground+hedge.height}); break;
        }
      }
      return targets;
    }`);
  expect(targets).toHaveLength(2);
  const position = async (): Promise<number[]> =>
    inspect(
      'function() { return this.find(world => !world.disposed).position.toArray(); }',
    );
  const place = async (point: number[], height: number, target: number[]) =>
    inspect(`function() {
      const game = this.find(world => !world.disposed);
      game.keys.clear(); game.jumpVelocity = 0;
      game.position.set(${point[0]},${height},${point[1]});
      game.yaw = ${Math.atan2(target[0] - point[0], point[1] - target[1])};
    }`);
  for (const target of targets) {
    await place(target.start, target.ground, target.point);
    await page.keyboard.down('w');
    await page.waitForTimeout(700);
    await page.keyboard.up('w');
    const stopped = await position();
    expect(
      Math.hypot(stopped[0] - target.point[0], stopped[2] - target.point[1]),
    ).toBeGreaterThan(0.5);
    await place(target.start, target.ground, target.point);
    await page.keyboard.down('Space');
    await page.keyboard.down('w');
    await page.waitForTimeout(60);
    await page.keyboard.up('Space');
    await expect
      .poll(
        async () => {
          const p = await position();
          return Math.hypot(p[0] - target.point[0], p[2] - target.point[1]);
        },
        { intervals: [30], timeout: 5000 },
      )
      .toBeLessThan(0.25);
    await page.keyboard.up('w');
    await page.waitForTimeout(800);
    const landed = await position();
    expect(landed[1]).toBeGreaterThan(target.ground + 0.7);
    expect(Math.abs(landed[1] - target.top)).toBeLessThan(0.3);
    await place([landed[0], landed[2]], landed[1], target.start);
    await page.keyboard.down('w');
    await expect
      .poll(
        async () => {
          const p = await position();
          return Math.hypot(p[0] - target.start[0], p[2] - target.start[1]);
        },
        { intervals: [30], timeout: 5000 },
      )
      .toBeLessThan(0.3);
    await page.keyboard.up('w');
    await page.waitForTimeout(500);
    expect((await position())[1]).toBeLessThan(target.ground + 0.25);
  }
  const ground: number = await inspect(`async function() {
    return (await import('/src/world/geo.ts')).standingElevation([198,90]);
  }`);
  await place([198, 90], ground, [196.22, 92.42]);
  await page.keyboard.down('w');
  await page.waitForTimeout(1200);
  await page.keyboard.up('w');
  expect((await position())[1]).toBeLessThan(ground + 0.3);
  await place([222.42, 282.93], 41.9248, [227.79, 276.67]);
  await page.keyboard.down('w');
  try {
    await expect
      .poll(
        async () => {
          const p = await position();
          return Math.hypot(p[0] - 227.79, p[2] - 276.67);
        },
        { intervals: [30], timeout: 5000 },
      )
      .toBeLessThan(0.3);
  } finally {
    await page.keyboard.up('w');
  }
  await cdp.detach();
});

test('explores the vaulted casemates, records three notes and walks back out', async ({
  page,
}, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  await page.getByRole('button', { name: 'Enter Vyšehrad' }).click();
  await page.getByRole('button', { name: 'Open exploration map' }).click();
  await page
    .getByRole('button', { name: 'Explore the casemates', exact: true })
    .click();
  await expect(
    page.getByRole('button', { name: 'Enter the casemates', exact: true }),
  ).toBeVisible();
  const cdp = await page.context().newCDPSession(page);
  const { result: prototype } = await cdp.send('Runtime.evaluate', {
    expression:
      "import(performance.getEntriesByType('resource').find(entry => new URL(entry.name).pathname === '/src/world/engine.ts').name).then(module => module.World.prototype)",
    awaitPromise: true,
  });
  const { objects } = await cdp.send('Runtime.queryObjects', {
    prototypeObjectId: prototype.objectId,
  });
  const inspect = async (functionDeclaration: string) => {
    const result = await cdp.send('Runtime.callFunctionOn', {
      objectId: objects.objectId,
      functionDeclaration,
      returnByValue: true,
      awaitPromise: true,
    });
    if (result.exceptionDetails)
      throw new Error('Casemate walking inspection failed.');
    return result.result.value;
  };
  const walk = async (x: number, z: number) => {
    await inspect(`function() {
      const game = this.find(world => !world.disposed);
      game.yaw = Math.atan2(${x} - game.position.x, game.position.z - ${z});
    }`);
    await page.keyboard.down('w');
    try {
      await expect
        .poll(
          async () => {
            const distance: number = await inspect(`function() {
          const p = this.find(world => !world.disposed).position;
          return Math.hypot(p.x - ${x}, p.z - ${z});
        }`);
            return distance;
          },
          { intervals: [30], timeout: 10000 },
        )
        .toBeLessThan(0.25);
    } finally {
      await page.keyboard.up('w');
    }
  };
  const recessDepth: number = await inspect(`async function() {
    const game=this.find(world=>!world.disposed),g=await import('/src/world/geo.ts'),d=g.casemateDoor;
    game.scene.updateMatrixWorld(true);
    const scale=game.scene.scale.x;
    const origin=new game.position.constructor(d.point[0]+d.normal[0]*2,d.floor+1,d.point[1]+d.normal[1]*2).multiplyScalar(scale);
    const ray=new game.raycaster.constructor(origin,new game.position.constructor(-d.normal[0],0,-d.normal[1]),0,8*scale);
    const hit=ray.intersectObjects(game.blockers,false)[0];
    if(!hit)throw new Error('Missing solid door at the back of the rock-cut entrance.');
    return hit.distance/scale;
  }`);
  expect(recessDepth).toBeGreaterThan(5.5);
  expect(recessDepth).toBeLessThan(6.5);
  const recessPoint: number[] = await inspect(`async function() {
    return (await import('/src/world/geo.ts')).casemateLocal(0,-2.5);
  }`);
  await walk(recessPoint[0], recessPoint[1]);
  await page.screenshot({ path: testInfo.outputPath('rock-cut-entrance.png') });
  await page.keyboard.press('f');
  await expect(page.locator('.location-pill')).toContainText(
    'underground interpretation',
  );
  await expect(
    page.getByRole('button', { name: 'Walking', exact: true }),
  ).toBeDisabled();
  await walk(0, -8);
  await expect(
    page.getByRole('button', { name: 'Record: Inside the ramparts' }),
  ).toBeVisible();
  await page.keyboard.press('f');
  await expect(page.locator('.expedition-card')).toContainText('1 / 3');
  await page.screenshot({ path: testInfo.outputPath('casemate-corridor.png') });
  await page.keyboard.down('d');
  await page.waitForTimeout(500);
  await page.keyboard.up('d');
  const wallX: number = await inspect(
    'function() { return this.find(world => !world.disposed).position.x; }',
  );
  expect(wallX).toBeLessThan(1.3);
  await walk(0, -8);
  await walk(0, -22.5);
  await walk(18, -22.5);
  await walk(18, -32);
  await expect(
    page.getByRole('button', { name: 'Record: A hidden network' }),
  ).toBeVisible();
  await page.keyboard.press('f');
  await expect(page.locator('.expedition-card')).toContainText('2 / 3');
  await walk(18, -59);
  await expect(
    page.getByRole('button', { name: 'Record: Gorlice', exact: true }),
  ).toBeVisible();
  await page.keyboard.press('f');
  await expect(page.locator('.expedition-card')).toContainText('3 / 3');
  await expect(page.locator('.expedition-card')).toContainText(
    'The underground, discovered.',
  );
  await page.screenshot({ path: testInfo.outputPath('gorlice-hall.png') });
  await page.keyboard.press('f');
  await expect
    .poll(() =>
      page.evaluate(() =>
        JSON.parse(localStorage.getItem('vysehrad-casemates-v1') ?? '[]'),
      ),
    )
    .toEqual(['ramparts', 'passages', 'gorlice']);
  await walk(18, -22.5);
  await walk(0, -22.5);
  await walk(0, 2);
  await expect(
    page.getByRole('button', { name: 'Leave the casemates' }),
  ).toBeVisible();
  await page.keyboard.press('f');
  await expect(page.locator('.location-pill')).not.toContainText(
    'underground interpretation',
  );
  await expect(
    page.getByRole('button', { name: 'Walking', exact: true }),
  ).toBeEnabled();
  await expect(
    page.getByRole('button', { name: 'Enter the casemates', exact: true }),
  ).toBeVisible();
  await page.keyboard.press('f');
  await expect(page.locator('.expedition-card')).toContainText('3 / 3');
  expect(errors).toEqual([]);
  await cdp.detach();
});

test('restores underground notes and climbs the tunnel outlet beside Na Hradbach', async ({
  page,
}, testInfo) => {
  await page.addInitScript(() =>
    localStorage.setItem(
      'vysehrad-casemates-v1',
      '["ramparts","passages","gorlice"]',
    ),
  );
  await page.goto('/');
  await page.getByRole('button', { name: 'Enter Vyšehrad' }).click();
  await page.getByRole('button', { name: 'Open exploration map' }).click();
  await page
    .getByRole('button', { name: 'Find the uphill casemate exit', exact: true })
    .click();
  await expect(
    page.getByRole('button', {
      name: 'Enter the uphill casemate passage',
      exact: true,
    }),
  ).toBeVisible();
  await page.keyboard.press('f');
  await expect(page.locator('.expedition-card')).toContainText('3 / 3');
  const cdp = await page.context().newCDPSession(page);
  const { result: prototype } = await cdp.send('Runtime.evaluate', {
    expression:
      "import(performance.getEntriesByType('resource').find(entry=>new URL(entry.name).pathname==='/src/world/engine.ts').name).then(module=>module.World.prototype)",
    awaitPromise: true,
  });
  const { objects } = await cdp.send('Runtime.queryObjects', {
    prototypeObjectId: prototype.objectId,
  });
  const inspect = async (functionDeclaration: string) => {
    const result = await cdp.send('Runtime.callFunctionOn', {
      objectId: objects.objectId,
      functionDeclaration,
      returnByValue: true,
    });
    if (result.exceptionDetails)
      throw new Error('Uphill tunnel inspection failed.');
    return result.result.value;
  };
  const walk = async (x: number) => {
    await inspect(`function(){
      const game=this.find(world=>!world.disposed);
      game.yaw=Math.atan2(${x}-game.position.x,game.position.z+34.5);
    }`);
    await page.keyboard.down('w');
    try {
      await expect
        .poll(
          async () => {
            const distance: number = await inspect(
              `function(){const p=this.find(world=>!world.disposed).position;return Math.hypot(p.x-${x},p.z+34.5);}`,
            );
            return distance;
          },
          { intervals: [30], timeout: 10000 },
        )
        .toBeLessThan(0.25);
    } finally {
      await page.keyboard.up('w');
    }
  };
  await walk(18);
  const bottom: number = await inspect(
    'function(){return this.find(world=>!world.disposed).position.y;}',
  );
  expect(bottom).toBeCloseTo(0);
  await walk(38);
  const top: number = await inspect(
    'function(){return this.find(world=>!world.disposed).position.y;}',
  );
  expect(top - bottom).toBeGreaterThan(3.5);
  await page.screenshot({
    path: testInfo.outputPath('uphill-casemate-passage.png'),
  });
  await expect(
    page.getByRole('button', {
      name: 'Exit uphill near Na Hradbách',
      exact: true,
    }),
  ).toBeVisible();
  await page.keyboard.press('f');
  await expect(
    page.getByRole('button', { name: 'Walking', exact: true }),
  ).toBeEnabled();
  await expect(
    page.getByRole('button', {
      name: 'Enter the uphill casemate passage',
      exact: true,
    }),
  ).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath('na-hradbach-outlet.png'),
  });
  await cdp.detach();
});
