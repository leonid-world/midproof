import { firstValueFrom, timeout, type Observable } from 'rxjs';
import { ContractMaintenanceError } from './contract-maintenance.js';

/** Run before preparing this maintenance transaction. finalizeRecipe creates its
 * own pending entry, so this check must not be reused at the broadcast boundary.
 */
export async function assertMaintenanceWalletIdle(
  state: Observable<{ isSynced: boolean; pending: { all: ReadonlyArray<unknown> } }>,
  timeoutMs = 5000,
): Promise<void> {
  try {
    const current = await firstValueFrom(state.pipe(timeout({ first: timeoutMs })));
    if (!current.isSynced || current.pending.all.length !== 0) {
      throw new ContractMaintenanceError('CONTRACT_MAINTENANCE_PENDING_WALLET');
    }
  } catch (error) {
    if (error instanceof ContractMaintenanceError) throw error;
    throw new ContractMaintenanceError('CONTRACT_MAINTENANCE_WALLET_UNAVAILABLE');
  }
}
