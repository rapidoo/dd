'use client';

import { useTransition } from 'react';
import { deleteCampaign } from '../../lib/server/campaigns';

export function DeleteCampaignButton({
  campaignId,
  campaignName,
}: {
  campaignId: string;
  campaignName: string;
}) {
  const [isPending, startTransition] = useTransition();

  function onClick(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (
      !confirm(
        `Supprimer la campagne « ${campaignName} » ? Tous les personnages, sessions et messages seront perdus. Cette action est irréversible.`,
      )
    ) {
      return;
    }
    startTransition(async () => {
      const res = await deleteCampaign(campaignId);
      if (!res.ok) {
        alert(`Suppression échouée : ${res.error}`);
      }
    });
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={isPending}
      aria-label={`Supprimer ${campaignName}`}
      title="Supprimer cette campagne"
      className="absolute top-2 right-2 z-10 flex h-7 w-7 items-center justify-center border border-line bg-bg-deep/80 text-[12px] text-text-mute transition-colors hover:border-blood hover:text-blood disabled:opacity-50"
    >
      ✕
    </button>
  );
}
