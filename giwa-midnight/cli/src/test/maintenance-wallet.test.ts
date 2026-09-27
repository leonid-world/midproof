import { BehaviorSubject, Observable, throwError } from 'rxjs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { assertMaintenanceWalletIdle } from '../hosted-demo/maintenance-wallet.js';

afterEach(() => vi.useRealTimers());
describe('maintenance wallet preflight before preparation', () => {
  it('accepts only a synced empty pending queue', async () => {
    await expect(assertMaintenanceWalletIdle(new BehaviorSubject({ isSynced: true, pending: { all: [] } }))).resolves.toBeUndefined();
  });
  it.each([false, true])('rejects an unsafe queue before signing (synced=%s)', async (synced) => {
    await expect(assertMaintenanceWalletIdle(new BehaviorSubject({ isSynced: synced, pending: { all: synced ? ['synthetic pending transaction'] : [] } })))
      .rejects.toMatchObject({ code: 'CONTRACT_MAINTENANCE_PENDING_WALLET' });
  });
  it('times out and unsubscribes from a wallet that never produces state', async () => {
    vi.useFakeTimers(); const unsubscribe = vi.fn();
    const state = new Observable<{ isSynced: boolean; pending: { all: [] } }>(() => unsubscribe);
    const result = expect(assertMaintenanceWalletIdle(state, 20)).rejects.toMatchObject({ code: 'CONTRACT_MAINTENANCE_WALLET_UNAVAILABLE' });
    await vi.advanceTimersByTimeAsync(20); await result;
    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });
  it('does not expose a private SDK error', async () => {
    await expect(assertMaintenanceWalletIdle(throwError(() => new Error('synthetic-private-wallet-details'))))
      .rejects.toMatchObject({ code: 'CONTRACT_MAINTENANCE_WALLET_UNAVAILABLE', message: expect.not.stringContaining('synthetic-private-wallet-details') });
  });
});
