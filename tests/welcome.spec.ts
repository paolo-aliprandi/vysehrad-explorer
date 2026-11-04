import { expect, test } from '@playwright/test';

for (const [name, width, height, large] of [
  ['desktop', 1440, 900, true],
  ['mobile', 390, 844, false],
] as const) {
  test(`shows a responsive aerial before JavaScript loads on ${name}`, async ({
    browser,
  }, testInfo) => {
    const context = await browser.newContext({
      javaScriptEnabled: false,
      viewport: { width, height },
      deviceScaleFactor: 2,
    });
    try {
      const page = await context.newPage();
      await page.goto(testInfo.project.use.baseURL ?? '/');
      const image = page.locator('#root > img');
      await expect(image).toBeVisible();
      await expect
        .poll(() =>
          image.evaluate((image) => (image as HTMLImageElement).naturalWidth),
        )
        .toBeGreaterThan(0);
      const source = await image.evaluate(
        (image) => (image as HTMLImageElement).currentSrc,
      );
      expect(source.endsWith('-large.jpg')).toBe(large);
      expect(await image.boundingBox()).toMatchObject({
        x: 0,
        y: 0,
        width,
        height,
      });
    } finally {
      await context.close();
    }
  });
}

test('keeps aerials visible while 3D loads, respects reduced motion, then enters the world', async ({
  page,
}, testInfo) => {
  let release!: () => void;
  const engineReady = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route(
    /\/(?:src\/world\/engine\.ts|assets\/engine-[^/]+\.js)(?:\?.*)?$/,
    async (route) => {
      await engineReady;
      await route.continue();
    },
  );
  await page.emulateMedia({ reducedMotion: 'reduce' });
  try {
    await page.goto('/');
    await expect(
      page.getByRole('button', { name: /Assembling your little world/ }),
    ).toBeDisabled();
    const images = page.locator('.welcome-aerials img');
    await expect(images).toHaveCount(3);
    await expect
      .poll(() =>
        images
          .first()
          .evaluate((image) => (image as HTMLImageElement).naturalWidth),
      )
      .toBeGreaterThan(0);
    await expect(images.first()).toHaveCSS('animation-name', 'none');
    await expect(images.nth(1)).toBeHidden();
    await expect(images.nth(2)).toBeHidden();
    await page.screenshot({ path: testInfo.outputPath('welcome-loading.png') });
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await images.evaluateAll((images) => {
      for (const image of images)
        for (const animation of image.getAnimations()) {
          animation.pause();
          animation.currentTime = 9000;
        }
    });
    await expect(images.nth(1)).toHaveCSS('opacity', '1');
  } finally {
    release();
  }
  await page.getByRole('button', { name: 'Enter Vyšehrad' }).click();
  await expect(page.getByRole('button', { name: 'Mute sounds' })).toBeVisible();
  await expect(page.locator('.welcome-aerials')).toHaveCount(0);
});
