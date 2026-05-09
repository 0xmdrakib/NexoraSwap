import { NextRequest, NextResponse } from 'next/server';

import { getTokenPrices } from '@/lib/server/dexScreener';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const chainId = Number(searchParams.get('chainId'));
  const tokenAddress = (searchParams.get('tokenAddress') || searchParams.get('address') || '').trim();
  const force = searchParams.get('force') === '1';

  if (!chainId || !tokenAddress) {
    return NextResponse.json({ error: 'chainId and tokenAddress are required' }, { status: 400 });
  }

  try {
    const [price] = await getTokenPrices([{ chainId, address: tokenAddress as `0x${string}` }], { force });
    return NextResponse.json(price || { chainId, address: tokenAddress, priceUSD: null, source: 'none' });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Failed to fetch DexScreener price' }, { status: 502 });
  }
}
