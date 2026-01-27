import SwapCard from '@/components/SwapCard';

export default function Page() {
  return (
    <main className="min-h-screen px-4 py-6 sm:py-10">
      <div className="mx-auto max-w-lg lg:max-w-xl">
        <div className="mb-9 flex flex-col items-center text-center">
          <h1 className="relative mt-5 text-5xl sm:text-6xl font-semibold tracking-[-0.04em] leading-[1.02] bg-gradient-to-b from-white via-white/90 to-white/55 bg-clip-text text-transparent drop-shadow-sm">
            Nexora Swap
            <span className="pointer-events-none absolute left-1/2 top-full mt-3 h-px w-24 -translate-x-1/2 bg-gradient-to-r from-transparent via-white/20 to-transparent" />
          </h1>

          <div className="mt-5 inline-flex items-center gap-2.5 rounded-full ring-1 ring-white/10 bg-black/20 px-4 py-1.5 text-[10px] font-medium tracking-[0.22em] uppercase text-white/70 backdrop-blur-md shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_10px_35px_rgba(0,0,0,0.35)]">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400/90 shadow-[0_0_0_4px_rgba(16,185,129,0.12)]" />
            Multi-router DEX
          </div>
        </div>

        <SwapCard />
      </div>
    </main>
  );
}
