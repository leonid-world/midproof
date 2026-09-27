<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import {
  CheckCircle2,
  CircleAlert,
  CircleX,
  ClipboardPaste,
  Database,
  FileUp,
  FlaskConical,
  RefreshCw,
  Search,
  ShieldCheck,
  Trash2,
} from '@lucide/vue'
import { useMidnightCapabilityVerification } from '../composables/useMidnightCapabilityVerification'
import {
  readCapabilityFile,
  readCapabilityFromClipboard,
} from '../services/midnight/capabilityHandoff'
import { formatReceivableIdentity } from '../services/receivableIdentity'
import {
  createReceivableCapabilityContext,
  hasCompleteReceivableCapabilityContext,
  isFunderVisibleReceivable,
  mergeVisibleReceivables,
} from '../services/midnight/receivableCapabilityContext'
import { useAuthStore } from '../stores/auth'
import { useReceivableStore } from '../stores/receivable'

const authStore = useAuthStore()
const receivableStore = useReceivableStore()
const visibleReceivables = ref([])
const selectedReceivableId = ref('')
const selectedRole = ref('SELLER')
const isContextLoading = ref(true)
const contextErrorMessage = ref('')

const selectedReceivable = computed(
  () =>
    visibleReceivables.value.find(
      (receivable) => String(receivable.receivableId) === selectedReceivableId.value,
    ) ?? null,
)

const expectedContext = computed(() => {
  if (!selectedReceivable.value) return null
  try {
    return createReceivableCapabilityContext(selectedReceivable.value, selectedRole.value)
  } catch {
    return null
  }
})

const {
  capabilityText,
  verification,
  errorMessage,
  inputErrorMessage,
  isLoading,
  validationMessage,
  clearCapability,
  importCapabilityText,
  resetVerification,
  verifyCapability,
} = useMidnightCapabilityVerification({ expectedContext })

const canVerify = computed(
  () =>
    Boolean(selectedReceivable.value && capabilityText.value.trim()) &&
    !validationMessage.value &&
    !isContextLoading.value &&
    !isLoading.value,
)

const feedbackTarget = ref(null)
const capabilityInput = ref(null)
const capabilityFileInput = ref(null)
const clipboardImportButton = ref(null)
const handoffFeedbackTarget = ref(null)
const handoffMessage = ref('')
const handoffFailed = ref(false)
const showAdvancedInput = ref(false)
let handoffOperationId = 0
let isUnmounted = false

onMounted(loadVisibleReceivables)

watch([selectedReceivableId, selectedRole], clearHandoff)

onBeforeUnmount(() => {
  isUnmounted = true
  clearHandoff()
  visibleReceivables.value = []
  selectedReceivableId.value = ''
})

async function loadVisibleReceivables() {
  clearHandoff()
  isContextLoading.value = true
  contextErrorMessage.value = ''
  try {
    await Promise.all([
      authStore.loadUser(),
      receivableStore.loadAll(),
      receivableStore.loadFundingOpportunities(),
    ])
    const companyId = authStore.user?.companyId
    visibleReceivables.value = mergeVisibleReceivables(
      receivableStore.receivables,
      receivableStore.fundingOpportunities,
    ).filter(
      (receivable) =>
        isFunderVisibleReceivable(receivable, companyId) &&
        hasCompleteReceivableCapabilityContext(receivable),
    )
    if (
      !visibleReceivables.value.some(
        (receivable) => String(receivable.receivableId) === selectedReceivableId.value,
      )
    ) {
      selectedReceivableId.value = visibleReceivables.value[0]?.receivableId?.toString() ?? ''
    }
  } catch (error) {
    visibleReceivables.value = []
    selectedReceivableId.value = ''
    contextErrorMessage.value =
      error?.message ?? 'Funder가 확인할 수 있는 채권 문맥을 불러오지 못했습니다.'
  } finally {
    isContextLoading.value = false
  }
}

async function requestVerification() {
  if (!canVerify.value) return
  const pendingVerification = verifyCapability()
  await nextTick()
  feedbackTarget.value?.focus()
  await pendingVerification
  await nextTick()
  feedbackTarget.value?.focus()
}

async function clearInput() {
  clearHandoff()
  await nextTick()
  clipboardImportButton.value?.focus()
}

function clearHandoff() {
  handoffOperationId += 1
  clearCapability()
  handoffMessage.value = ''
  handoffFailed.value = false
  showAdvancedInput.value = false
  if (capabilityFileInput.value) capabilityFileInput.value.value = ''
}

async function focusHandoffFeedback() {
  await nextTick()
  handoffFeedbackTarget.value?.focus()
}

async function commitImportedCapability(text) {
  const imported = importCapabilityText(text)
  handoffFailed.value = !imported
  handoffMessage.value = imported
    ? '검증 권한 형식과 선택한 채권·역할의 일치를 확인했습니다. 아직 조회하지 않았습니다. 아래 ZK 결과 확인을 눌러 주세요.'
    : inputErrorMessage.value
  await focusHandoffFeedback()
}

async function importFromClipboard() {
  const currentOperationId = ++handoffOperationId
  clearCapability()
  handoffMessage.value = '브라우저에 클립보드 읽기 권한을 요청하고 있습니다.'
  handoffFailed.value = false
  if (capabilityFileInput.value) capabilityFileInput.value.value = ''
  try {
    const text = await readCapabilityFromClipboard()
    if (isUnmounted || currentOperationId !== handoffOperationId) return
    await commitImportedCapability(text)
  } catch (error) {
    if (isUnmounted || currentOperationId !== handoffOperationId) return
    clearCapability()
    handoffFailed.value = true
    handoffMessage.value = error?.message ?? '클립보드에서 검증 권한을 가져오지 못했습니다.'
    await focusHandoffFeedback()
  }
}

function openCapabilityFilePicker() {
  capabilityFileInput.value?.click()
}

async function importFromFile(event) {
  const file = event.target.files?.[0] ?? null
  event.target.value = ''
  const currentOperationId = ++handoffOperationId
  clearCapability()
  handoffMessage.value = ''
  handoffFailed.value = false
  if (!file) return
  try {
    const text = await readCapabilityFile(file)
    if (isUnmounted || currentOperationId !== handoffOperationId) return
    await commitImportedCapability(text)
  } catch (error) {
    if (isUnmounted || currentOperationId !== handoffOperationId) return
    clearCapability()
    handoffFailed.value = true
    handoffMessage.value = error?.message ?? '검증 파일을 가져오지 못했습니다.'
    await focusHandoffFeedback()
  }
}

function handleManualInput() {
  handoffOperationId += 1
  resetVerification()
  handoffMessage.value = ''
  handoffFailed.value = false
  if (capabilityFileInput.value) capabilityFileInput.value.value = ''
}

function shortHex(value) {
  return `${value.slice(0, 12)}…${value.slice(-12)}`
}

function roleLabel(role) {
  return role === 'SELLER' ? 'Seller(매도자)' : 'Buyer(매수자)'
}

function providerLabel(providerId) {
  if (providerId === '2') return 'Mock Provider 2 · 역할 지갑 authorized'
  if (providerId === '1') return 'Mock Provider 1 · legacy (지갑 authorization 없음)'
  return `Mock Provider ${providerId} · authorization 정책 확인 안 됨`
}
</script>

<template>
  <main class="midnight-page">
    <section class="midnight-shell">
      <header class="page-heading">
        <span class="eyebrow"><FlaskConical :size="15" aria-hidden="true" /> 로컬 PoC</span>
        <h1>이전 ZK 결과 확인</h1>
        <p>전달받은 검증 권한으로 해당 채권·역할의 결과를 확인하세요.</p>
      </header>

      <section class="scope-notice" aria-labelledby="scope-title">
        <ShieldCheck aria-hidden="true" :size="22" />
        <div>
          <h2 id="scope-title">이전 결과 안내</h2>
          <p>가상 입력의 ZK 결과를 조회합니다. 실제 회사·재무 검증이나 펀딩 승인이 아닙니다.</p>
          <ul>
            <li>채권·역할·등록 지갑이 검증 권한과 일치해야 합니다.</li>
            <li>Provider 2만 발급 시 역할 지갑 동의를 확인합니다. Provider 1은 이전 정책입니다.</li>
            <li>발급·만료 시각이 없는 이전 결과입니다. 현재 재무 상태로 해석하지 마세요.</li>
          </ul>
        </div>
      </section>

      <section
        class="query-panel"
        :aria-busy="isLoading || isContextLoading"
        aria-labelledby="query-title"
      >
        <div class="section-heading">
          <span class="section-icon" aria-hidden="true"><Database :size="20" /></span>
          <div>
            <span>검증 권한으로 공개 결과 조회</span>
            <h2 id="query-title">채권과 역할 선택</h2>
          </div>
        </div>

        <div class="context-selection">
          <div class="context-field">
            <label for="midnight-receivable">검증할 DB 채권</label>
            <select
              id="midnight-receivable"
              v-model="selectedReceivableId"
              :disabled="isContextLoading || isLoading || !visibleReceivables.length"
            >
              <option value="" disabled>채권을 선택해 주세요.</option>
              <option
                v-for="receivable in visibleReceivables"
                :key="receivable.receivableId"
                :value="String(receivable.receivableId)"
              >
                {{ formatReceivableIdentity(receivable) }}
              </option>
            </select>
          </div>
          <div class="context-field">
            <label for="midnight-subject-role">검증할 당사자</label>
            <select
              id="midnight-subject-role"
              v-model="selectedRole"
              :disabled="isContextLoading || isLoading || !selectedReceivable"
            >
              <option value="SELLER">Seller(매도자)</option>
              <option value="BUYER">Buyer(매수자)</option>
            </select>
          </div>
          <button
            class="secondary-button context-refresh"
            type="button"
            :disabled="isContextLoading || isLoading"
            @click="loadVisibleReceivables"
          >
            <RefreshCw aria-hidden="true" :class="{ spin: isContextLoading }" :size="17" />
            문맥 새로고침
          </button>
        </div>

        <p v-if="isContextLoading" class="context-state" role="status">
          조회할 수 있는 채권을 불러오는 중입니다...
        </p>
        <p v-else-if="contextErrorMessage" class="context-state error" role="alert">
          {{ contextErrorMessage }}
        </p>
        <p v-else-if="!visibleReceivables.length" class="context-state">
          현재 계정이 Funder로 확인할 수 있는 온체인 채권이 없습니다.
        </p>

        <div v-if="selectedReceivable && expectedContext" class="selected-context">
          <strong>{{ formatReceivableIdentity(selectedReceivable) }}</strong>
          <dl>
            <div>
              <dt>선택한 역할</dt>
              <dd>{{ roleLabel(selectedRole) }}</dd>
            </div>
            <div>
              <dt>일치해야 하는 역할 지갑</dt>
              <dd>
                <code>{{ expectedContext.partyWallet }}</code>
              </dd>
            </div>
            <div>
              <dt>ReceivableFinance</dt>
              <dd>
                <code>{{ expectedContext.receivableFinanceAddress }}</code>
              </dd>
            </div>
          </dl>
        </div>

        <div class="funder-guidance">
          <strong>조회 순서</strong>
          <p>판매기업·구매기업의 검증 권한을 각각 받아 해당 역할에서 조회하세요.</p>
        </div>

        <form class="query-form" @submit.prevent="requestVerification">
          <div class="handoff-actions" aria-describedby="capability-handoff-help">
            <button
              ref="clipboardImportButton"
              type="button"
              :disabled="isLoading || isContextLoading || !selectedReceivable"
              aria-describedby="capability-handoff-help capability-handoff-warning"
              @click="importFromClipboard"
            >
              <ClipboardPaste aria-hidden="true" :size="18" /> 클립보드에서 가져오기
            </button>
            <button
              class="secondary-button"
              type="button"
              :disabled="isLoading || isContextLoading || !selectedReceivable"
              aria-describedby="capability-handoff-help capability-handoff-warning"
              @click="openCapabilityFilePicker"
            >
              <FileUp aria-hidden="true" :size="18" /> 검증 파일 선택
            </button>
            <input
              ref="capabilityFileInput"
              type="file"
              accept=".gasok-proof,.json,application/json"
              hidden
              @change="importFromFile"
            />
          </div>
          <p id="capability-handoff-help" class="field-help">
            16 KiB 이하의 검증 파일을 가져온 뒤 <strong>ZK 결과 확인</strong>을 누르세요. 가져오기는
            조회를 시작하지 않습니다.
          </p>
          <p id="capability-handoff-warning" class="capability-warning">
            검증 권한은 특정 당사자와 결과를 연결하는 민감 정보입니다. 공유·동기화 폴더를 피하고,
            사용 후 원본 파일과 클립보드 기록을 직접 지우세요. 화면 초기화로 삭제되지 않습니다.
          </p>
          <p
            v-if="handoffMessage"
            ref="handoffFeedbackTarget"
            class="handoff-feedback"
            :class="{ error: handoffFailed }"
            :role="handoffFailed ? 'alert' : 'status'"
            tabindex="-1"
          >
            {{ handoffMessage }}
          </p>

          <details
            class="advanced-input"
            :open="showAdvancedInput"
            @toggle="showAdvancedInput = $event.currentTarget.open"
          >
            <summary>고급/CLI 진단용 직접 입력</summary>
            <div v-if="showAdvancedInput">
              <label for="proof-capability">Proof capability JSON</label>
              <textarea
                id="proof-capability"
                ref="capabilityInput"
                v-model="capabilityText"
                autocomplete="off"
                autocapitalize="off"
                spellcheck="false"
                data-1p-ignore
                data-lpignore="true"
                data-form-type="other"
                :disabled="isLoading || isContextLoading || !selectedReceivable"
                :aria-invalid="Boolean(validationMessage)"
                aria-describedby="capability-help capability-validation"
                maxlength="4096"
                placeholder='CLI가 전달한 { "version": 1, ... } 한 줄 JSON 전체를 붙여넣으세요.'
                @input="handleManualInput"
              />

              <p id="capability-help" class="field-help">
                9개 필드의 검증 권한만 입력하세요. PIN·비밀값·재무 원문·기관 서명은 넣지 마세요.
              </p>
            </div>
          </details>
          <p
            v-if="validationMessage"
            id="capability-validation"
            class="validation-message"
            aria-live="polite"
          >
            {{ validationMessage }}
          </p>

          <div class="query-actions">
            <button type="submit" :disabled="!canVerify">
              <Search v-if="!isLoading" aria-hidden="true" :size="18" />
              <RefreshCw v-else aria-hidden="true" class="spin" :size="18" />
              {{ isLoading ? '확인 중...' : 'ZK 결과 확인' }}
            </button>
            <button
              class="secondary-button"
              type="button"
              :disabled="!capabilityText"
              @click="clearInput"
            >
              <Trash2 aria-hidden="true" :size="17" /> 입력 지우기
            </button>
          </div>
        </form>
      </section>

      <p
        v-if="isLoading"
        ref="feedbackTarget"
        class="notice loading-state"
        role="status"
        tabindex="-1"
      >
        검증 권한과 일치하는 공개 결과를 조회 중입니다...
      </p>

      <div
        v-else-if="errorMessage"
        ref="feedbackTarget"
        class="notice error"
        role="alert"
        tabindex="-1"
      >
        <CircleAlert aria-hidden="true" :size="20" />
        <div>
          <strong>결과를 확인하지 못했습니다.</strong>
          <p>{{ errorMessage }}</p>
        </div>
        <button type="button" @click="requestVerification">
          <RefreshCw aria-hidden="true" :size="16" /> 다시 시도
        </button>
      </div>

      <section
        v-else-if="verification"
        ref="feedbackTarget"
        class="results-section"
        aria-labelledby="results-title"
        role="status"
        tabindex="-1"
      >
        <div class="results-heading">
          <div>
            <span>
              {{ verification.networkId }} 네트워크 ·
              {{ roleLabel(verification.context.subjectRole) }}
            </span>
            <h2 id="results-title">
              {{ formatReceivableIdentity(selectedReceivable) }} ·
              {{ roleLabel(verification.context.subjectRole) }} 검증 결과
            </h2>
          </div>
          <code :title="verification.contractAddress">{{
            shortHex(verification.contractAddress)
          }}</code>
        </div>

        <article class="result-card">
          <div class="result-summary">
            <span
              class="result-icon"
              :class="verification.result.eligible ? 'eligible' : 'ineligible'"
              aria-hidden="true"
            >
              <CheckCircle2 v-if="verification.result.eligible" :size="22" />
              <CircleX v-else :size="22" />
            </span>
            <div>
              <span>Compact 정책 평가 결과</span>
              <h3>{{ verification.result.eligible ? '적격' : '부적격' }}</h3>
            </div>
            <span class="proof-badge">Midnight 기록 일치</span>
          </div>

          <p v-if="!verification.result.eligible" class="valid-proof-note">
            <strong>부적격은 증명 실패가 아닙니다.</strong>
            가상 입력이 기준을 충족하지 않았다는 유효한 결과입니다.
          </p>

          <dl class="result-details">
            <div class="wallet-detail">
              <dt>온체인 {{ verification.context.subjectRole }} 지갑</dt>
              <dd>
                <code>{{ verification.context.partyWallet }}</code>
              </dd>
            </div>
            <div>
              <dt>Attestation</dt>
              <dd>{{ providerLabel(verification.result.providerId) }}</dd>
            </div>
            <div>
              <dt>정책 버전</dt>
              <dd>v{{ verification.result.policyVersion }}</dd>
            </div>
            <div>
              <dt>채권 거래 Chain ID</dt>
              <dd>{{ verification.context.giwaChainId }}</dd>
            </div>
            <div>
              <dt>Lookup key</dt>
              <dd>
                <code :title="verification.result.lookupKey">
                  {{ shortHex(verification.result.lookupKey) }}
                </code>
              </dd>
            </div>
          </dl>

          <p v-if="verification.result.providerId === '2'" class="result-meaning">
            Provider 2는 발급 시 {{ verification.context.subjectRole }} 지갑 동의를 확인했습니다.
            가상 입력의 결과이며 회사 신원·재무 사실·현재 적격성·펀딩 승인을 증명하지 않습니다.
          </p>
          <p v-else-if="verification.result.providerId === '1'" class="result-meaning">
            Provider 1의 이전 결과입니다. {{ verification.context.subjectRole }} 지갑의 발급 동의는
            확인하지 않았습니다. 실제 회사·재무 검증이나 펀딩 승인이 아닙니다.
          </p>
          <p v-else class="result-meaning">
            발급 정책을 확인할 수 없는 기관입니다. 공개 결과의 존재만 확인하며 지갑 동의나 실제
            회사·재무 검증을 보장하지 않습니다.
          </p>
          <p class="freshness-note">
            <strong>이전 정책:</strong> 발급·만료·취소·갱신 정보가 없어 현재 재무 상태를 판단할 수
            없습니다.
          </p>
        </article>
      </section>
    </section>
  </main>
</template>

<style scoped>
.midnight-page {
  min-height: 100%;
  padding: var(--space-6) var(--space-3) var(--space-8);
}

.midnight-shell {
  width: min(100%, 960px);
  margin: 0 auto;
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
  font-size: 32px;
  line-height: 1.25;
  letter-spacing: -0.02em;
}

.page-heading p {
  max-width: 760px;
  margin: var(--space-1) 0 0;
  color: var(--color-text-muted);
}

h2,
h3,
p {
  margin-top: 0;
}

.scope-notice,
.query-panel,
.results-section,
.learning-note {
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  background: var(--color-surface);
}

.scope-notice {
  display: flex;
  gap: var(--space-2);
  padding: var(--space-3);
  border-color: var(--color-brand-border);
  background: var(--color-brand-soft);
}

.scope-notice > svg {
  flex: 0 0 auto;
  color: var(--color-brand);
}

.scope-notice h2,
.learning-note h2 {
  margin-bottom: var(--space-1);
  font-size: 18px;
}

.scope-notice p,
.scope-notice ul,
.learning-note ol,
.learning-note p {
  margin-bottom: 0;
  color: var(--color-text-muted);
  line-height: 1.65;
}

.scope-notice ul,
.learning-note ol {
  padding-left: 20px;
}

.query-panel,
.results-section,
.learning-note {
  margin-top: var(--space-3);
  padding: var(--space-3);
}

.section-heading {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}

.section-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  border: 1px solid var(--color-brand-border);
  border-radius: var(--radius-md);
  background: var(--color-brand-soft);
  color: var(--color-brand);
}

.section-heading span,
.results-heading span,
.result-summary > div > span {
  color: var(--color-text-muted);
  font-size: 12px;
  font-weight: 600;
}

.section-heading h2,
.results-heading h2 {
  margin: 2px 0 0;
  font-size: 18px;
}

.context-selection {
  display: grid;
  grid-template-columns: minmax(0, 2fr) minmax(180px, 1fr) auto;
  align-items: end;
  gap: var(--space-2);
  margin-top: var(--space-3);
  padding-top: var(--space-3);
  border-top: 1px solid var(--color-border);
}

.context-field label {
  display: block;
  margin-bottom: var(--space-1);
  font-weight: 600;
}

.context-field select {
  width: 100%;
  min-height: 44px;
  border: 1px solid var(--color-border-strong);
  border-radius: var(--radius-md);
  padding: 0 var(--space-2);
  background: var(--color-surface);
  color: var(--color-text);
}

.context-field select:focus {
  border-color: var(--color-brand);
  outline: 3px solid var(--color-focus);
}

.context-refresh {
  white-space: nowrap;
}

.context-state {
  margin: var(--space-2) 0 0;
  color: var(--color-text-muted);
  line-height: 1.55;
}

.context-state.error {
  color: var(--color-danger);
  font-weight: 600;
}

.selected-context {
  margin-top: var(--space-2);
  border: 1px solid var(--color-brand-border);
  border-radius: var(--radius-md);
  padding: var(--space-2);
  background: var(--color-brand-soft);
}

.selected-context > strong {
  color: var(--color-brand);
}

.selected-context dl {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--space-2);
  margin: var(--space-2) 0 0;
}

.selected-context dl div:last-child {
  grid-column: 1 / -1;
}

.selected-context dt {
  color: var(--color-text-muted);
  font-size: 12px;
  font-weight: 600;
}

.selected-context dd {
  margin: 4px 0 0;
  overflow-wrap: anywhere;
  font-weight: 600;
}

.selected-context code {
  font-size: 12px;
}

.funder-guidance {
  margin-top: var(--space-2);
  border-left: 3px solid var(--color-warning-border);
  padding: var(--space-2);
  background: var(--color-warning-soft);
  color: var(--color-warning);
}

.funder-guidance p {
  margin: 6px 0 0;
  line-height: 1.55;
}

.query-form {
  margin-top: var(--space-3);
  padding-top: var(--space-3);
  border-top: 1px solid var(--color-border);
}

.handoff-actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-1);
}

.handoff-feedback {
  margin: var(--space-2) 0 0;
  border-radius: var(--radius-md);
  padding: var(--space-2);
  background: var(--color-brand-soft);
  color: var(--color-brand);
  font-weight: 650;
  line-height: 1.55;
}

.handoff-feedback.error {
  background: var(--color-danger-soft);
  color: var(--color-danger);
}

.handoff-feedback:focus {
  outline: 3px solid var(--color-focus);
  outline-offset: 2px;
}

.advanced-input {
  margin-top: var(--space-2);
  border-top: 1px solid var(--color-border);
  padding-top: var(--space-2);
}

.advanced-input summary {
  width: fit-content;
  color: var(--color-brand);
  font-weight: 700;
  cursor: pointer;
}

.advanced-input > div {
  margin-top: var(--space-2);
}

.query-form label {
  display: block;
  margin-bottom: var(--space-1);
  font-weight: 600;
}

textarea {
  width: 100%;
  min-height: 230px;
  resize: vertical;
  border: 1px solid var(--color-border-strong);
  border-radius: var(--radius-md);
  padding: var(--space-2);
  color: var(--color-text);
  background: var(--color-surface);
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 13px;
  line-height: 1.55;
}

textarea:hover {
  border-color: var(--color-border-strong);
}

textarea:focus {
  border-color: var(--color-brand);
  outline: 3px solid var(--color-focus);
}

textarea[aria-invalid='true'] {
  border-color: var(--color-danger-border);
}

textarea:disabled {
  cursor: wait;
  background: var(--color-surface-subtle);
  color: var(--color-text-muted);
}

.field-help,
.validation-message,
.capability-warning {
  margin: var(--space-1) 0 0;
  font-size: 13px;
  line-height: 1.55;
}

.field-help {
  color: var(--color-text-muted);
}

.capability-warning {
  padding: var(--space-2);
  border-left: 3px solid var(--color-warning-border);
  background: var(--color-warning-soft);
  color: var(--color-warning);
}

.validation-message {
  color: var(--color-danger);
  font-weight: 600;
}

.query-actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-1);
  margin-top: var(--space-2);
}

button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 44px;
  gap: var(--space-1);
  border: 0;
  border-radius: var(--radius-md);
  padding: var(--space-1) var(--space-2);
  background: var(--color-action);
  color: var(--color-on-action);
  cursor: pointer;
  font-weight: 600;
}

button:hover:not(:disabled) {
  background: var(--color-action-hover);
}

button:focus-visible {
  outline: 3px solid var(--color-focus);
  outline-offset: 2px;
}

button:disabled {
  cursor: not-allowed;
  opacity: 0.55;
}

.secondary-button {
  border: 1px solid var(--color-border-strong);
  background: var(--color-surface);
  color: var(--color-text);
}

.secondary-button:hover:not(:disabled) {
  background: var(--color-surface-subtle);
}

.notice {
  margin: var(--space-3) 0 0;
  padding: var(--space-2);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-surface);
}

.notice:focus,
.results-section:focus {
  outline: 3px solid var(--color-focus);
  outline-offset: 3px;
}

.notice.error {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: start;
  gap: var(--space-2);
  border-color: var(--color-danger-border);
  background: var(--color-danger-soft);
  color: var(--color-danger);
}

.notice.error p {
  margin: 4px 0 0;
}

.results-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-2);
}

code {
  overflow-wrap: anywhere;
  color: var(--color-text);
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 12px;
}

.result-card {
  margin-top: var(--space-3);
  padding: var(--space-2);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
}

.result-summary {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: var(--space-2);
}

.result-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 42px;
  height: 42px;
  border-radius: 50%;
}

.result-icon.eligible {
  background: var(--color-brand-soft);
  color: var(--color-brand);
}

.result-icon.ineligible {
  background: var(--color-warning-soft);
  color: var(--color-warning);
}

.result-summary h3 {
  margin: 2px 0 0;
  font-size: 20px;
}

.proof-badge {
  border: 1px solid var(--color-brand-border);
  border-radius: 999px;
  padding: 6px 10px;
  background: var(--color-brand-soft);
  color: var(--color-brand);
  font-size: 12px;
  font-weight: 700;
}

.valid-proof-note {
  margin: var(--space-2) 0 0;
  padding: var(--space-2);
  border-left: 3px solid var(--color-warning-border);
  background: var(--color-warning-soft);
  color: var(--color-warning);
}

.valid-proof-note strong {
  display: block;
}

.result-details {
  display: grid;
  grid-template-columns: 2fr repeat(3, 1fr);
  margin: var(--space-2) 0 0;
  border-top: 1px solid var(--color-border);
}

.result-details > div {
  min-width: 0;
  padding-top: var(--space-2);
}

.wallet-detail {
  grid-column: 1 / -1;
}

dt {
  color: var(--color-text-muted);
  font-size: 12px;
}

dd {
  margin: 4px 0 0;
  font-weight: 600;
}

.result-meaning {
  margin: var(--space-2) 0 0;
  padding: var(--space-2);
  border-radius: var(--radius-md);
  background: var(--color-surface-subtle);
  color: var(--color-text-muted);
  line-height: 1.6;
}

.freshness-note {
  margin: var(--space-2) 0 0;
  padding: var(--space-2);
  border-left: 3px solid var(--color-warning-border);
  background: var(--color-warning-soft);
  color: var(--color-warning);
  line-height: 1.6;
}

.learning-note p {
  margin-top: var(--space-2);
  padding-top: var(--space-2);
  border-top: 1px solid var(--color-border);
}

.spin {
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

@media (max-width: 700px) {
  .midnight-page {
    padding: var(--space-4) var(--space-2) var(--space-6);
  }

  .scope-notice {
    padding: var(--space-2);
  }

  .query-actions,
  .notice.error {
    display: grid;
    grid-template-columns: 1fr;
  }

  .query-actions button,
  .notice.error button {
    width: 100%;
  }

  .context-selection,
  .selected-context dl {
    grid-template-columns: 1fr;
  }

  .selected-context dl div:last-child {
    grid-column: auto;
  }

  .context-refresh {
    width: 100%;
  }

  .results-heading {
    align-items: flex-start;
    flex-direction: column;
  }

  .result-summary {
    grid-template-columns: auto minmax(0, 1fr);
  }

  .proof-badge {
    grid-column: 1 / -1;
    justify-self: start;
  }

  .result-details {
    grid-template-columns: 1fr;
    gap: var(--space-1);
  }

  .wallet-detail {
    grid-column: auto;
  }
}

@media (prefers-reduced-motion: reduce) {
  .spin {
    animation: none;
  }
}
</style>
