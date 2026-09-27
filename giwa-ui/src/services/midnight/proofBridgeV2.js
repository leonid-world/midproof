import { captureAuthSession, assertAuthSessionCurrent } from '../authSession'
import { isMidnightDemoEnabled, midnightProofConfig } from './config'
import {
  approvedMidnightContractAddress,
  demoAuthorizationHeaders,
  loadMidnightDemoConfig,
} from './demoRuntime'
import { parseAuthorizationRequestV2 } from './roleAuthorizationV2'

const REQUEST_TIMEOUT_MS = 10_000
const MAX_RESPONSE_BYTES = 64 * 1_024
const UINT16_MAX = (1n << 16n) - 1n
const UINT32_MAX = (1n << 32n) - 1n
const UINT64_MAX = (1n << 64n) - 1n
const UINT256_MAX = (1n << 256n) - 1n
const ZERO_BYTES32 = `0x${'0'.repeat(64)}`
const ZERO_BARE_BYTES32 = '0'.repeat(64)
const ZERO_ADDRESS = `0x${'0'.repeat(40)}`
const SESSION_ID_PATTERN = /^0x[0-9a-f]{64}$/
const BRIDGE_HEADER_NAME = 'X-GASOK-MIDNIGHT-UI'
const BRIDGE_HEADER_VALUE = '1'
const APPROVED_GIWA_CHAIN_ID = '91342'
const APPROVED_RECEIVABLE_FINANCE_ADDRESS = '0x0f264334f98ba0d22f7fc6bb901a5fa36158a315'

const CHALLENGE_KEYS = Object.freeze([
  'annualRevenueKrw',
  'debtRatioBps',
  'onchainReceivableId',
  'overdueCount',
  'policyRequest',
  'subjectRole',
  'version',
])
const POLICY_KEYS = Object.freeze([
  'intendedFunderWallet',
  'maxDebtRatioBps',
  'maxOverdueCount',
  'minAnnualRevenueKrw',
  'requestId',
  'validUntil',
])
const CHALLENGE_RESPONSE_KEYS = Object.freeze([
  'authorizationRequest',
  'expiresAt',
  'sessionId',
  'version',
])
const AUTHORIZATION_KEYS = Object.freeze([
  'authorizationId',
  'signature',
  'signer',
  'typedDataHash',
  'version',
])
const BASE_STATUS_KEYS = Object.freeze(['sessionId', 'status', 'version'])
const COMPLETE_STATUS_KEYS = Object.freeze(['proofCapability', 'sessionId', 'status', 'version'])
const FAILED_STATUS_KEYS = Object.freeze(['error', 'sessionId', 'status', 'version'])
const ACKNOWLEDGED_KEYS = Object.freeze(['sessionId', 'status', 'version'])
const SAFE_ERROR_KEYS = Object.freeze(['code', 'message'])
const CAPABILITY_KEYS = Object.freeze([
  'companyCommitment',
  'evaluationVersion',
  'giwaChainId',
  'intendedFunderWallet',
  'lookupKey',
  'maxDebtRatioBps',
  'maxOverdueCount',
  'midnightContractAddress',
  'minAnnualRevenueKrw',
  'onchainReceivableId',
  'partyWallet',
  'policyRequestHash',
  'profileAsOf',
  'receivableFinanceAddress',
  'requestId',
  'subjectRole',
  'validUntil',
  'version',
])
const STATUSES = new Set([
  'awaiting_authorization',
  'attesting',
  'proving_and_submitting',
  'indexing',
  'complete',
  'failed',
  'expired',
  'cancelled',
])
const ACCEPTED_PROVE_STATUSES = new Set(['attesting', 'proving_and_submitting', 'indexing'])

const SAFE_HTTP_ERRORS = Object.freeze({
  PROOF_SESSION_BUSY: '다른 증명 세션이 진행 중입니다. 완료하거나 취소한 뒤 다시 시도해 주세요.',
  PROOF_SESSION_NOT_FOUND: '증명 세션을 찾지 못했습니다.',
  PROOF_SESSION_EXPIRED: '지갑 서명 대기 시간이 지나 증명 세션이 만료되었습니다.',
  PROOF_SESSION_ALREADY_USED: '이 증명 세션에는 이미 서명이 제출되었습니다.',
  PROOF_SESSION_NOT_CANCELLABLE: '이미 증명 중이라 세션을 안전하게 취소할 수 없습니다.',
  POLICY_REQUEST_EXPIRED: 'Funder의 검증 요청이 만료되었습니다.',
  INVALID_POLICY_REQUEST: 'Funder의 검증 요청 문맥이 올바르지 않습니다.',
  ROLE_WALLET_MISMATCH: 'MetaMask 계정이 이 요청의 Seller/Buyer 역할 지갑과 다릅니다.',
  GIWA_RECEIVABLE_NOT_FOUND: '온체인에서 요청의 채권을 찾을 수 없습니다.',
  GIWA_RPC_UNAVAILABLE: '채권 네트워크 RPC에서 요청의 채권 문맥을 확인하지 못했습니다.',
  PROOF_RESULT_AVAILABLE:
    '이 요청의 완료 증명이 서버에 보관되어 있습니다. 새로 증명하지 않고 기존 결과를 복구합니다.',
  PROOF_RESULT_IN_PROGRESS:
    '이 요청은 이미 증명 중이거나 제출 결과가 불확실합니다. 중복 증명하지 말고 기존 상태를 확인해 주세요.',
  PROOF_RESULT_ALREADY_DELIVERED: '이 요청의 완료 증명은 서버 전달 확인 후 이미 정리되었습니다.',
  PROOF_RESULT_NOT_FOUND: '복구할 완료 증명이 증명 서버에 없습니다.',
  PROOF_RESULT_BINDING_MISMATCH: '완료 증명의 요청·세션 문맥이 일치하지 않습니다.',
  CAPABILITY_OUTBOX_INVALID:
    '암호화된 증명 결과 보관함을 열 수 없습니다. 저장 암호와 파일 상태를 확인해 주세요.',
  CAPABILITY_OUTBOX_UNAVAILABLE: '암호화된 증명 결과 보관함을 사용할 수 없습니다.',
})

export class MidnightProofBridgeV2Error extends Error {
  constructor(code, message, { requestMayHaveSucceeded = false } = {}) {
    super(message)
    this.name = 'MidnightProofBridgeV2Error'
    this.code = code
    this.requestMayHaveSucceeded = requestMayHaveSucceeded
  }
}

function invalidInput(message) {
  return new MidnightProofBridgeV2Error('INVALID_PROOF_INPUT', message)
}

function invalidResponse(message = '증명 서버 v2 응답 형식이 올바르지 않습니다.') {
  return new MidnightProofBridgeV2Error('INVALID_PROOF_BRIDGE_RESPONSE', message)
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

function requireDecimal(value, fieldName, maximum, { positive = false, response = false } = {}) {
  if (typeof value !== 'string' || !/^(0|[1-9][0-9]*)$/.test(value)) {
    throw (response ? invalidResponse : invalidInput)(`${fieldName} 형식이 올바르지 않습니다.`)
  }
  const parsed = BigInt(value)
  if ((positive && parsed === 0n) || parsed > maximum) {
    throw (response ? invalidResponse : invalidInput)(`${fieldName} 범위가 올바르지 않습니다.`)
  }
  return value
}

function requireBytes32(value, fieldName, { response = false, nonZero = true } = {}) {
  if (
    typeof value !== 'string' ||
    !/^0x[0-9a-f]{64}$/.test(value) ||
    (nonZero && value === ZERO_BYTES32)
  ) {
    throw (response ? invalidResponse : invalidInput)(`${fieldName} 형식이 올바르지 않습니다.`)
  }
  return value
}

function requireBareBytes32(value, fieldName, { response = false, nonZero = true } = {}) {
  if (
    typeof value !== 'string' ||
    !/^[0-9a-f]{64}$/.test(value) ||
    (nonZero && value === ZERO_BARE_BYTES32)
  ) {
    throw (response ? invalidResponse : invalidInput)(`${fieldName} 형식이 올바르지 않습니다.`)
  }
  return value
}

function requireAddress(value, fieldName, { response = false } = {}) {
  if (typeof value !== 'string' || !/^0x[0-9a-f]{40}$/.test(value) || value === ZERO_ADDRESS) {
    throw (response ? invalidResponse : invalidInput)(`${fieldName} 형식이 올바르지 않습니다.`)
  }
  return value
}

function requireSessionId(value) {
  if (typeof value !== 'string' || !SESSION_ID_PATTERN.test(value) || value === ZERO_BYTES32) {
    throw invalidResponse('Proof Bridge session ID 형식이 올바르지 않습니다.')
  }
  return value
}

export function normalizePolicyProofInputV2(value) {
  if (!hasExactKeys(value, CHALLENGE_KEYS) || value.version !== 2) {
    throw invalidInput('제품 증명 입력은 승인된 v2 필드만 포함해야 합니다.')
  }
  if (value.subjectRole !== 'SELLER' && value.subjectRole !== 'BUYER') {
    throw invalidInput('역할은 SELLER 또는 BUYER여야 합니다.')
  }
  if (!hasExactKeys(value.policyRequest, POLICY_KEYS)) {
    throw invalidInput('Funder 정책 요청 필드를 확인해 주세요.')
  }
  const policyRequest = Object.freeze({
    requestId: requireBytes32(value.policyRequest.requestId, 'requestId'),
    intendedFunderWallet: requireAddress(
      value.policyRequest.intendedFunderWallet,
      'intendedFunderWallet',
    ),
    minAnnualRevenueKrw: requireDecimal(
      value.policyRequest.minAnnualRevenueKrw,
      '최소 연매출',
      UINT64_MAX,
    ),
    maxDebtRatioBps: requireDecimal(
      value.policyRequest.maxDebtRatioBps,
      '최대 부채비율',
      UINT32_MAX,
    ),
    maxOverdueCount: requireDecimal(
      value.policyRequest.maxOverdueCount,
      '최대 연체 건수',
      UINT16_MAX,
    ),
    validUntil: requireDecimal(value.policyRequest.validUntil, '정책 만료 시각', UINT64_MAX, {
      positive: true,
    }),
  })
  if (BigInt(policyRequest.validUntil) <= BigInt(Math.floor(Date.now() / 1_000))) {
    throw new MidnightProofBridgeV2Error(
      'POLICY_REQUEST_EXPIRED',
      'Funder의 검증 요청이 만료되었습니다.',
    )
  }
  return Object.freeze({
    version: 2,
    onchainReceivableId: requireDecimal(value.onchainReceivableId, '온체인 채권 ID', UINT256_MAX, {
      positive: true,
    }),
    subjectRole: value.subjectRole,
    annualRevenueKrw: requireDecimal(value.annualRevenueKrw, '연매출', UINT64_MAX),
    debtRatioBps: requireDecimal(value.debtRatioBps, '부채비율', UINT32_MAX),
    overdueCount: requireDecimal(value.overdueCount, '연체 건수', UINT16_MAX),
    policyRequest,
  })
}

function normalizeAuthorization(value) {
  if (!hasExactKeys(value, AUTHORIZATION_KEYS) || value.version !== 2) {
    throw invalidInput('EIP-712 v2 authorization 응답 형식이 올바르지 않습니다.')
  }
  if (typeof value.signature !== 'string' || !/^0x[0-9a-fA-F]{130}$/.test(value.signature)) {
    throw invalidInput('EIP-712 signature 형식이 올바르지 않습니다.')
  }
  return Object.freeze({
    version: 2,
    authorizationId: requireBytes32(value.authorizationId, 'authorizationId'),
    typedDataHash: requireBytes32(value.typedDataHash, 'typedDataHash'),
    signer: requireAddress(value.signer, 'signer'),
    signature: value.signature,
  })
}

export function parseProofCapabilityV2(value) {
  if (
    !hasExactKeys(value, CAPABILITY_KEYS) ||
    value.version !== 2 ||
    value.evaluationVersion !== 2
  ) {
    throw invalidResponse('완료된 검증 결과 전달 형식이 올바르지 않습니다.')
  }
  if (value.subjectRole !== 'SELLER' && value.subjectRole !== 'BUYER') {
    throw invalidResponse('Proof capability 역할이 올바르지 않습니다.')
  }
  const capability = Object.freeze({
    version: 2,
    evaluationVersion: 2,
    midnightContractAddress: requireBareBytes32(value.midnightContractAddress, '계약 주소', {
      response: true,
    }),
    companyCommitment: requireBytes32(value.companyCommitment, '회사 commitment', {
      response: true,
    }),
    lookupKey: requireBytes32(value.lookupKey, '조회 키', { response: true }),
    policyRequestHash: requireBytes32(value.policyRequestHash, '정책 요청 해시', {
      response: true,
    }),
    giwaChainId: requireDecimal(value.giwaChainId, 'transaction chain ID', UINT64_MAX, {
      positive: true,
      response: true,
    }),
    receivableFinanceAddress: requireAddress(value.receivableFinanceAddress, '계약 주소', {
      response: true,
    }),
    onchainReceivableId: requireDecimal(value.onchainReceivableId, '온체인 채권 ID', UINT256_MAX, {
      positive: true,
      response: true,
    }),
    subjectRole: value.subjectRole,
    partyWallet: requireAddress(value.partyWallet, '역할 지갑', { response: true }),
    requestId: requireBytes32(value.requestId, 'requestId', { response: true }),
    intendedFunderWallet: requireAddress(value.intendedFunderWallet, 'Funder 지갑', {
      response: true,
    }),
    minAnnualRevenueKrw: requireDecimal(value.minAnnualRevenueKrw, '최소 연매출', UINT64_MAX, {
      response: true,
    }),
    maxDebtRatioBps: requireDecimal(value.maxDebtRatioBps, '최대 부채비율', UINT32_MAX, {
      response: true,
    }),
    maxOverdueCount: requireDecimal(value.maxOverdueCount, '최대 연체 건수', UINT16_MAX, {
      response: true,
    }),
    profileAsOf: requireDecimal(value.profileAsOf, 'Mock attestation 발급 시각', UINT64_MAX, {
      response: true,
    }),
    validUntil: requireDecimal(value.validUntil, '결과 만료 시각', UINT64_MAX, {
      positive: true,
      response: true,
    }),
  })
  if (
    capability.midnightContractAddress !== approvedMidnightContractAddress() ||
    capability.giwaChainId !== APPROVED_GIWA_CHAIN_ID ||
    capability.receivableFinanceAddress !== APPROVED_RECEIVABLE_FINANCE_ADDRESS
  ) {
    throw invalidResponse('Proof capability가 승인된 v2 계약 문맥과 다릅니다.')
  }
  return capability
}

function safeError(payload, status) {
  if (hasExactKeys(payload, ['error']) && hasExactKeys(payload.error, SAFE_ERROR_KEYS)) {
    const code = payload.error.code
    if (typeof code === 'string' && Object.hasOwn(SAFE_HTTP_ERRORS, code)) {
      return new MidnightProofBridgeV2Error(code, SAFE_HTTP_ERRORS[code])
    }
  }
  const messages = {
    400: '증명 요청 형식을 확인해 주세요.',
    401: '다시 로그인해 주세요.',
    403: '이 요청에 응답할 수 있는 회사 계정으로 로그인해 주세요.',
    404: 'Proof Bridge 세션을 찾지 못했습니다.',
    409: '현재 세션 상태에서는 이 작업을 수행할 수 없습니다.',
    410: 'Proof Bridge 세션 또는 정책 요청이 만료되었습니다.',
    413: 'Proof Bridge 요청이 허용된 크기를 초과했습니다.',
    429: '다른 증명 세션이 진행 중입니다.',
    502: '증명 서버가 Midnight 요청을 완료하지 못했습니다.',
    503: 'Midnight 증명 구성요소를 사용할 수 없습니다.',
  }
  return new MidnightProofBridgeV2Error(
    'MIDNIGHT_PROOF_BRIDGE_ERROR',
    messages[status] ?? `Proof Bridge가 요청을 처리하지 못했습니다. (${status})`,
  )
}

async function readResponseText(response) {
  const declared = response.headers.get('content-length')
  if (declared && /^\d+$/.test(declared) && BigInt(declared) > BigInt(MAX_RESPONSE_BYTES)) {
    await response.body?.cancel().catch(() => undefined)
    throw invalidResponse('Proof Bridge 응답이 허용된 크기를 초과했습니다.')
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

async function bridgeRequest(
  path,
  body,
  { signal, expectedStatus, mayHaveSucceeded = false } = {},
) {
  const session = captureAuthSession()
  if (isMidnightDemoEnabled) await loadMidnightDemoConfig({ signal })
  assertAuthSessionCurrent(session)
  const controller = new AbortController()
  let timedOut = false
  const forwardAbort = () => controller.abort()
  if (signal?.aborted) controller.abort()
  else signal?.addEventListener('abort', forwardAbort, { once: true })
  const timeout = setTimeout(() => {
    timedOut = true
    controller.abort()
  }, REQUEST_TIMEOUT_MS)

  try {
    const response = await fetch(`${midnightProofConfig.apiUrl}${path}`, {
      method: 'POST',
      signal: controller.signal,
      cache: 'no-store',
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        [BRIDGE_HEADER_NAME]: BRIDGE_HEADER_VALUE,
        ...demoAuthorizationHeaders(),
      },
      body: JSON.stringify(body),
    })
    const contentType = response.headers.get('content-type') ?? ''
    if (!/^application\/json(?:\s*;|$)/i.test(contentType)) {
      await response.body?.cancel().catch(() => undefined)
      throw new MidnightProofBridgeV2Error(
        response.status === 502
          ? 'MIDNIGHT_PROOF_BRIDGE_UNAVAILABLE'
          : 'INVALID_PROOF_BRIDGE_RESPONSE',
        response.status === 502
          ? '증명 서버에 연결할 수 없습니다.'
          : 'Proof Bridge가 JSON 응답을 반환하지 않았습니다.',
        { requestMayHaveSucceeded: mayHaveSucceeded },
      )
    }
    const text = await readResponseText(response)
    assertAuthSessionCurrent(session)
    let payload = null
    try {
      payload = text ? JSON.parse(text) : null
    } catch {
      throw invalidResponse('Proof Bridge가 올바른 JSON을 반환하지 않았습니다.')
    }
    if (!response.ok || response.status !== expectedStatus) {
      const error = safeError(payload, response.status)
      error.requestMayHaveSucceeded = mayHaveSucceeded
      throw error
    }
    if (!isRecord(payload)) throw invalidResponse()
    return payload
  } catch (error) {
    if (signal?.aborted) throw error
    if (error instanceof MidnightProofBridgeV2Error) {
      if (mayHaveSucceeded) error.requestMayHaveSucceeded = true
      throw error
    }
    throw new MidnightProofBridgeV2Error(
      timedOut ? 'MIDNIGHT_PROOF_BRIDGE_TIMEOUT' : 'MIDNIGHT_PROOF_BRIDGE_UNAVAILABLE',
      timedOut ? 'Proof Bridge 응답 시간이 초과되었습니다.' : '증명 서버에 연결할 수 없습니다.',
      { requestMayHaveSucceeded: mayHaveSucceeded },
    )
  } finally {
    clearTimeout(timeout)
    signal?.removeEventListener('abort', forwardAbort)
  }
}

function parseChallenge(payload, request) {
  if (!hasExactKeys(payload, CHALLENGE_RESPONSE_KEYS) || payload.version !== 2) {
    throw invalidResponse('Proof Bridge challenge v2 응답 필드를 확인해 주세요.')
  }
  const authorizationRequest = parseAuthorizationRequestV2(payload.authorizationRequest)
  const message = authorizationRequest.message
  const expected = request.policyRequest
  if (
    message.onchainReceivableId !== request.onchainReceivableId ||
    (request.partyWallet !== undefined && message.partyWallet !== request.partyWallet) ||
    message.subjectRole !== request.subjectRole ||
    message.requestId !== expected.requestId ||
    message.intendedFunderWallet !== expected.intendedFunderWallet ||
    message.minAnnualRevenueKrw !== expected.minAnnualRevenueKrw ||
    message.maxDebtRatioBps !== expected.maxDebtRatioBps ||
    message.maxOverdueCount !== expected.maxOverdueCount ||
    message.policyValidUntil !== expected.validUntil ||
    message.expiresAt !== payload.expiresAt
  ) {
    throw invalidResponse('Challenge 응답이 선택한 요청과 일치하지 않습니다.')
  }
  return Object.freeze({
    version: 2,
    sessionId: requireSessionId(payload.sessionId),
    expiresAt: requireDecimal(payload.expiresAt, '서명 만료 시각', UINT64_MAX, {
      positive: true,
      response: true,
    }),
    authorizationRequest,
  })
}

export function parseProofSessionStatusV2(payload, expectedSessionId) {
  if (!isRecord(payload) || payload.version !== 2 || !STATUSES.has(payload.status)) {
    throw invalidResponse('Proof Bridge status v2 응답을 확인해 주세요.')
  }
  const expectedKeys =
    payload.status === 'complete'
      ? COMPLETE_STATUS_KEYS
      : payload.status === 'failed'
        ? FAILED_STATUS_KEYS
        : BASE_STATUS_KEYS
  if (!hasExactKeys(payload, expectedKeys)) throw invalidResponse()
  const sessionId = requireSessionId(payload.sessionId)
  if (sessionId !== expectedSessionId) throw invalidResponse('다른 세션의 상태가 반환되었습니다.')

  if (payload.status === 'complete') {
    return Object.freeze({
      version: 2,
      sessionId,
      status: 'complete',
      proofCapability: parseProofCapabilityV2(payload.proofCapability),
    })
  }
  if (payload.status === 'failed') {
    if (!hasExactKeys(payload.error, SAFE_ERROR_KEYS)) throw invalidResponse()
    const code = payload.error.code
    return Object.freeze({
      version: 2,
      sessionId,
      status: 'failed',
      error: Object.freeze({
        code: typeof code === 'string' && SAFE_HTTP_ERRORS[code] ? code : 'PROOF_FAILED',
        message:
          typeof code === 'string' && SAFE_HTTP_ERRORS[code]
            ? SAFE_HTTP_ERRORS[code]
            : 'ZK 증명을 완료하지 못했습니다.',
      }),
    })
  }
  return Object.freeze({ version: 2, sessionId, status: payload.status })
}

export async function requestPolicyProofChallengeV2(input, options = {}) {
  let request
  let body
  if (isMidnightDemoEnabled) {
    if (
      !hasExactKeys(input, ['version', 'requestId', 'profileId']) ||
      input.version !== 2 ||
      !/^[a-z0-9-]{1,64}$/.test(input.profileId) ||
      options.request?.requestId !== input.requestId
    ) {
      throw invalidInput('가상 기업 시나리오와 검증 요청을 선택해 주세요.')
    }
    body = {
      version: 2,
      requestId: requireBytes32(input.requestId, 'requestId'),
      profileId: input.profileId,
    }
    request = { ...options.request, policyRequest: options.request }
  } else {
    request = normalizePolicyProofInputV2(input)
    body = request
  }
  const payload = await bridgeRequest('/v2/proof-sessions/challenge', body, {
    ...options,
    expectedStatus: 201,
  })
  return parseChallenge(payload, request)
}

export async function submitPolicyProofAuthorizationV2(sessionId, authorization, options = {}) {
  const request = Object.freeze({
    version: 2,
    sessionId: requireSessionId(sessionId),
    authorization: normalizeAuthorization(authorization),
    ...(isMidnightDemoEnabled ? { requestId: requireBytes32(options.requestId, 'requestId') } : {}),
  })
  const payload = await bridgeRequest('/v2/proof-sessions/prove', request, {
    ...options,
    expectedStatus: 202,
    mayHaveSucceeded: true,
  })
  if (
    !hasExactKeys(payload, BASE_STATUS_KEYS) ||
    payload.version !== 2 ||
    !ACCEPTED_PROVE_STATUSES.has(payload.status) ||
    payload.sessionId !== request.sessionId
  ) {
    throw new MidnightProofBridgeV2Error(
      'INVALID_PROOF_BRIDGE_RESPONSE',
      'Proof Bridge prove 접수 응답을 확인해 주세요.',
      { requestMayHaveSucceeded: true },
    )
  }
  return Object.freeze(payload)
}

export async function readPolicyProofSessionStatusV2(sessionId, options = {}) {
  const normalizedSessionId = requireSessionId(sessionId)
  const payload = await bridgeRequest(
    '/v2/proof-sessions/status',
    {
      version: 2,
      sessionId: normalizedSessionId,
      ...(isMidnightDemoEnabled
        ? { requestId: requireBytes32(options.requestId, 'requestId') }
        : {}),
    },
    { ...options, expectedStatus: 200 },
  )
  return parseProofSessionStatusV2(payload, normalizedSessionId)
}

export async function cancelPolicyProofSessionV2(sessionId, options = {}) {
  const normalizedSessionId = requireSessionId(sessionId)
  const payload = await bridgeRequest(
    '/v2/proof-sessions/cancel',
    {
      version: 2,
      sessionId: normalizedSessionId,
      ...(isMidnightDemoEnabled
        ? { requestId: requireBytes32(options.requestId, 'requestId') }
        : {}),
    },
    { ...options, expectedStatus: 200 },
  )
  return parseProofSessionStatusV2(payload, normalizedSessionId)
}

export async function recoverPolicyProofResultV2(requestId, options = {}) {
  const normalizedRequestId = requireBytes32(requestId, 'requestId')
  const payload = await bridgeRequest(
    '/v2/proof-sessions/recover',
    { version: 2, requestId: normalizedRequestId },
    { ...options, expectedStatus: 200 },
  )
  if (
    !hasExactKeys(payload, COMPLETE_STATUS_KEYS) ||
    payload.version !== 2 ||
    payload.status !== 'complete'
  ) {
    throw invalidResponse('복구된 Proof Bridge 결과 형식이 올바르지 않습니다.')
  }
  const recovered = Object.freeze({
    version: 2,
    sessionId: requireSessionId(payload.sessionId),
    status: 'complete',
    proofCapability: parseProofCapabilityV2(payload.proofCapability),
  })
  if (recovered.proofCapability.requestId !== normalizedRequestId) {
    throw invalidResponse('복구된 완료 증명이 선택한 요청과 일치하지 않습니다.')
  }
  return recovered
}

export async function acknowledgePolicyProofResultV2(sessionId, requestId, options = {}) {
  const normalizedSessionId = requireSessionId(sessionId)
  const normalizedRequestId = requireBytes32(requestId, 'requestId')
  const payload = await bridgeRequest(
    '/v2/proof-sessions/ack',
    { version: 2, sessionId: normalizedSessionId, requestId: normalizedRequestId },
    { ...options, expectedStatus: 200, mayHaveSucceeded: true },
  )
  if (
    !hasExactKeys(payload, ACKNOWLEDGED_KEYS) ||
    payload.version !== 2 ||
    payload.status !== 'acknowledged' ||
    requireSessionId(payload.sessionId) !== normalizedSessionId
  ) {
    throw invalidResponse('Proof Bridge 결과 정리 응답 형식이 올바르지 않습니다.')
  }
  return Object.freeze({ version: 2, sessionId: normalizedSessionId, status: 'acknowledged' })
}
