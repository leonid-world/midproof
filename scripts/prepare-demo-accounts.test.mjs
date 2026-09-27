import test from 'node:test';
import assert from 'node:assert/strict';
import { prepareDemoAccounts } from './prepare-local-demo-accounts.mjs';

const env = { MIDPROOF_SYNTHETIC_ONLY: 'true', MIDNIGHT_DEMO_MODE: 'hosted-demo', MIDNIGHT_NETWORK_ID: 'preview', RAILWAY_ENVIRONMENT_ID: 'existing-app' };
const reply = (status, email) => ({ status, json: async () => ({ user: { email } }) });

test('hosted synthetic startup reuses accounts using only private login calls', async () => {
  const calls = [];
  await prepareDemoAccounts(env, async (url, options) => {
    assert.equal(url.origin, 'http://127.0.0.1:8081');
    assert.equal(options.redirect, 'error');
    calls.push(url.pathname);
    return reply(200, JSON.parse(options.body).email);
  });
  assert.deepEqual(calls, ['/auth/login', '/auth/login', '/auth/login']);
});

test('empty demo creates only synthetic accounts and never wallets, assets or RPC requests', async () => {
  const calls = [];
  await prepareDemoAccounts({ ...env, MIDNIGHT_NETWORK_ID: 'undeployed' }, async (url, options) => {
    const body = JSON.parse(options.body);
    calls.push(url.pathname);
    assert.ok(body.email.endsWith('@midnight-demo.test'));
    if (url.pathname === '/auth/login') return reply(401);
    assert.equal(url.pathname, '/auth/signup');
    assert.match(body.companyName, /^MidProof Synthetic Demo /);
    return reply(201, body.email);
  });
  assert.deepEqual(calls, Array.from({ length: 3 }, () => ['/auth/login', '/auth/signup']).flat());
});

test('conflicting or unavailable existing account stops without resetting data', async () => {
  for (const status of [403, 409, 500]) {
    const calls = [];
    await assert.rejects(prepareDemoAccounts(env, async (url) => { calls.push(url.pathname); return reply(status); }), /DEMO_ACCOUNT_CONFLICT/);
    assert.deepEqual(calls, ['/auth/login']);
  }
  await assert.rejects(prepareDemoAccounts(env, async () => reply(200, 'unexpected@example.org')), /IDENTITY_MISMATCH/);
});

test('non-demo profiles and remote or credentialed targets fail before any request', async () => {
  let called = false;
  const noRequest = async () => { called = true; throw new Error('must not request'); };
  for (const invalid of [{}, { ...env, MIDNIGHT_NETWORK_ID: 'mainnet' }, { ...env, MIDPROOF_SYNTHETIC_ONLY: 'false' }]) {
    await assert.rejects(prepareDemoAccounts(invalid, noRequest), /PROFILE_REQUIRED/);
  }
  for (const url of ['https://example.org', 'http://user:secret@localhost:8081', 'http://localhost:8081/path', 'http://localhost:8081/?token=value']) {
    await assert.rejects(prepareDemoAccounts({ ...env, MIDNIGHT_DEMO_AUTHORITY_URL: url }, noRequest), /PRIVATE_SPRING_URL_REQUIRED/);
  }
  assert.equal(called, false);
});
