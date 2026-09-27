import {
  captureAuthSession,
  isAuthSessionCurrent,
  onAuthSessionChange,
} from '../services/authSession'
import { isMidnightDemoEnabled } from '../services/midnight/config'
import { onBeforeUnmount, reactive, readonly, ref } from 'vue'
import {
  acknowledgePolicyProofResultV2,
  cancelPolicyProofSessionV2,
  MidnightProofBridgeV2Error,
  readPolicyProofSessionStatusV2,
  recoverPolicyProofResultV2,
  requestPolicyProofChallengeV2,
  submitPolicyProofAuthorizationV2,
} from '../services/midnight/proofBridgeV2'
import { completeMidnightProofRequest } from '../services/midnight/proofRequests'
import { signRoleAuthorizationV2 } from '../services/midnight/roleAuthorizationV2'

const STATUS_POLL_INTERVAL_MS = 1_500
const MAX_STATUS_WAIT_MS = 5 * 60_000
const UINT32_MAX = (1n << 32n) - 1n

function safeMessage(error, fallback) {
  return typeof error?.message === 'string' && error.message ? error.message : fallback
}

export function percentTextToBps(value) {
  if (typeof value !== 'string' || !/^(0|[1-9][0-9]*)(?:\.([0-9]{1,2}))?$/.test(value)) {
    throw new TypeError('부채비율은 0 이상의 숫자로, 소수점 둘째 자리까지만 입력해 주세요.')
  }
  const [whole, fraction = ''] = value.split('.')
  const result = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0') || '0')
  if (result > UINT32_MAX) throw new TypeError('부채비율 입력 범위를 확인해 주세요.')
  return result.toString()
}

function canonicalUnsigned(value, label) {
  if (typeof value !== 'string' || !/^(0|[1-9][0-9]*)$/.test(value)) {
    throw new TypeError(`${label}은 쉼표 없이 0 이상의 정수로 입력해 주세요.`)
  }
  return value
}

function assertCapabilityMatchesRequest(capability, request) {
  const exactPairs = [
    ['requestId', request.requestId],
    ['onchainReceivableId', request.onchainReceivableId],
    ['subjectRole', request.subjectRole],
    ['partyWallet', request.partyWallet],
    ['intendedFunderWallet', request.intendedFunderWallet],
    ['minAnnualRevenueKrw', request.minAnnualRevenueKrw],
    ['maxDebtRatioBps', request.maxDebtRatioBps],
    ['maxOverdueCount', request.maxOverdueCount],
    ['validUntil', request.validUntil],
  ]
  if (exactPairs.some(([key, expected]) => capability[key] !== expected)) {
    throw new Error('완료된 증명이 선택한 Funder 요청 문맥과 일치하지 않습니다.')
  }
}

function acceptedCompletionStage(completed) {
  if (completed?.status === 'SUBMITTED') return 'submitted'
  if (completed?.status === 'COMPLETED') return 'completed'
  throw new Error('서버가 완료 증명의 저장 상태를 확정하지 못했습니다.')
}

export function useMidnightAssignedProof({
  services = {
    challenge: requestPolicyProofChallengeV2,
    sign: signRoleAuthorizationV2,
    submit: submitPolicyProofAuthorizationV2,
    status: readPolicyProofSessionStatusV2,
    cancel: cancelPolicyProofSessionV2,
    recover: recoverPolicyProofResultV2,
    acknowledge: acknowledgePolicyProofResultV2,
    complete: completeMidnightProofRequest,
  },
  pollIntervalMs = STATUS_POLL_INTERVAL_MS,
  hostedDemo = isMidnightDemoEnabled,
} = {}) {
  const privateFacts = reactive({
    annualRevenueKrw: '',
    debtRatioPercent: '',
    overdueCount: '',
  })
  const demoProfileId = ref('')
  const stage = ref('idle')
  const errorMessage = ref('')
  const statusMessage = ref('')
  const activeRequestId = ref('')
  const sessionId = ref('')
  const hasPendingDelivery = ref(false)
  const hasPendingStatus = ref(false)

  let runSession = captureAuthSession()
  let activeRun = 0
  let controller = null
  let pollTimer = null
  let finishPollWait = null
  let disposed = false
  let pendingCapability = null
  let pendingRequestId = ''
  let pendingStatusRequest = null

  function isCurrentRun(run) {
    if (!isAuthSessionCurrent(runSession)) reset()
    return run === activeRun && !disposed
  }

  function clearPrivateFacts() {
    privateFacts.annualRevenueKrw = ''
    privateFacts.debtRatioPercent = ''
    privateFacts.overdueCount = ''
  }

  function clearTimer() {
    clearTimeout(pollTimer)
    pollTimer = null
    finishPollWait?.(false)
    finishPollWait = null
  }

  function reset() {
    activeRun += 1
    controller?.abort()
    controller = null
    clearTimer()
    clearPrivateFacts()
    stage.value = 'idle'
    errorMessage.value = ''
    statusMessage.value = ''
    activeRequestId.value = ''
    sessionId.value = ''
    pendingCapability = null
    pendingRequestId = ''
    hasPendingDelivery.value = false
    hasPendingStatus.value = false
    pendingStatusRequest = null
  }

  function waitForNextPoll(run) {
    return new Promise((resolve) => {
      finishPollWait = resolve
      pollTimer = setTimeout(() => {
        finishPollWait = null
        resolve(isCurrentRun(run))
      }, pollIntervalMs)
    })
  }

  async function createChallengeFromPrivateFacts(request, signal) {
    if (hostedDemo) {
      clearPrivateFacts()
      return await services.challenge(
        { version: 2, requestId: request.requestId, profileId: demoProfileId.value },
        { signal, request },
      )
    }
    const payload = {
      version: 2,
      onchainReceivableId: request.onchainReceivableId,
      subjectRole: request.subjectRole,
      annualRevenueKrw: canonicalUnsigned(privateFacts.annualRevenueKrw, '연매출'),
      debtRatioBps: percentTextToBps(privateFacts.debtRatioPercent),
      overdueCount: canonicalUnsigned(privateFacts.overdueCount, '연체 건수'),
      policyRequest: {
        requestId: request.requestId,
        intendedFunderWallet: request.intendedFunderWallet,
        minAnnualRevenueKrw: request.minAnnualRevenueKrw,
        maxDebtRatioBps: request.maxDebtRatioBps,
        maxOverdueCount: request.maxOverdueCount,
        validUntil: request.validUntil,
      },
    }
    try {
      const challenge = await services.challenge(payload, { signal })
      // The Bridge now owns the private witness input. Remove every browser field immediately.
      clearPrivateFacts()
      return challenge
    } finally {
      // Keep no raw financial value reachable from this helper after the challenge attempt.
      payload.annualRevenueKrw = ''
      payload.debtRatioBps = ''
      payload.overdueCount = ''
    }
  }

  function clearPendingResult() {
    pendingCapability = null
    pendingRequestId = ''
    hasPendingDelivery.value = false
    hasPendingStatus.value = false
    pendingStatusRequest = null
    sessionId.value = ''
  }

  async function deliverAndAcknowledge(run, request, completedSessionId, capability) {
    assertCapabilityMatchesRequest(capability, request)
    pendingCapability = capability
    pendingRequestId = request.requestId
    sessionId.value = completedSessionId
    hasPendingDelivery.value = true
    stage.value = 'delivering'
    statusMessage.value = '완료된 증명을 요청한 Funder의 서버 요청함에 안전하게 저장하는 중입니다.'

    let completed
    try {
      completed = await services.complete(request.requestId, capability, {
        signal: controller.signal,
      })
    } catch (error) {
      if (isCurrentRun(run)) {
        stage.value = 'unknown'
        statusMessage.value =
          'Midnight 증명은 완료되어 암호화 보관 중입니다. 다시 증명하지 말고 서버 전달만 재시도하세요.'
      }
      throw error
    }
    if (!isCurrentRun(run)) return null
    const acceptedStage = acceptedCompletionStage(completed)

    stage.value = 'acknowledging'
    statusMessage.value = '결과 저장을 확인했습니다. 암호화 전달 보관본을 정리하는 중입니다.'
    try {
      await services.acknowledge(completedSessionId, request.requestId, {
        signal: controller.signal,
      })
    } catch (error) {
      if (isCurrentRun(run)) {
        stage.value = 'unknown'
        statusMessage.value =
          '서버에는 증명이 저장됐지만 로컬 보관본 정리 응답을 확인하지 못했습니다. 새 증명 없이 정리만 다시 확인합니다.'
      }
      throw error
    }
    if (!isCurrentRun(run)) return null

    clearPendingResult()
    stage.value = acceptedStage
    statusMessage.value =
      completed.status === 'SUBMITTED'
        ? '증명 제출을 완료했습니다. Funder가 공개 결과를 조회하면 원장 결과와 동기화됩니다.'
        : '검증 응답을 보냈습니다. 재무 원문은 Funder에게 전달되지 않았습니다.'
    return completed
  }

  async function pollUntilComplete(run, request, startedAt) {
    while (isCurrentRun(run)) {
      if (Date.now() - startedAt >= MAX_STATUS_WAIT_MS) {
        stage.value = 'unknown'
        hasPendingStatus.value = true
        pendingStatusRequest = request
        statusMessage.value =
          '증명은 계속 처리 중일 수 있습니다. 잠시 후 받은 요청을 새로고침해 완료 상태를 확인해 주세요.'
        return null
      }
      let status
      try {
        status = await services.status(sessionId.value, {
          signal: controller.signal,
          requestId: request.requestId,
        })
      } catch (error) {
        if (!isCurrentRun(run) || controller?.signal.aborted) return null
        stage.value = 'unknown'
        hasPendingStatus.value = true
        pendingStatusRequest = request
        statusMessage.value =
          '세션 상태 응답을 확인하지 못했습니다. 지갑 서명과 증명을 반복하지 않고 같은 세션 상태만 다시 조회할 수 있습니다.'
        throw error
      }
      if (!isCurrentRun(run)) return null
      if (status.status === 'complete') {
        hasPendingStatus.value = false
        pendingStatusRequest = null
        return await deliverAndAcknowledge(run, request, status.sessionId, status.proofCapability)
      }
      if (status.status === 'failed') {
        hasPendingStatus.value = false
        pendingStatusRequest = null
        stage.value = 'failed'
        throw new Error(status.error.message)
      }
      if (status.status === 'expired') {
        hasPendingStatus.value = false
        pendingStatusRequest = null
        stage.value = 'expired'
        throw new Error('지갑 서명 세션이 만료되었습니다. 요청이 아직 유효하면 다시 시작해 주세요.')
      }
      if (status.status === 'cancelled') {
        hasPendingStatus.value = false
        pendingStatusRequest = null
        stage.value = 'cancelled'
        throw new Error('증명 세션이 취소되었습니다.')
      }
      stage.value = 'proving'
      statusMessage.value =
        'Midnight가 비공개 값을 공개하지 않고 요청 기준 충족 여부를 증명 중입니다.'
      if (!(await waitForNextPoll(run))) return null
    }
    return null
  }

  async function prove(request) {
    if (!request || request.status !== 'REQUESTED') {
      throw new TypeError('응답 대기 중인 검증 요청을 선택해 주세요.')
    }
    if (BigInt(request.validUntil) <= BigInt(Math.floor(Date.now() / 1_000))) {
      stage.value = 'expired'
      throw new TypeError('이 Funder 검증 요청은 이미 만료되었습니다.')
    }
    if (!['idle', 'failed', 'expired', 'cancelled'].includes(stage.value)) {
      throw new TypeError('현재 검증 흐름이 끝난 뒤 다시 시도해 주세요.')
    }

    runSession = captureAuthSession()
    const run = ++activeRun
    controller?.abort()
    controller = new AbortController()
    clearTimer()
    errorMessage.value = ''
    activeRequestId.value = request.requestId
    stage.value = 'challenging'
    statusMessage.value = 'Funder 요청에 묶인 일회용 지갑 서명 문맥을 만드는 중입니다.'

    try {
      const challenge = await createChallengeFromPrivateFacts(request, controller.signal)
      if (!isCurrentRun(run)) return null
      sessionId.value = challenge.sessionId
      stage.value = 'signing'
      statusMessage.value =
        'MetaMask에서 이 채권 역할과 Funder 기준 요청에 대한 1회성 동의를 확인해 주세요.'
      const authorization = await services.sign(challenge.authorizationRequest)
      if (!isCurrentRun(run)) return null

      stage.value = 'submitting'
      statusMessage.value = '지갑 동의를 증명 서버에 제출하는 중입니다.'
      try {
        await services.submit(challenge.sessionId, authorization, {
          signal: controller.signal,
          requestId: request.requestId,
        })
        hasPendingStatus.value = true
        pendingStatusRequest = request
      } catch (error) {
        if (!(error instanceof MidnightProofBridgeV2Error) || !error.requestMayHaveSucceeded) {
          throw error
        }
        stage.value = 'unknown'
        hasPendingStatus.value = true
        pendingStatusRequest = request
        statusMessage.value =
          '서명 제출 응답이 끊겼습니다. 재제출하지 않고 같은 세션 상태만 확인합니다.'
      }
      if (!isCurrentRun(run)) return null
      return await pollUntilComplete(run, request, Date.now())
    } catch (error) {
      if (!isCurrentRun(run) || controller?.signal.aborted) return null
      if (stage.value !== 'unknown') {
        if (stage.value !== 'expired' && stage.value !== 'cancelled') stage.value = 'failed'
        errorMessage.value = safeMessage(error, '재무 검증 응답을 완료하지 못했습니다.')
      } else {
        errorMessage.value = safeMessage(error, '서버 전달 상태를 확정하지 못했습니다.')
      }
      throw error
    }
  }

  async function cancel() {
    const currentSessionId = sessionId.value
    const cancellingRun = ++activeRun
    const cancellingSession = captureAuthSession()
    controller?.abort()
    controller = null
    clearTimer()
    clearPrivateFacts()
    if (currentSessionId && ['signing', 'submitting', 'challenging'].includes(stage.value)) {
      try {
        await services.cancel(currentSessionId, { requestId: activeRequestId.value })
      } catch {
        // Local reset is still safe; the Bridge enforces whether the server-side session can cancel.
      }
    }
    if (cancellingRun !== activeRun || !isAuthSessionCurrent(cancellingSession)) return
    stage.value = 'cancelled'
    statusMessage.value = '이 브라우저의 검증 입력과 진행 상태를 지웠습니다.'
    sessionId.value = ''
    pendingCapability = null
    pendingRequestId = ''
    hasPendingDelivery.value = false
    hasPendingStatus.value = false
    pendingStatusRequest = null
  }

  async function recoverDurableDelivery(request) {
    if (!request || !['REQUESTED', 'SUBMITTED', 'COMPLETED'].includes(request.status)) {
      throw new TypeError('복구할 수 있는 검증 요청 상태가 아닙니다.')
    }
    runSession = captureAuthSession()
    const run = ++activeRun
    controller?.abort()
    controller = new AbortController()
    clearTimer()
    clearPrivateFacts()
    activeRequestId.value = request.requestId
    errorMessage.value = ''
    stage.value = 'recovering'
    statusMessage.value =
      '새 지갑 서명이나 ZK 증명 없이 이 요청의 암호화된 완료 결과만 확인하는 중입니다.'
    try {
      const recovered = await services.recover(request.requestId, { signal: controller.signal })
      if (!isCurrentRun(run)) return null
      assertCapabilityMatchesRequest(recovered.proofCapability, request)
      return await deliverAndAcknowledge(
        run,
        request,
        recovered.sessionId,
        recovered.proofCapability,
      )
    } catch (error) {
      if (!isCurrentRun(run) || controller?.signal.aborted) return null
      if (error instanceof MidnightProofBridgeV2Error && error.code === 'PROOF_RESULT_NOT_FOUND') {
        if (request.status === 'SUBMITTED' || request.status === 'COMPLETED') {
          clearPendingResult()
          stage.value = request.status === 'SUBMITTED' ? 'submitted' : 'completed'
          statusMessage.value =
            request.status === 'SUBMITTED'
              ? '서버의 증명 제출 상태를 확인했습니다. 전달 보관본은 이미 정리되었습니다.'
              : '서버의 응답 완료 상태를 확인했습니다. 전달 보관본은 이미 정리되었습니다.'
          return request
        }
        clearPendingResult()
        stage.value = 'idle'
        statusMessage.value = ''
        return null
      }
      stage.value = 'unknown'
      hasPendingDelivery.value = true
      pendingRequestId = request.requestId
      errorMessage.value = safeMessage(error, '암호화된 완료 증명 복구 상태를 확인하지 못했습니다.')
      statusMessage.value =
        error instanceof MidnightProofBridgeV2Error && error.code === 'PROOF_RESULT_IN_PROGRESS'
          ? '기존 증명이 제출됐을 수 있어 새 증명을 시작하지 않습니다. 요청 기한이 끝나기 전 운영자가 상태를 확인해야 합니다.'
          : '다시 증명하지 말고 기존 완료 결과의 전달 상태만 확인해 주세요.'
      throw error
    }
  }

  async function retryDelivery(request) {
    if (!request || !hasPendingDelivery.value || pendingRequestId !== request.requestId) {
      throw new TypeError('다시 전달하거나 복구할 완료 증명 요청이 없습니다.')
    }
    if (!pendingCapability) {
      return await recoverDurableDelivery(request, { quietNotFound: false })
    }
    assertCapabilityMatchesRequest(pendingCapability, request)
    runSession = captureAuthSession()
    const run = ++activeRun
    controller?.abort()
    controller = new AbortController()
    stage.value = 'delivering'
    errorMessage.value = ''
    statusMessage.value =
      '이미 완료된 증명 결과만 다시 전달합니다. ZK 증명이나 지갑 서명은 반복하지 않습니다.'
    try {
      return await deliverAndAcknowledge(run, request, sessionId.value, pendingCapability)
    } catch (error) {
      if (!isCurrentRun(run) || controller?.signal.aborted) return null
      stage.value = 'unknown'
      errorMessage.value = safeMessage(error, '결과 전달 상태를 확정하지 못했습니다.')
      statusMessage.value =
        '완료 증명은 암호화 보관함에 남아 있습니다. 요청 상태를 다시 확인한 뒤 전달만 재시도할 수 있습니다.'
      throw error
    }
  }

  async function resumeStatus(request) {
    if (
      !hasPendingStatus.value ||
      !sessionId.value ||
      pendingStatusRequest?.requestId !== request?.requestId
    ) {
      throw new TypeError('다시 조회할 증명 세션이 없습니다.')
    }
    runSession = captureAuthSession()
    const run = ++activeRun
    controller?.abort()
    controller = new AbortController()
    stage.value = 'proving'
    errorMessage.value = ''
    statusMessage.value = '지갑 서명이나 증명을 다시 제출하지 않고 기존 세션 상태만 확인합니다.'
    try {
      return await pollUntilComplete(run, request, Date.now())
    } catch (error) {
      if (!isCurrentRun(run) || controller?.signal.aborted) return null
      stage.value = 'unknown'
      errorMessage.value = safeMessage(error, '기존 증명 세션 상태를 확인하지 못했습니다.')
      throw error
    }
  }

  const unsubscribeSession = onAuthSessionChange(() => {
    reset()
    demoProfileId.value = ''
  })
  onBeforeUnmount(() => {
    unsubscribeSession()
    disposed = true
    activeRun += 1
    controller?.abort()
    clearTimer()
    clearPrivateFacts()
    pendingCapability = null
    pendingRequestId = ''
    hasPendingDelivery.value = false
    hasPendingStatus.value = false
    pendingStatusRequest = null
  })

  return {
    privateFacts,
    demoProfileId,
    stage: readonly(stage),
    errorMessage: readonly(errorMessage),
    statusMessage: readonly(statusMessage),
    activeRequestId: readonly(activeRequestId),
    hasPendingDelivery: readonly(hasPendingDelivery),
    hasPendingStatus: readonly(hasPendingStatus),
    prove,
    recoverDurableDelivery,
    retryDelivery,
    resumeStatus,
    cancel,
    reset,
    clearPrivateFacts,
  }
}
