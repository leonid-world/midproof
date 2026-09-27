<script setup>
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import {
  CheckCircle2,
  ChevronRight,
  CircleAlert,
  FileText,
  HandCoins,
  Link2,
  LogOut,
  ReceiptText,
  RefreshCw,
  ShieldCheck,
  WalletCards,
  X,
} from '@lucide/vue'
import { useAuthStore } from '../stores/auth'
import { useWalletStore } from '../stores/wallet'
import { isMidnightPocEnabled } from '../services/midnight/config'

const router = useRouter()
const auth = useAuthStore()
const wallet = useWalletStore()
const errorMessage = ref('')
const errorCode = ref('')
const successMessage = ref('')
const isSelecting = ref(false)
const isConnecting = ref(false)
const isWalletLoading = ref(true)
const walletLoadFailed = ref(false)

onMounted(loadWalletState)

async function loadWalletState() {
  errorMessage.value = ''
  errorCode.value = ''
  isWalletLoading.value = true
  walletLoadFailed.value = false
  try {
    await wallet.loadWallet()
  } catch (error) {
    walletLoadFailed.value = true
    showError(error)
  } finally {
    isWalletLoading.value = false
  }
}

async function selectWalletAccount() {
  errorMessage.value = ''
  errorCode.value = ''
  successMessage.value = ''
  isSelecting.value = true
  try {
    await wallet.selectAccount()
  } catch (error) {
    showError(error)
  } finally {
    isSelecting.value = false
  }
}

async function confirmWalletConnection() {
  errorMessage.value = ''
  errorCode.value = ''
  successMessage.value = ''
  isConnecting.value = true
  try {
    await wallet.confirmConnection()
    successMessage.value = '회사 지갑이 연결되었습니다.'
  } catch (error) {
    showError(error)
  } finally {
    isConnecting.value = false
  }
}

function cancelWalletSelection() {
  wallet.clearPending()
  errorMessage.value = ''
  errorCode.value = ''
}

function showError(error) {
  errorMessage.value = error.message ?? '요청을 처리하지 못했습니다.'
  errorCode.value = error.code ?? ''
}

function logout() {
  auth.logout()
  wallet.clear()
  router.push({ name: 'login' })
}
</script>

<template>
  <main class="dashboard">
    <section class="dashboard-shell">
      <header class="page-heading">
        <p class="workspace-label">MIDPROOF</p>
        <h1>대시보드</h1>
        <p class="description">재무 검증과 채권 업무를 시작하세요.</p>
      </header>

      <section class="wallet-card" aria-labelledby="wallet-section-title">
        <div class="section-heading">
          <span class="section-icon" aria-hidden="true">
            <WalletCards :size="20" />
          </span>
          <div>
            <span>회사 지갑</span>
            <h2 id="wallet-section-title">MetaMask 연결</h2>
          </div>
        </div>

        <div class="wallet-summary">
          <span>현재 연결 상태</span>
          <strong v-if="isWalletLoading" class="loading-state" role="status">
            회사 지갑 확인 중...
          </strong>
          <strong v-else-if="wallet.isConnected" class="wallet-address">
            {{ wallet.walletAddress }}
          </strong>
          <strong v-else-if="walletLoadFailed">지갑 상태 확인 실패</strong>
          <strong v-else>연결된 지갑 없음</strong>
        </div>

        <button
          class="primary-action"
          v-if="!wallet.hasPendingWallet"
          type="button"
          :disabled="isSelecting || isWalletLoading || walletLoadFailed"
          @click="selectWalletAccount"
        >
          <WalletCards aria-hidden="true" :size="18" />
          {{
            isSelecting
              ? 'MetaMask 확인 중...'
              : wallet.isConnected
                ? '다른 계정 선택'
                : 'MetaMask 계정 선택'
          }}
        </button>

        <div
          v-if="wallet.hasPendingWallet && errorCode !== 'WALLET_ALREADY_MAPPED'"
          class="wallet-confirmation"
        >
          <span>선택한 MetaMask 계정</span>
          <strong class="wallet-address">{{ wallet.pendingWalletAddress }}</strong>
          <p>이 주소를 회사 지갑으로 연결하시겠습니까?</p>
          <div class="confirmation-actions">
            <button type="button" :disabled="isConnecting" @click="confirmWalletConnection">
              <Link2 aria-hidden="true" :size="18" />
              {{ isConnecting ? '연결 중...' : '이 지갑 연결' }}
            </button>
            <button
              class="secondary"
              type="button"
              :disabled="isSelecting"
              @click="selectWalletAccount"
            >
              <RefreshCw aria-hidden="true" :size="18" />
              다른 계정 선택
            </button>
            <button class="text-button" type="button" @click="cancelWalletSelection">
              <X aria-hidden="true" :size="18" />
              취소
            </button>
          </div>
        </div>
      </section>

      <div v-if="errorCode === 'WALLET_ALREADY_MAPPED'" class="conflict-alert" role="alert">
        <CircleAlert class="alert-icon" aria-hidden="true" :size="20" />
        <div>
          <strong>이미 등록된 MetaMask 지갑입니다.</strong>
          <p>{{ wallet.pendingWalletAddress }}</p>
          <p>다른 회사에서 사용 중입니다. 이 회사의 MetaMask 계정을 선택하세요.</p>
          <div class="confirmation-actions">
            <button type="button" :disabled="isSelecting" @click="selectWalletAccount">
              <RefreshCw aria-hidden="true" :size="18" />
              {{ isSelecting ? 'MetaMask 확인 중...' : '다른 계정 선택' }}
            </button>
            <button class="text-button danger" type="button" @click="cancelWalletSelection">
              <X aria-hidden="true" :size="18" />
              닫기
            </button>
          </div>
        </div>
      </div>
      <div v-else-if="errorMessage" class="error" role="alert">
        <CircleAlert class="alert-icon" aria-hidden="true" :size="20" />
        <div>
          <span>{{ errorMessage }}</span>
          <button
            v-if="walletLoadFailed"
            class="text-button"
            type="button"
            :disabled="isWalletLoading"
            @click="loadWalletState"
          >
            <RefreshCw aria-hidden="true" :size="16" />
            {{ isWalletLoading ? '조회 중...' : '지갑 상태 다시 조회' }}
          </button>
        </div>
      </div>
      <p v-if="successMessage" class="success" role="status">
        <CheckCircle2 aria-hidden="true" :size="20" />
        <span>{{ successMessage }}</span>
      </p>

      <nav class="service-section" aria-label="주요 업무">
        <div class="service-heading">
          <h2>주요 업무</h2>
        </div>
        <div class="service-actions">
          <button
            v-if="isMidnightPocEnabled"
            class="midnight-service"
            type="button"
            @click="router.push({ name: 'midnight' })"
          >
            <ShieldCheck class="service-icon" aria-hidden="true" :size="20" />
            <span>
              <strong>재무 검증</strong>
              <small> 기준을 요청하고 당사자의 응답을 확인합니다. </small>
            </span>
            <ChevronRight class="service-chevron" aria-hidden="true" :size="18" />
          </button>
          <button
            type="button"
            :disabled="!wallet.isConnected || isWalletLoading"
            @click="router.push({ name: 'receivables' })"
          >
            <FileText class="service-icon" aria-hidden="true" :size="20" />
            <span>
              <strong>매출채권 관리</strong>
              <small>채권 등록·확인·토큰화</small>
            </span>
            <ChevronRight class="service-chevron" aria-hidden="true" :size="18" />
          </button>
          <button
            type="button"
            :disabled="!wallet.isConnected || isWalletLoading"
            @click="router.push({ name: 'funding' })"
          >
            <HandCoins class="service-icon" aria-hidden="true" :size="20" />
            <span>
              <strong>토큰화 채권 펀딩</strong>
              <small>채권을 선택해 자금을 공급합니다.</small>
            </span>
            <ChevronRight class="service-chevron" aria-hidden="true" :size="18" />
          </button>
          <button
            type="button"
            :disabled="!wallet.isConnected || isWalletLoading"
            @click="router.push({ name: 'repayment' })"
          >
            <ReceiptText class="service-icon" aria-hidden="true" :size="20" />
            <span>
              <strong>매출채권 상환</strong>
              <small>현재 NFT 소유자에게 상환합니다.</small>
            </span>
            <ChevronRight class="service-chevron" aria-hidden="true" :size="18" />
          </button>
        </div>
      </nav>

      <div class="page-actions">
        <button class="logout-button" type="button" @click="logout">
          <LogOut aria-hidden="true" :size="18" />
          로그아웃
        </button>
      </div>
    </section>
  </main>
</template>

<style scoped>
.dashboard {
  min-height: 100%;
  padding: var(--space-6) var(--space-3) var(--space-8);
}

.dashboard-shell {
  width: min(100%, 880px);
  margin: 0 auto;
}

.page-heading {
  margin-bottom: var(--space-4);
}

h1 {
  margin: 0;
  color: var(--color-text);
  font-size: 32px;
  font-weight: 700;
  line-height: 1.25;
  letter-spacing: -0.02em;
}

.description {
  margin: var(--space-1) 0 0;
  color: var(--color-text-muted);
  line-height: 1.5;
}

.wallet-card {
  padding: var(--space-3);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  background: var(--color-surface);
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

.section-heading > div > span,
.wallet-summary > span {
  color: var(--color-text-muted);
  font-size: 13px;
}

h2 {
  margin: 2px 0 0;
  color: var(--color-text);
  font-size: 18px;
  font-weight: 600;
}

.wallet-summary {
  display: grid;
  gap: var(--space-1);
  margin-top: var(--space-3);
  padding-top: var(--space-3);
  border-top: 1px solid var(--color-border);
}

.wallet-summary strong {
  overflow-wrap: anywhere;
  color: var(--color-text);
  font-size: 14px;
}

.wallet-address {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 14px;
  line-height: 1.55;
}

button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-1);
  min-height: 44px;
  border: 0;
  border-radius: var(--radius-md);
  padding: var(--space-1) var(--space-2);
  background: var(--color-action);
  color: var(--color-on-action);
  cursor: pointer;
  font-weight: 600;
  transition:
    background-color var(--transition-fast),
    border-color var(--transition-fast),
    color var(--transition-fast);
}

button:hover:not(:disabled) {
  background: var(--color-action-hover);
}

button:focus-visible {
  outline: 3px solid var(--color-focus);
  outline-offset: 2px;
}

.primary-action {
  margin-top: var(--space-2);
}

.wallet-confirmation {
  display: grid;
  gap: var(--space-1);
  margin-top: var(--space-3);
  padding-top: var(--space-3);
  border-top: 1px solid var(--color-border);
}

.wallet-confirmation p {
  margin: 0;
  color: var(--color-text-muted);
}

.wallet-confirmation > span {
  color: var(--color-text-muted);
  font-size: 13px;
}

.confirmation-actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-1);
}

.confirmation-actions button {
  margin-top: var(--space-1);
}

.secondary {
  border: 1px solid var(--color-border-strong);
  background: var(--color-surface);
  color: var(--color-text);
}

.secondary:hover:not(:disabled) {
  border-color: var(--color-border-strong);
  background: var(--color-surface-subtle);
}

.text-button {
  background: transparent;
  color: var(--color-text-muted);
}

.text-button:hover:not(:disabled) {
  background: var(--color-surface-subtle);
  color: var(--color-text);
}

.conflict-alert {
  display: flex;
  gap: var(--space-2);
  margin-top: var(--space-2);
  padding: var(--space-2);
  border: 1px solid var(--color-danger-border);
  border-radius: var(--radius-md);
  background: var(--color-danger-soft);
}

.conflict-alert strong,
.conflict-alert p {
  color: var(--color-danger);
}

.conflict-alert p {
  margin: var(--space-1) 0 0;
  line-height: 1.55;
}

.alert-icon {
  flex: 0 0 auto;
  color: var(--color-danger);
}

.danger {
  color: var(--color-danger);
}

button:disabled {
  cursor: not-allowed;
  opacity: 0.55;
}

.error {
  display: flex;
  align-items: flex-start;
  gap: var(--space-2);
  margin-top: var(--space-2);
  padding: var(--space-2);
  border: 1px solid var(--color-danger-border);
  border-radius: var(--radius-md);
  background: var(--color-danger-soft);
  color: var(--color-danger);
}

.error .text-button {
  justify-self: start;
  min-height: auto;
  margin-top: var(--space-1);
  padding: 0;
  color: var(--color-danger);
}

.error .text-button:hover:not(:disabled) {
  background: transparent;
  color: var(--color-danger);
  text-decoration: underline;
}

.success {
  display: flex;
  align-items: center;
  gap: var(--space-1);
  margin-top: var(--space-2);
  padding: var(--space-2);
  border: 1px solid var(--color-success-border);
  border-radius: var(--radius-md);
  background: var(--color-success-soft);
  color: var(--color-success);
}

.service-section {
  margin-top: var(--space-4);
}

.service-heading {
  margin-bottom: var(--space-2);
}

.service-heading h2 {
  margin: 0;
}

.service-heading p {
  margin: var(--space-1) 0 0;
  color: var(--color-text-muted);
  font-size: 14px;
}

.service-actions {
  overflow: hidden;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  background: var(--color-surface);
}

.service-actions button {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  width: 100%;
  min-height: 72px;
  gap: var(--space-2);
  padding: var(--space-2);
  border-radius: 0;
  background: var(--color-surface);
  color: var(--color-text);
  text-align: left;
}

.service-actions button + button {
  border-top: 1px solid var(--color-border);
}

.service-actions button:hover:not(:disabled) {
  background: var(--color-surface-subtle);
}

.service-actions button > span {
  display: grid;
  gap: 2px;
}

.service-actions strong {
  font-size: 14px;
  font-weight: 600;
}

.service-actions small {
  color: var(--color-text-muted);
  font-size: 13px;
  font-weight: 400;
}

.service-icon {
  color: var(--color-brand);
}

.service-chevron {
  color: var(--color-text-muted);
}

.page-actions {
  display: flex;
  justify-content: flex-end;
  margin-top: var(--space-3);
}

.logout-button {
  border: 1px solid var(--color-border);
  background: transparent;
  color: var(--color-text-muted);
}

.logout-button:hover:not(:disabled) {
  border-color: var(--color-border-strong);
  background: var(--color-surface);
  color: var(--color-text);
}

@media (max-width: 600px) {
  .dashboard {
    padding: var(--space-4) var(--space-2) var(--space-6);
  }

  .confirmation-actions {
    display: grid;
  }

  .confirmation-actions button {
    width: 100%;
  }

  .service-actions button {
    grid-template-columns: auto minmax(0, 1fr) auto;
    min-height: 80px;
  }

  .service-actions small {
    line-height: 1.4;
  }
}
.workspace-label {
  margin: 0 0 12px;
  color: var(--color-brand);
  font-size: 11px;
  letter-spacing: 0.14em;
  font-weight: 600;
}
.service-actions .midnight-service {
  border-color: var(--color-brand-border);
  background: var(--color-brand-soft);
}
</style>
