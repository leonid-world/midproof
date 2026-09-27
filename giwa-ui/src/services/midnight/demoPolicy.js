// Public requested thresholds only. Never accepts a company's private financial inputs.
export const DEMO_POLICY_LIMITS = Object.freeze({
  minAnnualRevenueKrw: (1n << 64n) - 1n,
  maxDebtRatioBps: (1n << 32n) - 1n,
  maxOverdueCount: (1n << 16n) - 1n,
})
export const DEMO_POLICY_PRESETS = Object.freeze([
  { label: '완화', revenue: '3', debt: '300', overdue: '3' },
  { label: '기본', revenue: '5', debt: '200', overdue: '1' },
  { label: '엄격', revenue: '10', debt: '100', overdue: '0' },
])

export function isDemoPolicy(value) {
  return Object.entries(DEMO_POLICY_LIMITS).every(
    ([key, max]) =>
      typeof value?.[key] === 'string' &&
      value[key].length <= 20 &&
      /^(0|[1-9][0-9]*)$/.test(value[key]) &&
      BigInt(value[key]) <= max,
  )
}

function scaled(value, places, max, message) {
  const text = String(value).trim()
  const match = new RegExp(`^(0|[1-9][0-9]*)(?:\\.([0-9]{1,${places}}))?$`).exec(text)
  if (!match || text.length > 30) throw new Error(message)
  const number =
    BigInt(match[1]) * 10n ** BigInt(places) + BigInt((match[2] ?? '').padEnd(places, '0'))
  if (number > max) throw new Error(message)
  return number.toString()
}

export function demoPolicyFromInputs({ revenue, debt, overdue }) {
  const minAnnualRevenueKrw = scaled(
    revenue,
    8,
    DEMO_POLICY_LIMITS.minAnnualRevenueKrw,
    '매출 기준은 0~184,467,440,737.09551615억 원으로 입력해 주세요.',
  )
  const maxDebtRatioBps = scaled(
    debt,
    2,
    DEMO_POLICY_LIMITS.maxDebtRatioBps,
    '부채비율은 0~42,949,672.95%로, 소수 둘째 자리까지 입력해 주세요.',
  )
  const count = String(overdue).trim()
  if (!/^(0|[1-9][0-9]{0,4})$/.test(count) || BigInt(count) > DEMO_POLICY_LIMITS.maxOverdueCount)
    throw new Error('연체 횟수는 0~65,535 사이의 정수로 입력해 주세요.')
  return { minAnnualRevenueKrw, maxDebtRatioBps, maxOverdueCount: count }
}

function unscale(value, places) {
  const text = String(value).padStart(places + 1, '0')
  const fraction = text.slice(-places).replace(/0+$/, '')
  return text.slice(0, -places) + (fraction ? `.${fraction}` : '')
}
export function demoPolicyToInputs(policy) {
  return {
    revenue: unscale(policy.minAnnualRevenueKrw, 8),
    debt: unscale(policy.maxDebtRatioBps, 2),
    overdue: policy.maxOverdueCount,
  }
}
export function demoPolicySummary(policy) {
  const { revenue, debt, overdue } = demoPolicyToInputs(policy)
  return `매출 ≥ ${revenue}억 원 · 부채비율 ≤ ${debt}% · 연체 ≤ ${overdue}회`
}
