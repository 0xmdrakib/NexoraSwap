'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, Search, X } from 'lucide-react';
import { useAccount, useBalance } from 'wagmi';
import { getAddress, isAddress } from 'viem';

import type { Address, Token } from '@/lib/types';
import { CHAIN_META } from '@/lib/chainsMeta';
import { formatTokenAmount } from '@/lib/format';
import { useTokenList } from '@/lib/hooks/useTokenList';

type Props = {
  label?: string;
  chainId: number;
  token: Token | null;
  onTokenSelected: (token: Token) => void;
  showChainPicker?: boolean;
  onChainSelected?: (chainId: number) => void;
  disabled?: boolean;
};

type WalletToken = {
  token_address: string;
  name: string;
  symbol: string;
  decimals: number;
  balance: string; // raw string
  balanceFormatted?: string; // optional pre-formatted from API
  logo?: string | null;
  thumbnail?: string | null;
  usdPrice?: string;
  usdValue?: string;
};

const POPULAR_SYMBOLS = ['ETH', 'WETH', 'USDC', 'USDT', 'DAI', 'WBTC'];

function normalizeAddr(addr?: string | null) {
  return (addr || '').toLowerCase();
}

function isZeroAddress(addr: string) {
  return normalizeAddr(addr) === '0x0000000000000000000000000000000000000000';
}

function toSafeAddress(addr?: string | null): Address | null {
  if (!addr) return null;
  // Many upstream APIs return lowercase/non-checksummed addresses.
  // Validate loosely, then checksum so it satisfies our `Address` type.
  if (!isAddress(addr, { strict: false })) return null;
  return getAddress(addr) as Address;
}

function ChainIcon({ chainId, size = 18 }: { chainId: number; size?: number }) {
  const meta = CHAIN_META[chainId];
  const [broken, setBroken] = useState(false);

  if (!meta || broken) return null;

  // Use <img> to avoid next/image remote domain config for dev zips
  return (
    <img
      src={meta.logoUrl}
      alt={meta.name}
      width={size}
      height={size}
      className="rounded-full"
      onError={() => setBroken(true)}
    />
  );
}

function TokenLogo({ token, chainId, size = 28, fallback }: { token: Token; chainId: number; size?: number; fallback?: string }) {
  const [broken, setBroken] = useState(false);

  const logo =
    isZeroAddress(token.address) ? CHAIN_META[chainId]?.logoUrl : token.logoURI;

  if (!logo || broken) {
    const letter = (fallback || token.symbol || '?').slice(0, 1).toUpperCase();
    return (
      <div
        style={{ width: size, height: size }}
        className="grid place-items-center rounded-full bg-white/10 text-[12px] font-semibold text-white/80"
        aria-hidden="true"
      >
        {letter}
      </div>
    );
  }

  return (
    <img
      src={logo}
      alt={token.symbol}
      width={size}
      height={size}
      className="rounded-full"
      onError={() => setBroken(true)}
    />
  );
}

function TokenRow({
  chainId,
  token,
  balanceText,
  onPick,
}: {
  chainId: number;
  token: Token;
  balanceText: string;
  onPick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onPick}
      className="w-full rounded-xl px-3 py-2 text-left hover:bg-white/5 active:bg-white/10"
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <TokenLogo token={token} chainId={chainId} />
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <div className="truncate text-sm font-semibold text-white">{token.symbol}</div>
              <div className="truncate text-xs text-white/50">{token.name}</div>
            </div>
            <div className="truncate text-[11px] text-white/35">{token.address}</div>
          </div>
        </div>

        <div className="shrink-0 text-right text-sm font-semibold text-white/80">
          {balanceText}
        </div>
      </div>
    </button>
  );
}

export default function TokenSelect({
  label,
  chainId,
  token,
  onTokenSelected,
  showChainPicker = false,
  onChainSelected,
  disabled = false,
}: Props) {
  const { address } = useAccount();
  const { tokens, loading, error, addCustomToken } = useTokenList(chainId);

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [customAddr, setCustomAddr] = useState('');
  const [customError, setCustomError] = useState<string | null>(null);
  const [addingCustom, setAddingCustom] = useState(false);

  const [walletTokens, setWalletTokens] = useState<WalletToken[]>([]);
  const [walletLoading, setWalletLoading] = useState(false);

  const [chainMenuOpen, setChainMenuOpen] = useState(false);
  const chainMenuRef = useRef<HTMLDivElement | null>(null);

  const nativeBalance = useBalance({
    address,
    chainId,
    query: {
      enabled: Boolean(address),
    },
  });

  // When chain changes (including while the modal is open), reset transient UI state immediately.
  // This prevents showing stale tokens/balances until refetch completes.
  useEffect(() => {
    setQuery('');
    setCustomAddr('');
    setCustomError(null);
    setAddingCustom(false);
    setWalletTokens([]);
  }, [chainId]);

  // When the modal closes, clear the custom contract input so it feels "fresh" next time.
  useEffect(() => {
    if (open) return;
    setQuery('');
    setCustomAddr('');
    setCustomError(null);
    setAddingCustom(false);
  }, [open]);

  // Close chain menu on outside click
  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!chainMenuOpen) return;
      const el = chainMenuRef.current;
      if (!el) return;
      if (!el.contains(e.target as Node)) setChainMenuOpen(false);
    }
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [chainMenuOpen]);

  // Fetch wallet tokens (Moralis)
  useEffect(() => {
    let alive = true;
    async function loadWalletTokens() {
      if (!open) return;
      if (!address) {
        setWalletTokens([]);
        return;
      }
      setWalletLoading(true);
      try {
        const res = await fetch(`/api/wallet-tokens?chainId=${chainId}&address=${address}`);
        if (!res.ok) throw new Error(await res.text());
        const json = await res.json();
        if (!alive) return;
        setWalletTokens(Array.isArray(json?.tokens) ? json.tokens : []);
      } catch {
        if (!alive) return;
        setWalletTokens([]);
      } finally {
        if (alive) setWalletLoading(false);
      }
    }
    loadWalletTokens();
    return () => {
      alive = false;
    };
  }, [open, address, chainId]);

  const walletByAddr = useMemo(() => {
    const map = new Map<string, WalletToken>();
    for (const wt of walletTokens) {
      map.set(normalizeAddr(wt.token_address), wt);
    }
    return map;
  }, [walletTokens]);

  const walletTokensNonZero = useMemo(() => {
    // The API already filters non-zero, but keep a defensive check here too.
    return walletTokens
      .filter((t) => {
        try {
          return BigInt(t.balance || '0') > 0n;
        } catch {
          return false;
        }
      })
			.flatMap((wt) => {
				const addr = toSafeAddress(wt.token_address);
				if (!addr) return [];
				return [
					({
						chainId,
						address: addr,
						symbol: wt.symbol,
						name: wt.name,
						decimals: wt.decimals,
						logoURI: wt.logo || wt.thumbnail || undefined,
						// Enrich with Moralis price/balance so the main card can show:
						// "Balance: X (US$Y)" on both From and To.
						priceUSD: wt.usdPrice,
						balanceRaw: wt.balance,
						balanceFormatted:
							wt.balanceFormatted || formatTokenAmount(wt.balance || '0', wt.decimals || 18, 6),
						balanceUsd: wt.usdValue,
					}) satisfies Token,
				];
			});
  }, [walletTokens, chainId]);

  const popularTokens = useMemo(() => {
    const list: Token[] = [];
    // include native token (already present in /api/tokens results usually)
    const native = tokens.find((t) => isZeroAddress(t.address));
    if (native) list.push(native);

    for (const sym of POPULAR_SYMBOLS) {
      const t = tokens.find((x) => x.symbol?.toUpperCase() === sym);
      if (t && !list.some((a) => normalizeAddr(a.address) === normalizeAddr(t.address))) list.push(t);
    }

    // fallback: if /api/tokens doesn't include native, create one
    if (!native) {
      list.unshift({
        chainId,
        address: '0x0000000000000000000000000000000000000000',
        symbol: CHAIN_META[chainId]?.nativeSymbol || 'NATIVE',
        name: CHAIN_META[chainId]?.name ? `${CHAIN_META[chainId].name} Native` : 'Native Token',
        decimals: 18,
        logoURI: undefined,
      });
    }

    return list;
  }, [tokens, chainId]);

  const remainderTokens = useMemo(() => {
    const seen = new Set<string>();
    for (const t of popularTokens) seen.add(normalizeAddr(t.address));
    for (const t of walletTokensNonZero) seen.add(normalizeAddr(t.address));
    return tokens.filter((t) => !seen.has(normalizeAddr(t.address)));
  }, [tokens, popularTokens, walletTokensNonZero]);

  const allTokensForSearch = useMemo(() => {
    const merged: Token[] = [];
    const push = (t: Token) => {
      const key = normalizeAddr(t.address);
      if (!key || merged.some((x) => normalizeAddr(x.address) === key)) return;
      merged.push(t);
    };
    popularTokens.forEach(push);
    walletTokensNonZero.forEach(push);
    tokens.forEach(push);
    return merged;
  }, [popularTokens, walletTokensNonZero, tokens]);

  const searchResults = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return allTokensForSearch
      .filter((t) => {
        return (
          t.symbol?.toLowerCase().includes(q) ||
          t.name?.toLowerCase().includes(q) ||
          normalizeAddr(t.address).includes(q)
        );
      })
      .slice(0, 80);
  }, [query, allTokensForSearch]);

  function getBalanceText(t: Token) {
    if (isZeroAddress(t.address)) {
      if (nativeBalance.isLoading) return '—';
      const v = nativeBalance.data?.value;
      const d = nativeBalance.data?.decimals ?? 18;
      if (v === undefined || v === null) return '—';
      return formatTokenAmount(v.toString(), d);
    }
    const wt = walletByAddr.get(normalizeAddr(t.address));
    if (!wt) return '—';
    return formatTokenAmount(wt.balance || '0', wt.decimals || 18);
  }

  async function handleAddCustom() {
    setCustomError(null);
    const addr = customAddr.trim();
    if (!addr || !addr.startsWith('0x') || addr.length !== 42) {
      setCustomError('Please paste a valid 0x… token contract address.');
      return;
    }

    setAddingCustom(true);
    try {
      await addCustomToken(addr);
      setCustomAddr('');
    } catch (e: any) {
      setCustomError(e?.message || 'Failed to add this token on the selected chain.');
    } finally {
      setAddingCustom(false);
    }
  }

  const currentChain = CHAIN_META[chainId];

  return (
    <>
      {/* Trigger button */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        disabled={disabled}
        className={[
          // `shrink-0` prevents the button from collapsing when the amount field expands.
          'inline-flex shrink-0 items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white shadow-sm hover:bg-white/10',
          disabled ? 'opacity-50' : '',
        ].join(' ')}
        aria-label={label ? `${label}: select token` : 'Select token'}
      >
        {token ? <TokenLogo token={token} chainId={chainId} size={20} /> : <ChainIcon chainId={chainId} size={20} />}
        <span className="max-w-[120px] truncate font-semibold">{token?.symbol || 'Select'}</span>
        <ChevronDown className="h-4 w-4 text-white/60" />
      </button>

      {/* Modal */}
      {open && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4"
          onClick={() => setOpen(false)}
        >
          <div
            className="w-full max-w-[620px] rounded-3xl border border-white/10 bg-black/80 p-4 shadow-2xl backdrop-blur"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-3">
              <div className="text-base font-semibold text-white">Select token</div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="grid h-9 w-9 place-items-center rounded-xl border border-white/10 bg-white/5 text-white/80 hover:bg-white/10"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Chain picker */}
            {showChainPicker && (
              <div className="mt-4" ref={chainMenuRef}>
                <div className="text-xs font-medium text-white/60">Chain</div>
                <div className="relative mt-2">
                  <button
                    type="button"
                    onClick={() => setChainMenuOpen((v) => !v)}
                    className="flex w-full items-center justify-between gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white hover:bg-white/10"
                  >
                    <div className="flex items-center gap-2">
                      <ChainIcon chainId={chainId} size={18} />
                      <span className="truncate">{currentChain?.name || `Chain ${chainId}`}</span>
                    </div>
                    <ChevronDown className="h-4 w-4 text-white/60" />
                  </button>

                  {chainMenuOpen && (
                    <div className="absolute left-0 right-0 top-[calc(100%+8px)] z-[70] max-h-[300px] overflow-auto rounded-2xl border border-white/10 bg-black/90 p-2 shadow-2xl">
                      {Object.values(CHAIN_META).map((c) => {
                        const active = c.id === chainId;
                        return (
                          <button
                            key={c.id}
                            type="button"
                            onClick={() => {
                              setChainMenuOpen(false);
                              onChainSelected?.(c.id);
                            }}
                            className={[
                              'flex w-full items-center justify-between gap-2 rounded-xl px-3 py-2 text-sm',
                              active ? 'bg-emerald-500/20 text-emerald-200' : 'hover:bg-white/5 text-white/90',
                            ].join(' ')}
                          >
                            <div className="flex items-center gap-2">
                              <ChainIcon chainId={c.id} size={18} />
                              <span>{c.name}</span>
                            </div>
                            {active && <span className="text-[11px] text-emerald-300">Selected</span>}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Search */}
            <div className="mt-4">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/40" />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search by name, symbol, or address..."
                  className="w-full rounded-xl border border-white/10 bg-white/5 px-10 py-2 text-sm text-white placeholder:text-white/30 outline-none focus:border-emerald-400/60"
                />
              </div>
            </div>

            {/* Custom token */}
            <div className="mt-4 rounded-2xl border border-white/10 bg-white/5 p-3">
              <div className="text-xs font-medium text-white/60">Add custom token</div>
              <div className="mt-2 flex gap-2">
                <input
                  value={customAddr}
                  onChange={(e) => setCustomAddr(e.target.value)}
                  placeholder="0x…"
                  className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white placeholder:text-white/30 outline-none focus:border-emerald-400/60"
                />
                <button
                  type="button"
                  onClick={handleAddCustom}
                  disabled={addingCustom}
                  className="inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2 text-sm font-semibold text-black hover:bg-white/90 disabled:opacity-60"
                >
                  <span className="text-lg leading-none">＋</span> Add
                </button>
              </div>
              {customError && <div className="mt-2 text-xs text-red-300">{customError}</div>}
              <div className="mt-2 text-[11px] text-white/35">
                Paste a contract address to add a custom token in selected chain.
              </div>
            </div>

            {/* Table header */}
            <div className="mt-4 flex items-center justify-between px-1 text-xs text-white/50">
              <div>Token</div>
              <div>Balance</div>
            </div>

            <div className="mt-2 max-h-[420px] overflow-auto rounded-2xl border border-white/10 bg-black/30 p-2">
              {(loading || walletLoading) && (
                <div className="p-3 text-sm text-white/60">Loading tokens…</div>
              )}

              {error && (
                <div className="p-3 text-sm text-red-300">Failed to load token list.</div>
              )}

              {!loading && !walletLoading && !error && (
                <>
                  {query.trim() ? (
                    <>
                      {searchResults.length === 0 ? (
                        <div className="p-3 text-sm text-white/60">No results.</div>
                      ) : (
                        searchResults.map((t) => (
                          <TokenRow
                            key={`${chainId}:${t.address}`}
                            chainId={chainId}
                            token={t}
                            balanceText={getBalanceText(t)}
                            onPick={() => {
                              onTokenSelected(t);
                              setOpen(false);
                            }}
                          />
                        ))
                      )}
                    </>
                  ) : (
                    <>
                      <div className="px-2 pb-1 pt-2 text-[11px] font-semibold text-white/40">POPULAR</div>
                      {popularTokens.map((t) => (
                        <TokenRow
                          key={`${chainId}:pop:${t.address}`}
                          chainId={chainId}
                          token={t}
                          balanceText={getBalanceText(t)}
                          onPick={() => {
                            onTokenSelected(t);
                            setOpen(false);
                          }}
                        />
                      ))}

                      <div className="mt-2 px-2 pb-1 pt-2 text-[11px] font-semibold text-white/40">IN YOUR WALLET</div>
                      {walletTokensNonZero.length === 0 ? (
                        <div className="p-3 text-sm text-white/60">No tokens found on this chain.</div>
                      ) : (
                        walletTokensNonZero.map((t) => (
                          <TokenRow
                            key={`${chainId}:wallet:${t.address}`}
                            chainId={chainId}
                            token={t}
                            balanceText={getBalanceText(t)}
                            onPick={() => {
                              onTokenSelected(t);
                              setOpen(false);
                            }}
                          />
                        ))
                      )}

                      <div className="mt-2 px-2 pb-1 pt-2 text-[11px] font-semibold text-white/40">ALL TOKENS</div>
                      {remainderTokens.slice(0, 250).map((t) => (
                        <TokenRow
                          key={`${chainId}:rest:${t.address}`}
                          chainId={chainId}
                          token={t}
                          balanceText={getBalanceText(t)}
                          onPick={() => {
                            onTokenSelected(t);
                            setOpen(false);
                          }}
                        />
                      ))}
                    </>
                  )}
                </>
              )}
            </div>

            {/* Debug note: keep it subtle */}
            <div className="mt-3 text-[11px] text-white/35">
              Native balance: {nativeBalance.data?.value ? formatTokenAmount(nativeBalance.data.value.toString(), nativeBalance.data.decimals ?? 18) : '—'}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
