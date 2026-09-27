import { parseProofCapability } from './capabilityVerification'
import { midnightProofConfig } from './config'
import { parseAuthorizationRequest } from './roleAuthorization'

const REQUEST_TIMEOUT_MS = 10_000
const MAX_RESPONSE_BYTES = 64 * 1_024
const UINT16_MAX = (1n << 16n) - 1n
const UINT32_MAX = (1n << 32n) - 1n
const UINT64_MAX = (1n << 64n) - 1n
const UINT256_MAX = (1n << 256n) - 1n
const SESSION_ID_PATTERN = /^0x[0-9a-f]{64}$/
const ZERO_BYTES32 = `0x${'0'.repeat(64)}`
const ERROR_CODE_PATTERN = /^[A-Z0-9_]{1,64}$/
const BRIDGE_HEADER_NAME = 'X-GASOK-MIDNIGHT-UI'
const BRIDGE_HEADER_VALUE = '1'
const TRUSTED_PROVIDER_ERROR_DEFINITIONS = Object.freeze({
  GIWA_RECEIVABLE_NOT_FOUND: Object.freeze({
    status: 404,
    httpPaths: Object.freeze(['/v1/proof-sessions/challenge']),
    message:
      '온체인에서 해당 채권을 찾을 수 없습니다. 화면의 DB 채권 번호와 온체인 채권 ID가 다를 수 있으니 다시 확인해 주세요.',
  }),
  GIWA_RPC_UNAVAILABLE: Object.freeze({
    status: 502,
    httpPaths: Object.freeze(['/v1/proof-sessions/challenge']),
    message: '채권 네트워크 RPC에서 채권 정보를 확인하지 못했습니다. 잠시 후 다시 시도해 주세요.',
  }),
  ROLE_WALLET_MISMATCH: Object.freeze({
    status: 403,
    httpPaths: Object.freeze([]),
    message:
      '선택한 MetaMask 계정이 이 증명의 Seller 또는 Buyer 역할 지갑과 일치하지 않습니다. 해당 역할 당사자가 자신의 지갑으로 증명을 시작해 주세요.',
  }),
})
const FAILED_SESSION_ERROR_DEFINITIONS = Object.freeze({
  ...TRUSTED_PROVIDER_ERROR_DEFINITIONS,
  ELIGIBILITY_RESULT_ALREADY_EXISTS: Object.freeze({
    message: '이 채권 역할의 적격성 결과가 이미 발급되어 새 증명을 만들 수 없습니다.',
  }),
  PROOF_FAILED: Object.freeze({
    message: '로컬 ZK 증명을 완료하지 못했습니다. 입력은 다시 표시되지 않습니다.',
  }),
})
const SAFE_SESSION_HTTP_ERROR_DEFINITIONS = Object.freeze({
  PROOF_SESSION_BUSY: Object.freeze({
    status: 409,
    httpPaths: Object.freeze(['/v1/proof-sessions/challenge']),
    message:
      '다른 로컬 증명 세션이 진행 중입니다. 해당 흐름을 완료하거나 취소한 뒤 다시 시도해 주세요.',
  }),
  PROOF_SESSION_NOT_FOUND: Object.freeze({
    status: 404,
    httpPaths: Object.freeze([
      '/v1/proof-sessions/prove',
      '/v1/proof-sessions/status',
      '/v1/proof-sessions/cancel',
    ]),
    message: '로컬 증명 세션을 찾지 못했습니다. 이 세션의 상태는 더 확인할 수 없습니다.',
  }),
  PROOF_SESSION_EXPIRED: Object.freeze({
    status: 409,
    httpPaths: Object.freeze(['/v1/proof-sessions/prove']),
    message: '지갑 서명 대기 시간이 지나 증명 세션이 만료되었습니다.',
  }),
  PROOF_SESSION_ALREADY_USED: Object.freeze({
    status: 409,
    httpPaths: Object.freeze(['/v1/proof-sessions/prove']),
    message: '이 증명 세션에는 이미 서명이 제출되어 다시 사용할 수 없습니다.',
  }),
  PROOF_SESSION_NOT_CANCELLABLE: Object.freeze({
    status: 409,
    httpPaths: Object.freeze(['/v1/proof-sessions/cancel']),
    message: '이미 증명 처리가 시작되어 이 세션을 안전하게 취소할 수 없습니다.',
  }),
})

const CHALLENGE_REQUEST_KEYS = Object.freeze([
  'annualRevenueKrw',
  'debtRatioBps',
  'onchainReceivableId',
  'overdueCount',
  'secretPin',
  'subjectRole',
  'version',
])
const CHALLENGE_RESPONSE_KEYS = Object.freeze([
  'authorizationRequest',
  'expiresAt',
  'sessionId',
  'version',
])
const SESSION_REQUEST_KEYS = Object.freeze(['sessionId', 'version'])
const PROVE_REQUEST_KEYS = Object.freeze(['authorization', 'sessionId', 'version'])
const AUTHORIZATION_RESPONSE_KEYS = Object.freeze([
  'authorizationId',
  'signature',
  'signer',
  'typedDataHash',
  'version',
])
const BASE_STATUS_KEYS = Object.freeze(['sessionId', 'status', 'version'])
const COMPLETE_STATUS_KEYS = Object.freeze(['proofCapability', 'sessionId', 'status', 'version'])
const FAILED_STATUS_KEYS = Object.freeze(['error', 'sessionId', 'status', 'version'])
const SAFE_ERROR_KEYS = Object.freeze(['code', 'message'])
const BRIDGE_STATUSES = Object.freeze([
  'awaiting_authorization',
  'attesting',
  'proving_and_submitting',
  'indexing',
  'complete',
  'failed',
  'expired',
  'cancelled',
])
const BRIDGE_STATUS_SET = new Set(BRIDGE_STATUSES)
const ACCEPTED_PROOF_STATUS_SET = new Set(['attesting', 'proving_and_submitting', 'indexing'])

export class MidnightProofBridgeError extends Error {
  constructor(code, message, { requestMayHaveSucceeded = false } = {}) {
    super(message)
    this.name = 'MidnightProofBridgeError'
    this.code = code
    this.requestMayHaveSucceeded = requestMayHaveSucceeded
  }
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function hasExactKeys(value, expectedKeys) {
  if (!isRecord(value)) return false
  const keys = Object.keys(value)
  const expected = new Set(expectedKeys)
  return keys.length === expected.size && keys.every((key) => expected.has(key))
}

function hasControlCharacter(value) {
  return Array.from(value).some((character) => {
    const codePoint = character.codePointAt(0)
    return codePoint <= 31 || codePoint === 127
  })
}

function invalidInput(message) {
  return new MidnightProofBridgeError('INVALID_PROOF_INPUT', message)
}

function invalidResponse(message = '로컬 Proof Bridge 응답 형식이 올바르지 않습니다.') {
  return new MidnightProofBridgeError('INVALID_PROOF_BRIDGE_RESPONSE', message)
}

function requireCanonicalDecimal(value, fieldName, maximum, { positive = false } = {}) {
  if (typeof value !== 'string' || !/^(0|[1-9][0-9]*)$/.test(value)) {
    throw invalidInput(`${fieldName}은 부호 없는 canonical 10진수 문자열이어야 합니다.`)
  }
  const parsed = BigInt(value)
  if ((positive && parsed === 0n) || parsed > maximum) {
    throw invalidInput(`${fieldName} 범위가 올바르지 않습니다.`)
  }
  return value
}

function requireResponseCanonicalDecimal(value, fieldName, maximum, { positive = false } = {}) {
  if (typeof value !== 'string' || !/^(0|[1-9][0-9]*)$/.test(value)) {
    throw invalidResponse(`Proof Bridge ${fieldName} 형식이 올바르지 않습니다.`)
  }
  const parsed = BigInt(value)
  if ((positive && parsed === 0n) || parsed > maximum) {
    throw invalidResponse(`Proof Bridge ${fieldName} 범위가 올바르지 않습니다.`)
  }
  return value
}

function requireSessionId(value) {
  if (typeof value !== 'string' || !SESSION_ID_PATTERN.test(value) || value === ZERO_BYTES32) {
    throw invalidResponse('Proof Bridge session ID 형식이 올바르지 않습니다.')
  }
  return value
}

function requireBytes32(value, fieldName) {
  if (typeof value !== 'string' || !/^0x[0-9a-f]{64}$/.test(value) || value === ZERO_BYTES32) {
    throw invalidInput(`${fieldName} 형식이 올바르지 않습니다.`)
  }
  return value
}

function requireAddress(value, fieldName) {
  if (
    typeof value !== 'string' ||
    !/^0x[0-9a-f]{40}$/.test(value) ||
    value === `0x${'0'.repeat(40)}`
  ) {
    throw invalidInput(`${fieldName} 형식이 올바르지 않습니다.`)
  }
  return value
}

export function normalizeProofInput(value) {
  if (!hasExactKeys(value, CHALLENGE_REQUEST_KEYS)) {
    throw invalidInput('증명 입력 필드를 다시 확인해 주세요.')
  }
  if (value.version !== 1) throw invalidInput('지원하는 증명 입력 버전은 1입니다.')
  if (value.subjectRole !== 'SELLER' && value.subjectRole !== 'BUYER') {
    throw invalidInput('역할은 SELLER 또는 BUYER여야 합니다.')
  }

  return Object.freeze({
    version: 1,
    onchainReceivableId: requireCanonicalDecimal(
      value.onchainReceivableId,
      '온체인 채권 ID',
      UINT256_MAX,
      { positive: true },
    ),
    subjectRole: value.subjectRole,
    annualRevenueKrw: requireCanonicalDecimal(value.annualRevenueKrw, '연매출', UINT64_MAX),
    debtRatioBps: requireCanonicalDecimal(value.debtRatioBps, '부채비율', UINT32_MAX),
    overdueCount: requireCanonicalDecimal(value.overdueCount, '연체 건수', UINT16_MAX),
    secretPin: requireCanonicalDecimal(value.secretPin, 'Secret PIN', UINT16_MAX),
  })
}

function normalizeSessionRequest(sessionId) {
  const value = { version: 1, sessionId }
  if (!hasExactKeys(value, SESSION_REQUEST_KEYS))
    throw invalidInput('세션 요청이 올바르지 않습니다.')
  return Object.freeze({ version: 1, sessionId: requireSessionId(sessionId) })
}

function normalizeAuthorizationResponse(value) {
  if (!hasExactKeys(value, AUTHORIZATION_RESPONSE_KEYS) || value.version !== 1) {
    throw invalidInput('EIP-712 authorization response 형식이 올바르지 않습니다.')
  }
  const authorizationId = requireBytes32(value.authorizationId, 'authorizationId')
  const typedDataHash = requireBytes32(value.typedDataHash, 'typedDataHash')
  const signer = requireAddress(value.signer, 'signer')
  if (typeof value.signature !== 'string' || !/^0x[0-9a-fA-F]{130}$/.test(value.signature)) {
    throw invalidInput('EIP-712 signature 형식이 올바르지 않습니다.')
  }
  return Object.freeze({
    version: 1,
    authorizationId,
    typedDataHash,
    signer,
    signature: value.signature,
  })
}

function parseJson(text) {
  if (!text) return null
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}

async function readCappedResponseText(response) {
  const contentLength = response.headers.get('content-length')
  if (contentLength !== null && /^\d+$/.test(contentLength)) {
    if (BigInt(contentLength) > BigInt(MAX_RESPONSE_BYTES)) {
      await response.body?.cancel().catch(() => undefined)
      throw invalidResponse('Proof Bridge 응답이 허용된 크기를 초과했습니다.')
    }
  }
  if (!response.body) return ''

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let byteLength = 0
  let text = ''
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      byteLength += value.byteLength
      if (byteLength > MAX_RESPONSE_BYTES) {
        await reader.cancel().catch(() => undefined)
        throw invalidResponse('Proof Bridge 응답이 허용된 크기를 초과했습니다.')
      }
      text += decoder.decode(value, { stream: true })
    }
    return text + decoder.decode()
  } finally {
    reader.releaseLock()
  }
}

function trustedProviderErrorDefinition(code) {
  if (typeof code !== 'string' || !Object.hasOwn(TRUSTED_PROVIDER_ERROR_DEFINITIONS, code)) {
    return null
  }
  return TRUSTED_PROVIDER_ERROR_DEFINITIONS[code]
}

function failedSessionErrorDefinition(code) {
  if (typeof code !== 'string' || !Object.hasOwn(FAILED_SESSION_ERROR_DEFINITIONS, code)) {
    return null
  }
  return FAILED_SESSION_ERROR_DEFINITIONS[code]
}

function safeSessionHttpErrorDefinition(code) {
  if (typeof code !== 'string' || !Object.hasOwn(SAFE_SESSION_HTTP_ERROR_DEFINITIONS, code)) {
    return null
  }
  return SAFE_SESSION_HTTP_ERROR_DEFINITIONS[code]
}

function parseTrustedProviderHttpError(path, response, payload) {
  if (!hasExactKeys(payload, ['error']) || !hasExactKeys(payload.error, SAFE_ERROR_KEYS)) {
    return null
  }
  const definition = trustedProviderErrorDefinition(payload.error.code)
  if (
    definition === null ||
    typeof payload.error.message !== 'string' ||
    definition.status !== response.status ||
    !definition.httpPaths.includes(path)
  ) {
    return null
  }
  return new MidnightProofBridgeError(payload.error.code, definition.message)
}

function parseSafeSessionHttpError(path, response, payload) {
  if (!hasExactKeys(payload, ['error']) || !hasExactKeys(payload.error, SAFE_ERROR_KEYS)) {
    return null
  }
  const definition = safeSessionHttpErrorDefinition(payload.error.code)
  if (
    definition === null ||
    typeof payload.error.message !== 'string' ||
    definition.status !== response.status ||
    !definition.httpPaths.includes(path)
  ) {
    return null
  }
  return new MidnightProofBridgeError(payload.error.code, definition.message)
}

function safeHttpError(path, response, payload) {
  const providerError = parseTrustedProviderHttpError(path, response, payload)
  if (providerError !== null) return providerError
  const sessionError = parseSafeSessionHttpError(path, response, payload)
  if (sessionError !== null) return sessionError
  const messages = {
    400: 'Proof Bridge가 요청 형식을 거부했습니다.',
    404: 'Proof Bridge 세션을 찾지 못했습니다.',
    409: '현재 Proof Bridge 세션 상태에서는 이 작업을 수행할 수 없습니다.',
    410: 'Proof Bridge 세션이 만료되었습니다.',
    413: 'Proof Bridge 요청이 허용된 크기를 초과했습니다.',
    429: '다른 로컬 증명 세션이 진행 중입니다. 완료 후 다시 시도해 주세요.',
    503: '로컬 Midnight 증명 구성요소를 사용할 수 없습니다.',
  }
  return new MidnightProofBridgeError(
    'MIDNIGHT_PROOF_BRIDGE_ERROR',
    messages[response.status] ?? `Proof Bridge가 요청을 처리하지 못했습니다. (${response.status})`,
  )
}

async function bridgeRequest(path, body, { signal, expectedStatus, requestMayHaveSucceeded } = {}) {
  const requestController = new AbortController()
  let timedOut = false
  const forwardAbort = () => requestController.abort()
  if (signal?.aborted) requestController.abort()
  else signal?.addEventListener('abort', forwardAbort, { once: true })
  const timeout = setTimeout(() => {
    timedOut = true
    requestController.abort()
  }, REQUEST_TIMEOUT_MS)

  let response
  let responseText
  try {
    response = await fetch(`${midnightProofConfig.apiUrl}${path}`, {
      method: 'POST',
      signal: requestController.signal,
      cache: 'no-store',
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        [BRIDGE_HEADER_NAME]: BRIDGE_HEADER_VALUE,
      },
      body: JSON.stringify(body),
    })
    const contentType = response.headers.get('content-type') ?? ''
    if (!/^application\/json(?:\s*;|$)/i.test(contentType)) {
      await response.body?.cancel().catch(() => undefined)
      if (response.status === 502) {
        throw new MidnightProofBridgeError(
          'MIDNIGHT_PROOF_BRIDGE_UNAVAILABLE',
          '로컬 Proof Bridge에 연결할 수 없습니다.',
          { requestMayHaveSucceeded },
        )
      }
      throw invalidResponse('Proof Bridge가 JSON 응답을 반환하지 않았습니다.')
    }
    responseText = await readCappedResponseText(response)
  } catch (error) {
    if (signal?.aborted) throw error
    if (error instanceof MidnightProofBridgeError) {
      if (requestMayHaveSucceeded) error.requestMayHaveSucceeded = true
      throw error
    }
    throw new MidnightProofBridgeError(
      timedOut ? 'MIDNIGHT_PROOF_BRIDGE_TIMEOUT' : 'MIDNIGHT_PROOF_BRIDGE_UNAVAILABLE',
      timedOut
        ? 'Proof Bridge 응답 시간이 초과되었습니다.'
        : '로컬 Proof Bridge에 연결할 수 없습니다.',
      { requestMayHaveSucceeded },
    )
  } finally {
    clearTimeout(timeout)
    signal?.removeEventListener('abort', forwardAbort)
  }

  const payload = parseJson(responseText)
  if (!response.ok || (expectedStatus !== undefined && response.status !== expectedStatus)) {
    const error = safeHttpError(path, response, payload)
    error.requestMayHaveSucceeded = Boolean(requestMayHaveSucceeded)
    throw error
  }
  if (!payload) {
    throw new MidnightProofBridgeError(
      'INVALID_PROOF_BRIDGE_RESPONSE',
      'Proof Bridge가 올바른 JSON 객체를 반환하지 않았습니다.',
      { requestMayHaveSucceeded },
    )
  }
  return payload
}

function parseChallengeResponse(payload, request) {
  if (!hasExactKeys(payload, CHALLENGE_RESPONSE_KEYS) || payload.version !== 1) {
    throw invalidResponse('Proof Bridge challenge 응답 필드를 확인해 주세요.')
  }
  const sessionId = requireSessionId(payload.sessionId)
  const expiresAt = requireResponseCanonicalDecimal(payload.expiresAt, 'expiresAt', UINT64_MAX, {
    positive: true,
  })
  const authorizationRequest = parseAuthorizationRequest(
    JSON.stringify(payload.authorizationRequest),
  )
  if (
    authorizationRequest.message.expiresAt !== expiresAt ||
    authorizationRequest.message.onchainReceivableId !== request.onchainReceivableId ||
    authorizationRequest.message.subjectRole !== request.subjectRole
  ) {
    throw invalidResponse('Challenge 응답이 요청한 채권 역할 문맥과 일치하지 않습니다.')
  }
  return Object.freeze({ version: 1, sessionId, expiresAt, authorizationRequest })
}

function parseSafeError(value) {
  if (!hasExactKeys(value, SAFE_ERROR_KEYS)) throw invalidResponse()
  if (typeof value.code !== 'string' || !ERROR_CODE_PATTERN.test(value.code)) {
    throw invalidResponse('Proof Bridge 오류 코드 형식이 올바르지 않습니다.')
  }
  if (
    typeof value.message !== 'string' ||
    !value.message ||
    value.message.length > 500 ||
    hasControlCharacter(value.message)
  ) {
    throw invalidResponse('Proof Bridge 오류 메시지 형식이 올바르지 않습니다.')
  }
  const definition = failedSessionErrorDefinition(value.code)
  if (definition === null) {
    return Object.freeze({
      code: 'PROOF_FAILED',
      message: FAILED_SESSION_ERROR_DEFINITIONS.PROOF_FAILED.message,
    })
  }
  return Object.freeze({ code: value.code, message: definition.message })
}

export function parseProofSessionStatus(payload, expectedSessionId) {
  if (!isRecord(payload) || payload.version !== 1 || !BRIDGE_STATUS_SET.has(payload.status)) {
    throw invalidResponse('Proof Bridge status 응답을 확인해 주세요.')
  }
  const expectedKeys =
    payload.status === 'complete'
      ? COMPLETE_STATUS_KEYS
      : payload.status === 'failed'
        ? FAILED_STATUS_KEYS
        : BASE_STATUS_KEYS
  if (!hasExactKeys(payload, expectedKeys)) throw invalidResponse()
  const sessionId = requireSessionId(payload.sessionId)
  if (sessionId !== expectedSessionId) {
    throw invalidResponse('Proof Bridge가 다른 세션의 상태를 반환했습니다.')
  }

  if (payload.status === 'complete') {
    return Object.freeze({
      version: 1,
      sessionId,
      status: payload.status,
      proofCapability: parseProofCapability(JSON.stringify(payload.proofCapability)),
    })
  }
  if (payload.status === 'failed') {
    return Object.freeze({
      version: 1,
      sessionId,
      status: payload.status,
      error: parseSafeError(payload.error),
    })
  }
  return Object.freeze({ version: 1, sessionId, status: payload.status })
}

function parseAcceptedProofStatus(payload, expectedSessionId) {
  if (
    !hasExactKeys(payload, BASE_STATUS_KEYS) ||
    payload.version !== 1 ||
    !ACCEPTED_PROOF_STATUS_SET.has(payload.status)
  ) {
    throw invalidResponse('Proof Bridge prove 접수 응답을 확인해 주세요.')
  }
  const sessionId = requireSessionId(payload.sessionId)
  if (sessionId !== expectedSessionId) {
    throw invalidResponse('Proof Bridge가 다른 세션의 prove 접수 결과를 반환했습니다.')
  }
  return Object.freeze({ version: 1, sessionId, status: payload.status })
}

export async function requestProofChallenge(input, options = {}) {
  const request = normalizeProofInput(input)
  const payload = await bridgeRequest('/v1/proof-sessions/challenge', request, {
    ...options,
    expectedStatus: 201,
  })
  return parseChallengeResponse(payload, request)
}

export async function submitProofAuthorization(sessionId, authorization, options = {}) {
  const request = Object.freeze({
    version: 1,
    sessionId: requireSessionId(sessionId),
    authorization: normalizeAuthorizationResponse(authorization),
  })
  if (!hasExactKeys(request, PROVE_REQUEST_KEYS))
    throw invalidInput('증명 요청이 올바르지 않습니다.')
  const payload = await bridgeRequest('/v1/proof-sessions/prove', request, {
    ...options,
    expectedStatus: 202,
    requestMayHaveSucceeded: true,
  })
  return parseAcceptedProofStatus(payload, request.sessionId)
}

export async function readProofSessionStatus(sessionId, options = {}) {
  const request = normalizeSessionRequest(sessionId)
  const payload = await bridgeRequest('/v1/proof-sessions/status', request, {
    ...options,
    expectedStatus: 200,
  })
  return parseProofSessionStatus(payload, request.sessionId)
}

export async function cancelProofSession(sessionId, options = {}) {
  const request = normalizeSessionRequest(sessionId)
  const payload = await bridgeRequest('/v1/proof-sessions/cancel', request, {
    ...options,
    expectedStatus: 200,
  })
  return parseProofSessionStatus(payload, request.sessionId)
}
