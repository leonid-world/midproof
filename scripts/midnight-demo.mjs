#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { access, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import net from 'node:net';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const MYSQL = Object.freeze({
  name: 'gasok-midnight-demo-mysql',
  volume: 'gasok-midnight-demo-mysql-data',
  host: '127.0.0.1', port: 3307,
  database: 'gasok_midnight_demo', user: 'gasok_demo',
  // Disposable, loopback-only developer database; never used for Railway.
  password: 'gasok-demo-local-only',
});
const OWNER = 'org.gasok.midnight-demo';
const PROOF_IMAGE = 'midnightntwrk/proof-server:8.1.0';
const PROOF_CONTAINER = 'gasok-midnight-demo-prover';
const children = new Set();
const ownedContainers = new Set();
let stopping = false;
let forwardingRuntime = false;
let dockerProgram = 'docker';

function log(message) { process.stdout.write(`[midnight-runtime] ${message}\n`); }
function fail(message) { throw new Error(message); }
async function exists(path) { try { await access(path); return true; } catch { return false; } }
const delay = (ms) => new Promise((done) => setTimeout(done, ms));
function stopChild(child, signal) {
  try { process.kill(-child.pid, signal); } catch { /* Process group already stopped. */ }
}

export function configuration(env = process.env) {
  const network = env.MIDNIGHT_NETWORK_ID || 'preview';
  if (!['preview', 'undeployed'].includes(network)) fail('Only Preview and undeployed are allowed for this demo.');
  const publicPort = Number(env.MIDNIGHT_DEMO_PORT || env.PORT || 8080);
  const springPort = Number(env.MIDNIGHT_SPRING_PORT || 8081);
  const proofUrl = new URL(env.MIDNIGHT_PROOF_SERVER_URL || 'http://127.0.0.1:6300');
  if (proofUrl.protocol !== 'http:' || !['127.0.0.1', 'localhost'].includes(proofUrl.hostname)
      || proofUrl.username || proofUrl.password || proofUrl.pathname !== '/' || proofUrl.search || proofUrl.hash) {
    fail('The managed proof server must use an HTTP loopback root URL.');
  }
  const proofPort = Number(proofUrl.port || 80);
  const ports = [publicPort, springPort, proofPort];
  if (ports.some((p) => !Number.isInteger(p) || p < 1024 || p > 65535) || new Set(ports).size !== 3) {
    fail('Gateway, Spring, and proof server need distinct unprivileged ports.');
  }
  const externalDatabase = ['DB_HOST', 'DB_PORT', 'DB_NAME', 'DB_USERNAME', 'DB_PASSWORD',
    'MYSQLHOST', 'MYSQLPORT', 'MYSQLDATABASE', 'MYSQLUSER', 'MYSQLPASSWORD', 'SPRING_DATASOURCE_URL']
    .some((key) => Object.hasOwn(env, key));
  const manageDatabase = env.MIDNIGHT_DEMO_MANAGE_DATABASE === 'true'
    || (env.MIDNIGHT_DEMO_MANAGE_DATABASE !== 'false' && !externalDatabase && !env.RAILWAY_ENVIRONMENT_ID);
  if (manageDatabase && (externalDatabase || env.RAILWAY_ENVIRONMENT_ID)) {
    fail('Automatic local MySQL management cannot override an explicitly configured database or Railway.');
  }
  return { network, publicPort, springPort, proofPort, proofUrl,
    stateDir: resolve(env.MIDNIGHT_DEMO_STATE_DIR || join(ROOT, '.local', 'midnight-demo')),
    bootstrap: env.MIDNIGHT_DEMO_BOOTSTRAP !== 'false', manageDatabase };
}

// The canonical schema contains destructive DROP statements. They are removed
// and this CREATE-only script is used only after proving our dedicated DB empty.
export function freshSchema(source) {
  const ddl = source.replace(/^DROP TABLE IF EXISTS [a-z_]+;\s*$/gm, '')
    .replace(/^SET FOREIGN_KEY_CHECKS = [01];\s*$/gm, '');
  if (/\b(?:DROP|TRUNCATE|DELETE|ALTER)\b/i.test(ddl)) fail('Demo schema contains a destructive statement.');
  return ddl;
}

function command(program, args, { cwd = ROOT, env = process.env, input, quiet = false, timeout = 0 } = {}) {
  return new Promise((done, reject) => {
    const child = spawn(program === 'docker' ? dockerProgram : program, args,
      { cwd, env, detached: true, stdio: ['pipe', 'pipe', 'pipe'] });
    children.add(child);
    let output = '';
    let timer;
    let killTimer;
    child.stdout.on('data', (chunk) => { output += chunk; if (!quiet) process.stdout.write(chunk); });
    child.stderr.on('data', (chunk) => { if (!quiet) process.stderr.write(chunk); });
    child.on('error', () => reject(new Error(`Cannot start ${program}; check that it is installed and on PATH.`)));
    child.on('close', (code) => {
      children.delete(child); clearTimeout(timer); clearTimeout(killTimer);
      if (code === 0) done(output.trim());
      else reject(new Error(`${program} exited unsuccessfully; no request values were logged by the supervisor.`));
    });
    if (timeout) timer = setTimeout(() => {
      stopChild(child, 'SIGTERM');
      killTimer = setTimeout(() => stopChild(child, 'SIGKILL'), 1000);
    }, timeout);
    child.stdin.end(input);
  });
}

function service(program, args, env, cwd, name) {
  const child = spawn(program, args, { cwd, env, detached: true, stdio: ['ignore', 'inherit', 'inherit'] });
  children.add(child);
  child.on('error', () => { log(`${name} could not start.`); void shutdown(1); });
  child.on('exit', () => {
    children.delete(child);
    if (!stopping) { log(`${name} stopped; shutting down this runtime to avoid a partial demo.`); void shutdown(1); }
  });
  return child;
}

async function portOpen(port) {
  return new Promise((done) => {
    const socket = net.connect({ port, host: '127.0.0.1' });
    socket.setTimeout(500);
    socket.once('connect', () => { socket.destroy(); done(true); });
    const no = () => { socket.destroy(); done(false); };
    socket.once('error', no); socket.once('timeout', no);
  });
}

async function proofReady(url) {
  try {
    const response = await fetch(new URL('/version', url), { signal: AbortSignal.timeout(2000), redirect: 'error' });
    if (!response.ok) return false;
    const version = await response.text();
    if (!version.includes('8.1.0')) fail('The running proof server does not match pinned version 8.1.0.');
    return true;
  } catch (error) {
    if (error.message?.includes('pinned version')) throw error;
    return false;
  }
}

async function installedDockerDesktop() {
  for (const application of ['/Applications/Docker.app', join(homedir(), 'Applications', 'Docker.app')]) {
    const binary = join(application, 'Contents', 'Resources', 'bin', 'docker');
    try { await access(binary, constants.X_OK); return { application, binary }; } catch { /* Try the next existing installation. */ }
  }
  return null;
}

export async function dockerAvailable({
  platform = process.platform, env = process.env, run = command,
  findDesktop = installedDockerDesktop, now = Date.now, pause = delay,
} = {}) {
  const desktop = platform === 'darwin' ? await findDesktop() : null;
  // Finder-launched IntelliJ can omit Docker's CLI directory from PATH.
  if (desktop) dockerProgram = desktop.binary;
  const info = ['info', '--format', '{{.ServerVersion}}'];
  try { await run('docker', info, { quiet: true, timeout: 15000 }); return; } catch { /* Diagnose the stopped daemon below. */ }
  if (platform !== 'darwin' || env.NODE_ENV === 'production' || env.RAILWAY_ENVIRONMENT_ID) {
    fail('Docker is unavailable; automatic Docker Desktop startup is only enabled for local macOS development.');
  }
  if (!desktop) fail('Docker Desktop is not installed in Applications. Install/start it before running this local demo.');
  log('Starting the installed Docker Desktop; waiting up to 90 seconds for its existing daemon.');
  await run('/usr/bin/open', ['-a', desktop.application], { quiet: true, timeout: 10000 });
  const deadline = now() + 90000;
  while (now() < deadline && !stopping) {
    try {
      await run('docker', info, { quiet: true, timeout: Math.min(5000, deadline - now()) });
      log('Docker Desktop is ready.'); return;
    } catch { await pause(Math.min(1000, Math.max(0, deadline - now()))); }
  }
  fail('Docker Desktop did not become ready within 90 seconds. Complete its normal startup and Run again.');
}

async function inspectOwned(name, kind) {
  let info;
  try { info = JSON.parse(await command('docker', ['inspect', name], { quiet: true, timeout: 10000 }))[0]; }
  catch { return null; }
  if (info.Config?.Labels?.[OWNER] !== kind) fail(`Container ${name} exists but is not owned by this demo. It was left untouched.`);
  return info;
}

async function startContainer(name, kind, args) {
  const current = await inspectOwned(name, kind);
  if (current?.State?.Running) return;
  if (current) await command('docker', ['start', name], { quiet: true });
  else await command('docker', ['run', '-d', '--name', name, '--label', `${OWNER}=${kind}`, ...args], { quiet: true });
  ownedContainers.add(name);
}

async function ensureDatabase(config) {
  if (!config.manageDatabase) { log('Using the configured MySQL service; no local database is changed.'); return; }
  await dockerAvailable();
  const existing = await inspectOwned(MYSQL.name, 'database');
  if (!existing && await portOpen(MYSQL.port)) fail(`Port ${MYSQL.port} is already occupied; the unrelated database was left untouched.`);
  log('Starting the dedicated local demo MySQL; its data volume survives Stop/Run.');
  await startContainer(MYSQL.name, 'database', [
    '-p', `127.0.0.1:${MYSQL.port}:3306`, '-v', `${MYSQL.volume}:/var/lib/mysql`,
    '-e', `MYSQL_DATABASE=${MYSQL.database}`, '-e', `MYSQL_USER=${MYSQL.user}`,
    '-e', `MYSQL_PASSWORD=${MYSQL.password}`, '-e', `MYSQL_ROOT_PASSWORD=${MYSQL.password}`, 'mysql:8.4',
  ]);
  const sql = (query) => command('docker', ['exec', '-i', '-e', `MYSQL_PWD=${MYSQL.password}`,
    MYSQL.name, 'mysql', '-N', '-B', `-u${MYSQL.user}`, MYSQL.database], { quiet: true, input: query, timeout: 10000 });
  let ready = false;
  for (let i = 0; i < 90 && !stopping; i++) {
    try { await sql('SELECT 1;'); ready = true; break; } catch { await delay(1000); }
  }
  if (!ready) fail('Local demo MySQL did not become ready. Existing data was preserved.');
  const count = Number(await sql('SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = DATABASE();'));
  if (count === 0) {
    log('Initializing the empty dedicated demo database with CREATE statements.');
    await sql(freshSchema(await readFile(join(ROOT, '.codex', 'schema.sql'), 'utf8')));
  } else {
    const required = Number(await sql("SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name IN ('companies', 'users', 'company_wallets', 'receivables', 'midnight_proof_requests');"));
    if (required !== 5) fail('The dedicated demo database has a partial schema; automatic reset is intentionally disabled.');
  }
  log('Demo MySQL is ready. No existing GASOK database was reset.');
}

async function ensureBuild(config) {
  if (!config.bootstrap) return;
  const workspace = join(ROOT, 'giwa-midnight');
  if (!await exists(join(workspace, 'package-lock.json'))) fail('Initialize giwa-midnight submodule before running the demo.');
  const stampPath = join(config.stateDir, 'dependency-lock.sha256');
  const lock = createHash('sha256').update(await readFile(join(workspace, 'package-lock.json'))).digest('hex');
  const stamp = await readFile(stampPath, 'utf8').catch(() => '');
  if (!await exists(join(workspace, 'node_modules', '.bin', 'tsc')) || stamp !== lock) {
    log('Installing the locked Midnight dependencies (first run or lockfile change).');
    await command('npm', ['ci', '--no-audit', '--no-fund'], { cwd: workspace });
    await writeFile(stampPath, lock, { mode: 0o600 });
  }
  log('Building the existing Midnight workspaces; no Compact contract is redeployed by this build.');
  for (const name of ['zkloan-credit-scorer-contract', 'giwa-midnight-api', 'zkloan-credit-scorer-attestation-api', 'zkloan-credit-scorer-cli']) {
    await command('npm', ['run', 'build', '--workspace', name], { cwd: workspace });
  }
}

async function nativeProver() {
  if (process.env.MIDNIGHT_PROOF_SERVER_BINARY) return process.env.MIDNIGHT_PROOF_SERVER_BINARY;
  for (const folder of await readdir('/nix/store').catch(() => [])) {
    if (!folder.endsWith('-ledger-8.1.0')) continue;
    const candidate = join('/nix/store', folder, 'bin', 'midnight-proof-server');
    try { await access(candidate, constants.X_OK); return candidate; } catch { /* Continue discovery. */ }
  }
  for (const folder of (process.env.PATH || '').split(':')) {
    const candidate = join(folder, 'midnight-proof-server');
    try { await access(candidate, constants.X_OK); return candidate; } catch { /* Continue discovery. */ }
  }
  return null;
}

async function ensureProver(config, env) {
  if (await proofReady(config.proofUrl)) { log('Reusing the matching local Proof Server 8.1.0.'); return; }
  if (await portOpen(config.proofPort)) fail(`Port ${config.proofPort} is occupied by an unready or different service.`);
  const binary = await nativeProver();
  if (binary) {
    log('Starting the native Proof Server; it computes real ZK proofs from demo witness data.');
    service(binary, ['--port', String(config.proofPort)], env, ROOT, 'Proof Server');
  } else {
    if (process.env.RAILWAY_ENVIRONMENT_ID || process.env.NODE_ENV === 'production') fail('Native Proof Server is missing from the deployment image.');
    await dockerAvailable();
    log('Starting the official Proof Server Docker image automatically (local development only).');
    await startContainer(PROOF_CONTAINER, 'prover', [
      '-p', `127.0.0.1:${config.proofPort}:6300`,
      '-e', 'MIDNIGHT_PROOF_SERVER_NUM_WORKERS=1', PROOF_IMAGE,
    ]);
  }
  for (let i = 0; i < 300 && !stopping; i++) {
    if (await proofReady(config.proofUrl)) { log('Proof Server 8.1.0 is ready.'); return; }
    await delay(1000);
  }
  fail('Proof Server startup timed out; check Docker/native prover and parameter-download connectivity.');
}

async function shutdown(code) {
  if (stopping) return;
  stopping = true;
  log('Stopping owned helper processes; persistent state and database volumes are preserved.');
  const active = [...children];
  for (const child of active) stopChild(child, 'SIGTERM');
  await Promise.race([
    Promise.all(active.map((child) => child.exitCode !== null ? Promise.resolve() : new Promise((done) => child.once('exit', done)))),
    delay(forwardingRuntime ? 25000 : 8000),
  ]);
  for (const child of active) { if (child.exitCode === null) stopChild(child, 'SIGKILL'); }
  await Promise.all([...ownedContainers].map((name) =>
    command('docker', ['stop', '--time', '5', name], { quiet: true, timeout: 10000 }).catch(() => {})));
  process.exit(code);
}

export async function main(args = process.argv.slice(2)) {
  const mode = args.find((arg) => arg.startsWith('--mode='))?.slice(7) || 'helpers';
  if (!['helpers', 'all', 'database', 'check'].includes(mode)) fail('Supported modes: helpers, all, database, check.');
  const config = configuration();
  if (mode === 'check') {
    log(`Configuration OK: ${config.network}; gateway ${config.publicPort}, Spring ${config.springPort}, prover ${config.proofPort}.`);
    return;
  }
  process.on('SIGINT', () => void shutdown(0));
  process.on('SIGTERM', () => void shutdown(0));
  if (Number(process.versions.node.split('.')[0]) !== 22) {
    // IntelliJ launched from Finder may inherit the system Node, not nvm's
    // shell PATH. Reuse the already installed project runtime automatically.
    const nvmRoot = join(homedir(), '.nvm', 'versions', 'node');
    const versions = await readdir(nvmRoot).catch(() => []);
    const version = versions.includes('v22.21.1') ? 'v22.21.1'
      : versions.filter((name) => /^v22\./.test(name)).sort((a, b) => b.localeCompare(a, undefined, { numeric: true }))[0];
    if (!version) fail('Install Node.js 22 (recommended 22.21.1); this Midnight runtime requires Node 22.');
    const nodeDir = join(nvmRoot, version, 'bin');
    log(`Using the installed ${version} runtime for Midnight.`);
    forwardingRuntime = true;
    const child = spawn(join(nodeDir, 'node'), [fileURLToPath(import.meta.url), ...args], {
      env: { ...process.env, PATH: `${nodeDir}:${process.env.PATH || ''}` }, stdio: 'inherit', detached: true,
    });
    children.add(child);
    child.once('error', () => void shutdown(1));
    child.once('exit', (code) => { children.delete(child); if (!stopping) process.exit(code || 0); });
    return;
  }
  await mkdir(config.stateDir, { recursive: true, mode: 0o700 });
  const token = process.env.MIDNIGHT_DEMO_INTERNAL_TOKEN || (mode === 'all' ? randomBytes(32).toString('hex') : '');
  if (mode !== 'database' && !token) fail('Spring must supply the internal token when starting helpers. Use the Midnight Demo Run configuration.');
  const env = { ...process.env,
    PORT: String(config.publicPort),
    MIDNIGHT_DEMO_MODE: 'hosted-demo', MIDNIGHT_NETWORK_ID: config.network,
    MIDNIGHT_DEMO_STATE_DIR: config.stateDir, MIDNIGHT_DEMO_PORT: String(config.publicPort),
    MIDNIGHT_DEMO_AUTHORITY_URL: `http://127.0.0.1:${config.springPort}`,
    MIDNIGHT_PROOF_SERVER_URL: config.proofUrl.origin, MIDNIGHT_DEMO_INTERNAL_TOKEN: token,
    MIDPROOF_SYNTHETIC_ONLY: process.env.MIDPROOF_SYNTHETIC_ONLY ?? 'true',
    MIDNIGHT_PROOF_SERVER_NUM_WORKERS: process.env.MIDNIGHT_PROOF_SERVER_NUM_WORKERS || '1',
  };
  if (mode !== 'database' && await portOpen(config.publicPort)) {
    fail(`Gateway port ${config.publicPort} is occupied; the existing application was left untouched.`);
  }
  if (mode === 'all' && await portOpen(config.springPort)) {
    fail(`Spring port ${config.springPort} is occupied; the existing application was left untouched.`);
  }
  await ensureDatabase(config);
  if (mode === 'database') return;
  await ensureBuild(config);
  await ensureProver(config, env);
  if (mode === 'all') {
    const jar = process.env.MIDNIGHT_SPRING_JAR || join(ROOT, 'giwa-api', 'build', 'libs', 'app.jar');
    if (!await exists(jar)) fail('Spring app.jar is missing; build giwa-api before all mode.');
    log('Starting Spring on its private port; the Node gateway owns the public port.');
    service('java', ['-jar', jar], { ...env, PORT: String(config.springPort), SERVER_PORT: String(config.springPort),
      SERVER_ADDRESS: '127.0.0.1', SPRING_PROFILES_ACTIVE: 'midnight-demo', MIDNIGHT_RUNTIME_ENABLED: 'false',
    }, ROOT, 'Spring');
  }
  let springReady = false;
  for (let i = 0; i < 120 && !stopping; i++) {
    try {
      const response = await fetch(`http://127.0.0.1:${config.springPort}/health`, { signal: AbortSignal.timeout(1000) });
      if (response.ok) { springReady = true; break; }
    } catch { /* Spring is still starting. */ }
    await delay(1000);
  }
  if (!springReady) fail('Spring did not become ready on its private port.');
  if (env.MIDPROOF_SYNTHETIC_ONLY === 'true' || process.env.MIDPROOF_LOCAL_PREPARE_ACCOUNTS === 'true') {
    await command(process.execPath, [join(ROOT, 'scripts', 'prepare-local-demo-accounts.mjs')], { env, timeout: 60000 });
  }
  if (env.MIDPROOF_SYNTHETIC_ONLY !== 'true' && process.env.MIDNIGHT_DEMO_PREPARE_FIXTURE !== 'false') {
    log('Preparing the approved synthetic demo accounts and existing public receivable through normal application APIs.');
    await command(process.execPath, [join(ROOT, 'scripts', 'prepare-midnight-demo.mjs')], { env, timeout: 300000 });
  }
  log('Starting the Midnight gateway; its bootstrap prepares the wallet, contract, Provider and result reader.');
  service('npm', ['run', 'demo', '--workspace', 'zkloan-credit-scorer-cli'], env, join(ROOT, 'giwa-midnight'), 'Midnight gateway');
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error) => { log(error.message); void shutdown(1); });
}
