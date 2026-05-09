import { getAddress, isAddress } from 'viem';

import { CHAIN_META } from '@/lib/chainsMeta';
import type { Address } from '@/lib/types';

export const NATIVE_TOKEN_ADDRESS: Address = '0x0000000000000000000000000000000000000000';

export type SwapPairUrl = {
  fromChainId: number;
  fromTokenAddress: Address;
  toChainId: number;
  toTokenAddress: Address;
};

export type ParsedSwapPairPath =
  | { kind: 'none' }
  | { kind: 'invalid'; reason: string }
  | ({ kind: 'pair' } & SwapPairUrl);

function isSupportedChainId(chainId: number) {
  return Number.isInteger(chainId) && Boolean(CHAIN_META[chainId]);
}

export function isNativeTokenAddress(address?: string | null) {
  return (address || '').toLowerCase() === NATIVE_TOKEN_ADDRESS;
}

export function normalizeTokenAddress(value: string): Address | null {
  const raw = (value || '').trim();
  if (!raw) return null;
  if (isNativeTokenAddress(raw)) return NATIVE_TOKEN_ADDRESS;
  if (!isAddress(raw, { strict: false })) return null;

  try {
    return getAddress(raw) as Address;
  } catch {
    return null;
  }
}

export function buildSwapPairPath(pair: SwapPairUrl) {
  return [
    '',
    'swap',
    String(pair.fromChainId),
    pair.fromTokenAddress,
    String(pair.toChainId),
    pair.toTokenAddress,
  ].join('/');
}

export function parseSwapPairPath(pathname: string): ParsedSwapPairPath {
  const parts = pathname.split('/').filter(Boolean);
  if (parts[0] !== 'swap') return { kind: 'none' };
  if (parts.length !== 5) return { kind: 'invalid', reason: 'Invalid shared pair link.' };

  const fromChainId = Number(parts[1]);
  const toChainId = Number(parts[3]);
  if (!isSupportedChainId(fromChainId) || !isSupportedChainId(toChainId)) {
    return { kind: 'invalid', reason: 'Unsupported chain in shared pair link.' };
  }

  const fromTokenAddress = normalizeTokenAddress(parts[2]);
  const toTokenAddress = normalizeTokenAddress(parts[4]);
  if (!fromTokenAddress || !toTokenAddress) {
    return { kind: 'invalid', reason: 'Invalid token address in shared pair link.' };
  }

  return {
    kind: 'pair',
    fromChainId,
    fromTokenAddress,
    toChainId,
    toTokenAddress,
  };
}
