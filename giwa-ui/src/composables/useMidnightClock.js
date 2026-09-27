import { onBeforeUnmount, onMounted, readonly, ref } from 'vue'

export function useMidnightClock() {
  const now = ref(Date.now())
  let timer
  const update = () => {
    now.value = Date.now()
  }
  onMounted(() => {
    timer = setInterval(update, 1000)
    document.addEventListener('visibilitychange', update)
  })
  onBeforeUnmount(() => {
    clearInterval(timer)
    document.removeEventListener('visibilitychange', update)
  })
  return readonly(now)
}

export function isMidnightExpired(validUntil, now) {
  return BigInt(validUntil) <= BigInt(Math.floor(now / 1000))
}
