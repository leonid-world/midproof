<script setup>
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { CircleAlert, Copy, LogOut, RefreshCw, UserRound, WalletCards } from '@lucide/vue'
import { useAuthStore } from '../stores/auth'
import { useWalletStore } from '../stores/wallet'

const router = useRouter()
const auth = useAuthStore()
const wallet = useWalletStore()

const isLoading = ref(true)
const isWalletLoading = ref(false)
const profileError = ref('')
const walletError = ref('')
const copyMessage = ref('')

const email = computed(() => auth.user?.email ?? '-')

onMounted(loadProfile)

async function loadProfile() {
  isLoading.value = true
  profileError.value = ''
  walletError.value = ''

  try {
    const user = await auth.loadUser()
    if (!user) {
      await logout()
      return
    }
  } catch (error) {
    if (error?.status === 401) {
      await logout()
      return
    }
    profileError.value = error?.message ?? '내 정보를 불러오지 못했습니다.'
  }

  if (!profileError.value) await loadWallet()
  isLoading.value = false
}

async function loadWallet() {
  walletError.value = ''
  isWalletLoading.value = true
  try {
    await wallet.loadWallet()
  } catch (error) {
    walletError.value = error?.message ?? '회사 지갑 정보를 불러오지 못했습니다.'
  } finally {
    isWalletLoading.value = false
  }
}

async function copyWalletAddress() {
  copyMessage.value = ''
  try {
    await navigator.clipboard.writeText(wallet.walletAddress)
    copyMessage.value = '지갑 주소를 복사했습니다.'
  } catch {
    copyMessage.value = '주소를 복사하지 못했습니다. 직접 선택해 복사해 주세요.'
  }
}

async function logout() {
  auth.logout()
  wallet.clear()
  await router.replace({ name: 'login' })
}
</script>

<template>
  <main class="profile-page">
    <section class="profile-shell">
      <header class="profile-heading">
        <h1>내 정보</h1>
        <p>계정과 회사 지갑을 확인하세요.</p>
      </header>

      <p v-if="isLoading" class="notice loading-state" role="status">
        내 정보를 불러오고 있습니다...
      </p>

      <div v-else-if="profileError" class="notice error" role="alert">
        <div>
          <CircleAlert aria-hidden="true" :size="20" />
          <span>{{ profileError }}</span>
        </div>
        <button type="button" @click="loadProfile">
          <RefreshCw aria-hidden="true" :size="16" />
          다시 시도
        </button>
      </div>

      <template v-else>
        <div class="information-surface">
          <article class="information-card">
            <div class="card-heading">
              <div class="card-title">
                <span class="section-icon" aria-hidden="true">
                  <UserRound :size="20" />
                </span>
                <div>
                  <span class="card-label">계정</span>
                  <h2>로그인 정보</h2>
                </div>
              </div>
              <span class="status connected">로그인됨</span>
            </div>
            <dl>
              <div>
                <dt>이메일</dt>
                <dd>{{ email }}</dd>
              </div>
            </dl>
          </article>

          <article class="information-card">
            <div class="card-heading">
              <div class="card-title">
                <span class="section-icon" aria-hidden="true">
                  <WalletCards :size="20" />
                </span>
                <div>
                  <span class="card-label">회사 지갑</span>
                  <h2>MetaMask 연결</h2>
                </div>
              </div>
              <span class="status" :class="{ connected: wallet.isConnected && !isWalletLoading }">
                {{ isWalletLoading ? '확인 중' : wallet.isConnected ? '연결됨' : '미연결' }}
              </span>
            </div>

            <p v-if="isWalletLoading" class="empty-wallet loading-state" role="status">
              회사 지갑 정보를 불러오고 있습니다...
            </p>
            <div v-else-if="walletError" class="wallet-error" role="alert">
              <p>
                <CircleAlert aria-hidden="true" :size="18" />
                <span>{{ walletError }}</span>
              </p>
              <button class="text-button" type="button" @click="loadWallet">
                <RefreshCw aria-hidden="true" :size="16" />
                다시 조회
              </button>
            </div>
            <template v-else-if="wallet.isConnected">
              <dl>
                <div>
                  <dt>등록된 지갑 주소</dt>
                  <dd class="wallet-address">{{ wallet.walletAddress }}</dd>
                </div>
              </dl>
              <button class="copy-button" type="button" @click="copyWalletAddress">
                <Copy aria-hidden="true" :size="16" />
                주소 복사
              </button>
              <p v-if="copyMessage" class="copy-message" role="status">{{ copyMessage }}</p>
            </template>
            <p v-else class="empty-wallet">대시보드에서 회사 지갑을 연결하세요.</p>
          </article>
        </div>

        <div class="profile-actions">
          <button type="button" @click="router.push({ name: 'dashboard' })">
            <WalletCards aria-hidden="true" :size="18" />
            지갑 관리
          </button>
          <button class="secondary" type="button" @click="logout">
            <LogOut aria-hidden="true" :size="18" />
            로그아웃
          </button>
        </div>
      </template>
    </section>
  </main>
</template>

<style scoped>
.profile-page {
  display: grid;
  min-height: 100%;
  place-items: start center;
  padding: var(--space-6) var(--space-3) var(--space-8);
}

.profile-shell {
  width: min(100%, 800px);
}

.profile-heading {
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

.profile-heading > p:last-child {
  margin: var(--space-1) 0 0;
  color: var(--color-text-muted);
}

.information-surface {
  overflow: hidden;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  background: var(--color-surface);
}

.information-card {
  min-width: 0;
  padding: var(--space-3);
}

.information-card + .information-card {
  border-top: 1px solid var(--color-border);
}

.card-heading {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--space-2);
}

.card-title {
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

.card-label {
  color: var(--color-text-muted);
  font-size: 12px;
  font-weight: 600;
}

h2 {
  margin: 2px 0 0;
  color: var(--color-text);
  font-size: 18px;
  font-weight: 600;
}

.status {
  display: inline-flex;
  flex: 0 0 auto;
  align-items: center;
  gap: var(--space-1);
  color: var(--color-text-muted);
  font-size: 12px;
  font-weight: 600;
}

.status::before {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--color-surface-subtle);
  content: '';
}

.status.connected {
  color: var(--color-brand);
}

.status.connected::before {
  background: var(--color-action);
}

dl {
  margin: var(--space-3) 0 0;
}

dl > div {
  display: grid;
  grid-template-columns: 160px minmax(0, 1fr);
  align-items: start;
  gap: var(--space-2);
  padding-top: var(--space-2);
  border-top: 1px solid var(--color-border);
}

dt {
  color: var(--color-text-muted);
  font-size: 13px;
}

dd {
  min-width: 0;
  margin: 0;
  overflow-wrap: anywhere;
  color: var(--color-text);
  font-size: 14px;
  font-weight: 600;
}

.wallet-address {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 14px;
}

button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-1);
  min-height: 42px;
  border: 0;
  border-radius: var(--radius-md);
  padding: var(--space-1) var(--space-2);
  background: var(--color-action);
  color: var(--color-on-action);
  cursor: pointer;
  font: inherit;
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

button:disabled {
  cursor: wait;
  opacity: 0.6;
}

.copy-button {
  margin-top: var(--space-2);
  border: 1px solid var(--color-border-strong);
  background: var(--color-surface);
  color: var(--color-text);
}

.copy-button:hover:not(:disabled) {
  background: var(--color-surface-subtle);
}

.copy-message,
.empty-wallet,
.wallet-error p {
  margin: var(--space-2) 0 0;
  color: var(--color-text-muted);
  font-size: 14px;
}

.wallet-error p {
  display: flex;
  align-items: flex-start;
  gap: var(--space-1);
  color: var(--color-danger);
}

.wallet-error p svg {
  flex: 0 0 auto;
  margin-top: 2px;
}

.wallet-error .text-button {
  min-height: auto;
  margin-top: var(--space-1);
  padding: 0;
  background: transparent;
  color: var(--color-brand);
}

.wallet-error .text-button:hover {
  background: transparent;
  color: var(--color-brand-hover);
  text-decoration: underline;
}

.notice {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-2);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  padding: var(--space-2);
  background: var(--color-surface);
  color: var(--color-text-muted);
}

.notice > div {
  display: flex;
  align-items: flex-start;
  gap: var(--space-1);
}

.notice > div svg {
  flex: 0 0 auto;
}

.notice button {
  flex: 0 0 auto;
}

.notice.error {
  border-color: var(--color-danger-border);
  background: var(--color-danger-soft);
  color: var(--color-danger);
}

.profile-actions {
  display: flex;
  justify-content: flex-end;
  gap: var(--space-1);
  margin-top: var(--space-3);
}

.profile-actions .secondary {
  border: 1px solid var(--color-border-strong);
  background: var(--color-surface);
  color: var(--color-text);
}

.profile-actions .secondary:hover {
  background: var(--color-surface-subtle);
}

@media (max-width: 680px) {
  .profile-page {
    padding: var(--space-4) var(--space-2) var(--space-6);
  }

  .information-card {
    padding: var(--space-2);
  }

  dl > div {
    grid-template-columns: 1fr;
    gap: var(--space-1);
  }

  .profile-actions {
    display: grid;
    grid-template-columns: 1fr 1fr;
  }
}
</style>
