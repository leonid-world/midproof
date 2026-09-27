import { createPinia, setActivePinia } from 'pinia'
import { ref } from 'vue'
import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { RECEIVABLE_FINANCE } from '../test/midnightFixtures'
import { useAuthStore } from '../stores/auth'
import { useReceivableStore } from '../stores/receivable'

const flowScenario = vi.hoisted(() => ({
  phase: 'error',
  errorCode: 'ELIGIBILITY_RESULT_ALREADY_EXISTS',
  errorMessage: '이 채권 역할의 적격성 결과가 이미 발급되어 새 증명을 만들 수 없습니다.',
  failedAt: 'proof',
  canCancelAwaitingSession: false,
}))
const flowActions = vi.hoisted(() => ({
  resetFlow: vi.fn(),
  cancelAwaitingSessionAndReset: vi.fn(),
}))

vi.mock('vue-router', async () => {
  const actual = await vi.importActual('vue-router')
  return {
    ...actual,
    useRoute: () => ({ query: { receivableId: '5' } }),
    useRouter: () => ({ replace: vi.fn().mockResolvedValue(undefined) }),
  }
})

vi.mock('../composables/useMidnightProofFlow', () => ({
  formatAnnualRevenueInput: (value) => value,
  useMidnightProofFlow: () => ({
    annualRevenueKrw: ref(''),
    debtRatioPercent: ref(''),
    normalizedDebtRatioBps: ref(''),
    overdueCount: ref(''),
    secretPin: ref(''),
    phase: ref(flowScenario.phase),
    errorMessage: ref(flowScenario.errorMessage),
    errorCode: ref(flowScenario.errorCode),
    failedAt: ref(flowScenario.failedAt),
    authorizationRequest: ref(null),
    verification: ref(null),
    shareableCapabilityText: ref(''),
    inputErrors: ref({
      annualRevenueKrw: '',
      debtRatioPercent: '',
      overdueCount: '',
      secretPin: '',
    }),
    canRequestChallenge: ref(false),
    canCancelAwaitingSession: ref(flowScenario.canCancelAwaitingSession),
    secondsRemaining: ref(0),
    isBusy: ref(false),
    currentStep: ref(3),
    requestChallenge: vi.fn(),
    authorizeAndProve: vi.fn(),
    checkProofStatus: vi.fn(),
    cancelAwaitingSessionAndReset: flowActions.cancelAwaitingSessionAndReset,
    retryPublicResult: vi.fn(),
    setProofSubjectContext: vi.fn(),
    resetFlow: flowActions.resetFlow,
  }),
}))

const { default: MidnightProveView } = await import('./MidnightProveView.vue')

function mountErrorView() {
  const pinia = createPinia()
  setActivePinia(pinia)
  const authStore = useAuthStore()
  authStore.user = { companyId: 10, email: 'seller@example.com' }
  authStore.loadUser = vi.fn().mockResolvedValue(authStore.user)
  const receivables = [
    {
      receivableId: 5,
      sellerCompanyId: 10,
      buyerCompanyId: 20,
      onchainReceivableId: '1',
      tokenId: '7',
      contractAddress: RECEIVABLE_FINANCE,
      status: 'TOKENIZED',
    },
  ]
  const receivableStore = useReceivableStore()
  receivableStore.receivables = receivables
  receivableStore.loadAll = vi.fn().mockResolvedValue(receivables)

  return mount(MidnightProveView, {
    global: {
      plugins: [pinia],
      stubs: { RouterLink: { template: '<a href="#"><slot /></a>' } },
    },
  })
}

beforeEach(() => {
  flowScenario.phase = 'error'
  flowScenario.errorCode = 'ELIGIBILITY_RESULT_ALREADY_EXISTS'
  flowScenario.errorMessage =
    '이 채권 역할의 적격성 결과가 이미 발급되어 새 증명을 만들 수 없습니다.'
  flowScenario.failedAt = 'proof'
  flowScenario.canCancelAwaitingSession = false
  flowActions.resetFlow.mockClear()
  flowActions.cancelAwaitingSessionAndReset.mockClear()
})

describe('MidnightProveView recovery states', () => {
  it('renders duplicate issuance as a dedicated reuse path instead of a generic retry', async () => {
    const wrapper = mountErrorView()
    await flushPromises()

    const notice = wrapper.get('.duplicate-result')
    expect(notice.text()).toContain('결과가 이미 발급되었습니다')
    expect(notice.text()).toContain('새 증명은 제출되지 않았으며')
    expect(notice.text()).toContain('.json')
    expect(notice.text()).toContain('PIN을 바꿔 재발급 제한을 우회하면 안 됩니다')
    expect(notice.text()).toContain('재발급·갱신·분실 복구는 지원하지 않습니다')
    expect(notice.text()).toContain('기존 검증 권한으로 결과 확인')
    expect(wrapper.text()).not.toContain('ZK 증명 처리를 완료하지 못했습니다')

    await notice
      .findAll('button')
      .find((button) => button.text().includes('다른 채권 선택'))
      .trigger('click')
    expect(flowActions.resetFlow).toHaveBeenCalledOnce()
    wrapper.unmount()
  })

  it('offers explicit cancellation when status confirms the signature was not submitted', async () => {
    flowScenario.phase = 'proof_unknown'
    flowScenario.errorCode = 'PROOF_SUBMISSION_NOT_CONFIRMED'
    flowScenario.errorMessage = '서명 요청이 아직 제출되지 않은 상태임을 확인했습니다.'
    flowScenario.canCancelAwaitingSession = true
    const wrapper = mountErrorView()
    await flushPromises()

    const cancelButton = wrapper
      .get('.notice.warning')
      .findAll('button')
      .find((button) => button.text().includes('대기 세션 취소 후 다시 입력'))
    expect(cancelButton).toBeTruthy()
    await cancelButton.trigger('click')
    expect(flowActions.cancelAwaitingSessionAndReset).toHaveBeenCalledOnce()
    wrapper.unmount()
  })
})
