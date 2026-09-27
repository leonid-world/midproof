import { SYNTHETIC_SUBJECT_ID } from '../../../shared/synthetic-context.mjs';
import http, { type Server } from 'node:http';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createDemoGateway, type AuthorityContext, type RuntimeState, type SessionOwner } from '../hosted-demo/gateway.js';
import { readDemoConfig, DEMO_PROFILES } from '../hosted-demo/config.js';
import { RECEIVABLE_FINANCE_ADDRESS } from '../giwa.js';
import type { ProofBridgeController } from '../proof-bridge/runtime.js';
import type { AuthorizationChallenge } from '../authorization.js';
const requestId = `0x${'1'.repeat(64)}`; const sessionId = `0x${'2'.repeat(64)}`; const contractAddress = '3'.repeat(64); const wallet = `0x${'4'.repeat(40)}`;
const context: AuthorityContext = { requestId, actorId: '1', companyId: '9', subjectWallet: wallet, requestStatus: 'REQUESTED', onchainReceivableId: '7', subjectRole: 'SELLER', networkId: 'preview', midnightContractAddress: contractAddress, giwaChainId: '91342', receivableFinanceAddress: RECEIVABLE_FINANCE_ADDRESS, policyRequest: { requestId, intendedFunderWallet: `0x${'5'.repeat(40)}`, minAnnualRevenueKrw: '500000000', maxDebtRatioBps: '20000', maxOverdueCount: '1', validUntil: '4000000000' } };
const challenge = { version: 2, message: { partyWallet: wallet } } as AuthorizationChallenge;
const complete = { version: 2 as const, sessionId, status: 'complete' as const, proofCapability: { version: 2 as const, evaluationVersion: 2 as const, midnightContractAddress: contractAddress, companyCommitment: `0x${'a'.repeat(64)}`, lookupKey: `0x${'b'.repeat(64)}`, giwaChainId: '91342', receivableFinanceAddress: RECEIVABLE_FINANCE_ADDRESS, onchainReceivableId: '7', subjectRole: 'SELLER' as const, partyWallet: wallet, ...context.policyRequest, policyRequestHash: `0x${'c'.repeat(64)}`, profileAsOf: '1000' } };
const authorization = { version: 2, authorizationId: `0x${'6'.repeat(64)}`, typedDataHash: `0x${'7'.repeat(64)}`, signer: wallet, signature: `0x${'8'.repeat(130)}` };
const servers: Server[] = [];
afterEach(async () => { await Promise.all(servers.splice(0).map((s) => new Promise<void>((resolve) => { s.closeAllConnections(); s.close(() => resolve()); }))); });
async function setup(readHealthy = () => true) {
  const state: RuntimeState = { status: 'ready', contractAddress };
  const controller: ProofBridgeController = {
    createChallenge: vi.fn(async () => ({ version: 2 as const, sessionId, expiresAt: '4000000000', authorizationRequest: challenge })),
    startProof: vi.fn(async () => ({ version: 2 as const, sessionId, status: 'attesting' as const })), getStatus: vi.fn(() => complete), cancel: vi.fn(async () => ({ version: 2 as const, sessionId, status: 'cancelled' as const })), recover: vi.fn(() => complete), acknowledge: vi.fn(async () => ({ version: 2 as const, sessionId, status: 'acknowledged' as const })),
  };
  const config = readDemoConfig({ MIDNIGHT_DEMO_MODE: 'hosted-demo', MIDNIGHT_DEMO_INTERNAL_TOKEN: 'x'.repeat(48) });
  const owners = new Map<string, SessionOwner>(); const authorize = vi.fn(async () => structuredClone(context)); const saveOwners = vi.fn(async () => undefined);
  const read = http.createServer((_req, res) => { res.writeHead(200); res.end('{}'); });
  const server = createDemoGateway({ config, state, owners, controller: () => controller, readServer: () => read, saveOwners, authorize, readHealthy, checkDependencies: async () => true }); servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve)); const addr = server.address(); if (!addr || typeof addr === 'string') throw new Error('No address'); const origin = `http://127.0.0.1:${addr.port}`;
  const post = (op: string, body: unknown, headers: Record<string, string> = {}) => fetch(`${origin}/midnight-proof/v2/proof-sessions/${op}`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer test-token', ...headers }, body: JSON.stringify(body) });
  return { origin, post, state, controller, config, owners, authorize, saveOwners };
}
describe('hosted synthetic proof gateway', () => {
  it('advertises custom-criteria protocol support independently of runtime readiness and demo activation', async () => {
    const x = await setup();
    for (const status of ['starting', 'ready'] as const) {
      x.state.status = status;
      const config = await fetch(x.origin + '/v2/demo/config').then((response) => response.json());
      expect(config).toMatchObject({ walletlessDemo: { enabled: false, customCriteriaEnabled: true }, runtime: { status } });
    }
    expect(x.controller.startProof).not.toHaveBeenCalled();
  });
  it('reports degraded result readiness without blocking recovery or restarting the wallet', async () => {
    let healthy = false;
    const x = await setup(() => healthy);
    const ready = await fetch(x.origin + '/ready');
    expect(ready.status).toBe(503);
    expect(await ready.json()).toMatchObject({ proofReady: false, code: 'READ_API_UNAVAILABLE' });
    expect((await fetch(x.origin + '/health')).status).toBe(200);
    const config = await fetch(x.origin + '/v2/demo/config').then((r) => r.json());
    expect(config).toMatchObject({ runtime: { status: 'ready', code: 'READ_API_UNAVAILABLE' } });
    expect((await fetch(x.origin + '/v2/eligibility-results/resolve', { method: 'POST', headers: { 'X-Midnight-Internal-Token': x.config.internalToken } })).status).toBe(200);
    healthy = true;
    expect((await fetch(x.origin + '/ready')).status).toBe(200);
    expect(x.controller.startProof).not.toHaveBeenCalled();
    expect(x.state.status).toBe('ready');
  });
  it('proxies the Spring proof-request mailbox and delivery routes without leaking internal credentials', async () => {
    const x = await setup();
    const seen: Array<{ path: string; credential: string | string[] | undefined }> = [];
    const backend = http.createServer((req, res) => {
      seen.push({ path: req.url!, credential: req.headers['x-midnight-internal-token'] });
      req.resume(); res.writeHead(200, { 'Content-Type': 'application/json' }); res.end('{}');
    });
    servers.push(backend);
    await new Promise<void>((resolve) => backend.listen(0, '127.0.0.1', resolve));
    const addr = backend.address(); if (!addr || typeof addr === 'string') throw new Error('No backend address');
    x.config.authorityUrl = `http://127.0.0.1:${addr.port}`;
    const paths = ['/midnight-proof-requests?scope=assigned', `/midnight-proof-requests/${requestId}`, `/midnight-proof-requests/${requestId}/complete`, `/midnight-proof-requests/${requestId}/resolve`, `/midnight-proof-requests/${requestId}/deny`];
    for (const path of paths) {
      const response = await fetch(x.origin + path, { method: path.endsWith('complete') || path.endsWith('resolve') || path.endsWith('deny') ? 'POST' : 'GET', headers: { Authorization: 'Bearer user-token', 'X-Midnight-Internal-Token': 'attacker-supplied-token' } });
      expect(response.status).toBe(200);
    }
    expect(seen.map((item) => item.path)).toEqual(paths);
    expect(seen.every((item) => item.credential === undefined)).toBe(true);
  });
  it('takes only fixture selection and derives the authoritative role and policy', async () => {
    const x = await setup(); const response = await x.post('challenge', { version: 2, requestId, profileId: 'steady' });
    expect(response.status).toBe(201); expect(x.authorize).toHaveBeenCalledWith('Bearer test-token', requestId, 'challenge');
    expect(x.controller.createChallenge).toHaveBeenCalledWith(expect.objectContaining({ onchainReceivableId: 7n, subjectRole: 'SELLER', annualRevenueKrw: DEMO_PROFILES[0].annualRevenueKrw })); expect(x.owners.get(sessionId)?.actorId).toBe('1'); expect(x.saveOwners).toHaveBeenCalledOnce();
  });
  it.each(['annualRevenueKrw', 'debtRatioBps', 'overdueCount', 'policyRequest', 'subjectRole', 'onchainReceivableId'])('rejects override %s before any authority/proof call', async (field) => {
    const x = await setup(); expect((await x.post('challenge', { version: 2, requestId, profileId: 'steady', [field]: '123' })).status).toBe(400); expect(x.authorize).not.toHaveBeenCalled(); expect(x.controller.createChallenge).not.toHaveBeenCalled();
  });
  it('requires JWT and an approved browser origin', async () => {
    const x = await setup(); expect((await x.post('challenge', { version: 2, requestId, profileId: 'steady' }, { Authorization: '' })).status).toBe(401); expect((await x.post('challenge', { version: 2, requestId, profileId: 'steady' }, { Origin: 'https://attacker.example' })).status).toBe(403); expect(x.authorize).not.toHaveBeenCalled();
  });
  it('rejects historical undeployed requests', async () => { const x = await setup(); x.authorize.mockResolvedValue({ ...context, networkId: 'undeployed' }); expect((await x.post('challenge', { version: 2, requestId, profileId: 'steady' })).status).toBe(409); expect(x.controller.createChallenge).not.toHaveBeenCalled(); });
  it.each(['prove', 'status', 'cancel', 'recover', 'ack'])('binds %s to the original actor, including another user in the same company', async (op) => {
    const x = await setup(); await x.post('challenge', { version: 2, requestId, profileId: 'steady' }); x.authorize.mockResolvedValue({ ...context, actorId: '2', requestStatus: op === 'ack' ? 'SUBMITTED' : 'REQUESTED' });
    const body = op === 'recover' ? { version: 2, requestId } : op === 'prove' ? { version: 2, requestId, sessionId, authorization } : { version: 2, requestId, sessionId };
    expect((await x.post(op, body)).status).toBe(403); expect(x.controller.startProof).not.toHaveBeenCalled(); expect(x.controller.acknowledge).not.toHaveBeenCalled();
  });
  it('requires durable Spring delivery before ACK and preserves idempotence', async () => {
    const x = await setup(); await x.post('challenge', { version: 2, requestId, profileId: 'steady' }); expect((await x.post('ack', { version: 2, requestId, sessionId })).status).toBe(403); x.authorize.mockResolvedValue({ ...context, requestStatus: 'SUBMITTED' }); expect((await x.post('ack', { version: 2, requestId, sessionId })).status).toBe(200); expect((await x.post('ack', { version: 2, requestId, sessionId })).status).toBe(200);
  });
  it('checks recovered capability against current request context', async () => {
    const x = await setup(); await x.post('challenge', { version: 2, requestId, profileId: 'steady' }); expect((await x.post('recover', { version: 2, requestId })).status).toBe(200); x.authorize.mockResolvedValue({ ...context, subjectRole: 'BUYER' }); expect((await x.post('recover', { version: 2, requestId })).status).toBe(403);
  });
  it('blocks private routes and requires internal token for reads', async () => {
    const x = await setup(); for (const route of ['/internal/midnight/authorize', '/attest', '/authorization-challenges', '/provider-info', '/v2/eligibility-results/resolve']) expect((await fetch(x.origin + route, { method: 'POST' })).status).toBe(403); expect((await fetch(x.origin + '/v2/eligibility-results/resolve', { method: 'POST', headers: { 'X-Midnight-Internal-Token': x.config.internalToken } })).status).toBe(200);
  });
  it('exposes metadata without raw facts and reports funding pending', async () => {
    const x = await setup(); x.state.status = 'funding_required'; x.state.code = 'AWAITING_TEST_FUNDS'; expect((await fetch(x.origin + '/health')).status).toBe(200); expect((await fetch(x.origin + '/ready')).status).toBe(503); const response = await fetch(x.origin + '/midnight-proof/v2/demo/config'); const body = await response.json() as { networkId: string; contractAddress: string; profiles: unknown[] }; expect(response.status).toBe(200); expect(body.networkId).toBe('preview'); expect(body.contractAddress).toBe(contractAddress); expect(body.profiles[0]).not.toHaveProperty('annualRevenueKrw'); expect((await x.post('challenge', { version: 2, requestId, profileId: 'steady' })).status).toBe(503); expect(x.authorize).not.toHaveBeenCalled();
  });
});

it('rejects the reserved synthetic context on every ordinary hosted proof operation', async () => {
  const x = await setup(); x.authorize.mockResolvedValue({...context,onchainReceivableId:SYNTHETIC_SUBJECT_ID});
  for(const operation of ['challenge','prove','status','cancel','recover','ack']) {
    const body=operation==='challenge'?{version:2,requestId,profileId:'steady'}:operation==='recover'?{version:2,requestId}:operation==='prove'?{version:2,requestId,sessionId,authorization}:{version:2,requestId,sessionId};
    expect((await x.post(operation,body)).status).toBe(403);
  }
  expect(x.controller.createChallenge).not.toHaveBeenCalled();expect(x.controller.startProof).not.toHaveBeenCalled();expect(x.controller.recover).not.toHaveBeenCalled();
});
