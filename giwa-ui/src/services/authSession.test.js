import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  captureAuthSession,
  isAuthSessionCurrent,
  onAuthSessionChange,
  setAuthSessionToken,
} from './authSession'

afterEach(() => setAuthSessionToken(null))

describe('session invalidation boundaries', () => {
  it('invalidates logout once and does not notify or remount again for repeated logout', () => {
    setAuthSessionToken('account-a')
    const authenticated = captureAuthSession()
    const listener = vi.fn()
    const unsubscribe = onAuthSessionChange(listener)
    try {
      setAuthSessionToken(null)
      const loggedOut = captureAuthSession()
      setAuthSessionToken(null)
      setAuthSessionToken(null)
      expect(isAuthSessionCurrent(authenticated)).toBe(false)
      expect(captureAuthSession()).toEqual(loggedOut)
      expect(listener).toHaveBeenCalledTimes(1)
      expect(localStorage.getItem('accessToken')).toBeNull()
    } finally {
      unsubscribe()
    }
  })

  it('still invalidates stale work when a new login returns the same non-null token', () => {
    setAuthSessionToken('account-a')
    const previous = captureAuthSession()
    setAuthSessionToken('account-a')
    expect(isAuthSessionCurrent(previous)).toBe(false)
    expect(captureAuthSession()).toEqual({
      token: 'account-a',
      generation: previous.generation + 1,
    })
  })
})
