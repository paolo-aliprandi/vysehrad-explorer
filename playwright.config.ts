import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  timeout: 90000,
  expect: { timeout: 15000 },
  workers: 1,
  use: {
    baseURL: 'http://127.0.0.1:5174',
    viewport: { width: 1440, height: 1000 },
    browserName: 'chromium',
    launchOptions: {
      args:
        process.platform === 'darwin'
          ? ['--use-angle=metal']
          : ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
    },
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  webServer: {
    env: {
      VITE_REPORT_API_URL: 'https://reports.test',
      VITE_TURNSTILE_SITE_KEY: 'browser-test-key',
    },
    command: 'npm start -- --port 5174',
    url: 'http://127.0.0.1:5174',
    reuseExistingServer: false,
    timeout: 60000,
  },
});
