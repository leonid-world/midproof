import { apiRequest } from '../api'

const BASE = '/midnight-proof/v2'
const STATES = new Set([
  'preparing',
  'proving',
  'submitted',
  'completed',
  'failed',
  'uncertain',
  'expired',
])
const HASH = /^0x[0-9a-f]{64}$/
const ADDRESS = /^0x[0-9a-f]{40}$/
const CONTRACT = /^[0-9a-f]{64}$/
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
const DECIMAL = /^(0|[1-9][0-9]*)$/
const PUBLIC_FIELDS = [
  'version',
  'runId',
  'requestId',
  'clientRequestId',
  'profileId',
  'subjectRole',
  'status',
  'networkId',
  'midnightContractAddress',
  'giwaChainId',
  'receivableFinanceAddress',
  'onchainReceivableId',
  'partyWallet',
  'intendedFunderWallet',
  'minAnnualRevenueKrw',
  'maxDebtRatioBps',
  'maxOverdueCount',
  'validUntil',
]
const BINDING_FIELDS = PUBLIC_FIELDS.filter((key) => key !== 'status')

function invalid() {
  const error = new Error(
    '증명 서버의 응답 문맥을 확인하지 못했습니다. 기존 요청 상태를 다시 확인해 주세요.',
  )
  error.code = 'INVALID_DEMO_RESPONSE'
  return error
}

export async function loadWalletlessConfig(options = {}) {
  const value = await apiRequest(`${BASE}/demo/config`, {
    ...options,
    cache: 'no-store',
    timeoutMs: 10_000,
    maxResponseBytes: 65_536,
  })
  if (
    value?.mode !== 'hosted-demo' ||
    !['preview', 'undeployed'].includes(value.networkId) ||
    typeof value.runtime?.status !== 'string' ||
    typeof value.walletlessDemo?.enabled !== 'boolean' ||
    !Array.isArray(value.profiles) ||
    value.profiles.length < 1 ||
    value.profiles.length > 2 ||
    !value.profiles.every(
      (profile) =>
        ['steady', 'stretched'].includes(profile.id) &&
        typeof profile.label === 'string' &&
        typeof profile.summary === 'string',
    ) ||
    (value.contractAddress != null &&
      (!CONTRACT.test(value.contractAddress) || /^0+$/.test(value.contractAddress))) ||
    (value.runtime.status === 'ready' && !value.contractAddress)
  )
    throw invalid()
  return value
}

export function parseDemoRun(value, { config, expected } = {}) {
  if (
    !value ||
    value.version !== 2 ||
    !STATES.has(value.status) ||
    !HASH.test(value.runId) ||
    !HASH.test(value.requestId) ||
    !UUID.test(value.clientRequestId) ||
    !['steady', 'stretched'].includes(value.profileId) ||
    !['SELLER', 'BUYER'].includes(value.subjectRole) ||
    !['preview', 'undeployed'].includes(value.networkId) ||
    !CONTRACT.test(value.midnightContractAddress) ||
    /^0+$/.test(value.midnightContractAddress) ||
    ![
      'giwaChainId',
      'onchainReceivableId',
      'minAnnualRevenueKrw',
      'maxDebtRatioBps',
      'maxOverdueCount',
      'validUntil',
    ].every((key) => typeof value[key] === 'string' && DECIMAL.test(value[key])) ||
    !['receivableFinanceAddress', 'partyWallet', 'intendedFunderWallet'].every(
      (key) => ADDRESS.test(value[key]) && !/^0x0+$/.test(value[key]),
    ) ||
    value.minAnnualRevenueKrw !== '500000000' ||
    value.maxDebtRatioBps !== '20000' ||
    value.maxOverdueCount !== '1' ||
    BigInt(value.validUntil) > 8_640_000_000_000n
  )
    throw invalid()
  if (
    config &&
    (value.networkId !== config.networkId ||
      value.midnightContractAddress !== config.contractAddress)
  )
    throw invalid()
  if (
    config?.walletlessDemo?.giwaChainId &&
    value.giwaChainId !== config.walletlessDemo.giwaChainId
  )
    throw invalid()
  if (
    config?.walletlessDemo?.receivableFinanceAddress &&
    value.receivableFinanceAddress !== config.walletlessDemo.receivableFinanceAddress.toLowerCase()
  )
    throw invalid()
  if (
    expected &&
    BINDING_FIELDS.some((key) => expected[key] !== undefined && value[key] !== expected[key])
  )
    throw invalid()
  if (
    config?.walletlessDemo?.onchainReceivableId &&
    value.onchainReceivableId !== config.walletlessDemo.onchainReceivableId
  )
    throw invalid()
  const output = Object.fromEntries(PUBLIC_FIELDS.map((key) => [key, value[key]]))
  if (value.status === 'completed') {
    const result = value.result
    if (
      !result ||
      typeof result.eligible !== 'boolean' ||
      result.providerId !== 2 ||
      result.evaluationVersion !== 2 ||
      typeof result.profileAsOf !== 'string' ||
      !DECIMAL.test(result.profileAsOf) ||
      result.validUntil !== value.validUntil ||
      BigInt(result.profileAsOf) >= BigInt(result.validUntil)
    )
      throw invalid()
    output.result = {
      eligible: result.eligible,
      providerId: 2,
      evaluationVersion: 2,
      profileAsOf: result.profileAsOf,
      validUntil: result.validUntil,
    }
  }
  if (value.transactionId !== undefined) {
    if (typeof value.transactionId !== 'string' || !/^(0x)?[0-9a-f]{64}$/.test(value.transactionId))
      throw invalid()
    output.transactionId = value.transactionId
  }
  if (value.blockHeight !== undefined) {
    if (typeof value.blockHeight !== 'string' || !DECIMAL.test(value.blockHeight)) throw invalid()
    output.blockHeight = value.blockHeight
  }
  if (value.error && typeof value.error.code === 'string') output.error = { code: value.error.code }
  return output
}

export async function demoRunRequest(operation, body, options = {}) {
  const { config, expected, ...requestOptions } = options
  const value = await apiRequest(`${BASE}/demo-runs/${operation}`, {
    ...requestOptions,
    method: 'POST',
    body: { version: 2, ...body },
    cache: 'no-store',
    timeoutMs: 10_000,
    maxResponseBytes: 65_536,
  })
  return parseDemoRun(value, { config, expected })
}
