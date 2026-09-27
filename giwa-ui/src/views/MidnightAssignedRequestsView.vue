<script setup>
import { displayCompanyName } from '../utils/companyName'
import {
  CheckCircle2,
  Clock3,
  Inbox,
  RefreshCw,
  Send,
  ShieldCheck,
  TriangleAlert,
  WalletCards,
  XCircle,
} from '@lucide/vue'
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { isMidnightExpired, useMidnightClock } from '../composables/useMidnightClock'
import { useMidnightAssignedProof } from '../composables/useMidnightAssignedProof'
import { useMidnightProofMailbox } from '../composables/useMidnightProofMailbox'
import { useReceivableStore } from '../stores/receivable'
import { isMidnightDemoEnabled } from '../services/midnight/config'
import { loadMidnightDemoConfig, midnightDemoRuntime } from '../services/midnight/demoRuntime'

const now = useMidnightClock()
const route = useRoute()
const receivableStore = useReceivableStore()
const mailbox = useMidnightProofMailbox('assigned')
const proof = useMidnightAssignedProof()
const selectedRequestId = ref('')
const denyConfirmationFor = ref('')
const receivablesError = ref('')
const demoConfigError = ref('')
const demoReady = computed(() => midnightDemoRuntime.value?.runtime.status === 'ready')
watch(
  midnightDemoRuntime,
  (config) => {
    if (config && !config.profiles.some((profile) => profile.id === proof.demoProfileId.value)) {
      proof.demoProfileId.value = config.profiles[0]?.id ?? ''
    }
  },
  { immediate: true },
)

const selectedRequest = computed(() =>
  mailbox.requests.value.find((request) => request.requestId === selectedRequestId.value),
)
const selectedReceivable = computed(() =>
  receivableStore.receivables.find(
    (receivable) => String(receivable.receivableId) === String(selectedRequest.value?.receivableId),
  ),
)
const proofBusy = computed(() =>
  [
    'recovering',
    'challenging',
    'signing',
    'submitting',
    'proving',
    'delivering',
    'acknowledging',
    'unknown',
  ].includes(proof.stage.value),
)
const proofFinishedForSelected = computed(
  () =>
    proof.activeRequestId.value === selectedRequestId.value &&
    ['submitted', 'completed'].includes(proof.stage.value),
)
const requestExpiredByClock = computed(
  () =>
    selectedRequest.value &&
    BigInt(selectedRequest.value.validUntil) <= BigInt(Math.floor(now.value / 1_000)),
)

onMounted(async () => {
  if (isMidnightDemoEnabled) {
    try {
      await loadMidnightDemoConfig()
    } catch (error) {
      demoConfigError.value = error.message
    }
  }
  try {
    await receivableStore.loadAll()
  } catch (error) {
    receivablesError.value = error?.message || '채권 세부 문맥을 불러오지 못했습니다.'
  }
})

watch(
  () => mailbox.requests.value,
  (requests) => {
    if (requests.some((request) => request.requestId === selectedRequestId.value)) return
    const requestIdFromQuery =
      typeof route.query.requestId === 'string' ? route.query.requestId.toLowerCase() : ''
    const receivableIdFromQuery =
      typeof route.query.receivableId === 'string' ? route.query.receivableId : ''
    selectedRequestId.value =
      requests.find((request) => request.requestId === requestIdFromQuery)?.requestId ??
      requests.find(
        (request) =>
          request.status === 'REQUESTED' && String(request.receivableId) === receivableIdFromQuery,
      )?.requestId ??
      requests.find((request) => request.status === 'REQUESTED')?.requestId ??
      requests[0]?.requestId ??
      ''
  },
  { immediate: true },
)

watch(selectedRequestId, (next, previous) => {
  denyConfirmationFor.value = ''
  if (previous && next !== previous && !proofBusy.value) proof.reset()
})

const automaticRecoveryAttempts = new Set()
watch(
  [selectedRequest, demoReady],
  async ([request]) => {
    if (isMidnightDemoEnabled && !demoReady.value) return
    if (!request || !['REQUESTED', 'SUBMITTED', 'COMPLETED'].includes(effectiveStatus(request)))
      return
    const attemptKey = `${request.requestId}:${request.status}`
    if (automaticRecoveryAttempts.has(attemptKey)) return
    automaticRecoveryAttempts.add(attemptKey)
    try {
      const completed = await proof.recoverDurableDelivery(request)
      if (completed && request.status === 'REQUESTED') await mailbox.refresh()
    } catch {
      // The progress card explains fail-closed recovery without starting a new proof.
    }
  },
  { immediate: true },
)

async function runProof() {
  if (!selectedRequest.value) return
  try {
    const completed = await proof.prove(selectedRequest.value)
    if (completed) await mailbox.refresh()
  } catch {
    if (proof.stage.value === 'unknown') await mailbox.refresh({ background: true })
  }
}

async function recoverDelivery() {
  const requestId = selectedRequest.value?.requestId
  if (!requestId || !proof.hasPendingDelivery.value) return
  // If an automatic poll was already in flight, wait for it and then require one newer read.
  await mailbox.refresh()
  const latestRequests = await mailbox.refresh()
  if (!Array.isArray(latestRequests)) return
  const latest = latestRequests.find((request) => request.requestId === requestId)
  if (!latest) return
  if (latest.status === 'COMPLETED') {
    await proof.recoverDurableDelivery(latest)
    return
  }
  if (latest.status !== 'REQUESTED' && latest.status !== 'SUBMITTED') {
    await proof.cancel()
    return
  }
  try {
    await proof.recoverDurableDelivery(latest, { quietNotFound: false })
    await mailbox.refresh()
  } catch {
    // The proof progress card keeps the recoverable delivery state visible.
  }
}

async function recoverStatus() {
  if (!selectedRequest.value || !proof.hasPendingStatus.value) return
  try {
    const completed = await proof.resumeStatus(selectedRequest.value)
    if (completed) await mailbox.refresh()
  } catch {
    // The same-session recovery remains available without repeating proof submission.
  }
}

async function denyRequest() {
  if (!selectedRequest.value || denyConfirmationFor.value !== selectedRequest.value.requestId) {
    denyConfirmationFor.value = selectedRequest.value?.requestId ?? ''
    return
  }
  try {
    await mailbox.deny(selectedRequest.value.requestId)
    denyConfirmationFor.value = ''
  } catch {
    // The mailbox alert contains the safe server response.
  }
}

function selectRequest(requestId) {
  if (proofBusy.value) return
  selectedRequestId.value = requestId
}

function formatKrw(value) {
  try {
    return `${BigInt(value).toLocaleString('ko-KR')} KRW`
  } catch {
    return '-'
  }
}

function formatBps(value) {
  const bps = BigInt(value)
  const whole = bps / 100n
  const fraction = (bps % 100n).toString().padStart(2, '0').replace(/0+$/, '')
  return `${whole.toLocaleString('ko-KR')}${fraction ? `.${fraction}` : ''}%`
}

function formatEpoch(value) {
  const milliseconds = Number(BigInt(value) * 1000n)
  return Number.isFinite(milliseconds) ? new Date(milliseconds).toLocaleString('ko-KR') : '-'
}

function effectiveStatus(request) {
  return ['REQUESTED', 'SUBMITTED', 'COMPLETED'].includes(request.status) &&
    isMidnightExpired(request.validUntil, now.value)
    ? 'EXPIRED'
    : request.status
}

function statusText(status) {
  return {
    REQUESTED: '응답 필요',
    SUBMITTED: '증명 제출됨 · 결과 동기화 중',
    COMPLETED: '응답 완료',
    DENIED: '내가 거절함',
    EXPIRED: '기한 만료',
    FAILED: '처리 실패',
  }[status]
}

function proofStageText(stage) {
  return (
    {
      challenging: '서명 요청 준비 중',
      recovering: '기존 완료 증명 복구 중',
      signing: 'MetaMask 동의 대기 중',
      submitting: '서명 제출 중',
      proving: 'ZK 증명 중',
      delivering: '요청자에게 결과 전달 중',
      acknowledging: '전달 확인 중',
      unknown: '전달 상태 확인 필요',
      submitted: '증명 제출 완료 · 공개 결과 동기화 중',
      completed: '응답 완료',
      failed: '흐름 실패',
      expired: '세션 만료',
      cancelled: '세션 취소',
    }[stage] ?? ''
  )
}
</script>

<template>
  <main class="assigned-page">
    <section class="page-hero" aria-labelledby="assigned-title">
      <div class="hero-icon"><Inbox aria-hidden="true" :size="28" /></div>
      <div>
        <p class="eyebrow">판매·구매기업</p>
        <h1 id="assigned-title">받은 검증 요청</h1>
        <p v-if="isMidnightDemoEnabled">기준과 시나리오를 확인하고, 지갑 서명으로 응답하세요.</p>
        <p v-else>기준에 동의할 때만 가상 재무값으로 응답하세요.</p>
      </div>
    </section>

    <nav class="workspace-tabs" aria-label="재무 검증 요청함">
      <RouterLink :to="{ name: 'midnight' }"
        ><Send aria-hidden="true" :size="18" /> 보낸 요청</RouterLink
      >
      <RouterLink :to="{ name: 'midnight-prove' }" aria-current="page"
        ><Inbox aria-hidden="true" :size="18" /> 받은 요청</RouterLink
      >
    </nav>

    <div class="workspace-grid">
      <aside class="request-inbox" aria-labelledby="inbox-list-title">
        <div class="inbox-heading">
          <h2 id="inbox-list-title">받은 요청</h2>
          <button
            type="button"
            :disabled="mailbox.isRefreshing.value || proofBusy"
            aria-label="받은 요청 새로고침"
            @click="mailbox.refresh()"
          >
            <RefreshCw aria-hidden="true" :size="18" />
          </button>
        </div>
        <p v-if="mailbox.isLoading.value" class="notice" role="status">
          요청함을 불러오는 중입니다.
        </p>
        <p v-else-if="mailbox.requests.value.length === 0" class="notice">
          아직 받은 요청이 없습니다.
        </p>
        <ul v-else>
          <li v-for="request in mailbox.requests.value" :key="request.requestId">
            <button
              type="button"
              :class="{ selected: request.requestId === selectedRequestId }"
              :disabled="proofBusy && request.requestId !== selectedRequestId"
              @click="selectRequest(request.requestId)"
            >
              <span>DB #{{ request.receivableId }} · {{ request.subjectRole }}</span>
              <strong>{{ displayCompanyName(request.requesterCompanyName) }}</strong>
              <small
                >{{ statusText(effectiveStatus(request)) }} ·
                {{ formatEpoch(request.validUntil) }}</small
              >
            </button>
          </li>
        </ul>
      </aside>

      <section class="request-detail" aria-label="검증 요청 상세">
        <p v-if="mailbox.errorMessage.value" class="alert alert-danger" role="alert">
          {{ mailbox.errorMessage.value }}
        </p>
        <p v-if="mailbox.successMessage.value" class="alert alert-success" role="status">
          {{ mailbox.successMessage.value }}
        </p>
        <p v-if="receivablesError" class="alert alert-warning" role="alert">
          {{ receivablesError }}
        </p>
        <div v-if="!selectedRequest" class="empty-detail">
          <ShieldCheck aria-hidden="true" :size="34" />
          <p>확인할 요청을 선택하세요.</p>
        </div>

        <template v-else>
          <header class="detail-heading">
            <div>
              <p class="eyebrow">
                {{
                  selectedRequest.status === 'REQUESTED'
                    ? '응답 필요'
                    : statusText(effectiveStatus(selectedRequest))
                }}
              </p>
              <h2 id="request-detail-title">
                {{ displayCompanyName(selectedRequest.requesterCompanyName) }}의 검증 요청
              </h2>
              <p>
                {{ displayCompanyName(selectedRequest.subjectCompanyName) }}의
                {{ selectedRequest.subjectRole }} 역할에 온 요청입니다.
              </p>
            </div>
            <span class="status-pill">{{ statusText(effectiveStatus(selectedRequest)) }}</span>
          </header>

          <section class="context-card" aria-labelledby="context-title">
            <h3 id="context-title">요청 정보</h3>
            <dl class="context-grid">
              <div>
                <dt>요청 회사</dt>
                <dd>{{ displayCompanyName(selectedRequest.requesterCompanyName) }}</dd>
              </div>
              <div>
                <dt>내 역할</dt>
                <dd>{{ selectedRequest.subjectRole }}</dd>
              </div>
              <div>
                <dt>DB 채권</dt>
                <dd>#{{ selectedRequest.receivableId }}</dd>
              </div>
              <div>
                <dt>온체인 채권</dt>
                <dd>#{{ selectedRequest.onchainReceivableId }}</dd>
              </div>
              <div>
                <dt>NFT Token ID</dt>
                <dd>#{{ selectedReceivable?.tokenId ?? '-' }}</dd>
              </div>
              <div>
                <dt>응답 기한</dt>
                <dd>{{ formatEpoch(selectedRequest.validUntil) }}</dd>
              </div>
              <div class="wide">
                <dt>서명할 지갑</dt>
                <dd class="technical-value">{{ selectedRequest.partyWallet }}</dd>
              </div>
            </dl>
          </section>

          <section class="criteria-card" aria-labelledby="criteria-title">
            <h3 id="criteria-title">요청 기준</h3>
            <p>세 조건의 전체 충족 여부만 전달합니다.</p>
            <dl>
              <div>
                <dt>연매출</dt>
                <dd>{{ formatKrw(selectedRequest.minAnnualRevenueKrw) }} 이상</dd>
              </div>
              <div>
                <dt>부채비율</dt>
                <dd>{{ formatBps(selectedRequest.maxDebtRatioBps) }} 이하</dd>
              </div>
              <div>
                <dt>연체 횟수</dt>
                <dd>{{ selectedRequest.maxOverdueCount }}건 이하</dd>
              </div>
            </dl>
          </section>

          <section
            v-if="
              selectedRequest.status === 'REQUESTED' &&
              !requestExpiredByClock &&
              !proofFinishedForSelected
            "
            class="response-card"
            aria-labelledby="private-facts-title"
          >
            <div class="response-heading">
              <div>
                <p class="eyebrow">
                  {{ isMidnightDemoEnabled ? '가상 기업 데모' : '내 회사만 입력' }}
                </p>
                <h3 id="private-facts-title">
                  {{ isMidnightDemoEnabled ? '시나리오 선택' : '가상 재무값 입력' }}
                </h3>
              </div>
              <WalletCards aria-hidden="true" :size="28" />
            </div>
            <p v-if="isMidnightDemoEnabled" class="privacy-copy">
              {{ midnightDemoRuntime?.provider.name ?? '가상 재무 확인 기관' }}의 가상 데이터입니다.
              운영 서버가 원문을 처리하며, 은행 검증은 아닙니다.
            </p>
            <p v-else class="privacy-copy">
              가상 값만 입력하세요. 서버가 원문을 처리하고 준비 후 입력칸은 지워집니다.
            </p>
            <p v-if="demoConfigError && !demoReady" class="alert alert-warning">
              {{ demoConfigError }}
            </p>
            <form class="private-form" @submit.prevent="runProof">
              <fieldset
                v-if="isMidnightDemoEnabled"
                class="demo-profiles"
                :disabled="proofBusy || !demoReady"
              >
                <legend>가상 기업 시나리오</legend>
                <label
                  v-for="profile in midnightDemoRuntime?.profiles ?? []"
                  :key="profile.id"
                  class="demo-profile"
                >
                  <input
                    v-model="proof.demoProfileId.value"
                    type="radio"
                    name="demo-profile"
                    :value="profile.id"
                    required
                  />
                  <span
                    ><strong>{{ profile.label }}</strong
                    ><small>{{ profile.summary }}</small></span
                  >
                </label>
                <p v-if="!demoReady">증명 환경이 준비되면 선택할 수 있습니다.</p>
              </fieldset>
              <template v-else>
                <label>
                  <span>내 회사 연매출</span>
                  <div class="input-suffix">
                    <input
                      v-model="proof.privateFacts.annualRevenueKrw"
                      inputmode="numeric"
                      autocomplete="off"
                      required
                      :disabled="proofBusy"
                    /><span>KRW</span>
                  </div>
                  <small>쉼표·공백·소수점 없이 정수로 입력하세요.</small>
                </label>
                <label>
                  <span>내 회사 부채비율</span>
                  <div class="input-suffix">
                    <input
                      v-model="proof.privateFacts.debtRatioPercent"
                      inputmode="decimal"
                      autocomplete="off"
                      required
                      :disabled="proofBusy"
                    /><span>%</span>
                  </div>
                  <small>예: 175.25는 175.25%입니다.</small>
                </label>
                <label>
                  <span>내 회사 연체 횟수</span>
                  <div class="input-suffix">
                    <input
                      v-model="proof.privateFacts.overdueCount"
                      inputmode="numeric"
                      autocomplete="off"
                      required
                      :disabled="proofBusy"
                    /><span>건</span>
                  </div>
                  <small>0 이상의 정수로 입력하세요.</small>
                </label>
              </template>
              <div class="consent-copy">
                <ShieldCheck aria-hidden="true" :size="20" />
                <p>
                  표시된 채권·역할·요청자·기준·기한의 가상 확인서 발급에 한 번 동의합니다. MetaMask
                  서명에는 가스비가 들지 않습니다.
                </p>
              </div>
              <div class="form-actions">
                <button
                  class="primary-button"
                  type="submit"
                  :disabled="
                    proofBusy ||
                    mailbox.isMutating.value ||
                    (isMidnightDemoEnabled && (!demoReady || !proof.demoProfileId.value))
                  "
                >
                  <ShieldCheck aria-hidden="true" :size="18" />
                  {{ proofBusy ? proofStageText(proof.stage.value) : '동의하고 증명 시작' }}
                </button>
                <button
                  class="danger-button"
                  type="button"
                  :disabled="proofBusy || mailbox.isMutating.value"
                  @click="denyRequest"
                >
                  <XCircle aria-hidden="true" :size="18" />
                  {{
                    denyConfirmationFor === selectedRequest.requestId
                      ? '한 번 더 눌러 요청 거절'
                      : '요청 거절'
                  }}
                </button>
              </div>
            </form>
          </section>

          <div
            v-if="
              proof.statusMessage.value && proof.activeRequestId.value === selectedRequest.requestId
            "
            class="progress-card"
            :class="`stage-${proof.stage.value}`"
            aria-live="polite"
          >
            <CheckCircle2
              v-if="['submitted', 'completed'].includes(proof.stage.value)"
              aria-hidden="true"
              :size="24"
            />
            <TriangleAlert
              v-else-if="['failed', 'unknown', 'expired'].includes(proof.stage.value)"
              aria-hidden="true"
              :size="24"
            />
            <Clock3 v-else aria-hidden="true" :size="24" />
            <div>
              <strong>{{ proofStageText(proof.stage.value) }}</strong>
              <p>{{ proof.statusMessage.value }}</p>
              <button
                v-if="proof.stage.value === 'unknown' && proof.hasPendingDelivery.value"
                class="secondary-button"
                type="button"
                @click="recoverDelivery"
              >
                결과 전달 재시도
              </button>
              <button
                v-else-if="proof.stage.value === 'unknown' && proof.hasPendingStatus.value"
                class="secondary-button"
                type="button"
                @click="recoverStatus"
              >
                증명 상태 다시 확인
              </button>
            </div>
          </div>
          <p
            v-if="
              proof.errorMessage.value && proof.activeRequestId.value === selectedRequest.requestId
            "
            class="alert alert-danger"
            role="alert"
          >
            {{ proof.errorMessage.value }}
          </p>

          <div
            v-if="selectedRequest.status === 'SUBMITTED' && !requestExpiredByClock"
            class="terminal-card success"
          >
            <CheckCircle2 aria-hidden="true" :size="26" />
            <div>
              <h3>증명 제출을 완료했습니다</h3>
              <p>요청자가 공개 결과를 확인할 수 있습니다. 재증명은 필요하지 않습니다.</p>
            </div>
          </div>
          <div
            v-else-if="selectedRequest.status === 'COMPLETED' && !requestExpiredByClock"
            class="terminal-card success"
          >
            <CheckCircle2 aria-hidden="true" :size="26" />
            <div>
              <h3>이 요청에 응답했습니다</h3>
              <p>요청자는 보낸 요청에서 충족·미충족 결과를 확인합니다.</p>
            </div>
          </div>
          <div v-else-if="selectedRequest.status === 'DENIED'" class="terminal-card neutral">
            <XCircle aria-hidden="true" :size="26" />
            <div>
              <h3>거절한 요청입니다</h3>
              <p>동의하지 않은 요청입니다. 기준 미충족을 뜻하지 않습니다.</p>
            </div>
          </div>
          <div
            v-else-if="selectedRequest.status === 'EXPIRED' || requestExpiredByClock"
            class="terminal-card warning"
          >
            <Clock3 aria-hidden="true" :size="26" />
            <div>
              <h3>요청 기한이 만료되었습니다</h3>
              <p>이 요청은 만료되었습니다. 필요한 경우 요청자에게 새 요청을 받으세요.</p>
            </div>
          </div>
          <div v-else-if="selectedRequest.status === 'FAILED'" class="terminal-card warning">
            <TriangleAlert aria-hidden="true" :size="26" />
            <div>
              <h3>요청 처리가 실패했습니다</h3>
              <p>처리 실패는 기준 미충족을 뜻하지 않습니다. 새 요청으로 다시 진행할 수 있습니다.</p>
            </div>
          </div>
        </template>
      </section>
    </div>
  </main>
</template>

<style scoped>
.demo-profiles {
  grid-column: 1 / -1;
  display: grid;
  gap: 12px;
  border: 0;
  padding: 0;
  margin: 0;
}
.demo-profiles legend {
  font-weight: 800;
  margin-bottom: 12px;
}
.demo-profile {
  display: flex !important;
  align-items: center;
  gap: 12px !important;
  padding: 16px;
  border: 1px solid var(--color-border-strong);
  border-radius: 12px;
  cursor: pointer;
}
.demo-profile:has(input:checked) {
  border-color: var(--color-brand);
  background: var(--color-brand-soft);
}
.demo-profile input {
  accent-color: var(--color-action);
  width: 18px;
  height: 18px;
}
.demo-profile span {
  display: grid;
  gap: 5px;
}

.assigned-page {
  width: min(1240px, calc(100% - 40px));
  margin: 0 auto;
  padding: 52px 0 80px;
  color: var(--color-text);
}
.page-hero {
  display: flex;
  gap: 20px;
  padding: 28px;
  border: 1px solid var(--color-brand-border);
  border-radius: 22px;
  background: var(--color-brand-soft);
}
.hero-icon {
  display: grid;
  place-items: center;
  width: 58px;
  height: 58px;
  flex: 0 0 auto;
  border-radius: 16px;
  color: var(--color-brand);
  background: var(--color-brand-soft);
}
.eyebrow {
  margin: 0 0 6px;
  color: var(--color-brand);
  font-weight: 800;
  font-size: 0.84rem;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}
h1,
h2,
h3,
p {
  margin-top: 0;
}
h1 {
  margin-bottom: 10px;
  font-size: clamp(1.75rem, 3vw, 2.45rem);
}
.page-hero p:last-child {
  margin: 0;
  color: var(--color-text-muted);
  line-height: 1.7;
}
.workspace-tabs {
  display: flex;
  gap: 10px;
  margin: 24px 0;
}
.workspace-tabs a {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 12px 18px;
  border: 1px solid var(--color-border-strong);
  border-radius: 12px;
  color: var(--color-text);
  text-decoration: none;
  font-weight: 750;
}
.workspace-tabs a[aria-current='page'] {
  color: var(--color-brand);
  border-color: var(--color-brand-border);
  background: var(--color-brand-soft);
}
.workspace-grid {
  display: grid;
  grid-template-columns: minmax(250px, 320px) minmax(0, 1fr);
  gap: 20px;
  align-items: start;
}
.request-inbox,
.request-detail {
  border: 1px solid var(--color-border);
  border-radius: 18px;
  background: var(--color-surface);
  box-shadow: 0 14px 40px rgb(0 0 0 / 20%);
}
.request-inbox {
  position: sticky;
  top: 100px;
  overflow: hidden;
}
.inbox-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 18px;
  border-bottom: 1px solid var(--color-border);
}
.inbox-heading h2 {
  margin: 0;
  font-size: 1.15rem;
}
.inbox-heading button {
  display: grid;
  place-items: center;
  width: 38px;
  height: 38px;
  border: 1px solid var(--color-border-strong);
  border-radius: 9px;
  background: var(--color-surface);
  cursor: pointer;
}
.request-inbox ul {
  margin: 0;
  padding: 8px;
  list-style: none;
}
.request-inbox li + li {
  margin-top: 5px;
}
.request-inbox li button {
  display: grid;
  gap: 5px;
  width: 100%;
  padding: 13px;
  text-align: left;
  border: 1px solid transparent;
  border-radius: 10px;
  color: inherit;
  background: transparent;
  cursor: pointer;
}
.request-inbox li button:hover,
.request-inbox li button.selected {
  border-color: var(--color-brand-border);
  background: var(--color-brand-soft);
}
.request-inbox li span,
.request-inbox li small {
  color: var(--color-text-muted);
}
.request-inbox li button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.request-detail {
  min-height: 520px;
  padding: 28px;
}
.empty-detail {
  display: grid;
  place-items: center;
  gap: 12px;
  min-height: 450px;
  color: var(--color-text-muted);
}
.detail-heading {
  display: flex;
  align-items: start;
  justify-content: space-between;
  gap: 16px;
}
.detail-heading h2 {
  margin-bottom: 6px;
}
.detail-heading p:last-child {
  color: var(--color-text-muted);
}
.status-pill {
  padding: 8px 11px;
  border-radius: 999px;
  color: var(--color-brand);
  background: var(--color-brand-soft);
  font-size: 0.86rem;
  font-weight: 800;
  white-space: nowrap;
}
.context-card,
.criteria-card,
.response-card {
  margin-top: 22px;
  padding: 22px;
  border: 1px solid var(--color-border);
  border-radius: 14px;
}
.context-card h3,
.criteria-card h3,
.response-card h3 {
  margin-bottom: 14px;
}
.context-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
  margin: 0;
}
.context-grid div,
.criteria-card dl div {
  padding: 12px;
  border-radius: 10px;
  background: var(--color-surface-subtle);
}
.context-grid .wide {
  grid-column: 1 / -1;
}
.technical-value {
  overflow-wrap: anywhere;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 0.86rem;
}
dt {
  color: var(--color-text-muted);
  font-size: 0.82rem;
  font-weight: 700;
}
dd {
  margin: 5px 0 0;
  font-weight: 800;
}
.criteria-card {
  border-color: var(--color-warning-border);
  background: var(--color-warning-soft);
}
.criteria-card > p {
  color: var(--color-warning);
}
.criteria-card dl {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
  margin: 0;
}
.criteria-card dl div {
  background: var(--color-surface);
}
.response-card {
  border-color: var(--color-brand-border);
}
.response-heading {
  display: flex;
  align-items: start;
  justify-content: space-between;
  color: var(--color-brand);
}
.privacy-copy {
  padding: 14px;
  color: var(--color-text-muted);
  background: var(--color-brand-soft);
  line-height: 1.6;
}
.private-form {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 18px;
}
.private-form label {
  display: grid;
  gap: 7px;
  font-weight: 750;
}
.private-form small {
  color: var(--color-text-muted);
  font-weight: 500;
  line-height: 1.45;
}
.input-suffix {
  display: flex;
  align-items: center;
  border: 1px solid var(--color-border-strong);
  border-radius: 10px;
  overflow: hidden;
}
.input-suffix:focus-within {
  outline: 3px solid var(--color-focus);
  outline-offset: 2px;
}
.input-suffix input {
  width: 100%;
  min-width: 0;
  min-height: 48px;
  padding: 0 12px;
  border: 0;
  outline: 0;
  font: inherit;
}
.input-suffix span {
  padding: 0 12px;
  color: var(--color-text-muted);
  font-weight: 700;
}
.consent-copy {
  grid-column: 1 / -1;
  display: flex;
  gap: 10px;
  padding: 14px;
  border-left: 4px solid var(--color-warning-border);
  color: var(--color-warning);
  background: var(--color-warning-soft);
}
.consent-copy p {
  margin: 0;
  line-height: 1.6;
}
.form-actions {
  grid-column: 1 / -1;
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}
.primary-button,
.danger-button,
.secondary-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  min-height: 46px;
  padding: 0 18px;
  border-radius: 10px;
  font: inherit;
  font-weight: 800;
  cursor: pointer;
}
.primary-button {
  color: var(--color-on-action);
  border: 1px solid var(--color-brand-border);
  background: var(--color-action);
}
.danger-button {
  color: var(--color-danger);
  border: 1px solid var(--color-danger-border);
  background: var(--color-surface);
}
.secondary-button {
  min-height: 40px;
  margin-top: 10px;
  color: var(--color-warning);
  border: 1px solid var(--color-warning-border);
  background: var(--color-surface);
}
button:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}
button:focus-visible,
input:focus-visible,
a:focus-visible {
  outline: 3px solid var(--color-focus);
  outline-offset: 2px;
}
.progress-card,
.terminal-card {
  display: flex;
  gap: 13px;
  margin-top: 20px;
  padding: 18px;
  border-radius: 13px;
}
.progress-card {
  color: var(--color-warning);
  border: 1px solid var(--color-warning-border);
  background: var(--color-warning-soft);
}
.progress-card.stage-completed,
.progress-card.stage-submitted,
.terminal-card.success {
  color: var(--color-success);
  border: 1px solid var(--color-success-border);
  background: var(--color-success-soft);
}
.progress-card.stage-failed,
.progress-card.stage-unknown,
.progress-card.stage-expired,
.terminal-card.warning {
  color: var(--color-danger);
  border: 1px solid var(--color-danger-border);
  background: var(--color-danger-soft);
}
.progress-card p,
.terminal-card p {
  margin: 4px 0 0;
  line-height: 1.55;
}
.terminal-card h3 {
  margin-bottom: 4px;
}
.terminal-card.neutral {
  color: var(--color-text-muted);
  border: 1px solid var(--color-border-strong);
  background: var(--color-surface-subtle);
}
.notice,
.alert {
  padding: 14px;
  border-radius: 10px;
  line-height: 1.55;
}
.request-inbox .notice {
  margin: 12px;
}
.alert-danger {
  color: var(--color-danger);
  border: 1px solid var(--color-danger-border);
  background: var(--color-danger-soft);
}
.alert-success {
  color: var(--color-success);
  border: 1px solid var(--color-success-border);
  background: var(--color-success-soft);
}
.alert-warning {
  color: var(--color-warning);
  border: 1px solid var(--color-warning-border);
  background: var(--color-warning-soft);
}
@media (max-width: 900px) {
  .workspace-grid {
    grid-template-columns: 1fr;
  }
  .request-inbox {
    position: static;
  }
  .request-inbox ul {
    display: flex;
    overflow-x: auto;
  }
  .request-inbox li {
    min-width: 230px;
  }
  .request-inbox li + li {
    margin: 0 0 0 5px;
  }
  .context-grid {
    grid-template-columns: 1fr 1fr;
  }
  .private-form {
    grid-template-columns: 1fr;
  }
  .consent-copy,
  .form-actions {
    grid-column: auto;
  }
}
@media (max-width: 600px) {
  .assigned-page {
    width: calc(100% - 24px);
    padding-top: 28px;
  }
  .page-hero {
    flex-direction: column;
    padding: 22px;
  }
  .request-detail {
    padding: 20px;
  }
  .detail-heading {
    flex-direction: column;
  }
  .criteria-card dl,
  .context-grid {
    grid-template-columns: 1fr;
  }
  .context-grid .wide {
    grid-column: auto;
  }
  .workspace-tabs a {
    flex: 1;
    justify-content: center;
  }
}
</style>
