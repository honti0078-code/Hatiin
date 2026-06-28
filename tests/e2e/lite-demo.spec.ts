import { chromium, test } from '@playwright/test';

test.use({ video: 'on', trace: 'off' });
test.setTimeout(90_000);

test('lite-demo', async () => {
  const browser = await chromium.launch({ headless: false, args: ['--no-sandbox'] });
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();
  await page.goto(process.env.PLAYWRIGHT_BASE_URL!, { waitUntil: 'domcontentloaded', timeout: 30_000 });
  await page.waitForTimeout(5000);
  await page.goto(process.env.PLAYWRIGHT_BASE_URL! + '/stats', { waitUntil: 'domcontentloaded', timeout: 20_000 }).catch(() => {});
  await page.waitForTimeout(3000);
  await page.close();
  await context.close();
  await browser.close();
});
