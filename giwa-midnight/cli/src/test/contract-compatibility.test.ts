import { fileURLToPath } from 'node:url';
import { ContractOperation, ContractState } from '@midnight-ntwrk/midnight-js-protocol/compact-runtime';
import { NodeZkConfigProvider } from '@midnight-ntwrk/midnight-js-node-zk-config-provider';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import type { GasokEligibilityCircuits } from '../common-types.js';
import { assertCompatibleContractDeployment } from '../hosted-demo/contract-compatibility.js';

const address = 'aa'.repeat(32);
const circuits: GasokEligibilityCircuits[] = ['verifyEligibility', 'registerProvider', 'removeProvider', 'rotateAdmin'];
const local = new NodeZkConfigProvider<GasokEligibilityCircuits>(
  fileURLToPath(new URL('../../../contract/src/managed/zkloan-credit-scorer', import.meta.url)),
);
let keys: Awaited<ReturnType<typeof local.getVerifierKeys>>;
beforeAll(async () => { keys = await local.getVerifierKeys(circuits); });

function stateWithKeys(omit?: GasokEligibilityCircuits, mismatch = false): ContractState {
  const state = new ContractState();
  for (const [id, key] of keys) {
    if (id === omit) continue;
    const operation = new ContractOperation();
    operation.verifierKey = mismatch && id === 'verifyEligibility' ? keys[1][1] : key;
    state.setOperation(id, operation);
  }
  // Round-trip through actual ledger serialization, as a network query does.
  return ContractState.deserialize(state.serialize());
}

describe('existing deployment verifier compatibility', () => {
  it('accepts all matching on-chain serialized keys without a join or mutation', async () => {
    const query = vi.fn(async () => stateWithKeys());
    const readKeys = vi.fn((ids: GasokEligibilityCircuits[]) => local.getVerifierKeys(ids));
    await expect(assertCompatibleContractDeployment({ publicDataProvider: { queryContractState: query },
      zkConfigProvider: { getVerifierKeys: readKeys } }, address)).resolves.toBeUndefined();
    expect(query).toHaveBeenCalledWith(address);
    expect(readKeys).toHaveBeenCalledWith(circuits);
  });

  it('rejects a valid but different serialized verifier before joining', async () => {
    await expect(assertCompatibleContractDeployment({
      publicDataProvider: { queryContractState: async () => stateWithKeys(undefined, true) }, zkConfigProvider: local,
    }, address)).rejects.toMatchObject({ code: 'CONTRACT_VERIFIER_MISMATCH' });
  });

  it.each(circuits)('rejects a missing deployed %s operation', async (id) => {
    await expect(assertCompatibleContractDeployment({
      publicDataProvider: { queryContractState: async () => stateWithKeys(id) }, zkConfigProvider: local,
    }, address)).rejects.toMatchObject({ code: 'CONTRACT_VERIFIER_MISMATCH' });
  });

  it.each(['absent', 'upstream-error', 'missing-local-key'] as const)('fails closed when comparison is unavailable: %s', async (mode) => {
    const queryContractState = async () => {
      if (mode === 'upstream-error') throw new Error('upstream response must not be reflected');
      return mode === 'absent' ? null : stateWithKeys();
    };
    const getVerifierKeys = async () => mode === 'missing-local-key' ? keys.slice(1) : keys;
    await expect(assertCompatibleContractDeployment({ publicDataProvider: { queryContractState },
      zkConfigProvider: { getVerifierKeys } }, address))
      .rejects.toMatchObject({ code: 'CONTRACT_COMPATIBILITY_UNAVAILABLE',
        message: 'The existing deployment verification keys could not be checked.' });
  });
});
