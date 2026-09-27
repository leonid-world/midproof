import type { SessionOwner } from './gateway.js';

/** Serialize encrypted ownership snapshots without acknowledging an unwritten owner. */
export function createOwnerPersistence(
  owners: Map<string, SessionOwner>,
  write: (snapshot: SessionOwner[]) => Promise<void>,
  now: () => number = Date.now,
): { save(): Promise<void>; flush(): Promise<void> } {
  let tail = Promise.resolve();
  return {
    save() {
      const expiry = BigInt(Math.floor(now() / 1000) - 86_400);
      for (const [id, owner] of owners) if (BigInt(owner.validUntil) < expiry) owners.delete(id);
      const snapshot = [...owners.values()];
      const current = tail.then(() => write(snapshot));
      // Reject this caller on failure, but do not poison later independent saves.
      tail = current.catch(() => undefined);
      return current;
    },
    flush: () => tail,
  };
}
