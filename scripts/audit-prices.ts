import { mkdir, writeFile } from 'node:fs/promises';
import { CHAIN_META } from '../src/lib/chainsMeta';
import { addressCacheKey } from '../src/lib/addresses';
import { getTokenPrices, selectDexScreenerPair } from '../src/lib/server/dexScreener';

type ListedToken = { address: string; symbol: string; priceUSD?: string };
type AuditRow = { chain: string; symbol: string; address: string; source?: string; appPrice?: number;
  poolPrice?: number; poolLiquidity?: number; differencePct?: number; error?: string };

async function readJson(url: string, headers: Record<string, string> = {}) {
  const response = await fetch(url, { headers, signal: AbortSignal.timeout(10_000) });
  if (!response.ok) throw new Error(`Provider HTTP ${response.status}`);
  return response.json();
}

async function main() {
  const rows: AuditRow[] = [];
  const lifiBase = (process.env.LIFI_BASE_URL || 'https://li.quest').replace(/\/+$/, '');
  const dexBase = (process.env.DEXSCREENER_BASE_URL || 'https://api.dexscreener.com').replace(/\/+$/, '');
  const headers: Record<string, string> = {};
  if (process.env.LIFI_API_KEY) headers['x-lifi-api-key'] = process.env.LIFI_API_KEY;

  for (const chain of Object.values(CHAIN_META)) {
    try {
      const listed = await readJson(`${lifiBase}/v1/tokens?chains=${chain.id}`, headers);
      const tokens: ListedToken[] = listed?.tokens?.[String(chain.id)] || [];
      const chosen = tokens.filter(token => /^(USDT0?|USDC|DAI)(\.e)?$/i.test(token.symbol)
        || addressCacheKey(chain.id, token.address) === addressCacheKey(chain.id, chain.nativeTokenAddress));
      // Small batches keep this read-only diagnostic within provider rate limits.
      for (let index = 0; index < chosen.length; index += 3) {
        const batch = chosen.slice(index, index + 3);
        const prices = await getTokenPrices(batch.map(token => ({ chainId: chain.id, address: token.address })));
        const checked = await Promise.all(batch.map(async (token, tokenIndex): Promise<AuditRow> => {
          const row: AuditRow = { chain: chain.name, symbol: token.symbol, address: token.address };
          try {
            const lookup = addressCacheKey(chain.id, token.address) === addressCacheKey(chain.id, chain.nativeTokenAddress)
              ? chain.wrappedNativeAddress : token.address;
            const pools = await readJson(`${dexBase}/token-pairs/v1/${chain.dexScreenerChain}/${encodeURIComponent(lookup)}`);
            const selected = selectDexScreenerPair(Array.isArray(pools) ? pools : [], chain.id, lookup);
            const price = Number(prices[tokenIndex]?.priceUSD);
            row.source = prices[tokenIndex]?.source;
            if (Number.isFinite(price) && price > 0) row.appPrice = price;
            if (selected) {
              row.poolPrice = Number(selected.priceUSD);
              row.poolLiquidity = Number(selected.pair.liquidity?.usd || 0);
              if (row.appPrice) row.differencePct = Math.abs(row.appPrice / row.poolPrice - 1) * 100;
            }
          } catch (error) { row.error = error instanceof Error ? error.message : 'Audit request failed'; }
          return row;
        }));
        rows.push(...checked);
      }
      console.log(`${chain.name}: ${chosen.length} token prices checked`);
    } catch (error) {
      rows.push({ chain: chain.name, symbol: '-', address: '', error: error instanceof Error ? error.message : 'Chain audit failed' });
    }
  }

  const flagged = rows.filter(row => row.error || !row.appPrice || (row.differencePct ?? 0) > 5);
  const report = { checkedAt: new Date().toISOString(), scope: 'LI.FI-listed USDT/USDT0, USDC, DAI, .e variants and native tokens on all supported chains',
    warning: 'A point-in-time sample, not every token or a guarantee of future prices. A difference above 5% flags review, not proof that either source is wrong.', rows };
  const format = (value?: number) => value === undefined ? 'Unavailable' : value.toFixed(6).replace(/0+$/, '').replace(/\.$/, '');
  const markdown = [
    '# Price audit', '', report.checkedAt, '', report.scope, '', report.warning, '',
    `Checked ${rows.length} entries; ${flagged.length} need review.`, '',
    '| Network | Token | App USD | Source | Broad-pool USD | Difference |',
    '|---|---|---:|---|---:|---:|',
    ...rows.map(row => `| ${row.chain} | ${row.symbol} | ${format(row.appPrice)} | ${row.source || row.error || '-'} | ${format(row.poolPrice)} | ${row.differencePct === undefined ? '-' : row.differencePct.toFixed(2) + '%'} |`),
    '', 'Low-liquidity pools can still be unreliable; pool liquidity and token addresses are included in the accompanying JSON.',
  ].join('\n');
  await mkdir('output/verification', { recursive: true });
  await writeFile('output/verification/pricing-audit.json', JSON.stringify(report, null, 2));
  await writeFile('output/verification/pricing-audit.md', markdown);
  console.log(JSON.stringify({ checked: rows.length, flagged }));
  if (flagged.length) process.exitCode = 1;
}

main().catch(() => { console.error('Price audit failed before completion'); process.exitCode = 1; });
