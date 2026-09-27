import { describe, expect, it, vi } from 'vitest';
import {
  createAbortableSingleInFlightOperation,
  OperationInProgressError,
  OperationTimeoutError,
} from '../timeout.js';

describe('abortable single-flight deadline', () => {
  it('returns a value that arrives before the deadline', async () => {
    const run = createAbortableSingleInFlightOperation(async () => 'public-state', 100);
    await expect(run('address')).resolves.toBe('public-state');
    expect(run.getHealth()).toEqual({ status: 'ok', inFlight: false });
  });

  it('rejects a stalled Indexer operation after the deadline', async () => {
    const run = createAbortableSingleInFlightOperation((_address, signal) => new Promise<never>((_resolve, reject) => {
      signal.addEventListener('abort', () => reject(signal.reason), { once: true });
    }), 5);
    await expect(run('address')).rejects.toBeInstanceOf(OperationTimeoutError);
    expect(run.getHealth()).toEqual({ status: 'degraded', inFlight: false });
  });

  it('keeps one operation alive until abort cleanup then permits a successful retry', async () => {
    let cleanupFirst!: () => void;
    let cancelled = false;
    const operation = vi
      .fn<(argument: string, signal: AbortSignal) => Promise<string>>()
      .mockImplementationOnce((_argument, signal) => new Promise((_resolve, reject) => {
        signal.addEventListener('abort', () => {
          cancelled = true;
          cleanupFirst = () => reject(signal.reason);
        }, { once: true });
      }))
      .mockResolvedValueOnce('third-result');
    const run = createAbortableSingleInFlightOperation(operation, 5);
    const first = run('first');
    const rejection = expect(first).rejects.toBeInstanceOf(OperationTimeoutError);
    await vi.waitFor(() => expect(cancelled).toBe(true));
    await expect(run('second')).rejects.toBeInstanceOf(OperationInProgressError);
    expect(operation).toHaveBeenCalledTimes(1);
    cleanupFirst();
    await rejection;
    await expect(run('third')).resolves.toBe('third-result');
    expect(operation).toHaveBeenCalledTimes(2);
    expect(run.getHealth()).toEqual({ status: 'ok', inFlight: false });
  });

  it('forwards parent cancellation without marking the Indexer unavailable', async () => {
    const parent = new AbortController();
    const run = createAbortableSingleInFlightOperation((_address, signal) => new Promise<never>((_resolve, reject) => {
      signal.addEventListener('abort', () => reject(signal.reason), { once: true });
    }), 1_000);
    const pending = run('address', parent.signal);
    parent.abort(new Error('client cancelled'));
    await expect(pending).rejects.toThrow('client cancelled');
    expect(run.getHealth()).toEqual({ status: 'ok', inFlight: false });
  });
});
