import { apiRequest } from '../api'
import { isMidnightDemoEnabled } from './config'

function midnightRequest(path, options = {}) {
  return apiRequest(path, {
    ...options,
    timeoutMs: 10000,
    maxResponseBytes: 65536,
    cache: 'no-store',
    credentials: 'omit',
    referrerPolicy: 'no-referrer',
  })
}
import { parseProofCapabilityV2 } from './proofBridgeV2'

const UINT16_MAX = (1n << 16n) - 1n
const UINT32_MAX = (1n << 32n) - 1n
const UINT64_MAX = (1n << 64n) - 1n
const UINT256_MAX = (1n << 256n) - 1n
const MAX_VALID_FOR_SECONDS = 86_400
const ZERO_BYTES32 = `0x${'0'.repeat(64)}`
const ZERO_ADDRESS = `0x${'0'.repeat(40)}`
const REQUEST_STATUSES = new Set([
  'REQUESTED',
  'SUBMITTED',
  'DENIED',
  'EXPIRED',
  'COMPLETED',
  'FAILED',
])
const SUMMARY_KEYS = Object.freeze([
  'createdAt',
  'intendedFunderWallet',
  'maxDebtRatioBps',
  'maxOverdueCount',
  'minAnnualRevenueKrw',
  'onchainReceivableId',
  'partyWallet',
  'receivableId',
  'requesterCompanyName',
  'requestId',
  'status',
  'subjectCompanyName',
  'subjectRole',
  'updatedAt',
  'validUntil',
])
const RESOLUTION_KEYS = Object.freeze([
  'intendedFunderWallet',
  'maxDebtRatioBps',
  'maxOverdueCount',
  'minAnnualRevenueKrw',
  'onchainReceivableId',
  'partyWallet',
  'receivableId',
  'requestId',
  'result',
  'status',
  'subjectRole',
  'validUntil',
])
const RESULT_KEYS = Object.freeze([
  'eligible',
  'evaluationVersion',
  'profileAsOf',
  'providerId',
  'validUntil',
])
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

export class MidnightProofRequestContractError extends Error {
  constructor(message) {
    super(message)
    this.name = 'MidnightProofRequestContractError'
    this.code = 'INVALID_MIDNIGHT_PROOF_REQUEST_RESPONSE'
  }
}

function invalidResponse(message = '재무 검증 요청 API 응답 형식이 올바르지 않습니다.') {
  return new MidnightProofRequestContractError(message)
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function requireExactKeys(value, expectedKeys, message) {
  if (!isRecord(value)) throw invalidResponse(message)
  const keys = Object.keys(value)
  const expected = new Set(expectedKeys)
  if (keys.length !== expected.size || keys.some((key) => !expected.has(key))) {
    throw invalidResponse(message)
  }
}

function requireCanonicalDecimal(value, label, maximum, { positive = false } = {}) {
  if (typeof value !== 'string' || !/^(0|[1-9][0-9]*)$/.test(value)) {
    throw invalidResponse(`${label} 형식이 올바르지 않습니다.`)
  }
  const parsed = BigInt(value)
  if ((positive && parsed === 0n) || parsed > maximum) {
    throw invalidResponse(`${label} 범위가 올바르지 않습니다.`)
  }
  return value
}

function requireRequestId(value) {
  if (typeof value !== 'string' || !/^0x[0-9a-f]{64}$/.test(value) || value === ZERO_BYTES32) {
    throw invalidResponse('검증 요청 ID 형식이 올바르지 않습니다.')
  }
  return value
}

function requireAddress(value, label) {
  if (typeof value !== 'string' || !/^0x[0-9a-f]{40}$/.test(value) || value === ZERO_ADDRESS) {
    throw invalidResponse(`${label} 형식이 올바르지 않습니다.`)
  }
  return value
}

function requirePositiveInteger(value, label) {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw invalidResponse(`${label} 형식이 올바르지 않습니다.`)
  }
  return value
}

function requireName(value, label) {
  const hasControlCharacter =
    typeof value === 'string' &&
    Array.from(value).some((character) => {
      const codePoint = character.codePointAt(0)
      return codePoint <= 31 || codePoint === 127
    })
  if (typeof value !== 'string' || !value.trim() || value.length > 200 || hasControlCharacter) {
    throw invalidResponse(`${label} 형식이 올바르지 않습니다.`)
  }
  return value
}

function requireTimestamp(value, label) {
  if (typeof value !== 'string' || value.length > 64 || Number.isNaN(Date.parse(value))) {
    throw invalidResponse(`${label} 형식이 올바르지 않습니다.`)
  }
  return value
}

function requireRole(value) {
  if (value !== 'SELLER' && value !== 'BUYER') {
    throw invalidResponse('검증 대상 역할이 올바르지 않습니다.')
  }
  return value
}

function requireStatus(value) {
  if (!REQUEST_STATUSES.has(value)) throw invalidResponse('검증 요청 상태가 올바르지 않습니다.')
  return value
}

export function parseMidnightProofRequestSummary(value) {
  requireExactKeys(value, SUMMARY_KEYS, '검증 요청 요약 필드를 확인해 주세요.')
  return Object.freeze({
    requestId: requireRequestId(value.requestId),
    receivableId: requirePositiveInteger(value.receivableId, 'DB 채권 ID'),
    onchainReceivableId: requireCanonicalDecimal(
      value.onchainReceivableId,
      '온체인 채권 ID',
      UINT256_MAX,
      { positive: true },
    ),
    subjectRole: requireRole(value.subjectRole),
    requesterCompanyName: requireName(value.requesterCompanyName, '요청 회사명'),
    subjectCompanyName: requireName(value.subjectCompanyName, '검증 대상 회사명'),
    partyWallet: requireAddress(value.partyWallet, '역할 지갑'),
    intendedFunderWallet: requireAddress(value.intendedFunderWallet, 'Funder 지갑'),
    minAnnualRevenueKrw: requireCanonicalDecimal(
      value.minAnnualRevenueKrw,
      '최소 연매출',
      UINT64_MAX,
    ),
    maxDebtRatioBps: requireCanonicalDecimal(value.maxDebtRatioBps, '최대 부채비율', UINT32_MAX),
    maxOverdueCount: requireCanonicalDecimal(value.maxOverdueCount, '최대 연체 건수', UINT16_MAX),
    validUntil: requireCanonicalDecimal(value.validUntil, '요청 만료 시각', UINT64_MAX, {
      positive: true,
    }),
    status: requireStatus(value.status),
    createdAt: requireTimestamp(value.createdAt, '생성 시각'),
    updatedAt: requireTimestamp(value.updatedAt, '갱신 시각'),
  })
}

export function parseMidnightProofResolution(value) {
  requireExactKeys(value, RESOLUTION_KEYS, '공개 검증 결과 필드를 확인해 주세요.')
  if (value.status !== 'COMPLETED') {
    throw invalidResponse('완료되지 않은 요청은 결과로 해석할 수 없습니다.')
  }
  requireExactKeys(value.result, RESULT_KEYS, '공개 검증 결과 세부 필드를 확인해 주세요.')
  if (typeof value.result.eligible !== 'boolean' || value.result.evaluationVersion !== 2) {
    throw invalidResponse('공개 검증 판정 또는 평가 버전이 올바르지 않습니다.')
  }
  const resolution = Object.freeze({
    requestId: requireRequestId(value.requestId),
    receivableId: requirePositiveInteger(value.receivableId, 'DB 채권 ID'),
    onchainReceivableId: requireCanonicalDecimal(
      value.onchainReceivableId,
      '온체인 채권 ID',
      UINT256_MAX,
      { positive: true },
    ),
    subjectRole: requireRole(value.subjectRole),
    partyWallet: requireAddress(value.partyWallet, '역할 지갑'),
    intendedFunderWallet: requireAddress(value.intendedFunderWallet, 'Funder 지갑'),
    minAnnualRevenueKrw: requireCanonicalDecimal(
      value.minAnnualRevenueKrw,
      '최소 연매출',
      UINT64_MAX,
    ),
    maxDebtRatioBps: requireCanonicalDecimal(value.maxDebtRatioBps, '최대 부채비율', UINT32_MAX),
    maxOverdueCount: requireCanonicalDecimal(value.maxOverdueCount, '최대 연체 건수', UINT16_MAX),
    validUntil: requireCanonicalDecimal(value.validUntil, '요청 만료 시각', UINT64_MAX, {
      positive: true,
    }),
    status: 'COMPLETED',
    result: Object.freeze({
      eligible: value.result.eligible,
      providerId: requireCanonicalDecimal(value.result.providerId, 'Provider ID', UINT16_MAX, {
        positive: true,
      }),
      evaluationVersion: 2,
      profileAsOf: requireCanonicalDecimal(
        value.result.profileAsOf,
        'Mock attestation 발급 시각',
        UINT64_MAX,
      ),
      validUntil: requireCanonicalDecimal(value.result.validUntil, '결과 만료 시각', UINT64_MAX, {
        positive: true,
      }),
    }),
  })
  if (resolution.result.validUntil !== resolution.validUntil) {
    throw invalidResponse('요청과 결과의 유효기간이 일치하지 않습니다.')
  }
  if (isMidnightDemoEnabled && resolution.result.providerId !== '2') {
    throw invalidResponse('이 데모는 역할 지갑 동의를 확인한 Provider 2 결과만 허용합니다.')
  }
  return resolution
}

function normalizeCreatePolicy(value) {
  if (!isRecord(value)) throw new TypeError('검증 기준이 필요합니다.')
  const allowed = new Set([
    'subjectRole',
    'minAnnualRevenueKrw',
    'maxDebtRatioBps',
    'maxOverdueCount',
    'validForSeconds',
  ])
  const keys = Object.keys(value)
  if (keys.length !== allowed.size || keys.some((key) => !allowed.has(key))) {
    throw new TypeError('검증 기준 필드를 확인해 주세요.')
  }
  if (value.subjectRole !== 'SELLER' && value.subjectRole !== 'BUYER') {
    throw new TypeError('검증 대상은 SELLER 또는 BUYER여야 합니다.')
  }
  const canonicalInputDecimal = (input, label, maximum) => {
    if (typeof input !== 'string' || !/^(0|[1-9][0-9]*)$/.test(input)) {
      throw new TypeError(`${label}은 부호 없는 정수여야 합니다.`)
    }
    if (BigInt(input) > maximum) throw new TypeError(`${label} 범위를 확인해 주세요.`)
    return input
  }
  if (
    !Number.isSafeInteger(value.validForSeconds) ||
    value.validForSeconds <= 0 ||
    value.validForSeconds > MAX_VALID_FOR_SECONDS
  ) {
    throw new TypeError('요청 유효시간을 확인해 주세요.')
  }
  return Object.freeze({
    subjectRole: value.subjectRole,
    minAnnualRevenueKrw: canonicalInputDecimal(
      value.minAnnualRevenueKrw,
      '최소 연매출',
      UINT64_MAX,
    ),
    maxDebtRatioBps: canonicalInputDecimal(value.maxDebtRatioBps, '최대 부채비율', UINT32_MAX),
    maxOverdueCount: canonicalInputDecimal(value.maxOverdueCount, '최대 연체 건수', UINT16_MAX),
    validForSeconds: value.validForSeconds,
  })
}

function normalizeReceivableId(value) {
  const text = String(value ?? '')
  if (!/^[1-9][0-9]*$/.test(text) || BigInt(text) > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new TypeError('DB 채권 ID를 확인해 주세요.')
  }
  return text
}

function normalizeRequestId(value) {
  if (typeof value !== 'string' || !/^0x[0-9a-f]{64}$/.test(value) || value === ZERO_BYTES32) {
    throw new TypeError('검증 요청 ID를 확인해 주세요.')
  }
  return value
}

export async function createMidnightProofRequest(receivableId, policy, options = {}) {
  const payload = await midnightRequest(
    `/receivables/${normalizeReceivableId(receivableId)}/midnight-proof-requests`,
    { ...options, auth: true, method: 'POST', body: normalizeCreatePolicy(policy) },
  )
  return parseMidnightProofRequestSummary(payload)
}

export async function listMidnightProofRequests(scope, options = {}) {
  if (scope !== 'requested' && scope !== 'assigned')
    throw new TypeError('요청함 범위가 잘못되었습니다.')
  const payload = await midnightRequest(`/midnight-proof-requests?scope=${scope}`, {
    ...options,
    auth: true,
    method: 'GET',
  })
  if (!Array.isArray(payload)) throw invalidResponse('검증 요청 목록은 배열이어야 합니다.')
  return Object.freeze(payload.map(parseMidnightProofRequestSummary))
}

export async function getMidnightProofRequest(requestId, options = {}) {
  const payload = await midnightRequest(
    `/midnight-proof-requests/${normalizeRequestId(requestId)}`,
    {
      ...options,
      auth: true,
      method: 'GET',
    },
  )
  return parseMidnightProofRequestSummary(payload)
}

export async function denyMidnightProofRequest(requestId, options = {}) {
  const payload = await midnightRequest(
    `/midnight-proof-requests/${normalizeRequestId(requestId)}/deny`,
    { ...options, auth: true, method: 'POST' },
  )
  return parseMidnightProofRequestSummary(payload)
}

export function parseProofCapabilityForCompletion(value) {
  requireExactKeys(value, CAPABILITY_KEYS, '완료된 검증 결과 전달 형식이 올바르지 않습니다.')
  try {
    return parseProofCapabilityV2(value)
  } catch {
    throw invalidResponse('완료된 검증 결과를 안전하게 전달할 수 없습니다.')
  }
}

export async function completeMidnightProofRequest(requestId, proofCapability, options = {}) {
  const payload = await midnightRequest(
    `/midnight-proof-requests/${normalizeRequestId(requestId)}/complete`,
    {
      ...options,
      auth: true,
      method: 'POST',
      body: { proofCapability: parseProofCapabilityForCompletion(proofCapability) },
    },
  )
  return parseMidnightProofRequestSummary(payload)
}

export async function resolveMidnightProofRequest(requestId, options = {}) {
  const payload = await midnightRequest(
    `/midnight-proof-requests/${normalizeRequestId(requestId)}/resolve`,
    { ...options, auth: true, method: 'POST' },
  )
  const resolution = parseMidnightProofResolution(payload)
  if (resolution.requestId !== requestId)
    throw invalidResponse('다른 요청의 결과가 반환되었습니다.')
  return resolution
}

export function assertResolutionMatchesRequest(resolution, request) {
  if (
    !request ||
    [
      'requestId',
      'receivableId',
      'onchainReceivableId',
      'subjectRole',
      'partyWallet',
      'intendedFunderWallet',
      'minAnnualRevenueKrw',
      'maxDebtRatioBps',
      'maxOverdueCount',
      'validUntil',
    ].some((key) => resolution[key] !== request[key])
  ) {
    throw invalidResponse('조회 결과가 선택한 요청의 대상·기준·유효기간과 일치하지 않습니다.')
  }
}
