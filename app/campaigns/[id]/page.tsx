import Link from 'next/link';
import { notFound } from 'next/navigation';
import { BtnPrimary } from '../../../components/ui/button';
import { requireUser } from '../../../lib/server/auth';
import { getCampaign } from '../../../lib/server/campaigns';

type Params = { id: string };

export default async function CampaignPage({ params }: { params: Promise<Params> }) {
  await requireUser();
  const { id } = await params;
  const campaign = await getCampaign(id);
  if (!campaign) notFound();

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-4xl flex-col gap-8 px-6 py-12 text-text">
      <Link
        href="/dashboard"
        className="text-xs uppercase tracking-widest text-text-mute hover:text-gold"
      >
        ← Retour au foyer
      </Link>

      <header>
        <p className="font-display text-xs uppercase tracking-[0.3em] text-gold">Campagne</p>
        <h1 className="font-narr text-4xl text-gold-bright">{campaign.name}</h1>
        {campaign.setting_pitch && (
          <p className="mt-3 max-w-2xl font-narr text-base italic text-text-mid">
            {campaign.setting_pitch}
          </p>
        )}
      </header>

      <section className="border border-dashed border-line bg-card p-6">
        <p className="font-narr text-lg italic text-text-mute">
          Les personnages et sessions apparaîtront ici — prochains sprints.
        </p>
        <div className="mt-4 flex gap-3">
          <Link href={`/campaigns/${campaign.id}/characters/new`}>
            <BtnPrimary icon="⚜">Créer un personnage</BtnPrimary>
          </Link>
        </div>
      </section>
    </main>
  );
}
