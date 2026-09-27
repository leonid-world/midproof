#!/usr/bin/env node
// One-time, explicitly authorized synthetic GIWA Sepolia fixture preparation.
// Uses NEW demo-only keys, never the owner's MetaMask or Midnight keys.
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Contract, Interface, JsonRpcProvider, Wallet, keccak256, parseEther } from '../giwa-midnight/node_modules/ethers/lib.esm/index.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const directory = path.join(root, '.local');
const fixtureFile = path.join(directory, 'preview-demo-fixture.json');
const journalFile = path.join(directory, 'preview-demo-fixture-journal.json');
const financeAddress = '0x0f264334f98ba0d22f7fc6bb901a5fa36158a315';
const rpc = new JsonRpcProvider('https://sepolia-rpc.giwa.io', undefined, { cacheTimeout: -1 });
const abi = [
  'function createReceivable(address buyer,uint256 faceValue,uint256 fundingAmount,uint256 issueDate,uint256 maturityDate,bytes32 documentHash) returns(uint256)',
  'function verifyReceivable(uint256 id)',
  'function tokenizeReceivable(uint256 id) returns(uint256)',
  'function getReceivable(uint256 id) view returns(tuple(uint256 id,address seller,address buyer,address funder,uint256 faceValue,uint256 fundingAmount,uint256 issueDate,uint256 maturityDate,bytes32 documentHash,uint256 tokenId,uint8 status))',
  'event ReceivableCreated(uint256 indexed receivableId,address indexed seller,address indexed buyer,uint256 faceValue,uint256 fundingAmount,uint256 issueDate,uint256 maturityDate,bytes32 documentHash)',
];
const iface = new Interface(abi);
const publicReport = (data) => process.stdout.write(`${JSON.stringify(data)}\n`);
async function save(file, data) {
  const temp = `${file}.tmp`;
  await fs.writeFile(temp, `${JSON.stringify(data, null, 2)}\n`, { mode: 0o600 });
  await fs.rename(temp, file);
}
async function main() {
  if ((await rpc.getNetwork()).chainId !== 91342n) throw new Error('WRONG_NETWORK');
  const stat = await fs.lstat(fixtureFile);
  if (!stat.isFile() || stat.isSymbolicLink() || (stat.mode & 0o077)) throw new Error('UNSAFE_FIXTURE_FILE');
  const fixture = JSON.parse(await fs.readFile(fixtureFile, 'utf8'));
  if (fixture.networkId !== 'preview' || fixture.giwaChainId !== '91342' || fixture.receivableFinanceAddress !== financeAddress) throw new Error('FIXTURE_CONTEXT_MISMATCH');
  const seller = new Wallet(fixture.sellerPrivateKey, rpc);
  const buyer = new Wallet(fixture.buyerPrivateKey, rpc);
  const finance = new Contract(financeAddress, abi, rpc);
  if ((await rpc.getCode(financeAddress)) === '0x') throw new Error('FINANCE_NOT_DEPLOYED');
  let journal;
  try { journal = JSON.parse(await fs.readFile(journalFile, 'utf8')); }
  catch (error) { if (error.code !== 'ENOENT') throw error; journal = { version: 1, transactions: {}, createdAt: new Date().toISOString() }; }
  publicReport({ network: 'GIWA Sepolia', chainId: 91342, seller: seller.address, buyer: buyer.address });
  if (!process.argv.includes('--execute')) {
    publicReport({ status: 'inspection', sellerWei: (await rpc.getBalance(seller.address)).toString(), buyerWei: (await rpc.getBalance(buyer.address)).toString(), onchainReceivableId: fixture.onchainReceivableId, recordedSteps: Object.keys(journal.transactions) });
    return;
  }
  async function transact(step, signer, request) {
    let record = journal.transactions[step];
    if (!record) {
      const transaction = await signer.populateTransaction({ ...request, nonce: await rpc.getTransactionCount(signer.address, 'pending') });
      if (transaction.chainId !== 91342n || transaction.gasLimit * (transaction.maxFeePerGas ?? transaction.gasPrice ?? 0n) > parseEther('0.001')) throw new Error('GAS_BOUND_EXCEEDED');
      const serialized = await signer.signTransaction(transaction);
      record = { hash: keccak256(serialized), serialized, phase: 'prepared' };
      journal.transactions[step] = record;
      // Save the exact signed transaction before any broadcast. Recovery cannot
      // accidentally submit another create/transfer with a different nonce.
      await save(journalFile, journal);
    }
    let receipt = await rpc.getTransactionReceipt(record.hash);
    if (!receipt) {
      const existing = await rpc.getTransaction(record.hash);
      if (!existing) {
        try { await rpc.broadcastTransaction(record.serialized); }
        catch { if (!(await rpc.getTransaction(record.hash))) throw new Error('BROADCAST_UNCERTAIN_RECOVER_SAME_TRANSACTION'); }
      }
      receipt = await rpc.waitForTransaction(record.hash, 1, 120_000);
    }
    if (!receipt) throw new Error('RECEIPT_PENDING_RECOVER_SAME_TRANSACTION');
    if (receipt.status !== 1) throw new Error('TRANSACTION_REVERTED');
    record.phase = 'confirmed'; record.blockNumber = receipt.blockNumber;
    await save(journalFile, journal);
    publicReport({ step, hash: receipt.hash, block: receipt.blockNumber, status: 1 });
    return receipt;
  }
  if (await rpc.getBalance(buyer.address) < parseEther('0.0001')) {
    if (await rpc.getBalance(seller.address) < parseEther('0.0008')) throw new Error('AWAITING_FREE_TEST_GAS');
    await transact('buyer-gas', seller, { to: buyer.address, value: parseEther('0.0005') });
  }
  if (!journal.terms) {
    const issueDate = Math.floor(Date.now() / 1000);
    journal.terms = { faceValue: '1000', fundingAmount: '900', issueDate, maturityDate: issueDate + 30 * 86400, documentHash: keccak256(Buffer.from('MidProof operator-managed synthetic walletless demo 2026-09-27')) };
    await save(journalFile, journal);
  }
  const terms = journal.terms;
  const receipt = await transact('create', seller, { to: financeAddress, data: iface.encodeFunctionData('createReceivable', [buyer.address, terms.faceValue, terms.fundingAmount, terms.issueDate, terms.maturityDate, terms.documentHash]) });
  const event = receipt.logs.filter((l) => l.address.toLowerCase() === financeAddress).map((l) => { try { return iface.parseLog(l); } catch { return null; } }).find((l) => l?.name === 'ReceivableCreated');
  if (!event || event.args.seller.toLowerCase() !== seller.address.toLowerCase() || event.args.buyer.toLowerCase() !== buyer.address.toLowerCase()) throw new Error('CREATE_RECEIPT_MISMATCH');
  const id = event.args.receivableId;
  if (fixture.onchainReceivableId !== '0' && fixture.onchainReceivableId !== id.toString()) throw new Error('FIXTURE_ID_MISMATCH');
  fixture.onchainReceivableId = id.toString();
  await save(fixtureFile, fixture);
  let subject = await finance.getReceivable(id);
  if (subject.status === 0n) await transact('verify', buyer, { to: financeAddress, data: iface.encodeFunctionData('verifyReceivable', [id]) });
  subject = await finance.getReceivable(id);
  if (subject.status === 1n) await transact('tokenize', seller, { to: financeAddress, data: iface.encodeFunctionData('tokenizeReceivable', [id]) });
  subject = await finance.getReceivable(id);
  if (subject.status !== 2n || subject.seller.toLowerCase() !== seller.address.toLowerCase() || subject.buyer.toLowerCase() !== buyer.address.toLowerCase() || subject.faceValue !== 1000n || subject.fundingAmount !== 900n || subject.tokenId <= 0n) throw new Error('FIXTURE_FINAL_STATE_MISMATCH');
  publicReport({ status: 'ready', onchainReceivableId: id.toString(), tokenId: subject.tokenId.toString(), financeAddress, seller: seller.address, buyer: buyer.address, intendedFunderWallet: fixture.intendedFunderWallet, fundingPerformed: false });
}
main().catch((error) => { const code = typeof error.message === 'string' && /^[A-Z_]+$/.test(error.message) ? error.message : 'PREPARATION_FAILED_CHECK_RECORDED_TRANSACTION'; publicReport({ status: 'failed', code }); process.exitCode = 1; }).finally(() => rpc.destroy());
