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
  Users,
  XCircle,
} from '@lucide/vue'
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { isMidnightExpired, useMidnightClock } from '../composables/useMidnightClock'
import { useMidnightProofMailbox } from '../composables/useMidnightProofMailbox'
import {
  isFunderVisibleReceivable,
  mergeVisibleReceivables,
} from '../services/midnight/receivableCapabilityContext'
import { isMidnightDemoEnabled, isMidnightProofBridgeEnabled } from '../services/midnight/config'
import { midnightDemoRuntime } from '../services/midnight/demoRuntime'
import { percentTextToBps } from '../composables/useMidnightAssignedProof'
import { useAuthStore } from '../stores/auth'
import { useReceivableStore } from '../stores/receivable'

const now = useMidnightClock()
const route = useRoute()
const auth = useAuthStore()
const receivableStore = useReceivableStore()
const mailbox = useMidnightProofMailbox('requested')
const isContextLoading = ref(true)
const contextError = ref('')
const formError = ref('')
const selectedReceivableId = ref('')
const selectedRoles = reactive({ SELLER: true, BUYER: false })
const policy = reactive({
  minAnnualRevenueKrw: '500000000',
  maxDebtRatioPercent: '200',
  maxOverdueCount: '1',
  validForSeconds: 86400,
})
const ACTIVE_REQUEST_STATUSES = new Set(['REQUESTED', 'SUBMITTED', 'COMPLETED'])
const demoReady = computed(
  () => !isMidnightDemoEnabled || midnightDemoRuntime.value?.runtime.status === 'ready',
)

const visibleReceivables = computed(() =>
  mergeVisibleReceivables(receivableStore.fundingOpportunities, receivableStore.receivables).filter(
    (receivable) =>
      receivable.status === 'TOKENIZED' &&
      receivable.funderCompanyId == null &&
      isFunderVisibleReceivable(receivable, auth.user?.companyId),
  ),
)
const selectedReceivable = computed(() =>
  visibleReceivables.value.find(
    (receivable) => String(receivable.receivableId) === selectedReceivableId.value,
  ),
)

function activeRequestFor(role) {
  const receivableId = selectedReceivableId.value
  const nowSeconds = BigInt(Math.floor(now.value / 1_000))
  return mailbox.requests.value.find((request) => {
    if (
      String(request.receivableId) !== receivableId ||
      request.subjectRole !== role ||
      !ACTIVE_REQUEST_STATUSES.has(request.status)
    ) {
      return false
    }
    try {
      return BigInt(request.validUntil) > nowSeconds
    } catch {
      return true
    }
  })
}

watch(
  [selectedReceivableId, () => mailbox.requests.value],
  () => {
    for (const role of ['SELLER', 'BUYER']) {
      if (activeRequestFor(role)) selectedRoles[role] = false
    }
  },
  { immediate: true },
)

onMounted(loadContext)

async function loadContext() {
  isContextLoading.value = true
  contextError.value = ''
  try {
    await Promise.all([
      auth.loadUser(),
      receivableStore.loadAll(),
      receivableStore.loadFundingOpportunities(),
    ])
    const requestedId = typeof route.query.receivableId === 'string' ? route.query.receivableId : ''
    selectedReceivableId.value = visibleReceivables.value.some(
      (receivable) => String(receivable.receivableId) === requestedId,
    )
      ? requestedId
      : String(visibleReceivables.value[0]?.receivableId ?? '')
  } catch (error) {
    contextError.value = error?.message || '펀딩 가능한 채권 문맥을 불러오지 못했습니다.'
  } finally {
    isContextLoading.value = false
  }
}

function applyDemoPreset() {
  policy.minAnnualRevenueKrw = '500000000'
  policy.maxDebtRatioPercent = '200'
  policy.maxOverdueCount = '1'
  policy.validForSeconds = 86400
  formError.value = ''
}

function canonicalInteger(value, label) {
  if (typeof value !== 'string' || !/^(0|[1-9][0-9]*)$/.test(value)) {
    throw new TypeError(`${label}은 쉼표 없이 0 이상의 정수로 입력해 주세요.`)
  }
  return value
}

async function submitRequest() {
  mailbox.clearMessages()
  formError.value = ''
  if (!demoReady.value) {
    formError.value = '데모 준비가 끝나면 검증을 요청할 수 있습니다.'
    return
  }
  if (!selectedReceivable.value) {
    formError.value = '검증을 요청할 채권을 선택해 주세요.'
    return
  }
  const roles = Object.entries(selectedRoles)
    .filter(([, selected]) => selected)
    .map(([role]) => role)
  if (roles.some((role) => activeRequestFor(role))) {
    formError.value =
      '같은 채권·역할의 유효한 요청이 이미 있습니다. 기존 요청 카드에서 상태를 확인해 주세요.'
    return
  }
  try {
    await mailbox.createRequests(selectedReceivable.value.receivableId, roles, {
      minAnnualRevenueKrw: canonicalInteger(policy.minAnnualRevenueKrw, '최소 연매출'),
      maxDebtRatioBps: percentTextToBps(policy.maxDebtRatioPercent),
      maxOverdueCount: canonicalInteger(policy.maxOverdueCount, '최대 연체 건수'),
      validForSeconds: Number(policy.validForSeconds),
    })
  } catch (error) {
    formError.value = error?.message || '요청을 만들지 못했습니다.'
  }
}

async function showResult(request) {
  try {
    await mailbox.resolve(request.requestId)
  } catch {
    // The composable exposes the safe server message in the page alert.
  }
}

function displayStatus(request) {
  return ['REQUESTED', 'SUBMITTED', 'COMPLETED'].includes(request.status) &&
    isMidnightExpired(request.validUntil, now.value)
    ? 'EXPIRED'
    : request.status
}

function currentResolution(request) {
  const resolution = mailbox.resolutions.value[request.requestId]
  return (
    displayStatus(request) === 'COMPLETED' &&
    resolution &&
    !isMidnightExpired(resolution.result.validUntil, now.value)
  )
}

function statusPresentation(status) {
  return {
    REQUESTED: { label: '응답 대기 · 아직 응답 없음', tone: 'waiting', icon: Clock3 },
    SUBMITTED: {
      label: '증명 제출됨 · 공개 결과 동기화 대기',
      tone: 'waiting',
      icon: Clock3,
    },
    COMPLETED: { label: '응답 완료', tone: 'success', icon: CheckCircle2 },
    DENIED: { label: '당사자가 요청 거절', tone: 'neutral', icon: XCircle },
    EXPIRED: { label: '기한 만료 · 적격 판정 아님', tone: 'warning', icon: Clock3 },
    FAILED: { label: '처리 실패 · 부적격 판정 아님', tone: 'danger', icon: TriangleAlert },
  }[status]
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

function receivableLabel(receivable) {
  if (isMidnightDemoEnabled) return `가상 기업 매출채권 #${receivable.receivableId}`
  return `DB #${receivable.receivableId} · 온체인 #${receivable.onchainReceivableId ?? '-'} · NFT #${receivable.tokenId ?? '-'}`
}
</script>

<template>
  <main class="proof-requests-page">
    <section class="page-hero" aria-labelledby="proof-requests-title">
      <div class="hero-icon"><ShieldCheck aria-hidden="true" :size="28" /></div>
      <div>
        <p class="eyebrow">검증 요청자</p>
        <h1 id="proof-requests-title">재무 검증 요청</h1>
        <p v-if="isMidnightDemoEnabled">
          확인할 기준을 보내고, 가상 재무값의 충족 여부를 받으세요.
        </p>
        <p v-else>확인할 기준을 보내세요. 당사자는 가상 재무값으로 응답합니다.</p>
      </div>
    </section>

    <nav class="workspace-tabs" aria-label="재무 검증 요청함">
      <RouterLink :to="{ name: 'midnight' }" aria-current="page">
        <Send aria-hidden="true" :size="18" /> 보낸 요청
      </RouterLink>
      <RouterLink v-if="isMidnightProofBridgeEnabled" :to="{ name: 'midnight-prove' }">
        <Inbox aria-hidden="true" :size="18" /> 받은 요청
      </RouterLink>
    </nav>

    <section class="panel" aria-labelledby="create-request-title">
      <div class="panel-heading">
        <div>
          <p class="step-label">새 요청</p>
          <h2 id="create-request-title">대상과 기준</h2>
        </div>
      </div>

      <p v-if="isContextLoading" class="notice" role="status">펀딩 가능한 채권을 확인 중입니다.</p>
      <p v-else-if="contextError" class="alert alert-danger" role="alert">{{ contextError }}</p>
      <p v-else-if="visibleReceivables.length === 0" class="notice">
        요청 가능한 토큰화 채권이 없습니다.
      </p>

      <form v-else class="request-form" @submit.prevent="submitRequest">
        <p v-if="formError" class="alert alert-danger full-field" role="alert">
          {{ formError }}
        </p>
        <div class="preset-row full-field">
          <div>
            <strong>기본 기준</strong>
            <span>연매출 5억 이상 · 부채비율 200% 이하 · 연체 1건 이하 · 24시간</span>
          </div>
          <button class="secondary-button" type="button" @click="applyDemoPreset">
            기본 기준 적용
          </button>
        </div>
        <label class="field full-field">
          <span>검증할 채권</span>
          <select v-model="selectedReceivableId" required>
            <option
              v-for="receivable in visibleReceivables"
              :key="receivable.receivableId"
              :value="String(receivable.receivableId)"
            >
              {{ receivableLabel(receivable) }}
            </option>
          </select>
        </label>

        <fieldset class="role-field full-field">
          <legend>검증할 당사자</legend>
          <label>
            <input
              v-model="selectedRoles.SELLER"
              type="checkbox"
              :disabled="Boolean(activeRequestFor('SELLER'))"
            />
            판매기업
          </label>
          <label>
            <input
              v-model="selectedRoles.BUYER"
              type="checkbox"
              :disabled="Boolean(activeRequestFor('BUYER'))"
            />
            구매기업
          </label>
          <small>둘 다 선택하면 요청을 1건씩 보냅니다.</small>
          <small v-if="activeRequestFor('SELLER')" class="active-request-help">
            판매기업 요청은 이미 {{ statusPresentation(activeRequestFor('SELLER').status).label }}
            상태입니다. 아래 요청을 확인하세요.
          </small>
          <small v-if="activeRequestFor('BUYER')" class="active-request-help">
            구매기업 요청은 이미 {{ statusPresentation(activeRequestFor('BUYER').status).label }}
            상태입니다. 아래 요청을 확인하세요.
          </small>
        </fieldset>

        <label class="field">
          <span>최소 연매출</span>
          <div class="input-suffix">
            <input v-model="policy.minAnnualRevenueKrw" inputmode="numeric" required /><span
              >KRW</span
            >
          </div>
          <small>쉼표 없이 원 단위 정수로 입력하세요.</small>
        </label>
        <label class="field">
          <span>최대 부채비율</span>
          <div class="input-suffix">
            <input v-model="policy.maxDebtRatioPercent" inputmode="decimal" required /><span
              >%</span
            >
          </div>
          <small>소수 둘째 자리까지 입력할 수 있습니다.</small>
        </label>
        <label class="field">
          <span>최대 연체 횟수</span>
          <div class="input-suffix">
            <input v-model="policy.maxOverdueCount" inputmode="numeric" required /><span>건</span>
          </div>
          <small>0건부터 입력할 수 있습니다.</small>
        </label>
        <label class="field">
          <span>응답 유효시간</span>
          <select v-model.number="policy.validForSeconds">
            <option :value="3600">1시간</option>
            <option :value="86400">24시간</option>
          </select>
          <small>기한 내 증명 완료가 필요합니다.</small>
        </label>

        <div class="policy-explanation full-field">
          <Users aria-hidden="true" :size="20" />
          <p>
            세 조건의 <strong>전체 충족 여부</strong>만 확인합니다. 재무 원문·개별 미충족 항목은
            받지 않습니다.
          </p>
        </div>

        <button
          class="primary-button full-field"
          type="submit"
          :disabled="mailbox.isMutating.value || !demoReady"
        >
          <Send aria-hidden="true" :size="18" />
          {{
            !demoReady
              ? '데모 준비 중...'
              : mailbox.isMutating.value
                ? '요청 보내는 중...'
                : '검증 요청 보내기'
          }}
        </button>
      </form>
    </section>

    <section class="panel" aria-labelledby="outbox-title">
      <div class="panel-heading">
        <div>
          <p class="step-label">자동 상태 확인</p>
          <h2 id="outbox-title">보낸 요청</h2>
        </div>
        <button
          class="secondary-button"
          type="button"
          :disabled="mailbox.isRefreshing.value"
          @click="mailbox.refresh()"
        >
          <RefreshCw aria-hidden="true" :size="17" />
          {{ mailbox.isRefreshing.value ? '확인 중...' : '새로고침' }}
        </button>
      </div>

      <p v-if="!demoReady" class="notice" role="status">
        증명 환경이 준비되면 요청함을 자동으로 확인합니다.
      </p>
      <p v-else-if="mailbox.errorMessage.value" class="alert alert-danger" role="alert">
        {{ mailbox.errorMessage.value }}
      </p>
      <p v-if="mailbox.successMessage.value" class="alert alert-success" role="status">
        {{ mailbox.successMessage.value }}
      </p>
      <p v-if="mailbox.isLoading.value" class="notice" role="status">
        보낸 요청을 불러오는 중입니다.
      </p>
      <p v-else-if="mailbox.requests.value.length === 0" class="notice">
        아직 보낸 검증 요청이 없습니다.
      </p>

      <ol v-else class="request-list">
        <li v-for="request in mailbox.requests.value" :key="request.requestId" class="request-card">
          <header>
            <div>
              <p>DB 채권 #{{ request.receivableId }} · 온체인 #{{ request.onchainReceivableId }}</p>
              <h3>
                {{ displayCompanyName(request.subjectCompanyName) }} · {{ request.subjectRole }}
              </h3>
            </div>
            <span
              class="status-badge"
              :class="`status-${statusPresentation(displayStatus(request)).tone}`"
            >
              <component
                :is="statusPresentation(displayStatus(request)).icon"
                aria-hidden="true"
                :size="16"
              />
              {{ statusPresentation(displayStatus(request)).label }}
            </span>
          </header>
          <dl class="criteria-grid">
            <div>
              <dt>최소 연매출</dt>
              <dd>{{ formatKrw(request.minAnnualRevenueKrw) }}</dd>
            </div>
            <div>
              <dt>최대 부채비율</dt>
              <dd>{{ formatBps(request.maxDebtRatioBps) }}</dd>
            </div>
            <div>
              <dt>최대 연체</dt>
              <dd>{{ request.maxOverdueCount }}건</dd>
            </div>
            <div>
              <dt>응답 기한</dt>
              <dd>{{ formatEpoch(request.validUntil) }}</dd>
            </div>
          </dl>
          <p v-if="displayStatus(request) === 'REQUESTED'" class="state-help">
            응답 대기 중입니다. 미응답은 미충족 판정이 아닙니다.
          </p>
          <p v-else-if="displayStatus(request) === 'SUBMITTED'" class="state-help">
            증명이 제출되었습니다. 조회가 늦어지면 재증명 없이 결과만 다시 확인하세요.
          </p>
          <p v-else-if="displayStatus(request) === 'DENIED'" class="state-help">
            당사자가 거절했습니다. 기준 충족 여부는 판정되지 않았습니다.
          </p>
          <p v-else-if="displayStatus(request) === 'EXPIRED'" class="state-help">
            유효기한이 지났습니다. 필요한 경우 새로 요청하세요.
          </p>
          <button
            v-if="displayStatus(request) === 'SUBMITTED' || displayStatus(request) === 'COMPLETED'"
            class="primary-button compact"
            type="button"
            :disabled="mailbox.isMutating.value"
            @click="showResult(request)"
          >
            {{ displayStatus(request) === 'SUBMITTED' ? '결과 확인' : '결과 다시 확인' }}
          </button>

          <article
            v-if="currentResolution(request)"
            class="resolution-card"
            :class="
              mailbox.resolutions.value[request.requestId].result.eligible
                ? 'eligible'
                : 'ineligible'
            "
            aria-live="polite"
          >
            <h4>
              {{
                mailbox.resolutions.value[request.requestId].result.eligible
                  ? '요청 기준 충족'
                  : '요청 기준 미충족'
              }}
            </h4>
            <p>위 세 기준을 함께 평가한 실제 ZK 증명 결과입니다.</p>
            <dl>
              <div>
                <dt>요청자</dt>
                <dd>{{ displayCompanyName(request.requesterCompanyName) }}</dd>
              </div>
              <div>
                <dt>검증 대상</dt>
                <dd>
                  {{ displayCompanyName(request.subjectCompanyName) }} · {{ request.subjectRole }}
                </dd>
              </div>
              <div>
                <dt>가상 확인 기관</dt>
                <dd>
                  Provider {{ mailbox.resolutions.value[request.requestId].result.providerId }}
                </dd>
              </div>
              <div>
                <dt>가상 확인서 발급</dt>
                <dd>
                  {{ formatEpoch(mailbox.resolutions.value[request.requestId].result.profileAsOf) }}
                </dd>
              </div>
              <div>
                <dt>결과 유효기한</dt>
                <dd>
                  {{ formatEpoch(mailbox.resolutions.value[request.requestId].result.validUntil) }}
                </dd>
              </div>
            </dl>
            <p class="attestation-time-note">
              발급 시각은 가상 입력의 제출 시각입니다. 은행·회계 검증이나 펀딩 승인을 뜻하지
              않습니다.
            </p>
          </article>
        </li>
      </ol>
    </section>
  </main>
</template>

<style scoped>
.proof-requests-page {
  width: min(1180px, calc(100% - 40px));
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
.eyebrow,
.step-label {
  margin: 0 0 6px;
  color: var(--color-brand);
  font-weight: 800;
  font-size: 0.86rem;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}
h1,
h2,
h3,
h4,
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
.panel {
  margin-top: 22px;
  padding: 30px;
  border: 1px solid var(--color-border);
  border-radius: 20px;
  background: var(--color-surface);
  box-shadow: 0 14px 40px rgb(0 0 0 / 20%);
}
.panel-heading {
  display: flex;
  align-items: start;
  justify-content: space-between;
  gap: 18px;
  margin-bottom: 24px;
}
.panel-heading h2 {
  margin-bottom: 0;
  font-size: 1.45rem;
}
.request-form {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 22px;
}
.full-field {
  grid-column: 1 / -1;
}
.field {
  display: grid;
  gap: 8px;
  font-weight: 750;
}
.field small,
.role-field small {
  color: var(--color-text-muted);
  line-height: 1.5;
  font-weight: 500;
}
input,
select {
  width: 100%;
  min-height: 48px;
  padding: 0 14px;
  border: 1px solid var(--color-border-strong);
  border-radius: 10px;
  background: var(--color-surface);
  color: inherit;
  font: inherit;
}
input:focus-visible,
select:focus-visible,
button:focus-visible,
a:focus-visible {
  outline: 3px solid var(--color-focus);
  outline-offset: 2px;
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
  border: 0;
  border-radius: 0;
  outline: 0;
}
.input-suffix span {
  padding: 0 14px;
  color: var(--color-text-muted);
  font-weight: 700;
  white-space: nowrap;
}
.role-field {
  display: flex;
  flex-wrap: wrap;
  gap: 14px 22px;
  padding: 18px;
  border: 1px solid var(--color-border);
  border-radius: 12px;
}
.role-field legend {
  padding: 0 6px;
  font-weight: 800;
}
.role-field label {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-weight: 700;
}
.role-field input {
  width: 18px;
  min-height: 18px;
}
.role-field small {
  flex-basis: 100%;
}
.role-field .active-request-help {
  color: var(--color-warning);
  font-weight: 650;
}
.policy-explanation {
  display: flex;
  gap: 12px;
  padding: 16px;
  border-left: 4px solid var(--color-warning-border);
  background: var(--color-warning-soft);
  color: var(--color-warning);
}
.preset-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 14px 16px;
  border: 1px solid var(--color-brand-border);
  border-radius: 11px;
  background: var(--color-brand-soft);
}
.preset-row div {
  display: grid;
  gap: 4px;
}
.preset-row span {
  color: var(--color-text-muted);
  font-size: 0.9rem;
}
.policy-explanation p {
  margin: 0;
  line-height: 1.65;
}
.primary-button,
.secondary-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  min-height: 46px;
  padding: 0 18px;
  border-radius: 11px;
  font: inherit;
  font-weight: 800;
  cursor: pointer;
}
.primary-button {
  border: 1px solid var(--color-brand-border);
  color: var(--color-on-action);
  background: var(--color-action);
}
.primary-button.compact {
  width: auto;
  min-height: 42px;
  margin-top: 15px;
}
.secondary-button {
  border: 1px solid var(--color-border-strong);
  color: var(--color-text);
  background: var(--color-surface);
}
button:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}
.notice,
.alert {
  padding: 16px;
  border-radius: 11px;
  line-height: 1.6;
}
.notice {
  color: var(--color-text-muted);
  background: var(--color-surface-subtle);
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
.request-list {
  display: grid;
  gap: 16px;
  margin: 0;
  padding: 0;
  list-style: none;
}
.request-card {
  padding: 22px;
  border: 1px solid var(--color-border);
  border-radius: 15px;
}
.request-card header {
  display: flex;
  align-items: start;
  justify-content: space-between;
  gap: 16px;
}
.request-card header p {
  margin-bottom: 5px;
  color: var(--color-text-muted);
  font-size: 0.9rem;
}
.request-card h3 {
  margin-bottom: 0;
}
.status-badge {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 7px 10px;
  border-radius: 999px;
  font-size: 0.84rem;
  font-weight: 800;
}
.status-waiting {
  color: var(--color-warning);
  background: var(--color-warning-soft);
}
.status-success {
  color: var(--color-success);
  background: var(--color-success-soft);
}
.status-neutral {
  color: var(--color-text-muted);
  background: var(--color-surface-subtle);
}
.status-warning {
  color: var(--color-warning);
  background: var(--color-warning-soft);
}
.status-danger {
  color: var(--color-danger);
  background: var(--color-danger-soft);
}
.criteria-grid,
.resolution-card dl {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;
  margin: 18px 0 0;
}
.criteria-grid div,
.resolution-card dl div {
  padding: 12px;
  border-radius: 10px;
  background: var(--color-surface-subtle);
}
dt {
  color: var(--color-text-muted);
  font-size: 0.82rem;
  font-weight: 700;
}
dd {
  margin: 5px 0 0;
  font-weight: 800;
  overflow-wrap: anywhere;
}
.state-help {
  margin: 15px 0 0;
  color: var(--color-text-muted);
  line-height: 1.55;
}
.resolution-card {
  margin-top: 18px;
  padding: 20px;
  border: 1px solid;
  border-radius: 13px;
}
.resolution-card.eligible {
  border-color: var(--color-brand-border);
  background: var(--color-brand-soft);
}
.resolution-card.ineligible {
  border-color: var(--color-warning-border);
  background: var(--color-warning-soft);
}
.resolution-card h4 {
  margin-bottom: 7px;
  font-size: 1.3rem;
}
.resolution-card p {
  margin-bottom: 0;
  line-height: 1.6;
  color: var(--color-text-muted);
}
.resolution-card .attestation-time-note {
  margin-top: 12px;
  font-size: 0.9rem;
}
@media (max-width: 760px) {
  .proof-requests-page {
    width: min(100% - 24px, 1180px);
    padding-top: 28px;
  }
  .page-hero {
    align-items: flex-start;
    padding: 22px;
  }
  .hero-icon {
    width: 46px;
    height: 46px;
  }
  .panel {
    padding: 20px;
  }
  .request-form {
    grid-template-columns: 1fr;
  }
  .full-field {
    grid-column: auto;
  }
  .panel-heading,
  .request-card header,
  .preset-row {
    align-items: stretch;
    flex-direction: column;
  }
  .criteria-grid,
  .resolution-card dl {
    grid-template-columns: 1fr 1fr;
  }
  .workspace-tabs a {
    flex: 1;
    justify-content: center;
  }
}
@media (max-width: 480px) {
  .page-hero {
    flex-direction: column;
  }
  .criteria-grid,
  .resolution-card dl {
    grid-template-columns: 1fr;
  }
}
</style>
