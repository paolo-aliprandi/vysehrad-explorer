import { expect, test } from '@playwright/test';

test.use({
  viewport: { width: 390, height: 844 },
  isMobile: true,
  hasTouch: true,
});

test('drags to look and walks on double-tap-and-hold, stopping on release, cancellation and extra touches', async ({
  page,
}) => {
  test.setTimeout(180000);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  await page.getByRole('button', { name: 'Enter Vyšehrad' }).tap();
  await page.getByRole('button', { name: 'Mute sounds' }).waitFor();
  await expect(
    page.getByText(
      'Drag to look · Double-tap and hold to walk · Release to stop',
    ),
  ).toBeVisible();
  const cdp = await page.context().newCDPSession(page);
  const { result } = await cdp.send('Runtime.evaluate', {
    expression:
      "import(performance.getEntriesByType('resource').find(entry=>new URL(entry.name).pathname==='/src/world/engine.ts').name).then(m=>m.World.prototype)",
    awaitPromise: true,
  });
  if (!result.objectId) throw new Error('Missing world prototype.');
  const { objects } = await cdp.send('Runtime.queryObjects', {
    prototypeObjectId: result.objectId,
  });
  if (!objects.objectId) throw new Error('Missing world instance.');
  const inspect = async (body: string) => {
    const result = await cdp.send('Runtime.callFunctionOn', {
      objectId: objects.objectId,
      functionDeclaration: `async function(){const w=this.find(w=>!w.disposed);${body}}`,
      awaitPromise: true,
      returnByValue: true,
    });
    if (result.exceptionDetails)
      throw new Error(JSON.stringify(result.exceptionDetails));
    return result.result.value;
  };
  const point = await page.evaluate(() => {
    for (const y of [450, 550, 650, 750])
      for (const x of [30, 150, 270, 350])
        if (document.elementFromPoint(x, y)?.closest('.scene')) return { x, y };
    throw new Error('No unobstructed touch surface.');
  });
  const start = () =>
    cdp.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [{ ...point, id: 1 }],
    });
  const end = () =>
    cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  const hold = async () => {
    await start();
    await end();
    await start();
  };
  const before = await inspect('return {yaw:w.yaw,distance:w.distance};');
  await start();
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchMove',
    touchPoints: [{ x: point.x + 35, y: point.y, id: 1 }],
  });
  await end();
  const looked = await inspect(
    'return {yaw:w.yaw,distance:w.distance,walking:w.touch.walking};',
  );
  expect(Math.abs(looked.yaw - before.yaw)).toBeGreaterThan(0.1);
  expect(looked.distance).toBe(before.distance);
  expect(looked.walking).toBe(false);
  await inspect(
    "const g=await import('/src/world/geo.ts');w.position.set(32.18,g.standingElevation([32.18,3.68]),3.68);w.yaw=0;",
  );
  const distance = await inspect('return w.distance;');
  await hold();
  await expect
    .poll(() => inspect('return w.distance;'))
    .toBeGreaterThan(distance + 0.1);
  await end();
  expect(await inspect('return w.touch.walking;')).toBe(false);
  const stopped = await inspect('return [w.position.x,w.position.z];');
  await page.waitForTimeout(150);
  const after = await inspect('return [w.position.x,w.position.z];');
  expect(Math.hypot(after[0] - stopped[0], after[1] - stopped[1])).toBeLessThan(
    0.01,
  );
  await hold();
  expect(await inspect('return w.touch.walking;')).toBe(true);
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchCancel',
    touchPoints: [],
  });
  expect(await inspect('return w.touch.walking;')).toBe(false);
  await hold();
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [
      { ...point, id: 1 },
      { x: point.x + 30, y: point.y, id: 2 },
    ],
  });
  expect(await inspect('return w.touch.walking;')).toBe(false);
  await end();
  await hold();
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  expect(await inspect('return w.touch.walking;')).toBe(false);
  await end();
  expect(errors).toEqual([]);
});
