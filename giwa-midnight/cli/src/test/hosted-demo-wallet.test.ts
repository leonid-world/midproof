import { BehaviorSubject } from 'rxjs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { nativeToken } from '@midnight-ntwrk/midnight-js-protocol/ledger';
import { createWalletAndMidnightProvider, type WalletContext } from '../api.js';
import { prepareDemoDust, saveWalletCheckpoint } from '../hosted-demo/wallet.js';

afterEach(() => vi.useRealTimers());

function walletFixture(registered: boolean, initialDust = 0n) {
  let balance = initialDust;
  const coin = { utxo: { type: nativeToken().raw }, meta: { registeredForDustGeneration: registered } };
  const state = { isSynced: true, unshielded: { availableCoins: [coin] }, dust: { balance: () => balance } };
  const states = new BehaviorSubject(state);
  const events: string[] = [];
  const wallet = {
    waitForSyncedState: vi.fn(async () => state),
    state: () => states,
    estimateRegistration: vi.fn(async () => { events.push('estimate'); return { fee: 7n }; }),
    waitForGeneratedDust: vi.fn(async () => { events.push('wait'); }),
    registerNightUtxosForDustGeneration: vi.fn(async () => { events.push('register'); return 'recipe'; }),
    finalizeRecipe: vi.fn(async () => 'transaction'),
    submitTransaction: vi.fn(async () => { events.push('submit'); balance = 1n; }),
  };
  const context = { wallet, unshieldedKeystore: { getPublicKey: () => 'public-key', signData: () => 'signature' } } as unknown as WalletContext;
  return { wallet, context, events, setBalance: (value: bigint) => { balance = value; } };
}

describe('hosted demo DUST bootstrap', () => {
  it('waits for the estimated registration fee before booking and submitting a fresh NIGHT UTXO', async () => {
    const fixture = walletFixture(false);
    await prepareDemoDust(fixture.context);
    expect(fixture.events).toEqual(['estimate', 'wait', 'register', 'submit']);
    expect(fixture.wallet.waitForGeneratedDust).toHaveBeenCalledWith(expect.any(Array), 7n, { timeoutMs: 900_000 });
  });

  it('waits for time-based DUST generation after a restart without registering the same UTXO again', async () => {
    vi.useFakeTimers();
    const fixture = walletFixture(true);
    let completed = false;
    const ready = prepareDemoDust(fixture.context).then(() => { completed = true; });
    await vi.advanceTimersByTimeAsync(1_000);
    expect(completed).toBe(false);
    fixture.setBalance(1n);
    await vi.advanceTimersByTimeAsync(1_000);
    await ready;
    expect(fixture.wallet.registerNightUtxosForDustGeneration).not.toHaveBeenCalled();
  });
});

describe('wallet checkpoint after a failed proof', () => {
  it('releases a booked fee UTXO when finalization fails before there is a pending transaction', async () => {
    let reserved = false;
    const recipe = { type: 'UNBOUND_TRANSACTION' };
    const failure = new Error('Synthetic prover failure');
    const revert = vi.fn(async () => { reserved = false; });
    const context = { wallet: {
      state: () => new BehaviorSubject({ isSynced: true, pending: { all: [] } }),
      balanceUnboundTransaction: vi.fn(async () => { reserved = true; return recipe; }),
      finalizeRecipe: vi.fn(async () => { throw failure; }),
      revert,
    } } as unknown as WalletContext;
    const provider = await createWalletAndMidnightProvider(context);
    await expect(provider.balanceTx({} as Parameters<typeof provider.balanceTx>[0])).rejects.toBe(failure);
    expect(revert).toHaveBeenCalledWith(recipe);
    expect(reserved).toBe(false);
  });

  it('preserves the previous checkpoint after failure even when the pending list is empty', async () => {
    const persist = vi.fn();
    const serializeState = vi.fn(async () => 'serialized');
    const context = { wallet: {
      state: () => new BehaviorSubject({ pending: { all: [] } }),
      shielded: { serializeState }, unshielded: { serializeState }, dust: { serializeState },
    } } as unknown as WalletContext;
    await saveWalletCheckpoint(context, 'preview', () => false, persist);
    expect(serializeState).not.toHaveBeenCalled();
    expect(persist).not.toHaveBeenCalled();
  });

  it('discards a checkpoint if a proof starts while the SDK is serializing it', async () => {
    let allowed = true;
    const persist = vi.fn();
    const serializeState = vi.fn(async () => { allowed = false; return 'serialized'; });
    const context = { wallet: {
      state: () => new BehaviorSubject({ pending: { all: [] } }),
      shielded: { serializeState }, unshielded: { serializeState }, dust: { serializeState },
    } } as unknown as WalletContext;
    await saveWalletCheckpoint(context, 'preview', () => allowed, persist);
    expect(persist).not.toHaveBeenCalled();
  });
});
