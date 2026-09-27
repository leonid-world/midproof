import { describe, expect, it, vi } from 'vitest';
import { createOwnerPersistence } from '../hosted-demo/owners.js';
import type { SessionOwner } from '../hosted-demo/gateway.js';

const owner = (id: string): SessionOwner => ({ sessionId: id, actorId: '21', requestId: `request-${id}`, validUntil: '2000' });

describe('durable session ownership writes', () => {
  it('rejects the failed save but really retries the next healthy write', async () => {
    const owners = new Map([['first', owner('first')]]);
    const write = vi.fn<(snapshot: SessionOwner[]) => Promise<void>>()
      .mockRejectedValueOnce(new Error('temporary write failure')).mockResolvedValue(undefined);
    const persistence = createOwnerPersistence(owners, write, () => 1_000_000);
    await expect(persistence.save()).rejects.toThrow('temporary write failure');
    // This is the gateway's rollback of an ownership snapshot that was not durable.
    owners.delete('first'); owners.set('second', owner('second'));
    await expect(persistence.save()).resolves.toBeUndefined();
    expect(write).toHaveBeenCalledTimes(2);
    expect(write.mock.calls[1][0]).toEqual([owner('second')]);
    await expect(persistence.flush()).resolves.toBeUndefined();
  });

  it('keeps later snapshots queued until the earlier write finishes', async () => {
    let release!: () => void;
    const firstWrite = new Promise<void>((resolve) => { release = resolve; });
    const owners = new Map([['first', owner('first')]]);
    const write = vi.fn<(snapshot: SessionOwner[]) => Promise<void>>()
      .mockImplementationOnce(() => firstWrite).mockResolvedValue(undefined);
    const persistence = createOwnerPersistence(owners, write, () => 1_000_000);
    const first = persistence.save();
    owners.set('second', owner('second'));
    const second = persistence.save();
    await Promise.resolve();
    expect(write).toHaveBeenCalledTimes(1);
    expect(write.mock.calls[0][0]).toEqual([owner('first')]);
    release(); await Promise.all([first, second]);
    expect(write.mock.calls[1][0]).toEqual([owner('first'), owner('second')]);
  });

  it('prunes only ownership past its separate recovery retention horizon', async () => {
    const owners = new Map([
      ['old', { ...owner('old'), validUntil: '999' }],
      ['boundary', { ...owner('boundary'), validUntil: '1000' }],
      ['live', { ...owner('live'), validUntil: '90000' }],
    ]);
    const write = vi.fn(async (_snapshot: SessionOwner[]) => undefined);
    await createOwnerPersistence(owners, write, () => 87_400_000).save();
    expect([...owners.keys()]).toEqual(['boundary', 'live']);
    expect(write.mock.calls[0][0]).toHaveLength(2);
  });
});
