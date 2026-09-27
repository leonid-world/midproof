import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import DashboardView from './DashboardView.vue'
import { recordingDemoAccounts } from '../services/recordingDemo'

const { auth, wallet, flags } = vi.hoisted(() => ({
  auth: { user: null, logout: vi.fn() },
  wallet: {
    walletAddress: null,
    pendingWalletAddress: null,
    isConnected: true,
    hasPendingWallet: false,
    loadWallet: vi.fn(),
    selectAccount: vi.fn(),
    confirmConnection: vi.fn(),
    clearPending: vi.fn(),
    clear: vi.fn(),
  },
  flags: { recording: true },
}))
vi.mock('../stores/auth', () => ({ useAuthStore: () => auth }))
vi.mock('../stores/wallet', () => ({ useWalletStore: () => wallet }))
vi.mock('vue-router', () => ({ useRouter: () => ({ push: vi.fn() }) }))
vi.mock('../services/midnight/config', () => ({ isMidnightPocEnabled: true }))
vi.mock('../services/recordingDemo', async (importOriginal) => {
  const original = await importOriginal()
  return {
    ...original,
    recordingDemoAccountFor: (email) =>
      flags.recording
        ? original.recordingDemoAccounts.find((account) => account.email === email)
        : null,
  }
})

let wrapper
const button = (label) => wrapper.findAll('button').find((item) => item.text() === label)
beforeEach(() => {
  flags.recording = true
  auth.user = { email: recordingDemoAccounts[0].email }
  wallet.walletAddress = recordingDemoAccounts[0].walletAddress
  wallet.pendingWalletAddress = null
  wallet.isConnected = true
  wallet.hasPendingWallet = false
  wallet.loadWallet.mockReset().mockResolvedValue(undefined)
  wallet.selectAccount.mockReset().mockResolvedValue(undefined)
  wallet.confirmConnection.mockReset().mockResolvedValue(undefined)
})
afterEach(() => wrapper?.unmount())

describe('recording role wallet guidance', () => {
  it.each(recordingDemoAccounts)(
    'shows $label and its expected address without opening MetaMask',
    async (account) => {
      auth.user = { email: account.email }
      wallet.walletAddress = account.walletAddress
      wrapper = mount(DashboardView)
      await flushPromises()
      const notice = wrapper.get('.recording-wallet-note')
      expect(notice.text()).toContain(account.label + ' · 영상 촬영용')
      expect(notice.text()).toContain(account.walletAddress)
      expect(wallet.selectAccount).not.toHaveBeenCalled()
      expect(wallet.confirmConnection).not.toHaveBeenCalled()
    },
  )

  it('does not let the Seller replace its fixed wallet with the Buyer wallet', async () => {
    wallet.pendingWalletAddress = recordingDemoAccounts[1].walletAddress
    wallet.hasPendingWallet = true
    wrapper = mount(DashboardView)
    await flushPromises()
    expect(wrapper.get('[role=alert]').text()).toContain('MetaMask에서 Seller 지갑을 선택')
    expect(button('이 지갑 연결')).toBeUndefined()
    expect(button('다른 계정 선택')).toBeDefined()
    expect(wallet.confirmConnection).not.toHaveBeenCalled()
  })

  it('retains explicit confirmation for the expected address', async () => {
    wallet.pendingWalletAddress = recordingDemoAccounts[0].walletAddress.toUpperCase()
    wallet.hasPendingWallet = true
    wrapper = mount(DashboardView)
    await flushPromises()
    await button('이 지갑 연결').trigger('click')
    await flushPromises()
    expect(wallet.confirmConnection).toHaveBeenCalledOnce()
  })

  it('keeps the backend fixed-role error visible when the selected chain is wrong', async () => {
    wallet.pendingWalletAddress = recordingDemoAccounts[0].walletAddress
    wallet.hasPendingWallet = true
    wallet.confirmConnection.mockRejectedValueOnce({
      code: 'ROLE_DEMO_WALLET_MISMATCH',
      message:
        '촬영용 역할 계정은 지정된 MetaMask 지갑과 GIWA Sepolia 네트워크만 사용할 수 있습니다.',
    })
    wrapper = mount(DashboardView)
    await flushPromises()
    await button('이 지갑 연결').trigger('click')
    await flushPromises()
    expect(wrapper.get('[role=alert]').text()).toContain('GIWA Sepolia')
    expect(wallet.walletAddress).toBe(recordingDemoAccounts[0].walletAddress)
  })

  it.each(['ordinary', 'disabled'])(
    'preserves regular wallet connection for %s mode',
    async (mode) => {
      if (mode === 'ordinary') auth.user = { email: 'owner@example.test' }
      else flags.recording = false
      wallet.pendingWalletAddress = recordingDemoAccounts[1].walletAddress
      wallet.hasPendingWallet = true
      wrapper = mount(DashboardView)
      await flushPromises()
      expect(wrapper.find('.recording-wallet-note').exists()).toBe(false)
      await button('이 지갑 연결').trigger('click')
      expect(wallet.confirmConnection).toHaveBeenCalledOnce()
    },
  )
})
