import { constants, promises as fs, type BigIntStats } from 'node:fs';
import path from 'node:path';
import { createCipheriv, createHash, createHmac, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import type { VerifierMigrationConfig } from './contract-maintenance.js';

const DIRECTORY = 'maintenance-backups';
const MARKER = 'completed.json';
const HEX64 = /^[0-9a-f]{64}$/;
const CHUNK_SIZE = 64 * 1024;

export class StateBackupError extends Error {
  constructor(readonly code: string = 'CONTRACT_MAINTENANCE_BACKUP_UNAVAILABLE') {
    super('The encrypted pre-maintenance snapshot could not be verified. Preserve the original state and existing snapshots.');
    this.name = 'StateBackupError';
  }
}

interface SourceFile { relative: string; stat: BigIntStats }
interface BackupFile { relative: string; blob: string; bytes: number; sha256: string; iv: string; tag: string }
interface BackupMarker {
  version: 1; networkId: 'preview'; migration: VerifierMigrationConfig; salt: string;
  sourceBytes: number; directories: string[]; files: BackupFile[]; mac: string;
}
export interface StateBackupOptions {
  stateDir: string; password: string; migration: VerifierMigrationConfig;
  /** Limits fail closed before maintenance. Smaller overrides support isolated tests. */
  maximumFiles?: number; maximumBytes?: number; timeoutMs?: number;
}

const reject = (suffix = 'UNAVAILABLE'): never => { throw new StateBackupError(`CONTRACT_MAINTENANCE_BACKUP_${suffix}`); };
const same = (left: BigIntStats, right: BigIntStats) => ['dev', 'ino', 'size', 'mtimeNs', 'ctimeNs']
  .every((key) => left[key as keyof BigIntStats] === right[key as keyof BigIntStats]);
const safeRelative = (value: unknown): value is string => typeof value === 'string' && value.length > 0 &&
  value.length <= 4096 && !value.includes('\\') && !value.includes('\0') &&
  value.split('/').every((part) => part !== '' && part !== '.' && part !== '..');

function ownerOnly(stat: BigIntStats, directory: boolean, source = false): void {
  if ((directory ? !stat.isDirectory() : !stat.isFile() || stat.nlink !== 1n) ||
      stat.isSymbolicLink() || (stat.mode & (source ? 0o022n : 0o077n)) !== 0n ||
      (typeof process.getuid === 'function' && stat.uid !== BigInt(process.getuid()))) reject('UNSAFE_PATH');
}

async function noSymlinkParents(directory: string): Promise<void> {
  for (let current = directory;; current = path.dirname(current)) {
    const stat = await fs.lstat(current);
    if (!stat.isDirectory() || stat.isSymbolicLink()) reject('UNSAFE_PATH');
    if (current === path.dirname(current)) return;
  }
}

/** Called only while hosted-demo's exclusive state lock is held and other writers are stopped.
 * Every file, including any storage-password, is encrypted again. Restoring requires the
 * separately preserved storage password; this snapshot never exposes it in a manifest.
 */
export async function snapshotEncryptedState(options: StateBackupOptions): Promise<{
  directory: string; fileCount: number; sourceBytes: number; reused: boolean;
}> {
  const { password } = options;
  const migration = { contractAddress: options.migration.contractAddress, oldSha256: options.migration.oldSha256,
    newSha256: options.migration.newSha256, expectedCounter: options.migration.expectedCounter };
  const maximumFiles = options.maximumFiles ?? 4096;
  const maximumBytes = options.maximumBytes ?? 1024 * 1024 * 1024;
  const timeoutMs = options.timeoutMs ?? 60_000;
  if (password.length < 16 || ![maximumFiles, maximumBytes, timeoutMs].every((n) => Number.isSafeInteger(n) && n > 0) ||
      ![migration.contractAddress, migration.oldSha256, migration.newSha256].every((s) => HEX64.test(s)) ||
      migration.oldSha256 === migration.newSha256 || !/^(0|[1-9][0-9]*)$/.test(migration.expectedCounter)) reject('CONFIG_INVALID');
  const deadline = Date.now() + timeoutMs;
  const checkTime = () => { if (Date.now() >= deadline) reject('LIMIT_EXCEEDED'); };
  const root = path.resolve(options.stateDir);
  const transition = createHash('sha256').update(JSON.stringify(migration)).digest('hex');
  const backups = path.join(root, DIRECTORY);
  const destination = path.join(backups, transition);
  const staging = `${destination}.staging`;
  let key: Buffer | undefined;

  async function scan(directory: string, source: boolean) {
    const files: SourceFile[] = [], directories: string[] = [];
    let bytes = 0;
    async function visit(relative: string): Promise<void> {
      checkTime();
      const absolute = path.join(directory, relative);
      ownerOnly(await fs.lstat(absolute, { bigint: true }), true, source);
      for (const name of (await fs.readdir(absolute)).sort()) {
        if (source && relative === '' && name === DIRECTORY) continue;
        const child = relative ? `${relative}/${name}` : name;
        if (!safeRelative(child)) reject('UNSAFE_PATH');
        const stat = await fs.lstat(path.join(directory, child), { bigint: true });
        if (stat.isDirectory()) {
          ownerOnly(stat, true, source); directories.push(child);
          if (files.length + directories.length > maximumFiles + (source ? 0 : 1)) reject('LIMIT_EXCEEDED');
          await visit(child);
        } else {
          ownerOnly(stat, false, source);
          // This process's lock is operational metadata, never a restore target.
          if (source && relative === '' && name === 'private-state.lock') continue;
          bytes += Number(stat.size);
          if (!Number.isSafeInteger(bytes) || bytes > maximumBytes + (source ? 0 : 2 * 1024 * 1024) ||
              files.length + directories.length >= maximumFiles + (source ? 0 : 1)) reject('LIMIT_EXCEEDED');
          files.push({ relative: child, stat });
        }
      }
    }
    await visit('');
    return { files, directories, bytes };
  }

  async function hashFile(file: string): Promise<{ hash: string; bytes: number }> {
    const handle = await fs.open(file, constants.O_RDONLY | constants.O_NOFOLLOW);
    const buffer = Buffer.alloc(CHUNK_SIZE);
    try {
      const before = await handle.stat({ bigint: true }); ownerOnly(before, false);
      const hash = createHash('sha256'); let bytes = 0;
      for (;;) {
        checkTime(); const { bytesRead } = await handle.read(buffer, 0, buffer.length, null);
        if (!bytesRead) break;
        bytes += bytesRead; if (bytes > maximumBytes) reject('LIMIT_EXCEEDED');
        hash.update(buffer.subarray(0, bytesRead));
      }
      if (!same(before, await handle.stat({ bigint: true }))) reject('SOURCE_CHANGED');
      return { hash: hash.digest('hex'), bytes };
    } finally { buffer.fill(0); await handle.close(); }
  }

  async function verifyExisting(): Promise<{ fileCount: number; sourceBytes: number }> {
    const inventory = await scan(destination, false);
    const markerFile = path.join(destination, MARKER);
    const markerStat = await fs.lstat(markerFile, { bigint: true }); ownerOnly(markerStat, false);
    if (markerStat.size > 2n * 1024n * 1024n) reject('LIMIT_EXCEEDED');
    const handle = await fs.open(markerFile, constants.O_RDONLY | constants.O_NOFOLLOW);
    let marker: BackupMarker;
    try { marker = JSON.parse(await handle.readFile('utf8')) as BackupMarker; } finally { await handle.close(); }
    if (marker.version !== 1 || marker.networkId !== 'preview' || JSON.stringify(marker.migration) !== JSON.stringify(migration) ||
        !HEX64.test(marker.salt) || !HEX64.test(marker.mac) || !Array.isArray(marker.files) || !Array.isArray(marker.directories) ||
        marker.files.length > maximumFiles || marker.directories.some((entry) => !safeRelative(entry)) ||
        !Number.isSafeInteger(marker.sourceBytes) || marker.sourceBytes < 0 || marker.sourceBytes > maximumBytes) reject('INVALID');
    key = scryptSync(password, Buffer.from(marker.salt, 'hex'), 32);
    const { mac, ...unsigned } = marker;
    const expectedMac = createHmac('sha256', key).update(JSON.stringify(unsigned)).digest();
    if (!timingSafeEqual(expectedMac, Buffer.from(mac, 'hex'))) reject('INVALID');
    const paths = new Set<string>(); let sourceBytes = 0;
    for (const entry of marker.files) {
      if (!safeRelative(entry.relative) || paths.has(entry.relative) || !/^[0-9]{6}\.enc$/.test(entry.blob) ||
          !HEX64.test(entry.sha256) || !/^[0-9a-f]{24}$/.test(entry.iv) || !/^[0-9a-f]{32}$/.test(entry.tag) ||
          !Number.isSafeInteger(entry.bytes) || entry.bytes < 0) reject('INVALID');
      paths.add(entry.relative); sourceBytes += entry.bytes;
      const verified = await hashFile(path.join(destination, entry.blob));
      if (verified.hash !== entry.sha256 || verified.bytes !== entry.bytes) reject('INVALID');
    }
    const expectedFiles = [MARKER, ...marker.files.map((file) => file.blob)].sort();
    if (sourceBytes !== marker.sourceBytes || inventory.directories.length !== 0 ||
        JSON.stringify(inventory.files.map((file) => file.relative).sort()) !== JSON.stringify(expectedFiles)) reject('INVALID');
    return { fileCount: marker.files.length, sourceBytes };
  }

  try {
    await noSymlinkParents(root);
    ownerOnly(await fs.lstat(root, { bigint: true }), true);
    await fs.mkdir(backups, { mode: 0o700 }).catch((error: NodeJS.ErrnoException) => { if (error.code !== 'EEXIST') throw error; });
    ownerOnly(await fs.lstat(backups, { bigint: true }), true);
    const existing = await fs.lstat(destination).catch((error: NodeJS.ErrnoException) => { if (error.code === 'ENOENT') return null; throw error; });
    if (existing) return { directory: destination, ...await verifyExisting(), reused: true };
    // A prior attempt must already have made this snapshot. Never silently take
    // a later snapshot and label it as the original pre-maintenance state.
    if (await fs.lstat(path.join(root, 'verifier-migration.json')).then(() => true, (error: NodeJS.ErrnoException) => {
      if (error.code === 'ENOENT') return false; throw error;
    })) reject('MISSING');
    const interrupted = await fs.lstat(staging).catch((error: NodeJS.ErrnoException) => { if (error.code === 'ENOENT') return null; throw error; });
    if (interrupted) { await scan(staging, false); await fs.rm(staging, { recursive: true }); }
    const source = await scan(root, true);
    if (!source.files.some((file) => file.relative === 'identity.enc') ||
        !source.files.some((file) => file.relative === 'deployment.json') ||
        !source.directories.includes('private-state')) reject('INCOMPLETE');
    await fs.mkdir(staging, { mode: 0o700 });
    const salt = randomBytes(32); key = scryptSync(password, salt, 32);
    const files: BackupFile[] = [];
    for (const [index, file] of source.files.entries()) {
      checkTime();
      const blob = `${String(index).padStart(6, '0')}.enc`, iv = randomBytes(12);
      const input = await fs.open(path.join(root, file.relative), constants.O_RDONLY | constants.O_NOFOLLOW);
      const output = await fs.open(path.join(staging, blob), constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL, 0o600)
        .catch(async (error: unknown) => { await input.close(); throw error; });
      const buffer = Buffer.alloc(CHUNK_SIZE);
      try {
        const before = await input.stat({ bigint: true }); ownerOnly(before, false, true);
        if (!same(file.stat, before)) reject('SOURCE_CHANGED');
        const cipher = createCipheriv('aes-256-gcm', key, iv);
        cipher.setAAD(Buffer.from(`${transition}:${file.relative}`));
        const hash = createHash('sha256'); let bytes = 0;
        for (;;) {
          checkTime(); const { bytesRead } = await input.read(buffer, 0, buffer.length, null);
          if (!bytesRead) break;
          bytes += bytesRead; if (bytes > Number(file.stat.size)) reject('SOURCE_CHANGED');
          const encrypted = cipher.update(buffer.subarray(0, bytesRead));
          hash.update(encrypted); await output.writeFile(encrypted);
        }
        const final = cipher.final(); hash.update(final); await output.writeFile(final);
        if (bytes !== Number(file.stat.size) || !same(before, await input.stat({ bigint: true }))) reject('SOURCE_CHANGED');
        await output.sync();
        files.push({ relative: file.relative, blob, bytes, sha256: hash.digest('hex'), iv: iv.toString('hex'), tag: cipher.getAuthTag().toString('hex') });
      } finally { buffer.fill(0); await Promise.all([input.close(), output.close()]); }
    }
    const after = await scan(root, true);
    if (JSON.stringify(source.directories) !== JSON.stringify(after.directories) || source.files.length !== after.files.length ||
        source.files.some((file, index) => file.relative !== after.files[index].relative || !same(file.stat, after.files[index].stat))) reject('SOURCE_CHANGED');
    const unsigned = { version: 1 as const, networkId: 'preview' as const, migration, salt: salt.toString('hex'),
      sourceBytes: source.bytes, directories: source.directories, files };
    const marker = { ...unsigned, mac: createHmac('sha256', key).update(JSON.stringify(unsigned)).digest('hex') };
    const serializedMarker = JSON.stringify(marker);
    if (Buffer.byteLength(serializedMarker, 'utf8') > 2 * 1024 * 1024) reject('LIMIT_EXCEEDED');
    checkTime();
    const handle = await fs.open(path.join(staging, MARKER), constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL, 0o600);
    try { await handle.writeFile(serializedMarker); await handle.sync(); } finally { await handle.close(); }
    const directory = await fs.open(staging, constants.O_RDONLY);
    try { await directory.sync(); } finally { await directory.close(); }
    await fs.rename(staging, destination);
    const parent = await fs.open(backups, constants.O_RDONLY);
    try { await parent.sync(); } finally { await parent.close(); }
    return { directory: destination, fileCount: files.length, sourceBytes: source.bytes, reused: false };
  } catch (error) {
    if (error instanceof StateBackupError) throw error;
    return reject();
  } finally { key?.fill(0); }
}
