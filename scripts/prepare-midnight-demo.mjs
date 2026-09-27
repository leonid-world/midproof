#!/usr/bin/env node
// Prepare synthetic accounts and restore an existing public test receivable
// when allowed. Fresh capped demos create small receivables through the UI.
// This script never sends a blockchain transaction.
import { pathToFileURL } from 'node:url';

const CONTRACT = '0x0f264334f98ba0d22f7fc6bb901a5fa36158a315';
const ONCHAIN_ID = '2';
const ZERO = `0x${'0'.repeat(40)}`;
const DOCUMENT = `0x${'0'.repeat(64)}`;
const DESCRIPTION = 'Midnight synthetic demo: existing public GIWA test receivable #2 (historical dates; no new funding).';
// Intentionally public demo credentials, unrelated to real accounts or keys.
const PASSWORD = 'MidnightDemo2026!';
const ACTORS = [
  { role: 'seller', businessNumber: '9900000001', wallet: '0x60602ed43987ea474a85c12a4e768dc8062b4361' },
  { role: 'buyer', businessNumber: '9900000002', wallet: '0xf0aa8d7ca5c7e3e586dcc40397147ac98e3717bb' },
  { role: 'funder', businessNumber: '9900000003', wallet: '0x3dc823dc2c1caf3c14b5b882c7e9a80cc40df9b7' },
];
const TRANSACTIONS = [
  { type: 'CREATE_RECEIVABLE', actor: 'seller', hash: '0x8a503d62739c847c116eaa219a8df2fc4056be3718d7b174808043bb97ae034f' },
  { type: 'VERIFY_RECEIVABLE', actor: 'buyer', hash: '0xc95dce2a32da5fd3291463cdf4d3555cbb864a75fa69e03c926b236143f7597f' },
  { type: 'TOKENIZE_RECEIVABLE', actor: 'seller', hash: '0x85351179285e6bd4dc06d47764d113f7c69cc81c213f1b247098d38efac5d912' },
];
const TERMS = { faceValue: '1000000000000', fundingAmount: '10000000000', issueDate: '2026-08-06', maturityDate: '2026-08-28', documentHash: DOCUMENT };
const delay = (ms) => new Promise((done) => setTimeout(done, ms));
function fail(code) { throw new Error(code); }
function report(code, fields = {}) { process.stdout.write(`${JSON.stringify({ service: 'midnight-demo-fixture', code, ...fields })}\n`); }

function configuration(env) {
  if (env.MIDNIGHT_DEMO_MODE !== 'hosted-demo') fail('DEMO_PROFILE_REQUIRED');
  if (!['preview', 'undeployed'].includes(env.MIDNIGHT_NETWORK_ID || 'preview')) fail('DEMO_NETWORK_NOT_ALLOWED');
  const base = new URL(env.MIDNIGHT_DEMO_AUTHORITY_URL || `http://127.0.0.1:${env.MIDNIGHT_SPRING_PORT || '8081'}`);
  if (base.protocol !== 'http:' || !['127.0.0.1', 'localhost', '[::1]'].includes(base.hostname)
      || base.username || base.password || base.pathname !== '/' || base.search || base.hash) fail('PRIVATE_SPRING_URL_REQUIRED');
  const rpc = new URL(env.GIWA_RPC_URL || 'https://sepolia-rpc.giwa.io');
  if (rpc.protocol !== 'https:' || rpc.username || rpc.password || rpc.hash) fail('GIWA_HTTPS_RPC_REQUIRED');
  return { base, rpc };
}

export async function prepareMidnightDemo(env = process.env) {
  const config = configuration(env);
  async function request(route, { method = 'GET', token, body, retry = method === 'GET' } = {}) {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const response = await fetch(new URL(route, config.base), {
          method, redirect: 'error', signal: AbortSignal.timeout(45_000),
          headers: { Accept: 'application/json', ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
          ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        });
        const data = await response.json().catch(() => null);
        if (retry && response.status >= 500 && attempt < 2) { await delay(1000); continue; }
        return { status: response.status, data };
      } catch {
        if (!retry || attempt === 2) fail('DEMO_API_UNAVAILABLE_RERUN_SAFE');
        await delay(1000);
      }
    }
  }
  async function api(route, options) {
    const result = await request(route, options);
    if (result.status < 200 || result.status >= 300 || result.data === null) fail(`DEMO_API_REJECTED_${result.status}`);
    return result.data;
  }
  async function rpc(method, params) {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const response = await fetch(config.rpc, {
          method: 'POST', redirect: 'error', signal: AbortSignal.timeout(20_000),
          headers: { 'Content-Type': 'application/json', 'User-Agent': 'gasok-midnight-demo-public-context/1.0' },
          body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
        });
        const data = await response.json();
        if (response.ok && !data.error && data.result !== null && data.result !== undefined) return data.result;
      } catch { /* No provider response or request data is written to logs. */ }
      if (attempt < 2) await delay(1000);
    }
    fail('GIWA_PUBLIC_RPC_UNAVAILABLE');
  }

  report('PREPARING_SYNTHETIC_DEMO_ACCOUNTS');
  const actors = {};
  for (const actor of ACTORS) {
    const email = `${actor.role}@midnight-demo.test`;
    let login = await request('/auth/login', { method: 'POST', body: { email, password: PASSWORD } });
    if (login.status === 401) {
      const signup = await request('/auth/signup', { method: 'POST', body: {
        email, password: PASSWORD, userName: `Synthetic Demo ${actor.role}`, companyName: `Midnight Synthetic Demo ${actor.role}`, businessNumber: actor.businessNumber,
      } });
      if (signup.status === 409) fail('EXISTING_DEMO_ACCOUNT_CONFLICT_NO_RESET');
      if (signup.status !== 201) fail(`DEMO_SIGNUP_REJECTED_${signup.status}`);
      login = signup;
    }
    if (![200, 201].includes(login.status) || typeof login.data?.accessToken !== 'string' || login.data.user?.email !== email) fail('DEMO_LOGIN_FAILED_NO_RESET');
    const token = login.data.accessToken;
    const wallet = await request('/wallet/me', { token });
    if (wallet.status === 404) await api('/wallet/connect', { method: 'POST', token, body: { walletAddress: actor.wallet, chainId: 91342 } });
    else if (wallet.status !== 200 || wallet.data?.walletAddress?.toLowerCase() !== actor.wallet) fail('EXISTING_DEMO_WALLET_CONFLICT_NO_OVERWRITE');
    actors[actor.role] = { ...actor, token, user: login.data.user };
  }
  if (new Set(Object.values(actors).map((actor) => actor.user.companyId)).size !== 3) fail('DEMO_COMPANY_ROLES_MUST_DIFFER');
  function matches(row) {
    return row.sellerCompanyId === actors.seller.user.companyId && row.buyerCompanyId === actors.buyer.user.companyId
      && row.sellerWalletAddress?.toLowerCase() === actors.seller.wallet && row.buyerWalletAddress?.toLowerCase() === actors.buyer.wallet
      && row.faceValue === TERMS.faceValue && row.fundingAmount === TERMS.fundingAmount && row.issueDate === TERMS.issueDate
      && row.maturityDate === TERMS.maturityDate && (row.documentHash || DOCUMENT).toLowerCase() === DOCUMENT;
  }
  const policy = await api('/receivables/amount-policy', { token: actors.seller.token });
  const rows = await api('/receivables', { token: actors.seller.token });
  if (!Array.isArray(rows)) fail('DEMO_RECEIVABLE_LIST_INVALID');
  const candidates = rows.filter((row) => row.description === DESCRIPTION || (String(row.onchainReceivableId) === ONCHAIN_ID && row.contractAddress?.toLowerCase() === CONTRACT));
  if (candidates.length > 1 || candidates.some((row) => !matches(row))) fail('EXISTING_DEMO_RECEIVABLE_CONFLICT_NO_OVERWRITE');
  let receivable = candidates[0];
  if (!receivable) {
    if (typeof policy.demoEnabled !== 'boolean' || policy.tokenSymbol !== 'mKRW' || policy.tokenDecimals !== 0) fail('DEMO_AMOUNT_POLICY_INVALID');
    if (policy.demoEnabled) {
      const positiveInteger = (value) => typeof value === 'string' && /^[1-9][0-9]*$/.test(value);
      if (![policy.minAmount, policy.maxFaceValue, policy.maxFundingAmount].every(positiveInteger)
          || BigInt(policy.maxFaceValue) < BigInt(policy.minAmount)
          || BigInt(policy.maxFundingAmount) < BigInt(policy.minAmount)) fail('DEMO_AMOUNT_POLICY_INVALID');
      if (BigInt(TERMS.faceValue) > BigInt(policy.maxFaceValue) || BigInt(TERMS.fundingAmount) > BigInt(policy.maxFundingAmount)) {
        report('DEMO_ACCOUNTS_READY_CREATE_SMALL_RECEIVABLE', { receivableId: null, onchainReceivableId: null, requiresSubjectWalletSignature: true });
        return { receivableId: null, onchainReceivableId: null };
      }
    }
  }

  // Historical chain #2 is relevant only when restoring that exact fixture.
  // Its original amounts must never be clamped to the new-issuance policy.
  report('VERIFYING_PUBLIC_GIWA_CONTEXT');
  if (BigInt(await rpc('eth_chainId', [])) !== 91342n) fail('GIWA_CHAIN_MISMATCH');
  const raw = await rpc('eth_call', [{ to: CONTRACT, data: `0xa94c9f7d${BigInt(ONCHAIN_ID).toString(16).padStart(64, '0')}` }, 'latest']);
  if (typeof raw !== 'string' || !/^0x[0-9a-f]{704}$/i.test(raw)) fail('GIWA_RECEIVABLE_RESPONSE_INVALID');
  const words = raw.slice(2).match(/.{64}/g);
  const number = (index) => BigInt(`0x${words[index]}`);
  if (number(0) !== 2n || `0x${words[1].slice(-40)}` !== ACTORS[0].wallet || `0x${words[2].slice(-40)}` !== ACTORS[1].wallet
      || `0x${words[3].slice(-40)}` !== ZERO || number(9) !== 2n || number(10) !== 2n) fail('PUBLIC_DEMO_RECEIVABLE_NO_LONGER_TOKENIZED');
  if (number(4).toString() !== TERMS.faceValue || number(5).toString() !== TERMS.fundingAmount
      || new Date(Number(number(6)) * 1000).toISOString().slice(0, 10) !== TERMS.issueDate
      || new Date(Number(number(7)) * 1000).toISOString().slice(0, 10) !== TERMS.maturityDate
      || `0x${words[8]}` !== DOCUMENT) fail('PUBLIC_DEMO_RECEIVABLE_TERMS_MISMATCH');

  report('RESTORING_PUBLIC_TEST_RECEIVABLE');
  if (!receivable) receivable = await api('/receivables', { method: 'POST', token: actors.seller.token, body: { buyerBusinessNumber: actors.buyer.businessNumber, ...TERMS, description: DESCRIPTION } });
  if (!matches(receivable)) fail('DEMO_RECEIVABLE_TERMS_MISMATCH');
  const id = receivable.receivableId;
  const reload = async () => receivable = await api(`/receivables/${id}`, { token: actors.seller.token });
  async function confirm(index) {
    const tx = TRANSACTIONS[index]; const token = actors[tx.actor].token;
    report(`RPC_VERIFYING_EXISTING_${tx.type}`);
    const journal = await api('/blockchain-transactions', { method: 'POST', token, retry: true, body: { receivableId: id, transactionType: tx.type, contractAddress: CONTRACT, txHash: tx.hash } });
    if (journal.txStatus === 'CONFIRMED' && journal.rpcVerifiedAt) return;
    const receipt = await rpc('eth_getTransactionReceipt', [tx.hash]);
    if (BigInt(receipt.status) !== 1n) fail('PUBLIC_DEMO_TRANSACTION_NOT_SUCCESSFUL');
    await api(`/blockchain-transactions/${tx.hash}/confirmed`, { method: 'PATCH', token, retry: true, body: {
      blockNumber: BigInt(receipt.blockNumber).toString(), gasUsed: BigInt(receipt.gasUsed).toString(), effectiveGasPrice: BigInt(receipt.effectiveGasPrice).toString(),
    } });
  }
  if (!receivable.onchainReceivableId) {
    if (receivable.status !== 'CREATED') fail('DEMO_RECEIVABLE_STATE_CONFLICT');
    await confirm(0);
    await api(`/receivables/${id}/chain-created`, { method: 'POST', token: actors.seller.token, retry: true, body: { onchainReceivableId: ONCHAIN_ID, txHash: TRANSACTIONS[0].hash, contractAddress: CONTRACT } });
    await reload();
  }
  if (String(receivable.onchainReceivableId) !== ONCHAIN_ID || receivable.contractAddress?.toLowerCase() !== CONTRACT || receivable.createTxHash?.toLowerCase() !== TRANSACTIONS[0].hash) fail('DEMO_RECEIVABLE_CHAIN_IDENTITY_CONFLICT');
  if (receivable.status === 'CREATED') {
    await confirm(1);
    await api(`/receivables/${id}/verified`, { method: 'POST', token: actors.buyer.token, retry: true, body: { txHash: TRANSACTIONS[1].hash } });
    await reload();
  }
  if (receivable.status === 'VERIFIED') {
    await confirm(2);
    await api(`/receivables/${id}/tokenized`, { method: 'POST', token: actors.seller.token, retry: true, body: { txHash: TRANSACTIONS[2].hash } });
    await reload();
  }
  if (receivable.status !== 'TOKENIZED' || receivable.funderCompanyId !== null || String(receivable.tokenId) !== '2'
      || receivable.verifyTxHash?.toLowerCase() !== TRANSACTIONS[1].hash || receivable.tokenizeTxHash?.toLowerCase() !== TRANSACTIONS[2].hash) fail('DEMO_RECEIVABLE_NOT_REQUESTABLE');
  const opportunities = await api('/receivables/funding-opportunities', { token: actors.funder.token });
  if (!Array.isArray(opportunities) || !opportunities.some((row) => row.receivableId === id)) fail('DEMO_FUNDER_CANNOT_SEE_RECEIVABLE');
  report('DEMO_ACCOUNTS_AND_RECEIVABLE_READY', { receivableId: id, onchainReceivableId: ONCHAIN_ID, requiresSubjectWalletSignature: true });
  return { receivableId: id, onchainReceivableId: ONCHAIN_ID };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  prepareMidnightDemo().catch((error) => {
    // Only our fixed codes are printable; response bodies/JWTs stay in memory.
    report(/^[A-Z][A-Z0-9_]+$/.test(error?.message || '') ? error.message : 'DEMO_PREPARATION_FAILED');
    process.exitCode = 1;
  });
}
