import assert from 'node:assert/strict';
import { after, afterEach, beforeEach, mock, test } from 'node:test';
import { neonConfig } from '@neondatabase/serverless';
import { encodeAbiParameters, stringToHex } from 'viem';
import { NextRequest } from 'next/server';

import { CHAIN_META, SOLANA_CHAIN_ID } from '../src/lib/chainsMeta';
import { getTokenMetadata } from '../src/lib/server/tokenMetadata';
import { GET as metadataRoute } from '../src/app/api/token-metadata/route';
import { GET as walletRoute } from '../src/app/api/wallet-tokens/route';

const ADDRESS = '0x1111111111111111111111111111111111111111';
const OTHER = '0x2222222222222222222222222222222222222222';
const TOKEN = { address: ADDRESS, name: 'Test Token', symbol: 'TEST', decimals: 6, logoURI: 'https://assets.example.test/token.png' };
const originalEnv = { ...process.env };
const originalNeonFetch = neonConfig.fetchFunction;
type Call = { url: URL; init: RequestInit };
let calls: Call[];
let dbQueries: Array<{ query: string; params: unknown[] }>;
let dbRow: Record<string, unknown> | null;
let dbUnavailable: boolean;
let provider: (call: Call) => Promise<Response>;

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const lifiList = (tokens: unknown[] = [], chain = 1) => json({ tokens: { [chain]: tokens } });
function cachedRow(ageDays = 0, decimals = 6) {
  return { chain_id: 1, address: ADDRESS, name: 'Cached Token', symbol: 'CACHED', decimals, logo_uri: TOKEN.logoURI,
    thumbnail_uri: null, possible_spam: null, fetched_at: new Date(Date.now() - ageDays * 86400_000).toISOString() };
}
function rpcResponse(call: Call, options: { chain?: string; legacy?: boolean; decimals?: number; missingDecimals?: boolean } = {}) {
  const body = JSON.parse(String(call.init.body));
  const data = body.params?.[0]?.data;
  let result: unknown;
  if (body.method === 'eth_chainId') result = options.chain || '0x1';
  else if (body.method === 'eth_getBalance') result = '0x0';
  else if (body.method === 'alchemy_getTokenBalances') result = { tokenBalances: [{ contractAddress: ADDRESS, tokenBalance: '0x2' }] };
  else if (data === '0x313ce567') result = options.missingDecimals ? '0x' : encodeAbiParameters([{ type: 'uint8' }], [options.decimals ?? 6]);
  else if (data === '0x06fdde03' || data === '0x95d89b41') {
    const text = data === '0x06fdde03' ? 'Contract Token' : 'RPC';
    result = options.legacy ? stringToHex(text, { size: 32 }) : encodeAbiParameters([{ type: 'string' }], [text]);
  } else throw new Error('Unexpected RPC request in test');
  return json({ jsonrpc: '2.0', id: body.id, result });
}
function missingLifi(call: Call) {
  return call.url.pathname.endsWith('/tokens') ? lifiList() : json({}, 404);
}

beforeEach(() => {
  calls = [];
  dbQueries = [];
  dbRow = null;
  dbUnavailable = false;
  (globalThis as typeof globalThis & { __nexoraCache: Map<string, unknown> }).__nexoraCache.clear();
  for (const key of Object.keys(process.env)) {
    if (/^(DATABASE_URL|LIFI_|ONEINCH_|ALCHEMY_)/.test(key)) delete process.env[key];
  }
  Object.assign(process.env, {
    DATABASE_URL: 'postgresql://test:test@database.example.test/test',
    LIFI_BASE_URL: 'https://lifi.example.test', LIFI_API_KEY: 'test-lifi-key',
    ONEINCH_BASE_URL: 'https://oneinch.example.test', ONEINCH_API_KEY: 'test-oneinch-key',
    ALCHEMY_RPC_URL_1: 'https://rpc.example.test',
  });
  provider = async ({ url }) => url.hostname === 'lifi.example.test' ? lifiList([TOKEN]) : json({}, 404);
  mock.method(globalThis, 'fetch', async (input: string | URL | Request, init: RequestInit = {}) => {
    const call = { url: new URL(input instanceof Request ? input.url : String(input)), init };
    calls.push(call);
    assert(['lifi.example.test', 'oneinch.example.test', 'rpc.example.test'].includes(call.url.hostname), 'No unexpected provider may receive a request');
    return provider(call);
  });
  // Use the actual Neon client with a fake HTTP transport; no database is contacted.
  neonConfig.fetchFunction = async (_input: unknown, init: RequestInit) => {
    const body = JSON.parse(String(init.body));
    dbQueries.push(body);
    if (dbUnavailable) return json({ message: 'Test database unavailable' }, 503);
    const row = /SELECT/.test(body.query) ? dbRow : null;
    return json({ command: row ? 'SELECT' : 'INSERT', rowCount: row ? 1 : 0,
      fields: row ? Object.keys(row).map(name => ({ name, dataTypeID: 25 })) : [],
      rows: row ? [Object.values(row).map(value => value === null ? null : String(value))] : [] });
  };
});

afterEach(() => mock.restoreAll());
after(() => {
  process.env = originalEnv;
  neonConfig.fetchFunction = originalNeonFetch;
});

test('native tokens on every supported chain require no provider request', async () => {
  for (const chain of Object.values(CHAIN_META)) {
    const result = await getTokenMetadata(chain.id, chain.nativeTokenAddress);
    assert.equal(result.source, 'local-native');
    assert.equal(result.token.decimals, chain.nativeDecimals);
  }
  assert.equal(calls.length, 0);
});

test('LI.FI wins and a repeat lookup uses memory without extra requests', async () => {
  const result = await getTokenMetadata(1, ADDRESS);
  assert.equal(result.source, 'lifi');
  assert.equal(result.token.logoURI, TOKEN.logoURI);
  assert.equal(calls.length, 1);
  assert.equal(new Headers(calls[0].init.headers).get('x-lifi-api-key'), 'test-lifi-key');
  assert.equal((await getTokenMetadata(1, ADDRESS)).source, 'memory');
  assert.equal(calls.length, 1);
});

test('LI.FI address lookup resolves custom tokens absent from its list', async () => {
  provider = async ({ url }) => url.pathname.endsWith('/tokens') ? lifiList() : json({ ...TOKEN, chainId: 1 });
  assert.equal((await getTokenMetadata(1, ADDRESS)).source, 'lifi');
  assert.equal(calls.length, 2);
  assert.equal(calls[1].url.searchParams.get('token'), ADDRESS);
});

test('a missing LI.FI token falls back to the authenticated 1inch swap token list', async () => {
  process.env.ONEINCH_API_KEY = 'Bearer test-oneinch-key';
  provider = async call => call.url.hostname === 'lifi.example.test' ? missingLifi(call) : json({ tokens: { [ADDRESS]: TOKEN } });
  assert.equal((await getTokenMetadata(1, ADDRESS)).source, 'oneinch');
  const oneinch = calls.find(call => call.url.hostname === 'oneinch.example.test')!;
  assert.equal(oneinch.url.pathname, '/swap/v6.1/1/tokens');
  assert.equal(new Headers(oneinch.init.headers).get('authorization'), 'Bearer test-oneinch-key');
});

test('legacy 1inch gateways without a swap prefix remain supported', async () => {
  provider = async call => {
    if (call.url.hostname === 'lifi.example.test') return missingLifi(call);
    return call.url.pathname.startsWith('/swap') ? json({}, 404) : json({ tokens: { [ADDRESS]: TOKEN } });
  };
  assert.equal((await getTokenMetadata(1, ADDRESS)).source, 'oneinch');
  assert(calls.some(call => call.url.pathname === '/v6.1/1/tokens'));
});

test('an unavailable LI.FI service still allows 1inch resolution', async () => {
  provider = async call => {
    if (call.url.hostname === 'lifi.example.test') throw new DOMException('Test timeout', 'TimeoutError');
    return json({ tokens: { [ADDRESS]: TOKEN } });
  };
  assert.equal((await getTokenMetadata(1, ADDRESS)).source, 'oneinch');
  assert(calls.filter(call => call.url.hostname === 'lifi.example.test').every(call => call.init.signal instanceof AbortSignal));
});

for (const status of [401, 429, 503]) {
  test(`1inch HTTP ${status} falls back to contract reads without retrying the API`, async () => {
    provider = async call => {
      if (call.url.hostname === 'lifi.example.test') return missingLifi(call);
      if (call.url.hostname === 'oneinch.example.test') return json({}, status);
      return rpcResponse(call);
    };
    const result = await getTokenMetadata(1, ADDRESS);
    assert.equal(result.source, 'rpc');
    assert.equal(result.token.symbol, 'RPC');
    assert.equal(calls.filter(call => call.url.hostname === 'oneinch.example.test').length, 1);
  });
}

test('missing 1inch credentials skip it and still permit RPC', async () => {
  delete process.env.ONEINCH_API_KEY;
  provider = async call => call.url.hostname === 'lifi.example.test' ? missingLifi(call) : rpcResponse(call);
  assert.equal((await getTokenMetadata(1, ADDRESS)).source, 'rpc');
  assert(!calls.some(call => call.url.hostname === 'oneinch.example.test'));
});

for (const decimals of [undefined, null, true, -1, 256, 6.5, 'invalid']) {
  test(`invalid provider decimals (${String(decimals)}) do not become an assumed 18`, async () => {
    provider = async call => {
      if (call.url.hostname === 'lifi.example.test') {
        const invalid = { ...TOKEN, decimals };
        return call.url.pathname.endsWith('/tokens') ? lifiList([invalid]) : json(invalid);
      }
      return json({ tokens: { [ADDRESS]: TOKEN } });
    };
    const result = await getTokenMetadata(1, ADDRESS);
    assert.equal(result.source, 'oneinch');
    assert.equal(result.token.decimals, 6);
  });
}

test('wrong-chain or wrong-address provider results cannot be imported', async () => {
  delete process.env.ALCHEMY_RPC_URL_1;
  provider = async call => {
    if (call.url.hostname === 'oneinch.example.test') return json({ tokens: {} });
    return call.url.pathname.endsWith('/tokens') ? lifiList([{ ...TOKEN, chainId: 56 }]) : json({ ...TOKEN, address: OTHER });
  };
  await assert.rejects(getTokenMetadata(1, ADDRESS), /Token information is unavailable/);
});

test('RPC on a different chain is rejected even when its token metadata decodes', async () => {
  provider = async call => call.url.hostname === 'lifi.example.test' ? missingLifi(call)
    : call.url.hostname === 'oneinch.example.test' ? json({ tokens: {} }) : rpcResponse(call, { chain: '0x38' });
  await assert.rejects(getTokenMetadata(1, ADDRESS), /Token information is unavailable/);
});

test('legacy bytes32 metadata and zero decimals survive RPC resolution', async () => {
  provider = async call => call.url.hostname === 'lifi.example.test' ? missingLifi(call)
    : call.url.hostname === 'oneinch.example.test' ? json({ tokens: {} }) : rpcResponse(call, { legacy: true, decimals: 0 });
  const result = await getTokenMetadata(1, ADDRESS);
  assert.equal(result.source, 'rpc');
  assert.equal(result.token.name, 'Contract Token');
  assert.equal(result.token.decimals, 0);
});

test('missing on-chain decimals cannot silently generate swap amounts', async () => {
  provider = async call => call.url.hostname === 'lifi.example.test' ? missingLifi(call)
    : call.url.hostname === 'oneinch.example.test' ? json({ tokens: {} }) : rpcResponse(call, { missingDecimals: true });
  await assert.rejects(getTokenMetadata(1, ADDRESS), /Token information is unavailable/);
});

test('simultaneous requests for the same token share one resolution', async () => {
  const results = await Promise.all(Array.from({ length: 8 }, () => getTokenMetadata(1, ADDRESS)));
  assert(results.every(result => result.token.symbol === 'TEST'));
  assert.equal(calls.length, 1);
});

test('different tokens in a wallet share one provider list request', async () => {
  provider = async () => lifiList([TOKEN, { ...TOKEN, address: OTHER }]);
  await Promise.all([getTokenMetadata(1, ADDRESS), getTokenMetadata(1, OTHER)]);
  assert.equal(calls.length, 1);
});

test('Solana addresses retain case and never use EVM-only fallbacks', async () => {
  const mint = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
  provider = async call => {
    assert.equal(call.url.hostname, 'lifi.example.test');
    const token = { ...TOKEN, chainId: SOLANA_CHAIN_ID, address: mint };
    return call.url.pathname.endsWith('/tokens') ? lifiList([{ ...token, address: mint.replace('TDt', 'TDT') }], SOLANA_CHAIN_ID) : json(token);
  };
  const result = await getTokenMetadata(SOLANA_CHAIN_ID, mint);
  assert.equal(result.token.address, mint);
  assert.equal(result.source, 'lifi');
  assert.equal(calls.length, 2);
});

test('fresh database metadata preserves zero decimals without provider requests', async () => {
  dbRow = cachedRow(0, 0);
  const result = await getTokenMetadata(1, ADDRESS);
  assert.equal(result.source, 'neon');
  assert.equal(result.token.decimals, 0);
  assert.equal(calls.length, 0);
});

test('all-provider failure uses existing stale database metadata', async () => {
  dbRow = cachedRow(40);
  provider = async () => json({}, 503);
  const result = await getTokenMetadata(1, ADDRESS);
  assert.equal(result.source, 'neon-stale');
  assert.equal(result.token.logoURI, TOKEN.logoURI);
});

test('provider refresh preserves cached artwork and existing ancillary database fields', async () => {
  dbRow = cachedRow(40);
  provider = async () => lifiList([{ ...TOKEN, logoURI: undefined }]);
  const result = await getTokenMetadata(1, ADDRESS);
  assert.equal(result.source, 'lifi');
  assert.equal(result.token.logoURI, TOKEN.logoURI);
  const update = dbQueries.find(query => query.query.includes('ON CONFLICT'))!.query;
  assert(!/thumbnail_uri\s*=|possible_spam\s*=/.test(update));
});

test('database failures do not prevent live metadata resolution', async () => {
  dbUnavailable = true;
  const result = await getTokenMetadata(1, ADDRESS);
  assert.equal(result.source, 'lifi');
  assert.equal(result.dbCache, 'error');
});

test('metadata API keeps its response shape for token imports and shared links', async () => {
  const response = await metadataRoute(new NextRequest(`http://localhost/api/token-metadata?chainId=1&address=${ADDRESS}`));
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.token.address, ADDRESS);
  assert.equal(body.source, 'lifi');
  assert.equal(body.token.decimals, 6);
});

test('wallet token lists keep a valid zero-decimal token and format its balance correctly', async () => {
  provider = async call => call.url.hostname === 'lifi.example.test' ? lifiList([{ ...TOKEN, decimals: 0 }]) : rpcResponse(call);
  const response = await walletRoute(new NextRequest(`http://localhost/api/wallet-tokens?chainId=1&address=${OTHER}`));
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.tokens.length, 1);
  assert.equal(body.tokens[0].balanceFormatted, '2');
  assert.equal(body.tokens[0].decimals, 0);
});

test('invalid addresses fail before accessing a provider', async () => {
  await assert.rejects(getTokenMetadata(1, 'not-an-address'), /Invalid address/);
  assert.equal(calls.length, 0);
});
