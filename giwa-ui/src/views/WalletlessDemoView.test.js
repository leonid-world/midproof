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
    walletlessDemo: { enabled: true },
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
})
describe('wallet-free consent and recovery', () => {
  it('requires explicit consent and never invokes a browser wallet', async () => {
    vi.mocked(demoRunRequest)
      .mockRejectedValueOnce(notFound())
      .mockImplementationOnce(async (_operation, body) => ({ ...fixture(), ...body }))
    wrapper = mount(WalletlessDemoView, { global: { plugins: [pinia] } })
    await flushPromises()
    expect(button('실제 증명 생성').attributes('disabled')).toBeDefined()
    await wrapper.find('input[type=checkbox]').setValue(true)
    await button('실제 증명 생성').trigger('click')
    await flushPromises()
    expect(demoRunRequest.mock.calls[1][0]).toBe('start')
    expect(demoRunRequest.mock.calls[1][1]).toMatchObject({
      consent: true,
      subjectRole: 'SELLER',
      profileId: 'steady',
    })
    expect(window.ethereum.request).not.toHaveBeenCalled()
  })
  it('keeps the same idempotency key after a lost start response', async () => {
    vi.mocked(demoRunRequest)
      .mockRejectedValueOnce(notFound())
      .mockRejectedValueOnce(new Error('응답 유실'))
      .mockRejectedValueOnce(notFound())
      .mockImplementationOnce(async (_operation, body) => ({ ...fixture(), ...body }))
    wrapper = mount(WalletlessDemoView, { global: { plugins: [pinia] } })
    await flushPromises()
    await wrapper.find('input[type=checkbox]').setValue(true)
    await button('실제 증명 생성').trigger('click')
    await flushPromises()
    const first = demoRunRequest.mock.calls[1][1].clientRequestId
    expect(button('실제 증명 생성')).toBeUndefined()
    await button('기존 요청 상태 확인').trigger('click')
    await flushPromises()
    await button('같은 요청으로 다시 접수').trigger('click')
    await flushPromises()
    expect(demoRunRequest.mock.calls[3][1].clientRequestId).toBe(first)
  })
  it('blocks new submission if previous-session recovery is uncertain', async () => {
    vi.mocked(demoRunRequest).mockRejectedValueOnce(new Error('network unavailable'))
    wrapper = mount(WalletlessDemoView, { global: { plugins: [pinia] } })
    await flushPromises()
    await wrapper.find('input[type=checkbox]').setValue(true)
    expect(button('실제 증명 생성').attributes('disabled')).toBeDefined()
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
    expect(wrapper.text()).toContain('요청한 기준 미충족')
    expect(wrapper.text()).toContain('매출 ≥ 5억 원')
    expect(wrapper.text()).toContain('합성 재무값')
    expect(window.ethereum.request).not.toHaveBeenCalled()
  })
})
