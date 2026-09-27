import { TypedDataEncoder, getAddress, verifyTypedData } from 'ethers'
import { giwaContractConfig } from '../../contracts/addresses'
import { normalizeWeb3Error } from '../web3/errors'
import { getGiwaSigner, requiredChainId } from '../web3/provider'

const MAX_AUTHORIZATION_TEXT_LENGTH = 8 * 1_024
const UINT16_MAX = (1n << 16n) - 1n
const UINT64_MAX = (1n << 64n) - 1n
const UINT256_MAX = (1n << 256n) - 1n
const AUTHORIZATION_TTL_SECONDS = 120n

const APPROVED_GIWA_CHAIN_ID = '91342'
const APPROVED_RECEIVABLE_FINANCE_ADDRESS = '0x0f264334f98ba0d22f7fc6bb901a5fa36158a315'
const APPROVED_MIDNIGHT_CONTRACT_ADDRESS =
  '0x7e3ea9d741ce0f5862db6f46d0ad720be2586cd7d0405ec77e4a0478aa50f4fb'
const AUTHORIZATION_PRIMARY_TYPE = 'GASOKRoleAttestationAuthorization'
const AUTHORIZATION_PURPOSE = 'Authorize GASOK local mock financial attestation'

const REQUEST_KEYS = Object.freeze(['domain', 'message', 'primaryType', 'types', 'version'])
const DOMAIN_KEYS = Object.freeze(['chainId', 'name', 'version'])
const TYPES_KEYS = Object.freeze([AUTHORIZATION_PRIMARY_TYPE])
const TYPE_FIELD_KEYS = Object.freeze(['name', 'type'])
const MESSAGE_KEYS = Object.freeze([
  'attestationRequestCommitment',
  'authorizationId',
  'expiresAt',
  'issuedAt',
  'midnightContractAddress',
  'onchainReceivableId',
  'partyWallet',
  'policyVersion',
  'providerId',
  'purpose',
  'receivableFinanceAddress',
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
  Object.freeze({ name: 'attestationRequestCommitment', type: 'bytes32' }),
  Object.freeze({ name: 'providerId', type: 'uint16' }),
  Object.freeze({ name: 'policyVersion', type: 'uint16' }),
  Object.freeze({ name: 'issuedAt', type: 'uint64' }),
  Object.freeze({ name: 'expiresAt', type: 'uint64' }),
])

export class MidnightAuthorizationError extends Error {
  constructor(code, message) {
    super(message)
    this.name = 'MidnightAuthorizationError'
    this.code = code
  }
}

function invalidRequest(message) {
  return new MidnightAuthorizationError('INVALID_AUTHORIZATION_REQUEST', message)
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function hasExactKeys(value, expectedKeys) {
  if (!isRecord(value)) return false
  const keys = Object.keys(value)
  const expectedKeySet = new Set(expectedKeys)
  return keys.length === expectedKeySet.size && keys.every((key) => expectedKeySet.has(key))
}

function requireExactKeys(value, expectedKeys, message) {
  if (!hasExactKeys(value, expectedKeys)) throw invalidRequest(message)
}

function requireCanonicalBytes32(value, fieldName, { nonZero = false } = {}) {
  if (typeof value !== 'string' || !/^0x[0-9a-f]{64}$/.test(value)) {
    throw invalidRequest(`${fieldName}은 소문자 0x 형식의 bytes32여야 합니다.`)
  }
  if (nonZero && /^0x0{64}$/.test(value)) {
    throw invalidRequest(`${fieldName}은 zero bytes32일 수 없습니다.`)
  }
  return value
}

function requireCanonicalAddress(value, fieldName) {
  if (typeof value !== 'string' || !/^0x[0-9a-f]{40}$/.test(value)) {
    throw invalidRequest(`${fieldName}은 소문자 canonical EVM 주소여야 합니다.`)
  }
  if (/^0x0{40}$/.test(value)) {
    throw invalidRequest(`${fieldName}은 zero address일 수 없습니다.`)
  }

  try {
    if (getAddress(value).toLowerCase() !== value) throw new Error('Non-canonical address')
  } catch {
    throw invalidRequest(`${fieldName}이 올바른 EVM 주소가 아닙니다.`)
  }
  return value
}

function requireCanonicalUint(value, fieldName, maximum, { positive = false } = {}) {
  if (typeof value !== 'string' || !/^(0|[1-9][0-9]*)$/.test(value)) {
    throw invalidRequest(`${fieldName}은 부호 없는 canonical 10진수 문자열이어야 합니다.`)
  }

  const parsed = BigInt(value)
  if ((positive && parsed === 0n) || parsed > maximum) {
    throw invalidRequest(`${fieldName} 범위가 올바르지 않습니다.`)
  }
  return value
}

function requireAuthorizationFields(value) {
  if (!Array.isArray(value) || value.length !== AUTHORIZATION_FIELDS.length) {
    throw invalidRequest('EIP-712 타입 필드 수가 승인된 스키마와 일치하지 않습니다.')
  }

  for (let index = 0; index < AUTHORIZATION_FIELDS.length; index += 1) {
    const field = value[index]
    const expectedField = AUTHORIZATION_FIELDS[index]
    requireExactKeys(field, TYPE_FIELD_KEYS, 'EIP-712 타입 필드는 name과 type만 포함해야 합니다.')
    if (field.name !== expectedField.name || field.type !== expectedField.type) {
      throw invalidRequest('EIP-712 타입 필드의 이름, 타입 또는 순서가 승인된 스키마와 다릅니다.')
    }
  }

  return AUTHORIZATION_FIELDS
}

function unixSeconds(nowMilliseconds = Date.now()) {
  if (!Number.isFinite(nowMilliseconds) || nowMilliseconds < 0) {
    throw new MidnightAuthorizationError(
      'INVALID_LOCAL_CLOCK',
      '브라우저 시스템 시간을 확인한 뒤 다시 시도해 주세요.',
    )
  }
  return BigInt(Math.floor(nowMilliseconds / 1_000))
}

export function assertAuthorizationIsCurrent(request, nowMilliseconds = Date.now()) {
  const now = unixSeconds(nowMilliseconds)
  const issuedAt = BigInt(request.message.issuedAt)
  const expiresAt = BigInt(request.message.expiresAt)

  if (issuedAt > now) {
    throw invalidRequest('Authorization request 발급 시각이 현재 브라우저 시간보다 미래입니다.')
  }
  if (expiresAt <= now) {
    throw new MidnightAuthorizationError(
      'AUTHORIZATION_EXPIRED',
      'Authorization request가 만료되었습니다. CLI에서 새 요청을 발급해 주세요.',
    )
  }
  if (expiresAt <= issuedAt || expiresAt - issuedAt > AUTHORIZATION_TTL_SECONDS) {
    throw invalidRequest('Authorization request 유효시간은 0초 초과 120초 이하여야 합니다.')
  }
}

function parseAuthorizationValue(value) {
  if (!isRecord(value)) throw invalidRequest('Authorization request는 JSON 객체여야 합니다.')
  requireExactKeys(value, REQUEST_KEYS, 'Authorization request 최상위 필드를 확인해 주세요.')
  if (value.version !== 1) throw invalidRequest('지원하는 Authorization request 버전은 1입니다.')

  requireExactKeys(value.domain, DOMAIN_KEYS, 'EIP-712 domain 필드를 확인해 주세요.')
  if (
    value.domain.name !== 'GASOK Mock Attestation' ||
    value.domain.version !== '1' ||
    value.domain.chainId !== APPROVED_GIWA_CHAIN_ID
  ) {
    throw invalidRequest('EIP-712 domain이 승인된 채권 검증 문맥과 일치하지 않습니다.')
  }

  if (value.primaryType !== AUTHORIZATION_PRIMARY_TYPE) {
    throw invalidRequest('EIP-712 primaryType이 승인된 스키마와 일치하지 않습니다.')
  }
  requireExactKeys(
    value.types,
    TYPES_KEYS,
    'EIP-712 types에는 승인된 primary type만 있어야 합니다.',
  )
  const fields = requireAuthorizationFields(value.types[AUTHORIZATION_PRIMARY_TYPE])

  requireExactKeys(value.message, MESSAGE_KEYS, 'EIP-712 message 필드를 확인해 주세요.')
  if (value.message.purpose !== AUTHORIZATION_PURPOSE) {
    throw invalidRequest('Authorization purpose가 승인된 문구와 일치하지 않습니다.')
  }

  const authorizationId = requireCanonicalBytes32(
    value.message.authorizationId,
    'authorizationId',
    { nonZero: true },
  )
  const midnightContractAddress = requireCanonicalBytes32(
    value.message.midnightContractAddress,
    'midnightContractAddress',
  )
  if (midnightContractAddress !== APPROVED_MIDNIGHT_CONTRACT_ADDRESS) {
    throw invalidRequest('현재 승인된 로컬 Midnight 계약의 요청이 아닙니다.')
  }

  const receivableFinanceAddress = requireCanonicalAddress(
    value.message.receivableFinanceAddress,
    'receivableFinanceAddress',
  )
  if (receivableFinanceAddress !== APPROVED_RECEIVABLE_FINANCE_ADDRESS) {
    throw invalidRequest('현재 승인된 ReceivableFinance 요청이 아닙니다.')
  }

  const onchainReceivableId = requireCanonicalUint(
    value.message.onchainReceivableId,
    'onchainReceivableId',
    UINT256_MAX,
    { positive: true },
  )
  if (value.message.subjectRole !== 'SELLER' && value.message.subjectRole !== 'BUYER') {
    throw invalidRequest('subjectRole은 SELLER 또는 BUYER여야 합니다.')
  }
  const partyWallet = requireCanonicalAddress(value.message.partyWallet, 'partyWallet')
  const attestationRequestCommitment = requireCanonicalBytes32(
    value.message.attestationRequestCommitment,
    'attestationRequestCommitment',
    { nonZero: true },
  )
  const providerId = requireCanonicalUint(value.message.providerId, 'providerId', UINT16_MAX, {
    positive: true,
  })
  const policyVersion = requireCanonicalUint(
    value.message.policyVersion,
    'policyVersion',
    UINT16_MAX,
    { positive: true },
  )
  if (providerId !== '2' || policyVersion !== '1') {
    throw invalidRequest('이 도구는 Mock Provider 2 / 정책 버전 1 요청만 서명합니다.')
  }
  const issuedAt = requireCanonicalUint(value.message.issuedAt, 'issuedAt', UINT64_MAX)
  const expiresAt = requireCanonicalUint(value.message.expiresAt, 'expiresAt', UINT64_MAX)

  const request = Object.freeze({
    version: 1,
    domain: Object.freeze({
      name: value.domain.name,
      version: value.domain.version,
      chainId: value.domain.chainId,
    }),
    primaryType: AUTHORIZATION_PRIMARY_TYPE,
    types: Object.freeze({ [AUTHORIZATION_PRIMARY_TYPE]: fields }),
    message: Object.freeze({
      purpose: value.message.purpose,
      authorizationId,
      midnightContractAddress,
      receivableFinanceAddress,
      onchainReceivableId,
      subjectRole: value.message.subjectRole,
      partyWallet,
      attestationRequestCommitment,
      providerId,
      policyVersion,
      issuedAt,
      expiresAt,
    }),
  })
  assertAuthorizationIsCurrent(request)
  return request
}

export function parseAuthorizationRequest(text) {
  if (typeof text !== 'string' || !text.trim()) {
    throw invalidRequest('CLI가 출력한 Authorization request JSON을 붙여넣어 주세요.')
  }
  if (text.length > MAX_AUTHORIZATION_TEXT_LENGTH) {
    throw invalidRequest('Authorization request가 허용된 길이를 초과했습니다.')
  }

  let value
  try {
    value = JSON.parse(text)
  } catch {
    throw invalidRequest('Authorization request가 올바른 JSON이 아닙니다.')
  }
  return parseAuthorizationValue(value)
}

function assertApprovedGiwaConfiguration() {
  let configuredFinanceAddress
  try {
    configuredFinanceAddress = getAddress(giwaContractConfig.receivableFinanceAddress).toLowerCase()
  } catch {
    throw new MidnightAuthorizationError(
      'INVALID_GIWA_CONFIGURATION',
      'Vue의 ReceivableFinance 설정을 확인해 주세요.',
    )
  }

  if (
    requiredChainId().toString() !== APPROVED_GIWA_CHAIN_ID ||
    configuredFinanceAddress !== APPROVED_RECEIVABLE_FINANCE_ADDRESS
  ) {
    throw new MidnightAuthorizationError(
      'INVALID_GIWA_CONFIGURATION',
      'Vue의 거래 체인 또는 ReceivableFinance 설정이 승인된 PoC 문맥과 다릅니다.',
    )
  }
}

export async function signRoleAuthorization(request) {
  const safeRequest = parseAuthorizationValue(request)
  assertApprovedGiwaConfiguration()
  assertAuthorizationIsCurrent(safeRequest)

  try {
    const { signer } = await getGiwaSigner(safeRequest.message.partyWallet)
    assertAuthorizationIsCurrent(safeRequest)
    const typedDataHash = TypedDataEncoder.hash(
      safeRequest.domain,
      safeRequest.types,
      safeRequest.message,
    ).toLowerCase()
    const signature = await signer.signTypedData(
      safeRequest.domain,
      safeRequest.types,
      safeRequest.message,
    )
    assertAuthorizationIsCurrent(safeRequest)

    let recoveredSigner
    try {
      recoveredSigner = verifyTypedData(
        safeRequest.domain,
        safeRequest.types,
        safeRequest.message,
        signature,
      ).toLowerCase()
    } catch {
      throw new MidnightAuthorizationError(
        'INVALID_AUTHORIZATION_SIGNATURE',
        'MetaMask가 반환한 EIP-712 서명을 검증하지 못했습니다.',
      )
    }
    if (
      getAddress(recoveredSigner) !== getAddress(safeRequest.message.partyWallet) ||
      !/^0x[0-9a-fA-F]{130}$/.test(signature)
    ) {
      throw new MidnightAuthorizationError(
        'AUTHORIZATION_SIGNER_MISMATCH',
        '복구한 서명자가 요청의 canonical 역할 지갑과 일치하지 않습니다.',
      )
    }

    return Object.freeze({
      version: 1,
      authorizationId: safeRequest.message.authorizationId,
      typedDataHash,
      signer: recoveredSigner,
      signature,
    })
  } catch (error) {
    if (error instanceof MidnightAuthorizationError) throw error
    throw normalizeWeb3Error(error)
  }
}
