export class OperationTimeoutError extends Error {
  constructor() {
    super('The Midnight Indexer query timed out.');
    this.name = 'OperationTimeoutError';
  }
}

export class OperationInProgressError extends Error {
  constructor() {
    super('A Midnight Indexer query is already in progress.');
    this.name = 'OperationInProgressError';
  }
}

export interface ReaderHealth {
  readonly status: 'ok' | 'degraded';
  readonly inFlight: boolean;
}

/** The operation must honor AbortSignal, including reading its response body. */
export function createAbortableSingleInFlightOperation<TArgument, TResult>(
  operation: (argument: TArgument, signal: AbortSignal) => Promise<TResult>,
  timeoutMs: number,
): ((argument: TArgument, signal?: AbortSignal) => Promise<TResult>) & { getHealth: () => ReaderHealth } {
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs <= 0) throw new RangeError('Invalid Indexer timeout.');
  let inFlight = false;
  let degraded = false;
  const run = async (argument: TArgument, parentSignal?: AbortSignal): Promise<TResult> => {
    parentSignal?.throwIfAborted();
    if (inFlight) throw new OperationInProgressError();
    inFlight = true;
    const controller = new AbortController();
    const onParentAbort = () => controller.abort(parentSignal?.reason);
    parentSignal?.addEventListener('abort', onParentAbort, { once: true });
    const timer = setTimeout(() => controller.abort(new OperationTimeoutError()), timeoutMs);
    try {
      const result = await operation(argument, controller.signal);
      controller.signal.throwIfAborted();
      degraded = false;
      return result;
    } catch (error: unknown) {
      // A disconnected app client is not evidence that the Indexer is down.
      if (!parentSignal?.aborted) degraded = true;
      throw error;
    } finally {
      clearTimeout(timer);
      parentSignal?.removeEventListener('abort', onParentAbort);
      // Release only after the abort-aware transport has finished its cleanup.
      inFlight = false;
    }
  };
  return Object.assign(run, {
    getHealth: (): ReaderHealth => ({ status: degraded ? 'degraded' : 'ok', inFlight }),
  });
}
