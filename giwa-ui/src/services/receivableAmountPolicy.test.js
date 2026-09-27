import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  loadReceivableAmountPolicy,
  parseAmountPolicy,
  requireNewReceivableAmounts,
  validateReceivableAmounts,
} from './receivableAmountPolicy'

function demoPolicy(overrides = {}) {
  return {
    demoEnabled: true,
    tokenSymbol: 'mKRW',
    tokenDecimals: 0,
    minAmount: '1',
    maxFaceValue: '1000',
    maxFundingAmount: '1000',
    suggestedFaceValue: '100',
    suggestedFundingAmount: '90',
    ...overrides,
  }
}

function response(value, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

afterEach(() => {
  vi.unstubAllGlobals()
  localStorage.clear()
})

describe('receivable amount policy', () => {
  it('accepts both integer limits and rejects an amount one unit over each independent cap', () => {
    const policy = parseAmountPolicy(demoPolicy({ maxFundingAmount: '900' }))
    expect(validateReceivableAmounts({ faceValue: '1', fundingAmount: '1' }, policy)).toEqual({
      faceValue: '1',
      fundingAmount: '1',
    })
    expect(validateReceivableAmounts({ faceValue: '1000', fundingAmount: '900' }, policy)).toEqual({
      faceValue: '1000',
      fundingAmount: '900',
    })
    for (const amounts of [
      { faceValue: '1001', fundingAmount: '900' },
      { faceValue: '1000', fundingAmount: '901' },
    ]) {
      expect(() => validateReceivableAmounts(amounts, policy)).toThrowError(
        expect.objectContaining({ code: 'DEMO_RECEIVABLE_AMOUNT_LIMIT_EXCEEDED' }),
      )
    }
  })

  it('never allows funding to exceed face value, including outside demo mode', () => {
    const policy = parseAmountPolicy(
      demoPolicy({ demoEnabled: false, maxFaceValue: null, maxFundingAmount: null }),
    )
    expect(() =>
      validateReceivableAmounts({ faceValue: '100', fundingAmount: '101' }, policy),
    ).toThrowError(expect.objectContaining({ code: 'INVALID_FUNDING_AMOUNT' }))
    expect(
      validateReceivableAmounts({ faceValue: '1000000', fundingAmount: '950000' }, policy),
    ).toEqual({ faceValue: '1000000', fundingAmount: '950000' })
  })

  it('compares decimal strings beyond 2^53 without rounding adjacent integers', () => {
    const max = '9007199254740992'
    const policy = parseAmountPolicy(demoPolicy({ maxFaceValue: max, maxFundingAmount: max }))
    expect(validateReceivableAmounts({ faceValue: max, fundingAmount: max }, policy)).toEqual({
      faceValue: max,
      fundingAmount: max,
    })
    expect(() =>
      validateReceivableAmounts({ faceValue: '9007199254740993', fundingAmount: max }, policy),
    ).toThrowError(expect.objectContaining({ code: 'DEMO_RECEIVABLE_AMOUNT_LIMIT_EXCEEDED' }))
    expect(() =>
      validateReceivableAmounts({ faceValue: max, fundingAmount: '9007199254740993' }, policy),
    ).toThrowError(expect.objectContaining({ code: 'INVALID_FUNDING_AMOUNT' }))
  })

  it.each(['0', '-1', '01', '1.5', '1e3', '1,000', ' 1', '', 1, Number.MAX_SAFE_INTEGER + 1])(
    'rejects noncanonical or numeric input %s before BigInt conversion',
    (value) => {
      const policy = parseAmountPolicy(demoPolicy())
      expect(() =>
        validateReceivableAmounts({ faceValue: value, fundingAmount: '1' }, policy),
      ).toThrowError(expect.objectContaining({ code: 'INVALID_RECEIVABLE_AMOUNT' }))
      expect(() =>
        validateReceivableAmounts({ faceValue: '1000', fundingAmount: value }, policy),
      ).toThrowError(expect.objectContaining({ code: 'INVALID_RECEIVABLE_AMOUNT' }))
    },
  )

  it.each([
    undefined,
    null,
    {},
    demoPolicy({ demoEnabled: 'true' }),
    demoPolicy({ tokenSymbol: 'KRW' }),
    demoPolicy({ tokenDecimals: 18 }),
    demoPolicy({ minAmount: '0' }),
    demoPolicy({ maxFaceValue: null }),
    demoPolicy({ maxFundingAmount: '1001' }),
    demoPolicy({ maxFaceValue: Number.MAX_SAFE_INTEGER + 1 }),
    demoPolicy({ suggestedFaceValue: '1001' }),
    demoPolicy({ suggestedFundingAmount: '101' }),
    demoPolicy({ demoEnabled: false }),
  ])('fails closed for an invalid server policy %#', (value) => {
    expect(() => parseAmountPolicy(value)).toThrowError(
      expect.objectContaining({ code: 'INVALID_AMOUNT_POLICY' }),
    )
  })

  it('loads the policy with existing authentication and no-store on every new action', async () => {
    localStorage.setItem('accessToken', 'amount-policy-test-token')
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(response(demoPolicy()))
      .mockResolvedValueOnce(response(demoPolicy({ maxFaceValue: '500', maxFundingAmount: '500' })))
    vi.stubGlobal('fetch', fetchMock)

    await requireNewReceivableAmounts({ faceValue: '900', fundingAmount: '800' })
    await expect(
      requireNewReceivableAmounts({ faceValue: '900', fundingAmount: '800' }),
    ).rejects.toMatchObject({ code: 'DEMO_RECEIVABLE_AMOUNT_LIMIT_EXCEEDED' })
    expect(fetchMock).toHaveBeenCalledTimes(2)
    for (const [url, options] of fetchMock.mock.calls) {
      expect(url).toMatch(/\/receivables\/amount-policy$/)
      expect(options.cache).toBe('no-store')
      expect(options.headers.get('Authorization')).toBe('Bearer amount-policy-test-token')
      expect(options.body).toBeUndefined()
    }
  })

  it('propagates authentication and network failures without a permissive fallback', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(response({ code: 'AUTHENTICATION_REQUIRED', message: 'Login' }, 401))
      .mockRejectedValueOnce(new TypeError('network unavailable'))
    vi.stubGlobal('fetch', fetchMock)
    await expect(loadReceivableAmountPolicy()).rejects.toMatchObject({
      status: 401,
      code: 'AUTHENTICATION_REQUIRED',
    })
    await expect(
      requireNewReceivableAmounts({ faceValue: '1', fundingAmount: '1' }),
    ).rejects.toMatchObject({ code: 'NETWORK_ERROR' })
  })
})
