import { loadSyntheticDemoFixture } from './hosted-demo/demo-fixture.js';
import { DemoRuns, type DemoRun } from './hosted-demo/demo-runs.js';
import path from 'node:path';
import { readDemoConfig } from './hosted-demo/config.js';
import { loadDemoIdentity, prepareStateDirectory, readEncryptedJson, writeEncryptedJson } from './hosted-demo/state.js';
import { createDemoGateway, type RuntimeState, type SessionOwner } from './hosted-demo/gateway.js';
import { bootstrapDemo, type DemoRuntime } from './hosted-demo/bootstrap.js';
import { acquirePrivateStateProcessLock } from './private-state-process-lock.js';
import { createOwnerPersistence } from './hosted-demo/owners.js';

async function main(): Promise<void> {
  process.umask(0o077);
  const config = readDemoConfig();
  await prepareStateDirectory(config.stateDir);
  const release = await acquirePrivateStateProcessLock('hosted-demo', path.join(config.stateDir, 'private-state.lock'));
  const { identity, password } = await loadDemoIdentity(config);
  const ownerFile = path.join(config.stateDir, 'session-owners.enc');
  const savedOwners = await readEncryptedJson<SessionOwner[]>(ownerFile, password) ?? [];
  const owners = new Map(savedOwners.map((owner) => [owner.sessionId, owner]));
  const ownerPersistence = createOwnerPersistence(owners,
    (snapshot) => writeEncryptedJson(ownerFile, password, snapshot));
  let runtime: DemoRuntime | undefined;
  const state: RuntimeState = { status: 'starting' };
  let closeBootstrap: (() => Promise<void>) | undefined;
  const fixture = await loadSyntheticDemoFixture(config, password);
  const runFile = path.join(config.stateDir, 'synthetic-demo-runs.enc');
  const demoRuns = fixture ? new DemoRuns({ fixture, contractAddress: () => state.contractAddress,
    controller: () => runtime?.controller,
    resolve: async (capability) => { if (!runtime) throw new Error('DEMO_RUNTIME_UNAVAILABLE'); return runtime.resolveCapability(capability); },
    transaction: (requestId) => runtime?.transaction(requestId),
    records: await readEncryptedJson<DemoRun[]>(runFile, password) ?? [],
    save: (records) => writeEncryptedJson(runFile, password, records),
  }) : undefined;
  const gateway = createDemoGateway({ config, state, owners, demoRuns, demoFixture: fixture && { giwaChainId: fixture.giwaChainId, receivableFinanceAddress: fixture.receivableFinanceAddress, onchainReceivableId: fixture.onchainReceivableId }, saveOwners: ownerPersistence.save, controller: () => runtime?.controller, readServer: () => runtime?.reader, readHealthy: () => runtime?.readHealthy() ?? true });
  await new Promise<void>((resolve, reject) => { gateway.once('error', reject); gateway.listen(config.port, '0.0.0.0', resolve); });
  let exiting = false;
  const shutdown = async () => {
    if (exiting) return; exiting = true;
    gateway.close(); await demoRuns?.flush(); await closeBootstrap?.(); await ownerPersistence.flush(); await release.release(); process.exit(0);
  };
  process.once('SIGINT', () => { void shutdown(); }); process.once('SIGTERM', () => { void shutdown(); });
  void bootstrapDemo(config, identity, password, state, (close) => { closeBootstrap = close; }, fixture).then((result) => { runtime = result; }).catch(() => {
    // Never print an SDK Error: it may carry private transaction/witness data.
    state.status = 'failed'; state.code ??= 'MIDNIGHT_BOOTSTRAP_FAILED';
  });
}
void main().catch((error: unknown) => {
  const code = (error as NodeJS.ErrnoException)?.code;
  const fixtureCode = (error as Error)?.message;
  const safeFixtureCode = ['DEMO_FIXTURE_INVALID', 'DEMO_FIXTURE_ROLES_INVALID', 'DEMO_FIXTURE_PRIVATE_FILE_REQUIRED', 'DEMO_RUN_STORE_INVALID', 'SYNTHETIC_CONTEXT_MISMATCH', 'SYNTHETIC_AUTH_STATE_MISSING'].includes(fixtureCode) ? fixtureCode : undefined;
  const safeCode = safeFixtureCode ?? (code === 'EADDRINUSE' ? 'GATEWAY_PORT_IN_USE' : code === 'EACCES' || code === 'EPERM' ? 'STATE_PERMISSION_DENIED' : 'DEMO_STARTUP_FAILED');
  process.stderr.write(JSON.stringify({ service: 'midnight-demo', code: safeCode }) + '\n');
  process.exitCode = 1;
});
