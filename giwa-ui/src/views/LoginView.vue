<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import {
  ArrowRight,
  CircleAlert,
  ShieldCheck,
  LockKeyhole,
  LoaderCircle,
  LogIn,
  UserPlus,
} from '@lucide/vue'
import { useAuthStore } from '../stores/auth'
import { formatBusinessNumber, normalizeBusinessNumber } from '../utils/businessNumber'
import { isMidnightDemoEnabled } from '../services/midnight/config'

const router = useRouter()
const auth = useAuthStore()
const isSignup = ref(false)
const showAccountForm = ref(!isMidnightDemoEnabled)
const email = ref('')
const password = ref('')
const userName = ref('')
const companyName = ref('')
const businessNumber = ref('')
const errorMessage = ref('')
const isSubmitting = ref(false)

async function loginDemo() {
  if (isSubmitting.value) return
  errorMessage.value = ''
  isSubmitting.value = true
  try {
    await auth.loginDemo('FUNDER')
    await router.push({ name: 'demo' })
  } catch (error) {
    errorMessage.value = error.message
  } finally {
    isSubmitting.value = false
  }
}

async function submit(destination) {
  errorMessage.value = ''
  isSubmitting.value = true
  try {
    const credentials = { email: email.value, password: password.value }
    if (isSignup.value) {
      await auth.signup({
        ...credentials,
        userName: userName.value,
        companyName: companyName.value,
        businessNumber: normalizeBusinessNumber(businessNumber.value),
      })
    } else await auth.login(credentials)
    await router.push({ name: typeof destination === 'string' ? destination : 'dashboard' })
  } catch (error) {
    errorMessage.value = error.message
  } finally {
    isSubmitting.value = false
  }
}

function toggleMode() {
  isSignup.value = !isSignup.value
  errorMessage.value = ''
}

function toggleAccountForm() {
  showAccountForm.value = !showAccountForm.value
  isSignup.value = false
  errorMessage.value = ''
}

function updateBusinessNumber(event) {
  businessNumber.value = formatBusinessNumber(event.target.value)
}
</script>

<template>
  <main class="auth-page">
    <div class="auth-layout">
      <section class="auth-story" aria-labelledby="intro-title">
        <div class="auth-brand" aria-label="MidProof">
          <img
            class="midnight-wordmark"
            src="/midproof-logo.svg"
            alt="MidProof"
            width="130"
            height="28"
          />
        </div>
        <p class="story-eyebrow">PRIVATE FINANCIAL PROOFS</p>
        <h1 id="intro-title">재무정보는 비공개로.<br /><span>결과만 확인하세요.</span></h1>
        <p class="story-description">기준을 정하면 Midnight가 충족 여부를 증명합니다.</p>
        <div class="privacy-preview" aria-label="비공개 입력에서 기준 충족 결과까지의 검증 흐름">
          <div class="preview-heading">
            <LockKeyhole :size="16" aria-hidden="true" /> PRIVATE INPUT
          </div>
          <div class="private-row">
            <span>연 매출액</span><span aria-label="비공개">••••••••</span>
          </div>
          <div class="private-row">
            <span>부채비율</span><span aria-label="비공개">••••••</span>
          </div>
          <div class="private-row"><span>연체 횟수</span><span aria-label="비공개">••••</span></div>
          <div class="preview-result">
            <ShieldCheck :size="22" aria-hidden="true" />
            <div><strong>MidProof</strong><span>기준 충족 여부만 전달</span></div>
            <span class="preview-label">FLOW</span>
          </div>
        </div>
        <p class="story-note">가상 데이터로 체험하는 실제 Midnight ZK 증명</p>
      </section>
      <section class="auth-card" aria-labelledby="auth-title">
        <header class="auth-heading">
          <p class="auth-eyebrow">MIDPROOF</p>
          <h2 id="auth-title">
            {{ showAccountForm ? (isSignup ? '회원가입' : '로그인') : '바로 체험해 보세요' }}
          </h2>
          <p class="description">
            {{
              showAccountForm
                ? isSignup
                  ? '회사 계정으로 시작하세요.'
                  : '계정으로 로그인하세요.'
                : '기업 선택 → 기준 설정 → 결과 확인'
            }}
          </p>
        </header>

        <section
          v-if="isMidnightDemoEnabled && !showAccountForm"
          class="demo-entry"
          aria-label="가상 회사 데모 시작"
        >
          <button type="button" :disabled="isSubmitting" @click="loginDemo">
            <LoaderCircle
              v-if="isSubmitting"
              class="button-spinner"
              aria-hidden="true"
              :size="18"
            />
            <span>{{ isSubmitting ? '데모 여는 중…' : '데모 시작' }}</span>
            <ArrowRight v-if="!isSubmitting" aria-hidden="true" :size="18" />
          </button>
          <p>회원가입·지갑 설치 없이 시작합니다.</p>
        </section>

        <div v-if="errorMessage" class="error" role="alert">
          <CircleAlert aria-hidden="true" :size="18" />
          <span>{{ errorMessage }}</span>
        </div>

        <form v-if="showAccountForm" :aria-busy="isSubmitting" @submit.prevent="submit">
          <label>
            이메일
            <input v-model="email" type="email" autocomplete="email" required />
          </label>
          <label>
            비밀번호
            <input
              v-model="password"
              type="password"
              :autocomplete="isSignup ? 'new-password' : 'current-password'"
              minlength="8"
              required
            />
          </label>
          <template v-if="isSignup">
            <label>
              이름
              <input v-model="userName" type="text" autocomplete="name" required />
            </label>
            <label>
              회사명
              <input v-model="companyName" type="text" autocomplete="organization" required />
            </label>
            <label>
              사업자등록번호
              <input
                :value="businessNumber"
                type="text"
                inputmode="numeric"
                minlength="12"
                maxlength="12"
                pattern="[0-9]{3}-[0-9]{2}-[0-9]{5}"
                title="사업자등록번호 숫자 10자리를 입력해 주세요."
                required
                @input="updateBusinessNumber"
              />
            </label>
          </template>
          <button type="submit" :disabled="isSubmitting">
            <LoaderCircle
              v-if="isSubmitting"
              class="button-spinner"
              aria-hidden="true"
              :size="18"
            />
            <UserPlus v-else-if="isSignup" aria-hidden="true" :size="18" />
            <LogIn v-else aria-hidden="true" :size="18" />
            <span>{{ isSubmitting ? '처리 중...' : isSignup ? '회원가입' : '로그인' }}</span>
          </button>
        </form>

        <button
          v-if="showAccountForm"
          class="text-button"
          type="button"
          :disabled="isSubmitting"
          @click="toggleMode"
        >
          <span>{{ isSignup ? '이미 계정이 있으신가요? 로그인' : '처음이신가요? 회원가입' }}</span>
          <ArrowRight aria-hidden="true" :size="16" />
        </button>
        <button
          v-if="isMidnightDemoEnabled"
          class="text-button account-switch"
          type="button"
          :disabled="isSubmitting"
          @click="toggleAccountForm"
        >
          {{ showAccountForm ? '데모로 돌아가기' : '계정으로 로그인' }}
        </button>
        <p class="auth-network-note">
          가상 기업·기관의 데모이며, 운영 서버가 합성 데이터를 처리합니다.
        </p>
      </section>
    </div>
  </main>
</template>

<style scoped>
.demo-entry {
  margin: 24px 0 12px;
}
.demo-entry p {
  color: var(--color-text-muted);
  line-height: 1.5;
  text-align: center;
  margin: 12px 0 0;
  font-size: 12px;
}
.demo-entry button {
  width: 100%;
  min-height: 54px;
  font-size: 16px;
}
.auth-page {
  min-height: 100%;
  display: grid;
  place-items: center;
  padding: var(--space-8) var(--space-3);
  background: radial-gradient(ellipse at 10% 40%, #10312c 0, transparent 55%), var(--color-canvas);
}

.auth-layout {
  display: grid;
  grid-template-columns: minmax(0, 1.25fr) minmax(340px, 0.85fr);
  align-items: center;
  gap: clamp(40px, 7vw, 104px);
  width: min(100%, 1120px);
}

.auth-card {
  width: 100%;
  padding: 32px;
  border: 1px solid var(--color-border);
  border-radius: 20px;
  background: var(--color-surface);
  box-shadow: var(--shadow-panel);
}

.auth-heading {
  margin-bottom: var(--space-4);
}

.auth-brand {
  display: inline-flex;
  align-items: center;
  gap: var(--space-1);
  color: var(--color-text);
  font-size: 14px;
  font-weight: 600;
}

.story-eyebrow,
.auth-eyebrow {
  color: var(--color-brand);
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.14em;
}

.story-eyebrow {
  margin: 48px 0 20px;
}
.auth-eyebrow {
  margin: 0 0 12px;
}

.auth-story h1 {
  margin: 0;
  font-size: clamp(32px, 3.6vw, 49px);
  font-weight: 650;
  line-height: 1.35;
  letter-spacing: -0.05em;
  word-break: keep-all;
}

.auth-story h1 span {
  color: var(--color-brand);
}

.story-description {
  margin: 22px 0 28px;
  color: var(--color-text-muted);
  font-size: 15px;
  line-height: 1.9;
  word-break: keep-all;
}

.privacy-preview {
  max-width: 420px;
  padding: 20px 24px;
  border: 1px solid var(--color-brand-border);
  border-radius: 14px;
  background: linear-gradient(135deg, #1a1538, #101016);
}

.preview-heading {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 18px;
  color: var(--color-brand);
  font-size: 11px;
  letter-spacing: 0.14em;
}
.private-row {
  display: flex;
  justify-content: space-between;
  padding: 6px 0;
  color: var(--color-text-muted);
  font-size: 13px;
}
.private-row > span:last-child {
  color: var(--color-brand);
  letter-spacing: 0.18em;
}
.preview-result {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-top: 18px;
  padding-top: 18px;
  border-top: 1px solid var(--color-border);
  color: var(--color-brand);
}
.preview-result > div {
  display: grid;
  gap: 3px;
}
.preview-result strong {
  color: var(--color-text);
  font-size: 14px;
}
.preview-result div span {
  color: var(--color-text-muted);
  font-size: 12px;
}
.preview-label {
  margin-left: auto;
  font-size: 10px;
  letter-spacing: 0.1em;
}
.story-note {
  margin: 16px 0 0;
  color: var(--color-text-muted);
  font-size: 11px;
}
.auth-network-note {
  margin: 24px 0 0;
  padding-top: 20px;
  border-top: 1px solid var(--color-border);
  color: var(--color-text-muted);
  font-size: 12px;
  line-height: 1.8;
}

h2 {
  margin: 0;
  color: var(--color-text);
  font-size: 26px;
  font-weight: 650;
  line-height: 1.3;
  letter-spacing: -0.03em;
}

.description {
  margin: var(--space-1) 0 0;
  color: var(--color-text-muted);
  line-height: 1.5;
}

form,
label {
  display: grid;
  gap: var(--space-1);
}

form {
  gap: var(--space-2);
}

label {
  color: var(--color-text);
  font-size: 14px;
  font-weight: 600;
}

input {
  width: 100%;
  min-height: 48px;
  padding: var(--space-1) var(--space-2);
  border: 1px solid var(--color-border-strong);
  border-radius: var(--radius-md);
  outline: none;
  background: var(--color-surface);
  color: var(--color-text);
  transition:
    border-color var(--transition-fast),
    box-shadow var(--transition-fast);
}

input:hover {
  border-color: var(--color-border-strong);
}

input:focus {
  border-color: var(--color-brand);
  box-shadow: 0 0 0 3px var(--color-focus);
}

button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-1);
  min-height: 48px;
  border: 0;
  border-radius: var(--radius-md);
  padding: var(--space-1) var(--space-2);
  background: var(--color-action);
  color: var(--color-on-action);
  cursor: pointer;
  font-weight: 600;
  transition:
    background-color var(--transition-fast),
    color var(--transition-fast);
}

button:hover:not(:disabled) {
  background: var(--color-action-hover);
}

button:focus-visible {
  outline: 3px solid var(--color-focus);
  outline-offset: 2px;
}

button:disabled {
  cursor: wait;
  opacity: 0.6;
}

.text-button {
  width: 100%;
  min-height: 40px;
  margin-top: var(--space-1);
  background: transparent;
  color: var(--color-brand);
  font-size: 14px;
}

.text-button:hover:not(:disabled) {
  background: var(--color-brand-soft);
}

.account-switch {
  color: var(--color-text-muted);
  font-size: 12px;
}

.error {
  display: flex;
  align-items: flex-start;
  gap: var(--space-1);
  margin: 0 0 16px;
  padding: var(--space-2);
  border: 1px solid var(--color-danger-border);
  border-radius: var(--radius-md);
  background: var(--color-danger-soft);
  color: var(--color-danger);
  font-size: 14px;
  line-height: 1.5;
}

.error svg {
  flex: 0 0 auto;
  margin-top: 2px;
}

.button-spinner {
  animation: app-loading-spin 0.8s linear infinite;
}

@media (max-width: 520px) {
  .auth-page {
    padding: var(--space-5) var(--space-2);
  }

  .auth-card {
    width: 100%;
  }
}

@media (prefers-reduced-motion: reduce) {
  .button-spinner {
    animation: none;
  }
}
@media (max-width: 800px) {
  .auth-layout {
    grid-template-columns: minmax(0, 1fr);
    max-width: 520px;
    gap: 32px;
  }
  .auth-story h1 {
    font-size: clamp(30px, 7vw, 42px);
  }
  .story-eyebrow {
    margin-top: 28px;
  }
  .privacy-preview {
    display: none;
  }
  .desktop-break {
    display: none;
  }
  .story-description {
    margin-bottom: 12px;
  }
}

@media (max-width: 420px) {
  .auth-card {
    padding: 24px 20px;
  }
  .story-eyebrow {
    font-size: 10px;
    letter-spacing: 0.08em;
  }
}
</style>
