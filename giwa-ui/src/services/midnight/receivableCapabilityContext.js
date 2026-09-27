const ADDRESS_PATTERN = /^0x[0-9a-fA-F]{40}$/
const POSITIVE_DECIMAL_PATTERN = /^[1-9][0-9]*$/

export class ReceivableCapabilityContextError extends Error {
  constructor(code, message) {
    super(message)
    this.name = 'ReceivableCapabilityContextError'
    this.code = code
  }
}

function invalidContext(message) {
  return new ReceivableCapabilityContextError('INVALID_RECEIVABLE_CONTEXT', message)
}

function contextMismatch(message) {
  return new ReceivableCapabilityContextError('PROOF_CAPABILITY_CONTEXT_MISMATCH', message)
}

function canonicalPositiveDecimal(value, label) {
  const normalized = value == null ? '' : String(value)
  if (!POSITIVE_DECIMAL_PATTERN.test(normalized)) {
    throw invalidContext(`${label}를 확인할 수 없습니다.`)
  }
  return normalized
}

function canonicalAddress(value, label) {
  if (typeof value !== 'string' || !ADDRESS_PATTERN.test(value)) {
    throw invalidContext(`${label}를 확인할 수 없습니다.`)
  }
  const normalized = value.toLowerCase()
  if (normalized === `0x${'0'.repeat(40)}`) {
    throw invalidContext(`${label}는 zero address일 수 없습니다.`)
  }
  return normalized
}

function sameId(first, second) {
  return first != null && second != null && String(first) === String(second)
}

export function mergeVisibleReceivables(...collections) {
  const recordsById = new Map()
  for (const collection of collections) {
    if (!Array.isArray(collection)) continue
    for (const record of collection) {
      if (record?.receivableId == null) continue
      const key = String(record.receivableId)
      if (!recordsById.has(key)) recordsById.set(key, record)
    }
  }
  return [...recordsById.values()]
}

export function isFunderVisibleReceivable(receivable, companyId) {
  if (companyId == null || receivable?.receivableId == null) return false
  if (
    sameId(companyId, receivable.sellerCompanyId) ||
    sameId(companyId, receivable.buyerCompanyId)
  ) {
    return false
  }
  if (receivable.funderCompanyId == null) return receivable.status === 'TOKENIZED'
  return sameId(companyId, receivable.funderCompanyId)
}

export function createReceivableCapabilityContext(receivable, subjectRole) {
  if (subjectRole !== 'SELLER' && subjectRole !== 'BUYER') {
    throw invalidContext('검증할 역할은 Seller 또는 Buyer여야 합니다.')
  }

  return Object.freeze({
    dbReceivableId: canonicalPositiveDecimal(receivable?.receivableId, 'DB 채권 ID'),
    onchainReceivableId: canonicalPositiveDecimal(
      receivable?.onchainReceivableId,
      '온체인 채권 ID',
    ),
    receivableFinanceAddress: canonicalAddress(
      receivable?.contractAddress,
      'ReceivableFinance 계약 주소',
    ),
    subjectRole,
    partyWallet: canonicalAddress(
      subjectRole === 'SELLER' ? receivable?.sellerWalletAddress : receivable?.buyerWalletAddress,
      `${subjectRole} 지갑`,
    ),
  })
}

export function hasCompleteReceivableCapabilityContext(receivable) {
  try {
    createReceivableCapabilityContext(receivable, 'SELLER')
    createReceivableCapabilityContext(receivable, 'BUYER')
    return true
  } catch {
    return false
  }
}

export function assertCapabilityMatchesReceivable(capability, expectedContext) {
  if (!expectedContext) {
    throw invalidContext('먼저 검증할 DB 채권과 Seller/Buyer 역할을 선택해 주세요.')
  }
  if (capability.onchainReceivableId !== expectedContext.onchainReceivableId) {
    throw contextMismatch('선택한 DB 채권의 온체인 ID와 검증 권한이 일치하지 않습니다.')
  }
  if (
    capability.receivableFinanceAddress.toLowerCase() !== expectedContext.receivableFinanceAddress
  ) {
    throw contextMismatch(
      '선택한 DB 채권의 ReceivableFinance 계약과 검증 권한이 일치하지 않습니다.',
    )
  }
  if (capability.subjectRole !== expectedContext.subjectRole) {
    throw contextMismatch('선택한 Seller/Buyer 역할과 검증 권한이 일치하지 않습니다.')
  }
  if (capability.partyWallet.toLowerCase() !== expectedContext.partyWallet) {
    throw contextMismatch('선택한 역할의 지갑과 검증 권한이 일치하지 않습니다.')
  }
  return capability
}
