export const giwaContractConfig = Object.freeze({
  chainId: import.meta.env.VITE_GIWA_CHAIN_ID?.trim() ?? '',
  chainIdHex: import.meta.env.VITE_GIWA_CHAIN_ID_HEX?.trim() ?? '',
  rpcUrl: import.meta.env.VITE_GIWA_RPC_URL?.trim() ?? '',
  explorerUrl: (import.meta.env.VITE_GIWA_EXPLORER_URL?.trim() ?? '').replace(/\/$/, ''),
  receivableFinanceAddress:
    import.meta.env.VITE_RECEIVABLE_FINANCE_ADDRESS?.trim() ?? '',
  mockKrwAddress: import.meta.env.VITE_MOCK_KRW_ADDRESS?.trim() ?? '',
  mockKrwFaucetAddress:
    import.meta.env.VITE_MOCK_KRW_FAUCET_ADDRESS?.trim() ?? '',
})

export function transactionExplorerUrl(txHash) {
  if (!giwaContractConfig.explorerUrl || !txHash) return ''
  return `${giwaContractConfig.explorerUrl}/tx/${txHash}`
}

export function addressExplorerUrl(address) {
  if (!giwaContractConfig.explorerUrl || !address) return ''
  return `${giwaContractConfig.explorerUrl}/address/${address}`
}
