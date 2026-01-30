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
      <body className="min-h-screen">
        <Providers>
          <div className="min-h-screen pb-[calc(56px+env(safe-area-inset-bottom))]">
            {children}
          </div>

          <footer className="fixed bottom-0 left-0 right-0 z-50">
            <div className="mx-auto max-w-6xl px-4 py-3 pb-[calc(12px+env(safe-area-inset-bottom))] text-center text-[11px] sm:text-xs font-medium tracking-wide text-white/60">
              © 2026 Md. Rakib • made with love and passion • All Rights Reserved.
            </div>
          </footer>
        </Providers>
      </body>
    </html>
  );
}
