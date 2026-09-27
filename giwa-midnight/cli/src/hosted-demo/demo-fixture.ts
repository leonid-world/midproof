import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { SYNTHETIC_SUBJECT_ID, validateSyntheticContext } from '../../../shared/synthetic-context.mjs';
import { readEncryptedJson, writeEncryptedJson } from './state.js';
import { constants, promises as fs } from 'node:fs';
import { Wallet } from 'ethers';
import { GIWA_CHAIN_ID, RECEIVABLE_FINANCE_ADDRESS, type SubjectRole } from '../giwa.js';
import {
  AUTHORIZATION_DOMAIN, AUTHORIZATION_FIELDS, AUTHORIZATION_PRIMARY_TYPE, AUTHORIZATION_PURPOSE,
  hashAuthorizationChallenge, validateAuthorizationProof, type AuthorizationChallenge,
  type AuthorizationProof, type FunderPolicyRequestWire,
} from '../authorization.js';
import type { DemoConfig, DemoNetwork } from './config.js';

export interface DemoFixture {
  networkId: DemoNetwork;
  giwaChainId: string;
  receivableFinanceAddress: string;
  onchainReceivableId: string;
  intendedFunderWallet: string;
  wallets: Readonly<Record<SubjectRole, string>>;
  sign(challenge: AuthorizationChallenge, expected: FunderPolicyRequestWire & {
    midnightContractAddress: string; subjectRole: SubjectRole;
  }): Promise<AuthorizationProof>;
}
const address = (value: unknown): value is string => typeof value === 'string' && /^0x[0-9a-fA-F]{40}$/.test(value) && !/^0x0{40}$/.test(value);
export function parseDemoFixture(value: unknown, networkId: DemoNetwork): DemoFixture {
  const row = value as Record<string, unknown>;
  const keys = ['version', 'networkId', 'giwaChainId', 'receivableFinanceAddress', 'onchainReceivableId', 'sellerPrivateKey', 'buyerPrivateKey', 'intendedFunderWallet'];
  if (!row || typeof row !== 'object' || Object.keys(row).sort().join() !== keys.sort().join()
      || row.version !== 1 || row.networkId !== networkId || row.giwaChainId !== GIWA_CHAIN_ID.toString()
      || row.receivableFinanceAddress !== RECEIVABLE_FINANCE_ADDRESS || !address(row.intendedFunderWallet)
      || typeof row.onchainReceivableId !== 'string' || !/^[1-9][0-9]{0,77}$/.test(row.onchainReceivableId)
      || BigInt(row.onchainReceivableId) >= (1n << 256n)
      || typeof row.sellerPrivateKey !== 'string' || !/^0x[0-9a-fA-F]{64}$/.test(row.sellerPrivateKey)
      || typeof row.buyerPrivateKey !== 'string' || !/^0x[0-9a-fA-F]{64}$/.test(row.buyerPrivateKey)) throw new Error('DEMO_FIXTURE_INVALID');
  const signers = { SELLER: new Wallet(row.sellerPrivateKey), BUYER: new Wallet(row.buyerPrivateKey) };
  const wallets = Object.freeze({ SELLER: signers.SELLER.address.toLowerCase(), BUYER: signers.BUYER.address.toLowerCase() });
  const funder = row.intendedFunderWallet.toLowerCase();
  if (new Set([wallets.SELLER, wallets.BUYER, funder]).size !== 3) throw new Error('DEMO_FIXTURE_ROLES_INVALID');
  const id = row.onchainReceivableId;
  return Object.freeze({
    networkId, giwaChainId: GIWA_CHAIN_ID.toString(), receivableFinanceAddress: RECEIVABLE_FINANCE_ADDRESS,
    onchainReceivableId: id, intendedFunderWallet: funder, wallets,
    async sign(challenge: AuthorizationChallenge, expected: FunderPolicyRequestWire & { midnightContractAddress: string; subjectRole: SubjectRole }) {
      const message = challenge.message; const now = BigInt(Math.floor(Date.now() / 1000));
      const types = { [AUTHORIZATION_PRIMARY_TYPE]: AUTHORIZATION_FIELDS.map((field) => ({ ...field })) };
      if (challenge.version !== 2 || challenge.primaryType !== AUTHORIZATION_PRIMARY_TYPE
          || JSON.stringify(challenge.domain) !== JSON.stringify(AUTHORIZATION_DOMAIN)
          || JSON.stringify(challenge.types) !== JSON.stringify(types)
          || message.purpose !== AUTHORIZATION_PURPOSE || message.providerId !== '2' || message.evaluationVersion !== '2'
          || message.midnightContractAddress !== `0x${expected.midnightContractAddress}`
          || message.receivableFinanceAddress !== RECEIVABLE_FINANCE_ADDRESS || message.onchainReceivableId !== id
          || message.subjectRole !== expected.subjectRole || message.partyWallet !== wallets[expected.subjectRole]
          || message.requestId !== expected.requestId || message.intendedFunderWallet !== funder
          || message.minAnnualRevenueKrw !== expected.minAnnualRevenueKrw || message.maxDebtRatioBps !== expected.maxDebtRatioBps
          || message.maxOverdueCount !== expected.maxOverdueCount || message.policyValidUntil !== expected.validUntil
          || !/^0x[0-9a-f]{64}$/.test(message.authorizationId) || /^0x0{64}$/.test(message.authorizationId)
          || !/^0x[0-9a-f]{64}$/.test(message.attestationRequestCommitment) || /^0x0{64}$/.test(message.attestationRequestCommitment)
          || BigInt(message.issuedAt) > now || BigInt(message.expiresAt) <= now || message.profileAsOf !== message.issuedAt
          || BigInt(message.expiresAt) > BigInt(expected.validUntil) || BigInt(message.expiresAt) - BigInt(message.issuedAt) > 120n) {
        throw new Error('DEMO_SIGNING_CONTEXT_REJECTED');
      }
      const signer = signers[expected.subjectRole];
      const signature = await signer.signTypedData(AUTHORIZATION_DOMAIN, types, message);
      return validateAuthorizationProof({ version: 2, authorizationId: message.authorizationId,
        typedDataHash: hashAuthorizationChallenge(challenge), signer: signer.address.toLowerCase(), signature }, challenge);
    },
  });
}
export async function loadDemoFixture(networkId: DemoNetwork, file = process.env.MIDPROOF_DEMO_FIXTURE_FILE): Promise<DemoFixture | undefined> {
  if (!file) return undefined;
  const handle = await fs.open(file, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const stat = await handle.stat();
    if (!stat.isFile() || stat.nlink !== 1 || stat.size > 8192 || (stat.mode & 0o077) !== 0) throw new Error('DEMO_FIXTURE_PRIVATE_FILE_REQUIRED');
    return parseDemoFixture(JSON.parse(await handle.readFile('utf8')), networkId);
  } finally { await handle.close(); }
}

/** Internal authorization keys only: no EVM provider, balance, asset or faucet. */
export async function loadSyntheticDemoFixture(config: DemoConfig, password: string): Promise<DemoFixture | undefined> {
  if (config.syntheticOnly !== true) return undefined;
  const file = path.join(config.stateDir, 'synthetic-auth.enc');
  let value = await readEncryptedJson<Record<string, unknown>>(file, password);
  if (value === null) {
    // A partial deletion must not replace the identity of persisted demo runs.
    try {
      await fs.lstat(path.join(config.stateDir, 'synthetic-demo-runs.enc'));
      throw new Error('SYNTHETIC_AUTH_STATE_MISSING');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
    // The hosted state process lock is acquired before this factory is called.
    value = { version: 1, networkId: config.networkId, giwaChainId: GIWA_CHAIN_ID.toString(),
      receivableFinanceAddress: RECEIVABLE_FINANCE_ADDRESS, onchainReceivableId: SYNTHETIC_SUBJECT_ID,
      sellerPrivateKey: Wallet.createRandom().privateKey, buyerPrivateKey: Wallet.createRandom().privateKey,
      intendedFunderWallet: `0x${randomBytes(20).toString('hex')}` };
    validateSyntheticContext(parseDemoFixture(value, config.networkId));
    await writeEncryptedJson(file, password, value);
  }
  const fixture = parseDemoFixture(value, config.networkId);
  validateSyntheticContext(fixture);
  return fixture;
}
