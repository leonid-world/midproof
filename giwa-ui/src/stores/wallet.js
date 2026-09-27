import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { ApiError, apiRequest } from '../services/api'
import { getMetaMaskProvider } from '../services/web3/provider'

function metaMaskError(error) {
  if (error?.code === 4001) return new Error('MetaMask 계정 선택이 취소되었습니다.')
  if (error?.code === 4900) return new Error('MetaMask가 네트워크에서 연결 해제되었습니다.')
  return new Error(error?.message ?? 'MetaMask 계정을 불러오지 못했습니다.')
}

export const useWalletStore = defineStore('wallet', () => {
  const walletAddress = ref(null)
  const pendingWalletAddress = ref(null)
  const pendingChainId = ref(null)
  const isConnected = computed(() => Boolean(walletAddress.value))
  const hasPendingWallet = computed(() => Boolean(pendingWalletAddress.value))

  async function loadWallet() {
    try {
      const wallet = await apiRequest('/wallet/me')
      walletAddress.value = wallet.walletAddress
    } catch (error) {
      if (error instanceof ApiError && error.status === 404) {
        walletAddress.value = null
        return
      }
      throw error
    }
  }

  async function selectAccount() {
    const metaMaskProvider = getMetaMaskProvider()
    if (!metaMaskProvider) {
      throw new Error('MetaMask provider를 찾지 못했습니다. 확장 프로그램을 활성화한 뒤 페이지를 새로고침해 주세요.')
    }

    try {
      try {
        await metaMaskProvider.request({
          method: 'wallet_requestPermissions',
          params: [{ eth_accounts: {} }],
        })
      } catch (error) {
        if (error?.code !== -32601) throw error
        await metaMaskProvider.request({ method: 'eth_requestAccounts' })
      }

      const accounts = await metaMaskProvider.request({ method: 'eth_accounts' })
      if (!accounts?.length) throw new Error('MetaMask 계정을 선택해 주세요.')

      const chainId = await metaMaskProvider.request({ method: 'eth_chainId' })
      pendingWalletAddress.value = accounts[0]
      pendingChainId.value = Number(BigInt(chainId))
      return pendingWalletAddress.value
    } catch (error) {
      throw metaMaskError(error)
    }
  }

  async function confirmConnection() {
    if (!pendingWalletAddress.value || !pendingChainId.value) {
      throw new Error('먼저 연결할 MetaMask 계정을 선택해 주세요.')
    }

    const wallet = await apiRequest('/wallet/connect', {
      method: 'POST',
      body: {
        walletAddress: pendingWalletAddress.value,
        chainId: pendingChainId.value,
      },
    })
    walletAddress.value = wallet.walletAddress
    clearPending()
    return walletAddress.value
  }

  function clearPending() {
    pendingWalletAddress.value = null
    pendingChainId.value = null
  }

  function clear() {
    walletAddress.value = null
    clearPending()
  }

  return {
    walletAddress,
    pendingWalletAddress,
    pendingChainId,
    isConnected,
    hasPendingWallet,
    loadWallet,
    selectAccount,
    confirmConnection,
    clearPending,
    clear,
  }
})
