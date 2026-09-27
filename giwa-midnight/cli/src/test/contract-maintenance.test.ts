import { fileURLToPath } from 'node:url';
import { ContractMaintenanceAuthority, ContractOperation, ContractState, createConstructorContext } from '@midnight-ntwrk/midnight-js-protocol/compact-runtime';
import * as L from '@midnight-ntwrk/midnight-js-protocol/ledger';
import { NodeZkConfigProvider } from '@midnight-ntwrk/midnight-js-node-zk-config-provider';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { GasokEligibilityCircuits } from '../common-types.js';
import { GasokEligibility, witnesses } from 'zkloan-credit-scorer-contract';
import { getInitialPrivateState } from '../state.utils.js';
import {
  MAINTENANCE_CIRCUITS, prepareVerifierReplacement, readVerifierMigrationConfig, runVerifierMigration, verifierSha256,
  type VerifierMigrationConfig, type VerifierMigrationDependencies, type VerifierMigrationJournal,
} from '../hosted-demo/contract-maintenance.js';

const address = 'ab'.repeat(32);
const keyProvider = new NodeZkConfigProvider<GasokEligibilityCircuits>(fileURLToPath(new URL('../../../contract/src/managed/zkloan-credit-scorer', import.meta.url)));
let keys: Awaited<ReturnType<typeof keyProvider.getVerifierKeys>>;
beforeAll(async () => { keys = await keyProvider.getVerifierKeys([...MAINTENANCE_CIRCUITS]); });
afterEach(() => { vi.useRealTimers(); });

function deferred<T = void>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((accept, fail) => { resolve = accept; reject = fail; });
  return { promise, resolve, reject };
}

function fixture() {
  const signingKey = L.sampleSigningKey();
  // Non-empty actual application layout, with a disposable synthetic secret.
  const state = new GasokEligibility.Contract(witnesses).initialState(
    createConstructorContext(getInitialPrivateState(new Uint8Array(32).fill(7)), '00'.repeat(32)),
    91342n, new Uint8Array(20).fill(8),
  ).currentContractState;
  state.maintenanceAuthority = new ContractMaintenanceAuthority([L.signatureVerifyingKey(signingKey)], 1, 0n);
  for (const [id, key] of keys) {
    const operation = new ContractOperation();
    operation.verifierKey = id === 'verifyEligibility' ? keys[1][1] : key;
    state.setOperation(id, operation);
  }
  const config: VerifierMigrationConfig = { contractAddress: address, expectedCounter: '0',
    oldSha256: verifierSha256(keys[1][1]), newSha256: verifierSha256(keys[0][1]) };
  return { signingKey, state, config };
}

const strictness = new L.WellFormedStrictness();
strictness.enforceBalancing = false; // No wallet/DUST in this isolated ledger.
strictness.verifySignatures = true;
strictness.verifyContractProofs = true;
strictness.verifyNativeProofs = true;
strictness.enforceLimits = true;
const noProver: L.ProvingProvider = {
  check: async () => { throw new Error('Maintenance must not request a contract proof.'); },
  prove: async () => { throw new Error('Maintenance must not request a contract proof.'); },
};
async function apply(ledger: L.LedgerState, transaction: L.UnprovenTransaction) {
  const proven = await transaction.prove(noProver, L.CostModel.initialCostModel());
  const time = new Date();
  const checked = proven.wellFormed(ledger, strictness, time);
  return ledger.apply(checked, new L.TransactionContext(ledger, {
    secondsSinceEpoch: BigInt(Math.floor(time.getTime() / 1000)), secondsSinceEpochErr: 0,
    parentBlockHash: '00'.repeat(32), lastBlockTime: BigInt(Math.floor(time.getTime() / 1000)) - 1n,
  }));
}
function transaction(update: L.MaintenanceUpdate): L.UnprovenTransaction {
  return L.Transaction.fromParts('preview', undefined, undefined, L.Intent.new(new Date(Date.now() + 60_000)).addMaintenanceUpdate(update));
}
async function deployedFixture() {
  const f = fixture();
  const deploy = new L.ContractDeploy(L.ContractState.deserialize(f.state.serialize()));
  const [ledger, result] = await apply(L.LedgerState.blank('preview'),
    L.Transaction.fromParts('preview', undefined, undefined, L.Intent.new(new Date(Date.now() + 60_000)).addDeploy(deploy)));
  expect(result.type).toBe('success');
  return { ...f, address: deploy.address, config: { ...f.config, contractAddress: deploy.address }, ledger };
}

describe('reviewed same-address verifier maintenance', () => {
  it('is disabled by default and requires all exact activation pins', () => {
    expect(readVerifierMigrationConfig({})).toBeUndefined();
    expect(readVerifierMigrationConfig({ MIDNIGHT_VERIFIER_MIGRATION_ENABLED: '0' })).toBeUndefined();
    expect(() => readVerifierMigrationConfig({ MIDNIGHT_VERIFIER_MIGRATION_ENABLED: 'true' })).toThrow();
    expect(() => readVerifierMigrationConfig({ MIDNIGHT_VERIFIER_MIGRATION_ENABLED: '1' })).toThrow();
    const { config } = fixture();
    expect(readVerifierMigrationConfig({ MIDNIGHT_VERIFIER_MIGRATION_ENABLED: '1',
      MIDNIGHT_VERIFIER_MIGRATION_CONTRACT_ADDRESS: config.contractAddress,
      MIDNIGHT_VERIFIER_MIGRATION_OLD_SHA256: config.oldSha256,
      MIDNIGHT_VERIFIER_MIGRATION_NEW_SHA256: config.newSha256,
      MIDNIGHT_VERIFIER_MIGRATION_EXPECTED_COUNTER: config.expectedCounter })).toEqual(config);
  });

  it.each(['preprod', 'mainnet', 'undeployed'])('rejects %s before creating a maintenance action', (network) => {
    const f = fixture();
    expect(() => prepareVerifierReplacement(f.config, network, address, f.state, keys,
      L.signatureVerifyingKey(f.signingKey))).toThrow();
  });

  it.each(['address', 'old-key', 'new-key', 'counter', 'authority', 'other-operation'])('fails closed on an unexpected %s', (mode) => {
    const f = fixture();
    const config = { ...f.config };
    if (mode === 'old-key') config.oldSha256 = 'c'.repeat(64);
    if (mode === 'new-key') config.newSha256 = 'd'.repeat(64);
    if (mode === 'counter') config.expectedCounter = '1';
    if (mode === 'authority') f.state.maintenanceAuthority = new ContractMaintenanceAuthority([], 1, 0n);
    if (mode === 'other-operation') { const operation = new ContractOperation(); operation.verifierKey = keys[0][1]; f.state.setOperation('rotateAdmin', operation); }
    expect(() => prepareVerifierReplacement(config, 'preview', mode === 'address' ? 'cd'.repeat(32) : address,
      f.state, keys, L.signatureVerifyingKey(f.signingKey))).toThrow();
  });

  it('applies remove+insert atomically with actual signature verification and preserves every other state byte', async () => {
    const f = await deployedFixture();
    const before = ContractState.deserialize(f.ledger.index(f.address)!.serialize());
    const originalBytes = before.serialize();
    const plan = prepareVerifierReplacement(f.config, 'preview', f.address, before, keys, L.signatureVerifyingKey(f.signingKey));
    expect(before.serialize()).toEqual(originalBytes);
    expect(plan.update.updates).toHaveLength(2);
    const signed = plan.update.addSignature(0n, L.signData(f.signingKey, plan.update.dataToSign));
    const [next, result] = await apply(f.ledger, transaction(signed));
    expect(result.type).toBe('success');
    const after = next.index(f.address)!;
    expect(verifierSha256(after.serialize())).toBe(plan.afterStateSha256);
    expect(after.maintenanceAuthority.counter).toBe(1n);
    expect(Buffer.from(after.operation('verifyEligibility')!.verifierKey)).toEqual(Buffer.from(keys[0][1]));
    expect(after.data.toString()).toBe(f.ledger.index(f.address)!.data.toString());
  });

  it('proves single insert cannot overwrite an existing key, despite the lower API name', async () => {
    const f = await deployedFixture();
    const update = new L.MaintenanceUpdate(f.address, [new L.VerifierKeyInsert('verifyEligibility',
      new L.ContractOperationVersionedVerifierKey('v3', keys[0][1]))], 0n);
    const [next, result] = await apply(f.ledger, transaction(update.addSignature(0n, L.signData(f.signingKey, update.dataToSign))));
    expect(result.type).toBe('partialSuccess');
    expect(next.index(f.address)!.serialize()).toEqual(f.ledger.index(f.address)!.serialize());
  });

  it('rolls back removal too when a later instruction in the same maintenance action fails', async () => {
    const f = await deployedFixture();
    const plan = prepareVerifierReplacement(f.config, 'preview', f.address, f.state, keys, L.signatureVerifyingKey(f.signingKey));
    const update = new L.MaintenanceUpdate(f.address, [...plan.update.updates, new L.VerifierKeyInsert('verifyEligibility',
      new L.ContractOperationVersionedVerifierKey('v3', keys[0][1]))], 0n);
    const [next, result] = await apply(f.ledger, transaction(update.addSignature(0n, L.signData(f.signingKey, update.dataToSign))));
    expect(result.type).toBe('partialSuccess');
    expect(next.index(f.address)!.serialize()).toEqual(f.ledger.index(f.address)!.serialize());
  });

  it('rejects a maintenance action signed by an unrelated ephemeral key', async () => {
    const f = await deployedFixture();
    const plan = prepareVerifierReplacement(f.config, 'preview', f.address, f.state, keys, L.signatureVerifyingKey(f.signingKey));
    const attempt = apply(f.ledger, transaction(plan.update.addSignature(0n, L.signData(L.sampleSigningKey(), plan.update.dataToSign))));
    await expect(attempt).rejects.toThrow();
  });
});

async function orchestrationFixture() {
  const f = await deployedFixture();
  let ledger = f.ledger;
  let journal: VerifierMigrationJournal | null = null;
  const beforeBroadcastOrder: string[] = [];
  const dependencies: VerifierMigrationDependencies = {
    networkId: 'preview', contractAddress: f.address,
    queryState: vi.fn(async () => ContractState.deserialize(ledger.index(f.address)!.serialize())),
    getVerifierKeys: vi.fn(async () => keys),
    getSigningKey: vi.fn(async () => f.signingKey), assertIdle: vi.fn(),
    readJournal: vi.fn(async () => journal),
    writeJournal: vi.fn(async (value) => { journal = structuredClone(value); beforeBroadcastOrder.push(`journal:${value.phase}`); }),
    submit: vi.fn(async (tx, beforeBroadcast) => {
      const proven = await tx.prove(noProver, L.CostModel.initialCostModel());
      const ids = proven.identifiers();
      await beforeBroadcast(ids);
      beforeBroadcastOrder.push('broadcast');
      const [next, result] = await apply(ledger, tx);
      expect(result.type).toBe('success'); ledger = next;
      return ids[0];
    }),
    wait: async () => undefined,
  };
  return { ...f, dependencies, beforeBroadcastOrder, getJournal: () => journal,
    changePublicData: () => {
      ledger = ledger.updateIndex(f.address, new L.ChargedState(L.StateValue.newArray()), ledger.index(f.address)!.balance);
    },
    setJournal: (value: VerifierMigrationJournal | null) => { journal = value; } };
}

describe('bootstrap maintenance journal and uncertain submission', () => {
  it('persists the actual transaction identifiers before broadcast and completes after fresh state matches', async () => {
    const f = await orchestrationFixture();
    await expect(runVerifierMigration(f.config, f.dependencies)).resolves.toBe('updated');
    expect(f.beforeBroadcastOrder).toEqual(['journal:prepared', 'journal:submitting', 'journal:broadcast', 'broadcast', 'journal:complete']);
    expect(f.getJournal()!.transactionIds.length).toBeGreaterThan(0);
    expect(f.getJournal()!.phase).toBe('complete');
    await expect(runVerifierMigration(f.config, f.dependencies)).resolves.toBe('already-current');
    expect(f.dependencies.submit).toHaveBeenCalledTimes(1);
  });

  it('allows later public-state changes after the completed transition without submitting again', async () => {
    const f = await orchestrationFixture();
    await expect(runVerifierMigration(f.config, f.dependencies)).resolves.toBe('updated');
    f.changePublicData();
    await expect(runVerifierMigration(f.config, f.dependencies)).resolves.toBe('already-current');
    expect(f.dependencies.submit).toHaveBeenCalledTimes(1);
  });

  it('rejects missing maintenance authority without preparing or submitting a transaction', async () => {
    const f = await orchestrationFixture();
    await expect(runVerifierMigration(f.config, { ...f.dependencies, getSigningKey: async () => null }))
      .rejects.toMatchObject({ code: 'CONTRACT_MAINTENANCE_AUTHORITY_UNAVAILABLE' });
    expect(f.dependencies.submit).not.toHaveBeenCalled();
    expect(f.getJournal()).toBeNull();
  });

  it('can retry a failure known to occur before any broadcast', async () => {
    const f = await orchestrationFixture();
    await expect(runVerifierMigration(f.config, { ...f.dependencies, submit: async () => { throw new Error('proving failed before submission'); } }))
      .rejects.toMatchObject({ code: 'CONTRACT_MAINTENANCE_PREPARATION_FAILED' });
    expect(f.getJournal()!.phase).toBe('prepared');
    await expect(runVerifierMigration(f.config, f.dependencies)).resolves.toBe('updated');
    expect(f.dependencies.submit).toHaveBeenCalledTimes(1);
  });

  it('does not submit when pending proofs or undelivered results exist', async () => {
    const f = await orchestrationFixture();
    await expect(runVerifierMigration(f.config, { ...f.dependencies, assertIdle: () => { throw new Error('active'); } }))
      .rejects.toMatchObject({ code: 'CONTRACT_MAINTENANCE_PENDING_PROOFS' });
    expect(f.dependencies.submit).not.toHaveBeenCalled();
    expect(f.dependencies.getSigningKey).not.toHaveBeenCalled();
    expect(f.getJournal()).toBeNull();
  });

  it('refuses to broadcast if journal persistence fails at that boundary', async () => {
    const f = await orchestrationFixture();
    const writeJournal = async (journal: VerifierMigrationJournal) => {
      if (journal.phase === 'broadcast') throw new Error('disk unavailable');
      await f.dependencies.writeJournal(journal);
    };
    await expect(runVerifierMigration(f.config, { ...f.dependencies, writeJournal }))
      .rejects.toMatchObject({ code: 'CONTRACT_MAINTENANCE_PREPARATION_FAILED' });
    expect(f.beforeBroadcastOrder).toEqual(['journal:prepared', 'journal:submitting', 'journal:prepared']);
    expect(f.getJournal()!.phase).toBe('prepared');
  });

  it('keeps uncertain broadcast durable and never retries on restart while the old key is visible', async () => {
    const f = await orchestrationFixture();
    const submit = vi.fn(async (_tx: L.UnprovenTransaction, beforeBroadcast: (ids: string[]) => Promise<void>) => {
      await beforeBroadcast(['12'.repeat(32)]); throw new Error('response lost');
    });
    await expect(runVerifierMigration(f.config, { ...f.dependencies, submit })).rejects.toMatchObject({ code: 'CONTRACT_MAINTENANCE_UNCERTAIN' });
    expect(f.getJournal()!.phase).toBe('broadcast');
    await expect(runVerifierMigration(f.config, { ...f.dependencies, submit })).rejects.toMatchObject({ code: 'CONTRACT_MAINTENANCE_UNCERTAIN' });
    expect(submit).toHaveBeenCalledTimes(1);
  });

  it('recovers a finalized update after losing the broadcast response without submitting again', async () => {
    const f = await orchestrationFixture();
    const submit = vi.fn(async (tx: L.UnprovenTransaction, beforeBroadcast: (ids: string[]) => Promise<void>, signal: AbortSignal) => {
      await f.dependencies.submit(tx, beforeBroadcast, signal); throw new Error('response lost after finalization');
    });
    await expect(runVerifierMigration(f.config, { ...f.dependencies, submit })).rejects.toMatchObject({ code: 'CONTRACT_MAINTENANCE_UNCERTAIN' });
    await expect(runVerifierMigration(f.config, { ...f.dependencies, submit })).resolves.toBe('already-current');
    expect(submit).toHaveBeenCalledTimes(1);
    expect(f.getJournal()!.phase).toBe('complete');
  });

  it('retains an uncertain journal when bounded observations still show the old key', async () => {
    const f = await orchestrationFixture();
    const submit = vi.fn(async (_tx: L.UnprovenTransaction, beforeBroadcast: (ids: string[]) => Promise<void>) => {
      await beforeBroadcast(['12'.repeat(32)]); return '12'.repeat(32);
    });
    await expect(runVerifierMigration(f.config, { ...f.dependencies, submit })).rejects.toMatchObject({ code: 'CONTRACT_MAINTENANCE_UNCERTAIN' });
    expect(submit).toHaveBeenCalledTimes(1);
    expect(f.dependencies.queryState).toHaveBeenCalledTimes(26);
    expect(f.getJournal()!.phase).toBe('broadcast');
  });

  it('rejects a journal for a different reviewed transition', async () => {
    const f = await orchestrationFixture();
    await expect(runVerifierMigration(f.config, { ...f.dependencies, readJournal: async () => ({ version: 1 }) }))
      .rejects.toMatchObject({ code: 'CONTRACT_MAINTENANCE_JOURNAL_INVALID' });
    expect(f.dependencies.getSigningKey).not.toHaveBeenCalled();
    expect(f.dependencies.submit).not.toHaveBeenCalled();
  });

  it('times out stalled preparation, preserves uncertainty and prevents its later broadcast or restart retry', async () => {
    const f = await orchestrationFixture();
    vi.useFakeTimers();
    const entered = deferred<AbortSignal>();
    const resume = deferred();
    const settled = deferred();
    const broadcast = vi.fn();
    const submit = vi.fn(async (_tx: L.UnprovenTransaction, beforeBroadcast: (ids: string[]) => Promise<void>, signal: AbortSignal) => {
      entered.resolve(signal);
      try {
        await resume.promise;
        await beforeBroadcast(['12'.repeat(32)]);
        signal.throwIfAborted();
        broadcast();
        return '12'.repeat(32);
      } finally { settled.resolve(); }
    });
    const outcome = runVerifierMigration(f.config, { ...f.dependencies, submit, submitTimeoutMs: 100 }).catch((error) => error);
    const signal = await entered.promise;
    expect(f.getJournal()!.phase).toBe('submitting');
    await vi.advanceTimersByTimeAsync(101);
    expect(await outcome).toMatchObject({ code: 'CONTRACT_MAINTENANCE_UNCERTAIN' });
    expect(signal.aborted).toBe(true);
    expect(f.getJournal()!.transactionIds).toEqual([]);
    await expect(runVerifierMigration(f.config, { ...f.dependencies, submit })).rejects.toMatchObject({ code: 'CONTRACT_MAINTENANCE_UNCERTAIN' });
    expect(submit).toHaveBeenCalledTimes(1);
    resume.resolve();
    await settled.promise;
    expect(broadcast).not.toHaveBeenCalled();
    expect(f.beforeBroadcastOrder).toEqual(['journal:prepared', 'journal:submitting']);
  });

  it('uses the two-minute production bound when no test override is supplied', async () => {
    const f = await orchestrationFixture();
    vi.useFakeTimers();
    const entered = deferred();
    let ended = false;
    const submit = async () => { entered.resolve(); return new Promise<string>(() => undefined); };
    const outcome = runVerifierMigration(f.config, { ...f.dependencies, submit }).catch((error) => {
      ended = true; return error;
    });
    await entered.promise;
    await vi.advanceTimersByTimeAsync(119_999);
    expect(ended).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(await outcome).toMatchObject({ code: 'CONTRACT_MAINTENANCE_UNCERTAIN' });
    expect(f.getJournal()!.phase).toBe('submitting');
  });

  it('blocks late broadcast when the pre-broadcast state read crosses the submission deadline', async () => {
    const f = await orchestrationFixture();
    vi.useFakeTimers();
    const entered = deferred();
    const resume = deferred<ContractState>();
    const settled = deferred();
    const broadcast = vi.fn();
    let queries = 0;
    const queryState = async () => {
      queries += 1;
      if (queries === 2) { entered.resolve(); return resume.promise; }
      return f.dependencies.queryState();
    };
    const submit = async (_tx: L.UnprovenTransaction, beforeBroadcast: (ids: string[]) => Promise<void>, signal: AbortSignal) => {
      try { await beforeBroadcast(['12'.repeat(32)]); signal.throwIfAborted(); broadcast(); return '12'.repeat(32); }
      finally { settled.resolve(); }
    };
    const outcome = runVerifierMigration(f.config, { ...f.dependencies, submit, queryState, submitTimeoutMs: 100 }).catch((error) => error);
    await entered.promise;
    await vi.advanceTimersByTimeAsync(101);
    expect(await outcome).toMatchObject({ code: 'CONTRACT_MAINTENANCE_UNCERTAIN' });
    resume.resolve((await f.dependencies.queryState())!);
    await settled.promise;
    expect(broadcast).not.toHaveBeenCalled();
    expect(f.getJournal()!.phase).toBe('submitting');
  });

  it('returns on timeout even if journal I/O stalls, then blocks broadcast after that write eventually finishes', async () => {
    const f = await orchestrationFixture();
    vi.useFakeTimers();
    const entered = deferred();
    const resume = deferred();
    const settled = deferred();
    const broadcast = vi.fn();
    const writeJournal = async (journal: VerifierMigrationJournal) => {
      if (journal.phase === 'broadcast') { entered.resolve(); await resume.promise; }
      await f.dependencies.writeJournal(journal);
    };
    const submit = vi.fn(async (_tx: L.UnprovenTransaction, beforeBroadcast: (ids: string[]) => Promise<void>, signal: AbortSignal) => {
      try { await beforeBroadcast(['12'.repeat(32)]); signal.throwIfAborted(); broadcast(); return '12'.repeat(32); }
      finally { settled.resolve(); }
    });
    const outcome = runVerifierMigration(f.config, { ...f.dependencies, submit, writeJournal, submitTimeoutMs: 100 }).catch((error) => error);
    await entered.promise;
    await vi.advanceTimersByTimeAsync(101);
    expect(await outcome).toMatchObject({ code: 'CONTRACT_MAINTENANCE_UNCERTAIN' });
    expect(f.getJournal()!.phase).toBe('submitting');
    resume.resolve();
    await settled.promise;
    expect(broadcast).not.toHaveBeenCalled();
    expect(f.getJournal()!.phase).toBe('broadcast');
    await expect(runVerifierMigration(f.config, { ...f.dependencies, submit })).rejects.toMatchObject({ code: 'CONTRACT_MAINTENANCE_UNCERTAIN' });
    expect(submit).toHaveBeenCalledTimes(1);
  });

  it('bounds an SDK Finalized wait after broadcast and never submits it twice', async () => {
    const f = await orchestrationFixture();
    vi.useFakeTimers();
    const broadcast = deferred<AbortSignal>();
    const submit = vi.fn(async (_tx: L.UnprovenTransaction, beforeBroadcast: (ids: string[]) => Promise<void>, signal: AbortSignal) => {
      await beforeBroadcast(['12'.repeat(32)]); signal.throwIfAborted(); broadcast.resolve(signal);
      return new Promise<string>(() => undefined);
    });
    const outcome = runVerifierMigration(f.config, { ...f.dependencies, submit, submitTimeoutMs: 100 }).catch((error) => error);
    const signal = await broadcast.promise;
    expect(f.getJournal()!.phase).toBe('broadcast');
    await vi.advanceTimersByTimeAsync(101);
    expect(await outcome).toMatchObject({ code: 'CONTRACT_MAINTENANCE_UNCERTAIN' });
    expect(signal.aborted).toBe(true);
    expect(f.getJournal()!.transactionIds).toEqual(['12'.repeat(32)]);
    await expect(runVerifierMigration(f.config, { ...f.dependencies, submit })).rejects.toMatchObject({ code: 'CONTRACT_MAINTENANCE_UNCERTAIN' });
    expect(submit).toHaveBeenCalledTimes(1);
  });

  it('recovers a successful chain update after the SDK Finalized wait times out', async () => {
    const f = await orchestrationFixture();
    vi.useFakeTimers();
    const applied = deferred();
    const submit = vi.fn(async (tx: L.UnprovenTransaction, beforeBroadcast: (ids: string[]) => Promise<void>, signal: AbortSignal) => {
      await f.dependencies.submit(tx, beforeBroadcast, signal);
      applied.resolve();
      return new Promise<string>(() => undefined);
    });
    const outcome = runVerifierMigration(f.config, { ...f.dependencies, submit, submitTimeoutMs: 100 }).catch((error) => error);
    await applied.promise;
    await vi.advanceTimersByTimeAsync(101);
    expect(await outcome).toMatchObject({ code: 'CONTRACT_MAINTENANCE_UNCERTAIN' });
    await expect(runVerifierMigration(f.config, { ...f.dependencies, submit })).resolves.toBe('already-current');
    expect(submit).toHaveBeenCalledTimes(1);
    expect(f.getJournal()!.phase).toBe('complete');
  });

  it('checks the deadline after journal persistence even before the timer callback runs', async () => {
    const f = await orchestrationFixture();
    vi.useFakeTimers();
    const broadcast = vi.fn();
    const writeJournal = async (journal: VerifierMigrationJournal) => {
      await f.dependencies.writeJournal(journal);
      if (journal.phase === 'broadcast') vi.setSystemTime(Date.now() + 101);
    };
    const submit = async (_tx: L.UnprovenTransaction, beforeBroadcast: (ids: string[]) => Promise<void>, signal: AbortSignal) => {
      await beforeBroadcast(['12'.repeat(32)]); signal.throwIfAborted(); broadcast(); return '12'.repeat(32);
    };
    await expect(runVerifierMigration(f.config, { ...f.dependencies, submit, writeJournal, submitTimeoutMs: 100 }))
      .rejects.toMatchObject({ code: 'CONTRACT_MAINTENANCE_UNCERTAIN' });
    expect(broadcast).not.toHaveBeenCalled();
    expect(f.getJournal()!.phase).toBe('broadcast');
  });
});
