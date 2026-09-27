import { computed, onScopeDispose, ref } from 'vue'
import { defineStore } from 'pinia'
import { apiRequest } from '../services/api'
import {
  captureAuthSession,
  assertAuthSessionCurrent,
  onAuthSessionChange,
  setAuthSessionToken,
} from '../services/authSession'

export const useAuthStore = defineStore('auth', () => {
  const initialSession = captureAuthSession()
  const token = ref(initialSession.token)
  const sessionGeneration = ref(initialSession.generation)
  const user = ref(null)
  const isAuthenticated = computed(() => Boolean(token.value))
  // Display/routing hint only. Spring validates the signed scope on every request.
  const isDemoSession = computed(() => {
    try {
      const payload = token.value?.split('.')[1]
      return Boolean(
        payload &&
        JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/'))).scope === 'midnight:demo',
      )
    } catch {
      return false
    }
  })
  let userRequest = null
  let userRequestToken = null

  onScopeDispose(
    onAuthSessionChange((session) => {
      token.value = session.token
      sessionGeneration.value = session.generation
      user.value = null
      userRequest = null
      userRequestToken = null
    }),
  )

  async function authenticate(path, credentials) {
    const session = captureAuthSession()
    const body = await apiRequest(path, {
      method: 'POST',
      auth: false,
      body: credentials,
    })

    assertAuthSessionCurrent(session)
    setAuthSessionToken(body.accessToken)
    user.value = body.user
  }

  function login(credentials) {
    return authenticate('/auth/login', credentials)
  }

  function loginDemo(role) {
    return authenticate('/auth/demo-login', { role })
  }

  function signup(credentials) {
    return authenticate('/auth/signup', credentials)
  }

  async function loadUser() {
    if (!token.value) {
      user.value = null
      return null
    }
    if (user.value) return user.value

    const session = captureAuthSession()
    const requestedToken = session.generation
    if (!userRequest || userRequestToken !== requestedToken) {
      userRequestToken = requestedToken
      const request = apiRequest('/auth/me', { session })
        .then((body) => {
          assertAuthSessionCurrent(session)
          user.value = body
          return body
        })
        .finally(() => {
          if (userRequest === request) {
            userRequest = null
            userRequestToken = null
          }
        })
      userRequest = request
    }
    return userRequest
  }

  function logout() {
    setAuthSessionToken(null)
  }

  return {
    token,
    sessionGeneration,
    user,
    isAuthenticated,
    isDemoSession,
    login,
    loginDemo,
    signup,
    loadUser,
    logout,
  }
})
