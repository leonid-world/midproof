import http from 'node:http';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { openCapabilityOutbox } from '../proof-bridge/capability-outbox.js';
import { ProofBridgeRuntime } from '../proof-bridge/runtime.js';
import { readEncryptedJson, writeEncryptedJson } from '../hosted-demo/state.js';
import { createDemoGateway } from '../hosted-demo/gateway.js';
import { readDemoConfig } from '../hosted-demo/config.js';
import { randomUUID } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { Wallet, verifyTypedData } from 'ethers';
import { DemoRuns, type DemoActor, type DemoRun } from '../hosted-demo/demo-runs.js';
import { parseDemoFixture } from '../hosted-demo/demo-fixture.js';
import { GIWA_CHAIN_ID, RECEIVABLE_FINANCE_ADDRESS } from '../giwa.js';
import { AUTHORIZATION_DOMAIN, AUTHORIZATION_FIELDS, AUTHORIZATION_PRIMARY_TYPE, AUTHORIZATION_PURPOSE, type AuthorizationChallenge } from '../authorization.js';
import type { ProofBridgeController } from '../proof-bridge/runtime.js';
import type { ProofCapability } from '../api.js';
import { readGiwaContext } from '../../../shared/giwa-config.mjs';

const seller = Wallet.createRandom(); const buyer = Wallet.createRandom(); const funder = Wallet.createRandom();
const address = 'c'.repeat(64); const proofSessionId = `0x${'d'.repeat(64)}`;
const fixture = () => parseDemoFixture({ version: 1, networkId: 'preview', giwaChainId: GIWA_CHAIN_ID.toString(),
  receivableFinanceAddress: RECEIVABLE_FINANCE_ADDRESS, onchainReceivableId: '7', sellerPrivateKey: seller.privateKey,
  buyerPrivateKey: buyer.privateKey, intendedFunderWallet: funder.address.toLowerCase() }, 'preview');
const actor = (): DemoActor => ({ actorId: '1', userId: '1', sessionId: randomUUID(), expiresAt: Math.floor(Date.now()/1000)+7200, demo: true });
const input = () => ({ version: 2, profileId: 'steady', subjectRole: 'SELLER', consent: true, clientRequestId: randomUUID() });
const customPolicy = { minAnnualRevenueKrw: '750000001', maxDebtRatioBps: '12550', maxOverdueCount: '0' };
function setup(records: DemoRun[] = []) {
  let stored = structuredClone(records); let cap: ProofCapability | undefined; let now = Date.now();
  const events: string[] = [];
  let challenge: AuthorizationChallenge;
  const controller: ProofBridgeController = {
    createChallenge: vi.fn(async (value) => {
      const at = String(Math.floor(Date.now()/1000)); const wallet = value.subjectRole === 'SELLER' ? seller : buyer;
      challenge = { version: 2, domain: AUTHORIZATION_DOMAIN, primaryType: AUTHORIZATION_PRIMARY_TYPE,
        types: { [AUTHORIZATION_PRIMARY_TYPE]: AUTHORIZATION_FIELDS }, message: {
          purpose: AUTHORIZATION_PURPOSE, authorizationId: `0x${'1'.repeat(64)}`, midnightContractAddress: `0x${address}`,
          receivableFinanceAddress: RECEIVABLE_FINANCE_ADDRESS, onchainReceivableId: value.onchainReceivableId.toString(),
          subjectRole: value.subjectRole, partyWallet: wallet.address.toLowerCase(), ...Object.fromEntries(Object.entries(value.policyRequest).map(([k,v]) => [k, String(v)])),
          attestationRequestCommitment: `0x${'2'.repeat(64)}`, providerId: '2', evaluationVersion: '2', profileAsOf: at,
          policyValidUntil: value.policyRequest.validUntil.toString(), issuedAt: at, expiresAt: String(Number(at)+120),
        } } as AuthorizationChallenge;
      cap = { version: 2, evaluationVersion: 2, midnightContractAddress: address,
        companyCommitment: `0x${'3'.repeat(64)}`, lookupKey: `0x${'4'.repeat(64)}`, policyRequestHash: `0x${'5'.repeat(64)}`,
        giwaChainId: GIWA_CHAIN_ID.toString(), receivableFinanceAddress: RECEIVABLE_FINANCE_ADDRESS,
        onchainReceivableId: value.onchainReceivableId.toString(), subjectRole: value.subjectRole, partyWallet: wallet.address.toLowerCase(),
        ...Object.fromEntries(Object.entries(value.policyRequest).map(([k,v]) => [k, String(v)])), profileAsOf: at,
      } as ProofCapability;
      return { version: 2 as const, sessionId: proofSessionId, expiresAt: challenge.message.expiresAt, authorizationRequest: challenge };
    }),
    startProof: vi.fn(async () => ({ version: 2 as const, sessionId: proofSessionId, status: 'attesting' as const })),
    getStatus: vi.fn(() => ({ version: 2 as const, sessionId: proofSessionId, status: 'complete' as const, proofCapability: cap! })),
    recover: vi.fn(() => ({ version: 2 as const, sessionId: proofSessionId, status: 'complete' as const, proofCapability: cap! })),
    acknowledge: vi.fn(async () => { events.push('ack'); return { version: 2 as const, sessionId: proofSessionId, status: 'acknowledged' as const }; }),
    cancel: vi.fn(async () => ({ version: 2 as const, sessionId: proofSessionId, status: 'cancelled' as const })),
  };
  const save = vi.fn(async (rows: DemoRun[]) => { stored = structuredClone(rows); if (rows.some((r) => r.capability)) events.push('durable-capability'); });
  const resolve = vi.fn(async (capability: ProofCapability) => { events.push('read'); return { eligible: true, providerId: 2,
    evaluationVersion: 2 as const, profileAsOf: capability.profileAsOf, validUntil: capability.validUntil }; });
  const options = { fixture: fixture(), contractAddress: () => address, controller: () => controller, resolve, save, records, now: () => now };
  return { runs: new DemoRuns(options), options, controller, resolve, save, events, stored: () => stored,
    challenge: () => challenge, cap: () => cap!, advance: (ms: number) => now += ms };
}
describe('walletless dedicated fixture signer', () => {
  it('signs only the fixed fixture role and exact approved request', async () => {
    const x = setup(); const a = actor(); const result = await x.runs.start(a, input()); await x.runs.flush();
    expect(x.controller.startProof).toHaveBeenCalledOnce();
    const proof = vi.mocked(x.controller.startProof).mock.calls[0][1];
    expect(verifyTypedData(AUTHORIZATION_DOMAIN, { [AUTHORIZATION_PRIMARY_TYPE]: AUTHORIZATION_FIELDS.map((f) => ({...f})) }, x.challenge().message, proof.signature).toLowerCase()).toBe(seller.address.toLowerCase());
    await expect(fixture().sign({ ...x.challenge(), message: { ...x.challenge().message, onchainReceivableId: '8' } }, result)).rejects.toThrow('DEMO_SIGNING_CONTEXT_REJECTED');
  });
  it('refuses altered role wallet, domain, audience and criteria before signing', async () => {
    const x = setup(); const result = await x.runs.start(actor(), input()); await x.runs.flush();
    for (const change of [{partyWallet: buyer.address.toLowerCase()}, {intendedFunderWallet: buyer.address.toLowerCase()}, {minAnnualRevenueKrw:'1'}]) {
      await expect(fixture().sign({ ...x.challenge(), message: { ...x.challenge().message, ...change } }, result)).rejects.toThrow();
    }
    await expect(fixture().sign({ ...x.challenge(), domain: { ...AUTHORIZATION_DOMAIN, chainId: '1' } }, result)).rejects.toThrow();
  });
});
describe('isolated demo runs', () => {
  it('binds custom public criteria to the persisted run, signed challenge and independent reader', async () => {
    const x = setup(); const a = actor();
    const first = await x.runs.start(a, { ...input(), ...customPolicy }); await x.runs.flush();
    expect(first).toMatchObject(customPolicy);
    expect(x.stored()[0]).toMatchObject(customPolicy);
    expect(x.controller.createChallenge).toHaveBeenCalledWith(expect.objectContaining({
      policyRequest: expect.objectContaining({ minAnnualRevenueKrw: 750000001n, maxDebtRatioBps: 12550n, maxOverdueCount: 0n }),
    }));
    expect(x.challenge().message).toMatchObject(customPolicy);
    const proof = vi.mocked(x.controller.startProof).mock.calls[0][1];
    expect(verifyTypedData(AUTHORIZATION_DOMAIN, { [AUTHORIZATION_PRIMARY_TYPE]: AUTHORIZATION_FIELDS.map((field) => ({ ...field })) },
      x.challenge().message, proof.signature).toLowerCase()).toBe(seller.address.toLowerCase());
    const result = await x.runs.status(a, first.runId);
    expect(result).toMatchObject({ ...customPolicy, status: 'completed' });
    expect(x.resolve).toHaveBeenCalledWith(expect.objectContaining(customPolicy));
    const restarted = new DemoRuns({ ...x.options, records: x.stored() });
    expect(await restarted.recover(a)).toMatchObject({ ...customPolicy, runId: first.runId, status: 'completed' });
    expect(x.controller.startProof).toHaveBeenCalledOnce();
  });
  it('keeps omitted criteria compatible with explicit defaults on idempotent retries', async () => {
    const x = setup(); const a = actor(); const body = input();
    const first = await x.runs.start(a, body); await x.runs.flush();
    const defaults = { minAnnualRevenueKrw: '500000000', maxDebtRatioBps: '20000', maxOverdueCount: '1' };
    expect(first).toMatchObject(defaults);
    expect((await x.runs.start(a, { ...body, ...defaults })).runId).toBe(first.runId);
    expect(x.controller.startProof).toHaveBeenCalledOnce();
  });
  it.each(['minAnnualRevenueKrw', 'maxDebtRatioBps', 'maxOverdueCount'] as const)(
    'rejects changed %s under the same client request identifier', async (field) => {
      const x = setup(); const a = actor(); const body = { ...input(), ...customPolicy };
      await x.runs.start(a, body); await x.runs.flush();
      await expect(x.runs.start(a, { ...body, [field]: String(BigInt(body[field]) + 1n) }))
        .rejects.toMatchObject({ code: 'DEMO_IDEMPOTENCY_CONFLICT' });
      await expect(x.runs.start(a, { ...input(), clientRequestId: body.clientRequestId }))
        .rejects.toMatchObject({ code: 'DEMO_IDEMPOTENCY_CONFLICT' });
      expect(x.controller.startProof).toHaveBeenCalledOnce();
    },
  );
  it('rejects partial, unknown, noncanonical and overflowing criteria before recording or proving', async () => {
    const x = setup(); const a = actor();
    const invalidPolicies = [
      { minAnnualRevenueKrw: '1' }, { maxDebtRatioBps: '1', maxOverdueCount: '1' },
      { ...customPolicy, validUntil: '4000000000' }, { ...customPolicy, annualRevenueKrw: '1' },
      { ...customPolicy, minAnnualRevenueKrw: '01' }, { ...customPolicy, minAnnualRevenueKrw: '1e9' },
      { ...customPolicy, minAnnualRevenueKrw: '18446744073709551616' },
      { ...customPolicy, maxDebtRatioBps: '4294967296' }, { ...customPolicy, maxOverdueCount: '65536' },
      { ...customPolicy, maxDebtRatioBps: '1.5' }, { ...customPolicy, maxOverdueCount: '-1' },
      { ...customPolicy, minAnnualRevenueKrw: 1 }, { ...customPolicy, maxDebtRatioBps: null },
      { ...customPolicy, maxOverdueCount: '' }, { ...customPolicy, maxOverdueCount: ' 1' },
    ];
    for (const policy of invalidPolicies) {
      await expect(x.runs.start(a, { ...input(), ...policy })).rejects.toMatchObject({ code: 'INVALID_REQUEST' });
    }
    expect(x.save).not.toHaveBeenCalled(); expect(x.controller.createChallenge).not.toHaveBeenCalled();
  });
  it.each([
    { minAnnualRevenueKrw: '0', maxDebtRatioBps: '0', maxOverdueCount: '0' },
    { minAnnualRevenueKrw: '18446744073709551615', maxDebtRatioBps: '4294967295', maxOverdueCount: '65535' },
  ])('accepts exact protocol bounds without number rounding: %j', async (policy) => {
    const x = setup(); const first = await x.runs.start(actor(), { ...input(), ...policy }); await x.runs.flush();
    expect(first).toMatchObject(policy); expect(x.challenge().message).toMatchObject(policy);
    expect(x.controller.startProof).toHaveBeenCalledOnce();
  });
  it.each(['minAnnualRevenueKrw', 'maxDebtRatioBps', 'maxOverdueCount'] as const)(
    'rejects a returned capability with different %s before ACK or independent read', async (field) => {
      const x = setup(); const a = actor(); const first = await x.runs.start(a, { ...input(), ...customPolicy }); await x.runs.flush();
      Object.assign(x.cap(), { [field]: String(BigInt(customPolicy[field]) + 1n) });
      expect((await x.runs.status(a, first.runId)).status).toBe('uncertain');
      expect(x.controller.acknowledge).not.toHaveBeenCalled(); expect(x.resolve).not.toHaveBeenCalled();
      expect(x.controller.startProof).toHaveBeenCalledOnce();
    },
  );
  it('rejects corrupted stored policy fields instead of replacing them with defaults', async () => {
    const x = setup(); await x.runs.start(actor(), { ...input(), ...customPolicy }); await x.runs.flush();
    for (const altered of [
      { minAnnualRevenueKrw: undefined }, { minAnnualRevenueKrw: '18446744073709551616' },
      { maxDebtRatioBps: '4294967296' }, { maxOverdueCount: '65536' }, { maxOverdueCount: '01' },
    ]) {
      const records = structuredClone(x.stored()); Object.assign(records[0], altered);
      expect(() => new DemoRuns({ ...x.options, records })).toThrow('DEMO_RUN_STORE_INVALID');
    }
  });
  it('requires explicit consent and rejects financial/context overrides', async () => {
    const x = setup();
    await expect(x.runs.start(actor(), {...input(),consent:false})).rejects.toMatchObject({code:'INVALID_REQUEST'});
    await expect(x.runs.start(actor(), {...input(),annualRevenueKrw:'1'})).rejects.toMatchObject({code:'INVALID_REQUEST'});
    expect(x.controller.createChallenge).not.toHaveBeenCalled();
  });
  it('starts once for concurrent/repeated client IDs and hides all capability/owner material', async () => {
    const x = setup(); const a = actor(); const body = input();
    const [first, retry] = await Promise.all([x.runs.start(a, body), x.runs.start(a, body)]); await x.runs.flush();
    expect(first.runId).toBe(retry.runId); expect(x.controller.createChallenge).toHaveBeenCalledOnce();
    const result = await x.runs.status(a, first.runId);
    expect(result.status).toBe('completed'); expect(result).not.toHaveProperty('capability'); expect(result).not.toHaveProperty('ownerSessionId');
    expect(x.events.indexOf('durable-capability')).toBeLessThan(x.events.indexOf('ack'));
    expect(x.events.indexOf('ack')).toBeLessThan(x.events.indexOf('read'));
  });
  it('separates logins of the same shared account and recovers latest without browser run storage', async () => {
    const x = setup(); const a = actor(); const first = await x.runs.start(a,input()); await x.runs.flush();
    await expect(x.runs.status({...a,sessionId:randomUUID()},first.runId)).rejects.toMatchObject({code:'ACCESS_DENIED'});
    await expect(x.runs.recover({...a,sessionId:randomUUID()})).rejects.toMatchObject({code:'DEMO_RUN_NOT_FOUND'});
    expect((await x.runs.recover(a)).runId).toBe(first.runId);
  });
  it('restores encrypted-record metadata and retries ACK/read without a new proof', async () => {
    const x = setup(); const a = actor(); const first = await x.runs.start(a,input()); await x.runs.flush();
    vi.mocked(x.controller.acknowledge).mockRejectedValueOnce(new Error('lost ACK'));
    x.resolve.mockRejectedValueOnce(new Error('indexer lag'));
    expect((await x.runs.status(a,first.runId)).status).toBe('submitted');
    const reboot = new DemoRuns({...x.options,records:x.stored()});
    expect((await reboot.recover(a)).status).toBe('completed');
    expect(x.controller.startProof).toHaveBeenCalledOnce(); expect(x.controller.acknowledge).toHaveBeenCalledTimes(2);
  });
  it('never ACKs a capability whose durable save failed', async () => {
    const x = setup(); const a = actor(); const first = await x.runs.start(a,input()); await x.runs.flush();
    x.save.mockRejectedValueOnce(new Error('disk failure'));
    expect((await x.runs.status(a,first.runId)).status).toBe('uncertain');
    expect(x.controller.acknowledge).not.toHaveBeenCalled();
    expect((await x.runs.status(a,first.runId)).status).toBe('completed');
  });
  it('rejects cross-request capability before ACK and does not reprove after uncertainty', async () => {
    const x = setup(); const a = actor(); const body = input(); const first = await x.runs.start(a,body); await x.runs.flush();
    Object.assign(x.cap(), { requestId: `0x${'8'.repeat(64)}` });
    expect((await x.runs.status(a,first.runId)).status).toBe('uncertain');
    expect(x.controller.acknowledge).not.toHaveBeenCalled();
    await x.runs.start(a,body); expect(x.controller.startProof).toHaveBeenCalledOnce();
    await expect(x.runs.start(a,input())).rejects.toMatchObject({code:'PROOF_SESSION_BUSY'});
  });
  it('does not display stale success when a reader crosses expiry', async () => {
    const x = setup(); const a = actor(); const first = await x.runs.start(a,input()); await x.runs.flush();
    x.resolve.mockImplementationOnce(async (cap) => { x.advance(3600_000); return {eligible:false,providerId:2,evaluationVersion:2,profileAsOf:cap.profileAsOf,validUntil:cap.validUntil}; });
    const result = await x.runs.status(a,first.runId);
    expect(result.status).toBe('expired'); expect(result).not.toHaveProperty('result');
  });
});
describe('scoped local GIWA context', () => {
  const local = { MIDPROOF_LOCAL_DEMO:'true',MIDNIGHT_NETWORK_ID:'undeployed',MIDNIGHT_DEMO_MODE:'hosted-demo',GIWA_CHAIN_ID:'31337',GIWA_RPC_URL:'http://evm:8545',GIWA_RECEIVABLE_FINANCE_ADDRESS:'0x'+'a'.repeat(40) };
  it('uses deployed Preview pins by default even if ordinary GIWA env is changed', () => {
    expect(readGiwaContext({GIWA_CHAIN_ID:'1',GIWA_RECEIVABLE_FINANCE_ADDRESS:local.GIWA_RECEIVABLE_FINANCE_ADDRESS})).toEqual({chainId:91342n,receivableFinanceAddress:RECEIVABLE_FINANCE_ADDRESS});
  });
  it('accepts explicit local EVM only on undeployed and rejects public hosts/preview/genesis leakage', () => {
    expect(readGiwaContext(local).chainId).toBe(31337n);
    for (const env of [{...local,MIDNIGHT_NETWORK_ID:'preview'}, {...local,GIWA_RPC_URL:'https://sepolia-rpc.giwa.io'}, {...local,GIWA_RPC_URL:'http://evil.example:8545'}, {MIDPROOF_LOCAL_WALLET_SEED:'1'}]) expect(() => readGiwaContext(env)).toThrow();
  });
});

describe('walletless HTTP and durable outbox integration', () => {
  it('restores a persisted proof session after a real runtime shutdown using encrypted outbox, without proving again', async () => {
    const x = setup(); const a = actor();
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'midproof-walletless-test-'));
    const filePath = path.join(directory,'outbox.enc'); const runFile = path.join(directory,'runs.enc');
    const password = 'isolated-test-password-not-an-operator-secret';
    const operations = {
      prepare: vi.fn(async (input: Parameters<ProofBridgeController['createChallenge']>[0]) => {
        const ch = await x.controller.createChallenge(input); return {prepared:{},authorizationRequest:ch.authorizationRequest};
      }),
      complete: vi.fn(async (_prepared: object, _authorization: unknown, onStage: (s: 'attesting'|'proving_and_submitting') => Promise<void> | void) => {
        await onStage('attesting'); await onStage('proving_and_submitting'); return x.cap();
      }),
    };
    let runtime = new ProofBridgeRuntime({operations,outbox:await openCapabilityOutbox({filePath,password})});
    try {
      const opts = {...x.options,controller:()=>runtime,save:(rows: DemoRun[])=>writeEncryptedJson(runFile,password,rows)};
      const runs = new DemoRuns(opts); const started = await runs.start(a,{ ...input(), ...customPolicy }); await runs.flush();
      await runtime.shutdown();
      const disk = await readEncryptedJson<DemoRun[]>(runFile,password);
      expect(disk?.[0].proofSessionId).toBeDefined(); expect(disk?.[0].capability).toBeUndefined();
      expect(await fs.readFile(filePath,'utf8')).not.toContain(x.cap().lookupKey);
      runtime = new ProofBridgeRuntime({operations,outbox:await openCapabilityOutbox({filePath,password})});
      const restarted = new DemoRuns({...opts,records:disk!});
      const recovered = await restarted.recover(a);
      expect(recovered.runId).toBe(started.runId); expect(recovered.status).toBe('completed');
      expect(recovered).toMatchObject(customPolicy);
      expect(operations.complete).toHaveBeenCalledOnce(); expect(operations.prepare).toHaveBeenCalledOnce();
      await restarted.flush();
    } finally { await runtime.shutdown(); await fs.rm(directory,{recursive:true,force:true}); }
  });
  it('authenticates each HTTP operation, blocks shared-account cross-session reads and recovers same-session latest', async () => {
    const x = setup(); const firstActor = actor(); const otherActor = {...firstActor,sessionId:randomUUID()};
    const config = readDemoConfig({MIDNIGHT_DEMO_MODE:'hosted-demo',MIDNIGHT_DEMO_INTERNAL_TOKEN:'x'.repeat(48)});
    const authorizeDemo = vi.fn(async (token: string) => token === 'Bearer first' ? firstActor : otherActor);
    const server = createDemoGateway({config,state:{status:'ready',contractAddress:address},owners:new Map(),saveOwners:async()=>{},
      controller:()=>x.controller,readServer:()=>undefined,demoRuns:x.runs,demoFixture:fixture(),authorizeDemo});
    await new Promise<void>((resolve)=>server.listen(0,'127.0.0.1',resolve));
    const bound=server.address(); if (!bound || typeof bound==='string') throw new Error('test port missing');
    const url=`http://127.0.0.1:${bound.port}`;
    const post=(op:string,body:unknown,token='first')=>fetch(url+'/midnight-proof/v2/demo-runs/'+op,{method:'POST',headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},body:JSON.stringify(body)});
    try {
      expect((await post('start',input(),'')).status).toBe(401); expect(authorizeDemo).not.toHaveBeenCalled();
      expect((await post('start',{ ...input(), minAnnualRevenueKrw: '1' })).status).toBe(400);
      const response=await post('start',{ ...input(), ...customPolicy }); expect(response.status).toBe(202); const run=await response.json() as {runId:string}; await x.runs.flush();
      expect(run).toMatchObject(customPolicy);
      expect((await post('status',{version:2,runId:run.runId},'other')).status).toBe(403);
      const recovered=await post('recover',{version:2}); expect(recovered.status).toBe(200);
      expect(((await recovered.json()) as {runId:string}).runId).toBe(run.runId);
      const meta=await fetch(url+'/v2/demo/config').then(r=>r.json()) as {walletlessDemo:unknown};
      expect(meta.walletlessDemo).toMatchObject({enabled:true,customCriteriaEnabled:true,giwaChainId:'91342',receivableFinanceAddress:RECEIVABLE_FINANCE_ADDRESS});
      expect(JSON.stringify(meta)).not.toContain(seller.privateKey);
    } finally { server.closeAllConnections(); await new Promise<void>(r=>server.close(()=>r())); }
  });
  it('distinguishes permanent read rejection and expiry after a failed await from Indexer lag', async () => {
    const x=setup();const a=actor();const started=await x.runs.start(a,input());await x.runs.flush();
    x.resolve.mockRejectedValueOnce(Object.assign(new Error('invalid'),{code:'CAPABILITY_LOOKUP_MISMATCH'}));
    expect((await x.runs.status(a,started.runId)).status).toBe('failed');
    const y=setup();const second=await y.runs.start(a,input());await y.runs.flush();
    y.resolve.mockImplementationOnce(async()=>{y.advance(3600_000);throw new Error('lag');});
    expect((await y.runs.status(a,second.runId)).status).toBe('expired');
  });
});

it('blocks a fresh run after a runtime failure with a retained ambiguous proving reservation', async () => {
  const x=setup();const a=actor();const first=await x.runs.start(a,input());await x.runs.flush();
  vi.mocked(x.controller.getStatus).mockReturnValue({version:2,sessionId:proofSessionId,status:'failed',error:{code:'PROOF_FAILED',message:'failed'}});
  vi.mocked(x.controller.recover).mockImplementation(()=>{throw Object.assign(new Error('reserved'),{code:'PROOF_RESULT_IN_PROGRESS'});});
  expect((await x.runs.status(a,first.runId)).status).toBe('uncertain');
  await expect(x.runs.start(a,input())).rejects.toMatchObject({code:'PROOF_SESSION_BUSY'});
  expect(x.controller.startProof).toHaveBeenCalledOnce();
});

it('releases an interrupted durable start with no session and a definite missing outbox record', async () => {
  const x=setup();const a=actor();const first=await x.runs.start(a,input());await x.runs.flush();
  const crashed=structuredClone(x.stored()); delete crashed[0].proofSessionId; crashed[0].status='preparing';
  vi.mocked(x.controller.recover).mockImplementation(()=>{throw Object.assign(new Error('absent'),{code:'PROOF_RESULT_NOT_FOUND'});});
  const restart=new DemoRuns({...x.options,records:crashed});
  const result=await restart.status(a,first.runId);
  expect(result.status).toBe('failed'); expect(result.error?.code).toBe('DEMO_START_INTERRUPTED');
  expect(x.controller.startProof).toHaveBeenCalledOnce();
  const next=await restart.start(a,input()); await restart.flush();
  expect(next.runId).not.toBe(first.runId); expect(x.controller.startProof).toHaveBeenCalledTimes(2);
});
