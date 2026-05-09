'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

import type { Address, Token } from '@/lib/types';

const BALANCE_REFRESH_MS = 45_000;
const ACTIVE_WINDOW_MS = 5 * 60_000;
const MAX_POLLS = 8;

export type TokenBalanceState = {
  balances: Record<string, string>;
  loading: boolean;
};

export function balanceKey(chainId: number, address: string) {
  return `${chainId}:${address.toLowerCase()}`;
}

export function useTokenBalances(
  walletAddress: Address | undefined,
  tokens: Array<Token | null | undefined>,
  options: { refreshSignal?: number } = {}
): TokenBalanceState {
  const [balances, setBalances] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [activityNonce, setActivityNonce] = useState(0);
  const lastRefreshSignal = useRef(options.refreshSignal || 0);

  const tokensKey = tokens
    .map((token) => (token?.chainId && token.address ? `${token.chainId}:${token.address.toLowerCase()}` : ''))
    .filter(Boolean)
    .join('|');

  const balanceItems = useMemo(() => {
    const seen = new Set<string>();
    const out: Array<{ chainId: number; address: string }> = [];

    for (const token of tokens) {
      if (!token?.chainId || !token.address) continue;
      const key = balanceKey(token.chainId, token.address);
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ chainId: token.chainId, address: token.address });
    }

    return out;
  }, [tokensKey]);

  const itemsKey = useMemo(
    () => balanceItems.map((item) => `${item.chainId}:${item.address.toLowerCase()}`).join('|'),
    [balanceItems]
  );

  useEffect(() => {
    if (typeof document === 'undefined') return;
    const onVisible = () => {
      if (!document.hidden) setActivityNonce((value) => value + 1);
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onVisible);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onVisible);
    };
  }, []);

  useEffect(() => {
    if (!walletAddress || !balanceItems.length) {
      setBalances({});
      setLoading(false);
      return;
    }

    let cancelled = false;
    let pollCount = 0;
    const startedAt = Date.now();
    const refreshSignal = options.refreshSignal || 0;
    const forceFirst = refreshSignal !== lastRefreshSignal.current;
    lastRefreshSignal.current = refreshSignal;

    async function load(force = false) {
      if (typeof document !== 'undefined' && document.hidden) return;
      if (Date.now() - startedAt > ACTIVE_WINDOW_MS) return;
      if (pollCount >= MAX_POLLS) return;

      pollCount += 1;
      setLoading(true);
      try {
        const res = await fetch('/api/balances', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ address: walletAddress, tokens: balanceItems, force }),
          cache: 'no-store',
        });
        const json = await res.json().catch(() => null);
        if (!res.ok) throw new Error(json?.error || 'Balance fetch failed');
        if (cancelled) return;

        setBalances((prev) => {
          const next = { ...prev };
          for (const balance of Array.isArray(json?.balances) ? json.balances : []) {
            next[balanceKey(Number(balance?.chainId), String(balance?.address || ''))] = String(
              balance?.balance || '0'
            );
          }
          return next;
        });
      } catch {
        if (!cancelled) {
          setBalances((prev) => {
            const next = { ...prev };
            for (const item of balanceItems) delete next[balanceKey(item.chainId, item.address)];
            return next;
          });
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load(forceFirst);
    const interval = window.setInterval(() => load(false), BALANCE_REFRESH_MS);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [walletAddress, itemsKey, activityNonce, options.refreshSignal, balanceItems]);

  return { balances, loading };
}
