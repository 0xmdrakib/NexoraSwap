import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { test } from 'node:test';
import { neon, neonConfig } from '@neondatabase/serverless';

import { SOLANA_CHAIN_ID } from '../src/lib/chainsMeta';
import { createSchema } from '../src/lib/server/db';

// Optional real PostgreSQL coverage. The container must be a disposable test
// database with a postgres superuser, accessible through docker exec.
const container = process.env.NEXORA_TEST_POSTGRES_CONTAINER;

test('PostgreSQL cache migration preserves EVM data and accepts Solana on new and existing schemas', {
  skip: !container && 'Set NEXORA_TEST_POSTGRES_CONTAINER to run the PostgreSQL integration test',
}, async () => {
  const schema = `nexora_cache_test_${process.pid}`;
  const originalFetch = neonConfig.fetchFunction;
  function execute(query: string) {
    return execFileSync('docker', ['exec', '-i', container!, 'psql', '-U', 'postgres', '-d', 'postgres', '-X', '-qAt', '-v', 'ON_ERROR_STOP=1'], {
      input: `SET search_path TO ${schema};\n${query}`,
      encoding: 'utf8', windowsHide: true, stdio: 'pipe',
    }).trim();
  }
  const sql = neon<boolean, boolean>('postgresql://test:test@database.example.test/test');
  neonConfig.fetchFunction = async (_input: unknown, init: RequestInit) => {
    const body = JSON.parse(String(init.body));
    assert.equal(body.params.length, 0, 'Schema statements must not contain unresolved parameters');
    execute(body.query);
    return new Response(JSON.stringify({ command: 'DDL', rowCount: 0, fields: [], rows: [] }), {
      headers: { 'content-type': 'application/json' },
    });
  };

  execute(`CREATE SCHEMA ${schema};`);
  try {
    await createSchema(sql);
    const types = () => execute(`SELECT data_type FROM information_schema.columns
      WHERE table_schema = '${schema}' AND column_name = 'chain_id' ORDER BY table_name;`);
    assert.equal(types(), 'bigint\nbigint');

    // Recreate the deployed legacy column types and seed representative data.
    execute(`ALTER TABLE token_metadata ALTER COLUMN chain_id TYPE integer;
      ALTER TABLE token_price_cache ALTER COLUMN chain_id TYPE integer;
      INSERT INTO token_metadata (chain_id,address,name,symbol,decimals,logo_uri)
        VALUES (1,'evm-fixture','Existing Token','OLD',0,'https://assets.example.test/logo.png');
      INSERT INTO token_price_cache (chain_id,address,price_usd) VALUES (1,'evm-fixture','1.25');`);
    assert.throws(() => execute(`INSERT INTO token_metadata (chain_id,address,name,symbol,decimals)
      VALUES (${SOLANA_CHAIN_ID},'solana-fixture','Solana Token','SOLTEST',6);`));

    await createSchema(sql);
    assert.equal(types(), 'bigint\nbigint');
    assert.equal(execute(`SELECT symbol,decimals,logo_uri FROM token_metadata WHERE chain_id=1;`),
      'OLD|0|https://assets.example.test/logo.png');
    assert.equal(execute(`SELECT price_usd FROM token_price_cache WHERE chain_id=1;`), '1.25');

    execute(`INSERT INTO token_metadata (chain_id,address,name,symbol,decimals)
        VALUES (${SOLANA_CHAIN_ID},'solana-fixture','Solana Token','SOLTEST',6);
      INSERT INTO token_price_cache (chain_id,address,price_usd)
        VALUES (${SOLANA_CHAIN_ID},'solana-fixture','2.50');`);
    await createSchema(sql); // Repeated initialization must preserve both chains.
    assert.equal(execute(`SELECT chain_id FROM token_metadata ORDER BY chain_id;`), `1\n${SOLANA_CHAIN_ID}`);
    assert.equal(execute(`SELECT price_usd FROM token_price_cache WHERE chain_id=${SOLANA_CHAIN_ID};`), '2.50');
    assert.throws(() => execute(`INSERT INTO token_price_cache (chain_id,address,price_usd)
      VALUES (${SOLANA_CHAIN_ID},'solana-fixture','3');`), 'The composite primary key must remain enforced');
  } finally {
    neonConfig.fetchFunction = originalFetch;
    execute(`DROP SCHEMA ${schema} CASCADE;`);
  }
});
