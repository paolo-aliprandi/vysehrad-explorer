import { expect, test } from '@playwright/test';

test('enters, explores and leaves the churches and separate artillery gallery in both modes', async ({
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
    for (const kind of ['rotunda', 'lawrence', 'john', 'artillery']) {
      if (kind === 'john') {
        const clearance = await inspect(`
          const g=await import('/src/world/geo.ts');
          const route=[[-5,.8],[-5,-9.7],[-3.2,-10.2]].map(p=>g.aveMariaPoint(...p));
          const samples=route.slice(1).flatMap((b,i)=>{
            const a=route[i],count=Math.ceil(Math.hypot(b[0]-a[0],b[1]-a[1])/.15);
            return Array.from({length:count+1},(_,j)=>[a[0]+(b[0]-a[0])*j/count,a[1]+(b[1]-a[1])*j/count]);
          });
          w.scene.updateMatrixWorld(true);
          return samples.map(p=>{
            const floor=g.standingElevation(p);
            w.raycaster.set(w.position.clone().set(p[0]*1.5,(floor+.3)*1.5,p[1]*1.5),w.position.clone().set(0,-1,0));
            w.raycaster.far=.8;
            const hit=w.raycaster.intersectObjects(w.scene.children,true)[0];
            return {p,blocked:w.outdoorBlocked(p,floor,false),floor,rendered:hit?.point.y/1.5};
          });
        `);
        for (const point of clearance) {
          expect(point.blocked, JSON.stringify(point)).toBe(false);
          expect(
            Math.abs(point.rendered - point.floor),
            JSON.stringify(point),
          ).toBeLessThan(0.1);
        }
      }
      const outside = await inspect(`
        const {chapelSites}=await import('/src/world/chapels.ts'),g=await import('/src/world/geo.ts');
        const p='${kind}'==='artillery'?g.artilleryEntrance.approach:chapelSites.${kind}.approach;
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
              : kind === 'lawrence'
                ? 'Explore St. Lawrence’s ruins'
                : kind === 'john'
                  ? 'Enter the hidden Church of St. John'
                  : 'Enter the artillery gallery',
        }),
      ).toBeVisible();
      await page.keyboard.press('f');
      await expect
        .poll(() => inspect('return w.indoorReturn?.kind;'))
        .toBe(kind);
      await expect(page.locator('.location-pill')).toContainText(
        kind === 'rotunda'
          ? 'St. Martin'
          : kind === 'lawrence'
            ? 'St. Lawrence'
            : kind === 'john'
              ? 'St. John'
              : 'Artillery gallery',
      );
      if (kind === 'lawrence') {
        expect(await inspect('return w.sky.visible;')).toBe(false);
        const ceiling = await inspect(`
          const ray=w.raycaster;
          w.scene.updateMatrixWorld(true);
          ray.set(w.position.clone().set(0,1.5*1.5,0),w.position.clone().set(0,1,0));
          ray.far=10;
          return ray.intersectObjects(w.activeInterior.blockers,false)[0]?.point.y/1.5;
        `);
        expect(ceiling).toBeCloseTo(2.7);
      }
      const before = await inspect('return w.position.z;');
      await page.keyboard.down('w');
      await expect
        .poll(() => inspect('return w.position.z;'))
        .toBeLessThan(before - 0.8);
      await page.keyboard.up('w');
      await inspect(
        `w.position.set(0,0,${kind === 'artillery' ? -10 : kind === 'lawrence' ? 5.5 : 1.4});w.yaw=0;w.pitch=.32;w.zoom=5;w.jumpVelocity=0;`,
      );
      await page.waitForTimeout(300);
      await page.screenshot({
        path: `test-results/${mode}-${kind}-interior.png`,
      });
      await inspect(`
        const {chapelSites}=await import('/src/world/chapels.ts');
        const p='${kind}'==='artillery'?[0,2.5]:chapelSites.${kind}.exit;w.position.set(p[0],0,p[1]-.65);w.jumpVelocity=0;
      `);
      await expect(
        page.getByRole('button', {
          name:
            kind === 'artillery'
              ? 'Leave the artillery gallery'
              : 'Return to Vyšehrad',
        }),
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
