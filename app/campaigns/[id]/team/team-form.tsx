'use client';

import { useActionState } from 'react';
import { BtnPrimary } from '../../../../components/ui/button';
import type { CharacterRow } from '../../../../lib/db/types';
import { CLASSES, SPECIES } from '../../../../lib/rules/srd';
import type { ServerResult } from '../../../../lib/server/campaigns';
import { createCompanion } from '../../../../lib/server/companions';

export function TeamForm({ campaignId }: { campaignId: string }) {
  const [state, formAction] = useActionState<ServerResult<CharacterRow> | null, FormData>(
    createCompanion,
    null,
  );

  return (
    <form action={formAction} className="grid gap-4 md:grid-cols-2">
      <input type="hidden" name="campaignId" value={campaignId} />
      <label className="flex flex-col gap-1 text-xs uppercase tracking-[0.2em] text-text-mute">
        Nom
        <input
          name="name"
          type="text"
          required
          maxLength={80}
          className="rounded-none border border-line bg-[rgba(0,0,0,0.4)] px-3 py-2 font-narr text-lg text-text outline-none focus:border-gold"
          placeholder="Dorn Ferrecoeur"
        />
      </label>
      <label className="flex flex-col gap-1 text-xs uppercase tracking-[0.2em] text-text-mute">
        Espèce
        <select
          name="speciesId"
          defaultValue="dwarf"
          className="rounded-none border border-line bg-[rgba(0,0,0,0.4)] px-3 py-2 font-narr text-base text-text outline-none focus:border-gold"
        >
          {Object.values(SPECIES).map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1 text-xs uppercase tracking-[0.2em] text-text-mute">
        Classe
        <select
          name="classId"
          defaultValue="fighter"
          className="rounded-none border border-line bg-[rgba(0,0,0,0.4)] px-3 py-2 font-narr text-base text-text outline-none focus:border-gold"
        >
          {Object.values(CLASSES).map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1 text-xs uppercase tracking-[0.2em] text-text-mute md:col-span-2">
        Personnalité (ton, voix, particularités)
        <textarea
          name="persona"
          required
          maxLength={600}
          rows={3}
          className="rounded-none border border-line bg-[rgba(0,0,0,0.4)] px-3 py-2 font-narr text-base text-text outline-none focus:border-gold"
          placeholder="Nain bourru mais loyal. Agit avant de parler. Prend les coups en premier et reproche ensuite."
        />
      </label>
      {state && !state.ok && <p className="text-sm text-blood md:col-span-2">{state.error}</p>}
      <div className="md:col-span-2 flex justify-end">
        <BtnPrimary type="submit" icon="◉">
          Recruter
        </BtnPrimary>
      </div>
    </form>
  );
}
