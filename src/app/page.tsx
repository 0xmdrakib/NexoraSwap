import SwapCard from '@/components/SwapCard';

export default function Page() {
  return (
    <main className="min-h-screen px-4 py-6 sm:py-10">
      <div className="mx-auto max-w-lg lg:max-w-xl">
        <div className="mb-8">
          <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-black/20 px-3 py-1 text-[11px] font-medium tracking-wide text-white/70 backdrop-blur-md shadow-sm">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400/90" />
            Multi-router DEX
          </div>
          <h1 className="mt-4 text-3xl sm:text-4xl font-semibold tracking-[-0.02em] leading-tight text-white/95">Nexora Swap</h1>
        </div>

        <SwapCard />
      </div>
    </main>
  );
}
