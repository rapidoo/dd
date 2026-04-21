import { requireUser } from '../../../lib/server/auth';
import { NewCampaignForm } from './new-campaign-form';

export default async function NewCampaignPage() {
  await requireUser();
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-2xl flex-col gap-8 px-6 py-12 text-text">
      <header>
        <p className="font-display text-xs uppercase tracking-[0.3em] text-gold">Allumer le feu</p>
        <h1 className="font-narr text-4xl text-gold-bright">Nouvelle campagne</h1>
        <p className="mt-2 max-w-lg text-sm text-text-mute">
          Choisis la nature du monde dans lequel jouer. Le MJ IA et les compagnons adapteront leur
          ton en fonction.
        </p>
      </header>

      <NewCampaignForm />
    </main>
  );
}
