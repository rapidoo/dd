import { LoginCard } from './login-card';

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-8 bg-[#0a0604] px-6 py-12 text-[#f2e8d0]">
      <header className="flex flex-col items-center gap-2 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-[#ffc870] to-[#d4a64c] text-3xl text-[#1a100a] shadow-[0_0_32px_rgba(240,176,80,0.45)]">
          ⚜
        </div>
        <p className="font-[IM_Fell_English_SC,serif] text-xs uppercase tracking-[0.35em] text-[#d4a64c]">
          DetD
        </p>
        <h1 className="max-w-xl font-[EB_Garamond,serif] text-4xl leading-tight text-[#ecc87a]">
          Venez veiller autour du feu
        </h1>
        <p className="max-w-md text-sm leading-relaxed text-[rgba(242,232,208,0.7)]">
          Jouez à Donjons & Dragons en solo avec un Maître du Donjon IA et des compagnons Claude qui
          prennent vie à vos côtés.
        </p>
      </header>

      <LoginCard />
    </main>
  );
}
