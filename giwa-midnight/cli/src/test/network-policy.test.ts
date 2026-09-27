import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { assertSupportedNetwork, PreprodConfig } from '../config.js';
import { configureProviders, initWalletWithSeed } from '../api.js';

describe('approved demo network boundary', () => {
  it.each(['preprod', 'mainnet', '', 'unknown'])('rejects %s before provider or wallet access', async (networkId) => {
    expect(() => assertSupportedNetwork(networkId)).toThrow(/Only Preview and undeployed/);
    await expect(initWalletWithSeed(Buffer.alloc(0), { networkId } as any)).rejects.toThrow(/Only Preview and undeployed/);
    await expect(configureProviders(undefined as any, { networkId } as any)).rejects.toThrow(/Only Preview and undeployed/);
  });
  it('permits Preview and isolated undeployed, but blocks the historical config constructor', () => {
    expect(() => assertSupportedNetwork('preview')).not.toThrow();
    expect(() => assertSupportedNetwork('undeployed')).not.toThrow();
    expect(() => new PreprodConfig()).toThrow(/disabled/);
  });
  it('all historical Preprod npm entrypoints exit before build, credentials, or network access', async () => {
    const pkg = JSON.parse(await readFile(new URL('../../package.json', import.meta.url), 'utf8'));
    for (const name of ['preprod-remote', 'test-against-preprod', 'start-preprod-remote']) {
      expect(pkg.scripts[name]).toBe('node scripts/refuse-preprod.mjs');
    }
    await expect(promisify(execFile)(process.execPath,
      [new URL('../../scripts/refuse-preprod.mjs', import.meta.url).pathname],
    )).rejects.toMatchObject({ code: 1, stderr: expect.stringContaining('disabled') });
  });
});
