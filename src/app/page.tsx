import SwapCard from '@/components/SwapCard';

export default function Page() {
  return (
    <main className="min-h-screen px-4 py-6 sm:py-10">
      <div className="mx-auto max-w-lg lg:max-w-xl">
        <div className="mb-8">
          <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-white/70">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400/90" />
            Multi-router DEX
          </div>
          <h1 className="mt-4 text-3xl sm:text-4xl font-semibold tracking-tight">Nexora Swap</h1>
        </div>

        <SwapCard />
      </div>
    </main>
  );
}
