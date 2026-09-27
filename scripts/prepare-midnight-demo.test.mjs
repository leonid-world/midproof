import test from 'node:test';
import assert from 'node:assert/strict';
import { prepareMidnightDemo } from './prepare-midnight-demo.mjs';

const ENV = { MIDNIGHT_DEMO_MODE: 'hosted-demo', MIDNIGHT_NETWORK_ID: 'preview' };
const CONTRACT = '0x0f264334f98ba0d22f7fc6bb901a5fa36158a315';
const ZERO = `0x${'0'.repeat(40)}`;
const DOCUMENT = `0x${'0'.repeat(64)}`;
const ACTORS = [
  { role: 'seller', companyId: 1, wallet: '0x60602ed43987ea474a85c12a4e768dc8062b4361' },
  { role: 'buyer', companyId: 2, wallet: '0xf0aa8d7ca5c7e3e586dcc40397147ac98e3717bb' },
  { role: 'funder', companyId: 3, wallet: '0x3dc823dc2c1caf3c14b5b882c7e9a80cc40df9b7' },
];
const HASHES = [
  '0x8a503d62739c847c116eaa219a8df2fc4056be3718d7b174808043bb97ae034f',
  '0xc95dce2a32da5fd3291463cdf4d3555cbb864a75fa69e03c926b236143f7597f',
  '0x85351179285e6bd4dc06d47764d113f7c69cc81c213f1b247098d38efac5d912',
];
const POLICY = { demoEnabled: true, tokenSymbol: 'mKRW', tokenDecimals: 0, minAmount: '1', maxFaceValue: '10000', maxFundingAmount: '10000', suggestedFaceValue: '1000', suggestedFundingAmount: '900' };

function historicalRow(overrides = {}) {
  return {
    receivableId: 7, sellerCompanyId: 1, buyerCompanyId: 2,
    sellerWalletAddress: ACTORS[0].wallet, buyerWalletAddress: ACTORS[1].wallet,
    faceValue: '1000000000000', fundingAmount: '10000000000',
    issueDate: '2026-08-06', maturityDate: '2026-08-28', documentHash: DOCUMENT,
    description: 'Midnight synthetic demo: existing public GIWA test receivable #2 (historical dates; no new funding).',
    status: 'CREATED', funderCompanyId: null, onchainReceivableId: null,
    ...overrides,
  };
}

function mockServices(t, { rows = [], policy = POLICY, freshAccounts = false } = {}) {
  const calls = [];
  const response = (data, status = 200) => new Response(JSON.stringify(data), { status });
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    url = new URL(url);
    const body = options.body ? JSON.parse(options.body) : undefined;
    const call = { host: url.hostname, route: url.pathname, method: options.method, body };
    calls.push(call);
    if (url.hostname !== '127.0.0.1') {
      if (body.method === 'eth_chainId') return response({ result: '0x164ce' });
      if (body.method === 'eth_call') {
        const words = [2n, ACTORS[0].wallet, ACTORS[1].wallet, ZERO, 1000000000000n, 10000000000n,
          BigInt(Date.parse('2026-08-06') / 1000), BigInt(Date.parse('2026-08-28') / 1000), DOCUMENT, 2n, 2n];
        return response({ result: `0x${words.map((value) => BigInt(value).toString(16).padStart(64, '0')).join('')}` });
      }
      assert.fail(`Unexpected RPC ${body.method}`);
    }
    if (url.pathname === '/auth/login' || url.pathname === '/auth/signup') {
      const actor = ACTORS.find((item) => `${item.role}@midnight-demo.test` === body.email);
      assert.ok(actor);
      assert.equal(body.password, 'MidnightDemo2026!');
      if (freshAccounts && url.pathname === '/auth/login') return response({}, 401);
      return response({ accessToken: actor.role, user: { email: body.email, companyId: actor.companyId } }, url.pathname === '/auth/signup' ? 201 : 200);
    }
    const actor = ACTORS.find((item) => `Bearer ${item.role}` === options.headers.Authorization);
    assert.ok(actor);
    if (url.pathname === '/wallet/me') return response(freshAccounts ? {} : { walletAddress: actor.wallet }, freshAccounts ? 404 : 200);
    if (url.pathname === '/wallet/connect') {
      assert.equal(body.walletAddress, actor.wallet);
      return response({ walletAddress: actor.wallet });
    }
    if (url.pathname === '/receivables/amount-policy') return response(policy);
    if (url.pathname === '/receivables' && options.method === 'GET') return response(rows);
    if (url.pathname === '/receivables/funding-opportunities') return response(rows);
    if (url.pathname === '/blockchain-transactions') return response({ txStatus: 'CONFIRMED', rpcVerifiedAt: '2026-09-17T00:00:00Z' });
    if (url.pathname === '/receivables/7/chain-created') Object.assign(rows[0], { onchainReceivableId: '2', contractAddress: CONTRACT, createTxHash: HASHES[0] });
    else if (url.pathname === '/receivables/7/verified') Object.assign(rows[0], { status: 'VERIFIED', verifyTxHash: HASHES[1] });
    else if (url.pathname === '/receivables/7/tokenized') Object.assign(rows[0], { status: 'TOKENIZED', tokenId: '2', tokenizeTxHash: HASHES[2] });
    else if (url.pathname !== '/receivables/7') assert.fail(`Unexpected API ${options.method} ${url.pathname}`);
    return response(rows[0]);
  });
  return calls;
}

test('a fresh capped demo prepares accounts without creating the oversized historical receivable or calling its chain', async (t) => {
  const calls = mockServices(t, { freshAccounts: true });
  assert.deepEqual(await prepareMidnightDemo(ENV), { receivableId: null, onchainReceivableId: null });
  assert.equal(calls.filter((call) => call.route === '/auth/signup').length, 3);
  assert.equal(calls.filter((call) => call.route === '/wallet/connect').length, 3);
  assert.equal(calls.some((call) => call.route === '/receivables' && call.method === 'POST'), false);
  assert.equal(calls.some((call) => call.host !== '127.0.0.1'), false);
  assert.equal(calls.some((call) => call.route === '/blockchain-transactions'), false);
});

test('an existing historical receivable retains exact amounts and replays the verified lifecycle under the smaller cap', async (t) => {
  const rows = [historicalRow()];
  const calls = mockServices(t, { rows });
  assert.deepEqual(await prepareMidnightDemo(ENV), { receivableId: 7, onchainReceivableId: '2' });
  assert.equal(rows[0].faceValue, '1000000000000');
  assert.equal(rows[0].fundingAmount, '10000000000');
  assert.equal(rows[0].status, 'TOKENIZED');
  assert.equal(calls.some((call) => call.route === '/receivables' && call.method === 'POST'), false);
  assert.deepEqual(calls.filter((call) => call.route === '/blockchain-transactions').map((call) => call.body.transactionType), ['CREATE_RECEIVABLE', 'VERIFY_RECEIVABLE', 'TOKENIZE_RECEIVABLE']);
  assert.deepEqual(calls.filter((call) => call.host !== '127.0.0.1').map((call) => call.body.method), ['eth_chainId', 'eth_call']);
});

test('a duplicate or mismatched historical record is never skipped as a fresh demo', async (t) => {
  for (const rows of [[historicalRow(), historicalRow({ receivableId: 8 })], [historicalRow({ faceValue: '1000' })]]) {
    const calls = mockServices(t, { rows });
    await assert.rejects(prepareMidnightDemo(ENV), /EXISTING_DEMO_RECEIVABLE_CONFLICT_NO_OVERWRITE/);
    assert.equal(calls.some((call) => call.route === '/receivables' && call.method === 'POST'), false);
    assert.equal(calls.some((call) => call.host !== '127.0.0.1'), false);
  }
});

test('an invalid amount policy cannot authorize an oversized fixture POST', async (t) => {
  const calls = mockServices(t, { policy: { ...POLICY, maxFaceValue: null } });
  await assert.rejects(prepareMidnightDemo(ENV), /DEMO_AMOUNT_POLICY_INVALID/);
  assert.equal(calls.some((call) => call.route === '/receivables' && call.method === 'POST'), false);
  assert.equal(calls.some((call) => call.host !== '127.0.0.1'), false);
});
