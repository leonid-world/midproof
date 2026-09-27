export class Web3Error extends Error {
  constructor(code, message, details = {}) {
    super(message)
    this.name = 'Web3Error'
    this.code = code
    Object.assign(this, details)
  }
}

function nestedErrorCode(error) {
  return error?.code ?? error?.info?.error?.code ?? error?.error?.code ?? error?.cause?.code
}

export function normalizeWeb3Error(error) {
  if (error instanceof Web3Error) return error

  const code = nestedErrorCode(error)
  if (code === 4001 || code === 'ACTION_REJECTED') {
    return new Web3Error('TRANSACTION_REJECTED', 'MetaMask에서 요청이 취소되었습니다.')
  }
  if (code === 4900) {
    return new Web3Error('WALLET_DISCONNECTED', 'MetaMask가 네트워크에서 연결 해제되었습니다.')
  }
  if (code === -32002) {
    return new Web3Error(
      'WALLET_REQUEST_PENDING',
      'MetaMask에 이미 처리 중인 요청이 있습니다. 확장 프로그램에서 기존 요청을 완료하거나 취소해 주세요.',
    )
  }
  if (code === 'INSUFFICIENT_FUNDS') {
    return new Web3Error(
      'INSUFFICIENT_GAS',
      '트랜잭션 가스비가 부족합니다. 채권 거래 네트워크의 네이티브 토큰 잔액을 확인해 주세요.',
    )
  }
  if (code === 'TRANSACTION_REPLACED' && error?.cancelled) {
    return new Web3Error('TRANSACTION_CANCELLED', 'MetaMask에서 트랜잭션이 취소되었습니다.', {
      txHash: error?.replacement?.hash ?? error?.receipt?.hash,
    })
  }
  if (code === 'CALL_EXCEPTION') {
    return new Web3Error(
      'CONTRACT_CALL_FAILED',
      error?.reason ??
        error?.shortMessage ??
        '컨트랙트가 트랜잭션을 거부했습니다. 지갑과 채권 상태를 확인해 주세요.',
    )
  }

  return new Web3Error(
    'WEB3_REQUEST_FAILED',
    error?.shortMessage ?? error?.message ?? '블록체인 요청을 처리하지 못했습니다.',
  )
}
