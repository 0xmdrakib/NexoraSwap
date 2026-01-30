import type { Metadata, Viewport } from 'next';
import './globals.css';
import Providers from './providers';

export const metadata: Metadata = {
  title: 'Nexora Swap',
  description: 'Nexora Swap — a multi-router swap UI starter (LiFi + optional adapters) built with RainbowKit + wagmi.',
};


export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-[100svh] overflow-x-hidden">
        <Providers>
          {/*
            Phone: scale the whole UI down ~10% by default.
            Desktop/tablet: restore normal scale.
          */}
          <div className="min-h-[100svh] flex flex-col scale-[0.9] sm:scale-100 origin-top">
            <div className="flex-1">{children}</div>

            {/* Text-only footer (in flow) — no fixed bar/layer */}
            <footer className="pb-[calc(10px+env(safe-area-inset-bottom))] pt-2">
              <p className="text-center text-[11px] sm:text-xs font-medium tracking-wide text-white/60">
                © 2026 Md. Rakib • made with love and passion • All Rights Reserved.
              </p>
            </footer>
          </div>
        </Providers>
      </body>
    </html>
  );
}
