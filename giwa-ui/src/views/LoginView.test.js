import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import LoginView from './LoginView.vue'
import { recordingDemoAccounts } from '../services/recordingDemo'
import { setAuthSessionToken } from '../services/authSession'

const { auth, wallet, router, flags } = vi.hoisted(() => ({
  auth: { loginDemo: vi.fn(), login: vi.fn(), signup: vi.fn(), logout: vi.fn() },
  wallet: {
    walletAddress: null,
    loadWallet: vi.fn(),
    clear: vi.fn(),
    selectAccount: vi.fn(),
    confirmConnection: vi.fn(),
  },
  router: { push: vi.fn() },
  flags: { demo: true, recording: true },
}))
vi.mock('../stores/auth', () => ({ useAuthStore: () => auth }))
vi.mock('../stores/wallet', () => ({ useWalletStore: () => wallet }))
vi.mock('vue-router', () => ({ useRouter: () => router }))
vi.mock('../services/recordingDemo', async (importOriginal) => ({
  ...(await importOriginal()),
  get isRecordingDemoEnabled() {
    return flags.recording
  },
}))
vi.mock('../services/midnight/config', () => ({
  get isMidnightDemoEnabled() {
    return flags.demo
  },
}))

let wrapper
const button = (label) => wrapper.findAll('button').find((item) => item.text() === label)
beforeEach(() => {
  setAuthSessionToken(null)
  flags.demo = true
  flags.recording = true
  auth.loginDemo.mockReset().mockResolvedValue(undefined)
  auth.login.mockReset().mockResolvedValue(undefined)
  auth.signup.mockReset().mockResolvedValue(undefined)
  auth.logout.mockReset()
  wallet.walletAddress = null
  wallet.loadWallet.mockReset()
  wallet.clear.mockReset()
  wallet.selectAccount.mockReset()
  wallet.confirmConnection.mockReset()
  router.push.mockReset().mockResolvedValue(undefined)
})

describe('recording role entry', () => {
  it('does not log out a newer session when a previous wallet check fails', async () => {
    wallet.loadWallet.mockImplementation(async () => {
      setAuthSessionToken('newer-session')
      throw Object.assign(new Error('로그인 계정이 변경되었습니다.'), {
        code: 'AUTH_SESSION_CHANGED',
      })
    })
    wrapper = mount(LoginView)
    await button('Seller').trigger('click')
    await flushPromises()
    expect(auth.logout).not.toHaveBeenCalled()
    expect(wallet.clear).not.toHaveBeenCalled()
    expect(router.push).not.toHaveBeenCalled()
  })

  it.each(recordingDemoAccounts)(
    'logs $label into its existing account after checking its wallet',
    async (account) => {
      wallet.loadWallet.mockImplementation(async () => {
        wallet.walletAddress = account.walletAddress.toUpperCase()
      })
      wrapper = mount(LoginView)
      expect(wrapper.get('[aria-label="영상 촬영용 역할 로그인"]').text()).toContain(
        '영상 촬영용 · MetaMask 필요',
      )
      await button(account.label).trigger('click')
      await flushPromises()
      expect(auth.login).toHaveBeenCalledExactlyOnceWith({
        email: account.email,
        password: expect.any(String),
      })
      expect(wallet.loadWallet).toHaveBeenCalledOnce()
      expect(router.push).toHaveBeenCalledExactlyOnceWith({ name: 'dashboard' })
      expect(auth.loginDemo).not.toHaveBeenCalled()
      expect(wallet.selectAccount).not.toHaveBeenCalled()
      expect(wallet.confirmConnection).not.toHaveBeenCalled()
    },
  )

  it('does not expose role shortcuts when the recording flag is disabled', () => {
    flags.recording = false
    wrapper = mount(LoginView)
    expect(wrapper.find('[aria-label="영상 촬영용 역할 로그인"]').exists()).toBe(false)
    expect(button('데모 시작')).toBeDefined()
  })

  it.each([null, recordingDemoAccounts[1].walletAddress])(
    'rejects missing or mismatched registered wallets without updating them',
    async (address) => {
      wallet.loadWallet.mockImplementation(async () => {
        wallet.walletAddress = address
      })
      wrapper = mount(LoginView)
      await button('Seller').trigger('click')
      await flushPromises()
      expect(auth.logout).toHaveBeenCalledOnce()
      expect(wallet.clear).toHaveBeenCalledOnce()
      expect(router.push).not.toHaveBeenCalled()
      expect(wallet.confirmConnection).not.toHaveBeenCalled()
      expect(wrapper.get('[role=alert]').text()).toContain('Seller 촬영 계정의 지정 지갑')
      expect(button('Seller').attributes('disabled')).toBeUndefined()
    },
  )

  it('keeps all entries disabled while checking the selected role wallet', async () => {
    let finish
    wallet.loadWallet.mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve
        }),
    )
    wrapper = mount(LoginView)
    await button('Seller').trigger('click')
    await flushPromises()
    for (const label of ['데모 시작', '로그인 중…', 'Buyer', 'Funder']) {
      expect(button(label).attributes('disabled')).toBeDefined()
    }
    expect(auth.login).toHaveBeenCalledOnce()
    wallet.walletAddress = recordingDemoAccounts[0].walletAddress
    finish()
    await flushPromises()
    expect(router.push).toHaveBeenCalledExactlyOnceWith({ name: 'dashboard' })
  })

  it('keeps a failed login retryable without looking up or connecting a wallet', async () => {
    auth.login.mockRejectedValueOnce(new Error('로그인에 실패했습니다.'))
    wrapper = mount(LoginView)
    await button('Buyer').trigger('click')
    await flushPromises()
    expect(wrapper.get('[role=alert]').text()).toContain('로그인에 실패했습니다.')
    expect(wallet.loadWallet).not.toHaveBeenCalled()
    expect(wallet.confirmConnection).not.toHaveBeenCalled()
    expect(auth.logout).not.toHaveBeenCalled()
    expect(button('Buyer').attributes('disabled')).toBeUndefined()
  })
})
afterEach(() => {
  wrapper?.unmount()
  setAuthSessionToken(null)
})

describe('simple demo entry', () => {
  it('opens one limited demo session without asking for credentials or a role', async () => {
    wrapper = mount(LoginView)
    expect(wrapper.find('form').exists()).toBe(false)
    expect(button('판매기업')).toBeUndefined()
    await button('데모 시작').trigger('click')
    await flushPromises()
    expect(auth.loginDemo).toHaveBeenCalledExactlyOnceWith('FUNDER')
    expect(auth.login).not.toHaveBeenCalled()
    expect(router.push).toHaveBeenCalledExactlyOnceWith({ name: 'demo' })
  })

  it('keeps a failed demo sign-in visible and allows retry without switching forms', async () => {
    auth.loginDemo.mockRejectedValueOnce(new Error('데모 서버를 준비 중입니다.'))
    wrapper = mount(LoginView)
    await button('데모 시작').trigger('click')
    await flushPromises()
    expect(wrapper.get('[role=alert]').text()).toContain('데모 서버를 준비 중입니다.')
    expect(button('데모 시작').attributes('disabled')).toBeUndefined()
    expect(router.push).not.toHaveBeenCalled()
    await button('데모 시작').trigger('click')
    await flushPromises()
    expect(auth.loginDemo).toHaveBeenCalledTimes(2)
    expect(wrapper.find('[role=alert]').exists()).toBe(false)
  })

  it('retains ordinary account login behind its explicit entry', async () => {
    wrapper = mount(LoginView)
    await button('계정으로 로그인').trigger('click')
    await wrapper.get('input[type=email]').setValue('owner@example.test')
    await wrapper.get('input[type=password]').setValue('test-password')
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(auth.login).toHaveBeenCalledExactlyOnceWith({
      email: 'owner@example.test',
      password: 'test-password',
    })
    expect(router.push).toHaveBeenCalledExactlyOnceWith({ name: 'dashboard' })
    expect(auth.loginDemo).not.toHaveBeenCalled()
  })

  it('keeps login and signup directly available when the demo is disabled', async () => {
    flags.demo = false
    wrapper = mount(LoginView)
    expect(wrapper.find('form').exists()).toBe(true)
    expect(button('데모 시작')).toBeUndefined()
    await wrapper
      .findAll('button')
      .find((item) => item.text().includes('회원가입'))
      .trigger('click')
    expect(wrapper.get('input[autocomplete=name]').exists()).toBe(true)
    expect(wrapper.get('input[autocomplete=organization]').exists()).toBe(true)
    expect(wrapper.get('h2').text()).toBe('회원가입')
  })
})
