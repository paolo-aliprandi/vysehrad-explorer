import { expect, test } from '@playwright/test';

test('joins bank ends, keeps the corner shrine open, and animates quiet garden and shop activity', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  await page.getByRole('button', { name: 'Enter Vyšehrad' }).click();
  await expect(page.getByRole('button', { name: 'Mute sounds' })).toBeVisible();
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
  const objectId = objects.objectId;
  const inspect = async (body: string) => {
    const r = await cdp.send('Runtime.callFunctionOn', {
      objectId,
      functionDeclaration: `async function(){const w=this.find(w=>!w.disposed);${body}}`,
      awaitPromise: true,
      returnByValue: true,
    });
    if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails));
    return r.result.value;
  };
  const initial = await inspect(`
    const g=await import('/src/world/geo.ts'),p=await import('/src/world/pedestrians.ts');
    const garden=g.streetFurniture.filter(b=>g.gardenBenchIds.includes(b.id));
    const stops=w.visitors.filter(v=>!v.stroll.loop).map(v=>v.stroll.stops.size);
    const visitor=w.visitors.find(v=>v.stroll.stops.size&&!v.stroll.loop);
    const stopIndex=visitor.stroll.stops.keys().next().value;
    const distance=visitor.stroll.route.slice(1,stopIndex+1).reduce((sum,p,i)=>sum+Math.hypot(p[0]-visitor.stroll.route[i][0],p[1]-visitor.stroll.route[i][1]),0);
    visitor.stroll.update(distance+0.1,1);
    w.paused=true;
    return {benches:garden.length,seated:w.gardenGuests.length,circulating:w.visitors.filter(v=>v.stroll.loop).length,
      stops,sound:w.audio.context.state,point:visitor.stroll.point,waiting:visitor.stroll.waiting,
      treeGone:!w.treePoints.some(p=>Math.hypot(p[0]+85.5,p[1]+41.5)<1.6)};
  `);
  expect(initial.benches).toBe(4);
  expect(initial.seated).toBe(2);
  expect(initial.circulating).toBe(2);
  expect(initial.stops.every((count: number) => count > 0)).toBe(true);
  expect(initial.sound).toBe('running');
  expect(initial.waiting).toBeGreaterThan(0);
  expect(initial.treeGone).toBe(true);
  const seams = await inspect(`
    const g=await import('/src/world/geo.ts'),s=await import('/src/world/surfaces.ts');
    const terrain=w.blockers.filter(m=>m.name==='Terrain'||m.name==='Terrain rock');
    w.scene.updateMatrixWorld(true);
    return g.retainedStreetBanks.flatMap(bank=>{
      const points=bank.blendBoundary;
      return [[points[0],points[1]],[points.at(-2),points.at(-1)]].flatMap(([a,b])=>
        [.25,.5,.75].flatMap(t=>[-.02,.02].map(offset=>{
          const length=Math.hypot(b[0]-a[0],b[1]-a[1]);
          const point=[a[0]+(b[0]-a[0])*t-(b[1]-a[1])*offset/length,a[1]+(b[1]-a[1])*t+(b[0]-a[0])*offset/length];
          const stairs=g.inside(point,g.aveMariaStairCut),court=g.onAveMariaCourt(point),constructed=stairs||court;
          const ground=stairs?g.standingElevation(point):g.elevation(...point);
          w.raycaster.set(w.position.clone().set(point[0]*1.5,constructed?(ground+.3)*1.5:200,point[1]*1.5),w.position.clone().set(0,-1,0));w.raycaster.far=constructed?1:400;
          const hit=w.raycaster.intersectObjects(constructed?w.scene.children:terrain,constructed)[0];
          return {point,height:hit?.point.y/1.5,expected:ground+(stairs ? 0.05 : court ? 0.055 : 0)};
        })));
    });
  `);
  for (const seam of seams) {
    expect(Number.isFinite(seam.height), JSON.stringify(seam)).toBe(true);
    expect(
      Math.abs(seam.height - seam.expected),
      JSON.stringify(seam),
    ).toBeLessThan(0.15);
  }
  await page.getByRole('button', { name: 'Mute sounds' }).click();
  expect(await inspect('return w.audio.enabled;')).toBe(false);
  await page.getByRole('button', { name: 'Enable sounds' }).click();
  await inspect(`
    const g=await import('/src/world/geo.ts');
    const p=[-46.11,-39.77];w.position.set(p[0],g.standingElevation(p),p[1]);w.yaw=-1.1;w.jumpVelocity=0;
    w.footsteps=0;const step=w.audio.footstep.bind(w.audio);w.audio.footstep=soft=>{w.footsteps++;step(soft);};
    w.paused=false;
  `);
  await page.keyboard.down('w');
  await page.waitForTimeout(1000);
  await page.keyboard.up('w');
  expect(await inspect('return w.footsteps;')).toBeGreaterThan(0);
  await inspect('w.paused=true;');
  const footsteps = await inspect('return w.footsteps;');
  await page.waitForTimeout(250);
  expect(await inspect('return w.footsteps;')).toBe(footsteps);
  expect(errors).toEqual([]);
});
