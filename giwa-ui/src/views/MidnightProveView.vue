<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import {
  ArrowLeft,
  CheckCircle2,
  CircleAlert,
  CircleX,
  Clock3,
  Copy,
  Database,
  Download,
  FlaskConical,
  KeyRound,
  LoaderCircle,
  RefreshCw,
  RotateCcw,
  ShieldCheck,
  WalletCards,
} from '@lucide/vue'
import { useRoute, useRouter } from 'vue-router'
import { formatAnnualRevenueInput, useMidnightProofFlow } from '../composables/useMidnightProofFlow'
import { giwaContractConfig } from '../contracts/addresses'
import {
  downloadCapabilityFile,
  writeCapabilityToClipboard,
} from '../services/midnight/capabilityHandoff'
import { useAuthStore } from '../stores/auth'
import { useReceivableStore } from '../stores/receivable'

const authStore = useAuthStore()
const receivableStore = useReceivableStore()
const route = useRoute()
const router = useRouter()

const {
  annualRevenueKrw,
  debtRatioPercent,
  normalizedDebtRatioBps,
  overdueCount,
  secretPin,
  phase,
  errorMessage,
  errorCode,
  failedAt,
  authorizationRequest,
  verification,
  shareableCapabilityText,
  inputErrors,
  canRequestChallenge,
  canCancelAwaitingSession,
  secondsRemaining,
  isBusy,
  currentStep,
  requestChallenge,
  authorizeAndProve,
  checkProofStatus,
  cancelAwaitingSessionAndReset,
  retryPublicResult,
  setProofSubjectContext,
  resetFlow,
} = useMidnightProofFlow()

const showPin = ref(false)
const selectedCandidateKey = ref('')
const isSubjectLoading = ref(true)
const subjectLoadError = ref('')
const subjectSelectionNotice = ref('')
const pinToolMessage = ref('')
const capabilityCopyMessage = ref('')
const capabilityHandoffFailed = ref(false)
const showAdvancedCapability = ref(false)
const capabilityHandoffFeedback = ref(null)
const statusTarget = ref(null)
const errorTarget = ref(null)
const challengeErrorTarget = ref(null)
const resultTarget = ref(null)
let handoffOperationId = 0
let handoffUnmounted = false
let pendingDownloadCleanup = null

const currentCompanyId = computed(() => authStore.user?.companyId)
const relatedReceivables = computed(() =>
  receivableStore.receivables.filter(
    (receivable) =>
      sameId(receivable.sellerCompanyId, currentCompanyId.value) ||
      sameId(receivable.buyerCompanyId, currentCompanyId.value),
  ),
)
const proofCandidates = computed(() =>
  relatedReceivables.value.flatMap((receivable) => {
    if (!hasUsableOnchainContext(receivable)) return []
    const roles = []
    if (sameId(receivable.sellerCompanyId, currentCompanyId.value)) roles.push('SELLER')
    if (sameId(receivable.buyerCompanyId, currentCompanyId.value)) roles.push('BUYER')
    return roles.map((role) => ({
      key: `${receivable.receivableId}:${role}`,
      receivable,
      role,
      onchainReceivableId: String(receivable.onchainReceivableId),
    }))
  }),
)
const selectedCandidate = computed(
  () =>
    proofCandidates.value.find((candidate) => candidate.key === selectedCandidateKey.value) ?? null,
)

const phaseCopy = computed(() => {
  const copy = {
    requesting_challenge: '로컬 증명 서비스가 역할 지갑을 확인하고 서명 요청을 만들고 있습니다.',
    signing: 'MetaMask에서 이 역할의 증명 발급 승인 서명을 확인해 주세요.',
    submitting_proof: '서명을 전달했습니다. 증명 작업이 접수되었는지 확인하고 있습니다.',
    attesting: 'Mock Provider가 역할 지갑 서명을 확인하고 재무 입력 확인서를 발급합니다.',
    proving_and_submitting: 'Proof Server가 ZK 증명을 만들고 로컬 Midnight Node에 제출합니다.',
    indexing:
      'Midnight 제출은 확정되었습니다. 발급된 검증 권한으로 공개 결과를 조회할 준비를 하고 있습니다.',
    resolving_result: '발급된 검증 권한으로 공개 원장의 정확한 결과를 다시 읽고 있습니다.',
    cancelling_session: '제출되지 않은 대기 세션을 취소하고 입력 화면으로 돌아가고 있습니다.',
  }
  return copy[phase.value] ?? ''
})

const isProgressPhase = computed(() => Boolean(phaseCopy.value))
const canReset = computed(
  () =>
    ['awaiting_signature', 'expired', 'cancelled', 'success'].includes(phase.value) ||
    (phase.value === 'error' && failedAt.value !== 'resolver'),
)
const isDuplicateResult = computed(
  () => phase.value === 'error' && errorCode.value === 'ELIGIBILITY_RESULT_ALREADY_EXISTS',
)
const errorTitle = computed(() => {
  if (phase.value === 'expired') return '서명 대기 시간이 만료되었습니다.'
  if (phase.value === 'cancelled') return '증명 세션이 취소되었습니다.'
  const titles = {
    challenge: '서명 요청을 만들지 못했습니다.',
    authorization: '지갑 서명을 완료하지 못했습니다.',
    proof: 'ZK 증명 처리를 완료하지 못했습니다.',
    resolver: '공개 결과를 조회하지 못했습니다.',
    protocol: '증명 결과의 채권 문맥을 확인하지 못했습니다.',
  }
  return titles[failedAt.value] ?? '증명 흐름을 완료하지 못했습니다.'
})

onMounted(loadProofSubjects)

watch(selectedCandidateKey, () => {
  const candidate = selectedCandidate.value
  if (!candidate) return
  setProofSubjectContext({
    onchainReceivableId: candidate.onchainReceivableId,
    subjectRole: candidate.role,
  })
  showPin.value = false
  pinToolMessage.value = ''
  capabilityCopyMessage.value = ''
})

watch(shareableCapabilityText, () => {
  handoffOperationId += 1
  pendingDownloadCleanup?.()
  pendingDownloadCleanup = null
  capabilityCopyMessage.value = ''
  capabilityHandoffFailed.value = false
  showAdvancedCapability.value = false
})

onBeforeUnmount(() => {
  handoffUnmounted = true
  handoffOperationId += 1
  pendingDownloadCleanup?.()
  pendingDownloadCleanup = null
  capabilityCopyMessage.value = ''
  showAdvancedCapability.value = false
})

async function loadProofSubjects() {
  isSubjectLoading.value = true
  subjectLoadError.value = ''
  subjectSelectionNotice.value = ''
  try {
    await Promise.all([authStore.loadUser(), receivableStore.loadAll()])
    const requestedReceivableId = Array.isArray(route.query.receivableId)
      ? route.query.receivableId[0]
      : route.query.receivableId
    const preferredReceivableId = receivableStore.selectedReceivable?.receivableId
    const requestedCandidate = proofCandidates.value.find((candidate) =>
      sameId(candidate.receivable.receivableId, requestedReceivableId),
    )
    const fallbackCandidate =
      proofCandidates.value.find((candidate) =>
        sameId(candidate.receivable.receivableId, preferredReceivableId),
      ) ?? proofCandidates.value[0]
    const selected = requestedCandidate ?? fallbackCandidate
    selectedCandidateKey.value = selected?.key ?? ''
    if (requestedReceivableId != null && requestedCandidate == null && selected) {
      subjectSelectionNotice.value =
        '요청한 채권은 현재 회사의 Seller/Buyer 증명 발급 대상이 아니어서, 사용 가능한 채권을 선택했습니다.'
    }
    syncReceivableQuery(selected ?? null)
    if (!selectedCandidateKey.value) {
      setProofSubjectContext({ onchainReceivableId: '', subjectRole: 'SELLER' })
    }
  } catch (error) {
    subjectLoadError.value = error?.message ?? '증명 가능한 채권을 불러오지 못했습니다.'
  } finally {
    isSubjectLoading.value = false
  }
}

function selectedRouteReceivableId() {
  const value = route.query.receivableId
  return Array.isArray(value) ? value[0] : value
}

function syncReceivableQuery(candidate) {
  const nextReceivableId = candidate ? String(candidate.receivable.receivableId) : null
  const currentKeys = Object.keys(route.query)
  const alreadySynchronized =
    nextReceivableId === selectedRouteReceivableId() &&
    currentKeys.length === (nextReceivableId === null ? 0 : 1) &&
    (nextReceivableId === null || currentKeys[0] === 'receivableId')
  if (alreadySynchronized) return
  const query = nextReceivableId === null ? {} : { receivableId: nextReceivableId }
  void router.replace({ query }).catch(() => undefined)
}

function selectProofCandidate(candidateKey) {
  selectedCandidateKey.value = candidateKey
  subjectSelectionNotice.value = ''
  const candidate = proofCandidates.value.find((item) => item.key === candidateKey) ?? null
  syncReceivableQuery(candidate)
}

function sameId(first, second) {
  return first != null && second != null && String(first) === String(second)
}

function sameAddress(first, second) {
  return (
    typeof first === 'string' &&
    typeof second === 'string' &&
    first.toLowerCase() === second.toLowerCase()
  )
}

function hasUsableOnchainContext(receivable) {
  const onchainId = String(receivable?.onchainReceivableId ?? '')
  if (!/^[1-9][0-9]*$/.test(onchainId) || !receivable?.contractAddress) return false
  const configuredAddress = giwaContractConfig.receivableFinanceAddress
  return !configuredAddress || sameAddress(receivable.contractAddress, configuredAddress)
}

function roleLabel(role) {
  return role === 'SELLER' ? 'Seller(매도자)' : 'Buyer(매수자)'
}

function shortHex(value) {
  if (!value) return ''
  return `${value.slice(0, 12)}…${value.slice(-12)}`
}

function formatExpiry(value) {
  if (!value) return ''
  return new Intl.DateTimeFormat('ko-KR', {
    dateStyle: 'medium',
    timeStyle: 'medium',
  }).format(new Date(Number(value) * 1_000))
}

function formatRevenueOnBlur() {
  try {
    annualRevenueKrw.value = formatAnnualRevenueInput(annualRevenueKrw.value)
  } catch {
    // validationMessage provides the field-specific feedback without retaining another copy.
  }
}

function generateTemporaryPin() {
  pinToolMessage.value = ''
  try {
    const value = new Uint16Array(1)
    globalThis.crypto.getRandomValues(value)
    secretPin.value = String(value[0])
    showPin.value = true
    pinToolMessage.value = '이 증명 세션에만 사용할 임시 PIN을 만들었습니다.'
  } catch {
    pinToolMessage.value = '브라우저의 안전한 난수 생성기를 사용할 수 없습니다.'
  }
}

async function copyCapability() {
  if (!shareableCapabilityText.value) return
  const currentOperationId = ++handoffOperationId
  try {
    await writeCapabilityToClipboard(shareableCapabilityText.value)
    if (handoffUnmounted || currentOperationId !== handoffOperationId) return
    capabilityHandoffFailed.value = false
    capabilityCopyMessage.value =
      '검증 권한을 복사했습니다. 클립보드 값은 이 화면을 초기화한 뒤에도 남으므로 공유 후 지워 주세요.'
  } catch (error) {
    if (handoffUnmounted || currentOperationId !== handoffOperationId) return
    capabilityHandoffFailed.value = true
    capabilityCopyMessage.value =
      error?.message ?? '검증 권한을 복사하지 못했습니다. 고급 직접 입력을 이용해 주세요.'
  }
  await nextTick()
  capabilityHandoffFeedback.value?.focus()
}

async function saveCapabilityFile() {
  if (!shareableCapabilityText.value) return
  handoffOperationId += 1
  try {
    pendingDownloadCleanup?.()
    const download = downloadCapabilityFile(shareableCapabilityText.value)
    pendingDownloadCleanup = download.cleanup
    capabilityHandoffFailed.value = false
    capabilityCopyMessage.value =
      '채권·회사 식별정보가 없는 이름으로 검증 파일 저장을 시작했습니다. 저장된 파일은 화면 초기화 후에도 남으므로 안전하게 전달·삭제해 주세요.'
  } catch (error) {
    capabilityHandoffFailed.value = true
    capabilityCopyMessage.value =
      error?.message ?? '검증 파일을 저장하지 못했습니다. 고급 직접 입력을 이용해 주세요.'
  }
  await nextTick()
  capabilityHandoffFeedback.value?.focus()
}

function resetProofFlow() {
  showPin.value = false
  pinToolMessage.value = ''
  handoffOperationId += 1
  pendingDownloadCleanup?.()
  pendingDownloadCleanup = null
  capabilityCopyMessage.value = ''
  capabilityHandoffFailed.value = false
  showAdvancedCapability.value = false
  resetFlow()
}

watch(phase, async (nextPhase) => {
  await nextTick()
  if (nextPhase === 'success') resultTarget.value?.focus()
  else if (nextPhase === 'editing' && failedAt.value === 'challenge' && errorMessage.value) {
    challengeErrorTarget.value?.focus()
  } else if (['error', 'expired', 'proof_unknown'].includes(nextPhase)) errorTarget.value?.focus()
  else if (isBusy.value) statusTarget.value?.focus()
})
</script>

<template>
  <main class="prove-page">
    <section class="prove-shell" :aria-busy="isBusy">
      <div class="tool-links">
        <RouterLink :to="{ name: 'midnight' }">
          <ArrowLeft aria-hidden="true" :size="16" /> 기존 검증 권한 확인
        </RouterLink>
      </div>

      <header class="page-heading">
        <span class="eyebrow"><FlaskConical aria-hidden="true" :size="15" /> 로컬 PoC</span>
        <h1>이전 방식 증명 만들기</h1>
        <p>판매·구매기업이 가상 재무값으로 증명하고, 요청자에게 검증 권한을 전달합니다.</p>
      </header>

      <section class="privacy-notice" aria-labelledby="prove-privacy-title">
        <ShieldCheck aria-hidden="true" :size="22" />
        <div>
          <h2 id="prove-privacy-title">로컬 진단 안내</h2>
          <p>
            가상 재무값과 PIN을 로컬 증명 서비스가 처리합니다. 서명 준비 후 입력칸은 지워집니다.
          </p>
          <ul>
            <li>원문은 브라우저 저장소·업무 DB·공개 원장에 저장하지 않습니다.</li>
            <li>개인 기기에서 가상 값만 사용하세요. 완전한 메모리 삭제는 보장하지 않습니다.</li>
            <li>가상 입력의 증명이며 은행·회계 검증이나 펀딩 승인이 아닙니다.</li>
            <li>
              기업마다 독립된 지갑·비밀 상태가 아닙니다. 같은 PIN을 쓰면 가명 결과가 연결될 수
              있습니다.
            </li>
            <li>
              <strong>채권·역할별 최초 1회만 발급합니다.</strong> 재발급·갱신·분실 복구는 지원하지
              않습니다.
            </li>
          </ul>
        </div>
      </section>

      <section v-if="isSubjectLoading" class="status-panel" role="status">
        <LoaderCircle class="spin" aria-hidden="true" :size="22" />
        <div>
          <strong>증명할 수 있는 채권을 불러오는 중입니다.</strong>
        </div>
      </section>

      <section v-else-if="subjectLoadError" class="notice error" role="alert">
        <CircleAlert aria-hidden="true" :size="22" />
        <div>
          <h2>채권 목록을 불러오지 못했습니다.</h2>
          <p>{{ subjectLoadError }}</p>
          <button class="secondary-button" type="button" @click="loadProofSubjects">
            <RefreshCw aria-hidden="true" :size="17" /> 다시 불러오기
          </button>
        </div>
      </section>

      <section v-else-if="!selectedCandidate" class="notice warning subject-empty" role="status">
        <CircleAlert aria-hidden="true" :size="22" />
        <div>
          <h2>
            {{
              relatedReceivables.length
                ? '아직 증명에 연결할 온체인 채권이 없습니다.'
                : '현재 로그인 회사는 증명 발급 주체가 아닙니다.'
            }}
          </h2>
          <p v-if="relatedReceivables.length">
            판매기업이 채권을 온체인에 등록한 뒤 다시 시도하세요.
          </p>
          <p v-else>
            해당 채권의 판매·구매기업만 서명할 수 있습니다. 요청자는 전달받은 결과를 조회하세요.
          </p>
          <RouterLink class="secondary-button inline-link" :to="{ name: 'midnight' }">
            전달받은 검증 권한 확인하기
          </RouterLink>
        </div>
      </section>

      <ol v-if="selectedCandidate" class="stepper" aria-label="ZK 증명 단계">
        <li v-for="step in 4" :key="step" :class="{ active: currentStep === step }">
          <span aria-hidden="true">{{ step }}</span>
          <strong :aria-current="currentStep === step ? 'step' : undefined">
            {{ ['비공개 입력', '지갑 서명', 'ZK 증명', '공개 결과'][step - 1] }}
          </strong>
        </li>
      </ol>

      <section
        v-if="selectedCandidate"
        class="panel subject-panel"
        aria-labelledby="proof-subject-title"
      >
        <div class="section-heading">
          <span class="section-icon" aria-hidden="true"><Database :size="20" /></span>
          <div>
            <span>공개 채권 문맥</span>
            <h2 id="proof-subject-title">증명 대상</h2>
          </div>
        </div>

        <label for="proof-receivable">내가 Seller/Buyer인 DB 채권 선택</label>
        <select
          id="proof-receivable"
          :value="selectedCandidateKey"
          :disabled="phase !== 'editing'"
          aria-describedby="proof-subject-help"
          @change="selectProofCandidate($event.target.value)"
        >
          <option v-for="candidate in proofCandidates" :key="candidate.key" :value="candidate.key">
            DB #{{ candidate.receivable.receivableId }} · {{ roleLabel(candidate.role) }} · 온체인
            #{{ candidate.onchainReceivableId }}
          </option>
        </select>

        <p v-if="subjectSelectionNotice" class="context-notice" role="status" aria-live="polite">
          {{ subjectSelectionNotice }} 현재 선택과 주소의 공개 DB 채권 ID를 일치시켰습니다.
        </p>

        <dl class="identifier-grid">
          <div>
            <dt>DB 채권 ID</dt>
            <dd>#{{ selectedCandidate.receivable.receivableId }}</dd>
          </div>
          <div>
            <dt>온체인 채권 ID</dt>
            <dd>#{{ selectedCandidate.onchainReceivableId }}</dd>
          </div>
          <div>
            <dt>NFT Token ID</dt>
            <dd>
              {{
                selectedCandidate.receivable.tokenId == null
                  ? '아직 민팅되지 않음'
                  : `#${selectedCandidate.receivable.tokenId}`
              }}
            </dd>
          </div>
          <div>
            <dt>자동 파생된 내 역할</dt>
            <dd>{{ roleLabel(selectedCandidate.role) }}</dd>
          </div>
        </dl>
        <p id="proof-subject-help" class="field-help">
          DB·온체인 번호는 다를 수 있습니다. 증명에는 연결된 온체인 번호와 내 역할이 자동
          적용됩니다.
        </p>
        <p class="field-help">
          발급 후에는 기존 검증 권한으로 반복 조회하세요. 재발급·갱신은 지원하지 않습니다.
        </p>
      </section>

      <section
        v-if="selectedCandidate && (phase === 'editing' || phase === 'requesting_challenge')"
        class="panel"
        aria-labelledby="private-input-title"
      >
        <div class="section-heading">
          <span class="section-icon" aria-hidden="true"><KeyRound :size="20" /></span>
          <div>
            <span>Step 1</span>
            <h2 id="private-input-title">가상 재무값 입력</h2>
          </div>
        </div>

        <form @submit.prevent="requestChallenge">
          <fieldset :disabled="phase === 'requesting_challenge'">
            <div class="form-grid">
              <div class="field">
                <label for="prove-revenue">연매출 (정수 KRW)</label>
                <input
                  id="prove-revenue"
                  v-model="annualRevenueKrw"
                  type="text"
                  inputmode="numeric"
                  autocomplete="off"
                  maxlength="26"
                  placeholder="예: 500,000,000"
                  :aria-describedby="
                    inputErrors.annualRevenueKrw
                      ? 'prove-revenue-help prove-policy-help prove-revenue-error'
                      : 'prove-revenue-help prove-policy-help'
                  "
                  :aria-invalid="Boolean(inputErrors.annualRevenueKrw)"
                  data-1p-ignore
                  data-lpignore="true"
                  @blur="formatRevenueOnBlur"
                />
                <p id="prove-revenue-help" class="input-help">
                  원 단위 정수로 입력하세요. 쉼표도 사용할 수 있습니다.
                </p>
                <p
                  v-if="inputErrors.annualRevenueKrw"
                  id="prove-revenue-error"
                  class="validation"
                  role="alert"
                >
                  {{ inputErrors.annualRevenueKrw }}
                </p>
              </div>

              <div class="field">
                <label for="prove-debt-ratio">부채비율 (%)</label>
                <input
                  id="prove-debt-ratio"
                  v-model="debtRatioPercent"
                  type="text"
                  inputmode="decimal"
                  autocomplete="off"
                  maxlength="11"
                  placeholder="예: 85.5 또는 200"
                  :aria-describedby="
                    inputErrors.debtRatioPercent
                      ? 'prove-debt-help prove-policy-help prove-debt-error'
                      : 'prove-debt-help prove-policy-help'
                  "
                  :aria-invalid="Boolean(inputErrors.debtRatioPercent)"
                  data-1p-ignore
                  data-lpignore="true"
                />
                <p id="prove-debt-help" class="input-help">
                  소수 둘째 자리까지 입력합니다.
                  <template v-if="normalizedDebtRatioBps">
                    {{ debtRatioPercent }}%는 증명 입력 {{ normalizedDebtRatioBps }} bps입니다.
                  </template>
                </p>
                <p
                  v-if="inputErrors.debtRatioPercent"
                  id="prove-debt-error"
                  class="validation"
                  role="alert"
                >
                  {{ inputErrors.debtRatioPercent }}
                </p>
              </div>

              <div class="field">
                <label for="prove-overdue">연체 건수</label>
                <input
                  id="prove-overdue"
                  v-model="overdueCount"
                  type="text"
                  inputmode="numeric"
                  autocomplete="off"
                  maxlength="5"
                  placeholder="예: 0"
                  :aria-describedby="
                    inputErrors.overdueCount
                      ? 'prove-overdue-help prove-policy-help prove-overdue-error'
                      : 'prove-overdue-help prove-policy-help'
                  "
                  :aria-invalid="Boolean(inputErrors.overdueCount)"
                  data-1p-ignore
                  data-lpignore="true"
                />
                <p id="prove-overdue-help" class="input-help">
                  0~65,535건을 입력할 수 있습니다. 기준은 1건 이하입니다.
                </p>
                <p
                  v-if="inputErrors.overdueCount"
                  id="prove-overdue-error"
                  class="validation"
                  role="alert"
                >
                  {{ inputErrors.overdueCount }}
                </p>
              </div>

              <div class="field">
                <label for="prove-pin">가명 생성 PIN (데모용)</label>
                <div class="pin-control">
                  <input
                    id="prove-pin"
                    v-model="secretPin"
                    :type="showPin ? 'text' : 'password'"
                    inputmode="numeric"
                    autocomplete="off"
                    maxlength="5"
                    placeholder="0–65535"
                    :aria-describedby="
                      inputErrors.secretPin
                        ? 'prove-pin-help prove-policy-help prove-pin-error'
                        : 'prove-pin-help prove-policy-help'
                    "
                    :aria-invalid="Boolean(inputErrors.secretPin)"
                    data-1p-ignore
                    data-lpignore="true"
                    data-form-type="other"
                  />
                  <button
                    class="text-button"
                    type="button"
                    :aria-pressed="showPin"
                    :aria-label="showPin ? '가명 생성 PIN 숨기기' : '가명 생성 PIN 표시하기'"
                    @click="showPin = !showPin"
                  >
                    {{ showPin ? '숨기기' : '표시' }}
                  </button>
                </div>
                <button class="small-secondary-button" type="button" @click="generateTemporaryPin">
                  <KeyRound aria-hidden="true" :size="15" /> 임시 데모 PIN 만들기
                </button>
                <p id="prove-pin-help" class="input-help">
                  가명 생성용 0~65,535입니다. 실제 비밀번호·카드 PIN은 사용하지 마세요. 같은 번호는
                  같은 가명, 다른 번호는 새 가명을 만듭니다.
                </p>
                <p
                  v-if="inputErrors.secretPin"
                  id="prove-pin-error"
                  class="validation"
                  role="alert"
                >
                  {{ inputErrors.secretPin }}
                </p>
                <p v-if="pinToolMessage" class="input-help" aria-live="polite">
                  {{ pinToolMessage }}
                </p>
              </div>
            </div>

            <p id="prove-policy-help" class="policy-help">
              <strong>정책 v1:</strong> 연매출 5억 원 이상 · 부채비율 200% 이하 · 연체 1건 이하.
              기준 밖 값은 실패가 아닌 유효한 <strong>부적격 ZK 결과</strong>가 됩니다.
            </p>
            <div
              v-if="failedAt === 'challenge' && errorMessage"
              ref="challengeErrorTarget"
              class="challenge-error"
              role="alert"
              tabindex="-1"
            >
              <strong>서명 요청을 만들지 못했습니다.</strong>
              <p>{{ errorMessage }}</p>
              <p>입력값은 유지됩니다. 안내를 확인하고 다시 시도하세요.</p>
            </div>

            <button class="primary-button" type="submit" :disabled="!canRequestChallenge">
              <LoaderCircle
                v-if="phase === 'requesting_challenge'"
                class="spin"
                aria-hidden="true"
                :size="18"
              />
              <ShieldCheck v-else aria-hidden="true" :size="18" />
              {{
                phase === 'requesting_challenge'
                  ? '서명 요청 만드는 중...'
                  : '재무값 전달하고 서명 요청 만들기'
              }}
            </button>
          </fieldset>
        </form>
      </section>

      <section
        v-if="selectedCandidate && phase === 'awaiting_signature' && authorizationRequest"
        class="panel"
        aria-labelledby="authorization-preview-title"
      >
        <div class="section-heading">
          <span class="section-icon" aria-hidden="true"><WalletCards :size="20" /></span>
          <div>
            <span>Step 2 · 서명 전 확인</span>
            <h2 id="authorization-preview-title">
              DB #{{ selectedCandidate.receivable.receivableId }} / 온체인 #{{
                authorizationRequest.message.onchainReceivableId
              }}
              ·
              {{ roleLabel(authorizationRequest.message.subjectRole) }}
            </h2>
          </div>
          <span class="expiry-badge">
            <Clock3 aria-hidden="true" :size="15" /> {{ secondsRemaining }}초 남음
          </span>
        </div>

        <dl class="preview-details">
          <div class="full-row">
            <dt>MetaMask에 등록된 역할 지갑</dt>
            <dd>
              <code>{{ authorizationRequest.message.partyWallet }}</code>
            </dd>
          </div>
          <div>
            <dt>Provider / 정책</dt>
            <dd>Mock Provider 2 / v1</dd>
          </div>
          <div>
            <dt>만료</dt>
            <dd>{{ formatExpiry(authorizationRequest.message.expiresAt) }}</dd>
          </div>
          <div class="full-row">
            <dt>서명 목적</dt>
            <dd>{{ authorizationRequest.message.purpose }}</dd>
          </div>
        </dl>

        <p class="meaning-note">
          해당 역할 지갑으로 가상 확인서 발급에 한 번 동의합니다. 요청자는 대신 서명할 수 없습니다.
          서명에는 가스비가 없으며, 재무 사실을 증명하지 않습니다.
        </p>
        <div
          v-if="failedAt === 'authorization' && errorMessage"
          class="challenge-error"
          role="alert"
        >
          <strong>지갑 서명을 완료하지 못했습니다.</strong>
          <p>{{ errorMessage }}</p>
        </div>
        <div class="actions">
          <button class="primary-button" type="button" @click="authorizeAndProve">
            <WalletCards aria-hidden="true" :size="18" /> MetaMask 서명 후 증명 시작
          </button>
          <button class="secondary-button" type="button" @click="resetProofFlow">
            <RotateCcw aria-hidden="true" :size="17" /> 세션 취소하고 다시 입력
          </button>
        </div>
      </section>

      <section
        v-if="isProgressPhase"
        ref="statusTarget"
        class="status-panel"
        role="status"
        tabindex="-1"
      >
        <LoaderCircle class="spin" aria-hidden="true" :size="22" />
        <div>
          <strong>{{ phaseCopy }}</strong>
          <p>이 단계가 완료될 때까지 새 증명 요청을 보내지 마세요.</p>
        </div>
      </section>

      <section
        v-if="phase === 'proof_unknown'"
        ref="errorTarget"
        class="notice warning"
        role="alert"
        tabindex="-1"
      >
        <CircleAlert aria-hidden="true" :size="22" />
        <div>
          <h2>증명 제출 결과를 아직 확정할 수 없습니다.</h2>
          <p>{{ errorMessage }}</p>
          <p>안전상 같은 서명을 자동으로 다시 제출하지 않습니다.</p>
          <div class="actions">
            <button
              v-if="canCancelAwaitingSession"
              class="primary-button"
              type="button"
              @click="cancelAwaitingSessionAndReset"
            >
              대기 세션 취소 후 다시 입력
            </button>
            <button class="secondary-button" type="button" @click="checkProofStatus()">
              처리 상태만 다시 확인
            </button>
          </div>
        </div>
      </section>

      <section
        v-else-if="isDuplicateResult"
        ref="errorTarget"
        class="notice warning duplicate-result"
        role="alert"
        tabindex="-1"
      >
        <CircleAlert aria-hidden="true" :size="22" />
        <div>
          <h2>이 채권 역할의 결과가 이미 발급되었습니다.</h2>
          <p>
            이미 발급된 채권·역할입니다. 새 증명은 제출되지 않았으며, 재발급·갱신·분실 복구는
            지원하지 않습니다.
          </p>
          <p>
            저장한 <code>.json</code> 파일이나 클립보드의 검증 권한으로 조회하세요.
            <strong>PIN을 바꿔 재발급 제한을 우회하면 안 됩니다.</strong>
          </p>
          <div class="actions">
            <RouterLink class="primary-button inline-link" :to="{ name: 'midnight' }">
              기존 검증 권한으로 결과 확인
            </RouterLink>
            <button class="secondary-button" type="button" @click="resetProofFlow">
              다른 채권 선택 또는 입력 화면으로
            </button>
          </div>
        </div>
      </section>

      <section
        v-else-if="phase === 'error' || phase === 'expired' || phase === 'cancelled'"
        ref="errorTarget"
        class="notice error"
        role="alert"
        tabindex="-1"
      >
        <CircleAlert aria-hidden="true" :size="22" />
        <div>
          <h2>{{ errorTitle }}</h2>
          <p v-if="errorMessage">{{ errorMessage }}</p>
          <div class="actions">
            <button
              v-if="phase === 'error' && failedAt === 'resolver'"
              class="primary-button"
              type="button"
              @click="retryPublicResult"
            >
              공개 결과 조회만 다시 시도
            </button>
            <button v-if="canReset" class="secondary-button" type="button" @click="resetProofFlow">
              다른 채권 선택 또는 처음부터 다시 시작
            </button>
          </div>
        </div>
      </section>

      <section
        v-if="selectedCandidate && phase === 'success' && verification"
        ref="resultTarget"
        class="result-panel"
        aria-labelledby="prove-result-title"
        tabindex="-1"
      >
        <div class="result-heading">
          <span
            class="result-icon"
            :class="verification.result.eligible ? 'eligible' : 'ineligible'"
            aria-hidden="true"
          >
            <CheckCircle2 v-if="verification.result.eligible" :size="24" />
            <CircleX v-else :size="24" />
          </span>
          <div>
            <span>Midnight 공개 원장 일치</span>
            <h2 id="prove-result-title">
              DB #{{ selectedCandidate.receivable.receivableId }} / 온체인 #{{
                verification.context.onchainReceivableId
              }}
              {{ verification.context.subjectRole }} ·
              {{ verification.result.eligible ? '적격' : '부적격' }}
            </h2>
          </div>
        </div>

        <p v-if="!verification.result.eligible" class="meaning-note">
          <strong>부적격은 증명 실패가 아닙니다.</strong> 가상 입력이 기준을 충족하지 않았다는
          유효한 결과입니다.
        </p>

        <dl class="preview-details">
          <div class="full-row">
            <dt>등록된 {{ verification.context.subjectRole }} 역할 지갑</dt>
            <dd>
              <code>{{ verification.context.partyWallet }}</code>
            </dd>
          </div>
          <div>
            <dt>입력 확인 주체</dt>
            <dd>Mock Provider 2 · 역할 지갑 서명 확인</dd>
          </div>
          <div>
            <dt>정책 버전</dt>
            <dd>v{{ verification.result.policyVersion }}</dd>
          </div>
          <div class="full-row">
            <dt>Lookup key</dt>
            <dd>
              <code :title="verification.result.lookupKey">{{
                shortHex(verification.result.lookupKey)
              }}</code>
            </dd>
          </div>
        </dl>

        <p class="meaning-note">
          가상 입력과 발급 시 지갑 동의를 검증한 결과입니다. 실제 회사·재무 검증이나 펀딩 승인이
          아닙니다. 이전 정책에는 만료·취소·갱신 정보가 없어 현재 적격성을 뜻하지 않습니다.
        </p>

        <section
          v-if="shareableCapabilityText"
          class="capability-share"
          aria-labelledby="capability-share-title"
        >
          <h3 id="capability-share-title">Funder에게 결과 조회 권한 전달</h3>
          <p>
            검증 권한은 이 결과와 특정 당사자를 연결하는 민감 정보입니다. 재무 원문·PIN은 포함하지
            않습니다.
          </p>
          <p class="capability-warning">
            의도한 요청자에게만 전달하세요.
            <strong>클립보드와 저장한 파일은 자동으로 지워지지 않습니다.</strong>
            공유·동기화 폴더를 피하고 사용 후 직접 지우세요.
          </p>
          <div class="actions">
            <button class="primary-button" type="button" @click="copyCapability">
              <Copy aria-hidden="true" :size="17" /> 검증 권한 복사
            </button>
            <button class="secondary-button" type="button" @click="saveCapabilityFile">
              <Download aria-hidden="true" :size="17" /> 검증 파일 저장
            </button>
          </div>
          <p
            v-if="capabilityCopyMessage"
            ref="capabilityHandoffFeedback"
            class="copy-feedback"
            :class="{ error: capabilityHandoffFailed }"
            :role="capabilityHandoffFailed ? 'alert' : 'status'"
            tabindex="-1"
          >
            {{ capabilityCopyMessage }}
          </p>
          <details
            class="advanced-capability"
            :open="showAdvancedCapability"
            @toggle="showAdvancedCapability = $event.currentTarget.open"
          >
            <summary>고급/CLI 진단용 raw JSON</summary>
            <div v-if="showAdvancedCapability">
              <label for="shareable-capability">한 줄 Proof capability JSON</label>
              <input
                id="shareable-capability"
                class="capability-output"
                type="text"
                :value="shareableCapabilityText"
                readonly
                autocomplete="off"
                spellcheck="false"
                @focus="$event.target.select()"
              />
              <p>직접 복사할 때는 필드를 수정하지 말고 한 줄 전체를 전달하세요.</p>
            </div>
          </details>
        </section>

        <p class="field-help">
          검증 권한을 보관해 반복 조회하세요. 재발급·갱신은 지원하지 않습니다.
        </p>
        <button class="secondary-button" type="button" @click="resetProofFlow">
          <RotateCcw aria-hidden="true" :size="17" /> 다른 채권 선택 또는 입력 화면으로
        </button>
      </section>
    </section>
  </main>
</template>

<style scoped>
.prove-page {
  min-height: 100%;
  padding: var(--space-6) var(--space-3) var(--space-8);
}

.prove-shell {
  width: min(100%, 960px);
  margin: 0 auto;
}

.tool-links {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  gap: var(--space-1);
  margin-bottom: var(--space-3);
}

.tool-links a {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: var(--color-brand);
  font-size: 14px;
  font-weight: 650;
  text-decoration: none;
}

.tool-links a:hover {
  text-decoration: underline;
}

.page-heading {
  margin-bottom: var(--space-4);
}

.eyebrow {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: var(--color-brand);
  font-size: 13px;
  font-weight: 700;
}

h1 {
  margin: var(--space-1) 0 0;
  font-size: clamp(30px, 5vw, 42px);
  line-height: 1.2;
  letter-spacing: -0.025em;
}

.page-heading p {
  max-width: 780px;
  margin: var(--space-2) 0 0;
  color: var(--color-text-muted);
  line-height: 1.65;
}

h2,
p {
  margin-top: 0;
}

.privacy-notice,
.panel,
.status-panel,
.notice,
.result-panel {
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  background: var(--color-surface);
}

.privacy-notice {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: var(--space-2);
  padding: var(--space-3);
  border-color: var(--color-brand-border);
  background: var(--color-brand-soft);
}

.privacy-notice > svg {
  color: var(--color-brand);
}

.privacy-notice h2,
.privacy-notice p,
.privacy-notice ul {
  margin-bottom: 0;
}

.privacy-notice h2 {
  font-size: 18px;
}

.privacy-notice p,
.privacy-notice li {
  line-height: 1.6;
}

.privacy-notice ul {
  margin-top: var(--space-1);
  padding-left: 20px;
}

.stepper {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: var(--space-1);
  margin: var(--space-3) 0;
  padding: 0;
  list-style: none;
}

.stepper li {
  display: flex;
  align-items: center;
  gap: var(--space-1);
  min-width: 0;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  padding: 10px 12px;
  color: var(--color-text-muted);
  background: var(--color-surface);
}

.stepper li > span {
  display: inline-flex;
  flex: 0 0 auto;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  background: var(--color-surface-subtle);
  font-size: 12px;
  font-weight: 700;
}

.stepper strong {
  overflow: hidden;
  font-size: 13px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.stepper li.active {
  border-color: var(--color-brand-border);
  color: var(--color-brand);
  background: var(--color-brand-soft);
}

.stepper li.active > span {
  background: var(--color-action);
  color: var(--color-on-action);
}

.panel,
.result-panel {
  padding: var(--space-3);
}

.subject-panel {
  margin-bottom: var(--space-3);
}

.subject-panel > label {
  display: block;
  margin-bottom: 6px;
}

.identifier-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: var(--space-1);
  margin: var(--space-2) 0 0;
}

.identifier-grid > div {
  min-width: 0;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  padding: 10px;
  background: var(--color-surface-subtle);
}

.identifier-grid dd {
  margin: 5px 0 0;
  overflow-wrap: anywhere;
  font-weight: 700;
}

.subject-empty {
  margin-top: var(--space-3);
}

.context-notice {
  margin: var(--space-2) 0 0;
  border-left: 3px solid var(--color-warning-border);
  padding: 9px 12px;
  background: var(--color-warning-soft);
  color: var(--color-warning);
  line-height: 1.55;
}

.section-heading,
.result-heading {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  margin-bottom: var(--space-3);
}

.section-heading > div,
.result-heading > div {
  min-width: 0;
}

.section-heading span,
.result-heading span {
  color: var(--color-text-muted);
  font-size: 13px;
  font-weight: 650;
}

.section-heading h2,
.result-heading h2 {
  margin: 2px 0 0;
  font-size: 21px;
}

.section-icon,
.result-icon {
  display: inline-flex;
  flex: 0 0 auto;
  align-items: center;
  justify-content: center;
  width: 42px;
  height: 42px;
  border-radius: var(--radius-md);
  background: var(--color-brand-soft);
  color: var(--color-brand);
}

.result-icon.ineligible {
  background: var(--color-danger-soft);
  color: var(--color-danger);
}

.expiry-badge {
  margin-left: auto;
  display: inline-flex;
  align-items: center;
  gap: 5px;
  border-radius: 999px;
  padding: 6px 10px;
  background: var(--color-warning-soft);
  color: var(--color-warning) !important;
  white-space: nowrap;
}

fieldset {
  margin: 0;
  border: 0;
  padding: 0;
}

.form-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--space-2);
}

.field {
  display: grid;
  gap: 6px;
}

.full-row {
  grid-column: 1 / -1;
}

label,
dt {
  color: var(--color-text-muted);
  font-size: 13px;
  font-weight: 650;
}

input,
select {
  width: 100%;
  min-height: 46px;
  border: 1px solid var(--color-border-strong);
  border-radius: var(--radius-md);
  padding: 10px 12px;
  background: var(--color-surface);
  color: var(--color-text);
}

input:hover,
select:hover {
  border-color: var(--color-border-strong);
}

input:focus,
select:focus {
  border-color: var(--color-brand);
  outline: 3px solid var(--color-focus);
}

.pin-control {
  position: relative;
}

.pin-control input {
  padding-right: 72px;
}

.text-button {
  position: absolute;
  top: 50%;
  right: 8px;
  min-height: 34px;
  border: 0;
  background: transparent;
  color: var(--color-brand);
  font-size: 13px;
  font-weight: 700;
  transform: translateY(-50%);
  cursor: pointer;
}

.field-help,
.input-help,
.meaning-note {
  margin: var(--space-2) 0 0;
  color: var(--color-text-muted);
  font-size: 14px;
  line-height: 1.6;
}

.input-help {
  margin-top: 0;
  font-size: 12px;
}

.policy-help {
  margin: var(--space-2) 0 0;
  border-radius: var(--radius-md);
  padding: 12px;
  background: var(--color-brand-soft);
  color: var(--color-text-muted);
  font-size: 14px;
  line-height: 1.6;
}

.validation {
  margin: var(--space-1) 0 0;
  color: var(--color-danger);
  font-size: 14px;
  font-weight: 650;
}

.challenge-error {
  margin: var(--space-2) 0 0;
  border: 1px solid var(--color-danger-border);
  border-radius: var(--radius-md);
  padding: 12px;
  background: var(--color-danger-soft);
  color: var(--color-danger);
}

.challenge-error p {
  margin: 6px 0 0;
  line-height: 1.55;
}

.primary-button,
.secondary-button,
.small-secondary-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 44px;
  gap: 7px;
  margin-top: var(--space-2);
  border-radius: var(--radius-md);
  padding: 10px 16px;
  font-weight: 700;
  cursor: pointer;
}

.primary-button {
  border: 1px solid var(--color-brand);
  background: var(--color-action);
  color: var(--color-on-action);
}

.primary-button:hover:not(:disabled) {
  border-color: var(--color-brand-hover);
  background: var(--color-action-hover);
}

.secondary-button {
  border: 1px solid var(--color-border-strong);
  background: var(--color-surface);
  color: var(--color-text);
}

.small-secondary-button {
  width: fit-content;
  min-height: 34px;
  margin-top: 0;
  border: 1px solid var(--color-border-strong);
  background: var(--color-surface);
  color: var(--color-brand);
  font-size: 12px;
}

.secondary-button:hover:not(:disabled) {
  border-color: var(--color-brand);
  color: var(--color-brand);
}

button:focus-visible,
.tool-links a:focus-visible,
.inline-link:focus-visible {
  outline: 3px solid var(--color-focus);
  outline-offset: 2px;
}

button:disabled {
  cursor: not-allowed;
  opacity: 0.55;
}

.actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-1);
}

.inline-link {
  text-decoration: none;
}

.capability-share {
  margin-top: var(--space-3);
  border: 1px solid var(--color-brand-border);
  border-radius: var(--radius-md);
  padding: var(--space-2);
  background: var(--color-brand-soft);
}

.capability-share h3 {
  margin: 0;
  font-size: 18px;
}

.capability-share p {
  margin: var(--space-1) 0;
  color: var(--color-text-muted);
  line-height: 1.6;
}

.capability-output {
  margin-top: 6px;
  background: var(--color-surface);
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 12px;
}

.capability-share .capability-warning {
  color: var(--color-warning);
  font-weight: 650;
}

.copy-feedback {
  font-weight: 650;
}

.copy-feedback:focus {
  outline: 3px solid var(--color-focus);
  outline-offset: 2px;
}

.copy-feedback.error {
  color: var(--color-danger);
}

.advanced-capability {
  margin-top: var(--space-2);
  border-top: 1px solid var(--color-brand-border);
  padding-top: var(--space-2);
}

.advanced-capability summary {
  width: fit-content;
  color: var(--color-brand);
  font-weight: 700;
  cursor: pointer;
}

.advanced-capability > div {
  margin-top: var(--space-1);
}

.preview-details {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--space-2);
  margin: 0;
}

.preview-details > div {
  min-width: 0;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  padding: 12px;
  background: var(--color-surface-subtle);
}

.preview-details dd {
  min-width: 0;
  margin: 5px 0 0;
  overflow-wrap: anywhere;
  font-weight: 650;
}

code {
  font-size: 12px;
  overflow-wrap: anywhere;
}

.status-panel,
.notice {
  display: flex;
  gap: var(--space-2);
  margin-top: var(--space-3);
  padding: var(--space-3);
}

.status-panel {
  border-color: var(--color-brand-border);
  background: var(--color-brand-soft);
}

.status-panel > svg {
  flex: 0 0 auto;
  color: var(--color-brand);
}

.status-panel p,
.notice p {
  margin: 6px 0 0;
  color: var(--color-text-muted);
}

.notice h2 {
  margin-bottom: 0;
  font-size: 18px;
}

.notice > svg {
  flex: 0 0 auto;
}

.notice.warning {
  border-color: var(--color-warning-border);
  background: var(--color-warning-soft);
  color: var(--color-warning);
}

.notice.error {
  border-color: var(--color-danger-border);
  background: var(--color-danger-soft);
  color: var(--color-danger);
}

.result-panel {
  border-color: var(--color-brand-border);
}

.spin {
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

@media (max-width: 720px) {
  .prove-page {
    padding: var(--space-4) var(--space-2) var(--space-6);
  }

  .stepper,
  .form-grid,
  .preview-details,
  .identifier-grid {
    grid-template-columns: 1fr;
  }

  .full-row {
    grid-column: auto;
  }

  .stepper strong {
    white-space: normal;
  }

  .section-heading,
  .result-heading {
    align-items: flex-start;
  }

  .expiry-badge {
    margin-left: 0;
  }
}

@media (prefers-reduced-motion: reduce) {
  .spin {
    animation: none;
  }
}
</style>
