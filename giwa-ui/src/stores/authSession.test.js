import { createPinia, disposePinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useAuthStore } from './auth'
import { useReceivableStore } from './receivable'
import { setAuthSessionToken } from '../services/authSession'
import { apiRequest } from '../services/api'

vi.mock('../services/api', () => ({ apiRequest: vi.fn() }))
vi.mock('../services/receivableAmountPolicy', () => ({
  loadReceivableAmountPolicy: vi.fn(),
  validateReceivableAmounts: vi.fn(),
}))

let pinia
function deferred() {
  let resolve
  const promise = new Promise((accept) => {
    resolve = accept
  })
  return { promise, resolve }
}

describe('account-scoped stores', () => {
  beforeEach(() => {
    setAuthSessionToken('account-a')
    pinia = createPinia()
    setActivePinia(pinia)
    vi.mocked(apiRequest).mockReset()
  })
  afterEach(() => {
    disposePinia(pinia)
    setAuthSessionToken(null)
  })

  it.each(['loadAll', 'loadFundingOpportunities', 'loadOne', 'markFunded'])(
    'clears prior company state and rejects a late %s response',
    async (method) => {
      const store = useReceivableStore()
      store.receivables = [{ receivableId: 1 }]
      store.fundingOpportunities = [{ receivableId: 1 }]
      store.selectOne({ receivableId: 1 })
      const pending = deferred()
      vi.mocked(apiRequest).mockReturnValue(pending.promise)
      const check = expect(store[method](1, {})).rejects.toMatchObject({
        code: 'AUTH_SESSION_CHANGED',
      })
      setAuthSessionToken('account-b')
      pending.resolve([{ receivableId: 1 }])
      await check
      expect(store.receivables).toEqual([])
      expect(store.fundingOpportunities).toEqual([])
      expect(store.selectedReceivable).toBeNull()
      expect(apiRequest).toHaveBeenCalledTimes(1)
    },
  )

  it('preserves the GIWA funded update and both list refreshes in the same account', async () => {
    vi.mocked(apiRequest)
      .mockResolvedValueOnce({ receivableId: 1, status: 'FUNDED' })
      .mockResolvedValueOnce([{ receivableId: 1 }])
      .mockResolvedValueOnce([])
    const store = useReceivableStore()
    await expect(store.markFunded(1, { transactionHash: 'tx' })).resolves.toMatchObject({
      status: 'FUNDED',
    })
    expect(store.receivables).toEqual([{ receivableId: 1 }])
    expect(store.fundingOpportunities).toEqual([])
    expect(apiRequest.mock.calls.map(([path]) => path)).toEqual([
      '/receivables/1/funded',
      '/receivables',
      '/receivables/funding-opportunities',
    ])
  })

  it('clears the user and company stores on a cross-tab token change and ignores stale auth/me', async () => {
    const auth = useAuthStore()
    const store = useReceivableStore()
    store.selectOne({ receivableId: 1 })
    const pending = deferred()
    vi.mocked(apiRequest).mockReturnValue(pending.promise)
    const check = expect(auth.loadUser()).rejects.toMatchObject({ code: 'AUTH_SESSION_CHANGED' })
    const generation = auth.sessionGeneration
    localStorage.setItem('accessToken', 'account-b')
    window.dispatchEvent(new StorageEvent('storage', { key: 'accessToken', newValue: 'account-b' }))
    pending.resolve({ email: 'company-a@example.test' })
    await check
    expect(auth.token).toBe('account-b')
    expect(auth.sessionGeneration).toBeGreaterThan(generation)
    expect(auth.user).toBeNull()
    expect(store.selectedReceivable).toBeNull()
  })
})
