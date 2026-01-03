import { NextResponse } from 'next/server';
import type { Token } from '@/lib/types';

const LIFI_BASE = process.env.LIFI_BASE_URL || 'https://li.quest';
const INTEGRATOR = process.env.LIFI_INTEGRATOR || 'swapdex-starter';

function normalizeToken(t: any, chainId: number): Token | null {
  if (!t) return null;
  const address = String(t.address || '').toLowerCase();
  if (!address.startsWith('0x')) return null;

  return {
    chainId,
    address: address as any,
    symbol: String(t.symbol || '').slice(0, 32),
    name: String(t.name || '').slice(0, 64),
    decimals: Number(t.decimals ?? 18),
    logoURI: t.logoURI ? String(t.logoURI) : undefined,
    priceUSD: t.priceUSD ? String(t.priceUSD) : undefined,
    coinKey: t.coinKey ? String(t.coinKey) : undefined,
  };
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const chainId = Number(url.searchParams.get('chainId') || '0');
  const nativeOnly = url.searchParams.get('nativeOnly') === '1';
  if (!chainId) return new NextResponse('Missing chainId', { status: 400 });

  const headers: Record<string, string> = { accept: 'application/json' };
  if (process.env.LIFI_API_KEY) headers['x-lifi-api-key'] = process.env.LIFI_API_KEY;

  try {
    // LiFi tokens endpoint: returns a map keyed by chainId for requested chains.
    const r = await fetch(`${LIFI_BASE}/v1/tokens?chains=${chainId}&integrator=${encodeURIComponent(INTEGRATOR)}`, {
      headers,
      cache: 'no-store',
    });

    const json = await r.json();
    if (!r.ok) return new NextResponse(JSON.stringify(json), { status: r.status });

    const byChain = (json?.tokens && json.tokens[String(chainId)]) || json?.tokens?.[chainId] || json?.tokens;
    const arr: any[] = Array.isArray(byChain) ? byChain : [];

    const tokens: Token[] = arr.map((t) => normalizeToken(t, chainId)).filter(Boolean) as Token[];

    // Always include the chain's native placeholder if missing.
    if (!tokens.some((t) => t.address === '0x0000000000000000000000000000000000000000')) {
      tokens.unshift({
        chainId,
        address: '0x0000000000000000000000000000000000000000',
        symbol: json?.nativeToken?.symbol || 'NATIVE',
        name: json?.nativeToken?.name || 'Native Token',
        decimals: Number(json?.nativeToken?.decimals || 18),
      });
    }

    if (nativeOnly) {
      const native = tokens.find((t) => t.address === '0x0000000000000000000000000000000000000000') || null;
      return NextResponse.json({ token: native });
    }

    return NextResponse.json({ tokens });
  } catch (e: any) {
    return new NextResponse(e?.message || 'Failed to fetch tokens', { status: 500 });
  }
}
