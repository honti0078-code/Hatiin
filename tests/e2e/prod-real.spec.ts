import path from 'node:path';
import {
  type BrowserContext,
  chromium,
  expect,
  type Locator,
  type Page,
  test,
} from '@playwright/test';
import {
  approveOnce,
  cleanup,
  FREIGHTER,
  launchWithFreighter,
  onboardFreighter,
} from '../../../../../shared/freighter/freighter-fixture';

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? 'https://hatiin.vercel.app';
const SHOTS = path.resolve(__dirname, '..', '..', '..', 'screen-shot');
const PUB = FREIGHTER.deployerPublic;
const JPEG = { type: 'jpeg' as const, quality: 85 };
const shotPath = (name: string) => path.join(SHOTS, name);

type SubmitResult = { ok?: boolean; data?: { txHash?: string }; error?: { message?: string } };

test.describe.configure({ mode: 'serial' });

let context: BrowserContext;
let userDataDir: string;

test.beforeAll(async () => {
  const launched = await launchWithFreighter(chromium);
  context = launched.context;
  userDataDir = launched.userDataDir;
  await onboardFreighter(context);
});

test.afterAll(async () => {
  if (context) await cleanup(context, userDataDir);
});

async function shootPage(page: Page, name: string) {
  await page.screenshot({ path: shotPath(name), ...JPEG });
}

async function shootPopup(popup: Page, name: string) {
  await popup.waitForLoadState('domcontentloaded').catch(() => {});
  await popup.waitForTimeout(1500);
  await popup.screenshot({ path: shotPath(name), ...JPEG }).catch(() => {});
}

async function connectViaGrantPopup(page: Page, popupShot: string) {
  const connectBtn = page.getByRole('button', { name: /Connect Wallet/i }).first();
  await expect(connectBtn).toBeVisible({ timeout: 20_000 });
  const popupArrived = context.waitForEvent('page', { timeout: 60_000 });
  await connectBtn.click();
  const popup = await popupArrived;
  await shootPopup(popup, popupShot);
  await approveOnce(context, { timeout: 60_000 });
  await page.waitForTimeout(2500);
}

async function createUsdcBill(page: Page): Promise<{ billId: string; participantId: string }> {
  await page.goto(`${BASE_URL}/dashboard/create`, { waitUntil: 'domcontentloaded' });
  await expect(page.getByPlaceholder('e.g. Team lunch')).toBeVisible({ timeout: 20_000 });
  await page.getByRole('button', { name: /Stablecoin · needs trustline/i }).click();
  await page.fill('input[placeholder="Your Stellar address where you get paid (G...)"]', PUB);
  await page.fill('input[placeholder="e.g. Team lunch"]', 'Real-Freighter prod-real (USDC)');
  await page.fill('input[placeholder="35.00"]', '1');
  await page.fill('input[placeholder="Display name"]', 'Deployer');
  await page.fill('input[placeholder="Stellar wallet address (G...)"]', PUB);

  const createResp = page.waitForResponse(
    (r) => r.url().endsWith('/api/bills') && r.request().method() === 'POST',
  );
  await page.getByRole('button', { name: /Create Bill/i }).click();
  const created = await (await createResp).json();
  expect(created.ok).toBeTruthy();
  const billId: string = created.data.bill.id;
  const participantId: string = created.data.bill.participants.find(
    (p: { publicKey: string }) => p.publicKey === PUB,
  ).id;
  await page.waitForURL(new RegExp(`/bills/${billId}`), { timeout: 20_000 });
  return { billId, participantId };
}

async function attemptPay(
  page: Page,
  payBtn: Locator,
  signPopupShot: string | null,
): Promise<{ submit: SubmitResult; settled: boolean }> {
  const submit = page
    .waitForResponse((r) => r.url().includes('/pay/submit') && r.request().method() === 'POST', {
      timeout: 150_000,
    })
    .then((r) => r.json() as Promise<SubmitResult>)
    .catch(() => ({}) as SubmitResult);

  const popupArrived = context.waitForEvent('page', { timeout: 90_000 });
  await payBtn.click();
  const popup = await popupArrived;
  if (signPopupShot) await shootPopup(popup, signPopupShot);
  await approveOnce(context, { timeout: 90_000 });

  const settled = await page
    .getByText('Payment sent!')
    .waitFor({ state: 'visible', timeout: 120_000 })
    .then(() => true)
    .catch(() => false);
  return { submit: await submit, settled };
}

async function payShareViaSignPopup(
  page: Page,
  billId: string,
  participantId: string,
  popupShot: string,
): Promise<SubmitResult> {
  await page.goto(`${BASE_URL}/pay/${billId}/${participantId}`, { waitUntil: 'domcontentloaded' });
  const payBtn = page.getByRole('button', { name: /Pay .* USDC with Freighter/i });
  await expect(payBtn).toBeVisible({ timeout: 20_000 });
  await shootPage(page, '03-pay-screen.jpg');

  let last: SubmitResult = {};
  for (let attempt = 0; attempt < 3; attempt++) {
    const { submit, settled } = await attemptPay(page, payBtn, attempt === 0 ? popupShot : null);
    last = submit;
    if (settled && submit.ok && submit.data?.txHash) {
      await page.waitForTimeout(1000);
      await shootPage(page, '05-pay-success.jpg');
      return submit;
    }
    await expect(payBtn).toBeEnabled({ timeout: 30_000 });
    await page.waitForTimeout(2000);
  }
  return last;
}

async function assertExplorerLink(page: Page, txHash: string) {
  const explorer = page.getByRole('link', { name: new RegExp(txHash.slice(0, 6)) });
  await expect(explorer.first()).toHaveAttribute(
    'href',
    new RegExp(`stellar\\.expert/explorer/testnet/tx/${txHash}`),
  );
}

async function captureStats(page: Page) {
  await page.goto(`${BASE_URL}/stats`, { waitUntil: 'domcontentloaded' });
  await expect(page.getByText('Unique wallet users')).toBeVisible({ timeout: 20_000 });
  await page.waitForTimeout(1000);
  await shootPage(page, '06-stats.jpg');
}

async function captureMobileLanding() {
  const mobile = await context.newPage();
  await mobile.setViewportSize({ width: 375, height: 812 });
  await mobile.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
  await mobile.waitForTimeout(2000);
  await shootPage(mobile, '07-mobile.jpg');
  await mobile.close();
}

test('real Freighter: connect grant popup + on-chain sign popup -> real tx hash', async () => {
  test.setTimeout(300_000);
  const page = await context.newPage();

  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2000);
  await shootPage(page, '01-landing.jpg');

  await connectViaGrantPopup(page, '02-freighter-connect.jpg');

  const { billId, participantId } = await createUsdcBill(page);
  const submit = await payShareViaSignPopup(page, billId, participantId, '04-freighter-sign.jpg');

  expect(submit.ok, `pay submit failed: ${submit.error?.message}`).toBeTruthy();
  const txHash = submit.data?.txHash;
  expect(txHash, 'real tx hash present').toBeTruthy();
  await assertExplorerLink(page, txHash as string);

  await captureStats(page);
  await captureMobileLanding();

  // biome-ignore lint/suspicious/noConsole: surface the real tx hash for the run report
  console.log('PROD_REAL_TX_HASH=' + txHash);
});
