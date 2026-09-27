#!/usr/bin/env node
// Docker-only local profile. No owner state or public-network wallet is loaded.
import { readFile, writeFile, mkdir, chmod, chown } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { spawn } from 'node:child_process';
import path from 'node:path';

if (process.env.MIDPROOF_LOCAL_DEMO !== 'true' || process.env.MIDNIGHT_NETWORK_ID !== 'undeployed'
    || process.env.RAILWAY_ENVIRONMENT_ID) throw new Error('LOCAL_DEMO_PROFILE_REQUIRED');
const directory = process.env.MIDNIGHT_DEMO_STATE_DIR || '/data/midnight-demo';
const configDirectory = process.env.MIDPROOF_LOCAL_CONFIG_DIR || '/demo-config';
const publicConfig = JSON.parse(await readFile(path.join(configDirectory, 'giwa-local.json'), 'utf8'));
if (publicConfig.version !== 1 || publicConfig.networkId !== 'undeployed' || publicConfig.giwaChainId !== '31337'
    || !/^0x[0-9a-fA-F]{40}$/.test(publicConfig.receivableFinanceAddress)
    || !/^0x[0-9a-fA-F]{40}$/.test(publicConfig.mockKrwAddress)) throw new Error('LOCAL_GIWA_CONFIG_INVALID');
await mkdir(directory, { recursive: true, mode: 0o700 });
await mkdir('/data/cache', { recursive: true });
const secretsFile = path.join(directory, 'local-runtime-secrets.json');
let secrets;
try { secrets = JSON.parse(await readFile(secretsFile, 'utf8')); }
catch (error) {
  if (error.code !== 'ENOENT') throw error;
  secrets = { jwt: randomBytes(48).toString('base64'), capability: randomBytes(32).toString('base64') };
  await writeFile(secretsFile, JSON.stringify(secrets), { flag: 'wx', mode: 0o600 });
}
for (const file of [directory, '/data/cache', secretsFile]) await chown(file, 10001, 10001);
await chmod(directory, 0o700);
const env = { ...process.env,
  GIWA_CHAIN_ID: '31337', GIWA_RPC_URL: 'http://evm:8545',
  GIWA_RECEIVABLE_FINANCE_ADDRESS: publicConfig.receivableFinanceAddress,
  GIWA_MOCK_KRW_ADDRESS: publicConfig.mockKrwAddress,
  MIDPROOF_DEMO_FIXTURE_FILE: path.join(configDirectory, 'local-signers.json'),
  JWT_SECRET: secrets.jwt, MIDNIGHT_CAPABILITY_ENCRYPTION_KEY: secrets.capability,
  MIDNIGHT_DEMO_PREPARE_FIXTURE: 'false',
  MIDPROOF_LOCAL_PREPARE_ACCOUNTS: 'true',
};
const child = spawn('gosu', ['app', 'node', '/app/scripts/midnight-demo.mjs', '--mode=all'], { env, stdio: 'inherit' });
for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, () => child.kill(signal));
child.once('error', () => process.exit(1));
child.once('exit', (code) => process.exit(code ?? 1));
