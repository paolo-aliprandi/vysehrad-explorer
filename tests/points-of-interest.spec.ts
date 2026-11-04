import { expect, test } from '@playwright/test';

test('reads nearby history in a translucent side panel without pausing exploration, with keyboard and Switch controls', async ({
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
  await page.goto('/');
  await page.getByRole('button', { name: 'Enter Vyšehrad' }).click();
  const cdp = await page.context().newCDPSession(page);
  const { result } = await cdp.send('Runtime.evaluate', {
    expression:
      "import(performance.getEntriesByType('resource').find(e=>new URL(e.name).pathname==='/src/world/engine.ts').name).then(m=>m.World.prototype)",
    awaitPromise: true,
  });
  if (!result.objectId) throw new Error('Missing world prototype.');
  const { objects } = await cdp.send('Runtime.queryObjects', {
    prototypeObjectId: result.objectId,
  });
  if (!objects.objectId) throw new Error('Missing world instance.');
  const inspect = async (body: string) => {
    const r = await cdp.send('Runtime.callFunctionOn', {
      objectId: objects.objectId,
      functionDeclaration: `async function(){const w=this.find(w=>!w.disposed);${body}}`,
      awaitPromise: true,
      returnByValue: true,
    });
    if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails));
    return r.result.value;
  };
  await inspect(`
    const g=await import('/src/world/geo.ts'),gate=g.buildings.find(f=>f.id===51718887);
    const point=g.safePosition(g.gateFrame(gate).center);
    w.position.set(point[0],g.standingElevation(point),point[1]);w.jumpVelocity=0;w.setTime('day');
  `);
  await expect(page.getByRole('button', { name: /Read about/ })).toBeVisible();
  await page.keyboard.press('i');
  const panel = page.locator('.poi-reading');
  await expect(panel).toBeVisible();
  await expect(panel.locator('p')).toContainText('fortress');
  const bounds = await panel.boundingBox();
  expect(bounds?.width).toBeLessThan(400);
  expect(bounds?.x).toBeGreaterThan(900);
  expect(await inspect('return w.paused;')).toBe(false);
  const start = await inspect('return w.position.toArray();');
  await page.keyboard.down('w');
  await expect
    .poll(async () => {
      const position = await inspect('return w.position.toArray();');
      return Math.hypot(position[0] - start[0], position[2] - start[2]);
    })
    .toBeGreaterThan(0.4);
  await page.keyboard.up('w');
  await expect(panel).toBeVisible();
  const heading = await panel.getByRole('heading').innerText();
  await page.keyboard.press('i');
  await expect(panel.getByRole('heading')).not.toHaveText(heading);
  await page.screenshot({
    path: 'test-results/poi-translucent-side-panel.png',
  });
  await page.keyboard.press('Escape');
  await expect(panel).toHaveCount(0);
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
  await button(12, true);
  await expect(panel).toBeVisible();
  await button(12, false);
  await button(0, true);
  await expect(panel).toHaveCount(0);
  await button(0, false);
  expect(await inspect('return w.jumpVelocity;')).toBe(0);
  await page.keyboard.press('i');
  await expect(panel).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  const mobileBounds = await panel.boundingBox();
  expect(mobileBounds?.width).toBeLessThan(280);
  expect(mobileBounds?.x).toBeGreaterThan(0);
  expect(mobileBounds?.height).toBeLessThan(400);
  await inspect(`
    const g=await import('/src/world/geo.ts'),point=g.safePosition([-30,18]);
    w.position.set(point[0],g.standingElevation(point),point[1]);
  `);
  await expect(panel).toHaveCount(0);
  expect(errors).toEqual([]);
});
