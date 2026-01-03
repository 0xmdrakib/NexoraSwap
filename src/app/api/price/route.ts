import { NextRequest, NextResponse } from 'next/server';
import { getChainMeta } from '@/lib/chainsMeta';
import { cacheGet, cacheSet } from '@/lib/server/cache';

async function moralisFetch(url: string, init: RequestInit = {}) {
  const key = process.env.MORALIS_API_KEY;
  if (!key) throw new Error('Missing MORALIS_API_KEY');
  const res = await fetch(url, {
    ...init,
    headers: {
      accept: 'application/json',
      'X-API-Key': key,
      ...(init.headers || {}),
    },
    cache: 'no-store',
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    throw new Error(`Moralis error ${res.status}: ${txt}`);
  }
  return res.json();
}

async function dexScreenerPrice(chainSlug: string, tokenAddress: string) {
  // DexScreener public endpoint: returns pairs across chains for the token.
  const url = `https://api.dexscreener.com/latest/dex/tokens/${tokenAddress}`;
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error(`DexScreener error ${res.status}`);
  const json = await res.json();
  const pairs = Array.isArray(json?.pairs) ? json.pairs : [];

  const onChain = pairs.filter((p: any) => String(p?.chainId || '').toLowerCase() === chainSlug.toLowerCase());
  if (!onChain.length) return null;
  // pick the pair with max liquidity.usd
  onChain.sort((a: any, b: any) => (Number(b?.liquidity?.usd || 0) - Number(a?.liquidity?.usd || 0)));
  const best = onChain[0];
  const priceUsd = best?.priceUsd;
  return priceUsd ? String(priceUsd) : null;
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const chainId = Number(searchParams.get('chainId'));
  const tokenAddress = (searchParams.get('tokenAddress') || '').trim();

  if (!chainId || !tokenAddress) {
    return NextResponse.json({ error: 'chainId and tokenAddress are required' }, { status: 400 });
  }

  const meta = getChainMeta(chainId);
  const cacheKey = `price:${meta.moralisChain}:${tokenAddress.toLowerCase()}`;
  const cached = cacheGet<any>(cacheKey);
  if (cached) return NextResponse.json(cached);

  let priceUSD: string | null = null;
  let source: 'moralis' | 'dexscreener' | 'none' = 'none';

  // 1) Moralis (primary)
  try {
    const url = `https://deep-index.moralis.io/api/v2.2/erc20/${tokenAddress}/price?chain=${meta.moralisChain}`;
    const data = await moralisFetch(url);
    const usd = data?.usdPriceFormatted || data?.usdPrice;
    if (usd != null) {
      priceUSD = String(usd);
      source = 'moralis';
    }
  } catch {
    // ignore and fall back
  }

  // 2) DexScreener fallback
  if (!priceUSD) {
    try {
      priceUSD = await dexScreenerPrice(meta.dexScreenerChain, tokenAddress);
      if (priceUSD) source = 'dexscreener';
    } catch {
      priceUSD = null;
      source = 'none';
    }
  }

  const payload = { priceUSD, source };
  cacheSet(cacheKey, payload, 30_000);
  return NextResponse.json(payload);
}
