import { computed, onBeforeUnmount, ref, unref } from 'vue'
import {
  parseProofCapability,
  resolveEligibilityCapability,
} from '../services/midnight/capabilityVerification'
import { assertCapabilityMatchesReceivable } from '../services/midnight/receivableCapabilityContext'

export function useMidnightCapabilityVerification(options = {}) {
  const {
    expectedContext = null,
    parseCapability = parseProofCapability,
    resolveCapability = resolveEligibilityCapability,
  } = options
  const capabilityText = ref('')
  const verification = ref(null)
  const errorMessage = ref('')
  const inputErrorMessage = ref('')
  const isLoading = ref(false)
  let requestController = null

  const validationMessage = computed(() => {
    if (!capabilityText.value.trim()) return ''
    try {
      const capability = parseCapability(capabilityText.value)
      assertCapabilityMatchesReceivable(capability, unref(expectedContext))
      return ''
    } catch (error) {
      return error?.message ?? '검증 권한 형식을 확인해 주세요.'
    }
  })

  function abortPendingRequest() {
    requestController?.abort()
    requestController = null
    isLoading.value = false
  }

  function resetVerification() {
    abortPendingRequest()
    verification.value = null
    errorMessage.value = ''
    inputErrorMessage.value = ''
  }

  function clearCapability() {
    capabilityText.value = ''
    resetVerification()
  }

  function importCapabilityText(text) {
    abortPendingRequest()
    capabilityText.value = ''
    verification.value = null
    errorMessage.value = ''
    inputErrorMessage.value = ''
    try {
      const capability = parseCapability(text)
      assertCapabilityMatchesReceivable(capability, unref(expectedContext))
      capabilityText.value = JSON.stringify(capability)
      return true
    } catch (error) {
      inputErrorMessage.value =
        error?.code === 'INVALID_PROOF_CAPABILITY'
          ? '검증 권한 형식이 올바르지 않습니다. 발급자가 전달한 파일이나 클립보드 값을 다시 확인해 주세요.'
          : (error?.message ?? '검증 권한 형식을 확인해 주세요.')
      return false
    }
  }

  async function verifyCapability() {
    let capability
    try {
      capability = parseCapability(capabilityText.value)
      assertCapabilityMatchesReceivable(capability, unref(expectedContext))
    } catch (error) {
      abortPendingRequest()
      verification.value = null
      errorMessage.value = error?.message ?? '검증 권한 형식을 확인해 주세요.'
      return
    }

    requestController?.abort()
    const controller = new AbortController()
    requestController = controller
    verification.value = null
    errorMessage.value = ''
    isLoading.value = true

    try {
      const response = await resolveCapability(capability, { signal: controller.signal })
      if (requestController !== controller) return
      verification.value = response
    } catch (error) {
      if (error?.name === 'AbortError' || requestController !== controller) return
      errorMessage.value = error?.message ?? 'Midnight 검증 권한을 확인하지 못했습니다.'
    } finally {
      if (requestController === controller) {
        requestController = null
        isLoading.value = false
      }
    }
  }

  onBeforeUnmount(clearCapability)

  return {
    capabilityText,
    verification,
    errorMessage,
    inputErrorMessage,
    isLoading,
    validationMessage,
    clearCapability,
    importCapabilityText,
    resetVerification,
    verifyCapability,
  }
}
