#!/usr/bin/env node
// Docker-only local profile. No owner state or public-network wallet is loaded.
import { readFile, writeFile, mkdir, chmod, chown } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

function requireLocalProfile(source) {
  if (source.MIDPROOF_LOCAL_DEMO !== 'true' || source.MIDNIGHT_NETWORK_ID !== 'undeployed'
      || source.RAILWAY_ENVIRONMENT_ID) throw new Error('LOCAL_DEMO_PROFILE_REQUIRED');
}

export function localDemoEnvironment(source, secrets) {
  requireLocalProfile(source);
  const env = { ...source,
    MIDPROOF_SYNTHETIC_ONLY: 'true',
    // Circuit binding metadata only: no EVM is started or contract deployed.
    GIWA_CHAIN_ID: '31337', GIWA_RPC_URL: 'http://127.0.0.1:1',
    GIWA_RECEIVABLE_FINANCE_ADDRESS: '0x1111111111111111111111111111111111111111',
    JWT_SECRET: secrets.jwt, MIDNIGHT_CAPABILITY_ENCRYPTION_KEY: secrets.capability,
    MIDNIGHT_DEMO_PREPARE_FIXTURE: 'false',
    MIDPROOF_LOCAL_PREPARE_ACCOUNTS: 'true',
  };
  delete env.MIDPROOF_DEMO_FIXTURE_FILE;
  delete env.MIDPROOF_LOCAL_CONFIG_DIR;
  return env;
}

async function main() {
  requireLocalProfile(process.env);
  const directory = process.env.MIDNIGHT_DEMO_STATE_DIR || '/data/midnight-demo';
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
  const env = localDemoEnvironment(process.env, secrets);
  const child = spawn('gosu', ['app', 'node', '/app/scripts/midnight-demo.mjs', '--mode=all'], { env, stdio: 'inherit' });
  for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, () => child.kill(signal));
  child.once('error', () => process.exit(1));
  child.once('exit', (code) => process.exit(code ?? 1));
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) await main();
