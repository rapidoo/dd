import { expect, test } from '@playwright/test';
import { ensureTestUser, signInTestUser } from './helpers/auth';
import { ensureCampaignWithCharacter } from './helpers/campaign';

const USER = { email: 'e2e-player@detd.test', password: 'Tt3st-Str0ng-Pass!' };

test.describe('Team page', () => {
  test('creates a companion and lists it', async ({ context, request, baseURL, page }) => {
    if (!baseURL) throw new Error('baseURL is required');
    const user = await ensureTestUser(USER.email, USER.password);
    await signInTestUser(request, context, baseURL, user);
    const { campaignId } = await ensureCampaignWithCharacter(user.userId);

    await page.goto(`/campaigns/${campaignId}/team`);
    await expect(page.getByRole('heading', { name: 'Ton équipe' })).toBeVisible();

    const name = `Dorn ${Date.now()}`;
    await page.getByPlaceholder('Dorn Ferrecoeur').fill(name);
    await page
      .getByPlaceholder(/Nain bourru/)
      .fill('Nain bourru mais loyal. Prend les coups en premier.');
    await page.getByRole('button', { name: /recruter/i }).click();

    // After form submission, the page re-renders with the new companion card
    await expect(page.getByRole('heading', { name })).toBeVisible();
    await expect(page.getByText(/nain bourru mais loyal/i).first()).toBeVisible();
  });
});
