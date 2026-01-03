import { NextResponse } from 'next/server';
import type { QuoteRequest } from '@/lib/types';
import { computeMinAmountHint } from '@/lib/server/minAmount';

export async function POST(req: Request) {
  let body: QuoteRequest;
  try {
    body = (await req.json()) as QuoteRequest;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  if (!body?.fromChainId || !body?.toChainId) return NextResponse.json({ error: 'Missing chain ids' }, { status: 400 });
  if (!body?.fromToken?.address || !body?.toToken?.address)
    return NextResponse.json({ error: 'Missing token addresses' }, { status: 400 });
  if (!body?.fromAmount || body.fromAmount === '0') return NextResponse.json({ error: 'Missing amount' }, { status: 400 });
  if (!body?.fromAddress || !body?.toAddress) return NextResponse.json({ error: 'Missing addresses' }, { status: 400 });

  try {
    const minAmount = await computeMinAmountHint(body);
    if (!minAmount) return NextResponse.json({ error: 'Liquidity not found for this pair.' }, { status: 400 });
    return NextResponse.json({ minAmount });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Failed to compute minimum amount' }, { status: 500 });
  }
}
