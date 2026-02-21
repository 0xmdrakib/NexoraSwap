import type { Metadata, Viewport } from 'next';
import './globals.css';
import Providers from './providers';

export const metadata: Metadata = {
  title: 'Nexora Swap',
  description: 'Nexora Swap — a multi router DEX.',
};


export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-[100dvh] overflow-x-hidden">
        <Providers>
          {/*
            IMPORTANT (mobile): do NOT use transform scale on the root wrapper.
            - It creates empty “dead space” (layout size doesn’t shrink).
            - It breaks dialogs/overlays (position: fixed becomes relative to the transformed ancestor).
            We handle the ~10% mobile shrink in globals.css via the root font-size instead.
          */}
          <div className="min-h-[100dvh] flex flex-col">
            <div className="flex-1">{children}</div>

            {/* Text-only footer (in flow) — no bar/layer, no overlay */}
            <footer className="pt-2 pb-[calc(12px+env(safe-area-inset-bottom))]">
              <p className="text-center text-xs font-medium tracking-wide text-white/60">
                © 2026 Md. Rakib • made with love and passion • All Rights Reserved.
              </p>
            </footer>
          </div>
        </Providers>
      </body>
    </html>
  );
}
