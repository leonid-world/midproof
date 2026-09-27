import { apiRequest, ApiError } from './api'

const integer = (value) => typeof value === 'string' && /^[1-9][0-9]{0,35}$/.test(value)

function invalidPolicy() {
  return new ApiError(
    0,
    'INVALID_AMOUNT_POLICY',
    '금액 한도를 확인하지 못했습니다. 새로고침해 주세요.',
  )
}

export function parseAmountPolicy(value) {
  if (
    !value ||
    typeof value.demoEnabled !== 'boolean' ||
    value.tokenSymbol !== 'mKRW' ||
    value.tokenDecimals !== 0 ||
    value.minAmount !== '1' ||
    !integer(value.suggestedFaceValue) ||
    !integer(value.suggestedFundingAmount) ||
    (value.demoEnabled
      ? !integer(value.maxFaceValue) || !integer(value.maxFundingAmount)
      : value.maxFaceValue !== null || value.maxFundingAmount !== null)
  ) {
    throw invalidPolicy()
  }
  const policy = Object.freeze({ ...value })
  try {
    validateReceivableAmounts(
      {
        faceValue: policy.suggestedFaceValue,
        fundingAmount: policy.suggestedFundingAmount,
      },
      policy,
    )
    if (policy.demoEnabled && BigInt(policy.maxFundingAmount) > BigInt(policy.maxFaceValue)) {
      throw invalidPolicy()
    }
  } catch {
    throw invalidPolicy()
  }
  return policy
}

export async function loadReceivableAmountPolicy() {
  return parseAmountPolicy(await apiRequest('/receivables/amount-policy', { cache: 'no-store' }))
}

export function validateReceivableAmounts({ faceValue, fundingAmount }, policy) {
  if (!policy) throw invalidPolicy()
  if (!integer(faceValue) || !integer(fundingAmount)) {
    throw new ApiError(
      400,
      'INVALID_RECEIVABLE_AMOUNT',
      '금액은 1 mKRW 이상의 정수로 입력해 주세요.',
    )
  }
  if (BigInt(fundingAmount) > BigInt(faceValue)) {
    throw new ApiError(400, 'INVALID_FUNDING_AMOUNT', '펀딩 금액은 채권 금액 이하여야 합니다.')
  }
  if (
    policy.demoEnabled &&
    (BigInt(faceValue) > BigInt(policy.maxFaceValue) ||
      BigInt(fundingAmount) > BigInt(policy.maxFundingAmount))
  ) {
    throw new ApiError(
      400,
      'DEMO_RECEIVABLE_AMOUNT_LIMIT_EXCEEDED',
      `데모 채권은 건당 ${formatMkrwInteger(policy.maxFaceValue)} mKRW까지 발행할 수 있습니다.`,
    )
  }
  return { faceValue, fundingAmount }
}

// Fetch again before a new wallet action; never apply a new cap to receipt recovery
// or to the exact repayment of an already funded historical receivable.
export async function requireNewReceivableAmounts(receivable) {
  const policy = await loadReceivableAmountPolicy()
  validateReceivableAmounts(receivable, policy)
  return policy
}

export function formatMkrwInteger(value) {
  return String(value).replace(/\B(?=(\d{3})+(?!\d))/g, ',')
}

export function demoAmountHint(policy) {
  return policy?.demoEnabled
    ? `테스트용 · 채권·상환 최대 ${formatMkrwInteger(policy.maxFaceValue)} mKRW. 펀딩은 채권액 이하.`
    : ''
}
