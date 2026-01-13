export type Address = `0x${string}`;

export type Token = {
  chainId: number;
  address: Address; // 0x000.. for native token
  symbol: string;
  name: string;
  decimals: number;
  logoURI?: string;
  priceUSD?: string; // some APIs provide
  coinKey?: string; // some APIs provide
  // Optional UI enrichment (Moralis / wallet scanning)
  balanceRaw?: string;
  balanceFormatted?: string;
  balanceUsd?: string;
};

export type RouterId =
  | 'auto'
  | 'lifi-smart'
  | 'lifi-uniswap'
  | 'lifi-1inch'
  | 'lifi-pancake'
  | 'oneinch-direct'
  | 'uniswap-subgraph-only'
  | 'gaszip';

export type QuoteRequest = {
  router: RouterId;
  fromChainId: number;
  toChainId: number;
  fromToken: Token;
  toToken: Token;
  fromAmount: string; // raw (wei)
  fromAddress: Address;
  toAddress: Address;
  slippage: number; // 0.0001 .. 0.2
};

export type TxRequest = {
  from?: Address;
  to: Address;
  data?: Address | string;
  value?: string; // hex or decimal string
  chainId: number;
};

export type QuoteResponse = {
  router: RouterId;
  tool?: string;
  estimate: {
    fromAmount: string;
    toAmount: string;
    toAmountMin?: string;
    approvalAddress?: Address;
    gasUSD?: string;
    routes?: Array<{ name: string; part: number }>;
  };
  tx?: TxRequest;
  raw?: any;
};

// Optional hint returned by /api/quote when the requested amount is too small.
// This lets the UI show a clean, actionable message like:
// "Minimum swap amount for this pair is 0.0003 ETH (≈$0.90)".
export type MinAmountHint = {
  fromAmount: string; // raw units
  fromAmountFormatted: string; // human units
  fromAmountUSD?: string; // best-effort
};

// Quote failures fall into a few UX-relevant buckets.
// - MIN_AMOUNT: the pair likely has liquidity, but the input is below router minimum.
// - NO_LIQUIDITY: no route / no liquidity / token unsupported.
// - OTHER: everything else (bad params, upstream errors, etc.).
export type QuoteErrorReason = 'MIN_AMOUNT' | 'NO_LIQUIDITY' | 'TIMEOUT' | 'OTHER';
