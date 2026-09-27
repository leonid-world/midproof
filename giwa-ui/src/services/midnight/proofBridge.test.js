import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  cancelProofSession,
  normalizeProofInput,
  parseProofSessionStatus,
  readProofSessionStatus,
  requestProofChallenge,
  submitProofAuthorization,
} from './proofBridge'
import {
  makeAuthorizationRequest,
  makeAuthorizationResponse,
  makeProofCapability,
  SESSION_ID,
} from '../../test/midnightFixtures'

function validInput() {
  return {
    version: 1,
    onchainReceivableId: '1',
    subjectRole: 'SELLER',
    annualRevenueKrw: '500000000',
    debtRatioBps: '20000',
    overdueCount: '1',
    secretPin: '1234',
  }
}

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  })
}

const TRUSTED_PROVIDER_ERRORS = Object.freeze([
  Object.freeze({
    status: 404,
    code: 'GIWA_RECEIVABLE_NOT_FOUND',
    message:
      '온체인에서 해당 채권을 찾을 수 없습니다. 화면의 DB 채권 번호와 온체인 채권 ID가 다를 수 있으니 다시 확인해 주세요.',
  }),
  Object.freeze({
    status: 502,
    code: 'GIWA_RPC_UNAVAILABLE',
    message: '채권 네트워크 RPC에서 채권 정보를 확인하지 못했습니다. 잠시 후 다시 시도해 주세요.',
  }),
  Object.freeze({
    status: 403,
    code: 'ROLE_WALLET_MISMATCH',
    message:
      '선택한 MetaMask 계정이 이 증명의 Seller 또는 Buyer 역할 지갑과 일치하지 않습니다. 해당 역할 당사자가 자신의 지갑으로 증명을 시작해 주세요.',
  }),
])
const TRUSTED_PROVIDER_HTTP_ERRORS = Object.freeze(TRUSTED_PROVIDER_ERRORS.slice(0, 2))
const FIXED_PROOF_FAILED_MESSAGE =
  '로컬 ZK 증명을 완료하지 못했습니다. 입력은 다시 표시되지 않습니다.'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('normalizeProofInput', () => {
  it('keeps every integer as a canonical decimal string', () => {
    const input = {
      ...validInput(),
      onchainReceivableId: ((1n << 256n) - 1n).toString(),
      annualRevenueKrw: ((1n << 64n) - 1n).toString(),
      debtRatioBps: ((1n << 32n) - 1n).toString(),
      overdueCount: ((1n << 16n) - 1n).toString(),
      secretPin: '0',
    }

    expect(normalizeProofInput(input)).toEqual(input)
  })

  it.each([
    ['leading zero', { secretPin: '00' }],
    ['whitespace', { annualRevenueKrw: ' 1' }],
    ['exponent', { debtRatioBps: '2e4' }],
    ['uint16 overflow', { overdueCount: '65536' }],
    ['uint64 overflow', { annualRevenueKrw: (1n << 64n).toString() }],
    ['zero receivable', { onchainReceivableId: '0' }],
  ])('rejects %s', (_label, replacement) => {
    expect(() => normalizeProofInput({ ...validInput(), ...replacement })).toThrow()
  })

  it('rejects extra request keys', () => {
    expect(() => normalizeProofInput({ ...validInput(), rawSecret: 'no' })).toThrow()
  })
})

describe('Proof Bridge wire contract', () => {
  it('uses only the dedicated same-origin bridge contract for challenge', async () => {
    const authorizationRequest = makeAuthorizationRequest()
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse(
        {
          version: 1,
          sessionId: SESSION_ID,
          expiresAt: authorizationRequest.message.expiresAt,
          authorizationRequest,
        },
        201,
      ),
    )
    vi.stubGlobal('fetch', fetchMock)

    const response = await requestProofChallenge(validInput())

    expect(response.sessionId).toBe(SESSION_ID)
    expect(fetchMock).toHaveBeenCalledOnce()
    const [url, options] = fetchMock.mock.calls[0]
    expect(url).toBe('/midnight-proof/v1/proof-sessions/challenge')
    expect(options).toMatchObject({
      method: 'POST',
      cache: 'no-store',
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
    })
    expect(options.headers).toEqual({
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'X-GASOK-MIDNIGHT-UI': '1',
    })
    expect(JSON.parse(options.body)).toEqual(validInput())
  })

  it('reports a stopped proxied Bridge as unavailable instead of a JSON schema error', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response('', {
          status: 502,
          headers: { 'Content-Type': 'text/plain' },
        }),
      ),
    )

    await expect(requestProofChallenge(validInput())).rejects.toMatchObject({
      code: 'MIDNIGHT_PROOF_BRIDGE_UNAVAILABLE',
      message: '로컬 Proof Bridge에 연결할 수 없습니다.',
    })
  })

  it('keeps an ambiguous prove outage on the status-only recovery path', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response('', {
          status: 502,
          headers: { 'Content-Type': 'text/plain' },
        }),
      ),
    )

    await expect(
      submitProofAuthorization(SESSION_ID, makeAuthorizationResponse()),
    ).rejects.toMatchObject({
      code: 'MIDNIGHT_PROOF_BRIDGE_UNAVAILABLE',
      requestMayHaveSucceeded: true,
    })
  })

  it('still rejects a successful non-JSON response as an invalid wire response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response('', {
          status: 201,
          headers: { 'Content-Type': 'text/plain' },
        }),
      ),
    )

    await expect(requestProofChallenge(validInput())).rejects.toMatchObject({
      code: 'INVALID_PROOF_BRIDGE_RESPONSE',
    })
  })

  it.each(TRUSTED_PROVIDER_HTTP_ERRORS)(
    'preserves trusted Provider code $code with a fixed local message',
    async ({ status, code, message }) => {
      const privateMarker = 'annualRevenueKrw=500000000 secretPin=1349 rpc-internals'
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue(
          jsonResponse(
            {
              error: { code, message: privateMarker },
            },
            status,
          ),
        ),
      )

      let caught
      try {
        await requestProofChallenge(validInput())
      } catch (error) {
        caught = error
      }

      expect(caught).toMatchObject({ code, message })
      expect(caught.message).not.toContain(privateMarker)
      expect(caught.stack).not.toContain(privateMarker)
      expect(JSON.stringify(caught)).not.toContain(privateMarker)
    },
  )

  it.each([
    {
      label: 'busy challenge',
      status: 409,
      code: 'PROOF_SESSION_BUSY',
      message:
        '다른 로컬 증명 세션이 진행 중입니다. 해당 흐름을 완료하거나 취소한 뒤 다시 시도해 주세요.',
      invoke: () => requestProofChallenge(validInput()),
    },
    {
      label: 'missing status session',
      status: 404,
      code: 'PROOF_SESSION_NOT_FOUND',
      message: '로컬 증명 세션을 찾지 못했습니다. 이 세션의 상태는 더 확인할 수 없습니다.',
      invoke: () => readProofSessionStatus(SESSION_ID),
    },
    {
      label: 'expired prove session',
      status: 409,
      code: 'PROOF_SESSION_EXPIRED',
      message: '지갑 서명 대기 시간이 지나 증명 세션이 만료되었습니다.',
      invoke: () => submitProofAuthorization(SESSION_ID, makeAuthorizationResponse()),
    },
    {
      label: 'already-used prove session',
      status: 409,
      code: 'PROOF_SESSION_ALREADY_USED',
      message: '이 증명 세션에는 이미 서명이 제출되어 다시 사용할 수 없습니다.',
      invoke: () => submitProofAuthorization(SESSION_ID, makeAuthorizationResponse()),
    },
    {
      label: 'non-cancellable session',
      status: 409,
      code: 'PROOF_SESSION_NOT_CANCELLABLE',
      message: '이미 증명 처리가 시작되어 이 세션을 안전하게 취소할 수 없습니다.',
      invoke: () => cancelProofSession(SESSION_ID),
    },
  ])(
    'preserves the exact safe $label code without reflecting its server message',
    async ({ status, code, message, invoke }) => {
      const privateMarker = 'private-session-store-marker'
      vi.stubGlobal(
        'fetch',
        vi
          .fn()
          .mockResolvedValue(jsonResponse({ error: { code, message: privateMarker } }, status)),
      )

      let caught
      try {
        await invoke()
      } catch (error) {
        caught = error
      }

      expect(caught).toMatchObject({ code, message })
      expect(caught.message).not.toContain(privateMarker)
      expect(caught.stack).not.toContain(privateMarker)
    },
  )

  it('does not preserve a safe session code on the wrong endpoint', async () => {
    const privateMarker = 'wrong-path-private-marker'
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          jsonResponse({ error: { code: 'PROOF_SESSION_BUSY', message: privateMarker } }, 409),
        ),
    )

    let caught
    try {
      await readProofSessionStatus(SESSION_ID)
    } catch (error) {
      caught = error
    }

    expect(caught).toMatchObject({ code: 'MIDNIGHT_PROOF_BRIDGE_ERROR' })
    expect(caught.message).not.toContain(privateMarker)
  })

  it.each([
    [500, 'GIWA_RECEIVABLE_NOT_FOUND'],
    [404, 'UNAPPROVED_PROVIDER_ERROR'],
    [403, 'ROLE_WALLET_MISMATCH'],
  ])(
    'keeps an untrusted Provider HTTP %i %s tuple generic and non-reflective',
    async (status, code) => {
      const privateMarker = 'provider-private-response-body'
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue(
          jsonResponse(
            {
              error: { code, message: privateMarker },
            },
            status,
          ),
        ),
      )

      let caught
      try {
        await requestProofChallenge(validInput())
      } catch (error) {
        caught = error
      }

      expect(caught).toMatchObject({ code: 'MIDNIGHT_PROOF_BRIDGE_ERROR' })
      expect(caught.message).not.toContain(privateMarker)
      expect(caught.stack).not.toContain(privateMarker)
      expect(JSON.stringify(caught)).not.toContain(privateMarker)
    },
  )

  it('requires the exact Provider error envelope before preserving its code', async () => {
    const privateMarker = 'private-provider-details'
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse(
          {
            error: {
              code: 'GIWA_RECEIVABLE_NOT_FOUND',
              message: privateMarker,
            },
            debug: privateMarker,
          },
          404,
        ),
      ),
    )

    let caught
    try {
      await requestProofChallenge(validInput())
    } catch (error) {
      caught = error
    }

    expect(caught).toMatchObject({ code: 'MIDNIGHT_PROOF_BRIDGE_ERROR' })
    expect(caught.message).not.toContain(privateMarker)
  })

  it('rejects a non-canonical server expiresAt as a bridge response error', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse(
          {
            version: 1,
            sessionId: SESSION_ID,
            expiresAt: '001',
            authorizationRequest: makeAuthorizationRequest(),
          },
          201,
        ),
      ),
    )

    await expect(requestProofChallenge(validInput())).rejects.toMatchObject({
      code: 'INVALID_PROOF_BRIDGE_RESPONSE',
    })
  })

  it('rejects a challenge for another receivable role context', async () => {
    const authorizationRequest = makeAuthorizationRequest()
    authorizationRequest.message.subjectRole = 'BUYER'
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse(
          {
            version: 1,
            sessionId: SESSION_ID,
            expiresAt: authorizationRequest.message.expiresAt,
            authorizationRequest,
          },
          201,
        ),
      ),
    )

    await expect(requestProofChallenge(validInput())).rejects.toMatchObject({
      code: 'INVALID_PROOF_BRIDGE_RESPONSE',
    })
  })

  it('caps streamed bridge responses before parsing them', async () => {
    const cancel = vi.fn().mockResolvedValue(undefined)
    const releaseLock = vi.fn()
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        status: 201,
        ok: true,
        headers: new Headers({ 'Content-Type': 'application/json' }),
        body: {
          getReader: () => ({
            read: vi.fn().mockResolvedValueOnce({
              done: false,
              value: new Uint8Array(64 * 1_024 + 1),
            }),
            cancel,
            releaseLock,
          }),
        },
      }),
    )

    await expect(requestProofChallenge(validInput())).rejects.toMatchObject({
      code: 'INVALID_PROOF_BRIDGE_RESPONSE',
    })
    expect(cancel).toHaveBeenCalledOnce()
    expect(releaseLock).toHaveBeenCalledOnce()
  })

  it('aborts a stalled bridge request after the bounded timeout', async () => {
    vi.useFakeTimers()
    vi.stubGlobal(
      'fetch',
      vi.fn(
        (_url, options) =>
          new Promise((_resolve, reject) => {
            options.signal.addEventListener('abort', () => {
              reject(new DOMException('Aborted', 'AbortError'))
            })
          }),
      ),
    )

    const request = expect(requestProofChallenge(validInput())).rejects.toMatchObject({
      code: 'MIDNIGHT_PROOF_BRIDGE_TIMEOUT',
    })
    await vi.advanceTimersByTimeAsync(10_000)
    await request
    vi.useRealTimers()
  })

  it('preserves an explicit caller abort instead of remapping it to a bridge outage', async () => {
    const controller = new AbortController()
    vi.stubGlobal(
      'fetch',
      vi.fn(
        (_url, options) =>
          new Promise((_resolve, reject) => {
            options.signal.addEventListener('abort', () => {
              reject(new DOMException('Aborted', 'AbortError'))
            })
          }),
      ),
    )

    const request = expect(
      requestProofChallenge(validInput(), { signal: controller.signal }),
    ).rejects.toMatchObject({ name: 'AbortError' })
    controller.abort()
    await request
  })

  it('requires the exact 32-byte lowercase hexadecimal session ID', () => {
    expect(() =>
      parseProofSessionStatus(
        { version: 1, sessionId: '550e8400-e29b-41d4-a716-446655440000', status: 'indexing' },
        '550e8400-e29b-41d4-a716-446655440000',
      ),
    ).toThrow(/session ID/)

    expect(() =>
      parseProofSessionStatus(
        { version: 1, sessionId: `0x${'2'.repeat(64)}`, status: 'indexing' },
        SESSION_ID,
      ),
    ).toThrow(/다른 세션/)

    const zeroSessionId = `0x${'0'.repeat(64)}`
    expect(() =>
      parseProofSessionStatus(
        { version: 1, sessionId: zeroSessionId, status: 'indexing' },
        zeroSessionId,
      ),
    ).toThrow(/session ID/)
  })

  it('parses the exact status discriminated union and rejects extra keys', () => {
    const complete = parseProofSessionStatus(
      {
        version: 1,
        sessionId: SESSION_ID,
        status: 'complete',
        proofCapability: makeProofCapability(),
      },
      SESSION_ID,
    )
    expect(complete.proofCapability.onchainReceivableId).toBe('1')

    const failed = parseProofSessionStatus(
      {
        version: 1,
        sessionId: SESSION_ID,
        status: 'failed',
        error: { code: 'PROOF_FAILED', message: '증명 생성에 실패했습니다.' },
      },
      SESSION_ID,
    )
    expect(failed.error).toEqual({ code: 'PROOF_FAILED', message: FIXED_PROOF_FAILED_MESSAGE })

    expect(
      parseProofSessionStatus({ version: 1, sessionId: SESSION_ID, status: 'expired' }, SESSION_ID)
        .status,
    ).toBe('expired')
    expect(
      parseProofSessionStatus(
        { version: 1, sessionId: SESSION_ID, status: 'cancelled' },
        SESSION_ID,
      ).status,
    ).toBe('cancelled')

    expect(() =>
      parseProofSessionStatus(
        { version: 1, sessionId: SESSION_ID, status: 'indexing', transactionHash: 'hidden' },
        SESSION_ID,
      ),
    ).toThrow()
  })

  it.each(TRUSTED_PROVIDER_ERRORS)(
    'replaces a failed-session $code message with the fixed local message',
    ({ code, message }) => {
      const privateMarker = 'private-attestation-upstream-message'
      const failed = parseProofSessionStatus(
        {
          version: 1,
          sessionId: SESSION_ID,
          status: 'failed',
          error: { code, message: privateMarker },
        },
        SESSION_ID,
      )

      expect(failed.error).toEqual({ code, message })
      expect(JSON.stringify(failed)).not.toContain(privateMarker)
    },
  )

  it('maps the duplicate result code to fixed copy without reflecting the failed-session message', () => {
    const privateMarker = 'annualRevenue=secret duplicate internals'
    const failed = parseProofSessionStatus(
      {
        version: 1,
        sessionId: SESSION_ID,
        status: 'failed',
        error: { code: 'ELIGIBILITY_RESULT_ALREADY_EXISTS', message: privateMarker },
      },
      SESSION_ID,
    )

    expect(failed.error).toEqual({
      code: 'ELIGIBILITY_RESULT_ALREADY_EXISTS',
      message: '이 채권 역할의 적격성 결과가 이미 발급되어 새 증명을 만들 수 없습니다.',
    })
    expect(JSON.stringify(failed)).not.toContain(privateMarker)
  })

  it('collapses every unknown failed-session code and message to a fixed generic failure', () => {
    const privateMarker = 'provider-private-unknown-failure'
    const failed = parseProofSessionStatus(
      {
        version: 1,
        sessionId: SESSION_ID,
        status: 'failed',
        error: { code: 'UNKNOWN_PROVIDER_FAILURE', message: privateMarker },
      },
      SESSION_ID,
    )

    expect(failed.error).toEqual({ code: 'PROOF_FAILED', message: FIXED_PROOF_FAILED_MESSAGE })
    expect(JSON.stringify(failed)).not.toContain(privateMarker)
  })

  it('requires an exact 202 prove acknowledgement and never sends cookies', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        jsonResponse({ version: 1, sessionId: SESSION_ID, status: 'attesting' }, 202),
      )
    vi.stubGlobal('fetch', fetchMock)

    await expect(
      submitProofAuthorization(SESSION_ID, makeAuthorizationResponse()),
    ).resolves.toMatchObject({ status: 'attesting' })
    const [url, options] = fetchMock.mock.calls[0]
    expect(url).toBe('/midnight-proof/v1/proof-sessions/prove')
    expect(options.credentials).toBe('omit')
    expect(Object.keys(JSON.parse(options.body)).sort()).toEqual([
      'authorization',
      'sessionId',
      'version',
    ])
  })

  it.each([
    ['authorizationId', `0x${'0'.repeat(64)}`],
    ['typedDataHash', `0x${'0'.repeat(64)}`],
    ['signer', `0x${'0'.repeat(40)}`],
  ])('rejects a zero %s before sending the prove request', async (field, value) => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    await expect(
      submitProofAuthorization(SESSION_ID, {
        ...makeAuthorizationResponse(),
        [field]: value,
      }),
    ).rejects.toMatchObject({ code: 'INVALID_PROOF_INPUT' })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('rejects an otherwise valid response when any endpoint returns the wrong 2xx status', async () => {
    const authorizationRequest = makeAuthorizationRequest()
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse(
          {
            version: 1,
            sessionId: SESSION_ID,
            expiresAt: authorizationRequest.message.expiresAt,
            authorizationRequest,
          },
          200,
        ),
      )
      .mockResolvedValueOnce(
        jsonResponse({ version: 1, sessionId: SESSION_ID, status: 'attesting' }, 200),
      )
      .mockResolvedValueOnce(
        jsonResponse({ version: 1, sessionId: SESSION_ID, status: 'indexing' }, 201),
      )
      .mockResolvedValueOnce(
        jsonResponse({ version: 1, sessionId: SESSION_ID, status: 'cancelled' }, 202),
      )
    vi.stubGlobal('fetch', fetchMock)

    await expect(requestProofChallenge(validInput())).rejects.toMatchObject({
      code: 'MIDNIGHT_PROOF_BRIDGE_ERROR',
    })
    await expect(
      submitProofAuthorization(SESSION_ID, makeAuthorizationResponse()),
    ).rejects.toMatchObject({ code: 'MIDNIGHT_PROOF_BRIDGE_ERROR' })
    await expect(readProofSessionStatus(SESSION_ID)).rejects.toMatchObject({
      code: 'MIDNIGHT_PROOF_BRIDGE_ERROR',
    })
    await expect(cancelProofSession(SESSION_ID)).rejects.toMatchObject({
      code: 'MIDNIGHT_PROOF_BRIDGE_ERROR',
    })
  })
})
