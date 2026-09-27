import { promises as fs, constants } from 'node:fs';
import path from 'node:path';
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'node:crypto';
import { generateKeyPair } from 'zkloan-credit-scorer-attestation-api/signing';
import type { DemoConfig, DemoNetwork } from './config.js';

export interface DemoIdentity { version: 1; networkId: DemoNetwork; walletSeed: string; providerSecret: string; companySecret: string }
export interface DemoManifest { networkId: DemoNetwork; contractAddress: string }
export async function prepareStateDirectory(directory: string): Promise<void> {
  await fs.mkdir(directory, { recursive: true, mode: 0o700 });
  const stat = await fs.lstat(directory);
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error('Demo state must be a regular directory.');
  await fs.chmod(directory, 0o700);
}
async function readPrivateFile(file: string): Promise<string | null> {
  try {
    const handle = await fs.open(file, constants.O_RDONLY | constants.O_NOFOLLOW);
    try {
      const stat = await handle.stat();
      if (!stat.isFile() || stat.nlink !== 1 || (stat.mode & 0o077) !== 0) throw new Error('Demo state file must be owner-only.');
      return await handle.readFile('utf8');
    } finally { await handle.close(); }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  }
}
export async function writeAtomic(file: string, value: unknown): Promise<void> {
  const temporary = `${file}.${randomBytes(8).toString('hex')}.tmp`;
  const handle = await fs.open(temporary, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL, 0o600);
  try { await handle.writeFile(JSON.stringify(value)); await handle.sync(); } finally { await handle.close(); }
  await fs.rename(temporary, file);
  const directory = await fs.open(path.dirname(file), constants.O_RDONLY);
  try { await directory.sync(); } finally { await directory.close(); }
}
export async function loadDemoIdentity(config: DemoConfig): Promise<{ identity: DemoIdentity; password: string }> {
  await prepareStateDirectory(config.stateDir);
  let password = process.env.MIDNIGHT_STORAGE_PASSWORD;
  if (!password) {
    const file = path.join(config.stateDir, 'storage-password');
    password = await readPrivateFile(file) ?? undefined;
    if (!password) {
      password = randomBytes(48).toString('base64');
      await fs.writeFile(file, password, { flag: 'wx', mode: 0o600 });
    }
  }
  if (password.length < 16) throw new Error('Demo private-state password must have at least 16 characters.');
  const file = path.join(config.stateDir, 'identity.enc');
  const existing = await readPrivateFile(file);
  let identity: DemoIdentity;
  if (existing) {
    try {
      const envelope = JSON.parse(existing);
      const key = scryptSync(password, Buffer.from(envelope.salt, 'hex'), 32);
      const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(envelope.iv, 'hex'));
      decipher.setAAD(Buffer.from(`midnight-synthetic-demo:${config.networkId}:1`));
      decipher.setAuthTag(Buffer.from(envelope.tag, 'hex'));
      const plain = Buffer.concat([decipher.update(Buffer.from(envelope.ciphertext, 'hex')), decipher.final()]);
      try { identity = JSON.parse(plain.toString('utf8')); } finally { plain.fill(0); key.fill(0); }
    } catch { throw new Error('Demo identity cannot be decrypted for this network. Preserve the existing state directory.'); }
  } else {
    identity = { version: 1, networkId: config.networkId, walletSeed: localGenesisSeed(config) ?? randomBytes(32).toString('hex'), providerSecret: generateKeyPair().sk.toString(16), companySecret: randomBytes(32).toString('hex') };
    const salt = randomBytes(32); const iv = randomBytes(12); const key = scryptSync(password, salt, 32);
    const cipher = createCipheriv('aes-256-gcm', key, iv);
    cipher.setAAD(Buffer.from(`midnight-synthetic-demo:${config.networkId}:1`));
    const encrypted = Buffer.concat([cipher.update(JSON.stringify(identity), 'utf8'), cipher.final()]);
    await writeAtomic(file, { version: 1, salt: salt.toString('hex'), iv: iv.toString('hex'), tag: cipher.getAuthTag().toString('hex'), ciphertext: encrypted.toString('hex') });
    key.fill(0);
  }
  if (identity.version !== 1 || identity.networkId !== config.networkId || !/^[0-9a-f]{64}$/.test(identity.walletSeed) || !/^[0-9a-f]{64}$/.test(identity.companySecret) || !/^[0-9a-f]+$/.test(identity.providerSecret)) throw new Error('Invalid demo identity.');
  return { identity, password };
}
export async function readManifest(config: DemoConfig): Promise<DemoManifest | null> {
  const value = await readPrivateFile(path.join(config.stateDir, 'deployment.json'));
  if (value === null) return null;
  const manifest = JSON.parse(value) as DemoManifest;
  if (manifest.networkId !== config.networkId || !/^[0-9a-f]{64}$/.test(manifest.contractAddress)) throw new Error('Demo deployment belongs to a different network or is invalid.');
  return manifest;
}

export async function readEncryptedJson<T>(file: string, password: string): Promise<T | null> {
  const text = await readPrivateFile(file); if (text === null) return null;
  try {
    const envelope = JSON.parse(text);
    const key = scryptSync(password, Buffer.from(envelope.salt, 'hex'), 32);
    const cipher = createDecipheriv('aes-256-gcm', key, Buffer.from(envelope.iv, 'hex'));
    cipher.setAAD(Buffer.from(path.basename(file))); cipher.setAuthTag(Buffer.from(envelope.tag, 'hex'));
    const plain = Buffer.concat([cipher.update(Buffer.from(envelope.ciphertext, 'hex')), cipher.final()]);
    try { return JSON.parse(plain.toString('utf8')) as T; } finally { plain.fill(0); key.fill(0); }
  } catch { throw new Error('Encrypted demo session ownership cannot be recovered.'); }
}
export async function writeEncryptedJson(file: string, password: string, value: unknown): Promise<void> {
  const salt = randomBytes(32); const iv = randomBytes(12); const key = scryptSync(password, salt, 32);
  const cipher = createCipheriv('aes-256-gcm', key, iv); cipher.setAAD(Buffer.from(path.basename(file)));
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()]);
  await writeAtomic(file, { version: 1, salt: salt.toString('hex'), iv: iv.toString('hex'), tag: cipher.getAuthTag().toString('hex'), ciphertext: encrypted.toString('hex') }); key.fill(0);
}

function localGenesisSeed(config: DemoConfig): string | undefined {
  const seed = process.env.MIDPROOF_LOCAL_WALLET_SEED;
  if (!seed) return undefined;
  if (process.env.MIDPROOF_LOCAL_DEMO !== 'true' || config.networkId !== 'undeployed'
      || seed !== '0000000000000000000000000000000000000000000000000000000000000001') {
    throw new Error('The public genesis seed is only permitted for isolated local development.');
  }
  return seed;
}
