import { NextRequest, NextResponse } from 'next/server';
import { getAddress, isAddress } from 'viem';

import { getSelectedBalances } from '@/lib/server/alchemy';
import { cacheGet, cacheSet } from '@/lib/server/cache';
import type { Address } from '@/lib/types';

function toAddress(value: unknown): Address | null {
  const s = typeof value === 'string' ? value.trim() : '';
  if (!isAddress(s, { strict: false })) return null;
  try {
    return getAddress(s) as Address;
  } catch {
    return null;
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    const wallet = toAddress(body?.address);
    const tokens = Array.isArray(body?.tokens) ? body.tokens : [];
    const force = Boolean(body?.force);

    if (!wallet) {
      return NextResponse.json({ error: 'Valid wallet address is required' }, { status: 400 });
    }

    const normalized: Array<{ chainId: number; address: Address }> = tokens
      .map((token: any) => {
        const address = toAddress(token?.address);
        return {
          chainId: Number(token?.chainId),
          address,
        };
      })
      .filter((token: any): token is { chainId: number; address: Address } =>
        Boolean(token.chainId && token.address)
      )
      .slice(0, 20);

    if (!normalized.length) {
      return NextResponse.json({ balances: [] });
    }

    const cacheKey = `selectedBalances:${wallet.toLowerCase()}:${normalized
      .map((token) => `${token.chainId}:${token.address.toLowerCase()}`)
      .sort()
      .join('|')}`;
    const cached = !force ? cacheGet<any>(cacheKey) : null;
    if (cached) return NextResponse.json(cached);

    const balances = await getSelectedBalances(wallet, normalized);
    const payload = { balances, source: 'alchemy' };
    cacheSet(cacheKey, payload, force ? 10_000 : 20_000);
    return NextResponse.json(payload);
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Failed to fetch Alchemy balances' }, { status: 502 });
  }
}
