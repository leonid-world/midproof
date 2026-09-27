import { defineComponent, nextTick } from 'vue'
import { mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { setAuthSessionToken } from '../services/authSession'
import { useMidnightAssignedProof } from './useMidnightAssignedProof'
import { MidnightProofBridgeV2Error } from '../services/midnight/proofBridgeV2'

const REQUEST_ID = `0x${'1'.repeat(64)}`
const SESSION_ID = `0x${'2'.repeat(64)}`
const PARTY = `0x${'3'.repeat(40)}`
const FUNDER = `0x${'4'.repeat(40)}`

function request(overrides = {}) {
  return {
    requestId: REQUEST_ID,
    receivableId: 5,
    onchainReceivableId: '2',
    subjectRole: 'SELLER',
    partyWallet: PARTY,
    intendedFunderWallet: FUNDER,
    minAnnualRevenueKrw: '500000000',
    maxDebtRatioBps: '20000',
    maxOverdueCount: '1',
    validUntil: '1800000600',
    status: 'REQUESTED',
    ...overrides,
  }
}

function capability(overrides = {}) {
  return {
    version: 2,
    evaluationVersion: 2,
    requestId: REQUEST_ID,
    onchainReceivableId: '2',
    subjectRole: 'SELLER',
    partyWallet: PARTY,
    intendedFunderWallet: FUNDER,
    minAnnualRevenueKrw: '500000000',
    maxDebtRatioBps: '20000',
    maxOverdueCount: '1',
    validUntil: '1800000600',
    profileAsOf: '1800000000',
    ...overrides,
  }
}

function deferred() {
  let resolve
  let reject
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}

function mountFlow(services) {
  return mount(
    defineComponent({
      setup() {
        const flow = useMidnightAssignedProof({ services, pollIntervalMs: 1 })
        return { flow }
      },
      template: '<div />',
    }),
  )
}

function serviceMocks(overrides = {}) {
  return {
    challenge: vi.fn().mockResolvedValue({
      version: 2,
      sessionId: SESSION_ID,
      authorizationRequest: { version: 2 },
    }),
    sign: vi.fn().mockResolvedValue({ version: 2 }),
    submit: vi.fn().mockResolvedValue({ version: 2, sessionId: SESSION_ID, status: 'attesting' }),
    status: vi.fn().mockResolvedValue({
      version: 2,
      sessionId: SESSION_ID,
      status: 'complete',
      proofCapability: capability(),
    }),
    cancel: vi.fn().mockResolvedValue({ status: 'cancelled' }),
    recover: vi.fn().mockResolvedValue({
      version: 2,
      sessionId: SESSION_ID,
      status: 'complete',
      proofCapability: capability(),
    }),
    acknowledge: vi
      .fn()
      .mockResolvedValue({ version: 2, sessionId: SESSION_ID, status: 'acknowledged' }),
    complete: vi.fn().mockResolvedValue({ ...request(), status: 'SUBMITTED' }),
    ...overrides,
  }
}

async function flushPromises() {
  await Promise.resolve()
  await nextTick()
  await Promise.resolve()
}

describe('request-bound issuer proof reliability', () => {
  beforeEach(() => {
    vi.setSystemTime(new Date(1_800_000_010_000))
    setAuthSessionToken('company-a')
  })
  afterEach(() => {
    setAuthSessionToken(null)
    vi.useRealTimers()
  })

  it('clears all browser financial refs immediately after challenge before wallet signing', async () => {
    const sign = deferred()
    let challengeInput
    const services = serviceMocks({
      challenge: vi.fn((input) => {
        challengeInput = structuredClone(input)
        return Promise.resolve({
          version: 2,
          sessionId: SESSION_ID,
          authorizationRequest: { version: 2 },
        })
      }),
      sign: vi.fn(() => sign.promise),
    })
    const wrapper = mountFlow(services)
    const flow = wrapper.vm.flow
    flow.privateFacts.annualRevenueKrw = '700000000'
    flow.privateFacts.debtRatioPercent = '175.25'
    flow.privateFacts.overdueCount = '0'

    const proofPromise = flow.prove(request())
    await flushPromises()

    expect(challengeInput).toEqual(
      expect.objectContaining({
        annualRevenueKrw: '700000000',
        debtRatioBps: '17525',
        overdueCount: '0',
        policyRequest: expect.objectContaining({ requestId: REQUEST_ID }),
      }),
    )
    expect(services.challenge.mock.calls[0][0]).toEqual(
      expect.objectContaining({ annualRevenueKrw: '', debtRatioBps: '', overdueCount: '' }),
    )
    expect(flow.privateFacts).toEqual({
      annualRevenueKrw: '',
      debtRatioPercent: '',
      overdueCount: '',
    })
    expect(flow.stage.value).toBe('signing')

    sign.resolve({ version: 2 })
    await proofPromise
    expect(flow.stage.value).toBe('submitted')
    wrapper.unmount()
  })

  it('retries only Spring delivery after a lost complete response and never repeats proof', async () => {
    const services = serviceMocks({
      complete: vi
        .fn()
        .mockRejectedValueOnce(new Error('network response lost'))
        .mockResolvedValueOnce({ ...request(), status: 'SUBMITTED' }),
    })
    const wrapper = mountFlow(services)
    const flow = wrapper.vm.flow
    Object.assign(flow.privateFacts, {
      annualRevenueKrw: '700000000',
      debtRatioPercent: '175.25',
      overdueCount: '0',
    })

    await expect(flow.prove(request())).rejects.toThrow('network response lost')
    expect(flow.stage.value).toBe('unknown')
    expect(flow.hasPendingDelivery.value).toBe(true)

    await flow.retryDelivery(request())

    expect(services.challenge).toHaveBeenCalledTimes(1)
    expect(services.sign).toHaveBeenCalledTimes(1)
    expect(services.submit).toHaveBeenCalledTimes(1)
    expect(services.status).toHaveBeenCalledTimes(1)
    expect(services.complete).toHaveBeenCalledTimes(2)
    expect(services.acknowledge).toHaveBeenCalledTimes(1)
    expect(flow.stage.value).toBe('submitted')
    expect(flow.hasPendingDelivery.value).toBe(false)
    wrapper.unmount()
  })

  it('turns a status outage into same-session recovery without another sign or submit', async () => {
    const services = serviceMocks({
      status: vi.fn().mockRejectedValueOnce(new Error('status 502')).mockResolvedValueOnce({
        version: 2,
        sessionId: SESSION_ID,
        status: 'complete',
        proofCapability: capability(),
      }),
    })
    const wrapper = mountFlow(services)
    const flow = wrapper.vm.flow
    Object.assign(flow.privateFacts, {
      annualRevenueKrw: '700000000',
      debtRatioPercent: '175.25',
      overdueCount: '0',
    })

    await expect(flow.prove(request())).rejects.toThrow('status 502')
    expect(flow.stage.value).toBe('unknown')
    expect(flow.hasPendingStatus.value).toBe(true)

    await flow.resumeStatus(request())

    expect(services.challenge).toHaveBeenCalledTimes(1)
    expect(services.sign).toHaveBeenCalledTimes(1)
    expect(services.submit).toHaveBeenCalledTimes(1)
    expect(services.status).toHaveBeenCalledTimes(2)
    expect(services.complete).toHaveBeenCalledTimes(1)
    expect(services.acknowledge).toHaveBeenCalledTimes(1)
    expect(flow.stage.value).toBe('submitted')
    wrapper.unmount()
  })

  it('locks a durably submitted request against another proof run', async () => {
    const services = serviceMocks()
    const wrapper = mountFlow(services)
    const flow = wrapper.vm.flow
    Object.assign(flow.privateFacts, {
      annualRevenueKrw: '700000000',
      debtRatioPercent: '175.25',
      overdueCount: '0',
    })

    await flow.prove(request())
    await expect(flow.prove(request())).rejects.toThrow('현재 검증 흐름')

    expect(services.challenge).toHaveBeenCalledTimes(1)
    expect(services.sign).toHaveBeenCalledTimes(1)
    expect(services.submit).toHaveBeenCalledTimes(1)
    expect(services.complete).toHaveBeenCalledTimes(1)
    wrapper.unmount()
  })

  it('rejects a completed capability for another request before Spring delivery', async () => {
    const services = serviceMocks({
      status: vi.fn().mockResolvedValue({
        version: 2,
        sessionId: SESSION_ID,
        status: 'complete',
        proofCapability: capability({ requestId: `0x${'f'.repeat(64)}` }),
      }),
    })
    const wrapper = mountFlow(services)
    const flow = wrapper.vm.flow
    Object.assign(flow.privateFacts, {
      annualRevenueKrw: '700000000',
      debtRatioPercent: '175.25',
      overdueCount: '0',
    })

    await expect(flow.prove(request())).rejects.toThrow('문맥과 일치하지 않습니다')
    expect(services.complete).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('recovers a durable Bridge result after tab restart without another challenge, signature or proof', async () => {
    const services = serviceMocks()
    const wrapper = mountFlow(services)
    const flow = wrapper.vm.flow

    await flow.recoverDurableDelivery(request())

    expect(services.recover).toHaveBeenCalledWith(
      REQUEST_ID,
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    )
    expect(services.complete).toHaveBeenCalledWith(
      REQUEST_ID,
      capability(),
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    )
    expect(services.acknowledge).toHaveBeenCalledWith(
      SESSION_ID,
      REQUEST_ID,
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    )
    expect(services.challenge).not.toHaveBeenCalled()
    expect(services.sign).not.toHaveBeenCalled()
    expect(services.submit).not.toHaveBeenCalled()
    expect(flow.stage.value).toBe('submitted')
    wrapper.unmount()
  })

  it('retries only durable recovery and ACK after an ACK response loss', async () => {
    const services = serviceMocks({
      acknowledge: vi
        .fn()
        .mockRejectedValueOnce(new Error('ack response lost'))
        .mockResolvedValueOnce({ version: 2, sessionId: SESSION_ID, status: 'acknowledged' }),
    })
    const wrapper = mountFlow(services)
    const flow = wrapper.vm.flow
    Object.assign(flow.privateFacts, {
      annualRevenueKrw: '700000000',
      debtRatioPercent: '175.25',
      overdueCount: '0',
    })

    await expect(flow.prove(request())).rejects.toThrow('ack response lost')
    expect(flow.stage.value).toBe('unknown')

    await flow.recoverDurableDelivery(request({ status: 'SUBMITTED' }))

    expect(services.challenge).toHaveBeenCalledTimes(1)
    expect(services.sign).toHaveBeenCalledTimes(1)
    expect(services.submit).toHaveBeenCalledTimes(1)
    expect(services.recover).toHaveBeenCalledTimes(1)
    expect(services.complete).toHaveBeenCalledTimes(2)
    expect(services.acknowledge).toHaveBeenCalledTimes(2)
    expect(flow.stage.value).toBe('submitted')
    wrapper.unmount()
  })

  it('treats an already-acknowledged SUBMITTED request as delivered when no outbox result remains', async () => {
    const services = serviceMocks({
      recover: vi
        .fn()
        .mockRejectedValue(
          new MidnightProofBridgeV2Error(
            'PROOF_RESULT_NOT_FOUND',
            '복구할 완료 증명이 로컬 Proof Bridge에 없습니다.',
          ),
        ),
    })
    const wrapper = mountFlow(services)
    const flow = wrapper.vm.flow

    await expect(
      flow.recoverDurableDelivery(request({ status: 'SUBMITTED' })),
    ).resolves.toMatchObject({
      status: 'SUBMITTED',
    })

    expect(services.complete).not.toHaveBeenCalled()
    expect(services.acknowledge).not.toHaveBeenCalled()
    expect(flow.stage.value).toBe('submitted')
    wrapper.unmount()
  })

  it('releases an expired in-progress reservation so the same tab can safely start again', async () => {
    const services = serviceMocks({
      recover: vi
        .fn()
        .mockRejectedValueOnce(
          new MidnightProofBridgeV2Error(
            'PROOF_RESULT_IN_PROGRESS',
            '기존 증명이 아직 처리 중일 수 있습니다.',
          ),
        )
        .mockRejectedValueOnce(
          new MidnightProofBridgeV2Error(
            'PROOF_RESULT_NOT_FOUND',
            '복구할 완료 증명이 로컬 Proof Bridge에 없습니다.',
          ),
        ),
    })
    const wrapper = mountFlow(services)
    const flow = wrapper.vm.flow

    await expect(flow.recoverDurableDelivery(request())).rejects.toMatchObject({
      code: 'PROOF_RESULT_IN_PROGRESS',
    })
    expect(flow.stage.value).toBe('unknown')
    expect(flow.hasPendingDelivery.value).toBe(true)

    await expect(flow.retryDelivery(request())).resolves.toBeNull()
    expect(flow.stage.value).toBe('idle')
    expect(flow.errorMessage.value).toBe('')
    expect(flow.statusMessage.value).toBe('')
    expect(flow.hasPendingDelivery.value).toBe(false)
    expect(flow.hasPendingStatus.value).toBe(false)

    Object.assign(flow.privateFacts, {
      annualRevenueKrw: '700000000',
      debtRatioPercent: '175.25',
      overdueCount: '0',
    })
    await flow.prove(request())

    expect(services.recover).toHaveBeenCalledTimes(2)
    expect(services.challenge).toHaveBeenCalledTimes(1)
    expect(services.sign).toHaveBeenCalledTimes(1)
    expect(services.submit).toHaveBeenCalledTimes(1)
    expect(flow.stage.value).toBe('submitted')
    wrapper.unmount()
  })
  it.each(['sign', 'complete'])('stops the old account flow while waiting for %s', async (step) => {
    const pending = deferred()
    const services = serviceMocks({ [step]: vi.fn().mockReturnValue(pending.promise) })
    const wrapper = mountFlow(services)
    const flow = wrapper.vm.flow
    Object.assign(flow.privateFacts, {
      annualRevenueKrw: '700000000',
      debtRatioPercent: '175.25',
      overdueCount: '0',
    })
    const proof = flow.prove(request())
    for (let i = 0; i < 20 && services[step].mock.calls.length === 0; i += 1) await flushPromises()
    expect(services[step]).toHaveBeenCalledTimes(1)
    setAuthSessionToken('company-b')
    pending.resolve(step === 'sign' ? { version: 2 } : { ...request(), status: 'SUBMITTED' })
    await expect(proof).resolves.toBeNull()
    expect(flow.stage.value).toBe('idle')
    expect(flow.hasPendingDelivery.value).toBe(false)
    expect(flow.hasPendingStatus.value).toBe(false)
    if (step === 'sign') expect(services.submit).not.toHaveBeenCalled()
    expect(services.acknowledge).not.toHaveBeenCalled()
    wrapper.unmount()
    setAuthSessionToken(null)
  })

  it('settles a pending polling wait when the account logs out', async () => {
    vi.useFakeTimers()
    const services = serviceMocks({ status: vi.fn().mockResolvedValue({ status: 'indexing' }) })
    const wrapper = mountFlow(services)
    const flow = wrapper.vm.flow
    Object.assign(flow.privateFacts, {
      annualRevenueKrw: '700000000',
      debtRatioPercent: '175.25',
      overdueCount: '0',
    })
    const proof = flow.prove(request())
    for (let i = 0; i < 20 && services.status.mock.calls.length === 0; i += 1) await flushPromises()
    await flushPromises()
    setAuthSessionToken(null)
    await expect(proof).resolves.toBeNull()
    expect(services.status).toHaveBeenCalledTimes(1)
    expect(vi.getTimerCount()).toBe(0)
    wrapper.unmount()
  })
})
