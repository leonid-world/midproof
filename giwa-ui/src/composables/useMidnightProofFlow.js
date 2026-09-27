import { computed, onBeforeUnmount, ref } from 'vue'
import { resolveEligibilityCapability } from '../services/midnight/capabilityVerification'
import {
  cancelProofSession,
  normalizeProofInput,
  readProofSessionStatus,
  requestProofChallenge,
  submitProofAuthorization,
} from '../services/midnight/proofBridge'
import { signRoleAuthorization } from '../services/midnight/roleAuthorization'

const POLL_DELAY_MS = 1_500
const STATUS_RANK = Object.freeze({
  attesting: 1,
  proving_and_submitting: 2,
  indexing: 3,
})
const PRE_PROOF_PHASES = new Set(['awaiting_signature', 'signing'])

function proofInputError(message) {
  const error = new Error(message)
  error.code = 'INVALID_PROOF_INPUT'
  return error
}

export function normalizeAnnualRevenueInput(value) {
  if (typeof value !== 'string' || value === '') return ''
  if (value.includes(',') && !/^(0|[1-9][0-9]{0,2}(?:,[0-9]{3})*)$/.test(value)) {
    throw proofInputError('연매출의 쉼표 위치를 확인해 주세요. 예: 500,000,000')
  }
  const canonical = value.replaceAll(',', '')
  if (!/^(0|[1-9][0-9]*)$/.test(canonical)) {
    throw proofInputError('연매출은 0 이상의 정수 KRW로 입력해 주세요.')
  }
  return canonical
}

export function formatAnnualRevenueInput(value) {
  const canonical = normalizeAnnualRevenueInput(value)
  return canonical.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
}

export function debtRatioPercentToBps(value) {
  if (typeof value !== 'string' || value === '') return ''
  const match = /^(0|[1-9][0-9]*)(?:\.([0-9]{1,2}))?$/.exec(value)
  if (!match) {
    throw proofInputError('부채비율은 % 단위로 소수 둘째 자리까지 입력해 주세요. 예: 85.5')
  }
  const fraction = (match[2] ?? '').padEnd(2, '0')
  return (BigInt(match[1]) * 100n + BigInt(fraction || '0')).toString()
}

export function useMidnightProofFlow(overrides = {}) {
  const dependencies = {
    cancelProofSession,
    normalizeProofInput,
    readProofSessionStatus,
    requestProofChallenge,
    resolveEligibilityCapability,
    signRoleAuthorization,
    submitProofAuthorization,
    ...overrides,
  }

  const onchainReceivableId = ref('')
  const subjectRole = ref('SELLER')
  const annualRevenueKrw = ref('')
  const debtRatioPercent = ref('')
  const overdueCount = ref('')
  const secretPin = ref('')
  const phase = ref('editing')
  const errorMessage = ref('')
  const errorCode = ref('')
  const failedAt = ref('')
  const authorizationRequest = ref(null)
  const expiresAt = ref('')
  const verification = ref(null)
  const proofCapability = ref(null)
  const shareableCapability = ref(null)
  const proofContext = ref(null)
  const bridgeStatus = ref('')
  const clockTick = ref(Date.now())

  let sessionId = ''
  let operationId = 0
  let requestController = null
  let pollTimer = null
  let proofWasAccepted = false
  let lastStatusRank = 0
  let isUnmounted = false

  function proofInputValue() {
    return {
      version: 1,
      onchainReceivableId: onchainReceivableId.value,
      subjectRole: subjectRole.value,
      annualRevenueKrw: normalizeAnnualRevenueInput(annualRevenueKrw.value),
      debtRatioBps: debtRatioPercentToBps(debtRatioPercent.value),
      overdueCount: overdueCount.value,
      secretPin: secretPin.value,
    }
  }

  const hasAnyPrivateInput = computed(() =>
    [annualRevenueKrw.value, debtRatioPercent.value, overdueCount.value, secretPin.value].some(
      (value) => value !== '',
    ),
  )

  const normalizedDebtRatioBps = computed(() => {
    try {
      return debtRatioPercentToBps(debtRatioPercent.value)
    } catch {
      return ''
    }
  })

  const shareableCapabilityText = computed(() =>
    shareableCapability.value ? JSON.stringify(shareableCapability.value) : '',
  )

  function privateFieldError(fieldName, rawValue, normalizeValue) {
    if (rawValue === '') return ''
    try {
      dependencies.normalizeProofInput({
        version: 1,
        onchainReceivableId: onchainReceivableId.value || '1',
        subjectRole: subjectRole.value,
        annualRevenueKrw: '0',
        debtRatioBps: '0',
        overdueCount: '0',
        secretPin: '0',
        [fieldName]: normalizeValue(rawValue),
      })
      return ''
    } catch (error) {
      return error?.message ?? '증명 입력 형식을 확인해 주세요.'
    }
  }

  const inputErrors = computed(() => ({
    annualRevenueKrw: privateFieldError(
      'annualRevenueKrw',
      annualRevenueKrw.value,
      normalizeAnnualRevenueInput,
    ),
    debtRatioPercent: privateFieldError(
      'debtRatioBps',
      debtRatioPercent.value,
      debtRatioPercentToBps,
    ),
    overdueCount: privateFieldError('overdueCount', overdueCount.value, (value) => value),
    secretPin: privateFieldError('secretPin', secretPin.value, (value) => value),
  }))

  const validationMessage = computed(() => {
    if (!hasAnyPrivateInput.value) return ''
    return Object.values(inputErrors.value).find(Boolean) ?? ''
  })

  const canRequestChallenge = computed(() => {
    return (
      phase.value === 'editing' &&
      onchainReceivableId.value !== '' &&
      annualRevenueKrw.value !== '' &&
      debtRatioPercent.value !== '' &&
      overdueCount.value !== '' &&
      secretPin.value !== '' &&
      !validationMessage.value
    )
  })

  const canCancelAwaitingSession = computed(
    () =>
      phase.value === 'proof_unknown' &&
      bridgeStatus.value === 'awaiting_authorization' &&
      sessionId !== '',
  )

  const secondsRemaining = computed(() => {
    if (!expiresAt.value) return 0
    return Math.max(
      0,
      Number(BigInt(expiresAt.value) - BigInt(Math.floor(clockTick.value / 1_000))),
    )
  })

  const isBusy = computed(() =>
    [
      'requesting_challenge',
      'signing',
      'submitting_proof',
      'attesting',
      'proving_and_submitting',
      'indexing',
      'resolving_result',
      'cancelling_session',
    ].includes(phase.value),
  )

  const currentStep = computed(() => {
    if (['editing', 'requesting_challenge'].includes(phase.value)) return 1
    if (['awaiting_signature', 'signing', 'expired'].includes(phase.value)) return 2
    if (
      [
        'submitting_proof',
        'attesting',
        'proving_and_submitting',
        'indexing',
        'proof_unknown',
        'cancelling_session',
        'failed',
        'cancelled',
      ].includes(phase.value) ||
      (phase.value === 'error' && failedAt.value !== 'resolver')
    ) {
      return 3
    }
    return 4
  })

  function clearPrivateInputs() {
    annualRevenueKrw.value = ''
    debtRatioPercent.value = ''
    overdueCount.value = ''
    secretPin.value = ''
  }

  function clearPollTimer() {
    if (pollTimer !== null) clearTimeout(pollTimer)
    pollTimer = null
  }

  function abortRequest() {
    requestController?.abort()
    requestController = null
  }

  function invalidateOperation() {
    operationId += 1
    abortRequest()
    clearPollTimer()
  }

  function clearBridgeMemory({ keepCapability = false } = {}) {
    sessionId = ''
    authorizationRequest.value = null
    expiresAt.value = ''
    bridgeStatus.value = ''
    proofWasAccepted = false
    lastStatusRank = 0
    if (!keepCapability) proofCapability.value = null
  }

  function setSafeError(error, fallback, at) {
    errorCode.value = typeof error?.code === 'string' ? error.code : ''
    errorMessage.value = error?.message ?? fallback
    failedAt.value = at
  }

  function proofContextMatchesCapability(capability) {
    const context = proofContext.value
    if (!context) return false
    return (
      capability.giwaChainId === context.giwaChainId &&
      capability.receivableFinanceAddress === context.receivableFinanceAddress &&
      capability.onchainReceivableId === context.onchainReceivableId &&
      capability.subjectRole === context.subjectRole &&
      capability.partyWallet === context.partyWallet &&
      `0x${capability.midnightContractAddress}` === context.midnightContractAddress
    )
  }

  async function resolvePublicResult(currentOperationId) {
    const capability = proofCapability.value
    if (!capability || !proofContextMatchesCapability(capability)) {
      phase.value = 'error'
      setSafeError(
        { code: 'PROOF_CAPABILITY_CONTEXT_MISMATCH' },
        '발급된 검증 권한이 서명한 채권 역할과 일치하지 않습니다.',
        'protocol',
      )
      proofCapability.value = null
      proofContext.value = null
      clearBridgeMemory()
      return
    }

    clearBridgeMemory({ keepCapability: true })
    phase.value = 'resolving_result'
    errorMessage.value = ''
    errorCode.value = ''
    failedAt.value = ''
    const controller = new AbortController()
    requestController = controller
    try {
      const result = await dependencies.resolveEligibilityCapability(capability, {
        signal: controller.signal,
      })
      if (currentOperationId !== operationId || isUnmounted) return
      if (result.result.providerId !== '2' || result.result.policyVersion !== '1') {
        phase.value = 'error'
        setSafeError(
          { code: 'UNEXPECTED_PROOF_POLICY' },
          'Provider 2 / 정책 v1 공개 결과가 아닙니다.',
          'protocol',
        )
        proofCapability.value = null
        proofContext.value = null
        return
      }
      verification.value = result
      shareableCapability.value = capability
      proofCapability.value = null
      proofContext.value = null
      phase.value = 'success'
    } catch (error) {
      if (currentOperationId !== operationId || error?.name === 'AbortError') return
      phase.value = 'error'
      setSafeError(error, 'Midnight 공개 원장 결과를 확인하지 못했습니다.', 'resolver')
    } finally {
      if (requestController === controller) requestController = null
    }
  }

  function scheduleStatusPoll(currentOperationId) {
    clearPollTimer()
    pollTimer = setTimeout(() => {
      pollTimer = null
      void checkProofStatus(currentOperationId)
    }, POLL_DELAY_MS)
  }

  async function handleBridgeStatus(status, currentOperationId) {
    if (currentOperationId !== operationId || isUnmounted) return
    bridgeStatus.value = status.status

    if (status.status === 'complete') {
      proofCapability.value = status.proofCapability
      await resolvePublicResult(currentOperationId)
      return
    }
    if (status.status === 'failed') {
      phase.value = 'error'
      setSafeError(status.error, status.error.message, 'proof')
      clearBridgeMemory()
      return
    }
    if (status.status === 'expired') {
      phase.value = 'expired'
      errorMessage.value = '지갑 서명 대기 시간이 지나 증명 세션이 만료되었습니다.'
      errorCode.value = 'PROOF_SESSION_EXPIRED'
      failedAt.value = 'proof'
      clearBridgeMemory()
      return
    }
    if (status.status === 'cancelled') {
      phase.value = 'cancelled'
      errorMessage.value = ''
      errorCode.value = ''
      failedAt.value = ''
      clearBridgeMemory()
      return
    }
    if (status.status === 'awaiting_authorization') {
      phase.value = 'proof_unknown'
      errorMessage.value =
        '서명 요청이 아직 제출되지 않은 상태임을 확인했습니다. 다시 제출하지 말고, 아래 버튼으로 이 대기 세션을 취소한 뒤 새로 시작해 주세요.'
      errorCode.value = 'PROOF_SUBMISSION_NOT_CONFIRMED'
      failedAt.value = 'proof'
      return
    }

    const rank = STATUS_RANK[status.status]
    if (!rank || rank < lastStatusRank) {
      phase.value = 'error'
      errorMessage.value = '로컬 증명 서비스가 올바르지 않은 단계 순서를 반환했습니다.'
      errorCode.value = 'PROOF_STATUS_REGRESSION'
      failedAt.value = 'protocol'
      proofContext.value = null
      clearBridgeMemory()
      return
    }
    lastStatusRank = rank
    proofWasAccepted = true
    phase.value = status.status
    errorMessage.value = ''
    errorCode.value = ''
    failedAt.value = ''
    scheduleStatusPoll(currentOperationId)
  }

  async function checkProofStatus(currentOperationId = operationId) {
    if (!sessionId || requestController || currentOperationId !== operationId) return
    const controller = new AbortController()
    requestController = controller
    try {
      const status = await dependencies.readProofSessionStatus(sessionId, {
        signal: controller.signal,
      })
      if (currentOperationId !== operationId) return
      await handleBridgeStatus(status, currentOperationId)
    } catch (error) {
      if (currentOperationId !== operationId || error?.name === 'AbortError') return
      if (error?.code === 'PROOF_SESSION_NOT_FOUND') {
        phase.value = 'error'
        setSafeError(error, '로컬 증명 세션을 찾지 못했습니다.', 'proof')
        proofContext.value = null
        clearBridgeMemory()
        return
      }
      if (error?.code === 'PROOF_SESSION_EXPIRED') {
        phase.value = 'expired'
        setSafeError(error, '지갑 서명 대기 시간이 지나 증명 세션이 만료되었습니다.', 'proof')
        proofContext.value = null
        clearBridgeMemory()
        return
      }
      phase.value = 'proof_unknown'
      setSafeError(
        error,
        '증명 제출 결과가 불명확합니다. 증명을 다시 보내지 말고 상태만 다시 확인해 주세요.',
        'proof',
      )
    } finally {
      if (requestController === controller) requestController = null
    }
  }

  async function cancelAwaitingSessionAndReset() {
    if (!canCancelAwaitingSession.value || requestController !== null) return
    const id = sessionId
    invalidateOperation()
    const currentOperationId = operationId
    phase.value = 'cancelling_session'
    errorMessage.value = ''
    errorCode.value = ''
    failedAt.value = ''
    const controller = new AbortController()
    requestController = controller
    try {
      const status = await dependencies.cancelProofSession(id, { signal: controller.signal })
      if (currentOperationId !== operationId || isUnmounted) return
      if (status.status !== 'cancelled') {
        throw Object.assign(new Error('대기 중인 증명 세션의 취소를 확인하지 못했습니다.'), {
          code: 'INVALID_PROOF_BRIDGE_RESPONSE',
        })
      }
      requestController = null
      clearPrivateInputs()
      verification.value = null
      shareableCapability.value = null
      proofContext.value = null
      clearBridgeMemory()
      phase.value = 'editing'
      errorMessage.value = ''
      errorCode.value = ''
      failedAt.value = ''
    } catch (error) {
      if (currentOperationId !== operationId || error?.name === 'AbortError') return
      if (error?.code === 'PROOF_SESSION_NOT_FOUND') {
        phase.value = 'error'
        setSafeError(error, '로컬 증명 세션을 찾지 못했습니다.', 'proof')
        proofContext.value = null
        clearBridgeMemory()
        return
      }
      phase.value = 'proof_unknown'
      bridgeStatus.value = 'awaiting_authorization'
      setSafeError(
        error,
        '대기 세션을 취소하지 못했습니다. 증명을 다시 제출하지 말고 상태를 다시 확인해 주세요.',
        'proof',
      )
    } finally {
      if (requestController === controller) requestController = null
    }
  }

  async function requestChallenge() {
    if (phase.value !== 'editing') return
    let input
    try {
      input = dependencies.normalizeProofInput(proofInputValue())
    } catch (error) {
      setSafeError(error, '증명 입력 형식을 확인해 주세요.', 'challenge')
      return
    }

    invalidateOperation()
    const currentOperationId = operationId
    phase.value = 'requesting_challenge'
    errorMessage.value = ''
    errorCode.value = ''
    failedAt.value = ''
    verification.value = null
    shareableCapability.value = null
    proofContext.value = null
    const controller = new AbortController()
    requestController = controller
    try {
      const challenge = await dependencies.requestProofChallenge(input, {
        signal: controller.signal,
      })
      if (currentOperationId !== operationId || isUnmounted) return
      clearPrivateInputs()
      sessionId = challenge.sessionId
      expiresAt.value = challenge.expiresAt
      authorizationRequest.value = challenge.authorizationRequest
      const message = challenge.authorizationRequest.message
      proofContext.value = Object.freeze({
        giwaChainId: challenge.authorizationRequest.domain.chainId,
        receivableFinanceAddress: message.receivableFinanceAddress,
        onchainReceivableId: message.onchainReceivableId,
        subjectRole: message.subjectRole,
        partyWallet: message.partyWallet,
        midnightContractAddress: message.midnightContractAddress,
      })
      proofWasAccepted = false
      lastStatusRank = 0
      clockTick.value = Date.now()
      phase.value = 'awaiting_signature'
    } catch (error) {
      if (currentOperationId !== operationId || error?.name === 'AbortError') return
      phase.value = 'editing'
      setSafeError(error, '로컬 서명 요청을 만들지 못했습니다.', 'challenge')
    } finally {
      if (requestController === controller) requestController = null
    }
  }

  async function authorizeAndProve() {
    if (phase.value !== 'awaiting_signature' || !authorizationRequest.value || !sessionId) return
    invalidateOperation()
    const currentOperationId = operationId
    phase.value = 'signing'
    errorMessage.value = ''
    errorCode.value = ''
    failedAt.value = ''
    let authorization
    try {
      authorization = await dependencies.signRoleAuthorization(authorizationRequest.value)
      if (currentOperationId !== operationId || isUnmounted) return
      authorizationRequest.value = null
      expiresAt.value = ''
      phase.value = 'submitting_proof'
      const controller = new AbortController()
      requestController = controller
      proofWasAccepted = true
      try {
        const status = await dependencies.submitProofAuthorization(sessionId, authorization, {
          signal: controller.signal,
        })
        if (currentOperationId !== operationId || isUnmounted) return
        await handleBridgeStatus(status, currentOperationId)
      } catch (error) {
        if (currentOperationId !== operationId || error?.name === 'AbortError') return
        if (requestController === controller) requestController = null
        phase.value = 'proof_unknown'
        setSafeError(
          error,
          '증명 제출 결과가 불명확합니다. 증명을 다시 보내지 않고 세션 상태를 확인합니다.',
          'proof',
        )
        await checkProofStatus(currentOperationId)
      } finally {
        if (requestController === controller) requestController = null
      }
    } catch (error) {
      if (currentOperationId !== operationId) return
      if (error?.code === 'AUTHORIZATION_EXPIRED') {
        expireAuthorizationSession()
        return
      }
      phase.value = 'awaiting_signature'
      setSafeError(error, 'MetaMask 승인 서명을 완료하지 못했습니다.', 'authorization')
    }
  }

  async function retryPublicResult() {
    if (phase.value !== 'error' || failedAt.value !== 'resolver' || !proofCapability.value) return
    invalidateOperation()
    await resolvePublicResult(operationId)
  }

  function bestEffortCancel(id) {
    if (!id) return
    void dependencies.cancelProofSession(id).catch(() => undefined)
  }

  function expireAuthorizationSession() {
    if (!sessionId || !PRE_PROOF_PHASES.has(phase.value)) return
    const id = sessionId
    invalidateOperation()
    clearBridgeMemory()
    phase.value = 'expired'
    errorCode.value = 'AUTHORIZATION_EXPIRED'
    errorMessage.value = '지갑 승인 요청이 만료되었습니다. 새 서명 요청을 만들어 주세요.'
    failedAt.value = 'authorization'
    bestEffortCancel(id)
  }

  function resetFlow() {
    const id = sessionId
    const shouldCancel = Boolean(id && !proofWasAccepted)
    invalidateOperation()
    clearPrivateInputs()
    verification.value = null
    shareableCapability.value = null
    proofContext.value = null
    clearBridgeMemory()
    phase.value = 'editing'
    errorMessage.value = ''
    errorCode.value = ''
    failedAt.value = ''
    if (shouldCancel) bestEffortCancel(id)
  }

  function setProofSubjectContext({ onchainReceivableId: nextId, subjectRole: nextRole }) {
    const normalizedId = String(nextId ?? '')
    const normalizedRole = nextRole === 'BUYER' ? 'BUYER' : 'SELLER'
    if (normalizedId === onchainReceivableId.value && normalizedRole === subjectRole.value) {
      return
    }

    const id = sessionId
    const shouldCancel = Boolean(id && !proofWasAccepted)
    invalidateOperation()
    clearPrivateInputs()
    verification.value = null
    shareableCapability.value = null
    proofContext.value = null
    clearBridgeMemory()
    onchainReceivableId.value = normalizedId
    subjectRole.value = normalizedRole
    phase.value = 'editing'
    errorMessage.value = ''
    errorCode.value = ''
    failedAt.value = ''
    if (shouldCancel) bestEffortCancel(id)
  }

  const clockTimer = setInterval(() => {
    clockTick.value = Date.now()
    if (PRE_PROOF_PHASES.has(phase.value) && expiresAt.value && secondsRemaining.value <= 0) {
      expireAuthorizationSession()
    }
  }, 1_000)

  onBeforeUnmount(() => {
    isUnmounted = true
    const id = sessionId
    const shouldCancel = Boolean(id && !proofWasAccepted)
    invalidateOperation()
    clearInterval(clockTimer)
    clearPrivateInputs()
    proofCapability.value = null
    shareableCapability.value = null
    proofContext.value = null
    clearBridgeMemory()
    if (shouldCancel) bestEffortCancel(id)
  })

  return {
    onchainReceivableId,
    subjectRole,
    annualRevenueKrw,
    debtRatioPercent,
    normalizedDebtRatioBps,
    overdueCount,
    secretPin,
    phase,
    errorMessage,
    errorCode,
    failedAt,
    authorizationRequest,
    verification,
    shareableCapability,
    shareableCapabilityText,
    bridgeStatus,
    inputErrors,
    validationMessage,
    canRequestChallenge,
    canCancelAwaitingSession,
    hasAnyPrivateInput,
    secondsRemaining,
    isBusy,
    currentStep,
    requestChallenge,
    authorizeAndProve,
    checkProofStatus,
    cancelAwaitingSessionAndReset,
    retryPublicResult,
    setProofSubjectContext,
    resetFlow,
  }
}
