import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { freshSchema } from './midnight-demo.mjs';
const run = promisify(execFile);

test('local MySQL init is the current CREATE-only schema, never a destructive reset', async () => {
  const canonical = await readFile(new URL('../.codex/schema.sql', import.meta.url), 'utf8');
  const actual = await readFile(new URL('../docker/local/schema.sql', import.meta.url), 'utf8');
  assert.equal(actual.split('\n').slice(1).join('\n'), freshSchema(canonical));
  assert.doesNotMatch(actual, /\b(?:DROP|TRUNCATE|DELETE|ALTER)\b/i);
});

test('local actor setup rejects public-network or implicit execution before RPC', async () => {
  const script = new URL('./prepare-local-demo-accounts.mjs', import.meta.url);
  for (const env of [
    { MIDNIGHT_NETWORK_ID: 'undeployed' },
    { MIDPROOF_LOCAL_DEMO: 'true', MIDNIGHT_NETWORK_ID: 'preview' },
    { MIDPROOF_LOCAL_DEMO: 'true', MIDNIGHT_NETWORK_ID: 'undeployed', RAILWAY_ENVIRONMENT_ID: 'hosted' },
  ]) {
    await assert.rejects(run(process.execPath, [script.pathname], { env }), (error) => {
      assert.match(error.stderr, /LOCAL_DEMO_PROFILE_REQUIRED/);
      return true;
    });
  }
});
