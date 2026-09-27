import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('./config', () => ({
  isMidnightDemoEnabled: true,
  midnightProofConfig: { apiUrl: 'https://demo.example/midnight-proof' },
}))

const REQUEST = `0x${'1'.repeat(64)}`
const SESSION = `0x${'2'.repeat(64)}`
const CONTRACT = 'a'.repeat(64)
const PARTY = `0x${'3'.repeat(40)}`
const FUNDER = `0x${'4'.repeat(40)}`
const fields = [
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

function config(overrides = {}) {
  return {
    mode: 'hosted-demo',
    networkId: 'preview',
    contractAddress: CONTRACT,
    profiles: [{ id: 'stable-company', label: '가상 기업', summary: '준비된 가상 재무 시나리오' }],
    runtime: { status: 'ready' },
    provider: { name: 'Midnight Demo Attestation', attestationType: 'mock' },
    ...overrides,
  }
}
function request() {
  return {
    requestId: REQUEST,
    onchainReceivableId: '1',
    subjectRole: 'SELLER',
    partyWallet: PARTY,
    intendedFunderWallet: FUNDER,
    minAnnualRevenueKrw: '500000000',
    maxDebtRatioBps: '20000',
    maxOverdueCount: '1',
    validUntil: '1800000600',
  }
}
function challenge(overrides = {}) {
  const { validUntil, ...context } = request()
  return {
    version: 2,
    sessionId: SESSION,
    expiresAt: '1800000120',
    authorizationRequest: {
      version: 2,
      domain: { name: 'GASOK Mock Attestation', version: '2', chainId: '91342' },
      primaryType: 'GASOKRoleAttestationAuthorization',
      types: { GASOKRoleAttestationAuthorization: fields },
      message: {
        purpose: 'Authorize GASOK local mock financial attestation for a Funder policy request',
        authorizationId: `0x${'5'.repeat(64)}`,
        midnightContractAddress: `0x${CONTRACT}`,
        receivableFinanceAddress: '0x0f264334f98ba0d22f7fc6bb901a5fa36158a315',
        ...context,
        attestationRequestCommitment: `0x${'6'.repeat(64)}`,
        providerId: '2',
        evaluationVersion: '2',
        profileAsOf: '1800000000',
        policyValidUntil: validUntil,
        issuedAt: '1800000000',
        expiresAt: '1800000120',
        ...overrides,
      },
    },
  }
}
function json(value, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

describe('hosted synthetic demo boundary', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.setSystemTime(new Date(1_800_000_010_000))
    localStorage.setItem('accessToken', 'demo-login-token')
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
    localStorage.clear()
  })

  it('sends only the selected fixture and request ID with authentication', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(json(config()))
      .mockResolvedValueOnce(json(challenge(), 201))
    vi.stubGlobal('fetch', fetcher)
    const { requestPolicyProofChallengeV2 } = await import('./proofBridgeV2')
    const result = await requestPolicyProofChallengeV2(
      { version: 2, requestId: REQUEST, profileId: 'stable-company' },
      { request: request() },
    )
    expect(result.sessionId).toBe(SESSION)
    expect(fetcher.mock.calls[1][0]).toBe(
      'https://demo.example/midnight-proof/v2/proof-sessions/challenge',
    )
    const options = fetcher.mock.calls[1][1]
    expect(JSON.parse(options.body)).toEqual({
      version: 2,
      requestId: REQUEST,
      profileId: 'stable-company',
    })
    expect(options.headers.Authorization).toBe('Bearer demo-login-token')
    expect(options.credentials).toBe('omit')
  })

  it('rejects arbitrary financial input instead of forwarding it to a hosted provider', async () => {
    const fetcher = vi.fn()
    vi.stubGlobal('fetch', fetcher)
    const { requestPolicyProofChallengeV2 } = await import('./proofBridgeV2')
    await expect(
      requestPolicyProofChallengeV2(
        { version: 2, requestId: REQUEST, profileId: 'stable-company', annualRevenueKrw: '100' },
        { request: request() },
      ),
    ).rejects.toThrow()
    expect(fetcher).not.toHaveBeenCalled()
  })

  it.each([
    { midnightContractAddress: `0x${'b'.repeat(64)}` },
    { partyWallet: `0x${'7'.repeat(40)}` },
    { maxDebtRatioBps: '21000' },
  ])(
    'rejects a signature challenge outside the loaded deployment and selected request: %j',
    async (override) => {
      vi.stubGlobal(
        'fetch',
        vi
          .fn()
          .mockResolvedValueOnce(json(config()))
          .mockResolvedValueOnce(json(challenge(override), 201)),
      )
      const { requestPolicyProofChallengeV2 } = await import('./proofBridgeV2')
      await expect(
        requestPolicyProofChallengeV2(
          { version: 2, requestId: REQUEST, profileId: 'stable-company' },
          { request: request() },
        ),
      ).rejects.toThrow()
    },
  )

  it('binds status reads to request ownership and stops after logout', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(json(config()))
      .mockResolvedValueOnce(
        json({ version: 2, sessionId: SESSION, status: 'proving_and_submitting' }),
      )
    vi.stubGlobal('fetch', fetcher)
    const { readPolicyProofSessionStatusV2 } = await import('./proofBridgeV2')
    await readPolicyProofSessionStatusV2(SESSION, { requestId: REQUEST })
    expect(JSON.parse(fetcher.mock.calls[1][1].body)).toEqual({
      version: 2,
      sessionId: SESSION,
      requestId: REQUEST,
    })
    localStorage.clear()
    await expect(readPolicyProofSessionStatusV2(SESSION, { requestId: REQUEST })).rejects.toThrow()
    expect(fetcher).toHaveBeenCalledTimes(2)
  })

  it('does not trust a Preprod configuration or a ready configuration without a contract', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(json(config({ networkId: 'preprod' })))
      .mockResolvedValueOnce(json(config({ contractAddress: null })))
    vi.stubGlobal('fetch', fetcher)
    const { loadMidnightDemoConfig, approvedMidnightContractAddress } =
      await import('./demoRuntime')
    await expect(loadMidnightDemoConfig()).rejects.toThrow()
    await expect(loadMidnightDemoConfig()).rejects.toThrow()
    expect(approvedMidnightContractAddress).toThrow()
  })
  it.each([true, false])(
    'accepts a hosted Provider 2 result with eligible=%s',
    async (eligible) => {
      const { parseMidnightProofResolution } = await import('./proofRequests')
      const value = {
        ...request(),
        receivableId: 5,
        status: 'COMPLETED',
        result: {
          eligible,
          providerId: '2',
          evaluationVersion: 2,
          profileAsOf: '1800000000',
          validUntil: request().validUntil,
        },
      }
      expect(parseMidnightProofResolution(value).result.eligible).toBe(eligible)
    },
  )

  it('rejects hosted Provider 1 results that do not prove the promised role consent', async () => {
    const { parseMidnightProofResolution } = await import('./proofRequests')
    const value = {
      ...request(),
      receivableId: 5,
      status: 'COMPLETED',
      result: {
        eligible: true,
        providerId: '1',
        evaluationVersion: 2,
        profileAsOf: '1800000000',
        validUntil: request().validUntil,
      },
    }
    expect(() => parseMidnightProofResolution(value)).toThrow('Provider 2')
  })

  it('discards a hosted challenge returned after the account changes', async () => {
    let complete
    const pending = new Promise((resolve) => {
      complete = resolve
    })
    const fetcher = vi.fn().mockResolvedValueOnce(json(config())).mockReturnValueOnce(pending)
    vi.stubGlobal('fetch', fetcher)
    const { requestPolicyProofChallengeV2 } = await import('./proofBridgeV2')
    const check = expect(
      requestPolicyProofChallengeV2(
        { version: 2, requestId: REQUEST, profileId: 'stable-company' },
        { request: request() },
      ),
    ).rejects.toThrow()
    for (let i = 0; i < 20 && fetcher.mock.calls.length < 2; i += 1) await Promise.resolve()
    expect(fetcher).toHaveBeenCalledTimes(2)
    const { setAuthSessionToken } = await import('../authSession')
    setAuthSessionToken('new-company')
    complete(json(challenge(), 201))
    await check
  })
})
