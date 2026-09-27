import { createPinia, setActivePinia } from 'pinia'
import { ref } from 'vue'
import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  RECEIVABLE_FINANCE,
  makeProofCapability,
  makeResolvedEligibility,
} from '../test/midnightFixtures'
import { useAuthStore } from '../stores/auth'
import { useReceivableStore } from '../stores/receivable'

const eligibilityState = vi.hoisted(() => ({ value: false }))

vi.mock('vue-router', async () => {
  const actual = await vi.importActual('vue-router')
  return {
    ...actual,
    useRoute: () => ({ query: {} }),
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
    phase: ref('success'),
    errorMessage: ref(''),
    errorCode: ref(''),
    failedAt: ref(''),
    authorizationRequest: ref(null),
    verification: ref(makeResolvedEligibility(eligibilityState.value)),
    shareableCapabilityText: ref(JSON.stringify(makeProofCapability())),
    inputErrors: ref({
      annualRevenueKrw: '',
      debtRatioPercent: '',
      overdueCount: '',
      secretPin: '',
    }),
    canRequestChallenge: ref(false),
    canCancelAwaitingSession: ref(false),
    secondsRemaining: ref(0),
    isBusy: ref(false),
    currentStep: ref(4),
    requestChallenge: vi.fn(),
    authorizeAndProve: vi.fn(),
    checkProofStatus: vi.fn(),
    cancelAwaitingSessionAndReset: vi.fn(),
    retryPublicResult: vi.fn(),
    setProofSubjectContext: vi.fn(),
    resetFlow: vi.fn(),
  }),
}))

const { default: MidnightProveView } = await import('./MidnightProveView.vue')

function mountResult() {
  const pinia = createPinia()
  setActivePinia(pinia)
  const user = { companyId: 10, email: 'seller@example.com' }
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
  const authStore = useAuthStore()
  authStore.user = user
  authStore.loadUser = vi.fn().mockResolvedValue(user)
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

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('MidnightProveView public result', () => {
  it('renders ineligible as a valid proof outcome with accessible result focus', async () => {
    const wrapper = mountResult()
    await flushPromises()

    expect(wrapper.text()).toContain('부적격은 증명 실패가 아닙니다')
    expect(wrapper.text()).toContain('유효한 결과')
    expect(wrapper.text()).toContain('은행·회계 검증')
    expect(wrapper.get('#prove-result-title').text()).toContain('부적격')
    expect(wrapper.get('.result-panel').attributes('tabindex')).toBe('-1')
    wrapper.unmount()
  })

  it('renders eligible without overstating it and hands off an exact verification capability explicitly', async () => {
    eligibilityState.value = true
    const writeText = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal('navigator', { clipboard: { writeText } })
    const createObjectURL = vi.fn().mockReturnValue('blob:verification-file')
    const revokeObjectURL = vi.fn()
    vi.stubGlobal('URL', { createObjectURL, revokeObjectURL })
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined)
    const wrapper = mountResult()
    await flushPromises()

    expect(wrapper.get('#prove-result-title').text()).toContain('적격')
    expect(wrapper.text()).toContain('가상 입력과 발급 시 지갑 동의')
    expect(wrapper.text()).toContain('현재 적격성을 뜻하지 않습니다')
    expect(wrapper.text()).not.toContain('부적격은 증명 실패가 아닙니다')
    expect(wrapper.text()).toContain('특정 당사자를 연결하는 민감 정보')
    expect(wrapper.text()).toContain('의도한 요청자에게만 전달하세요')
    expect(wrapper.text()).toContain('공유·동기화 폴더')
    expect(wrapper.find('#shareable-capability').exists()).toBe(false)

    await wrapper
      .findAll('button')
      .find((button) => button.text().includes('검증 권한 복사'))
      .trigger('click')
    await flushPromises()

    expect(writeText).toHaveBeenCalledWith(JSON.stringify(makeProofCapability()))
    expect(wrapper.text()).toContain('검증 권한을 복사했습니다')

    const details = wrapper.get('.advanced-capability')
    details.element.open = true
    await details.trigger('toggle')
    expect(wrapper.get('#shareable-capability').element.value).toBe(
      JSON.stringify(makeProofCapability()),
    )

    await wrapper
      .findAll('button')
      .find((button) => button.text().includes('검증 파일 저장'))
      .trigger('click')
    await flushPromises()
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(createObjectURL).toHaveBeenCalledOnce()
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:verification-file')
    expect(wrapper.text()).toContain('채권·회사 식별정보가 없는 이름')
    wrapper.unmount()
    eligibilityState.value = false
  })
})
