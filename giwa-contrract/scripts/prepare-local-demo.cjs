// Isolated Anvil-only bootstrap. Never imports the owner's Sepolia deployment.
// Every signed transaction is journaled before broadcast, so restart recovery
// repeats the same bytes instead of creating another contract or receivable.
const fs = require('node:fs/promises');
const path = require('node:path');
const { randomBytes } = require('node:crypto');
const { JsonRpcProvider, Wallet, Contract, ContractFactory, keccak256 } = require('ethers');

const DIRECTORY = process.env.MIDPROOF_LOCAL_CONFIG_DIR || '/demo-config';
const RPC = process.env.GIWA_RPC_URL || 'http://evm:8545';
const log = (message) => process.stdout.write(`[local-fixture] ${message}\n`);
const address = (value) => /^0x[0-9a-fA-F]{40}$/.test(value);
let phase = 'configuration';
async function read(file) {
  try { return JSON.parse(await fs.readFile(path.join(DIRECTORY, file), 'utf8')); }
  catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}
async function write(file, value) {
  const destination = path.join(DIRECTORY, file);
  const temporary = `${destination}.${randomBytes(8).toString('hex')}.tmp`;
  await fs.writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { flag: 'wx', mode: 0o600 });
  if (process.getuid?.() === 0) await fs.chown(temporary, 10001, 10001);
  await fs.rename(temporary, destination);
}
async function main() {
  if (process.env.MIDPROOF_LOCAL_DEMO !== 'true' || process.env.MIDNIGHT_NETWORK_ID !== 'undeployed'
      || process.env.RAILWAY_ENVIRONMENT_ID) throw new Error('LOCAL_DEMO_PROFILE_REQUIRED');
  const url = new URL(RPC);
  if (url.protocol !== 'http:' || !['evm', '127.0.0.1', 'localhost'].includes(url.hostname)
      || url.username || url.password || url.search || url.hash) throw new Error('LOCAL_EVM_URL_REQUIRED');
  const provider = new JsonRpcProvider(RPC, 31337, { staticNetwork: true, cacheTimeout: -1 });
  provider.pollingInterval = 200;
  try {
    if (BigInt(await provider.send('eth_chainId', [])) !== 31337n
        || !/anvil/i.test(await provider.send('web3_clientVersion', []))) throw new Error('LOCAL_ANVIL_CHAIN_REQUIRED');
    await fs.mkdir(DIRECTORY, { recursive: true, mode: 0o700 });
    if (process.getuid?.() === 0) await fs.chown(DIRECTORY, 10001, 10001);
    await fs.chmod(DIRECTORY, 0o700);
    let keys = await read('local-wallets.json');
    if (!keys) {
      keys = Object.fromEntries(['deployer', 'seller', 'buyer', 'funder'].map((role) => [role, Wallet.createRandom().privateKey]));
      await write('local-wallets.json', keys);
    }
    const wallets = Object.fromEntries(Object.entries(keys).map(([role, key]) => [role, new Wallet(key, provider)]));
    if (Object.keys(wallets).sort().join(',') !== 'buyer,deployer,funder,seller') throw new Error('LOCAL_ROLE_KEYS_INVALID');
    if (new Set(Object.values(wallets).map((wallet) => wallet.address)).size !== 4) throw new Error('LOCAL_ROLE_KEYS_NOT_DISTINCT');
    // Anvil account funding is local-only. No faucet, owner account or public
    // chain balance is accessed, and the generated keys are never printed.
    for (const wallet of Object.values(wallets)) {
      if (await provider.getBalance(wallet.address) < 10n ** 18n) {
        await provider.send('anvil_setBalance', [wallet.address, `0x${(100n * 10n ** 18n).toString(16)}`]);
      }
    }
    const journal = await read('local-transactions.json') || { version: 1, steps: {} };
    if (journal.version !== 1 || !journal.steps) throw new Error('LOCAL_JOURNAL_INVALID');
    async function transaction(name, wallet, createRequest) {
      phase = name;
      let step = journal.steps[name];
      if (!step) {
        const request = await wallet.populateTransaction(await createRequest());
        const raw = await wallet.signTransaction(request);
        step = { hash: keccak256(raw), raw };
        journal.steps[name] = step;
        await write('local-transactions.json', journal);
      }
      let receipt = await provider.getTransactionReceipt(step.hash);
      if (!receipt) {
        try { await provider.broadcastTransaction(step.raw); }
        catch {
          receipt = await provider.getTransactionReceipt(step.hash);
          if (!receipt && !await provider.getTransaction(step.hash)) throw new Error(`LOCAL_TRANSACTION_RECOVERY_REQUIRED_${name}`);
        }
        receipt ||= await provider.waitForTransaction(step.hash, 1, 60000);
      }
      if (!receipt || receipt.status !== 1) throw new Error(`LOCAL_TRANSACTION_FAILED_${name}`);
      return receipt;
    }
    const artifact = async (name) => JSON.parse(await fs.readFile(path.join(__dirname, '..', 'artifacts', 'contracts', `${name}.sol`, `${name}.json`), 'utf8'));
    const mockArtifact = await artifact('MockKRW');
    const financeArtifact = await artifact('ReceivableFinance');
    const tokenFactory = new ContractFactory(mockArtifact.abi, mockArtifact.bytecode, wallets.deployer);
    const tokenReceipt = await transaction('deployToken', wallets.deployer, () => tokenFactory.getDeployTransaction());
    if (!address(tokenReceipt.contractAddress)) throw new Error('LOCAL_TOKEN_DEPLOYMENT_MISSING');
    const financeFactory = new ContractFactory(financeArtifact.abi, financeArtifact.bytecode, wallets.deployer);
    const financeReceipt = await transaction('deployFinance', wallets.deployer, () => financeFactory.getDeployTransaction(tokenReceipt.contractAddress));
    if (!address(financeReceipt.contractAddress)) throw new Error('LOCAL_FINANCE_DEPLOYMENT_MISSING');
    const finance = new Contract(financeReceipt.contractAddress, financeArtifact.abi, provider);
    const token = new Contract(tokenReceipt.contractAddress, mockArtifact.abi, provider);
    if ((await finance.paymentToken()).toLowerCase() !== tokenReceipt.contractAddress.toLowerCase()
        || await token.decimals() !== 0n) throw new Error('LOCAL_CONTRACT_IDENTITY_MISMATCH');
    let terms = await read('local-terms.json');
    if (!terms) {
      const start = Math.floor(Date.now() / 86400000) * 86400;
      terms = { faceValue: '1000', fundingAmount: '900', issueDate: start, maturityDate: start + 365 * 86400,
        documentHash: `0x${'0'.repeat(64)}` };
      await write('local-terms.json', terms);
    }
    const created = await transaction('createReceivable', wallets.seller, () => finance.createReceivable.populateTransaction(
      wallets.buyer.address, terms.faceValue, terms.fundingAmount, terms.issueDate, terms.maturityDate, terms.documentHash));
    const event = created.logs.map((entry) => { try { return finance.interface.parseLog(entry); } catch { return null; } })
      .find((entry) => entry?.name === 'ReceivableCreated');
    if (!event) throw new Error('LOCAL_RECEIVABLE_EVENT_MISSING');
    const id = event.args.receivableId;
    const verified = await transaction('verifyReceivable', wallets.buyer, () => finance.verifyReceivable.populateTransaction(id));
    const tokenized = await transaction('tokenizeReceivable', wallets.seller, () => finance.tokenizeReceivable.populateTransaction(id));
    const current = await finance.getReceivable(id);
    if (current.seller.toLowerCase() !== wallets.seller.address.toLowerCase()
        || current.buyer.toLowerCase() !== wallets.buyer.address.toLowerCase()
        || current.status !== 2n || current.faceValue !== 1000n || current.fundingAmount !== 900n) throw new Error('LOCAL_RECEIVABLE_CONTEXT_MISMATCH');
    const fixture = { version: 1, networkId: 'undeployed', giwaChainId: '31337',
      receivableFinanceAddress: financeReceipt.contractAddress.toLowerCase(), onchainReceivableId: id.toString(),
      sellerPrivateKey: wallets.seller.privateKey, buyerPrivateKey: wallets.buyer.privateKey,
      intendedFunderWallet: wallets.funder.address.toLowerCase() };
    await write('local-signers.json', fixture);
    const manifest = { version: 1, networkId: 'undeployed', giwaChainId: '31337',
      receivableFinanceAddress: financeReceipt.contractAddress.toLowerCase(), mockKrwAddress: tokenReceipt.contractAddress.toLowerCase(),
      onchainReceivableId: id.toString(), sellerWallet: wallets.seller.address.toLowerCase(), buyerWallet: wallets.buyer.address.toLowerCase(),
      intendedFunderWallet: wallets.funder.address.toLowerCase(), tokenId: current.tokenId.toString(),
      receipts: { deployToken: tokenReceipt.hash, deployFinance: financeReceipt.hash,
        create: created.hash, verify: verified.hash, tokenize: tokenized.hash } };
    await write('giwa-local.json', manifest);
    log('Existing Solidity contracts and TOKENIZED synthetic fixture verified on isolated chain 31337.');
    log(`Public fixture: contract ${manifest.receivableFinanceAddress}, receivable ${manifest.onchainReceivableId}.`);
  } finally { await provider.destroy(); }
}
main().catch((error) => {
  // Fixed error codes only; provider errors can include raw signed payloads.
  log(/^LOCAL_[A-Z_]+$/.test(error.message) ? error.message : `LOCAL_FIXTURE_SETUP_FAILED (${phase})`);
  process.exitCode = 1;
});
