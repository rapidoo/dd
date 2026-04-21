import { expect, test } from '@playwright/test';
import { ensureTestUser, signInTestUser } from './helpers/auth';
import { ensureCampaignWithCharacter } from './helpers/campaign';

const USER = { email: 'e2e-player@detd.test', password: 'Tt3st-Str0ng-Pass!' };

function makeSseBody(events: Array<{ event: string; data: unknown }>): string {
  return events.map((e) => `event: ${e.event}\ndata: ${JSON.stringify(e.data)}\n\n`).join('');
}

test.describe('Session play page', () => {
  test('streams a mocked GM reply and renders a dice overlay', async ({
    context,
    request,
    baseURL,
    page,
  }) => {
    if (!baseURL) throw new Error('baseURL is required');
    const user = await ensureTestUser(USER.email, USER.password);
    await signInTestUser(request, context, baseURL, user);
    const { campaignId } = await ensureCampaignWithCharacter(user.userId);

    // Intercept the SSE stream so tests stay offline.
    await page.route(/\/api\/sessions\/[^/]+\/stream/, async (route) => {
      const body = makeSseBody([
        { event: 'delta', data: { text: 'Les bougies ' } },
        { event: 'delta', data: { text: 'crépitent longuement.' } },
        {
          event: 'dice',
          data: {
            dice: [14],
            modifier: 3,
            total: 17,
            kind: 'check',
            outcome: 'success',
            advantage: 'normal',
            expression: '1d20+3',
          },
        },
        { event: 'done', data: { length: 30 } },
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

    await page.goto(`/campaigns/${campaignId}/play`);

    // Scene header
    await expect(
      page
        .locator('header')
        .filter({ hasText: /Session/ })
        .first(),
    ).toBeVisible();

    // Player panel shows HP
    await expect(page.getByText('Points de vie').first()).toBeVisible();

    // Send a message
    await page.getByPlaceholder(/décris ce que tu fais/i).fill("J'entre doucement.");
    await page.getByRole('button', { name: /envoyer/i }).click();

    // User message echoed
    await expect(page.getByText("J'entre doucement.").first()).toBeVisible();

    // GM streamed text arrives
    await expect(page.getByText(/Les bougies crépitent longuement./i)).toBeVisible({
      timeout: 8000,
    });

    // Inline dice card rendered with total 17 + kind label
    await expect(page.getByText('17', { exact: true }).first()).toBeVisible({ timeout: 8000 });
    await expect(page.getByText(/TEST/).first()).toBeVisible();
  });
});
