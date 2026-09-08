import assert from 'node:assert/strict';
import { after, afterEach, beforeEach, mock, test } from 'node:test';
import { NextRequest } from 'next/server';

import { CHAIN_META, SOLANA_CHAIN_ID } from '../src/lib/chainsMeta';
import { getTokenPrices } from '../src/lib/server/dexScreener';
import { POST as pricesRoute } from '../src/app/api/prices/route';
import { GET as priceRoute } from '../src/app/api/price/route';
import { GET as nativeRoute } from '../src/app/api/native-price/route';

const USDT = '0x55d398326f99059fF775485246999027B3197955';
const USDC = '0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d';
const MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
const originalEnv = { ...process.env };
const item = { chainId: 56, address: USDT };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const lifi = (price: unknown = '1.0005') => json({ ...item, priceUSD: price });
function pool(options: Record<string, unknown> = {}) {
  return { chainId: 'bsc', dexId: 'pancakeswap', pairAddress: 'deep-pool',
    baseToken: { address: USDT }, quoteToken: { address: USDC },
    priceUsd: '0.9996', priceNative: '0.9996', liquidity: { usd: 41_000_000 }, ...options };
}
let calls: Array<{ url: URL; init: RequestInit }>;
let provider: (url: URL) => Promise<Response>;

beforeEach(() => {
  calls = [];
  (globalThis as typeof globalThis & { __nexoraCache: Map<string, unknown> }).__nexoraCache.clear();
  delete process.env.DATABASE_URL;
  process.env.LIFI_BASE_URL = 'https://lifi.example.test';
  process.env.LIFI_API_KEY = 'fixture-key';
  process.env.DEXSCREENER_BASE_URL = 'https://dex.example.test';
  provider = async url => url.hostname === 'lifi.example.test' ? lifi() : json([pool()]);
  mock.method(globalThis, 'fetch', async (input: string | URL | Request, init: RequestInit = {}) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    assert(['lifi.example.test', 'dex.example.test'].includes(url.hostname), 'No unexpected network calls');
    calls.push({ url, init });
    return provider(url);
  });
});
afterEach(() => mock.restoreAll());
after(() => { process.env = originalEnv; });

test('LI.FI is primary, uses the existing key, and successful prices are cached', async () => {
  const [price] = await getTokenPrices([item]);
  assert.equal(price.source, 'lifi');
  assert.equal(price.priceUSD, '1.0005');
  assert.equal(new Headers(calls[0].init.headers).get('x-lifi-api-key'), 'fixture-key');
  assert.equal((await getTokenPrices([item]))[0].source, 'memory');
  assert.equal(calls.length, 1);
});

test('stablecoin prices below one dollar are retained rather than forced to a peg', async () => {
  provider = async () => lifi('0.97');
  assert.equal((await getTokenPrices([item]))[0].priceUSD, '0.97');
});

for (const value of [null, false, '', 'invalid', 'Infinity', '0', '-1']) {
  test(`invalid LI.FI price (${String(value)}) falls back to DexScreener`, async () => {
    provider = async url => url.hostname === 'lifi.example.test' ? lifi(value) : json([pool()]);
    assert.equal((await getTokenPrices([item]))[0].source, 'dexscreener');
  });
}

for (const failure of [401, 429, 'timeout']) {
  test(`LI.FI ${failure} leaves the DexScreener fallback usable`, async () => {
    provider = async url => {
      if (url.hostname === 'dex.example.test') return json([pool()]);
      if (typeof failure === 'number') return json({}, failure);
      throw new DOMException('Timed out', 'TimeoutError');
    };
    assert.equal((await getTokenPrices([item]))[0].priceUSD, '0.9996');
    assert(calls.every(call => call.init.signal instanceof AbortSignal));
  });
}

test('a LI.FI response for another token or chain is rejected', async () => {
  provider = async url => url.hostname === 'lifi.example.test'
    ? json({ chainId: 1, address: USDC, priceUSD: '9000' }) : json([pool()]);
  assert.equal((await getTokenPrices([item]))[0].source, 'dexscreener');
});

test('BSC USDT regression: the broad pool list replaces the misleading batch selection', async () => {
  provider = async url => {
    if (url.hostname === 'lifi.example.test') return json({}, 404);
    assert(url.pathname.startsWith('/token-pairs/v1/bsc/'), 'Do not use the one-pool batch response');
    return json([pool({ pairAddress: 'outlier', priceUsd: '0.4458', liquidity: { usd: 515_988 } }), pool()]);
  };
  const [price] = await getTokenPrices([item]);
  assert.equal(price.priceUSD, '0.9996');
  assert.equal(price.pairAddress, 'deep-pool');
});

test('deep quote-side pools beat tiny base-side pools and use the correct price ratio', async () => {
  provider = async url => url.hostname === 'lifi.example.test' ? json({}, 404) : json([
    pool({ pairAddress: 'tiny-base', liquidity: { usd: 56 }, priceUsd: '0.45' }),
    pool({ pairAddress: 'deep-quote', baseToken: { address: USDC }, quoteToken: { address: USDT },
      priceUsd: '2000', priceNative: '2000', liquidity: { usd: 20_000_000 } }),
  ]);
  const [price] = await getTokenPrices([item]);
  assert.equal(price.priceUSD, '1');
  assert.equal(price.pairAddress, 'deep-quote');
});

test('an unavailable pool-list endpoint falls back to the alternate broad list', async () => {
  provider = async url => url.hostname === 'lifi.example.test' || url.pathname.startsWith('/token-pairs/')
    ? json({}, 503) : json({ pairs: [pool()] });
  assert.equal((await getTokenPrices([item]))[0].source, 'dexscreener');
  assert(calls.some(call => call.url.pathname.startsWith('/latest/dex/tokens/')));
});

test('unknown, illiquid, non-finite and wrong-chain pools do not fabricate a price', async () => {
  provider = async url => url.hostname === 'lifi.example.test' ? json({}, 404) : json([
    null, pool({ liquidity: { usd: 0 } }), pool({ chainId: 'ethereum' }),
    pool({ priceUsd: 'Infinity' }), pool({ baseToken: { address: USDC }, quoteToken: { address: USDT }, priceUsd: '1e308', priceNative: '1e-300' }),
  ]);
  const [price] = await getTokenPrices([item]);
  assert.equal(price.source, 'none');
  assert.equal(price.priceUSD, null);
});

test('Solana pool addresses remain case-sensitive', async () => {
  provider = async url => url.hostname === 'lifi.example.test' ? json({}, 404) : json([
    pool({ chainId: 'solana', baseToken: { address: MINT.replace('TDt', 'TDT') }, priceUsd: '500' }),
    pool({ chainId: 'solana', baseToken: { address: MINT }, liquidity: { usd: 100_000 }, priceUsd: '1' }),
  ]);
  assert.equal((await getTokenPrices([{ chainId: SOLANA_CHAIN_ID, address: MINT }]))[0].priceUSD, '1');
});

test('native tokens on every supported chain use wrapped contracts only for the DexScreener lookup', async () => {
  for (const chain of Object.values(CHAIN_META)) {
    provider = async url => {
      if (url.hostname === 'lifi.example.test') return json({}, 404);
      assert(url.pathname.endsWith(chain.wrappedNativeAddress));
      return json([pool({ chainId: chain.dexScreenerChain, baseToken: { address: chain.wrappedNativeAddress }, priceUsd: '10' })]);
    };
    const [price] = await getTokenPrices([{ chainId: chain.id, address: chain.nativeTokenAddress }]);
    assert.equal(price.address, chain.nativeTokenAddress);
    assert.equal(price.priceUSD, '10');
  }
});

test('simultaneous price lookups share the LI.FI request', async () => {
  const prices = await Promise.all(Array.from({ length: 8 }, () => getTokenPrices([item, item])));
  assert(prices.every(result => result.length === 1 && result[0].priceUSD === '1.0005'));
  assert.equal(calls.length, 1);
});

test('one failed token does not discard a successful price in the same request', async () => {
  provider = async url => url.hostname === 'lifi.example.test' && url.searchParams.get('token') === USDT ? lifi() : json({}, 503);
  const prices = await getTokenPrices([item, { ...item, address: USDC }]);
  assert.equal(prices[0].source, 'lifi');
  assert.equal(prices[1].source, 'none');
});

test('single, batch and native price routes keep their public response contracts', async () => {
  const single = await priceRoute(new NextRequest(`http://localhost/api/price?chainId=56&address=${USDT}`));
  assert.equal((await single.json()).priceUSD, '1.0005');
  const batch = await pricesRoute(new NextRequest('http://localhost/api/prices', {
    method: 'POST', body: JSON.stringify({ tokens: [item] }), headers: { 'content-type': 'application/json' },
  }));
  assert.equal((await batch.json()).prices[0].priceUSD, '1.0005');
  provider = async url => json({ chainId: 56, address: url.searchParams.get('token'), priceUSD: '750' });
  const native = await nativeRoute(new Request('http://localhost/api/native-price?chainId=56'));
  assert.deepEqual(await native.json(), { ok: true, usd: 750, source: 'lifi', cached: false });
});
