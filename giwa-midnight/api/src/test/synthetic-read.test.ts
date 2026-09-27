import { describe, expect, it, vi } from 'vitest';
import { GasokEligibility } from 'zkloan-credit-scorer-contract';
import { SYNTHETIC_SUBJECT_ID, validateSyntheticContext } from '../../../shared/synthetic-context.mjs';
import { resolveExactProofCapability } from '../resolve.js';
import { verifyProofCapability } from '../capability.js';
import { createValidCapability } from './fixture.js';
import type { ProofCapabilityV2 } from '../types.js';
const bytes=(value:string)=>Uint8Array.from(Buffer.from(value.replace(/^0x/,''),'hex'));
function capability(overrides:Partial<ProofCapabilityV2>={}) {
  const cap=createValidCapability({onchainReceivableId:SYNTHETIC_SUBJECT_ID,...overrides});
  const binding=GasokEligibility.pureCircuits.deriveGiwaReceivableBindingHash(BigInt(cap.giwaChainId),bytes(cap.receivableFinanceAddress),{
    receivableId:bytes(BigInt(cap.onchainReceivableId).toString(16).padStart(64,'0')),subjectRole:cap.subjectRole==='SELLER'?1n:2n,partyWallet:bytes(cap.partyWallet)});
  const policy=GasokEligibility.pureCircuits.derivePolicyRequestHash({requestId:bytes(cap.requestId),intendedFunderWallet:bytes(cap.intendedFunderWallet),minAnnualRevenueKrw:BigInt(cap.minAnnualRevenueKrw),maxDebtRatioBps:BigInt(cap.maxDebtRatioBps),maxOverdueCount:BigInt(cap.maxOverdueCount),validUntil:BigInt(cap.validUntil)});
  cap.policyRequestHash=`0x${Buffer.from(policy).toString('hex')}`;
  cap.lookupKey=`0x${Buffer.from(GasokEligibility.pureCircuits.deriveReceivableEligibilityKey(bytes(cap.companyCommitment),binding,GasokEligibility.pureCircuits.deriveMidnightDeploymentHash(bytes(cap.midnightContractAddress)),policy)).toString('hex')}`;
  return cap;
}
const sample=capability();
const context=validateSyntheticContext({...sample,wallets:{SELLER:sample.partyWallet,BUYER:`0x${'5'.repeat(40)}`}});
describe('isolated synthetic independent read',()=>{
  it('rejects a valid synthetic capability at the normal reader before chain lookup',async()=>{
    const read=vi.fn();await expect(resolveExactProofCapability(sample,sample.midnightContractAddress,read,'2')).rejects.toMatchObject({code:'UNAPPROVED_GIWA_CONTEXT'});expect(read).not.toHaveBeenCalled();
  });
  it.each([true,false])('resolves actual independent eligible=%s only with the exact demo context',async(eligible)=>{
    const read=vi.fn(async()=>({eligible,providerId:'2',evaluationVersion:2 as const,profileAsOf:sample.profileAsOf,validUntil:sample.validUntil}));
    const result=await resolveExactProofCapability(sample,sample.midnightContractAddress,read,'2',undefined,()=>2100000000n,context);
    expect(result.result.eligible).toBe(eligible);expect(read).toHaveBeenCalledOnce();
  });
  it('rejects correctly rehashed altered role/audience/subject and ordinary capabilities',()=>{
    for(const cap of [capability({partyWallet:`0x${'6'.repeat(40)}`}),capability({intendedFunderWallet:`0x${'6'.repeat(40)}`}),capability({onchainReceivableId:'7'}),capability({subjectRole:'BUYER'})]) {
      expect(()=>verifyProofCapability(cap,cap.midnightContractAddress,context)).toThrow();
    }
  });
  it('still verifies exact lookup hash and Provider 2 on the synthetic path',async()=>{
    expect(()=>verifyProofCapability({...sample,lookupKey:`0x${'8'.repeat(64)}`},sample.midnightContractAddress,context)).toThrow();
    const read=vi.fn(async()=>({eligible:true,providerId:'1',evaluationVersion:2 as const,profileAsOf:sample.profileAsOf,validUntil:sample.validUntil}));
    await expect(resolveExactProofCapability(sample,sample.midnightContractAddress,read,'2',undefined,()=>2100000000n,context)).rejects.toMatchObject({code:'UNAPPROVED_ATTESTATION_PROVIDER'});
  });
});
