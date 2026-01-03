import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  const apiKey = process.env.THEGRAPH_API_KEY;
  const subgraphId = process.env.UNISWAP_SUBGRAPH_ID; // preferred, since Uniswap docs show Graph Gateway endpoints by ID
  if (!apiKey || !subgraphId) {
    return new NextResponse('Missing THEGRAPH_API_KEY or UNISWAP_SUBGRAPH_ID', { status: 400 });
  }

  const body = await req.text();
  const endpoint = `https://gateway.thegraph.com/api/${apiKey}/subgraphs/id/${subgraphId}`;

  try {
    const r = await fetch(endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body,
      cache: 'no-store',
    });
    const text = await r.text();
    return new NextResponse(text, { status: r.status, headers: { 'content-type': 'application/json' } });
  } catch (e: any) {
    return new NextResponse(e?.message || 'Subgraph request failed', { status: 500 });
  }
}
