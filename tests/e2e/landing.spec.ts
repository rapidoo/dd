import { expect, test } from '@playwright/test';

test.describe('Landing page', () => {
  test('renders the invitation and login form', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: /veiller autour du feu/i })).toBeVisible();
    await expect(page.getByRole('textbox', { name: /courriel/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /recevoir un lien/i })).toBeVisible();
  });

  test('requires an email before enabling submission', async ({ page }) => {
    await page.goto('/');
    const input = page.getByRole('textbox', { name: /courriel/i });
    await input.fill('pas-un-email');
    // browser-level validation blocks the submit, so the button stays in idle state
    await page.getByRole('button', { name: /recevoir un lien/i }).click();
    // input should be invalid — no transition to "sent"
    await expect(page.getByText(/lien magique file vers/i)).toHaveCount(0);
  });

  test('redirects to landing when visiting /dashboard unauthenticated', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page).toHaveURL('/');
  });
});
