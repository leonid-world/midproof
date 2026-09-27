import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, disposePinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { setAuthSessionToken } from '../services/authSession'
import { demoRunRequest, loadWalletlessConfig } from '../services/midnight/walletlessDemo'
import WalletlessDemoView from './WalletlessDemoView.vue'
vi.mock('../services/midnight/walletlessDemo', () => ({
  demoRunRequest: vi.fn(),
  loadWalletlessConfig: vi.fn(),
}))
const fixture = () => ({
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
})
const notFound = () => Object.assign(new Error('not found'), { code: 'DEMO_RUN_NOT_FOUND' })
let pinia
let wrapper
const button = (text) => wrapper.findAll('button').find((item) => item.text().includes(text))
beforeEach(() => {
  pinia = createPinia()
  setActivePinia(pinia)
  setAuthSessionToken('demo-test-token')
  vi.mocked(demoRunRequest).mockReset()
  vi.mocked(loadWalletlessConfig).mockReset()
  vi.mocked(loadWalletlessConfig).mockResolvedValue({
    networkId: 'undeployed',
    contractAddress: 'c'.repeat(64),
    runtime: { status: 'ready' },
    walletlessDemo: { enabled: true, customCriteriaEnabled: true },
    provider: { name: '가상 데모 기관' },
    profiles: [
      { id: 'steady', label: '가상 기업 A', summary: '충족 사례' },
      { id: 'stretched', label: '가상 기업 B', summary: '미충족 사례' },
    ],
  })
  vi.stubGlobal('ethereum', { request: vi.fn() })
})
afterEach(() => {
  wrapper?.unmount()
  disposePinia(pinia)
  setAuthSessionToken(null)
  vi.unstubAllGlobals()
  vi.useRealTimers()
})
describe('wallet-free consent and recovery', () => {
  it('requires explicit consent and never invokes a browser wallet', async () => {
    vi.mocked(demoRunRequest)
      .mockRejectedValueOnce(notFound())
      .mockImplementationOnce(async (_operation, body) => ({ ...fixture(), ...body }))
    wrapper = mount(WalletlessDemoView, { global: { plugins: [pinia] } })
    await flushPromises()
    expect(button('검증 시작').attributes('disabled')).toBeDefined()
    await wrapper.find('input[type=checkbox]').setValue(true)
    await button('검증 시작').trigger('click')
    await flushPromises()
    expect(demoRunRequest.mock.calls[1][0]).toBe('start')
    expect(demoRunRequest.mock.calls[1][1]).toMatchObject({
      consent: true,
      subjectRole: 'SELLER',
      profileId: 'steady',
    })
    expect(window.ethereum.request).not.toHaveBeenCalled()
  })
  it('keeps the exact custom policy and idempotency key after a lost start response', async () => {
    vi.mocked(demoRunRequest)
      .mockRejectedValueOnce(notFound())
      .mockRejectedValueOnce(new Error('응답 유실'))
      .mockRejectedValueOnce(notFound())
      .mockImplementationOnce(async (_operation, body) => ({ ...fixture(), ...body }))
    wrapper = mount(WalletlessDemoView, { global: { plugins: [pinia] } })
    await flushPromises()
    await wrapper.find('#revenue').setValue('7.50000001')
    await wrapper.find('#debt').setValue('175.25')
    await wrapper.find('#overdue').setValue('2')
    await wrapper.find('input[type=checkbox]').setValue(true)
    await button('검증 시작').trigger('click')
    await flushPromises()
    const first = structuredClone(demoRunRequest.mock.calls[1][1])
    expect(first).toMatchObject({
      minAnnualRevenueKrw: '750000001',
      maxDebtRatioBps: '17525',
      maxOverdueCount: '2',
    })
    expect(wrapper.find('#revenue').element.closest('fieldset').disabled).toBe(true)
    expect(wrapper.text()).toContain('매출 ≥ 7.50000001억 원 · 부채비율 ≤ 175.25% · 연체 ≤ 2회')
    expect(button('검증 시작')).toBeUndefined()
    await button('진행 상태 확인').trigger('click')
    await flushPromises()
    await button('같은 요청으로 다시 시도').trigger('click')
    await flushPromises()
    expect(demoRunRequest.mock.calls[3][1]).toEqual(first)
    expect(demoRunRequest.mock.calls[3][2].expected).toMatchObject({
      clientRequestId: first.clientRequestId,
      minAnnualRevenueKrw: first.minAnnualRevenueKrw,
      maxDebtRatioBps: first.maxDebtRatioBps,
      maxOverdueCount: first.maxOverdueCount,
    })
  })
  it('blocks new submission if previous-session recovery is uncertain', async () => {
    vi.mocked(demoRunRequest).mockRejectedValueOnce(new Error('network unavailable'))
    wrapper = mount(WalletlessDemoView, { global: { plugins: [pinia] } })
    await flushPromises()
    await wrapper.find('input[type=checkbox]').setValue(true)
    expect(button('검증 시작').attributes('disabled')).toBeDefined()
  })
  it('recovers a valid false result on reload and displays the public criteria', async () => {
    const data = fixture()
    vi.mocked(demoRunRequest).mockResolvedValueOnce({
      ...data,
      status: 'completed',
      result: {
        eligible: false,
        providerId: 2,
        profileAsOf: String(Math.floor(Date.now() / 1000)),
        validUntil: data.validUntil,
      },
    })
    wrapper = mount(WalletlessDemoView, { global: { plugins: [pinia] } })
    await flushPromises()
    expect(demoRunRequest.mock.calls[0].slice(0, 2)).toEqual(['recover', {}])
    expect(wrapper.text()).toContain('기준 미충족')
    expect(wrapper.text()).toContain('매출 ≥ 5억 원')
    expect(wrapper.text()).toContain('합성 재무값')
    expect(window.ethereum.request).not.toHaveBeenCalled()
  })
  it.each([true, false])(
    'replaces an expired %s result with the expiry state without reproof',
    async (eligible) => {
      vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval'] })
      const data = {
        ...fixture(),
        minAnnualRevenueKrw: '300000000',
        maxDebtRatioBps: '30000',
        maxOverdueCount: '3',
        validUntil: String(Math.floor(Date.now() / 1000) + 2),
      }
      vi.mocked(demoRunRequest).mockResolvedValueOnce({
        ...data,
        status: 'completed',
        result: {
          eligible,
          profileAsOf: String(Math.floor(Date.now() / 1000)),
          validUntil: data.validUntil,
        },
      })
      wrapper = mount(WalletlessDemoView, { global: { plugins: [pinia] } })
      await flushPromises()
      expect(wrapper.find('.verified-result h3').text()).toBe(
        eligible ? '기준 충족' : '기준 미충족',
      )
      await vi.advanceTimersByTimeAsync(3000)
      expect(wrapper.find('.verified-result').exists()).toBe(false)
      expect(wrapper.find('.progress-result h3').text()).toBe('유효기간 만료')
      expect(wrapper.text()).toContain('매출 ≥ 3억 원 · 부채비율 ≤ 300% · 연체 ≤ 3회')
      expect(demoRunRequest).toHaveBeenCalledExactlyOnceWith('recover', {}, expect.any(Object))
    },
  )
})

it('sends edited criteria, resets consent, and locks the exact policy while proving', async () => {
  vi.mocked(demoRunRequest)
    .mockRejectedValueOnce(notFound())
    .mockImplementationOnce(async (_operation, body) => ({ ...fixture(), ...body }))
  wrapper = mount(WalletlessDemoView, { global: { plugins: [pinia] } })
  await flushPromises()
  await wrapper.find('input[type=checkbox]').setValue(true)
  await wrapper.find('#revenue').setValue('7.5')
  expect(wrapper.find('input[type=checkbox]').element.checked).toBe(false)
  await wrapper.find('#debt').setValue('175.25')
  await wrapper.find('#overdue').setValue('2')
  await wrapper.find('input[type=checkbox]').setValue(true)
  await button('검증 시작').trigger('click')
  await flushPromises()
  expect(demoRunRequest.mock.calls[1][1]).toMatchObject({
    minAnnualRevenueKrw: '750000000',
    maxDebtRatioBps: '17525',
    maxOverdueCount: '2',
    consent: true,
  })
  expect(demoRunRequest.mock.calls[1][2].expected.minAnnualRevenueKrw).toBe('750000000')
  expect(wrapper.find('#revenue').element.closest('fieldset').disabled).toBe(true)
  expect(wrapper.text()).toContain('매출 ≥ 7.5억 원 · 부채비율 ≤ 175.25% · 연체 ≤ 2회')
})
it('hydrates custom recovered criteria and requires new consent to retry another policy', async () => {
  const data = {
    ...fixture(),
    minAnnualRevenueKrw: '1000000000',
    maxDebtRatioBps: '10000',
    maxOverdueCount: '0',
  }
  vi.mocked(demoRunRequest).mockResolvedValueOnce({
    ...data,
    status: 'completed',
    result: { eligible: false, profileAsOf: '1790500000' },
  })
  wrapper = mount(WalletlessDemoView, { global: { plugins: [pinia] } })
  await flushPromises()
  expect(wrapper.find('#revenue').element.value).toBe('10')
  expect(wrapper.text()).toContain('매출 ≥ 10억 원 · 부채비율 ≤ 100% · 연체 ≤ 0회')
  expect(wrapper.find('.evidence').attributes('open')).toBeUndefined()
  const focus = vi.spyOn(wrapper.find('#revenue').element, 'focus')
  await button('기준 바꿔 다시 검증').trigger('click')
  await flushPromises()
  expect(focus).toHaveBeenCalledOnce()
  await button('완화').trigger('click')
  expect(wrapper.find('#revenue').element.value).toBe('3')
  expect(wrapper.find('input[type=checkbox]').element.checked).toBe(false)
  expect(button('검증 시작').attributes('disabled')).toBeDefined()
})
it('blocks malformed criteria before sending a proof request', async () => {
  vi.mocked(demoRunRequest).mockRejectedValueOnce(notFound())
  wrapper = mount(WalletlessDemoView, { global: { plugins: [pinia] } })
  await flushPromises()
  await wrapper.find('#debt').setValue('100.001')
  await wrapper.find('input[type=checkbox]').setValue(true)
  expect(button('검증 시작').attributes('disabled')).toBeDefined()
  expect(wrapper.find('#criteria-help').text()).toContain('소수 둘째 자리')
  expect(demoRunRequest).toHaveBeenCalledTimes(1)
})

it('waits for criteria support during a rolling server update', async () => {
  vi.mocked(loadWalletlessConfig).mockResolvedValueOnce({
    runtime: { status: 'ready' },
    walletlessDemo: { enabled: true },
    profiles: [{ id: 'steady', label: '가상 기업 A' }],
  })
  vi.mocked(demoRunRequest).mockRejectedValueOnce(notFound())
  wrapper = mount(WalletlessDemoView, { global: { plugins: [pinia] } })
  await flushPromises()
  await wrapper.find('input[type=checkbox]').setValue(true)
  expect(button('검증 시작').attributes('disabled')).toBeDefined()
  expect(demoRunRequest).toHaveBeenCalledTimes(1)
})
