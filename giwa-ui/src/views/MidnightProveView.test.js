import { createPinia, setActivePinia } from 'pinia'
import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import MidnightProveView from './MidnightProveView.vue'
import { RECEIVABLE_FINANCE, makeAuthorizationRequest, SESSION_ID } from '../test/midnightFixtures'
import { useAuthStore } from '../stores/auth'
import { useReceivableStore } from '../stores/receivable'

const routeState = vi.hoisted(() => ({ query: {} }))
const routerReplace = vi.hoisted(() => vi.fn().mockResolvedValue(undefined))

vi.mock('vue-router', async () => {
  const actual = await vi.importActual('vue-router')
  return {
    ...actual,
    useRoute: () => routeState,
    useRouter: () => ({ replace: routerReplace }),
  }
})

function jsonResponse(payload) {
  return new Response(JSON.stringify(payload), {
    status: 201,
    headers: { 'Content-Type': 'application/json' },
  })
}

function makeReceivable(overrides = {}) {
  return {
    receivableId: 5,
    sellerCompanyId: 10,
    buyerCompanyId: 20,
    sellerCompanyName: 'Seller Co',
    buyerCompanyName: 'Buyer Co',
    onchainReceivableId: '1',
    tokenId: '7',
    contractAddress: RECEIVABLE_FINANCE,
    status: 'TOKENIZED',
    ...overrides,
  }
}

function mountView({
  user = { companyId: 10, email: 'seller@example.com' },
  receivables = [makeReceivable()],
  query = {},
} = {}) {
  routeState.query = query
  const pinia = createPinia()
  setActivePinia(pinia)
  const authStore = useAuthStore()
  authStore.user = user
  authStore.loadUser = vi.fn().mockResolvedValue(user)
  const receivableStore = useReceivableStore()
  receivableStore.receivables = receivables
  receivableStore.loadAll = vi.fn().mockResolvedValue(receivables)

  return mount(MidnightProveView, {
    attachTo: document.body,
    global: {
      plugins: [pinia],
      stubs: {
        RouterLink: { template: '<a href="#"><slot /></a>' },
      },
    },
  })
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-08-17T08:00:00.000Z'))
  routerReplace.mockClear()
  routerReplace.mockResolvedValue(undefined)
})

afterEach(() => {
  document.body.innerHTML = ''
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe('MidnightProveView', () => {
  it('derives the Seller subject from a DB receivable and explains every public identifier', async () => {
    const wrapper = mountView()
    await flushPromises()

    expect(wrapper.text()).toContain('로컬 증명 서비스가 처리합니다')
    expect(wrapper.text()).toContain('은행·회계 검증이나 펀딩 승인이 아닙니다')
    expect(wrapper.text()).toContain('DB 채권 ID')
    expect(wrapper.text()).toContain('온체인 채권 ID')
    expect(wrapper.text()).toContain('NFT Token ID')
    expect(wrapper.text()).toContain('DB #5')
    expect(wrapper.text()).toContain('온체인 #1')
    expect(wrapper.text()).toContain('#7')
    expect(wrapper.text()).toContain('Seller(매도자)')
    expect(wrapper.find('#prove-receivable-id').exists()).toBe(false)
    expect(wrapper.find('#prove-subject-role').exists()).toBe(false)
    expect(wrapper.text()).not.toContain('수동 CLI 서명 도구')
    expect(wrapper.get('#prove-pin').attributes('autocomplete')).toBe('off')
    expect(wrapper.get('#prove-pin').attributes('aria-describedby')).toContain('prove-pin-help')
    expect(wrapper.get('[aria-current="step"]').text()).toContain('비공개 입력')
    wrapper.unmount()
  })

  it('uses a visible public DB query id only to preselect its linked onchain context', async () => {
    const wrapper = mountView({
      receivables: [
        makeReceivable({ receivableId: 4, onchainReceivableId: '8', tokenId: null }),
        makeReceivable({ receivableId: 5, onchainReceivableId: '12', tokenId: '22' }),
      ],
      query: { receivableId: '5', capability: 'must-be-ignored' },
    })
    await flushPromises()

    expect(wrapper.get('#proof-receivable').element.value).toBe('5:SELLER')
    expect(wrapper.text()).toContain('DB #5')
    expect(wrapper.text()).toContain('온체인 #12')
    expect(wrapper.text()).not.toContain('must-be-ignored')
    expect(routerReplace).toHaveBeenCalledWith({ query: { receivableId: '5' } })
    wrapper.unmount()
  })

  it('explains an unavailable query target and synchronizes the visible fallback DB id', async () => {
    const wrapper = mountView({
      receivables: [makeReceivable({ receivableId: 4, onchainReceivableId: '8' })],
      query: { receivableId: '7' },
    })
    await flushPromises()

    expect(wrapper.get('#proof-receivable').element.value).toBe('4:SELLER')
    expect(wrapper.get('.context-notice').text()).toContain(
      '요청한 채권은 현재 회사의 Seller/Buyer 증명 발급 대상이 아니어서',
    )
    expect(wrapper.get('.context-notice').text()).toContain('주소의 공개 DB 채권 ID를 일치')
    expect(routerReplace).toHaveBeenCalledWith({ query: { receivableId: '4' } })
    wrapper.unmount()
  })

  it('keeps the public DB id query synchronized when the user selects another candidate', async () => {
    const wrapper = mountView({
      receivables: [
        makeReceivable({ receivableId: 4, onchainReceivableId: '8' }),
        makeReceivable({ receivableId: 5, onchainReceivableId: '12' }),
      ],
      query: { receivableId: '4' },
    })
    await flushPromises()
    routerReplace.mockClear()

    await wrapper.get('#proof-receivable').setValue('5:SELLER')

    expect(routerReplace).toHaveBeenCalledWith({ query: { receivableId: '5' } })
    expect(wrapper.text()).toContain('온체인 #12')
    expect(JSON.stringify(routerReplace.mock.calls)).not.toContain('secretPin')
    wrapper.unmount()
  })

  it('derives the Buyer role and sends the linked onchain id instead of the DB id', async () => {
    const authorizationRequest = makeAuthorizationRequest()
    authorizationRequest.message.subjectRole = 'BUYER'
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        version: 1,
        sessionId: SESSION_ID,
        expiresAt: authorizationRequest.message.expiresAt,
        authorizationRequest,
      }),
    )
    vi.stubGlobal('fetch', fetchMock)
    const wrapper = mountView({
      user: { companyId: 20, email: 'buyer@example.com' },
      receivables: [makeReceivable({ receivableId: 5, onchainReceivableId: '2' })],
    })
    await flushPromises()

    expect(wrapper.get('#proof-receivable').element.value).toBe('5:BUYER')
    expect(wrapper.text()).toContain('Buyer(매수자)')
    await wrapper.get('#prove-revenue').setValue('500000000')
    await wrapper.get('#prove-debt-ratio').setValue('200')
    await wrapper.get('#prove-overdue').setValue('1')
    await wrapper.get('#prove-pin').setValue('2345')
    await wrapper.get('form').trigger('submit')
    await flushPromises()

    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toMatchObject({
      onchainReceivableId: '2',
      subjectRole: 'BUYER',
    })
    wrapper.unmount()
  })

  it('blocks a Funder or outsider from issuing a Seller/Buyer proof', async () => {
    const wrapper = mountView({ user: { companyId: 30, email: 'funder@example.com' } })
    await flushPromises()

    expect(wrapper.text()).toContain('현재 로그인 회사는 증명 발급 주체가 아닙니다')
    expect(wrapper.text()).toContain('해당 채권의 판매·구매기업만 서명할 수 있습니다')
    expect(wrapper.text()).toContain('전달받은 검증 권한 확인하기')
    expect(wrapper.find('#prove-revenue').exists()).toBe(false)
    wrapper.unmount()
  })

  it('normalizes friendly inputs, removes private values, and keeps the selected DB context on reset', async () => {
    const authorizationRequest = makeAuthorizationRequest()
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        version: 1,
        sessionId: SESSION_ID,
        expiresAt: authorizationRequest.message.expiresAt,
        authorizationRequest,
      }),
    )
    vi.stubGlobal('fetch', fetchMock)
    const wrapper = mountView()
    await flushPromises()
    await wrapper.get('button[aria-label="가명 생성 PIN 표시하기"]').trigger('click')
    expect(wrapper.get('#prove-pin').attributes('type')).toBe('text')
    await wrapper.get('#prove-revenue').setValue('500,000,000')
    await wrapper.get('#prove-debt-ratio').setValue('85.5')
    await wrapper.get('#prove-overdue').setValue('1')
    await wrapper.get('#prove-pin').setValue('1234')

    await wrapper.get('form').trigger('submit')
    await flushPromises()

    const requestBody = JSON.parse(fetchMock.mock.calls[0][1].body)
    expect(requestBody).toMatchObject({
      onchainReceivableId: '1',
      subjectRole: 'SELLER',
      annualRevenueKrw: '500000000',
      debtRatioBps: '8550',
      overdueCount: '1',
      secretPin: '1234',
    })
    expect(wrapper.find('#prove-revenue').exists()).toBe(false)
    expect(wrapper.find('#prove-debt-ratio').exists()).toBe(false)
    expect(wrapper.find('#prove-overdue').exists()).toBe(false)
    expect(wrapper.find('#prove-pin').exists()).toBe(false)
    expect(wrapper.text()).toContain('서명 전 확인')
    expect(wrapper.text()).toContain('DB #5 / 온체인 #1')
    expect(wrapper.text()).toContain('MetaMask 서명 후 증명 시작')

    const resetButton = wrapper
      .findAll('button')
      .find((button) => button.text().includes('세션 취소하고 다시 입력'))
    await resetButton.trigger('click')
    expect(wrapper.get('#proof-receivable').element.value).toBe('5:SELLER')
    expect(wrapper.get('#prove-pin').attributes('type')).toBe('password')
    wrapper.unmount()
  })

  it('generates a CSPRNG demo PIN and describes out-of-policy inputs as valid ineligible proofs', async () => {
    const randomValues = vi
      .spyOn(globalThis.crypto, 'getRandomValues')
      .mockImplementation((values) => {
        values[0] = 4242
        return values
      })
    const wrapper = mountView()
    await flushPromises()

    await wrapper
      .findAll('button')
      .find((button) => button.text().includes('임시 데모 PIN 만들기'))
      .trigger('click')

    expect(randomValues).toHaveBeenCalledOnce()
    expect(wrapper.get('#prove-pin').element.value).toBe('4242')
    expect(wrapper.text()).toContain('같은 번호는 같은 가명')
    expect(wrapper.text()).toContain('실제 비밀번호·카드 PIN은 사용하지 마세요')
    expect(wrapper.text()).toContain('유효한 부적격 ZK 결과')
    expect(wrapper.text()).toContain('기업마다 독립된 지갑·비밀 상태가 아닙니다')
    expect(wrapper.text()).toContain('같은 PIN을 쓰면 가명 결과가 연결될 수 있습니다')
    wrapper.unmount()
  })

  it('marks only the invalid field and exposes field-specific guidance', async () => {
    const wrapper = mountView()
    await flushPromises()
    await wrapper.get('#prove-revenue').setValue('500,000,000')
    await wrapper.get('#prove-debt-ratio').setValue('85.555')
    await wrapper.get('#prove-overdue').setValue('1')
    await wrapper.get('#prove-pin').setValue('1349')

    expect(wrapper.get('#prove-revenue').attributes('aria-invalid')).toBe('false')
    expect(wrapper.get('#prove-debt-ratio').attributes('aria-invalid')).toBe('true')
    expect(wrapper.get('#prove-overdue').attributes('aria-invalid')).toBe('false')
    expect(wrapper.get('#prove-pin').attributes('aria-invalid')).toBe('false')
    expect(wrapper.get('#prove-debt-error').text()).toContain('소수 둘째 자리')
    expect(wrapper.get('#prove-debt-ratio').attributes('aria-describedby')).toContain(
      'prove-debt-error',
    )
    wrapper.unmount()
  })

  it('focuses a step-specific Bridge failure and preserves every private input for retry', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response('', {
          status: 502,
          headers: { 'Content-Type': 'text/plain' },
        }),
      ),
    )
    const wrapper = mountView()
    await flushPromises()
    await wrapper.get('#prove-revenue').setValue('500,000,000')
    await wrapper.get('#prove-debt-ratio').setValue('85.5')
    await wrapper.get('#prove-overdue').setValue('1')
    await wrapper.get('#prove-pin').setValue('1349')

    await wrapper.get('form').trigger('submit')
    await flushPromises()

    const alert = wrapper.get('.challenge-error')
    expect(alert.text()).toContain('서명 요청을 만들지 못했습니다')
    expect(alert.text()).toContain('로컬 Proof Bridge에 연결할 수 없습니다')
    expect(alert.text()).toContain('입력값은 유지됩니다')
    expect(document.activeElement).toBe(alert.element)
    expect(wrapper.get('#prove-revenue').element.value).toBe('500,000,000')
    expect(wrapper.get('#prove-debt-ratio').element.value).toBe('85.5')
    expect(wrapper.get('#prove-overdue').element.value).toBe('1')
    expect(wrapper.get('#prove-pin').element.value).toBe('1349')
    wrapper.unmount()
  })
})
