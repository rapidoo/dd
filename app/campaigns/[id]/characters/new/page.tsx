import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireUser } from '../../../../../lib/server/auth';
import { getCampaign } from '../../../../../lib/server/campaigns';
import type { Universe } from '../../../../../lib/db/types';
import { NewCharacterForm } from './new-character-form';

export default async function NewCharacterPage({ params }: { params: Promise<{ id: string }> }) {
  await requireUser();
  const { id } = await params;
  const campaign = await getCampaign(id);
  if (!campaign) notFound();

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-4xl flex-col gap-8 px-6 py-12 text-text">
      <Link
        href={`/campaigns/${id}`}
        className="text-xs uppercase tracking-widest text-text-mute hover:text-gold"
      >
        ← Retour à la campagne
      </Link>

      <header>
        <p className="font-display text-xs uppercase tracking-[0.3em] text-gold">{campaign.name}</p>
        <h1 className="font-narr text-4xl text-gold-bright">Nouveau personnage</h1>
        <p className="mt-2 max-w-xl text-sm text-text-mute">
          Définis les bases de ton personnage. Les PV max, la CA, les emplacements de sorts et les
          bonus sont calculés côté serveur à partir de ces choix.
        </p>
      </header>

      <NewCharacterForm campaignId={id} universe={campaign.universe ?? 'dnd5e'} />
    </main>
  );
}
