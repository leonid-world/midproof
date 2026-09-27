import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { configuration, dockerAvailable, freshSchema, ROOT } from './midnight-demo.mjs';

test('an untouched local demo uses separate public/private ports and its own database', () => {
  const config = configuration({});
  assert.equal(config.network, 'preview');
  assert.deepEqual([config.publicPort, config.springPort, config.proofPort], [8080, 8081, 6300]);
  assert.equal(config.manageDatabase, true);
});

test('existing database configuration prevents automatic local database changes', () => {
  for (const key of ['MYSQLHOST', 'DB_HOST', 'DB_PASSWORD', 'SPRING_DATASOURCE_URL']) {
    assert.equal(configuration({ [key]: 'configured' }).manageDatabase, false);
    assert.throws(() => configuration({ [key]: 'configured', MIDNIGHT_DEMO_MANAGE_DATABASE: 'true' }), /override/);
  }
  assert.equal(configuration({ RAILWAY_ENVIRONMENT_ID: 'demo' }).manageDatabase, false);
});

test('production receives Railway ingress while Spring remains on its own port', () => {
  const config = configuration({ PORT: '12000', RAILWAY_ENVIRONMENT_ID: 'demo' });
  assert.equal(config.publicPort, 12000);
  assert.equal(config.springPort, 8081);
  assert.throws(() => configuration({ PORT: '6300' }), /distinct/);
  assert.throws(() => configuration({ PORT: '8081' }), /distinct/);
});

test('managed proving refuses remote witnesses, URL credentials, and prohibited networks', () => {
  for (const url of ['https://example.org', 'http://user:pass@localhost:6300', 'http://localhost:6300/path']) {
    assert.throws(() => configuration({ MIDNIGHT_PROOF_SERVER_URL: url }), /loopback/);
  }
  for (const network of ['preprod', 'mainnet']) {
    assert.throws(() => configuration({ MIDNIGHT_NETWORK_ID: network }), /Only Preview/);
  }
});

test('empty-demo initialization cannot carry destructive canonical DROP statements', async () => {
  const canonical = await readFile(`${ROOT}/.codex/schema.sql`, 'utf8');
  assert.match(canonical, /DROP TABLE/);
  const ddl = freshSchema(canonical);
  assert.doesNotMatch(ddl, /\b(?:DROP|TRUNCATE|DELETE|ALTER)\b/i);
  assert.equal((ddl.match(/CREATE TABLE/g) || []).length, 8);
  assert.throws(() => freshSchema('TRUNCATE TABLE users;'), /destructive/);
});

const desktop = { application: '/Applications/Docker.app', binary: '/Applications/Docker.app/Contents/Resources/bin/docker' };
const unavailable = () => { throw new Error('daemon stopped'); };

test('an already-running Docker daemon is reused without opening or stopping Desktop', async () => {
  const calls = [];
  await dockerAvailable({ platform: 'darwin', env: {}, findDesktop: async () => desktop,
    run: async (program, args) => { calls.push([program, ...args]); return '28.0.0'; } });
  assert.deepEqual(calls, [['docker', 'info', '--format', '{{.ServerVersion}}']]);
});

test('local macOS opens only the installed Docker app and waits for daemon readiness', async () => {
  const calls = [];
  let elapsed = 0;
  let probes = 0;
  await dockerAvailable({ platform: 'darwin', env: {}, findDesktop: async () => desktop,
    now: () => elapsed, pause: async (ms) => { elapsed += ms; },
    run: async (program, args) => {
      calls.push([program, ...args]);
      if (program === 'docker' && ++probes < 3) unavailable();
      return '';
    } });
  assert.equal(elapsed, 1000);
  assert.equal(calls.filter(([program]) => program === '/usr/bin/open').length, 1);
  assert.deepEqual(calls[1], ['/usr/bin/open', '-a', '/Applications/Docker.app']);
  assert.equal(calls.some((call) => call.includes('stop')), false);
});

test('Docker Desktop is never installed automatically when absent', async () => {
  const calls = [];
  await assert.rejects(dockerAvailable({ platform: 'darwin', env: {}, findDesktop: async () => null,
    run: async (program) => { calls.push(program); unavailable(); } }), /not installed/);
  assert.deepEqual(calls, ['docker']);
});

test('Linux and production never open the desktop application', async () => {
  for (const [platform, env] of [['linux', {}], ['darwin', { NODE_ENV: 'production' }], ['darwin', { RAILWAY_ENVIRONMENT_ID: 'demo' }]]) {
    const calls = [];
    await assert.rejects(dockerAvailable({ platform, env, findDesktop: async () => desktop,
      run: async (program) => { calls.push(program); unavailable(); } }), /only enabled for local macOS/);
    assert.deepEqual(calls, ['docker']);
  }
});

test('a stopped Docker Desktop cannot cause unbounded startup waits', async () => {
  let elapsed = 0;
  let opens = 0;
  await assert.rejects(dockerAvailable({ platform: 'darwin', env: {}, findDesktop: async () => desktop,
    now: () => elapsed, pause: async (ms) => { elapsed += ms; },
    run: async (program) => { if (program === '/usr/bin/open') { opens++; return ''; } unavailable(); },
  }), /within 90 seconds/);
  assert.equal(elapsed, 90000);
  assert.equal(opens, 1);
});
