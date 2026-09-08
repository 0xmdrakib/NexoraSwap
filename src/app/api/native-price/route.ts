import { NextResponse } from 'next/server';

import { getTokenPrices } from '@/lib/server/dexScreener';
import { getChainMeta } from '@/lib/chainsMeta';

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const chainId = Number(searchParams.get('chainId') || '');
  const force = searchParams.get('force') === '1';

  if (!chainId) {
    return NextResponse.json({ ok: false, error: 'Missing chainId' }, { status: 400 });
  }

  try {
    const meta = getChainMeta(chainId);
    const [price] = await getTokenPrices([{ chainId, address: meta.nativeTokenAddress }], { force });
    const usd = Number(price?.priceUSD || 0);
    if (!Number.isFinite(usd) || usd <= 0) {
      return NextResponse.json(
        { ok: false, error: 'Could not fetch the native token price' },
        { status: 502 }
      );
    }
    return NextResponse.json({ ok: true, usd, source: price?.source || 'none', cached: price?.cached || false });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'Could not fetch the native token price' }, { status: 502 });
  }
}
