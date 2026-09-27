import { beforeEach, describe, expect, it, vi } from 'vitest'
import { apiRequest } from '../api'
import { demoRunRequest, parseDemoRun, loadWalletlessConfig } from './walletlessDemo'
vi.mock('../api', () => ({ apiRequest: vi.fn() }))
function runFixture(overrides = {}) {
  return {
    version: 2,
    runId: `0x${'a'.repeat(64)}`,
    requestId: `0x${'b'.repeat(64)}`,
    clientRequestId: '12c4c994-2608-4a88-a4fb-3197ec07e571',
    profileId: 'steady',
    subjectRole: 'SELLER',
    status: 'proving',
    networkId: 'undeployed',
    midnightContractAddress: 'c'.repeat(64),
    giwaChainId: '31337',
    receivableFinanceAddress: `0x${'d'.repeat(40)}`,
    onchainReceivableId: '1',
    partyWallet: `0x${'e'.repeat(40)}`,
    intendedFunderWallet: `0x${'f'.repeat(40)}`,
    minAnnualRevenueKrw: '500000000',
    maxDebtRatioBps: '20000',
    maxOverdueCount: '1',
    validUntil: String(Math.floor(Date.now() / 1000) + 3600),
    ...overrides,
  }
}
const config = { networkId: 'undeployed', contractAddress: 'c'.repeat(64) }
describe('walletless demo public result boundary', () => {
  beforeEach(() => vi.mocked(apiRequest).mockReset())
  it.each([true, false])(
    'accepts independently resolved eligibility %s with exact requested context',
    (eligible) => {
      const fixture = runFixture()
      const result = {
        eligible,
        providerId: 2,
        evaluationVersion: 2,
        profileAsOf: String(Math.floor(Date.now() / 1000)),
        validUntil: fixture.validUntil,
      }
      expect(
        parseDemoRun({ ...fixture, status: 'completed', result }, { config }).result.eligible,
      ).toBe(eligible)
    },
  )
  it.each([
    'networkId',
    'midnightContractAddress',
    'subjectRole',
    'profileId',
    'clientRequestId',
    'requestId',
  ])('rejects changed %s context', (field) => {
    const fixture = runFixture()
    expect(() =>
      parseDemoRun(fixture, { config, expected: { ...fixture, [field]: 'other' } }),
    ).toThrow()
  })
  it('never turns a failed/uncertain run or unverified response into a boolean result', () => {
    expect(() => parseDemoRun(runFixture({ status: 'completed' }), { config })).toThrow()
    expect(
      parseDemoRun(runFixture({ status: 'failed', result: { eligible: false } }), { config }),
    ).not.toHaveProperty('result')
    expect(
      parseDemoRun(
        runFixture({
          status: 'uncertain',
          proofCapability: 'private',
          annualRevenueKrw: 'private',
        }),
        { config },
      ),
    ).not.toHaveProperty('proofCapability')
  })
  it('uses body-only authenticated bounded requests and latest-session recovery', async () => {
    vi.mocked(apiRequest).mockResolvedValue(runFixture())
    await demoRunRequest('recover', {}, { config })
    expect(apiRequest).toHaveBeenCalledWith(
      '/midnight-proof/v2/demo-runs/recover',
      expect.objectContaining({
        method: 'POST',
        body: { version: 2 },
        timeoutMs: 10000,
        maxResponseBytes: 65536,
      }),
    )
  })
  it('accepts local manifest config only in this isolated walletless parser', async () => {
    vi.mocked(apiRequest).mockResolvedValue({
      ...config,
      mode: 'hosted-demo',
      runtime: { status: 'ready' },
      walletlessDemo: { enabled: true },
      profiles: [{ id: 'steady', label: '가상 기업 A', summary: '기준 충족 사례' }],
    })
    expect((await loadWalletlessConfig()).networkId).toBe('undeployed')
    vi.mocked(apiRequest).mockResolvedValue({
      ...config,
      mode: 'hosted-demo',
      networkId: 'mainnet',
      runtime: { status: 'ready' },
      walletlessDemo: { enabled: true },
      profiles: [],
    })
    await expect(loadWalletlessConfig()).rejects.toThrow()
  })
})
