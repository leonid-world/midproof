<script setup>
import { displayCompanyName } from '../utils/companyName'
import {
  Check,
  ChevronRight,
  CircleCheckBig,
  Coins,
  ExternalLink,
  FileText,
  LayoutDashboard,
  LoaderCircle,
  ReceiptText,
  RefreshCw,
  RotateCcw,
  ShieldCheck,
  TriangleAlert,
  WalletCards,
} from '@lucide/vue'
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useMockKrwFaucetClaim } from '../composables/useMockKrwFaucetClaim'
import { transactionExplorerUrl } from '../contracts/addresses'
import { getReceivableBlockchainTransactions } from '../services/blockchainTransactions'
import {
  approveRepaymentAmount,
  getRepaymentReadiness,
  repayReceivableOnchain,
  resumeReceivableTransaction,
} from '../services/web3/receivableContract'
import { useAuthStore } from '../stores/auth'
import { useReceivableStore } from '../stores/receivable'
import { useWalletStore } from '../stores/wallet'
import { demoAmountHint } from '../services/receivableAmountPolicy'

const PENDING_SYNC_STORAGE_KEY = 'receivablePendingBlockchainSync'
const REPAY_TRANSACTION_TYPE = 'REPAY_RECEIVABLE'

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
const hasLoadedObligations = ref(false)
const isActionRunning = ref(false)
let selectionRequestId = 0

const currentCompanyId = computed(() => authStore.user?.companyId)
const repaymentObligations = computed(() =>
  receivableStore.receivables.filter(
    (receivable) =>
      sameId(receivable.buyerCompanyId, currentCompanyId.value) && receivable.status === 'FUNDED',
  ),
)
const selectedReceivable = computed(() => receivableStore.selectedReceivable)
const amountHint = computed(() => demoAmountHint(receivableStore.amountPolicy))
const isHistoricalLargeRepayment = computed(() => {
  const policy = receivableStore.amountPolicy
  const faceValue = selectedReceivable.value?.faceValue
  return (
    policy?.demoEnabled &&
    /^[1-9][0-9]*$/.test(faceValue ?? '') &&
    BigInt(faceValue) > BigInt(policy.maxFaceValue)
  )
})
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
const canRepay = computed(
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
const retryButtonLabel = computed(() => {
  if (pendingSync.value?.phase === 'submitted') {
    return '기존 상환 트랜잭션 확인'
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
  hasLoadedObligations.value = false
  readiness.value = null
  resetFaucetReadiness()
  receivableStore.clearSelection()
  try {
    await Promise.all([authStore.loadUser(), walletStore.loadWallet(), receivableStore.loadAll()])
    hasLoadedObligations.value = true
    pendingSync.value = readPendingSynchronization(currentCompanyId.value)

    if (pendingSync.value?.type === 'repaid') {
      await loadPendingReceivable()
      return
    }
    if (pendingSync.value) {
      throw new Error(
        '다른 채권 블록체인 작업이 남아 있습니다. 해당 작업 화면에서 먼저 처리해 주세요.',
      )
    }

    if (repaymentObligations.value.length) {
      await selectObligation(repaymentObligations.value[0].receivableId)
    } else {
      receivableStore.clearSelection()
      journalGate.value = 'clear'
    }
  } catch (error) {
    errorMessage.value = error.message ?? '상환 화면을 불러오지 못했습니다.'
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
    receivable?.status === 'REPAID' &&
    sameHex(receivable.repayTxHash, synchronization.payload?.txHash)
  ) {
    clearPendingSynchronization()
    journalGate.value = 'clear'
    successMessage.value = '이미 서버에 반영된 Buyer 상환을 확인했습니다.'
    return
  }

  journalGate.value = 'adopted'
  journalMessage.value =
    synchronization.phase === 'confirmed'
      ? '상환 완료. 다시 전송하지 말고 서버 반영을 재시도하세요.'
      : '상환 확인 중. 다시 전송하지 말고 기존 거래를 조회하세요.'
}

async function selectObligation(receivableId) {
  const requestId = ++selectionRequestId
  clearMessages()
  readiness.value = null
  resetFaucetReadiness()
  journalGate.value = 'checking'
  journalMessage.value = '기존 상환 트랜잭션 이력을 확인하고 있습니다.'
  try {
    const receivable = await receivableStore.fetchOne(receivableId)
    if (requestId !== selectionRequestId) return
    receivableStore.selectOne(receivable)
    const adopted = await inspectRepaymentJournal(requestId, receivableId)
    if (!adopted && isCurrentSelection(requestId, receivableId)) {
      await refreshReadiness(requestId, receivableId)
    }
  } catch (error) {
    if (requestId !== selectionRequestId) return
    journalGate.value = 'error'
    errorMessage.value = error.message ?? '상환 대상 채권을 불러오지 못했습니다.'
  }
}

async function refreshPage() {
  const receivableId = selectedReceivable.value?.receivableId
  selectionRequestId += 1
  clearMessages({ keepTransaction: Boolean(pendingSync.value) })
  isLoading.value = true
  try {
    await receivableStore.loadAll()
    if (pendingSync.value?.type === 'repaid') {
      await loadPendingReceivable()
      return
    }
    if (
      receivableId &&
      repaymentObligations.value.some((item) => sameId(item.receivableId, receivableId))
    ) {
      await selectObligation(receivableId)
    } else if (repaymentObligations.value.length) {
      await selectObligation(repaymentObligations.value[0].receivableId)
    } else {
      receivableStore.clearSelection()
      readiness.value = null
      resetFaucetReadiness()
      journalGate.value = 'clear'
    }
  } catch (error) {
    errorMessage.value = error.message ?? '최신 상환 상태를 불러오지 못했습니다.'
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
    throw new Error('Dashboard에서 Buyer 회사 지갑을 먼저 연결해 주세요.')
  }

  resetFaucetReadiness()
  actionStage.value = '채권·NFT 소유자·잔액을 확인하고 있습니다...'
  try {
    const result = await getRepaymentReadiness(receivable, walletStore.walletAddress)
    if (!isCurrentSelection(requestId, receivableId)) return
    readiness.value = result
    journalGate.value = 'clear'
    journalMessage.value = '새 상환을 시작해도 되는 상태임을 확인했습니다.'
    await prepareFaucetClaim(
      walletStore.walletAddress,
      result.faceValue,
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
  const requestId = selectionRequestId
  if (!receivable || !canClaimDemoMkrw.value) return

  clearMessages()
  isActionRunning.value = true
  actionStage.value =
    'MetaMask에서 데모 mKRW 수령을 확인해 주세요. 블록 확인 전에는 요청을 반복하지 마세요...'
  try {
    const result = await submitFaucetClaim(walletStore.walletAddress, receivable.faceValue, {
      onSubmitted: (submitted) => {
        lastTxHash.value = submitted.txHash
      },
    })
    lastTxHash.value = result.txHash
    successMessage.value = `데모 ${formatMkrw(result.claimAmount)} 충전 트랜잭션이 확인되었습니다.`

    try {
      await refreshReadiness(requestId, receivable.receivableId)
      if (!isCurrentSelection(requestId, receivable.receivableId)) return
      successMessage.value = readiness.value?.hasSufficientBalance
        ? `데모 ${formatMkrw(result.claimAmount)} 충전이 완료되었습니다. 이제 1단계 사용 승인을 진행해 주세요.`
        : `데모 ${formatMkrw(result.claimAmount)} 충전은 완료되었지만 선택한 채권의 상환 필요 금액보다 잔액이 적습니다.`
    } catch (refreshError) {
      if (!isCurrentSelection(requestId, receivable.receivableId)) return
      errorMessage.value = `충전 트랜잭션은 성공했습니다. 다시 전송하지 말고 최신 상태를 조회해 주세요. (${refreshError.message})`
    }
  } catch (error) {
    if (!isCurrentSelection(requestId, receivable.receivableId)) return
    lastTxHash.value = error.txHash ?? lastTxHash.value
    errorMessage.value = error.message ?? '데모 mKRW 충전을 완료하지 못했습니다.'
  } finally {
    if (isCurrentSelection(requestId, receivable.receivableId)) actionStage.value = ''
    isActionRunning.value = false
  }
}

async function approveMkrw() {
  const receivable = selectedReceivable.value
  if (!receivable || !canApprove.value) return

  clearMessages()
  isActionRunning.value = true
  actionStage.value = '1단계 · MetaMask에서 상환 금액을 승인해 주세요.'
  try {
    const result = await approveRepaymentAmount(receivable, walletStore.walletAddress)
    lastTxHash.value = result.txHash ?? ''
    await refreshReadiness()
    successMessage.value = result.alreadyApproved
      ? '승인 완료. 2단계 상환을 진행해 주세요.'
      : '승인 완료. 금액을 확인하고 2단계 상환을 눌러 주세요.'
  } catch (error) {
    lastTxHash.value = error.txHash ?? lastTxHash.value
    errorMessage.value = error.message ?? 'mKRW 사용 승인을 완료하지 못했습니다.'
  } finally {
    actionStage.value = ''
    isActionRunning.value = false
  }
}

async function startRepayment() {
  const requestedReceivable = selectedReceivable.value
  const requestId = selectionRequestId
  if (!requestedReceivable || !canRepay.value) return

  clearMessages()
  isActionRunning.value = true
  try {
    const adopted = await inspectRepaymentJournal(requestId, requestedReceivable.receivableId)
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

    actionStage.value =
      '2단계 · MetaMask 서명 후 현재 NFT 소유자에게 mKRW가 지급되는 블록을 기다리고 있습니다...'
    const result = await repayReceivableOnchain(
      requestedReceivable,
      walletStore.walletAddress,
      (submitted) => {
        savePendingSynchronization({
          type: 'repaid',
          phase: 'submitted',
          receivableId: requestedReceivable.receivableId,
          companyId: currentCompanyId.value,
          payload: submitted,
        })
        lastTxHash.value = submitted.txHash
      },
    )
    savePendingSynchronization({
      type: 'repaid',
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
    errorMessage.value = error.message ?? '채권 상환을 완료하지 못했습니다.'
  } finally {
    actionStage.value = ''
    isActionRunning.value = false
  }
}

async function inspectRepaymentJournal(
  requestId = selectionRequestId,
  receivableId = selectedReceivable.value?.receivableId,
) {
  const receivable = selectedReceivable.value
  if (!receivable || pendingSync.value || !isCurrentSelection(requestId, receivableId)) {
    return Boolean(pendingSync.value)
  }

  journalGate.value = 'checking'
  journalMessage.value =
    '서버의 기존 상환 이력을 확인하고 있습니다. 확인 전에는 새 상환을 시작할 수 없습니다.'
  try {
    const transactions = await getReceivableBlockchainTransactions(receivable.receivableId)
    if (!isCurrentSelection(requestId, receivableId)) return true
    const repaymentTransactions = transactions.filter(
      (transaction) => transaction?.transactionType === REPAY_TRANSACTION_TYPE,
    )
    const confirmed = repaymentTransactions.find(
      (transaction) => transaction?.txStatus === 'CONFIRMED',
    )
    const pending = repaymentTransactions.find((transaction) => transaction?.txStatus === 'PENDING')
    const journal = confirmed ?? pending

    if (!journal) {
      const unknown = repaymentTransactions.some(
        (transaction) => transaction?.txStatus !== 'FAILED',
      )
      if (unknown) {
        journalGate.value = 'blocked'
        journalMessage.value =
          '상태를 판별할 수 없는 기존 상환 이력이 있어 새 트랜잭션을 차단했습니다.'
        return true
      }
      journalGate.value = 'clear'
      journalMessage.value = '진행 중이거나 성공한 기존 상환 트랜잭션이 없습니다.'
      return false
    }
    if (!isValidRepaymentJournal(journal, receivable)) {
      journalGate.value = 'blocked'
      journalMessage.value =
        '기존 상환 이력의 회사·지갑·컨트랙트 정보가 현재 로그인 정보와 일치하지 않아 새 트랜잭션을 차단했습니다.'
      return true
    }

    savePendingSynchronization({
      type: 'repaid',
      phase: journal.txStatus === 'CONFIRMED' ? 'confirmed' : 'submitted',
      journalConfirmed: journal.txStatus === 'CONFIRMED',
      recoveredFromServerJournal: true,
      receivableId: receivable.receivableId,
      companyId: currentCompanyId.value,
      payload: {
        txHash: journal.txHash,
        contractAddress: journal.contractAddress,
        buyerWalletAddress: journal.walletAddress,
      },
    })
    lastTxHash.value = journal.txHash
    journalGate.value = 'adopted'
    journalMessage.value =
      journal.txStatus === 'CONFIRMED'
        ? '이미 성공한 상환을 찾았습니다. MetaMask를 다시 호출하지 말고 서버 반영 재시도만 진행해 주세요.'
        : '이미 진행 중인 상환을 찾았습니다. 새 트랜잭션을 보내지 말고 기존 블록 확인을 이어가 주세요.'
    return true
  } catch (error) {
    if (!isCurrentSelection(requestId, receivableId)) return true
    journalGate.value = 'error'
    journalMessage.value = `기존 상환 이력을 확인하지 못해 새 트랜잭션을 차단했습니다. (${error.message})`
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

  actionStage.value = '기존 상환 트랜잭션의 블록 확인을 이어받고 있습니다...'
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
    errorMessage.value = error.message ?? '기존 상환 트랜잭션을 확인하지 못했습니다.'
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

  actionStage.value = '온체인 상환 확인 완료 · 서버 상태를 REPAID로 동기화하고 있습니다...'
  try {
    const repaid = await receivableStore.markRepaid(synchronization.receivableId, {
      txHash: synchronization.payload.txHash,
    })
    clearPendingSynchronization()
    journalGate.value = 'clear'
    readiness.value = null
    resetFaucetReadiness()
    lastTxHash.value = repaid.repayTxHash
    successMessage.value =
      '채권 상환이 완료되었습니다. 현재 NFT 소유자에게 채권 금액만큼 mKRW가 지급되었습니다.'
  } catch (error) {
    clearTerminalPendingTransaction(error)
    errorMessage.value = `${error.message} 온체인 트랜잭션을 다시 보내지 말고 서버 반영 재시도를 재시도해 주세요.`
  } finally {
    actionStage.value = ''
  }
}

function isValidRepaymentJournal(journal, receivable) {
  return (
    sameId(journal?.receivableId, receivable.receivableId) &&
    sameId(journal?.companyId, currentCompanyId.value) &&
    sameHex(journal?.walletAddress, walletStore.walletAddress) &&
    sameHex(journal?.walletAddress, receivable.buyerWalletAddress) &&
    sameHex(journal?.contractAddress, receivable.contractAddress) &&
    journal?.functionName === 'repayReceivable' &&
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
  <main class="repayment-page">
    <header class="page-header">
      <div>
        <p class="section-label"><ReceiptText :size="16" aria-hidden="true" /> 상환 워크플로</p>
        <h1>채권 상환</h1>
        <p>Buyer가 채권 금액 전액을 상환합니다.</p>
      </div>
      <nav>
        <button type="button" class="secondary" @click="router.push({ name: 'dashboard' })">
          <LayoutDashboard :size="16" aria-hidden="true" />
          대시보드
        </button>
        <button type="button" class="secondary" @click="router.push({ name: 'receivables' })">
          <FileText :size="16" aria-hidden="true" />
          매출채권 관리
        </button>
        <button type="button" :disabled="isLoading || isActionRunning" @click="refreshPage">
          <LoaderCircle v-if="isLoading" :size="16" class="spin" aria-hidden="true" />
          <RefreshCw v-else :size="16" aria-hidden="true" />
          {{ isLoading ? '조회 중...' : '최신 상태 조회' }}
        </button>
      </nav>
    </header>

    <div v-if="amountHint" class="notice progress" role="note">
      새 채권 기준 · {{ amountHint.replace('테스트용 · ', '') }}
    </div>
    <div v-if="isHistoricalLargeRepayment" class="notice progress" role="note">
      이전 고액 채권입니다. 기존 채무는 표시된 원금 전액으로 상환합니다.
    </div>

    <p v-if="errorMessage" class="notice error" role="alert">
      <TriangleAlert :size="16" aria-hidden="true" />
      {{ errorMessage }}
    </p>
    <p v-if="successMessage" class="notice success" role="status">
      <CircleCheckBig :size="16" aria-hidden="true" />
      {{ successMessage }}
    </p>
    <p v-if="actionStage" class="notice progress" role="status">
      <LoaderCircle :size="16" class="spin" aria-hidden="true" />
      {{ actionStage }}
    </p>

    <section class="workspace" :aria-busy="isLoading">
      <aside class="opportunity-panel">
        <h2>상환 대상 채권</h2>
        <p v-if="isLoading" class="empty loading-state" role="status">
          Buyer 상환 대상 채권을 불러오고 있습니다...
        </p>
        <p v-else-if="!hasLoadedObligations" class="empty">다시 조회해 주세요.</p>
        <p v-else-if="!repaymentObligations.length" class="empty">
          현재 Buyer가 상환할 FUNDED 채권이 없습니다.
        </p>
        <button
          v-for="receivable in repaymentObligations"
          v-show="hasLoadedObligations && !isLoading"
          :key="receivable.receivableId"
          type="button"
          class="opportunity-card"
          :class="{
            selected: sameId(receivable.receivableId, selectedReceivable?.receivableId),
          }"
          :aria-pressed="sameId(receivable.receivableId, selectedReceivable?.receivableId)"
          :disabled="isActionRunning || Boolean(pendingSync)"
          @click="selectObligation(receivable.receivableId)"
        >
          <span class="opportunity-copy">
            <span>#{{ receivable.receivableId }} · NFT #{{ receivable.tokenId }}</span>
            <strong
              >{{ displayCompanyName(receivable.sellerCompanyName) }} →
              {{ displayCompanyName(receivable.buyerCompanyName) }}</strong
            >
            <span>상환 금액 {{ formatAmount(receivable.faceValue) }}</span>
            <small>만기 {{ receivable.maturityDate }}</small>
          </span>
          <ChevronRight :size="18" aria-hidden="true" />
        </button>
      </aside>

      <article v-if="isLoading" class="detail-panel empty-detail loading-state" role="status">
        <h2>상환 정보 확인 중</h2>
        <p>상환 대상과 거래를 확인하고 있습니다...</p>
      </article>

      <article v-else-if="hasLoadedObligations && selectedReceivable" class="detail-panel">
        <div class="detail-heading">
          <div>
            <span class="status">{{ selectedReceivable.status }}</span>
            <h2>채권 #{{ selectedReceivable.receivableId }}</h2>
          </div>
          <span class="wallet-label">
            <WalletCards :size="16" aria-hidden="true" />
            Buyer 지갑 {{ shortAddress(walletStore.walletAddress) }}
          </span>
        </div>

        <dl class="terms">
          <div>
            <dt>Seller</dt>
            <dd>{{ displayCompanyName(selectedReceivable.sellerCompanyName) }}</dd>
          </div>
          <div>
            <dt>Funder</dt>
            <dd>{{ displayCompanyName(selectedReceivable.funderCompanyName) || '-' }}</dd>
          </div>
          <div>
            <dt>채권 금액</dt>
            <dd>{{ formatAmount(selectedReceivable.faceValue) }}</dd>
          </div>
          <div>
            <dt>기존 공급 금액</dt>
            <dd>{{ formatAmount(selectedReceivable.fundingAmount) }}</dd>
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
            <dt>현재 상환 수취인</dt>
            <dd class="hash">
              {{ readiness?.recipientWalletAddress || '온체인 상태 조회 필요' }}
            </dd>
          </div>
          <div>
            <dt>문서 해시</dt>
            <dd class="hash">{{ selectedReceivable.documentHash || '등록되지 않음' }}</dd>
          </div>
        </dl>

        <section v-if="selectedReceivable.status === 'REPAID'" class="completed-card" role="status">
          <div class="callout-heading">
            <CircleCheckBig :size="18" aria-hidden="true" />
            <h3>상환 완료</h3>
          </div>
          <p>
            Buyer 상환이 서버에 반영되었습니다. mKRW 지급과 REPAID 상태는 온체인 트랜잭션으로
            검증되었습니다.
          </p>
        </section>

        <section v-else-if="pendingForSelected" class="recovery-card" role="alert">
          <div class="callout-heading">
            <RotateCcw :size="18" aria-hidden="true" />
            <h3>기존 상환 작업을 먼저 완료해 주세요</h3>
          </div>
          <p>{{ journalMessage }}</p>
          <button type="button" :disabled="isActionRunning" @click="retryPending">
            <LoaderCircle v-if="isActionRunning" :size="16" class="spin" aria-hidden="true" />
            <RotateCcw v-else :size="16" aria-hidden="true" />
            {{ isActionRunning ? '처리 중...' : retryButtonLabel }}
          </button>
        </section>

        <section v-else class="funding-steps">
          <div
            v-if="journalGate !== 'clear'"
            class="journal-gate"
            :class="{ blocked: journalGate === 'blocked' || journalGate === 'error' }"
          >
            <strong class="callout-heading">
              <ShieldCheck :size="18" aria-hidden="true" />
              기존 트랜잭션 안전 점검
            </strong>
            <p>{{ journalMessage }}</p>
            <button
              v-if="journalGate === 'error'"
              type="button"
              class="secondary"
              @click="selectObligation(selectedReceivable.receivableId)"
            >
              <RefreshCw :size="16" aria-hidden="true" />
              이력 다시 조회
            </button>
          </div>

          <template v-if="readiness">
            <div class="balance-grid">
              <div>
                <span>필요 mKRW</span>
                <strong>{{ formatAmount(readiness.faceValue) }}</strong>
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

            <p class="recipient-notice">
              <WalletCards :size="16" aria-hidden="true" />
              <span>
                상환금은 트랜잭션 실행 시점의 NFT 소유자에게 지급됩니다. 현재 조회된 수취인은
                {{ shortAddress(readiness.recipientWalletAddress) }}입니다.
              </span>
            </p>

            <section
              v-if="!readiness.hasSufficientBalance"
              class="faucet-card"
              aria-labelledby="repayment-faucet-title"
            >
              <div class="faucet-heading">
                <div class="callout-heading">
                  <Coins :size="18" aria-hidden="true" />
                  <h3 id="repayment-faucet-title">데모 mKRW 충전</h3>
                </div>
                <span class="demo-badge">테스트넷 전용</span>
              </div>
              <p class="faucet-intro">
                상환에 필요한 mKRW가 부족합니다. 등록된 Buyer 지갑의 수령 가능 여부를 확인해 사전
                예치된 데모 토큰을 지급합니다. 새로운 mKRW를 발행하는 작업은 아닙니다.
              </p>

              <p v-if="isFaucetLoading" class="faucet-status" role="status">
                <LoaderCircle :size="17" class="spin" aria-hidden="true" />
                데모 mKRW 충전 가능 여부를 확인하고 있습니다...
              </p>

              <template v-else-if="faucetErrorMessage">
                <div class="faucet-status error" role="alert">
                  <TriangleAlert :size="17" aria-hidden="true" />
                  <span>{{ faucetErrorMessage }}</span>
                </div>
                <div class="faucet-actions">
                  <button
                    type="button"
                    class="secondary"
                    :disabled="isActionRunning || isFaucetLoading"
                    @click="refreshSelectedReadiness"
                  >
                    <RefreshCw :size="16" aria-hidden="true" />
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
                  <TriangleAlert :size="17" aria-hidden="true" />
                  제출된 충전 트랜잭션을 확인하거나 최신 잔액에 반영하고 있습니다. 요청을 다시
                  보내지 말고 Explorer와 최신 상태를 확인해 주세요.
                </p>
                <p
                  v-else-if="faucetReadiness.hasClaimed"
                  class="faucet-status warning"
                  role="status"
                >
                  <Check :size="17" aria-hidden="true" />
                  이 Buyer 지갑은 데모 mKRW 충전을 이미 한 번 사용했습니다. 현재 잔액으로 상환
                  가능한 채권을 선택해 주세요.
                </p>
                <p
                  v-else-if="!faucetReadiness.hasInventory"
                  class="faucet-status error"
                  role="alert"
                >
                  <TriangleAlert :size="17" aria-hidden="true" />
                  데모 mKRW 충전 재고가 소진되었습니다. 현재 자동 충전을 이용할 수 없습니다.
                </p>
                <p
                  v-else-if="!faucetReadiness.willCoverRequiredAmount"
                  class="faucet-status warning"
                  role="alert"
                >
                  <TriangleAlert :size="17" aria-hidden="true" />
                  한 번 충전해도 선택한 채권의 상환 금액에 미치지 않아 수령을 차단했습니다.
                </p>
                <p
                  v-else-if="!faucetReadiness.hasNativeGas"
                  class="faucet-status warning"
                  role="alert"
                >
                  <TriangleAlert :size="17" aria-hidden="true" />
                  수령 트랜잭션에 필요한 테스트넷 가스 토큰가 없습니다. 테스트 ETH를 받은 뒤 최신
                  상태를 조회해 주세요.
                </p>
                <p v-else class="faucet-status available" role="status">
                  <Check :size="17" aria-hidden="true" />
                  이 지갑은 데모 mKRW를 충전할 수 있습니다. 충전 후 상환 준비 상태를 자동으로 다시
                  확인합니다.
                </p>

                <div class="faucet-actions">
                  <button
                    v-if="faucetReadiness.canClaim && !faucetClaimUncertain"
                    type="button"
                    :disabled="!canClaimDemoMkrw"
                    @click="receiveDemoMkrw"
                  >
                    <Coins :size="16" aria-hidden="true" />
                    MetaMask로 {{ formatMkrw(faucetReadiness.claimAmount) }} 받기
                  </button>
                  <button
                    type="button"
                    class="secondary"
                    :disabled="isActionRunning || isFaucetLoading"
                    @click="refreshSelectedReadiness"
                  >
                    <RefreshCw :size="16" aria-hidden="true" />
                    충전 상태 다시 조회
                  </button>
                </div>

                <p class="gas-note">
                  수령·승인·상환에는 테스트넷 가스 토큰가 필요합니다.
                  <a
                    href="https://docs.giwa.io/get-started/faucets"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    테스트 ETH 받는 방법
                    <ExternalLink :size="14" aria-hidden="true" />
                  </a>
                </p>
              </template>
            </section>

            <ol class="workflow-timeline" aria-label="상환 진행 단계">
              <li
                class="workflow-step"
                :class="{
                  'is-complete': readiness.hasSufficientAllowance,
                  'is-active': canApprove,
                }"
              >
                <span class="workflow-marker" aria-hidden="true">
                  <Check v-if="readiness.hasSufficientAllowance" :size="16" />
                  <span v-else>1</span>
                </span>
                <div class="workflow-content">
                  <span class="step-label">1단계</span>
                  <h3>mKRW 사용 승인</h3>
                  <p>{{ formatAmount(readiness.faceValue) }}만 사용 승인합니다.</p>
                  <button type="button" :disabled="!canApprove" @click="approveMkrw">
                    <Check v-if="readiness.hasSufficientAllowance" :size="16" aria-hidden="true" />
                    <ShieldCheck v-else :size="16" aria-hidden="true" />
                    {{
                      readiness.hasSufficientAllowance ? '승인 완료' : 'MetaMask로 mKRW 사용 승인'
                    }}
                  </button>
                </div>
              </li>

              <li class="workflow-step" :class="{ 'is-active': canRepay }">
                <span class="workflow-marker" aria-hidden="true">2</span>
                <div class="workflow-content">
                  <span class="step-label">2단계</span>
                  <h3>채권 상환</h3>
                  <p>현재 NFT 소유자에게 전액 지급합니다. 아래 버튼으로 직접 실행합니다.</p>
                  <button type="button" :disabled="!canRepay" @click="startRepayment">
                    <ReceiptText :size="16" aria-hidden="true" />
                    MetaMask로 채권 상환
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
          Explorer에서 트랜잭션 확인
          <ExternalLink :size="16" aria-hidden="true" />
        </a>
      </article>

      <article v-else class="detail-panel empty-detail">
        <h2>{{ hasLoadedObligations ? '상환 대상 없음' : '상환 대상 조회 실패' }}</h2>
        <p>
          {{ hasLoadedObligations ? '펀딩이 완료된 채권이 표시됩니다.' : '다시 조회해 주세요.' }}
        </p>
      </article>
    </section>
  </main>
</template>

<style scoped>
.repayment-page {
  min-height: 100%;
  padding: var(--space-5, 40px) var(--space-4, 32px) var(--space-7, 56px);
  background: var(--color-canvas);
  color: var(--color-text);
}

.page-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  max-width: var(--content-width, 1200px);
  margin: 0 auto var(--space-4, 32px);
  gap: var(--space-4, 32px);
}

.section-label {
  display: inline-flex;
  align-items: center;
  gap: var(--space-1, 8px);
  margin: 0;
  color: var(--color-brand);
  font-size: 14px;
  font-weight: 650;
}

h1 {
  margin: var(--space-1, 8px) 0;
  font-size: 32px;
  font-weight: 700;
  line-height: 1.25;
  letter-spacing: -0.025em;
}

h2,
h3,
p {
  margin-top: 0;
}

h2 {
  color: var(--color-text);
  font-size: 20px;
  font-weight: 650;
  line-height: 1.35;
}

h3 {
  color: var(--color-text);
  font-size: 16px;
  font-weight: 650;
  line-height: 1.4;
}

.page-header p {
  max-width: 720px;
  margin-bottom: 0;
  color: var(--color-text-muted);
  line-height: 1.6;
}

nav {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: var(--space-1, 8px);
}

button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-1, 8px);
  min-height: 40px;
  border: 1px solid var(--color-brand);
  border-radius: var(--radius-md, 8px);
  padding: 8px 16px;
  background: var(--color-action);
  color: var(--color-on-action);
  cursor: pointer;
  font-size: 14px;
  font-weight: 650;
  transition:
    border-color var(--transition-fast, 150ms ease),
    background-color var(--transition-fast, 150ms ease),
    color var(--transition-fast, 150ms ease);
}

button:not(.opportunity-card):hover:not(:disabled) {
  background: var(--color-action);
}

button.secondary {
  border-color: var(--color-border-strong);
  background: var(--color-surface);
  color: var(--color-text);
}

button.secondary:hover:not(:disabled) {
  border-color: var(--color-brand);
  background: var(--color-brand-soft);
  color: var(--color-brand);
}

button:focus-visible {
  outline: 3px solid var(--color-focus);
  outline-offset: 2px;
}

button:disabled {
  cursor: not-allowed;
  opacity: 0.5;
}

.notice {
  display: flex;
  align-items: flex-start;
  gap: var(--space-1, 8px);
  max-width: var(--content-width, 1200px);
  margin: 0 auto var(--space-2, 16px);
  padding: 16px;
  border-radius: var(--radius-md, 8px);
  overflow-wrap: anywhere;
  font-size: 14px;
  line-height: 1.55;
}

.notice svg {
  flex: 0 0 auto;
  margin-top: 2px;
}

.notice.error {
  border: 1px solid var(--color-danger-border);
  background: var(--color-danger-soft);
  color: var(--color-danger);
}

.notice.success {
  border: 1px solid var(--color-success-border);
  background: var(--color-brand-soft);
  color: var(--color-brand);
}

.notice.progress {
  border: 1px solid var(--color-border);
  background: var(--color-surface);
  color: var(--color-text-muted);
}

.workspace {
  display: grid;
  grid-template-columns: minmax(288px, 360px) minmax(0, 1fr);
  align-items: stretch;
  max-width: var(--content-width, 1200px);
  min-height: 620px;
  margin: 0 auto;
  overflow: hidden;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg, 12px);
  background: var(--color-surface);
}

.opportunity-panel,
.detail-panel {
  border: 0;
  border-radius: 0;
  padding: var(--space-4, 32px);
  background: transparent;
  box-shadow: none;
}

.opportunity-panel {
  display: flex;
  flex-direction: column;
  gap: 0;
  border-right: 1px solid var(--color-border);
}

.opportunity-panel h2 {
  margin-bottom: var(--space-3, 24px);
}

.opportunity-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  margin: 0;
  gap: var(--space-2, 16px);
  padding: 16px 8px 16px 16px;
  border: 0;
  border-top: 1px solid var(--color-border);
  border-radius: 0;
  background: transparent;
  color: var(--color-text-muted);
  line-height: 1.45;
  text-align: left;
}

.opportunity-card:hover:not(:disabled):not(.selected) {
  background: var(--color-canvas);
}

.opportunity-card.selected {
  border-left: 2px solid var(--color-brand);
  padding-left: 14px;
  background: var(--color-brand-soft);
  box-shadow: none;
}

.opportunity-copy {
  display: grid;
  min-width: 0;
  gap: 4px;
}

.opportunity-card > svg {
  flex: 0 0 auto;
  color: var(--color-text-muted);
}

.opportunity-card strong {
  color: var(--color-text);
  font-weight: 650;
}

.opportunity-copy > span:first-child {
  color: var(--color-text-muted);
  font-size: 12px;
  font-weight: 650;
}

.opportunity-card small {
  color: var(--color-text-muted);
}

.empty {
  margin: 0;
  padding: 16px 0;
  border-top: 1px solid var(--color-border);
  color: var(--color-text-muted);
  line-height: 1.6;
}

.loading-state {
  color: var(--color-text);
}

.detail-panel {
  min-width: 0;
}

.detail-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: var(--space-2, 16px);
  margin-bottom: var(--space-3, 24px);
}

.detail-heading h2 {
  margin: 6px 0 0;
}

.status {
  display: inline-block;
  border-radius: 999px;
  padding: 4px 8px;
  background: var(--color-brand-soft);
  color: var(--color-brand);
  font-size: 12px;
  font-weight: 650;
}

.wallet-label {
  display: inline-flex;
  align-items: center;
  gap: var(--space-1, 8px);
  max-width: 100%;
  overflow: hidden;
  color: var(--color-text-muted);
  font-size: 13px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.terms {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  column-gap: 32px;
  row-gap: 0;
  margin: 0 0 var(--space-4, 32px);
}

.terms div {
  min-width: 0;
  border-bottom: 1px solid var(--color-border);
  padding: 16px 0;
}

.terms dt {
  color: var(--color-text-muted);
  font-size: 13px;
  font-weight: 500;
}

.terms dd {
  margin: 4px 0 0;
  font-weight: 600;
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
  gap: var(--space-3, 24px);
}

.balance-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 0;
  border-top: 1px solid var(--color-border);
  border-bottom: 1px solid var(--color-border);
}

.balance-grid div {
  display: grid;
  gap: var(--space-1, 8px);
  min-width: 0;
  padding: 16px;
  background: transparent;
}

.balance-grid div + div {
  border-left: 1px solid var(--color-border);
}

.balance-grid span,
.step-label {
  color: var(--color-text-muted);
  font-size: 12px;
  font-weight: 650;
}

.balance-grid strong {
  color: var(--color-text);
  font-size: 16px;
  font-weight: 650;
  font-variant-numeric: tabular-nums;
}

.journal-gate,
.recovery-card,
.completed-card {
  display: grid;
  gap: var(--space-1, 8px);
  border-left: 3px solid var(--color-border-strong);
  padding: 8px 0 8px 16px;
  line-height: 1.6;
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
  margin-top: var(--space-1, 8px);
}

.journal-gate p,
.recovery-card p {
  color: var(--color-text-muted);
}

.journal-gate {
  border-left-color: var(--color-brand);
}

.journal-gate.blocked {
  border-left-color: var(--color-danger-border);
}

.recovery-card {
  border-left-color: var(--color-warning-border);
}

.completed-card {
  border-left-color: var(--color-brand);
}

.completed-card p {
  color: var(--color-text-muted);
}

.callout-heading {
  display: flex;
  align-items: center;
  gap: var(--space-1, 8px);
  color: var(--color-text);
}

.callout-heading svg {
  flex: 0 0 auto;
  color: var(--color-brand);
}

.recipient-notice {
  display: flex;
  align-items: flex-start;
  gap: var(--space-1, 8px);
  margin: 0;
  border-left: 3px solid var(--color-brand);
  padding: 8px 0 8px 16px;
  color: var(--color-text-muted);
  line-height: 1.55;
}

.recipient-notice > svg {
  flex: 0 0 auto;
  margin-top: 3px;
}

.faucet-card {
  display: grid;
  gap: var(--space-2, 16px);
  border: 1px solid var(--color-warning-border);
  border-left: 3px solid var(--color-warning-border);
  border-radius: var(--radius-md, 8px);
  padding: 16px;
  background: var(--color-warning-soft);
  color: var(--color-text);
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
  font-weight: 650;
}

.faucet-intro {
  color: var(--color-text);
}

.faucet-stats {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  overflow: hidden;
  border: 1px solid var(--color-warning-border);
  border-radius: var(--radius-md, 8px);
  background: var(--color-surface);
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
  color: var(--color-text-muted);
  font-size: 12px;
  font-weight: 650;
}

.faucet-stats strong {
  color: var(--color-text);
  font-variant-numeric: tabular-nums;
}

.faucet-status {
  display: flex;
  align-items: flex-start;
  gap: var(--space-1, 8px);
  border-radius: var(--radius-md, 8px);
  padding: 12px;
  background: var(--color-surface);
  color: var(--color-text);
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
  border: 1px solid var(--color-brand-border);
  background: var(--color-brand-soft);
  color: var(--color-brand);
}

.faucet-actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-1, 8px);
}

.gas-note {
  color: var(--color-text-muted);
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
  outline: 2px solid var(--color-brand);
  outline-offset: 2px;
}

.workflow-timeline {
  margin: var(--space-1, 8px) 0 0;
  padding: 0;
  list-style: none;
}

.workflow-step {
  position: relative;
  display: grid;
  grid-template-columns: 32px minmax(0, 1fr);
  gap: var(--space-2, 16px);
  padding-bottom: var(--space-4, 32px);
}

.workflow-step:last-child {
  padding-bottom: 0;
}

.workflow-step:not(:last-child)::after {
  position: absolute;
  top: 32px;
  bottom: 0;
  left: 15px;
  width: 1px;
  background: var(--color-border);
  content: '';
}

.workflow-marker {
  position: relative;
  z-index: 1;
  display: grid;
  place-items: center;
  width: 32px;
  height: 32px;
  border: 1px solid var(--color-border-strong);
  border-radius: 50%;
  background: var(--color-surface);
  color: var(--color-text-muted);
  font-size: 12px;
  font-weight: 650;
}

.workflow-step.is-active .workflow-marker {
  border-color: var(--color-brand);
  color: var(--color-brand);
}

.workflow-step.is-complete .workflow-marker {
  border-color: var(--color-brand);
  background: var(--color-action);
  color: var(--color-on-action);
}

.workflow-content {
  min-width: 0;
  padding-top: 4px;
}

.workflow-content h3,
.workflow-content p {
  margin: 0;
}

.workflow-content h3 {
  margin-top: 4px;
}

.workflow-content p {
  max-width: 720px;
  margin-top: var(--space-1, 8px);
  color: var(--color-text-muted);
  line-height: 1.6;
}

.workflow-content button {
  margin-top: var(--space-2, 16px);
}

.workflow-step.is-complete .workflow-content button:disabled {
  cursor: default;
  border-color: var(--color-border);
  background: var(--color-brand-soft);
  color: var(--color-brand);
  opacity: 1;
}

.explorer-link {
  display: inline-flex;
  align-items: center;
  gap: var(--space-1, 8px);
  min-height: 36px;
  margin-top: var(--space-3, 24px);
  padding: 7px 12px;
  border: 1px solid var(--color-border-strong);
  border-radius: var(--radius-md, 8px);
  background: var(--color-surface);
  color: var(--color-brand);
  font-size: 14px;
  font-weight: 650;
  text-decoration: none;
  transition:
    border-color var(--transition-fast, 150ms ease),
    background-color var(--transition-fast, 150ms ease),
    color var(--transition-fast, 150ms ease);
}

.explorer-link:hover {
  border-color: var(--color-brand);
  background: var(--color-brand-soft);
  color: var(--color-brand-hover);
}

.explorer-link:focus-visible {
  outline: 3px solid var(--color-focus);
  outline-offset: 2px;
}

.empty-detail {
  display: grid;
  min-height: 320px;
  align-content: center;
  justify-items: center;
  color: var(--color-text-muted);
  text-align: center;
}

.spin {
  animation: spin 0.9s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

@media (max-width: 900px) {
  .repayment-page {
    padding: 32px 24px 48px;
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
    border-bottom: 1px solid var(--color-border);
  }

  .detail-heading {
    align-items: flex-start;
  }

  .terms {
    grid-template-columns: 1fr;
  }

  .faucet-stats {
    grid-template-columns: 1fr;
  }

  .faucet-stats div + div {
    border-top: 1px solid var(--color-warning-border);
    border-left: 0;
  }
}

@media (max-width: 560px) {
  .repayment-page {
    padding: 24px 16px 40px;
  }

  h1 {
    font-size: 28px;
  }

  nav {
    width: 100%;
  }

  nav button {
    flex: 1 1 140px;
  }

  .opportunity-panel,
  .detail-panel {
    padding: 24px 16px;
  }

  .wallet-label {
    width: 100%;
  }

  .balance-grid {
    grid-template-columns: 1fr;
  }

  .balance-grid div + div {
    border-top: 1px solid var(--color-border);
    border-left: 0;
  }

  .workflow-content button,
  .journal-gate button,
  .recovery-card button,
  .faucet-actions button {
    width: 100%;
  }
}

@media (prefers-reduced-motion: reduce) {
  .spin {
    animation: none;
  }
}
</style>
