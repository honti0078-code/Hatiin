import { chromium } from 'playwright';
import path from 'node:path';

const BASE = 'http://localhost:3002';
const SCREENSHOT_DIR = path.resolve(__dirname, '../../screen-shot');

const BILL_SETTLED = 'fed1135b-855c-43d0-a2a6-d658427d48f7';
const BILL_SETTLING = '90247b36-58ba-4a2a-9501-0dcaec1b46de';
const BILL_OPEN = '06969111-5cef-4f51-8fd1-61f1c9bb5672';
const PARTICIPANT_ID = '95080ff5-658f-4525-bc0f-ed6fbd183126';

async function screenshot(page: any, url: string, filename: string, mobile = false) {
  if (mobile) {
    await page.setViewportSize({ width: 375, height: 812 });
  } else {
    await page.setViewportSize({ width: 1280, height: 900 });
  }
  await page.goto(`${BASE}${url}`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1500);
  const file = path.join(SCREENSHOT_DIR, filename);
  await page.screenshot({ path: file, fullPage: false });
  console.log(`✅ ${filename}`);
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  // 01 — Landing
  await screenshot(page, '/', '01-landing.png');

  // 02 — Bills grid (dashboard)
  await screenshot(page, '/dashboard', '02-bills-grid.png');

  // 03 — Bill detail (settling: 2 paid, 1 pending)
  await screenshot(page, `/bills/${BILL_SETTLING}`, '03-bill-detail.png');

  // 04 — Settled bill (all green pills)
  await screenshot(page, `/bills/${BILL_SETTLED}`, '04-settled-bill.png');

  // 05 — Individual pay page
  await screenshot(page, `/pay/${BILL_OPEN}/${PARTICIPANT_ID}`, '05-pay-page.png');

  // 06 — Mobile (375px) dashboard
  await screenshot(page, '/dashboard', '06-mobile.png', true);

  await browser.close();
  console.log('\n🎉 All screenshots saved to screen-shot/');
}

main().catch(console.error);
