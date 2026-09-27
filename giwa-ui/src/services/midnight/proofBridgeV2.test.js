import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  acknowledgePolicyProofResultV2,
  normalizePolicyProofInputV2,
  parseProofSessionStatusV2,
  recoverPolicyProofResultV2,
  requestPolicyProofChallengeV2,
  submitPolicyProofAuthorizationV2,
} from './proofBridgeV2'

const SESSION_ID = `0x${'1'.repeat(64)}`
const REQUEST_ID = `0x${'2'.repeat(64)}`
const PARTY = `0x${'3'.repeat(40)}`
const FUNDER = `0x${'4'.repeat(40)}`

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

function proofInput() {
  return {
    version: 2,
    onchainReceivableId: '2',
    subjectRole: 'SELLER',
    annualRevenueKrw: '700000000',
    debtRatioBps: '17525',
    overdueCount: '0',
    policyRequest: {
      requestId: REQUEST_ID,
      intendedFunderWallet: FUNDER,
      minAnnualRevenueKrw: '500000000',
      maxDebtRatioBps: '20000',
      maxOverdueCount: '1',
      validUntil: '1800000600',
    },
  }
}

function authorizationRequest(overrides = {}) {
  return {
    version: 2,
    domain: { name: 'GASOK Mock Attestation', version: '2', chainId: '91342' },
    primaryType: 'GASOKRoleAttestationAuthorization',
    types: { GASOKRoleAttestationAuthorization: FIELDS },
    message: {
      purpose: 'Authorize GASOK local mock financial attestation for a Funder policy request',
      authorizationId: `0x${'5'.repeat(64)}`,
      midnightContractAddress: '0x12caaf76aef1de1c584b67462018810f6e4e7eb2535e136f560cb621e24a3f36',
      receivableFinanceAddress: '0x0f264334f98ba0d22f7fc6bb901a5fa36158a315',
      onchainReceivableId: '2',
      subjectRole: 'SELLER',
      partyWallet: PARTY,
      requestId: REQUEST_ID,
      intendedFunderWallet: FUNDER,
      minAnnualRevenueKrw: '500000000',
      maxDebtRatioBps: '20000',
      maxOverdueCount: '1',
      attestationRequestCommitment: `0x${'6'.repeat(64)}`,
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

function challengeResponse(overrides = {}) {
  return {
    version: 2,
    sessionId: SESSION_ID,
    expiresAt: '1800000120',
    authorizationRequest: authorizationRequest(),
    ...overrides,
  }
}

function capability(overrides = {}) {
  return {
    version: 2,
    evaluationVersion: 2,
    midnightContractAddress: '12caaf76aef1de1c584b67462018810f6e4e7eb2535e136f560cb621e24a3f36',
    companyCommitment: `0x${'8'.repeat(64)}`,
    lookupKey: `0x${'9'.repeat(64)}`,
    policyRequestHash: `0x${'a'.repeat(64)}`,
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
    profileAsOf: '1799999990',
    validUntil: '1800000600',
    ...overrides,
  }
}

function jsonResponse(value, status) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

describe('Proof Bridge v2 request-bound policy wire', () => {
  beforeEach(() => vi.setSystemTime(new Date(1_800_000_010_000)))
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('normalizes exact policy and private facts without a PIN field', () => {
    const normalized = normalizePolicyProofInputV2(proofInput())
    expect(normalized.policyRequest.requestId).toBe(REQUEST_ID)
    expect(normalized.debtRatioBps).toBe('17525')
    expect(normalized).not.toHaveProperty('secretPin')
    expect(() => normalizePolicyProofInputV2({ ...proofInput(), secretPin: '1234' })).toThrow(
      'v2 필드',
    )
    expect(() =>
      normalizePolicyProofInputV2({
        ...proofInput(),
        policyRequest: { ...proofInput().policyRequest, validUntil: '1800000010' },
      }),
    ).toThrow('만료')
  })

  it('posts the exact challenge with no cookies and binds the full authorization response', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(challengeResponse(), 201))
    vi.stubGlobal('fetch', fetchMock)

    const challenge = await requestPolicyProofChallengeV2(proofInput())

    expect(challenge.sessionId).toBe(SESSION_ID)
    const [url, options] = fetchMock.mock.calls[0]
    expect(url).toBe('/midnight-proof/v2/proof-sessions/challenge')
    expect(options.credentials).toBe('omit')
    expect(JSON.parse(options.body)).toEqual(proofInput())
    expect(options.body).not.toContain('secretPin')
  })

  it('rejects a challenge whose policy threshold or Funder audience differs', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse(
        challengeResponse({
          authorizationRequest: authorizationRequest({ maxDebtRatioBps: '19999' }),
        }),
        201,
      ),
    )
    vi.stubGlobal('fetch', fetchMock)
    await expect(requestPolicyProofChallengeV2(proofInput())).rejects.toThrow(
      '선택한 요청과 일치하지 않습니다',
    )
  })

  it('marks an interrupted authorization submission as status-only recovery', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('connection reset')))
    await expect(
      submitPolicyProofAuthorizationV2(SESSION_ID, {
        version: 2,
        authorizationId: `0x${'5'.repeat(64)}`,
        typedDataHash: `0x${'c'.repeat(64)}`,
        signer: PARTY,
        signature: `0x${'d'.repeat(130)}`,
      }),
    ).rejects.toMatchObject({ requestMayHaveSucceeded: true })
  })

  it('parses only the exact internal capability v2 at complete status', () => {
    const parsed = parseProofSessionStatusV2(
      { version: 2, sessionId: SESSION_ID, status: 'complete', proofCapability: capability() },
      SESSION_ID,
    )
    expect(parsed.proofCapability.requestId).toBe(REQUEST_ID)
    expect(parsed.proofCapability.midnightContractAddress).toBe(
      '12caaf76aef1de1c584b67462018810f6e4e7eb2535e136f560cb621e24a3f36',
    )
    expect(() =>
      parseProofSessionStatusV2(
        {
          version: 2,
          sessionId: SESSION_ID,
          status: 'complete',
          proofCapability: { ...capability(), rawAnnualRevenueKrw: '700000000' },
        },
        SESSION_ID,
      ),
    ).toThrow('검증 결과 전달 형식')
    expect(() =>
      parseProofSessionStatusV2(
        {
          version: 2,
          sessionId: SESSION_ID,
          status: 'complete',
          proofCapability: capability({
            midnightContractAddress:
              '0x12caaf76aef1de1c584b67462018810f6e4e7eb2535e136f560cb621e24a3f36',
          }),
        },
        SESSION_ID,
      ),
    ).toThrow('계약 주소 형식')
    expect(() =>
      parseProofSessionStatusV2(
        {
          version: 2,
          sessionId: SESSION_ID,
          status: 'complete',
          proofCapability: capability({ midnightContractAddress: 'f'.repeat(64) }),
        },
        SESSION_ID,
      ),
    ).toThrow('승인된 v2 계약 문맥')
  })

  it('recovers a finalized result by exact request body and rejects another request binding', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        jsonResponse(
          { version: 2, sessionId: SESSION_ID, status: 'complete', proofCapability: capability() },
          200,
        ),
      )
    vi.stubGlobal('fetch', fetchMock)

    const recovered = await recoverPolicyProofResultV2(REQUEST_ID)
    expect(recovered.proofCapability.requestId).toBe(REQUEST_ID)
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
      version: 2,
      requestId: REQUEST_ID,
    })

    fetchMock.mockResolvedValueOnce(
      jsonResponse(
        {
          version: 2,
          sessionId: SESSION_ID,
          status: 'complete',
          proofCapability: capability({ requestId: `0x${'e'.repeat(64)}` }),
        },
        200,
      ),
    )
    await expect(recoverPolicyProofResultV2(REQUEST_ID)).rejects.toThrow('선택한 요청과 일치')
  })

  it('acknowledges by exact session/request body and treats response loss as retryable ACK only', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({ version: 2, sessionId: SESSION_ID, status: 'acknowledged' }, 200),
      )
      .mockRejectedValueOnce(new TypeError('connection reset'))
    vi.stubGlobal('fetch', fetchMock)

    await expect(acknowledgePolicyProofResultV2(SESSION_ID, REQUEST_ID)).resolves.toEqual({
      version: 2,
      sessionId: SESSION_ID,
      status: 'acknowledged',
    })
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
      version: 2,
      sessionId: SESSION_ID,
      requestId: REQUEST_ID,
    })
    await expect(acknowledgePolicyProofResultV2(SESSION_ID, REQUEST_ID)).rejects.toMatchObject({
      requestMayHaveSucceeded: true,
    })
  })
  it.each([
    [
      'truncated JSON',
      () => new Response('{', { status: 202, headers: { 'Content-Type': 'application/json' } }),
    ],
    [
      'wrong session',
      () =>
        jsonResponse({ version: 2, sessionId: `0x${'f'.repeat(64)}`, status: 'attesting' }, 202),
    ],
    [
      'wrong schema',
      () =>
        jsonResponse({ version: 2, sessionId: SESSION_ID, status: 'attesting', extra: true }, 202),
    ],
    [
      'oversized body',
      () =>
        new Response('x'.repeat(65537), {
          status: 202,
          headers: { 'Content-Type': 'application/json' },
        }),
    ],
  ])('preserves uncertain prove acceptance after %s', async (_name, response) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response()))
    await expect(
      submitPolicyProofAuthorizationV2(SESSION_ID, {
        version: 2,
        authorizationId: `0x${'5'.repeat(64)}`,
        typedDataHash: `0x${'c'.repeat(64)}`,
        signer: PARTY,
        signature: `0x${'d'.repeat(130)}`,
      }),
    ).rejects.toMatchObject({ requestMayHaveSucceeded: true })
  })
})
