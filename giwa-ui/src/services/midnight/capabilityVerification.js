import { midnightConfig } from './config'

const ADAPTER_REQUEST_TIMEOUT_MS = 10_000
const MAX_CAPABILITY_TEXT_LENGTH = 4_096
const MAX_ADAPTER_RESPONSE_LENGTH = 64 * 1_024
const UINT16_MAX = (1n << 16n) - 1n
const UINT64_MAX = (1n << 64n) - 1n
const UINT256_MAX = (1n << 256n) - 1n
const CAPABILITY_KEYS = Object.freeze([
  'companyCommitment',
  'giwaChainId',
  'lookupKey',
  'midnightContractAddress',
  'onchainReceivableId',
  'partyWallet',
  'receivableFinanceAddress',
  'subjectRole',
  'version',
])
const RESPONSE_KEYS = Object.freeze(['contractAddress', 'context', 'networkId', 'result'])
const RESPONSE_CONTEXT_KEYS = Object.freeze([
  'giwaChainId',
  'onchainReceivableId',
  'partyWallet',
  'receivableFinanceAddress',
  'subjectRole',
])
const RESPONSE_RESULT_KEYS = Object.freeze(['eligible', 'lookupKey', 'policyVersion', 'providerId'])

export class MidnightCapabilityError extends Error {
  constructor(code, message) {
    super(message)
    this.name = 'MidnightCapabilityError'
    this.code = code
  }
}

function invalidCapability(message) {
  return new MidnightCapabilityError('INVALID_PROOF_CAPABILITY', message)
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function hasExactKeys(value, expectedKeys) {
  const keys = Object.keys(value)
  const expectedKeySet = new Set(expectedKeys)
  return keys.length === expectedKeySet.size && keys.every((key) => expectedKeySet.has(key))
}

function requireExactCapabilityKeys(value) {
  if (!hasExactKeys(value, CAPABILITY_KEYS)) {
    throw invalidCapability('Proof capability에 필요한 9개 필드만 포함해 주세요.')
  }
}

function requireCanonicalHex(value, pattern, fieldName) {
  if (typeof value !== 'string' || !pattern.test(value)) {
    throw invalidCapability(`${fieldName} 형식이 올바르지 않습니다.`)
  }
  return value
}

function requireCanonicalUnsignedDecimal(value, fieldName, maximum, { positive = false } = {}) {
  if (typeof value !== 'string' || !/^(0|[1-9][0-9]*)$/.test(value)) {
    throw invalidCapability(`${fieldName}은 부호 없는 10진수 문자열이어야 합니다.`)
  }

  const parsed = BigInt(value)
  if ((positive && parsed === 0n) || parsed > maximum) {
    throw invalidCapability(`${fieldName} 범위가 올바르지 않습니다.`)
  }
  return value
}

export function parseProofCapability(text) {
  if (typeof text !== 'string' || !text.trim()) {
    throw invalidCapability('CLI가 출력한 Proof capability JSON을 붙여넣어 주세요.')
  }
  if (text.length > MAX_CAPABILITY_TEXT_LENGTH) {
    throw invalidCapability('Proof capability가 허용된 길이를 초과했습니다.')
  }

  let value
  try {
    value = JSON.parse(text)
  } catch {
    throw invalidCapability('Proof capability가 올바른 JSON이 아닙니다.')
  }

  if (!isRecord(value)) {
    throw invalidCapability('Proof capability는 JSON 객체여야 합니다.')
  }
  requireExactCapabilityKeys(value)

  if (value.version !== 1) {
    throw invalidCapability('지원하는 Proof capability 버전은 1입니다.')
  }
  const midnightContractAddress = requireCanonicalHex(
    value.midnightContractAddress,
    /^[0-9a-f]{64}$/,
    'Midnight 계약 주소',
  )
  const companyCommitment = requireCanonicalHex(
    value.companyCommitment,
    /^0x[0-9a-f]{64}$/,
    'Company commitment',
  )
  const lookupKey = requireCanonicalHex(value.lookupKey, /^0x[0-9a-f]{64}$/, 'Lookup key')
  const giwaChainId = requireCanonicalUnsignedDecimal(
    value.giwaChainId,
    '거래 체인 ID',
    UINT64_MAX,
    { positive: true },
  )
  const receivableFinanceAddress = requireCanonicalHex(
    value.receivableFinanceAddress,
    /^0x[0-9a-f]{40}$/,
    'ReceivableFinance 주소',
  )
  const onchainReceivableId = requireCanonicalUnsignedDecimal(
    value.onchainReceivableId,
    '온체인 채권 ID',
    UINT256_MAX,
    { positive: true },
  )
  if (value.subjectRole !== 'SELLER' && value.subjectRole !== 'BUYER') {
    throw invalidCapability('Subject role은 SELLER 또는 BUYER여야 합니다.')
  }
  const partyWallet = requireCanonicalHex(value.partyWallet, /^0x[0-9a-f]{40}$/, '당사자 지갑')
  if (/^0x0{40}$/.test(partyWallet) || /^0x0{40}$/.test(receivableFinanceAddress)) {
    throw invalidCapability('주소는 zero address일 수 없습니다.')
  }

  return Object.freeze({
    version: 1,
    midnightContractAddress,
    companyCommitment,
    lookupKey,
    giwaChainId,
    receivableFinanceAddress,
    onchainReceivableId,
    subjectRole: value.subjectRole,
    partyWallet,
  })
}

function parseAdapterJson(text) {
  if (!text) return null
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}

function invalidAdapterResponse(
  message = 'Midnight 어댑터가 올바르지 않은 검증 결과를 반환했습니다.',
) {
  return new MidnightCapabilityError('INVALID_ADAPTER_RESPONSE', message)
}

function requireResponseInteger(value, fieldName) {
  if (typeof value !== 'string' || !/^(0|[1-9][0-9]*)$/.test(value)) {
    throw invalidAdapterResponse(`Midnight 어댑터의 ${fieldName} 값이 올바르지 않습니다.`)
  }
  if (BigInt(value) > UINT16_MAX) {
    throw invalidAdapterResponse(`Midnight 어댑터의 ${fieldName} 범위가 올바르지 않습니다.`)
  }
  return value
}

function parseResolvedEligibility(payload, capability) {
  if (
    !isRecord(payload) ||
    !isRecord(payload.context) ||
    !isRecord(payload.result) ||
    !hasExactKeys(payload, RESPONSE_KEYS) ||
    !hasExactKeys(payload.context, RESPONSE_CONTEXT_KEYS) ||
    !hasExactKeys(payload.result, RESPONSE_RESULT_KEYS)
  ) {
    throw invalidAdapterResponse()
  }

  const { context, result } = payload
  const responseMatchesCapability =
    payload.networkId === midnightConfig.networkId &&
    payload.contractAddress === capability.midnightContractAddress &&
    context.giwaChainId === capability.giwaChainId &&
    context.receivableFinanceAddress === capability.receivableFinanceAddress &&
    context.onchainReceivableId === capability.onchainReceivableId &&
    context.subjectRole === capability.subjectRole &&
    context.partyWallet === capability.partyWallet &&
    result.lookupKey === capability.lookupKey

  if (!responseMatchesCapability || typeof result.eligible !== 'boolean') {
    throw invalidAdapterResponse(
      '요청한 capability와 일치하는 로컬 Midnight 결과를 받지 못했습니다.',
    )
  }

  return Object.freeze({
    networkId: payload.networkId,
    contractAddress: payload.contractAddress,
    context: Object.freeze({
      giwaChainId: context.giwaChainId,
      receivableFinanceAddress: context.receivableFinanceAddress,
      onchainReceivableId: context.onchainReceivableId,
      subjectRole: context.subjectRole,
      partyWallet: context.partyWallet,
    }),
    result: Object.freeze({
      lookupKey: result.lookupKey,
      eligible: result.eligible,
      providerId: requireResponseInteger(result.providerId, 'providerId'),
      policyVersion: requireResponseInteger(result.policyVersion, 'policyVersion'),
    }),
  })
}

async function readCappedResponseText(response) {
  const contentLength = response.headers.get('content-length')
  if (
    contentLength !== null &&
    /^\d+$/.test(contentLength) &&
    Number(contentLength) > MAX_ADAPTER_RESPONSE_LENGTH
  ) {
    await response.body?.cancel().catch(() => undefined)
    throw invalidAdapterResponse('Midnight 어댑터 응답이 허용된 크기를 초과했습니다.')
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
      if (byteLength > MAX_ADAPTER_RESPONSE_LENGTH) {
        await reader.cancel().catch(() => undefined)
        throw invalidAdapterResponse('Midnight 어댑터 응답이 허용된 크기를 초과했습니다.')
      }
      text += decoder.decode(value, { stream: true })
    }
    return text + decoder.decode()
  } finally {
    reader.releaseLock()
  }
}

function publicAdapterError(response, payload) {
  const code = payload?.error?.code
  const messages = {
    INVALID_JSON_BODY: 'Proof capability 요청 형식을 확인해 주세요.',
    JSON_BODY_REQUIRED: 'Proof capability JSON 요청이 필요합니다.',
    REQUEST_BODY_TOO_LARGE: 'Proof capability 요청이 허용된 크기를 초과했습니다.',
    INVALID_PROOF_CAPABILITY: 'Proof capability 필드와 형식을 확인해 주세요.',
    UNAPPROVED_CONTRACT_ADDRESS: '현재 로컬 어댑터에 등록된 Midnight 계약의 capability가 아닙니다.',
    UNAPPROVED_GIWA_CONTEXT: '현재 PoC가 허용한 거래 체인 또는 ReceivableFinance 계약이 아닙니다.',
    CAPABILITY_LOOKUP_MISMATCH: 'Capability의 공개 문맥과 lookup key가 서로 일치하지 않습니다.',
    ELIGIBILITY_RESULT_NOT_FOUND: '이 capability에 해당하는 Midnight 공개 결과를 찾지 못했습니다.',
    CONTRACT_NOT_FOUND: '해당 계약을 로컬 Midnight Indexer에서 찾지 못했습니다.',
    MIDNIGHT_INDEXER_UNAVAILABLE: '로컬 Midnight Indexer에 연결할 수 없습니다.',
    INVALID_CONTRACT_STATE: '현재 계약 상태를 로컬 어댑터가 해석하지 못했습니다.',
  }

  return new MidnightCapabilityError(
    typeof code === 'string' ? code : 'MIDNIGHT_ADAPTER_ERROR',
    messages[code] ?? `Midnight 로컬 어댑터가 요청을 처리하지 못했습니다. (${response.status})`,
  )
}

export async function resolveEligibilityCapability(capability, { signal } = {}) {
  const safeCapability = parseProofCapability(JSON.stringify(capability))
  const requestController = new AbortController()
  let timedOut = false
  const forwardAbort = () => requestController.abort()
  if (signal?.aborted) requestController.abort()
  else signal?.addEventListener('abort', forwardAbort, { once: true })

  const timeout = setTimeout(() => {
    timedOut = true
    requestController.abort()
  }, ADAPTER_REQUEST_TIMEOUT_MS)

  let response
  let responseText
  try {
    response = await fetch(`${midnightConfig.apiUrl}/v1/eligibility-results/resolve`, {
      method: 'POST',
      signal: requestController.signal,
      cache: 'no-store',
      // The localhost read adapter is deliberately unauthenticated. Do not
      // forward any GASOK origin cookies through the Vite proxy.
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(safeCapability),
    })
    responseText = await readCappedResponseText(response)
  } catch (error) {
    if (signal?.aborted) throw error
    if (error instanceof MidnightCapabilityError) throw error
    throw new MidnightCapabilityError(
      timedOut ? 'MIDNIGHT_ADAPTER_TIMEOUT' : 'MIDNIGHT_ADAPTER_UNAVAILABLE',
      timedOut
        ? 'Midnight 검증 시간이 초과되었습니다. 로컬 Indexer와 어댑터 상태를 확인한 뒤 다시 시도해 주세요.'
        : 'Midnight 로컬 어댑터에 연결할 수 없습니다. Node·Indexer와 어댑터 실행 상태를 확인해 주세요.',
    )
  } finally {
    clearTimeout(timeout)
    signal?.removeEventListener('abort', forwardAbort)
  }

  const payload = parseAdapterJson(responseText)
  if (!response.ok) throw publicAdapterError(response, payload)
  return parseResolvedEligibility(payload, safeCapability)
}
