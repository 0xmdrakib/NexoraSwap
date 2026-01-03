import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  const endpoint = process.env.NODEREAL_PANCAKE_GRAPHQL_URL;
  if (!endpoint) return new NextResponse('Missing NODEREAL_PANCAKE_GRAPHQL_URL', { status: 400 });

  const body = await req.text();
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
    return new NextResponse(e?.message || 'Pancake GraphQL request failed', { status: 500 });
  }
}
