import { defineConfig } from '@playwright/test';

// Canonical real-Freighter config: the actual extension against the LIVE
// deployment. The spec launches its OWN Chromium persistent context (headed,
// extension loaded) via the shared fixture, so NO `projects`/browser device is
// needed here and there is NO local webServer. Must run under xvfb (headed).
export default defineConfig({
  testDir: './tests/e2e',
  testMatch: /prod-real\.spec\.ts/,
  fullyParallel: false,
  forbidOnly: false,
  retries: 0,
  workers: 1,
  timeout: 300_000,
  reporter: [['list']],
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? 'https://hatiin.vercel.app',
  },
});
