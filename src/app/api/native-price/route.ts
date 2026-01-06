import { NextResponse } from 'next/server';

import { CHAIN_META } from '@/lib/chainsMeta';

// Small in-memory cache (best-effort; helps avoid rate limits).
declare global {
  // eslint-disable-next-line no-var
  var __nexora_native_price_cache:
    | Map<string, { usd: number; ts: number }>
    | undefined;
}

const CACHE_TTL_MS = 30_000;

function getCache() {
  if (!globalThis.__nexora_native_price_cache) {
    globalThis.__nexora_native_price_cache = new Map();
  }
  return globalThis.__nexora_native_price_cache;
}

function coingeckoIdForSymbol(sym: string): string | null {
  // Common native coins we support.
  switch (sym.toUpperCase()) {
    case 'ETH':
      return 'ethereum';
    case 'BNB':
      return 'binancecoin';
    case 'MATIC':
    case 'POL':
      return 'polygon-pos';
    case 'AVAX':
      return 'avalanche-2';
    default:
      return null;
  }
}

async function fetchMoralisNativeUsd(moralisChain: string): Promise<number | null> {
  const apiKey = process.env.MORALIS_API_KEY;
  if (!apiKey) return null;

  // Moralis native price endpoint
  const url = `https://deep-index.moralis.io/api/v2.2/native/price?chain=${encodeURIComponent(
    moralisChain
  )}`;

  const r = await fetch(url, {
    headers: {
      accept: 'application/json',
      'X-API-Key': apiKey,
    },
    // Reduce noisy caching surprises in serverless
    cache: 'no-store',
  });

  if (!r.ok) return null;
  const j: any = await r.json().catch(() => null);
  if (!j) return null;

  // Moralis responses vary by version; accept several shapes.
  const candidates = [
    j.usdPrice,
    j.usdPriceFormatted,
    j.usd_price,
    j.priceUsd,
    j.price_usd,
    j?.price?.usd,
  ];
  for (const c of candidates) {
    const n = typeof c === 'number' ? c : typeof c === 'string' ? Number(c) : NaN;
    if (Number.isFinite(n) && n > 0) return n;
  }
  return null;
}

async function fetchCoingeckoNativeUsd(nativeSymbol: string): Promise<number | null> {
  const id = coingeckoIdForSymbol(nativeSymbol);
  if (!id) return null;

  const url = `https://api.coingecko.com/api/v3/simple/price?ids=${encodeURIComponent(
    id
  )}&vs_currencies=usd`;
  const r = await fetch(url, { cache: 'no-store' });
  if (!r.ok) return null;
  const j: any = await r.json().catch(() => null);
  const n = j?.[id]?.usd;
  return typeof n === 'number' && Number.isFinite(n) && n > 0 ? n : null;
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const chainId = Number(searchParams.get('chainId') || '');

  const meta = CHAIN_META[chainId];
  if (!meta) {
    return NextResponse.json(
      { ok: false, error: 'Unsupported chainId' },
      { status: 400 }
    );
  }

  const cacheKey = meta.moralisChain;
  const cache = getCache();
  const hit = cache.get(cacheKey);
  if (hit && Date.now() - hit.ts < CACHE_TTL_MS) {
    return NextResponse.json({ ok: true, usd: hit.usd, cached: true });
  }

  // Prefer Moralis (better coverage + consistent).
  const usd =
    (await fetchMoralisNativeUsd(meta.moralisChain)) ??
    (await fetchCoingeckoNativeUsd(meta.nativeSymbol));

  if (!usd) {
    return NextResponse.json(
      { ok: false, error: 'Could not fetch native price' },
      { status: 502 }
    );
  }

  cache.set(cacheKey, { usd, ts: Date.now() });
  return NextResponse.json({ ok: true, usd, cached: false });
}
