import type { Metadata, Viewport } from 'next';
import './globals.css';
import Providers from './providers';

export const metadata: Metadata = {
  title: 'Nexora Swap',
  description:
    'A fast, simple multi-router DEX for swapping tokens across EVM networks and Solana.',
  metadataBase: new URL('https://nexoraswap.rakibhq.xyz'),
  openGraph: {
    title: 'Nexora Swap',
    description:
      'A fast, simple multi-router DEX for swapping tokens across EVM networks and Solana.',
    url: 'https://nexoraswap.rakibhq.xyz',
    siteName: 'Nexora Swap',
    type: 'website',
    images: [
      {
        url: '/nexora-swap-embed-light-v2.jpg',
        width: 1200,
        height: 630,
        type: 'image/jpeg',
        alt: 'Nexora Swap — multi-router DEX for EVM networks and Solana',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Nexora Swap',
    description:
      'A fast, simple multi-router DEX for swapping tokens across EVM networks and Solana.',
    images: [
      {
        url: '/nexora-swap-embed-light-v2.jpg',
        alt: 'Nexora Swap — multi-router DEX for EVM networks and Solana',
      },
    ],
  },
  other: {
    'base:app_id': '6a5493c540f72197db8683c5',
  },
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
          <div className="min-h-[100dvh] flex flex-col">
            <div className="flex-1">{children}</div>

            <footer className="pt-2 pb-[calc(12px+env(safe-area-inset-bottom))]">
              <p className="footer-text text-center text-xs font-medium">
                &copy; 2026 Md. Rakib • made with love and passion.
              </p>
            </footer>
          </div>
        </Providers>
      </body>
    </html>
  );
}
