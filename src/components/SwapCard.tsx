'use client';

import { useEffect, useMemo, useState } from 'react';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import {
  useAccount,
  useBalance,
  useChainId,
  useFeeData,
  useReadContract,
  useSendTransaction,
  useSwitchChain,
  useWaitForTransactionReceipt,
  useWriteContract,
} from 'wagmi';
import { parseUnits } from 'viem';
import { AlertTriangle, ArrowDownUp, CheckCircle2, ChevronDown, Wallet } from 'lucide-react';
import clsx from 'clsx';

import type { Address, QuoteRequest, RouterId, Token } from '@/lib/types';
import { ERC20_ABI } from '@/lib/erc20';
import { formatHash, formatTokenAmount, formatUSD, safeParseFloat } from '@/lib/format';
import { getChainMeta } from '@/lib/chainsMeta';
import { useDebounce } from '@/lib/hooks/useDebounce';
import { useQuote } from '@/lib/hooks/useQuote';
import TokenSelect from './TokenSelect';
import ChainSelect from './ChainSelect';
import { Select } from './ui/Select';

const ZERO: Address = '0x0000000000000000000000000000000000000000';

function aggregatorName(router: RouterId) {
  const r = String(router);
  if (r.startsWith('lifi')) return 'LI.FI';
  if (r.startsWith('oneinch')) return '1inch';
  if (r.startsWith('balancer')) return 'Balancer';
  if (r.startsWith('gaszip')) return 'gas.zip';
  if (r.startsWith('uniswap')) return 'Uniswap';
  if (r.startsWith('pancake')) return 'PancakeSwap';
  return '—';
}

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

function sanitizeAmountInput(value: string, maxDecimals = 18) {
  // Keep only digits and a single dot.
  let v = value.replace(/[^0-9.]/g, '');
  const parts = v.split('.');
  if (parts.length > 2) v = `${parts[0]}.${parts.slice(1).join('')}`;
  if (v.startsWith('.')) v = `0${v}`;

  if (v.includes('.')) {
    const [i, f] = v.split('.');
    v = `${i}.${(f || '').slice(0, maxDecimals)}`;
  }

  // Prevent "00..." unless it's "0.".
  if (!v.includes('.')) v = v.replace(/^0+(\d)/, '$1');
  if (v === '') return '';
  return v;
}

function defaultSwapGasLimit(chainId: number): bigint {
  // Conservative-but-not-crazy defaults (swap transactions vary a lot).
  // Used only for the "Max" button gas buffer on native tokens.
  switch (chainId) {
    case 1:
      return 300_000n; // Ethereum mainnet
    case 8453:
      return 220_000n; // Base
    case 10:
      return 220_000n; // Optimism
    case 42161:
      return 240_000n; // Arbitrum
    case 137:
      return 350_000n; // Polygon
    case 56:
      return 300_000n; // BSC
    case 43114:
      return 350_000n; // Avalanche
    default:
      return 250_000n;
  }
}

function minNativeReserve(chainId: number): string {
  // Minimum buffer to avoid "Max" stranding the user with zero gas.
  // (Units are native token, all our supported chains use 18 decimals.)
  switch (chainId) {
    case 1:
      return '0.003';
    case 8453:
      return '0.00003';
    case 10:
      return '0.00005';
    case 42161:
      return '0.00005';
    case 137:
      return '0.03';
    case 56:
      return '0.0003';
    case 43114:
      return '0.005';
    default:
      return '0.0002';
  }
}

export default function SwapCard() {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const { chains, switchChainAsync } = useSwitchChain();

  const [fromToken, setFromToken] = useState<Token | null>(null);

  const [toChainId, setToChainId] = useState<number>(chainId);
  const [toChainManual, setToChainManual] = useState(false);
  const [toToken, setToToken] = useState<Token | null>(null);

  const [amountUI, setAmountUI] = useState('');
  const debouncedAmountUI = useDebounce(amountUI, 350);

  const [slippageUI, setSlippageUI] = useState(0.5); // %
  const slippage = clamp(slippageUI, 0.01, 20) / 100;

  const [advancedOpen, setAdvancedOpen] = useState(false);

  const [router, setRouter] = useState<RouterId>('auto');

  // Used to force fresh balance reads right after a confirmed swap.
  const [balanceNonce, setBalanceNonce] = useState(0);

  // Keep destination chain synced by default, but let the user override.
  useEffect(() => {
    if (!toChainManual) setToChainId(chainId);
  }, [chainId, toChainManual]);

  // When wallet chain changes, reset tokens to avoid mismatches.
  useEffect(() => {
    setFromToken(null);
    setToToken(null);
  }, [chainId]);

  // If user switches destination chain, clear the destination token (chain-first UX).
  useEffect(() => {
    // Changing destination chain invalidates the current quote/tx state
    setToToken(null);
    setLastTx(null);
  }, [toChainId]);

  const fromAmountRaw = useMemo(() => {
    if (!fromToken) return '0';
    // IMPORTANT: never pass a JS Number into parseUnits.
    // Numbers like 0.0000001 become "1e-7" when stringified, and viem rejects scientific notation.
    // Keep the user's decimal string.
    const raw = (debouncedAmountUI || '').trim();
    if (!raw) return '0';
    const s = raw.endsWith('.') ? raw.slice(0, -1) : raw;
    if (!s || s === '0') return '0';
    if (!/^\d+(\.\d+)?$/.test(s)) return '0';
    try {
      return parseUnits(s, fromToken.decimals).toString();
    } catch {
      return '0';
    }
  }, [debouncedAmountUI, fromToken]);

  // Live balance for the "from" token (used to show instant "insufficient balance" UX).
  const fromIsNative = fromToken?.address === ZERO;
  const toIsNative = toToken?.address === ZERO;
  const { data: fromBalance } = useBalance({
    address: address as Address | undefined,
    chainId,
    token: fromToken && !fromIsNative ? (fromToken.address as Address) : undefined,
    scopeKey: `swap-balance-${balanceNonce}`,
    query: {
      enabled: Boolean(address && fromToken),
      staleTime: 12_000,
    },
  });

  const insufficientBalance = useMemo(() => {
    if (!fromToken || !fromBalance) return false;
    try {
      const need = BigInt(fromAmountRaw || '0');
      return need > 0n && need > fromBalance.value;
    } catch {
      return false;
    }
  }, [fromToken, fromBalance, fromAmountRaw]);

  const isCrossChain = chainId !== toChainId;

  useEffect(() => {
    // Safety: 1inch cannot do cross-chain swaps. Force LiFi when chains differ.
    if (isCrossChain && router !== 'lifi-smart') setRouter('lifi-smart');
  }, [isCrossChain, router]);

  const routeOptions = useMemo(
    () =>
      isCrossChain
        ? [{ value: 'lifi-smart', label: 'LiFi Smart Routing' }]
        : [
            { value: 'auto', label: 'Auto (best)' },
            { value: 'oneinch-direct', label: '1inch (same-chain)' },
            { value: 'lifi-smart', label: 'LiFi Smart Routing' },
          ],
    [isCrossChain]
  );

  // Auto routing strategy (production-realistic):
  // - Cross-chain => LiFi only
  // - Same-chain + Auto => compare 1inch vs LiFi and pick the better quote (fallback gracefully)
  const autoEnabled = router === 'auto' && !isCrossChain;

  const quoteReqCommon = useMemo(() => {
    if (!isConnected || !address) return null;
    if (!fromToken || !toToken) return null;
    if (!fromAmountRaw || fromAmountRaw === '0') return null;

    return {
      fromChainId: chainId,
      toChainId,
      fromToken,
      toToken,
      fromAmount: fromAmountRaw,
      fromAddress: address as Address,
      toAddress: address as Address,
      slippage,
    };
  }, [isConnected, address, fromToken, toToken, fromAmountRaw, chainId, toChainId, slippage]);

  const quoteReqOneInch: QuoteRequest | undefined = useMemo(() => {
    if (isCrossChain) return undefined;
    if (!quoteReqCommon) return undefined;
    if (!(autoEnabled || router === 'oneinch-direct')) return undefined;
    return { ...quoteReqCommon, router: 'oneinch-direct' };
  }, [quoteReqCommon, autoEnabled, router, isCrossChain]);

  const quoteReqLiFi: QuoteRequest | undefined = useMemo(() => {
    if (!quoteReqCommon) return undefined;
    if (isCrossChain) return { ...quoteReqCommon, router: 'lifi-smart' };
    if (!(autoEnabled || router === 'lifi-smart')) return undefined;
    return { ...quoteReqCommon, router: 'lifi-smart' };
  }, [quoteReqCommon, autoEnabled, router, isCrossChain]);

  const one = useQuote(quoteReqOneInch);
  const li = useQuote(quoteReqLiFi);

  const autoPicked: RouterId | null = useMemo(() => {
    if (!autoEnabled) return null;

    const oneAmt = one.data?.estimate?.toAmount;
    const liAmt = li.data?.estimate?.toAmount;

    const oneOk = !!oneAmt && (() => { try { return BigInt(oneAmt) > 0n; } catch { return false; } })();
    const liOk = !!liAmt && (() => { try { return BigInt(liAmt) > 0n; } catch { return false; } })();

    if (oneOk && liOk) {
      try {
        return BigInt(oneAmt as string) >= BigInt(liAmt as string) ? 'oneinch-direct' : 'lifi-smart';
      } catch {
        return 'lifi-smart';
      }
    }
    if (oneOk) return 'oneinch-direct';
    if (liOk) return 'lifi-smart';

    return null;
  }, [autoEnabled, one.data, li.data]);

  const effectiveRouter: RouterId = useMemo(() => {
    if (isCrossChain) return 'lifi-smart';
    if (router === 'auto') return autoPicked ?? 'lifi-smart';
    return router;
  }, [router, isCrossChain, autoPicked]);

  const active =
    effectiveRouter === 'oneinch-direct'
      ? one
      : li;

  const {
    data: quote,
    error: quoteError,
    reason: quoteReason,
    loading: quoteLoading,
    minAmount,
  } = active;

  // Prices (best-effort): token lists / wallet scan may include priceUSD.
  const fromPrice = safeParseFloat(fromToken?.priceUSD);
  const toPrice = safeParseFloat(toToken?.priceUSD);

  // USD under the input (instant, based on the user's typed amount).
  const fromAmountFloat = safeParseFloat(amountUI);
  const fromUsd = fromPrice > 0 ? fromAmountFloat * fromPrice : 0;

  // "Max" helper: for native tokens keep a small buffer for gas so users don't strand themselves.
  const { data: feeData } = useFeeData({
    chainId,
    query: {
      enabled: Boolean(fromIsNative),
      staleTime: 12_000,
    },
  });

  const nativeGasBuffer = useMemo(() => {
    if (!fromIsNative) return 0n;
    // Chain-aware buffer based on current fee data.
    // L2s tend to have lower fees than L1, while mainnet needs more headroom.
    const gasLimit = defaultSwapGasLimit(chainId);
    const feePerGas = (feeData?.maxFeePerGas ?? feeData?.gasPrice ?? 0n) as bigint;
    const est = feePerGas > 0n ? feePerGas * gasLimit : 0n;

    let buffer = est > 0n ? (est * 15n) / 10n : 0n; // 1.5x safety
    let minReserve = 0n;
    try {
      minReserve = parseUnits(minNativeReserve(chainId), 18);
    } catch {
      minReserve = 0n;
    }
    if (buffer < minReserve) buffer = minReserve;
    return buffer;
  }, [fromIsNative, chainId, feeData?.maxFeePerGas, feeData?.gasPrice]);


  const toAmountFloat = quote && toToken ? safeParseFloat(formatTokenAmount(quote.estimate.toAmount, toToken.decimals, 8)) : 0;
  const toUsd = toPrice > 0 ? toAmountFloat * toPrice : 0;

  const minToAmountStr = quote?.estimate?.toAmountMin && toToken
    ? formatTokenAmount(quote.estimate.toAmountMin, toToken.decimals, 8)
    : '';
  const minToAmountFloat = safeParseFloat(minToAmountStr);
  const minToUsd = toPrice > 0 && minToAmountFloat > 0 ? minToAmountFloat * toPrice : 0;

  // Cross-chain swaps can require extra native value (bridge / messaging fee).
  // Wallets often show this as a bigger 'You send' than the typed amount — because it
  // includes both the swap amount and the bridge/message fee inside tx.value.
  const txValueWei = useMemo(() => {
    try {
      return quote?.tx?.value ? parseTxValue(quote.tx.value) : 0n;
    } catch {
      return 0n;
    }
  }, [quote?.tx?.value]);

  const nativeSymbol = useMemo(() => {
    try {
      return getChainMeta(chainId).nativeSymbol || 'ETH';
    } catch {
      return 'ETH';
    }
  }, [chainId]);

  // For bridge/messaging fees we need the USD price of the source-chain native token.
  // Previously we only computed USD when the "from" token was native, which caused
  // fee USD to disappear when swapping from an ERC20 (e.g. USDC -> ... cross-chain).
  const [nativePriceUsdForFees, setNativePriceUsdForFees] = useState(0);

  useEffect(() => {
    // Always clear first to avoid showing a stale USD value while we resolve.
    setNativePriceUsdForFees(0);

    // Only relevant for cross-chain (bridge) routes.
    if (!isCrossChain) return;

    const controller = new AbortController();

    const resolve = async () => {
      // Fast-path: if the *source* token is native, we already have its USD price.
      // Note: In cross-chain routes, fees are always paid in the source-chain native token,
      // so we intentionally do NOT use destination-native prices.
      const direct = fromIsNative && fromPrice > 0 ? fromPrice : 0;
      if (direct > 0) {
        setNativePriceUsdForFees(direct);
        return;
      }

      // Reliable fallback: resolve source-chain native USD price.
      try {
        const res = await fetch(`/api/native-price?chainId=${chainId}`, {
          signal: controller.signal,
        });
        const json = await res.json();
        const p = Number(json?.usdPrice || 0);
        if (!controller.signal.aborted) {
          setNativePriceUsdForFees(Number.isFinite(p) && p > 0 ? p : 0);
        }
      } catch {
        // ignore
      }
    };

    resolve();
    return () => controller.abort();
  }, [chainId, isCrossChain, fromIsNative, fromPrice]);

  const bridgeFeeWei = useMemo(() => {
    if (!quote || !isCrossChain) return 0n;
    if (txValueWei === 0n) return 0n;

    let fromWei = 0n;
    try {
      fromWei = BigInt(fromAmountRaw || '0');
    } catch {
      fromWei = 0n;
    }

    if (fromIsNative) {
      // Native token swaps: tx.value typically = amount + message/bridge fee
      return txValueWei > fromWei ? txValueWei - fromWei : 0n;
    }
    // ERC20 swaps: tx.value is usually only the message/bridge fee (paid in native)
    return txValueWei;
  }, [quote, isCrossChain, txValueWei, fromIsNative, fromAmountRaw]);

  const bridgeFeeStr = useMemo(() => {
    if (bridgeFeeWei <= 0n) return '';
    return formatTokenAmount(bridgeFeeWei.toString(), 18, 8);
  }, [bridgeFeeWei]);

  const bridgeFeeUsd = useMemo(() => {
    if (!bridgeFeeStr) return 0;
    if (nativePriceUsdForFees <= 0) return 0;
    const fee = safeParseFloat(bridgeFeeStr);
    return fee > 0 ? fee * nativePriceUsdForFees : 0;
  }, [bridgeFeeStr, nativePriceUsdForFees]);

  const totalValueStr = useMemo(() => {
    if (!quote || !isCrossChain || txValueWei <= 0n) return '';
    return formatTokenAmount(txValueWei.toString(), 18, 8);
  }, [quote, isCrossChain, txValueWei]);

  const totalValueUsd = useMemo(() => {
    if (!totalValueStr) return 0;
    if (nativePriceUsdForFees <= 0) return 0;
    const v = safeParseFloat(totalValueStr);
    return v > 0 ? v * nativePriceUsdForFees : 0;
  }, [totalValueStr, nativePriceUsdForFees]);

  const bridgeFeeDominates = useMemo(() => {
    // Only relevant for cross-chain routes where there is a non-zero native tx value (bridge/messaging gas).
    // `QuoteResponse` is our internal shape; it doesn't expose an `isCrossChain` flag.
    // Use the derived boolean from the selected chains.
    if (!quote || !isCrossChain || bridgeFeeWei <= 0n) return false;

    // Prefer USD comparison (works for ERC20 inputs too).
    if (bridgeFeeUsd > 0 && fromUsd > 0) {
      return bridgeFeeUsd > fromUsd;
    }

    // Fallback: only safe to compare raw units when the "from" token is native.
    if (!fromIsNative) return false;

    try {
      const fromWei = BigInt(fromAmountRaw || '0');
      return bridgeFeeWei > fromWei;
    } catch {
      return false;
    }
  }, [quote, isCrossChain, bridgeFeeWei, bridgeFeeUsd, fromUsd, fromIsNative, fromAmountRaw]);

  const priceDeviationPct = useMemo(() => {
    if (!fromUsd || !toUsd) return 0;
    const dev = Math.abs(toUsd - fromUsd) / Math.max(fromUsd, 1e-9);
    return dev * 100;
  }, [fromUsd, toUsd]);

  const bigDeviation = priceDeviationPct >= 5; // heuristic
  const lowLiquidity =
    quoteReason === 'NO_LIQUIDITY' ||
    quoteError?.toLowerCase().includes('insufficient') ||
    quoteError?.toLowerCase().includes('liquidity');

  // Approval logic (LiFi quote provides approvalAddress when needed)
  const spender = quote?.estimate.approvalAddress;
  const needsApproval = !!spender && fromToken?.address !== ZERO;

  const { data: allowance, refetch: refetchAllowance } = useReadContract({
    abi: ERC20_ABI,
    address: fromToken?.address as Address | undefined,
    functionName: 'allowance',
    args: address && spender ? [address as Address, spender] : undefined,
    chainId,
    query: {
      enabled: Boolean(isConnected && address && spender && fromToken && fromToken.address !== ZERO),
      // Approvals should reflect quickly; stale allowance makes the UI look "stuck".
      staleTime: 0,
      refetchInterval: 4_000,
    },
  });

  // Use the quote's fromAmount (raw units) as the source of truth.
  // This prevents "approved but still asks to approve" issues if UI parsing rounds differently.
  const requiredAllowance = useMemo(() => {
    if (!needsApproval) return 0n;
    const raw = quote?.estimate?.fromAmount || fromAmountRaw || '0';
    try {
      return BigInt(raw);
    } catch {
      return 0n;
    }
  }, [needsApproval, quote?.estimate?.fromAmount, fromAmountRaw]);

  const allowanceOk = useMemo(() => {
    if (!needsApproval) return true;
    try {
      if (!allowance) return false;
      return BigInt(allowance as any) >= requiredAllowance;
    } catch {
      return false;
    }
  }, [needsApproval, allowance, requiredAllowance]);

  const { writeContractAsync, isPending: approvePending } = useWriteContract();
  const { sendTransactionAsync, isPending: swapPending } = useSendTransaction();

  // Track approval confirmation separately from the initial wallet signature.
  // `approvePending` only covers the wallet confirmation step.
  const [approveTx, setApproveTx] = useState<{ hash: `0x${string}`; chainId: number } | null>(null);
  const {
    data: approveReceipt,
    isLoading: approveReceiptLoading,
  } = useWaitForTransactionReceipt({
    hash: approveTx?.hash,
    chainId: approveTx?.chainId,
    query: { enabled: Boolean(approveTx?.hash) },
  });

  // Keep "Approving…" visible from the moment the tx hash exists until allowance refresh clears the flow.
  const approving = approvePending || approveReceiptLoading || Boolean(approveTx?.hash);

  // Once the approve tx is mined, refresh allowance immediately so the UI flips to "Swap".
  useEffect(() => {
    if (!approveReceipt || !approveTx?.hash) return;
    (async () => {
      try {
        await refetchAllowance();
      } finally {
        setApproveTx(null);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [approveReceipt]);

  const [lastTx, setLastTx] = useState<{ hash: `0x${string}`; chainId: number } | null>(null);
  const { data: receipt, isLoading: receiptLoading } = useWaitForTransactionReceipt({
    hash: lastTx?.hash,
    chainId: lastTx?.chainId,
    query: { enabled: Boolean(lastTx?.hash) },
  });

  const [uiError, setUiError] = useState<string | null>(null);

  // Ensure we only run post-swap refresh once per confirmed tx.
  const [lastRefreshedTx, setLastRefreshedTx] = useState<string | null>(null);

  // After a successful swap, refresh balances immediately (so users see the new balances right away)
  // and ask token lists (Moralis wallet scan) to refetch in the background.
  useEffect(() => {
    if (!receipt || !lastTx?.hash) return;
    if (lastRefreshedTx === lastTx.hash) return;

    setLastRefreshedTx(lastTx.hash);
    setBalanceNonce((x) => x + 1);

    if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent('swapdex:refreshTokens', {
          detail: { chainIds: [chainId, toChainId] },
        })
      );
    }
  }, [receipt, lastTx?.hash, chainId, toChainId, lastRefreshedTx]);

  // Clear transient UI errors (e.g., "User rejected the request") as soon as the user changes inputs.
  useEffect(() => {
    if (!uiError) return;
    setUiError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fromAmountRaw, chainId, toChainId, fromToken?.address, toToken?.address, router]);


  // Clear tx status when switching wallet network. Otherwise wagmi may look for the receipt on the new chain
  // and the UI can incorrectly show 'Waiting for confirmation…' for an already-confirmed tx.
  useEffect(() => {
    setLastTx(null);
  }, [chainId]);

  async function ensureCorrectChain() {
    if (!switchChainAsync) return;
    if (chainId !== fromToken?.chainId) {
      await switchChainAsync({ chainId: fromToken?.chainId || chainId });
    }
  }

  async function onApprove() {
    setUiError(null);
    // Reset any previous approval tracking.
    setApproveTx(null);
    if (!isConnected || !address) return setUiError('Connect wallet first.');
    if (!fromToken || fromToken.address === ZERO) return setUiError('No approval needed for native token.');
    if (!spender) return setUiError('Missing approval address (no quote).');

    try {
      await ensureCorrectChain();
      const approveAmount = requiredAllowance;
      if (approveAmount <= 0n) return setUiError('Enter an amount to approve.');
      const hash = await writeContractAsync({
        abi: ERC20_ABI,
        address: fromToken.address,
        functionName: 'approve',
        // Safer UX: approve only the exact amount entered (not unlimited).
        args: [spender, approveAmount],
        chainId,
      });

      // Keep the button in "Approving…" state until the tx is mined.
      if (hash) setApproveTx({ hash, chainId });
    } catch (e: any) {
      setUiError(e?.shortMessage || e?.message || 'Approve failed');
    }
  }

  function parseTxValue(value?: string) {
    if (!value) return 0n;
    try {
      if (value.startsWith('0x')) return BigInt(value);
      return BigInt(value);
    } catch {
      return 0n;
    }
  }

  async function onSwap() {
    setUiError(null);
    if (!isConnected || !address) return setUiError('Connect wallet first.');
    if (!quote?.tx) return setUiError('No transaction data. Get a quote first.');
    if (needsApproval && !allowanceOk) return setUiError('Approval required.');
    if (lowLiquidity) return setUiError('Liquidity looks insufficient for this trade.');

    try {
      await ensureCorrectChain();
      const hash = await sendTransactionAsync({
        chainId: quote.tx.chainId,
        to: quote.tx.to,
        data: (quote.tx.data as any) || '0x',
        value: parseTxValue(quote.tx.value),
      });
      setLastTx({ hash, chainId: quote.tx.chainId });
    } catch (e: any) {
      setUiError(e?.shortMessage || e?.message || 'Swap failed');
    }
  }

  const txUrl = useMemo(() => {
    if (!lastTx?.hash) return null;
    const c = chains.find((x) => x.id === lastTx.chainId);
    const base = c?.blockExplorers?.default?.url;
    if (!base) return null;
    return `${base.replace(/\/$/, '')}/tx/${lastTx.hash}`;
  }, [lastTx, chains]);

  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 shadow-glow">
      <div className="flex items-center justify-between gap-3">
        <ChainSelect
          chainId={chainId}
          onSelect={async (id) => {
            if (!switchChainAsync) return;
            await switchChainAsync({ chainId: id });
          }}
        />

        <ConnectButton.Custom>
          {({ account, mounted, openAccountModal, openConnectModal }) => {
            const ready = mounted;
            const connected = ready && account;
            return (
              <button
                className={clsx(
                  'inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm hover:bg-white/10',
                  !connected && 'text-white/80',
                )}
                onClick={connected ? openAccountModal : openConnectModal}
              >
                <Wallet size={16} className="text-white/70" />
                {connected ? (
                  <span className="max-w-[180px] truncate">{account.displayName}</span>
                ) : (
                  <span>Connect wallet</span>
                )}
              </button>
            );
          }}
        </ConnectButton.Custom>
      </div>

      {!process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID && (
        <div className="mt-3 rounded-xl border border-amber-500/20 bg-amber-500/10 p-3 text-xs text-amber-200">
          Missing <span className="font-mono">NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID</span>. WalletConnect-based wallets
          will not work until you set it.
        </div>
      )}

      <div className="mt-4 space-y-3">
        <div className="rounded-2xl border border-white/10 bg-black/20 p-3">
          <div className="mb-2 text-xs text-white/60">You pay</div>
          {/*
            Prevent the amount input from squeezing the token button down to a single character.
            In flex layouts, a child with `w-full` can take the whole row and force siblings to shrink.
            We instead make the input `flex-1 min-w-0` and keep the token button `shrink-0`.
          */}
          <div className="flex items-center gap-3">
            <input
              className="min-w-0 flex-1 bg-transparent text-2xl font-medium outline-none placeholder:text-white/30"
              placeholder="0.0"
              value={amountUI}
              onChange={(e) => {
                const maxDec = fromToken?.decimals ?? 18;
                setAmountUI(sanitizeAmountInput(e.target.value, maxDec));
              }}
              inputMode="decimal"
            />
            <TokenSelect
              label="From"
              chainId={chainId}
              token={fromToken}
              onChainSelected={async (id) => {
                // From-chain selection triggers wallet network switch.
                if (!switchChainAsync) return;
                await switchChainAsync({ chainId: id });
              }}
              onTokenSelected={(t) => setFromToken(t)}
              showChainPicker
            />
          </div>
          <div className="mt-2 flex items-center justify-between text-xs text-white/55">
            <span>{fromUsd ? formatUSD(fromUsd) : '—'}</span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                className="rounded-full border border-white/10 bg-black/30 px-2 py-1 text-[11px] text-white/70 hover:bg-white/10 hover:text-white/90 disabled:opacity-40"
                disabled={!fromToken || !fromBalance}
                onClick={() => {
                  if (!fromToken || !fromBalance) return;
                  let raw = fromBalance.value;
                  if (fromToken.address === ZERO && nativeGasBuffer > 0n) {
                    raw = raw > nativeGasBuffer ? raw - nativeGasBuffer : 0n;
                  }
                  const maxFraction = Math.min(6, fromToken.decimals);
                  const ui = formatTokenAmount(raw.toString(), fromToken.decimals, maxFraction);
                  setAmountUI(sanitizeAmountInput(ui, fromToken.decimals));
                }}
                title={fromToken?.address === ZERO ? 'Leaves a small amount for gas' : 'Use your full balance'}
              >
                Max
              </button>

              <BalanceLine
                address={address as Address | undefined}
                chainId={chainId}
                token={fromToken}
                priceUSD={fromPrice}
                scopeKey={`swap-balance-${balanceNonce}`}
              />
            </div>
          </div>
        </div>

        <div className="flex justify-center">
          <button
            className="rounded-full border border-white/10 bg-white/5 p-2 text-white/75 hover:bg-white/10"
            onClick={() => {
              // Swap sides (same-chain only)
              if (toChainId !== chainId) return;
              const a = fromToken;
              setFromToken(toToken);
              setToToken(a);
            }}
            title={toChainId !== chainId ? 'Switching sides is disabled for cross-chain' : 'Swap tokens'}
          >
            <ArrowDownUp size={18} />
          </button>
        </div>

        <div className="rounded-2xl border border-white/10 bg-black/20 p-3">
          <div className="mb-2 text-xs text-white/60">You receive</div>
          <div className="flex items-center gap-3">
            <div className="min-h-[32px] min-w-0 flex-1 text-2xl font-medium">
              {quoteLoading ? (
                <span className="text-white/40">…</span>
              ) : quote && toToken ? (
                formatTokenAmount(quote.estimate.toAmount, toToken.decimals, 8)
              ) : (
                <span className="text-white/30">0.0</span>
              )}
            </div>

            <TokenSelect
              label="To"
              chainId={toChainId}
              token={toToken}
              onChainSelected={(id) => {
                setToChainId(id);
                setToChainManual(id !== chainId);
              }}
              onTokenSelected={(t) => setToToken(t)}
              showChainPicker
            />
          </div>
          <div className="mt-2 flex items-center justify-between text-xs text-white/55">
            <span>{toUsd ? formatUSD(toUsd) : '—'}</span>
            <BalanceLine
              address={address as Address | undefined}
              chainId={toChainId}
              token={toToken}
              priceUSD={toPrice}
              scopeKey={`swap-balance-${balanceNonce}`}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-3">
            <div className="text-xs text-white/60">Slippage</div>
            <div className="mt-2 flex items-center gap-2">
              <input
                className="w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm outline-none"
                value={slippageUI}
                onChange={(e) => setSlippageUI(safeParseFloat(e.target.value))}
                inputMode="decimal"
              />
              <span className="text-xs text-white/60">%</span>
            </div>
            <div className="mt-1 text-[11px] text-white/45">Allowed: 0.01% – 20%</div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-3">
            <div className="text-xs text-white/60">Route</div>
            <div className="mt-2">
              <Select
                value={router}
                onChange={(v) => setRouter(v as RouterId)}
                options={[
                  { value: 'auto', label: 'Auto (best)' },
                  { value: 'lifi-smart', label: 'LiFi Smart Routing' },
                  {
                    value: 'oneinch-direct',
                    label: chainId === toChainId ? '1inch Direct (same-chain)' : '1inch Direct (same-chain only)',
                    disabled: chainId !== toChainId,
                  },
                  { value: 'balancer-direct', label: 'Balancer Direct (coming soon)', disabled: true },
                  { value: 'gaszip', label: 'gas.zip (gas refuel) (coming soon)', disabled: true },
                ]}
              />
            </div>
            <div className="mt-1 text-[11px] text-white/45">
              Cross-chain swaps are handled by LiFi. 1inch Direct is enabled for same-chain swaps.
              {router === 'auto' && !isCrossChain && (
                <div className="mt-2 text-[11px] text-white/60">
                  {quoteLoading && !quote
                    ? 'Auto is comparing routes…'
                    : `Auto picked: ${effectiveRouter === 'oneinch-direct' ? '1inch Direct' : 'LiFi Smart Routing'}`}
                </div>
              )}
            </div>
          </div>
        </div>

        {quote && (
          <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-3 text-sm">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-xs text-white/60">Minimum received (est.)</div>
                <div className="mt-1 font-medium">
                  {minToAmountStr && toToken
                    ? `${minToAmountStr} ${toToken.symbol}${minToUsd ? ` (${formatUSD(minToUsd)})` : ''}`
                    : '—'}
                </div>

                {isCrossChain && totalValueStr ? (
                  <div className="mt-3 text-xs text-white/70">
                    <div className="flex items-center gap-2">
                      <span className="text-white/55">Bridge DEX fee (est.)</span>
                      <span className="font-medium tabular-nums text-white/80">
                        {bridgeFeeStr
                          ? `${bridgeFeeStr} ${nativeSymbol}${bridgeFeeUsd ? ` (${formatUSD(bridgeFeeUsd)})` : ''}`
                          : `—`}
                      </span>
                    </div>
                    <div className="mt-1 flex items-center gap-2">
                      <span className="text-white/55">Wallet will send (tx value)</span>
                      <span className="font-medium tabular-nums text-white/80">
                        {`${totalValueStr} ${nativeSymbol}${totalValueUsd ? ` (${formatUSD(totalValueUsd)})` : ''}`}
                      </span>
                    </div>
                    {bridgeFeeDominates ? (
                      <div className="mt-2 text-[11px] text-amber-200/90">
                        Bridge fee is higher than the swap amount. Cross-chain routes usually need a larger amount.
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </div>
              <div className="text-right">
                <div className="text-xs text-white/60">Aggregator</div>
                <div className="mt-1 font-medium">{aggregatorName(quote.router)}</div>
                <div className="mt-2 text-xs text-white/60">DEX</div>
                <div className="mt-1 font-medium">{quote.tool || '—'}</div>
              </div>
            </div>

            {quote.estimate.routes?.length ? (
              <div className="mt-3 text-xs">
                <button
                  type="button"
                  className="flex w-full items-center justify-between rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-white/70 hover:text-white/90"
                  onClick={() => setAdvancedOpen((v) => !v)}
                  aria-expanded={advancedOpen}
                >
                  <span>Advanced</span>
                  <ChevronDown
                    className={clsx('h-4 w-4 transition-transform', advancedOpen && 'rotate-180')}
                  />
                </button>

                {advancedOpen ? (
                  <div className="mt-2 rounded-xl border border-white/10 bg-black/20 p-3 text-white/70">
                    <div className="mb-1 text-white/55">Liquidity sources</div>
                    <div className="flex flex-wrap gap-2">
                      {quote.estimate.routes.map((r) => (
                        <span
                          key={r.name}
                          className="rounded-full border border-white/10 bg-black/30 px-2 py-1"
                          title={`${r.part}%`}
                        >
                          {r.name} • {r.part}%
                        </span>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        )}

        {(quoteError || uiError || bigDeviation || lowLiquidity || insufficientBalance) && (
          <div
            className={clsx(
              'rounded-2xl border p-3 text-sm',
              lowLiquidity ? 'border-red-500/30 bg-red-500/10' : 'border-amber-500/25 bg-amber-500/10',
            )}
          >
            <div className="flex items-start gap-2">
              <AlertTriangle className="mt-0.5" size={16} />
              <div className="space-y-1">
                {insufficientBalance && (
                  <div className="text-white/90">
                    Insufficient {fromToken?.symbol || ''} balance for this amount.
                  </div>
                )}
                {quoteError && (
                  <div className="text-white/90">
                    {quoteReason === 'MIN_AMOUNT'
                      ? minAmount
                        ? `Amount too low. Minimum for this pair is ${minAmount.fromAmountFormatted} ${fromToken?.symbol || ''}${
                            minAmount.fromAmountUSD ? ` (≈$${minAmount.fromAmountUSD})` : ''
                          }.`
                        : 'Amount too low for this pair. Calculating minimum…'
                      : quoteReason === 'NO_LIQUIDITY'
                        ? 'Liquidity not found for this pair.'
                        : quoteError}
                  </div>
                )}
                {uiError && <div className="text-white/90">{uiError}</div>}
                {bigDeviation && (
                  <div className="text-white/80">
                    Output differs from input USD by ~{priceDeviationPct.toFixed(1)}%. Double-check token addresses and
                    liquidity.
                  </div>
                )}
                {/* lowLiquidity only controls styling/disable; we keep the message single-line above */}
              </div>
            </div>
          </div>
        )}

        <div className="space-y-2">
          {needsApproval && !allowanceOk && (
            <button
              className={clsx(
                'w-full rounded-2xl px-4 py-3 text-sm font-semibold',
                approving ? 'bg-white/10 text-white/60' : 'bg-white text-black hover:bg-white/90',
              )}
              onClick={onApprove}
              disabled={!isConnected || approving || !fromToken}
            >
              {approving ? 'Approving…' : `Approve ${fromToken?.symbol || ''}`}
            </button>
          )}

          <button
            className={clsx(
              'w-full rounded-2xl px-4 py-3 text-sm font-semibold',
              swapPending || receiptLoading
                ? 'bg-white/10 text-white/60'
                : 'bg-emerald-400 text-black hover:bg-emerald-300',
            )}
            onClick={onSwap}
            disabled={
              !isConnected ||
              !quote ||
              !quote.tx ||
              quoteLoading ||
              lowLiquidity ||
              insufficientBalance ||
              (needsApproval && !allowanceOk) ||
              swapPending ||
              receiptLoading
            }
          >
            {swapPending ? 'Confirm in wallet…' : receiptLoading ? 'Waiting for confirmation…' : 'Swap'}
          </button>

          {lastTx?.hash && (
            <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-3 text-xs text-white/70">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-white/55">Tx hash</div>
                  <div className="mt-1 font-mono text-[11px]">
                    {txUrl ? (
                      <a href={txUrl} target="_blank" rel="noreferrer" className="hover:underline">
                        {formatHash(lastTx.hash)}
                      </a>
                    ) : (
                      formatHash(lastTx.hash)
                    )}
                  </div>
                </div>
                {receipt ? (
                  <span className="inline-flex items-center gap-1 rounded-full border border-emerald-400/30 bg-emerald-400/10 px-2 py-1 text-emerald-200">
                    <CheckCircle2 size={14} />
                    Confirmed
                  </span>
                ) : (
                  <span className="rounded-full border border-white/10 bg-black/30 px-2 py-1">Pending</span>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Dev notes removed for a cleaner production-like UI */}
      </div>
    </div>
  );
}

function BalanceLine({
  address,
  chainId,
  token,
  priceUSD,
  scopeKey,
}: {
  address?: Address;
  chainId: number;
  token: Token | null;
  priceUSD?: number;
  scopeKey?: string;
}) {
  const isNative = token?.address === ZERO;

  const { data: bal, isLoading } = useBalance({
    address: address as Address | undefined,
    chainId,
    token: token && !isNative ? (token.address as Address) : undefined,
    scopeKey,
    query: {
      enabled: Boolean(address && token),
      staleTime: 12_000,
    },
  });

  if (!address || !token) return <span>Balance: —</span>;
  if (isLoading) return <span className="text-white/45">Balance: …</span>;

  const amount = bal ? safeParseFloat(formatTokenAmount(bal.value.toString(), token.decimals, 6)) : 0;
  const usd = priceUSD && priceUSD > 0 ? amount * priceUSD : 0;

  return (
    <span className="text-white/45">
      Balance: {bal ? formatTokenAmount(bal.value.toString(), token.decimals, 6) : '—'}
      {usd > 0 ? ` (${formatUSD(usd)})` : ''}
    </span>
  );
}
