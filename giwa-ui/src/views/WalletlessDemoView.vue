<script setup>
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import {
  ShieldCheck,
  LockKeyhole,
  LoaderCircle,
  ArrowRight,
  CircleCheck,
  CircleAlert,
} from '@lucide/vue'
import { useAuthStore } from '../stores/auth'
import { captureAuthSession } from '../services/authSession'
import { demoRunRequest, loadWalletlessConfig } from '../services/midnight/walletlessDemo'

const auth = useAuthStore()
const session = captureAuthSession()
const config = ref(null)
const run = ref(null)
const role = ref(auth.user?.email?.startsWith('buyer@') ? 'BUYER' : 'SELLER')
const profileId = ref('steady')
const consent = ref(false)
const busy = ref(false)
const initializing = ref(true)
const recoveryChecked = ref(false)
const error = ref('')
const attempted = ref(null)
const canRetrySame = ref(false)
const now = ref(Date.now())
const controller = new AbortController()
let mounted = true
let timer
let clock
const options = () => ({ session, signal: controller.signal, config: config.value })
const active = computed(
  () => attempted.value && !['completed', 'failed', 'expired'].includes(run.value?.status),
)
const expired = computed(() => run.value && Number(run.value.validUntil) * 1000 <= now.value)
const ready = computed(
  () => config.value?.walletlessDemo?.enabled && config.value?.runtime?.status === 'ready',
)
const canStart = computed(
  () =>
    ready.value &&
    profiles.value.some((profile) => profile.id === profileId.value) &&
    consent.value &&
    !busy.value &&
    !initializing.value &&
    recoveryChecked.value &&
    !attempted.value,
)
const profiles = computed(() => config.value?.profiles ?? [])
const selectedProfile = computed(() =>
  profiles.value.find((item) => item.id === (run.value?.profileId ?? profileId.value)),
)
const stateText = computed(() => {
  if (expired.value || run.value?.status === 'expired') return '유효기간 만료'
  return (
    {
      preparing: '가상 기관 확인 중',
      proving: '실제 ZK 증명 생성 중',
      submitted: '체인 제출 완료 · 공개 결과 확인 중',
      completed: '공개 결과 검증 완료',
      failed: '증명 처리 실패',
      uncertain: '기존 제출 상태 확인 필요',
    }[run.value?.status] ?? '증명 준비'
  )
})
watch([role, profileId], () => {
  consent.value = false
})

function schedulePoll() {
  clearTimeout(timer)
  if (mounted && run.value && ['preparing', 'proving', 'submitted'].includes(run.value.status)) {
    timer = setTimeout(() => {
      void refreshRun()
    }, 3000)
  }
}
function accept(value) {
  if (!mounted) return
  run.value = value
  recoveryChecked.value = true
  role.value = value.subjectRole
  profileId.value = value.profileId
  attempted.value = {
    clientRequestId: value.clientRequestId,
    profileId: value.profileId,
    subjectRole: value.subjectRole,
  }
  canRetrySame.value = false
  schedulePoll()
}
function safeError(cause) {
  if (cause?.code === 'AUTH_SESSION_CHANGED' || !mounted) return
  if (cause?.status === 401 || cause?.status === 403)
    error.value = '데모 세션이 만료되었거나 접근할 수 없습니다. 나간 뒤 다시 로그인해 주세요.'
  else if (cause?.code === 'PROOF_SESSION_BUSY')
    error.value = '다른 증명이 진행 중입니다. 잠시 후 같은 요청으로 다시 확인해 주세요.'
  else error.value = cause?.message ?? '서버 응답을 확인하지 못했습니다. 기존 요청을 확인해 주세요.'
}
async function initialize() {
  initializing.value = true
  error.value = ''
  try {
    config.value = await loadWalletlessConfig({ session, signal: controller.signal })
    try {
      accept(await demoRunRequest('recover', {}, options()))
    } catch (cause) {
      if (cause.code !== 'DEMO_RUN_NOT_FOUND') throw cause
      recoveryChecked.value = true
    }
  } catch (cause) {
    safeError(cause)
  } finally {
    if (mounted) initializing.value = false
  }
}
async function start() {
  if ((!canStart.value && !canRetrySame.value) || busy.value) return
  const attempt = attempted.value ?? {
    clientRequestId: crypto.randomUUID(),
    profileId: profileId.value,
    subjectRole: role.value,
  }
  attempted.value = attempt
  busy.value = true
  canRetrySame.value = false
  error.value = ''
  try {
    accept(
      await demoRunRequest(
        'start',
        { ...attempt, consent: true },
        { ...options(), expected: attempt },
      ),
    )
  } catch (cause) {
    safeError(cause)
  } finally {
    if (mounted) busy.value = false
  }
}
async function refreshRun() {
  if (busy.value || !mounted) return
  busy.value = true
  error.value = ''
  try {
    const operation = run.value ? 'status' : 'recover'
    const body = run.value
      ? { runId: run.value.runId }
      : attempted.value
        ? { clientRequestId: attempted.value.clientRequestId }
        : {}
    accept(
      await demoRunRequest(operation, body, {
        ...options(),
        expected: run.value ?? attempted.value,
      }),
    )
  } catch (cause) {
    if (cause.code === 'DEMO_RUN_NOT_FOUND' && attempted.value && !run.value) {
      canRetrySame.value = true
      error.value = '서버에 접수된 기록이 없습니다. 동일한 요청 번호로 다시 접수할 수 있습니다.'
    } else safeError(cause)
  } finally {
    if (mounted) busy.value = false
  }
}
function newExample() {
  if (active.value || busy.value) return
  clearTimeout(timer)
  run.value = null
  attempted.value = null
  consent.value = false
  error.value = ''
  canRetrySame.value = false
}
function time(value) {
  return new Date(Number(value) * 1000).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })
}
onMounted(() => {
  void initialize()
  clock = setInterval(() => {
    now.value = Date.now()
  }, 1000)
})
onUnmounted(() => {
  mounted = false
  clearTimeout(timer)
  clearInterval(clock)
  controller.abort()
})
</script>

<template>
  <main class="demo-page">
    <header class="demo-heading">
      <p class="eyebrow">MIDPROOF · INTERACTIVE DEMO</p>
      <h1>재무정보를 공개하지 않고,<br />기준 충족을 증명하세요.</h1>
      <p>
        미리 준비된 가상 기업 시나리오를 선택하고, 실제 Midnight ZK 증명과 체인에 기록된 결과를
        확인하세요.
      </p>
      <span class="network-badge">{{
        config?.networkId === 'undeployed'
          ? '로컬 Midnight 네트워크'
          : config?.networkId === 'preview'
            ? 'Midnight Preview'
            : '네트워크 확인 중'
      }}</span>
    </header>

    <div class="demo-grid">
      <section class="demo-panel" aria-labelledby="demo-select-title">
        <p class="step">01 · 가상 사례 선택</p>
        <h2 id="demo-select-title">어떤 기업을 검증할까요?</h2>
        <fieldset :disabled="Boolean(attempted) || initializing || busy">
          <legend>기업의 역할</legend>
          <div class="role-options">
            <label><input v-model="role" type="radio" value="SELLER" /> 판매기업 · Seller</label>
            <label><input v-model="role" type="radio" value="BUYER" /> 구매기업 · Buyer</label>
          </div>
          <legend>가상 재무 시나리오</legend>
          <label
            v-for="profile in profiles"
            :key="profile.id"
            class="profile-option"
            :class="{ selected: profileId === profile.id }"
          >
            <input v-model="profileId" type="radio" :value="profile.id" />
            <span
              ><strong>{{ profile.label }}</strong
              ><small>{{ profile.summary }}</small></span
            >
          </label>
        </fieldset>
        <div class="criteria">
          <h3>공개 검증 기준</h3>
          <dl>
            <div>
              <dt>연 매출</dt>
              <dd>5억 원 이상</dd>
            </div>
            <div>
              <dt>부채비율</dt>
              <dd>200% 이하</dd>
            </div>
            <div>
              <dt>연체 횟수</dt>
              <dd>1회 이하</dd>
            </div>
          </dl>
          <p>세 기준을 모두 충족하는지만 공개됩니다.</p>
        </div>
        <label class="consent">
          <input
            v-model="consent"
            type="checkbox"
            :disabled="Boolean(attempted) || busy || initializing"
          />
          <span
            >선택한 가상 기업 시나리오와 공개 기준을 확인했으며, 운영 서버가 합성 재무값으로
            Midnight 증명을 생성·제출하는 데 동의합니다.</span
          >
        </label>
        <button
          v-if="!attempted"
          class="primary"
          type="button"
          :disabled="!canStart"
          @click="start"
        >
          <ShieldCheck :size="19" />동의하고 실제 증명 생성<ArrowRight :size="17" />
        </button>
        <button
          v-else-if="canRetrySame"
          class="primary"
          type="button"
          :disabled="busy"
          @click="start"
        >
          같은 요청으로 다시 접수
        </button>
        <p v-if="initializing" class="hint">데모 설정과 이전 요청을 확인하고 있습니다.</p>
        <p v-else-if="!ready && !attempted" class="hint">
          {{
            config?.walletlessDemo?.enabled
              ? '증명 서버를 준비하고 있습니다.'
              : '이 실행 환경의 데모를 준비하고 있습니다.'
          }}
          <button type="button" class="text-action" @click="initialize">다시 확인</button>
        </p>
      </section>

      <section
        class="demo-panel result-panel"
        aria-labelledby="demo-result-title"
        aria-live="polite"
      >
        <p class="step">02 · 증명과 검증</p>
        <h2 id="demo-result-title">{{ attempted ? stateText : '원문 대신, 확인된 결과' }}</h2>
        <div v-if="!attempted" class="result-empty">
          <LockKeyhole :size="44" />
          <p>동의 후 가상 기관 확인 → ZK 증명 생성 → 체인 검증이 진행됩니다.</p>
          <small>지갑 확장 프로그램이나 사용자 서명이 필요하지 않습니다.</small>
        </div>
        <div v-else>
          <div
            v-if="run?.status === 'completed' && !expired"
            class="verified-result"
            :class="{ unmet: !run.result.eligible }"
          >
            <CircleCheck :size="34" /><strong>{{
              run.result.eligible ? '요청한 기준 충족' : '요청한 기준 미충족'
            }}</strong>
            <p>Midnight 공개 상태를 독립 조회해 확인했습니다.</p>
          </div>
          <div v-else class="progress-result">
            <LoaderCircle
              v-if="['preparing', 'proving', 'submitted'].includes(run?.status)"
              class="spinner"
              :size="30"
            /><CircleAlert v-else :size="30" />
            <p>
              {{
                run?.status === 'failed'
                  ? '증명을 완료하지 못했습니다. 기준 미충족 결과와 다릅니다.'
                  : expired
                    ? '유효기간이 지나 현재 기준 충족 결과로 사용할 수 없습니다.'
                    : '증명은 수 분 걸릴 수 있습니다. 이 요청의 상태만 다시 확인합니다.'
              }}
            </p>
          </div>
          <dl v-if="run" class="context">
            <div>
              <dt>가상 기업</dt>
              <dd>{{ selectedProfile?.label ?? run.profileId }}</dd>
            </div>
            <div>
              <dt>시나리오 역할</dt>
              <dd>{{ run.subjectRole === 'SELLER' ? '판매기업 · Seller' : '구매기업 · Buyer' }}</dd>
            </div>
            <div>
              <dt>기준</dt>
              <dd>매출 ≥ 5억 원 · 부채비율 ≤ 200% · 연체 ≤ 1회</dd>
            </div>
            <div>
              <dt>유효기간 (한국)</dt>
              <dd>{{ time(run.validUntil) }}</dd>
            </div>
            <div>
              <dt>가상 기관</dt>
              <dd>{{ config?.provider?.name ?? '가상 Attestation 기관' }} · Provider 2</dd>
            </div>
            <div v-if="run.result">
              <dt>가상 자료 기준 시각</dt>
              <dd>{{ time(run.result.profileAsOf) }}</dd>
            </div>
          </dl>
          <details v-if="run" class="evidence">
            <summary>Midnight 체인 기록과 요청</summary>
            <dl class="context">
              <div>
                <dt>요청</dt>
                <dd>{{ run.requestId }}</dd>
              </div>
              <div>
                <dt>Midnight 네트워크</dt>
                <dd>{{ run.networkId }}</dd>
              </div>
              <div>
                <dt>Midnight 계약</dt>
                <dd>{{ run.midnightContractAddress }}</dd>
              </div>
              <div v-if="run.transactionId">
                <dt>실제 Midnight 트랜잭션</dt>
                <dd>{{ run.transactionId }}</dd>
              </div>
              <div v-if="run.blockHeight">
                <dt>블록</dt>
                <dd>{{ run.blockHeight }}</dd>
              </div>
            </dl>
          </details>
          <div class="result-actions">
            <button type="button" class="secondary" :disabled="busy" @click="refreshRun">
              {{ busy ? '확인 중…' : '기존 요청 상태 확인' }}</button
            ><button
              v-if="!active"
              type="button"
              class="secondary"
              :disabled="busy"
              @click="newExample"
            >
              다른 사례 체험
            </button>
          </div>
        </div>
        <div v-if="error" class="demo-error" role="alert">
          {{ error
          }}<button v-if="!attempted" class="text-action" type="button" @click="initialize">
            다시 확인
          </button>
        </div>
      </section>
    </div>
    <aside class="demo-disclosure">
      <LockKeyhole :size="20" />
      <p>
        모든 기업과 재무자료, 확인 기관은 가상입니다. 운영 서버와 증명 서버는 합성 재무값을 처리하고
        Midnight 네트워크에 증명을 제출합니다. 결과는 은행 검증, 실제 기업의 신용평가 또는 펀딩
        승인이 아닙니다. 재무 원문·서명·비밀값은 공개 결과에 포함되지 않습니다.
      </p>
    </aside>
  </main>
</template>

<style scoped>
.demo-page {
  max-width: 1120px;
  margin: 0 auto;
  padding: 48px 24px 64px;
}
.demo-heading {
  margin-bottom: 32px;
}
.eyebrow,
.step {
  color: var(--color-brand);
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.12em;
}
.demo-heading h1 {
  font-size: clamp(28px, 4vw, 42px);
  line-height: 1.35;
  letter-spacing: -0.04em;
  margin: 16px 0;
}
.demo-heading > p:not(.eyebrow) {
  color: var(--color-text-muted);
  line-height: 1.7;
}
.network-badge {
  display: inline-block;
  color: var(--color-brand);
  background: var(--color-brand-soft);
  border: 1px solid var(--color-brand-border);
  padding: 6px 10px;
  border-radius: 6px;
  font-size: 12px;
}
.demo-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 24px;
}
.demo-panel {
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: 18px;
  padding: 28px;
  min-width: 0;
}
.demo-panel h2 {
  font-size: 21px;
  margin: 12px 0 26px;
  letter-spacing: -0.025em;
}
fieldset {
  border: 0;
  padding: 0;
  margin: 0;
  min-width: 0;
}
legend {
  font-size: 13px;
  color: var(--color-text-muted);
  margin-bottom: 10px;
}
.role-options {
  display: flex;
  flex-wrap: wrap;
  gap: 18px;
  margin-bottom: 24px;
  font-size: 14px;
}
.role-options label {
  display: flex;
  gap: 6px;
  align-items: center;
}
input {
  accent-color: var(--color-brand);
}
.profile-option {
  display: flex;
  gap: 12px;
  align-items: flex-start;
  border: 1px solid var(--color-border);
  border-radius: 10px;
  padding: 15px;
  margin-bottom: 10px;
  cursor: pointer;
}
.profile-option.selected {
  border-color: var(--color-brand);
  background: var(--color-brand-soft);
}
.profile-option strong {
  font-size: 14px;
}
.profile-option small {
  display: block;
  color: var(--color-text-muted);
  line-height: 1.6;
  margin-top: 6px;
}
.criteria {
  margin: 24px 0;
  padding: 20px;
  background: var(--color-canvas);
  border-radius: 10px;
}
.criteria h3 {
  font-size: 14px;
  margin: 0 0 14px;
}
dl {
  margin: 0;
}
dl > div {
  display: flex;
  gap: 16px;
  justify-content: space-between;
  margin: 10px 0;
  font-size: 13px;
}
dt {
  color: var(--color-text-muted);
}
dd {
  margin: 0;
  text-align: right;
}
.criteria p {
  color: var(--color-text-muted);
  font-size: 12px;
  margin: 16px 0 0;
}
.consent {
  display: flex;
  gap: 10px;
  font-size: 13px;
  line-height: 1.7;
  margin: 24px 0;
}
.consent input {
  flex-shrink: 0;
  margin-top: 5px;
  align-self: flex-start;
}
button {
  font: inherit;
  cursor: pointer;
}
button:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}
button:focus-visible,
input:focus-visible,
summary:focus-visible {
  outline: 3px solid var(--color-focus);
  outline-offset: 3px;
}
.primary {
  width: 100%;
  padding: 14px;
  border: 0;
  border-radius: 10px;
  background: var(--color-action);
  color: var(--color-on-action);
  display: flex;
  gap: 10px;
  align-items: center;
  justify-content: center;
  font-size: 14px;
  font-weight: 600;
}
.hint {
  color: var(--color-text-muted);
  font-size: 13px;
  line-height: 1.7;
}
.text-action {
  border: 0;
  background: none;
  color: var(--color-brand);
  padding: 4px;
  text-decoration: underline;
  font-size: 13px;
}
.result-empty {
  min-height: 300px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  color: var(--color-text-muted);
  gap: 16px;
  line-height: 1.8;
}
.result-empty svg {
  color: var(--color-brand);
}
.result-empty p {
  max-width: 280px;
  margin: 0;
}
.result-empty small {
  font-size: 12px;
}
.verified-result {
  padding: 22px 18px;
  text-align: center;
  background: var(--color-brand-soft);
  border-radius: 12px;
  color: var(--color-brand);
}
.verified-result strong {
  display: block;
  font-size: 25px;
  margin-top: 10px;
}
.verified-result p {
  font-size: 12px;
  margin-bottom: 0;
  color: var(--color-text-muted);
}
.verified-result.unmet {
  color: var(--color-warning);
  background: var(--color-warning-soft);
}
.progress-result {
  display: flex;
  gap: 16px;
  align-items: center;
  line-height: 1.7;
  font-size: 14px;
  color: var(--color-text-muted);
  padding: 12px 0;
}
.progress-result svg {
  flex-shrink: 0;
  color: var(--color-brand);
}
.context {
  margin-top: 24px;
}
.context > div {
  flex-direction: column;
  gap: 7px;
  margin: 16px 0;
}
.context dd {
  text-align: left;
  line-height: 1.6;
  overflow-wrap: anywhere;
}
.evidence {
  border-top: 1px solid var(--color-border);
  margin-top: 24px;
  padding-top: 18px;
}
.evidence summary {
  cursor: pointer;
  font-size: 13px;
  color: var(--color-text-muted);
}
.result-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-top: 24px;
}
.secondary {
  border: 1px solid var(--color-border);
  padding: 11px 14px;
  border-radius: 8px;
  color: var(--color-text);
  background: var(--color-surface);
  font-size: 13px;
}
.demo-error {
  margin-top: 20px;
  color: var(--color-danger);
  background: var(--color-danger-soft);
  border-radius: 8px;
  padding: 14px;
  font-size: 13px;
  line-height: 1.7;
}
.demo-disclosure {
  margin-top: 24px;
  display: flex;
  gap: 12px;
  color: var(--color-text-muted);
  font-size: 12px;
  line-height: 1.9;
}
.demo-disclosure svg {
  flex-shrink: 0;
  margin-top: 12px;
}
.spinner {
  animation: spin 1.5s linear infinite;
}
@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
@media (max-width: 800px) {
  .demo-grid {
    grid-template-columns: 1fr;
  }
  .demo-page {
    padding: 32px 16px;
  }
  .demo-panel {
    padding: 22px;
  }
}
@media (prefers-reduced-motion: reduce) {
  .spinner {
    animation: none;
  }
}
</style>
