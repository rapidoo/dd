import { expect, test } from '@playwright/test';

test.describe('Design catalog', () => {
  test('lists every UI primitive on /design', async ({ page }) => {
    await page.goto('/design');
    await expect(page.getByRole('heading', { name: 'Design system' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Palette' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Boutons' })).toBeVisible();
    await expect(page.getByRole('heading', { name: /dés animés/i })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Statistiques' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Messages' })).toBeVisible();
    // representative controls
    await expect(page.getByRole('button', { name: /d20 attaque/i })).toBeVisible();
    await expect(page.getByRole('button', { name: 'd20 crit' })).toBeVisible();
    await expect(page.getByRole('button', { name: /2d8 dégâts/i })).toBeVisible();
  });

  test('triggers a crit dice roll and shows the total', async ({ page }) => {
    await page.goto('/design');
    await page.getByRole('button', { name: 'd20 crit' }).click();
    // overlay label appears
    await expect(page.getByText(/JET D'ATTAQUE/i)).toBeVisible();
    // final total after ~1s animation (20 + 5)
    await expect(page.getByText('25', { exact: true })).toBeVisible({ timeout: 4000 });
    await expect(page.getByText(/critique/i).first()).toBeVisible();
  });
});
