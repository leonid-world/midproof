import { verifyContractState } from '@midnight-ntwrk/midnight-js-contracts';
import { assertIsContractAddress } from '@midnight-ntwrk/midnight-js-utils';
import type { GasokEligibilityCircuits, GasokEligibilityProviders } from '../common-types.js';

const REQUIRED_CIRCUITS: GasokEligibilityCircuits[] = [
  'verifyEligibility', 'registerProvider', 'removeProvider', 'rotateAdmin',
];

export interface ContractCompatibilityProviders {
  readonly publicDataProvider: Pick<GasokEligibilityProviders['publicDataProvider'], 'queryContractState'>;
  readonly zkConfigProvider: Pick<GasokEligibilityProviders['zkConfigProvider'], 'getVerifierKeys'>;
}

export class ContractCompatibilityError extends Error {
  readonly code: 'CONTRACT_COMPATIBILITY_UNAVAILABLE' | 'CONTRACT_VERIFIER_MISMATCH';

  constructor(code: ContractCompatibilityError['code']) {
    super(code === 'CONTRACT_VERIFIER_MISMATCH'
      ? 'The existing deployment uses different contract verification keys. Preserve its state and review an explicit migration.'
      : 'The existing deployment verification keys could not be checked.');
    this.name = 'ContractCompatibilityError';
    this.code = code;
  }
}

/** Read-only preflight. Never deploy, replace keys, or initialize private state. */
export async function assertCompatibleContractDeployment(
  providers: ContractCompatibilityProviders,
  contractAddress: string,
): Promise<void> {
  assertIsContractAddress(contractAddress);
  let state: Awaited<ReturnType<ContractCompatibilityProviders['publicDataProvider']['queryContractState']>>;
  let verifierKeys: Awaited<ReturnType<ContractCompatibilityProviders['zkConfigProvider']['getVerifierKeys']>>;
  try {
    state = await providers.publicDataProvider.queryContractState(contractAddress);
    verifierKeys = await providers.zkConfigProvider.getVerifierKeys([...REQUIRED_CIRCUITS]);
  } catch {
    throw new ContractCompatibilityError('CONTRACT_COMPATIBILITY_UNAVAILABLE');
  }
  if (!state || verifierKeys.length !== REQUIRED_CIRCUITS.length ||
      new Set(verifierKeys.map(([id]) => id)).size !== REQUIRED_CIRCUITS.length ||
      REQUIRED_CIRCUITS.some((id) => !verifierKeys.some(([candidate]) => candidate === id))) {
    throw new ContractCompatibilityError('CONTRACT_COMPATIBILITY_UNAVAILABLE');
  }
  try {
    // The SDK compares every operation's serialized verifierKey bytes. Its
    // normal findDeployedContract repeats this check; doing it here gives a
    // fixed startup failure before join and avoids logging the full state.
    verifyContractState(verifierKeys, state);
  } catch {
    throw new ContractCompatibilityError('CONTRACT_VERIFIER_MISMATCH');
  }
}
