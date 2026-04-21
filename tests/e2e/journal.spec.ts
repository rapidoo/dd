import { expect, test } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { ensureTestUser, signInTestUser } from './helpers/auth';
import { ensureCampaignWithCharacter } from './helpers/campaign';

const USER = { email: 'e2e-player@detd.test', password: 'Tt3st-Str0ng-Pass!' };

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? '',
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? '',
  { auth: { persistSession: false } },
);

test.describe('Journal + codex', () => {
  test('shows session history and recorded entities', async ({
    context,
    request,
    baseURL,
    page,
  }) => {
    if (!baseURL) throw new Error('baseURL is required');
    const user = await ensureTestUser(USER.email, USER.password);
    await signInTestUser(request, context, baseURL, user);
    const { campaignId } = await ensureCampaignWithCharacter(user.userId);

    // Seed a dummy entity so the codex has something to render
    const entityName = `Vieille Mireille ${Date.now()}`;
    await admin.from('entities').insert({
      campaign_id: campaignId,
      kind: 'npc',
      name: entityName,
      short_description: 'Femme aveugle qui tient une bougie.',
    });

    await page.goto(`/campaigns/${campaignId}/journal`);
    await expect(page.getByText(/chronique/i).first()).toBeVisible();
    await expect(page.getByText(/codex/i).first()).toBeVisible();
    await expect(page.getByText(entityName)).toBeVisible();
    await expect(page.getByText(/femme aveugle/i).first()).toBeVisible();
  });
});
