import { ContractState } from '@midnight-ntwrk/midnight-js-protocol/compact-runtime';
import { INDEXER_MAX_RESPONSE_BYTES, INDEXER_QUERY_TIMEOUT_MS } from './config.js';
import type { QueryContractState } from './eligibility.js';
import { createAbortableSingleInFlightOperation } from './timeout.js';

// Same query and ContractState decoder as midnight-js-indexer-public-data-provider
// 4.1.1. Its public query API has no cancellation handle; this read-only adapter
// uses native fetch so its deadline also cancels a stalled or trickling body.
export const CONTRACT_STATE_QUERY = `query CONTRACT_STATE_QUERY($address: HexEncoded!, $offset: ContractActionOffset) {
  contractAction(address: $address, offset: $offset) { state }
}`;

export interface IndexerQueryOptions {
  readonly timeoutMs?: number;
  readonly maxResponseBytes?: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

async function readBoundedJson(response: Response, signal: AbortSignal, maximum: number): Promise<unknown> {
  const length = response.headers.get('content-length');
  if (length !== null && (!/^(0|[1-9][0-9]*)$/.test(length) || BigInt(length) > BigInt(maximum))) {
    throw new Error('Indexer response is too large.');
  }
  if (!response.body) throw new Error('Indexer response body is missing.');
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      signal.throwIfAborted();
      const { done, value } = await reader.read();
      signal.throwIfAborted();
      if (done) break;
      total += value.byteLength;
      if (total > maximum) throw new Error('Indexer response is too large.');
      chunks.push(value);
    }
    return JSON.parse(Buffer.concat(chunks, total).toString('utf8')) as unknown;
  } finally {
    await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}

export function createContractStateQuery(indexerUrl: string, options: IndexerQueryOptions = {}): QueryContractState {
  const url = new URL(indexerUrl);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
    throw new Error('Invalid Indexer query URL.');
  }
  const maximum = options.maxResponseBytes ?? INDEXER_MAX_RESPONSE_BYTES;
  if (!Number.isSafeInteger(maximum) || maximum <= 0) throw new RangeError('Invalid Indexer response limit.');

  return createAbortableSingleInFlightOperation(async (address: string, signal) => {
    if (!/^[0-9a-f]{64}$/.test(address)) throw new Error('Invalid contract address.');
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ query: CONTRACT_STATE_QUERY, variables: { address, offset: null } }),
      redirect: 'error',
      cache: 'no-store',
      signal,
    });
    try {
      if (!response.ok) throw new Error('Indexer query failed.');
      const body = await readBoundedJson(response, signal, maximum);
      if (!isRecord(body) || (body.errors !== undefined &&
          (!Array.isArray(body.errors) || body.errors.length > 0)) || !isRecord(body.data)) {
        throw new Error('Invalid Indexer query result.');
      }
      const action = body.data.contractAction;
      if (action === null) return null;
      if (!isRecord(action) || typeof action.state !== 'string' || !/^(?:[0-9a-fA-F]{2})+$/.test(action.state)) {
        throw new Error('Invalid Indexer contract state.');
      }
      signal.throwIfAborted();
      return ContractState.deserialize(Buffer.from(action.state, 'hex'));
    } finally {
      // Also close error-status and oversized Content-Length bodies, which
      // are rejected before readBoundedJson acquires a reader.
      if (response.body && !response.body.locked) await response.body.cancel().catch(() => undefined);
    }
  }, options.timeoutMs ?? INDEXER_QUERY_TIMEOUT_MS);
}
