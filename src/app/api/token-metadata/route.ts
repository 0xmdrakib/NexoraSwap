import { NextRequest, NextResponse } from 'next/server';
import { getChainMeta } from '@/lib/chainsMeta';
import type { Token } from '@/lib/types';
import { cacheGet, cacheSet } from '@/lib/server/cache';
import { ERC20_ABI } from '@/lib/erc20';
import {
  Address,
  createPublicClient,
  decodeAbiParameters,
  http,
  getAddress,
  isAddress,
  parseAbiParameters,
} from 'viem';

type MoralisMetadata = {
  address: string;
  name: string;
  symbol: string;
  decimals: number;
  logo?: string | null;
  thumbnail?: string | null;
};

function toSafeAddress(value: unknown): Address | null {
  const s = typeof value === 'string' ? value.trim() : '';
  if (!s) return null;
  if (!isAddress(s, { strict: false })) return null;
  try {
    return getAddress(s);
  } catch {
    return null;
  }
}

async function moralisFetch(url: string, init: RequestInit = {}) {
  const key = process.env.MORALIS_API_KEY;
  if (!key) throw new Error('Missing MORALIS_API_KEY');
  const res = await fetch(url, {
    ...init,
    headers: {
      accept: 'application/json',
      'X-API-Key': key,
      ...(init.headers || {}),
    },
    cache: 'no-store',
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    throw new Error(`Moralis error ${res.status}: ${txt}`);
  }
  return res.json();
}

function getRpcUrl(chainId: number): string | undefined {
  // Your naming: ALCHEMY_RPC_URL_<CHAIN_ID>
  const perChain = process.env[`ALCHEMY_RPC_URL_${chainId}` as keyof NodeJS.ProcessEnv];
  if (typeof perChain === 'string' && perChain.trim()) return perChain.trim();
  // Optional single fallback.
  if (process.env.ALCHEMY_RPC_URL) return process.env.ALCHEMY_RPC_URL;
  return undefined;
}

async function readErc20String(
  client: ReturnType<typeof createPublicClient>,
  address: Address,
  fnName: 'name' | 'symbol'
): Promise<string | undefined> {
  // Most ERC20s
  try {
    const s = (await client.readContract({ address, abi: ERC20_ABI, functionName: fnName })) as unknown;
    if (typeof s === 'string' && s.trim()) return s.trim();
  } catch {
    // continue
  }

  // bytes32 variants
  try {
    const bytes32Abi =
      [
        {
          type: 'function',
          name: fnName,
          stateMutability: 'view',
          inputs: [],
          outputs: [{ type: 'bytes32' }],
        },
      ] as const;
    const b = (await client.readContract({ address, abi: bytes32Abi, functionName: fnName })) as unknown;
    if (typeof b === 'string' && b.startsWith('0x') && b.length === 66) {
      const [decoded] = decodeAbiParameters(parseAbiParameters('bytes32'), b as `0x${string}`);
      const hex = typeof decoded === 'string' ? decoded : (b as string);
      const buf = Buffer.from(hex.slice(2), 'hex');
      const str = buf.toString('utf8').replace(/\u0000/g, '').trim();
      if (str) return str;
    }
  } catch {
    // ignore
  }
  return undefined;
}

async function onchainTokenMeta(chainId: number, addrLc: string): Promise<Token | null> {
  const rpcUrl = getRpcUrl(chainId);
  if (!rpcUrl) return null;
  if (!isAddress(addrLc, { strict: false })) return null;

  const client = createPublicClient({ transport: http(rpcUrl) });
  const address = addrLc as Address;
  const code = await client.getBytecode({ address }).catch(() => null);
  if (!code) return null;

  const [name, symbol] = await Promise.all([
    readErc20String(client, address, 'name'),
    readErc20String(client, address, 'symbol'),
  ]);

  let decimals = 18;
  try {
    decimals = Number(await client.readContract({ address, abi: ERC20_ABI, functionName: 'decimals' }));
  } catch {
    // keep default
  }

  if (!name && !symbol) return null;
  return {
    chainId,
    address,
    name: name || symbol || 'Token',
    symbol: (symbol || name || 'TKN').slice(0, 32),
    decimals,
  };
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const chainId = Number(searchParams.get('chainId'));
  const address = (searchParams.get('address') || '').trim();

  if (!chainId || !address) {
    return NextResponse.json({ error: 'chainId and address are required' }, { status: 400 });
  }

  const addr = toSafeAddress(address);
  if (!addr) {
    return NextResponse.json({ error: 'Invalid address' }, { status: 400 });
  }
  const addrLc = addr.toLowerCase();

  const meta = getChainMeta(chainId);
  const cacheKey = `tokenMeta:${meta.moralisChain}:${addrLc}`;
  const cached = cacheGet<any>(cacheKey);
  if (cached) return NextResponse.json(cached);

  // 1) Primary: Moralis metadata
  try {
    const url = `https://deep-index.moralis.io/api/v2.2/erc20/metadata?chain=${meta.moralisChain}&addresses%5B0%5D=${addrLc}`;
    const data: MoralisMetadata[] = await moralisFetch(url);
    const m = data?.[0];
    if (m?.address) {
      const token: Token = {
        chainId,
        address: toSafeAddress(m.address) ?? addr,
        name: m.name,
        symbol: m.symbol,
        decimals: Number(m.decimals),
        logoURI: m.logo || m.thumbnail || undefined,
      };
      const payload = { token };
      cacheSet(cacheKey, payload, 60 * 60 * 1000);
      return NextResponse.json(payload);
    }
  } catch {
    // fall through to on-chain fallback
  }

  // 2) Fallback: on-chain read via RPC (Alchemy)
  const onchain = await onchainTokenMeta(chainId, addrLc);
  if (onchain) {
    const payload = { token: onchain };
    cacheSet(cacheKey, payload, 15 * 60 * 1000);
    return NextResponse.json(payload);
  }

  return NextResponse.json(
    { error: 'Token not found (Moralis + RPC fallback failed). Check chain + contract address.' },
    { status: 404 }
  );
}
