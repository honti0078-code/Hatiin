import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

/**
 * Local UI smoke suite (no wallet, no on-chain). Asserts the real shipped
 * behaviour: a connect-optional landing, a connect-gated dashboard with a clean
 * empty state, and the create form (XLM is the default settlement asset). The
 * full on-chain flow with the real Freighter extension lives in prod-real.spec.ts.
 */

test.describe('Landing page', () => {
  test('shows tagline and CTA', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByText('Split bills with friends')).toBeVisible();
    await expect(page.getByRole('link', { name: /Split a Bill Now/i })).toBeVisible();
  });

  test('no critical a11y violations', async ({ page }) => {
    await page.goto('/');
    const results = await new AxeBuilder({ page }).analyze();
    const critical = results.violations.filter((v) => v.impact === 'critical');
    expect(critical.length).toBe(0);
  });

  test('mobile 375px: no horizontal scroll', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto('/');
    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    expect(scrollWidth).toBeLessThanOrEqual(380);
  });

  test('mobile 375px: CTA visible without scroll', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto('/');
    const cta = page.getByRole('link', { name: /Split a Bill Now/i }).first();
    await expect(cta).toBeVisible();
  });
});

test.describe('Dashboard (unconnected)', () => {
  test('shows the no-wallet empty state with a clear prompt', async ({ page }) => {
    await page.goto('/dashboard');
    await page.waitForLoadState('load');
    await expect(page.getByText(/no wallet required/i).first()).toBeVisible();
    await expect(page.getByRole('link', { name: /Create a Bill/i }).first()).toBeVisible();
  });

  test('does not show any seeded/fake bills', async ({ page }) => {
    await page.goto('/dashboard');
    await page.waitForLoadState('load');
    const billLinks = await page.locator('a[href^="/bills/"]').count();
    expect(billLinks).toBe(0);
  });
});

test.describe('Create bill page', () => {
  test('shows form fields with XLM as the default asset', async ({ page }) => {
    await page.goto('/dashboard/create');
    await expect(page.getByPlaceholder('e.g. Team lunch')).toBeVisible();
    await expect(page.getByText('Total amount (XLM)')).toBeVisible();
    await expect(page.getByRole('heading', { name: /Participants/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /Create Bill/i })).toBeVisible();
  });

  test('shows per-person share estimate in XLM', async ({ page }) => {
    await page.goto('/dashboard/create');
    await page.fill('input[placeholder="35.00"]', '40');
    await expect(page.getByText(/40.00 XLM per person/)).toBeVisible();
  });

  test('switching to USDC re-labels the amount and reveals Enable USDC', async ({ page }) => {
    await page.goto('/dashboard/create');
    await page.getByRole('button', { name: /Stablecoin · needs trustline/i }).click();
    await expect(page.getByText('Total amount (USDC)')).toBeVisible();
    await expect(page.getByRole('heading', { name: /Enable USDC on your wallet/i })).toBeVisible();
  });

  test('validates required fields', async ({ page }) => {
    await page.goto('/dashboard/create');
    await page.click('button[type="submit"]');
    await expect(page.getByText('Title is required')).toBeVisible();
  });
});
