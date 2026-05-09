import type { Address } from '@/lib/types';

const ZERO: Address = '0x0000000000000000000000000000000000000000';

export type AlchemyTokenBalance = {
  contractAddress: Address;
  tokenBalance: string;
};

export type SelectedTokenBalance = {
  chainId: number;
  address: Address;
  balance: string;
};

function getAlchemyRpcUrl(chainId: number): string {
  const perChain = process.env[`ALCHEMY_RPC_URL_${chainId}` as keyof NodeJS.ProcessEnv];
  const fallback = process.env.ALCHEMY_RPC_URL;
  const url = (typeof perChain === 'string' && perChain.trim()) || fallback?.trim();
  if (!url) throw new Error(`Missing ALCHEMY_RPC_URL_${chainId}`);
  return url;
}

async function alchemyRpc<T>(chainId: number, method: string, params: unknown[]): Promise<T> {
  const res = await fetch(getAlchemyRpcUrl(chainId), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: Date.now(),
      method,
      params,
    }),
    cache: 'no-store',
  });

  const json = await res.json().catch(() => null);
  if (!res.ok || json?.error) {
    const msg = json?.error?.message || `Alchemy ${method} failed`;
    throw new Error(msg);
  }

  return json.result as T;
}

function hexToDecimalString(value: string | null | undefined) {
  if (!value || value === '0x') return '0';
  try {
    return BigInt(value).toString();
  } catch {
    return '0';
  }
}

export async function getNativeBalance(chainId: number, walletAddress: Address): Promise<string> {
  const hex = await alchemyRpc<string>(chainId, 'eth_getBalance', [walletAddress, 'latest']);
  return hexToDecimalString(hex);
}

export async function getAlchemyTokenBalances(
  chainId: number,
  walletAddress: Address,
  contractAddresses?: Address[]
): Promise<AlchemyTokenBalance[]> {
  const params: unknown[] = contractAddresses?.length
    ? [walletAddress, contractAddresses]
    : [walletAddress, 'erc20'];

  const result = await alchemyRpc<{
    tokenBalances?: Array<{ contractAddress?: string; tokenBalance?: string | null; error?: string | null }>;
  }>(chainId, 'alchemy_getTokenBalances', params);

  return (result?.tokenBalances || [])
    .filter((item) => item?.contractAddress && !item.error)
    .map((item) => ({
      contractAddress: item.contractAddress!.toLowerCase() as Address,
      tokenBalance: hexToDecimalString(item.tokenBalance),
    }));
}

export async function getSelectedBalances(
  walletAddress: Address,
  tokens: Array<{ chainId: number; address: Address }>
): Promise<SelectedTokenBalance[]> {
  const grouped = new Map<number, Address[]>();
  for (const token of tokens) {
    const address = token.address.toLowerCase() as Address;
    const list = grouped.get(token.chainId) || [];
    list.push(address);
    grouped.set(token.chainId, list);
  }

  const out: SelectedTokenBalance[] = [];

  await Promise.all(
    Array.from(grouped.entries()).map(async ([chainId, addresses]) => {
      const nativeRequested = addresses.some((addr) => addr === ZERO);
      const erc20 = addresses.filter((addr) => addr !== ZERO);

      const [nativeBalance, tokenBalances] = await Promise.all([
        nativeRequested ? getNativeBalance(chainId, walletAddress) : Promise.resolve(null),
        erc20.length ? getAlchemyTokenBalances(chainId, walletAddress, erc20) : Promise.resolve([]),
      ]);

      if (nativeRequested && nativeBalance !== null) {
        out.push({ chainId, address: ZERO, balance: nativeBalance });
      }

      const tokenBalanceByAddr = new Map(
        tokenBalances.map((balance) => [balance.contractAddress.toLowerCase(), balance.tokenBalance])
      );
      for (const address of erc20) {
        out.push({
          chainId,
          address,
          balance: tokenBalanceByAddr.get(address.toLowerCase()) || '0',
        });
      }
    })
  );

  return out;
}
