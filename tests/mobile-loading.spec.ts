import { expect, test } from '@playwright/test';

test.use({
  viewport: { width: 430, height: 932 },
  deviceScaleFactor: 3,
  isMobile: true,
  hasTouch: true,
});

test('bounds mobile graphics and builds each indoor scene only when entered, preserving saved notes and return paths', async ({
  page,
}) => {
  test.setTimeout(180000);
  const errors: string[] = [];
  const images: string[] = [];
  page.on('request', (request) => {
    if (request.url().includes('/images/welcome-')) images.push(request.url());
  });
  await page.addInitScript(() => {
    const stages = new Set<string>();
    new MutationObserver(() => {
      const button = document.querySelector(
        '.entry-card .primary-button:disabled',
      );
      if (button?.textContent) {
        stages.add(button.textContent);
        document.documentElement.dataset.loadingStages = JSON.stringify([
          ...stages,
        ]);
      }
    }).observe(document, {
      subtree: true,
      childList: true,
      characterData: true,
    });
  });
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  await page.goto('/');
  await page
    .getByRole('button', { name: 'Enter Vyšehrad', exact: true })
    .click();
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
  if (!objects.objectId) throw new Error('Missing mobile world.');
  const inspect = async (body: string) => {
    const result = await cdp.send('Runtime.callFunctionOn', {
      objectId: objects.objectId,
      functionDeclaration: `async function(){const w=this.find(world=>!world.disposed);${body}}`,
      awaitPromise: true,
      returnByValue: true,
    });
    if (result.exceptionDetails)
      throw new Error(JSON.stringify(result.exceptionDetails));
    return result.result.value;
  };
  expect(
    await inspect(`
    w.setCasemateNotes(['ramparts']);
    return {
      ratio:w.renderer.getPixelRatio(),
      antialias:w.renderer.getContext().getContextAttributes().antialias,
      shadows:w.renderer.shadowMap.enabled,
      size:[w.renderer.domElement.width,w.renderer.domElement.height],
      interiors:[!!w.interior,!!w.casemates,!!w.artillery,Object.keys(w.chapels).length],
    };
  `),
  ).toEqual({
    ratio: 1,
    antialias: false,
    shadows: false,
    size: [430, 932],
    interiors: [false, false, false, 0],
  });
  expect(images).toHaveLength(3);
  expect(images.some((url) => url.includes('-large.jpg'))).toBe(false);
  expect(
    await page.evaluate(
      () =>
        JSON.parse(document.documentElement.dataset.loadingStages ?? '[]')
          .length,
    ),
  ).toBeGreaterThan(3);
  const rooms = await inspect(`
    const position=w.position.clone(), results=[];
    for(const kind of ['casemates','cathedral','rotunda','lawrence','john','artillery']){
      w.enterInterior(kind);
      const room=w.activeInterior, light=room.group.children.find(child=>child.isPointLight);
      const distance=light?.distance;
      const notes=kind==='casemates' ? [...room.markers].map(([id,marker])=>({id,visible:marker.visible})) : [];
      const accelerated=room.blockers.filter(mesh=>mesh.isMesh).every(mesh=>!!mesh.geometry.boundsTree);
      w.leaveCathedral();
      const restored=w.position.distanceTo(position)<.001;
      w.enterInterior(kind);
      results.push({kind,reused:w.activeInterior===room,lightsUnchanged:light?.distance===distance,accelerated,restored,notes});
      w.leaveCathedral();
    }
    return results;
  `);
  for (const room of rooms) {
    expect(room.reused, room.kind).toBe(true);
    expect(room.lightsUnchanged, room.kind).toBe(true);
    expect(room.accelerated, room.kind).toBe(true);
    expect(room.restored, room.kind).toBe(true);
  }
  expect(
    rooms[0].notes.find((note: { id: string }) => note.id === 'ramparts')
      .visible,
  ).toBe(false);
  expect(
    rooms[0].notes.find((note: { id: string }) => note.id === 'gorlice')
      .visible,
  ).toBe(true);
  expect(
    await inspect(`
    const host=document.createElement('div'), controller=new AbortController();
    document.body.appendChild(host);
    let stages=0, aborted=false;
    try {
      await w.constructor.create(host,{
        onUpdate(){},onDiscover(){},onCasemateNote(){},onError(){},
        onProgress(){if(++stages===2)controller.abort()},
      },controller.signal);
    } catch(error) {
      if(error.name!=='AbortError')throw error;
      aborted=true;
    }
    const canvases=host.querySelectorAll('canvas').length;
    host.remove();
    return {aborted,stages,canvases};
  `),
  ).toEqual({ aborted: true, stages: 2, canvases: 0 });
  expect(errors).toEqual([]);
  await cdp.detach();
});
