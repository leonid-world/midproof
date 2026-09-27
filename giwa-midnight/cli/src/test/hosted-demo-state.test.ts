import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { readDemoConfig } from '../hosted-demo/config.js';
import { loadDemoIdentity, readEncryptedJson, readManifest, writeAtomic, writeEncryptedJson } from '../hosted-demo/state.js';
import { initWalletWithSeed } from '../api.js';
const dirs: string[] = [];
afterEach(async () => { await Promise.all(dirs.splice(0).map((d) => fs.rm(d, { recursive: true, force: true }))); });
async function config() { const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'midnight-demo-test-')); dirs.push(dir); return readDemoConfig({ MIDNIGHT_DEMO_MODE: 'hosted-demo', MIDNIGHT_DEMO_STATE_DIR: dir, MIDNIGHT_DEMO_INTERNAL_TOKEN: 't'.repeat(48) }); }
describe('hosted persistent identity boundary', () => {
  it('rejects a saved wallet from a different network before starting a network connection', async () => {
    const c = await config();
    await expect(initWalletWithSeed(Buffer.alloc(32, 7), c, { networkId: 'undeployed', unshieldedAddress: 'another-wallet', shielded: '{}', dust: '{}', unshielded: '{}' })).rejects.toThrow('does not match this network');
  });
  it('restores encrypted identity without writing clear wallet/provider/company secrets', async () => {
    const c = await config(); const first = await loadDemoIdentity(c); const second = await loadDemoIdentity(c); expect(first).toEqual(second); expect(first.identity.walletSeed).not.toBe('0'.repeat(63) + '1'); const stored = await fs.readFile(path.join(c.stateDir, 'identity.enc'), 'utf8'); for (const secret of [first.identity.walletSeed, first.identity.providerSecret, first.identity.companySecret]) expect(stored).not.toContain(secret); expect((await fs.stat(path.join(c.stateDir, 'identity.enc'))).mode & 0o077).toBe(0);
  });
  it('rejects cross-network identity reuse', async () => { const c = await config(); await loadDemoIdentity(c); await expect(loadDemoIdentity({ ...c, networkId: 'undeployed' })).rejects.toThrow('cannot be decrypted'); });
  it('recovers encrypted session ownership and fails closed on wrong key', async () => { const c = await config(); const file = path.join(c.stateDir, 'session-owners.enc'); const value = [{ actorId: '21', requestId: 'correlation-sensitive' }]; await writeEncryptedJson(file, 'owner-password-at-least-16', value); expect(await readEncryptedJson(file, 'owner-password-at-least-16')).toEqual(value); expect(await fs.readFile(file, 'utf8')).not.toContain('correlation-sensitive'); await expect(readEncryptedJson(file, 'different-password-at-least-16')).rejects.toThrow('cannot be recovered'); });
  it('never falls back to historical local contract for Preview', async () => { const c = await config(); expect(await readManifest(c)).toBeNull(); await writeAtomic(path.join(c.stateDir, 'deployment.json'), { networkId: 'undeployed', contractAddress: 'a'.repeat(64) }); await expect(readManifest(c)).rejects.toThrow('different network'); });
  it('pins network, internal authority and explicit port', () => { const env = { MIDNIGHT_DEMO_MODE: 'hosted-demo', MIDNIGHT_DEMO_INTERNAL_TOKEN: 't'.repeat(48), MIDNIGHT_DEMO_PORT: '8080', PORT: '9090' }; expect(readDemoConfig(env).port).toBe(8080); expect(() => readDemoConfig({ ...env, MIDNIGHT_NETWORK_ID: 'mainnet' })).toThrow(); expect(() => readDemoConfig({ ...env, MIDNIGHT_DEMO_AUTHORITY_URL: 'http://evil.example' })).toThrow(); });
});
