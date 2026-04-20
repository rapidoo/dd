'use client';

import { useState } from 'react';
import { createSupabaseBrowserClient } from '../lib/db/browser';

type Status = 'idle' | 'sending' | 'sent' | 'error';

export function LoginCard() {
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<Status>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!email.trim()) return;
    setStatus('sending');
    setErrorMessage(null);
    try {
      const supabase = createSupabaseBrowserClient();
      const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? window.location.origin;
      const { error } = await supabase.auth.signInWithOtp({
        email: email.trim(),
        options: { emailRedirectTo: `${siteUrl}/auth/callback` },
      });
      if (error) {
        setStatus('error');
        setErrorMessage(error.message);
        return;
      }
      setStatus('sent');
    } catch (err) {
      setStatus('error');
      setErrorMessage(err instanceof Error ? err.message : 'Erreur inconnue');
    }
  }

  if (status === 'sent') {
    return (
      <div className="flex w-full max-w-sm flex-col gap-3 rounded border border-[rgba(212,166,76,0.3)] bg-[rgba(0,0,0,0.4)] p-6 text-center">
        <p className="text-sm text-[#ecc87a]">Un lien magique file vers {email}.</p>
        <p className="text-xs text-[rgba(242,232,208,0.55)]">
          Clique dessus pour revenir et commencer la veillée.
        </p>
      </div>
    );
  }

  return (
    <form
      onSubmit={onSubmit}
      className="flex w-full max-w-sm flex-col gap-3 rounded border border-[rgba(212,166,76,0.3)] bg-[rgba(0,0,0,0.4)] p-6"
    >
      <label className="flex flex-col gap-1 text-xs uppercase tracking-[0.15em] text-[rgba(242,232,208,0.55)]">
        Courriel
        <input
          type="email"
          required
          autoComplete="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          className="mt-1 rounded-none border border-[rgba(212,166,76,0.3)] bg-[rgba(0,0,0,0.5)] px-3 py-2 font-[EB_Garamond,serif] text-base text-[#f2e8d0] outline-none focus:border-[#d4a64c]"
          placeholder="toi@exemple.fr"
        />
      </label>
      <button
        type="submit"
        disabled={status === 'sending'}
        className="rounded-none border border-[#8a6420] bg-gradient-to-b from-[#ecc87a] to-[#d4a64c] px-4 py-2 text-sm font-semibold tracking-wide text-[#1a100a] shadow-[0_2px_0_#8a6420] disabled:opacity-50"
      >
        {status === 'sending' ? 'Envoi…' : 'Recevoir un lien magique'}
      </button>
      {errorMessage && <p className="text-xs text-[#e08070]">{errorMessage}</p>}
      <p className="text-center text-[11px] text-[rgba(242,232,208,0.45)]">
        Nous t'envoyons un courriel avec un lien d'authentification unique.
      </p>
    </form>
  );
}
