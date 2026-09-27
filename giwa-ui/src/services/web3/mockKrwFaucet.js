import {
  Contract,
  getAddress,
  Interface,
  isAddress,
  isHexString,
  JsonRpcProvider,
  ZeroAddress,
} from 'ethers'
import mockKrwAbi from '../../contracts/MockKRW.abi.json'
import mockKrwFaucetAbi from '../../contracts/MockKRWFaucet.abi.json'
import { giwaContractConfig } from '../../contracts/addresses'
import { normalizeWeb3Error, Web3Error } from './errors'
import { getGiwaSigner, requiredChainId } from './provider'

const RECEIPT_TIMEOUT_MS = 60_000
const faucetInterface = new Interface(mockKrwFaucetAbi)

function configuredAddress(value, code, message) {
  if (!isAddress(value) || getAddress(value) === ZeroAddress) {
    throw new Web3Error(code, message)
  }
  return getAddress(value)
}

function faucetAddress() {
  return configuredAddress(
    giwaContractConfig.mockKrwFaucetAddress,
    'FAUCET_NOT_CONFIGURED',
    'VITE_MOCK_KRW_FAUCET_ADDRESS에 배포된 MockKRWFaucet 주소를 설정해 주세요.',
  )
}

function paymentTokenAddress() {
  return configuredAddress(
    giwaContractConfig.mockKrwAddress,
    'PAYMENT_TOKEN_NOT_CONFIGURED',
    'VITE_MOCK_KRW_ADDRESS에 배포된 MockKRW 주소를 설정해 주세요.',
  )
}

function walletAddress(value) {
  if (!isAddress(value) || getAddress(value) === ZeroAddress) {
    throw new Web3Error(
      'WALLET_NOT_CONNECTED',
      '데모 mKRW를 받을 회사 지갑 주소를 확인할 수 없습니다.',
    )
  }
  return getAddress(value)
}

function positiveInteger(value, fieldName) {
  const normalized = String(value)
  if (!/^[1-9][0-9]*$/.test(normalized)) {
    throw new Web3Error('INVALID_ONCHAIN_VALUE', `${fieldName} 값은 양의 정수여야 합니다.`)
  }
  return BigInt(normalized)
}

async function configuredReadProvider() {
  const rpcUrl = giwaContractConfig.rpcUrl
  if (!rpcUrl) {
    throw new Web3Error('WEB3_NOT_CONFIGURED', '채권 RPC URL 환경변수를 설정해 주세요.')
  }

  const provider = new JsonRpcProvider(rpcUrl)
  const network = await provider.getNetwork()
  if (network.chainId !== requiredChainId()) {
    throw new Web3Error(
      'WRONG_NETWORK',
      `채권 RPC URL의 네트워크가 채권 거래 Chain ID ${requiredChainId().toString()}와 일치하지 않습니다.`,
    )
  }
  return provider
}

function findEvents(receipt, contract, eventName) {
  const expectedAddress = getAddress(contract.target)
  const events = []
  for (const log of receipt.logs) {
    try {
      if (getAddress(log.address) !== expectedAddress) continue
      const parsed = contract.interface.parseLog(log)
      if (parsed?.name === eventName) events.push(parsed)
    } catch {
      // Logs emitted by the other contract are ignored.
    }
  }
  return events
}

function revertData(error) {
  const candidates = [error?.data, error?.info?.error?.data, error?.error?.data, error?.cause?.data]
  for (const candidate of candidates) {
    if (typeof candidate === 'string') return candidate
    if (typeof candidate?.data === 'string') return candidate.data
  }
  return null
}

function faucetCustomError(error) {
  if (error?.revert?.name) return error.revert

  const data = revertData(error)
  if (!data) return null
  try {
    return faucetInterface.parseError(data)
  } catch {
    return null
  }
}

function normalizeFaucetError(error) {
  if (error instanceof Web3Error) return error

  const customError = faucetCustomError(error)
  if (customError?.name === 'AlreadyClaimed') {
    return new Web3Error(
      'FAUCET_ALREADY_CLAIMED',
      '이 회사 지갑은 데모 mKRW를 이미 한 번 받았습니다. 최신 잔액을 조회해 주세요.',
    )
  }
  if (customError?.name === 'FaucetDepleted') {
    return new Web3Error(
      'FAUCET_DEPLETED',
      '데모 mKRW Faucet 재고가 소진되었습니다. 현재 자동 충전을 이용할 수 없습니다.',
    )
  }
  return normalizeWeb3Error(error)
}

async function faucetState(provider, companyWalletAddress, requiredAmount = null) {
  const address = faucetAddress()
  const tokenAddress = paymentTokenAddress()
  const companyWallet = walletAddress(companyWalletAddress)
  const faucet = new Contract(address, mockKrwFaucetAbi, provider)
  const paymentToken = new Contract(tokenAddress, mockKrwAbi, provider)

  const [faucetCode, tokenCode] = await Promise.all([
    provider.getCode(address),
    provider.getCode(tokenAddress),
  ])
  if (faucetCode === '0x') {
    throw new Web3Error(
      'FAUCET_NOT_DEPLOYED',
      '설정된 MockKRWFaucet 주소에서 컨트랙트 코드를 찾을 수 없습니다.',
    )
  }
  if (tokenCode === '0x') {
    throw new Web3Error(
      'PAYMENT_TOKEN_NOT_DEPLOYED',
      '설정된 MockKRW 주소에서 컨트랙트 코드를 찾을 수 없습니다.',
    )
  }

  const [
    configuredPaymentToken,
    claimAmount,
    hasClaimed,
    faucetBalance,
    companyWalletBalance,
    nativeBalance,
    decimals,
  ] = await Promise.all([
    faucet.paymentToken(),
    faucet.claimAmount(),
    faucet.hasClaimed(companyWallet),
    paymentToken.balanceOf(address),
    paymentToken.balanceOf(companyWallet),
    provider.getBalance(companyWallet),
    paymentToken.decimals(),
  ])

  if (getAddress(configuredPaymentToken) !== tokenAddress) {
    throw new Web3Error(
      'FAUCET_PAYMENT_TOKEN_MISMATCH',
      'MockKRWFaucet이 사용하는 토큰과 VITE_MOCK_KRW_ADDRESS가 일치하지 않습니다.',
    )
  }
  if (claimAmount <= 0n) {
    throw new Web3Error(
      'FAUCET_INVALID_CLAIM_AMOUNT',
      'MockKRWFaucet의 1회 지급액이 올바르지 않습니다.',
    )
  }
  if (decimals !== 0n) {
    throw new Web3Error(
      'PAYMENT_TOKEN_DECIMALS_MISMATCH',
      'MockKRW decimals가 MVP 기준인 0이 아닙니다.',
    )
  }

  const required = requiredAmount == null ? null : positiveInteger(requiredAmount, '필요 금액')
  const hasInventory = faucetBalance >= claimAmount
  const willCoverRequiredAmount = required == null || companyWalletBalance + claimAmount >= required
  let estimatedGasCost = null
  if (!hasClaimed && hasInventory && willCoverRequiredAmount) {
    try {
      const [gasLimit, feeData] = await Promise.all([
        faucet.claim.estimateGas({ from: companyWallet }),
        provider.getFeeData(),
      ])
      const gasPrice = feeData.maxFeePerGas ?? feeData.gasPrice
      if (gasPrice != null) estimatedGasCost = gasLimit * gasPrice
    } catch {
      // MetaMask repeats the authoritative gas check before submission.
    }
  }
  const hasNativeGas =
    estimatedGasCost == null ? nativeBalance > 0n : nativeBalance >= estimatedGasCost

  return {
    address,
    tokenAddress,
    companyWallet,
    claimAmount,
    hasClaimed,
    faucetBalance,
    companyWalletBalance,
    nativeBalance,
    estimatedGasCost,
    requiredAmount: required,
    hasInventory,
    hasNativeGas,
    willCoverRequiredAmount,
    canClaim: !hasClaimed && hasInventory && hasNativeGas && willCoverRequiredAmount,
    faucet,
    paymentToken,
  }
}

async function confirmedClaimTransaction(transaction) {
  if (!isHexString(transaction.hash, 32)) {
    throw new Web3Error(
      'INVALID_TRANSACTION_HASH',
      '제출된 데모 mKRW 충전 트랜잭션 해시 형식을 확인할 수 없습니다.',
    )
  }

  let receipt
  let txHash = transaction.hash
  try {
    receipt = await transaction.wait(1, RECEIPT_TIMEOUT_MS)
  } catch (error) {
    if (error?.code === 'TRANSACTION_REPLACED' && error.receipt) {
      if (error.cancelled) throw normalizeWeb3Error(error)
      receipt = error.receipt
      txHash = error.replacement?.hash ?? receipt.hash
    } else if (error?.code === 'TRANSACTION_REPLACED' && error.cancelled) {
      throw normalizeWeb3Error(error)
    } else if (error?.receipt) {
      receipt = error.receipt
      txHash = receipt.hash ?? txHash
    } else {
      throw new Web3Error(
        'FAUCET_CLAIM_NOT_CONFIRMED',
        '데모 mKRW 충전 트랜잭션이 아직 확인되지 않았습니다. 다시 전송하지 말고 Explorer 확인 후 최신 상태를 조회해 주세요.',
        { txHash },
      )
    }
  }

  if (!receipt) {
    throw new Web3Error(
      'FAUCET_CLAIM_NOT_CONFIRMED',
      '데모 mKRW 충전 트랜잭션을 아직 확인할 수 없습니다. 다시 전송하지 말고 최신 상태를 조회해 주세요.',
      { txHash },
    )
  }
  if (receipt.status !== 1) {
    throw new Web3Error(
      'FAUCET_CLAIM_FAILED',
      '데모 mKRW 충전 트랜잭션이 블록체인에서 실패했습니다.',
      { txHash },
    )
  }
  return { receipt, txHash }
}

function verifyClaimReceipt(receipt, state, txHash) {
  const claimedEvents = findEvents(receipt, state.faucet, 'Claimed')
  const transferEvents = findEvents(receipt, state.paymentToken, 'Transfer')
  const claimedEvent = claimedEvents[0]
  const transferEvent = transferEvents[0]

  if (
    claimedEvents.length !== 1 ||
    !claimedEvent ||
    getAddress(claimedEvent.args.account) !== state.companyWallet ||
    claimedEvent.args.amount !== state.claimAmount ||
    transferEvents.length !== 1 ||
    !transferEvent ||
    getAddress(transferEvent.args.from) !== state.address ||
    getAddress(transferEvent.args.to) !== state.companyWallet ||
    transferEvent.args.value !== state.claimAmount
  ) {
    throw new Web3Error(
      'FAUCET_EVENT_MISMATCH',
      '충전 트랜잭션은 확인되었지만 정확한 Faucet 지급 이벤트를 확인하지 못했습니다. 다시 전송하지 말고 Explorer를 확인해 주세요.',
      { txHash },
    )
  }

  return {
    txHash,
    claimAmount: state.claimAmount.toString(),
  }
}

export async function getMockKrwFaucetReadiness(companyWalletAddress, requiredAmount = null) {
  try {
    const provider = await configuredReadProvider()
    const state = await faucetState(provider, companyWalletAddress, requiredAmount)
    return {
      faucetAddress: state.address,
      paymentTokenAddress: state.tokenAddress,
      walletAddress: state.companyWallet,
      claimAmount: state.claimAmount.toString(),
      faucetBalance: state.faucetBalance.toString(),
      walletBalance: state.companyWalletBalance.toString(),
      nativeBalance: state.nativeBalance.toString(),
      estimatedGasCost: state.estimatedGasCost?.toString() ?? null,
      hasClaimed: state.hasClaimed,
      hasInventory: state.hasInventory,
      hasNativeGas: state.hasNativeGas,
      willCoverRequiredAmount: state.willCoverRequiredAmount,
      canClaim: state.canClaim,
    }
  } catch (error) {
    throw normalizeFaucetError(error)
  }
}

export async function claimDemoMkrw(
  companyWalletAddress,
  requiredAmount = null,
  onSubmitted = null,
) {
  try {
    const { provider, signer } = await getGiwaSigner(companyWalletAddress)
    const state = await faucetState(provider, companyWalletAddress, requiredAmount)
    if (state.hasClaimed) {
      throw new Web3Error(
        'FAUCET_ALREADY_CLAIMED',
        '이 회사 지갑은 데모 mKRW를 이미 한 번 받았습니다. 최신 잔액을 조회해 주세요.',
      )
    }
    if (!state.hasInventory) {
      throw new Web3Error(
        'FAUCET_DEPLETED',
        '데모 mKRW Faucet 재고가 소진되었습니다. 현재 자동 충전을 이용할 수 없습니다.',
      )
    }
    if (!state.willCoverRequiredAmount) {
      throw new Web3Error(
        'FAUCET_CLAIM_AMOUNT_INSUFFICIENT',
        '1회 데모 충전 후에도 선택한 채권의 필요 금액이 부족하여 충전을 진행하지 않았습니다.',
      )
    }
    if (!state.hasNativeGas) {
      throw new Web3Error(
        'INSUFFICIENT_GAS',
        '데모 mKRW 수령에 필요한 테스트넷 가스 토큰가 없습니다. 테스트 ETH를 받은 뒤 다시 시도해 주세요.',
      )
    }

    const faucet = state.faucet.connect(signer)
    const paymentToken = state.paymentToken.connect(signer)
    const transaction = await faucet.claim()
    if (onSubmitted) {
      try {
        onSubmitted({
          txHash: transaction.hash,
          nonce: transaction.nonce,
          faucetAddress: state.address,
          walletAddress: state.companyWallet,
          claimAmount: state.claimAmount.toString(),
        })
      } catch {
        throw new Web3Error(
          'FAUCET_CLAIM_NOT_CONFIRMED',
          '충전 트랜잭션은 제출되었지만 브라우저 복구 정보를 저장하지 못했습니다. 다시 전송하지 말고 Explorer를 확인해 주세요.',
          { txHash: transaction.hash },
        )
      }
    }
    const confirmation = await confirmedClaimTransaction(transaction)
    const verified = verifyClaimReceipt(
      confirmation.receipt,
      { ...state, faucet, paymentToken },
      confirmation.txHash,
    )

    let walletBalance = null
    try {
      walletBalance = await paymentToken.balanceOf(state.companyWallet)
    } catch {
      // A successful receipt and exact events remain authoritative during RPC lag.
    }

    return {
      ...verified,
      walletBalance: walletBalance?.toString() ?? null,
    }
  } catch (error) {
    throw normalizeFaucetError(error)
  }
}

export async function inspectMockKrwFaucetClaim(
  txHash,
  companyWalletAddress,
  requiredAmount = null,
  nonce = null,
) {
  try {
    if (!isHexString(txHash, 32)) {
      throw new Web3Error(
        'INVALID_TRANSACTION_HASH',
        '저장된 데모 mKRW 충전 트랜잭션 해시가 올바르지 않습니다.',
      )
    }

    const provider = await configuredReadProvider()
    const state = await faucetState(provider, companyWalletAddress, requiredAmount)
    const receipt = await provider.getTransactionReceipt(txHash)
    if (receipt) {
      if (receipt.status !== 1) {
        return { status: 'FAILED', txHash }
      }
      return {
        status: 'CONFIRMED',
        ...verifyClaimReceipt(receipt, state, txHash),
      }
    }

    const transaction = await provider.getTransaction(txHash)
    if (
      (!transaction || transaction.blockNumber == null) &&
      Number.isSafeInteger(nonce) &&
      nonce >= 0
    ) {
      const blockNumber = await provider.getBlockNumber()
      const [nonceAtBlock, hasClaimedAtBlock] = await Promise.all([
        provider.getTransactionCount(state.companyWallet, blockNumber),
        state.faucet.hasClaimed(state.companyWallet, { blockTag: blockNumber }),
      ])
      if (nonceAtBlock > nonce) {
        return {
          status: hasClaimedAtBlock ? 'CLAIMED' : 'FAILED',
          txHash,
          claimAmount: state.claimAmount.toString(),
        }
      }
    }

    return { status: 'PENDING', txHash }
  } catch (error) {
    throw normalizeFaucetError(error)
  }
}
