import { apiRequest } from './api'

export function createPendingBlockchainTransaction(payload) {
  return apiRequest('/blockchain-transactions', {
    method: 'POST',
    body: payload,
  })
}

export function confirmBlockchainTransaction(txHash, payload) {
  return apiRequest(
    `/blockchain-transactions/${encodeURIComponent(txHash)}/confirmed`,
    {
      method: 'PATCH',
      body: payload,
    },
  )
}

export function failBlockchainTransaction(txHash, payload) {
  return apiRequest(
    `/blockchain-transactions/${encodeURIComponent(txHash)}/failed`,
    {
      method: 'PATCH',
      body: payload,
    },
  )
}

export function getReceivableBlockchainTransactions(receivableId) {
  return apiRequest(`/receivables/${receivableId}/transactions`)
}
