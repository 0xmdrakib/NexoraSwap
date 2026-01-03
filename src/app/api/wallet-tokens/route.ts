import { NextRequest, NextResponse } from 'next/server';
import { getChainMeta } from '@/lib/chainsMeta';
import { cacheGet, cacheSet } from '@/lib/server/cache';

type MoralisWalletToken = {
  token_address?: string;
  name?: string;
  symbol?: string;
  logo?: string | null;
  thumbnail?: string | null;
  decimals?: string;
  balance?: string;
  balance_formatted?: string;
  usd_price?: string | number;
  usd_value?: string | number;
  native_token?: boolean;
  possible_spam?: boolean;
};

// This API is consumed directly by TokenSelect.tsx.
// Keep the response shape stable and UI-friendly.
export type WalletToken = {
  token_address: string;
  name: string;
  symbol: string;
  decimals: number;
  balance: string; // raw units
  balanceFormatted?: string;
  logo?: string | null;
  thumbnail?: string | null;
  usdPrice?: string;
  usdValue?: string;
};

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
    // Moralis is fast; avoid caching at fetch layer in dev
    cache: 'no-store',
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    throw new Error(`Moralis error ${res.status}: ${txt}`);
  }
  return res.json();
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const chainId = Number(searchParams.get('chainId'));
  const address = (searchParams.get('address') || '').trim();
  const limit = Math.min(Math.max(Number(searchParams.get('limit') || '100'), 1), 100);

  if (!chainId || !address) {
    return NextResponse.json({ error: 'chainId and address are required' }, { status: 400 });
  }

  const meta = getChainMeta(chainId);
  const cacheKey = `walletTokens:${meta.moralisChain}:${address.toLowerCase()}:${limit}`;
  const cached = cacheGet<any>(cacheKey);
  if (cached) return NextResponse.json(cached);

  // Moralis "Wallet token balances" endpoint (includes formatted balances + USD value).
  // This dramatically improves the token picker UX (balances + prices + logos in one call).
  const balancesUrl = `https://deep-index.moralis.io/api/v2.2/wallets/${address}/tokens?chain=${meta.moralisChain}&exclude_spam=true&limit=${limit}`;
  const walletJson = await moralisFetch(balancesUrl);
  const walletTokens: MoralisWalletToken[] = Array.isArray(walletJson?.result) ? walletJson.result : [];

  // Keep only non-zero balances.
  const nonZero = walletTokens.filter((t) => {
    try {
      return BigInt(t.balance || '0') > 0n;
    } catch {
      return false;
    }
  });

  // Exclude native token here; the UI already tracks native balance via wagmi useBalance.
  const out: WalletToken[] = nonZero
    .filter((t) => !t.native_token)
    .map((t) => {
      const token_address = String(t.token_address || '').toLowerCase();
      return {
        token_address,
        name: String(t.name || ''),
        symbol: String(t.symbol || ''),
        decimals: Number(t.decimals || '18'),
        balance: String(t.balance || '0'),
        balanceFormatted: t.balance_formatted ? String(t.balance_formatted) : undefined,
        logo: t.logo ?? null,
        thumbnail: t.thumbnail ?? null,
        usdPrice: t.usd_price != null ? String(t.usd_price) : undefined,
        usdValue: t.usd_value != null ? String(t.usd_value) : undefined,
      };
    })
    // Guard against bad Moralis rows (missing address)
    .filter((t) => t.token_address.startsWith('0x') && t.token_address.length === 42);

  const payload = { tokens: out };
  cacheSet(cacheKey, payload, 30_000);
  return NextResponse.json(payload);
}
