import { addressCacheKey, normalizeTokenAddressForChain } from '@/lib/addresses';

const pending = new Map<string, Promise<string | null>>();

export async function getLifiTokenPrice(chainId: number, address: string): Promise<string | null> {
  const key = `${chainId}:${addressCacheKey(chainId, address)}`;
  const existing = pending.get(key);
  if (existing) return existing;
  const request = (async () => {
    try {
      const base = (process.env.LIFI_BASE_URL || 'https://li.quest').replace(/\/+$/, '');
      const query = new URLSearchParams({ chain: String(chainId), token: address });
      const headers: Record<string, string> = { accept: 'application/json' };
      if (process.env.LIFI_API_KEY) headers['x-lifi-api-key'] = process.env.LIFI_API_KEY;
      const response = await fetch(`${base}/v1/token?${query}`, {
        headers, cache: 'no-store', signal: AbortSignal.timeout(4000),
      });
      if (!response.ok) return null;
      const token = await response.json();
      const returnedAddress = normalizeTokenAddressForChain(chainId, String(token?.address || ''));
      if (Number(token?.chainId) !== chainId || !returnedAddress
        || addressCacheKey(chainId, returnedAddress) !== addressCacheKey(chainId, address)) return null;
      const raw = token.priceUSD;
      if (typeof raw !== 'string' && typeof raw !== 'number') return null;
      const price = Number(raw);
      return Number.isFinite(price) && price > 0 ? String(raw).trim() : null;
    } catch {
      return null;
    }
  })();
  pending.set(key, request);
  try { return await request; } finally { pending.delete(key); }
}
