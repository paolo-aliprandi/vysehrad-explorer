import { expect, test } from '@playwright/test';

test('renders coherent paving at Charles IV, the rotunda street and ramparts, preserves the park and keeps raids playable', async ({
  page,
}) => {
  test.setTimeout(180_000);
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
  const kiosks = await inspect(`
    const {kioskSites}=await import('/src/world/kiosks.ts'),g=await import('/src/world/geo.ts');
    const mode=w.mode,previous=w.position.clone();
    w.setMode('chill');
    const results=kioskSites.map(site=>{
      w.position.set(site.approach[0],g.standingElevation(site.approach),site.approach[1]);
      const actor=w.scene.getObjectByName('Kiosk attendant: '+site.id);
      const prompt=w.activity(),reply=w.interact();
      return {id:site.id,attendant:!!actor,rotation:actor?.rotation.y,angle:site.angle,prompt:prompt?.id,reply};
    });
    const customers=w.visitors.filter(visitor=>visitor.model.name.startsWith('Kiosk customer'));
    const loops=customers.map(visitor=>{
      const distance=visitor.stroll.distance;
      visitor.stroll.update(120,visitor.pace);
      return {loop:visitor.stroll.loop,departed:visitor.stroll.departed,moved:visitor.stroll.distance>distance,stops:visitor.stroll.stops.size};
    });
    w.position.copy(previous);w.setMode(mode);
    return {results,loops};
  `);
  expect(kiosks.results).toHaveLength(3);
  for (const kiosk of kiosks.results) {
    expect(kiosk.attendant).toBe(true);
    expect(kiosk.rotation).toBeCloseTo(kiosk.angle, 5);
    expect(kiosk.prompt).toBe(kiosk.id);
    expect(kiosk.reply.kind).toBe('message');
    expect(kiosk.reply.text).toContain(': ');
  }
  expect(kiosks.loops).toHaveLength(6);
  for (const customer of kiosks.loops) {
    expect(customer.loop).toBe(true);
    expect(customer.departed).toBe(false);
    expect(customer.moved).toBe(true);
    expect(customer.stops).toBeGreaterThan(0);
  }
  const streetChecks = await inspect(`
    const g=await import('/src/world/geo.ts'),s=await import('/src/world/surfaces.ts');
    const group=w.scene.getObjectByName('Paving');
    w.scene.updateMatrixWorld(true);
    const materials=group.children.map(mesh=>({name:mesh.name,color:mesh.material.color.getHexString()}));
    const terrain=w.blockers.filter(mesh=>mesh.name==='Terrain'||mesh.name==='Terrain rock');
    const points=s.samplePolyline(g.rotundaStreet.points,2).slice(1,-1).flatMap(point=>{
      const normal=g.projectRoute(point,g.rotundaStreet.points).normal;
      return [-2,0,2].map(offset=>[point[0]+normal[0]*offset,point[1]+normal[1]*offset]);
    });
    points.push([68.3082,106.76358],[68.52926,103.36625],[68.65567,99.68444],[61.62993,58.8394]);
    for(let x=59.5;x<=64;x+=.5)for(let z=59.5;z<=66;z+=.5) {
      const point=[x,z];
      if(g.retainedStreetCorridors.some(c=>g.inside(point,c.polygon))&&!g.blocked(point,g.elevation(x,z)))points.push(point);
    }
    const street=points.flatMap(point=>{
      w.raycaster.set(w.position.clone().set(point[0]*1.5,180,point[1]*1.5),w.position.clone().set(0,-1,0));w.raycaster.far=300;
      const road=w.raycaster.intersectObjects(group.children,false)[0];
      if(!road)return [{point,missing:true}];
      const earth=w.raycaster.intersectObjects(terrain,false)[0];
      return [{point,road:road.point.y/1.5,earth:earth?.point.y/1.5}];
    });
    return {materials,street};
  `);
  expect(streetChecks.materials).toHaveLength(2);
  expect(streetChecks.materials).toContainEqual({
    name: 'Paving: cobble',
    color: 'b2b5ae',
  });
  for (const point of streetChecks.street) {
    expect(point.missing, JSON.stringify(point)).not.toBe(true);
    expect(point.road - point.earth, JSON.stringify(point)).toBeGreaterThan(
      0.005,
    );
  }
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
    const streetSections=[[-46.11,-39.77],[32.18,3.68],[-49.87,44.96],[29.83,62.55]].map(point=>{
      const corridor=g.retainedStreetCorridors.reduce((a,b)=>
        g.projectRoute(point,a.points).distance<g.projectRoute(point,b.points).distance?a:b);
      const normal=g.projectRoute(point,corridor.points).normal;
      return [-4,0,4].map(offset=>{
        const p=[point[0]+normal[0]*offset,point[1]+normal[1]*offset];
        const floor=g.standingElevation(p);
        w.raycaster.set(w.position.clone().set(p[0]*1.5,(floor+.8)*1.5,p[1]*1.5),w.position.clone().set(0,-1,0));
        w.raycaster.far=2;
        const hit=w.raycaster.intersectObjects(w.blockers,false)[0];
        return {point:p,floor,mesh:hit?.point.y/1.5};
      });
    });
    const wall=g.retainedStreetWalls.find(wall=>wall.points.length>20);
    if(!wall)throw new Error('Missing street retaining wall.');
    const edge=wall.points[Math.floor(wall.points.length/2)];
    const centre=g.projectRoute(edge,g.retainedStreetCorridors[0].points).point;
    const from=w.position.clone().set(centre[0],g.elevation(...centre)+.5,centre[1]).multiplyScalar(1.5);
    const to=w.position.clone().set(edge[0]*1.5,from.y,edge[1]*1.5);
    w.raycaster.set(from,to.clone().sub(from).normalize());
    w.raycaster.far=from.distanceTo(to)+1;
    const retainingHits=w.raycaster.intersectObjects(w.blockers,false).length;
    const terrain=w.blockers.filter(mesh=>mesh.name==='Terrain'||mesh.name==='Terrain rock');
    const renderedStreets=g.retainedStreetCorridors.flatMap(corridor=>
      s.samplePolyline(corridor.points,12).slice(1,-1).flatMap(point=>{
        const normal=g.projectRoute(point,corridor.points).normal;
        return [-4,0,4].map(offset=>{
          const p=[point[0]+normal[0]*offset,point[1]+normal[1]*offset];
          w.raycaster.set(w.position.clone().set(p[0]*1.5,200,p[1]*1.5),w.position.clone().set(0,-1,0));w.raycaster.far=400;
          const earth=w.raycaster.intersectObjects(terrain,false)[0];
          const paving=w.raycaster.intersectObjects(group.children,false)[0];
          const occupied=g.buildings.some(building=>building.tags.historic!=='city_gate'&&!g.meters(building.tags.min_height,0)&&g.inside(p,building.points)&&!building.holes.some(hole=>g.inside(p,hole)));
          return {point:p,occupied,earth:earth?.point.y/1.5,paving:paving?.point.y/1.5,material:paving?.object.name};
        });
      }));
    const uphill=s.samplePolyline(g.retainedStreetAccess.points,2).slice(2,-1).map(p=>{
      w.raycaster.set(w.position.clone().set(p[0]*1.5,200,p[1]*1.5),w.position.clone().set(0,-1,0));w.raycaster.far=400;
      const earth=w.raycaster.intersectObjects(terrain,false)[0];
      const paving=w.raycaster.intersectObjects(group.children,false)[0];
      return {point:p,earth:earth?.point.y/1.5,paving:paving?.point.y/1.5,material:paving?.object.name};
    });
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
    return {streetSections,retainingHits,renderedStreets,uphill,exterior,park};
  `);
  for (const section of probes.streetSections) {
    for (const sample of section) {
      expect(sample.floor).toBeCloseTo(section[1].floor, 3);
      expect(sample.mesh).toBeCloseTo(sample.floor, 0);
    }
  }
  expect(probes.retainingHits).toBeGreaterThan(0);
  for (const sample of [...probes.renderedStreets, ...probes.uphill]) {
    if (sample.occupied) {
      expect(sample.paving, JSON.stringify(sample)).toBeNull();
      continue;
    }
    expect(sample.paving, JSON.stringify(sample)).toBeDefined();
    expect(sample.earth, JSON.stringify(sample)).toBeDefined();
    expect(
      sample.paving - sample.earth,
      JSON.stringify(sample),
    ).toBeGreaterThan(0.01);
    expect(sample.paving - sample.earth, JSON.stringify(sample)).toBeLessThan(
      0.15,
    );
  }
  for (const sample of probes.uphill)
    expect(sample.material, JSON.stringify(sample)).toBe('Paving: gravel');
  for (const point of [
    [-46.11, -39.77],
    [-49.87, 44.96],
  ]) {
    const before = await inspect(`
      const g=await import('/src/world/geo.ts'),p=${JSON.stringify(point)};
      w.position.set(p[0],g.standingElevation(p),p[1]);w.jumpVelocity=0;
      w.yaw=${point[0] < -48 ? -Math.PI / 2 : -1.1};
      return w.position.toArray();
    `);
    await page.keyboard.down('w');
    await page.waitForTimeout(500);
    await page.keyboard.up('w');
    const after = await inspect('return w.position.toArray();');
    expect(
      Math.hypot(after[0] - before[0], after[2] - before[2]),
    ).toBeGreaterThan(0.5);
    expect(Math.abs(after[1] - before[1])).toBeLessThan(0.5);
  }
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
      name: 'cathedral-retaining-street',
      point: [30, 62.5],
      yaw: -Math.PI / 2,
      zoom: 9,
      pitch: 0.18,
      height: 0,
    },
    {
      name: 'brick-gate-retaining-street',
      point: [-46, -40],
      yaw: -1.1,
      zoom: 10,
      pitch: 0.18,
      height: 0,
    },
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
      w.position.set(p[0],g.standingElevation(p)+${'height' in view ? view.height : 20},p[1]);w.jumpVelocity=0;
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
