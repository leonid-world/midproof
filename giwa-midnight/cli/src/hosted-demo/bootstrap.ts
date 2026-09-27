import { resolveExactProofCapability } from 'giwa-midnight-api/resolve';
import type { DemoResult } from './demo-runs.js';
import path from 'node:path';
import { promises as fs, constants } from 'node:fs';
import type { Server } from 'node:http';
import { type Subscription } from 'rxjs';
import { pino } from 'pino';
import { setNetworkId } from '@midnight-ntwrk/midnight-js-network-id';
import { sampleSigningKey, type ContractAddress } from '@midnight-ntwrk/midnight-js-protocol/compact-runtime';
import { createUnprovenDeployTx, submitTx, submitTxAsync } from '@midnight-ntwrk/midnight-js-contracts';
import { createServer as createAttestationServer } from 'zkloan-credit-scorer-attestation-api/server';
import { getPublicKey } from 'zkloan-credit-scorer-attestation-api/signing';
import { createApiServer } from 'giwa-midnight-api/server';
import { createLocalEligibilityReader } from 'giwa-midnight-api/midnight';
import * as api from '../api.js';
import { getInitialPrivateState } from '../state.utils.js';
import { getDefaultGiwaDeploymentConfig, GIWA_CHAIN_ID, RECEIVABLE_FINANCE_ADDRESS, bytesToHex } from '../giwa.js';
import { generatePseudonymNonce, validateLocalPreflight } from '../proof-bridge/local-runtime.js';
import { ProofBridgeRuntime } from '../proof-bridge/runtime.js';
import { openCapabilityOutbox, type ProofCapabilityOutbox } from '../proof-bridge/capability-outbox.js';
import { readManifest, readEncryptedJson, writeEncryptedJson, writeAtomic, type DemoIdentity, type DemoManifest } from './state.js';
import { isDemoFinancialInput, type DemoConfig } from './config.js';
import type { RuntimeState } from './gateway.js';
import type { DeployedGasokEligibilityContract, GasokEligibilityProviders } from '../common-types.js';
import { prepareDemoDust, saveWalletCheckpoint } from './wallet.js';
import { snapshotEncryptedState, StateBackupError } from './state-backup.js';
import { assertMaintenanceWalletIdle } from './maintenance-wallet.js';
import { assertCompatibleContractDeployment, ContractCompatibilityError } from './contract-compatibility.js';
import {
  ContractMaintenanceError, MAINTENANCE_CIRCUITS, readVerifierMigrationConfig, runVerifierMigration,
  type VerifierMigrationConfig,
} from './contract-maintenance.js';

export interface DemoRuntime { controller: ProofBridgeRuntime<api.PreparedEligibilityVerification>; reader: Server;
  readHealthy(): boolean; close(): Promise<void>; resolveCapability(capability: api.ProofCapability): Promise<DemoResult>;
  transaction(requestId: string): { transactionId: string; blockHeight: string } | undefined;
}
const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
function stage(state: RuntimeState, status: RuntimeState['status'], code?: string): void {
  state.status = status; state.code = code;
  // Fixed stage values only. Existing verbose CLI logger is disabled in this mode.
  process.stdout.write(JSON.stringify({ service: 'midnight-demo', status, code }) + '\n');
}
interface PendingDeployment extends DemoManifest { submissionAttempted: boolean }
async function readPending(config: DemoConfig): Promise<PendingDeployment | null> {
  try {
    const pending = JSON.parse(await fs.readFile(path.join(config.stateDir, 'deployment-pending.json'), 'utf8')) as PendingDeployment;
    if (pending.networkId !== config.networkId || !/^[0-9a-f]{64}$/.test(pending.contractAddress)) throw new Error('Invalid pending deployment.');
    return pending;
  } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null; throw error; }
}
async function readMaintenanceJournal(file: string): Promise<unknown> {
  try {
    const handle = await fs.open(file, constants.O_RDONLY | constants.O_NOFOLLOW);
    try {
      const stat = await handle.stat();
      if (!stat.isFile() || stat.nlink !== 1 || stat.size > 8192 || (stat.mode & 0o077) !== 0) {
        throw new ContractMaintenanceError('CONTRACT_MAINTENANCE_JOURNAL_INVALID');
      }
      return JSON.parse(await handle.readFile('utf8')) as unknown;
    } finally { await handle.close(); }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw new ContractMaintenanceError('CONTRACT_MAINTENANCE_JOURNAL_INVALID');
  }
}
async function deployOrRestore(config: DemoConfig, providers: GasokEligibilityProviders, identity: DemoIdentity, state: RuntimeState,
  migration?: VerifierMigrationConfig, outbox?: ProofCapabilityOutbox, assertWalletIdle?: () => Promise<void>,
): Promise<DeployedGasokEligibilityContract> {
  let manifest = await readManifest(config);
  if (migration && (!manifest || manifest.contractAddress !== migration.contractAddress || config.networkId !== 'preview')) {
    throw new ContractMaintenanceError('CONTRACT_MAINTENANCE_TARGET_MISMATCH');
  }
  if (!manifest) {
    let pending = await readPending(config);
    if (pending?.submissionAttempted === false) {
      await fs.unlink(path.join(config.stateDir, 'deployment-pending.json'));
      pending = null;
    }
    if (pending) {
      stage(state, 'deploying', 'DEPLOYMENT_FINALIZATION_PENDING');
      // Never mint a second contract after an uncertain submit. Recover the exact
      // prepared address, whose admin private state was saved before submission.
      while (!(await api.getGasokEligibilityLedgerState(providers, pending.contractAddress as ContractAddress))) await delay(10_000);
      manifest = pending;
    } else {
      stage(state, 'deploying');
      const giwa = getDefaultGiwaDeploymentConfig();
      const initialPrivateState = getInitialPrivateState(Buffer.from(identity.companySecret, 'hex'));
      const signingKey = sampleSigningKey();
      const unproven = await createUnprovenDeployTx(providers as any, { compiledContract: api.gasokEligibilityCompiledContract, initialPrivateState, args: [giwa.chainId, giwa.receivableFinanceAddress], signingKey });
      manifest = { networkId: config.networkId, contractAddress: unproven.public.contractAddress };
      providers.privateStateProvider.setContractAddress(manifest.contractAddress);
      await providers.privateStateProvider.set('gasokEligibilityPrivateState', initialPrivateState);
      await providers.privateStateProvider.setSigningKey(manifest.contractAddress, signingKey);
      const pendingFile = path.join(config.stateDir, 'deployment-pending.json');
      await writeAtomic(pendingFile, { ...manifest, submissionAttempted: false });
      // Proving/balancing can fail before any network submission. Only enter the
      // uncertain-submit recovery state immediately before the broadcast call.
      const deploymentProviders = {
        ...providers,
        midnightProvider: { submitTx: async (transaction: Parameters<typeof providers.midnightProvider.submitTx>[0]) => {
          await writeAtomic(pendingFile, { ...manifest, submissionAttempted: true });
          return providers.midnightProvider.submitTx(transaction);
        } },
      };
      const finalized = await submitTx(deploymentProviders as any, { unprovenTx: unproven.private.unprovenTx });
      if (finalized.status !== 'SucceedEntirely') throw new Error('Demo deployment was not finalized successfully.');
    }
    await writeAtomic(path.join(config.stateDir, 'deployment.json'), manifest);
    await fs.unlink(path.join(config.stateDir, 'deployment-pending.json')).catch(() => undefined);
  }
  state.contractAddress = manifest.contractAddress;
  if (migration) {
    if (!outbox) throw new ContractMaintenanceError('CONTRACT_MAINTENANCE_PENDING_PROOFS');
    stage(state, 'deploying', 'CONTRACT_MAINTENANCE_PENDING');
    const journalFile = path.join(config.stateDir, 'verifier-migration.json');
    await runVerifierMigration(migration, {
      networkId: config.networkId, contractAddress: manifest.contractAddress,
      queryState: () => providers.publicDataProvider.queryContractState(manifest!.contractAddress),
      getVerifierKeys: () => providers.zkConfigProvider.getVerifierKeys([...MAINTENANCE_CIRCUITS]),
      getSigningKey: async () => {
        if (!assertWalletIdle) throw new ContractMaintenanceError('CONTRACT_MAINTENANCE_PENDING_WALLET');
        await assertWalletIdle();
        return providers.privateStateProvider.getSigningKey(manifest!.contractAddress);
      },
      assertIdle: () => outbox.assertMaintenanceIdle(),
      readJournal: () => readMaintenanceJournal(journalFile),
      writeJournal: (journal) => writeAtomic(journalFile, journal),
      submit: (transaction, beforeBroadcast, signal) => submitTxAsync({ ...providers,
        midnightProvider: { submitTx: async (balancedTransaction) => {
          await beforeBroadcast(balancedTransaction.identifiers());
          signal.throwIfAborted();
          return providers.midnightProvider.submitTx(balancedTransaction);
        } },
      }, { unprovenTx: transaction }),
    });
  }
  await assertCompatibleContractDeployment(providers, manifest.contractAddress);
  providers.privateStateProvider.setContractAddress(manifest.contractAddress);
  const privateState = await providers.privateStateProvider.get('gasokEligibilityPrivateState');
  if (!privateState || Buffer.from(privateState.companySecretKey).toString('hex') !== identity.companySecret) throw new Error('Demo deployment private state is missing or belongs to another identity.');
  await providers.privateStateProvider.set('gasokEligibilityPrivateState', api.sanitizeEligibilityPrivateState(privateState));
  return api.joinContract(providers, manifest.contractAddress);
}
export async function bootstrapDemo(config: DemoConfig, identity: DemoIdentity, password: string, state: RuntimeState, registerCleanup?: (close: () => Promise<void>) => void): Promise<DemoRuntime> {
  setNetworkId(config.networkId);
  api.setLogger(pino({ level: 'silent' }));
  process.env.MIDNIGHT_STORAGE_PASSWORD = password;
  let wallet: api.WalletContext | undefined;
  let attestation: ReturnType<typeof createAttestationServer> | undefined;
  let outbox: Awaited<ReturnType<typeof openCapabilityOutbox>> | undefined;
  let runtime: ProofBridgeRuntime<api.PreparedEligibilityVerification> | undefined;
  const subscriptions: Subscription[] = [];
  const snapshotFile = path.join(config.stateDir, 'wallet-state.enc');
  let snapshotTimer: NodeJS.Timeout | undefined;
  let snapshotWrite: Promise<void> | undefined;
  let walletBusy = false;
  let checkpointSafe = true;
  const saveWalletState = (): Promise<void> => {
    if (!wallet || walletBusy || !checkpointSafe) return Promise.resolve();
    if (snapshotWrite) return snapshotWrite;
    const current = wallet;
    // Pending entries are added only after finalization. A failed operation can
    // leave booked coins even with no pending entry, so preserve the last safe
    // checkpoint for the rest of that process and replay it on the next Run.
    snapshotWrite = saveWalletCheckpoint(current, config.networkId, () => !walletBusy && checkpointSafe,
      (snapshot) => writeEncryptedJson(snapshotFile, password, snapshot),
    ).finally(() => { snapshotWrite = undefined; });
    return snapshotWrite;
  };
  let stopping: Promise<void> | undefined;
  const stop = (): Promise<void> => stopping ??= (async () => {
    if (snapshotTimer) clearInterval(snapshotTimer);
    for (const subscription of subscriptions) subscription.unsubscribe();
    await runtime?.shutdown(); outbox?.close();
    if (attestation) await new Promise<void>((resolve) => attestation!.close(() => resolve()));
    await saveWalletState().catch(() => { process.stderr.write('{"service":"midnight-demo","code":"WALLET_SNAPSHOT_SAVE_FAILED"}\n'); });
    if (wallet) await api.closeWallet(wallet);
  })();
  registerCleanup?.(stop);
  try {
    const migration = readVerifierMigrationConfig();
    if (migration) {
      const manifest = await readManifest(config);
      if (config.networkId !== 'preview' || !manifest || manifest.contractAddress !== migration.contractAddress) {
        throw new ContractMaintenanceError('CONTRACT_MAINTENANCE_TARGET_MISMATCH');
      }
      // hosted-demo owns the exclusive process lock before entering bootstrap.
      // Copy the closed LevelDB and encrypted state before any wallet/outbox opens.
      stage(state, 'starting', 'CONTRACT_MAINTENANCE_BACKUP');
      await snapshotEncryptedState({ stateDir: config.stateDir, password, migration });
      outbox = await openCapabilityOutbox({ filePath: path.join(config.stateDir, 'capability-outbox', 'outbox.enc'), password });
    }
    stage(state, 'syncing');
    const savedWallet = await readEncryptedJson<api.WalletStateSnapshot>(snapshotFile, password);
    wallet = await api.initWalletWithSeed(Buffer.from(identity.walletSeed, 'hex'), config, savedWallet ?? undefined);
    snapshotTimer = setInterval(() => { void saveWalletState().catch(() => { state.code = 'WALLET_SNAPSHOT_SAVE_FAILED'; }); }, 60_000);
    snapshotTimer.unref();
    state.sync = {};
    const updateSync = (name: string, p: { isConnected: boolean; isStrictlyComplete(): boolean; appliedIndex: bigint; highestRelevantWalletIndex: bigint }) => {
      state.sync![name] = { connected: p.isConnected, ready: p.isStrictlyComplete(), applied: p.appliedIndex.toString(), tip: p.highestRelevantWalletIndex.toString() };
    };
    subscriptions.push(wallet.wallet.shielded.state.subscribe((value) => updateSync('shielded', value.state.progress)));
    subscriptions.push(wallet.wallet.dust.state.subscribe((value) => updateSync('dust', value.state.progress)));
    subscriptions.push(wallet.wallet.unshielded.state.subscribe((value) => {
      const p = value.progress;
      state.sync!.unshielded = { connected: p.isConnected, ready: p.isStrictlyComplete(), applied: p.appliedId.toString(), tip: p.highestTransactionId.toString() };
    }));
    state.walletAddress = wallet.unshieldedKeystore.getBech32Address().asString();
    state.faucetUrl = config.networkId === 'preview' ? 'https://midnight-tmnight-preview.nethermind.dev/' : undefined;
    await writeAtomic(path.join(config.stateDir, 'wallet-public.json'), { networkId: config.networkId, unshieldedAddress: state.walletAddress, faucetUrl: state.faucetUrl });
    // Observe completion directly. Throttling before the completion filter can
    // drop the final synced event of a new empty public-network wallet.
    await wallet.wallet.waitForSyncedState();
    await saveWalletState();
    if ((await api.displayWalletBalances(wallet.wallet)).total === 0n) {
      stage(state, 'funding_required', 'AWAITING_TEST_FUNDS');
      // The official faucet uses Cloudflare Turnstile. Initial funding is an
      // explicit human action, then the same persistent wallet resumes itself.
      await api.waitForFunds(wallet.wallet);
    }
    stage(state, 'registering_dust');
    walletBusy = true;
    await prepareDemoDust(wallet);
    const providers = await api.configureProviders(wallet, config);
    // A failed/timed-out SDK operation may retain booked coins even with no
    // pending entry. Keep the last safe checkpoint until maintenance succeeds.
    if (migration) checkpointSafe = false;
    const activeWallet = wallet;
    const contract = await deployOrRestore(config, providers, identity, state, migration, outbox,
      () => assertMaintenanceWalletIdle(activeWallet.wallet.state()));
    if (migration) checkpointSafe = true;
    const address = contract.deployTxData.public.contractAddress;
    const providerSk = BigInt(`0x${identity.providerSecret}`); const providerPk = getPublicKey(providerSk);
    let ledgerState = await api.getGasokEligibilityLedgerState(providers, address);
    if (!ledgerState || ledgerState.giwaChainId !== GIWA_CHAIN_ID || bytesToHex(ledgerState.receivableFinanceAddress) !== RECEIVABLE_FINANCE_ADDRESS) throw new Error('Demo contract context is unavailable or invalid.');
    if (!ledgerState.providers.member(2n)) {
      stage(state, 'registering_provider');
      await api.registerProvider(contract, 2n, providerPk);
      ledgerState = await api.getGasokEligibilityLedgerState(providers, address);
    }
    const giwa = validateLocalPreflight(ledgerState, { providerId: 2, publicKey: providerPk, approvedMidnightContractAddress: address });
    attestation = createAttestationServer(providerSk, { approvedMidnightContractAddress: address, allowFinancialInput: isDemoFinancialInput });
    await new Promise<void>((resolve, reject) => { attestation!.once('error', reject); attestation!.listen(0, '127.0.0.1', resolve); });
    const providerAddress = attestation.address();
    if (!providerAddress || typeof providerAddress === 'string') throw new Error('Mock Provider failed to bind privately.');
    const providerUrl = `http://127.0.0.1:${providerAddress.port}`;
    outbox ??= await openCapabilityOutbox({ filePath: path.join(config.stateDir, 'capability-outbox', 'outbox.enc'), password });
    const transactions = new Map<string, { transactionId: string; blockHeight: string }>();
    runtime = new ProofBridgeRuntime({
      outbox,
      operations: {
        async prepare(input) {
          if (!isDemoFinancialInput(input)) throw new Error('Synthetic fixtures are required.');
          const prepared = await api.prepareEligibilityVerificationWithGiwaConfig(contract, providers, giwa, input.onchainReceivableId, input.subjectRole, input.annualRevenueKrw, input.debtRatioBps, input.overdueCount, generatePseudonymNonce(), input.policyRequest, providerUrl);
          return { prepared, authorizationRequest: prepared.authorizationChallenge };
        },
        async complete(prepared, authorization, onStage) {
          walletBusy = true;
          try {
            const completed = await api.completeEligibilityVerification(contract, providers, prepared, authorization, providerUrl, { onStage });
            transactions.set(completed.proofCapability.requestId, { transactionId: completed.finalizedTxData.txId, blockHeight: String(completed.finalizedTxData.blockHeight) });
            if (transactions.size > 512) transactions.delete(transactions.keys().next().value!);
            return completed.proofCapability;
          }
          catch (error) { checkpointSafe = false; throw error; }
          finally { walletBusy = false; }
        },
      },
    });
    const getEligibilityResult = createLocalEligibilityReader(config);
    const reader = createApiServer({ approvedContractAddress: address, networkId: config.networkId, getEligibilityResult, acceptedProviderId: '2' });
    walletBusy = false;
    await saveWalletState();
    stage(state, 'ready');
    return { controller: runtime, reader, readHealthy: () => getEligibilityResult.getHealth?.().status !== 'degraded', close: stop,
      transaction: (requestId) => transactions.get(requestId),
      async resolveCapability(capability) {
        const { result } = await resolveExactProofCapability(capability, address, getEligibilityResult, '2', AbortSignal.timeout(12_000));
        return { ...result, providerId: Number(result.providerId) };
      },
    };
  } catch (error) {
    const failedStage = state.status;
    await stop();
    const code = error instanceof ContractCompatibilityError || error instanceof ContractMaintenanceError || error instanceof StateBackupError ? error.code
      : failedStage === 'registering_dust' ? 'DUST_REGISTRATION_FAILED'
      : failedStage === 'deploying' ? 'CONTRACT_DEPLOYMENT_FAILED'
      : failedStage === 'registering_provider' ? 'PROVIDER_REGISTRATION_FAILED'
      : 'MIDNIGHT_BOOTSTRAP_FAILED';
    stage(state, 'failed', code);
    throw error;
  }
}
