# Pricing investigation — 8 September 2026

## Confirmed cause

The live app returned approximately **$0.4458–$0.4676** for BSC USDT during the investigation. Its selected pool reported roughly **$516,000–$527,000** in liquidity. DexScreener's batch token endpoint returned only that pool for this token, and the app accepted a successful batch response without requesting a broader pool list.

The broader token-pool endpoint exposed a PancakeSwap pool with approximately **$41.7 million** in liquidity and a USDT price of **$0.9996**. LI.FI independently returned approximately **$1.00054**. The reproduced discrepancy came from the app's pool selection, not evidence that USDT as a whole had fallen to half a dollar.

A second selection error preferred any pool where the requested token was the base asset over every pool where it was the quote asset. BSC USDC, for example, could be selected from a pool with only about **$57** of liquidity. The corrected selection considered a quote-side pool with approximately **$18.3 million** of liquidity. This logic was shared by all supported networks.

## Changes

- Fresh cached prices remain first; LI.FI is the primary live source and DexScreener is the fallback.
- LI.FI prices must match the requested chain and contract and be finite and positive.
- DexScreener fallback requests a broader pool list, with an alternate list endpoint if the first is unavailable. The batch token endpoint no longer determines prices.
- Eligible pools are ranked by reported liquidity across both base and quote orientations. Quote prices use the pool's exchange ratio.
- Solana contract matching preserves case; wrong-chain, zero-liquidity and invalid-price candidates are rejected.
- No stablecoin price is forced to one dollar. Missing prices remain unknown.

## Scope and results

The initial comparison sampled 29 token/network combinations across all eight supported networks. BSC USDT was the only discrepancy above 5% between the old batch selection and the broader pool selection in that sample. Several other assets were using shallower pools even when the displayed price happened to be close.

After correction, the repeatable audit checked **41** LI.FI-listed USDT/USDT0, USDC, DAI, bridged `.e` variants and native-token combinations across **Ethereum, Optimism, BSC, Polygon, Base, Arbitrum, Avalanche and Solana**. All 41 obtained a LI.FI price. None differed from the corrected DexScreener pool estimate by more than 5%; the largest observed difference was approximately **1.50%**.

Solana's bridged DAI pool had only about **$79** in reported liquidity, so its pool estimate remains weak evidence of a representative market price. The LI.FI price was approximately $0.9906 and that pool's estimate approximately $0.976. This is documented rather than hidden by assigning it a fixed dollar price.

These are observations at the time of testing, not coverage of every custom token or a guarantee of future prices. Reported liquidity and provider estimates can be unreliable. Run `npm run audit:prices` to repeat the sample; generated JSON includes addresses and liquidity, and Markdown provides the comparison table.

Regression tests cover the reproduced BSC pool-selection failure, quote/base orientation, provider outages, malformed data, native tokens on all supported networks, Solana case sensitivity, caching and API response contracts.

## Primary references

- [DexScreener API reference](https://docs.dexscreener.com/api/reference)
- [LI.FI token information and price response](https://docs.li.fi/api-reference/fetch-information-about-a-token)
- [Tether's description of its currency peg](https://tether.to/en/faqs/)
