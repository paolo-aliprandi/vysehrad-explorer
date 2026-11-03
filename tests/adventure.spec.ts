import { expect, test } from '@playwright/test';

test('plays the enlarged knight adventure with a Switch controller, checkpoint map, combat and living time', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.addInitScript(() => {
    localStorage.setItem('vysehrad-discoveries-v1', '["rotunda"]');
    const pad = {
      id: 'Nintendo Switch Pro Controller',
      index: 0,
      connected: true,
      mapping: 'standard',
      axes: [0, 0, 0, 0],
      buttons: Array.from({ length: 17 }, () => ({
        pressed: false,
        value: 0,
        touched: false,
      })),
      timestamp: 0,
    };
    Object.defineProperty(navigator, 'getGamepads', {
      value: () => [pad],
      configurable: true,
    });
  });
  const button = async (index: number, pressed: boolean) => {
    await page.evaluate(
      ({ index, pressed }) => {
        const pad = navigator.getGamepads()[0];
        if (!pad) throw new Error('Missing test controller.');
        Object.assign(pad.buttons[index], {
          pressed,
          touched: pressed,
          value: Number(pressed),
        });
      },
      { index, pressed },
    );
  };
  const setPad = async (patch: { axes?: number[]; connected?: boolean }) => {
    await page.evaluate((patch) => {
      const pad = navigator.getGamepads()[0];
      if (!pad) throw new Error('Missing test controller.');
      Object.assign(pad, patch);
    }, patch);
  };
  const axes = (values: number[]) => setPad({ axes: values });
  await page.goto('/');
  await page
    .getByRole('button', { name: 'Enter Vyšehrad' })
    .click({ trial: true });
  await page.screenshot({ path: 'test-results/mode-selection.png' });
  await button(13, true);
  await expect(
    page.getByRole('button', { name: /Adventure Mode/ }),
  ).toHaveAttribute('aria-pressed', 'true');
  await button(13, false);
  await button(1, true);
  await expect(
    page.getByRole('status', { name: 'Knight status' }),
  ).toBeVisible();
  await button(1, false);
  await expect(page.getByText('0 / 4')).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Walking', exact: true }),
  ).toHaveCount(0);
  const map = page.getByRole('img', {
    name: 'Checkpoint-revealed adventure map',
  });
  await expect(map.locator('clipPath rect')).toHaveCount(0);

  const cdp = await page.context().newCDPSession(page);
  const { result: proto } = await cdp.send('Runtime.evaluate', {
    expression:
      "import(performance.getEntriesByType('resource').find(entry => new URL(entry.name).pathname === '/src/world/engine.ts').name).then(m => m.World.prototype)",
    awaitPromise: true,
  });
  if (!proto.objectId) throw new Error('Missing world prototype.');
  const { objects } = await cdp.send('Runtime.queryObjects', {
    prototypeObjectId: proto.objectId,
  });
  const objectId = objects.objectId;
  if (!objectId) throw new Error('Missing world instance.');
  const inspect = async (body: string) => {
    const r = await cdp.send('Runtime.callFunctionOn', {
      objectId,
      functionDeclaration: `async function(){ const w=this.find(w=>!w.disposed); ${body} }`,
      awaitPromise: true,
      returnByValue: true,
    });
    if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails));
    return r.result.value;
  };
  expect(await inspect('return w.scene.scale.x;')).toBeCloseTo(1.5);
  expect(await inspect('return w.adventure.enemies.length;')).toBe(24);
  expect(
    await inspect(
      'return w.knight.visible && w.explorerHat.every(hat => !hat.visible);',
    ),
  ).toBe(true);
  const start = await inspect('return w.position.toArray();');
  await axes([0, -1, 0, 0]);
  await expect
    .poll(async () => {
      const p = await inspect('return w.position.toArray();');
      return Math.hypot(p[0] - start[0], p[2] - start[2]);
    })
    .toBeGreaterThan(1);
  await axes([0, 0, 1, 0]);
  const yaw = await inspect('return w.yaw;');
  await expect
    .poll(async () => Math.abs((await inspect('return w.yaw;')) - yaw))
    .toBeGreaterThan(0.25);
  await axes([0, 0, 0, 0]);
  const ground = await inspect('return w.position.y;');
  await button(0, true);
  await expect
    .poll(() => inspect('return w.position.y;'))
    .toBeGreaterThan(ground + 0.15);
  await button(0, false);
  await setPad({ connected: false, axes: [0, -1, 0, 0] });
  await page.waitForTimeout(200);
  const stopped = await inspect('return [w.position.x,w.position.z];');
  await page.waitForTimeout(200);
  expect(await inspect('return [w.position.x,w.position.z];')).toEqual(stopped);
  await setPad({ connected: true, axes: [0, 0, 0, 0] });
  await page.screenshot({ path: 'test-results/knight-ready.png' });

  const hour = await inspect('return w.daylight.hour;');
  await expect
    .poll(() => inspect('return w.daylight.hour;'))
    .toBeGreaterThan(hour);
  await button(9, true);
  await expect(page.getByRole('dialog')).toBeVisible();
  await button(9, false);
  const paused = await inspect('return w.daylight.hour;');
  await page.waitForTimeout(200);
  expect(await inspect('return w.daylight.hour;')).toBe(paused);
  await button(1, true);
  await expect(page.getByRole('dialog')).not.toBeVisible();
  await button(1, false);
  await page
    .getByRole('button', { name: 'Change time of day, currently cycle' })
    .click();
  expect(await inspect('return w.daylight.hour;')).toBe(16);
  await page
    .getByRole('button', { name: 'Change time of day, currently golden' })
    .click();
  expect(await inspect('return w.daylight.hour;')).toBe(12);
  await page
    .getByRole('button', { name: 'Change time of day, currently day' })
    .click();
  expect(await inspect('return w.sky.material.uniforms.night.value;')).toBe(1);
  await page.screenshot({ path: 'test-results/adventure-moonlight.png' });
  await page
    .getByRole('button', { name: 'Change time of day, currently night' })
    .click();

  await inspect(`const a=await import('/src/world/adventure.ts'),g=await import('/src/world/geo.ts'),p=a.weaponPickups[0].point;
    w.position.set(p[0],g.standingElevation(p),p[1]); w.jumpVelocity=0;`);
  await expect(
    page.getByRole('button', { name: 'Pick up stick', exact: true }),
  ).toBeVisible();
  await button(1, true);
  await expect(
    page.getByRole('status', { name: 'Knight status' }),
  ).toContainText('Equipped: stick');
  await button(1, false);
  await expect
    .poll(() => inspect('return w.heldWeapons.stick.visible;'))
    .toBe(true);

  await inspect(`const g=await import('/src/world/geo.ts'),e=w.adventure.enemies[0].point;
    const p=[e[0],e[1]+0.9]; w.position.set(p[0],g.standingElevation(p),p[1]);w.jumpVelocity=0;w.yaw=0;`);
  for (let i = 0; i < 8; i++) {
    await button(2, true);
    await page.waitForTimeout(90);
    await button(2, false);
    if (i < 7) await page.waitForTimeout(460);
  }
  await expect(
    page.getByRole('status', { name: 'Knight status' }),
  ).toContainText('Moss sprites: 1 / 24');
  await expect
    .poll(() => inspect('return w.adventureModels.enemies[0].visible;'))
    .toBe(false);
  await inspect(`const g=await import('/src/world/geo.ts'),p=g.landmarks.find(l=>l.id==='gate').view;
    w.position.set(p[0],g.standingElevation(p),p[1]); w.jumpVelocity=0;`);
  await expect(map.locator('clipPath rect')).toHaveCount(0);
  await page.keyboard.press('f');
  await expect(page.getByText('1 / 4')).toBeVisible();
  await expect(map.locator('clipPath rect')).toHaveCount(1);
  await page.screenshot({ path: 'test-results/knight-checkpoint.png' });
  await button(8, true);
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await button(8, false);
  await expect(
    dialog.getByRole('button', { name: /Travel here/ }),
  ).toBeDisabled();
  await button(13, true);
  await expect(
    dialog.getByRole('button', { name: 'Select The gate', exact: true }),
  ).toBeFocused();
  await button(13, false);
  await page.waitForTimeout(70);
  await button(1, true);
  await expect(
    dialog.getByRole('button', { name: /Travel here/ }),
  ).toBeEnabled();
  await button(1, false);
  await page.waitForTimeout(70);
  await button(14, true);
  await expect(
    dialog.getByRole('button', { name: 'Close dialog', exact: true }),
  ).toBeFocused();
  await button(14, false);
  await page.waitForTimeout(70);
  await button(14, true);
  await expect(
    dialog.getByRole('button', { name: /Travel here/ }),
  ).toBeFocused();
  await button(14, false);
  await page.waitForTimeout(70);
  await button(1, true);
  await expect(dialog).not.toBeVisible();
  await button(1, false);
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          JSON.parse(localStorage.getItem('vysehrad-adventure-v1') ?? '{}')
            .explored,
      ),
    )
    .toEqual(['gate']);
  expect(
    await page.evaluate(() => localStorage.getItem('vysehrad-discoveries-v1')),
  ).toBe('["rotunda"]');
  await inspect(`const g=await import('/src/world/geo.ts'),p=w.adventure.enemies[1].point;
    w.adventure.health=1;w.adventure.invulnerability=0;w.position.set(p[0],g.standingElevation(p),p[1]);`);
  await expect.poll(() => inspect('return w.adventure.health;')).toBe(5);
  expect(await inspect('return w.knight.visible;')).toBe(true);
  expect(
    await inspect(`const g=await import('/src/world/geo.ts'),p=g.landmarks.find(l=>l.id==='gate').view;
    return Math.hypot(w.position.x-p[0],w.position.z-p[1]);`),
  ).toBeLessThan(0.1);
  await inspect(`const a=await import('/src/world/adventure.ts'),g=await import('/src/world/geo.ts'),p=a.weaponPickups[1].point;
    w.position.set(p[0],g.standingElevation(p),p[1]);w.jumpVelocity=0;`);
  await expect(
    page.getByRole('button', { name: 'Pick up sword', exact: true }),
  ).toBeVisible();
  await button(1, true);
  await expect(
    page.getByRole('status', { name: 'Knight status' }),
  ).toContainText('Equipped: sword');
  await button(1, false);
  await inspect(`const g=await import('/src/world/geo.ts'),e=w.adventure.enemies[1].point,p=[e[0],e[1]+0.9];
    w.position.set(p[0],g.standingElevation(p),p[1]);w.jumpVelocity=0;w.yaw=0;w.setTime('day');`);
  await page.screenshot({ path: 'test-results/knight-and-moss-sprite.png' });
  for (let i = 0; i < 4; i++) {
    await button(2, true);
    await page.waitForTimeout(90);
    await button(2, false);
    if (i < 3) await page.waitForTimeout(460);
  }
  await expect(
    page.getByRole('status', { name: 'Knight status' }),
  ).toContainText('Moss sprites: 2 / 24');
  const civilian = await inspect(`const g=await import('/src/world/geo.ts');
    const v=w.visitors.find(v=>!v.stroll.departed);
    if(!v) throw new Error('No civilian available for raid verification.');
    const e=w.adventure.enemies[3],p=g.safePosition([v.stroll.point[0]+25,v.stroll.point[1]]);
    w.adventure.enemies.forEach(other=>{if(other.id!==e.id)w.adventure.defeated.add(other.id);});
    w.position.set(p[0],g.standingElevation(p),p[1]); w.jumpVelocity=0;
    e.point=[...v.stroll.point];e.rethink=0;e.cooldown=0;v.pace=0;
    w.adventure.civilians.set('visitor-'+v.model.uuid,{health:3,frightened:0,recovering:0});
    return {id:'visitor-'+v.model.uuid,uuid:v.model.uuid,distance:v.stroll.distance};`);
  await expect
    .poll(() =>
      inspect(
        `return w.adventure.civilians.get(${JSON.stringify(civilian.id)}).health;`,
      ),
    )
    .toBeLessThan(3);
  expect(
    await inspect(
      `return w.visitors.find(v=>v.model.uuid===${JSON.stringify(civilian.uuid)}).warning.visible;`,
    ),
  ).toBe(true);
  await inspect(
    `w.visitors.find(v=>v.model.uuid===${JSON.stringify(civilian.uuid)}).pace=1.2;`,
  );
  await expect
    .poll(() =>
      inspect(
        `return w.visitors.find(v=>v.model.uuid===${JSON.stringify(civilian.uuid)}).stroll.distance;`,
      ),
    )
    .toBeGreaterThan(civilian.distance);
  await inspect(`const g=await import('/src/world/geo.ts'),e=w.adventure.enemies[3],h=w.adventure.houses.find(h=>h.id===e.houseId);
    w.visitors.forEach(v=>v.stroll.departed=true);
    w.adventure.houses.forEach(h=>h.hitTime=0);h.integrity=12;
    const p=g.safePosition([h.point[0]+25,h.point[1]]);
    w.position.set(p[0],g.standingElevation(p),p[1]);w.jumpVelocity=0;
    e.point=[...h.approaches[0]];e.rethink=0;e.cooldown=0;
    w.setTime('day');`);
  await expect
    .poll(() => inspect('return w.adventure.houses[0].integrity;'))
    .toBeLessThan(12);
  await expect(
    page.getByRole('status', { name: 'Knight status' }),
  ).toContainText('Houses under attack: 1');
  await expect
    .poll(() =>
      inspect(
        'return w.adventureModels.houses[0].ring.material.color.getHexString();',
      ),
    )
    .toBe('d8755d');
  const questBounds = await page.locator('.expedition-card').boundingBox();
  const detailsBounds = await page.locator('.discovery-card').boundingBox();
  if (!questBounds || !detailsBounds)
    throw new Error('Missing Adventure HUD or landmark details.');
  expect(questBounds.y + questBounds.height).toBeLessThan(detailsBounds.y);
  await inspect(`const g=await import('/src/world/geo.ts'),h=w.adventure.houses[0],p=h.approaches[0];
    w.paused=true;w.position.set(p[0],g.standingElevation(p),p[1]);w.jumpVelocity=0;
    w.yaw=Math.atan2(h.point[0]-p[0],p[1]-h.point[1]);w.pitch=0.9;w.zoom=13;`);
  await page.waitForTimeout(500);
  await page.screenshot({ path: 'test-results/village-raid.png' });
  await inspect(
    'w.adventure.defeated.add(w.adventure.enemies[3].id);w.paused=false;',
  );
  await expect(
    page.getByRole('status', { name: 'Knight status' }),
  ).toContainText('House raids cleared: 7 / 7');
  await expect
    .poll(() =>
      inspect(
        'return w.adventureModels.houses[0].ring.material.color.getHexString();',
      ),
    )
    .toBe('79ac91');
  await inspect("w.setMode('chill');");
  expect(await inspect('return w.adventureModels.group.visible;')).toBe(false);
  await cdp.detach();
  expect(errors).toEqual([]);
});
