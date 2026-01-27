import SwapCard from '@/components/SwapCard';

export default function Page() {
  return (
    <main className="min-h-screen px-4 py-6 sm:py-10">
      <div className="mx-auto max-w-lg lg:max-w-xl">
        <div className="mb-8">
          <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.06] px-3.5 py-1.5 text-[11px] font-medium tracking-[0.18em] uppercase text-white/70 backdrop-blur-md shadow-[0_8px_30px_rgba(0,0,0,0.25)]">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400/90" />
            Multi-router DEX
          </div>
          <h1 className="mt-4 text-4xl sm:text-5xl font-semibold tracking-[-0.03em] leading-[1.05] bg-gradient-to-b from-white via-white/90 to-white/60 bg-clip-text text-transparent drop-shadow-sm">Nexora Swap</h1>
        </div>

        <SwapCard />
      </div>
    </main>
  );
}
