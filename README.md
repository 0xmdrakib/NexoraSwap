Nexora Swap is live 🚀

A multi-router DEX UI that makes swaps feels *clean*:
• Same-chain: Auto (best) between 1inch + LI.FI
• Cross-chain: LI.FI + gas.zip (bridge + swap).
• Clean “min received”, balances + USD, and human-friendly errors.

Try it: https://nexoraswap.vercel.app

2/ Routing logic (simple, predictable):

✅ From chain ≠ To chain → LI.FI (bridging + swap)
✅ Same chain → Auto compares routes (1inch vs LI.FI)
✅ From chain ≠ To chain → gas.zip (only bridge)
↳ You can manually switch the route any time.

The UI shows which dex/liquidity used.

3/ Supported chains (7):

• Ethereum • Polygon • Arbitrum • Optimism • Base • BSC • Avalanche
• One UI, multiple chains - no tab-hopping.

(So you can go wherever liquidity lives without changing apps.)

4/ The “pro UX” bits I cared about:

• Token selector + chain selector inside both From & To
• Wallet balances + USD shown next to tokens
• Custom token add by contract address (per chain)
• Slippage control + Minimum received (token + USD)
• Exact approvals (no infinite approve)

5/ Bridge transparency (cross-chain):

When a route needs native value / fees, the UI shows:
• Bridge DEX fee (est.) + USD
• Wallet will send (tx value) + USD

So you’re not surprised by what the wallet is actually paying.

6/ Token data:

• Wallet token scanning + metadata + logos via Moralis
• Price fallback when needed (so UI doesn’t go blank)

If a token logo/price is missing, reply with the token + chain and I’ll patch it fast.

7/ I’d love real feedback:

Reply with:
• chain
• token pair
• what felt confusing / slow

Next upgrades I’m considering:
More clean + faster UI, better route details, more swap route, and many more.
Let’s make swaps less painful. 🧠⚡️

