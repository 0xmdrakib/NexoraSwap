export type ChainMeta = {
  id: number;
  name: string;
  moralisChain: string; // hex chain id for Moralis (0x...)
  dexScreenerChain: string; // DexScreener chain slug
  wrappedNativeAddress: string; // used for DexScreener native-token pricing
  logoUrl: string;
  nativeSymbol: string;
};

export const CHAIN_META: Record<number, ChainMeta> = {
  1: {
    id: 1,
    name: 'Ethereum',
    moralisChain: '0x1',
    dexScreenerChain: 'ethereum',
    wrappedNativeAddress: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
    logoUrl: 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/info/logo.png',
    nativeSymbol: 'ETH',
  },
  137: {
    id: 137,
    name: 'Polygon',
    moralisChain: '0x89',
    dexScreenerChain: 'polygon',
    wrappedNativeAddress: '0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270',
    logoUrl: 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/polygon/info/logo.png',
    nativeSymbol: 'MATIC',
  },
  42161: {
    id: 42161,
    name: 'Arbitrum',
    moralisChain: '0xa4b1',
    dexScreenerChain: 'arbitrum',
    wrappedNativeAddress: '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1',
    logoUrl: 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/arbitrum/info/logo.png',
    nativeSymbol: 'ETH',
  },
  10: {
    id: 10,
    name: 'Optimism',
    moralisChain: '0xa',
    dexScreenerChain: 'optimism',
    wrappedNativeAddress: '0x4200000000000000000000000000000000000006',
    logoUrl: 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/optimism/info/logo.png',
    nativeSymbol: 'ETH',
  },
  8453: {
    id: 8453,
    name: 'Base',
    moralisChain: '0x2105',
    dexScreenerChain: 'base',
    wrappedNativeAddress: '0x4200000000000000000000000000000000000006',
    logoUrl: 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/base/info/logo.png',
    nativeSymbol: 'ETH',
  },
  56: {
    id: 56,
    name: 'BSC',
    moralisChain: '0x38',
    dexScreenerChain: 'bsc',
    wrappedNativeAddress: '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c',
    logoUrl: 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/smartchain/info/logo.png',
    nativeSymbol: 'BNB',
  },
  43114: {
    id: 43114,
    name: 'Avalanche',
    moralisChain: '0xa86a',
    dexScreenerChain: 'avalanche',
    wrappedNativeAddress: '0xB31f66AA3C1e785363F0875A1B74E27b85FD66c7',
    logoUrl: 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/avalanchec/info/logo.png',
    nativeSymbol: 'AVAX',
  },
};

export function getChainMeta(chainId: number): ChainMeta {
  const meta = CHAIN_META[chainId];
  if (!meta) throw new Error(`Unsupported chainId: ${chainId}`);
  return meta;
}
