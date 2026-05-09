import { neon } from '@neondatabase/serverless';

type SqlClient = ReturnType<typeof neon>;

let sqlClient: SqlClient | null | undefined;
let schemaReady: Promise<void> | null = null;

export function isDatabaseConfigured() {
  return Boolean(process.env.DATABASE_URL?.trim());
}

export function getSqlClient(): SqlClient | null {
  if (sqlClient !== undefined) return sqlClient;

  const url = process.env.DATABASE_URL?.trim();
  if (!url) {
    sqlClient = null;
    return null;
  }

  sqlClient = neon(url);
  return sqlClient;
}

async function createSchema(sql: SqlClient) {
  await sql`
    CREATE TABLE IF NOT EXISTS token_metadata (
      chain_id integer NOT NULL,
      address text NOT NULL,
      name text NOT NULL,
      symbol text NOT NULL,
      decimals integer NOT NULL,
      logo_uri text,
      thumbnail_uri text,
      possible_spam boolean,
      source text NOT NULL DEFAULT 'moralis',
      fetched_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (chain_id, address)
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS token_price_cache (
      chain_id integer NOT NULL,
      address text NOT NULL,
      price_usd text NOT NULL,
      pair_address text,
      dex_id text,
      liquidity_usd text,
      fetched_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (chain_id, address)
    )
  `;

  await sql`
    CREATE INDEX IF NOT EXISTS token_metadata_fetched_at_idx
      ON token_metadata (fetched_at)
  `;

  await sql`
    CREATE INDEX IF NOT EXISTS token_price_cache_fetched_at_idx
      ON token_price_cache (fetched_at)
  `;
}

export async function getCacheSql(): Promise<SqlClient | null> {
  const sql = getSqlClient();
  if (!sql) return null;

  if (!schemaReady) {
    schemaReady = createSchema(sql);
  }

  try {
    await schemaReady;
  } catch (e) {
    schemaReady = null;
    throw e;
  }

  return sql;
}
