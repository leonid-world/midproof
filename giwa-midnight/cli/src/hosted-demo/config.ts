import path from 'node:path';
import type { Config } from '../config.js';
import { currentDir } from '../config.js';

export type DemoNetwork = 'preview' | 'undeployed';
export interface DemoConfig extends Config {
  networkId: DemoNetwork;
  stateDir: string;
  port: number;
  authorityUrl: string;
  internalToken: string;
  allowedOrigins: ReadonlySet<string>;
}
function endpoint(value: string, protocols: string[], name: string): string {
  const url = new URL(value);
  if (!protocols.includes(url.protocol) || url.username || url.password || url.search || url.hash) {
    throw new Error(`Invalid ${name} endpoint.`);
  }
  return value;
}
export function readDemoConfig(env: NodeJS.ProcessEnv = process.env): DemoConfig {
  if (env.MIDNIGHT_DEMO_MODE !== 'hosted-demo') throw new Error('MIDNIGHT_DEMO_MODE must be hosted-demo.');
  const networkId = env.MIDNIGHT_NETWORK_ID ?? 'preview';
  if (networkId !== 'preview' && networkId !== 'undeployed') throw new Error('Only Preview and undeployed demo networks are supported.');
  const port = Number(env.MIDNIGHT_DEMO_PORT ?? env.PORT ?? '8080');
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid demo gateway port.');
  const internalToken = env.MIDNIGHT_DEMO_INTERNAL_TOKEN ?? '';
  if (internalToken.length < 32) throw new Error('A demo internal token of at least 32 characters is required.');
  const stateDir = path.resolve(env.MIDNIGHT_DEMO_STATE_DIR ?? path.join(currentDir, '../../.midnight-demo', networkId));
  const authorityUrl = endpoint(env.MIDNIGHT_DEMO_AUTHORITY_URL ?? 'http://127.0.0.1:8081', ['http:'], 'authority');
  if (!['127.0.0.1', '[::1]', 'localhost'].includes(new URL(authorityUrl).hostname)) throw new Error('Spring authority must use loopback.');
  const preview = networkId === 'preview';
  const origins = (env.MIDNIGHT_DEMO_ALLOWED_ORIGINS ?? 'http://localhost:5173,http://127.0.0.1:5173').split(',').map((value) => value.trim()).filter(Boolean);
  for (const value of origins) if (new URL(value).origin !== value || !['https:', 'http:'].includes(new URL(value).protocol)) throw new Error('Invalid demo browser origin.');
  return {
    networkId, stateDir, port, authorityUrl, internalToken, allowedOrigins: new Set(origins),
    logDir: path.join(stateDir, 'demo.log'),
    privateStateDatabase: path.join(stateDir, 'private-state'),
    node: endpoint(env.MIDNIGHT_NODE_URL ?? (preview ? 'https://rpc.preview.midnight.network' : 'http://127.0.0.1:9944'), ['http:', 'https:', 'ws:', 'wss:'], 'node'),
    indexer: endpoint(env.MIDNIGHT_INDEXER_URL ?? (preview ? 'https://indexer.preview.midnight.network/api/v4/graphql' : 'http://127.0.0.1:8088/api/v4/graphql'), ['http:', 'https:'], 'indexer'),
    indexerWS: endpoint(env.MIDNIGHT_INDEXER_WS_URL ?? (preview ? 'wss://indexer.preview.midnight.network/api/v4/graphql/ws' : 'ws://127.0.0.1:8088/api/v4/graphql/ws'), ['ws:', 'wss:'], 'indexer WebSocket'),
    proofServer: endpoint(env.MIDNIGHT_PROOF_SERVER_URL ?? 'http://127.0.0.1:6300', ['http:', 'https:'], 'proof server'),
  };
}

// Deliberately synthetic and independent of company identity. These are fixtures,
// not institution records. No caller-supplied financial tuple enters hosted mode.
export const DEMO_PROFILES = Object.freeze([
  Object.freeze({ id: 'steady', label: '가상 기업 A', summary: '안정적 재무 · 연체 없음', annualRevenueKrw: 900_000_000n, debtRatioBps: 12_000n, overdueCount: 0n }),
  Object.freeze({ id: 'stretched', label: '가상 기업 B', summary: '높은 부채 · 연체 있음', annualRevenueKrw: 300_000_000n, debtRatioBps: 28_000n, overdueCount: 3n }),
]);
export function isDemoFinancialInput(input: { annualRevenueKrw: bigint; debtRatioBps: bigint; overdueCount: bigint }): boolean {
  return DEMO_PROFILES.some((p) => p.annualRevenueKrw === input.annualRevenueKrw && p.debtRatioBps === input.debtRatioBps && p.overdueCount === input.overdueCount);
}
