import { onBeforeUnmount, onMounted, readonly, ref } from 'vue'
import {
  assertResolutionMatchesRequest,
  createMidnightProofRequest,
  denyMidnightProofRequest,
  listMidnightProofRequests,
  resolveMidnightProofRequest,
} from '../services/midnight/proofRequests'

import {
  captureAuthSession,
  assertAuthSessionCurrent,
  isAuthSessionCurrent,
  onAuthSessionChange,
} from '../services/authSession'

const DEFAULT_POLL_INTERVAL_MS = 5_000
const AUTO_RESOLVE_RETRY_MS = 15_000

function safeMessage(error, fallback) {
  return typeof error?.message === 'string' && error.message ? error.message : fallback
}

export function useMidnightProofMailbox(
  scope,
  {
    pollIntervalMs = DEFAULT_POLL_INTERVAL_MS,
    services = {
      create: createMidnightProofRequest,
      deny: denyMidnightProofRequest,
      list: listMidnightProofRequests,
      resolve: resolveMidnightProofRequest,
    },
  } = {},
) {
  if (scope !== 'requested' && scope !== 'assigned') {
    throw new TypeError('Midnight 요청함 범위는 requested 또는 assigned여야 합니다.')
  }

  const requests = ref([])
  const resolutions = ref(Object.freeze({}))
  const isLoading = ref(false)
  const isRefreshing = ref(false)
  const isMutating = ref(false)
  const errorMessage = ref('')
  const successMessage = ref('')

  let active = false
  let refreshPromise = null
  let refreshController = null
  let timer = null
  let generation = 0
  let dataRevision = 0
  const resolutionPromises = new Map()
  const lastAutoResolveAttempt = new Map()

  function fetchResolution(requestId, options = {}) {
    const existing = resolutionPromises.get(requestId)
    if (existing) return existing
    const currentPromise = services.resolve(requestId, options).finally(() => {
      if (resolutionPromises.get(requestId) === currentPromise) {
        resolutionPromises.delete(requestId)
      }
    })
    resolutionPromises.set(requestId, currentPromise)
    return currentPromise
  }

  function applyResolution(requestId, resolution) {
    const request = requests.value.find((item) => item.requestId === requestId)
    if (!request) throw new Error('현재 요청함에서 검증 요청을 찾을 수 없습니다.')
    assertResolutionMatchesRequest(resolution, request)
    resolutions.value = Object.freeze({
      ...resolutions.value,
      [requestId]: resolution,
    })
    requests.value = Object.freeze(
      requests.value.map((request) =>
        request.requestId === requestId
          ? Object.freeze({ ...request, status: 'COMPLETED' })
          : request,
      ),
    )
    dataRevision += 1
  }

  async function autoResolveOneSubmitted(nextRequests, currentGeneration, signal, session) {
    if (scope !== 'requested') return
    const now = Date.now()
    const candidate = nextRequests.find((request) => {
      const lastAttempt = lastAutoResolveAttempt.get(request.requestId)
      return (
        request.status === 'SUBMITTED' &&
        (lastAttempt === undefined || now - lastAttempt >= AUTO_RESOLVE_RETRY_MS)
      )
    })
    if (!candidate) return
    lastAutoResolveAttempt.set(candidate.requestId, now)
    try {
      const resolution = await fetchResolution(candidate.requestId, { signal, session })
      if (!active || generation !== currentGeneration || !isAuthSessionCurrent(session)) return
      applyResolution(candidate.requestId, resolution)
    } catch (error) {
      if (!active || generation !== currentGeneration || !isAuthSessionCurrent(session)) return
      // Network/Read API outages are recoverable: keep SUBMITTED and retry later.
      if (error?.status !== 0 && error?.status !== 503) {
        errorMessage.value = safeMessage(error, '공개 결과 자동 동기화에 실패했습니다.')
      }
    }
  }

  function scheduleNext() {
    clearTimeout(timer)
    if (!active) return
    timer = setTimeout(() => {
      if (globalThis.document?.visibilityState === 'hidden') {
        scheduleNext()
        return
      }
      void refresh({ background: true })
    }, pollIntervalMs)
  }

  async function refresh({ background = false } = {}) {
    if (!active) return null
    if (refreshPromise) return refreshPromise
    const session = captureAuthSession()
    const currentGeneration = generation
    const currentDataRevision = dataRevision
    refreshController = new AbortController()
    if (background) isRefreshing.value = true
    else isLoading.value = requests.value.length === 0

    const currentPromise = services
      .list(scope, { signal: refreshController.signal, session })
      .then(async (nextRequests) => {
        let applied = false
        if (
          active &&
          generation === currentGeneration &&
          isAuthSessionCurrent(session) &&
          dataRevision === currentDataRevision
        ) {
          requests.value = nextRequests
          resolutions.value = Object.freeze(
            Object.fromEntries(
              Object.entries(resolutions.value).filter(([id, resolution]) => {
                const request = nextRequests.find((item) => item.requestId === id)
                if (request?.status !== 'COMPLETED') return false
                try {
                  assertResolutionMatchesRequest(resolution, request)
                  return true
                } catch {
                  return false
                }
              }),
            ),
          )
          errorMessage.value = ''
          applied = true
        }
        if (applied) {
          await autoResolveOneSubmitted(
            nextRequests,
            currentGeneration,
            refreshController.signal,
            session,
          )
        }
        return active && generation === currentGeneration ? requests.value : nextRequests
      })
      .catch((error) => {
        if (
          !active ||
          refreshController?.signal.aborted ||
          generation !== currentGeneration ||
          !isAuthSessionCurrent(session)
        )
          return null
        if (!background || requests.value.length === 0) {
          errorMessage.value = safeMessage(error, '검증 요청함을 불러오지 못했습니다.')
        }
        return null
      })
      .finally(() => {
        if (refreshPromise === currentPromise) {
          refreshPromise = null
          refreshController = null
          isLoading.value = false
          isRefreshing.value = false
          scheduleNext()
        }
      })
    refreshPromise = currentPromise
    return currentPromise
  }

  function start() {
    if (active) return refreshPromise ?? Promise.resolve(requests.value)
    active = true
    generation += 1
    return refresh()
  }

  function stop() {
    active = false
    generation += 1
    clearTimeout(timer)
    timer = null
    refreshController?.abort()
    refreshController = null
    refreshPromise = null
    requests.value = []
    resolutions.value = Object.freeze({})
    isLoading.value = false
    isRefreshing.value = false
    isMutating.value = false
    errorMessage.value = ''
    successMessage.value = ''
    resolutionPromises.clear()
    lastAutoResolveAttempt.clear()
  }

  function mutationContext() {
    const session = captureAuthSession()
    const currentGeneration = generation
    const current = () =>
      active && generation === currentGeneration && isAuthSessionCurrent(session)
    const check = () => {
      assertAuthSessionCurrent(session)
      if (!current()) throw new Error('요청 화면이 닫혔습니다. 현재 요청함에서 다시 확인해 주세요.')
    }
    check()
    return { session, current, check }
  }

  async function createRequests(receivableId, subjectRoles, policy) {
    if (scope !== 'requested')
      throw new TypeError('보낸 요청함에서만 검증 요청을 만들 수 있습니다.')
    if (!Array.isArray(subjectRoles) || subjectRoles.length === 0) {
      throw new TypeError('Seller 또는 Buyer를 한 명 이상 선택해 주세요.')
    }
    const roles = [...new Set(subjectRoles)]
    if (roles.some((role) => role !== 'SELLER' && role !== 'BUYER')) {
      throw new TypeError('검증 대상 역할을 확인해 주세요.')
    }
    const context = mutationContext()
    isMutating.value = true
    errorMessage.value = ''
    successMessage.value = ''
    const created = []
    try {
      for (const subjectRole of roles) {
        context.check()
        created.push(
          await services.create(
            receivableId,
            {
              subjectRole,
              minAnnualRevenueKrw: policy.minAnnualRevenueKrw,
              maxDebtRatioBps: policy.maxDebtRatioBps,
              maxOverdueCount: policy.maxOverdueCount,
              validForSeconds: policy.validForSeconds,
            },
            { session: context.session },
          ),
        )
        context.check()
      }
      requests.value = Object.freeze([
        ...created,
        ...requests.value.filter(
          (request) => !created.some((item) => item.requestId === request.requestId),
        ),
      ])
      dataRevision += 1
      successMessage.value = `${created.length}건의 검증 요청을 보냈습니다.`
      return created
    } catch (error) {
      if (!context.current()) throw error
      const partial = created.length
        ? ` ${created.length}건은 생성되었으므로 보낸 요청에서 상태를 확인해 주세요.`
        : ''
      errorMessage.value = `${safeMessage(error, '검증 요청을 만들지 못했습니다.')}${partial}`
      await refresh({ background: true })
      throw error
    } finally {
      if (context.current()) isMutating.value = false
    }
  }

  async function deny(requestId) {
    if (scope !== 'assigned') throw new TypeError('받은 요청함에서만 요청을 거절할 수 있습니다.')
    const context = mutationContext()
    isMutating.value = true
    errorMessage.value = ''
    successMessage.value = ''
    try {
      const updated = await services.deny(requestId, { session: context.session })
      context.check()
      requests.value = Object.freeze(
        requests.value.map((request) =>
          request.requestId === updated.requestId ? updated : request,
        ),
      )
      dataRevision += 1
      successMessage.value = '검증 요청을 거절했습니다.'
      return updated
    } catch (error) {
      if (!context.current()) throw error
      errorMessage.value = safeMessage(error, '검증 요청을 거절하지 못했습니다.')
      throw error
    } finally {
      if (context.current()) isMutating.value = false
    }
  }

  async function resolve(requestId) {
    if (scope !== 'requested') throw new TypeError('보낸 요청함에서만 결과를 조회할 수 있습니다.')
    const context = mutationContext()
    isMutating.value = true
    errorMessage.value = ''
    successMessage.value = ''
    try {
      const resolution = await fetchResolution(requestId, { session: context.session })
      context.check()
      applyResolution(requestId, resolution)
      return resolution
    } catch (error) {
      if (!context.current()) throw error
      errorMessage.value = safeMessage(error, '공개 결과를 조회하지 못했습니다.')
      throw error
    } finally {
      if (context.current()) isMutating.value = false
    }
  }

  function clearMessages() {
    errorMessage.value = ''
    successMessage.value = ''
  }

  const unsubscribeSession = onAuthSessionChange(stop)
  onMounted(start)
  onBeforeUnmount(() => {
    unsubscribeSession()
    stop()
  })

  return {
    requests: readonly(requests),
    resolutions: readonly(resolutions),
    isLoading: readonly(isLoading),
    isRefreshing: readonly(isRefreshing),
    isMutating: readonly(isMutating),
    errorMessage: readonly(errorMessage),
    successMessage: readonly(successMessage),
    refresh,
    createRequests,
    deny,
    resolve,
    clearMessages,
    start,
    stop,
  }
}
