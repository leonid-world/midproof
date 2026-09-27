function formatIdentifier(value) {
  if (value == null || value === '') return '미연결'
  return `#${String(value)}`
}

export function formatReceivableIdentity(receivable) {
  return [
    `DB 채권 ${formatIdentifier(receivable?.receivableId)}`,
    `온체인 ${formatIdentifier(receivable?.onchainReceivableId)}`,
    `NFT ${formatIdentifier(receivable?.tokenId)}`,
  ].join(' · ')
}
