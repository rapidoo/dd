import { expect, test } from '@playwright/test';
import { ensureTestUser, signInTestUser } from './helpers/auth';
import { ensureCampaignWithCharacter } from './helpers/campaign';

const USER = { email: 'e2e-responsive@detd.test', password: 'Tt3st-Str0ng-Pass!' };

const VIEWPORTS = [
  { name: 'iphone-se', width: 375, height: 667 },
  { name: 'iphone-14', width: 393, height: 852 },
  { name: 'pixel-7', width: 412, height: 915 },
] as const;

function makeSseBody(events: Array<{ event: string; data: unknown }>): string {
  return events.map((e) => `event: ${e.event}\ndata: ${JSON.stringify(e.data)}\n\n`).join('');
}

test.describe('Responsive layouts — mobile viewports', () => {
  for (const vp of VIEWPORTS) {
    test(`landing (${vp.name} ${vp.width}×${vp.height})`, async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.goto('/');
      await expect(page.locator('body')).toBeVisible();

      // Horizontal overflow check
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow, `horizontal scroll on /`).toBeLessThanOrEqual(1);

      await page.screenshot({
        path: `test-results/responsive/landing-${vp.name}.png`,
        fullPage: true,
      });
    });

    test(`dashboard (${vp.name})`, async ({ context, request, baseURL, page }) => {
      if (!baseURL) throw new Error('baseURL required');
      const user = await ensureTestUser(USER.email, USER.password);
      await signInTestUser(request, context, baseURL, user);
      await ensureCampaignWithCharacter(user.userId);

      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.goto('/dashboard');
      await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();

      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow, `horizontal scroll on /dashboard`).toBeLessThanOrEqual(1);

      await page.screenshot({
        path: `test-results/responsive/dashboard-${vp.name}.png`,
        fullPage: true,
      });
    });

    test(`session play (${vp.name})`, async ({ context, request, baseURL, page }) => {
      if (!baseURL) throw new Error('baseURL required');
      const user = await ensureTestUser(USER.email, USER.password);
      await signInTestUser(request, context, baseURL, user);
      const { campaignId } = await ensureCampaignWithCharacter(user.userId);

      await page.route(/\/api\/sessions\/[^/]+\/stream/, async (route) => {
        const body = makeSseBody([
          { event: 'delta', data: { text: 'Le vent souffle. ' } },
          { event: 'done', data: { length: 15 } },
        ]);
        await route.fulfill({
          status: 200,
          headers: {
            'Content-Type': 'text/event-stream; charset=utf-8',
            'Cache-Control': 'no-cache, no-transform',
          },
          body,
        });
      });

      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.goto(`/campaigns/${campaignId}/play`);

      // Scene header or player HP should be visible
      await expect(
        page
          .locator('header')
          .filter({ hasText: /Session/ })
          .first(),
      ).toBeVisible({ timeout: 10_000 });

      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow, `horizontal scroll on play`).toBeLessThanOrEqual(1);

      // Input must be reachable AND wide enough to type in. A 72px sidebar
      // + 300px right panel crushes the chat column to ~0 on 375–412px.
      const input = page.getByPlaceholder(/décris ce que tu fais/i);
      await expect(input).toBeVisible();
      const box = await input.boundingBox();
      expect(box, 'input bounding box').not.toBeNull();
      if (box) {
        expect(box.x).toBeGreaterThanOrEqual(0);
        expect(box.x + box.width).toBeLessThanOrEqual(vp.width + 1);
        // A usable chat input needs at least ~200px. Below that, the layout
        // is broken on this viewport.
        expect(box.width, `chat input width on ${vp.name}`).toBeGreaterThan(200);
      }

      await page.screenshot({
        path: `test-results/responsive/play-${vp.name}.png`,
        fullPage: true,
      });
    });
  }
});
