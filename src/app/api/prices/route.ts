import { NextRequest, NextResponse } from 'next/server';

import { getTokenPrices } from '@/lib/server/dexScreener';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    const tokens = Array.isArray(body?.tokens) ? body.tokens : [];
    const force = Boolean(body?.force);

    const normalized = tokens
      .map((token: any) => ({
        chainId: Number(token?.chainId),
        address: String(token?.address || '').trim() as `0x${string}`,
      }))
      .filter((token: any) => token.chainId && token.address.startsWith('0x'))
      .slice(0, 20);

    if (!normalized.length) {
      return NextResponse.json({ prices: [] });
    }

    const prices = await getTokenPrices(normalized, { force });
    return NextResponse.json({ prices });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Failed to fetch DexScreener prices' }, { status: 502 });
  }
}
