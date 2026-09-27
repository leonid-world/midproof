import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { assertAuthorizationV2IsCurrent, parseAuthorizationRequestV2 } from './roleAuthorizationV2'

const FIELDS = [
  ['purpose', 'string'],
  ['authorizationId', 'bytes32'],
  ['midnightContractAddress', 'bytes32'],
  ['receivableFinanceAddress', 'address'],
  ['onchainReceivableId', 'uint256'],
  ['subjectRole', 'string'],
  ['partyWallet', 'address'],
  ['requestId', 'bytes32'],
  ['intendedFunderWallet', 'address'],
  ['minAnnualRevenueKrw', 'uint64'],
  ['maxDebtRatioBps', 'uint32'],
  ['maxOverdueCount', 'uint16'],
  ['attestationRequestCommitment', 'bytes32'],
  ['providerId', 'uint16'],
  ['evaluationVersion', 'uint16'],
  ['profileAsOf', 'uint64'],
  ['policyValidUntil', 'uint64'],
  ['issuedAt', 'uint64'],
  ['expiresAt', 'uint64'],
].map(([name, type]) => ({ name, type }))

function authorizationRequest(overrides = {}) {
  return {
    version: 2,
    domain: { name: 'GASOK Mock Attestation', version: '2', chainId: '91342' },
    primaryType: 'GASOKRoleAttestationAuthorization',
    types: { GASOKRoleAttestationAuthorization: FIELDS },
    message: {
      purpose: 'Authorize GASOK local mock financial attestation for a Funder policy request',
      authorizationId: `0x${'1'.repeat(64)}`,
      midnightContractAddress: '0x12caaf76aef1de1c584b67462018810f6e4e7eb2535e136f560cb621e24a3f36',
      receivableFinanceAddress: '0x0f264334f98ba0d22f7fc6bb901a5fa36158a315',
      onchainReceivableId: '2',
      subjectRole: 'SELLER',
      partyWallet: `0x${'2'.repeat(40)}`,
      requestId: `0x${'3'.repeat(64)}`,
      intendedFunderWallet: `0x${'4'.repeat(40)}`,
      minAnnualRevenueKrw: '500000000',
      maxDebtRatioBps: '20000',
      maxOverdueCount: '1',
      attestationRequestCommitment: `0x${'5'.repeat(64)}`,
      providerId: '2',
      evaluationVersion: '2',
      profileAsOf: '1800000000',
      policyValidUntil: '1800000600',
      issuedAt: '1800000000',
      expiresAt: '1800000120',
      ...overrides,
    },
  }
}

describe('role authorization v2 policy binding', () => {
  beforeEach(() => vi.setSystemTime(new Date(1_800_000_010_000)))
  afterEach(() => vi.useRealTimers())

  it('accepts only the exact ordered v2 EIP-712 policy request', () => {
    const parsed = parseAuthorizationRequestV2(authorizationRequest())
    expect(parsed.version).toBe(2)
    expect(parsed.message.requestId).toBe(`0x${'3'.repeat(64)}`)
    expect(parsed.message.minAnnualRevenueKrw).toBe('500000000')
    expect(parsed.message.maxDebtRatioBps).toBe('20000')
  })

  it('rejects v1, reordered fields, extra messages, and an unexpected provider', () => {
    expect(() => parseAuthorizationRequestV2({ ...authorizationRequest(), version: 1 })).toThrow(
      'v2',
    )
    expect(() =>
      parseAuthorizationRequestV2({
        ...authorizationRequest(),
        types: {
          GASOKRoleAttestationAuthorization: [...FIELDS].reverse(),
        },
      }),
    ).toThrow('순서')
    expect(() =>
      parseAuthorizationRequestV2({
        ...authorizationRequest(),
        message: { ...authorizationRequest().message, rawAnnualRevenue: '500000000' },
      }),
    ).toThrow('message 필드')
    expect(() =>
      parseAuthorizationRequestV2(
        authorizationRequest({ providerId: '1', evaluationVersion: '2' }),
      ),
    ).toThrow('Provider 2')
  })

  it('distinguishes the policy deadline from the short wallet-signature deadline', () => {
    const expiredPolicy = parseAuthorizationRequestV2(
      authorizationRequest({ policyValidUntil: '1800000011', expiresAt: '1800000011' }),
    )
    expect(() => assertAuthorizationV2IsCurrent(expiredPolicy, 1_800_000_012_000)).toThrow(
      'Funder의 검증 요청',
    )
    expect(() => assertAuthorizationV2IsCurrent(expiredPolicy, 1_800_000_011_000)).toThrow(
      'Funder의 검증 요청',
    )
    expect(() =>
      parseAuthorizationRequestV2(authorizationRequest({ profileAsOf: '1799999999' })),
    ).toThrow('유효시간 관계')
  })
})
