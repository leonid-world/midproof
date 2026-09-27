import { computed, onBeforeUnmount, ref } from 'vue'
import {
  parseAuthorizationRequest,
  signRoleAuthorization,
} from '../services/midnight/roleAuthorization'

export function useMidnightRoleAuthorization() {
  const requestText = ref('')
  const authorizationResponse = ref(null)
  const errorMessage = ref('')
  const copyMessage = ref('')
  const isSigning = ref(false)
  const clockTick = ref(Date.now())
  let operationId = 0
  let clipboardOperationId = 0
  let isUnmounted = false

  const clockTimer = setInterval(() => {
    clockTick.value = Date.now()
  }, 1_000)

  const parsedState = computed(() => {
    void clockTick.value
    if (!requestText.value.trim()) return Object.freeze({ request: null, error: '' })
    try {
      return Object.freeze({ request: parseAuthorizationRequest(requestText.value), error: '' })
    } catch (error) {
      return Object.freeze({
        request: null,
        error: error?.message ?? 'Authorization request 형식을 확인해 주세요.',
      })
    }
  })

  const requestPreview = computed(() => parsedState.value.request)
  const validationMessage = computed(() => parsedState.value.error)
  const responseText = computed(() =>
    authorizationResponse.value ? JSON.stringify(authorizationResponse.value) : '',
  )
  const secondsRemaining = computed(() => {
    if (!requestPreview.value) return 0
    const expiresAt = Number(requestPreview.value.message.expiresAt)
    return Math.max(0, expiresAt - Math.floor(clockTick.value / 1_000))
  })

  function invalidatePendingOperation() {
    operationId += 1
  }

  function resetAuthorization() {
    invalidatePendingOperation()
    clipboardOperationId += 1
    authorizationResponse.value = null
    errorMessage.value = ''
    copyMessage.value = ''
  }

  function clearRequest() {
    requestText.value = ''
    resetAuthorization()
  }

  function clearResponse() {
    clipboardOperationId += 1
    authorizationResponse.value = null
    copyMessage.value = ''
  }

  async function signAuthorization() {
    if (isSigning.value) return

    let request
    try {
      request = parseAuthorizationRequest(requestText.value)
    } catch (error) {
      resetAuthorization()
      errorMessage.value = error?.message ?? 'Authorization request 형식을 확인해 주세요.'
      return
    }

    invalidatePendingOperation()
    const currentOperationId = operationId
    authorizationResponse.value = null
    errorMessage.value = ''
    copyMessage.value = ''
    isSigning.value = true

    try {
      const response = await signRoleAuthorization(request)
      if (currentOperationId !== operationId) return
      authorizationResponse.value = response
    } catch (error) {
      if (currentOperationId !== operationId) return
      errorMessage.value = error?.message ?? 'MetaMask 서명을 완료하지 못했습니다.'
    } finally {
      if (!isUnmounted) isSigning.value = false
    }
  }

  async function copyResponse() {
    if (!responseText.value) return
    clipboardOperationId += 1
    const currentClipboardOperationId = clipboardOperationId
    const text = responseText.value
    copyMessage.value = ''
    try {
      if (!navigator.clipboard?.writeText) throw new Error('Clipboard API unavailable')
      await navigator.clipboard.writeText(text)
      if (currentClipboardOperationId !== clipboardOperationId || isUnmounted) return
      copyMessage.value = '한 줄 Authorization response JSON을 복사했습니다.'
    } catch {
      if (currentClipboardOperationId !== clipboardOperationId || isUnmounted) return
      copyMessage.value = '복사하지 못했습니다. 응답을 직접 선택해 복사해 주세요.'
    }
  }

  onBeforeUnmount(() => {
    isUnmounted = true
    invalidatePendingOperation()
    clipboardOperationId += 1
    clearInterval(clockTimer)
  })

  return {
    requestText,
    requestPreview,
    authorizationResponse,
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
  }
}
