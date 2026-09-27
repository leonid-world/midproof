import { assertAuthSessionCurrent, captureAuthSession } from './authSession'

const API_URL = (import.meta.env.VITE_API_URL ?? 'http://localhost:8080').replace(/\/+$/, '')

export class ApiError extends Error {
  constructor(status, code, message, fieldErrors = {}) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
    this.fieldErrors = fieldErrors
  }
}

export async function apiRequest(path, options = {}) {
  const {
    auth = true,
    body,
    headers: customHeaders = {},
    session = auth ? captureAuthSession() : null,
    timeoutMs = 0,
    maxResponseBytes = 0,
    signal,
    ...fetchOptions
  } = options
  const headers = new Headers(customHeaders)
  if (auth) {
    assertAuthSessionCurrent(session)
    if (session.token) headers.set('Authorization', `Bearer ${session.token}`)
  }
  if (body !== undefined && !(body instanceof FormData))
    headers.set('Content-Type', 'application/json')

  // Bounds are opt-in for Midnight. Existing GIWA requests keep their previous deadline policy.
  const controller = new AbortController()
  let timedOut = false
  const forwardAbort = () => controller.abort()
  if (signal?.aborted) controller.abort()
  else signal?.addEventListener('abort', forwardAbort, { once: true })
  const timer =
    timeoutMs > 0
      ? setTimeout(() => {
          timedOut = true
          controller.abort()
        }, timeoutMs)
      : null
  const abortError = () =>
    new ApiError(
      0,
      timedOut ? 'REQUEST_TIMEOUT' : 'REQUEST_CANCELLED',
      timedOut
        ? '서버 응답 시간이 초과되었습니다. 기존 요청 상태를 다시 확인해 주세요.'
        : '요청이 취소되었습니다.',
    )
  const wait = (promise) =>
    new Promise((resolve, reject) => {
      const aborted = () => reject(abortError())
      if (controller.signal.aborted) {
        Promise.resolve(promise).catch(() => undefined)
        reject(abortError())
        return
      }
      controller.signal.addEventListener('abort', aborted, { once: true })
      Promise.resolve(promise)
        .then(resolve, reject)
        .finally(() => controller.signal.removeEventListener('abort', aborted))
    })
  let reader
  let response
  try {
    response = await wait(
      fetch(`${API_URL}${path}`, {
        ...fetchOptions,
        signal: controller.signal,
        headers,
        body: body === undefined || body instanceof FormData ? body : JSON.stringify(body),
      }).then((value) => {
        if (controller.signal.aborted) {
          void value.body?.cancel().catch(() => undefined)
          throw abortError()
        }
        return value
      }),
    )
    const contentType = response.headers.get('content-type') ?? ''
    let payload = null
    if (maxResponseBytes > 0) {
      const oversized = () =>
        new ApiError(0, 'RESPONSE_TOO_LARGE', '서버 응답 크기가 허용 범위를 초과했습니다.')
      const declared = response.headers.get('content-length')
      if (declared && /^\d+$/.test(declared) && BigInt(declared) > BigInt(maxResponseBytes))
        throw oversized()
      reader = response.body?.getReader()
      const decoder = new TextDecoder()
      let bytes = 0
      let text = ''
      if (reader) {
        while (true) {
          const { done, value } = await wait(reader.read())
          if (done) break
          bytes += value.byteLength
          if (bytes > maxResponseBytes) throw oversized()
          text += decoder.decode(value, { stream: true })
        }
      }
      text += decoder.decode()
      if (contentType.includes('application/json') && text) payload = JSON.parse(text)
    } else {
      payload = contentType.includes('application/json') ? await wait(response.json()) : null
    }
    if (auth) assertAuthSessionCurrent(session)
    if (!response.ok) {
      throw new ApiError(
        response.status,
        payload?.code ?? payload?.error?.code ?? `HTTP_${response.status}`,
        payload?.message ??
          payload?.detail ??
          payload?.error?.message ??
          '요청을 처리하지 못했습니다.',
        payload?.fieldErrors ?? {},
      )
    }
    return payload
  } catch (error) {
    if (error instanceof ApiError || error?.code === 'AUTH_SESSION_CHANGED') throw error
    if (controller.signal.aborted) throw abortError()
    if (error instanceof SyntaxError)
      throw new ApiError(0, 'INVALID_API_RESPONSE', '서버 응답 형식을 확인하지 못했습니다.')
    throw new ApiError(0, 'NETWORK_ERROR', '서버에 연결할 수 없습니다. 잠시 후 다시 시도해 주세요.')
  } finally {
    clearTimeout(timer)
    signal?.removeEventListener('abort', forwardAbort)
    if (reader) {
      void reader.cancel().catch(() => undefined)
      reader.releaseLock()
    } else if (response?.body && !response.bodyUsed) {
      void response.body.cancel().catch(() => undefined)
    }
  }
}
