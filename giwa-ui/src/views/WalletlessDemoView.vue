<script setup>
import { computed, nextTick, onMounted, onUnmounted, reactive, ref, watch } from 'vue'
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

import {
  DEMO_POLICY_PRESETS,
  demoPolicyFromInputs,
  demoPolicyToInputs,
  demoPolicySummary,
} from '../services/midnight/demoPolicy'

const auth = useAuthStore()
const session = captureAuthSession()
const config = ref(null)
const run = ref(null)
const role = ref(auth.user?.email?.startsWith('buyer@') ? 'BUYER' : 'SELLER')
const profileId = ref('steady')
const consent = ref(false)
const policyInputs = reactive({ ...DEMO_POLICY_PRESETS[1] })
const resultPanel = ref(null)
const revenueInput = ref(null)
const policy = computed(() => {
  try {
    return { value: demoPolicyFromInputs(policyInputs), error: '' }
  } catch (cause) {
    return { value: null, error: cause.message }
  }
})
const displayedPolicy = computed(() => run.value ?? attempted.value ?? policy.value.value)
const policySummary = computed(() =>
  displayedPolicy.value ? demoPolicySummary(displayedPolicy.value) : '',
)
function presetSelected(preset) {
  return ['revenue', 'debt', 'overdue'].every((key) => policyInputs[key] === preset[key])
}
function selectPreset(preset) {
  Object.assign(policyInputs, preset)
}
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
  () =>
    config.value?.walletlessDemo?.enabled &&
    config.value?.walletlessDemo?.customCriteriaEnabled === true &&
    config.value?.runtime?.status === 'ready',
)
const canStart = computed(
  () =>
    ready.value &&
    profiles.value.some((profile) => profile.id === profileId.value) &&
    policy.value.value &&
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
      preparing: '자료 확인 중',
      proving: '비공개 검증 중',
      submitted: '결과 확인 중',
      completed: '검증 완료',
      failed: '증명 처리 실패',
      uncertain: '진행 상태 확인 필요',
    }[run.value?.status] ?? '증명 준비'
  )
})
watch(
  [
    role,
    profileId,
    () => policyInputs.revenue,
    () => policyInputs.debt,
    () => policyInputs.overdue,
  ],
  () => {
    consent.value = false
  },
)

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
  Object.assign(policyInputs, demoPolicyToInputs(value))
  attempted.value = {
    clientRequestId: value.clientRequestId,
    profileId: value.profileId,
    subjectRole: value.subjectRole,
    minAnnualRevenueKrw: value.minAnnualRevenueKrw,
    maxDebtRatioBps: value.maxDebtRatioBps,
    maxOverdueCount: value.maxOverdueCount,
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
  busy.value = true
  const attempt = attempted.value ?? {
    clientRequestId: crypto.randomUUID(),
    profileId: profileId.value,
    subjectRole: role.value,
    ...policy.value.value,
  }
  attempted.value = attempt
  await nextTick()
  resultPanel.value?.focus({ preventScroll: false })
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
async function newExample() {
  if (active.value || busy.value) return
  clearTimeout(timer)
  run.value = null
  attempted.value = null
  consent.value = false
  error.value = ''
  canRetrySame.value = false
  await nextTick()
  revenueInput.value?.focus()
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
      <h1>숫자는 비공개. 결과만 확인.</h1>
      <p>기업을 고르고, 원하는 기준으로 검증해 보세요.</p>
    </header>

    <div class="demo-grid">
      <section class="demo-panel" aria-label="검증 설정">
        <fieldset :disabled="Boolean(attempted) || initializing || busy">
          <legend class="section-title"><span class="step">1</span> 기업 선택</legend>
          <div class="profile-options">
            <label
              v-for="profile in profiles"
              :key="profile.id"
              class="profile-option"
              :class="{ selected: profileId === profile.id }"
            >
              <input v-model="profileId" name="company" type="radio" :value="profile.id" />
              <strong>{{ profile.label }}</strong>
            </label>
          </div>
          <div class="role-options" role="group" aria-label="기업 역할">
            <label><input v-model="role" name="role" type="radio" value="SELLER" /> 판매기업</label>
            <label><input v-model="role" name="role" type="radio" value="BUYER" /> 구매기업</label>
          </div>
        </fieldset>

        <fieldset class="criteria" :disabled="Boolean(attempted) || initializing || busy">
          <legend class="section-title"><span class="step">2</span> 검증 기준 설정</legend>
          <div class="presets" role="group" aria-label="기준 빠른 선택">
            <button
              v-for="preset in DEMO_POLICY_PRESETS"
              :key="preset.label"
              type="button"
              :aria-pressed="presetSelected(preset)"
              @click="selectPreset(preset)"
            >
              {{ preset.label }}
            </button>
          </div>
          <div class="criteria-fields">
            <label for="revenue">최소 연매출</label>
            <div class="input-unit">
              <input
                id="revenue"
                ref="revenueInput"
                v-model="policyInputs.revenue"
                inputmode="decimal"
                maxlength="30"
                :aria-invalid="!!policy.error"
                aria-describedby="criteria-help"
              /><span>억 원 이상</span>
            </div>
            <label for="debt">최대 부채비율</label>
            <div class="input-unit">
              <input
                id="debt"
                v-model="policyInputs.debt"
                inputmode="decimal"
                maxlength="20"
                :aria-invalid="!!policy.error"
                aria-describedby="criteria-help"
              /><span>% 이하</span>
            </div>
            <label for="overdue">최대 연체 횟수</label>
            <div class="input-unit">
              <input
                id="overdue"
                v-model="policyInputs.overdue"
                inputmode="numeric"
                maxlength="5"
                :aria-invalid="!!policy.error"
                aria-describedby="criteria-help"
              /><span>회 이하</span>
            </div>
          </div>
          <p id="criteria-help" class="hint" :class="{ invalid: policy.error }">
            {{ policy.error || '세 기준을 모두 충족하는지 확인합니다.' }}
          </p>
        </fieldset>

        <template v-if="!attempted">
          <label class="consent">
            <input v-model="consent" type="checkbox" :disabled="busy || initializing" />
            <span>가상 재무자료를 서버에서 처리해 검증하는 데 동의합니다.</span>
          </label>
          <button class="primary" type="button" :disabled="!canStart" @click="start">
            <ShieldCheck :size="19" />검증 시작<ArrowRight :size="17" />
          </button>
        </template>
        <p v-if="initializing" class="hint">데모 준비 중…</p>
        <p v-else-if="!ready && !attempted" class="hint">
          데모를 준비하고 있습니다.
          <button type="button" class="text-action" @click="initialize">다시 확인</button>
        </p>
        <p v-else-if="attempted" class="hint">
          {{
            active
              ? '검증 중에는 선택한 기준을 유지합니다.'
              : '다른 기준으로 다시 검증할 수 있습니다.'
          }}
        </p>
      </section>

      <section
        ref="resultPanel"
        class="demo-panel result-panel"
        tabindex="-1"
        aria-labelledby="demo-result-title"
        aria-live="polite"
      >
        <h2 id="demo-result-title" class="section-title"><span class="step">3</span> 검증 결과</h2>
        <div v-if="!attempted" class="result-empty">
          <div class="privacy-icon"><LockKeyhole :size="34" /></div>
          <h3>이 기업은 기준을 충족할까요?</h3>
          <p>재무 원문 없이, 충족 여부만 보여드립니다.</p>
        </div>
        <template v-else>
          <div
            v-if="run?.status === 'completed' && !expired"
            class="verified-result"
            :class="{ unmet: !run.result.eligible }"
          >
            <CircleCheck v-if="run.result.eligible" :size="44" /><CircleAlert v-else :size="44" />
            <h3>{{ run.result.eligible ? '기준 충족' : '기준 미충족' }}</h3>
            <p>
              {{
                run.result.eligible
                  ? '선택한 세 기준을 모두 충족합니다.'
                  : '선택한 기준 중 충족하지 못한 항목이 있습니다.'
              }}
            </p>
            <span class="verified-badge"><ShieldCheck :size="14" />Midnight 검증 완료</span>
          </div>
          <div v-else class="progress-result">
            <LoaderCircle
              v-if="active && !error && !expired && run?.status !== 'uncertain'"
              class="spinner"
              :size="36"
            />
            <CircleAlert v-else :size="36" />
            <h3>{{ stateText }}</h3>
            <p>
              {{
                run?.status === 'failed'
                  ? '검증을 완료하지 못했습니다. 다시 시도해 주세요.'
                  : expired || run?.status === 'expired'
                    ? '이 결과의 유효기간이 지났습니다.'
                    : run?.status === 'uncertain' || error
                      ? '아래 버튼으로 진행 상태를 확인해 주세요.'
                      : '잠시만 기다려 주세요. 보통 수 분 걸립니다.'
              }}
            </p>
          </div>
          <div class="result-context" v-if="displayedPolicy">
            <strong
              >{{ selectedProfile?.label ?? profileId }} ·
              {{ role === 'SELLER' ? '판매기업' : '구매기업' }}</strong
            >
            <p>{{ policySummary }}</p>
            <span><LockKeyhole :size="14" />재무 원문 비공개</span>
          </div>
          <div class="result-actions">
            <button
              v-if="canRetrySame"
              type="button"
              class="primary"
              :disabled="busy"
              @click="start"
            >
              같은 요청으로 다시 시도
            </button>
            <button
              v-else-if="!active"
              type="button"
              class="primary"
              :disabled="busy"
              @click="newExample"
            >
              기준 바꿔 다시 검증<ArrowRight :size="17" />
            </button>
            <button
              v-if="active"
              type="button"
              class="secondary"
              :disabled="busy"
              @click="refreshRun"
            >
              {{ busy ? '확인 중…' : '진행 상태 확인' }}
            </button>
          </div>
          <details v-if="run" class="evidence">
            <summary>검증 상세 보기</summary>
            <dl>
              <div>
                <dt>유효기간</dt>
                <dd>{{ time(run.validUntil) }}</dd>
              </div>
              <div>
                <dt>가상 확인기관</dt>
                <dd>{{ config?.provider?.name ?? '가상 데모 기관' }}</dd>
              </div>
              <div v-if="run.result">
                <dt>자료 기준 시각</dt>
                <dd>{{ time(run.result.profileAsOf) }}</dd>
              </div>
              <div>
                <dt>네트워크</dt>
                <dd>{{ run.networkId === 'preview' ? 'Midnight Preview' : '로컬 Midnight' }}</dd>
              </div>
              <div>
                <dt>요청</dt>
                <dd>{{ run.requestId }}</dd>
              </div>
              <div>
                <dt>계약</dt>
                <dd>{{ run.midnightContractAddress }}</dd>
              </div>
              <div v-if="run.transactionId">
                <dt>트랜잭션</dt>
                <dd>{{ run.transactionId }}</dd>
              </div>
              <div v-if="run.blockHeight">
                <dt>블록</dt>
                <dd>{{ run.blockHeight }}</dd>
              </div>
            </dl>
            <button
              v-if="!active"
              type="button"
              class="text-action"
              :disabled="busy"
              @click="refreshRun"
            >
              결과 다시 확인
            </button>
          </details>
        </template>
        <div v-if="error" class="demo-error" role="alert">
          {{ error }}
          <button v-if="!attempted" class="text-action" type="button" @click="initialize">
            다시 확인
          </button>
        </div>
      </section>
    </div>
    <footer class="demo-disclosure">
      <span>가상 데이터 · 실제 Midnight 증명</span>
      <details>
        <summary>데모 안내</summary>
        <p>
          기업·재무자료·확인기관은 가상입니다. 운영 서버와 증명 서버가 합성 재무값을 처리합니다.
          상대방의 결과 화면과 공개 원장에는 재무 원문을 전달하지 않습니다. 결과는 선택한 기준의
          충족 여부이며, 실제 신용평가나 금융 승인이 아닙니다.
        </p>
      </details>
    </footer>
  </main>
</template>

<style scoped>
.demo-page {
  max-width: 1040px;
  margin: 0 auto;
  padding: 16px 24px 36px;
}
.demo-heading {
  margin-bottom: 16px;
}
.demo-heading h1 {
  font-size: clamp(26px, 4vw, 34px);
  line-height: 1.3;
  letter-spacing: -0.045em;
  margin: 8px 0;
}
.demo-heading p {
  color: var(--color-text-muted);
  font-size: 15px;
  margin: 0;
}
.demo-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 20px;
  align-items: start;
}
.demo-panel {
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: 18px;
  padding: 22px;
  min-width: 0;
}
fieldset {
  border: 0;
  padding: 0;
  margin: 0;
  min-width: 0;
  width: 100%;
}
.section-title {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 16px;
  font-weight: 650;
  margin: 0 0 12px;
  padding: 0;
}
.step {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  background: var(--color-brand-soft);
  color: var(--color-brand);
  font-size: 12px;
}
.profile-options {
  display: flex;
  gap: 10px;
}
.profile-option {
  display: flex;
  gap: 9px;
  align-items: center;
  flex: 1;
  border: 1px solid var(--color-border);
  border-radius: 10px;
  padding: 12px;
  cursor: pointer;
  font-size: 14px;
}
.profile-option.selected {
  border-color: var(--color-brand);
  background: var(--color-brand-soft);
}
.role-options {
  display: flex;
  gap: 22px;
  margin: 12px 0 14px;
  font-size: 13px;
  color: var(--color-text-muted);
}
.role-options label {
  display: flex;
  gap: 6px;
  align-items: center;
}
input {
  accent-color: var(--color-brand);
}
.presets {
  display: flex;
  gap: 6px;
  margin-bottom: 12px;
}
.presets button {
  flex: 1;
  min-height: 40px;
  border: 1px solid var(--color-border);
  border-radius: 7px;
  background: var(--color-canvas);
  color: var(--color-text-muted);
  padding: 8px;
  font-size: 13px;
}
.presets button[aria-pressed='true'] {
  background: var(--color-brand-soft);
  color: var(--color-brand);
  border-color: var(--color-brand);
  font-weight: 650;
}
.criteria-fields {
  display: grid;
  grid-template-columns: 1fr minmax(0, 1.25fr);
  align-items: center;
  gap: 8px;
  font-size: 13px;
}
.input-unit {
  display: flex;
  align-items: center;
  border: 1px solid var(--color-border);
  background: var(--color-canvas);
  border-radius: 8px;
  padding-right: 12px;
  overflow: hidden;
}
.input-unit:focus-within {
  outline: 2px solid var(--color-focus);
  outline-offset: 2px;
}
.input-unit input {
  width: 100%;
  min-width: 0;
  border: 0;
  background: transparent;
  padding: 11px;
  color: var(--color-text);
  font: inherit;
  font-weight: 650;
  outline: none;
}
.input-unit span {
  white-space: nowrap;
  font-size: 12px;
  color: var(--color-text-muted);
}
.hint {
  color: var(--color-text-muted);
  font-size: 12px;
  line-height: 1.6;
  margin: 12px 0 0;
}
.hint.invalid {
  color: var(--color-danger);
}
.consent {
  display: flex;
  gap: 9px;
  font-size: 12px;
  line-height: 1.7;
  margin: 16px 0 12px;
  color: var(--color-text-muted);
}
.consent input {
  flex-shrink: 0;
  align-self: flex-start;
  margin-top: 4px;
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
input[type='radio']:focus-visible,
input[type='checkbox']:focus-visible,
summary:focus-visible {
  outline: 3px solid var(--color-focus);
  outline-offset: 3px;
}
.primary {
  width: 100%;
  padding: 13px;
  border: 0;
  border-radius: 10px;
  background: var(--color-action);
  color: var(--color-on-action);
  display: flex;
  gap: 10px;
  align-items: center;
  justify-content: center;
  font-size: 14px;
  font-weight: 650;
}
.secondary {
  width: 100%;
  border: 1px solid var(--color-border);
  padding: 11px 14px;
  border-radius: 8px;
  color: var(--color-text);
  background: var(--color-surface);
  font-size: 13px;
}
.text-action {
  border: 0;
  background: none;
  color: var(--color-brand);
  padding: 4px;
  text-decoration: underline;
  font-size: 12px;
}
.result-panel {
  min-height: 420px;
}
.result-panel:focus {
  outline: none;
}
.result-empty,
.verified-result,
.progress-result {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  padding: 34px 4px;
}
.result-empty {
  min-height: 290px;
  color: var(--color-text-muted);
}
.privacy-icon {
  padding: 20px;
  border-radius: 50%;
  background: var(--color-brand-soft);
  color: var(--color-brand);
  margin-bottom: 8px;
}
.result-empty h3 {
  font-size: 17px;
  color: var(--color-text);
  margin-bottom: 0;
}
.result-empty p,
.verified-result p,
.progress-result p {
  font-size: 13px;
  line-height: 1.7;
  color: var(--color-text-muted);
}
.verified-result {
  color: var(--color-brand);
}
.verified-result.unmet {
  color: var(--color-warning);
}
.verified-result h3 {
  font-size: 32px;
  margin: 16px 0 0;
  letter-spacing: -0.04em;
}
.verified-badge {
  display: inline-flex;
  gap: 5px;
  align-items: center;
  color: var(--color-text-muted);
  font-size: 11px;
}
.progress-result {
  color: var(--color-brand);
  min-height: 180px;
}
.progress-result h3 {
  font-size: 21px;
  margin: 20px 0 0;
  color: var(--color-text);
}
.result-context {
  border-radius: 10px;
  padding: 16px;
  background: var(--color-canvas);
  font-size: 13px;
}
.result-context p {
  line-height: 1.8;
  color: var(--color-text-muted);
  margin: 8px 0;
}
.result-context span {
  display: inline-flex;
  gap: 5px;
  align-items: center;
  color: var(--color-brand);
  font-size: 11px;
}
.result-actions {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 20px;
}
.evidence {
  border-top: 1px solid var(--color-border);
  margin-top: 20px;
  padding-top: 16px;
}
summary {
  cursor: pointer;
  font-size: 12px;
  color: var(--color-text-muted);
}
dl {
  margin: 20px 0 0;
}
dl > div {
  display: flex;
  flex-direction: column;
  gap: 5px;
  margin: 12px 0;
  font-size: 12px;
}
dt {
  color: var(--color-text-muted);
}
dd {
  margin: 0;
  line-height: 1.6;
  overflow-wrap: anywhere;
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
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 24px;
  margin-top: 20px;
  color: var(--color-text-muted);
  font-size: 11px;
  line-height: 1.8;
}
.demo-disclosure > span {
  flex-shrink: 0;
}
.demo-disclosure details {
  max-width: 560px;
  text-align: right;
}
.demo-disclosure p {
  text-align: left;
}
.spinner {
  animation: spin 1.5s linear infinite;
}
@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
@media (max-width: 760px) {
  .demo-grid {
    grid-template-columns: 1fr;
  }
  .demo-page {
    padding: 26px 16px;
  }
  .demo-panel {
    padding: 22px;
  }
  .result-panel {
    min-height: 0;
  }
  .result-empty {
    min-height: 150px;
  }
}
@media (prefers-reduced-motion: reduce) {
  .spinner {
    animation: none;
  }
}
</style>
