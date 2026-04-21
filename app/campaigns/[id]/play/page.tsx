import { notFound } from 'next/navigation';
import { createSupabaseServerClient } from '../../../../lib/db/server';
import type { CharacterRow } from '../../../../lib/db/types';
import { requireUser } from '../../../../lib/server/auth';
import { getCampaign } from '../../../../lib/server/campaigns';
import { ensureSession, loadSession } from '../../../../lib/server/sessions';
import { PlayClient } from './play-client';

export const dynamic = 'force-dynamic';

export default async function PlayPage({ params }: { params: Promise<{ id: string }> }) {
  await requireUser();
  const { id } = await params;
  const campaign = await getCampaign(id);
  if (!campaign) notFound();

  const session = await ensureSession(campaign.id);
  const loaded = await loadSession(session.id);

  const supabase = await createSupabaseServerClient();
  const { data: characters } = await supabase
    .from('characters')
    .select('*')
    .eq('campaign_id', campaign.id)
    .order('created_at', { ascending: true });
  const player = (characters ?? []).find((c: CharacterRow) => !c.is_ai) ?? null;

  return (
    <PlayClient
      campaignName={campaign.name}
      sessionId={session.id}
      sessionNumber={session.session_number}
      initialMessages={loaded.messages}
      player={player}
    />
  );
}
