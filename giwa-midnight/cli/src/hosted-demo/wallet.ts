import { combineLatest, filter, firstValueFrom, timer } from 'rxjs';
import { nativeToken } from '@midnight-ntwrk/midnight-js-protocol/ledger';
import type { WalletContext, WalletStateSnapshot } from '../api.js';

export async function saveWalletCheckpoint(
  context: WalletContext,
  networkId: string,
  maySave: () => boolean,
  persist: (snapshot: WalletStateSnapshot) => Promise<void>,
): Promise<void> {
  if (!maySave() || (await firstValueFrom(context.wallet.state())).pending.all.length > 0) return;
  const [shielded, unshielded, dust] = await Promise.all([
    context.wallet.shielded.serializeState(), context.wallet.unshielded.serializeState(), context.wallet.dust.serializeState(),
  ]);
  if (!maySave() || (await firstValueFrom(context.wallet.state())).pending.all.length > 0) return;
  await persist({ networkId, unshieldedAddress: context.unshieldedKeystore.getBech32Address().asString(), shielded, unshielded, dust });
}

/** Wait for the persistent demo wallet to be able to pay fees, including after a restart. */
export async function prepareDemoDust({ wallet, unshieldedKeystore }: WalletContext): Promise<void> {
  const state = await wallet.waitForSyncedState();
  const nightUtxos = state.unshielded.availableCoins.filter((coin) => coin.utxo.type === nativeToken().raw);
  const unregistered = nightUtxos.filter((coin) => !coin.meta.registeredForDustGeneration);
  if (unregistered.length > 0) {
    // A freshly funded wallet may not yet have generated the registration's own
    // fee. The SDK estimate observes the UTXOs without booking or submitting them.
    const { fee } = await wallet.estimateRegistration(unregistered);
    await wallet.waitForGeneratedDust(unregistered, fee, { timeoutMs: 15 * 60_000 });
    const recipe = await wallet.registerNightUtxosForDustGeneration(
      unregistered,
      unshieldedKeystore.getPublicKey(),
      (payload) => unshieldedKeystore.signData(payload),
    );
    await wallet.submitTransaction(await wallet.finalizeRecipe(recipe));
  } else if (nightUtxos.length === 0 && state.dust.balance(new Date()) <= 0n) {
    throw new Error('The demo wallet has no NIGHT that can generate DUST.');
  }

  // DUST grows with time. A timer also checks a quiet chain, and an already
  // registered wallet at zero balance waits instead of failing on the next Run.
  await firstValueFrom(combineLatest([wallet.state(), timer(0, 1_000)]).pipe(
    filter(([current]) => current.isSynced && current.dust.balance(new Date()) > 0n),
  ));
}
