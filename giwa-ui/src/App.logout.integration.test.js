import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, disposePinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'
import App from './App.vue'
import ProfileView from './views/ProfileView.vue'
import DashboardView from './views/DashboardView.vue'
import LoginView from './views/LoginView.vue'
import { useAuthStore } from './stores/auth'
import { useWalletStore } from './stores/wallet'
import { setAuthSessionToken } from './services/authSession'
import { apiRequest } from './services/api'
import { recordingDemoAccounts } from './services/recordingDemo'

vi.mock('./services/api', async (importOriginal) => ({
  ...(await importOriginal()),
  apiRequest: vi.fn(),
}))
vi.mock('./services/midnight/config', () => ({
  isMidnightDemoEnabled: true,
  isMidnightPocEnabled: true,
}))
vi.mock('./services/recordingDemo', async (importOriginal) => ({
  ...(await importOriginal()),
  isRecordingDemoEnabled: true,
}))
vi.mock('./components/MidnightDemoStatus.vue', () => ({
  default: { template: '<div>Backend ready</div>' },
}))

let wrapper
let pinia
let router
let auth
let wallet
let activeAccount
let logoutSpy
let errors
const userFor = (account) => ({ userId: 1, companyId: 1, email: account.email })
const tokenFor = (role, demo = false) =>
  'header.' +
  btoa(JSON.stringify({ role, ...(demo ? { scope: 'midnight:demo' } : {}) })) +
  '.signature'
const button = (label) => wrapper.findAll('button').find((item) => item.text() === label)

beforeEach(() => {
  setAuthSessionToken(null)
  pinia = createPinia()
  setActivePinia(pinia)
  auth = useAuthStore()
  wallet = useWalletStore()
  activeAccount = recordingDemoAccounts[0]
  errors = []
  vi.mocked(apiRequest).mockImplementation(async (path, options) => {
    if (path === '/auth/me') return userFor(activeAccount)
    if (path === '/wallet/me') return { walletAddress: activeAccount.walletAddress }
    if (path === '/auth/login') {
      activeAccount = recordingDemoAccounts.find((account) => account.email === options.body.email)
      return { accessToken: tokenFor(activeAccount.role), user: userFor(activeAccount) }
    }
    if (path === '/auth/demo-login') {
      return { accessToken: tokenFor('FUNDER', true), user: userFor(activeAccount) }
    }
    throw new Error('Unexpected API request: ' + path)
  })

  const placeholder = { template: '<main>Workspace</main>' }
  router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/login', name: 'login', component: LoginView, meta: { guestOnly: true } },
      { path: '/profile', name: 'profile', component: ProfileView, meta: { requiresAuth: true } },
      {
        path: '/dashboard',
        name: 'dashboard',
        component: DashboardView,
        meta: { requiresAuth: true },
      },
      {
        path: '/demo',
        name: 'demo',
        component: placeholder,
        meta: { requiresAuth: true, demoOnly: true },
      },
      ...['receivables', 'funding', 'repayment', 'midnight'].map((name) => ({
        path: '/' + name,
        name,
        component: placeholder,
        meta: { requiresAuth: true },
      })),
    ],
  })
  router.beforeEach((to) => {
    if (to.meta.requiresAuth && !auth.isAuthenticated) return { name: 'login' }
    if (auth.isDemoSession && to.meta.requiresAuth && !to.meta.demoOnly) return { name: 'demo' }
    if (to.meta.guestOnly && auth.isAuthenticated)
      return { name: auth.isDemoSession ? 'demo' : 'dashboard' }
  })

  // Bound the known feedback loop so the failing regression cannot hang Vitest.
  const realLogout = auth.logout
  let logoutCalls = 0
  logoutSpy = vi.spyOn(auth, 'logout').mockImplementation(() => {
    logoutCalls += 1
    if (logoutCalls > 8) throw new Error('REPEATED_LOGOUT_REMOUNT_LOOP')
    return realLogout()
  })
})

afterEach(() => {
  wrapper?.unmount()
  wrapper = null
  disposePinia(pinia)
  setAuthSessionToken(null)
})

async function openAuthenticated(name, account, demo = false) {
  activeAccount = account
  setAuthSessionToken(tokenFor(account.role, demo))
  auth.user = userFor(account)
  wallet.walletAddress = account.walletAddress
  await router.push({ name })
  wrapper = mount(App, {
    global: {
      plugins: [pinia, router],
      config: { errorHandler: (error) => errors.push(error) },
    },
  })
  await flushPromises()
}

describe('logout through the real app shell', () => {
  it('returns to Login when another tab removes the session while Profile is open', async () => {
    await openAuthenticated('profile', recordingDemoAccounts[0])
    const generation = auth.sessionGeneration
    localStorage.removeItem('accessToken')
    window.dispatchEvent(new StorageEvent('storage', { key: 'accessToken', newValue: null }))
    await flushPromises()
    expect(auth.token).toBeNull()
    expect(auth.sessionGeneration).toBe(generation + 1)
    expect(wallet.walletAddress).toBeNull()
    expect(logoutSpy).not.toHaveBeenCalled()
    expect(wrapper.find('.profile-page').exists()).toBe(false)
    expect(router.currentRoute.value.name).toBe('login')
    expect(button('데모 시작')).toBeDefined()
    expect(errors).toEqual([])
  })

  it.each(recordingDemoAccounts)(
    'logs $label out from Profile without repeatedly remounting the page',
    async (account) => {
      await openAuthenticated('profile', account)
      const generation = auth.sessionGeneration
      await button('로그아웃').trigger('click')
      await flushPromises()
      expect(logoutSpy).toHaveBeenCalledTimes(1)
      expect(auth.sessionGeneration).toBe(generation + 1)
      expect(router.currentRoute.value.name).toBe('login')
      expect(wrapper.find('.profile-page').exists()).toBe(false)
      expect(button('데모 시작')).toBeDefined()
      expect(auth.token).toBeNull()
      expect(wallet.walletAddress).toBeNull()
      expect(errors).toEqual([])
    },
  )

  it('logs out from Dashboard and can enter another recording role immediately', async () => {
    await openAuthenticated('dashboard', recordingDemoAccounts[0])
    await button('로그아웃').trigger('click')
    await flushPromises()
    expect(logoutSpy).toHaveBeenCalledTimes(1)
    expect(router.currentRoute.value.name).toBe('login')
    await button('Buyer').trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.name).toBe('dashboard')
    expect(auth.user.email).toBe(recordingDemoAccounts[1].email)
    expect(wallet.walletAddress).toBe(recordingDemoAccounts[1].walletAddress)
    expect(errors).toEqual([])
  })

  it('leaves the walletless demo and can start a fresh limited session', async () => {
    await openAuthenticated('demo', recordingDemoAccounts[2], true)
    await button('나가기').trigger('click')
    await flushPromises()
    expect(logoutSpy).toHaveBeenCalledTimes(1)
    expect(router.currentRoute.value.name).toBe('login')
    expect(auth.token).toBeNull()
    await button('데모 시작').trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.name).toBe('demo')
    expect(auth.isDemoSession).toBe(true)
    expect(errors).toEqual([])
  })
})
