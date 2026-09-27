import { expect, it } from 'vitest'
import { demoPolicyFromInputs, demoPolicyToInputs, isDemoPolicy } from './demoPolicy'
it('converts human units exactly, including fractions that floating point would round', () => {
  const policy = demoPolicyFromInputs({ revenue: '7.12345678', debt: '175.29', overdue: '2' })
  expect(policy).toEqual({
    minAnnualRevenueKrw: '712345678',
    maxDebtRatioBps: '17529',
    maxOverdueCount: '2',
  })
  expect(demoPolicyToInputs(policy)).toEqual({
    revenue: '7.12345678',
    debt: '175.29',
    overdue: '2',
  })
})
it('round trips exact protocol maxima and zero without precision loss', () => {
  for (const inputs of [
    { revenue: '184467440737.09551615', debt: '42949672.95', overdue: '65535' },
    { revenue: '0', debt: '0', overdue: '0' },
  ]) {
    const policy = demoPolicyFromInputs(inputs)
    expect(isDemoPolicy(policy)).toBe(true)
    expect(demoPolicyToInputs(policy)).toEqual(inputs)
  }
})
it.each([
  { revenue: '' },
  { revenue: '-1' },
  { revenue: '1e2' },
  { revenue: '01' },
  { revenue: '0.000000001' },
  { revenue: '184467440737.09551616' },
  { debt: '200.001' },
  { debt: '42949672.96' },
  { overdue: '1.5' },
  { overdue: '65536' },
])('rejects malformed or unrepresentable inputs %j', (overrides) => {
  expect(() =>
    demoPolicyFromInputs({ revenue: '5', debt: '200', overdue: '1', ...overrides }),
  ).toThrow()
})
