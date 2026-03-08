[README.md](https://github.com/user-attachments/files/25821987/README.md)
# Nexora Swap

Nexora Swap is a multi-router DEX interface for fast, cleaner token swaps across major EVM chains.

**Live app:** https://nexoraswap.online/

## Overview

Nexora Swap is built for two core flows:

- **Same-chain swaps:** Auto compares available routes between **1inch Direct** and **LI.FI Smart Routing**.
- **Cross-chain swaps:** Uses **LI.FI** for cross-chain execution, with **gas.zip** available as a dedicated cross-chain route option in the UI.

The app focuses on keeping swap execution more transparent by showing route selection, minimum received, wallet balances, USD estimates, and bridge-related fee details directly in the interface.

## Features

- Multi-router swap experience with **Auto**, **LI.FI Smart Routing**, **1inch Direct**, and **gas.zip** route options
- Same-chain route comparison in **Auto (best)** mode
- Cross-chain swaps across supported EVM networks
- Token selector and chain selector for both swap sides
- Wallet token balances and USD values in the token picker
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

## Routing behavior

### Same-chain

- **Auto (best)** compares **1inch Direct** and **LI.FI Smart Routing** and picks the better available quote.
- You can manually force **1inch Direct** or **LI.FI Smart Routing** from the route selector.

### Cross-chain

- Cross-chain swaps are handled through **LI.FI** in the current app flow.
- **gas.zip** is available as a selectable cross-chain route option.
- The UI surfaces estimated bridge fee information and the native token value the wallet will send for the transaction.

## Tech stack

- Next.js 14
- React 18
- TypeScript
- Tailwind CSS
- Wagmi
- RainbowKit
- viem
- TanStack Query

## Getting started

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment variables

Create a `.env.local` file in the project root.

```env
NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID=
MORALIS_API_KEY=
LIFI_API_KEY=
LIFI_BASE_URL=https://li.quest
LIFI_INTEGRATOR=swapdex-starter
ONEINCH_API_KEY=
ONEINCH_AUTHORIZATION=
ONEINCH_BASE_URL=
ALCHEMY_RPC_URL=
ALCHEMY_RPC_URL_1=
ALCHEMY_RPC_URL_10=
ALCHEMY_RPC_URL_56=
ALCHEMY_RPC_URL_137=
ALCHEMY_RPC_URL_8453=
ALCHEMY_RPC_URL_42161=
ALCHEMY_RPC_URL_43114=
THEGRAPH_API_KEY=
UNISWAP_SUBGRAPH_ID=
NODEREAL_PANCAKE_GRAPHQL_URL=
```

### 3. Run the development server

```bash
npm run dev
```

Open `http://localhost:3000` in your browser.

## Environment notes

- `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` is needed for wallet connection.
- `MORALIS_API_KEY` powers wallet token balances, token metadata, and pricing fallbacks used by the UI.
- `LIFI_API_KEY` is optional, but useful if you want authenticated LI.FI requests.
- `ONEINCH_API_KEY` or `ONEINCH_AUTHORIZATION` can be used for 1inch authenticated access; the code also contains public-host fallbacks.
- `ALCHEMY_RPC_URL` or `ALCHEMY_RPC_URL_<CHAIN_ID>` helps on-chain token metadata fallback.
- `THEGRAPH_API_KEY`, `UNISWAP_SUBGRAPH_ID`, and `NODEREAL_PANCAKE_GRAPHQL_URL` are only needed if you want those optional proxy routes available.

## Project structure

```text
src/
├── app/
│   ├── api/          # Quote, token, price, metadata, and helper routes
│   ├── layout.tsx    # App shell and metadata
│   ├── page.tsx      # Main swap page
│   └── providers.tsx # Wagmi, RainbowKit, React Query providers
├── components/       # Swap UI, token selector, chain selector, shared UI
└── lib/              # Chains, hooks, token helpers, wagmi config, server utilities
```

## License

This project is licensed under the [MIT License](./LICENSE).
