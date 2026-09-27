import { reactive, ref } from 'vue'
import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import MidnightAssignedRequestsView from './MidnightAssignedRequestsView.vue'

const state = vi.hoisted(() => ({ mailbox: null, proof: null, receivables: null }))

vi.mock('vue-router', () => ({ useRoute: () => ({ query: {} }) }))
vi.mock('../composables/useMidnightProofMailbox', () => ({
  useMidnightProofMailbox: () => state.mailbox,
}))
vi.mock('../composables/useMidnightAssignedProof', () => ({
  useMidnightAssignedProof: () => state.proof,
}))
vi.mock('../stores/receivable', () => ({ useReceivableStore: () => state.receivables }))

const REQUEST_ID = `0x${'1'.repeat(64)}`

function assignedRequest(overrides = {}) {
  return {
    requestId: REQUEST_ID,
    receivableId: 5,
    onchainReceivableId: '2',
    subjectRole: 'SELLER',
    requesterCompanyName: 'Funder Co',
    subjectCompanyName: 'Seller Co',
    partyWallet: `0x${'2'.repeat(40)}`,
    intendedFunderWallet: `0x${'3'.repeat(40)}`,
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

function mountView() {
  return mount(MidnightAssignedRequestsView, {
    global: { stubs: { RouterLink: { template: '<a><slot /></a>' } } },
  })
}

describe('Seller/Buyer assigned policy request view', () => {
  afterEach(() => vi.useRealTimers())
  beforeEach(() => {
    state.mailbox = {
      requests: ref([assignedRequest()]),
      isLoading: ref(false),
      isRefreshing: ref(false),
      isMutating: ref(false),
      errorMessage: ref(''),
      successMessage: ref(''),
      refresh: vi.fn().mockResolvedValue([assignedRequest()]),
      deny: vi.fn().mockResolvedValue(assignedRequest({ status: 'DENIED' })),
    }
    state.proof = {
      privateFacts: reactive({ annualRevenueKrw: '', debtRatioPercent: '', overdueCount: '' }),
      stage: ref('idle'),
      errorMessage: ref(''),
      statusMessage: ref(''),
      activeRequestId: ref(''),
      hasPendingDelivery: ref(false),
      hasPendingStatus: ref(false),
      prove: vi.fn().mockResolvedValue(assignedRequest({ status: 'COMPLETED' })),
      recoverDurableDelivery: vi.fn().mockResolvedValue(null),
      retryDelivery: vi.fn(),
      resumeStatus: vi.fn(),
      cancel: vi.fn(),
      reset: vi.fn(),
    }
    state.receivables = reactive({
      receivables: [{ receivableId: 5, tokenId: '2' }],
      loadAll: vi.fn().mockResolvedValue(),
    })
  })

  it('shows requester, DB/onchain/NFT context, exact criteria and expiry before consent', async () => {
    const wrapper = mountView()
    await flushPromises()
    const text = wrapper.text()

    expect(text).toContain('Funder Co의 검증 요청')
    expect(text).toContain('DB 채권')
    expect(text).toContain('온체인 채권')
    expect(text).toContain('NFT Token ID')
    expect(text).toContain('500,000,000 KRW 이상')
    expect(text).toContain('200% 이하')
    expect(text).toContain('1건 이하')
    expect(text).toContain('응답 기한')
    expect(text).toContain('MetaMask 서명에는 가스비가 들지 않습니다')
    expect(text).not.toMatch(/Proof capability|clipboard|PIN|JSON/i)
    expect(wrapper.findAll('textarea')).toHaveLength(0)
    expect(wrapper.findAll('input[type="file"]')).toHaveLength(0)
    expect(state.proof.recoverDurableDelivery).toHaveBeenCalledWith(
      expect.objectContaining({ requestId: REQUEST_ID }),
    )
  })

  it('passes only the selected public request to the proof composable and keeps facts local', async () => {
    const wrapper = mountView()
    await flushPromises()
    const inputs = wrapper.findAll('.private-form input')
    await inputs[0].setValue('700000000')
    await inputs[1].setValue('175.25')
    await inputs[2].setValue('0')
    await wrapper.find('.private-form').trigger('submit')

    expect(state.proof.prove).toHaveBeenCalledWith(
      expect.objectContaining({ requestId: REQUEST_ID }),
    )
    expect(state.mailbox).not.toHaveProperty('privateFacts')
    expect(localStorage.getItem('annualRevenueKrw')).toBeNull()
  })

  it('requires a deliberate second click before denying', async () => {
    const wrapper = mountView()
    await flushPromises()
    const deny = wrapper.find('.danger-button')
    await deny.trigger('click')
    expect(state.mailbox.deny).not.toHaveBeenCalled()
    expect(deny.text()).toContain('한 번 더')
    await deny.trigger('click')
    expect(state.mailbox.deny).toHaveBeenCalledWith(REQUEST_ID)
  })

  it('shows durable SUBMITTED as sync-pending and never renders another private input form', async () => {
    state.mailbox.requests.value = [assignedRequest({ status: 'SUBMITTED' })]
    const wrapper = mountView()
    await flushPromises()

    expect(wrapper.text()).toContain('증명 제출을 완료했습니다')
    expect(wrapper.text()).toContain('재증명은 필요하지 않습니다')
    expect(wrapper.find('.private-form').exists()).toBe(false)
  })

  it('hides the response form immediately after local durable submission even before mailbox refresh', async () => {
    state.proof.stage.value = 'submitted'
    state.proof.activeRequestId.value = REQUEST_ID
    state.proof.statusMessage.value = '증명 제출을 완료했습니다.'
    const wrapper = mountView()
    await flushPromises()

    expect(wrapper.find('.private-form').exists()).toBe(false)
    expect(wrapper.text()).toContain('증명 제출 완료 · 공개 결과 동기화 중')
  })
  it.each(['SUBMITTED', 'COMPLETED'])(
    'replaces the %s success card when its validity expires without polling',
    async (status) => {
      vi.useFakeTimers()
      vi.setSystemTime(new Date(1799999999000))
      state.mailbox.requests.value = [assignedRequest({ status })]
      const wrapper = mountView()
      await flushPromises()
      expect(wrapper.find('.terminal-card.success').exists()).toBe(true)
      await vi.advanceTimersByTimeAsync(2000)
      expect(wrapper.find('.terminal-card.success').exists()).toBe(false)
      expect(wrapper.text()).toContain('요청 기한이 만료되었습니다')
      wrapper.unmount()
    },
  )
})
