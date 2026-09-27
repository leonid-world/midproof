import { createDecipheriv, createHash, scryptSync } from 'node:crypto';
import { constants, promises as fs } from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { snapshotEncryptedState } from '../hosted-demo/state-backup.js';

const password = 'Synthetic-Backup-Fixture-Password-Only';
const migration = { contractAddress: 'ab'.repeat(32), oldSha256: 'cd'.repeat(32), newSha256: 'ef'.repeat(32), expectedCounter: '0' };
const transition = createHash('sha256').update(JSON.stringify(migration)).digest('hex');
const roots: string[] = [];
afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(roots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true })));
});
async function fixture() {
  const root = await fs.mkdtemp('/private/tmp/gasok-encrypted-backup-'); roots.push(root);
  await fs.chmod(root, 0o700);
  await fs.mkdir(path.join(root, 'private-state'), { mode: 0o700 });
  const files: Record<string, Buffer> = {
    'identity.enc': Buffer.from('synthetic encrypted identity bytes'),
    'wallet-state.enc': Buffer.from('synthetic encrypted wallet bytes'),
    'deployment.json': Buffer.from(JSON.stringify({ networkId: 'preview', contractAddress: migration.contractAddress })),
    'session-owners.enc': Buffer.from('synthetic encrypted correlation bytes'),
    'storage-password': Buffer.from(password),
    'private-state/000001.ldb': Buffer.alloc(200_000, 13),
  };
  for (const [name, content] of Object.entries(files)) await fs.writeFile(path.join(root, name), content, { mode: 0o600 });
  await fs.writeFile(path.join(root, 'private-state.lock'), 'synthetic active process lock', { mode: 0o600 });
  const options = { stateDir: root, password, migration };
  return { root, options, files, backups: path.join(root, 'maintenance-backups'),
    destination: path.join(root, 'maintenance-backups', transition),
    staging: path.join(root, 'maintenance-backups', `${transition}.staging`) };
}

describe('pinned migration encrypted state snapshot', () => {
  it('preserves every original byte, encrypts even the password, and can restore all captured files', async () => {
    const f = await fixture();
    const result = await snapshotEncryptedState(f.options);
    expect(result).toMatchObject({ directory: f.destination, fileCount: 6, reused: false });
    const raw = await fs.readFile(path.join(result.directory, 'completed.json'), 'utf8');
    expect(raw).not.toContain(password);
    const marker = JSON.parse(raw);
    expect(marker.directories).toEqual(['private-state']);
    expect(marker.files.some((file: { relative: string }) => file.relative === 'private-state.lock')).toBe(false);
    const key = scryptSync(password, Buffer.from(marker.salt, 'hex'), 32);
    for (const file of marker.files) {
      const blobPath = path.join(result.directory, file.blob);
      const encrypted = await fs.readFile(blobPath);
      expect(encrypted.includes(f.files[file.relative])).toBe(false);
      expect((await fs.stat(blobPath)).mode & 0o077).toBe(0);
      const decrypt = createDecipheriv('aes-256-gcm', key, Buffer.from(file.iv, 'hex'));
      decrypt.setAAD(Buffer.from(`${transition}:${file.relative}`));
      decrypt.setAuthTag(Buffer.from(file.tag, 'hex'));
      expect(Buffer.concat([decrypt.update(encrypted), decrypt.final()])).toEqual(f.files[file.relative]);
      expect(await fs.readFile(path.join(f.root, file.relative))).toEqual(f.files[file.relative]);
    }
    key.fill(0);
    expect((await fs.stat(result.directory)).mode & 0o077).toBe(0);
    await expect(fs.stat(f.staging)).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('reuses the immutable original snapshot even after later state/journal changes', async () => {
    const f = await fixture(); await snapshotEncryptedState(f.options);
    const before = await fs.readFile(path.join(f.destination, 'completed.json'));
    await fs.writeFile(path.join(f.root, 'wallet-state.enc'), 'later encrypted checkpoint', { mode: 0o600 });
    await fs.writeFile(path.join(f.root, 'verifier-migration.json'), '{"phase":"complete"}', { mode: 0o600 });
    await expect(snapshotEncryptedState(f.options)).resolves.toMatchObject({ reused: true, fileCount: 6 });
    expect(await fs.readFile(path.join(f.destination, 'completed.json'))).toEqual(before);
  });

  it('replaces only safe interrupted staging and exposes completion only after all files are saved', async () => {
    const f = await fixture(); await fs.mkdir(f.backups, { mode: 0o700 }); await fs.mkdir(f.staging, { mode: 0o700 });
    await fs.writeFile(path.join(f.staging, 'partial.enc'), 'interrupted encrypted fixture', { mode: 0o600 });
    await snapshotEncryptedState(f.options);
    expect((await fs.readdir(f.destination)).sort()).toEqual([...Array.from({ length: 6 }, (_, i) => `${String(i).padStart(6, '0')}.enc`), 'completed.json']);
    await expect(fs.stat(f.staging)).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it.each(['source-file-link', 'source-directory-link', 'source-hardlink', 'writable-file', 'backup-root-link', 'staging-link', 'final-link'])('rejects %s without following or modifying its target', async (kind) => {
    const f = await fixture(); const other = await fixture();
    const target = path.join(other.root, 'identity.enc');
    const before = await fs.readFile(target);
    if (kind === 'source-file-link') await fs.symlink(target, path.join(f.root, 'unsafe'));
    if (kind === 'source-directory-link') await fs.symlink(other.root, path.join(f.root, 'unsafe'));
    if (kind === 'source-hardlink') await fs.link(target, path.join(f.root, 'unsafe'));
    if (kind === 'writable-file') await fs.chmod(path.join(f.root, 'identity.enc'), 0o666);
    if (kind === 'backup-root-link') await fs.symlink(other.root, f.backups);
    if (kind === 'staging-link' || kind === 'final-link') {
      await fs.mkdir(f.backups, { mode: 0o700 }); await fs.symlink(other.root, kind === 'staging-link' ? f.staging : f.destination);
    }
    await expect(snapshotEncryptedState(f.options)).rejects.toMatchObject({ code: 'CONTRACT_MAINTENANCE_BACKUP_UNSAFE_PATH' });
    expect(await fs.readFile(target)).toEqual(before);
  });

  it('accepts legacy read-only leaf permissions inside the private state root and hardens the snapshot', async () => {
    const f = await fixture();
    await fs.chmod(path.join(f.root, 'private-state'), 0o755);
    await fs.chmod(path.join(f.root, 'private-state/000001.ldb'), 0o644);
    await snapshotEncryptedState(f.options);
    for (const name of await fs.readdir(f.destination)) expect((await fs.stat(path.join(f.destination, name))).mode & 0o077).toBe(0);
    expect((await fs.stat(path.join(f.root, 'private-state/000001.ldb'))).mode & 0o777).toBe(0o644);
  });

  it.each(['blob', 'manifest', 'password'])('rejects a completed snapshot with changed %s instead of overwriting it', async (kind) => {
    const f = await fixture(); await snapshotEncryptedState(f.options);
    if (kind === 'blob') await fs.appendFile(path.join(f.destination, '000000.enc'), 'corruption');
    if (kind === 'manifest') {
      const markerPath = path.join(f.destination, 'completed.json');
      const marker = JSON.parse(await fs.readFile(markerPath, 'utf8')); marker.sourceBytes++;
      await fs.writeFile(markerPath, JSON.stringify(marker), { mode: 0o600 });
    }
    const saved = await fs.readFile(path.join(f.destination, 'completed.json'));
    await expect(snapshotEncryptedState({ ...f.options, password: kind === 'password' ? 'Other-synthetic-password-at-least-16' : password }))
      .rejects.toMatchObject({ code: 'CONTRACT_MAINTENANCE_BACKUP_INVALID' });
    expect(await fs.readFile(path.join(f.destination, 'completed.json'))).toEqual(saved);
  });

  it.each(['size', 'count', 'time'])('enforces the %s bound without a completed snapshot', async (kind) => {
    const f = await fixture();
    if (kind === 'time') vi.spyOn(Date, 'now').mockReturnValueOnce(0).mockReturnValue(20);
    await expect(snapshotEncryptedState({ ...f.options, ...(kind === 'size' ? { maximumBytes: 1 } : kind === 'count' ? { maximumFiles: 1 } : { timeoutMs: 1 }) }))
      .rejects.toMatchObject({ code: 'CONTRACT_MAINTENANCE_BACKUP_LIMIT_EXCEEDED' });
    await expect(fs.stat(f.destination)).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('refuses a source changed during copying and safely retries the interrupted staging', async () => {
    const f = await fixture(); const originalOpen = fs.open.bind(fs); let changed = false;
    vi.spyOn(fs, 'open').mockImplementation(async (...args: Parameters<typeof fs.open>) => {
      const handle = await originalOpen(...args);
      if (!changed && args[0] === path.join(f.root, 'identity.enc') && args[1] === (constants.O_RDONLY | constants.O_NOFOLLOW)) {
        changed = true; await fs.appendFile(path.join(f.root, 'identity.enc'), 'changed');
      }
      return handle;
    });
    await expect(snapshotEncryptedState(f.options)).rejects.toMatchObject({ code: 'CONTRACT_MAINTENANCE_BACKUP_SOURCE_CHANGED' });
    await expect(fs.stat(f.destination)).rejects.toMatchObject({ code: 'ENOENT' });
    vi.restoreAllMocks();
    await expect(snapshotEncryptedState(f.options)).resolves.toMatchObject({ reused: false });
  });

  it('refuses to manufacture a replacement baseline after a maintenance journal already exists', async () => {
    const f = await fixture();
    await fs.writeFile(path.join(f.root, 'verifier-migration.json'), '{"phase":"broadcast"}', { mode: 0o600 });
    await expect(snapshotEncryptedState(f.options)).rejects.toMatchObject({ code: 'CONTRACT_MAINTENANCE_BACKUP_MISSING' });
    await expect(fs.stat(f.destination)).rejects.toMatchObject({ code: 'ENOENT' });
  });
});
