import { createHash } from 'node:crypto';
import { ContractMaintenanceAuthority, ContractState } from '@midnight-ntwrk/midnight-js-protocol/compact-runtime';
import {
  ContractOperationVersion, ContractOperationVersionedVerifierKey, Intent, MaintenanceUpdate,
  Transaction, VerifierKeyInsert, VerifierKeyRemove, signData, signatureVerifyingKey,
  type SigningKey, type UnprovenTransaction,
} from '@midnight-ntwrk/midnight-js-protocol/ledger';
import type { GasokEligibilityCircuits } from '../common-types.js';

const CIRCUITS: GasokEligibilityCircuits[] = ['verifyEligibility', 'registerProvider', 'removeProvider', 'rotateAdmin'];
const HEX32 = /^[0-9a-f]{64}$/;
const PREFIX = 'MIDNIGHT_VERIFIER_MIGRATION_';
const SUBMISSION_TIMEOUT_MS = 120_000;
export const verifierSha256 = (bytes: Uint8Array): string => createHash('sha256').update(bytes).digest('hex');

export interface VerifierMigrationConfig {
  readonly contractAddress: string;
  readonly oldSha256: string;
  readonly newSha256: string;
  readonly expectedCounter: string;
}

export class ContractMaintenanceError extends Error {
  constructor(readonly code: string) {
    super('The requested contract maintenance could not be completed safely. Preserve the existing deployment and maintenance journal.');
    this.name = 'ContractMaintenanceError';
  }
}

const fail = (code: string): never => { throw new ContractMaintenanceError(`CONTRACT_MAINTENANCE_${code}`); };

/** No migration is inferred from a mismatch. Activation requires every explicit pin. */
export function readVerifierMigrationConfig(env: NodeJS.ProcessEnv = process.env): VerifierMigrationConfig | undefined {
  const enabled = env[`${PREFIX}ENABLED`];
  if (enabled === undefined || enabled === '0') return undefined;
  if (enabled !== '1') return fail('CONFIG_INVALID');
  const config = {
    contractAddress: env[`${PREFIX}CONTRACT_ADDRESS`] ?? '',
    oldSha256: env[`${PREFIX}OLD_SHA256`] ?? '',
    newSha256: env[`${PREFIX}NEW_SHA256`] ?? '',
    expectedCounter: env[`${PREFIX}EXPECTED_COUNTER`] ?? '',
  };
  validateConfig(config);
  return Object.freeze(config);
}

function validateConfig(config: VerifierMigrationConfig): void {
  if (![config.contractAddress, config.oldSha256, config.newSha256].every((value) => HEX32.test(value)) ||
      config.oldSha256 === config.newSha256 || !/^(0|[1-9][0-9]*)$/.test(config.expectedCounter) ||
      BigInt(config.expectedCounter) >= 0xffff_ffffn) fail('CONFIG_INVALID');
}

type VerifierKeys = ReadonlyArray<readonly [GasokEligibilityCircuits, Uint8Array]>;

function inspectState(config: VerifierMigrationConfig, state: ContractState, keys: VerifierKeys): 'old' | 'current' {
  if (keys.length !== CIRCUITS.length || new Set(keys.map(([id]) => id)).size !== CIRCUITS.length ||
      CIRCUITS.some((id) => !keys.some(([candidate]) => candidate === id))) fail('KEY_SET_MISMATCH');
  for (const [id, key] of keys) {
    const current = state.operation(id)?.verifierKey;
    if (!current) return fail('KEY_SET_MISMATCH');
    if (id === 'verifyEligibility') {
      if (verifierSha256(key) !== config.newSha256) fail('KEY_SET_MISMATCH');
    } else if (!Buffer.from(current).equals(Buffer.from(key))) fail('KEY_SET_MISMATCH');
  }
  const currentHash = verifierSha256(state.operation('verifyEligibility')!.verifierKey);
  if (currentHash === config.oldSha256 && state.maintenanceAuthority.counter === BigInt(config.expectedCounter)) return 'old';
  if (currentHash === config.newSha256 && state.maintenanceAuthority.counter === BigInt(config.expectedCounter) + 1n) return 'current';
  return fail('STATE_MISMATCH');
}

/** Public-state-only preparation. No wallet, private-state access, or submission. */
export function prepareVerifierReplacement(
  config: VerifierMigrationConfig, networkId: string, contractAddress: string,
  state: ContractState, keys: VerifierKeys, maintenancePublicKey: string,
): { update: MaintenanceUpdate; beforeStateSha256: string; afterStateSha256: string } {
  validateConfig(config);
  if (networkId !== 'preview' || contractAddress !== config.contractAddress) fail('TARGET_MISMATCH');
  if (inspectState(config, state, keys) !== 'old') fail('STATE_MISMATCH');
  const authority = state.maintenanceAuthority;
  if (authority.threshold !== 1 || authority.committee.length !== 1 || authority.committee[0] !== maintenancePublicKey) {
    fail('AUTHORITY_MISMATCH');
  }
  const nextKey = keys.find(([id]) => id === 'verifyEligibility')![1];
  // One maintenance action containing both instructions: never a separate
  // remove transaction followed by a potentially missing insertion.
  const update = new MaintenanceUpdate(contractAddress, [
    new VerifierKeyRemove('verifyEligibility', new ContractOperationVersion('v3')),
    new VerifierKeyInsert('verifyEligibility', new ContractOperationVersionedVerifierKey('v3', nextKey)),
  ], authority.counter);
  const expected = ContractState.deserialize(state.serialize());
  const operation = expected.operation('verifyEligibility')!;
  operation.verifierKey = nextKey;
  expected.setOperation('verifyEligibility', operation);
  expected.maintenanceAuthority = new ContractMaintenanceAuthority([...authority.committee], 1, authority.counter + 1n);
  return { update, beforeStateSha256: verifierSha256(state.serialize()), afterStateSha256: verifierSha256(expected.serialize()) };
}

export interface VerifierMigrationJournal extends VerifierMigrationConfig {
  readonly version: 1;
  readonly networkId: 'preview';
  readonly phase: 'prepared' | 'submitting' | 'broadcast' | 'complete';
  readonly beforeStateSha256: string;
  readonly afterStateSha256: string;
  readonly transactionIds: string[];
}

function parseJournal(value: unknown, config: VerifierMigrationConfig): VerifierMigrationJournal | null {
  if (value === null) return null;
  if (typeof value !== 'object' || value === null) return fail('JOURNAL_INVALID');
  const journal = value as VerifierMigrationJournal;
  const expectedKeys = ['version', 'networkId', 'phase', 'contractAddress', 'oldSha256', 'newSha256', 'expectedCounter',
    'beforeStateSha256', 'afterStateSha256', 'transactionIds'];
  if (Object.keys(journal).length !== expectedKeys.length || expectedKeys.some((key) => !Object.hasOwn(journal, key)) ||
      journal.version !== 1 || journal.networkId !== 'preview' ||
      !['prepared', 'submitting', 'broadcast', 'complete'].includes(journal.phase) ||
      Object.keys(config).some((key) => journal[key as keyof VerifierMigrationConfig] !== config[key as keyof VerifierMigrationConfig]) ||
      !HEX32.test(journal.beforeStateSha256) || !HEX32.test(journal.afterStateSha256) ||
      !Array.isArray(journal.transactionIds) || journal.transactionIds.length > 16 ||
      journal.transactionIds.some((id) => typeof id !== 'string' || !/^[0-9a-f]{64,256}$/.test(id)) ||
      (journal.phase === 'prepared' || journal.phase === 'submitting'
        ? journal.transactionIds.length !== 0 : journal.transactionIds.length === 0)) {
    return fail('JOURNAL_INVALID');
  }
  return journal;
}

export interface VerifierMigrationDependencies {
  readonly networkId: string;
  readonly contractAddress: string;
  readonly queryState: () => Promise<ContractState | null>;
  readonly getVerifierKeys: () => Promise<VerifierKeys>;
  readonly getSigningKey: () => Promise<SigningKey | null>;
  readonly assertIdle: () => void;
  readonly readJournal: () => Promise<unknown>;
  readonly writeJournal: (journal: VerifierMigrationJournal) => Promise<void>;
  /** Await the hook, then check signal immediately before the network call. */
  readonly submit: (transaction: UnprovenTransaction, beforeBroadcast: (transactionIds: string[]) => Promise<void>, signal: AbortSignal) => Promise<string>;
  /** Internal test override; production bootstrap uses the fixed two-minute bound. */
  readonly submitTimeoutMs?: number;
  readonly wait?: () => Promise<void>;
}

async function boundedQuery(query: VerifierMigrationDependencies['queryState']): Promise<ContractState> {
  let timeout: NodeJS.Timeout | undefined;
  try {
    const state = await Promise.race([query(), new Promise<never>((_resolve, reject) => {
      timeout = setTimeout(() => reject(new ContractMaintenanceError('CONTRACT_MAINTENANCE_STATE_UNAVAILABLE')), 15_000);
    })]);
    if (!state) return fail('STATE_UNAVAILABLE');
    return state;
  } catch (error) {
    if (error instanceof ContractMaintenanceError) throw error;
    return fail('STATE_UNAVAILABLE');
  } finally { if (timeout) clearTimeout(timeout); }
}

/** Explicit, single-writer bootstrap operation; never called for ordinary startup. */
export async function runVerifierMigration(
  config: VerifierMigrationConfig, dependencies: VerifierMigrationDependencies,
): Promise<'updated' | 'already-current'> {
  validateConfig(config);
  const submitTimeoutMs = dependencies.submitTimeoutMs ?? SUBMISSION_TIMEOUT_MS;
  if (!Number.isSafeInteger(submitTimeoutMs) || submitTimeoutMs <= 0) fail('CONFIG_INVALID');
  if (dependencies.networkId !== 'preview' || dependencies.contractAddress !== config.contractAddress) fail('TARGET_MISMATCH');
  let journal = parseJournal(await dependencies.readJournal(), config);
  const keys = await dependencies.getVerifierKeys();
  const state = await boundedQuery(dependencies.queryState);
  if (inspectState(config, state, keys) === 'current') {
    if (journal) {
      // Once completion was checked and durably recorded, normal proofs may
      // change public data. They must not make the next startup fail forever.
      if (journal.phase === 'prepared' || journal.phase === 'submitting' || (journal.phase === 'broadcast' &&
          verifierSha256(state.serialize()) !== journal.afterStateSha256)) fail('STATE_MISMATCH');
      if (journal.phase !== 'complete') await dependencies.writeJournal({ ...journal, phase: 'complete' });
    }
    return 'already-current';
  }
  // A prior broadcast might still finalize. Seeing the old key is not proof
  // that it failed, so neither a timeout nor a restart permits resubmission.
  if (journal && journal.phase !== 'prepared') fail('UNCERTAIN');
  const requireIdle = () => {
    try { dependencies.assertIdle(); } catch { fail('PENDING_PROOFS'); }
  };
  requireIdle();
  const signingKey = await dependencies.getSigningKey();
  if (!signingKey) return fail('AUTHORITY_UNAVAILABLE');
  const plan = prepareVerifierReplacement(config, dependencies.networkId, dependencies.contractAddress,
    state, keys, signatureVerifyingKey(signingKey));
  if (journal && (journal.beforeStateSha256 !== plan.beforeStateSha256 || journal.afterStateSha256 !== plan.afterStateSha256)) {
    fail('STATE_MISMATCH');
  }
  journal = { version: 1, networkId: 'preview', ...config, phase: 'prepared',
    beforeStateSha256: plan.beforeStateSha256, afterStateSha256: plan.afterStateSha256, transactionIds: [] };
  await dependencies.writeJournal(journal);
  const signed = plan.update.addSignature(0n, signData(signingKey, plan.update.dataToSign));
  const transaction = Transaction.fromParts('preview', undefined, undefined,
    Intent.new(new Date(Date.now() + 10 * 60_000)).addMaintenanceUpdate(signed));
  // SDK proving/balancing can book wallet coins and outlive its caller. Record
  // that work has begun before invoking it, so a crash or timeout cannot look
  // like an untouched preparation that is safe to retry automatically.
  const preparedJournal = journal;
  journal = { ...journal, phase: 'submitting' };
  await dependencies.writeJournal(journal);
  let broadcastAttempted = false;
  let active = true;
  const controller = new AbortController();
  const deadline = Date.now() + submitTimeoutMs;
  const assertActive = () => {
    if (!active || controller.signal.aborted || Date.now() >= deadline) {
      controller.abort(new ContractMaintenanceError('CONTRACT_MAINTENANCE_UNCERTAIN'));
      fail('UNCERTAIN');
    }
  };
  let submissionTimer: NodeJS.Timeout | undefined;
  try {
    const timeout = new Promise<never>((_resolve, reject) => {
      submissionTimer = setTimeout(() => {
        active = false;
        const error = new ContractMaintenanceError('CONTRACT_MAINTENANCE_UNCERTAIN');
        controller.abort(error);
        reject(error);
      }, submitTimeoutMs);
    });
    const submission = Promise.resolve().then(() => dependencies.submit(transaction, async (transactionIds) => {
      assertActive();
      if (broadcastAttempted) return fail('UNCERTAIN');
      requireIdle();
      const current = await boundedQuery(dependencies.queryState);
      assertActive();
      if (verifierSha256(current.serialize()) !== plan.beforeStateSha256) fail('STATE_MISMATCH');
      const next = { ...journal!, phase: 'broadcast' as const, transactionIds: [...transactionIds] };
      parseJournal(next, config);
      // This durable record precedes the actual balanced/signed broadcast.
      await dependencies.writeJournal(next);
      journal = next;
      assertActive();
      broadcastAttempted = true;
    }, controller.signal));
    // A timeout bounds our wait; it does not pretend that a non-cancellable
    // SDK operation stopped. The lifetime guard blocks any later broadcast.
    await Promise.race([submission, timeout]);
    assertActive();
    if (!broadcastAttempted) return fail('PREPARATION_FAILED');
  } catch (error) {
    if (broadcastAttempted || controller.signal.aborted) return fail('UNCERTAIN');
    // Only a settled pre-broadcast failure can restore retryable preparation.
    // Timed-out SDK work keeps its durable non-retryable journal instead.
    active = false;
    controller.abort(new ContractMaintenanceError('CONTRACT_MAINTENANCE_UNCERTAIN'));
    await dependencies.writeJournal(preparedJournal);
    if (error instanceof ContractMaintenanceError) throw error;
    return fail('PREPARATION_FAILED');
  } finally {
    active = false;
    if (submissionTimer) clearTimeout(submissionTimer);
    controller.abort(new ContractMaintenanceError('CONTRACT_MAINTENANCE_UNCERTAIN'));
  }
  // Repeated public reads are safe; there is exactly one submission attempt.
  for (let attempt = 0; attempt < 24; attempt += 1) {
    const current = await boundedQuery(dependencies.queryState);
    if (inspectState(config, current, keys) === 'current') {
      if (verifierSha256(current.serialize()) !== plan.afterStateSha256) fail('STATE_MISMATCH');
      await dependencies.writeJournal({ ...journal, phase: 'complete' });
      return 'updated';
    }
    if (attempt < 23) await (dependencies.wait?.() ?? new Promise<void>((resolve) => setTimeout(resolve, 5_000)));
  }
  return fail('UNCERTAIN');
}

export { CIRCUITS as MAINTENANCE_CIRCUITS };
