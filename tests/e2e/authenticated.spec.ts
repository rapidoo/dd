import { expect, test } from '@playwright/test';
import { ensureTestUser, signInTestUser } from './helpers/auth';

const USER = {
  email: 'e2e-player@detd.test',
  password: 'Tt3st-Str0ng-Pass!',
};

test.describe('Authenticated flows', () => {
  test.beforeAll(async () => {
    await ensureTestUser(USER.email, USER.password);
  });

  test.beforeEach(async ({ context, request, baseURL }) => {
    if (!baseURL) throw new Error('baseURL is required');
    const user = await ensureTestUser(USER.email, USER.password);
    await signInTestUser(request, context, baseURL, user);
  });

  test('dashboard greets the logged-in user and can reach campaign creation', async ({
    page,
  }) => {
    await page.goto('/dashboard');
    await expect(page.getByRole('heading', { name: /bonjour/i })).toBeVisible();
    await expect(page.getByRole('heading', { name: /tes campagnes/i })).toBeVisible();
    await page.getByRole('link', { name: /nouvelle campagne/i }).click();
    await expect(page).toHaveURL(/\/campaigns\/new$/);
    await expect(page.getByRole('heading', { name: 'Nouvelle campagne' })).toBeVisible();
  });

  test('creates a campaign, then a character, lands on the campaign hub', async ({ page }) => {
    await page.goto('/campaigns/new');
    const campaignName = `Campagne e2e ${Date.now()}`;
    await page.getByPlaceholder('Ex. La Bibliothèque de Cire').fill(campaignName);
    await page.getByRole('button', { name: /allumer le feu/i }).click();

    // Redirected to /campaigns/[id]
    await expect(page).toHaveURL(/\/campaigns\/[0-9a-f-]{10,}/);
    await expect(page.getByRole('heading', { name: campaignName })).toBeVisible();

    // Create a character
    await page.getByRole('link', { name: /créer un personnage/i }).click();
    await expect(page.getByRole('heading', { name: 'Nouveau personnage' })).toBeVisible();

    const charName = `Elspeth ${Date.now()}`;
    await page.getByPlaceholder('Elspeth Courtecire').fill(charName);
    // Default class=fighter, species=human; skills + preview visible
    await expect(page.getByText(/Aperçu/i)).toBeVisible();

    await page.getByRole('button', { name: /forger le personnage/i }).click();

    // Back to campaign hub
    await expect(page).toHaveURL(/\/campaigns\/[0-9a-f-]{10,}$/);
    await expect(page.getByRole('heading', { name: campaignName })).toBeVisible();

    // Sheet page shows the character
    await page.getByRole('link', { name: /Fiche/i }).click();
    await expect(page.getByRole('heading', { name: charName })).toBeVisible();
    await expect(page.getByText(/Points de vie/i)).toBeVisible();
    await expect(page.getByText(/Classe d'armure/i)).toBeVisible();
  });
});
