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
          <div className="min-h-screen">
            {children}
          </div>

          <footer className="fixed left-1/2 -translate-x-1/2 bottom-[calc(10px+env(safe-area-inset-bottom))] z-50 pointer-events-none">
            <p className="text-center text-[11px] sm:text-xs font-medium tracking-wide text-white/60">
              © 2026 Md. Rakib • made with love and passion • All Rights Reserved.
            </p>
          </footer>
        </Providers>
      </body>
    </html>
  );
}
