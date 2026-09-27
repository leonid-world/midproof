import { BehaviorSubject } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { bootstrapDemo } from '../hosted-demo/bootstrap.js';
import { ContractMaintenanceError, type VerifierMigrationDependencies } from '../hosted-demo/contract-maintenance.js';
import { StateBackupError } from '../hosted-demo/state-backup.js';
import type { DemoConfig } from '../hosted-demo/config.js';
import type { RuntimeState } from '../hosted-demo/gateway.js';

const mocks = vi.hoisted(() => ({
  migration: { contractAddress: 'ab'.repeat(32), oldSha256: 'cd'.repeat(32), newSha256: 'ef'.repeat(32), expectedCounter: '0' },
  events: [] as string[], snapshot: vi.fn(), outbox: vi.fn(), init: vi.fn(), closeWallet: vi.fn(),
  configure: vi.fn(), dust: vi.fn(), write: vi.fn(), save: vi.fn(), migrationRun: vi.fn(), signingKey: vi.fn(),
}));

vi.mock('../api.js', () => ({
  setLogger: vi.fn(), initWalletWithSeed: mocks.init, configureProviders: mocks.configure,
  closeWallet: mocks.closeWallet, displayWalletBalances: vi.fn(async () => ({ total: 1n })),
}));
vi.mock('../hosted-demo/state.js', () => ({
  readManifest: vi.fn(async () => ({ networkId: 'preview', contractAddress: mocks.migration.contractAddress })),
  readEncryptedJson: vi.fn(async () => null), writeEncryptedJson: mocks.write, writeAtomic: vi.fn(),
}));
vi.mock('../hosted-demo/state-backup.js', async (original) => ({
  ...await original<typeof import('../hosted-demo/state-backup.js')>(), snapshotEncryptedState: mocks.snapshot,
}));
vi.mock('../hosted-demo/contract-maintenance.js', async (original) => ({
  ...await original<typeof import('../hosted-demo/contract-maintenance.js')>(),
  readVerifierMigrationConfig: () => mocks.migration, runVerifierMigration: mocks.migrationRun,
}));
vi.mock('../proof-bridge/capability-outbox.js', () => ({ openCapabilityOutbox: mocks.outbox }));
vi.mock('../hosted-demo/wallet.js', () => ({ prepareDemoDust: mocks.dust, saveWalletCheckpoint: mocks.save }));

const config = { stateDir: '/synthetic/state', networkId: 'preview' } as DemoConfig;
const identity = { version: 1 as const, networkId: 'preview' as const, walletSeed: '11'.repeat(32), companySecret: '22'.repeat(32), providerSecret: '3' };
let states: BehaviorSubject<{ isSynced: boolean; pending: { all: string[] } }>;
let state: RuntimeState;

beforeEach(() => {
  vi.clearAllMocks(); mocks.events.splice(0); state = { status: 'starting' };
  states = new BehaviorSubject<{ isSynced: boolean; pending: { all: string[] } }>({ isSynced: true, pending: { all: [] } });
  const progress = { isConnected: true, isStrictlyComplete: () => true, appliedIndex: 1n, highestRelevantWalletIndex: 1n };
  const wallet = { wallet: {
    state: () => states, waitForSyncedState: async () => states.value,
    shielded: { state: new BehaviorSubject({ state: { progress } }) },
    dust: { state: new BehaviorSubject({ state: { progress } }) },
    unshielded: { state: new BehaviorSubject({ progress: { ...progress, appliedId: 1n, highestTransactionId: 1n } }) },
  }, unshieldedKeystore: { getBech32Address: () => ({ asString: () => 'synthetic-public-wallet-address' }) } };
  mocks.snapshot.mockImplementation(async () => { mocks.events.push('backup'); return { reused: false }; });
  mocks.outbox.mockImplementation(async () => { mocks.events.push('outbox'); return { close: vi.fn(), assertMaintenanceIdle: vi.fn() }; });
  mocks.init.mockImplementation(async () => { mocks.events.push('wallet'); return wallet; });
  mocks.dust.mockImplementation(async () => { mocks.events.push('dust'); });
  mocks.configure.mockResolvedValue({ privateStateProvider: { getSigningKey: mocks.signingKey }, publicDataProvider: {}, zkConfigProvider: {} });
  mocks.signingKey.mockResolvedValue('synthetic-signing-key');
  mocks.save.mockImplementation(async (_context, _network, maySave: () => boolean, persist: (value: unknown) => Promise<void>) => {
    if (maySave()) await persist({ synthetic: 'safe synced checkpoint' });
  });
  mocks.write.mockResolvedValue(undefined);
  mocks.migrationRun.mockImplementation(async (_config, dependencies: VerifierMigrationDependencies) => {
    mocks.events.push('maintenance');
    await dependencies.getSigningKey();
    throw new ContractMaintenanceError('CONTRACT_MAINTENANCE_UNCERTAIN');
  });
});

describe('maintenance bootstrap snapshot and checkpoint boundary (fake wallet only)', () => {
  it('does not open an outbox or wallet if the prerequisite backup fails', async () => {
    mocks.snapshot.mockRejectedValue(new StateBackupError('CONTRACT_MAINTENANCE_BACKUP_UNAVAILABLE'));
    await expect(bootstrapDemo(config, identity, 'synthetic-password-at-least-16', state))
      .rejects.toMatchObject({ code: 'CONTRACT_MAINTENANCE_BACKUP_UNAVAILABLE' });
    expect(mocks.outbox).not.toHaveBeenCalled(); expect(mocks.init).not.toHaveBeenCalled();
    expect(mocks.migrationRun).not.toHaveBeenCalled(); expect(mocks.write).not.toHaveBeenCalled();
    expect(state).toMatchObject({ status: 'failed', code: 'CONTRACT_MAINTENANCE_BACKUP_UNAVAILABLE' });
  });

  it('takes the backup first and preserves the last safe checkpoint after uncertain submission', async () => {
    await expect(bootstrapDemo(config, identity, 'synthetic-password-at-least-16', state))
      .rejects.toMatchObject({ code: 'CONTRACT_MAINTENANCE_UNCERTAIN' });
    expect(mocks.events).toEqual(['backup', 'outbox', 'wallet', 'dust', 'maintenance']);
    expect(mocks.signingKey).toHaveBeenCalledTimes(1);
    // The synced pre-maintenance checkpoint is saved once. Shutdown must not
    // serialize the wallet again after failed/uncertain preparation or submit.
    expect(mocks.save).toHaveBeenCalledTimes(1); expect(mocks.write).toHaveBeenCalledTimes(1);
    expect(mocks.closeWallet).toHaveBeenCalledTimes(1);
    expect(state).toMatchObject({ status: 'failed', code: 'CONTRACT_MAINTENANCE_UNCERTAIN' });
  });

  it('rejects existing pending wallet work before loading the maintenance signing key', async () => {
    states.next({ isSynced: true, pending: { all: ['another synthetic transaction'] } });
    await expect(bootstrapDemo(config, identity, 'synthetic-password-at-least-16', state))
      .rejects.toMatchObject({ code: 'CONTRACT_MAINTENANCE_PENDING_WALLET' });
    expect(mocks.signingKey).not.toHaveBeenCalled(); expect(mocks.closeWallet).toHaveBeenCalledTimes(1);
    expect(mocks.save).toHaveBeenCalledTimes(1);
    expect(state).toMatchObject({ status: 'failed', code: 'CONTRACT_MAINTENANCE_PENDING_WALLET' });
  });
});
