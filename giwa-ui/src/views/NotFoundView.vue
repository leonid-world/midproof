<script setup>
import { computed } from 'vue'
import { ArrowRight, SearchX } from '@lucide/vue'
import { useAuthStore } from '../stores/auth'

const auth = useAuthStore()
const destination = computed(() =>
  auth.isAuthenticated ? { name: 'dashboard' } : { name: 'login' },
)
const destinationLabel = computed(() =>
  auth.isAuthenticated ? '대시보드로 이동' : '로그인으로 이동',
)
</script>

<template>
  <main class="not-found-page" aria-labelledby="not-found-title">
    <section class="not-found-card">
      <div class="not-found-brand" aria-label="MidProof">
        <img
          class="midnight-wordmark"
          src="/midproof-logo.svg"
          alt="MidProof"
          width="130"
          height="28"
        />
      </div>
      <span class="not-found-icon" aria-hidden="true">
        <SearchX :size="24" />
      </span>
      <strong class="error-code">404</strong>
      <h1 id="not-found-title">페이지를 찾을 수 없습니다.</h1>
      <p class="description">주소를 확인하거나 시작 화면으로 돌아가세요.</p>
      <RouterLink :to="destination">
        <span>{{ destinationLabel }}</span>
        <ArrowRight aria-hidden="true" :size="18" />
      </RouterLink>
    </section>
  </main>
</template>

<style scoped>
.not-found-page {
  display: grid;
  min-height: 100%;
  place-items: center;
  padding: var(--space-8) var(--space-3);
}

.not-found-card {
  width: min(100%, 520px);
}

.not-found-brand {
  display: inline-flex;
  align-items: center;
  gap: var(--space-1);
  color: var(--color-text);
  font-size: 14px;
}

.not-found-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: var(--radius-md);
  background: var(--color-action);
  color: var(--color-on-action);
}

.not-found-brand strong {
  font-weight: 600;
}

.not-found-icon {
  display: flex;
  width: 48px;
  height: 48px;
  margin-top: var(--space-6);
  background: var(--color-brand-soft);
  color: var(--color-brand);
}

.error-code {
  display: block;
  margin-top: var(--space-2);
  color: var(--color-text-muted);
  font-size: clamp(48px, 10vw, 72px);
  font-weight: 700;
  line-height: 1;
  letter-spacing: -0.04em;
}

h1 {
  margin: var(--space-2) 0 0;
  color: var(--color-text);
  font-size: clamp(28px, 6vw, 32px);
  font-weight: 700;
  line-height: 1.25;
  letter-spacing: -0.02em;
}

.description {
  margin: var(--space-2) 0 var(--space-4);
  color: var(--color-text-muted);
  line-height: 1.5;
}

a {
  display: inline-flex;
  align-items: center;
  gap: var(--space-1);
  min-height: 44px;
  border-radius: var(--radius-md);
  padding: var(--space-1) var(--space-2);
  background: var(--color-action);
  color: var(--color-on-action);
  font-weight: 600;
  text-decoration: none;
  transition: background-color var(--transition-fast);
}

a:hover {
  background: var(--color-action-hover);
}

a:focus-visible {
  outline: 3px solid var(--color-focus);
  outline-offset: 2px;
}

@media (max-width: 520px) {
  .not-found-page {
    padding: var(--space-5) var(--space-2);
  }
}
</style>
