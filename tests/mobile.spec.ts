import { expect, test, type Page } from '@playwright/test';

async function checkWelcomeLayout(page: Page) {
  for (const [width, height] of [
    [390, 600],
    [320, 568],
    [844, 390],
  ]) {
    await page.setViewportSize({ width, height });
    await page.locator('.app').evaluate((app) => {
      app.scrollTop = 0;
    });
    const header = await page.locator('.topbar').boundingBox();
    const title = await page.locator('.hero-copy').boundingBox();
    const card = await page.locator('.entry-card').boundingBox();
    if (!header || !title || !card) throw new Error('Missing welcome layout.');
    expect(title.y).toBeGreaterThanOrEqual(header.y + header.height);
    expect(card.y).toBeGreaterThanOrEqual(title.y + title.height);
    expect(card.x + card.width).toBeLessThanOrEqual(width);
    const enter = page.getByRole('button', {
      name: /Enter Vyšehrad|Assembling your little world/,
    });
    await enter.scrollIntoViewIfNeeded();
    await expect(enter).toBeInViewport();
    await page
      .getByRole('button', { name: /About the model/ })
      .scrollIntoViewIfNeeded();
    await expect(
      page.getByRole('button', { name: /About the model/ }),
    ).toBeInViewport();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBe(width);
  }
  await page.setViewportSize({ width: 390, height: 600 });
}

async function checkExplorationLayout(page: Page) {
  for (const selector of ['.scene', '.scene canvas', '.controls-bar']) {
    await expect(page.locator(selector)).toHaveCSS('user-select', 'none');
  }
  const nativeMenuAllowed = await page
    .locator('.scene')
    .evaluate((scene) =>
      scene.dispatchEvent(
        new MouseEvent('contextmenu', { bubbles: true, cancelable: true }),
      ),
    );
  expect(nativeMenuAllowed).toBe(false);
  await expect(page.locator('.expedition-card')).not.toBeVisible();
  await expect(page.locator('.minimap-heading')).not.toBeVisible();
  await expect(page.locator('.minimap-button .world-map')).not.toBeVisible();
  await expect(page.locator('.toast')).not.toContainText('F / A');
  for (const [width, height] of [
    [390, 600],
    [320, 568],
    [844, 390],
  ]) {
    await page.setViewportSize({ width, height });
    for (const selector of [
      '.brand',
      '.top-actions',
      '.location-pill',
      '.minimap-card',
      '.report-button',
      '.controls-bar',
    ]) {
      const bounds = await page.locator(selector).boundingBox();
      if (!bounds) throw new Error(`Missing mobile control: ${selector}`);
      expect(bounds.x, selector).toBeGreaterThanOrEqual(0);
      expect(bounds.y, selector).toBeGreaterThanOrEqual(0);
      expect(bounds.x + bounds.width, selector).toBeLessThanOrEqual(width);
      expect(bounds.y + bounds.height, selector).toBeLessThanOrEqual(height);
    }
  }
  await page.setViewportSize({ width: 390, height: 600 });
  const clearFraction = await page.evaluate(() => {
    let clear = 0,
      total = 0;
    for (let y = 180; y <= 420; y += 40)
      for (let x = 25; x < 390; x += 50) {
        total++;
        if (document.elementFromPoint(x, y)?.closest('.scene')) clear++;
      }
    return clear / total;
  });
  expect(clearFraction).toBeGreaterThan(0.65);
  const menu = page.getByRole('button', { name: 'More controls' });
  await menu.tap();
  await expect(menu).toHaveAttribute('aria-expanded', 'true');
  await page.getByRole('button', { name: 'Mute sounds' }).tap();
  await expect(
    page.getByRole('button', { name: 'Enable sounds' }),
  ).toBeVisible();
  await menu.tap();
  await page.getByRole('button', { name: 'Open exploration map' }).tap();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCSS('user-select', 'text');
  await page.getByRole('button', { name: 'Close dialog' }).tap();
}

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
  await checkWelcomeLayout(page);
  await page.getByRole('button', { name: 'Enter Vyšehrad' }).tap();
  await expect(page.locator('.app')).toHaveClass(/playing/);
  await checkExplorationLayout(page);
  await page.setViewportSize({ width: 390, height: 844 });
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
  await page.waitForTimeout(800);
  await expect
    .poll(() => inspect('return w.distance;'))
    .toBeGreaterThan(distance + 0.1);
  expect(await page.evaluate(() => window.getSelection()?.toString())).toBe('');
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

test('keeps the homepage and exploration controls usable in phone-layout WebKit', async ({
  playwright,
  baseURL,
}, testInfo) => {
  test.setTimeout(180000);
  const browser = await playwright.webkit.launch();
  const context = await browser.newContext({
    baseURL,
    viewport: { width: 390, height: 600 },
    isMobile: true,
    hasTouch: true,
  });
  try {
    const page = await context.newPage();
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    let release!: () => void;
    const layoutReady = new Promise<void>((resolve) => {
      release = resolve;
    });
    await page.route(/\/src\/world\/engine\.ts(?:\?.*)?$/, async (route) => {
      await layoutReady;
      await route.continue();
    });
    await page.goto('/');
    try {
      await checkWelcomeLayout(page);
    } finally {
      release();
    }
    await page.locator('.app').evaluate((app) => {
      app.scrollTop = 0;
    });
    await page.screenshot({ path: testInfo.outputPath('mobile-homepage.png') });
    await page.getByRole('button', { name: 'Enter Vyšehrad' }).tap();
    await checkExplorationLayout(page);
    await page.screenshot({
      path: testInfo.outputPath('mobile-exploration.png'),
    });
    expect(errors).toEqual([]);
  } finally {
    await context.close();
    await browser.close();
  }
});
