export type ChainMeta = {
  id: number;
  name: string;
  moralisChain: string; // hex chain id for Moralis (0x...)
  dexScreenerChain: string; // DexScreener chain slug
  logoUrl: string;
  nativeSymbol: string;
};

export const CHAIN_META: Record<number, ChainMeta> = {
  1: {
    id: 1,
    name: 'Ethereum',
    moralisChain: '0x1',
    dexScreenerChain: 'ethereum',
    logoUrl: 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/info/logo.png',
    nativeSymbol: 'ETH',
  },
  137: {
    id: 137,
    name: 'Polygon',
    moralisChain: '0x89',
    dexScreenerChain: 'polygon',
    logoUrl: 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/polygon/info/logo.png',
    nativeSymbol: 'MATIC',
  },
  42161: {
    id: 42161,
    name: 'Arbitrum',
    moralisChain: '0xa4b1',
    dexScreenerChain: 'arbitrum',
    logoUrl: 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/arbitrum/info/logo.png',
    nativeSymbol: 'ETH',
  },
  10: {
    id: 10,
    name: 'Optimism',
    moralisChain: '0xa',
    dexScreenerChain: 'optimism',
    logoUrl: 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/optimism/info/logo.png',
    nativeSymbol: 'ETH',
  },
  8453: {
    id: 8453,
    name: 'Base',
    moralisChain: '0x2105',
    dexScreenerChain: 'base',
    logoUrl: 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/base/info/logo.png',
    nativeSymbol: 'ETH',
  },
  56: {
    id: 56,
    name: 'BSC',
    moralisChain: '0x38',
    dexScreenerChain: 'bsc',
    logoUrl: 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/smartchain/info/logo.png',
    nativeSymbol: 'BNB',
  },
  43114: {
    id: 43114,
    name: 'Avalanche',
    moralisChain: '0xa86a',
    dexScreenerChain: 'avalanche',
    logoUrl: 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/avalanchec/info/logo.png',
    nativeSymbol: 'AVAX',
  },
};

export function getChainMeta(chainId: number): ChainMeta {
  const meta = CHAIN_META[chainId];
  if (!meta) throw new Error(`Unsupported chainId: ${chainId}`);
  return meta;
}
