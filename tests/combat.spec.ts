import { expect, test } from '@playwright/test';

test('keeps hidden-UI jumps hidden, buys meals, aims finite arrows and renders the restored garden boundary', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.addInitScript(() => {
    const pad = {
      id: 'Nintendo Switch Pro Controller',
      index: 0,
      connected: true,
      mapping: 'standard',
      axes: [0, 0, 0, 0],
      timestamp: 0,
      buttons: Array.from({ length: 17 }, () => ({
        pressed: false,
        value: 0,
        touched: false,
      })),
    };
    Object.defineProperty(navigator, 'getGamepads', {
      value: () => [pad],
      configurable: true,
    });
  });
  const button = async (index: number, pressed: boolean) =>
    page.evaluate(
      ({ index, pressed }) => {
        const pad = navigator.getGamepads()[0];
        if (!pad) throw new Error('Missing test controller.');
        Object.assign(pad.buttons[index], {
          pressed,
          value: Number(pressed),
          touched: pressed,
        });
      },
      { index, pressed },
    );
  const tap = async (index: number) => {
    await button(index, true);
    await page.waitForTimeout(85);
    await button(index, false);
    await page.waitForTimeout(85);
  };
  await page.goto('/');
  await page
    .getByRole('button', { name: 'Enter Vyšehrad' })
    .click({ trial: true });
  await page.getByRole('button', { name: /Adventure Mode/ }).click();
  await page.getByRole('button', { name: 'Enter Vyšehrad' }).click();
  const health = page.getByRole('progressbar', { name: 'Health', exact: true });
  await expect(health).toBeVisible();
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
  if (!objects.objectId) throw new Error('Missing world instance.');
  const objectId = objects.objectId;
  const inspect = async (body: string) => {
    const result = await cdp.send('Runtime.callFunctionOn', {
      objectId,
      functionDeclaration: `async function(){const w=this.find(w=>!w.disposed); ${body}}`,
      awaitPromise: true,
      returnByValue: true,
    });
    if (result.exceptionDetails)
      throw new Error(JSON.stringify(result.exceptionDetails));
    return result.result.value;
  };
  await tap(3);
  await expect(page.getByRole('status', { name: 'Knight status' })).toHaveCount(
    0,
  );
  const ground = await inspect('return w.position.y;');
  await button(0, true);
  await expect
    .poll(() => inspect('return w.position.y;'))
    .toBeGreaterThan(ground + 0.1);
  await button(0, false);
  await expect(health).toBeVisible();
  await expect(page.getByRole('status', { name: 'Knight status' })).toHaveCount(
    0,
  );
  await tap(3);
  await expect(
    page.getByRole('status', { name: 'Knight status' }),
  ).toBeVisible();
  await inspect(`
    const g=await import('/src/world/geo.ts');
    const e=w.adventure.enemies[0], p=[e.point[0],e.point[1]+.5];
    w.position.set(p[0],g.standingElevation(p),p[1]); w.jumpVelocity=0;
    w.adventure.health=5; w.adventure.invulnerability=0;
    e.rethink=0; e.windup=0; e.cooldown=0;
  `);
  await expect
    .poll(() => inspect('return w.adventure.enemies[0].windup;'))
    .toBeGreaterThan(0);
  await expect
    .poll(() =>
      inspect(`return {
        health: w.adventure.health,
        impact: w.playerImpact.visible,
        vignette: document.querySelector('.damage-vignette') !== null,
      };`),
    )
    .toEqual({ health: 4, impact: true, vignette: true });
  await inspect(`
    w.adventure.enemies.forEach(e=>w.adventure.defeated.add(e.id));
    w.jumpVelocity=0; w.setTime('day');
  `);
  for (let i = 0; i < 3; i++) {
    await inspect(`
      const {foodShops}=await import('/src/world/adventure.ts');
      const {standingElevation}=await import('/src/world/geo.ts');
      const p=foodShops[${i}].point;
      w.position.set(p[0],standingElevation(p),p[1]); w.jumpVelocity=0;
      w.adventure.health=1; w.adventure.eatTime=0;
    `);
    await expect(page.getByRole('button', { name: /Buy & eat/ })).toBeVisible();
    await tap(1);
    await expect.poll(() => inspect('return w.adventure.health;')).toBe(4);
    await expect.poll(() => inspect('return w.heldFood.visible;')).toBe(true);
    expect(await inspect('return w.adventure.coins;')).toBe(12 - (i + 1) * 3);
    await expect(health).toHaveAttribute('value', '4');
  }
  await inspect(`
    const {weaponPickups}=await import('/src/world/adventure.ts');
    const {standingElevation}=await import('/src/world/geo.ts');
    const p=weaponPickups.find(p=>p.id==='bow').point;
    w.position.set(p[0],standingElevation(p),p[1]); w.jumpVelocity=0;
  `);
  await expect(page.getByRole('button', { name: /Pick up bow/ })).toBeVisible();
  await tap(1);
  await expect(page.getByText('Equipped: bow', { exact: true })).toBeVisible();
  await inspect(`
    const {arrowPickups}=await import('/src/world/adventure.ts');
    const {standingElevation}=await import('/src/world/geo.ts');
    const p=arrowPickups[0].point;
    w.position.set(p[0],standingElevation(p),p[1]); w.jumpVelocity=0;
  `);
  await expect(
    page.getByRole('button', { name: /Collect 8 arrows/ }),
  ).toBeVisible();
  await tap(1);
  await expect.poll(() => inspect('return w.adventure.arrows;')).toBe(8);
  const alignAim = async () => {
    for (let i = 0; i < 5; i++) {
      await page.waitForTimeout(300);
      await inspect(`
        const {standingElevation}=await import('/src/world/geo.ts');
        const e=w.adventure.enemies[0];
        const p=w.position.clone().set(e.point[0]*1.5,standingElevation(e.point)*1.5+.75,e.point[1]*1.5).project(w.camera);
        const half=Math.tan(w.camera.fov*Math.PI/360);
        w.yaw+=Math.atan(p.x*half*w.camera.aspect);
        w.pitch-=Math.atan(p.y*half);
      `);
    }
  };
  await inspect(`
    const g=await import('/src/world/geo.ts');
    const wall=g.walls.find(wall=>wall.id===51666061);
    const a=wall.points[0],b=wall.points[1],p=[(a[0]+b[0])/2,(a[1]+b[1])/2];
    const normal=g.projectRoute(p,[a,b]).normal;
    const e=w.adventure.enemies[0]; w.adventure.defeated.delete(e.id);
    e.point=[p[0]-normal[0]*3,p[1]-normal[1]*3];
    e.health=8; e.cooldown=100; e.rethink=100; e.windup=0;
    e.target={kind:'patrol',point:[...e.point]};
    const player=[p[0]+normal[0]*3,p[1]+normal[1]*3];
    w.position.set(player[0],g.standingElevation(player),player[1]); w.jumpVelocity=0;
    w.yaw=Math.atan2(e.point[0]-player[0],player[1]-e.point[1]);
    w.pitch=.6; w.adventure.eatTime=0;
    w.camera.position.copy(w.position).multiplyScalar(1.5); w.camera.position.y+=1.6;
  `);
  await button(6, true);
  await expect.poll(() => inspect('return w.adventure.aiming;')).toBe(true);
  await alignAim();
  await tap(7);
  await expect.poll(() => inspect('return w.adventure.arrows;')).toBe(7);
  await expect.poll(() => inspect('return w.arrows.length;')).toBe(0);
  expect(await inspect('return w.adventure.enemies[0].health;')).toBe(8);
  await inspect(`
    const {standingElevation}=await import('/src/world/geo.ts');
    const {enemySpawns}=await import('/src/world/adventure.ts');
    const e=w.adventure.enemies[0]; w.adventure.defeated.delete(e.id);
    e.point=[...enemySpawns[0].point];
    e.health=8; e.cooldown=100; e.rethink=100; e.windup=0;
    e.target={kind:'patrol',point:[...e.point]};
    const choices=Array.from({length:16},(_,i)=>[e.point[0]+Math.sin(i*Math.PI/8)*5,e.point[1]+Math.cos(i*Math.PI/8)*5]);
    const p=choices.find(p=>w.adventurePathClear(e.point,p) && Math.abs(standingElevation(p)-standingElevation(e.point))<.9);
    if(!p) throw new Error('No clear archery approach.');
    w.position.set(p[0],standingElevation(p),p[1]); w.jumpVelocity=0;
    w.yaw=Math.atan2(e.point[0]-p[0],p[1]-e.point[1]); w.pitch=.65; w.adventure.eatTime=0;
    w.camera.position.copy(w.position).multiplyScalar(1.5); w.camera.position.y+=1.6;
  `);
  await button(6, true);
  await expect.poll(() => inspect('return w.adventure.aiming;')).toBe(true);
  await alignAim();
  await expect(page.locator('.bow-crosshair')).toBeVisible();
  expect(
    await inspect(
      'return w.adventurePathClear([w.position.x,w.position.z],w.adventure.enemies[0].point);',
    ),
  ).toBe(true);
  await tap(7);
  await expect
    .poll(() => inspect('return w.adventure.enemies[0].health;'))
    .toBe(5);
  await expect
    .poll(() =>
      inspect('return w.adventureModels.enemyEffects[0].health.visible;'),
    )
    .toBe(true);
  await page.screenshot({ path: 'test-results/bow-aim-and-enemy-health.png' });
  await inspect(`
    const g=await import('/src/world/geo.ts'), e=w.adventure.enemies[0];
    const dx=w.position.x-e.point[0],dz=w.position.z-e.point[1],distance=Math.hypot(dx,dz);
    const p=[e.point[0]+dx/distance*.9,e.point[1]+dz/distance*.9];
    w.position.set(p[0],g.standingElevation(p),p[1]); w.jumpVelocity=0;
    w.camera.position.copy(w.position).multiplyScalar(1.5); w.camera.position.y+=1.6;
  `);
  await alignAim();
  for (let i = 0; i < 2; i++) {
    await page.waitForTimeout(670);
    await tap(7);
    await expect
      .poll(() => inspect('return w.adventure.enemies[0].health;'))
      .toBe(i === 0 ? 2 : 0);
  }
  await expect
    .poll(() => inspect('return w.adventureModels.enemies[0].visible;'))
    .toBe(false);
  for (let i = 0; i < 4; i++) {
    await page.waitForTimeout(670);
    await tap(7);
  }
  expect(await inspect('return w.adventure.arrows;')).toBe(0);
  await page.waitForTimeout(700);
  await tap(7);
  expect(await inspect('return w.adventure.arrows;')).toBe(0);
  await button(6, false);
  await expect(page.locator('.bow-crosshair')).toHaveCount(0);
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          JSON.parse(localStorage.getItem('vysehrad-adventure-v1') ?? '{}')
            .arrows,
      ),
    )
    .toBe(0);
  expect(
    await inspect(`
    const g=await import('/src/world/geo.ts');
    const wall=g.walls.find(wall=>wall.id===51718886);
    const p=[-118.265,-41.65], normal=g.projectRoute(p,wall.points).normal;
    const top=g.wallProfile(wall,p,normal).top;
    w.scene.updateMatrixWorld(true);
    const origin=w.position.clone().set((p[0]+normal[0]*3)*1.5,(top-.2)*1.5,(p[1]+normal[1]*3)*1.5);
    w.raycaster.set(origin,w.position.clone().set(-normal[0],0,-normal[1]));
    w.raycaster.far=9;
    return w.raycaster.intersectObjects(w.blockers,false).some(hit=>
      Math.hypot(hit.point.x/1.5-p[0],hit.point.z/1.5-p[1])<.6 &&
      hit.point.y/1.5>g.elevation(...p)+.5);
  `),
  ).toBe(true);
  await inspect(`
    const g=await import('/src/world/geo.ts');
    w.position.set(-110,g.standingElevation([-110,-35]),-35);
    w.yaw=-1.9; w.pitch=.6; w.zoom=16; w.jumpVelocity=0;
  `);
  await page.waitForTimeout(500);
  await page.screenshot({ path: 'test-results/restored-cathedral-garden.png' });
  expect(errors).toEqual([]);
  await cdp.detach();
});
