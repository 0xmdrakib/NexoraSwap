# Nexora Swap

Nexora Swap is a multi-router DEX interface for fast, cleaner token swaps across major EVM chains and Solana.

**Live app:** https://nexoraswap.rakibhq.xyz

---

## Overview

Nexora Swap is built for two core flows:

- **Same-chain EVM swaps:** Auto compares available routes between **1inch Direct** and **LI.FI Smart Routing**.
- **Solana and cross-chain swaps:** Uses **LI.FI** for Solana, EVM-to-Solana, Solana-to-EVM, and cross-chain execution, with **gas.zip** available as a dedicated cross-chain route option in the UI.

The app focuses on keeping swap execution more transparent by showing route selection, minimum received, wallet balances, USD estimates, and bridge-related fee details directly in the interface.

## Features

- Multi-router swap experience with **Auto**, **LI.FI Smart Routing**, **1inch Direct**, and **gas.zip** route options
- Same-chain route comparison in **Auto (best)** mode
- Cross-chain swaps across supported EVM networks and Solana routes supported by LI.FI
- Solana token lists, token metadata, USD prices, balances, and LI.FI transaction payload support
- Solana wallet support via Wallet Standard and injected wallets such as Phantom, MetaMask, Bitget, Solflare, and Backpack
- EVM wallets via MetaMask/WalletConnect, with Solana and EVM wallets handled separately in the UI
- Token selector and chain selector for both swap sides
- Wallet token balances in the token picker, plus LI.FI USD estimates with a DexScreener fallback
- Custom token import by contract address
- Minimum received estimate shown before swap confirmation
- Bridge fee estimate and `tx value` visibility for cross-chain swaps
- Exact ERC-20 approvals instead of unlimited approvals
- Human-readable error states for common quote and liquidity issues
- Liquidity source breakdown in the advanced route view

## Supported chains

- Ethereum
- Polygon
- Arbitrum
- Optimism
- Base
- BNB Chain
- Avalanche
- Solana

## Routing behavior

### Same-chain

- **Auto (best)** compares **1inch Direct** and **LI.FI Smart Routing** for same-chain EVM swaps and picks the better available quote.
- You can manually force **1inch Direct** or **LI.FI Smart Routing** from the route selector on EVM chains.
- Solana same-chain swaps use **LI.FI Smart Routing** because 1inch Direct is EVM-only in this app flow.

### Cross-chain

- Cross-chain swaps are handled through **LI.FI** in the current app flow, including Solana routes when LI.FI supports the pair.
- **gas.zip** is available as a selectable cross-chain route option.
- The UI surfaces estimated bridge fee information and the native token value the wallet will send for the transaction.

## Token information

Token selection, custom imports, shared swap links and wallet token lists use the same server metadata resolver:

1. Native tokens use local chain information. Other tokens first use the existing memory/Neon cache.
2. LI.FI is the primary source, with an address lookup when a token is absent from its token list.
3. On EVM networks, the 1inch Classic Swap token list is the second source, using the existing 1inch key and base URL.
4. For EVM tokens missing from both sources, the configured Alchemy RPC reads the contract's name, symbol and decimals. The RPC chain is checked before accepting the result.
5. If providers are unavailable, existing stale database metadata can still be used. Unknown tokens return an actionable error without guessing decimals.

Solana continues to use LI.FI and its existing RPC balance service. Token logos are optional; cached artwork is retained when a provider cannot supply it. Existing cache records do not need to be deleted or recreated. Swap routing is unchanged.

Run `npm test` for metadata and fallback regression coverage, then `npm run build` for the production build.

The cache uses PostgreSQL `bigint` chain IDs so Solana fits alongside EVM networks. On first use, older integer columns are widened in place while retaining existing records and keys. To include the real PostgreSQL migration test, set `NEXORA_TEST_POSTGRES_CONTAINER` to a disposable PostgreSQL container name before running `npm test`.

## USD price estimates

The single-token, batch and native-token price endpoints share a resolver: fresh cache, then LI.FI, then DexScreener when LI.FI has no valid price or is unavailable. LI.FI results must match the requested chain and address. Stablecoin prices are never forced to $1.

DexScreener fallback prices come from its broader token-pool list, with an alternate pool-list endpoint for availability. The batch token endpoint can expose an unrepresentative pool and is not used for price selection. Pools must match the chain and token, have positive reported liquidity and yield a finite positive USD price. The deepest eligible pool wins regardless of whether the token is the base or quote asset; quote-side prices are converted using the pool ratio. Solana address matching preserves case. These are market estimates, and a thin or distorted pool can still be unreliable; unavailable prices are returned as unknown.

Run `npm run audit:prices` for a live comparison of LI.FI-listed USDT/USDT0, USDC, DAI, bridged `.e` variants and native tokens across supported networks. It writes JSON and Markdown reports under `output/verification` and flags unavailable prices or differences above 5% for review. This is a repeatable sample, not continuous monitoring or coverage of every custom token.

## Tech stack

- Next.js 14
- React 18
- TypeScript
- Tailwind CSS
- Wagmi
- RainbowKit
- viem
- @solana/web3.js
- TanStack Query
- Neon Postgres cache for token metadata and price lookups

---

## License

This project is licensed under the [MIT License](./LICENSE).
