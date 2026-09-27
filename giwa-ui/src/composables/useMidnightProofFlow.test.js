import { defineComponent, h } from 'vue'
import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  debtRatioPercentToBps,
  formatAnnualRevenueInput,
  normalizeAnnualRevenueInput,
  useMidnightProofFlow,
} from './useMidnightProofFlow'
import {
  makeAuthorizationRequest,
  makeAuthorizationResponse,
  makeProofCapability,
  makeResolvedEligibility,
  SESSION_ID,
} from '../test/midnightFixtures'

function deferred() {
  let resolve
  let reject
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}

function makeChallenge() {
  const authorizationRequest = makeAuthorizationRequest()
  return {
    version: 1,
    sessionId: SESSION_ID,
    expiresAt: authorizationRequest.message.expiresAt,
    authorizationRequest,
  }
}

function mountFlow(overrides = {}) {
  let flow
  const wrapper = mount(
    defineComponent({
      setup() {
        flow = useMidnightProofFlow({
          requestProofChallenge: vi.fn().mockResolvedValue(makeChallenge()),
          signRoleAuthorization: vi.fn().mockResolvedValue(makeAuthorizationResponse()),
          submitProofAuthorization: vi
            .fn()
            .mockResolvedValue({ version: 1, sessionId: SESSION_ID, status: 'attesting' }),
          readProofSessionStatus: vi.fn().mockResolvedValue({
            version: 1,
            sessionId: SESSION_ID,
            status: 'indexing',
          }),
          cancelProofSession: vi.fn().mockResolvedValue({
            version: 1,
            sessionId: SESSION_ID,
            status: 'cancelled',
          }),
          resolveEligibilityCapability: vi.fn().mockResolvedValue(makeResolvedEligibility()),
          ...overrides,
        })
        return () => h('div')
      },
    }),
  )
  return { wrapper, flow }
}

function fillValidInput(flow) {
  flow.setProofSubjectContext({ onchainReceivableId: '1', subjectRole: 'SELLER' })
  flow.annualRevenueKrw.value = '500,000,000'
  flow.debtRatioPercent.value = '200'
  flow.overdueCount.value = '1'
  flow.secretPin.value = '1234'
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-08-17T08:00:00.000Z'))
})

afterEach(() => {
  vi.useRealTimers()
})

describe('useMidnightProofFlow', () => {
  it('clears every private input immediately after challenge and waits for a separate sign action', async () => {
    const signRoleAuthorization = vi.fn()
    const { wrapper, flow } = mountFlow({ signRoleAuthorization })
    fillValidInput(flow)

    await flow.requestChallenge()

    expect(flow.phase.value).toBe('awaiting_signature')
    expect(flow.annualRevenueKrw.value).toBe('')
    expect(flow.debtRatioPercent.value).toBe('')
    expect(flow.overdueCount.value).toBe('')
    expect(flow.secretPin.value).toBe('')
    expect(flow.authorizationRequest.value.message.partyWallet).toMatch(/^0x/)
    expect(signRoleAuthorization).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('keeps every private input when the signing-request step fails', async () => {
    const requestProofChallenge = vi.fn().mockRejectedValue(
      Object.assign(new Error('다른 로컬 증명 세션이 진행 중입니다.'), {
        code: 'PROOF_SESSION_BUSY',
      }),
    )
    const { wrapper, flow } = mountFlow({ requestProofChallenge })
    fillValidInput(flow)

    await flow.requestChallenge()

    expect(flow.phase.value).toBe('editing')
    expect(flow.failedAt.value).toBe('challenge')
    expect(flow.errorCode.value).toBe('PROOF_SESSION_BUSY')
    expect(flow.annualRevenueKrw.value).toBe('500,000,000')
    expect(flow.debtRatioPercent.value).toBe('200')
    expect(flow.overdueCount.value).toBe('1')
    expect(flow.secretPin.value).toBe('1234')
    wrapper.unmount()
  })

  it('checks status after an ambiguous prove response instead of resubmitting proof', async () => {
    const submitProofAuthorization = vi.fn().mockRejectedValue(
      Object.assign(new Error('응답 시간이 초과되었습니다.'), {
        code: 'MIDNIGHT_PROOF_BRIDGE_TIMEOUT',
        requestMayHaveSucceeded: true,
      }),
    )
    const readProofSessionStatus = vi.fn().mockResolvedValue({
      version: 1,
      sessionId: SESSION_ID,
      status: 'attesting',
    })
    const { wrapper, flow } = mountFlow({
      submitProofAuthorization,
      readProofSessionStatus,
    })
    fillValidInput(flow)
    await flow.requestChallenge()

    await flow.authorizeAndProve()

    expect(submitProofAuthorization).toHaveBeenCalledOnce()
    expect(readProofSessionStatus).toHaveBeenCalledOnce()
    expect(flow.phase.value).toBe('attesting')
    wrapper.unmount()
  })

  it('explicitly cancels an awaiting-authorization recovery session before returning to input', async () => {
    const submitProofAuthorization = vi.fn().mockRejectedValue(
      Object.assign(new Error('응답 시간이 초과되었습니다.'), {
        code: 'MIDNIGHT_PROOF_BRIDGE_TIMEOUT',
        requestMayHaveSucceeded: true,
      }),
    )
    const readProofSessionStatus = vi.fn().mockResolvedValue({
      version: 1,
      sessionId: SESSION_ID,
      status: 'awaiting_authorization',
    })
    const cancelProofSession = vi.fn().mockResolvedValue({
      version: 1,
      sessionId: SESSION_ID,
      status: 'cancelled',
    })
    const { wrapper, flow } = mountFlow({
      submitProofAuthorization,
      readProofSessionStatus,
      cancelProofSession,
    })
    fillValidInput(flow)
    await flow.requestChallenge()

    await flow.authorizeAndProve()

    expect(flow.phase.value).toBe('proof_unknown')
    expect(flow.canCancelAwaitingSession.value).toBe(true)
    expect(submitProofAuthorization).toHaveBeenCalledOnce()

    await flow.cancelAwaitingSessionAndReset()

    expect(cancelProofSession).toHaveBeenCalledOnce()
    expect(flow.phase.value).toBe('editing')
    expect(flow.canCancelAwaitingSession.value).toBe(false)
    expect(submitProofAuthorization).toHaveBeenCalledOnce()
    wrapper.unmount()
  })

  it('turns a missing status session into a terminal resettable error without polling forever', async () => {
    const readProofSessionStatus = vi.fn().mockRejectedValue(
      Object.assign(new Error('로컬 증명 세션을 찾지 못했습니다.'), {
        code: 'PROOF_SESSION_NOT_FOUND',
      }),
    )
    const { wrapper, flow } = mountFlow({ readProofSessionStatus })
    fillValidInput(flow)
    await flow.requestChallenge()
    await flow.authorizeAndProve()

    await vi.advanceTimersByTimeAsync(1_500)
    await flushPromises()

    expect(flow.phase.value).toBe('error')
    expect(flow.errorCode.value).toBe('PROOF_SESSION_NOT_FOUND')
    expect(readProofSessionStatus).toHaveBeenCalledOnce()
    await vi.advanceTimersByTimeAsync(10_000)
    expect(readProofSessionStatus).toHaveBeenCalledOnce()
    wrapper.unmount()
  })

  it.each([
    { status: 'expired', expectedPhase: 'expired', expectedCode: 'PROOF_SESSION_EXPIRED' },
    { status: 'cancelled', expectedPhase: 'cancelled', expectedCode: '' },
  ])(
    'treats a $status session status as terminal',
    async ({ status, expectedPhase, expectedCode }) => {
      const readProofSessionStatus = vi.fn().mockResolvedValue({
        version: 1,
        sessionId: SESSION_ID,
        status,
      })
      const { wrapper, flow } = mountFlow({ readProofSessionStatus })
      fillValidInput(flow)
      await flow.requestChallenge()
      await flow.authorizeAndProve()

      await vi.advanceTimersByTimeAsync(1_500)
      await flushPromises()

      expect(flow.phase.value).toBe(expectedPhase)
      expect(flow.errorCode.value).toBe(expectedCode)
      expect(readProofSessionStatus).toHaveBeenCalledOnce()
      await vi.advanceTimersByTimeAsync(10_000)
      expect(readProofSessionStatus).toHaveBeenCalledOnce()
      wrapper.unmount()
    },
  )

  it('keeps a duplicate result as a dedicated terminal proof error', async () => {
    const readProofSessionStatus = vi.fn().mockResolvedValue({
      version: 1,
      sessionId: SESSION_ID,
      status: 'failed',
      error: {
        code: 'ELIGIBILITY_RESULT_ALREADY_EXISTS',
        message: '이 채권 역할의 적격성 결과가 이미 발급되어 새 증명을 만들 수 없습니다.',
      },
    })
    const { wrapper, flow } = mountFlow({ readProofSessionStatus })
    fillValidInput(flow)
    await flow.requestChallenge()
    await flow.authorizeAndProve()

    await vi.advanceTimersByTimeAsync(1_500)
    await flushPromises()

    expect(flow.phase.value).toBe('error')
    expect(flow.failedAt.value).toBe('proof')
    expect(flow.errorCode.value).toBe('ELIGIBILITY_RESULT_ALREADY_EXISTS')
    expect(flow.shareableCapabilityText.value).toBe('')
    wrapper.unmount()
  })

  it('polls sequentially, resolves the public capability, and treats ineligible as success', async () => {
    const readProofSessionStatus = vi.fn().mockResolvedValue({
      version: 1,
      sessionId: SESSION_ID,
      status: 'complete',
      proofCapability: makeProofCapability(),
    })
    const resolveEligibilityCapability = vi.fn().mockResolvedValue(makeResolvedEligibility(false))
    const { wrapper, flow } = mountFlow({
      readProofSessionStatus,
      resolveEligibilityCapability,
    })
    fillValidInput(flow)
    await flow.requestChallenge()
    await flow.authorizeAndProve()

    await vi.advanceTimersByTimeAsync(1_500)
    await flushPromises()

    expect(readProofSessionStatus).toHaveBeenCalledOnce()
    expect(resolveEligibilityCapability).toHaveBeenCalledOnce()
    expect(flow.phase.value).toBe('success')
    expect(flow.verification.value.result.eligible).toBe(false)
    expect(flow.shareableCapabilityText.value).toBe(JSON.stringify(makeProofCapability()))
    wrapper.unmount()
    expect(flow.shareableCapabilityText.value).toBe('')
  })

  it('normalizes comma revenue and exact UI percent into the canonical proof wire values', async () => {
    const requestProofChallenge = vi.fn().mockResolvedValue(makeChallenge())
    const { wrapper, flow } = mountFlow({ requestProofChallenge })
    fillValidInput(flow)
    flow.debtRatioPercent.value = '85.5'

    await flow.requestChallenge()

    expect(requestProofChallenge).toHaveBeenCalledWith(
      expect.objectContaining({
        annualRevenueKrw: '500000000',
        debtRatioBps: '8550',
      }),
      expect.any(Object),
    )
    wrapper.unmount()
  })

  it('retries only the public resolver after proof completion', async () => {
    const readProofSessionStatus = vi.fn().mockResolvedValue({
      version: 1,
      sessionId: SESSION_ID,
      status: 'complete',
      proofCapability: makeProofCapability(),
    })
    const resolveEligibilityCapability = vi
      .fn()
      .mockRejectedValueOnce(new Error('Indexer unavailable'))
      .mockResolvedValueOnce(makeResolvedEligibility())
    const submitProofAuthorization = vi
      .fn()
      .mockResolvedValue({ version: 1, sessionId: SESSION_ID, status: 'attesting' })
    const { wrapper, flow } = mountFlow({
      readProofSessionStatus,
      resolveEligibilityCapability,
      submitProofAuthorization,
    })
    fillValidInput(flow)
    await flow.requestChallenge()
    await flow.authorizeAndProve()
    await vi.advanceTimersByTimeAsync(1_500)
    await flushPromises()

    expect(flow.phase.value).toBe('error')
    expect(flow.failedAt.value).toBe('resolver')
    await flow.retryPublicResult()

    expect(flow.phase.value).toBe('success')
    expect(resolveEligibilityCapability).toHaveBeenCalledTimes(2)
    expect(submitProofAuthorization).toHaveBeenCalledOnce()
    wrapper.unmount()
  })

  it('rejects a complete capability that does not match the signed role context', async () => {
    const mismatchedCapability = { ...makeProofCapability(), subjectRole: 'BUYER' }
    const readProofSessionStatus = vi.fn().mockResolvedValue({
      version: 1,
      sessionId: SESSION_ID,
      status: 'complete',
      proofCapability: mismatchedCapability,
    })
    const resolveEligibilityCapability = vi.fn()
    const { wrapper, flow } = mountFlow({
      readProofSessionStatus,
      resolveEligibilityCapability,
    })
    fillValidInput(flow)
    await flow.requestChallenge()
    await flow.authorizeAndProve()
    await vi.advanceTimersByTimeAsync(1_500)
    await flushPromises()

    expect(flow.phase.value).toBe('error')
    expect(flow.errorCode.value).toBe('PROOF_CAPABILITY_CONTEXT_MISMATCH')
    expect(resolveEligibilityCapability).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('ignores a late MetaMask result after reset and never submits it', async () => {
    const pendingSignature = deferred()
    const submitProofAuthorization = vi.fn()
    const { wrapper, flow } = mountFlow({
      signRoleAuthorization: vi.fn().mockReturnValue(pendingSignature.promise),
      submitProofAuthorization,
    })
    fillValidInput(flow)
    await flow.requestChallenge()
    const signing = flow.authorizeAndProve()
    expect(flow.phase.value).toBe('signing')

    flow.resetFlow()
    pendingSignature.resolve(makeAuthorizationResponse())
    await signing

    expect(flow.phase.value).toBe('editing')
    expect(flow.onchainReceivableId.value).toBe('1')
    expect(flow.subjectRole.value).toBe('SELLER')
    expect(flow.shareableCapabilityText.value).toBe('')
    expect(submitProofAuthorization).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('ignores a double sign click and a late wallet result after unmount', async () => {
    const pendingSignature = deferred()
    const signRoleAuthorization = vi.fn().mockReturnValue(pendingSignature.promise)
    const submitProofAuthorization = vi.fn()
    const { wrapper, flow } = mountFlow({ signRoleAuthorization, submitProofAuthorization })
    fillValidInput(flow)
    await flow.requestChallenge()

    const first = flow.authorizeAndProve()
    const second = flow.authorizeAndProve()
    expect(signRoleAuthorization).toHaveBeenCalledOnce()
    wrapper.unmount()
    pendingSignature.resolve(makeAuthorizationResponse())
    await Promise.all([first, second])

    expect(submitProofAuthorization).not.toHaveBeenCalled()
  })
})

describe('proof input presentation conversion', () => {
  it('normalizes and formats annual revenue without changing its integer value', () => {
    expect(normalizeAnnualRevenueInput('18,446,744,073,709,551,615')).toBe('18446744073709551615')
    expect(formatAnnualRevenueInput('500000000')).toBe('500,000,000')
    expect(() => normalizeAnnualRevenueInput('50,00')).toThrow('쉼표 위치')
  })

  it('converts percent to bps exactly and rejects fractions beyond two decimal places', () => {
    expect(debtRatioPercentToBps('0')).toBe('0')
    expect(debtRatioPercentToBps('85.5')).toBe('8550')
    expect(debtRatioPercentToBps('200.00')).toBe('20000')
    expect(debtRatioPercentToBps('42949672.95')).toBe('4294967295')
    expect(() => debtRatioPercentToBps('85.555')).toThrow('소수 둘째 자리')
  })
})
