import { getAddress } from 'viem';

import { getChainMeta } from '@/lib/chainsMeta';
import { addressCacheKey, normalizeSolanaAddress, normalizeTokenAddressForChain } from '@/lib/addresses';
import type { TokenAddress } from '@/lib/types';
import { cacheGet, cacheSet } from '@/lib/server/cache';
import { getCacheSql, isDatabaseConfigured } from '@/lib/server/db';
import { getLifiTokenPrice } from '@/lib/server/lifiPrices';

const PRICE_TTL_MS = 30_000;
const FORCE_MIN_TTL_MS = 10_000;
const PROVIDER_TIMEOUT_MS = 4000;
const pendingPools = new Map<string, Promise<DexPair[]>>();

type PriceCacheRow = {
  chain_id: number;
  address: string;
  price_usd: string;
  pair_address: string | null;
  dex_id: string | null;
  liquidity_usd: string | null;
  fetched_at: string;
};

type DexPair = {
  chainId?: string;
  dexId?: string;
  pairAddress?: string;
  priceUsd?: string;
  priceNative?: string;
  liquidity?: { usd?: number | string };
  baseToken?: { address?: string; symbol?: string };
  quoteToken?: { address?: string; symbol?: string };
};

export type TokenPrice = {
  chainId: number;
  address: TokenAddress;
  priceUSD: string | null;
  source: 'lifi' | 'dexscreener' | 'neon' | 'memory' | 'none';
  pairAddress?: string;
  dexId?: string;
  liquidityUsd?: string;
  cached?: boolean;
};

function normalizeAddress(chainId: number, address: string): TokenAddress | null {
  return normalizeTokenAddressForChain(chainId, address);
}

function lookupAddress(chainId: number, address: string): TokenAddress {
  const meta = getChainMeta(chainId);
  if (address.toLowerCase() === meta.nativeTokenAddress.toLowerCase()) {
    return meta.chainType === 'EVM'
      ? (getAddress(meta.wrappedNativeAddress) as TokenAddress)
      : normalizeSolanaAddress(meta.wrappedNativeAddress) || meta.wrappedNativeAddress;
  }
  return meta.chainType === 'EVM' ? (getAddress(address) as TokenAddress) : normalizeSolanaAddress(address) || address;
}

function outputAddress(chainId: number, address: string): TokenAddress {
  const meta = getChainMeta(chainId);
  if (address.toLowerCase() === meta.nativeTokenAddress.toLowerCase()) return meta.nativeTokenAddress;
  return meta.chainType === 'EVM' ? (getAddress(address) as TokenAddress) : normalizeSolanaAddress(address) || address;
}

function cacheKey(chainId: number, address: string) {
  return `price:${chainId}:${addressCacheKey(chainId, address)}`;
}

function rowToPrice(row: PriceCacheRow, source: 'neon'): TokenPrice {
  return {
    chainId: Number(row.chain_id),
    address: outputAddress(Number(row.chain_id), row.address),
    priceUSD: row.price_usd,
    pairAddress: row.pair_address || undefined,
    dexId: row.dex_id || undefined,
    liquidityUsd: row.liquidity_usd || undefined,
    source,
    cached: true,
  };
}

async function getDbPrice(chainId: number, address: string, maxAgeMs: number) {
  if (!isDatabaseConfigured()) return null;
  try {
    const sql = await getCacheSql();
    if (!sql) return null;
    const rows = (await sql`
      SELECT chain_id, address, price_usd, pair_address, dex_id, liquidity_usd, fetched_at
      FROM token_price_cache
      WHERE chain_id = ${chainId} AND address = ${addressCacheKey(chainId, address)}
      LIMIT 1
    `) as PriceCacheRow[];
    const row = rows[0];
    if (!row) return null;
    const age = Date.now() - new Date(row.fetched_at).getTime();
    return age < maxAgeMs ? rowToPrice(row, 'neon') : null;
  } catch {
    return null;
  }
}

async function upsertDbPrice(price: TokenPrice) {
  if (!isDatabaseConfigured() || !price.priceUSD) return;
  try {
    const sql = await getCacheSql();
    if (!sql) return;
    await sql`
      INSERT INTO token_price_cache (
        chain_id, address, price_usd, pair_address, dex_id, liquidity_usd, fetched_at
      )
      VALUES (
        ${price.chainId},
        ${addressCacheKey(price.chainId, String(price.address))},
        ${price.priceUSD},
        ${price.pairAddress || null},
        ${price.dexId || null},
        ${price.liquidityUsd || null},
        now()
      )
      ON CONFLICT (chain_id, address)
      DO UPDATE SET
        price_usd = EXCLUDED.price_usd,
        pair_address = EXCLUDED.pair_address,
        dex_id = EXCLUDED.dex_id,
        liquidity_usd = EXCLUDED.liquidity_usd,
        fetched_at = now()
    `;
  } catch {
    // DB cache is best-effort; never block live prices on it.
  }
}

function pairLiquidity(pair: DexPair) {
  const n = Number(pair?.liquidity?.usd || 0);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function priceForRequestedToken(pair: DexPair, chainId: number, requestedAddress: string) {
  const requested = addressCacheKey(chainId, requestedAddress);
  const base = addressCacheKey(chainId, String(pair.baseToken?.address || ''));
  const quote = addressCacheKey(chainId, String(pair.quoteToken?.address || ''));
  const baseUsd = Number(pair.priceUsd || 0);

  if (!Number.isFinite(baseUsd) || baseUsd <= 0) return null;
  if (base === requested) return String(pair.priceUsd);

  if (quote === requested) {
    const baseInQuote = Number(pair.priceNative || 0);
    if (Number.isFinite(baseInQuote) && baseInQuote > 0) {
      const quoteUsd = baseUsd / baseInQuote;
      return Number.isFinite(quoteUsd) && quoteUsd > 0 ? String(quoteUsd) : null;
    }
  }

  return null;
}

export function selectDexScreenerPair(pairs: DexPair[], chainId: number, requestedAddress: string) {
  const chainSlug = getChainMeta(chainId).dexScreenerChain;
  const sameChain = pairs.filter(
    (pair) => String(pair.chainId || '').toLowerCase() === chainSlug.toLowerCase() && pairLiquidity(pair) > 0
  );

  const priced = sameChain
    .map((pair) => ({ pair, priceUSD: priceForRequestedToken(pair, chainId, requestedAddress) }))
    .filter((item): item is { pair: DexPair; priceUSD: string } => Boolean(item.priceUSD));

  // Pair orientation is not a quality signal. Deep quote-side pools must not
  // lose to tiny base-side pools; quote prices are converted above.
  priced.sort((a, b) => pairLiquidity(b.pair) - pairLiquidity(a.pair));
  return priced[0] || null;
}

async function fetchDexPairs(chainSlug: string, addresses: string[]) {
  if (!addresses.length) return [] as DexPair[];
  const base = (process.env.DEXSCREENER_BASE_URL || 'https://api.dexscreener.com').replace(/\/+$/, '');
  const perToken = await Promise.all(addresses.map(async (address) => {
    const key = `${chainSlug}:${address}`;
    const existing = pendingPools.get(key);
    if (existing) return existing;
    const request = (async () => {
      // The batch token endpoint can return just one unrepresentative pool.
      // Request the pool list so liquidity ranking can compare real candidates.
      const urls = [
        `${base}/token-pairs/v1/${encodeURIComponent(chainSlug)}/${encodeURIComponent(address)}`,
        `${base}/latest/dex/tokens/${encodeURIComponent(address)}`,
      ];
      for (const url of urls) {
        try {
          const res = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS) });
          if (!res.ok) continue;
          const json = await res.json();
          const pairs = Array.isArray(json) ? json : json?.pairs;
          if (Array.isArray(pairs)) return pairs.filter((pair) => pair && typeof pair === 'object') as DexPair[];
        } catch {
          // Try the alternate pool-list endpoint without blocking other tokens.
        }
      }
      return [] as DexPair[];
    })();
    pendingPools.set(key, request);
    try { return await request; } finally { pendingPools.delete(key); }
  }));
  return perToken.flat();
}

export async function getTokenPrices(
  tokens: Array<{ chainId: number; address: string }>,
  options: { force?: boolean } = {}
): Promise<TokenPrice[]> {
  const deduped = new Map<string, { chainId: number; address: TokenAddress; lookup: TokenAddress }>();

  for (const token of tokens) {
    const normalized = normalizeAddress(token.chainId, token.address);
    if (!normalized) continue;
    const address = outputAddress(token.chainId, normalized);
    const lookup = lookupAddress(token.chainId, normalized);
    deduped.set(`${token.chainId}:${addressCacheKey(token.chainId, String(address))}`, {
      chainId: token.chainId,
      address,
      lookup,
    });
  }

  const output = new Map<string, TokenPrice>();
  const misses: Array<{ chainId: number; address: TokenAddress; lookup: TokenAddress }> = [];
  const cacheMaxAge = options.force ? FORCE_MIN_TTL_MS : PRICE_TTL_MS;

  for (const token of deduped.values()) {
    const key = cacheKey(token.chainId, token.address);
    const memoryHit = cacheGet<TokenPrice>(key);
    if (memoryHit && memoryHit.priceUSD && !options.force) {
      output.set(key, { ...memoryHit, source: 'memory', cached: true });
      continue;
    }

    const dbHit = await getDbPrice(token.chainId, token.address, cacheMaxAge);
    if (dbHit) {
      cacheSet(key, dbHit, PRICE_TTL_MS);
      output.set(key, dbHit);
      continue;
    }

    misses.push(token);
  }

  const missesByChain = new Map<number, Array<{ chainId: number; address: TokenAddress; lookup: TokenAddress }>>();
  await Promise.all(misses.map(async (miss) => {
    const priceUSD = await getLifiTokenPrice(miss.chainId, miss.address);
    if (priceUSD) {
      const price: TokenPrice = { chainId: miss.chainId, address: miss.address, priceUSD, source: 'lifi', cached: false };
      const key = cacheKey(miss.chainId, miss.address);
      await upsertDbPrice(price);
      cacheSet(key, price, PRICE_TTL_MS);
      output.set(key, price);
      return;
    }
    const list = missesByChain.get(miss.chainId) || [];
    list.push(miss);
    missesByChain.set(miss.chainId, list);
  }));

  await Promise.all(
    Array.from(missesByChain.entries()).map(async ([chainId, chainMisses]) => {
      const meta = getChainMeta(chainId);
      const pairs = await fetchDexPairs(
        meta.dexScreenerChain,
        Array.from(new Set(chainMisses.map((miss) => miss.lookup)))
      );

      for (const miss of chainMisses) {
        const selected = selectDexScreenerPair(pairs, chainId, miss.lookup);
        const key = cacheKey(miss.chainId, miss.address);

        const price: TokenPrice = selected
          ? {
              chainId: miss.chainId,
              address: miss.address,
              priceUSD: selected.priceUSD,
              source: 'dexscreener',
              pairAddress: selected.pair.pairAddress,
              dexId: selected.pair.dexId,
              liquidityUsd:
                selected.pair.liquidity?.usd !== undefined
                  ? String(selected.pair.liquidity.usd)
                  : undefined,
              cached: false,
            }
          : {
              chainId: miss.chainId,
              address: miss.address,
              priceUSD: null,
              source: 'none',
              cached: false,
            };

        if (price.priceUSD) {
          await upsertDbPrice(price);
          cacheSet(key, price, PRICE_TTL_MS);
        } else {
          cacheSet(key, price, 10_000);
        }
        output.set(key, price);
      }
    })
  );

  return Array.from(deduped.values()).map((token) => {
    const key = cacheKey(token.chainId, token.address);
    return (
      output.get(key) || {
        chainId: token.chainId,
        address: token.address,
        priceUSD: null,
        source: 'none',
        cached: false,
      }
    );
  });
}
