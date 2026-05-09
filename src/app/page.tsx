import SwapCard from '@/components/SwapCard';
import ThemeToggle from '@/components/ThemeToggle';

export default function Page() {
  return (
    <main className="nexora-page px-3 py-5 sm:px-4 sm:py-8">
      <div className="app-frame">
        <div className="app-topbar">
          <div className="brand-lockup">
            <div className="brand-mark">
              <img src="/icon.png" alt="Nexora Swap" />
            </div>
            <div className="min-w-0">
              <div className="brand-name-small">Nexora Swap</div>
              <div className="brand-kicker">DEX Console</div>
            </div>
          </div>

          <ThemeToggle />
        </div>

        <div className="hero-header">
          <div className="brand-chip">
            <span className="status-dot" />
            Multi-router DEX
          </div>

          <h1 className="brand-title">
            <span>Nexora Swap</span>
          </h1>
        </div>

        <SwapCard />
      </div>
    </main>
  );
}
