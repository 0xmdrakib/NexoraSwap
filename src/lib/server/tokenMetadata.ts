import { getAddress, isAddress } from 'viem';

import { getChainMeta } from '@/lib/chainsMeta';
import { addressCacheKey, normalizeSolanaAddress, normalizeTokenAddressForChain } from '@/lib/addresses';
import { findLifiToken, findOneInchToken, readRpcToken } from '@/lib/server/tokenMetadataProviders';
import type { Address, Token } from '@/lib/types';
import { cacheGet, cacheSet } from '@/lib/server/cache';
import { getCacheSql, isDatabaseConfigured } from '@/lib/server/db';

const ZERO: Address = '0x0000000000000000000000000000000000000000';
const METADATA_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const MEMORY_TTL_MS = 60 * 60 * 1000;
const pendingMetadata = new Map<string, Promise<TokenMetadataResult>>();
type MetadataProvider = 'lifi' | 'oneinch' | 'rpc';

type CachedMetadataRow = {
  chain_id: number;
  address: string;
  name: string;
  symbol: string;
  decimals: number;
  logo_uri: string | null;
  thumbnail_uri: string | null;
  possible_spam: boolean | null;
  fetched_at: string;
};

export type TokenMetadataResult = {
  token: Token;
  source: 'local-native' | 'neon' | 'neon-stale' | 'memory' | MetadataProvider;
  dbCache: 'enabled' | 'disabled' | 'error';
};

export function toChecksumAddress(value: string): Address | null {
  const s = value.trim();
  if (!isAddress(s, { strict: false })) return null;
  try {
    return getAddress(s) as Address;
  } catch {
    return null;
  }
}

export function normalizeTokenAddress(value: string): string | null {
  const addr = toChecksumAddress(value);
  return addr ? addr.toLowerCase() : null;
}

function isNativeAddress(address: string) {
  return address.toLowerCase() === ZERO;
}

function tokenFromRow(row: CachedMetadataRow): Token {
  const meta = getChainMeta(Number(row.chain_id));
  const address =
    meta.chainType === 'EVM'
      ? (getAddress(row.address) as Address)
      : (normalizeSolanaAddress(row.address) || row.address);

  return {
    chainId: Number(row.chain_id),
    address,
    name: row.name,
    symbol: row.symbol,
    decimals: Number(row.decimals ?? 18),
    logoURI: row.logo_uri || row.thumbnail_uri || undefined,
  };
}

function localNativeToken(chainId: number): Token {
  const meta = getChainMeta(chainId);
  return {
    chainId,
    address: meta.nativeTokenAddress,
    symbol: meta.nativeSymbol,
    name: meta.nativeSymbol,
    decimals: meta.nativeDecimals,
    logoURI: meta.logoUrl,
  };
}

async function getDbToken(chainId: number, address: string) {
  if (!isDatabaseConfigured()) return { dbCache: 'disabled' as const, row: null };

  try {
    const sql = await getCacheSql();
    if (!sql) return { dbCache: 'disabled' as const, row: null };
    const rows = (await sql`
      SELECT chain_id, address, name, symbol, decimals, logo_uri, thumbnail_uri, possible_spam, fetched_at
      FROM token_metadata
      WHERE chain_id = ${chainId} AND address = ${address}
      LIMIT 1
    `) as CachedMetadataRow[];
    return { dbCache: 'enabled' as const, row: rows[0] || null };
  } catch {
    return { dbCache: 'error' as const, row: null };
  }
}

async function upsertDbToken(
  token: Token,
  source: MetadataProvider,
) {
  if (!isDatabaseConfigured()) return 'disabled' as const;

  try {
    const meta = getChainMeta(token.chainId);
    const storedAddress =
      meta.chainType === 'EVM'
        ? String(token.address).toLowerCase()
        : normalizeSolanaAddress(String(token.address)) || String(token.address);
    const sql = await getCacheSql();
    if (!sql) return 'disabled' as const;
    await sql`
      INSERT INTO token_metadata (
        chain_id, address, name, symbol, decimals, logo_uri, thumbnail_uri, possible_spam, source, fetched_at, updated_at
      )
      VALUES (
        ${token.chainId},
        ${storedAddress},
        ${token.name},
        ${token.symbol},
        ${token.decimals},
        ${token.logoURI || null},
        ${null},
        ${null},
        ${source},
        now(),
        now()
      )
      ON CONFLICT (chain_id, address)
      DO UPDATE SET
        name = EXCLUDED.name,
        symbol = EXCLUDED.symbol,
        decimals = EXCLUDED.decimals,
        logo_uri = COALESCE(EXCLUDED.logo_uri, token_metadata.logo_uri),
        source = EXCLUDED.source,
        fetched_at = now(),
        updated_at = now()
    `;
    return 'enabled' as const;
  } catch {
    return 'error' as const;
  }
}

export async function getTokenMetadata(chainId: number, addressInput: string): Promise<TokenMetadataResult> {
  const normalized = normalizeTokenAddressForChain(chainId, addressInput);
  if (!normalized) throw new Error('Invalid address');
  const normalizedKey = addressCacheKey(chainId, normalized);

  const meta = getChainMeta(chainId);
  if (normalizedKey === addressCacheKey(chainId, meta.nativeTokenAddress) || isNativeAddress(normalizedKey)) {
    return {
      token: localNativeToken(chainId),
      source: 'local-native',
      dbCache: isDatabaseConfigured() ? 'enabled' : 'disabled',
    };
  }

  const memoryKey = `tokenMeta:${chainId}:${normalizedKey}`;
  const memoryHit = cacheGet<Token>(memoryKey);
  if (memoryHit) {
    return {
      token: memoryHit,
      source: 'memory',
      dbCache: isDatabaseConfigured() ? 'enabled' : 'disabled',
    };
  }

  const pending = pendingMetadata.get(memoryKey);
  if (pending) return pending;
  const request = resolveMetadata(chainId, normalized, normalizedKey, memoryKey);
  pendingMetadata.set(memoryKey, request);
  try {
    return await request;
  } finally {
    pendingMetadata.delete(memoryKey);
  }
}

async function resolveMetadata(
  chainId: number,
  normalized: string,
  normalizedKey: string,
  memoryKey: string,
): Promise<TokenMetadataResult> {
  const meta = getChainMeta(chainId);

  const dbHit = await getDbToken(chainId, normalizedKey);
  const row = dbHit.row;
  const rowAge = row ? Date.now() - new Date(row.fetched_at).getTime() : Number.POSITIVE_INFINITY;
  if (row && rowAge < METADATA_TTL_MS) {
    const token = tokenFromRow(row);
    cacheSet(memoryKey, token, MEMORY_TTL_MS);
    return { token, source: 'neon', dbCache: dbHit.dbCache };
  }

  const providers: Array<[MetadataProvider, typeof findLifiToken]> = [['lifi', findLifiToken]];
  if (meta.chainType === 'EVM') {
    providers.push(['oneinch', findOneInchToken], ['rpc', readRpcToken]);
  }

  for (const [source, resolve] of providers) {
    try {
      const resolved = await resolve(chainId, normalized);
      if (!resolved) continue;
      const token = {
        ...resolved,
        // RPC cannot supply a logo; retain any previously cached artwork.
        logoURI: resolved.logoURI || row?.logo_uri || row?.thumbnail_uri || undefined,
      };
      const dbCache = await upsertDbToken(token, source);
      cacheSet(memoryKey, token, MEMORY_TTL_MS);
      return { token, source, dbCache };
    } catch {
      // Provider failures must not prevent trying the next source.
    }
  }

  if (row) {
    const token = tokenFromRow(row);
    cacheSet(memoryKey, token, 15 * 60 * 1000);
    return { token, source: 'neon-stale', dbCache: dbHit.dbCache };
  }
  throw new Error('Token information is unavailable on this network. Check the token address or try again later.');
}
