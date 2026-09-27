import { reactive, ref } from 'vue'
import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import MidnightAssignedRequestsView from './MidnightAssignedRequestsView.vue'
import { MidnightProofBridgeV2Error } from '../services/midnight/proofBridgeV2'

const state = vi.hoisted(() => ({
  mailbox: null,
  runtime: null,
  receivables: null,
  services: null,
  flow: null,
}))
vi.mock('vue-router', () => ({ useRoute: () => ({ query: {} }) }))
vi.mock('../services/midnight/config', () => ({
  isMidnightDemoEnabled: true,
  midnightProofConfig: { apiUrl: '/midnight-proof' },
}))
vi.mock('../services/midnight/demoRuntime', () => ({
  get midnightDemoRuntime() {
    return state.runtime
  },
  loadMidnightDemoConfig: async () => state.runtime.value,
}))
vi.mock('../composables/useMidnightProofMailbox', () => ({
  useMidnightProofMailbox: () => state.mailbox,
}))
vi.mock('../stores/receivable', () => ({ useReceivableStore: () => state.receivables }))
vi.mock('../composables/useMidnightAssignedProof', async (original) => {
  const actual = await original()
  return {
    ...actual,
    useMidnightAssignedProof: () => {
      state.flow = actual.useMidnightAssignedProof({ services: state.services, hostedDemo: true })
      return state.flow
    },
  }
})

function request(id, role) {
  return {
    requestId: `0x${id.repeat(64)}`,
    receivableId: 5,
    onchainReceivableId: '2',
    subjectRole: role,
    requesterCompanyName: 'Funder Co',
    subjectCompanyName: 'Synthetic Co',
    partyWallet: `0x${'2'.repeat(40)}`,
    intendedFunderWallet: `0x${'3'.repeat(40)}`,
    minAnnualRevenueKrw: '500000000',
    maxDebtRatioBps: '20000',
    maxOverdueCount: '1',
    validUntil: '1800000000',
    status: 'REQUESTED',
  }
}

describe('hosted issuer component with the real proof state machine', () => {
  beforeEach(() => {
    vi.setSystemTime(new Date(1799999900000))
    state.mailbox = {
      requests: ref([request('1', 'SELLER'), request('4', 'BUYER')]),
      isLoading: ref(false),
      isRefreshing: ref(false),
      isMutating: ref(false),
      errorMessage: ref(''),
      successMessage: ref(''),
      refresh: vi.fn().mockResolvedValue([]),
    }
    state.runtime = ref({
      profiles: [{ id: 'stable-company', label: '가상 안정 기업', summary: '준비된 가상 재무값' }],
      runtime: { status: 'ready' },
      provider: { name: '가상 기관' },
    })
    state.receivables = reactive({
      receivables: [{ receivableId: 5, tokenId: '2' }],
      loadAll: vi.fn().mockResolvedValue(),
    })
    let selected
    state.services = {
      recover: vi
        .fn()
        .mockRejectedValue(
          new MidnightProofBridgeV2Error('PROOF_RESULT_NOT_FOUND', '완료 증명 없음'),
        ),
      challenge: vi.fn((_input, options) => {
        selected = options.request
        return Promise.resolve({ sessionId: `0x${'5'.repeat(64)}`, authorizationRequest: {} })
      }),
      sign: vi.fn().mockResolvedValue({ version: 2 }),
      submit: vi.fn().mockResolvedValue({}),
      status: vi.fn(() =>
        Promise.resolve({ status: 'complete', proofCapability: { ...selected } }),
      ),
      complete: vi.fn(() => Promise.resolve({ ...selected, status: 'SUBMITTED' })),
      acknowledge: vi.fn().mockResolvedValue({}),
    }
  })
  afterEach(() => vi.useRealTimers())

  it.each([undefined, 'READ_API_UNAVAILABLE'])(
    'uses only a fixture through request changes while the runtime is ready (%s)',
    async (code) => {
      state.runtime.value.runtime.code = code
      const wrapper = mount(MidnightAssignedRequestsView, {
        global: { stubs: { RouterLink: { template: '<a><slot /></a>' } } },
      })
      await flushPromises()
      expect(wrapper.text()).toContain('운영 서버가 원문을 처리하며, 은행 검증은 아닙니다')
      expect(wrapper.findAll('input[type="number"]')).toHaveLength(0)
      expect(wrapper.find('input[type="radio"]').element.checked).toBe(true)
      await wrapper.findAll('li button')[1].trigger('click')
      await flushPromises()
      expect(wrapper.find('input[type="radio"]').element.checked).toBe(true)
      expect(
        wrapper.find('.private-form button[type="submit"]').attributes('disabled'),
      ).toBeUndefined()
      await wrapper.find('.private-form').trigger('submit')
      await flushPromises()
      expect(state.services.challenge.mock.calls[0][0]).toEqual({
        version: 2,
        requestId: request('4', 'BUYER').requestId,
        profileId: 'stable-company',
      })
      expect(state.services.sign).toHaveBeenCalledTimes(1)
      expect(state.services.submit).toHaveBeenCalledTimes(1)
      expect(state.services.complete).toHaveBeenCalledTimes(1)
      expect(state.services.acknowledge).toHaveBeenCalledTimes(1)
      expect(state.flow.privateFacts).toEqual({
        annualRevenueKrw: '',
        debtRatioPercent: '',
        overdueCount: '',
      })
      wrapper.unmount()
    },
  )
})
