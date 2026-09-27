import { computed, onScopeDispose, ref } from 'vue'
import {
  claimDemoMkrw,
  getMockKrwFaucetReadiness,
  inspectMockKrwFaucetClaim,
} from '../services/web3/mockKrwFaucet'

const PENDING_FAUCET_CLAIM_STORAGE_KEY = 'mockKrwFaucetPendingClaim'

export function useMockKrwFaucetClaim() {
  const faucetReadiness = ref(null)
  const faucetErrorMessage = ref('')
  const faucetClaimUncertain = ref(false)
  const faucetPendingClaim = ref(null)
  const faucetTxHash = ref('')
  const isFaucetLoading = ref(false)
  const isFaucetClaiming = ref(false)
  let requestId = 0

  const canClaimDemoMkrw = computed(
    () =>
      faucetReadiness.value?.canClaim &&
      !faucetClaimUncertain.value &&
      !isFaucetLoading.value &&
      !isFaucetClaiming.value,
  )

  onScopeDispose(() => {
    requestId += 1
  })

  function resetFaucetReadiness() {
    requestId += 1
    faucetReadiness.value = null
    faucetErrorMessage.value = ''
    isFaucetLoading.value = false
  }

  async function prepareFaucetClaim(
    walletAddress,
    requiredAmount,
    hasSufficientBalance,
    { isCurrent = () => true } = {},
  ) {
    const currentRequestId = ++requestId
    faucetReadiness.value = null
    faucetErrorMessage.value = ''
    isFaucetLoading.value = !hasSufficientBalance

    const stillCurrent = () => currentRequestId === requestId && isCurrent()
    const pendingClaim = readPendingFaucetClaim(walletAddress)
    faucetPendingClaim.value = pendingClaim
    faucetClaimUncertain.value = Boolean(pendingClaim)
    faucetTxHash.value = pendingClaim?.txHash ?? ''

    let pendingStatus = null
    if (pendingClaim) {
      try {
        const result = await inspectMockKrwFaucetClaim(
          pendingClaim.txHash,
          walletAddress,
          requiredAmount,
          pendingClaim.nonce,
        )
        if (!stillCurrent()) return { status: 'STALE', readiness: null }

        pendingStatus = result.status
        if (result.status === 'FAILED') {
          clearPendingFaucetClaim(walletAddress)
        } else if (result.status === 'CONFIRMED' || result.status === 'CLAIMED') {
          savePendingFaucetClaim(walletAddress, {
            ...pendingClaim,
            phase: 'confirmed',
            claimAmount: result.claimAmount ?? pendingClaim.claimAmount,
          })
        }
      } catch (error) {
        if (!stillCurrent()) return { status: 'STALE', readiness: null }
        faucetErrorMessage.value =
          error.message ?? '기존 데모 mKRW 충전 트랜잭션을 확인하지 못했습니다.'
        pendingStatus = 'PENDING'
      }
    }

    if (hasSufficientBalance) {
      if (pendingStatus === 'CONFIRMED' || pendingStatus === 'CLAIMED') {
        clearPendingFaucetClaim(walletAddress)
      }
      if (stillCurrent()) isFaucetLoading.value = false
      return { status: pendingStatus, readiness: null }
    }

    try {
      const readiness = await getMockKrwFaucetReadiness(walletAddress, requiredAmount)
      if (!stillCurrent()) return { status: 'STALE', readiness: null }
      faucetReadiness.value = readiness
      if (readiness.hasClaimed) clearPendingFaucetClaim(walletAddress)
      return { status: pendingStatus, readiness }
    } catch (error) {
      if (!stillCurrent()) return { status: 'STALE', readiness: null }
      faucetErrorMessage.value =
        error.message ?? '데모 mKRW 충전 가능 여부를 확인하지 못했습니다.'
      return { status: pendingStatus, readiness: null }
    } finally {
      if (stillCurrent()) isFaucetLoading.value = false
    }
  }

  async function submitFaucetClaim(
    walletAddress,
    requiredAmount,
    { onSubmitted = null } = {},
  ) {
    faucetErrorMessage.value = ''
    isFaucetClaiming.value = true
    try {
      const result = await claimDemoMkrw(walletAddress, requiredAmount, (submitted) => {
        const persisted = savePendingFaucetClaim(walletAddress, {
          ...submitted,
          phase: 'submitted',
          submittedAt: new Date().toISOString(),
        })
        if (!persisted) throw new Error('Could not persist Faucet claim recovery')
        faucetTxHash.value = submitted.txHash
        onSubmitted?.(submitted)
      })

      savePendingFaucetClaim(walletAddress, {
        ...faucetPendingClaim.value,
        txHash: result.txHash,
        phase: 'confirmed',
        claimAmount: result.claimAmount,
      })
      faucetTxHash.value = result.txHash
      return result
    } catch (error) {
      if (error.txHash) faucetTxHash.value = error.txHash
      if (error.txHash) {
        savePendingFaucetClaim(walletAddress, {
          ...faucetPendingClaim.value,
          txHash: error.txHash,
          phase: 'submitted',
          submittedAt: faucetPendingClaim.value?.submittedAt ?? new Date().toISOString(),
        })
      }
      if (error.code === 'FAUCET_CLAIM_FAILED' || error.code === 'TRANSACTION_CANCELLED') {
        clearPendingFaucetClaim(walletAddress)
      }
      const hasAuthoritativeFaucetState =
        error.code === 'FAUCET_ALREADY_CLAIMED' || error.code === 'FAUCET_DEPLETED'
      if (hasAuthoritativeFaucetState) {
        faucetReadiness.value = {
          ...faucetReadiness.value,
          hasClaimed:
            error.code === 'FAUCET_ALREADY_CLAIMED' || faucetReadiness.value?.hasClaimed,
          hasInventory:
            error.code === 'FAUCET_DEPLETED'
              ? false
              : faucetReadiness.value?.hasInventory,
          canClaim: false,
        }
      }
      faucetErrorMessage.value = hasAuthoritativeFaucetState
        ? ''
        : (error.message ?? '데모 mKRW 충전을 완료하지 못했습니다.')
      throw error
    } finally {
      isFaucetClaiming.value = false
    }
  }

  function readPendingFaucetClaim(walletAddress) {
    if (!walletAddress) return null
    try {
      const claims = JSON.parse(localStorage.getItem(PENDING_FAUCET_CLAIM_STORAGE_KEY) ?? '{}')
      const claim = claims[String(walletAddress).toLowerCase()]
      if (!claim || !/^0x[0-9a-fA-F]{64}$/.test(claim.txHash ?? '')) return null
      return {
        ...claim,
        walletAddress: claim.walletAddress ?? claim.funderWalletAddress ?? walletAddress,
      }
    } catch {
      localStorage.removeItem(PENDING_FAUCET_CLAIM_STORAGE_KEY)
      return null
    }
  }

  function savePendingFaucetClaim(walletAddress, claim) {
    const claimWalletAddress =
      claim?.walletAddress ?? claim?.funderWalletAddress ?? walletAddress
    if (!claimWalletAddress || !/^0x[0-9a-fA-F]{64}$/.test(claim?.txHash ?? '')) {
      return false
    }

    let claims
    try {
      claims = JSON.parse(localStorage.getItem(PENDING_FAUCET_CLAIM_STORAGE_KEY) ?? '{}')
    } catch {
      claims = {}
    }
    const saved = {
      ...claim,
      walletAddress: claimWalletAddress,
    }
    delete saved.funderWalletAddress
    claims[String(claimWalletAddress).toLowerCase()] = saved
    faucetPendingClaim.value = saved
    faucetClaimUncertain.value = true
    try {
      localStorage.setItem(PENDING_FAUCET_CLAIM_STORAGE_KEY, JSON.stringify(claims))
      return true
    } catch {
      return false
    }
  }

  function clearPendingFaucetClaim(walletAddress) {
    const claimWalletAddress =
      faucetPendingClaim.value?.walletAddress ??
      faucetPendingClaim.value?.funderWalletAddress ??
      walletAddress
    if (claimWalletAddress) {
      try {
        const claims = JSON.parse(localStorage.getItem(PENDING_FAUCET_CLAIM_STORAGE_KEY) ?? '{}')
        delete claims[String(claimWalletAddress).toLowerCase()]
        if (Object.keys(claims).length) {
          localStorage.setItem(PENDING_FAUCET_CLAIM_STORAGE_KEY, JSON.stringify(claims))
        } else {
          localStorage.removeItem(PENDING_FAUCET_CLAIM_STORAGE_KEY)
        }
      } catch {
        localStorage.removeItem(PENDING_FAUCET_CLAIM_STORAGE_KEY)
      }
    }
    faucetPendingClaim.value = null
    faucetClaimUncertain.value = false
  }

  return {
    canClaimDemoMkrw,
    faucetClaimUncertain,
    faucetErrorMessage,
    faucetReadiness,
    faucetTxHash,
    isFaucetClaiming,
    isFaucetLoading,
    prepareFaucetClaim,
    resetFaucetReadiness,
    submitFaucetClaim,
  }
}
