import { createPinia, disposePinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useWalletStore } from './wallet'
import { setAuthSessionToken } from '../services/authSession'
import { apiRequest } from '../services/api'
import { getMetaMaskProvider } from '../services/web3/provider'

vi.mock('../services/api', async (importOriginal) => ({
  ...(await importOriginal()),
  apiRequest: vi.fn(),
}))
vi.mock('../services/web3/provider', () => ({ getMetaMaskProvider: vi.fn() }))

let pinia
beforeEach(() => {
  setAuthSessionToken('seller-session')
  pinia = createPinia()
  setActivePinia(pinia)
  vi.mocked(apiRequest).mockReset()
  vi.mocked(getMetaMaskProvider).mockReset()
})
afterEach(() => {
  disposePinia(pinia)
  setAuthSessionToken(null)
})

describe('wallet account changes', () => {
  it('discards a late MetaMask selection after switching role accounts', async () => {
    let finishPermission
    const request = vi.fn().mockImplementation(
      () =>
        new Promise((resolve) => {
          finishPermission = resolve
        }),
    )
    vi.mocked(getMetaMaskProvider).mockReturnValue({ request })
    const wallet = useWalletStore()
    const selection = wallet.selectAccount()
    setAuthSessionToken('buyer-session')
    finishPermission()
    await expect(selection).rejects.toMatchObject({ code: 'AUTH_SESSION_CHANGED' })
    expect(request).toHaveBeenCalledTimes(1)
    expect(wallet.pendingWalletAddress).toBeNull()
    expect(wallet.pendingChainId).toBeNull()
  })

  it.each(['buyer-session', null])(
    'clears both saved and unconfirmed addresses when the login session changes',
    async (token) => {
      const wallet = useWalletStore()
      wallet.walletAddress = '0x60602ed43987ea474a85c12a4e768dc8062b4361'
      wallet.pendingWalletAddress = '0xf0aa8d7ca5c7e3e586dcc40397147ac98e3717bb'
      wallet.pendingChainId = 91342
      setAuthSessionToken(token)
      expect(wallet.walletAddress).toBeNull()
      expect(wallet.pendingWalletAddress).toBeNull()
      expect(wallet.pendingChainId).toBeNull()
      await expect(wallet.confirmConnection()).rejects.toThrow('먼저 연결할 MetaMask 계정을 선택')
      expect(apiRequest).not.toHaveBeenCalled()
    },
  )
})
