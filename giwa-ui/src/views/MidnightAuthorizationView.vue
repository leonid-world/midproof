<script setup>
import { nextTick, ref } from 'vue'
import {
  ArrowLeft,
  CheckCircle2,
  CircleAlert,
  Clock3,
  Copy,
  FileSignature,
  FlaskConical,
  ShieldCheck,
  Trash2,
  WalletCards,
} from '@lucide/vue'
import { useMidnightRoleAuthorization } from '../composables/useMidnightRoleAuthorization'

const {
  requestText,
  requestPreview,
  responseText,
  errorMessage,
  copyMessage,
  isSigning,
  validationMessage,
  secondsRemaining,
  clearRequest,
  clearResponse,
  copyResponse,
  resetAuthorization,
  signAuthorization,
} = useMidnightRoleAuthorization()

const requestInput = ref(null)
const feedbackTarget = ref(null)
const responseOutput = ref(null)

function roleLabel(role) {
  return role === 'SELLER' ? 'Seller(매도자)' : 'Buyer(매수자)'
}

function shortHex(value) {
  return `${value.slice(0, 12)}…${value.slice(-12)}`
}

function formatUnixSeconds(value) {
  return new Intl.DateTimeFormat('ko-KR', {
    dateStyle: 'medium',
    timeStyle: 'medium',
  }).format(new Date(Number(value) * 1_000))
}

async function requestSignature() {
  const pendingSignature = signAuthorization()
  await nextTick()
  feedbackTarget.value?.focus()
  await pendingSignature
  await nextTick()
  feedbackTarget.value?.focus()
}

async function clearAll() {
  const signatureWasPending = isSigning.value
  clearRequest()
  await nextTick()
  if (!signatureWasPending) requestInput.value?.focus()
}

async function selectResponse() {
  responseOutput.value?.focus()
  responseOutput.value?.select()
}
</script>

<template>
  <main class="authorization-page">
    <section class="authorization-shell">
      <RouterLink class="back-link" :to="{ name: 'midnight' }">
        <ArrowLeft aria-hidden="true" :size="16" /> ZK 결과 확인으로 돌아가기
      </RouterLink>

      <header class="page-heading">
        <span class="eyebrow"><FlaskConical :size="15" aria-hidden="true" /> 로컬 PoC</span>
        <h1>지갑 동의 서명</h1>
        <p>CLI 요청을 해당 채권의 판매·구매기업 지갑으로 서명하세요.</p>
      </header>

      <section class="privacy-notice" aria-labelledby="privacy-title">
        <ShieldCheck aria-hidden="true" :size="22" />
        <div>
          <h2 id="privacy-title">입력 안내</h2>
          <p>CLI의 서명 요청만 붙여넣으세요. 재무 원문은 필요하지 않습니다.</p>
          <ul>
            <li>재무값·hidden salt·PIN·회사 secret을 넣지 마세요.</li>
            <li>요청과 서명은 브라우저 메모리에서만 처리합니다.</li>
            <li>완료된 응답은 CLI에 직접 전달하세요.</li>
          </ul>
        </div>
      </section>

      <section class="signing-panel" :aria-busy="isSigning" aria-labelledby="request-title">
        <div class="section-heading">
          <span class="section-icon" aria-hidden="true"><FileSignature :size="20" /></span>
          <div>
            <span>EIP-712 authorization request</span>
            <h2 id="request-title">CLI 요청 붙여넣기</h2>
          </div>
        </div>

        <form @submit.prevent="requestSignature">
          <label for="authorization-request">Authorization request JSON</label>
          <textarea
            id="authorization-request"
            ref="requestInput"
            v-model="requestText"
            autocomplete="off"
            autocapitalize="off"
            spellcheck="false"
            data-1p-ignore
            data-lpignore="true"
            data-form-type="other"
            :disabled="isSigning"
            :aria-invalid="Boolean(validationMessage)"
            aria-describedby="request-help request-validation"
            maxlength="8192"
            placeholder='CLI가 출력한 { "version": 1, "domain": ..., "message": ... } 전체를 붙여넣으세요.'
            @input="resetAuthorization"
          />
          <p id="request-help" class="field-help">
            등록된 계약·거래망·Provider 2·정책 v1에 맞는 요청만 서명할 수 있습니다.
          </p>
          <p
            v-if="validationMessage"
            id="request-validation"
            class="validation-message"
            aria-live="polite"
          >
            {{ validationMessage }}
          </p>

          <section v-if="requestPreview" class="request-preview" aria-labelledby="preview-title">
            <div class="preview-heading">
              <div>
                <span>서명 전 확인</span>
                <h3 id="preview-title">
                  매출채권 #{{ requestPreview.message.onchainReceivableId }} ·
                  {{ roleLabel(requestPreview.message.subjectRole) }}
                </h3>
              </div>
              <span class="expiry-badge">
                <Clock3 aria-hidden="true" :size="15" /> {{ secondsRemaining }}초 남음
              </span>
            </div>

            <dl>
              <div class="full-row">
                <dt>MetaMask에서 선택할 지갑</dt>
                <dd>
                  <code>{{ requestPreview.message.partyWallet }}</code>
                </dd>
              </div>
              <div>
                <dt>역할</dt>
                <dd>{{ roleLabel(requestPreview.message.subjectRole) }}</dd>
              </div>
              <div>
                <dt>Provider / 정책</dt>
                <dd>Mock Provider 2 / v1</dd>
              </div>
              <div>
                <dt>만료 시각</dt>
                <dd>{{ formatUnixSeconds(requestPreview.message.expiresAt) }}</dd>
              </div>
              <div>
                <dt>Midnight 계약</dt>
                <dd>
                  <code :title="requestPreview.message.midnightContractAddress">
                    {{ shortHex(requestPreview.message.midnightContractAddress) }}
                  </code>
                </dd>
              </div>
              <div class="full-row">
                <dt>서명 목적</dt>
                <dd>{{ requestPreview.message.purpose }}</dd>
              </div>
            </dl>
          </section>

          <p class="authorization-meaning">
            <strong>가상 확인서 발급 동의:</strong> 표시된 역할 지갑으로 한 번만 허가합니다. 실제
            회사·재무 검증이나 펀딩 승인이 아닙니다.
          </p>

          <div class="form-actions">
            <button
              type="submit"
              :disabled="isSigning || !requestPreview || Boolean(validationMessage)"
            >
              <WalletCards v-if="!isSigning" aria-hidden="true" :size="18" />
              <Clock3 v-else aria-hidden="true" class="spin" :size="18" />
              {{ isSigning ? 'MetaMask 확인 대기 중...' : '등록된 역할 지갑으로 서명' }}
            </button>
            <button
              class="secondary-button"
              type="button"
              :disabled="!requestText && !responseText"
              @click="clearAll"
            >
              <Trash2 aria-hidden="true" :size="17" /> 모두 지우기
            </button>
          </div>
        </form>
      </section>

      <p
        v-if="isSigning"
        ref="feedbackTarget"
        class="notice signing-state"
        role="status"
        tabindex="-1"
      >
        채권·역할·지갑·기관·기한을 확인해 서명하세요. 거래나 가스비는 발생하지 않습니다.
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
          <strong>지갑 서명을 완료하지 못했습니다.</strong>
          <p>{{ errorMessage }}</p>
        </div>
      </div>

      <section
        v-else-if="responseText"
        ref="feedbackTarget"
        class="response-panel"
        aria-labelledby="response-title"
        role="status"
        tabindex="-1"
      >
        <div class="response-heading">
          <span class="success-icon" aria-hidden="true"><CheckCircle2 :size="22" /></span>
          <div>
            <span>서명 지갑 일치</span>
            <h2 id="response-title">CLI에 전달할 서명</h2>
          </div>
        </div>

        <textarea
          ref="responseOutput"
          class="response-output"
          :value="responseText"
          readonly
          spellcheck="false"
          aria-label="Authorization response JSON"
          @focus="$event.target.select()"
        />
        <p class="field-help">한 줄 JSON 전체를 CLI에 한 번만 붙여넣으세요.</p>
        <div class="form-actions">
          <button type="button" @click="copyResponse">
            <Copy aria-hidden="true" :size="17" /> 응답 JSON 복사
          </button>
          <button class="secondary-button" type="button" @click="selectResponse">직접 선택</button>
          <button class="secondary-button" type="button" @click="clearResponse">응답 지우기</button>
        </div>
        <p v-if="copyMessage" class="copy-message" aria-live="polite">{{ copyMessage }}</p>
      </section>
    </section>
  </main>
</template>

<style scoped>
.authorization-page {
  min-height: 100%;
  padding: var(--space-6) var(--space-3) var(--space-8);
}

.authorization-shell {
  width: min(100%, 920px);
  margin: 0 auto;
}

.back-link {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin-bottom: var(--space-3);
  color: var(--color-brand);
  font-weight: 650;
  text-decoration: none;
}

.back-link:hover {
  text-decoration: underline;
}

.back-link:focus-visible,
button:focus-visible {
  outline: 3px solid var(--color-focus);
  outline-offset: 2px;
}

.page-heading {
  margin-bottom: var(--space-4);
}

.eyebrow {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin-bottom: var(--space-1);
  color: var(--color-brand);
  font-size: 13px;
  font-weight: 700;
}

h1 {
  margin: 0;
  color: var(--color-text);
  font-size: clamp(28px, 4vw, 40px);
  line-height: 1.2;
}

.page-heading p {
  max-width: 760px;
  margin: var(--space-2) 0 0;
  color: var(--color-text-muted);
  line-height: 1.65;
}

.privacy-notice {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: var(--space-2);
  margin-bottom: var(--space-3);
  border: 1px solid var(--color-brand-border);
  border-radius: var(--radius-lg);
  padding: var(--space-3);
  background: var(--color-brand-soft);
  color: var(--color-text);
}

.privacy-notice > svg {
  color: var(--color-brand);
}

.privacy-notice h2,
.privacy-notice p,
.privacy-notice ul {
  margin: 0;
}

.privacy-notice h2 {
  font-size: 18px;
}

.privacy-notice p,
.privacy-notice li {
  line-height: 1.6;
}

.privacy-notice p {
  margin-top: var(--space-1);
}

.privacy-notice ul {
  margin-top: var(--space-1);
  padding-left: 20px;
}

.signing-panel,
.response-panel,
.notice {
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  background: var(--color-surface);
  box-shadow: var(--shadow-sm);
}

.signing-panel,
.response-panel {
  padding: var(--space-3);
}

.section-heading,
.response-heading {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}

.section-icon,
.success-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 42px;
  height: 42px;
  flex: 0 0 auto;
  border-radius: var(--radius-md);
  background: var(--color-success-soft);
  color: var(--color-success);
}

.section-heading span,
.response-heading span,
.preview-heading span {
  color: var(--color-text-muted);
  font-size: 12px;
  font-weight: 600;
}

.section-heading h2,
.response-heading h2,
.preview-heading h3 {
  margin: 2px 0 0;
  font-size: 18px;
}

form {
  margin-top: var(--space-3);
  padding-top: var(--space-3);
  border-top: 1px solid var(--color-border);
}

label {
  display: block;
  margin-bottom: var(--space-1);
  font-weight: 650;
}

textarea {
  width: 100%;
  min-height: 260px;
  resize: vertical;
  border: 1px solid var(--color-border-strong);
  border-radius: var(--radius-md);
  padding: var(--space-2);
  background: var(--color-surface);
  color: var(--color-text);
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 13px;
  line-height: 1.55;
}

textarea:hover:not(:disabled) {
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
.copy-message {
  margin: var(--space-1) 0 0;
  font-size: 13px;
  line-height: 1.55;
}

.field-help {
  color: var(--color-text-muted);
}

.validation-message {
  color: var(--color-danger);
  font-weight: 650;
}

.request-preview {
  margin-top: var(--space-3);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  padding: var(--space-2);
  background: var(--color-surface-subtle);
}

.preview-heading {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--space-2);
}

.expiry-badge {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  border: 1px solid var(--color-warning-border);
  border-radius: 999px;
  padding: 6px 10px;
  background: var(--color-warning-soft);
  color: var(--color-warning) !important;
  white-space: nowrap;
}

dl {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--space-2);
  margin: var(--space-2) 0 0;
}

dl > div {
  min-width: 0;
}

.full-row {
  grid-column: 1 / -1;
}

dt {
  color: var(--color-text-muted);
  font-size: 12px;
}

dd {
  margin: 4px 0 0;
  font-weight: 650;
  overflow-wrap: anywhere;
}

code {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 12px;
}

.authorization-meaning {
  margin: var(--space-3) 0 0;
  border-left: 3px solid var(--color-warning-border);
  padding: var(--space-2);
  background: var(--color-warning-soft);
  color: var(--color-warning);
  line-height: 1.6;
}

.form-actions {
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
  font-weight: 650;
}

button:hover:not(:disabled) {
  background: var(--color-action-hover);
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

.notice,
.response-panel {
  margin-top: var(--space-3);
}

.notice {
  padding: var(--space-2);
}

.notice:focus,
.response-panel:focus {
  outline: 3px solid var(--color-focus);
  outline-offset: 3px;
}

.notice.error {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: var(--space-2);
  border-color: var(--color-danger-border);
  background: var(--color-danger-soft);
  color: var(--color-danger);
}

.notice.error p {
  margin: 4px 0 0;
}

.signing-state {
  border-color: var(--color-brand-border);
  background: var(--color-brand-soft);
}

.response-output {
  min-height: 210px;
  margin-top: var(--space-2);
  background: var(--color-surface-subtle);
}

.copy-message {
  color: var(--color-brand);
  font-weight: 650;
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
  .authorization-page {
    padding: var(--space-4) var(--space-2) var(--space-6);
  }

  .privacy-notice {
    padding: var(--space-2);
  }

  .preview-heading,
  .form-actions {
    display: grid;
    grid-template-columns: 1fr;
  }

  .expiry-badge {
    justify-self: start;
  }

  dl {
    grid-template-columns: 1fr;
  }

  .full-row {
    grid-column: auto;
  }

  .form-actions button {
    width: 100%;
  }
}

@media (prefers-reduced-motion: reduce) {
  .spin {
    animation: none;
  }
}
</style>
