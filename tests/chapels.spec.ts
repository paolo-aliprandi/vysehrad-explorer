import { expect, test } from '@playwright/test';

test('enters, explores and leaves the rotunda and roofless St Lawrence remains in both modes', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  await page.getByRole('button', { name: 'Enter Vyšehrad' }).click();
  const cdp = await page.context().newCDPSession(page);
  const { result: prototype } = await cdp.send('Runtime.evaluate', {
    expression:
      "import(performance.getEntriesByType('resource').find(entry => new URL(entry.name).pathname === '/src/world/engine.ts').name).then(m => m.World.prototype)",
    awaitPromise: true,
  });
  if (!prototype.objectId) throw new Error('Missing world prototype.');
  const { objects } = await cdp.send('Runtime.queryObjects', {
    prototypeObjectId: prototype.objectId,
  });
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
  for (const mode of ['chill', 'adventure']) {
    await inspect(`w.setMode('${mode}');w.setTime('day');`);
    for (const kind of ['rotunda', 'lawrence']) {
      const outside = await inspect(`
        const {chapelSites}=await import('/src/world/chapels.ts'),g=await import('/src/world/geo.ts');
        const p=chapelSites.${kind}.approach;
        w.position.set(p[0],g.standingElevation(p)+.1,p[1]);
        w.position.y=w.support(p);w.jumpVelocity=0;
        return {position:w.position.toArray(),blocked:w.outdoorBlocked(p,w.position.y,false)};
      `);
      expect(outside.blocked).toBe(false);
      if (kind === 'lawrence') {
        await inspect('w.yaw=1.05;w.pitch=.12;w.zoom=6;');
        await page.waitForTimeout(300);
        await page.screenshot({
          path: `test-results/${mode}-lawrence-exterior.png`,
        });
      }
      await expect(
        page.getByRole('button', {
          name:
            kind === 'rotunda'
              ? 'Enter St. Martin’s Rotunda'
              : 'Explore St. Lawrence’s ruins',
        }),
      ).toBeVisible();
      await page.keyboard.press('f');
      await expect
        .poll(() => inspect('return w.indoorReturn?.kind;'))
        .toBe(kind);
      await expect(page.locator('.location-pill')).toContainText(
        kind === 'rotunda' ? 'St. Martin' : 'St. Lawrence',
      );
      const before = await inspect('return w.position.z;');
      await page.keyboard.down('w');
      await expect
        .poll(() => inspect('return w.position.z;'))
        .toBeLessThan(before - 0.8);
      await page.keyboard.up('w');
      await inspect(
        `w.position.set(0,0,${kind === 'rotunda' ? 1.4 : 5.5});w.yaw=0;w.pitch=.32;w.zoom=5;w.jumpVelocity=0;`,
      );
      await page.waitForTimeout(300);
      await page.screenshot({
        path: `test-results/${mode}-${kind}-interior.png`,
      });
      await inspect(`
        const {chapelSites}=await import('/src/world/chapels.ts');
        const p=chapelSites.${kind}.exit;w.position.set(p[0],0,p[1]-.65);w.jumpVelocity=0;
      `);
      await expect(
        page.getByRole('button', { name: 'Return to Vyšehrad' }),
      ).toBeVisible();
      await page.keyboard.press('f');
      await expect.poll(() => inspect('return w.indoorReturn;')).toBeNull();
      expect(await inspect('return w.position.toArray();')).toEqual(
        outside.position,
      );
      expect(await inspect('return w.mode;')).toBe(mode);
    }
  }
  expect(errors).toEqual([]);
  await cdp.detach();
});
