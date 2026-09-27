import { defineComponent, nextTick } from 'vue'
import { mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { setAuthSessionToken } from '../services/authSession'
import { useMidnightProofMailbox } from './useMidnightProofMailbox'

function deferred() {
  let resolve
  const promise = new Promise((resolvePromise) => {
    resolve = resolvePromise
  })
  return { promise, resolve }
}

function summary(role = 'SELLER', suffix = '1') {
  return {
    requestId: `0x${suffix.repeat(64)}`,
    subjectRole: role,
    status: 'REQUESTED',
  }
}

function services(overrides = {}) {
  return {
    list: vi.fn().mockResolvedValue([]),
    create: vi.fn((_, policy) =>
      Promise.resolve(summary(policy.subjectRole, policy.subjectRole === 'SELLER' ? '1' : '2')),
    ),
    deny: vi.fn(),
    resolve: vi.fn(),
    ...overrides,
  }
}

function mountMailbox(scope, serviceOverrides = {}, pollIntervalMs = 100) {
  const serviceSet = services(serviceOverrides)
  const wrapper = mount(
    defineComponent({
      setup() {
        return {
          mailbox: useMidnightProofMailbox(scope, {
            services: serviceSet,
            pollIntervalMs,
          }),
        }
      },
      template: '<div />',
    }),
  )
  return { wrapper, serviceSet, mailbox: wrapper.vm.mailbox }
}

async function flush() {
  await Promise.resolve()
  await nextTick()
  await Promise.resolve()
}

describe('Midnight request mailbox polling and mutations', () => {
  afterEach(() => vi.useRealTimers())

  it('never overlaps automatic polls and ignores a late response after unmount', async () => {
    vi.useFakeTimers()
    const first = deferred()
    const { wrapper, serviceSet, mailbox } = mountMailbox('assigned', {
      list: vi.fn().mockReturnValue(first.promise),
    })
    await flush()
    expect(serviceSet.list).toHaveBeenCalledTimes(1)

    await vi.advanceTimersByTimeAsync(500)
    expect(serviceSet.list).toHaveBeenCalledTimes(1)

    wrapper.unmount()
    first.resolve([summary()])
    await flush()
    expect(mailbox.requests.value).toEqual([])
  })

  it('creates independent Seller and Buyer requests sequentially with the same criteria', async () => {
    const { wrapper, serviceSet, mailbox } = mountMailbox('requested')
    await flush()

    const created = await mailbox.createRequests(5, ['SELLER', 'BUYER'], {
      minAnnualRevenueKrw: '500000000',
      maxDebtRatioBps: '20000',
      maxOverdueCount: '1',
      validForSeconds: 86400,
    })

    expect(created.map((item) => item.subjectRole)).toEqual(['SELLER', 'BUYER'])
    expect(serviceSet.create).toHaveBeenNthCalledWith(
      1,
      5,
      {
        subjectRole: 'SELLER',
        minAnnualRevenueKrw: '500000000',
        maxDebtRatioBps: '20000',
        maxOverdueCount: '1',
        validForSeconds: 86400,
      },
      expect.any(Object),
    )
    expect(serviceSet.create).toHaveBeenNthCalledWith(
      2,
      5,
      expect.objectContaining({ subjectRole: 'BUYER' }),
      expect.any(Object),
    )
    expect(mailbox.requests.value).toHaveLength(2)
    wrapper.unmount()
  })

  it('does not let an older mailbox response erase a request created while it was in flight', async () => {
    const staleList = deferred()
    const { wrapper, mailbox } = mountMailbox('requested', {
      list: vi.fn().mockReturnValue(staleList.promise),
    })
    await flush()

    await mailbox.createRequests(5, ['SELLER'], {
      minAnnualRevenueKrw: '500000000',
      maxDebtRatioBps: '20000',
      maxOverdueCount: '1',
      validForSeconds: 86400,
    })
    staleList.resolve([])
    await flush()

    expect(mailbox.requests.value).toHaveLength(1)
    expect(mailbox.requests.value[0].subjectRole).toBe('SELLER')
    wrapper.unmount()
  })

  it('keeps submitted, denied, expired, and completed statuses separate instead of deriving eligibility', async () => {
    const statuses = ['SUBMITTED', 'DENIED', 'EXPIRED', 'COMPLETED'].map((status, index) => ({
      ...summary('SELLER', String(index + 1)),
      status,
    }))
    const { wrapper, mailbox } = mountMailbox('requested', {
      list: vi.fn().mockResolvedValue(statuses),
    })
    await flush()
    expect(mailbox.requests.value.map((item) => item.status)).toEqual([
      'SUBMITTED',
      'DENIED',
      'EXPIRED',
      'COMPLETED',
    ])
    wrapper.unmount()
  })

  it('automatically resolves at most one submitted request per bounded requested-mailbox poll', async () => {
    const submitted = [summary('SELLER', '1'), summary('BUYER', '2')].map((item) => ({
      ...item,
      status: 'SUBMITTED',
    }))
    const resolution = { ...submitted[0], result: { eligible: true } }
    const { wrapper, serviceSet, mailbox } = mountMailbox('requested', {
      list: vi.fn().mockResolvedValue(submitted),
      resolve: vi.fn().mockResolvedValue(resolution),
    })
    await mailbox.refresh()
    await flush()

    expect(serviceSet.resolve).toHaveBeenCalledTimes(1)
    expect(serviceSet.resolve).toHaveBeenCalledWith(submitted[0].requestId, expect.any(Object))
    expect(mailbox.requests.value.map((item) => item.status)).toEqual(['COMPLETED', 'SUBMITTED'])
    expect(mailbox.resolutions.value[submitted[0].requestId]).toBe(resolution)
    wrapper.unmount()
  })

  it('keeps a 503-style automatic resolve failure quiet and preserves SUBMITTED', async () => {
    const submitted = [{ ...summary(), status: 'SUBMITTED' }]
    const unavailable = Object.assign(new Error('read api unavailable'), { status: 503 })
    const { wrapper, serviceSet, mailbox } = mountMailbox('requested', {
      list: vi.fn().mockResolvedValue(submitted),
      resolve: vi.fn().mockRejectedValue(unavailable),
    })
    await flush()

    expect(serviceSet.resolve).toHaveBeenCalledTimes(1)
    expect(mailbox.requests.value[0].status).toBe('SUBMITTED')
    expect(mailbox.errorMessage.value).toBe('')
    wrapper.unmount()
  })
  it.each(['unmount', 'account change'])('stops a two-role batch after %s', async (event) => {
    const first = deferred()
    const { wrapper, serviceSet, mailbox } = mountMailbox('requested', {
      create: vi.fn().mockReturnValue(first.promise),
    })
    await flush()
    const pending = mailbox
      .createRequests(5, ['SELLER', 'BUYER'], {
        minAnnualRevenueKrw: '500000000',
        maxDebtRatioBps: '20000',
        maxOverdueCount: '1',
        validForSeconds: 86400,
      })
      .catch(() => null)
    if (event === 'unmount') wrapper.unmount()
    else setAuthSessionToken('next-account')
    first.resolve(summary())
    await pending
    expect(serviceSet.create).toHaveBeenCalledTimes(1)
    expect(mailbox.requests.value).toEqual([])
    wrapper.unmount()
    setAuthSessionToken(null)
  })

  it('rejects a result for another policy and keeps the request uncompleted', async () => {
    const request = summary()
    const { wrapper, mailbox } = mountMailbox('requested', {
      list: vi.fn().mockResolvedValue([request]),
      resolve: vi
        .fn()
        .mockResolvedValue({ ...request, subjectRole: 'BUYER', result: { eligible: true } }),
    })
    await mailbox.refresh()
    await expect(mailbox.resolve(request.requestId)).rejects.toThrow('일치하지')
    expect(mailbox.resolutions.value).toEqual({})
    expect(mailbox.requests.value[0].status).toBe('REQUESTED')
    wrapper.unmount()
  })

  it('discards a late result after the authenticated account changes', async () => {
    const pending = deferred()
    const request = summary()
    const { wrapper, mailbox } = mountMailbox('requested', {
      list: vi.fn().mockResolvedValue([request]),
      resolve: vi.fn().mockReturnValue(pending.promise),
    })
    await mailbox.refresh()
    const resolution = mailbox.resolve(request.requestId).catch(() => null)
    setAuthSessionToken('next-account')
    pending.resolve({ ...request, result: { eligible: true } })
    await resolution
    expect(mailbox.resolutions.value).toEqual({})
    expect(mailbox.requests.value).toEqual([])
    wrapper.unmount()
    setAuthSessionToken(null)
  })
})
