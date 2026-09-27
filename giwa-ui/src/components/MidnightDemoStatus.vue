<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { loadMidnightDemoConfig, midnightDemoRuntime } from '../services/midnight/demoRuntime'

const error = ref('')
const checking = ref(false)
const ready = computed(() => midnightDemoRuntime.value?.runtime.status === 'ready')
const readUnavailable = computed(
  () => midnightDemoRuntime.value?.runtime.code === 'READ_API_UNAVAILABLE',
)
const failed = computed(() => midnightDemoRuntime.value?.runtime.status === 'failed')
const verifierMismatch = computed(
  () => failed.value && midnightDemoRuntime.value?.runtime.code === 'CONTRACT_VERIFIER_MISMATCH',
)
const awaitingFunds = computed(
  () => midnightDemoRuntime.value?.runtime.code === 'AWAITING_TEST_FUNDS',
)
let timer
let disposed = false
const controller = new AbortController()

async function refresh() {
  clearTimeout(timer)
  if (checking.value || disposed) return
  checking.value = true
  try {
    await loadMidnightDemoConfig({ refresh: true, signal: controller.signal })
    error.value = ''
  } catch (cause) {
    if (!disposed) error.value = cause.message
  } finally {
    checking.value = false
    if (!disposed)
      timer = setTimeout(refresh, ready.value && !readUnavailable.value ? 60_000 : 10_000)
  }
}
onMounted(refresh)
onBeforeUnmount(() => {
  disposed = true
  clearTimeout(timer)
  controller.abort()
})
</script>

<template>
  <aside
    class="demo-status"
    :class="{ ready: ready && !error && !readUnavailable }"
    aria-live="polite"
  >
    <div>
      <strong>{{
        readUnavailable && !error
          ? '결과 조회 지연'
          : ready && !error
            ? '증명 준비 완료'
            : failed
              ? verifierMismatch
                ? '증명 서버 업데이트 필요'
                : '증명 서버 확인 필요'
              : awaitingFunds
                ? '테스트 토큰 대기 중'
                : '증명 준비 중'
      }}</strong>
      <p>
        {{
          error ||
          (readUnavailable
            ? '결과 조회가 지연되고 있습니다. 다시 증명하지 않고 기존 요청의 결과 확인을 재시도해 주세요.'
            : ready
              ? '가상 기업·가상 기관으로 실제 ZK 증명을 만듭니다.'
              : failed
                ? verifierMismatch
                  ? '증명 서버 업데이트가 필요합니다. 기존 요청과 저장 상태는 유지됩니다.'
                  : '서버를 다시 실행해 주세요. 저장된 상태는 유지됩니다.'
                : awaitingFunds
                  ? '최초 실행에 필요한 테스트 토큰을 기다립니다.'
                  : '서버가 자동으로 준비합니다. 잠시 기다려 주세요.')
        }}
      </p>
    </div>
    <button
      v-if="!ready || error || readUnavailable"
      type="button"
      :disabled="checking"
      @click="refresh"
    >
      {{ checking ? '확인 중…' : '다시 확인' }}
    </button>
  </aside>
</template>

<style scoped>
.demo-status {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  margin: 20px auto 0;
  padding: 16px 20px;
  max-width: 1180px;
  width: calc(100% - 40px);
  border: 1px solid var(--color-warning-border);
  border-radius: 12px;
  color: var(--color-warning);
  background: var(--color-warning-soft);
}
.demo-status.ready {
  border-color: var(--color-success-border);
  color: var(--color-success);
  background: var(--color-success-soft);
}
p {
  margin: 4px 0 0;
  font-size: 0.9rem;
  line-height: 1.5;
}
button {
  flex-shrink: 0;
  padding: 10px 14px;
  border: 1px solid currentColor;
  border-radius: 8px;
  color: inherit;
  background: transparent;
  cursor: pointer;
  font: inherit;
}
button:disabled {
  opacity: 0.6;
  cursor: wait;
}
@media (max-width: 600px) {
  .demo-status {
    align-items: flex-start;
    flex-direction: column;
  }
}
</style>
