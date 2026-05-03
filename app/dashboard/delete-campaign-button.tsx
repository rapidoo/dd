'use client';

import { useEffect, useState, useTransition } from 'react';
import { BtnGhost } from '../../components/ui/button';
import { deleteCampaign } from '../../lib/server/campaigns';

export function DeleteCampaignButton({
  campaignId,
  campaignName,
}: {
  campaignId: string;
  campaignName: string;
}) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function openModal(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    setError(null);
    setOpen(true);
  }

  function close() {
    if (isPending) return;
    setOpen(false);
  }

  function confirm() {
    setError(null);
    startTransition(async () => {
      const res = await deleteCampaign(campaignId);
      if (res.ok) {
        setOpen(false);
      } else {
        setError(res.error);
      }
    });
  }

  // Esc closes the modal (no-op if a delete is in flight).
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isPending) setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, isPending]);

  return (
    <>
      <button
        type="button"
        onClick={openModal}
        aria-label={`Supprimer ${campaignName}`}
        title="Supprimer cette campagne"
        className="absolute top-2 right-2 z-10 flex h-7 w-7 items-center justify-center border border-line bg-bg-deep/80 text-[12px] text-text-mute transition-colors hover:border-blood hover:text-blood"
      >
        ✕
      </button>

      {open && (
        <DeleteCampaignModal
          campaignName={campaignName}
          isPending={isPending}
          error={error}
          onCancel={close}
          onConfirm={confirm}
        />
      )}
    </>
  );
}

function DeleteCampaignModal({
  campaignName,
  isPending,
  error,
  onCancel,
  onConfirm,
}: {
  campaignName: string;
  isPending: boolean;
  error: string | null;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center px-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="delete-campaign-title"
    >
      <button
        type="button"
        aria-label="Fermer"
        onClick={onCancel}
        className="absolute inset-0 cursor-default bg-bg-deep/85 backdrop-blur-sm"
      />
      <div
        className="relative w-full max-w-md border border-line bg-card p-6 shadow-[0_30px_80px_rgba(0,0,0,0.6)]"
        style={{
          background: 'linear-gradient(180deg, rgba(20,16,10,0.95) 0%, rgba(12,9,6,0.95) 100%)',
        }}
      >
        <div
          aria-hidden
          className="pointer-events-none absolute -top-px left-0 right-0 h-px bg-gradient-to-r from-transparent via-gold/60 to-transparent"
        />

        <div className="flex items-start gap-4">
          <div
            aria-hidden
            className="flex h-12 w-12 shrink-0 items-center justify-center border border-blood/60 bg-blood/10 font-display text-2xl text-blood"
          >
            ⚠
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-display text-[10px] uppercase tracking-[0.3em] text-blood/80">
              Action irréversible
            </p>
            <h2 id="delete-campaign-title" className="mt-1 font-narr text-2xl text-gold-bright">
              Souffler cette flamme ?
            </h2>
          </div>
        </div>

        <div className="mt-5 space-y-3 font-narr text-sm text-text-mid">
          <p>
            La campagne{' '}
            <span className="font-display text-gold-bright">«&nbsp;{campaignName}&nbsp;»</span> va
            être effacée pour de bon.
          </p>
          <p className="text-text-mute">
            Personnages, sessions, messages, jets et inventaires partiront avec elle. Aucun retour
            en arrière.
          </p>
        </div>

        {error && (
          <p className="mt-4 border border-blood/40 bg-blood/10 px-3 py-2 text-xs text-blood">
            ⚠ {error}
          </p>
        )}

        <div className="mt-6 flex items-center justify-end gap-3">
          <BtnGhost type="button" onClick={onCancel} disabled={isPending}>
            Annuler
          </BtnGhost>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isPending}
            className="inline-flex cursor-pointer items-center gap-2 border border-blood/70 bg-gradient-to-b from-blood to-[#5a1810] px-[18px] py-[10px] font-ui text-[13px] font-semibold tracking-wide text-text shadow-[0_2px_0_rgba(0,0,0,0.5)] transition-colors hover:from-[#a13028] hover:to-blood disabled:cursor-not-allowed disabled:opacity-60"
          >
            <span aria-hidden>✕</span>
            {isPending ? 'Effacement…' : 'Supprimer'}
          </button>
        </div>
      </div>
    </div>
  );
}
