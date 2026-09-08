import { createPublicClient, decodeAbiParameters, hexToString, http, type Hex } from 'viem';

import { addressCacheKey, normalizeTokenAddressForChain } from '@/lib/addresses';
import { getChainMeta } from '@/lib/chainsMeta';
import { cacheGet, cacheSet } from '@/lib/server/cache';
import type { Address, Token } from '@/lib/types';

const REQUEST_TIMEOUT_MS = 4000;
const LIST_TTL_MS = 15 * 60_000;
const FAILED_LIST_TTL_MS = 15_000;
const listRequests = new Map<string, Promise<Token[]>>();

// Never guess decimals: an incorrect value changes the amount a user swaps.
function normalizeToken(value: unknown, chainId: number): Token | null {
  if (!value || typeof value !== 'object') return null;
  const item = value as Record<string, unknown>;
  if (item.chainId !== undefined && Number(item.chainId) !== chainId) return null;
  const address = normalizeTokenAddressForChain(chainId, String(item.address || ''));
  const name = typeof item.name === 'string' ? item.name.trim() : '';
  const symbol = typeof item.symbol === 'string' ? item.symbol.trim() : '';
  const rawDecimals = item.decimals;
  if (typeof rawDecimals !== 'number' && !(typeof rawDecimals === 'string' && /^\d+$/.test(rawDecimals))) {
    return null;
  }
  const decimals = Number(rawDecimals);
  if (!address || !name || !symbol || !Number.isInteger(decimals) || decimals < 0 || decimals > 255) return null;

  return {
    chainId,
    address,
    name: name.slice(0, 96),
    symbol: symbol.slice(0, 32),
    decimals,
    logoURI: typeof item.logoURI === 'string' && item.logoURI.trim() ? item.logoURI.trim() : undefined,
    coinKey: typeof item.coinKey === 'string' ? item.coinKey : undefined,
  };
}

function findToken(tokens: Token[], chainId: number, address: string) {
  const key = addressCacheKey(chainId, address);
  return tokens.find((token) => addressCacheKey(chainId, token.address) === key) || null;
}

async function fetchJson(url: string, headers: Record<string, string>) {
  const response = await fetch(url, {
    headers,
    cache: 'no-store',
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`Token provider returned HTTP ${response.status}`);
  return response.json();
}

async function cachedList(key: string, load: () => Promise<Token[]>): Promise<Token[]> {
  const cached = cacheGet<Token[]>(key);
  if (cached) return cached;
  const pending = listRequests.get(key);
  if (pending) return pending;

  const request = (async () => {
    try {
      const tokens = await load();
      cacheSet(key, tokens, LIST_TTL_MS);
      return tokens;
    } catch {
      // Avoid retry storms while wallet scanning resolves many tokens together.
      cacheSet(key, [], FAILED_LIST_TTL_MS);
      return [];
    }
  })();
  listRequests.set(key, request);
  try {
    return await request;
  } finally {
    listRequests.delete(key);
  }
}

export async function findLifiToken(chainId: number, address: string): Promise<Token | null> {
  const base = (process.env.LIFI_BASE_URL || 'https://li.quest').replace(/\/+$/, '');
  const headers: Record<string, string> = { accept: 'application/json' };
  if (process.env.LIFI_API_KEY) headers['x-lifi-api-key'] = process.env.LIFI_API_KEY;
  const integrator = process.env.LIFI_INTEGRATOR || 'swapdex-starter';
  const tokens = await cachedList(`metadata:lifi:${chainId}`, async () => {
    const json = await fetchJson(`${base}/v1/tokens?chains=${chainId}&integrator=${encodeURIComponent(integrator)}`, headers);
    const list = json?.tokens?.[String(chainId)] || json?.tokens;
    return (Array.isArray(list) ? list : [])
      .map((item: unknown) => normalizeToken(item, chainId))
      .filter((token: Token | null): token is Token => token !== null);
  });
  const listed = findToken(tokens, chainId, address);
  if (listed) return listed;

  // Address lookup also covers tokens that are absent from the curated list.
  try {
    const query = new URLSearchParams({ chain: String(chainId), token: address });
    const json = await fetchJson(`${base}/v1/token?${query}`, headers);
    const token = normalizeToken(json, chainId);
    return token && findToken([token], chainId, address);
  } catch {
    return null;
  }
}

export async function findOneInchToken(chainId: number, address: string): Promise<Token | null> {
  if (getChainMeta(chainId).chainType !== 'EVM') return null;
  const base = (process.env.ONEINCH_BASE_URL || 'https://api.1inch.com').replace(/\/+$/, '');
  const rawKey = (process.env.ONEINCH_AUTHORIZATION || process.env.ONEINCH_API_KEY || '').trim();
  const isPublicHost = new URL(base).hostname === 'api.1inch.io';
  if (!isPublicHost && !rawKey) return null;
  const headers: Record<string, string> = { accept: 'application/json' };
  if (!isPublicHost) headers.Authorization = /^bearer\s+/i.test(rawKey) ? rawKey : `Bearer ${rawKey}`;

  const tokens = await cachedList(`metadata:oneinch:${chainId}`, async () => {
    const path = `/v6.1/${chainId}/tokens`;
    const urls = base.endsWith('/swap')
      ? [`${base}${path}`]
      : isPublicHost ? [`${base}${path}`] : [`${base}/swap${path}`, `${base}${path}`];
    for (const url of urls) {
      try {
        const json = await fetchJson(url, headers);
        if (!json?.tokens || typeof json.tokens !== 'object') continue;
        return Object.values(json.tokens)
          .map((item) => normalizeToken(item, chainId))
          .filter((token): token is Token => token !== null);
      } catch (error) {
        // Older configured gateways may omit the /swap prefix. Authentication
        // and rate-limit failures should fall through to RPC without retrying.
        if (!(error instanceof Error) || !/HTTP 404$/.test(error.message)) throw error;
      }
    }
    throw new Error('Token list was unavailable');
  });
  return findToken(tokens, chainId, address);
}

function decodeTokenText(data: Hex): string {
  try {
    return decodeAbiParameters([{ type: 'string' }], data)[0].trim();
  } catch {
    // A few older ERC-20 contracts return fixed-width strings.
    if (data.length !== 66) throw new Error('Invalid token text');
    return hexToString(data, { size: 32 }).replace(/\0+$/, '').trim();
  }
}

export async function readRpcToken(chainId: number, address: string): Promise<Token | null> {
  if (getChainMeta(chainId).chainType !== 'EVM') return null;
  const rpcUrl = process.env[`ALCHEMY_RPC_URL_${chainId}`]?.trim() || process.env.ALCHEMY_RPC_URL?.trim();
  if (!rpcUrl) return null;
  try {
    const client = createPublicClient({ transport: http(rpcUrl, { timeout: REQUEST_TIMEOUT_MS, retryCount: 0 }) });
    const [rpcChainId, name, symbol, decimals] = await Promise.all([
      client.getChainId(),
      client.call({ to: address as Address, data: '0x06fdde03' }),
      client.call({ to: address as Address, data: '0x95d89b41' }),
      client.call({ to: address as Address, data: '0x313ce567' }),
    ]);
    if (rpcChainId !== chainId || !name.data || !symbol.data || !decimals.data) return null;
    return normalizeToken({
      address,
      name: decodeTokenText(name.data),
      symbol: decodeTokenText(symbol.data),
      decimals: Number(decodeAbiParameters([{ type: 'uint8' }], decimals.data)[0]),
    }, chainId);
  } catch {
    return null;
  }
}
