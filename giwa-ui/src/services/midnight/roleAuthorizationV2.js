import { approvedMidnightContractAddress } from './demoRuntime'
import { TypedDataEncoder, getAddress, verifyTypedData } from 'ethers'
import { giwaContractConfig } from '../../contracts/addresses'
import { normalizeWeb3Error } from '../web3/errors'
import { getGiwaSigner, requiredChainId } from '../web3/provider'

const UINT16_MAX = (1n << 16n) - 1n
const UINT32_MAX = (1n << 32n) - 1n
const UINT64_MAX = (1n << 64n) - 1n
const UINT256_MAX = (1n << 256n) - 1n
const AUTHORIZATION_TTL_SECONDS = 120n

const APPROVED_GIWA_CHAIN_ID = '91342'
const APPROVED_RECEIVABLE_FINANCE_ADDRESS = '0x0f264334f98ba0d22f7fc6bb901a5fa36158a315'
const AUTHORIZATION_PRIMARY_TYPE = 'GASOKRoleAttestationAuthorization'
const AUTHORIZATION_PURPOSE =
  'Authorize GASOK local mock financial attestation for a Funder policy request'

const REQUEST_KEYS = Object.freeze(['domain', 'message', 'primaryType', 'types', 'version'])
const DOMAIN_KEYS = Object.freeze(['chainId', 'name', 'version'])
const TYPES_KEYS = Object.freeze([AUTHORIZATION_PRIMARY_TYPE])
const TYPE_FIELD_KEYS = Object.freeze(['name', 'type'])
const MESSAGE_KEYS = Object.freeze([
  'attestationRequestCommitment',
  'authorizationId',
  'evaluationVersion',
  'expiresAt',
  'intendedFunderWallet',
  'issuedAt',
  'maxDebtRatioBps',
  'maxOverdueCount',
  'midnightContractAddress',
  'minAnnualRevenueKrw',
  'onchainReceivableId',
  'partyWallet',
  'policyValidUntil',
  'profileAsOf',
  'providerId',
  'purpose',
  'receivableFinanceAddress',
  'requestId',
  'subjectRole',
])

const AUTHORIZATION_FIELDS = Object.freeze([
  Object.freeze({ name: 'purpose', type: 'string' }),
  Object.freeze({ name: 'authorizationId', type: 'bytes32' }),
  Object.freeze({ name: 'midnightContractAddress', type: 'bytes32' }),
  Object.freeze({ name: 'receivableFinanceAddress', type: 'address' }),
  Object.freeze({ name: 'onchainReceivableId', type: 'uint256' }),
  Object.freeze({ name: 'subjectRole', type: 'string' }),
  Object.freeze({ name: 'partyWallet', type: 'address' }),
  Object.freeze({ name: 'requestId', type: 'bytes32' }),
  Object.freeze({ name: 'intendedFunderWallet', type: 'address' }),
  Object.freeze({ name: 'minAnnualRevenueKrw', type: 'uint64' }),
  Object.freeze({ name: 'maxDebtRatioBps', type: 'uint32' }),
  Object.freeze({ name: 'maxOverdueCount', type: 'uint16' }),
  Object.freeze({ name: 'attestationRequestCommitment', type: 'bytes32' }),
  Object.freeze({ name: 'providerId', type: 'uint16' }),
  Object.freeze({ name: 'evaluationVersion', type: 'uint16' }),
  Object.freeze({ name: 'profileAsOf', type: 'uint64' }),
  Object.freeze({ name: 'policyValidUntil', type: 'uint64' }),
  Object.freeze({ name: 'issuedAt', type: 'uint64' }),
  Object.freeze({ name: 'expiresAt', type: 'uint64' }),
])

export class MidnightAuthorizationV2Error extends Error {
  constructor(code, message) {
    super(message)
    this.name = 'MidnightAuthorizationV2Error'
    this.code = code
  }
}

function invalidRequest(message) {
  return new MidnightAuthorizationV2Error('INVALID_AUTHORIZATION_REQUEST', message)
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function requireExactKeys(value, expectedKeys, message) {
  if (!isRecord(value)) throw invalidRequest(message)
  const keys = Object.keys(value)
  const expected = new Set(expectedKeys)
  if (keys.length !== expected.size || keys.some((key) => !expected.has(key))) {
    throw invalidRequest(message)
  }
}

function requireBytes32(value, fieldName, { nonZero = false } = {}) {
  if (typeof value !== 'string' || !/^0x[0-9a-f]{64}$/.test(value)) {
    throw invalidRequest(`${fieldName}은 소문자 bytes32여야 합니다.`)
  }
  if (nonZero && value === `0x${'0'.repeat(64)}`) {
    throw invalidRequest(`${fieldName}은 zero bytes32일 수 없습니다.`)
  }
  return value
}

function requireAddress(value, fieldName) {
  if (
    typeof value !== 'string' ||
    !/^0x[0-9a-f]{40}$/.test(value) ||
    value === `0x${'0'.repeat(40)}`
  ) {
    throw invalidRequest(`${fieldName}은 소문자 canonical EVM 주소여야 합니다.`)
  }
  try {
    if (getAddress(value).toLowerCase() !== value) throw new Error('non-canonical')
  } catch {
    throw invalidRequest(`${fieldName}이 올바른 EVM 주소가 아닙니다.`)
  }
  return value
}

function requireUint(value, fieldName, maximum, { positive = false } = {}) {
  if (typeof value !== 'string' || !/^(0|[1-9][0-9]*)$/.test(value)) {
    throw invalidRequest(`${fieldName}은 canonical 10진수 문자열이어야 합니다.`)
  }
  const parsed = BigInt(value)
  if ((positive && parsed === 0n) || parsed > maximum) {
    throw invalidRequest(`${fieldName} 범위가 올바르지 않습니다.`)
  }
  return value
}

function requireAuthorizationFields(value) {
  if (!Array.isArray(value) || value.length !== AUTHORIZATION_FIELDS.length) {
    throw invalidRequest('EIP-712 타입 필드 수가 승인된 v2 스키마와 다릅니다.')
  }
  value.forEach((field, index) => {
    requireExactKeys(field, TYPE_FIELD_KEYS, 'EIP-712 타입 필드를 확인해 주세요.')
    const expected = AUTHORIZATION_FIELDS[index]
    if (field.name !== expected.name || field.type !== expected.type) {
      throw invalidRequest('EIP-712 타입 필드 이름, 타입 또는 순서가 승인된 v2 스키마와 다릅니다.')
    }
  })
  return AUTHORIZATION_FIELDS
}

function unixSeconds(nowMilliseconds = Date.now()) {
  if (!Number.isFinite(nowMilliseconds) || nowMilliseconds < 0) {
    throw new MidnightAuthorizationV2Error(
      'INVALID_LOCAL_CLOCK',
      '브라우저 시스템 시간을 확인한 뒤 다시 시도해 주세요.',
    )
  }
  return BigInt(Math.floor(nowMilliseconds / 1_000))
}

export function assertAuthorizationV2IsCurrent(request, nowMilliseconds = Date.now()) {
  const now = unixSeconds(nowMilliseconds)
  const issuedAt = BigInt(request.message.issuedAt)
  const expiresAt = BigInt(request.message.expiresAt)
  const policyValidUntil = BigInt(request.message.policyValidUntil)
  const profileAsOf = BigInt(request.message.profileAsOf)

  if (issuedAt > now) throw invalidRequest('Authorization 발급 시각이 현재보다 미래입니다.')
  if (policyValidUntil <= now) {
    throw new MidnightAuthorizationV2Error(
      'POLICY_REQUEST_EXPIRED',
      'Funder의 검증 요청이 만료되었습니다.',
    )
  }
  if (expiresAt <= now) {
    throw new MidnightAuthorizationV2Error(
      'AUTHORIZATION_EXPIRED',
      '지갑 서명 시간이 만료되었습니다. 받은 요청에서 다시 시작해 주세요.',
    )
  }
  if (
    expiresAt <= issuedAt ||
    expiresAt - issuedAt > AUTHORIZATION_TTL_SECONDS ||
    profileAsOf !== issuedAt
  ) {
    throw invalidRequest('Authorization 또는 정책 유효시간 관계가 올바르지 않습니다.')
  }
}

export function parseAuthorizationRequestV2(value) {
  requireExactKeys(value, REQUEST_KEYS, 'Authorization request 최상위 필드를 확인해 주세요.')
  if (value.version !== 2) throw invalidRequest('제품 흐름은 Authorization v2만 허용합니다.')

  requireExactKeys(value.domain, DOMAIN_KEYS, 'EIP-712 domain을 확인해 주세요.')
  if (
    value.domain.name !== 'GASOK Mock Attestation' ||
    value.domain.version !== '2' ||
    value.domain.chainId !== APPROVED_GIWA_CHAIN_ID
  ) {
    throw invalidRequest('EIP-712 domain이 승인된 v2 문맥과 다릅니다.')
  }
  if (value.primaryType !== AUTHORIZATION_PRIMARY_TYPE) {
    throw invalidRequest('EIP-712 primaryType이 승인된 스키마와 다릅니다.')
  }
  requireExactKeys(value.types, TYPES_KEYS, 'EIP-712 types를 확인해 주세요.')
  const fields = requireAuthorizationFields(value.types[AUTHORIZATION_PRIMARY_TYPE])

  requireExactKeys(value.message, MESSAGE_KEYS, 'EIP-712 message 필드를 확인해 주세요.')
  if (value.message.purpose !== AUTHORIZATION_PURPOSE) {
    throw invalidRequest('Authorization purpose가 승인된 v2 문구와 다릅니다.')
  }
  if (value.message.subjectRole !== 'SELLER' && value.message.subjectRole !== 'BUYER') {
    throw invalidRequest('subjectRole은 SELLER 또는 BUYER여야 합니다.')
  }

  const message = Object.freeze({
    purpose: value.message.purpose,
    authorizationId: requireBytes32(value.message.authorizationId, 'authorizationId', {
      nonZero: true,
    }),
    midnightContractAddress: requireBytes32(
      value.message.midnightContractAddress,
      'midnightContractAddress',
      { nonZero: true },
    ),
    receivableFinanceAddress: requireAddress(
      value.message.receivableFinanceAddress,
      'receivableFinanceAddress',
    ),
    onchainReceivableId: requireUint(
      value.message.onchainReceivableId,
      'onchainReceivableId',
      UINT256_MAX,
      { positive: true },
    ),
    subjectRole: value.message.subjectRole,
    partyWallet: requireAddress(value.message.partyWallet, 'partyWallet'),
    requestId: requireBytes32(value.message.requestId, 'requestId', { nonZero: true }),
    intendedFunderWallet: requireAddress(
      value.message.intendedFunderWallet,
      'intendedFunderWallet',
    ),
    minAnnualRevenueKrw: requireUint(
      value.message.minAnnualRevenueKrw,
      'minAnnualRevenueKrw',
      UINT64_MAX,
    ),
    maxDebtRatioBps: requireUint(value.message.maxDebtRatioBps, 'maxDebtRatioBps', UINT32_MAX),
    maxOverdueCount: requireUint(value.message.maxOverdueCount, 'maxOverdueCount', UINT16_MAX),
    attestationRequestCommitment: requireBytes32(
      value.message.attestationRequestCommitment,
      'attestationRequestCommitment',
      { nonZero: true },
    ),
    providerId: requireUint(value.message.providerId, 'providerId', UINT16_MAX, {
      positive: true,
    }),
    evaluationVersion: requireUint(
      value.message.evaluationVersion,
      'evaluationVersion',
      UINT16_MAX,
      { positive: true },
    ),
    profileAsOf: requireUint(value.message.profileAsOf, 'profileAsOf', UINT64_MAX),
    policyValidUntil: requireUint(value.message.policyValidUntil, 'policyValidUntil', UINT64_MAX, {
      positive: true,
    }),
    issuedAt: requireUint(value.message.issuedAt, 'issuedAt', UINT64_MAX),
    expiresAt: requireUint(value.message.expiresAt, 'expiresAt', UINT64_MAX, {
      positive: true,
    }),
  })

  if (
    message.midnightContractAddress !== `0x${approvedMidnightContractAddress()}` ||
    message.receivableFinanceAddress !== APPROVED_RECEIVABLE_FINANCE_ADDRESS ||
    message.providerId !== '2' ||
    message.evaluationVersion !== '2'
  ) {
    throw invalidRequest('Authorization이 승인된 데모 계약, Provider 2, 평가 버전 2와 다릅니다.')
  }

  const request = Object.freeze({
    version: 2,
    domain: Object.freeze({ ...value.domain }),
    primaryType: AUTHORIZATION_PRIMARY_TYPE,
    types: Object.freeze({ [AUTHORIZATION_PRIMARY_TYPE]: fields }),
    message,
  })
  assertAuthorizationV2IsCurrent(request)
  return request
}

function assertApprovedGiwaConfiguration() {
  let configuredAddress
  try {
    configuredAddress = getAddress(giwaContractConfig.receivableFinanceAddress).toLowerCase()
  } catch {
    throw new MidnightAuthorizationV2Error(
      'INVALID_GIWA_CONFIGURATION',
      'Vue의 ReceivableFinance 설정을 확인해 주세요.',
    )
  }
  if (
    requiredChainId().toString() !== APPROVED_GIWA_CHAIN_ID ||
    configuredAddress !== APPROVED_RECEIVABLE_FINANCE_ADDRESS
  ) {
    throw new MidnightAuthorizationV2Error(
      'INVALID_GIWA_CONFIGURATION',
      'Vue의 거래 체인 또는 계약 설정이 승인된 PoC 문맥과 다릅니다.',
    )
  }
}

export async function signRoleAuthorizationV2(value) {
  const request = parseAuthorizationRequestV2(value)
  assertApprovedGiwaConfiguration()
  assertAuthorizationV2IsCurrent(request)

  try {
    const { signer } = await getGiwaSigner(request.message.partyWallet)
    assertAuthorizationV2IsCurrent(request)
    const typedDataHash = TypedDataEncoder.hash(
      request.domain,
      request.types,
      request.message,
    ).toLowerCase()
    const signature = await signer.signTypedData(request.domain, request.types, request.message)
    assertAuthorizationV2IsCurrent(request)

    let recoveredSigner
    try {
      recoveredSigner = verifyTypedData(
        request.domain,
        request.types,
        request.message,
        signature,
      ).toLowerCase()
    } catch {
      throw new MidnightAuthorizationV2Error(
        'INVALID_AUTHORIZATION_SIGNATURE',
        'MetaMask가 반환한 EIP-712 서명을 검증하지 못했습니다.',
      )
    }
    if (
      getAddress(recoveredSigner) !== getAddress(request.message.partyWallet) ||
      !/^0x[0-9a-fA-F]{130}$/.test(signature)
    ) {
      throw new MidnightAuthorizationV2Error(
        'AUTHORIZATION_SIGNER_MISMATCH',
        '서명 계정이 이 요청의 Seller/Buyer 역할 지갑과 일치하지 않습니다.',
      )
    }

    return Object.freeze({
      version: 2,
      authorizationId: request.message.authorizationId,
      typedDataHash,
      signer: recoveredSigner,
      signature,
    })
  } catch (error) {
    if (error instanceof MidnightAuthorizationV2Error) throw error
    throw normalizeWeb3Error(error)
  }
}
