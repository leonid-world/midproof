import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { ContractState } from '@midnight-ntwrk/midnight-js-protocol/compact-runtime';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createContractStateQuery, CONTRACT_STATE_QUERY } from '../indexer-query.js';
import { createEligibilityReader } from '../eligibility.js';
import { createApiServer } from '../server.js';
import { GIWA_CHAIN_ID, GIWA_RECEIVABLE_FINANCE_ADDRESS } from '../config.js';
import { OperationInProgressError } from '../timeout.js';
import { createValidCapability } from './fixture.js';

type Mode = 'ok' | 'null' | 'headers-stall' | 'body-stall' | 'trickle' | 'large-header' | 'large-stream' | 'graphql-error' | 'redirect';
const servers: Server[] = [];
const timers = new Set<ReturnType<typeof setInterval>>();
const address = 'aa'.repeat(32);
const state = new ContractState();
const stateHex = Buffer.from(state.serialize()).toString('hex');

async function listen(server: Server): Promise<string> {
  servers.push(server);
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

async function fixture(initialMode: Mode = 'ok') {
  const control = { mode: initialMode, requests: [] as unknown[], disconnected: 0, chunks: 0 };
  const origin = await listen(createServer(async (request, response) => {
    const chunks: Buffer[] = [];
    for await (const chunk of request) chunks.push(Buffer.from(chunk));
    control.requests.push(JSON.parse(Buffer.concat(chunks).toString('utf8')));
    response.on('close', () => { if (!response.writableEnded) control.disconnected += 1; });
    if (control.mode === 'headers-stall') return;
    if (control.mode === 'redirect') {
      response.writeHead(302, { Location: '/redirected' }); response.end(); return;
    }
    response.writeHead(200, { 'Content-Type': 'application/json',
      ...(control.mode === 'large-header' ? { 'Content-Length': '10000000' } : {}) });
    response.flushHeaders();
    if (control.mode === 'large-header') return;
    if (control.mode === 'body-stall') { response.write('{"data":'); return; }
    if (control.mode === 'large-stream') { response.write(' '.repeat(2_048)); return; }
    if (control.mode === 'trickle') {
      const timer = setInterval(() => { control.chunks += 1; response.write(' '); }, 10);
      timers.add(timer);
      response.once('close', () => { clearInterval(timer); timers.delete(timer); });
      return;
    }
    if (control.mode === 'graphql-error') { response.end(JSON.stringify({ errors: [{ message: 'private upstream diagnostic' }] })); return; }
    response.end(JSON.stringify({ data: { contractAction: control.mode === 'null' ? null : { state: stateHex } } }));
  }));
  return { control, origin };
}

afterEach(async () => {
  for (const timer of timers) clearInterval(timer);
  timers.clear();
  await Promise.all(servers.splice(0).map((server) => new Promise<void>((resolve, reject) => {
    server.closeAllConnections();
    server.close((error) => error ? reject(error) : resolve());
  })));
});

describe('bounded abortable Indexer transport', () => {
  it('uses the SDK query shape and actual pinned ContractState decoder', async () => {
    const { control, origin } = await fixture();
    const query = createContractStateQuery(origin);
    const result = await query(address);
    expect(control.requests).toEqual([{ query: CONTRACT_STATE_QUERY, variables: { address, offset: null } }]);
    expect(result).toBeInstanceOf(ContractState);
    if (!(result instanceof ContractState)) throw new Error('Missing decoded state');
    expect(result.serialize()).toEqual(state.serialize());
    control.mode = 'null';
    await expect(query(address)).resolves.toBeNull();
  });

  it.each(['headers-stall', 'body-stall', 'trickle'] as const)(
    'cancels a %s within the whole-response deadline and permits the next query', async (mode) => {
      const { control, origin } = await fixture(mode);
      const query = createContractStateQuery(origin, { timeoutMs: 150 });
      const started = Date.now();
      await expect(query(address)).rejects.toThrow();
      expect(Date.now() - started).toBeLessThan(1_000);
      await vi.waitFor(() => expect(control.disconnected).toBe(1));
      if (mode === 'trickle') expect(control.chunks).toBeGreaterThan(1);
      expect(query.getHealth?.()).toEqual({ status: 'degraded', inFlight: false });
      control.mode = 'ok';
      await expect(query(address)).resolves.toBeInstanceOf(ContractState);
      expect(query.getHealth?.()).toEqual({ status: 'ok', inFlight: false });
    },
  );

  it.each(['large-header', 'large-stream'] as const)('caps %s bodies and closes the transport', async (mode) => {
    const { control, origin } = await fixture(mode);
    const query = createContractStateQuery(origin, { maxResponseBytes: 1_024, timeoutMs: 1_000 });
    await expect(query(address)).rejects.toThrow('too large');
    await vi.waitFor(() => expect(control.disconnected).toBe(1));
    expect(query.getHealth?.().inFlight).toBe(false);
  });

  it('propagates parent cancellation, rejects concurrent work and recovers without orphan requests', async () => {
    const { control, origin } = await fixture('body-stall');
    const query = createContractStateQuery(origin, { timeoutMs: 1_000 });
    const parent = new AbortController();
    const pending = query(address, parent.signal);
    const rejection = expect(pending).rejects.toThrow();
    await vi.waitFor(() => expect(control.requests).toHaveLength(1));
    await expect(query(address)).rejects.toBeInstanceOf(OperationInProgressError);
    parent.abort(new Error('caller disconnected'));
    await rejection;
    await vi.waitFor(() => expect(control.disconnected).toBe(1));
    expect(query.getHealth?.()).toEqual({ status: 'ok', inFlight: false });
    control.mode = 'ok';
    await expect(query(address)).resolves.toBeInstanceOf(ContractState);
    expect(control.requests).toHaveLength(2);
  });

  it.each(['graphql-error', 'redirect'] as const)('fails closed on %s without following another URL', async (mode) => {
    const { control, origin } = await fixture(mode);
    await expect(createContractStateQuery(origin)(address)).rejects.toThrow();
    expect(control.requests).toHaveLength(1);
  });

  it('propagates transport degradation and recovery through Read API health', async () => {
    const upstream = await fixture('body-stall');
    const capability = createValidCapability();
    const query = createContractStateQuery(upstream.origin, { timeoutMs: 150 });
    const reader = createEligibilityReader({ queryContractState: query, decodeLedger: () => ({
      giwaChainId: GIWA_CHAIN_ID,
      receivableFinanceAddress: Buffer.from(GIWA_RECEIVABLE_FINANCE_ADDRESS.slice(2), 'hex'),
      eligibilityResults: { member: () => true, lookup: () => ({ eligible: true, providerId: 2n,
        evaluationVersion: 2n, profileAsOf: BigInt(capability.profileAsOf), validUntil: BigInt(capability.validUntil) }) },
    }) });
    const origin = await listen(createApiServer({ getEligibilityResult: reader,
      approvedContractAddress: capability.midnightContractAddress }));
    const resolve = () => fetch(`${origin}/v2/eligibility-results/resolve`, { method: 'POST',
      headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(capability) });
    expect((await resolve()).status).toBe(502);
    expect((await fetch(`${origin}/health`)).status).toBe(503);
    upstream.control.mode = 'ok';
    expect((await resolve()).status).toBe(200);
    expect((await fetch(`${origin}/health`)).status).toBe(200);
  });

  it('cancels upstream body reading when the HTTP client disconnects', async () => {
    const upstream = await fixture('body-stall');
    const capability = createValidCapability();
    const query = createContractStateQuery(upstream.origin, { timeoutMs: 2_000 });
    const origin = await listen(createApiServer({ getEligibilityResult: createEligibilityReader({ queryContractState: query }),
      approvedContractAddress: capability.midnightContractAddress }));
    const controller = new AbortController();
    const pending = fetch(`${origin}/v2/eligibility-results/resolve`, { method: 'POST',
      headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(capability), signal: controller.signal });
    const rejection = expect(pending).rejects.toThrow();
    await vi.waitFor(() => expect(upstream.control.requests).toHaveLength(1));
    controller.abort();
    await rejection;
    await vi.waitFor(() => expect(upstream.control.disconnected).toBe(1));
    expect(query.getHealth?.()).toEqual({ status: 'ok', inFlight: false });
  });
});
