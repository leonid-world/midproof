import { randomBytes } from 'node:crypto';
import type { ProofCapability } from '../api.js';
import type { ProofBridgeController } from '../proof-bridge/runtime.js';
import { ProofBridgeHttpError, parseChallengeRequest } from '../proof-bridge/server.js';
import type { SubjectRole } from '../giwa.js';
import { DEMO_PROFILES, type DemoNetwork } from './config.js';
import type { DemoFixture } from './demo-fixture.js';

export interface DemoActor { actorId: string; userId: string; sessionId: string; expiresAt: number; demo: true }
export interface DemoResult { eligible: boolean; providerId: number; evaluationVersion: 2; profileAsOf: string; validUntil: string }
export type DemoRunStatus = 'preparing' | 'proving' | 'submitted' | 'completed' | 'failed' | 'uncertain' | 'expired';
export interface DemoRun {
  version: 2; runId: string; requestId: string; clientRequestId: string; actorId: string; ownerSessionId: string;
  createdAt: number; profileId: string; subjectRole: SubjectRole; status: DemoRunStatus;
  networkId: DemoNetwork; midnightContractAddress: string; giwaChainId: string; receivableFinanceAddress: string;
  onchainReceivableId: string; partyWallet: string; intendedFunderWallet: string;
  minAnnualRevenueKrw: string; maxDebtRatioBps: string; maxOverdueCount: string; validUntil: string;
  proofSessionId?: string; capability?: ProofCapability; result?: DemoResult; acknowledged?: boolean;
  transactionId?: string; blockHeight?: string; error?: { code: string; message: string };
}
export interface DemoRunOptions {
  fixture: DemoFixture;
  contractAddress(): string | undefined;
  controller(): ProofBridgeController | undefined;
  resolve(capability: ProofCapability): Promise<DemoResult>;
  transaction?(requestId: string): { transactionId: string; blockHeight: string } | undefined;
  records?: DemoRun[];
  save(records: DemoRun[]): Promise<void>;
  now?: () => number;
}
export const DEMO_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const RUN_ID = /^0x[0-9a-f]{64}$/;
const denied = () => new ProofBridgeHttpError(403, 'ACCESS_DENIED', 'This demo run belongs to another sign-in session.');
const invalid = () => new ProofBridgeHttpError(400, 'INVALID_REQUEST', 'The demo request is invalid.');
const unavailable = () => new ProofBridgeHttpError(503, 'MIDNIGHT_DEMO_NOT_READY', 'The synthetic demo is still preparing.');
const notFound = () => new ProofBridgeHttpError(404, 'DEMO_RUN_NOT_FOUND', 'No demo run was found for this sign-in session.');
const busy = () => new ProofBridgeHttpError(409, 'PROOF_SESSION_BUSY', 'Another proof is running. Please wait for its result.');
const uncertain = { code: 'DEMO_PROOF_OUTCOME_UNCERTAIN', message: 'The submission outcome is not yet known. Recover this run without starting another proof.' };
export function validateDemoActor(value: unknown, now = Date.now()): DemoActor {
  const actor = value as DemoActor;
  if (!actor || actor.demo !== true || !/^[1-9][0-9]*$/.test(actor.actorId) || actor.actorId !== actor.userId
      || !DEMO_UUID.test(actor.sessionId) || !Number.isSafeInteger(actor.expiresAt) || actor.expiresAt <= Math.floor(now / 1000)) throw denied();
  return actor;
}
export function publicDemoRun(run: DemoRun) {
  // Whitelist: the encrypted capability, session identity, secrets and witness never leave this service.
  return { version: 2, runId: run.runId, requestId: run.requestId, clientRequestId: run.clientRequestId,
    profileId: run.profileId, subjectRole: run.subjectRole, status: run.status, networkId: run.networkId,
    midnightContractAddress: run.midnightContractAddress, giwaChainId: run.giwaChainId,
    receivableFinanceAddress: run.receivableFinanceAddress, onchainReceivableId: run.onchainReceivableId,
    partyWallet: run.partyWallet, intendedFunderWallet: run.intendedFunderWallet,
    minAnnualRevenueKrw: run.minAnnualRevenueKrw, maxDebtRatioBps: run.maxDebtRatioBps, maxOverdueCount: run.maxOverdueCount,
    validUntil: run.validUntil, ...(run.result ? { result: run.result } : {}), ...(run.error ? { error: run.error } : {}),
    ...(run.transactionId ? { transactionId: run.transactionId, blockHeight: run.blockHeight } : {}) };
}
export class DemoRuns {
  readonly #options: DemoRunOptions;
  readonly #records = new Map<string, DemoRun>();
  readonly #launching = new Map<string, Promise<void>>();
  readonly #refreshing = new Map<string, Promise<void>>();
  #writes: Promise<void> = Promise.resolve();
  #starts: Promise<unknown> = Promise.resolve();
  constructor(options: DemoRunOptions) {
    this.#options = options;
    for (const run of options.records ?? []) {
      if (!RUN_ID.test(run.runId) || run.requestId !== run.runId || !DEMO_UUID.test(run.clientRequestId)
          || !DEMO_UUID.test(run.ownerSessionId) || !/^[1-9][0-9]*$/.test(run.actorId)
          || !/^[0-9]+$/.test(run.validUntil) || run.networkId !== options.fixture.networkId
          || run.giwaChainId !== options.fixture.giwaChainId || run.receivableFinanceAddress !== options.fixture.receivableFinanceAddress
          || run.onchainReceivableId !== options.fixture.onchainReceivableId
          || run.intendedFunderWallet !== options.fixture.intendedFunderWallet
          || !['SELLER','BUYER'].includes(run.subjectRole) || !DEMO_PROFILES.some((p) => p.id === run.profileId)
          || !['preparing','proving','submitted','completed','failed','uncertain','expired'].includes(run.status)
          || run.partyWallet !== options.fixture.wallets[run.subjectRole]) throw new Error('DEMO_RUN_STORE_INVALID');
      // Never replay an interrupted start or broadcast after process restart.
      if (run.status === 'preparing' || run.status === 'proving') { run.status = 'uncertain'; run.error = uncertain; }
      this.#records.set(run.runId, run);
    }
  }
  #now() { return this.#options.now?.() ?? Date.now(); }
  #save() {
    const snapshot = structuredClone([...this.#records.values()]);
    const write = this.#writes.then(() => this.#options.save(snapshot));
    this.#writes = write.catch(() => undefined);
    return write;
  }
  #own(actor: DemoActor, run: DemoRun) {
    validateDemoActor(actor, this.#now());
    if (run.actorId !== actor.actorId || run.ownerSessionId !== actor.sessionId) throw denied();
  }
  start(actor: DemoActor, input: unknown) {
    const operation = this.#starts.then(() => this.#start(actor, input));
    this.#starts = operation.catch(() => undefined);
    return operation;
  }
  async #start(actor: DemoActor, input: unknown) {
    validateDemoActor(actor, this.#now());
    const body = input as Record<string, unknown>;
    if (!body || Object.keys(body).sort().join() !== ['version','clientRequestId','consent','profileId','subjectRole'].sort().join()
        || body.version !== 2 || body.consent !== true || typeof body.clientRequestId !== 'string' || !DEMO_UUID.test(body.clientRequestId)
        || !DEMO_PROFILES.some((p) => p.id === body.profileId) || !['SELLER','BUYER'].includes(body.subjectRole as string)) throw invalid();
    const previous = [...this.#records.values()].find((run) => run.actorId === actor.actorId
      && run.ownerSessionId === actor.sessionId && run.clientRequestId === body.clientRequestId);
    if (previous) {
      if (previous.profileId !== body.profileId || previous.subjectRole !== body.subjectRole) throw new ProofBridgeHttpError(409, 'DEMO_IDEMPOTENCY_CONFLICT', 'This start identifier already belongs to another scenario.');
      return this.status(actor, previous.runId);
    }
    const address = this.#options.contractAddress();
    if (!address || !/^[0-9a-f]{64}$/.test(address) || !this.#options.controller()) throw unavailable();
    for (const active of this.#records.values()) {
      if (['preparing','proving','uncertain'].includes(active.status) && BigInt(active.validUntil) > BigInt(Math.floor(this.#now() / 1000))) {
        await this.#refresh(active);
        if (['preparing','proving','uncertain'].includes(active.status)) throw busy();
      }
    }
    const now = Math.floor(this.#now() / 1000);
    if (actor.expiresAt - now < 300) throw new ProofBridgeHttpError(401, 'DEMO_LOGIN_EXPIRES_SOON', 'Sign in again before starting a new proof.');
    // Bounded retention without evicting an active/unexpired idempotency key.
    for (const [id, row] of this.#records) if (Number(row.validUntil) + 86400 < now) this.#records.delete(id);
    if (this.#records.size >= 512) throw new ProofBridgeHttpError(429, 'DEMO_CAPACITY_REACHED', 'The demo is at capacity. Please try later.');
    if ([...this.#records.values()].filter((row) => row.createdAt > now - 3600).length >= 32) throw new ProofBridgeHttpError(429, 'DEMO_RATE_LIMITED', 'The demo has reached its hourly proof limit.');
    const recent = [...this.#records.values()].filter((row) => row.ownerSessionId === actor.sessionId && row.createdAt > now - 3600);
    if (recent.length >= 8) throw new ProofBridgeHttpError(429, 'DEMO_RATE_LIMITED', 'This demo session has reached its proof limit.');
    const f = this.#options.fixture; const runId = `0x${randomBytes(32).toString('hex')}`;
    const run: DemoRun = { version: 2, runId, requestId: runId, actorId: actor.actorId, ownerSessionId: actor.sessionId,
      clientRequestId: body.clientRequestId, createdAt: now, profileId: body.profileId as string, subjectRole: body.subjectRole as SubjectRole,
      status: 'preparing', networkId: f.networkId, midnightContractAddress: address, giwaChainId: f.giwaChainId,
      receivableFinanceAddress: f.receivableFinanceAddress, onchainReceivableId: f.onchainReceivableId,
      partyWallet: f.wallets[body.subjectRole as SubjectRole], intendedFunderWallet: f.intendedFunderWallet,
      minAnnualRevenueKrw: '500000000', maxDebtRatioBps: '20000', maxOverdueCount: '1', validUntil: String(Math.min(now + 3600, actor.expiresAt)) };
    this.#records.set(runId, run);
    try { await this.#save(); } catch { this.#records.delete(runId); throw unavailable(); }
    const job = this.#launch(run).finally(() => this.#launching.delete(runId));
    this.#launching.set(runId, job);
    return publicDemoRun(run);
  }
  async #launch(run: DemoRun) {
    let started = false;
    try {
      const controller = this.#options.controller(); if (!controller) throw unavailable();
      const profile = DEMO_PROFILES.find((p) => p.id === run.profileId)!;
      const policyRequest = { requestId: run.requestId, intendedFunderWallet: run.intendedFunderWallet,
        minAnnualRevenueKrw: run.minAnnualRevenueKrw, maxDebtRatioBps: run.maxDebtRatioBps,
        maxOverdueCount: run.maxOverdueCount, validUntil: run.validUntil };
      const challenge = await controller.createChallenge(parseChallengeRequest({ version: 2,
        onchainReceivableId: run.onchainReceivableId, subjectRole: run.subjectRole, policyRequest,
        annualRevenueKrw: profile.annualRevenueKrw.toString(), debtRatioBps: profile.debtRatioBps.toString(), overdueCount: profile.overdueCount.toString() }));
      run.proofSessionId = challenge.sessionId;
      await this.#save();
      const authorization = await this.#options.fixture.sign(challenge.authorizationRequest,
        { ...policyRequest, midnightContractAddress: run.midnightContractAddress, subjectRole: run.subjectRole });
      // The durable intent precedes startProof. A failed response never triggers a second call.
      run.status = 'proving'; await this.#save(); started = true;
      await controller.startProof(challenge.sessionId, authorization);
    } catch (error) {
      if (!started && run.proofSessionId) await this.#options.controller()?.cancel(run.proofSessionId).catch(() => undefined);
      run.status = started ? 'uncertain' : 'failed';
      const candidate = (error as {code?: string})?.code ?? (error as Error)?.message;
      const code = ['DEMO_SIGNING_CONTEXT_REJECTED','ROLE_WALLET_MISMATCH','GIWA_RECEIVABLE_NOT_FOUND','GIWA_RPC_UNAVAILABLE','MIDNIGHT_DEMO_NOT_READY'].includes(candidate ?? '') ? candidate! : 'DEMO_PROOF_START_FAILED';
      run.error = started ? uncertain : { code, message: 'The demo could not prepare this proof. Check service readiness before starting a new run.' };
      await this.#save().catch(() => undefined);
    }
  }
  async status(actor: DemoActor, runId: string) {
    if (!RUN_ID.test(runId)) throw invalid();
    const run = this.#records.get(runId); if (!run) throw notFound();
    this.#own(actor, run); await this.#refresh(run); this.#own(actor, run);
    return publicDemoRun(run);
  }
  async recover(actor: DemoActor, clientRequestId?: string) {
    validateDemoActor(actor, this.#now());
    if (clientRequestId !== undefined && !DEMO_UUID.test(clientRequestId)) throw invalid();
    const run = [...this.#records.values()].reverse().find((row) => row.actorId === actor.actorId && row.ownerSessionId === actor.sessionId
      && (clientRequestId === undefined || row.clientRequestId === clientRequestId));
    if (!run) throw notFound();
    return this.status(actor, run.runId);
  }
  #refresh(run: DemoRun): Promise<void> {
    const pending = this.#refreshing.get(run.runId); if (pending) return pending;
    const job = this.#refreshRun(run).finally(() => this.#refreshing.delete(run.runId));
    this.#refreshing.set(run.runId, job); return job;
  }
  async #refreshRun(run: DemoRun) {
    if (BigInt(run.validUntil) <= BigInt(Math.floor(this.#now() / 1000))) {
      run.status = 'expired'; delete run.capability; delete run.result; delete run.error; await this.#save(); return;
    }
    if (this.#launching.has(run.runId) || ['failed','expired'].includes(run.status)) return;
    const controller = this.#options.controller(); if (!controller) throw unavailable();
    if (!run.capability) {
      try {
        let response = run.proofSessionId ? controller.getStatus(run.proofSessionId) : controller.recover(run.requestId);
        if (response.status === 'failed') {
          try { response = controller.recover(run.requestId); }
          catch (error) {
            if ((error as { code?: string })?.code !== 'PROOF_RESULT_NOT_FOUND') {
              run.status = 'uncertain'; run.error = uncertain; await this.#save(); return;
            }
            // A released pre-submit reservation is a definite failure. A retained
            // proving reservation stays uncertain and cannot be bypassed by a new run.
          }
        }
        if (response.status === 'complete') {
          const cap = response.proofCapability;
          const pairs: Array<keyof ProofCapability & keyof DemoRun> = ['requestId','midnightContractAddress','giwaChainId','receivableFinanceAddress',
            'onchainReceivableId','subjectRole','partyWallet','intendedFunderWallet','minAnnualRevenueKrw','maxDebtRatioBps','maxOverdueCount','validUntil'];
          if (pairs.some((key) => cap[key] !== run[key])) throw new Error('DEMO_CAPABILITY_MISMATCH');
          run.capability = cap; run.proofSessionId = response.sessionId; run.status = 'submitted'; delete run.error;
          Object.assign(run, this.#options.transaction?.(run.requestId) ?? {});
          // This encrypted run store replaces Spring custody only for this isolated demo route.
          await this.#save();
        } else if (response.status === 'failed' || response.status === 'expired' || response.status === 'cancelled') {
          run.status = response.status === 'expired' ? 'expired' : 'failed';
          run.error = { code: 'DEMO_PROOF_FAILED', message: 'This proof did not complete. No eligibility result was recorded by the demo.' };
          await this.#save(); return;
        } else { run.status = 'proving'; return; }
      } catch (error) {
        if (!run.proofSessionId && (error as {code?: string})?.code === 'PROOF_RESULT_NOT_FOUND') {
          // The session ID is fsynced before authorization/startProof. With neither
          // that ID nor an outbox reservation, this interrupted start never submitted.
          run.status = 'failed';
          run.error = { code: 'DEMO_START_INTERRUPTED', message: 'This run stopped before proof submission. You may start a new run.' };
        } else { run.status = 'uncertain'; run.error = uncertain; }
        await this.#save(); return;
      }
    }
    if (!run.acknowledged && run.proofSessionId) {
      // A save failure above returns before ACK, preserving outbox recovery.
      await this.#save();
      try { await controller.acknowledge(run.proofSessionId, run.requestId); run.acknowledged = true; await this.#save(); }
      catch { /* Keep the durable capability and retry the idempotent ACK next time. */ }
    }
    try {
      const result = await this.#options.resolve(run.capability!);
      if (BigInt(run.validUntil) <= BigInt(Math.floor(this.#now() / 1000))) {
        run.status = 'expired'; delete run.capability; delete run.result; delete run.error;
      } else {
        if (result.providerId !== 2 || result.evaluationVersion !== 2 || result.validUntil !== run.validUntil
            || result.profileAsOf !== run.capability!.profileAsOf || typeof result.eligible !== 'boolean') throw Object.assign(new Error('DEMO_RESULT_MISMATCH'), { code: 'CAPABILITY_RESULT_MISMATCH' });
        run.result = result; run.status = 'completed'; delete run.error;
      }
      await this.#save();
    } catch (error) {
      delete run.result;
      const code = (error as { code?: string })?.code;
      if (BigInt(run.validUntil) <= BigInt(Math.floor(this.#now() / 1000)) || code === 'PROOF_RESULT_EXPIRED') {
        run.status = 'expired'; delete run.capability; delete run.error;
      } else if (['INVALID_PROOF_CAPABILITY','UNAPPROVED_GIWA_CONTEXT','UNAPPROVED_CONTRACT_ADDRESS','CAPABILITY_LOOKUP_MISMATCH','UNAPPROVED_ATTESTATION_PROVIDER','CAPABILITY_RESULT_MISMATCH'].includes(code ?? '')) {
        run.status = 'failed'; delete run.capability;
        run.error = { code: 'DEMO_RESULT_INVALID', message: 'The public proof result did not match this demo request.' };
      } else {
        run.status = 'submitted'; delete run.error;
      }
      // Indexer visibility is retried only by reads, never by a second proof.
      await this.#save();
    }
  }
  async flush() { await Promise.allSettled([...this.#launching.values(), ...this.#refreshing.values()]); await this.#writes; }
}
