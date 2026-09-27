import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  assertResolutionMatchesRequest,
  completeMidnightProofRequest,
  createMidnightProofRequest,
  listMidnightProofRequests,
  parseMidnightProofResolution,
  parseMidnightProofRequestSummary,
  resolveMidnightProofRequest,
} from './proofRequests'

const REQUEST_ID = `0x${'1'.repeat(64)}`
const PARTY = `0x${'2'.repeat(40)}`
const FUNDER = `0x${'3'.repeat(40)}`

function summary(overrides = {}) {
  return {
    requestId: REQUEST_ID,
    receivableId: 5,
    onchainReceivableId: '2',
    subjectRole: 'SELLER',
    requesterCompanyName: 'Funder Co',
    subjectCompanyName: 'Seller Co',
    partyWallet: PARTY,
    intendedFunderWallet: FUNDER,
    minAnnualRevenueKrw: '500000000',
    maxDebtRatioBps: '20000',
    maxOverdueCount: '1',
    validUntil: '1800000000',
    status: 'REQUESTED',
    createdAt: '2026-08-19T00:00:00Z',
    updatedAt: '2026-08-19T00:00:00Z',
    ...overrides,
  }
}

function resolution(overrides = {}) {
  const context = { ...summary() }
  for (const field of ['requesterCompanyName', 'subjectCompanyName', 'createdAt', 'updatedAt'])
    delete context[field]
  return {
    ...context,
    status: 'COMPLETED',
    result: {
      eligible: false,
      providerId: '2',
      evaluationVersion: 2,
      profileAsOf: '1799999900',
      validUntil: '1800000000',
    },
    ...overrides,
  }
}

function capability() {
  return {
    version: 2,
    evaluationVersion: 2,
    midnightContractAddress: '12caaf76aef1de1c584b67462018810f6e4e7eb2535e136f560cb621e24a3f36',
    companyCommitment: `0x${'5'.repeat(64)}`,
    lookupKey: `0x${'6'.repeat(64)}`,
    policyRequestHash: `0x${'7'.repeat(64)}`,
    giwaChainId: '91342',
    receivableFinanceAddress: '0x0f264334f98ba0d22f7fc6bb901a5fa36158a315',
    onchainReceivableId: '2',
    subjectRole: 'SELLER',
    partyWallet: PARTY,
    requestId: REQUEST_ID,
    intendedFunderWallet: FUNDER,
    minAnnualRevenueKrw: '500000000',
    maxDebtRatioBps: '20000',
    maxOverdueCount: '1',
    profileAsOf: '1799999900',
    validUntil: '1800000000',
  }
}

function jsonResponse(value, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

describe('Midnight proof request Spring contract', () => {
  beforeEach(() => {
    localStorage.setItem('accessToken', 'jwt-token')
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    localStorage.clear()
  })

  it('creates an authenticated policy request with percent already converted to bps', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(summary(), 201))
    vi.stubGlobal('fetch', fetchMock)

    await createMidnightProofRequest(5, {
      subjectRole: 'SELLER',
      minAnnualRevenueKrw: '500000000',
      maxDebtRatioBps: '20000',
      maxOverdueCount: '1',
      validForSeconds: 86400,
    })

    const [url, options] = fetchMock.mock.calls[0]
    expect(url).toBe('http://localhost:8080/receivables/5/midnight-proof-requests')
    expect(options.method).toBe('POST')
    expect(options.headers.get('Authorization')).toBe('Bearer jwt-token')
    expect(JSON.parse(options.body)).toEqual({
      subjectRole: 'SELLER',
      minAnnualRevenueKrw: '500000000',
      maxDebtRatioBps: '20000',
      maxOverdueCount: '1',
      validForSeconds: 86400,
    })
    await expect(
      createMidnightProofRequest(5, {
        subjectRole: 'SELLER',
        minAnnualRevenueKrw: '500000000',
        maxDebtRatioBps: '20000',
        maxOverdueCount: '1',
        validForSeconds: 86401,
      }),
    ).rejects.toThrow('유효시간')
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('loads only the authenticated requested or assigned mailbox scopes', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse([summary()]))
    vi.stubGlobal('fetch', fetchMock)

    const result = await listMidnightProofRequests('assigned')

    expect(result).toHaveLength(1)
    expect(fetchMock.mock.calls[0][0]).toBe(
      'http://localhost:8080/midnight-proof-requests?scope=assigned',
    )
    await expect(listMidnightProofRequests('all')).rejects.toThrow('범위')
  })

  it('rejects extra capability material in a request summary', () => {
    expect(() =>
      parseMidnightProofRequestSummary({ ...summary(), lookupKey: `0x${'9'.repeat(64)}` }),
    ).toThrow('요약 필드')
    expect(parseMidnightProofRequestSummary(summary({ status: 'SUBMITTED' })).status).toBe(
      'SUBMITTED',
    )
  })

  it('delivers the internal v2 capability automatically without accepting extra fields', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(summary({ status: 'SUBMITTED' })))
    vi.stubGlobal('fetch', fetchMock)

    const completed = await completeMidnightProofRequest(REQUEST_ID, capability())

    const [, options] = fetchMock.mock.calls[0]
    expect(JSON.parse(options.body)).toEqual({ proofCapability: capability() })
    expect(completed.status).toBe('SUBMITTED')
    await expect(
      completeMidnightProofRequest(REQUEST_ID, { ...capability(), signature: 'secret' }),
    ).rejects.toThrow('검증 결과 전달 형식')
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('parses only the sanitized combined result and rejects non-completed or leaked responses', async () => {
    const resolution = {
      requestId: REQUEST_ID,
      receivableId: 5,
      onchainReceivableId: '2',
      subjectRole: 'SELLER',
      partyWallet: PARTY,
      intendedFunderWallet: FUNDER,
      status: 'COMPLETED',
      minAnnualRevenueKrw: '500000000',
      maxDebtRatioBps: '20000',
      maxOverdueCount: '1',
      validUntil: '1800000000',
      result: {
        eligible: false,
        providerId: '2',
        evaluationVersion: 2,
        profileAsOf: '1799999900',
        validUntil: '1800000000',
      },
    }
    expect(parseMidnightProofResolution(resolution).result.eligible).toBe(false)
    expect(() => parseMidnightProofResolution({ ...resolution, status: 'REQUESTED' })).toThrow(
      '완료되지 않은',
    )
    expect(() =>
      parseMidnightProofResolution({ ...resolution, companyCommitment: `0x${'a'.repeat(64)}` }),
    ).toThrow('공개 검증 결과 필드')

    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(resolution))
    vi.stubGlobal('fetch', fetchMock)
    await resolveMidnightProofRequest(REQUEST_ID)
    expect(fetchMock.mock.calls[0][0]).toContain(`/midnight-proof-requests/${REQUEST_ID}/resolve`)
    expect(fetchMock.mock.calls[0][1].body).toBeUndefined()
  })
  it('rejects a sanitized response for another request ID', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(jsonResponse(resolution({ requestId: `0x${'9'.repeat(64)}` }))),
    )
    await expect(resolveMidnightProofRequest(REQUEST_ID)).rejects.toThrow('다른 요청')
  })

  it.each([
    ['requestId', `0x${'9'.repeat(64)}`],
    ['receivableId', 6],
    ['onchainReceivableId', '3'],
    ['subjectRole', 'BUYER'],
    ['partyWallet', FUNDER],
    ['intendedFunderWallet', PARTY],
    ['minAnnualRevenueKrw', '1'],
    ['maxDebtRatioBps', '1'],
    ['maxOverdueCount', '0'],
    ['validUntil', '1800000001'],
  ])('rejects result context drift in %s', (field, value) => {
    expect(() => assertResolutionMatchesRequest(resolution({ [field]: value }), summary())).toThrow(
      '일치하지',
    )
  })

  it('retains legacy development Provider 1 compatibility', () => {
    const value = resolution()
    value.result.providerId = '1'
    expect(parseMidnightProofResolution(value).result).toMatchObject({
      providerId: '1',
      eligible: false,
    })
    expect(() => assertResolutionMatchesRequest(value, summary())).not.toThrow()
  })
})
