<script setup>
import { displayCompanyName } from '../utils/companyName'
import {
  Box,
  Check,
  CircleCheckBig,
  Database,
  ExternalLink,
  FilePlus,
  HandCoins,
  LayoutDashboard,
  LoaderCircle,
  Plus,
  RefreshCw,
  RotateCcw,
  ShieldCheck,
  TriangleAlert,
  X,
} from '@lucide/vue'
import { computed, onMounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { addressExplorerUrl, transactionExplorerUrl } from '../contracts/addresses'
import {
  createReceivableOnchain,
  resumeReceivableTransaction,
  tokenizeReceivableOnchain,
  verifyReceivableOnchain,
} from '../services/web3/receivableContract'
import { getReceivableBlockchainTransactions } from '../services/blockchainTransactions'
import { isMidnightPocEnabled, isMidnightProofBridgeEnabled } from '../services/midnight/config'
import { useAuthStore } from '../stores/auth'
import { useReceivableStore } from '../stores/receivable'
import { useWalletStore } from '../stores/wallet'
import { demoAmountHint, validateReceivableAmounts } from '../services/receivableAmountPolicy'
import { formatBusinessNumber, normalizeBusinessNumber } from '../utils/businessNumber'

const PENDING_SYNC_STORAGE_KEY = 'receivablePendingBlockchainSync'
const TOKENIZE_TRANSACTION_TYPE = 'TOKENIZE_RECEIVABLE'
const router = useRouter()
const authStore = useAuthStore()
const receivableStore = useReceivableStore()
const walletStore = useWalletStore()
const errorMessage = ref('')
const successMessage = ref('')
const actionStage = ref('')
const lastTxHash = ref('')
const pendingSync = ref(null)
const isSubmitting = ref(false)
const isPageLoading = ref(true)
const hasLoadedReceivables = ref(false)
const isRefreshing = ref(false)
const isChainActionRunning = ref(false)
const tokenizationJournalStatus = ref('idle')
const tokenizationJournalReceivableId = ref(null)
const tokenizationJournalMessage = ref('')
const showForm = ref(false)
const buyerAttestationAccepted = ref(false)
const isSelecting = ref(false)
let selectionRequestSequence = 0
let tokenizationJournalRequestSequence = 0
const form = reactive({
  buyerBusinessNumber: '',
  faceValue: '',
  fundingAmount: '',
  issueDate: new Date().toISOString().slice(0, 10),
  maturityDate: '',
  documentHash: '',
  description: '',
})

const selectedReceivable = computed(() => receivableStore.selectedReceivable)
const amountHint = computed(() => demoAmountHint(receivableStore.amountPolicy))
const amountError = computed(() => {
  if (!receivableStore.amountPolicy) return '금액 한도를 확인해 주세요.'
  try {
    validateReceivableAmounts(form, receivableStore.amountPolicy)
    return ''
  } catch (error) {
    return error.message
  }
})
const selectionBusy = computed(
  () =>
    isSelecting.value ||
    isRefreshing.value ||
    isPageLoading.value ||
    isSubmitting.value ||
    isChainActionRunning.value,
)
const currentCompanyId = computed(() => authStore.user?.companyId)
const isSeller = computed(
  () =>
    selectedReceivable.value &&
    sameId(currentCompanyId.value, selectedReceivable.value.sellerCompanyId),
)
const isBuyer = computed(
  () =>
    selectedReceivable.value &&
    sameId(currentCompanyId.value, selectedReceivable.value.buyerCompanyId),
)
const buyerReviewRequired = computed(
  () => Boolean(isBuyer.value) && selectedReceivable.value.status === 'CREATED',
)
const hasCompleteChainMetadata = computed(() =>
  Boolean(
    selectedReceivable.value?.onchainReceivableId &&
    selectedReceivable.value?.contractAddress &&
    selectedReceivable.value?.createTxHash,
  ),
)
const hasCompleteVerificationMetadata = computed(
  () => hasCompleteChainMetadata.value && Boolean(selectedReceivable.value?.verifyTxHash),
)
const canCreateOnchain = computed(
  () =>
    !pendingSync.value &&
    !selectionBusy.value &&
    isSeller.value &&
    selectedReceivable.value.status === 'CREATED' &&
    !selectedReceivable.value.onchainReceivableId,
)
const canVerify = computed(
  () =>
    !pendingSync.value &&
    !selectionBusy.value &&
    buyerReviewRequired.value &&
    hasCompleteChainMetadata.value,
)
const canSubmitVerification = computed(
  () =>
    canVerify.value &&
    buyerAttestationAccepted.value &&
    !isRefreshing.value &&
    !isChainActionRunning.value,
)
const isTokenizationCandidate = computed(
  () =>
    Boolean(isSeller.value) &&
    selectedReceivable.value?.status === 'VERIFIED' &&
    hasCompleteVerificationMetadata.value,
)
const isTokenizationJournalChecking = computed(() => tokenizationJournalStatus.value === 'checking')
const shouldShowTokenizationJournalGate = computed(
  () => !pendingSync.value && isTokenizationCandidate.value && !canTokenize.value,
)
const canTokenize = computed(
  () =>
    !pendingSync.value &&
    !selectionBusy.value &&
    isTokenizationCandidate.value &&
    tokenizationJournalStatus.value === 'clear' &&
    sameId(tokenizationJournalReceivableId.value, selectedReceivable.value?.receivableId),
)
const buyerVerificationButtonText = computed(() => {
  if (isRefreshing.value) return '최신 상태 확인 중...'
  if (isChainActionRunning.value) return '확인 중...'
  if (pendingSync.value) return '기존 블록체인 작업 처리 중'
  if (!hasCompleteChainMetadata.value) {
    return 'Seller 온체인 생성 대기 중'
  }
  if (!buyerAttestationAccepted.value) {
    return '채권 내용 확인 후 동의해 주세요'
  }
  return '확인 내용을 MetaMask로 서명'
})
const pendingSyncForSelected = computed(
  () =>
    pendingSync.value &&
    selectedReceivable.value &&
    sameId(pendingSync.value.receivableId, selectedReceivable.value.receivableId),
)
const canStartMidnightProof = computed(
  () =>
    isMidnightPocEnabled &&
    isMidnightProofBridgeEnabled &&
    (isSeller.value || isBuyer.value) &&
    /^[1-9][0-9]*$/.test(String(selectedReceivable.value?.onchainReceivableId ?? '')) &&
    Boolean(selectedReceivable.value?.contractAddress),
)

const workflowSteps = [
  {
    key: 'CREATED',
    title: '온체인 생성',
    description: 'Seller가 채권을 발행합니다.',
    icon: FilePlus,
    pendingType: 'chain-created',
  },
  {
    key: 'VERIFIED',
    title: 'Buyer 검증',
    description: 'Buyer가 거래 조건을 확인하고 서명합니다.',
    icon: ShieldCheck,
    pendingType: 'verified',
  },
  {
    key: 'TOKENIZED',
    title: 'NFT 토큰화',
    description: 'Seller가 채권 NFT를 발행합니다.',
    icon: Box,
    pendingType: 'tokenized',
  },
  {
    key: 'FUNDED',
    title: '자금 공급',
    description: 'Funder가 mKRW를 지급합니다.',
    icon: HandCoins,
  },
  {
    key: 'REPAID',
    title: '상환',
    description: 'Buyer가 전액 상환합니다.',
    icon: CircleCheckBig,
  },
]

const currentWorkflowStep = computed(
  () => workflowSteps.find((step) => !isWorkflowMilestoneComplete(step.key))?.key ?? null,
)

function isWorkflowMilestoneComplete(step) {
  const status = selectedReceivable.value?.status
  if (!status) return false

  if (step === 'CREATED') {
    return (
      hasCompleteChainMetadata.value ||
      ['VERIFIED', 'TOKENIZED', 'FUNDED', 'REPAID'].includes(status)
    )
  }
  if (step === 'VERIFIED') {
    return ['VERIFIED', 'TOKENIZED', 'FUNDED', 'REPAID'].includes(status)
  }
  if (step === 'TOKENIZED') {
    return ['TOKENIZED', 'FUNDED', 'REPAID'].includes(status)
  }
  if (step === 'FUNDED') {
    return ['FUNDED', 'REPAID'].includes(status)
  }
  return status === 'REPAID'
}

function workflowStepState(step) {
  if (isWorkflowMilestoneComplete(step)) return 'complete'
  return currentWorkflowStep.value === step ? 'current' : 'pending'
}

function pendingSyncMatches(type) {
  return Boolean(pendingSyncForSelected.value && pendingSync.value?.type === type)
}

onMounted(loadPage)

async function loadPage() {
  clearMessages()
  resetTokenizationJournalCheck()
  buyerAttestationAccepted.value = false
  isPageLoading.value = true
  hasLoadedReceivables.value = false
  try {
    await Promise.all([authStore.loadUser(), walletStore.loadWallet(), receivableStore.loadAll()])
    hasLoadedReceivables.value = true
    pendingSync.value = readPendingSynchronization(currentCompanyId.value)
    const recoveryRouteName = externalRecoveryRouteName(pendingSync.value)
    if (recoveryRouteName) {
      await router.replace({ name: recoveryRouteName })
      return
    }
    if (pendingSync.value) {
      await receivableStore.loadOne(pendingSync.value.receivableId)
      lastTxHash.value = pendingSync.value.payload.txHash
    } else if (receivableStore.receivables.length) {
      const initialReceivable =
        receivableStore.receivables.find(
          (receivable) => isBuyerFor(receivable) && receivable.status === 'FUNDED',
        ) ??
        receivableStore.receivables.find(
          (receivable) =>
            isBuyerFor(receivable) &&
            receivable.status === 'CREATED' &&
            hasCompleteBlockchainMetadata(receivable),
        ) ??
        receivableStore.receivables.find(
          (receivable) => isBuyerFor(receivable) && receivable.status === 'CREATED',
        ) ??
        receivableStore.receivables.find(
          (receivable) =>
            sameId(currentCompanyId.value, receivable.sellerCompanyId) &&
            receivable.status === 'VERIFIED',
        ) ??
        receivableStore.receivables[0]
      await receivableStore.loadOne(initialReceivable.receivableId)
    } else {
      receivableStore.clearSelection()
    }
    await inspectSelectedTokenizationJournal()
  } catch (error) {
    errorMessage.value = error.message
  } finally {
    isPageLoading.value = false
  }
  await loadAmountPolicy()
}

async function loadAmountPolicy() {
  try {
    const policy = await receivableStore.loadAmountPolicy()
    if (policy.demoEnabled) {
      if (!form.faceValue) form.faceValue = policy.suggestedFaceValue
      if (!form.fundingAmount) form.fundingAmount = policy.suggestedFundingAmount
    }
  } catch (error) {
    errorMessage.value = error.message
  }
}

async function submit() {
  if (selectionBusy.value) return
  clearMessages()
  isSubmitting.value = true
  try {
    await receivableStore.create({
      ...form,
      buyerBusinessNumber: normalizeBusinessNumber(form.buyerBusinessNumber),
      documentHash: form.documentHash || null,
      description: form.description || null,
    })
    successMessage.value = '등록 완료. Seller 지갑으로 채권을 발행해 주세요.'
    showForm.value = false
  } catch (error) {
    errorMessage.value = error.message
  } finally {
    isSubmitting.value = false
  }
}

async function selectReceivable(receivableId) {
  if (isChainActionRunning.value || isSubmitting.value || isRefreshing.value) return
  const requestSequence = ++selectionRequestSequence
  isSelecting.value = true
  clearMessages()
  resetTokenizationJournalCheck()
  buyerAttestationAccepted.value = false
  try {
    const receivable = await receivableStore.fetchOne(receivableId)
    if (requestSequence !== selectionRequestSequence) return
    buyerAttestationAccepted.value = false
    receivableStore.selectOne(receivable)
    if (pendingSyncForSelected.value) {
      lastTxHash.value = pendingSync.value.payload.txHash
    }
    await inspectSelectedTokenizationJournal()
  } catch (error) {
    if (requestSequence !== selectionRequestSequence) return
    errorMessage.value = error.message
  } finally {
    if (requestSequence === selectionRequestSequence) isSelecting.value = false
  }
}

async function selectPendingReceivable() {
  if (!pendingSync.value) return
  const recoveryRouteName = externalRecoveryRouteName(pendingSync.value)
  if (recoveryRouteName) {
    await router.push({ name: recoveryRouteName })
    return
  }
  await selectReceivable(pendingSync.value.receivableId)
}

async function refreshSelectedReceivable() {
  if (selectionBusy.value) return
  const receivableId = selectedReceivable.value?.receivableId
  if (!receivableId) return

  clearMessages({ keepTransaction: Boolean(pendingSync.value) })
  resetTokenizationJournalCheck()
  buyerAttestationAccepted.value = false
  isRefreshing.value = true
  try {
    await Promise.all([receivableStore.loadAll(), receivableStore.loadOne(receivableId)])
    successMessage.value = '채권의 최신 상태를 불러왔습니다.'
    await inspectSelectedTokenizationJournal()
  } catch (error) {
    errorMessage.value = error.message
  } finally {
    isRefreshing.value = false
  }
}

async function createOnchain() {
  if (!canCreateOnchain.value) return
  const receivable = selectedReceivable.value
  if (!receivable) return

  clearMessages()
  isChainActionRunning.value = true
  actionStage.value = 'MetaMask 서명 후 블록 확인을 기다리고 있습니다...'
  try {
    const result = await createReceivableOnchain(receivable, (submitted) => {
      savePendingSynchronization({
        type: 'chain-created',
        phase: 'submitted',
        receivableId: receivable.receivableId,
        companyId: currentCompanyId.value,
        payload: submitted,
      })
      lastTxHash.value = submitted.txHash
    })
    savePendingSynchronization({
      type: 'chain-created',
      phase: 'confirmed',
      journalConfirmed: true,
      receivableId: receivable.receivableId,
      companyId: currentCompanyId.value,
      payload: result,
    })
    lastTxHash.value = result.txHash
    await synchronizePending()
  } catch (error) {
    lastTxHash.value = error.txHash ?? pendingSync.value?.payload.txHash ?? ''
    clearTerminalPendingTransaction(error)
    errorMessage.value = error.message
    actionStage.value = ''
  } finally {
    isChainActionRunning.value = false
  }
}

async function verifyOnchain() {
  const receivable = selectedReceivable.value
  if (!receivable) return
  if (!canSubmitVerification.value) {
    errorMessage.value = '채권 내용을 확인하고 Buyer 검증 동의 항목을 선택해 주세요.'
    return
  }

  clearMessages()
  isChainActionRunning.value = true
  actionStage.value = 'Buyer MetaMask 서명 후 블록 확인을 기다리고 있습니다...'
  try {
    const result = await verifyReceivableOnchain(receivable, (submitted) => {
      savePendingSynchronization({
        type: 'verified',
        phase: 'submitted',
        receivableId: receivable.receivableId,
        companyId: currentCompanyId.value,
        payload: submitted,
      })
      lastTxHash.value = submitted.txHash
    })
    savePendingSynchronization({
      type: 'verified',
      phase: 'confirmed',
      journalConfirmed: true,
      receivableId: receivable.receivableId,
      companyId: currentCompanyId.value,
      payload: result,
    })
    lastTxHash.value = result.txHash
    await synchronizePending()
  } catch (error) {
    lastTxHash.value = error.txHash ?? pendingSync.value?.payload.txHash ?? ''
    clearTerminalPendingTransaction(error)
    errorMessage.value = error.message
    actionStage.value = ''
  } finally {
    isChainActionRunning.value = false
  }
}

async function tokenizeOnchain() {
  if (selectionBusy.value) return
  const requestedReceivable = selectedReceivable.value
  if (!requestedReceivable) return
  if (pendingSync.value || !isTokenizationCandidateFor(requestedReceivable)) {
    errorMessage.value = 'Buyer 검증과 온체인 메타데이터를 확인한 뒤 다시 시도해 주세요.'
    return
  }

  clearMessages()
  const journalAllowsMint = await inspectSelectedTokenizationJournal()
  const receivable = selectedReceivable.value
  if (
    !journalAllowsMint ||
    pendingSync.value ||
    !sameId(requestedReceivable.receivableId, receivable?.receivableId) ||
    !isTokenizationCandidateFor(receivable)
  ) {
    return
  }

  isChainActionRunning.value = true
  actionStage.value = 'Seller MetaMask 서명 후 NFT 민팅 블록 확인을 기다리고 있습니다...'
  try {
    const result = await tokenizeReceivableOnchain(receivable, (submitted) => {
      savePendingSynchronization({
        type: 'tokenized',
        phase: 'submitted',
        receivableId: receivable.receivableId,
        companyId: currentCompanyId.value,
        payload: submitted,
      })
      lastTxHash.value = submitted.txHash
    })
    savePendingSynchronization({
      type: 'tokenized',
      phase: 'confirmed',
      journalConfirmed: true,
      receivableId: receivable.receivableId,
      companyId: currentCompanyId.value,
      payload: result,
    })
    lastTxHash.value = result.txHash
    await synchronizePending()
  } catch (error) {
    lastTxHash.value = error.txHash ?? pendingSync.value?.payload.txHash ?? ''
    clearTerminalPendingTransaction(error)
    errorMessage.value = error.message
    actionStage.value = ''
  } finally {
    isChainActionRunning.value = false
  }
}

async function refreshTokenizationJournal() {
  clearMessages({ keepTransaction: Boolean(pendingSync.value) })
  await inspectSelectedTokenizationJournal()
}

async function inspectSelectedTokenizationJournal() {
  const receivable = selectedReceivable.value
  const storedTokenization =
    pendingSync.value?.type === 'tokenized' &&
    sameId(pendingSync.value.receivableId, receivable?.receivableId)
      ? pendingSync.value
      : null
  if (receivable?.status === 'TOKENIZED') {
    if (storedTokenization) {
      clearPendingSynchronization()
      lastTxHash.value = receivable.tokenizeTxHash ?? storedTokenization.payload?.txHash ?? ''
    }
    resetTokenizationJournalCheck()
    return false
  }
  if (!isTokenizationCandidateFor(receivable)) {
    resetTokenizationJournalCheck()
    return false
  }

  const localTokenization = storedTokenization
  if (pendingSync.value && !localTokenization) {
    tokenizationJournalRequestSequence += 1
    setTokenizationJournalState(
      'blocked',
      receivable.receivableId,
      `채권 #${pendingSync.value.receivableId}의 기존 블록체인 작업을 먼저 처리해야 합니다.`,
    )
    return false
  }

  const requestSequence = ++tokenizationJournalRequestSequence
  const receivableId = receivable.receivableId
  setTokenizationJournalState(
    'checking',
    receivableId,
    '서버의 기존 NFT 민팅 이력을 확인하고 있습니다. 확인 전에는 새 민팅을 시작할 수 없습니다.',
  )

  try {
    const transactions = await getReceivableBlockchainTransactions(receivableId)
    if (!isCurrentTokenizationJournalRequest(requestSequence, receivableId)) {
      return false
    }
    if (!Array.isArray(transactions)) {
      throw new Error('서버의 민팅 이력 응답 형식을 확인할 수 없습니다.')
    }

    const tokenizationTransactions = transactions.filter(
      (transaction) => transaction?.transactionType === TOKENIZE_TRANSACTION_TYPE,
    )
    const localJournal = tokenizationTransactions.find((transaction) =>
      sameHex(transaction?.txHash, localTokenization?.payload?.txHash),
    )
    const selectedJournal = selectTokenizationJournal(
      tokenizationTransactions,
      localTokenization?.payload?.txHash,
      receivable,
    )

    if (selectedJournal?.kind === 'unknown') {
      setTokenizationJournalState(
        'blocked',
        receivableId,
        '서버에 상태를 판별할 수 없는 민팅 이력이 있습니다. 새 민팅을 진행하지 말고 서버 상태를 다시 확인해 주세요.',
      )
      return false
    }

    if (!selectedJournal) {
      if (localTokenization) {
        if (localJournal?.txStatus === 'FAILED') {
          clearPendingSynchronization()
          lastTxHash.value = ''
          setTokenizationJournalState(
            'clear',
            receivableId,
            '기존 민팅 트랜잭션이 실패로 확정되어 복구 대기를 정리했습니다. 서버에 성공하거나 진행 중인 다른 민팅은 없습니다.',
          )
          return true
        }
        setTokenizationJournalState(
          'adopted',
          receivableId,
          '브라우저에 복구할 민팅 트랜잭션이 남아 있습니다. 서버 저널에 아직 보이지 않더라도 새 민팅을 보내지 말고 기존 트랜잭션 확인을 이어받아 주세요.',
        )
        return false
      }
      setTokenizationJournalState(
        'clear',
        receivableId,
        '서버에서 진행 중이거나 성공한 기존 NFT 민팅이 확인되지 않았습니다.',
      )
      return true
    }

    if (localTokenization && !localJournal && selectedJournal.kind === 'pending') {
      const additionalServerPendingCount = tokenizationTransactions.filter(
        (transaction) => transaction?.txStatus === 'PENDING',
      ).length
      savePendingSynchronization({
        ...localTokenization,
        additionalServerPendingCount,
      })
      lastTxHash.value = localTokenization.payload.txHash
      setTokenizationJournalState(
        'adopted',
        receivableId,
        `브라우저에 저장된 기존 민팅을 먼저 복구합니다. 서버에도 별도 PENDING ${additionalServerPendingCount}건이 있어 새 민팅은 계속 차단됩니다.`,
      )
      return false
    }

    const journal = selectedJournal.journal
    if (!isValidTokenizationJournal(journal, receivable)) {
      setTokenizationJournalState(
        'blocked',
        receivableId,
        '서버 민팅 이력의 회사·지갑·컨트랙트 정보가 현재 채권과 일치하지 않습니다. 안전을 위해 새 민팅을 차단했습니다.',
      )
      return false
    }

    if (selectedJournal.kind === 'confirmed') {
      const hasRpcProof = hasCompleteTokenizationRpcProof(journal, receivable)
      savePendingSynchronization({
        type: 'tokenized',
        phase: 'confirmed',
        journalConfirmed: true,
        recoveredFromServerJournal: true,
        serverRpcProof: hasRpcProof,
        receivableId,
        companyId: currentCompanyId.value,
        payload: {
          txHash: journal.txHash,
          contractAddress: journal.contractAddress,
          ...(hasRpcProof ? { tokenId: String(journal.eventTokenId) } : {}),
        },
      })
      lastTxHash.value = journal.txHash
      setTokenizationJournalState(
        'adopted',
        receivableId,
        hasRpcProof
          ? '이미 성공하고 RPC 검증된 NFT 민팅을 확인했습니다. MetaMask를 다시 호출하지 말고 민팅 결과를 DB에 동기화해 주세요.'
          : '이미 CONFIRMED 처리된 NFT 민팅을 확인했습니다. MetaMask를 다시 호출하지 말고 서버 RPC 재검증과 DB 동기화를 진행해 주세요.',
      )
      return false
    }

    const pendingTransactions = tokenizationTransactions.filter(
      (transaction) => transaction?.txStatus === 'PENDING',
    )
    const existingPayload = sameHex(localTokenization?.payload?.txHash, journal.txHash)
      ? localTokenization.payload
      : {}
    savePendingSynchronization({
      type: 'tokenized',
      phase: 'submitted',
      recoveredFromServerJournal: true,
      pendingTransactionCount: pendingTransactions.length,
      receivableId,
      companyId: currentCompanyId.value,
      payload: {
        ...existingPayload,
        txHash: journal.txHash,
        contractAddress: journal.contractAddress,
      },
    })
    lastTxHash.value = journal.txHash
    setTokenizationJournalState(
      'adopted',
      receivableId,
      pendingTransactions.length > 1
        ? `서버에 진행 중인 민팅 ${pendingTransactions.length}건이 있습니다. 새 민팅은 차단되며, 우선 선택된 기존 트랜잭션의 블록 확인을 이어받아야 합니다.`
        : '서버에 진행 중인 민팅이 있습니다. 새 민팅을 보내지 말고 기존 트랜잭션의 블록 확인을 이어받아 주세요.',
    )
    return false
  } catch (error) {
    if (!isCurrentTokenizationJournalRequest(requestSequence, receivableId)) {
      return false
    }
    setTokenizationJournalState(
      'error',
      receivableId,
      `서버의 기존 민팅 이력을 확인하지 못해 새 민팅을 차단했습니다. 서버 연결을 확인한 뒤 다시 조회해 주세요. (${error.message})`,
    )
    return false
  }
}

function selectTokenizationJournal(transactions, localTxHash, receivable) {
  const confirmedTransactions = transactions.filter(
    (transaction) => transaction?.txStatus === 'CONFIRMED',
  )
  const rpcConfirmed = confirmedTransactions.find((transaction) =>
    hasCompleteTokenizationRpcProof(transaction, receivable),
  )
  if (rpcConfirmed) {
    return { kind: 'confirmed', journal: rpcConfirmed }
  }
  if (confirmedTransactions.length) {
    return {
      kind: 'confirmed',
      journal: confirmedTransactions[0],
    }
  }

  const pendingTransactions = transactions.filter(
    (transaction) => transaction?.txStatus === 'PENDING',
  )
  const localPending = pendingTransactions.find((transaction) =>
    sameHex(transaction.txHash, localTxHash),
  )
  if (localPending) {
    return { kind: 'pending', journal: localPending }
  }
  if (pendingTransactions.length) {
    return { kind: 'pending', journal: pendingTransactions[0] }
  }

  const hasUnknownStatus = transactions.some((transaction) => transaction?.txStatus !== 'FAILED')
  return hasUnknownStatus ? { kind: 'unknown' } : null
}

function isValidTokenizationJournal(journal, receivable) {
  return (
    sameId(journal?.receivableId, receivable.receivableId) &&
    sameId(journal?.companyId, currentCompanyId.value) &&
    sameHex(journal?.walletAddress, receivable.sellerWalletAddress) &&
    sameHex(journal?.contractAddress, receivable.contractAddress) &&
    journal?.functionName === 'tokenizeReceivable' &&
    isTransactionHash(journal?.txHash)
  )
}

function hasCompleteTokenizationRpcProof(journal, receivable) {
  return (
    journal?.txStatus === 'CONFIRMED' &&
    Boolean(journal.rpcVerifiedAt) &&
    isPositiveIntegerString(journal.chainId) &&
    isPositiveIntegerString(journal.blockNumber) &&
    isTransactionHash(journal.blockHash) &&
    isPositiveIntegerString(journal.gasUsed) &&
    isNonNegativeDecimalString(journal.effectiveGasPrice) &&
    sameId(journal.eventReceivableId, receivable.onchainReceivableId) &&
    isPositiveIntegerString(journal.eventTokenId) &&
    isPositiveIntegerString(journal.verificationVersion)
  )
}

function setTokenizationJournalState(status, receivableId, message) {
  tokenizationJournalStatus.value = status
  tokenizationJournalReceivableId.value = receivableId
  tokenizationJournalMessage.value = message
}

function resetTokenizationJournalCheck() {
  tokenizationJournalRequestSequence += 1
  setTokenizationJournalState('idle', null, '')
}

function isCurrentTokenizationJournalRequest(requestSequence, receivableId) {
  return (
    requestSequence === tokenizationJournalRequestSequence &&
    isTokenizationCandidateFor(selectedReceivable.value) &&
    sameId(selectedReceivable.value?.receivableId, receivableId)
  )
}

async function retryPendingSync() {
  if (!pendingSync.value) return
  const recoveryRouteName = externalRecoveryRouteName(pendingSync.value)
  if (recoveryRouteName) {
    await router.push({ name: recoveryRouteName })
    return
  }
  clearMessages({ keepTransaction: true })
  isChainActionRunning.value = true
  try {
    if (
      pendingSync.value.type === 'tokenized' &&
      pendingSync.value.recoveredFromServerJournal &&
      pendingSync.value.phase === 'confirmed'
    ) {
      await inspectSelectedTokenizationJournal()
      if (
        tokenizationJournalStatus.value !== 'adopted' ||
        pendingSync.value?.type !== 'tokenized' ||
        !pendingSync.value.recoveredFromServerJournal ||
        pendingSync.value.phase !== 'confirmed'
      ) {
        if (
          tokenizationJournalStatus.value === 'error' ||
          tokenizationJournalStatus.value === 'blocked'
        ) {
          errorMessage.value = tokenizationJournalMessage.value
        }
        return
      }
      await synchronizePending()
      return
    }
    if (pendingSync.value.phase === 'submitted') {
      await resumePendingConfirmation()
    } else {
      await synchronizePending()
    }
  } finally {
    isChainActionRunning.value = false
  }
}

async function resumePendingConfirmation() {
  const synchronization = pendingSync.value
  const receivable = selectedReceivable.value
  if (!synchronization || !receivable) return

  actionStage.value = '기존 트랜잭션의 블록 확인을 이어받고 있습니다...'
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
      payload: result,
    })
    lastTxHash.value = result.txHash
    await synchronizePending()
  } catch (error) {
    actionStage.value = ''
    lastTxHash.value =
      error.txHash ?? pendingSync.value?.payload.txHash ?? synchronization.payload.txHash
    clearTerminalPendingTransaction(error)
    errorMessage.value = error.message
  }
}

async function synchronizePending() {
  const synchronization = pendingSync.value
  if (!synchronization) return
  if (synchronization.phase !== 'confirmed') {
    await resumePendingConfirmation()
    return
  }
  if (
    !synchronization.journalConfirmed &&
    isSynchronizationAlreadyApplied(synchronization, selectedReceivable.value)
  ) {
    successMessage.value = '이미 서버에 반영된 블록체인 작업을 확인했습니다.'
    clearPendingSynchronization()
    actionStage.value = ''
    return
  }
  if (!synchronization.journalConfirmed) {
    await resumePendingConfirmation()
    return
  }

  actionStage.value = '온체인 트랜잭션 확인 완료 · 서버 상태를 동기화하고 있습니다...'
  try {
    switch (synchronization.type) {
      case 'chain-created':
        await receivableStore.markChainCreated(
          synchronization.receivableId,
          synchronization.payload,
        )
        successMessage.value = '채권 생성과 서버 동기화가 완료되었습니다. Buyer 검증을 기다립니다.'
        break
      case 'verified':
        await receivableStore.markVerified(synchronization.receivableId, synchronization.payload)
        successMessage.value =
          'Buyer 검증과 서버 동기화가 완료되었습니다. 다음 단계는 Seller 토큰화입니다.'
        buyerAttestationAccepted.value = false
        break
      case 'tokenized':
        await receivableStore.markTokenized(synchronization.receivableId, {
          txHash: synchronization.payload.txHash,
        })
        successMessage.value =
          '채권 토큰화와 NFT 민팅이 완료되었습니다. 다음 단계는 Funder 자금 공급입니다.'
        break
      default:
        throw new Error('저장된 블록체인 작업 종류를 확인할 수 없습니다.')
    }
    clearPendingSynchronization()
    actionStage.value = ''
  } catch (error) {
    const isTerminal = clearTerminalPendingTransaction(error)
    const isServerRecoveredTokenization =
      synchronization.type === 'tokenized' && synchronization.recoveredFromServerJournal
    if (!isServerRecoveredTokenization && error.code === 'BLOCKCHAIN_TRANSACTION_NOT_CONFIRMED') {
      savePendingSynchronization({
        ...synchronization,
        journalConfirmed: false,
      })
    } else if (
      !isServerRecoveredTokenization &&
      error.code === 'BLOCKCHAIN_SYNCHRONIZATION_EVENT_MISMATCH'
    ) {
      savePendingSynchronization({
        ...synchronization,
        phase: 'submitted',
      })
    }
    actionStage.value = ''
    if (isTerminal) {
      errorMessage.value =
        `서버의 온체인 검증에서 복구할 수 없는 오류를 확인해 대기 작업을 정리했습니다. ` +
        `화면을 새로고침한 뒤 지갑·네트워크·채권 정보를 확인해 주세요. (${error.message})`
      return
    }
    if (isServerRecoveredTokenization) {
      errorMessage.value =
        `기존 민팅의 서버 동기화에 실패했습니다. MetaMask로 다시 민팅하지 말고 ` +
        `아래 버튼으로 서버 저널을 재확인한 뒤 DB 동기화만 다시 진행해 주세요. (${error.message})`
      return
    }
    errorMessage.value =
      `온체인 트랜잭션은 성공했지만 서버 동기화에 실패했습니다. ` +
      `컨트랙트를 다시 호출하지 말고 아래 버튼으로 재시도해 주세요. (${error.message})`
  }
}

function clearMessages({ keepTransaction = false } = {}) {
  errorMessage.value = ''
  successMessage.value = ''
  actionStage.value = ''
  if (!keepTransaction) lastTxHash.value = ''
}

function readPendingSynchronization(companyId) {
  try {
    const value = localStorage.getItem(PENDING_SYNC_STORAGE_KEY)
    if (!value || companyId == null) return null
    return JSON.parse(value)[String(companyId)] ?? null
  } catch {
    localStorage.removeItem(PENDING_SYNC_STORAGE_KEY)
    return null
  }
}

function savePendingSynchronization(synchronization) {
  pendingSync.value = synchronization
  let synchronizations
  try {
    synchronizations = JSON.parse(localStorage.getItem(PENDING_SYNC_STORAGE_KEY) ?? '{}')
  } catch {
    synchronizations = {}
  }
  synchronizations[String(synchronization.companyId)] = synchronization
  localStorage.setItem(PENDING_SYNC_STORAGE_KEY, JSON.stringify(synchronizations))
}

function clearPendingSynchronization() {
  const companyId = pendingSync.value?.companyId ?? currentCompanyId.value
  if (pendingSync.value?.type === 'tokenized') {
    tokenizationJournalRequestSequence += 1
  }
  pendingSync.value = null
  if (companyId == null) return

  try {
    const synchronizations = JSON.parse(localStorage.getItem(PENDING_SYNC_STORAGE_KEY) ?? '{}')
    delete synchronizations[String(companyId)]
    if (Object.keys(synchronizations).length) {
      localStorage.setItem(PENDING_SYNC_STORAGE_KEY, JSON.stringify(synchronizations))
    } else {
      localStorage.removeItem(PENDING_SYNC_STORAGE_KEY)
    }
  } catch {
    localStorage.removeItem(PENDING_SYNC_STORAGE_KEY)
  }
}

function clearTerminalPendingTransaction(error) {
  const isTerminal =
    error.code === 'TRANSACTION_FAILED' ||
    error.code === 'TRANSACTION_CANCELLED' ||
    error.code === 'BLOCKCHAIN_TRANSACTION_FAILED' ||
    error.code === 'BLOCKCHAIN_TRANSACTION_REVERTED' ||
    error.code === 'BLOCKCHAIN_TRANSACTION_VERIFICATION_FAILED' ||
    error.code === 'BLOCKCHAIN_EVENT_MISMATCH'

  if (isTerminal) {
    clearPendingSynchronization()
  }
  return isTerminal
}

function isSynchronizationAlreadyApplied(synchronization, receivable) {
  if (!receivable) return false

  if (synchronization.type === 'chain-created') {
    return (
      sameId(synchronization.payload.onchainReceivableId, receivable.onchainReceivableId) &&
      sameHex(synchronization.payload.contractAddress, receivable.contractAddress) &&
      sameHex(synchronization.payload.txHash, receivable.createTxHash)
    )
  }

  if (synchronization.type === 'verified') {
    return sameHex(synchronization.payload.txHash, receivable.verifyTxHash)
  }

  if (synchronization.type === 'tokenized') {
    return (
      sameHex(synchronization.payload.txHash, receivable.tokenizeTxHash) &&
      sameId(synchronization.payload.tokenId, receivable.tokenId)
    )
  }

  return false
}

function sameId(first, second) {
  return first != null && second != null && String(first) === String(second)
}

function sameHex(first, second) {
  return (
    typeof first === 'string' &&
    typeof second === 'string' &&
    first.toLowerCase() === second.toLowerCase()
  )
}

function isBuyerFor(receivable) {
  return sameId(currentCompanyId.value, receivable.buyerCompanyId)
}

function openMidnightProof() {
  if (!canStartMidnightProof.value) return
  router.push({
    name: 'midnight-prove',
    query: { receivableId: String(selectedReceivable.value.receivableId) },
  })
}

function externalRecoveryRouteName(synchronization) {
  if (synchronization?.type === 'funded') return 'funding'
  if (synchronization?.type === 'repaid') return 'repayment'
  return null
}

function counterpartyName(receivable) {
  return isBuyerFor(receivable) ? receivable.sellerCompanyName : receivable.buyerCompanyName
}

function counterpartyRole(receivable) {
  return isBuyerFor(receivable) ? 'Seller' : 'Buyer'
}

function receivableActionLabel(receivable) {
  if (receivable.status === 'REPAID') {
    return '상환 완료'
  }
  if (receivable.status === 'FUNDED') {
    return isBuyerFor(receivable) ? 'Buyer 상환 필요' : 'Buyer 상환 대기'
  }
  if (isBuyerFor(receivable) && receivable.status === 'CREATED') {
    return hasCompleteBlockchainMetadata(receivable) ? 'Buyer 검증 필요' : 'Seller 온체인 생성 대기'
  }
  if (isBuyerFor(receivable) && receivable.status === 'VERIFIED') {
    return 'Seller 토큰화 대기'
  }
  if (
    sameId(currentCompanyId.value, receivable.sellerCompanyId) &&
    receivable.status === 'CREATED'
  ) {
    return receivable.onchainReceivableId ? 'Buyer 검증 대기' : 'Seller 온체인 생성 필요'
  }
  if (
    sameId(currentCompanyId.value, receivable.sellerCompanyId) &&
    receivable.status === 'VERIFIED'
  ) {
    return 'Seller 토큰화 필요'
  }
  if (receivable.status === 'TOKENIZED') {
    return 'Funder 자금 공급 대기'
  }
  return receivable.status
}

function hasCompleteBlockchainMetadata(receivable) {
  return Boolean(
    receivable?.onchainReceivableId && receivable?.contractAddress && receivable?.createTxHash,
  )
}

function isTokenizationCandidateFor(receivable) {
  return Boolean(
    receivable &&
    sameId(currentCompanyId.value, receivable.sellerCompanyId) &&
    receivable.status === 'VERIFIED' &&
    hasCompleteBlockchainMetadata(receivable) &&
    receivable.verifyTxHash,
  )
}

function isTransactionHash(value) {
  return typeof value === 'string' && /^0x[0-9a-fA-F]{64}$/.test(value)
}

function isPositiveIntegerString(value) {
  return /^[1-9][0-9]*$/.test(String(value ?? ''))
}

function isNonNegativeDecimalString(value) {
  return /^(0|[1-9][0-9]*)(\.[0-9]+)?$/.test(String(value ?? ''))
}

function formatAmount(value) {
  if (value == null) return '-'
  return String(value).replace(/\B(?=(\d{3})+(?!\d))/g, ',')
}

function updateBuyerBusinessNumber(event) {
  form.buyerBusinessNumber = formatBusinessNumber(event.target.value)
}
</script>

<template>
  <main class="receivables-page">
    <header class="page-header">
      <div>
        <p class="eyebrow">채권 관리</p>
        <h1>채권 발행</h1>
      </div>
      <div class="header-actions">
        <button class="secondary" type="button" @click="router.push({ name: 'dashboard' })">
          <LayoutDashboard :size="16" aria-hidden="true" />
          대시보드
        </button>
        <button type="button" :disabled="selectionBusy" @click="showForm = !showForm">
          <X v-if="showForm" :size="16" aria-hidden="true" />
          <Plus v-else :size="16" aria-hidden="true" />
          {{ showForm ? '등록 취소' : '새 채권 등록' }}
        </button>
      </div>
    </header>

    <p v-if="amountHint" class="message pending" role="note">{{ amountHint }}</p>

    <p v-if="errorMessage" class="message error" role="alert">
      <TriangleAlert :size="18" aria-hidden="true" />
      {{ errorMessage }}
    </p>
    <p v-if="successMessage" class="message success" role="status">
      <CircleCheckBig :size="18" aria-hidden="true" />
      {{ successMessage }}
    </p>
    <p v-if="actionStage" class="message pending" aria-live="polite">
      <LoaderCircle class="spinning" :size="18" aria-hidden="true" />
      {{ actionStage }}
    </p>
    <p v-if="lastTxHash" class="message transaction">
      <ExternalLink :size="18" aria-hidden="true" />
      <span>트랜잭션: {{ lastTxHash }}</span>
      <a
        v-if="transactionExplorerUrl(lastTxHash)"
        :href="transactionExplorerUrl(lastTxHash)"
        target="_blank"
        rel="noopener noreferrer"
      >
        Explorer에서 보기
      </a>
    </p>

    <section v-if="showForm" class="registration-section">
      <h2>매출채권 등록</h2>
      <p v-if="!receivableStore.amountPolicy" class="message error" role="alert">
        금액 한도 확인이 필요합니다.
        <button type="button" class="secondary" @click="loadAmountPolicy">다시 확인</button>
      </p>
      <form @submit.prevent="submit">
        <label>
          Buyer 사업자등록번호
          <input
            :value="form.buyerBusinessNumber"
            inputmode="numeric"
            minlength="12"
            maxlength="12"
            pattern="[0-9]{3}-[0-9]{2}-[0-9]{5}"
            title="사업자등록번호 숫자 10자리를 입력해 주세요."
            required
            @input="updateBuyerBusinessNumber"
          />
        </label>
        <div class="two-columns">
          <label>
            채권·상환 금액 (mKRW)
            <input
              v-model="form.faceValue"
              type="text"
              inputmode="numeric"
              pattern="[1-9][0-9]{0,35}"
              maxlength="36"
              aria-describedby="amount-guidance"
              required
            />
          </label>
          <label>
            펀딩 요청 금액 (mKRW)
            <input
              v-model="form.fundingAmount"
              type="text"
              inputmode="numeric"
              pattern="[1-9][0-9]{0,35}"
              maxlength="36"
              aria-describedby="amount-guidance"
              required
            />
          </label>
          <label>
            발행일
            <input v-model="form.issueDate" type="date" required />
          </label>
          <label>
            만기일
            <input v-model="form.maturityDate" type="date" required />
          </label>
        </div>
        <p id="amount-guidance" :class="{ 'amount-error': amountError }" aria-live="polite">
          {{ amountError || '1 mKRW 단위 · 상환은 채권 금액 전액입니다.' }}
        </p>
        <label>
          문서 SHA-256 해시 (선택)
          <input v-model="form.documentHash" maxlength="66" placeholder="0x..." />
        </label>
        <label>
          설명 (선택)
          <textarea v-model="form.description" maxlength="1000" rows="3"></textarea>
        </label>
        <button type="submit" :disabled="selectionBusy || Boolean(amountError)">
          <LoaderCircle v-if="isSubmitting" class="spinning" :size="16" aria-hidden="true" />
          <Database v-else :size="16" aria-hidden="true" />
          {{ isSubmitting ? '등록 중...' : '채권 등록' }}
        </button>
      </form>
    </section>

    <div class="receivables-workspace">
      <section class="list-pane">
        <h2>채권 목록</h2>
        <p v-if="isPageLoading" class="empty loading-state" role="status">
          <LoaderCircle class="spinning" :size="18" aria-hidden="true" />
          채권 목록을 불러오고 있습니다...
        </p>
        <p v-else-if="hasLoadedReceivables && !receivableStore.receivables.length" class="empty">
          등록되거나 배정된 채권이 없습니다.
        </p>
        <button
          v-for="item in receivableStore.receivables"
          v-show="!isPageLoading"
          :key="item.receivableId"
          class="receivable-row"
          :class="{
            selected: sameId(selectedReceivable?.receivableId, item.receivableId),
          }"
          type="button"
          :aria-pressed="sameId(selectedReceivable?.receivableId, item.receivableId)"
          :disabled="isChainActionRunning || isRefreshing || isSubmitting"
          @click="selectReceivable(item.receivableId)"
        >
          <span>
            <strong>
              #{{ item.receivableId }} · {{ counterpartyRole(item) }}
              {{ displayCompanyName(counterpartyName(item)) }}
            </strong>
            <small>{{ item.issueDate }} → {{ item.maturityDate }}</small>
            <small class="action-hint">
              {{ receivableActionLabel(item) }}
            </small>
          </span>
          <span class="amount"> {{ formatAmount(item.faceValue) }} mKRW </span>
          <span class="status">{{ item.status }}</span>
        </button>
      </section>

      <section class="detail-pane">
        <h2>상세 정보</h2>
        <p v-if="isPageLoading" class="empty loading-state" role="status">
          <LoaderCircle class="spinning" :size="18" aria-hidden="true" />
          채권 상세 정보를 준비하고 있습니다...
        </p>
        <template v-else-if="selectedReceivable">
          <dl class="receivable-details">
            <dt>채권 번호</dt>
            <dd>#{{ selectedReceivable.receivableId }}</dd>
            <dt>Seller</dt>
            <dd>{{ displayCompanyName(selectedReceivable.sellerCompanyName) }}</dd>
            <dt>Buyer</dt>
            <dd>{{ displayCompanyName(selectedReceivable.buyerCompanyName) }}</dd>
            <dt>Funder</dt>
            <dd>{{ displayCompanyName(selectedReceivable.funderCompanyName) || '-' }}</dd>
            <dt>채권 금액</dt>
            <dd>{{ formatAmount(selectedReceivable.faceValue) }} mKRW</dd>
            <dt>펀딩 요청</dt>
            <dd>{{ formatAmount(selectedReceivable.fundingAmount) }} mKRW</dd>
            <dt>발행일</dt>
            <dd>{{ selectedReceivable.issueDate }}</dd>
            <dt>만기일</dt>
            <dd>{{ selectedReceivable.maturityDate }}</dd>
            <dt>Seller 지갑</dt>
            <dd class="technical-value">{{ selectedReceivable.sellerWalletAddress }}</dd>
            <dt>Buyer 지갑</dt>
            <dd class="technical-value">{{ selectedReceivable.buyerWalletAddress }}</dd>
            <dt>Funder 지갑</dt>
            <dd class="technical-value">{{ selectedReceivable.funderWalletAddress || '-' }}</dd>
            <dt>문서 해시</dt>
            <dd class="technical-value">
              {{ selectedReceivable.documentHash || '등록되지 않음' }}
            </dd>
            <dt>상태</dt>
            <dd>{{ selectedReceivable.status }}</dd>
            <dt>설명</dt>
            <dd>{{ selectedReceivable.description || '-' }}</dd>
          </dl>

          <section
            v-if="canStartMidnightProof"
            class="midnight-proof-entry"
            aria-labelledby="midnight-proof-entry-title"
          >
            <ShieldCheck :size="20" aria-hidden="true" />
            <div>
              <h3 id="midnight-proof-entry-title">이 채권 역할로 받은 검증 요청</h3>
              <p>
                {{ isSeller ? 'Seller' : 'Buyer' }}로 받은 요청을 확인하고 가상 재무값으로
                응답합니다.
              </p>
              <button type="button" @click="openMidnightProof">
                <ShieldCheck :size="16" aria-hidden="true" />
                받은 요청 확인
              </button>
            </div>
          </section>

          <section class="workflow-section" aria-labelledby="workflow-title">
            <div class="section-heading">
              <div>
                <p class="section-eyebrow">블록체인 워크플로</p>
                <h3 id="workflow-title">채권 진행 단계</h3>
              </div>
              <span class="current-status">{{ selectedReceivable.status }}</span>
            </div>

            <div
              v-if="pendingSync && !pendingSyncForSelected"
              class="cross-sync-alert"
              role="alert"
            >
              <TriangleAlert :size="18" aria-hidden="true" />
              <div>
                <strong>다른 채권의 동기화가 필요합니다</strong>
                <p>
                  채권 #{{ pendingSync.receivableId }}의 서버 동기화가 남아 있어 새 블록체인 요청이
                  잠겨 있습니다.
                </p>
                <button type="button" @click="selectPendingReceivable">
                  <RotateCcw :size="16" aria-hidden="true" />
                  미동기화 채권으로 이동
                </button>
              </div>
            </div>

            <ol class="workflow-timeline" aria-label="블록체인 채권 진행 단계">
              <li
                v-for="step in workflowSteps"
                :key="step.key"
                class="workflow-step"
                :class="`is-${workflowStepState(step.key)}`"
                :aria-current="workflowStepState(step.key) === 'current' ? 'step' : undefined"
              >
                <div class="step-rail" aria-hidden="true">
                  <span class="step-marker">
                    <Check
                      v-if="workflowStepState(step.key) === 'complete'"
                      :size="16"
                      stroke-width="2.5"
                    />
                    <component :is="step.icon" v-else :size="16" />
                  </span>
                </div>

                <div class="step-content">
                  <div class="step-heading">
                    <div>
                      <span class="step-code">{{ step.key }}</span>
                      <h4>{{ step.title }}</h4>
                    </div>
                    <span class="step-state">
                      {{
                        workflowStepState(step.key) === 'complete'
                          ? '완료'
                          : workflowStepState(step.key) === 'current'
                            ? '현재 단계'
                            : '대기'
                      }}
                    </span>
                  </div>
                  <p class="step-description">{{ step.description }}</p>

                  <dl
                    v-if="
                      step.key === 'CREATED' &&
                      (selectedReceivable.onchainReceivableId ||
                        selectedReceivable.contractAddress ||
                        selectedReceivable.createTxHash)
                    "
                    class="step-metadata"
                  >
                    <template v-if="selectedReceivable.onchainReceivableId">
                      <dt>온체인 ID</dt>
                      <dd>{{ selectedReceivable.onchainReceivableId }}</dd>
                    </template>
                    <template v-if="selectedReceivable.contractAddress">
                      <dt>컨트랙트</dt>
                      <dd class="chain-reference">
                        <span>{{ selectedReceivable.contractAddress }}</span>
                        <a
                          v-if="addressExplorerUrl(selectedReceivable.contractAddress)"
                          class="explorer-button"
                          :href="addressExplorerUrl(selectedReceivable.contractAddress)"
                          target="_blank"
                          rel="noopener noreferrer"
                          aria-label="컨트랙트 주소를 익스플로러에서 보기"
                        >
                          <ExternalLink :size="13" aria-hidden="true" />
                          익스플로러
                        </a>
                      </dd>
                    </template>
                    <template v-if="selectedReceivable.createTxHash">
                      <dt>생성 Tx</dt>
                      <dd class="chain-reference">
                        <span>{{ selectedReceivable.createTxHash }}</span>
                        <a
                          v-if="transactionExplorerUrl(selectedReceivable.createTxHash)"
                          class="explorer-button"
                          :href="transactionExplorerUrl(selectedReceivable.createTxHash)"
                          target="_blank"
                          rel="noopener noreferrer"
                          aria-label="채권 생성 트랜잭션을 익스플로러에서 보기"
                        >
                          <ExternalLink :size="13" aria-hidden="true" />
                          익스플로러
                        </a>
                      </dd>
                    </template>
                  </dl>

                  <dl
                    v-if="step.key === 'VERIFIED' && selectedReceivable.verifyTxHash"
                    class="step-metadata"
                  >
                    <dt>검증 Tx</dt>
                    <dd class="chain-reference">
                      <span>{{ selectedReceivable.verifyTxHash }}</span>
                      <a
                        v-if="transactionExplorerUrl(selectedReceivable.verifyTxHash)"
                        class="explorer-button"
                        :href="transactionExplorerUrl(selectedReceivable.verifyTxHash)"
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-label="Buyer 검증 트랜잭션을 익스플로러에서 보기"
                      >
                        <ExternalLink :size="13" aria-hidden="true" />
                        익스플로러
                      </a>
                    </dd>
                  </dl>

                  <dl
                    v-if="
                      step.key === 'TOKENIZED' &&
                      (selectedReceivable.tokenId || selectedReceivable.tokenizeTxHash)
                    "
                    class="step-metadata"
                  >
                    <template v-if="selectedReceivable.tokenId">
                      <dt>NFT 토큰 ID</dt>
                      <dd>{{ selectedReceivable.tokenId }}</dd>
                    </template>
                    <template v-if="selectedReceivable.tokenizeTxHash">
                      <dt>토큰화 Tx</dt>
                      <dd class="chain-reference">
                        <span>{{ selectedReceivable.tokenizeTxHash }}</span>
                        <a
                          v-if="transactionExplorerUrl(selectedReceivable.tokenizeTxHash)"
                          class="explorer-button"
                          :href="transactionExplorerUrl(selectedReceivable.tokenizeTxHash)"
                          target="_blank"
                          rel="noopener noreferrer"
                          aria-label="NFT 토큰화 트랜잭션을 익스플로러에서 보기"
                        >
                          <ExternalLink :size="13" aria-hidden="true" />
                          익스플로러
                        </a>
                      </dd>
                    </template>
                  </dl>

                  <dl
                    v-if="step.key === 'FUNDED' && selectedReceivable.fundingTxHash"
                    class="step-metadata"
                  >
                    <dt>펀딩 Tx</dt>
                    <dd class="chain-reference">
                      <span>{{ selectedReceivable.fundingTxHash }}</span>
                      <a
                        v-if="transactionExplorerUrl(selectedReceivable.fundingTxHash)"
                        class="explorer-button"
                        :href="transactionExplorerUrl(selectedReceivable.fundingTxHash)"
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-label="자금 공급 트랜잭션을 익스플로러에서 보기"
                      >
                        <ExternalLink :size="13" aria-hidden="true" />
                        익스플로러
                      </a>
                    </dd>
                  </dl>

                  <dl
                    v-if="step.key === 'REPAID' && selectedReceivable.repayTxHash"
                    class="step-metadata"
                  >
                    <dt>상환 Tx</dt>
                    <dd class="chain-reference">
                      <span>{{ selectedReceivable.repayTxHash }}</span>
                      <a
                        v-if="transactionExplorerUrl(selectedReceivable.repayTxHash)"
                        class="explorer-button"
                        :href="transactionExplorerUrl(selectedReceivable.repayTxHash)"
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-label="Buyer 상환 트랜잭션을 익스플로러에서 보기"
                      >
                        <ExternalLink :size="13" aria-hidden="true" />
                        익스플로러
                      </a>
                    </dd>
                  </dl>

                  <template v-if="step.key === 'CREATED'">
                    <div v-if="canCreateOnchain" class="step-action">
                      <p>Seller 지갑으로 채권을 발행해 주세요.</p>
                      <button type="button" :disabled="isChainActionRunning" @click="createOnchain">
                        <LoaderCircle
                          v-if="isChainActionRunning"
                          class="spinning"
                          :size="16"
                          aria-hidden="true"
                        />
                        <FilePlus v-else :size="16" aria-hidden="true" />
                        {{ isChainActionRunning ? '확인 중...' : 'Seller 지갑으로 채권 생성' }}
                      </button>
                    </div>
                    <p
                      v-else-if="
                        !pendingSync &&
                        isBuyer &&
                        selectedReceivable.status === 'CREATED' &&
                        !hasCompleteChainMetadata
                      "
                      class="step-note"
                    >
                      Buyer 검토 대상입니다. Seller의 온체인 생성을 기다리는 동안 채권 내용을 먼저
                      확인할 수 있습니다.
                    </p>
                  </template>

                  <template v-if="step.key === 'VERIFIED'">
                    <p v-if="canVerify" class="step-note">
                      채권이 생성되었습니다. Buyer 지갑으로 채무 내용을 검증해 주세요.
                    </p>
                    <p
                      v-else-if="
                        !pendingSync &&
                        isSeller &&
                        selectedReceivable.status === 'CREATED' &&
                        selectedReceivable.onchainReceivableId
                      "
                      class="step-note"
                    >
                      온체인 생성 완료 · Buyer 검증을 기다리고 있습니다.
                    </p>

                    <section
                      v-if="buyerReviewRequired"
                      class="buyer-review"
                      aria-labelledby="buyer-review-title"
                    >
                      <div>
                        <p class="review-eyebrow">Buyer 검토</p>
                        <h5 id="buyer-review-title">채권 내용 확인 및 검증</h5>
                      </div>
                      <p>Buyer 서명이 채무 확인으로 기록됩니다. 아래 내용을 확인해 주세요.</p>
                      <ul class="review-checklist">
                        <li>Seller와 Buyer 회사 및 등록 지갑이 올바른지 확인</li>
                        <li>채권 금액, 펀딩 요청 금액, 발행일과 만기일 확인</li>
                        <li>설명과 문서 해시가 실제 거래 증빙과 일치하는지 확인</li>
                      </ul>
                      <p v-if="!hasCompleteChainMetadata" class="review-prerequisite" role="status">
                        Seller가 채권을 발행하면 서명할 수 있습니다.
                      </p>
                      <p v-else class="review-ready" role="status">
                        서명 직전에 화면과 체인 정보를 다시 대조합니다.
                      </p>
                      <label class="attestation">
                        <input
                          v-model="buyerAttestationAccepted"
                          type="checkbox"
                          :disabled="isChainActionRunning || Boolean(pendingSync)"
                        />
                        <span>
                          위 거래 조건과 증빙을 확인했으며, Buyer 회사로서 해당 채무 내용을
                          확인합니다.
                        </span>
                      </label>
                      <div class="review-actions">
                        <button
                          class="secondary"
                          type="button"
                          :disabled="isRefreshing || isChainActionRunning"
                          @click="refreshSelectedReceivable"
                        >
                          <RefreshCw
                            :class="{ spinning: isRefreshing }"
                            :size="16"
                            aria-hidden="true"
                          />
                          {{ isRefreshing ? '불러오는 중...' : '상태 새로고침' }}
                        </button>
                        <button
                          type="button"
                          :disabled="!canSubmitVerification"
                          @click="verifyOnchain"
                        >
                          <ShieldCheck :size="16" aria-hidden="true" />
                          {{ buyerVerificationButtonText }}
                        </button>
                      </div>
                    </section>
                  </template>

                  <template v-if="step.key === 'TOKENIZED'">
                    <div v-if="shouldShowTokenizationJournalGate" class="step-action">
                      <p aria-live="polite">
                        {{
                          tokenizationJournalMessage ||
                          '서버의 기존 NFT 민팅 이력을 확인해야 합니다.'
                        }}
                      </p>
                      <button
                        class="secondary"
                        type="button"
                        :disabled="
                          isTokenizationJournalChecking || isRefreshing || isChainActionRunning
                        "
                        @click="refreshTokenizationJournal"
                      >
                        <RefreshCw
                          :class="{ spinning: isTokenizationJournalChecking }"
                          :size="16"
                          aria-hidden="true"
                        />
                        {{
                          isTokenizationJournalChecking
                            ? '서버 민팅 이력 확인 중...'
                            : '서버 민팅 상태 다시 확인'
                        }}
                      </button>
                    </div>
                    <div v-else-if="canTokenize" class="step-action">
                      <p>검증 완료. Seller가 채권 NFT를 발행해 주세요.</p>
                      <button
                        type="button"
                        :disabled="isChainActionRunning"
                        @click="tokenizeOnchain"
                      >
                        <LoaderCircle
                          v-if="isChainActionRunning"
                          class="spinning"
                          :size="16"
                          aria-hidden="true"
                        />
                        <Box v-else :size="16" aria-hidden="true" />
                        {{
                          isChainActionRunning
                            ? 'NFT 민팅 확인 중...'
                            : 'Seller 지갑으로 채권 NFT 민팅'
                        }}
                      </button>
                    </div>
                    <p
                      v-else-if="
                        !pendingSync && isBuyer && selectedReceivable.status === 'VERIFIED'
                      "
                      class="step-note"
                    >
                      채권 검증이 완료되었습니다. Seller의 NFT 민팅을 기다리고 있습니다.
                    </p>
                    <p
                      v-else-if="
                        !pendingSync && isSeller && selectedReceivable.status === 'VERIFIED'
                      "
                      class="step-note"
                    >
                      Buyer 검증은 완료되었지만 토큰화에 필요한 온체인 메타데이터가 부족합니다.
                      페이지를 새로고침해 주세요.
                    </p>
                  </template>

                  <p
                    v-if="
                      step.key === 'FUNDED' &&
                      !pendingSync &&
                      selectedReceivable.status === 'TOKENIZED'
                    "
                    class="step-note"
                  >
                    채권 NFT 민팅이 완료되었습니다. Funder 자금 공급을 기다리고 있습니다.
                  </p>

                  <template v-if="step.key === 'REPAID'">
                    <div
                      v-if="!pendingSync && isBuyer && selectedReceivable.status === 'FUNDED'"
                      class="step-action"
                    >
                      <p>
                        Funder 자금 공급이 완료되었습니다. Buyer 지갑으로 채권 금액을 상환해 주세요.
                      </p>
                      <button type="button" @click="router.push({ name: 'repayment' })">
                        <HandCoins :size="16" aria-hidden="true" />
                        Buyer 채권 상환 화면으로 이동
                      </button>
                    </div>
                    <p
                      v-else-if="!pendingSync && selectedReceivable.status === 'FUNDED'"
                      class="step-note"
                    >
                      Funder 자금 공급이 완료되었습니다. Buyer 상환을 기다리고 있습니다.
                    </p>
                    <p
                      v-else-if="selectedReceivable.status === 'REPAID'"
                      class="step-note complete-note"
                    >
                      Buyer 상환이 완료되었습니다. 채권 상태가 REPAID로 기록되었습니다.
                    </p>
                  </template>

                  <div
                    v-if="step.pendingType && pendingSyncMatches(step.pendingType)"
                    class="sync-alert"
                    role="alert"
                  >
                    <div class="sync-heading">
                      <TriangleAlert :size="18" aria-hidden="true" />
                      <strong v-if="pendingSync.phase === 'submitted'">
                        {{
                          pendingSync.type === 'tokenized'
                            ? '기존 민팅 제출 확인 · 새 민팅 금지'
                            : '제출 완료 · 블록 확인 필요'
                        }}
                      </strong>
                      <strong v-else-if="pendingSync.recoveredFromServerJournal">
                        기존 민팅 성공 확인 · MetaMask 재호출 금지
                      </strong>
                      <strong v-else>온체인 성공 · 서버 동기화 필요</strong>
                    </div>

                    <p v-if="pendingSync.phase === 'submitted'">
                      <template v-if="pendingSync.recoveredFromServerJournal">
                        서버 저널에서
                        {{
                          pendingSync.pendingTransactionCount > 1
                            ? `진행 중인 민팅 ${pendingSync.pendingTransactionCount}건`
                            : '진행 중인 민팅'
                        }}을 확인했습니다. 새 민팅을 보내지 말고 아래 트랜잭션의 블록 확인을
                        이어받아 주세요. 서버 조회만으로는 nonce·교체 정보를 모두 복원할 수 없어
                        기존 해시를 기준으로 안전하게 확인합니다.
                      </template>
                      <template v-else>
                        트랜잭션이 온체인에 제출되었습니다. 새 트랜잭션을 보내지 말고 기존 블록
                        확인을 이어받아 주세요.
                      </template>
                    </p>
                    <p v-else>
                      <template v-if="pendingSync.recoveredFromServerJournal">
                        이미 CONFIRMED 처리된 NFT 민팅을 서버 저널에서 확인했습니다. MetaMask로 다시
                        민팅하지 말고
                        {{
                          pendingSync.serverRpcProof
                            ? '확인된 민팅 결과를 DB에 동기화해 주세요.'
                            : '서버 RPC 재검증과 DB 동기화를 재개해 주세요.'
                        }}
                      </template>
                      <template v-else>
                        온체인 트랜잭션은 성공했습니다. 새 트랜잭션을 보내기 전에 서버 동기화를
                        완료해 주세요.
                      </template>
                    </p>
                    <code>{{ pendingSync.payload.txHash }}</code>
                    <p v-if="pendingSync.additionalServerPendingCount">
                      서버에 별도 진행 중인 민팅
                      {{ pendingSync.additionalServerPendingCount }}건도 있습니다. 현재 브라우저에
                      저장된 트랜잭션을 먼저 확인합니다.
                    </p>
                    <button
                      type="button"
                      :disabled="isChainActionRunning"
                      @click="retryPendingSync"
                    >
                      <RotateCcw :size="16" aria-hidden="true" />
                      {{
                        pendingSync.phase === 'submitted'
                          ? '기존 트랜잭션 확인 이어받기'
                          : pendingSync.type !== 'tokenized'
                            ? '서버 동기화 재시도'
                            : pendingSync.recoveredFromServerJournal && !pendingSync.serverRpcProof
                              ? '서버 검증 및 DB 동기화 재개'
                              : '민팅 결과 DB 동기화'
                      }}
                    </button>
                  </div>
                </div>
              </li>
            </ol>

            <p
              v-if="
                !pendingSync &&
                !canCreateOnchain &&
                !(
                  isBuyer &&
                  selectedReceivable.status === 'CREATED' &&
                  !hasCompleteChainMetadata
                ) &&
                !canVerify &&
                !(
                  isSeller &&
                  selectedReceivable.status === 'CREATED' &&
                  selectedReceivable.onchainReceivableId
                ) &&
                !shouldShowTokenizationJournalGate &&
                !canTokenize &&
                !(isBuyer && selectedReceivable.status === 'VERIFIED') &&
                !(isSeller && selectedReceivable.status === 'VERIFIED') &&
                !['TOKENIZED', 'FUNDED', 'REPAID'].includes(selectedReceivable.status)
              "
              class="workflow-empty"
            >
              현재 계정에서 실행할 생성·검증 작업이 없습니다.
            </p>
          </section>
        </template>
        <p v-else-if="hasLoadedReceivables" class="empty">목록에서 채권을 선택하세요.</p>
      </section>
    </div>
  </main>
</template>

<style scoped>
.amount-error {
  color: var(--color-error, #ffa69c);
}
/* Minimal B2B workspace treatment */
.receivables-page {
  --primary: var(--color-action);
  --primary-dark: var(--color-action-hover);
  --primary-soft: var(--color-brand-soft);
  --text: var(--color-text);
  --text-muted: var(--color-text-muted);
  --border: var(--color-border);
  --surface: var(--color-surface);
  min-height: 100%;
  padding: 32px;
  background: var(--color-surface-subtle);
  color: var(--text);
}

.page-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 24px;
  max-width: 1200px;
  margin: 0 auto 32px;
}

.eyebrow,
.section-eyebrow,
.review-eyebrow,
.step-code {
  color: var(--color-brand);
  font-size: 12px;
  font-weight: 700;
}

.eyebrow,
.section-eyebrow,
.review-eyebrow {
  letter-spacing: 0;
}

.step-code {
  letter-spacing: 0.06em;
}

.eyebrow {
  margin: 0 0 4px;
}

h1 {
  margin: 0;
  color: var(--text);
  font-size: 32px;
  font-weight: 700;
}

h2 {
  margin: 0 0 24px;
  color: var(--text);
  font-size: 18px;
  font-weight: 700;
}

.header-actions {
  display: flex;
  gap: 8px;
}

button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  min-height: 40px;
  padding: 8px 16px;
  border: 0;
  border-radius: 8px;
  background: var(--primary);
  color: var(--color-on-action);
  cursor: pointer;
  font-weight: 650;
  box-shadow: none;
  transition:
    border-color 0.16s ease,
    background-color 0.16s ease,
    color 0.16s ease;
}

button:hover:not(:disabled) {
  background: var(--primary-dark);
  box-shadow: none;
}

button:focus-visible,
.explorer-button:focus-visible {
  outline: 3px solid var(--color-focus);
  outline-offset: 2px;
}

button:disabled {
  cursor: not-allowed;
  opacity: 0.52;
}

.secondary {
  border: 1px solid var(--color-border-strong);
  border-color: var(--color-border-strong);
  background: var(--surface);
  color: var(--color-text);
}

.secondary:hover:not(:disabled) {
  border-color: var(--color-border-strong);
  background: var(--color-surface-subtle);
}

.message {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  max-width: 1200px;
  margin: 0 auto 16px;
  padding: 16px;
  border-radius: 8px;
  overflow-wrap: anywhere;
  font-size: 14px;
  line-height: 1.55;
}

.message svg {
  flex: 0 0 auto;
  margin-top: 2px;
}

.message.transaction span {
  min-width: 0;
  overflow-wrap: anywhere;
}

.message.transaction a {
  flex: 0 0 auto;
  margin-left: auto;
}

.message a {
  color: inherit;
  font-weight: 650;
}

.error {
  border-color: var(--color-danger-border);
  background: var(--color-danger-soft);
  color: var(--color-danger);
}

.success,
.pending {
  border-color: var(--color-success-border);
  background: var(--primary-soft);
  color: var(--primary-dark);
}

.transaction {
  border-color: var(--border);
  background: var(--surface);
  color: var(--color-text);
}

.registration-section {
  max-width: 1200px;
  margin: 0 auto 24px;
  padding: 24px;
  border: 1px solid var(--border);
  border-radius: 12px;
  background: var(--surface);
}

form,
label {
  display: grid;
  gap: 8px;
}

form {
  gap: 16px;
}

form > button {
  min-width: 144px;
  justify-self: start;
}

.two-columns {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
}

label {
  color: var(--color-text);
  font-weight: 600;
}

input,
textarea {
  width: 100%;
  min-height: 40px;
  padding: 8px 16px;
  border: 1px solid var(--color-border-strong);
  border-color: var(--color-border-strong);
  border-radius: 8px;
  outline: none;
  background: var(--surface);
  color: var(--text);
  resize: vertical;
  transition:
    border-color 0.16s ease,
    box-shadow 0.16s ease;
}

input:hover,
textarea:hover {
  border-color: var(--color-border-strong);
}

input:focus,
textarea:focus {
  border-color: var(--color-brand);
  box-shadow: 0 0 0 3px var(--color-focus);
}

.receivables-workspace {
  display: grid;
  grid-template-columns: minmax(288px, 360px) minmax(0, 1fr);
  align-items: stretch;
  max-width: 1200px;
  margin: 0 auto;
  overflow: hidden;
  border: 1px solid var(--border);
  border-radius: 12px;
  background: var(--surface);
}

.list-pane,
.detail-pane {
  min-width: 0;
  padding: 24px;
}

.list-pane {
  border-right: 1px solid var(--border);
  background: var(--color-surface-subtle);
}

.receivable-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 8px 16px;
  width: 100%;
  min-height: 0;
  margin: 0;
  padding: 16px 8px 16px 14px;
  border: 0;
  border-top: 1px solid var(--border);
  border-left: 2px solid transparent;
  border-radius: 0;
  background: transparent;
  color: var(--text);
}

.receivable-row:first-of-type {
  border-top-color: transparent;
}

.receivable-row:hover:not(:disabled) {
  border-color: var(--border);
  border-left-color: var(--color-border-strong);
  background: var(--color-surface-subtle);
}

.receivable-row.selected,
.receivable-row.selected:hover:not(:disabled) {
  border-left-color: var(--color-brand);
  background: var(--primary-soft);
  box-shadow: none;
}

.receivable-row > span:first-child {
  display: grid;
  gap: 4px;
  grid-row: 1 / 3;
}

.receivable-row strong {
  font-weight: 700;
}

.receivable-row small {
  color: var(--text-muted);
  line-height: 1.45;
}

.receivable-row .amount {
  grid-column: 2;
  grid-row: 1;
  font-size: 13px;
  font-weight: 700;
}

.receivable-row .status {
  grid-column: 2;
  grid-row: 2;
  justify-self: end;
  padding: 2px 8px;
  border: 1px solid var(--color-brand-border);
  border-radius: 999px;
  background: transparent;
  color: var(--color-brand);
  font-size: 11px;
  font-weight: 700;
}

.receivable-row .action-hint {
  color: var(--color-brand);
  font-weight: 650;
}

.empty {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 16px;
  border: 1px dashed var(--color-border-strong);
  border-radius: 8px;
  background: transparent;
  color: var(--text-muted);
}

.receivable-details {
  display: grid;
  grid-template-columns: 112px minmax(0, 1fr);
  column-gap: 16px;
  margin: 0;
}

.receivable-details dt,
.receivable-details dd {
  padding: 8px 0;
  border-bottom: 1px solid var(--color-border);
  border-bottom-color: var(--color-border);
}

.receivable-details dt {
  color: var(--text-muted);
  font-weight: 600;
}

.receivable-details dd {
  margin: 0;
  color: var(--text);
  overflow-wrap: anywhere;
  line-height: 1.5;
}

.technical-value {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 12px;
}

.midnight-proof-entry {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: 12px;
  margin-top: 24px;
  border: 1px solid var(--color-brand-border);
  border-radius: 10px;
  padding: 16px;
  background: var(--primary-soft);
  color: var(--color-brand);
}

.midnight-proof-entry h3 {
  margin: 0;
  color: var(--text);
  font-size: 17px;
}

.midnight-proof-entry p {
  margin: 6px 0 12px;
  color: var(--text-muted);
  line-height: 1.5;
}

.workflow-section {
  margin-top: 32px;
  padding-top: 32px;
  border-top: 1px solid var(--border);
}

.section-heading,
.step-heading,
.sync-heading {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
}

.section-eyebrow,
.review-eyebrow,
.step-code {
  margin: 0 0 4px;
}

.section-heading h3 {
  margin: 0;
  color: var(--text);
  font-size: 20px;
  font-weight: 700;
}

.current-status,
.step-state {
  flex: 0 0 auto;
  padding: 3px 8px;
  border: 1px solid var(--color-border-strong);
  border-radius: 999px;
  color: var(--color-text-muted);
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.02em;
}

.workflow-timeline {
  margin: 24px 0 0;
  padding: 0;
  list-style: none;
}

.workflow-step {
  display: grid;
  grid-template-columns: 32px minmax(0, 1fr);
  gap: 16px;
  position: relative;
  padding: 0 0 32px;
}

.workflow-step:last-child {
  padding-bottom: 0;
}

.step-rail {
  display: flex;
  justify-content: center;
  position: relative;
}

.step-rail::after {
  position: absolute;
  top: 32px;
  bottom: -32px;
  left: 50%;
  width: 1px;
  background: var(--border);
  content: '';
  transform: translateX(-50%);
}

.workflow-step:last-child .step-rail::after {
  display: none;
}

.step-marker {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  z-index: 1;
  width: 32px;
  height: 32px;
  border: 1px solid var(--color-border-strong);
  border-radius: 8px;
  background: var(--surface);
  color: var(--color-text-muted);
}

.workflow-step.is-complete .step-marker {
  border-color: var(--color-brand-border);
  background: var(--primary-soft);
  color: var(--color-brand);
}

.workflow-step.is-current .step-marker {
  border-color: var(--color-brand);
  background: var(--primary);
  color: var(--color-on-action);
}

.workflow-step.is-complete .step-state,
.workflow-step.is-current .step-state {
  border-color: var(--color-brand-border);
  color: var(--color-brand);
}

.step-content {
  min-width: 0;
  padding-top: 2px;
}

.step-heading h4 {
  margin: 0;
  color: var(--text);
  font-size: 16px;
  font-weight: 700;
  line-height: 1.4;
}

.step-description,
.step-note,
.step-action p,
.buyer-review p,
.cross-sync-alert p,
.sync-alert p {
  margin: 8px 0 0;
  color: var(--text-muted);
  font-size: 14px;
  line-height: 1.6;
}

.step-metadata {
  display: grid;
  grid-template-columns: 96px minmax(0, 1fr);
  gap: 0 16px;
  margin: 16px 0 0;
  padding: 8px 16px;
  border-left: 2px solid var(--color-brand-border);
  background: var(--color-brand-soft);
}

.step-metadata dt,
.step-metadata dd {
  margin: 0;
  padding: 8px 0;
  border: 0;
  font-size: 12px;
}

.step-metadata dt {
  color: var(--text-muted);
  font-weight: 600;
}

.step-action,
.buyer-review {
  margin-top: 16px;
  padding-top: 16px;
  border-top: 1px solid var(--border);
}

.step-action button,
.cross-sync-alert button,
.sync-alert button {
  margin-top: 16px;
}

.step-note.complete-note {
  color: var(--primary-dark);
  font-weight: 600;
}

.chain-reference {
  display: flex;
  align-items: flex-start;
  gap: 8px;
}

.chain-reference span {
  flex: 1 1 180px;
  min-width: 0;
  overflow-wrap: anywhere;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 11px;
}

.explorer-button {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  min-height: 28px;
  padding: 4px 8px;
  border-color: var(--color-border-strong);
  border-radius: 8px;
  background: var(--surface);
  color: var(--color-brand);
  font-size: 12px;
  font-weight: 650;
  line-height: 1;
  text-decoration: none;
}

.explorer-button:hover {
  border-color: var(--color-brand);
  background: var(--primary-soft);
  color: var(--primary-dark);
}

.buyer-review {
  display: grid;
  gap: 16px;
}

.buyer-review h5 {
  margin: 0;
  color: var(--text);
  font-size: 16px;
  font-weight: 700;
}

.buyer-review > p,
.buyer-review .review-checklist {
  margin: 0;
}

.review-checklist {
  display: grid;
  gap: 8px;
  padding-left: 20px;
  color: var(--color-text);
  font-size: 14px;
}

.review-checklist li::marker {
  color: var(--color-brand);
}

.buyer-review .review-prerequisite,
.buyer-review .review-ready {
  padding: 16px;
  border-left: 2px solid var(--color-warning-border);
  background: var(--color-warning-soft);
  color: var(--color-warning);
}

.buyer-review .review-ready {
  border-left-color: var(--color-brand-border);
  background: var(--primary-soft);
  color: var(--primary-dark);
}

.attestation {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 16px;
  border: 1px solid var(--color-border-strong);
  border-color: var(--color-border-strong);
  border-radius: 8px;
  box-shadow: none;
  cursor: pointer;
  line-height: 1.5;
}

.attestation input {
  flex: 0 0 auto;
  width: 18px;
  height: 18px;
  min-height: 0;
  margin-top: 2px;
  padding: 0;
  accent-color: var(--color-brand);
}

.attestation:focus-within {
  box-shadow: 0 0 0 3px var(--color-focus);
}

.review-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.review-actions button {
  width: auto;
}

.cross-sync-alert,
.sync-alert {
  margin-top: 24px;
  padding: 16px;
  border: 0;
  border-left: 3px solid var(--color-warning-border);
  border-radius: 0;
  background: var(--color-warning-soft);
  color: var(--color-warning);
}

.cross-sync-alert {
  display: grid;
  grid-template-columns: 18px minmax(0, 1fr);
  gap: 8px;
}

.cross-sync-alert > svg {
  margin-top: 2px;
}

.cross-sync-alert strong,
.sync-alert strong,
.cross-sync-alert p,
.sync-alert p {
  color: inherit;
}

.sync-heading {
  justify-content: flex-start;
  gap: 8px;
}

.sync-alert code {
  display: block;
  margin-top: 12px;
  color: inherit;
  overflow-wrap: anywhere;
  font-size: 11px;
}

.workflow-empty {
  margin: 24px 0 0 48px;
  color: var(--text-muted);
  font-size: 14px;
}

.spinning {
  animation: spin 0.9s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

@media (prefers-reduced-motion: reduce) {
  .spinning {
    animation: none;
  }
}

@media (max-width: 880px) {
  .receivables-workspace {
    grid-template-columns: 1fr;
  }

  .list-pane {
    border-right: 0;
    border-bottom: 1px solid var(--border);
  }
}

@media (max-width: 760px) {
  .receivables-page {
    padding: 24px;
  }

  .page-header {
    align-items: flex-start;
    flex-direction: column;
    margin-bottom: 24px;
  }

  .header-actions {
    width: 100%;
    flex-wrap: wrap;
  }

  .header-actions button {
    flex: 1 1 144px;
  }

  .registration-section,
  .list-pane,
  .detail-pane {
    padding: 24px;
  }

  .review-actions {
    display: grid;
    grid-template-columns: 1fr;
  }

  .review-actions button {
    width: 100%;
  }
}

@media (max-width: 520px) {
  .receivables-page {
    padding: 24px 16px;
  }

  .registration-section,
  .list-pane,
  .detail-pane {
    padding: 16px;
  }

  .two-columns {
    grid-template-columns: 1fr;
  }

  form > button {
    width: 100%;
  }

  .receivable-row {
    grid-template-columns: 1fr;
  }

  .receivable-row > span:first-child,
  .receivable-row .amount,
  .receivable-row .status {
    grid-column: 1;
    grid-row: auto;
    justify-self: start;
  }

  .receivable-details,
  .step-metadata {
    grid-template-columns: 88px minmax(0, 1fr);
    gap: 0 8px;
  }

  .section-heading,
  .step-heading {
    align-items: flex-start;
  }

  .workflow-step {
    gap: 12px;
  }

  .workflow-empty {
    margin-left: 44px;
  }

  .message.transaction {
    flex-wrap: wrap;
  }

  .message.transaction a {
    width: 100%;
    margin-left: 26px;
  }
}
</style>
