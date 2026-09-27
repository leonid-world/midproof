import http, { type Server } from 'node:http';
import * as fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AUTHORIZATION_DOMAIN, AUTHORIZATION_FIELDS, type AuthorizationChallenge, type AuthorizationProof } from '../authorization.js';
import type { ProofCapability } from '../api.js';
import { GIWA_CHAIN_ID, RECEIVABLE_FINANCE_ADDRESS } from '../giwa.js';
import { readDemoConfig } from '../hosted-demo/config.js';
import { createDemoGateway, type AuthorityContext, type SessionOwner } from '../hosted-demo/gateway.js';
import { createOwnerPersistence } from '../hosted-demo/owners.js';
import { readEncryptedJson, writeEncryptedJson } from '../hosted-demo/state.js';
import { openCapabilityOutbox } from '../proof-bridge/capability-outbox.js';
import { ProofBridgeRuntime, type ProofBridgeOperations } from '../proof-bridge/runtime.js';
import { ProofSessionStore } from '../proof-bridge/session-store.js';
import type { ProofChallengeResponse, ProofSessionResponse } from '../proof-bridge/types.js';

const REQUEST_ID = `0x${'1'.repeat(64)}`;
const CONTRACT = '2'.repeat(64);
const PARTY = `0x${'3'.repeat(40)}`;
const PASSWORD = 'Synthetic-Recovery-Fixture-Password!2026';
const INTERNAL_TOKEN = 'synthetic-recovery-internal-token-32-characters';
const cleanup: Array<() => Promise<void>> = [];

afterEach(async () => {
  for (const close of cleanup.splice(0).reverse()) await close();
  vi.restoreAllMocks();
});

async function listen(server: Server): Promise<string> {
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  if (address === null || typeof address === 'string') throw new Error('Fixture address unavailable');
  return `http://127.0.0.1:${address.port}`;
}

async function closeServer(server: Server): Promise<void> {
  server.closeAllConnections();
  await new Promise<void>((resolve) => server.close(() => resolve()));
}

function gate() {
  let release!: () => void;
  const wait = new Promise<void>((resolve) => { release = resolve; });
  return { wait, release };
}

async function fixture(options: { holdPersistence?: boolean; failAfterProving?: boolean; failOwnerWriteOnce?: boolean } = {}) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'gasok-hosted-recovery-'));
  cleanup.push(() => fs.rm(directory, { recursive: true, force: true }));
  const ownerFile = path.join(directory, 'session-owners.enc');
  const outboxFile = path.join(directory, 'capability-outbox', 'outbox.enc');
  let now = Date.now();
  const issuedAt = Math.floor(now / 1000).toString();
  const expiresAt = (Math.floor(now / 1000) + 120).toString();
  const context: AuthorityContext = {
    requestId: REQUEST_ID, actorId: '21', companyId: '9', subjectWallet: PARTY,
    requestStatus: 'REQUESTED', onchainReceivableId: '7', subjectRole: 'SELLER',
    networkId: 'preview', midnightContractAddress: CONTRACT,
    giwaChainId: GIWA_CHAIN_ID.toString(), receivableFinanceAddress: RECEIVABLE_FINANCE_ADDRESS,
    policyRequest: {
      requestId: REQUEST_ID, intendedFunderWallet: `0x${'4'.repeat(40)}`,
      minAnnualRevenueKrw: '500000000', maxDebtRatioBps: '20000', maxOverdueCount: '1',
      validUntil: (Math.floor(now / 1000) + 3600).toString(),
    },
  };
  const capability: ProofCapability = {
    version: 2, evaluationVersion: 2, midnightContractAddress: CONTRACT,
    companyCommitment: `0x${'5'.repeat(64)}`, lookupKey: `0x${'6'.repeat(64)}`,
    giwaChainId: context.giwaChainId, receivableFinanceAddress: RECEIVABLE_FINANCE_ADDRESS,
    onchainReceivableId: context.onchainReceivableId, subjectRole: context.subjectRole,
    partyWallet: PARTY, ...context.policyRequest, policyRequestHash: `0x${'7'.repeat(64)}`, profileAsOf: issuedAt,
  };
  const { validUntil: policyValidUntil, ...policyMessage } = context.policyRequest;
  const authorizationRequest: AuthorizationChallenge = {
    version: 2,
    domain: AUTHORIZATION_DOMAIN,
    primaryType: 'GASOKRoleAttestationAuthorization', types: { GASOKRoleAttestationAuthorization: AUTHORIZATION_FIELDS },
    message: {
      purpose: 'Authorize GASOK local mock financial attestation for a Funder policy request',
      authorizationId: `0x${'8'.repeat(64)}`, midnightContractAddress: `0x${CONTRACT}`,
      receivableFinanceAddress: RECEIVABLE_FINANCE_ADDRESS, onchainReceivableId: context.onchainReceivableId,
      subjectRole: context.subjectRole, partyWallet: PARTY, ...policyMessage,
      attestationRequestCommitment: `0x${'9'.repeat(64)}`, providerId: '2', evaluationVersion: '2',
      profileAsOf: issuedAt, policyValidUntil, issuedAt, expiresAt,
    },
  };
  const authorization: AuthorizationProof = {
    version: 2, authorizationId: authorizationRequest.message.authorizationId,
    typedDataHash: `0x${'a'.repeat(64)}`, signer: PARTY, signature: `0x${'b'.repeat(130)}`,
  };
  const authorityCalls: string[] = [];
  let deliveredCapability: unknown;
  // This fixture models Spring's authorization/durable delivery response only.
  // The real Java/DB, GIWA authorization, cryptography, wallet and prover are not started.
  const authority = http.createServer((request, response) => { void (async () => {
    const chunks: Buffer[] = [];
    for await (const chunk of request) chunks.push(Buffer.from(chunk));
    const body = JSON.parse(Buffer.concat(chunks).toString('utf8')) as Record<string, unknown>;
    const token = request.headers.authorization;
    const send = (status: number, value: unknown) => {
      response.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
      response.end(JSON.stringify(value));
    };
    if (token !== 'Bearer owner-token' && token !== 'Bearer other-token') { send(401, {}); return; }
    if (request.url === '/internal/midnight/authorize') {
      if (request.headers['x-midnight-internal-token'] !== INTERNAL_TOKEN || body.requestId !== REQUEST_ID) { send(403, {}); return; }
      const operation = String(body.operation);
      authorityCalls.push(operation);
      if ((operation === 'challenge' || operation === 'prove') && context.requestStatus !== 'REQUESTED') { send(409, {}); return; }
      if (operation === 'ack' && !['SUBMITTED', 'COMPLETED'].includes(context.requestStatus)) { send(409, {}); return; }
      send(200, { ...context, actorId: token === 'Bearer owner-token' ? '21' : '22' }); return;
    }
    if (request.url === `/midnight-proof-requests/${REQUEST_ID}/complete` && token === 'Bearer owner-token') {
      deliveredCapability = body.proofCapability;
      if (context.requestStatus === 'REQUESTED') context.requestStatus = 'SUBMITTED';
      send(200, { requestId: REQUEST_ID, status: context.requestStatus }); return;
    }
    send(404, {});
  })().catch(() => { response.writeHead(500); response.end(); }); });
  const authorityUrl = await listen(authority);
  cleanup.push(() => closeServer(authority));
  const persistenceGate = gate();
  if (!options.holdPersistence) persistenceGate.release();
  let ownerWrites = 0;
  const operations: ProofBridgeOperations<Record<string, never>> = {
    prepare: vi.fn(async () => ({ prepared: {}, authorizationRequest })),
    complete: vi.fn(async (_prepared, _authorization, onStage) => {
      await onStage('attesting');
      await onStage('proving_and_submitting');
      if (options.failAfterProving) throw new Error('Injected uncertain submission boundary');
      return capability;
    }),
  };

  async function boot() {
    const savedOwners = await readEncryptedJson<SessionOwner[]>(ownerFile, PASSWORD) ?? [];
    const owners = new Map(savedOwners.map((owner) => [owner.sessionId, owner]));
    const ownership = createOwnerPersistence(owners, async (snapshot) => {
      ownerWrites++;
      if (options.failOwnerWriteOnce && ownerWrites === 1) throw new Error('Injected transient owner write failure');
      await writeEncryptedJson(ownerFile, PASSWORD, snapshot);
    }, () => now);
    const outbox = await openCapabilityOutbox({ filePath: outboxFile, password: PASSWORD, now: () => now });
    const persist = outbox.persist.bind(outbox);
    vi.spyOn(outbox, 'persist').mockImplementation(async (sessionId, value) => {
      await persistenceGate.wait;
      await persist(sessionId, value);
    });
    const runtime = new ProofBridgeRuntime({ outbox, operations, sessions: new ProofSessionStore({ now: () => now }) });
    const config = readDemoConfig({
      MIDNIGHT_DEMO_MODE: 'hosted-demo', MIDNIGHT_NETWORK_ID: 'preview',
      MIDNIGHT_DEMO_STATE_DIR: directory, MIDNIGHT_DEMO_AUTHORITY_URL: authorityUrl,
      MIDNIGHT_DEMO_INTERNAL_TOKEN: INTERNAL_TOKEN,
      MIDNIGHT_NODE_URL: 'http://127.0.0.1:1', MIDNIGHT_INDEXER_URL: 'http://127.0.0.1:1',
      MIDNIGHT_INDEXER_WS_URL: 'ws://127.0.0.1:1', MIDNIGHT_PROOF_SERVER_URL: 'http://127.0.0.1:1',
    });
    const server = createDemoGateway({
      config, state: { status: 'ready', contractAddress: CONTRACT }, owners,
      saveOwners: ownership.save, controller: () => runtime, readServer: () => undefined,
      checkDependencies: async () => true,
    });
    let dropAck = false;
    server.prependListener('request', (request, response) => {
      if (dropAck && request.url?.endsWith('/proof-sessions/ack')) {
        dropAck = false;
        // Destroy only after the real ACK handler has durably completed.
        response.end = (() => { response.destroy(); return response; }) as typeof response.end;
      }
    });
    const url = await listen(server);
    let closed = false;
    const close = async () => {
      if (closed) return;
      closed = true;
      persistenceGate.release();
      await closeServer(server);
      await runtime.shutdown();
      await ownership.flush();
    };
    cleanup.push(close);
    const post = (operation: string, body: unknown, actor = 'owner') => fetch(`${url}/midnight-proof/v2/proof-sessions/${operation}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${actor}-token` },
      body: JSON.stringify(body), signal: AbortSignal.timeout(5000),
    });
    return { runtime, outbox, owners, close, post,
      dropNextAckResponse: () => { dropAck = true; },
      deliver: (value: ProofCapability) => fetch(`${url}/midnight-proof-requests/${REQUEST_ID}/complete`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer owner-token' },
        body: JSON.stringify({ proofCapability: value }), signal: AbortSignal.timeout(5000),
      }),
    };
  }
  return { boot, operations, context, capability, authorization, ownerFile, outboxFile, authorityCalls,
    persistenceGate, ownerWrites: () => ownerWrites,
    delivered: () => deliveredCapability, advancePastAuthorization: () => { now += 121_000; },
  };
}

const challengeBody = { version: 2, requestId: REQUEST_ID, profileId: 'steady' };
const sessionBody = (sessionId: string) => ({ version: 2, requestId: REQUEST_ID, sessionId });
const recoveryBody = { version: 2, requestId: REQUEST_ID };
type RunningFixture = Awaited<ReturnType<Awaited<ReturnType<typeof fixture>>['boot']>>;

async function createChallenge(running: RunningFixture): Promise<ProofChallengeResponse> {
  const response = await running.post('challenge', challengeBody);
  expect(response.status).toBe(201);
  expect(response.headers.get('cache-control')).toBe('no-store');
  return await response.json() as ProofChallengeResponse;
}

async function waitForStatus(running: RunningFixture, sessionId: string, status: ProofSessionResponse['status']) {
  await vi.waitFor(() => expect(running.runtime.getStatus(sessionId).status).toBe(status), { timeout: 3000, interval: 10 });
}

describe('hosted gateway durable recovery integration (no live proof)', () => {
  it.each(['SUBMITTED', 'COMPLETED'])('recovers after restart and ACKs only after durable Spring %s', async (springStatus) => {
    const setup = await fixture({ holdPersistence: true });
    const first = await setup.boot();
    const challenge = await createChallenge(first);
    const body = sessionBody(challenge.sessionId);
    expect((await first.post('prove', { ...body, authorization: setup.authorization })).status).toBe(202);
    await vi.waitFor(() => expect(first.outbox.persist).toHaveBeenCalledTimes(1), { timeout: 3000, interval: 10 });
    expect(first.runtime.getStatus(challenge.sessionId).status).toBe('proving_and_submitting');
    expect((await first.post('recover', recoveryBody)).status).toBe(409);
    expect((await first.post('ack', body)).status).toBe(409);
    setup.persistenceGate.release();
    await waitForStatus(first, challenge.sessionId, 'complete');
    expect(await fs.readFile(setup.outboxFile, 'utf8')).not.toContain(setup.capability.lookupKey);
    await first.close();

    const second = await setup.boot();
    const recovered = await second.post('recover', recoveryBody);
    expect(recovered.status).toBe(200);
    expect(await recovered.json()).toMatchObject({ sessionId: challenge.sessionId, proofCapability: setup.capability });
    expect((await second.post('ack', body)).status).toBe(409);
    const delivery = await second.deliver(setup.capability);
    expect((await delivery.json() as { status: string }).status).toBe('SUBMITTED');
    setup.context.requestStatus = springStatus;
    if (springStatus === 'COMPLETED') expect((await (await second.deliver(setup.capability)).json() as { status: string }).status).toBe('COMPLETED');
    expect((await second.post('ack', body)).status).toBe(200);
    expect(() => second.outbox.recoverByRequest(REQUEST_ID)).toThrow(expect.objectContaining({ code: 'PROOF_RESULT_NOT_FOUND' }));
    expect(setup.delivered()).toEqual(setup.capability);
    expect(setup.operations.complete).toHaveBeenCalledTimes(1);
    expect(setup.authorityCalls).toContain('recover');
    expect(await fs.readFile(setup.outboxFile, 'utf8')).not.toContain(setup.capability.lookupKey);
  });

  it('survives a lost ACK response and retries the persisted ACK after another restart', async () => {
    const setup = await fixture();
    const first = await setup.boot();
    const challenge = await createChallenge(first);
    const body = sessionBody(challenge.sessionId);
    expect((await first.post('prove', { ...body, authorization: setup.authorization })).status).toBe(202);
    await waitForStatus(first, challenge.sessionId, 'complete');
    expect((await first.deliver(setup.capability)).status).toBe(200);
    first.dropNextAckResponse();
    await expect(first.post('ack', body)).rejects.toThrow();
    expect(() => first.outbox.recoverByRequest(REQUEST_ID)).toThrow(expect.objectContaining({ code: 'PROOF_RESULT_NOT_FOUND' }));
    await first.close();

    const second = await setup.boot();
    expect((await second.post('ack', body)).status).toBe(200);
    expect((await second.post('ack', body)).status).toBe(200);
    expect(() => second.outbox.assertRequestAvailable(REQUEST_ID)).toThrow(expect.objectContaining({ code: 'PROOF_RESULT_ALREADY_DELIVERED' }));
    expect((await second.post('challenge', challengeBody)).status).toBe(409);
    expect(setup.operations.prepare).toHaveBeenCalledTimes(1);
    expect(setup.operations.complete).toHaveBeenCalledTimes(1);
  });

  it('restores original actor ownership and rejects another user of the same company', async () => {
    const setup = await fixture();
    const first = await setup.boot();
    const challenge = await createChallenge(first);
    const body = sessionBody(challenge.sessionId);
    expect((await first.post('prove', { ...body, authorization: setup.authorization })).status).toBe(202);
    await waitForStatus(first, challenge.sessionId, 'complete');
    await first.close();
    const second = await setup.boot();
    expect(second.owners.get(challenge.sessionId)?.actorId).toBe('21');
    expect((await second.post('recover', recoveryBody, 'other')).status).toBe(403);
    expect((await second.post('status', body, 'other')).status).toBe(403);
    expect((await second.post('prove', { ...body, authorization: setup.authorization }, 'other')).status).toBe(403);
    expect((await second.deliver(setup.capability)).status).toBe(200);
    expect((await second.post('ack', body, 'other')).status).toBe(403);
    expect((await second.post('ack', body)).status).toBe(200);
    expect(setup.operations.complete).toHaveBeenCalledTimes(1);
  });

  it('keeps an uncertain proving reservation after restart and never automatically proves again', async () => {
    const setup = await fixture({ failAfterProving: true });
    const first = await setup.boot();
    const challenge = await createChallenge(first);
    expect((await first.post('prove', { ...sessionBody(challenge.sessionId), authorization: setup.authorization })).status).toBe(202);
    await waitForStatus(first, challenge.sessionId, 'failed');
    await first.close();
    setup.advancePastAuthorization();
    const second = await setup.boot();
    const recovery = await second.post('recover', recoveryBody);
    expect(recovery.status).toBe(409);
    expect(await recovery.json()).toMatchObject({ error: { code: 'PROOF_RESULT_IN_PROGRESS' } });
    expect((await second.post('challenge', challengeBody)).status).toBe(409);
    expect(setup.operations.prepare).toHaveBeenCalledTimes(1);
    expect(setup.operations.complete).toHaveBeenCalledTimes(1);
  });

  it('cancels an unwritten owner and succeeds when the next encrypted save is healthy', async () => {
    const setup = await fixture({ failOwnerWriteOnce: true });
    const running = await setup.boot();
    expect((await running.post('challenge', challengeBody)).status).toBe(503);
    expect(running.owners.size).toBe(0);
    const challenge = await createChallenge(running);
    expect(setup.ownerWrites()).toBe(2);
    expect(await readEncryptedJson<SessionOwner[]>(setup.ownerFile, PASSWORD)).toEqual([
      { sessionId: challenge.sessionId, requestId: REQUEST_ID, actorId: '21', validUntil: setup.context.policyRequest.validUntil },
    ]);
    expect(await fs.readFile(setup.ownerFile, 'utf8')).not.toContain(REQUEST_ID);
    expect(setup.operations.complete).not.toHaveBeenCalled();
    expect((await running.post('cancel', sessionBody(challenge.sessionId))).status).toBe(200);
  });
});
