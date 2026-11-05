import { expect, test } from '@playwright/test';

for (const browserName of ['chromium', 'webkit'] as const) {
  test.describe(`${browserName} mobile report scrolling`, () => {
    test('reaches the submit control by scrolling and keeps the close button accessible', async ({
      browser,
      playwright,
      baseURL,
    }) => {
      test.setTimeout(180000);
      const engine =
        browserName === 'webkit' ? await playwright.webkit.launch() : browser;
      const context = await engine.newContext({
        baseURL,
        viewport: { width: 390, height: 600 },
        isMobile: true,
        hasTouch: true,
      });
      try {
        const page = await context.newPage();
        const errors: string[] = [];
        page.on('pageerror', (error) => errors.push(error.message));
        await page.addInitScript(() => {
          window.turnstile = {
            render(_element, options) {
              options.callback('browser-test-human');
              return 'widget';
            },
            remove() {
              return undefined;
            },
            reset() {
              return undefined;
            },
          };
        });
        await page.goto('/');
        await page.getByRole('button', { name: 'Enter Vyšehrad' }).tap();
        await page
          .getByRole('button', { name: 'Report / contribute a photo' })
          .tap();
        const dialog = page.getByRole('dialog');
        const submit = page.getByRole('button', {
          name: 'Send report privately',
        });
        const close = page.getByRole('button', { name: 'Close dialog' });
        const description = page.getByRole('textbox', {
          name: 'Describe the location and what should change',
        });
        await expect(description).toHaveCSS('user-select', 'text');
        await description.fill(
          'Keep this report text editable and selectable.',
        );
        expect(
          await description.evaluate((element: HTMLTextAreaElement) => {
            element.setSelectionRange(0, 4);
            return element.value.slice(
              element.selectionStart,
              element.selectionEnd,
            );
          }),
        ).toBe('Keep');
        await description.blur();
        await dialog.locator('.dialog-content').evaluate((content) => {
          content.scrollTop = 0;
        });
        await expect(submit).not.toBeInViewport();
        if (browserName === 'chromium') {
          const cdp = await page.context().newCDPSession(page);
          for (let swipe = 0; swipe < 4; swipe++) {
            await cdp.send('Input.dispatchTouchEvent', {
              type: 'touchStart',
              touchPoints: [{ x: 325, y: 450, id: 1 }],
            });
            for (let y = 425; y >= 200; y -= 25) {
              await cdp.send('Input.dispatchTouchEvent', {
                type: 'touchMove',
                touchPoints: [{ x: 325, y, id: 1 }],
              });
              await page.waitForTimeout(30);
            }
            await cdp.send('Input.dispatchTouchEvent', {
              type: 'touchEnd',
              touchPoints: [],
            });
          }
        } else {
          await submit.evaluate((element) => {
            for (
              let parent = element.parentElement;
              parent;
              parent = parent.parentElement
            ) {
              if (
                getComputedStyle(parent).overflowY === 'auto' &&
                parent.scrollHeight > parent.clientHeight
              ) {
                parent.scrollTop = parent.scrollHeight;
                return;
              }
            }
            throw new Error('The report has no scrollable container.');
          });
        }
        await expect(submit).toBeInViewport();
        await expect(close).toBeInViewport();
        expect(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= window.innerWidth,
          ),
        ).toBe(true);
        await close.tap();
        await expect(dialog).not.toBeVisible();
        expect(errors).toEqual([]);
      } finally {
        await context.close();
        if (browserName === 'webkit') await engine.close();
      }
    });
  });
}

test('reports the live native avatar position and a normalized photo without a GitHub login', async ({
  page,
}) => {
  test.setTimeout(180000);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.addInitScript(() => {
    window.turnstile = {
      render(_element, options) {
        options.callback('browser-test-human');
        return 'widget';
      },
      remove() {
        return undefined;
      },
      reset() {
        return undefined;
      },
    };
  });
  let submitted:
    | {
        avatar: { x: number; z: number };
        gps: unknown;
        consent: boolean;
        revision: string;
      }
    | undefined;
  await page.route('https://reports.test/reports', async (route) => {
    const request = route.request();
    const form = await new Request(request.url(), {
      method: 'POST',
      headers: request.headers(),
      body: request.postDataBuffer(),
    }).formData();
    const metadata = JSON.parse(String(form.get('report')));
    submitted = metadata;
    const image = form.get('photo');
    expect(image).toBeInstanceOf(File);
    if (!(image instanceof File)) throw new Error('Missing normalized photo.');
    expect(image.type).toBe('image/jpeg');
    expect(image.size).toBeLessThanOrEqual(256 * 1024);
    const bytes = new Uint8Array(await image.arrayBuffer());
    expect([...bytes.slice(0, 2)]).toEqual([255, 216]);
    await route.fulfill({
      status: 202,
      contentType: 'application/json',
      body: JSON.stringify({ id: metadata.id, received: true }),
    });
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Enter Vyšehrad' }).click();
  await page.getByRole('button', { name: 'Mute sounds' }).waitFor();
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
  const expected = await cdp.send('Runtime.callFunctionOn', {
    objectId: objects.objectId,
    functionDeclaration:
      'function(){const w=this.find(w=>!w.disposed);return {x:w.position.x,z:w.position.z};}',
    returnByValue: true,
  });
  await page
    .getByRole('button', { name: 'Report / contribute a photo' })
    .click();
  await page
    .getByLabel('Describe the location and what should change')
    .fill('Browser regression: the chapel bank needs a correction.');
  const base64 = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 8;
    canvas.height = 8;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('No canvas.');
    context.fillStyle = '#809457';
    context.fillRect(0, 0, 8, 8);
    return canvas.toDataURL('image/png').split(',')[1];
  });
  await page.getByLabel('Take or choose a real-world photo').setInputFiles({
    name: 'reference.png',
    mimeType: 'image/png',
    buffer: Buffer.from(base64, 'base64'),
  });
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Send report privately' }).click();
  await expect(page.getByText('Report received. Thank you!')).toBeVisible();
  expect(submitted?.avatar.x).toBeCloseTo(expected.result.value.x, 8);
  expect(submitted?.avatar.z).toBeCloseTo(expected.result.value.z, 8);
  expect(submitted?.gps).toBeNull();
  expect(submitted?.consent).toBe(true);
  expect(errors).toEqual([]);
});
