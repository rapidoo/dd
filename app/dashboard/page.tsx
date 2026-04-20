import { createSupabaseServerClient } from '../../lib/db/server';
import type { ProfileRow } from '../../lib/db/types';
import { requireUser, signOut } from '../../lib/server/auth';

export default async function DashboardPage() {
  const user = await requireUser();
  const supabase = await createSupabaseServerClient();
  const { data: profile } = await supabase
    .from('profiles')
    .select('display_name, avatar_url')
    .eq('id', user.id)
    .maybeSingle<Pick<ProfileRow, 'display_name' | 'avatar_url'>>();

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-4xl flex-col gap-8 px-6 py-12 text-[#f2e8d0]">
      <header className="flex items-center justify-between">
        <div>
          <p className="font-[IM_Fell_English_SC,serif] text-xs uppercase tracking-[0.3em] text-[#d4a64c]">
            Au coin du feu
          </p>
          <h1 className="font-[EB_Garamond,serif] text-3xl text-[#ecc87a]">
            Bonjour {profile?.display_name ?? user.email}
          </h1>
        </div>
        <form action={signOut}>
          <button
            type="submit"
            className="rounded-none border border-[rgba(212,166,76,0.3)] px-3 py-2 text-xs uppercase tracking-[0.15em] text-[rgba(242,232,208,0.7)] hover:text-[#ecc87a]"
          >
            Quitter la veillée
          </button>
        </form>
      </header>

      <section className="rounded-none border border-[rgba(212,166,76,0.3)] bg-[rgba(0,0,0,0.35)] p-6">
        <p className="text-sm text-[rgba(242,232,208,0.7)]">
          Les campagnes apparaîtront ici — prochaine étape du sprint.
        </p>
      </section>
    </main>
  );
}
