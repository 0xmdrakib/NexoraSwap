import { NextRequest, NextResponse } from 'next/server';

import { getTokenMetadata } from '@/lib/server/tokenMetadata';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const chainId = Number(searchParams.get('chainId'));
  const address = (searchParams.get('address') || '').trim();

  if (!chainId || !address) {
    return NextResponse.json({ error: 'chainId and address are required' }, { status: 400 });
  }

  try {
    const result = await getTokenMetadata(chainId, address);
    return NextResponse.json(result);
  } catch (e: any) {
    return NextResponse.json(
      {
        error:
          e?.message ||
          'Token metadata could not be loaded from Moralis. Check chain + contract address.',
      },
      { status: e?.message === 'Invalid address' ? 400 : 404 }
    );
  }
}
