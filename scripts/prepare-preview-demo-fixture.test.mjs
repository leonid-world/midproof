import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { Interface, Transaction, Wallet, keccak256, parseEther } from '../giwa-midnight/node_modules/ethers/lib.esm/index.js';
import { ABI, FINANCE_ADDRESS, preparePreviewFixture, safeErrorCode, withPrivateStore } from './prepare-preview-demo-fixture.mjs';

// Only in-memory throwaway signers, fake RPC/receipts and temporary directories.
// Importing the executable must neither connect to a real RPC nor read .local.
const iface = new Interface(ABI);
const ZERO = `0x${'0'.repeat(40)}`;
const clone = (value) => value === undefined ? undefined : structuredClone(value);
const blockHash = (height) => `0x${BigInt(height).toString(16).padStart(64, '0')}`;
function harness() {
  const seller = Wallet.createRandom(); const buyer = Wallet.createRandom(); const funder = Wallet.createRandom();
  const store = { fixture: { version: 1, networkId: 'preview', giwaChainId: '91342', receivableFinanceAddress: FINANCE_ADDRESS,
    onchainReceivableId: '0', sellerPrivateKey: seller.privateKey, buyerPrivateKey: buyer.privateKey, intendedFunderWallet: funder.address.toLowerCase() } };
  const receipts = new Map(); const transactions = new Map(); const snapshots = new Map(); const nonces = new Map();
  const broadcasts = []; const reports = []; let height = 100; let subject; let buyerBalance = 0n;
  const rpc = {
    getNetwork: async () => ({ chainId: 91342n }), getCode: async () => '0x1234',
    getBalance: async (address) => address.toLowerCase() === buyer.address.toLowerCase() ? buyerBalance : parseEther('0.01'),
    getTransactionCount: async (address) => nonces.get(address.toLowerCase()) ?? 0,
    estimateGas: async (request) => request.to.toLowerCase() === FINANCE_ADDRESS ? 100_000n : 21_000n,
    getFeeData: async () => ({ gasPrice: 1_000_000_000n, maxFeePerGas: 2_000_000_000n, maxPriorityFeePerGas: 1_000_000_000n }),
    getTransaction: async (hash) => transactions.get(hash) ?? null,
    getTransactionReceipt: async (hash) => receipts.get(hash) ?? null,
    getBlock: async (tag) => ({ number: tag === 'latest' ? height : tag, hash: blockHash(tag === 'latest' ? height : tag) }),
    broadcastTransaction: async (raw) => {
      const tx = Transaction.from(raw);
      if (transactions.has(tx.hash)) return transactions.get(tx.hash);
      broadcasts.push(raw); transactions.set(tx.hash, tx); nonces.set(tx.from.toLowerCase(), tx.nonce + 1); height++;
      const receipt = { hash: tx.hash, from: tx.from, to: tx.to, blockNumber: height, blockHash: blockHash(height), status: 1, logs: [] };
      if (tx.data === '0x') buyerBalance += tx.value;
      else {
        const call = iface.parseTransaction(tx);
        if (call.name === 'createReceivable') {
          assert.equal(subject, undefined, 'must never create a duplicate fixture');
          const [buyerAddress, faceValue, fundingAmount, issueDate, maturityDate, documentHash] = call.args;
          subject = { id: 7n, seller: tx.from, buyer: buyerAddress, funder: ZERO, faceValue, fundingAmount,
            issueDate, maturityDate, documentHash, tokenId: 0n, status: 0n };
          const event = iface.encodeEventLog(iface.getEvent('ReceivableCreated'), [7n, tx.from, buyerAddress, faceValue, fundingAmount, issueDate, maturityDate, documentHash]);
          receipt.logs.push({ address: FINANCE_ADDRESS, ...event });
        } else if (call.name === 'verifyReceivable') { assert.equal(subject.status, 0n); subject.status = 1n; }
        else if (call.name === 'tokenizeReceivable') { assert.equal(subject.status, 1n); subject.status = 2n; subject.tokenId = 9n; }
        else assert.fail('unexpected transaction');
      }
      snapshots.set(height, clone(subject)); receipts.set(tx.hash, receipt);
      return tx;
    },
  };
  const finance = { getReceivable: async (id, { blockTag }) => {
    assert.equal(String(id), '7'); const value = snapshots.get(blockTag);
    if (!value) throw new Error('not yet indexed'); return clone(value);
  } };
  const run = (options = {}) => preparePreviewFixture({ fixture: clone(store.fixture), journal: clone(store.journal), rpc, finance,
    saveJournal: async (value) => { store.journal = clone(value); }, saveFixture: async (value) => { store.fixture = clone(value); },
    report: (value) => reports.push(value), now: 1_800_000_000, attempts: 3, wait: async () => {}, execute: true, ...options });
  const stepCount = (name) => broadcasts.filter((raw) => { const tx = Transaction.from(raw); return tx.data !== '0x' && iface.parseTransaction(tx).name === name; }).length;
  return { store, rpc, finance, receipts, transactions, snapshots, broadcasts, reports, run, seller, buyer, stepCount };
}

test('complete synthetic lifecycle, exact public report and no transactions on rerun', async () => {
  const h = harness(); const result = await h.run();
  assert.equal(result.status, 'ready'); assert.equal(result.onchainReceivableId, '7'); assert.equal(result.fundingPerformed, false);
  assert.equal(h.broadcasts.length, 4); assert.equal(h.stepCount('createReceivable'), 1);
  assert.equal(h.store.fixture.onchainReceivableId, '7');
  assert.deepEqual(await h.run(), result); assert.equal(h.broadcasts.length, 4);
  const output = JSON.stringify(h.reports);
  for (const secret of [h.seller.privateKey, h.buyer.privateKey, ...h.broadcasts]) assert.equal(output.includes(secret), false);
});

test('inspection is read-only and invalid fixture identities never broadcast', async () => {
  const h = harness(); await h.run({ execute: false });
  assert.equal(h.broadcasts.length, 0); assert.equal(h.store.journal, undefined);
  h.store.fixture.onchainReceivableId = '9';
  await assert.rejects(h.run(), /EXISTING_FIXTURE_REQUIRES_JOURNAL/);
  h.store.fixture.onchainReceivableId = '0'; h.store.fixture.intendedFunderWallet = h.seller.address;
  await assert.rejects(h.run(), /FIXTURE_ROLES_NOT_DISTINCT/);
  h.store.fixture.intendedFunderWallet = ZERO;
  await assert.rejects(h.run(), /FIXTURE_CONTEXT_MISMATCH/);
  assert.equal(h.broadcasts.length, 0);
});

test('wrong network fails without any transaction or journal write', async () => {
  const h = harness(); h.rpc.getNetwork = async () => ({ chainId: 31337n });
  await assert.rejects(h.run(), /WRONG_NETWORK/); assert.equal(h.broadcasts.length, 0); assert.equal(h.store.journal, undefined);
});

test('a missing or mismatched create journal cannot generate a second receivable', async () => {
  const h = harness(); await h.run(); const original = clone(h.store.journal); const count = h.broadcasts.length;
  delete h.store.journal;
  await assert.rejects(h.run(), /EXISTING_FIXTURE_REQUIRES_JOURNAL/);
  h.store.journal = original; delete h.store.journal.transactions.create;
  await assert.rejects(h.run(), /JOURNAL_FIXTURE_ID_MISMATCH/);
  assert.equal(h.broadcasts.length, count);
});

test('journal context and confirmed ID must match before any replay', async () => {
  const h = harness(); await h.run(); const original = clone(h.store.journal); const count = h.broadcasts.length;
  h.store.journal.context.buyer = Wallet.createRandom().address.toLowerCase();
  await assert.rejects(h.run(), /JOURNAL_CONTEXT_MISMATCH/);
  h.store.journal = original; h.store.fixture.onchainReceivableId = '8';
  await assert.rejects(h.run(), /JOURNAL_FIXTURE_ID_MISMATCH/);
  assert.equal(h.broadcasts.length, count);
});

test('every saved transaction is rechecked for signer, destination, chain, arguments and fee cap', async (t) => {
  const h = harness(); await h.run(); const original = clone(h.store.journal); const count = h.broadcasts.length;
  const base = Transaction.from(original.transactions.tokenize.serialized);
  for (const [label, patch, signer, code] of [
    ['destination', { to: h.buyer.address }, h.seller, /JOURNAL_TRANSACTION_MISMATCH/],
    ['chain', { chainId: 1n }, h.seller, /JOURNAL_TRANSACTION_MISMATCH/],
    ['arguments', { data: iface.encodeFunctionData('tokenizeReceivable', [8n]) }, h.seller, /JOURNAL_TRANSACTION_MISMATCH/],
    ['signer', {}, h.buyer, /JOURNAL_TRANSACTION_MISMATCH/],
    ['fee', { gasLimit: 1_000_000n }, h.seller, /GAS_BOUND_EXCEEDED/],
    ['nonce', { nonce: 0 }, h.seller, /JOURNAL_NONCE_MISMATCH/],
  ]) await t.test(label, async () => {
    const tx = Transaction.from(base.unsignedSerialized); Object.assign(tx, patch);
    const raw = await signer.signTransaction(tx);
    h.store.journal = clone(original);
    Object.assign(h.store.journal.transactions.tokenize, { serialized: raw, hash: keccak256(raw) });
    await assert.rejects(h.run(), code); assert.equal(h.broadcasts.length, count);
  });
});

test('failed journal persistence prevents the first broadcast', async () => {
  const h = harness(); await assert.rejects(h.run({ saveJournal: async () => { throw new Error('disk unavailable'); } }), /disk unavailable/);
  assert.equal(h.broadcasts.length, 0);
});

test('crash after create broadcast resumes prepared bytes and creates only once', async () => {
  const h = harness();
  await assert.rejects(h.run({ saveJournal: async (value) => {
    if (value.transactions.create?.phase === 'confirmed') throw new Error('simulated crash');
    h.store.journal = clone(value);
  } }), /simulated crash/);
  assert.equal(h.store.journal.transactions.create.phase, 'prepared'); assert.equal(h.store.fixture.onchainReceivableId, '0');
  assert.equal(h.stepCount('createReceivable'), 1);
  await h.run(); assert.equal(h.stepCount('createReceivable'), 1); assert.equal(h.broadcasts.length, 4);
});

test('crash after journal completion but before fixture publication repairs from the same receipts', async () => {
  const h = harness(); await assert.rejects(h.run({ saveFixture: async () => { throw new Error('simulated crash'); } }), /simulated crash/);
  assert.equal(h.store.fixture.onchainReceivableId, '0'); assert.equal(h.store.journal.onchainReceivableId, '7');
  await h.run(); assert.equal(h.store.fixture.onchainReceivableId, '7'); assert.equal(h.broadcasts.length, 4);
});

test('lost broadcast response and delayed receipt visibility never cause a second send', async () => {
  const h = harness(); const broadcast = h.rpc.broadcastTransaction; const receipt = h.rpc.getTransactionReceipt;
  const misses = new Map();
  h.rpc.broadcastTransaction = async (raw) => { const tx = await broadcast(raw); misses.set(tx.hash, 1); throw new Error(`RPC raw payload ${raw}`); };
  h.rpc.getTransactionReceipt = async (hash) => { if (misses.get(hash)) { misses.set(hash, 0); return null; } return receipt(hash); };
  await h.run(); assert.equal(h.broadcasts.length, 4); assert.equal(h.stepCount('createReceivable'), 1);
});

test('noncanonical receipt remains pending, retains bytes, and resumes without another create', async () => {
  const h = harness(); const getBlock = h.rpc.getBlock;
  h.rpc.getBlock = async (tag) => { const value = await getBlock(tag); return tag === 102 ? { ...value, hash: blockHash(999) } : value; };
  await assert.rejects(h.run(), /RECEIPT_PENDING_RECOVER_SAME_TRANSACTION/);
  assert.equal(h.stepCount('createReceivable'), 1); assert.equal(h.stepCount('verifyReceivable'), 0);
  h.rpc.getBlock = getBlock; await h.run(); assert.equal(h.stepCount('createReceivable'), 1);
});

test('a changed confirmed receipt or mismatched sender is rejected without replay', async () => {
  const h = harness(); await h.run(); const count = h.broadcasts.length;
  const receipt = h.receipts.get(h.store.journal.transactions.create.hash);
  const original = { ...receipt }; receipt.from = h.buyer.address;
  await assert.rejects(h.run(), /RECEIPT_TRANSACTION_MISMATCH/);
  Object.assign(receipt, original); receipt.blockNumber = 111; receipt.blockHash = blockHash(111);
  await assert.rejects(h.run(), /CONFIRMED_RECEIPT_CHANGED/);
  assert.equal(h.broadcasts.length, count);
});

test('creation receipt must contain the exact synthetic terms before verify or fixture publication', async () => {
  const h = harness(); const broadcast = h.rpc.broadcastTransaction;
  h.rpc.broadcastTransaction = async (raw) => {
    const tx = await broadcast(raw); const receipt = h.receipts.get(tx.hash);
    if (receipt.logs.length) {
      const args = [...iface.parseLog(receipt.logs[0]).args]; args[3] = 1001n;
      receipt.logs[0] = { address: FINANCE_ADDRESS, ...iface.encodeEventLog(iface.getEvent('ReceivableCreated'), args) };
    }
    return tx;
  };
  await assert.rejects(h.run(), /CREATE_RECEIPT_MISMATCH/);
  assert.equal(h.stepCount('verifyReceivable'), 0); assert.equal(h.store.fixture.onchainReceivableId, '0');
});

test('historical reads retry RPC lag and pin the receipt height without duplicate transactions', async () => {
  const h = harness(); const read = h.finance.getReceivable; let failures = 2;
  h.finance.getReceivable = async (id, options) => {
    const result = await read(id, options);
    if (result.status === 1n && failures-- > 0) throw new Error('historical block temporarily unavailable');
    return result;
  };
  await h.run(); assert.equal(failures, -1); assert.equal(h.broadcasts.length, 4);
});

test('persistent state lag retains existing receipts for the next run', async () => {
  const h = harness(); const read = h.finance.getReceivable;
  h.finance.getReceivable = async (id, options) => {
    const result = await read(id, options); return result.status === 1n ? { ...result, status: 0n } : result;
  };
  await assert.rejects(h.run(), /RPC_STATE_PENDING_RECOVER_SAME_TRANSACTION/);
  assert.equal(h.stepCount('tokenizeReceivable'), 0); assert.equal(h.stepCount('verifyReceivable'), 1);
  h.finance.getReceivable = read; await h.run(); assert.equal(h.stepCount('verifyReceivable'), 1);
});

test('mismatched onchain terms fail closed before the next transaction', async () => {
  const h = harness(); const read = h.finance.getReceivable;
  h.finance.getReceivable = async (...args) => ({ ...await read(...args), fundingAmount: 901n });
  await assert.rejects(h.run(), /FIXTURE_FINAL_STATE_MISMATCH/);
  assert.equal(h.stepCount('verifyReceivable'), 0);
});

async function temporary(t) {
  const directory = await fs.mkdtemp(path.join(tmpdir(), 'midproof-preview-fixture-test-'));
  await fs.chmod(directory, 0o700); t.after(() => fs.rm(directory, { recursive: true, force: true })); return directory;
}

test('private store excludes concurrent writers and preserves owner-only files', async (t) => {
  const directory = await temporary(t);
  await withPrivateStore(directory, async (store) => {
    await assert.rejects(withPrivateStore(directory, async () => assert.fail('second writer entered')), /PREPARATION_LOCK_HELD_CHECK_PROCESS/);
    await store.save('journal', { only: 'synthetic test content' });
    assert.deepEqual(await store.read('journal'), { only: 'synthetic test content' });
    assert.equal((await fs.stat(path.join(directory, 'preview-demo-fixture-journal.json'))).mode & 0o077, 0);
  });
  await withPrivateStore(directory, async () => {});
  assert.deepEqual(await fs.readdir(directory), ['preview-demo-fixture-journal.json']);
});

test('private store rejects symlinks, hardlinks, public files and public directories', async (t) => {
  const directory = await temporary(t); const fixtureFile = path.join(directory, 'preview-demo-fixture.json');
  const target = path.join(directory, 'synthetic.json'); await fs.writeFile(target, '{}', { mode: 0o600 });
  await fs.symlink(target, fixtureFile);
  await assert.rejects(withPrivateStore(directory, (store) => store.read('fixture')));
  await fs.unlink(fixtureFile); await fs.link(target, fixtureFile);
  await assert.rejects(withPrivateStore(directory, (store) => store.read('fixture')), /PRIVATE_FILE_REQUIRED/);
  await fs.unlink(fixtureFile); await fs.writeFile(fixtureFile, '{}', { mode: 0o644 });
  await assert.rejects(withPrivateStore(directory, (store) => store.read('fixture')), /PRIVATE_FILE_REQUIRED/);
  await fs.chmod(directory, 0o755);
  await assert.rejects(withPrivateStore(directory, async () => assert.fail('unsafe directory entered')), /PRIVATE_DIRECTORY_REQUIRED/);
});

function observedIo(events, onSync = () => {}) {
  return { ...fs, open: async (file, ...args) => {
    const handle = await fs.open(file, ...args);
    return {
      stat: () => handle.stat(), close: () => handle.close(), readFile: (...args) => handle.readFile(...args),
      writeFile: async (...args) => { events.push(['write', file]); return handle.writeFile(...args); },
      sync: async () => { events.push(['sync', file]); await onSync(file); return handle.sync(); },
    };
  }, rename: async (from, to) => { events.push(['rename', from, to]); return fs.rename(from, to); } };
}

test('atomic save syncs temp bytes before rename and directory before returning', async (t) => {
  const directory = await temporary(t); const events = [];
  await withPrivateStore(directory, async (store) => { events.length = 0; await store.save('journal', { prepared: true });
    assert.equal(events.length, 4); assert.equal(events[0][0], 'write'); assert.equal(events[1][0], 'sync');
    assert.equal(events[2][0], 'rename'); assert.equal(events[3][0], 'sync');
    assert.equal(events[0][1], events[1][1]); assert.equal(events[1][1], events[2][1]); assert.equal(events[3][1], directory);
  }, observedIo(events));
});

test('file fsync failure leaves the previous journal intact and broadcasts nothing', async (t) => {
  const directory = await temporary(t); const h = harness(); const events = [];
  await fs.writeFile(path.join(directory, 'preview-demo-fixture-journal.json'), '{"old":true}', { mode: 0o600 });
  await assert.rejects(withPrivateStore(directory, (store) => h.run({ saveJournal: (value) => store.save('journal', value) }),
    observedIo(events, (file) => { if (file.endsWith('.tmp')) throw new Error('simulated fsync failure'); })), /simulated fsync failure/);
  assert.equal(h.broadcasts.length, 0);
  assert.equal(await fs.readFile(path.join(directory, 'preview-demo-fixture-journal.json'), 'utf8'), '{"old":true}');
  assert.deepEqual(await fs.readdir(directory), ['preview-demo-fixture-journal.json']);
});

test('directory fsync failure after rename still prevents broadcast', async (t) => {
  const directory = await temporary(t); const h = harness(); const events = []; let failed = false;
  await assert.rejects(withPrivateStore(directory, (store) => h.run({ saveJournal: (value) => store.save('journal', value) }),
    observedIo(events, (file) => { if (!failed && file === directory && events.some(([op]) => op === 'rename')) { failed = true; throw new Error('directory sync failed'); } })), /directory sync failed/);
  assert.equal(h.broadcasts.length, 0);
  const saved = JSON.parse(await fs.readFile(path.join(directory, 'preview-demo-fixture-journal.json'), 'utf8'));
  assert.equal(saved.transactions['buyer-gas'].phase, 'prepared');
});

test('unexpected provider errors are reduced to a fixed public error code', () => {
  assert.equal(safeErrorCode(new Error('rpc exposed 0xsignedpayload')), 'PREPARATION_FAILED_CHECK_RECORDED_TRANSACTION');
  assert.equal(safeErrorCode(new Error('WRONG_NETWORK')), 'WRONG_NETWORK');
});

test('losing both journal and published ID cannot restart already used demo wallets', async () => {
  const h = harness(); await h.run(); const count = h.broadcasts.length;
  delete h.store.journal; h.store.fixture.onchainReceivableId = '0';
  await assert.rejects(h.run(), /NEW_FIXTURE_WALLETS_ALREADY_USED/);
  assert.equal(h.broadcasts.length, count);
});

test('lagging pending nonce waits before signing the next transaction', async () => {
  const h = harness(); const nonce = h.rpc.getTransactionCount; let stale = 2;
  h.rpc.getTransactionCount = async (address, tag) => {
    const value = await nonce(address, tag);
    if (address.toLowerCase() === h.seller.address.toLowerCase() && value === 1 && stale-- > 0) return 0;
    return value;
  };
  await h.run(); assert.equal(h.broadcasts.length, 4); assert.equal(h.stepCount('createReceivable'), 1);
  assert.equal(Transaction.from(h.store.journal.transactions.create.serialized).nonce, 1);
});

test('unrelated signer nonce advancement fails before allocating a new create transaction', async () => {
  const h = harness(); const nonce = h.rpc.getTransactionCount;
  h.rpc.getTransactionCount = async (address, tag) => {
    const value = await nonce(address, tag); return value === 1 ? 2 : value;
  };
  await assert.rejects(h.run(), /SIGNER_NONCE_CHANGED/);
  assert.equal(h.broadcasts.length, 1); assert.equal(h.store.journal.transactions.create, undefined);
});

test('an existing ID is matched against its creation receipt before other steps are resumed', async () => {
  const h = harness(); await h.run(); const count = h.broadcasts.length;
  const receipt = h.receipts.get(h.store.journal.transactions.create.hash);
  const args = [...iface.parseLog(receipt.logs[0]).args]; args[0] = 8n;
  receipt.logs[0] = { address: FINANCE_ADDRESS, ...iface.encodeEventLog(iface.getEvent('ReceivableCreated'), args) };
  await assert.rejects(h.run(), /FIXTURE_ID_MISMATCH/);
  assert.equal(h.broadcasts.length, count);
});
