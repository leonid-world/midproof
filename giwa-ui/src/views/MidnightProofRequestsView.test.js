import { reactive, ref } from 'vue'
import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import MidnightProofRequestsView from './MidnightProofRequestsView.vue'

const state = vi.hoisted(() => ({ mailbox: null, auth: null, receivables: null }))

vi.mock('vue-router', () => ({ useRoute: () => ({ query: {} }) }))
vi.mock('../composables/useMidnightProofMailbox', () => ({
  useMidnightProofMailbox: () => state.mailbox,
}))
vi.mock('../stores/auth', () => ({ useAuthStore: () => state.auth }))
vi.mock('../stores/receivable', () => ({ useReceivableStore: () => state.receivables }))

const REQUEST_ID = `0x${'1'.repeat(64)}`

function request(overrides = {}) {
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
    status: 'COMPLETED',
    createdAt: '2026-08-19T00:00:00Z',
    updatedAt: '2026-08-19T00:00:00Z',
    ...overrides,
  }
}

function mountView() {
  return mount(MidnightProofRequestsView, {
    global: {
      stubs: {
        RouterLink: { template: '<a><slot /></a>' },
      },
    },
  })
}

describe('Funder policy request product view', () => {
  beforeEach(() => {
    state.mailbox = {
      requests: ref([request()]),
      resolutions: ref({
        [REQUEST_ID]: {
          ...request(),
          result: {
            eligible: true,
            providerId: '2',
            evaluationVersion: 2,
            profileAsOf: '1799999900',
            validUntil: '1800000000',
          },
        },
      }),
      isLoading: ref(false),
      isRefreshing: ref(false),
      isMutating: ref(false),
      errorMessage: ref(''),
      successMessage: ref(''),
      refresh: vi.fn(),
      createRequests: vi.fn().mockResolvedValue([]),
      resolve: vi.fn(),
      clearMessages: vi.fn(),
    }
    state.auth = reactive({
      user: { companyId: 30 },
      loadUser: vi.fn().mockResolvedValue({ companyId: 30 }),
    })
    const candidate = {
      receivableId: 5,
      onchainReceivableId: '2',
      tokenId: '2',
      status: 'TOKENIZED',
      sellerCompanyId: 10,
      buyerCompanyId: 20,
      funderCompanyId: null,
    }
    state.receivables = reactive({
      receivables: [candidate],
      fundingOpportunities: [candidate],
      loadAll: vi.fn().mockResolvedValue(),
      loadFundingOpportunities: vi.fn().mockResolvedValue(),
    })
  })

  it('shows preset/custom thresholds and a fully qualified result without signing controls', async () => {
    const wrapper = mountView()
    await flushPromises()
    const text = wrapper.text()

    expect(text).toContain('최소 연매출')
    expect(text).toContain('최대 부채비율')
    expect(text).toContain('최대 연체 횟수')
    expect(text).toContain('요청 기준 충족')
    expect(text).toContain('Funder Co')
    expect(text).toContain('Seller Co · SELLER')
    expect(text).toContain('Provider 2')
    expect(text).toContain('가상 확인서 발급')
    expect(text).toContain('발급 시각은 가상 입력의 제출 시각입니다')
    expect(text).toContain('은행·회계 검증이나 펀딩 승인을 뜻하지 않습니다')
    expect(text).not.toMatch(/MetaMask|Proof capability|clipboard|PIN|JSON/i)
  })

  it('converts the human debt percent to bps and creates separate role requests', async () => {
    state.mailbox.requests.value = []
    state.mailbox.resolutions.value = {}
    const wrapper = mountView()
    await flushPromises()
    const checkboxes = wrapper.findAll('input[type="checkbox"]')
    await checkboxes[1].setValue(true)
    const form = wrapper.find('form')
    await form.trigger('submit')

    expect(state.mailbox.createRequests).toHaveBeenCalledWith(5, ['SELLER', 'BUYER'], {
      minAnnualRevenueKrw: '500000000',
      maxDebtRatioBps: '20000',
      maxOverdueCount: '1',
      validForSeconds: 86400,
    })
  })

  it('excludes FUNDED assignments and blocks a duplicate active role request', async () => {
    const funded = {
      receivableId: 6,
      onchainReceivableId: '3',
      tokenId: '3',
      status: 'FUNDED',
      sellerCompanyId: 11,
      buyerCompanyId: 21,
      funderCompanyId: 30,
    }
    state.receivables.receivables.push(funded)
    state.receivables.fundingOpportunities.push(funded)
    state.mailbox.requests.value = [request({ status: 'SUBMITTED' })]
    state.mailbox.resolutions.value = {}

    const wrapper = mountView()
    await flushPromises()
    const options = wrapper.findAll('select option').map((option) => option.text())
    const roleInputs = wrapper.findAll('input[type="checkbox"]')

    expect(options.join(' ')).toContain('DB #5')
    expect(options.join(' ')).not.toContain('DB #6')
    expect(roleInputs[0].attributes('disabled')).toBeDefined()
    expect(roleInputs[1].attributes('disabled')).toBeUndefined()
    expect(wrapper.text()).toContain('판매기업 요청은 이미 증명 제출됨')
    expect(wrapper.text()).toContain('결과 확인')
  })
  afterEach(() => vi.useRealTimers())

  it.each([true, false])(
    'does not present an expired cached %s result as current',
    async (eligible) => {
      state.mailbox.requests.value = [request({ status: 'EXPIRED' })]
      state.mailbox.resolutions.value[REQUEST_ID].result.eligible = eligible
      const wrapper = mountView()
      await flushPromises()
      expect(wrapper.find('.resolution-card').exists()).toBe(false)
      wrapper.unmount()
    },
  )

  it('expires a displayed result without waiting for another server response', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(1_799_999_999_000))
    const wrapper = mountView()
    await flushPromises()
    expect(wrapper.find('.resolution-card').exists()).toBe(true)
    await vi.advanceTimersByTimeAsync(2000)
    expect(wrapper.find('.resolution-card').exists()).toBe(false)
    expect(wrapper.text()).toContain('기한 만료')
    wrapper.unmount()
  })
})
