// Session identity only. Never put proof material in this module or browser storage.
let token = globalThis.localStorage?.getItem('accessToken') ?? null
let generation = 0
const listeners = new Set()

function synchronize(next, force = false) {
  if (!force && next === token) return
  token = next
  generation += 1
  const snapshot = Object.freeze({ token, generation })
  for (const listener of listeners) listener(snapshot)
}

export function captureAuthSession() {
  synchronize(globalThis.localStorage?.getItem('accessToken') ?? null)
  return Object.freeze({ token, generation })
}

export function isAuthSessionCurrent(snapshot) {
  const current = captureAuthSession()
  return snapshot.token === current.token && snapshot.generation === current.generation
}

export function assertAuthSessionCurrent(snapshot) {
  if (!isAuthSessionCurrent(snapshot)) {
    const error = new Error('로그인 계정이 변경되었습니다. 현재 계정에서 다시 확인해 주세요.')
    error.code = 'AUTH_SESSION_CHANGED'
    throw error
  }
}

export function setAuthSessionToken(value) {
  if (value) localStorage.setItem('accessToken', value)
  else localStorage.removeItem('accessToken')
  // Repeated logout is a no-op; every login still invalidates older requests,
  // even if the server returns the same token for the new session.
  synchronize(value || null, Boolean(value))
}

export function onAuthSessionChange(listener) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

globalThis.addEventListener?.('storage', (event) => {
  if (event.key === 'accessToken' || event.key === null) captureAuthSession()
})
