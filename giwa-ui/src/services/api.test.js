import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { apiRequest } from './api'
import { captureAuthSession, setAuthSessionToken } from './authSession'
import { listMidnightProofRequests } from './midnight/proofRequests'

function deferred() {
  let resolve
  const promise = new Promise((accept) => {
    resolve = accept
  })
  return { promise, resolve }
}
function json(value) {
  return new Response(JSON.stringify(value), { headers: { 'Content-Type': 'application/json' } })
}

describe('authenticated API and bounded Midnight responses', () => {
  beforeEach(() => setAuthSessionToken('account-a'))
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
    setAuthSessionToken(null)
  })

  it('times out a mailbox before headers even when the transport ignores abort, then allows a retry', async () => {
    vi.useFakeTimers()
    const fetcher = vi
      .fn()
      .mockReturnValueOnce(new Promise(() => {}))
      .mockResolvedValueOnce(json([]))
    vi.stubGlobal('fetch', fetcher)
    const check = expect(listMidnightProofRequests('requested')).rejects.toMatchObject({
      code: 'REQUEST_TIMEOUT',
    })
    await vi.advanceTimersByTimeAsync(10000)
    await check
    expect(fetcher.mock.calls[0][1].signal.aborted).toBe(true)
    await expect(listMidnightProofRequests('requested')).resolves.toEqual([])
    expect(vi.getTimerCount()).toBe(0)
  })

  it('times out and cancels a response that sends one byte but never finishes its body', async () => {
    vi.useFakeTimers()
    const cancel = vi.fn()
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('['))
      },
      cancel,
    })
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          new Response(stream, { headers: { 'Content-Type': 'application/json' } }),
        ),
    )
    const check = expect(listMidnightProofRequests('requested')).rejects.toMatchObject({
      code: 'REQUEST_TIMEOUT',
    })
    await vi.advanceTimersByTimeAsync(10000)
    await check
    expect(cancel).toHaveBeenCalledTimes(1)
    expect(vi.getTimerCount()).toBe(0)
  })

  it.each(['declared', 'streamed'])(
    'rejects a %s oversized response and cancels the body',
    async (kind) => {
      const cancel = vi.fn()
      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(new Uint8Array(65537))
        },
        cancel,
      })
      const headers = {
        'Content-Type': 'application/json',
        ...(kind === 'declared' ? { 'Content-Length': '65537' } : {}),
      }
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(stream, { headers })))
      await expect(listMidnightProofRequests('assigned')).rejects.toMatchObject({
        code: 'RESPONSE_TOO_LARGE',
      })
      expect(cancel).toHaveBeenCalledTimes(1)
    },
  )

  it('honors caller cancellation while reading and releases the request', async () => {
    const cancel = vi.fn()
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(new ReadableStream({ cancel }), {
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
    )
    const controller = new AbortController()
    const check = expect(
      listMidnightProofRequests('assigned', { signal: controller.signal }),
    ).rejects.toMatchObject({ code: 'REQUEST_CANCELLED' })
    await Promise.resolve()
    await Promise.resolve()
    controller.abort()
    await check
    expect(cancel).toHaveBeenCalledTimes(1)
  })

  it('keeps existing GIWA requests without a new deadline or response cap', async () => {
    vi.useFakeTimers()
    const pending = deferred()
    const fetcher = vi.fn().mockReturnValue(pending.promise)
    vi.stubGlobal('fetch', fetcher)
    const request = apiRequest('/receivables')
    await vi.advanceTimersByTimeAsync(20000)
    expect(fetcher.mock.calls[0][1].signal.aborted).toBe(false)
    const value = { large: 'x'.repeat(65537) }
    pending.resolve(json(value))
    await expect(request).resolves.toEqual(value)
  })

  it('does not apply a late account A response after logout and same-token login', async () => {
    const pending = deferred()
    vi.stubGlobal('fetch', vi.fn().mockReturnValue(pending.promise))
    const check = expect(apiRequest('/receivables')).rejects.toMatchObject({
      code: 'AUTH_SESSION_CHANGED',
    })
    setAuthSessionToken(null)
    setAuthSessionToken('account-a')
    pending.resolve(json([{ receivableId: 1 }]))
    await check
  })

  it('refuses to dispatch with a captured session belonging to a previous account', async () => {
    const session = captureAuthSession()
    setAuthSessionToken('account-b')
    const fetcher = vi.fn()
    vi.stubGlobal('fetch', fetcher)
    await expect(apiRequest('/receivables', { session })).rejects.toMatchObject({
      code: 'AUTH_SESSION_CHANGED',
    })
    expect(fetcher).not.toHaveBeenCalled()
  })
})
