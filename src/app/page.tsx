import SwapCard from '@/components/SwapCard';

export default function Page() {
  return (
    <main className="min-h-screen px-4 py-6 sm:py-10">
      <div className="mx-auto max-w-lg lg:max-w-xl">
        <div className="mb-8">
          <h1 className="text-4xl sm:text-5xl font-semibold tracking-[-0.04em] leading-[1.05] text-white/95 drop-shadow-sm">
            Nexora Swap
          </h1>

          <div className="mt-3 inline-flex items-center gap-2 rounded-full ring-1 ring-white/10 bg-white/5 px-3 py-1 text-[10px] sm:text-[11px] font-medium tracking-[0.18em] uppercase text-white/70 backdrop-blur-md">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400/90" />
            Multi-router DEX
          </div>
        </div>

        <SwapCard />
      </div>
    </main>
  );
}
