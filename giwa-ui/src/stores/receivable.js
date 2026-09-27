import { onScopeDispose, ref } from 'vue'
import { defineStore } from 'pinia'
import { apiRequest } from '../services/api'
import {
  captureAuthSession,
  assertAuthSessionCurrent,
  onAuthSessionChange,
} from '../services/authSession'
import {
  loadReceivableAmountPolicy,
  validateReceivableAmounts,
} from '../services/receivableAmountPolicy'

export const useReceivableStore = defineStore('receivable', () => {
  const receivables = ref([])
  const fundingOpportunities = ref([])
  const selectedReceivable = ref(null)
  const amountPolicy = ref(null)

  onScopeDispose(
    onAuthSessionChange(() => {
      receivables.value = []
      fundingOpportunities.value = []
      selectedReceivable.value = null
      amountPolicy.value = null
    }),
  )

  async function sessionRequest(path, options = {}) {
    const session = options.session ?? captureAuthSession()
    const result = await apiRequest(path, { ...options, session })
    assertAuthSessionCurrent(session)
    return result
  }

  async function loadAmountPolicy() {
    const session = captureAuthSession()
    amountPolicy.value = null
    const policy = await loadReceivableAmountPolicy()
    assertAuthSessionCurrent(session)
    amountPolicy.value = policy
    return amountPolicy.value
  }

  async function loadAll() {
    const session = captureAuthSession()
    const result = await sessionRequest('/receivables', { session })
    assertAuthSessionCurrent(session)
    receivables.value = result
  }

  async function fetchOne(receivableId) {
    return sessionRequest(`/receivables/${receivableId}`)
  }

  function selectOne(receivable) {
    selectedReceivable.value = receivable
    return selectedReceivable.value
  }

  async function loadOne(receivableId) {
    const session = captureAuthSession()
    const result = await fetchOne(receivableId)
    assertAuthSessionCurrent(session)
    return selectOne(result)
  }

  async function loadFundingOpportunities() {
    const session = captureAuthSession()
    const result = await sessionRequest('/receivables/funding-opportunities', { session })
    assertAuthSessionCurrent(session)
    fundingOpportunities.value = result
    return fundingOpportunities.value
  }

  function clearSelection() {
    selectedReceivable.value = null
  }

  async function create(payload) {
    const session = captureAuthSession()
    validateReceivableAmounts(payload, await loadAmountPolicy())
    assertAuthSessionCurrent(session)
    const body = await sessionRequest('/receivables', {
      session,
      method: 'POST',
      body: payload,
    })
    assertAuthSessionCurrent(session)
    selectedReceivable.value = body
    await loadAll()
    return body
  }

  async function markChainCreated(receivableId, payload) {
    const session = captureAuthSession()
    const result = await sessionRequest(`/receivables/${receivableId}/chain-created`, {
      session,
      method: 'POST',
      body: payload,
    })
    assertAuthSessionCurrent(session)
    selectedReceivable.value = result
    await loadAll()
    return selectedReceivable.value
  }

  async function markVerified(receivableId, payload) {
    const session = captureAuthSession()
    const result = await sessionRequest(`/receivables/${receivableId}/verified`, {
      session,
      method: 'POST',
      body: payload,
    })
    assertAuthSessionCurrent(session)
    selectedReceivable.value = result
    await loadAll()
    return selectedReceivable.value
  }

  async function markTokenized(receivableId, payload) {
    const session = captureAuthSession()
    const result = await sessionRequest(`/receivables/${receivableId}/tokenized`, {
      session,
      method: 'POST',
      body: payload,
    })
    assertAuthSessionCurrent(session)
    selectedReceivable.value = result
    await loadAll()
    return selectedReceivable.value
  }

  async function markFunded(receivableId, payload) {
    const session = captureAuthSession()
    const result = await sessionRequest(`/receivables/${receivableId}/funded`, {
      session,
      method: 'POST',
      body: payload,
    })
    assertAuthSessionCurrent(session)
    selectedReceivable.value = result
    await Promise.all([loadAll(), loadFundingOpportunities()])
    return selectedReceivable.value
  }

  async function markRepaid(receivableId, payload) {
    const session = captureAuthSession()
    const result = await sessionRequest(`/receivables/${receivableId}/repaid`, {
      session,
      method: 'POST',
      body: payload,
    })
    assertAuthSessionCurrent(session)
    selectedReceivable.value = result
    await loadAll()
    return selectedReceivable.value
  }

  return {
    receivables,
    fundingOpportunities,
    selectedReceivable,
    amountPolicy,
    loadAmountPolicy,
    loadAll,
    fetchOne,
    selectOne,
    loadOne,
    loadFundingOpportunities,
    clearSelection,
    create,
    markChainCreated,
    markVerified,
    markTokenized,
    markFunded,
    markRepaid,
  }
})
