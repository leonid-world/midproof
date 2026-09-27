import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { freshSchema } from './midnight-demo.mjs';
import { localDemoEnvironment } from './local-demo-entrypoint.mjs';
const run = promisify(execFile);

test('local MySQL init is the current CREATE-only schema, never a destructive reset', async () => {
  const canonical = await readFile(new URL('../.codex/schema.sql', import.meta.url), 'utf8');
  const actual = await readFile(new URL('../docker/local/schema.sql', import.meta.url), 'utf8');
  assert.equal(actual.split('\n').slice(1).join('\n'), freshSchema(canonical));
  assert.doesNotMatch(actual, /\b(?:DROP|TRUNCATE|DELETE|ALTER)\b/i);
});

test('local runtime needs no GIWA fixture and blocks public RPC/fixture preparation', () => {
  const env = localDemoEnvironment({
    MIDPROOF_LOCAL_DEMO: 'true', MIDNIGHT_NETWORK_ID: 'undeployed',
    MIDPROOF_SYNTHETIC_ONLY: 'false', GIWA_RPC_URL: 'https://sepolia-rpc.giwa.io',
    GIWA_CHAIN_ID: '91342', GIWA_RECEIVABLE_FINANCE_ADDRESS: '0x2222222222222222222222222222222222222222',
    MIDPROOF_DEMO_FIXTURE_FILE: '/old-owner/signers.json', MIDPROOF_LOCAL_CONFIG_DIR: '/old-config',
    MIDNIGHT_DEMO_PREPARE_FIXTURE: 'true',
  }, { jwt: 'test-jwt', capability: 'test-capability' });
  assert.equal(env.MIDPROOF_SYNTHETIC_ONLY, 'true');
  assert.equal(env.GIWA_RPC_URL, 'http://127.0.0.1:1');
  assert.equal(env.GIWA_CHAIN_ID, '31337');
  assert.equal(env.GIWA_RECEIVABLE_FINANCE_ADDRESS, '0x1111111111111111111111111111111111111111');
  assert.equal(env.MIDPROOF_DEMO_FIXTURE_FILE, undefined);
  assert.equal(env.MIDPROOF_LOCAL_CONFIG_DIR, undefined);
  assert.equal(env.MIDNIGHT_DEMO_PREPARE_FIXTURE, 'false');
  assert.equal(env.MIDPROOF_LOCAL_PREPARE_ACCOUNTS, 'true');
  assert.equal(env.JWT_SECRET, 'test-jwt');
  assert.equal(env.MIDNIGHT_CAPABILITY_ENCRYPTION_KEY, 'test-capability');
});

test('local runtime environment cannot be selected on Preview or hosted state', () => {
  for (const env of [
    { MIDNIGHT_NETWORK_ID: 'undeployed' },
    { MIDPROOF_LOCAL_DEMO: 'true', MIDNIGHT_NETWORK_ID: 'preview' },
    { MIDPROOF_LOCAL_DEMO: 'true', MIDNIGHT_NETWORK_ID: 'undeployed', RAILWAY_ENVIRONMENT_ID: 'hosted' },
  ]) assert.throws(() => localDemoEnvironment(env, {}), /LOCAL_DEMO_PROFILE_REQUIRED/);
});

test('local actor setup rejects public-network or implicit execution before RPC', async () => {
  const script = new URL('./prepare-local-demo-accounts.mjs', import.meta.url);
  for (const env of [
    { MIDNIGHT_NETWORK_ID: 'undeployed' },
    { MIDPROOF_LOCAL_DEMO: 'true', MIDNIGHT_NETWORK_ID: 'preview' },
    { MIDPROOF_LOCAL_DEMO: 'true', MIDNIGHT_NETWORK_ID: 'undeployed', RAILWAY_ENVIRONMENT_ID: 'hosted' },
  ]) {
    await assert.rejects(run(process.execPath, [script.pathname], { env }), (error) => {
      assert.match(error.stderr, /SYNTHETIC_DEMO_PROFILE_REQUIRED/);
      return true;
    });
  }
});
