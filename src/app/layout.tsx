import type { Metadata, Viewport } from 'next';
import './globals.css';
import Providers from './providers';

export const metadata: Metadata = {
  title: 'Nexora Swap',
  description: 'Nexora Swap, a multi-router DEX with multiple swap route in one.',
};


export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Providers>
          {children}
          <footer className="fixed bottom-0 left-0 right-0 z-50 px-4 py-3 text-center text-xs text-white/60">
            © 2026 Md. Rakib • made with love and passion • All Rights Reserved.
          </footer>
        </Providers>
      </body>
    </html>
  );
}
