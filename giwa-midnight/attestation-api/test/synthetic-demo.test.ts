import { afterEach, describe, expect, it, vi } from 'vitest';
import { Wallet, TypedDataEncoder } from 'ethers';
import { setNetworkId } from '@midnight-ntwrk/midnight-js-network-id';
import { CompactTypeBytes, transientHash, ecMulGenerator, ecAdd, ecMul } from '@midnight-ntwrk/midnight-js-protocol/compact-runtime';
import { GasokEligibility } from 'zkloan-credit-scorer-contract';
import { createServer } from '../src/server.js';
import { createGiwaSepoliaReceivableResolver, GIWA_CHAIN_ID, RECEIVABLE_FINANCE_ADDRESS } from '../src/giwa.js';
import { deriveAttestationContext, DEFAULT_APPROVED_MIDNIGHT_CONTRACT_ADDRESS } from '../src/context.js';
import { generateKeyPair } from '../src/signing.js';
import { SYNTHETIC_SUBJECT_ID, validateSyntheticContext } from '../../shared/synthetic-context.mjs';
import type { AttestationResponse, AuthorizationChallengeResponse } from '../src/types.js';
import type restify from 'restify';
setNetworkId('undeployed');
const seller = Wallet.createRandom(); const buyer = Wallet.createRandom(); const keys = generateKeyPair();
const context = validateSyntheticContext({ giwaChainId: GIWA_CHAIN_ID.toString(), receivableFinanceAddress: RECEIVABLE_FINANCE_ADDRESS,
  onchainReceivableId: SYNTHETIC_SUBJECT_ID, intendedFunderWallet: `0x${'4'.repeat(40)}`,
  wallets: { SELLER: seller.address.toLowerCase(), BUYER: buyer.address.toLowerCase() } });
const profiles = [{annualRevenueKrw:'900000000',debtRatioBps:'12000',overdueCount:'0'}, {annualRevenueKrw:'300000000',debtRatioBps:'28000',overdueCount:'3'}];
const servers: restify.Server[] = [];
afterEach(async () => { vi.unstubAllGlobals(); await Promise.all(servers.splice(0).map((server) => new Promise<void>((r) => server.close(() => r())))); });
async function start(synthetic = true) {
  const resolve = vi.fn(async (id: bigint) => ({ id, seller: context.wallets.SELLER, buyer: context.wallets.BUYER }));
  const server = createServer(keys.sk, { receivableResolver: {resolve},
    ...(synthetic ? { syntheticDemoContext: context } : {}),
    allowFinancialInput: (input) => profiles.some((p) => BigInt(p.annualRevenueKrw) === input.annualRevenueKrw && BigInt(p.debtRatioBps) === input.debtRatioBps && BigInt(p.overdueCount) === input.overdueCount) });
  servers.push(server); await new Promise<void>((r) => server.listen(0,'127.0.0.1',r));
  const address = server.address(); if (!address || typeof address === 'string') throw new Error('no port');
  const post = (path: string, body: unknown) => fetch(`http://127.0.0.1:${address.port}${path}`, {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
  return { post, resolve };
}
const request = (role: 'SELLER'|'BUYER', profile = profiles[0]) => ({ version:2, ...profile,
  companyCommitmentHash:'123456789', authorizationSalt:`0x${'a'.repeat(64)}`, midnightContractAddress:DEFAULT_APPROVED_MIDNIGHT_CONTRACT_ADDRESS,
  onchainReceivableId:SYNTHETIC_SUBJECT_ID, subjectRole:role, policyRequest:{requestId:`0x${'b'.repeat(64)}`,intendedFunderWallet:context.intendedFunderWallet,
    minAnnualRevenueKrw:'500000000',maxDebtRatioBps:'20000',maxOverdueCount:'1',validUntil:'4000000000'} });
async function proof(challenge: AuthorizationChallengeResponse, signer: Wallet) {
  return {version:2,authorizationId:challenge.message.authorizationId,signer:signer.address,
    typedDataHash:TypedDataEncoder.hash(challenge.domain,challenge.types,challenge.message),
    signature:await signer.signTypedData(challenge.domain,challenge.types,challenge.message)};
}
describe('explicit internal synthetic provider context', () => {
  it.each(['SELLER','BUYER'] as const)('attests both %s financial scenarios with real signatures and zero GIWA resolution', async (role) => {
    const x=await start();
    for(const profile of profiles) {
      const body=request(role,profile);const challengeResponse=await x.post('/authorization-challenges',body);expect(challengeResponse.status).toBe(201);
      const challenge=await challengeResponse.json() as AuthorizationChallengeResponse;
      const authorization=await proof(challenge,role==='SELLER'?seller:buyer);
      const response=await x.post('/attest',{...body,authorization});expect(response.status).toBe(200);
      const attestation=await response.json() as AttestationResponse;
      expect(attestation.binding).toMatchObject({onchainReceivableId:SYNTHETIC_SUBJECT_ID,subjectRole:role,partyWallet:context.wallets[role]});
      const binding=deriveAttestationContext(body.midnightContractAddress,{id:BigInt(SYNTHETIC_SUBJECT_ID),seller:context.wallets.SELLER,buyer:context.wallets.BUYER},role);
      const policyHash=transientHash(new CompactTypeBytes(32),Uint8Array.from(Buffer.from(attestation.policyRequestHash.slice(2),'hex')));
      const message=[BigInt(profile.annualRevenueKrw),BigInt(profile.debtRatioBps),BigInt(profile.overdueCount),123456789n,binding.bindingHashField,binding.deploymentHashField,policyHash,2n,2n,BigInt(attestation.profileAsOf),4000000000n];
      const R={x:BigInt(attestation.signature.announcement.x),y:BigInt(attestation.signature.announcement.y)};
      const challengeScalar=GasokEligibility.pureCircuits.schnorrChallenge(R.x,R.y,keys.pk.x,keys.pk.y,message)%(1n<<248n);
      expect(ecMulGenerator(BigInt(attestation.signature.response))).toEqual(ecAdd(R,ecMul(keys.pk,challengeScalar)));
      expect((await x.post('/attest',{...body,authorization})).status).toBe(401);
    }
    expect(x.resolve).not.toHaveBeenCalled();
  });
  it('rejects reserved IDs in the ordinary provider even with an injected resolver',async()=>{
    const x=await start(false);expect((await x.post('/authorization-challenges',request('SELLER'))).status).toBe(400);expect(x.resolve).not.toHaveBeenCalled();
  });
  it('does not call any network for reserved IDs in the ordinary RPC resolver',async()=>{
    const fetch=vi.fn();vi.stubGlobal('fetch',fetch);
    await expect(createGiwaSepoliaReceivableResolver().resolve(BigInt(SYNTHETIC_SUBJECT_ID))).rejects.toThrow('not found');expect(fetch).not.toHaveBeenCalled();
  });
  it('keeps ordinary IDs on the canonical resolver and requires their existing role signature',async()=>{
    const x=await start();const body={...request('SELLER'),onchainReceivableId:'7'};
    const ch=await x.post('/authorization-challenges',body);expect(ch.status).toBe(201);const challenge=await ch.json() as AuthorizationChallengeResponse;
    expect((await x.post('/attest',{...body,authorization:await proof(challenge,seller)})).status).toBe(200);
    expect(x.resolve).toHaveBeenCalledTimes(2);expect(x.resolve).toHaveBeenCalledWith(7n);
  });
  it('rejects another audience, unlisted profile and wrong role signature without RPC fallback',async()=>{
    const x=await start();const body=request('SELLER');
    expect((await x.post('/authorization-challenges',{...body,policyRequest:{...body.policyRequest,intendedFunderWallet:buyer.address.toLowerCase()}})).status).toBe(400);
    expect((await x.post('/authorization-challenges',{...body,annualRevenueKrw:'1'})).status).toBe(400);
    const challenge=await (await x.post('/authorization-challenges',body)).json() as AuthorizationChallengeResponse;
    expect((await x.post('/attest',{...body,authorization:await proof(challenge,buyer)})).status).toBe(403);expect(x.resolve).not.toHaveBeenCalled();
  });
});
