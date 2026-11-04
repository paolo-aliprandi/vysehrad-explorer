import { expect, test } from '@playwright/test';

test('renders coherent paving at Charles IV, the rotunda street and ramparts, preserves the park and keeps raids playable', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  await page
    .getByRole('button', { name: 'Enter Vyšehrad' })
    .click({ trial: true });
  await page.getByRole('button', { name: /Adventure Mode/ }).click();
  await page.getByRole('button', { name: 'Enter Vyšehrad' }).click();
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
      functionDeclaration: `async function(){const w=this.find(w=>!w.disposed);${body}}`,
      awaitPromise: true,
      returnByValue: true,
    });
    if (result.exceptionDetails)
      throw new Error(JSON.stringify(result.exceptionDetails));
    return result.result.value;
  };
  await expect
    .poll(() =>
      inspect('return w.adventureModels.enemies.filter(e=>e.visible).length;'),
    )
    .toBe(24);
  expect(
    await inspect('return w.scene.getObjectByName("Paving").children.length;'),
  ).toBe(2);
  const streetMaterials = await inspect(`
    const group=w.scene.getObjectByName('Paving');
    w.scene.updateMatrixWorld(true);
    return [
      [63.333,107.199],
      [4.733,57.589],
      [90.898,106.034],
      [106.383,79.129],
      [15.328,-86.241],
    ].map(point=>{
      w.raycaster.set(w.position.clone().set(point[0]*1.5,300,point[1]*1.5),w.position.clone().set(0,-1,0));
      w.raycaster.far=600;
      return [...new Set(w.raycaster.intersectObjects(group.children,false).map(hit=>hit.object.name))];
    });
  `);
  expect(streetMaterials).toEqual([
    ['Paving: cobble'],
    ['Paving: cobble'],
    ['Paving: gravel'],
    ['Paving: gravel'],
    ['Paving: gravel'],
  ]);
  expect(
    await inspect(`
    const g=await import('/src/world/geo.ts'),group=w.scene.getObjectByName('Paving');
    const point=[570.13,-495.81];
    w.scene.updateMatrixWorld(true);
    w.raycaster.set(w.position.clone().set(point[0]*1.5,300,point[1]*1.5),w.position.clone().set(0,-1,0));
    w.raycaster.far=600;
    return w.raycaster.intersectObjects(group.children,false).length;
  `),
  ).toBe(1);
  const probes = await inspect(`
    const g=await import('/src/world/geo.ts'),s=await import('/src/world/surfaces.ts');
    const group=w.scene.getObjectByName('Paving');
    const rayHits=point=>{
      w.raycaster.set(w.position.clone().set(point[0]*1.5,300,point[1]*1.5),w.position.clone().set(0,-1,0));
      w.raycaster.far=600;
      return w.raycaster.intersectObjects(group.children,false).length;
    };
    const road=g.paths.find(p=>p.id===4646722);
    const old=s.pathRibbon(road.points,11.5,.055,(x,z)=>g.featureElevation(road,[x,z]));
    const p=old.attributes.position,badBanks=[];
    for(let i=0;i<p.count && badBanks.length<5;i+=3) {
      const a=w.position.clone().fromBufferAttribute(p,i),b=w.position.clone().fromBufferAttribute(p,i+1),c=w.position.clone().fromBufferAttribute(p,i+2);
      const normal=b.clone().sub(a).cross(c.clone().sub(a));
      const point=[(a.x+b.x+c.x)/3,(a.z+b.z+c.z)/3];
      if(Math.hypot(normal.x,normal.z)>Math.abs(normal.y)*.551 &&
        g.projectRoute(point,road.points).distance>g.pathWidth(road)/2+.2 &&
        !g.paths.some(f=>f.tags.highway==='steps' && g.projectRoute(point,f.points).distance<g.pathWidth(f)/2))
        badBanks.push({point,hits:rayHits(point)});
    }
    old.dispose();
    const exterior=[];
    for(const id of [351280742,1303802776,26694438,26694442]) {
      const feature=g.paths.find(p=>p.id===id),old=s.pathRibbon(feature.points,g.pathWidth(feature),.055,(x,z)=>g.featureElevation(feature,[x,z]));
      const p=old.attributes.position;
      for(let i=0;i<p.count && exterior.length<5;i+=3) {
        const point=[(p.getX(i)+p.getX(i+1)+p.getX(i+2))/3,(p.getZ(i)+p.getZ(i+1)+p.getZ(i+2))/3];
        const terrace=g.rampartTerrace(point);
        if(terrace && !g.inside(point,g.courtBankBoundary) &&
          g.projectRoute(point,g.courtBankBoundary).distance>.15 &&
          g.featureElevation(feature,point)>terrace.level-1.3)
          exterior.push({point,hits:rayHits(point)});
      }
      old.dispose();
    }
    const park=[24376653,24376654,24376655,351536140,351536142].map(id=>{
      const feature=g.paths.find(p=>p.id===id);
      const points=s.samplePolyline(feature.points,5);
      const point=points[Math.floor(points.length/2)];
      return {id,hits:rayHits([point[0]+.013,point[1]+.019])};
    });
    return {badBanks,exterior,park};
  `);
  expect(probes.badBanks.length).toBeGreaterThan(0);
  expect(
    probes.badBanks.every((p: { hits: number }) => p.hits === 0),
    JSON.stringify(probes.badBanks),
  ).toBe(true);
  expect(probes.exterior.length).toBeGreaterThan(0);
  expect(
    probes.exterior.every((p: { hits: number }) => p.hits === 0),
    JSON.stringify(probes.exterior),
  ).toBe(true);
  expect(
    probes.park.every((p: { hits: number }) => p.hits === 1),
    JSON.stringify(probes.park),
  ).toBe(true);
  await page.keyboard.press('p');
  const progress = await inspect(`
    const progress=w.adventure.snapshot();
    w.setMode('chill');w.setFlying(true);w.paused=true;w.setTime("day");
    return progress;
  `);
  for (const view of [
    {
      name: 'charles-iv-paving',
      point: [576, -485],
      yaw: 0,
      zoom: 42,
      pitch: 1,
    },
    {
      name: 'stulcovy-statue-paths',
      point: [-220, -144],
      yaw: 0.2,
      zoom: 48,
      pitch: 1,
    },
    {
      name: 'sculpture-garden-paths',
      point: [-217, 52],
      yaw: -0.3,
      zoom: 48,
      pitch: 1,
    },
    {
      name: 'rotunda-brick-gate-street',
      point: [-41, -38],
      yaw: -1.1,
      zoom: 45,
      pitch: 0.8,
    },
    {
      name: 'v-pevnosti-unified-street',
      point: [210, 265],
      yaw: 2.7,
      zoom: 44,
      pitch: 0.85,
    },
    {
      name: 'rampart-path-boundary',
      point: [-257, 90],
      yaw: -1.5,
      zoom: 38,
      pitch: 0.9,
    },
    {
      name: 'preserved-karlachovy-paths',
      point: [-30, 18],
      yaw: -0.7,
      zoom: 55,
      pitch: 1,
    },
  ]) {
    await inspect(`
      const g=await import('/src/world/geo.ts'),p=${JSON.stringify(view.point)};
      w.position.set(p[0],g.standingElevation(p)+20,p[1]);w.jumpVelocity=0;
      w.yaw=${view.yaw};w.zoom=${view.zoom};w.pitch=${view.pitch};
      w.camera.position.copy(w.position).multiplyScalar(1.5).add(w.position.clone().set(0,30,30));
    `);
    await page.waitForTimeout(650);
    await page.screenshot({ path: `test-results/${view.name}.png` });
  }
  await page.keyboard.press('p');
  await inspect(`
    w.setFlying(false);w.setMode('adventure',${JSON.stringify(progress)});
    w.paused=false; w.adventure.enemies.forEach(e=>{w.adventure.defeated.add(e.id);e.defeatTime=0;});
    w.adventure.weapon='sword';w.adventure.melee='sword';w.adventure.coins=17;
    w.adventure.arrows=5;w.adventure.hasBow=true;w.adventure.explored.add('rotunda');
  `);
  await expect(
    page.getByRole('status', { name: 'Knight status' }),
  ).toContainText('0 remaining');
  await page.getByRole('button', { name: 'Start another raid' }).click();
  await expect
    .poll(() =>
      inspect('return w.adventureModels.enemies.filter(e=>e.visible).length;'),
    )
    .toBe(24);
  expect(
    await inspect(
      'return {weapon:w.adventure.weapon,coins:w.adventure.coins,arrows:w.adventure.arrows,charted:w.adventure.explored.has("rotunda")};',
    ),
  ).toEqual({
    weapon: 'sword',
    coins: 17,
    arrows: 5,
    charted: true,
  });
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          JSON.parse(localStorage.getItem('vysehrad-adventure-v1') ?? '{}')
            .defeated?.length,
      ),
    )
    .toBe(0);
  await inspect(`
    const g=await import('/src/world/geo.ts'),p=[-41,-38];
    w.position.set(p[0],g.standingElevation(p),p[1]);w.jumpVelocity=0;w.yaw=-1.1;
  `);
  const before = await inspect('return w.position.toArray();');
  await page.keyboard.down('w');
  await expect
    .poll(async () => {
      const point = await inspect('return w.position.toArray();');
      return Math.hypot(point[0] - before[0], point[2] - before[2]);
    })
    .toBeGreaterThan(0.8);
  await page.keyboard.up('w');
  expect(errors).toEqual([]);
  await cdp.detach();
});
