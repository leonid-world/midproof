// A funding-independent CLI check of the real Compact proof pipeline. It never
// submits to a network and uses only fresh in-memory keys and synthetic tuples.
import { randomBytes } from 'node:crypto';
import { setNetworkId } from '@midnight-ntwrk/midnight-js-network-id';
import { createUnprovenDeployTxFromVerifierKeys, createUnprovenCallTxFromInitialStates } from '@midnight-ntwrk/midnight-js-contracts';
import { sampleSigningKey, CompactTypeBytes, transientHash, ChargedState, ContractState } from '@midnight-ntwrk/midnight-js-protocol/compact-runtime';
import { ZswapSecretKeys, ZswapChainState, LedgerParameters, LedgerState, WellFormedStrictness, TransactionContext } from '@midnight-ntwrk/midnight-js-protocol/ledger';
import { NodeZkConfigProvider } from '@midnight-ntwrk/midnight-js-node-zk-config-provider';
import { httpClientProofProvider } from '@midnight-ntwrk/midnight-js-http-client-proof-provider';
import { GasokEligibility } from 'zkloan-credit-scorer-contract';
import { generateKeyPair, signFinancialData } from 'zkloan-credit-scorer-attestation-api/signing';
import { gasokEligibilityCompiledContract } from '../api.js';
import { contractConfig } from '../config.js';
import { getInitialPrivateState } from '../state.utils.js';
import { getDefaultGiwaDeploymentConfig } from '../giwa.js';
import { DEMO_PROFILES } from './config.js';
const { pureCircuits, ledger } = GasokEligibility;
let phase = 'initializing';
async function main(): Promise<void> {
setNetworkId('preview');
const zk = new NodeZkConfigProvider(contractConfig.zkConfigPath);
const proverUrl = process.env.MIDNIGHT_PROOF_SERVER_URL ?? 'http://127.0.0.1:6300';
const prover = httpClientProofProvider(proverUrl, zk);
// This isolated ledger validates contract/native proofs. Funding balance and
// wallet signatures are intentionally outside this funding-independent check.
const strictness = new WellFormedStrictness();
strictness.enforceBalancing = false;
strictness.verifySignatures = false;
strictness.verifyContractProofs = true;
strictness.verifyNativeProofs = true;
strictness.enforceLimits = true;
const applyVerified = (state: LedgerState, transaction: Awaited<ReturnType<typeof prover.proveTx>>): LedgerState => {
  const time = new Date();
  const verified = transaction.wellFormed(state, strictness, time);
  const [next, result] = state.apply(verified, new TransactionContext(state, {
    secondsSinceEpoch: BigInt(Math.floor(time.getTime() / 1000)), secondsSinceEpochErr: 0,
    parentBlockHash: '00'.repeat(32), lastBlockTime: BigInt(Math.floor(time.getTime() / 1000)) - 1n,
  }));
  if (result.type !== 'success') throw new Error('Isolated ledger rejected the transaction.');
  return next;
};
const keys = ZswapSecretKeys.fromSeed(randomBytes(32));
const initialPrivateState = getInitialPrivateState(randomBytes(32));
const giwa = getDefaultGiwaDeploymentConfig();
const provider = generateKeyPair();
const deploy = await createUnprovenDeployTxFromVerifierKeys(zk, keys.coinPublicKey, { compiledContract: gasokEligibilityCompiledContract, signingKey: sampleSigningKey(), initialPrivateState, args: [giwa.chainId, giwa.receivableFinanceAddress] }, keys.encryptionPublicKey);
phase = 'verifying_deployment';
const deployedLedger = applyVerified(LedgerState.blank('preview'), await prover.proveTx(deploy.private.unprovenTx));
const base = { compiledContract: gasokEligibilityCompiledContract, contractAddress: deploy.public.contractAddress, coinPublicKey: keys.coinPublicKey, initialZswapChainState: new ZswapChainState(), ledgerParameters: LedgerParameters.initialParameters() };
const registered = await createUnprovenCallTxFromInitialStates(zk, { ...base, circuitId: 'registerProvider', initialContractState: deploy.public.initialContractState, initialPrivateState, args: [2n, provider.pk] }, keys.encryptionPublicKey);
phase = 'verifying_provider_registration';
const registeredLedger = applyVerified(deployedLedger, await prover.proveTx(registered.private.unprovenTx));
const registeredState = deploy.public.initialContractState;
registeredState.data = new ChargedState(registered.public.nextContractState);
const bytes32 = new CompactTypeBytes(32);
const field = (bytes: Uint8Array) => transientHash(bytes32, bytes);
const profileAsOf = BigInt(Math.floor(Date.now() / 1000));
const networkVersion = await fetch(`${proverUrl}/version`).then((r) => r.text());
if (!/8\.1\.0/.test(networkVersion)) throw new Error('Expected native Proof Server 8.1.0.');
for (const subjectRole of [1n, 2n]) {
const subject = { receivableId: Uint8Array.from(Buffer.from('1'.padStart(64, '0'), 'hex')), subjectRole, partyWallet: randomBytes(20) };
for (const fixture of DEMO_PROFILES) {
  const nonce = 1234n;
  const policy = { requestId: randomBytes(32), intendedFunderWallet: randomBytes(20), minAnnualRevenueKrw: 500_000_000n, maxDebtRatioBps: 20_000n, maxOverdueCount: 1n, validUntil: profileAsOf + 86400n };
  const companyCommitment = pureCircuits.deriveCompanyCommitment(initialPrivateState.companySecretKey, nonce, policy.requestId);
  const binding = pureCircuits.deriveGiwaReceivableBindingHash(giwa.chainId, giwa.receivableFinanceAddress, subject);
  const deployment = pureCircuits.deriveMidnightDeploymentHash(Buffer.from(deploy.public.contractAddress, 'hex'));
  const policyHash = pureCircuits.derivePolicyRequestHash(policy);
  const signature = signFinancialData(provider.sk, fixture.annualRevenueKrw, fixture.debtRatioBps, fixture.overdueCount, field(companyCommitment), field(binding), field(deployment), field(policyHash), 2n, 2n, profileAsOf, policy.validUntil);
  const witness = { ...initialPrivateState, annualRevenueKrw: fixture.annualRevenueKrw, debtRatioBps: fixture.debtRatioBps, overdueCount: fixture.overdueCount, attestationSignature: signature, attestationProviderId: 2n, attestationProfileAsOf: profileAsOf };
  const tx = await createUnprovenCallTxFromInitialStates(zk, { ...base, circuitId: 'verifyEligibility', initialContractState: registeredState, initialPrivateState: witness, args: [nonce, subject, policy] }, keys.encryptionPublicKey);
  const started = Date.now();
  phase = `proving_${subjectRole === 1n ? 'seller' : 'buyer'}_${fixture.id}`;
  const proven = await prover.proveTx(tx.private.unprovenTx);
  phase = `verifying_${subjectRole === 1n ? 'seller' : 'buyer'}_${fixture.id}`;
  const verifiedLedger = applyVerified(registeredLedger, proven);
  const key = pureCircuits.deriveReceivableEligibilityKey(companyCommitment, binding, deployment, policyHash);
  // Ledger-v8 and Compact runtime have distinct WASM object identities. Cross
  // this boundary through canonical serialization, as the Indexer reader does.
  const publicData = ContractState.deserialize(verifiedLedger.index(deploy.public.contractAddress)!.serialize()).data;
  const result = ledger(publicData).eligibilityResults.lookup(key);
  if (result.eligible !== (fixture.id === 'steady') || result.providerId !== 2n) throw new Error('Unexpected synthetic public result.');
  process.stdout.write(JSON.stringify({ check: 'native-zk-proof', subjectRole: subjectRole === 1n ? 'SELLER' : 'BUYER', profileId: fixture.id, proofBytes: proven.serialize().length, eligible: result.eligible, contractProofVerified: true, isolatedLedgerApplied: true, fundingAndWalletSignaturesChecked: false, elapsedMs: Date.now() - started, submittedToNetwork: false }) + '\n');
}
}
keys.clear();

}
void main().catch(() => { process.stderr.write(JSON.stringify({ check: 'native-zk-proof', code: 'PROOF_CHECK_FAILED', phase }) + '\n'); process.exitCode = 1; });
