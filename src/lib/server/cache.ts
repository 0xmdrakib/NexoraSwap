type CacheEntry<T> = { v: T; exp: number };

// Very small in-memory cache (helps during local dev; in serverless it may reset).
const g = globalThis as any;
if (!g.__nexoraCache) g.__nexoraCache = new Map<string, CacheEntry<any>>();
const cache: Map<string, CacheEntry<any>> = g.__nexoraCache;

export function cacheGet<T>(key: string): T | null {
  const hit = cache.get(key);
  if (!hit) return null;
  if (Date.now() > hit.exp) {
    cache.delete(key);
    return null;
  }
  return hit.v as T;
}

export function cacheSet<T>(key: string, value: T, ttlMs: number) {
  cache.set(key, { v: value, exp: Date.now() + ttlMs });
}
