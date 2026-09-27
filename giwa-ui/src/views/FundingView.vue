<script setup>
import { displayCompanyName } from '../utils/companyName'
import {
  Check,
  ChevronRight,
  Coins,
  ExternalLink,
  Files,
  HandCoins,
  LayoutDashboard,
  LoaderCircle,
  RefreshCw,
  RotateCcw,
  ShieldCheck,
  TriangleAlert,
  Wallet,
} from '@lucide/vue'
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useMockKrwFaucetClaim } from '../composables/useMockKrwFaucetClaim'
import { transactionExplorerUrl } from '../contracts/addresses'
import { getReceivableBlockchainTransactions } from '../services/blockchainTransactions'
import { isMidnightPocEnabled } from '../services/midnight/config'
import { formatReceivableIdentity } from '../services/receivableIdentity'
import { demoAmountHint } from '../services/receivableAmountPolicy'
import {
  approveFundingAmount,
  fundReceivableOnchain,
  getFundingReadiness,
  resumeReceivableTransaction,
} from '../services/web3/receivableContract'
import { useAuthStore } from '../stores/auth'
import { useReceivableStore } from '../stores/receivable'
import { useWalletStore } from '../stores/wallet'

const PENDING_SYNC_STORAGE_KEY = 'receivablePendingBlockchainSync'
const FUND_TRANSACTION_TYPE = 'FUND_RECEIVABLE'

const router = useRouter()
const authStore = useAuthStore()
const receivableStore = useReceivableStore()
const walletStore = useWalletStore()
const {
  canClaimDemoMkrw: faucetCanClaimDemoMkrw,
  faucetClaimUncertain,
  faucetErrorMessage,
  faucetReadiness,
  faucetTxHash,
  isFaucetLoading,
  prepareFaucetClaim,
  resetFaucetReadiness,
  submitFaucetClaim,
} = useMockKrwFaucetClaim()

const pendingSync = ref(null)
const readiness = ref(null)
const journalGate = ref('idle')
const journalMessage = ref('')
const errorMessage = ref('')
const successMessage = ref('')
const actionStage = ref('')
const lastTxHash = ref('')
const isLoading = ref(true)
const hasLoadedOpportunities = ref(false)
const isActionRunning = ref(false)
let selectionRequestId = 0

const opportunities = computed(() => receivableStore.fundingOpportunities)
const selectedReceivable = computed(() => receivableStore.selectedReceivable)
const amountHint = computed(() => demoAmountHint(receivableStore.amountPolicy))
const currentCompanyId = computed(() => authStore.user?.companyId)
const pendingForSelected = computed(
  () =>
    pendingSync.value &&
    selectedReceivable.value &&
    sameId(pendingSync.value.receivableId, selectedReceivable.value.receivableId),
)
const canApprove = computed(
  () =>
    !pendingSync.value &&
    journalGate.value === 'clear' &&
    readiness.value?.hasSufficientBalance &&
    !readiness.value?.hasSufficientAllowance &&
    !isActionRunning.value,
)
const canFund = computed(
  () =>
    !pendingSync.value &&
    journalGate.value === 'clear' &&
    readiness.value?.hasSufficientBalance &&
    readiness.value?.hasSufficientAllowance &&
    !isActionRunning.value,
)
const canClaimDemoMkrw = computed(
  () =>
    !pendingSync.value &&
    journalGate.value === 'clear' &&
    readiness.value &&
    !readiness.value.hasSufficientBalance &&
    faucetCanClaimDemoMkrw.value &&
    !isActionRunning.value &&
    !isFaucetLoading.value,
)
const expectedReturn = computed(() => {
  const receivable = selectedReceivable.value
  if (!receivable) return null
  try {
    return (BigInt(receivable.faceValue) - BigInt(receivable.fundingAmount)).toString()
  } catch {
    return null
  }
})
const retryButtonLabel = computed(() => {
  if (pendingSync.value?.phase === 'submitted') {
    return '기존 펀딩 트랜잭션 확인'
  }
  return '서버 반영 재시도'
})

onMounted(async () => {
  await loadPage()
  try {
    await receivableStore.loadAmountPolicy()
  } catch (error) {
    errorMessage.value = error.message
  }
})

async function loadPage() {
  clearMessages()
  isLoading.value = true
  hasLoadedOpportunities.value = false
  readiness.value = null
  resetFaucetReadiness()
  receivableStore.clearSelection()
  try {
    await Promise.all([
      authStore.loadUser(),
      walletStore.loadWallet(),
      receivableStore.loadFundingOpportunities(),
    ])
    hasLoadedOpportunities.value = true
    pendingSync.value = readPendingSynchronization(currentCompanyId.value)

    if (pendingSync.value?.type === 'funded') {
      await loadPendingReceivable()
      return
    }
    if (pendingSync.value) {
      throw new Error(
        '다른 채권 블록체인 작업이 남아 있습니다. 매출채권 관리 화면에서 먼저 처리해 주세요.',
      )
    }

    if (opportunities.value.length) {
      await selectOpportunity(opportunities.value[0].receivableId)
    } else {
      receivableStore.clearSelection()
      journalGate.value = 'clear'
    }
  } catch (error) {
    errorMessage.value = error.message ?? 'Funding 화면을 불러오지 못했습니다.'
  } finally {
    isLoading.value = false
  }
}

async function loadPendingReceivable() {
  const synchronization = pendingSync.value
  if (!synchronization) return
  await receivableStore.loadOne(synchronization.receivableId)
  lastTxHash.value = synchronization.payload?.txHash ?? ''

  const receivable = selectedReceivable.value
  if (
    receivable?.status === 'FUNDED' &&
    sameHex(receivable.fundingTxHash, synchronization.payload?.txHash)
  ) {
    clearPendingSynchronization()
    journalGate.value = 'clear'
    successMessage.value = '이미 서버에 반영된 Funder 자금 공급을 확인했습니다.'
    return
  }

  journalGate.value = 'adopted'
  journalMessage.value =
    synchronization.phase === 'confirmed'
      ? '펀딩 완료. 다시 전송하지 말고 서버 반영을 재시도하세요.'
      : '펀딩 확인 중. 다시 전송하지 말고 기존 거래를 조회하세요.'
}

async function selectOpportunity(receivableId) {
  const requestId = ++selectionRequestId
  clearMessages()
  readiness.value = null
  resetFaucetReadiness()
  journalGate.value = 'checking'
  journalMessage.value = '기존 펀딩 트랜잭션 이력을 확인하고 있습니다.'
  try {
    const receivable = await receivableStore.fetchOne(receivableId)
    if (requestId !== selectionRequestId) return
    receivableStore.selectOne(receivable)
    const adopted = await inspectFundingJournal(requestId, receivableId)
    if (!adopted && isCurrentSelection(requestId, receivableId)) {
      await refreshReadiness(requestId, receivableId)
    }
  } catch (error) {
    if (requestId !== selectionRequestId) return
    if (error.code === 'DEMO_RECEIVABLE_AMOUNT_LIMIT_EXCEEDED') {
      journalGate.value = 'blocked'
      journalMessage.value = '이전 고액 채권입니다. 판매기업으로 소액 채권을 새로 발행하세요.'
      return
    }
    journalGate.value = 'error'
    errorMessage.value = error.message ?? '펀딩 대상 채권을 불러오지 못했습니다.'
  }
}

async function refreshPage() {
  const receivableId = selectedReceivable.value?.receivableId
  selectionRequestId += 1
  clearMessages({ keepTransaction: Boolean(pendingSync.value) })
  isLoading.value = true
  try {
    await receivableStore.loadFundingOpportunities()
    if (pendingSync.value?.type === 'funded') {
      await loadPendingReceivable()
      return
    }
    if (
      receivableId &&
      opportunities.value.some((item) => sameId(item.receivableId, receivableId))
    ) {
      await selectOpportunity(receivableId)
    } else if (opportunities.value.length) {
      await selectOpportunity(opportunities.value[0].receivableId)
    } else {
      receivableStore.clearSelection()
      readiness.value = null
      resetFaucetReadiness()
      journalGate.value = 'clear'
    }
  } catch (error) {
    errorMessage.value = error.message ?? '최신 Funding 상태를 불러오지 못했습니다.'
  } finally {
    isLoading.value = false
  }
}

async function refreshReadiness(
  requestId = selectionRequestId,
  receivableId = selectedReceivable.value?.receivableId,
) {
  const receivable = selectedReceivable.value
  if (!isCurrentSelection(requestId, receivableId)) return
  if (!receivable || pendingSync.value) {
    resetFaucetReadiness()
    return
  }
  if (!walletStore.walletAddress) {
    readiness.value = null
    resetFaucetReadiness()
    throw new Error('Dashboard에서 Funder 회사 지갑을 먼저 연결해 주세요.')
  }

  resetFaucetReadiness()
  actionStage.value = '채권·NFT·잔액을 확인하고 있습니다...'
  try {
    const result = await getFundingReadiness(receivable, walletStore.walletAddress)
    if (!isCurrentSelection(requestId, receivableId)) return
    readiness.value = result
    journalGate.value = 'clear'
    journalMessage.value = '새 펀딩을 시작해도 되는 상태임을 확인했습니다.'
    await prepareFaucetClaim(
      walletStore.walletAddress,
      result.fundingAmount,
      result.hasSufficientBalance,
      { isCurrent: () => isCurrentSelection(requestId, receivableId) },
    )
    if (isCurrentSelection(requestId, receivableId) && faucetTxHash.value) {
      lastTxHash.value = faucetTxHash.value
    }
  } finally {
    if (isCurrentSelection(requestId, receivableId)) actionStage.value = ''
  }
}

async function refreshSelectedReadiness() {
  if (!selectedReceivable.value || isActionRunning.value) return

  clearMessages({ keepTransaction: true })
  isActionRunning.value = true
  try {
    await refreshReadiness()
  } catch (error) {
    errorMessage.value = error.message ?? '최신 mKRW 상태를 확인하지 못했습니다.'
  } finally {
    isActionRunning.value = false
  }
}

async function receiveDemoMkrw() {
  const receivable = selectedReceivable.value
  if (!receivable || !canClaimDemoMkrw.value) return

  clearMessages()
  isActionRunning.value = true
  actionStage.value =
    'MetaMask에서 데모 mKRW 수령을 확인해 주세요. 블록 확인 전에는 요청을 반복하지 마세요...'
  try {
    const result = await submitFaucetClaim(walletStore.walletAddress, receivable.fundingAmount, {
      onSubmitted: (submitted) => {
        lastTxHash.value = submitted.txHash
      },
    })
    lastTxHash.value = result.txHash
    successMessage.value = `데모 ${formatMkrw(result.claimAmount)} 충전 트랜잭션이 확인되었습니다.`

    try {
      await refreshReadiness()
      successMessage.value = readiness.value?.hasSufficientBalance
        ? `데모 ${formatMkrw(result.claimAmount)} 충전이 완료되었습니다. 이제 1단계 사용 승인을 진행해 주세요.`
        : `데모 ${formatMkrw(result.claimAmount)} 충전은 완료되었지만 선택한 채권의 필요 금액보다 잔액이 적습니다.`
    } catch (refreshError) {
      errorMessage.value = `충전 트랜잭션은 성공했습니다. 다시 전송하지 말고 최신 상태를 조회해 주세요. (${refreshError.message})`
    }
  } catch (error) {
    lastTxHash.value = error.txHash ?? lastTxHash.value
    errorMessage.value = error.message ?? '데모 mKRW 충전을 완료하지 못했습니다.'
  } finally {
    actionStage.value = ''
    isActionRunning.value = false
  }
}

async function approveMkrw() {
  const receivable = selectedReceivable.value
  if (!receivable || !canApprove.value) return

  clearMessages()
  isActionRunning.value = true
  actionStage.value = '1단계 · MetaMask에서 펀딩 금액을 승인해 주세요.'
  try {
    const result = await approveFundingAmount(receivable, walletStore.walletAddress)
    lastTxHash.value = result.txHash ?? ''
    await refreshReadiness()
    successMessage.value = result.alreadyApproved
      ? '승인 완료. 2단계 펀딩을 진행해 주세요.'
      : '승인 완료. 금액을 확인하고 2단계 펀딩을 눌러 주세요.'
  } catch (error) {
    lastTxHash.value = error.txHash ?? lastTxHash.value
    errorMessage.value = error.message ?? 'mKRW 사용 승인을 완료하지 못했습니다.'
  } finally {
    actionStage.value = ''
    isActionRunning.value = false
  }
}

async function startFunding() {
  const requestedReceivable = selectedReceivable.value
  const requestId = selectionRequestId
  if (!requestedReceivable || !canFund.value) return

  clearMessages()
  isActionRunning.value = true
  try {
    const adopted = await inspectFundingJournal(requestId, requestedReceivable.receivableId)
    if (
      adopted ||
      pendingSync.value ||
      !sameId(selectedReceivable.value?.receivableId, requestedReceivable.receivableId)
    ) {
      return
    }
    await refreshReadiness(requestId, requestedReceivable.receivableId)
    if (
      pendingSync.value ||
      journalGate.value !== 'clear' ||
      !isCurrentSelection(requestId, requestedReceivable.receivableId) ||
      !readiness.value?.hasSufficientBalance ||
      !readiness.value?.hasSufficientAllowance
    ) {
      return
    }

    actionStage.value = '2단계 · MetaMask 서명 후 mKRW 지급과 NFT 이전 블록을 기다리고 있습니다...'
    const result = await fundReceivableOnchain(
      requestedReceivable,
      walletStore.walletAddress,
      (submitted) => {
        savePendingSynchronization({
          type: 'funded',
          phase: 'submitted',
          receivableId: requestedReceivable.receivableId,
          companyId: currentCompanyId.value,
          payload: submitted,
        })
        lastTxHash.value = submitted.txHash
      },
    )
    savePendingSynchronization({
      type: 'funded',
      phase: 'confirmed',
      journalConfirmed: true,
      receivableId: requestedReceivable.receivableId,
      companyId: currentCompanyId.value,
      payload: {
        ...pendingSync.value?.payload,
        ...result,
      },
    })
    lastTxHash.value = result.txHash
    await synchronizePending()
  } catch (error) {
    lastTxHash.value = error.txHash ?? pendingSync.value?.payload?.txHash ?? ''
    clearTerminalPendingTransaction(error)
    errorMessage.value = error.message ?? '채권 자금 공급을 완료하지 못했습니다.'
  } finally {
    actionStage.value = ''
    isActionRunning.value = false
  }
}

async function inspectFundingJournal(
  requestId = selectionRequestId,
  receivableId = selectedReceivable.value?.receivableId,
) {
  const receivable = selectedReceivable.value
  if (!receivable || pendingSync.value || !isCurrentSelection(requestId, receivableId)) {
    return Boolean(pendingSync.value)
  }

  journalGate.value = 'checking'
  journalMessage.value =
    '서버의 기존 펀딩 이력을 확인하고 있습니다. 확인 전에는 새 자금 공급을 시작할 수 없습니다.'
  try {
    const transactions = await getReceivableBlockchainTransactions(receivable.receivableId)
    if (!isCurrentSelection(requestId, receivableId)) return true
    const fundingTransactions = transactions.filter(
      (transaction) => transaction?.transactionType === FUND_TRANSACTION_TYPE,
    )
    const confirmed = fundingTransactions.find(
      (transaction) => transaction?.txStatus === 'CONFIRMED',
    )
    const pending = fundingTransactions.find((transaction) => transaction?.txStatus === 'PENDING')
    const journal = confirmed ?? pending

    if (!journal) {
      const unknown = fundingTransactions.some((transaction) => transaction?.txStatus !== 'FAILED')
      if (unknown) {
        journalGate.value = 'blocked'
        journalMessage.value =
          '상태를 판별할 수 없는 기존 펀딩 이력이 있어 새 트랜잭션을 차단했습니다.'
        return true
      }
      journalGate.value = 'clear'
      journalMessage.value = '진행 중이거나 성공한 기존 펀딩 트랜잭션이 없습니다.'
      return false
    }
    if (!isValidFundingJournal(journal, receivable)) {
      journalGate.value = 'blocked'
      journalMessage.value =
        '기존 펀딩 이력의 회사·지갑·컨트랙트 정보가 현재 로그인 정보와 일치하지 않아 새 트랜잭션을 차단했습니다.'
      return true
    }

    savePendingSynchronization({
      type: 'funded',
      phase: journal.txStatus === 'CONFIRMED' ? 'confirmed' : 'submitted',
      journalConfirmed: journal.txStatus === 'CONFIRMED',
      recoveredFromServerJournal: true,
      receivableId: receivable.receivableId,
      companyId: currentCompanyId.value,
      payload: {
        txHash: journal.txHash,
        contractAddress: journal.contractAddress,
        funderWalletAddress: journal.walletAddress,
      },
    })
    lastTxHash.value = journal.txHash
    journalGate.value = 'adopted'
    journalMessage.value =
      journal.txStatus === 'CONFIRMED'
        ? '이미 성공한 펀딩을 찾았습니다. MetaMask를 다시 호출하지 말고 서버 반영 재시도만 진행해 주세요.'
        : '이미 진행 중인 펀딩을 찾았습니다. 새 트랜잭션을 보내지 말고 기존 블록 확인을 이어가 주세요.'
    return true
  } catch (error) {
    if (!isCurrentSelection(requestId, receivableId)) return true
    journalGate.value = 'error'
    journalMessage.value = `기존 펀딩 이력을 확인하지 못해 새 트랜잭션을 차단했습니다. (${error.message})`
    return true
  }
}

async function retryPending() {
  if (!pendingSync.value) return
  clearMessages({ keepTransaction: true })
  isActionRunning.value = true
  try {
    if (pendingSync.value.phase === 'submitted') {
      await resumePendingConfirmation()
    } else {
      await synchronizePending()
    }
  } finally {
    isActionRunning.value = false
  }
}

async function resumePendingConfirmation() {
  const synchronization = pendingSync.value
  const receivable = selectedReceivable.value
  if (!synchronization || !receivable) return

  actionStage.value = '기존 펀딩 트랜잭션의 블록 확인을 이어받고 있습니다...'
  try {
    const result = await resumeReceivableTransaction(receivable, synchronization, (submitted) => {
      savePendingSynchronization({
        ...synchronization,
        payload: {
          ...synchronization.payload,
          ...submitted,
        },
      })
      lastTxHash.value = submitted.txHash
    })
    savePendingSynchronization({
      ...synchronization,
      phase: 'confirmed',
      journalConfirmed: true,
      payload: {
        ...synchronization.payload,
        ...result,
      },
    })
    lastTxHash.value = result.txHash
    await synchronizePending()
  } catch (error) {
    lastTxHash.value = error.txHash ?? synchronization.payload?.txHash ?? ''
    clearTerminalPendingTransaction(error)
    errorMessage.value = error.message ?? '기존 펀딩 트랜잭션을 확인하지 못했습니다.'
  } finally {
    actionStage.value = ''
  }
}

async function synchronizePending() {
  const synchronization = pendingSync.value
  if (!synchronization) return
  if (synchronization.phase !== 'confirmed') {
    await resumePendingConfirmation()
    return
  }

  actionStage.value = '온체인 펀딩 확인 완료 · 서버 상태를 FUNDED로 동기화하고 있습니다...'
  try {
    const funded = await receivableStore.markFunded(synchronization.receivableId, {
      txHash: synchronization.payload.txHash,
    })
    clearPendingSynchronization()
    journalGate.value = 'clear'
    readiness.value = null
    resetFaucetReadiness()
    lastTxHash.value = funded.fundingTxHash
    successMessage.value =
      '자금 공급이 완료되었습니다. Seller에게 mKRW가 지급되고 채권 NFT가 Funder 지갑으로 이전되었습니다.'
  } catch (error) {
    clearTerminalPendingTransaction(error)
    errorMessage.value = `${error.message} 온체인 트랜잭션을 다시 보내지 말고 서버 반영 재시도를 재시도해 주세요.`
  } finally {
    actionStage.value = ''
  }
}

function isValidFundingJournal(journal, receivable) {
  return (
    sameId(journal?.receivableId, receivable.receivableId) &&
    sameId(journal?.companyId, currentCompanyId.value) &&
    sameHex(journal?.walletAddress, walletStore.walletAddress) &&
    sameHex(journal?.contractAddress, receivable.contractAddress) &&
    journal?.functionName === 'fundReceivable' &&
    /^0x[a-fA-F0-9]{64}$/.test(journal?.txHash ?? '')
  )
}

function readPendingSynchronization(companyId) {
  if (companyId == null) return null
  try {
    const synchronizations = JSON.parse(localStorage.getItem(PENDING_SYNC_STORAGE_KEY) ?? '{}')
    return synchronizations[String(companyId)] ?? null
  } catch {
    localStorage.removeItem(PENDING_SYNC_STORAGE_KEY)
    return null
  }
}

function savePendingSynchronization(synchronization) {
  const companyId = synchronization.companyId ?? currentCompanyId.value
  if (companyId == null) return
  let synchronizations
  try {
    synchronizations = JSON.parse(localStorage.getItem(PENDING_SYNC_STORAGE_KEY) ?? '{}')
  } catch {
    synchronizations = {}
  }
  const saved = { ...synchronization, companyId }
  synchronizations[String(companyId)] = saved
  localStorage.setItem(PENDING_SYNC_STORAGE_KEY, JSON.stringify(synchronizations))
  pendingSync.value = saved
}

function clearPendingSynchronization() {
  const companyId = pendingSync.value?.companyId ?? currentCompanyId.value
  try {
    const synchronizations = JSON.parse(localStorage.getItem(PENDING_SYNC_STORAGE_KEY) ?? '{}')
    if (companyId != null) {
      delete synchronizations[String(companyId)]
    }
    if (Object.keys(synchronizations).length) {
      localStorage.setItem(PENDING_SYNC_STORAGE_KEY, JSON.stringify(synchronizations))
    } else {
      localStorage.removeItem(PENDING_SYNC_STORAGE_KEY)
    }
  } catch {
    localStorage.removeItem(PENDING_SYNC_STORAGE_KEY)
  }
  pendingSync.value = null
}

function clearTerminalPendingTransaction(error) {
  const terminalCodes = new Set([
    'TRANSACTION_FAILED',
    'TRANSACTION_CANCELLED',
    'BLOCKCHAIN_TRANSACTION_FAILED',
    'BLOCKCHAIN_TRANSACTION_REVERTED',
    'BLOCKCHAIN_TRANSACTION_VERIFICATION_FAILED',
    'BLOCKCHAIN_EVENT_MISMATCH',
  ])
  if (!terminalCodes.has(error?.code)) return false
  clearPendingSynchronization()
  journalGate.value = 'clear'
  return true
}

function clearMessages({ keepTransaction = false } = {}) {
  errorMessage.value = ''
  successMessage.value = ''
  actionStage.value = ''
  if (!keepTransaction) lastTxHash.value = ''
}

function sameId(first, second) {
  return first != null && second != null && String(first) === String(second)
}

function isCurrentSelection(requestId, receivableId) {
  return (
    requestId === selectionRequestId && sameId(selectedReceivable.value?.receivableId, receivableId)
  )
}

function sameHex(first, second) {
  return (
    typeof first === 'string' &&
    typeof second === 'string' &&
    first.toLowerCase() === second.toLowerCase()
  )
}

function formatAmount(value) {
  if (value == null || value === '') return '-'
  try {
    return `${BigInt(value).toLocaleString('ko-KR')} mKRW`
  } catch {
    return `${value} mKRW`
  }
}

function formatNumber(value) {
  if (value == null || value === '') return '-'
  try {
    return BigInt(value).toLocaleString('ko-KR')
  } catch {
    return String(value)
  }
}

function formatMkrw(value) {
  return `${formatNumber(value)} mKRW`
}

function shortAddress(value) {
  if (!value) return '-'
  return `${value.slice(0, 8)}…${value.slice(-6)}`
}
</script>

<template>
  <main class="funding-page">
    <header class="page-header">
      <div>
        <p class="eyebrow">
          <HandCoins :size="16" :stroke-width="1.8" aria-hidden="true" />
          펀딩 마켓
        </p>
        <h1>채권 펀딩</h1>
        <p>mKRW를 지급하고 채권 NFT를 받습니다.</p>
      </div>
      <nav>
        <button type="button" class="secondary" @click="router.push({ name: 'dashboard' })">
          <LayoutDashboard :size="16" :stroke-width="1.8" aria-hidden="true" />
          대시보드
        </button>
        <button type="button" class="secondary" @click="router.push({ name: 'receivables' })">
          <Files :size="16" :stroke-width="1.8" aria-hidden="true" />
          매출채권 관리
        </button>
        <button type="button" :disabled="isLoading || isActionRunning" @click="refreshPage">
          <RefreshCw
            :size="16"
            :stroke-width="1.8"
            :class="{ 'icon-spin': isLoading }"
            aria-hidden="true"
          />
          {{ isLoading ? '조회 중...' : '최신 상태 조회' }}
        </button>
      </nav>
    </header>

    <div v-if="amountHint" class="notice progress" role="note">{{ amountHint }}</div>

    <div v-if="errorMessage" class="notice error" role="alert">
      <TriangleAlert :size="18" :stroke-width="1.8" aria-hidden="true" />
      <span>{{ errorMessage }}</span>
    </div>
    <div v-if="successMessage" class="notice success" role="status">
      <Check :size="18" :stroke-width="2" aria-hidden="true" />
      <span>{{ successMessage }}</span>
    </div>
    <div v-if="actionStage" class="notice progress" role="status">
      <LoaderCircle :size="18" :stroke-width="1.8" class="icon-spin" aria-hidden="true" />
      <span>{{ actionStage }}</span>
    </div>

    <section class="workspace" :aria-busy="isLoading">
      <aside class="opportunity-panel">
        <div class="panel-heading">
          <h2>펀딩 가능 채권</h2>
          <span v-if="hasLoadedOpportunities">{{ opportunities.length }}</span>
        </div>
        <p v-if="isLoading" class="empty loading-state" role="status">
          펀딩 가능 채권을 불러오고 있습니다...
        </p>
        <p v-else-if="!hasLoadedOpportunities" class="empty">다시 조회해 주세요.</p>
        <p v-else-if="!opportunities.length" class="empty">
          현재 펀딩 가능한 TOKENIZED 채권이 없습니다.
        </p>
        <button
          v-for="receivable in opportunities"
          v-show="hasLoadedOpportunities && !isLoading"
          :key="receivable.receivableId"
          type="button"
          class="opportunity-card"
          :class="{
            selected: sameId(receivable.receivableId, selectedReceivable?.receivableId),
          }"
          :aria-pressed="sameId(receivable.receivableId, selectedReceivable?.receivableId)"
          :disabled="isActionRunning || Boolean(pendingSync)"
          @click="selectOpportunity(receivable.receivableId)"
        >
          <span class="opportunity-meta">
            <span>{{ formatReceivableIdentity(receivable) }}</span>
            <ChevronRight :size="16" :stroke-width="1.8" aria-hidden="true" />
          </span>
          <strong>
            {{ displayCompanyName(receivable.sellerCompanyName) }} →
            {{ displayCompanyName(receivable.buyerCompanyName) }}
          </strong>
          <span>필요 자금 {{ formatAmount(receivable.fundingAmount) }}</span>
          <small>만기 {{ receivable.maturityDate }}</small>
        </button>
      </aside>

      <article v-if="isLoading" class="detail-panel empty-detail loading-state" role="status">
        <h2>펀딩 정보 확인 중</h2>
        <p>채권과 거래를 확인하고 있습니다...</p>
      </article>

      <article v-else-if="hasLoadedOpportunities && selectedReceivable" class="detail-panel">
        <div class="detail-heading">
          <div>
            <span class="status">{{ selectedReceivable.status }}</span>
            <h2>{{ formatReceivableIdentity(selectedReceivable) }}</h2>
          </div>
          <span class="wallet-label">
            <Wallet :size="16" :stroke-width="1.8" aria-hidden="true" />
            Funder 지갑 {{ shortAddress(walletStore.walletAddress) }}
          </span>
        </div>

        <dl class="terms">
          <div>
            <dt>Seller</dt>
            <dd>{{ displayCompanyName(selectedReceivable.sellerCompanyName) }}</dd>
          </div>
          <div>
            <dt>Buyer</dt>
            <dd>{{ displayCompanyName(selectedReceivable.buyerCompanyName) }}</dd>
          </div>
          <div>
            <dt>채권 금액</dt>
            <dd>{{ formatAmount(selectedReceivable.faceValue) }}</dd>
          </div>
          <div>
            <dt>공급할 금액</dt>
            <dd>{{ formatAmount(selectedReceivable.fundingAmount) }}</dd>
          </div>
          <div>
            <dt>예상 차액</dt>
            <dd>{{ formatAmount(expectedReturn) }}</dd>
          </div>
          <div>
            <dt>만기일</dt>
            <dd>{{ selectedReceivable.maturityDate }}</dd>
          </div>
          <div>
            <dt>NFT</dt>
            <dd>#{{ selectedReceivable.tokenId }}</dd>
          </div>
          <div>
            <dt>문서 해시</dt>
            <dd class="hash">{{ selectedReceivable.documentHash || '등록되지 않음' }}</dd>
          </div>
        </dl>

        <section
          v-if="isMidnightPocEnabled && selectedReceivable.status === 'TOKENIZED'"
          class="proof-request-card"
          aria-labelledby="funding-proof-request-title"
        >
          <div class="callout-heading">
            <ShieldCheck :size="18" :stroke-width="1.8" aria-hidden="true" />
            <h3 id="funding-proof-request-title">Seller / Buyer 재무 기준 확인</h3>
          </div>
          <p>펀딩 전 Seller·Buyer의 재무 기준 충족 여부를 확인하세요.</p>
          <button
            type="button"
            class="secondary"
            @click="
              router.push({
                name: 'midnight',
                query: { receivableId: String(selectedReceivable.receivableId) },
              })
            "
          >
            <ShieldCheck :size="16" :stroke-width="1.8" aria-hidden="true" />
            이 채권 재무 ZK 검증 요청
          </button>
        </section>

        <section v-if="selectedReceivable.status === 'FUNDED'" class="completed-card" role="status">
          <div class="callout-heading">
            <Check :size="18" :stroke-width="2" aria-hidden="true" />
            <h3>Funding 완료</h3>
          </div>
          <p>mKRW 지급과 NFT 이전을 확인했습니다.</p>
        </section>

        <section v-else-if="pendingForSelected" class="recovery-card" role="alert">
          <div class="callout-heading">
            <RotateCcw :size="18" :stroke-width="1.8" aria-hidden="true" />
            <h3>기존 펀딩 작업을 먼저 완료해 주세요</h3>
          </div>
          <p>{{ journalMessage }}</p>
          <button type="button" :disabled="isActionRunning" @click="retryPending">
            <RotateCcw :size="16" :stroke-width="1.8" aria-hidden="true" />
            {{ isActionRunning ? '처리 중...' : retryButtonLabel }}
          </button>
        </section>

        <section v-else class="funding-steps">
          <div
            v-if="journalGate !== 'clear'"
            class="journal-gate"
            :class="{ blocked: journalGate === 'blocked' || journalGate === 'error' }"
          >
            <div class="callout-heading">
              <ShieldCheck :size="18" :stroke-width="1.8" aria-hidden="true" />
              <strong>기존 트랜잭션 안전 점검</strong>
            </div>
            <p>{{ journalMessage }}</p>
            <button
              v-if="journalGate === 'error'"
              type="button"
              class="secondary"
              @click="selectOpportunity(selectedReceivable.receivableId)"
            >
              <RefreshCw :size="16" :stroke-width="1.8" aria-hidden="true" />
              이력 다시 조회
            </button>
          </div>

          <template v-if="readiness">
            <div class="balance-grid">
              <div>
                <span>필요 mKRW</span>
                <strong>{{ formatAmount(readiness.fundingAmount) }}</strong>
              </div>
              <div>
                <span>내 mKRW 잔액</span>
                <strong>{{ formatAmount(readiness.balance) }}</strong>
              </div>
              <div>
                <span>현재 승인액</span>
                <strong>{{ formatAmount(readiness.allowance) }}</strong>
              </div>
            </div>

            <section
              v-if="!readiness.hasSufficientBalance"
              class="faucet-card"
              aria-labelledby="faucet-title"
            >
              <div class="faucet-heading">
                <div class="callout-heading">
                  <Coins :size="18" :stroke-width="1.8" aria-hidden="true" />
                  <h3 id="faucet-title">데모 mKRW 충전</h3>
                </div>
                <span class="demo-badge">테스트넷 전용</span>
              </div>
              <p class="faucet-intro">
                펀딩에 필요한 mKRW가 부족합니다. 등록된 Funder 지갑의 수령 가능 여부를 확인해 사전
                예치된 데모 토큰을 지급합니다. 새로운 mKRW를 발행하는 작업은 아닙니다.
              </p>

              <p v-if="isFaucetLoading" class="faucet-status" role="status">
                <LoaderCircle :size="17" :stroke-width="1.8" class="icon-spin" aria-hidden="true" />
                데모 mKRW 충전 가능 여부를 확인하고 있습니다...
              </p>

              <template v-else-if="faucetErrorMessage">
                <div class="faucet-status error" role="alert">
                  <TriangleAlert :size="17" :stroke-width="1.8" aria-hidden="true" />
                  <span>{{ faucetErrorMessage }}</span>
                </div>
                <div class="faucet-actions">
                  <button
                    type="button"
                    class="secondary"
                    :disabled="isActionRunning || isFaucetLoading"
                    @click="refreshSelectedReadiness"
                  >
                    <RefreshCw :size="16" :stroke-width="1.8" aria-hidden="true" />
                    충전 상태 다시 조회
                  </button>
                </div>
              </template>

              <template v-else-if="faucetReadiness">
                <div class="faucet-stats">
                  <div>
                    <span>지갑당 1회 지급</span>
                    <strong>{{ formatMkrw(faucetReadiness.claimAmount) }}</strong>
                  </div>
                  <div>
                    <span>현재 Faucet 재고</span>
                    <strong>{{ formatMkrw(faucetReadiness.faucetBalance) }}</strong>
                  </div>
                </div>

                <p v-if="faucetClaimUncertain" class="faucet-status warning" role="alert">
                  <TriangleAlert :size="17" :stroke-width="1.8" aria-hidden="true" />
                  제출된 충전 트랜잭션을 확인하거나 최신 잔액에 반영하고 있습니다. 요청을 다시
                  보내지 말고 Explorer와 최신 상태를 확인해 주세요.
                </p>
                <p
                  v-else-if="faucetReadiness.hasClaimed"
                  class="faucet-status warning"
                  role="status"
                >
                  <Check :size="17" :stroke-width="2" aria-hidden="true" />
                  이 지갑은 데모 mKRW 충전을 이미 한 번 사용했습니다. 현재 잔액으로 펀딩 가능한 다른
                  채권을 선택해 주세요.
                </p>
                <p
                  v-else-if="!faucetReadiness.hasInventory"
                  class="faucet-status error"
                  role="alert"
                >
                  <TriangleAlert :size="17" :stroke-width="1.8" aria-hidden="true" />
                  데모 mKRW 충전 재고가 소진되었습니다. 현재 자동 충전을 이용할 수 없습니다.
                </p>
                <p
                  v-else-if="!faucetReadiness.willCoverRequiredAmount"
                  class="faucet-status warning"
                  role="alert"
                >
                  <TriangleAlert :size="17" :stroke-width="1.8" aria-hidden="true" />
                  한 번 충전해도 선택한 채권의 펀딩 금액에 미치지 않아 수령을 차단했습니다.
                </p>
                <p
                  v-else-if="!faucetReadiness.hasNativeGas"
                  class="faucet-status warning"
                  role="alert"
                >
                  <TriangleAlert :size="17" :stroke-width="1.8" aria-hidden="true" />
                  수령 트랜잭션에 필요한 테스트넷 가스 토큰가 없습니다. 테스트 ETH를 받은 뒤 최신
                  상태를 조회해 주세요.
                </p>
                <p v-else class="faucet-status available" role="status">
                  <Check :size="17" :stroke-width="2" aria-hidden="true" />
                  이 지갑은 데모 mKRW를 충전할 수 있습니다. 충전 후 잔액을 자동으로 다시 확인합니다.
                </p>

                <div class="faucet-actions">
                  <button
                    v-if="faucetReadiness.canClaim && !faucetClaimUncertain"
                    type="button"
                    :disabled="!canClaimDemoMkrw"
                    @click="receiveDemoMkrw"
                  >
                    <Coins :size="16" :stroke-width="1.8" aria-hidden="true" />
                    MetaMask로 {{ formatMkrw(faucetReadiness.claimAmount) }} 받기
                  </button>
                  <button
                    type="button"
                    class="secondary"
                    :disabled="isActionRunning || isFaucetLoading"
                    @click="refreshSelectedReadiness"
                  >
                    <RefreshCw :size="16" :stroke-width="1.8" aria-hidden="true" />
                    충전 상태 다시 조회
                  </button>
                </div>

                <p class="gas-note">
                  수령·승인·펀딩에는 테스트넷 가스 토큰가 필요합니다.
                  <a
                    href="https://docs.giwa.io/get-started/faucets"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    테스트 ETH 받는 방법
                    <ExternalLink :size="14" :stroke-width="1.8" aria-hidden="true" />
                  </a>
                </p>
              </template>
            </section>

            <ol class="workflow-timeline" aria-label="펀딩 진행 단계">
              <li
                class="workflow-step"
                :class="{
                  'is-complete': readiness.hasSufficientAllowance,
                  'is-active': canApprove,
                }"
              >
                <span class="workflow-marker" aria-hidden="true">
                  <Check v-if="readiness.hasSufficientAllowance" :size="16" :stroke-width="2" />
                  <span v-else>1</span>
                </span>
                <div class="workflow-content">
                  <span class="step-label">1단계</span>
                  <h3>mKRW 사용 승인</h3>
                  <p>{{ formatAmount(readiness.fundingAmount) }}만 사용 승인합니다.</p>
                  <button type="button" :disabled="!canApprove" @click="approveMkrw">
                    <Check
                      v-if="readiness.hasSufficientAllowance"
                      :size="16"
                      :stroke-width="2"
                      aria-hidden="true"
                    />
                    <Wallet v-else :size="16" :stroke-width="1.8" aria-hidden="true" />
                    {{
                      readiness.hasSufficientAllowance ? '승인 완료' : 'MetaMask로 mKRW 사용 승인'
                    }}
                  </button>
                </div>
              </li>

              <li class="workflow-step" :class="{ 'is-active': canFund }">
                <span class="workflow-marker" aria-hidden="true">2</span>
                <div class="workflow-content">
                  <span class="step-label">2단계</span>
                  <h3>채권 자금 공급</h3>
                  <p>Seller에게 지급하고 NFT를 받습니다. 아래 버튼으로 직접 실행합니다.</p>
                  <button type="button" :disabled="!canFund" @click="startFunding">
                    <HandCoins :size="16" :stroke-width="1.8" aria-hidden="true" />
                    MetaMask로 자금 공급
                  </button>
                </div>
              </li>
            </ol>
          </template>
        </section>

        <a
          v-if="transactionExplorerUrl(lastTxHash)"
          class="explorer-link"
          :href="transactionExplorerUrl(lastTxHash)"
          target="_blank"
          rel="noopener noreferrer"
        >
          <ExternalLink :size="16" :stroke-width="1.8" aria-hidden="true" />
          Explorer에서 트랜잭션 확인
        </a>
      </article>

      <article v-else class="detail-panel empty-detail">
        <h2>{{ hasLoadedOpportunities ? '펀딩 대상 없음' : '펀딩 대상 조회 실패' }}</h2>
        <p>
          {{
            hasLoadedOpportunities
              ? 'Buyer 검증과 NFT 발행이 끝난 채권이 표시됩니다.'
              : '다시 조회해 주세요.'
          }}
        </p>
      </article>
    </section>
  </main>
</template>

<style scoped>
.funding-page {
  --primary: var(--color-action);
  --primary-soft: var(--color-brand-soft);
  --ink: var(--color-text);
  --text: var(--color-text);
  --muted: var(--color-text-muted);
  --border: var(--color-border);
  --border-strong: var(--color-border-strong);
  --surface: var(--color-surface);
  --subtle: var(--color-canvas);

  min-height: 100%;
  padding: 32px;
  background: var(--subtle);
  color: var(--ink);
}

.page-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  max-width: var(--content-width, 1200px);
  margin: 0 auto 24px;
  gap: 24px;
}

.eyebrow {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  margin: 0;
  color: var(--color-brand);
  font-size: 14px;
  font-weight: 650;
}

h1 {
  margin: 8px 0;
  font-size: 32px;
  font-weight: 700;
  line-height: 1.25;
  letter-spacing: -0.03em;
}

h2,
h3,
p {
  margin-top: 0;
}

h2 {
  color: var(--ink);
  font-size: 20px;
  font-weight: 700;
  line-height: 1.35;
}

h3 {
  color: var(--ink);
  font-size: 16px;
  font-weight: 700;
  line-height: 1.4;
}

.page-header p {
  max-width: 720px;
  margin-bottom: 0;
  color: var(--muted);
  line-height: 1.6;
}

nav {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 8px;
}

button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  min-height: 40px;
  border: 0;
  border-radius: 8px;
  padding: 8px 16px;
  background: var(--primary);
  color: var(--color-on-action);
  cursor: pointer;
  font-weight: 650;
  transition:
    border-color 0.16s ease,
    background-color 0.16s ease,
    color 0.16s ease;
}

button:not(.opportunity-card):not(.secondary):hover:not(:disabled) {
  background: var(--primary);
  filter: brightness(0.9);
}

button.secondary {
  border: 1px solid var(--border-strong);
  background: var(--surface);
  color: var(--text);
}

button.secondary:hover:not(:disabled) {
  border-color: var(--color-border-strong);
  background: var(--subtle);
}

button:focus-visible {
  outline: 2px solid var(--color-focus);
  outline-offset: 2px;
}

button:disabled {
  cursor: not-allowed;
  opacity: 0.5;
}

.notice {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  max-width: var(--content-width, 1200px);
  margin: 0 auto 16px;
  padding: 16px;
  border-radius: 8px;
  overflow-wrap: anywhere;
  font-size: 14px;
  line-height: 1.55;
}

.notice svg {
  flex: 0 0 auto;
}

.notice.error {
  border: 1px solid var(--color-danger-border);
  background: var(--color-danger-soft);
  color: var(--color-danger);
}

.notice.success {
  border: 1px solid var(--color-focus);
  background: var(--primary-soft);
  color: var(--color-success);
}

.notice.progress {
  border: 1px solid var(--border-strong);
  background: var(--surface);
  color: var(--text);
}

.icon-spin {
  animation: funding-icon-spin 0.8s linear infinite;
}

@keyframes funding-icon-spin {
  to {
    transform: rotate(360deg);
  }
}

.workspace {
  display: grid;
  grid-template-columns: minmax(280px, 360px) minmax(0, 1fr);
  align-items: start;
  overflow: hidden;
  max-width: var(--content-width, 1200px);
  min-height: 640px;
  margin: 0 auto;
  border: 1px solid var(--border);
  border-radius: 12px;
  background: var(--surface);
}

.opportunity-panel,
.detail-panel {
  border: 0;
  border-radius: 0;
  background: transparent;
}

.opportunity-panel {
  display: flex;
  flex-direction: column;
  align-self: stretch;
  padding: 24px 0;
  border-right: 1px solid var(--border);
}

.panel-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  margin: 0 24px 16px;
}

.panel-heading h2 {
  margin: 0;
}

.panel-heading > span {
  display: inline-grid;
  place-items: center;
  min-width: 24px;
  min-height: 24px;
  border-radius: 999px;
  padding: 0 8px;
  background: var(--subtle);
  color: var(--muted);
  font-size: 12px;
  font-weight: 700;
  text-align: center;
}

.opportunity-card {
  position: relative;
  display: grid;
  width: 100%;
  margin: 0;
  gap: 8px;
  padding: 16px 24px;
  border: 0;
  border-top: 1px solid var(--border);
  border-radius: 0;
  background: transparent;
  color: var(--text);
  line-height: 1.45;
  text-align: left;
}

.opportunity-card:hover:not(:disabled):not(.selected) {
  background: var(--subtle);
}

.opportunity-card.selected {
  border-left: 2px solid var(--primary);
  background: var(--primary-soft);
  color: var(--ink);
}

.opportunity-card strong {
  color: var(--ink);
  font-weight: 700;
}

.opportunity-meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  color: var(--muted);
  font-size: 12px;
  font-weight: 700;
}

.opportunity-meta svg {
  flex: 0 0 auto;
  color: var(--muted);
}

.opportunity-card.selected .opportunity-meta svg {
  color: var(--color-brand);
}

.opportunity-card small {
  color: var(--muted);
}

.empty {
  margin: 0 24px;
  padding: 16px 0;
  color: var(--muted);
  line-height: 1.6;
}

.loading-state {
  color: var(--text);
}

.detail-panel {
  min-width: 0;
  padding: 32px;
}

.detail-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 16px;
  margin-bottom: 24px;
}

.detail-heading h2 {
  margin: 8px 0 0;
}

.status {
  display: inline-flex;
  align-items: center;
  min-height: 24px;
  border-radius: 999px;
  padding: 0 8px;
  background: var(--primary-soft);
  color: var(--color-brand);
  font-size: 12px;
  font-weight: 700;
}

.wallet-label {
  display: inline-flex;
  align-items: center;
  max-width: 100%;
  overflow: hidden;
  gap: 8px;
  border-radius: 999px;
  padding: 8px 16px;
  background: var(--subtle);
  color: var(--text);
  font-size: 13px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.wallet-label svg {
  flex: 0 0 auto;
  color: var(--color-brand);
}

.terms {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  column-gap: 32px;
  row-gap: 0;
  margin: 0 0 24px;
}

.terms div {
  min-width: 0;
  border-bottom: 1px solid var(--border);
  padding: 16px 0;
}

.terms dt {
  color: var(--muted);
  font-size: 13px;
  font-weight: 600;
}

.terms dd {
  margin: 8px 0 0;
  color: var(--ink);
  font-weight: 650;
  line-height: 1.5;
  font-variant-numeric: tabular-nums;
}

.hash {
  overflow-wrap: anywhere;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 12px;
}

.funding-steps,
.recovery-card {
  display: grid;
  gap: 24px;
}

.balance-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 0;
  border-top: 1px solid var(--border);
  border-bottom: 1px solid var(--border);
}

.balance-grid div {
  display: grid;
  gap: 8px;
  min-height: 80px;
  padding: 16px;
  background: transparent;
}

.balance-grid div + div {
  border-left: 1px solid var(--border);
}

.balance-grid span,
.step-label {
  color: var(--muted);
  font-size: 12px;
  font-weight: 700;
}

.balance-grid strong {
  color: var(--ink);
  font-size: 17px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}

.journal-gate,
.recovery-card,
.completed-card {
  display: grid;
  gap: 8px;
  border: 1px solid var(--border);
  border-left: 3px solid var(--border-strong);
  border-radius: 8px;
  padding: 16px;
  line-height: 1.6;
}

.proof-request-card {
  display: grid;
  gap: 12px;
  margin-bottom: 18px;
  padding: 18px;
  border: 1px solid var(--color-brand-border);
  border-radius: 14px;
  background: var(--color-brand-soft);
}

.proof-request-card h3,
.proof-request-card p {
  margin: 0;
}

.proof-request-card p {
  color: var(--text);
  line-height: 1.65;
}

.proof-request-card button {
  justify-self: start;
}

.journal-gate p,
.recovery-card h3,
.recovery-card p,
.completed-card h3,
.completed-card p {
  margin: 0;
}

.journal-gate button,
.recovery-card button {
  width: fit-content;
  margin-top: 8px;
}

.journal-gate p,
.recovery-card p {
  color: var(--muted);
}

.journal-gate {
  background: var(--subtle);
}

.journal-gate.blocked {
  border-color: var(--color-danger-border);
  border-left-color: var(--color-danger-border);
  background: var(--color-danger-soft);
}

.recovery-card {
  border-color: var(--color-warning-border);
  border-left-color: var(--color-warning-border);
  background: var(--color-warning-soft);
}

.completed-card {
  border-color: var(--color-focus);
  border-left-color: var(--color-brand);
  background: var(--primary-soft);
}

.completed-card p {
  color: var(--text);
}

.callout-heading {
  display: flex;
  align-items: center;
  gap: 8px;
}

.callout-heading svg {
  flex: 0 0 auto;
}

.completed-card .callout-heading,
.completed-card .callout-heading h3 {
  color: var(--color-brand);
}

.faucet-card {
  display: grid;
  gap: 16px;
  border: 1px solid var(--color-warning-border);
  border-left: 3px solid var(--color-warning-border);
  border-radius: 8px;
  padding: 16px;
  background: var(--color-warning-soft);
  color: var(--text);
  line-height: 1.55;
}

.faucet-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 12px;
}

.faucet-heading h3,
.faucet-intro,
.faucet-status,
.gas-note {
  margin: 0;
}

.faucet-heading .callout-heading,
.faucet-heading h3 {
  color: var(--color-warning);
}

.demo-badge {
  display: inline-flex;
  align-items: center;
  min-height: 24px;
  border-radius: 999px;
  padding: 0 8px;
  background: var(--color-warning-soft);
  color: var(--color-warning);
  font-size: 12px;
  font-weight: 700;
}

.faucet-intro {
  color: var(--text);
}

.faucet-stats {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  overflow: hidden;
  border: 1px solid var(--color-warning-border);
  border-radius: 8px;
  background: var(--surface);
}

.faucet-stats div {
  display: grid;
  gap: 4px;
  padding: 12px;
}

.faucet-stats div + div {
  border-left: 1px solid var(--color-warning-border);
}

.faucet-stats span {
  color: var(--muted);
  font-size: 12px;
  font-weight: 700;
}

.faucet-stats strong {
  color: var(--ink);
  font-variant-numeric: tabular-nums;
}

.faucet-status {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  border-radius: 8px;
  padding: 12px;
  background: var(--surface);
  color: var(--text);
}

.faucet-status svg,
.gas-note svg {
  flex: 0 0 auto;
}

.faucet-status.error {
  border: 1px solid var(--color-danger-border);
  background: var(--color-danger-soft);
  color: var(--color-danger);
}

.faucet-status.warning {
  border: 1px solid var(--color-warning-border);
  color: var(--color-warning);
}

.faucet-status.available {
  border: 1px solid var(--color-focus);
  background: var(--primary-soft);
  color: var(--color-brand);
}

.faucet-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.gas-note {
  color: var(--muted);
  font-size: 13px;
}

.gas-note a {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  margin-left: 4px;
  color: var(--color-brand);
  font-weight: 650;
  text-underline-offset: 3px;
}

.gas-note a:focus-visible {
  border-radius: 4px;
  outline: 2px solid var(--color-focus);
  outline-offset: 2px;
}

.workflow-timeline {
  display: grid;
  margin: 0;
  padding: 0;
  list-style: none;
}

.workflow-step {
  position: relative;
  display: grid;
  grid-template-columns: 32px minmax(0, 1fr);
  gap: 16px;
  padding-bottom: 32px;
}

.workflow-step:last-child {
  padding-bottom: 0;
}

.workflow-step:not(:last-child)::after {
  content: '';
  position: absolute;
  top: 32px;
  bottom: 0;
  left: 15px;
  width: 1px;
  background: var(--border);
}

.workflow-step.is-complete:not(:last-child)::after {
  background: var(--color-brand-soft);
}

.workflow-marker {
  z-index: 1;
  display: grid;
  place-items: center;
  width: 32px;
  height: 32px;
  border: 1px solid var(--border-strong);
  border-radius: 999px;
  background: var(--surface);
  color: var(--muted);
  font-size: 12px;
  font-weight: 700;
}

.workflow-step.is-active .workflow-marker {
  border-color: var(--color-brand);
  color: var(--color-brand);
}

.workflow-step.is-complete .workflow-marker {
  border-color: var(--color-brand);
  background: var(--primary);
  color: var(--surface);
}

.workflow-content {
  min-width: 0;
}

.workflow-content h3 {
  margin: 0;
}

.workflow-content p {
  max-width: 680px;
  margin: 8px 0 0;
  color: var(--muted);
  line-height: 1.6;
}

.step-label {
  display: block;
  margin-bottom: 8px;
}

.workflow-content button {
  width: fit-content;
  margin-top: 16px;
}

.workflow-step.is-complete .workflow-content button:disabled {
  cursor: default;
  border: 1px solid var(--color-focus);
  background: var(--primary-soft);
  color: var(--color-brand);
  opacity: 1;
}

.explorer-link {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-height: 40px;
  margin-top: 24px;
  padding: 8px 16px;
  border: 1px solid var(--primary);
  border-radius: 8px;
  background: var(--surface);
  color: var(--color-brand);
  font-weight: 650;
  text-decoration: none;
  transition:
    border-color 0.16s ease,
    background-color 0.16s ease,
    color 0.16s ease;
}

.explorer-link:hover {
  background: var(--primary-soft);
}

.explorer-link:focus-visible {
  outline: 2px solid var(--color-focus);
  outline-offset: 2px;
}

.empty-detail {
  display: grid;
  min-height: 320px;
  align-content: center;
  justify-items: center;
  color: var(--muted);
  text-align: center;
}

@media (max-width: 900px) {
  .funding-page {
    padding: 24px;
  }

  .page-header {
    flex-direction: column;
  }

  nav {
    justify-content: flex-start;
  }

  .workspace {
    grid-template-columns: 1fr;
    min-height: 0;
  }

  .opportunity-panel {
    border-right: 0;
    border-bottom: 1px solid var(--border);
  }

  .detail-heading {
    align-items: flex-start;
  }

  .terms,
  .balance-grid,
  .faucet-stats {
    grid-template-columns: 1fr;
  }

  .balance-grid div + div,
  .faucet-stats div + div {
    border-top: 1px solid var(--border);
    border-left: 0;
  }

  .faucet-stats div + div {
    border-top-color: var(--color-warning-border);
  }
}

@media (max-width: 560px) {
  .funding-page {
    padding: 16px 16px 32px;
  }

  h1 {
    font-size: 28px;
  }

  nav {
    width: 100%;
  }

  nav button {
    flex: 1 1 144px;
  }

  .opportunity-panel {
    padding: 16px 0;
  }

  .panel-heading,
  .empty {
    margin-right: 16px;
    margin-left: 16px;
  }

  .opportunity-card {
    padding: 16px;
  }

  .detail-panel {
    padding: 24px 16px;
  }

  .wallet-label {
    width: 100%;
  }

  .workflow-content button,
  .journal-gate button,
  .recovery-card button,
  .faucet-actions button {
    width: 100%;
  }
}

@media (prefers-reduced-motion: reduce) {
  .icon-spin {
    animation: none;
  }
}
</style>
