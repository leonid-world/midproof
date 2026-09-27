import { isSyntheticSubjectId } from '../../../shared/synthetic-context.mjs';
import { validateDemoActor, type DemoActor, type DemoRuns } from './demo-runs.js';
import http, { type IncomingMessage, type ServerResponse, type Server } from 'node:http';
import { timingSafeEqual } from 'node:crypto';
import { DEMO_PROFILES, type DemoConfig } from './config.js';
import { GIWA_CHAIN_ID, RECEIVABLE_FINANCE_ADDRESS } from '../giwa.js';
import type { ProofBridgeController } from '../proof-bridge/runtime.js';
import { mapError, parseChallengeRequest, parseProofSubmissionRequest, parseSessionRequest, parseRecoveryRequest, parseAcknowledgementRequest, ProofBridgeHttpError, readJsonBody } from '../proof-bridge/server.js';
import type { ProofCapability } from '../api.js';

export interface AuthorityContext {
  requestId: string; actorId: string; companyId: string; subjectWallet: string;
  requestStatus: string; onchainReceivableId: string; subjectRole: 'SELLER' | 'BUYER';
  networkId: string; midnightContractAddress: string; giwaChainId: string; receivableFinanceAddress: string;
  policyRequest: { requestId: string; intendedFunderWallet: string; minAnnualRevenueKrw: string; maxDebtRatioBps: string; maxOverdueCount: string; validUntil: string };
}
export interface SessionOwner { sessionId: string; requestId: string; actorId: string; validUntil: string }
export interface RuntimeState {
  status: 'starting' | 'syncing' | 'funding_required' | 'registering_dust' | 'deploying' | 'registering_provider' | 'ready' | 'failed';
  code?: string; contractAddress?: string; walletAddress?: string; faucetUrl?: string;
  sync?: Record<string, { connected: boolean; ready: boolean; applied: string; tip: string }>;
}
export interface GatewayOptions {
  config: DemoConfig;
  state: RuntimeState;
  controller: () => ProofBridgeController | undefined;
  readServer: () => Server | undefined;
  readHealthy?: () => boolean;
  owners: Map<string, SessionOwner>;
  saveOwners: () => Promise<void>;
  authorize?: (token: string, requestId: string, operation: string) => Promise<AuthorityContext>;
  checkDependencies?: () => Promise<boolean>;
  demoRuns?: DemoRuns;
  demoFixture?: { giwaChainId: string; receivableFinanceAddress: string; onchainReceivableId: string };
  authorizeDemo?: (token: string, operation: string) => Promise<DemoActor>;
}
const idPattern = /^0x[0-9a-f]{64}$/;
const walletPattern = /^0x[0-9a-f]{40}$/;
const unavailable = () => new ProofBridgeHttpError(503, 'MIDNIGHT_DEMO_NOT_READY', 'The synthetic Midnight demo is preparing.');
const denied = () => new ProofBridgeHttpError(403, 'ACCESS_DENIED', 'This proof request is not available to this user.');
const invalid = () => new ProofBridgeHttpError(400, 'INVALID_REQUEST', 'The request body is invalid.');
export function sendJson(response: ServerResponse, status: number, value: unknown): void {
  const body = JSON.stringify(value);
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': Buffer.byteLength(body), 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer' });
  response.end(body);
}
function exact(value: unknown, keys: string[]): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value) || Object.keys(value).sort().join(',') !== keys.sort().join(',')) throw invalid();
  return value as Record<string, unknown>;
}
function internalRequest(request: IncomingMessage, token: string): boolean {
  const supplied = request.headers['x-midnight-internal-token'];
  const ip = request.socket.remoteAddress;
  if (ip !== '127.0.0.1' && ip !== '::1' && ip !== '::ffff:127.0.0.1') return false;
  return typeof supplied === 'string' && Buffer.byteLength(supplied) === Buffer.byteLength(token) && timingSafeEqual(Buffer.from(supplied), Buffer.from(token));
}
export async function fetchAuthority(config: DemoConfig, token: string, requestId: string, operation: string): Promise<AuthorityContext> {
  let response: Response;
  try {
    response = await fetch(new URL('/internal/midnight/authorize', config.authorityUrl), {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: token, 'X-Midnight-Internal-Token': config.internalToken },
      body: JSON.stringify({ requestId, operation }), signal: AbortSignal.timeout(10_000), redirect: 'error',
    });
  } catch { throw new ProofBridgeHttpError(503, 'AUTHORITY_UNAVAILABLE', 'Proof request authorization is unavailable.'); }
  if (!response.ok) {
    void response.body?.cancel();
    if (response.status === 401) throw new ProofBridgeHttpError(401, 'AUTHENTICATION_REQUIRED', 'Sign in to continue.');
    if (response.status === 403 || response.status === 404) throw denied();
    if (response.status === 409 || response.status === 410) throw new ProofBridgeHttpError(409, 'POLICY_REQUEST_UNAVAILABLE', 'This request is no longer available for this operation.');
    throw unavailable();
  }
  const text = await response.text();
  if (Buffer.byteLength(text) > 8192) throw unavailable();
  try { return JSON.parse(text) as AuthorityContext; } catch { throw unavailable(); }
}
function validateAuthority(context: AuthorityContext, requestId: string, state: RuntimeState, config: DemoConfig): void {
  if (!context || context.requestId !== requestId || !/^[1-9][0-9]*$/.test(context.actorId) || !/^[1-9][0-9]*$/.test(context.companyId) || !walletPattern.test(context.subjectWallet)) throw unavailable();
  if (context.networkId !== config.networkId || context.midnightContractAddress !== state.contractAddress || context.giwaChainId !== GIWA_CHAIN_ID.toString() || context.receivableFinanceAddress !== RECEIVABLE_FINANCE_ADDRESS) throw new ProofBridgeHttpError(409, 'MIDNIGHT_DEPLOYMENT_MISMATCH', 'This request belongs to another Midnight deployment.');
  if (isSyntheticSubjectId(context.onchainReceivableId)) throw denied();
  if (context.policyRequest?.requestId !== requestId) throw unavailable();
}
function assertCapability(capability: ProofCapability, context: AuthorityContext): void {
  const policy = context.policyRequest;
  if (capability.requestId !== context.requestId || capability.midnightContractAddress !== context.midnightContractAddress || capability.giwaChainId !== context.giwaChainId || capability.receivableFinanceAddress !== context.receivableFinanceAddress || capability.onchainReceivableId !== context.onchainReceivableId || capability.subjectRole !== context.subjectRole || capability.partyWallet !== context.subjectWallet || capability.intendedFunderWallet !== policy.intendedFunderWallet || capability.minAnnualRevenueKrw !== policy.minAnnualRevenueKrw || capability.maxDebtRatioBps !== policy.maxDebtRatioBps || capability.maxOverdueCount !== policy.maxOverdueCount || capability.validUntil !== policy.validUntil) throw denied();
}
const HOP_HEADERS = new Set(['connection', 'keep-alive', 'proxy-authenticate', 'proxy-authorization', 'te', 'trailer', 'transfer-encoding', 'upgrade', 'x-midnight-internal-token']);
function proxyBusiness(request: IncomingMessage, response: ServerResponse, config: DemoConfig): void {
  const headers = Object.fromEntries(Object.entries(request.headers).filter(([key]) => !HOP_HEADERS.has(key)));
  // No client can smuggle an internal credential through the business proxy.
  headers.host = new URL(config.authorityUrl).host;
  const upstream = http.request(new URL(request.url!, config.authorityUrl), { method: request.method, headers }, (source) => {
    const safeHeaders = Object.fromEntries(Object.entries(source.headers).filter(([key]) => !HOP_HEADERS.has(key)));
    response.writeHead(source.statusCode ?? 502, safeHeaders);
    source.pipe(response);
  });
  upstream.setTimeout(30_000, () => upstream.destroy());
  upstream.on('error', () => { if (!response.headersSent) sendJson(response, 503, { error: { code: 'BACKEND_UNAVAILABLE', message: 'The application is starting.' } }); else response.destroy(); });
  request.on('aborted', () => upstream.destroy());
  response.on('close', () => { if (!response.writableEnded) upstream.destroy(); });
  request.pipe(upstream);
}
export function createDemoGateway(options: GatewayOptions): Server {
  const { config, state, owners } = options;
  const readHealthy = options.readHealthy ?? (() => true);
  const proofReady = () => state.status === 'ready' && readHealthy();
  const runtimeCode = () => state.status === 'ready' && !readHealthy() ? 'READ_API_UNAVAILABLE' : state.code;
  const authorize = options.authorize ?? ((token, requestId, operation) => fetchAuthority(config, token, requestId, operation));
  const authorizeDemo = options.authorizeDemo ?? ((token, operation) => fetchDemoAuthority(config, token, operation));
  const checkDependencies = options.checkDependencies ?? (async () => {
    try {
      const checks = await Promise.all([
        fetch(new URL('/health', config.authorityUrl), { signal: AbortSignal.timeout(3_000) }),
        fetch(new URL('/version', config.proofServer), { signal: AbortSignal.timeout(3_000) }),
      ]);
      for (const check of checks) void check.body?.cancel();
      return checks.every((check) => check.ok);
    } catch { return false; }
  });
  const server = http.createServer((request, response) => { void (async () => {
    try {
      const raw = request.url ?? '';
      // Never forward absolute-form URLs, encoded route separators, or internal namespaces.
      if (!raw.startsWith('/') || raw.startsWith('//') || /[\\\x00-\x20]/.test(raw)) throw invalid();
      let decoded: string;
      try { decoded = decodeURIComponent(raw.split('?')[0]); } catch { throw invalid(); }
      if (decoded !== raw.split('?')[0] || decoded.includes('..') || decoded.includes(';')) throw invalid();
      if (decoded === '/internal' || decoded.startsWith('/internal/') || ['/attest', '/authorization-challenges', '/provider-info'].includes(decoded)) throw denied();
      const route = raw.startsWith('/midnight-proof/') ? raw.slice('/midnight-proof'.length) : raw;
      if (route === '/health' && request.method === 'GET') {
        const healthy = await checkDependencies();
        sendJson(response, healthy ? 200 : 503, { status: healthy ? 'UP' : 'STARTING', proofReady: proofReady(), stage: state.status, code: runtimeCode() }); return;
      }
      if (route === '/ready' && request.method === 'GET') {
        sendJson(response, proofReady() ? 200 : 503, { proofReady: proofReady(), stage: state.status, code: runtimeCode() }); return;
      }
      if (route === '/v2/eligibility-results/resolve') {
        if (!internalRequest(request, config.internalToken)) throw denied();
        const reader = options.readServer(); if (!reader || state.status !== 'ready') throw unavailable();
        request.url = route; reader.emit('request', request, response); return;
      }
      const origin = request.headers.origin;
      if (typeof origin === 'string') {
        if (!config.allowedOrigins.has(origin)) throw new ProofBridgeHttpError(403, 'ORIGIN_REJECTED', 'The browser origin is not allowed.');
        response.setHeader('Access-Control-Allow-Origin', origin);
        response.setHeader('Vary', 'Origin');
      }
      if (request.method === 'OPTIONS') {
        if (!origin) throw denied();
        response.writeHead(204, { 'Access-Control-Allow-Methods': 'GET,POST,PATCH,PUT,DELETE,OPTIONS', 'Access-Control-Allow-Headers': 'Authorization,Content-Type,X-GASOK-MIDNIGHT-UI', 'Access-Control-Max-Age': '600' }); response.end(); return;
      }
      if (route === '/v2/demo/config' && request.method === 'GET') {
        sendJson(response, 200, { mode: 'hosted-demo', networkId: config.networkId, contractAddress: state.contractAddress ?? null, profiles: DEMO_PROFILES.map(({ id, label, summary }) => ({ id, label, summary })), provider: { name: 'MidProof Demo Attestation', attestationType: 'mock' }, walletlessDemo: { enabled: !!options.demoRuns, customCriteriaEnabled: true, ...options.demoFixture }, runtime: { ...state, code: runtimeCode() } }); return;
      }
      const demoRoute = /^\/v2\/demo-runs\/(start|status|recover)$/.exec(route);
      if (demoRoute) {
        if (request.method !== 'POST') throw new ProofBridgeHttpError(405, 'METHOD_NOT_ALLOWED', 'Only POST is allowed.');
        const token = request.headers.authorization;
        if (!token || !/^Bearer [A-Za-z0-9._~-]+$/.test(token)) throw new ProofBridgeHttpError(401, 'AUTHENTICATION_REQUIRED', 'Sign in to continue.');
        if (request.headers['content-type']?.split(';', 1)[0].trim().toLowerCase() !== 'application/json'
            || (request.headers['content-encoding'] && request.headers['content-encoding'] !== 'identity')) throw new ProofBridgeHttpError(415, 'JSON_BODY_REQUIRED', 'An uncompressed JSON body is required.');
        const input = await readJsonBody(request);
        const operation = demoRoute[1];
        const actor = validateDemoActor(await authorizeDemo(token, operation));
        const runs = options.demoRuns;
        if (!runs || state.status !== 'ready') throw unavailable();
        if (operation === 'start') { sendJson(response, 202, await runs.start(actor, input)); return; }
        const body = exact(input, operation === 'status' ? ['version', 'runId']
          : typeof input === 'object' && input !== null && 'clientRequestId' in input ? ['version', 'clientRequestId'] : ['version']);
        if (body.version !== 2 || (operation === 'status' && typeof body.runId !== 'string')
            || ('clientRequestId' in body && typeof body.clientRequestId !== 'string')) throw invalid();
        const result = operation === 'status' ? await runs.status(actor, body.runId as string)
          : await runs.recover(actor, body.clientRequestId as string | undefined);
        sendJson(response, 200, result); return;
      }
      const match = /^\/v2\/proof-sessions\/(challenge|prove|status|cancel|recover|ack)$/.exec(route);
      if (!match) {
        if (route.startsWith('/v2/') || decoded === '/midnight-proof' || decoded.startsWith('/midnight-proof/') || decoded === '/midnight-api' || decoded.startsWith('/midnight-api/')) throw new ProofBridgeHttpError(404, 'NOT_FOUND', 'The requested endpoint does not exist.');
        proxyBusiness(request, response, config); return;
      }
      if (request.method !== 'POST') throw new ProofBridgeHttpError(405, 'METHOD_NOT_ALLOWED', 'Only POST is allowed.');
      const token = request.headers.authorization;
      if (!token || !/^Bearer [A-Za-z0-9._~-]+$/.test(token)) throw new ProofBridgeHttpError(401, 'AUTHENTICATION_REQUIRED', 'Sign in to continue.');
      if (request.headers['content-type']?.split(';', 1)[0].trim().toLowerCase() !== 'application/json' || (request.headers['content-encoding'] && request.headers['content-encoding'] !== 'identity')) throw new ProofBridgeHttpError(415, 'JSON_BODY_REQUIRED', 'An uncompressed JSON body is required.');
      const body = await readJsonBody(request);
      const operation = match[1];
      const input = exact(body, operation === 'challenge' ? ['version', 'requestId', 'profileId'] : operation === 'recover' ? ['version', 'requestId'] : operation === 'prove' ? ['version', 'requestId', 'sessionId', 'authorization'] : ['version', 'requestId', 'sessionId']);
      if (input.version !== 2 || typeof input.requestId !== 'string' || !idPattern.test(input.requestId) || /^0x0+$/.test(input.requestId)) throw invalid();
      const controller = options.controller();
      if (!controller || state.status !== 'ready') throw unavailable();
      const context = await authorize(token, input.requestId, operation);
      validateAuthority(context, input.requestId, state, config);
      if ((operation === 'challenge' || operation === 'prove') && (context.requestStatus !== 'REQUESTED' || !/^[0-9]+$/.test(context.policyRequest.validUntil) || BigInt(context.policyRequest.validUntil) <= BigInt(Math.floor(Date.now() / 1000)))) throw new ProofBridgeHttpError(409, 'POLICY_REQUEST_UNAVAILABLE', 'This policy request is no longer available.');
      if (operation === 'challenge') {
        const profile = DEMO_PROFILES.find(({ id }) => id === input.profileId); if (!profile) throw invalid();
        const parsed = parseChallengeRequest({ version: 2, onchainReceivableId: context.onchainReceivableId, subjectRole: context.subjectRole, policyRequest: context.policyRequest, annualRevenueKrw: profile.annualRevenueKrw.toString(), debtRatioBps: profile.debtRatioBps.toString(), overdueCount: profile.overdueCount.toString() });
        const result = await controller.createChallenge(parsed);
        if (result.authorizationRequest.message.partyWallet.toLowerCase() !== context.subjectWallet) { await controller.cancel(result.sessionId); throw denied(); }
        owners.set(result.sessionId, { sessionId: result.sessionId, requestId: context.requestId, actorId: context.actorId, validUntil: context.policyRequest.validUntil });
        try { await options.saveOwners(); } catch { owners.delete(result.sessionId); await controller.cancel(result.sessionId); throw unavailable(); }
        sendJson(response, 201, result); return;
      }
      if (operation === 'recover') {
        const parsed = parseRecoveryRequest({ version: 2, requestId: input.requestId });
        const result = controller.recover(parsed.requestId);
        const owner = owners.get(result.sessionId);
        if (!owner || owner.actorId !== context.actorId || owner.requestId !== context.requestId) throw denied();
        assertCapability(result.proofCapability, context); sendJson(response, 200, result); return;
      }
      const session = parseSessionRequest({ version: 2, sessionId: input.sessionId });
      const owner = owners.get(session.sessionId);
      if (!owner || owner.actorId !== context.actorId || owner.requestId !== context.requestId) throw denied();
      if (operation === 'prove') {
        const proof = parseProofSubmissionRequest({ version: 2, sessionId: session.sessionId, authorization: input.authorization });
        if (proof.authorization.signer.toLowerCase() !== context.subjectWallet) throw denied();
        sendJson(response, 202, await controller.startProof(session.sessionId, proof.authorization)); return;
      }
      if (operation === 'ack') {
        if (!['SUBMITTED', 'COMPLETED'].includes(context.requestStatus)) throw denied();
        const ack = parseAcknowledgementRequest({ version: 2, requestId: context.requestId, sessionId: session.sessionId });
        sendJson(response, 200, await controller.acknowledge(ack.sessionId, ack.requestId)); return;
      }
      const result = operation === 'status' ? controller.getStatus(session.sessionId) : await controller.cancel(session.sessionId);
      if (result.status === 'complete') assertCapability(result.proofCapability, context);
      sendJson(response, 200, result);
    } catch (error) {
      request.resume(); const safe = mapError(error);
      if (!response.headersSent) sendJson(response, safe.status, { error: { code: safe.code, message: safe.publicMessage } });
    }
  })(); });
  server.requestTimeout = 15_000; server.headersTimeout = 10_000; server.keepAliveTimeout = 5_000; server.maxHeadersCount = 64;
  return server;
}

export async function fetchDemoAuthority(config: DemoConfig, token: string, operation: string): Promise<DemoActor> {
  let response: Response;
  try {
    response = await fetch(new URL('/internal/midnight/demo-authority', config.authorityUrl), {
      method: 'POST', redirect: 'error', signal: AbortSignal.timeout(10_000),
      headers: { 'Content-Type': 'application/json', Authorization: token, 'X-Midnight-Internal-Token': config.internalToken },
      body: JSON.stringify({ operation }),
    });
    if (response.ok) {
      const body = await response.text();
      if (Buffer.byteLength(body) > 8192) throw unavailable();
      return validateDemoActor(JSON.parse(body));
    }
  } catch (error) {
    if (error instanceof ProofBridgeHttpError) throw error;
    throw new ProofBridgeHttpError(503, 'AUTHORITY_UNAVAILABLE', 'Demo authorization is unavailable.');
  }
  void response.body?.cancel();
  if (response.status === 401) throw new ProofBridgeHttpError(401, 'AUTHENTICATION_REQUIRED', 'Sign in to the demo again.');
  throw denied();
}
