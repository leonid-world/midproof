#!/usr/bin/env node
// Explicitly authorized, one-time GIWA Sepolia preparation with NEW demo-only
// keys. This operator tool is never called by the app or the local Compose flow.
import { constants, promises as fs } from 'node:fs';
import { randomBytes } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Contract, FetchRequest, Interface, JsonRpcProvider, Transaction, Wallet, keccak256, parseEther } from '../giwa-midnight/node_modules/ethers/lib.esm/index.js';

export const FINANCE_ADDRESS = '0x0f264334f98ba0d22f7fc6bb901a5fa36158a315';
export const ABI = [
  'function createReceivable(address buyer,uint256 faceValue,uint256 fundingAmount,uint256 issueDate,uint256 maturityDate,bytes32 documentHash) returns(uint256)',
  'function verifyReceivable(uint256 id)',
  'function tokenizeReceivable(uint256 id) returns(uint256)',
  'function getReceivable(uint256 id) view returns(tuple(uint256 id,address seller,address buyer,address funder,uint256 faceValue,uint256 fundingAmount,uint256 issueDate,uint256 maturityDate,bytes32 documentHash,uint256 tokenId,uint8 status))',
  'event ReceivableCreated(uint256 indexed receivableId,address indexed seller,address indexed buyer,uint256 faceValue,uint256 fundingAmount,uint256 issueDate,uint256 maturityDate,bytes32 documentHash)',
];
const iface = new Interface(ABI);
const CHAIN_ID = 91342n;
const ZERO = `0x${'0'.repeat(40)}`;
const GAS_CAP = parseEther('0.001'); // Per transaction execution gas, not an L2 total-fee guarantee.
const BUYER_GAS = parseEther('0.0005');
const DOCUMENT_HASH = keccak256(Buffer.from('MidProof operator-managed synthetic walletless demo 2026-09-27'));
const STEPS = ['buyer-gas', 'create', 'verify', 'tokenize'];
const isId = (value) => typeof value === 'string' && /^(0|[1-9][0-9]{0,77})$/.test(value) && BigInt(value) < (1n << 256n);
const isAddress = (value) => typeof value === 'string' && /^0x[0-9a-fA-F]{40}$/.test(value) && value.toLowerCase() !== ZERO;
const sameAddress = (a, b) => typeof a === 'string' && typeof b === 'string' && a.toLowerCase() === b.toLowerCase();
const exactKeys = (value, keys) => value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).sort().join() === [...keys].sort().join();
const fail = (code) => { throw new Error(code); };
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
export const safeErrorCode = (error) => typeof error?.message === 'string' && /^[A-Z_]+$/.test(error.message) ? error.message : 'PREPARATION_FAILED_CHECK_RECORDED_TRANSACTION';

function fixtureContext(fixture) {
  if (!exactKeys(fixture, ['version', 'networkId', 'giwaChainId', 'receivableFinanceAddress', 'onchainReceivableId', 'sellerPrivateKey', 'buyerPrivateKey', 'intendedFunderWallet'])
      || fixture.version !== 1 || fixture.networkId !== 'preview' || fixture.giwaChainId !== '91342'
      || fixture.receivableFinanceAddress !== FINANCE_ADDRESS || !isId(fixture.onchainReceivableId)
      || !isAddress(fixture.intendedFunderWallet)
      || ![fixture.sellerPrivateKey, fixture.buyerPrivateKey].every((key) => typeof key === 'string' && /^0x[0-9a-fA-F]{64}$/.test(key))) fail('FIXTURE_CONTEXT_MISMATCH');
  const seller = new Wallet(fixture.sellerPrivateKey);
  const buyer = new Wallet(fixture.buyerPrivateKey);
  const context = { networkId: 'preview', giwaChainId: '91342', receivableFinanceAddress: FINANCE_ADDRESS,
    seller: seller.address.toLowerCase(), buyer: buyer.address.toLowerCase(), intendedFunderWallet: fixture.intendedFunderWallet.toLowerCase() };
  if (new Set([context.seller, context.buyer, context.intendedFunderWallet]).size !== 3) fail('FIXTURE_ROLES_NOT_DISTINCT');
  return { context, seller, buyer };
}
function requestFor(step, context, terms, id) {
  if (step === 'buyer-gas') return { to: context.buyer, value: BUYER_GAS, data: '0x' };
  if (step === 'create') return { to: FINANCE_ADDRESS, value: 0n, data: iface.encodeFunctionData('createReceivable', [context.buyer, terms.faceValue, terms.fundingAmount, terms.issueDate, terms.maturityDate, terms.documentHash]) };
  if (!isId(id) || id === '0') fail('JOURNAL_FIXTURE_ID_MISMATCH');
  return { to: FINANCE_ADDRESS, value: 0n, data: iface.encodeFunctionData(step === 'verify' ? 'verifyReceivable' : 'tokenizeReceivable', [id]) };
}
function checkedTransaction(record, step, context, terms, id) {
  if (!record || !['prepared', 'confirmed'].includes(record.phase) || typeof record.serialized !== 'string'
      || record.serialized.length > 16384 || !/^0x[0-9a-f]{64}$/.test(record.hash)) fail('JOURNAL_TRANSACTION_MISMATCH');
  let tx;
  try { tx = Transaction.from(record.serialized); } catch { fail('JOURNAL_TRANSACTION_MISMATCH'); }
  const expected = requestFor(step, context, terms, id);
  if (!tx.isSigned() || tx.hash !== record.hash || keccak256(record.serialized) !== record.hash
      || tx.chainId !== CHAIN_ID || ![0, 2].includes(tx.type)
      || !sameAddress(tx.from, step === 'verify' ? context.buyer : context.seller)
      || !sameAddress(tx.to, expected.to) || tx.value !== expected.value || tx.data !== expected.data
      || !Number.isSafeInteger(tx.nonce) || tx.nonce < 0 || (tx.accessList?.length ?? 0) !== 0) fail('JOURNAL_TRANSACTION_MISMATCH');
  const fee = tx.maxFeePerGas ?? tx.gasPrice;
  if (tx.gasLimit <= 0n || fee == null || fee <= 0n || tx.gasLimit * fee > GAS_CAP) fail('GAS_BOUND_EXCEEDED');
  if (record.phase === 'confirmed' && (!Number.isSafeInteger(record.blockNumber) || record.blockNumber < 0 || !/^0x[0-9a-f]{64}$/.test(record.blockHash))) fail('JOURNAL_RECEIPT_MISMATCH');
  return tx;
}
function checkedJournal(journal, fixture, context, now) {
  if (!journal) {
    // Never invent a new transaction after losing an existing fixture's journal.
    if (fixture.onchainReceivableId !== '0') fail('EXISTING_FIXTURE_REQUIRES_JOURNAL');
    journal = { version: 1, context, onchainReceivableId: '0', transactions: {},
      terms: { faceValue: '1000', fundingAmount: '900', issueDate: now, maturityDate: now + 30 * 86400, documentHash: DOCUMENT_HASH } };
  }
  if (!exactKeys(journal, ['version', 'context', 'onchainReceivableId', 'transactions', 'terms']) || journal.version !== 1
      || !exactKeys(journal.context, Object.keys(context)) || Object.entries(context).some(([key, value]) => journal.context[key] !== value)
      || !isId(journal.onchainReceivableId) || !journal.transactions || typeof journal.transactions !== 'object' || Array.isArray(journal.transactions)
      || Object.keys(journal.transactions).some((step) => !STEPS.includes(step))) fail('JOURNAL_CONTEXT_MISMATCH');
  const terms = journal.terms;
  if (!exactKeys(terms, ['faceValue', 'fundingAmount', 'issueDate', 'maturityDate', 'documentHash'])
      || terms.faceValue !== '1000' || terms.fundingAmount !== '900' || terms.documentHash !== DOCUMENT_HASH
      || !Number.isSafeInteger(terms.issueDate) || terms.issueDate <= 0 || !Number.isSafeInteger(terms.maturityDate)
      || terms.maturityDate !== terms.issueDate + 30 * 86400) fail('JOURNAL_TERMS_MISMATCH');
  const records = journal.transactions;
  if ((fixture.onchainReceivableId !== '0' && fixture.onchainReceivableId !== journal.onchainReceivableId)
      || (journal.onchainReceivableId !== '0' && records.create?.phase !== 'confirmed')
      || (records.verify && !records.create) || (records.tokenize && !records.verify)) fail('JOURNAL_FIXTURE_ID_MISMATCH');
  const nonces = new Map();
  for (const step of STEPS) {
    if (!records[step]) continue;
    const tx = checkedTransaction(records[step], step, context, terms, journal.onchainReceivableId);
    const from = tx.from.toLowerCase();
    if ((nonces.get(from) ?? -1) + 1 !== tx.nonce) fail('JOURNAL_NONCE_MISMATCH');
    nonces.set(from, tx.nonce);
  }
  return journal;
}

// Dependency injection is for offline tests. The executable entry point below
// fixes the only real RPC, chain and deployment; there is no environment fallback.
export async function preparePreviewFixture({ fixture, journal, rpc, finance = new Contract(FINANCE_ADDRESS, ABI, rpc),
  saveJournal, saveFixture, report = () => {}, execute = false, now = Math.floor(Date.now() / 1000),
  attempts = 30, wait = () => pause(2000) }) {
  const { context, seller, buyer } = fixtureContext(fixture);
  journal = checkedJournal(journal, fixture, context, now);
  if ((await rpc.getNetwork()).chainId !== CHAIN_ID) fail('WRONG_NETWORK');
  if ((await rpc.getCode(FINANCE_ADDRESS)) === '0x') fail('FINANCE_NOT_DEPLOYED');
  if (Object.keys(journal.transactions).length === 0
      && ((await rpc.getTransactionCount(seller.address, 'pending')) !== 0 || (await rpc.getTransactionCount(buyer.address, 'pending')) !== 0)) fail('NEW_FIXTURE_WALLETS_ALREADY_USED');
  report({ network: 'GIWA Sepolia', chainId: 91342, seller: context.seller, buyer: context.buyer });
  if (!execute) {
    report({ status: 'inspection', sellerWei: (await rpc.getBalance(seller.address)).toString(), buyerWei: (await rpc.getBalance(buyer.address)).toString(),
      onchainReceivableId: fixture.onchainReceivableId, recordedSteps: Object.keys(journal.transactions) });
    return;
  }
  const retry = async (read, code) => {
    for (let attempt = 0; attempt < attempts; attempt++) {
      const value = await read();
      if (value !== undefined) return value;
      if (attempt + 1 < attempts) await wait();
    }
    fail(code);
  };
  async function canonicalReceipt(record, tx) {
    return retry(async () => {
      let receipt, block;
      try { receipt = await rpc.getTransactionReceipt(record.hash); if (receipt) block = await rpc.getBlock(receipt.blockNumber); }
      catch { return undefined; }
      if (!receipt || !block) return undefined;
      if (receipt.hash !== record.hash || !sameAddress(receipt.from, tx.from) || !sameAddress(receipt.to, tx.to)) fail('RECEIPT_TRANSACTION_MISMATCH');
      if (block.hash !== receipt.blockHash || block.number !== receipt.blockNumber) return undefined;
      if (record.phase === 'confirmed' && (record.blockHash !== receipt.blockHash || record.blockNumber !== receipt.blockNumber)) fail('CONFIRMED_RECEIPT_CHANGED');
      if (receipt.status !== 1) fail('TRANSACTION_REVERTED');
      return receipt;
    }, 'RECEIPT_PENDING_RECOVER_SAME_TRANSACTION');
  }
  async function transact(step, signer) {
    let record = journal.transactions[step];
    if (!record) {
      const request = requestFor(step, context, journal.terms, journal.onchainReceivableId);
      const previous = Object.values(journal.transactions).map((entry) => Transaction.from(entry.serialized))
        .filter((tx) => sameAddress(tx.from, signer.address)).map((tx) => tx.nonce);
      const expectedNonce = previous.length ? Math.max(...previous) + 1 : 0;
      const nonce = await retry(async () => {
        let observed;
        try { observed = await rpc.getTransactionCount(signer.address, 'pending'); } catch { return undefined; }
        if (observed > expectedNonce) fail('SIGNER_NONCE_CHANGED');
        return observed === expectedNonce ? observed : undefined;
      }, 'RPC_NONCE_PENDING_RECOVER_SAME_TRANSACTION');
      const transaction = await signer.connect(rpc).populateTransaction({ ...request, nonce });
      const serialized = await signer.signTransaction(transaction);
      record = { hash: keccak256(serialized), serialized, phase: 'prepared' };
      checkedTransaction(record, step, context, journal.terms, journal.onchainReceivableId);
      journal.transactions[step] = record;
      // The exact signed bytes must survive a crash before the first broadcast.
      await saveJournal(journal);
    }
    const tx = checkedTransaction(record, step, context, journal.terms, journal.onchainReceivableId);
    let receipt = await rpc.getTransactionReceipt(record.hash);
    if (!receipt && record.phase === 'prepared') {
      const existing = await rpc.getTransaction(record.hash);
      if (!existing) {
        // Also fsync a loaded prepared record before resuming it. A previous
        // run may have stopped because the directory sync failed after rename.
        await saveJournal(journal);
        try { await rpc.broadcastTransaction(record.serialized); }
        catch { /* An ambiguous send may have succeeded. Only poll this hash. */ }
      }
    }
    receipt = await canonicalReceipt(record, tx);
    record.phase = 'confirmed'; record.blockNumber = receipt.blockNumber; record.blockHash = receipt.blockHash;
    await saveJournal(journal);
    report({ step, hash: receipt.hash, block: receipt.blockNumber, status: 1 });
    return receipt;
  }
  function checkSubject(subject, id) {
    const terms = journal.terms;
    if (subject.id !== BigInt(id) || !sameAddress(subject.seller, context.seller) || !sameAddress(subject.buyer, context.buyer)
        || !sameAddress(subject.funder, ZERO) || subject.faceValue !== 1000n || subject.fundingAmount !== 900n
        || subject.issueDate !== BigInt(terms.issueDate) || subject.maturityDate !== BigInt(terms.maturityDate)
        || subject.documentHash !== terms.documentHash || subject.status > 2n || subject.status < 0n
        || (subject.status === 2n ? subject.tokenId <= 0n : subject.tokenId !== 0n)) fail('FIXTURE_FINAL_STATE_MISMATCH');
  }
  async function readSubject(receipt, id, minimumStatus) {
    return retry(async () => {
      let subject, before, after, latest;
      try {
        before = await rpc.getBlock(receipt.blockNumber);
        latest = await rpc.getBlock('latest');
        if (!before || before.hash !== receipt.blockHash || !latest || latest.number < receipt.blockNumber) return undefined;
        subject = await finance.getReceivable(id, { blockTag: receipt.blockNumber });
        after = await rpc.getBlock(receipt.blockNumber);
      } catch { return undefined; }
      if (!after || after.hash !== receipt.blockHash) return undefined;
      checkSubject(subject, id);
      return subject.status >= minimumStatus ? subject : undefined;
    }, 'RPC_STATE_PENDING_RECOVER_SAME_TRANSACTION');
  }
  function createdId(receipt) {
    const events = receipt.logs.filter((log) => sameAddress(log.address, FINANCE_ADDRESS)).map((log) => {
      try { return iface.parseLog(log); } catch { return null; }
    }).filter((event) => event?.name === 'ReceivableCreated');
    const event = events[0]?.args;
    const terms = journal.terms;
    if (events.length !== 1 || event.receivableId <= 0n || !sameAddress(event.seller, context.seller) || !sameAddress(event.buyer, context.buyer)
        || event.faceValue !== 1000n || event.fundingAmount !== 900n || event.issueDate !== BigInt(terms.issueDate)
        || event.maturityDate !== BigInt(terms.maturityDate) || event.documentHash !== terms.documentHash) fail('CREATE_RECEIPT_MISMATCH');
    const id = event.receivableId.toString();
    if ((journal.onchainReceivableId !== '0' && journal.onchainReceivableId !== id)
        || (fixture.onchainReceivableId !== '0' && fixture.onchainReceivableId !== id)) fail('FIXTURE_ID_MISMATCH');
    return id;
  }
  if (journal.onchainReceivableId !== '0') {
    const record = journal.transactions.create;
    const tx = checkedTransaction(record, 'create', context, journal.terms, journal.onchainReceivableId);
    createdId(await canonicalReceipt(record, tx));
  }
  // Resolve any already prepared transfer even when its credited balance is
  // visible, and never send a second top-up on a resumed lifecycle.
  if (journal.transactions['buyer-gas'] || (!journal.transactions.verify && await rpc.getBalance(buyer.address) < parseEther('0.0001'))) {
    if (!journal.transactions['buyer-gas'] && await rpc.getBalance(seller.address) < parseEther('0.0008')) fail('AWAITING_FREE_TEST_GAS');
    await transact('buyer-gas', seller);
  }
  const created = await transact('create', seller);
  const id = createdId(created);
  journal.onchainReceivableId = id;
  await saveJournal(journal);
  const initial = await readSubject(created, id, 0n);
  if (initial.status > 0n && !journal.transactions.verify) fail('UNRECORDED_FIXTURE_PROGRESS');
  const verified = await transact('verify', buyer);
  const middle = await readSubject(verified, id, 1n);
  if (middle.status > 1n && !journal.transactions.tokenize) fail('UNRECORDED_FIXTURE_PROGRESS');
  const tokenized = await transact('tokenize', seller);
  const subject = await readSubject(tokenized, id, 2n);
  // Publish the usable fixture only after all receipts and pinned state reads.
  // Journal-first ordering also repairs a crash immediately before this save.
  fixture.onchainReceivableId = id;
  await saveFixture(fixture);
  const result = { status: 'ready', onchainReceivableId: id, tokenId: subject.tokenId.toString(), financeAddress: FINANCE_ADDRESS,
    seller: context.seller, buyer: context.buyer, intendedFunderWallet: context.intendedFunderWallet, fundingPerformed: false };
  report(result);
  return result;
}

// Stale locks are deliberately not stolen: after an unclean process death the
// operator must confirm it has stopped before removing this one lock file.
export async function withPrivateStore(directory, run, io = fs) {
  const directoryHandle = await io.open(directory, constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW);
  let lock;
  const lockFile = path.join(directory, 'preview-demo-fixture.lock');
  try {
    const info = await directoryHandle.stat();
    if (!info.isDirectory() || (info.mode & 0o077) || info.uid !== process.getuid()) fail('PRIVATE_DIRECTORY_REQUIRED');
    try { lock = await io.open(lockFile, 'wx', 0o600); }
    catch (error) { if (error.code === 'EEXIST') fail('PREPARATION_LOCK_HELD_CHECK_PROCESS'); throw error; }
    await lock.writeFile(`${JSON.stringify({ pid: process.pid })}\n`);
    await lock.sync(); await directoryHandle.sync();
    const names = { fixture: 'preview-demo-fixture.json', journal: 'preview-demo-fixture-journal.json' };
    async function read(kind, optional = false) {
      let handle;
      try {
        handle = await io.open(path.join(directory, names[kind]), constants.O_RDONLY | constants.O_NOFOLLOW);
        const stat = await handle.stat();
        if (!stat.isFile() || stat.nlink !== 1 || stat.uid !== process.getuid() || (stat.mode & 0o077) || stat.size > 131072) fail('PRIVATE_FILE_REQUIRED');
        return JSON.parse(await handle.readFile('utf8'));
      } catch (error) { if (optional && error.code === 'ENOENT') return undefined; throw error; }
      finally { await handle?.close(); }
    }
    async function save(kind, value) {
      const destination = path.join(directory, names[kind]);
      const temporary = `${destination}.${randomBytes(12).toString('hex')}.tmp`;
      let handle;
      try {
        handle = await io.open(temporary, 'wx', 0o600);
        await handle.writeFile(`${JSON.stringify(value, null, 2)}\n`);
        await handle.sync(); await handle.close(); handle = undefined;
        await io.rename(temporary, destination);
        await directoryHandle.sync();
      } finally { await handle?.close(); await io.unlink(temporary).catch((error) => { if (error.code !== 'ENOENT') throw error; }); }
    }
    return await run({ read, save });
  } finally {
    if (lock) { await lock.close(); await io.unlink(lockFile); await directoryHandle.sync(); }
    await directoryHandle.close();
  }
}
async function main() {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const request = new FetchRequest('https://sepolia-rpc.giwa.io');
  request.timeout = 10_000;
  const rpc = new JsonRpcProvider(request, undefined, { cacheTimeout: -1 });
  const report = (data) => process.stdout.write(`${JSON.stringify(data)}\n`);
  try {
    await withPrivateStore(path.join(root, '.local'), async (store) => preparePreviewFixture({
      fixture: await store.read('fixture'), journal: await store.read('journal', true), rpc,
      saveJournal: (data) => store.save('journal', data), saveFixture: (data) => store.save('fixture', data),
      report, execute: process.argv.includes('--execute'),
    }));
  } catch (error) { report({ status: 'failed', code: safeErrorCode(error) }); process.exitCode = 1; }
  finally { rpc.destroy(); }
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
