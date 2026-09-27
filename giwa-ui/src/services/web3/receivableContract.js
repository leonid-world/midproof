import {
  Contract,
  getAddress,
  Interface,
  isAddress,
  isHexString,
  JsonRpcProvider,
  ZeroAddress,
  ZeroHash,
} from 'ethers'
import mockKrwAbi from '../../contracts/MockKRW.abi.json'
import receivableFinanceAbi from '../../contracts/ReceivableFinance.abi.json'
import { giwaContractConfig } from '../../contracts/addresses'
import {
  confirmBlockchainTransaction,
  createPendingBlockchainTransaction,
  failBlockchainTransaction,
} from '../blockchainTransactions'
import { ApiError } from '../api'
import { requireNewReceivableAmounts } from '../receivableAmountPolicy'
import { normalizeWeb3Error, Web3Error } from './errors'
import { getGiwaSigner, requiredChainId } from './provider'

const RECEIPT_TIMEOUT_MS = 60_000
const LEGACY_REPLACEMENT_LOOKBACK_BLOCKS = 128
const CREATE_RECEIVABLE = 'CREATE_RECEIVABLE'
const VERIFY_RECEIVABLE = 'VERIFY_RECEIVABLE'
const TOKENIZE_RECEIVABLE = 'TOKENIZE_RECEIVABLE'
const FUND_RECEIVABLE = 'FUND_RECEIVABLE'
const REPAY_RECEIVABLE = 'REPAY_RECEIVABLE'
const receivableFinanceInterface = new Interface(receivableFinanceAbi)

function normalizeContractFlowError(error) {
  return error instanceof ApiError ? error : normalizeWeb3Error(error)
}

function contractAddress() {
  const address = giwaContractConfig.receivableFinanceAddress
  if (!isAddress(address) || getAddress(address) === ZeroAddress) {
    throw new Web3Error(
      'CONTRACT_NOT_CONFIGURED',
      'VITE_RECEIVABLE_FINANCE_ADDRESS에 배포된 컨트랙트 주소를 설정해 주세요.',
    )
  }
  return getAddress(address)
}

function mockKrwAddress() {
  const address = giwaContractConfig.mockKrwAddress
  if (!isAddress(address) || getAddress(address) === ZeroAddress) {
    throw new Web3Error(
      'PAYMENT_TOKEN_NOT_CONFIGURED',
      'VITE_MOCK_KRW_ADDRESS에 배포된 MockKRW 주소를 설정해 주세요.',
    )
  }
  return getAddress(address)
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

function requireStoredContractAddress(receivable, configuredAddress) {
  if (
    !isAddress(receivable.contractAddress) ||
    getAddress(receivable.contractAddress) !== configuredAddress
  ) {
    throw new Web3Error(
      'CONTRACT_ADDRESS_MISMATCH',
      '이 채권을 생성한 컨트랙트와 현재 환경의 컨트랙트 주소가 다릅니다. 배포 설정을 확인해 주세요.',
    )
  }
}

function positiveInteger(value, fieldName) {
  const normalized = String(value)
  if (!/^[1-9][0-9]*$/.test(normalized)) {
    throw new Web3Error('INVALID_ONCHAIN_VALUE', `${fieldName} 값은 양의 정수여야 합니다.`)
  }
  return BigInt(normalized)
}

function unixDate(dateValue, fieldName) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateValue ?? '')
  if (!match) {
    throw new Web3Error('INVALID_ONCHAIN_VALUE', `${fieldName} 형식을 확인해 주세요.`)
  }

  const timestamp = Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
  return BigInt(Math.floor(timestamp / 1000))
}

function documentHash(value) {
  if (!value) return ZeroHash
  if (!isHexString(value, 32)) {
    throw new Web3Error('INVALID_DOCUMENT_HASH', '문서 해시는 32바이트 SHA-256 형식이어야 합니다.')
  }
  return value
}

function findEvent(receipt, contract, eventName) {
  return findEvents(receipt, contract, eventName)[0] ?? null
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
      // ERC-20/ERC-721 logs not represented by this interface are ignored.
    }
  }
  return events
}

function receiptMetadata(receipt) {
  const effectiveGasPrice = receipt.effectiveGasPrice ?? receipt.gasPrice
  if (receipt.blockNumber == null || receipt.gasUsed == null || effectiveGasPrice == null) {
    throw new Web3Error(
      'INVALID_TRANSACTION_RECEIPT',
      '트랜잭션 영수증의 블록 또는 가스 정보를 확인할 수 없습니다.',
      { txHash: receipt.hash },
    )
  }

  return {
    blockNumber: String(receipt.blockNumber),
    gasUsed: receipt.gasUsed.toString(),
    effectiveGasPrice: effectiveGasPrice.toString(),
  }
}

function pendingTransactionPayload(tracking, txHash) {
  return {
    receivableId: tracking.receivableId,
    transactionType: tracking.transactionType,
    contractAddress: tracking.contractAddress,
    txHash,
  }
}

function failedJournalError(journal, txHash) {
  return new Web3Error(
    'BLOCKCHAIN_TRANSACTION_FAILED',
    journal.errorMessage ?? '서버에 실패로 확정된 블록체인 트랜잭션입니다.',
    { txHash },
  )
}

function isDefinitiveTransactionFailure(error) {
  return (
    error?.code === 'TRANSACTION_FAILED' ||
    error?.code === 'TRANSACTION_CANCELLED' ||
    error?.code === 'BLOCKCHAIN_TRANSACTION_FAILED' ||
    error?.code === 'BLOCKCHAIN_TRANSACTION_REVERTED' ||
    error?.code === 'BLOCKCHAIN_TRANSACTION_VERIFICATION_FAILED' ||
    error?.code === 'BLOCKCHAIN_EVENT_MISMATCH'
  )
}

async function recordPendingTransaction(tracking, txHash, { allowFailed = false } = {}) {
  const journal = await createPendingBlockchainTransaction(
    pendingTransactionPayload(tracking, txHash),
  )
  if (journal.txStatus === 'FAILED' && !allowFailed) {
    throw failedJournalError(journal, txHash)
  }
  return journal
}

async function recordConfirmedTransaction(txHash, receipt) {
  await confirmBlockchainTransaction(txHash, receiptMetadata(receipt))
}

async function recordFailedTransaction(txHash, errorCode, errorMessage) {
  await failBlockchainTransaction(txHash, {
    errorCode,
    errorMessage,
  })
}

function transactionNotConfirmed(txHash) {
  return new Web3Error(
    'TRANSACTION_NOT_CONFIRMED',
    '트랜잭션이 아직 확인되지 않았습니다. Explorer에서 상태를 확인한 뒤 다시 시도해 주세요.',
    { txHash },
  )
}

async function confirmMinedReceipt(receipt, txHash) {
  if (!receipt) throw transactionNotConfirmed(txHash)
  if (receipt.status === 0) {
    await recordFailedTransaction(
      txHash,
      'TRANSACTION_FAILED',
      '블록체인에서 트랜잭션 실행이 실패했습니다.',
    )
    throw new Web3Error('TRANSACTION_FAILED', '블록체인 트랜잭션이 실패했습니다.', { txHash })
  }
  if (receipt.status !== 1) {
    throw new Web3Error(
      'INVALID_TRANSACTION_RECEIPT',
      '트랜잭션 영수증에서 실행 성공 여부를 확인할 수 없습니다.',
      { txHash },
    )
  }

  await recordConfirmedTransaction(txHash, receipt)
  return { receipt, txHash }
}

async function recordSubmittedTransaction(
  tracking,
  txHash,
  onSubmitted,
  extraPayload = {},
  transaction = null,
  fallbackProvider = null,
) {
  const transactionMetadata = serializableTransactionMetadata(transaction)
  let submittedPayload = {
    ...tracking.submittedPayload,
    ...extraPayload,
    ...(transactionMetadata ? { transactionMetadata } : {}),
    txHash,
  }
  await onSubmitted(submittedPayload)

  const provider = transaction?.provider ?? fallbackProvider
  if (normalizedBlockNumber(submittedPayload.replacementScanStartBlock) == null && provider) {
    const currentBlock = await safeCurrentBlockNumber(provider)
    if (currentBlock != null) {
      const replacementScanStartBlock = Math.max(0, currentBlock - 3)
      tracking.submittedPayload.replacementScanStartBlock = replacementScanStartBlock
      submittedPayload = {
        ...submittedPayload,
        replacementScanStartBlock,
      }
      await onSubmitted(submittedPayload)
    }
  }

  await recordPendingTransaction(tracking, txHash)
}

function normalizedBlockNumber(value) {
  if (value == null || value === '') return null
  const blockNumber = Number(value)
  return Number.isSafeInteger(blockNumber) && blockNumber >= 0 ? blockNumber : null
}

function normalizedNonce(value) {
  if (value == null || value === '') return null
  const nonce = Number(value)
  return Number.isSafeInteger(nonce) && nonce >= 0 ? nonce : null
}

function normalizedAddress(value) {
  if (!isAddress(value)) return null
  return getAddress(value)
}

function normalizedTransactionData(value) {
  return typeof value === 'string' && isHexString(value) ? value.toLowerCase() : null
}

function normalizedTransactionValue(value) {
  try {
    const normalized = BigInt(value)
    return normalized >= 0n ? normalized.toString() : null
  } catch {
    return null
  }
}

function serializableTransactionMetadata(transaction) {
  if (!transaction) return null

  const from = normalizedAddress(transaction.from)
  const nonce = normalizedNonce(transaction.nonce)
  const to = normalizedAddress(transaction.to)
  const data = normalizedTransactionData(transaction.data)
  const value = normalizedTransactionValue(transaction.value)
  if (!from || nonce == null || !to || !data || value == null) {
    return null
  }

  return { from, nonce, to, data, value }
}

async function safeCurrentBlockNumber(provider) {
  try {
    return normalizedBlockNumber(await provider.getBlockNumber())
  } catch {
    return null
  }
}

async function confirmReplacement(error, originalTxHash, tracking, onSubmitted, provider) {
  if (error?.code !== 'TRANSACTION_REPLACED' || !error.receipt) {
    return null
  }

  const replacementTxHash = error.replacement?.hash ?? error.receipt.hash
  if (!isHexString(replacementTxHash, 32)) {
    throw new Web3Error(
      'INVALID_TRANSACTION_HASH',
      '대체 트랜잭션 해시 형식을 확인할 수 없습니다.',
      { txHash: originalTxHash },
    )
  }

  if (error.cancelled) {
    await onSubmitted({
      ...tracking.submittedPayload,
      txHash: originalTxHash,
      replacementTxHash,
      transactionCancelled: true,
    })
    try {
      await recordFailedTransaction(
        originalTxHash,
        'TRANSACTION_REPLACED',
        '취소 트랜잭션이 기존 트랜잭션을 교체했습니다.',
      )
    } catch {
      throw new Web3Error(
        'TRANSACTION_CANCELLED_JOURNAL_PENDING',
        'MetaMask 트랜잭션은 취소되었지만 서버 실패 기록이 남아 있습니다. 재시도 버튼으로 정리해 주세요.',
        { txHash: originalTxHash },
      )
    }
    throw new Web3Error('TRANSACTION_CANCELLED', 'MetaMask에서 트랜잭션이 취소되었습니다.', {
      txHash: originalTxHash,
    })
  }

  await recordSubmittedTransaction(
    tracking,
    replacementTxHash,
    onSubmitted,
    {
      replacedTxHash: originalTxHash,
      replacementScanCursor: null,
    },
    error.replacement,
    provider,
  )

  let confirmation
  try {
    confirmation = await confirmMinedReceipt(error.receipt, replacementTxHash)
  } catch (replacementError) {
    if (isDefinitiveTransactionFailure(replacementError)) {
      await recordFailedTransaction(
        originalTxHash,
        'TRANSACTION_REPLACED',
        '대체 트랜잭션이 기존 트랜잭션을 교체했습니다.',
      )
    }
    throw replacementError
  }
  await recordFailedTransaction(
    originalTxHash,
    'TRANSACTION_REPLACED',
    '대체 트랜잭션이 기존 트랜잭션을 교체했습니다.',
  )
  return confirmation
}

async function finalizeRecoveredReplacement(confirmation, recoveryPayload) {
  if (recoveryPayload.replacedTxHash) {
    await recordFailedTransaction(
      recoveryPayload.replacedTxHash,
      'TRANSACTION_REPLACED',
      '대체 트랜잭션이 기존 트랜잭션을 교체했습니다.',
    )
  }
  return confirmation
}

async function confirmedTransaction(transaction, tracking, onSubmitted) {
  if (!isHexString(transaction.hash, 32)) {
    throw new Web3Error(
      'INVALID_TRANSACTION_HASH',
      '제출된 트랜잭션 해시 형식을 확인할 수 없습니다.',
    )
  }
  const originalTxHash = transaction.hash
  await recordSubmittedTransaction(tracking, originalTxHash, onSubmitted, {}, transaction)

  try {
    const receipt = await transaction.wait(1, RECEIPT_TIMEOUT_MS)
    if (!receipt) throw transactionNotConfirmed(originalTxHash)
    return await confirmMinedReceipt(receipt, originalTxHash)
  } catch (error) {
    if (error?.code === 'TRANSACTION_REPLACED' && error.receipt) {
      return await confirmReplacement(
        error,
        originalTxHash,
        tracking,
        onSubmitted,
        transaction.provider,
      )
    }
    if (error?.code === 'TIMEOUT') {
      throw transactionNotConfirmed(originalTxHash)
    }
    if (error?.receipt && error.receipt.status === 0) {
      await recordFailedTransaction(
        originalTxHash,
        'TRANSACTION_FAILED',
        '블록체인에서 트랜잭션 실행이 실패했습니다.',
      )
      throw new Web3Error('TRANSACTION_FAILED', '블록체인 트랜잭션이 실패했습니다.', {
        txHash: originalTxHash,
      })
    }
    if (error instanceof Web3Error) {
      throw error
    }
    throw error
  }
}

function normalizedStoredTransactionMetadata(value) {
  if (!value || typeof value !== 'object') return null

  const from = normalizedAddress(value.from)
  const nonce = normalizedNonce(value.nonce)
  const to = normalizedAddress(value.to)
  const data = normalizedTransactionData(value.data)
  const transactionValue = normalizedTransactionValue(value.value)
  if (!from || nonce == null || !to || !data || transactionValue == null) {
    return null
  }

  return {
    from,
    nonce,
    to,
    data,
    value: transactionValue,
  }
}

function transactionIntentMatches(transaction, metadata) {
  const transactionMetadata = serializableTransactionMetadata(transaction)
  return (
    transactionMetadata &&
    transactionMetadata.from === metadata.from &&
    transactionMetadata.to === metadata.to &&
    transactionMetadata.data === metadata.data &&
    transactionMetadata.value === metadata.value
  )
}

function transactionHasSenderNonce(transaction, metadata) {
  return (
    normalizedAddress(transaction.from) === metadata.from &&
    normalizedNonce(transaction.nonce) === metadata.nonce
  )
}

async function scanTransactions(provider, startBlock, endBlock, matches) {
  const candidates = []
  const seenHashes = new Set()
  for (let blockNumber = startBlock; blockNumber <= endBlock; blockNumber += 1) {
    const block = await provider.getBlock(blockNumber, true)
    if (!block) {
      throw new Web3Error(
        'TRANSACTION_REPLACEMENT_DISCOVERY_PENDING',
        `블록 #${blockNumber}을 아직 조회할 수 없어 대체 트랜잭션 탐지를 중단했습니다. 잠시 후 다시 시도해 주세요.`,
      )
    }
    for (let index = 0; index < block.length; index += 1) {
      const transaction = await block.getTransaction(index)
      if (!transaction) continue
      if (!seenHashes.has(transaction.hash) && matches(transaction)) {
        seenHashes.add(transaction.hash)
        candidates.push(transaction)
      }
    }
  }
  return candidates
}

async function recoverMissingTransaction(
  provider,
  txHash,
  tracking,
  recoveryPayload,
  onSubmitted,
  latestBlock,
) {
  const storedMetadata = normalizedStoredTransactionMetadata(recoveryPayload.transactionMetadata)
  const storedStartBlock = normalizedBlockNumber(recoveryPayload.replacementScanStartBlock)
  const replacementScanStartBlock =
    storedStartBlock ?? Math.max(0, latestBlock - LEGACY_REPLACEMENT_LOOKBACK_BLOCKS)
  const storedCursor = normalizedBlockNumber(recoveryPayload.replacementScanCursor)
  const replacementScanCursor = storedCursor ?? replacementScanStartBlock

  if (storedStartBlock !== replacementScanStartBlock || storedCursor !== replacementScanCursor) {
    await onSubmitted({
      ...tracking.submittedPayload,
      txHash,
      replacementScanStartBlock,
      replacementScanCursor,
    })
  }

  if (replacementScanCursor > latestBlock) {
    throw new Web3Error(
      'TRANSACTION_REPLACEMENT_DISCOVERY_PENDING',
      '새로 확인할 블록이 아직 없습니다. 원본 또는 대체 트랜잭션이 채굴된 뒤 다시 시도해 주세요.',
      { txHash },
    )
  }

  const scanEndBlock = Math.min(
    latestBlock,
    replacementScanCursor + LEGACY_REPLACEMENT_LOOKBACK_BLOCKS - 1,
  )
  const candidates = await scanTransactions(
    provider,
    replacementScanCursor,
    scanEndBlock,
    storedMetadata
      ? (transaction) => transactionHasSenderNonce(transaction, storedMetadata)
      : (transaction) => transactionIntentMatches(transaction, tracking.expectedTransaction),
  )

  if (candidates.length > 1) {
    throw new Web3Error(
      'TRANSACTION_REPLACEMENT_DISCOVERY_PENDING',
      '대체 트랜잭션 후보가 여러 개라 안전하게 확정할 수 없습니다. Explorer에서 원본 해시를 확인해 주세요.',
      { txHash },
    )
  }
  if (!candidates.length) {
    await onSubmitted({
      ...tracking.submittedPayload,
      txHash,
      replacementScanStartBlock,
      replacementScanCursor: scanEndBlock + 1,
    })
    throw new Web3Error(
      'TRANSACTION_REPLACEMENT_DISCOVERY_PENDING',
      scanEndBlock < latestBlock
        ? '대체 트랜잭션 탐색 범위를 저장했습니다. 다음 블록 범위를 이어서 확인하려면 다시 시도해 주세요.'
        : '원본 또는 대체 트랜잭션이 아직 확인되지 않았습니다. 잠시 후 다시 시도해 주세요.',
      { txHash },
    )
  }

  const candidate = candidates[0]
  const receipt = await provider.getTransactionReceipt(candidate.hash)
  if (!receipt) {
    throw transactionNotConfirmed(candidate.hash)
  }
  if (candidate.hash.toLowerCase() === txHash.toLowerCase()) {
    return await confirmMinedReceipt(receipt, txHash)
  }

  const sameIntent = storedMetadata ? transactionIntentMatches(candidate, storedMetadata) : true
  return await confirmReplacement(
    {
      code: 'TRANSACTION_REPLACED',
      cancelled: !sameIntent,
      reason: sameIntent ? 'repriced' : 'replaced',
      replacement: candidate,
      receipt,
    },
    txHash,
    tracking,
    onSubmitted,
    provider,
  )
}

async function recoverTrackedReceipt(provider, txHash, tracking, recoveryPayload, onSubmitted) {
  if (!isHexString(txHash, 32)) {
    throw new Web3Error(
      'INVALID_TRANSACTION_HASH',
      '저장된 트랜잭션 해시 형식을 확인할 수 없습니다.',
    )
  }

  const journal = await recordPendingTransaction(tracking, txHash, { allowFailed: true })
  if (journal.txStatus === 'FAILED') {
    await finalizeRecoveredReplacement(null, recoveryPayload)
    throw failedJournalError(journal, txHash)
  }

  try {
    const existingReceipt = await provider.getTransactionReceipt(txHash)
    if (existingReceipt) {
      const confirmation = await confirmMinedReceipt(existingReceipt, txHash)
      return await finalizeRecoveredReplacement(confirmation, recoveryPayload)
    }

    const transaction = await provider.getTransaction(txHash)
    const latestBlock = normalizedBlockNumber(await provider.getBlockNumber())
    if (latestBlock == null) {
      throw new Web3Error('INVALID_BLOCK_NUMBER', '현재 블록 번호를 확인할 수 없습니다.', {
        txHash,
      })
    }
    if (!transaction) {
      const confirmation = await recoverMissingTransaction(
        provider,
        txHash,
        tracking,
        recoveryPayload,
        onSubmitted,
        latestBlock,
      )
      return await finalizeRecoveredReplacement(confirmation, recoveryPayload)
    }

    const storedStartBlock = normalizedBlockNumber(recoveryPayload.replacementScanStartBlock)
    const replacementScanStartBlock = Math.min(
      storedStartBlock ?? Math.max(0, latestBlock - LEGACY_REPLACEMENT_LOOKBACK_BLOCKS),
      latestBlock,
    )
    tracking.submittedPayload.replacementScanStartBlock = replacementScanStartBlock
    const transactionMetadata = serializableTransactionMetadata(transaction)
    const hasStoredTransactionMetadata =
      normalizedStoredTransactionMetadata(recoveryPayload.transactionMetadata) != null
    if (
      storedStartBlock !== replacementScanStartBlock ||
      (!hasStoredTransactionMetadata && transactionMetadata)
    ) {
      await onSubmitted({
        ...tracking.submittedPayload,
        txHash,
        replacementScanStartBlock,
        ...(transactionMetadata ? { transactionMetadata } : {}),
      })
    }

    const receipt = await transaction
      .replaceableTransaction(replacementScanStartBlock)
      .wait(1, RECEIPT_TIMEOUT_MS)
    if (!receipt) throw transactionNotConfirmed(txHash)
    const confirmation = await confirmMinedReceipt(receipt, txHash)
    return await finalizeRecoveredReplacement(confirmation, recoveryPayload)
  } catch (error) {
    if (error?.code === 'TRANSACTION_REPLACED' && error.receipt) {
      try {
        const confirmation = await confirmReplacement(
          error,
          txHash,
          tracking,
          onSubmitted,
          provider,
        )
        return await finalizeRecoveredReplacement(confirmation, recoveryPayload)
      } catch (replacementError) {
        if (isDefinitiveTransactionFailure(replacementError)) {
          await finalizeRecoveredReplacement(null, recoveryPayload)
        }
        throw replacementError
      }
    }
    if (error?.code === 'TIMEOUT') {
      throw transactionNotConfirmed(txHash)
    }
    if (isDefinitiveTransactionFailure(error)) {
      await finalizeRecoveredReplacement(null, recoveryPayload)
      throw error
    }
    if (error instanceof Web3Error) {
      throw error
    }
    if (error?.receipt && error.receipt.status === 0) {
      await recordFailedTransaction(
        txHash,
        'TRANSACTION_FAILED',
        '블록체인에서 트랜잭션 실행이 실패했습니다.',
      )
      await finalizeRecoveredReplacement(null, recoveryPayload)
      throw new Web3Error('TRANSACTION_FAILED', '블록체인 트랜잭션이 실패했습니다.', { txHash })
    }
    throw error
  }
}

function expectedTransactionMetadata(receivable, transactionType, address) {
  let from
  let data
  if (transactionType === CREATE_RECEIVABLE) {
    from = getAddress(receivable.sellerWalletAddress)
    data = receivableFinanceInterface.encodeFunctionData('createReceivable', [
      receivable.buyerWalletAddress,
      positiveInteger(receivable.faceValue, '채권 금액'),
      positiveInteger(receivable.fundingAmount, '펀딩 요청 금액'),
      unixDate(receivable.issueDate, '발행일'),
      unixDate(receivable.maturityDate, '만기일'),
      documentHash(receivable.documentHash),
    ])
  } else if (transactionType === VERIFY_RECEIVABLE) {
    from = getAddress(receivable.buyerWalletAddress)
    data = receivableFinanceInterface.encodeFunctionData('verifyReceivable', [
      positiveInteger(receivable.onchainReceivableId, '온체인 채권 ID'),
    ])
  } else if (transactionType === TOKENIZE_RECEIVABLE) {
    from = getAddress(receivable.sellerWalletAddress)
    data = receivableFinanceInterface.encodeFunctionData('tokenizeReceivable', [
      positiveInteger(receivable.onchainReceivableId, '온체인 채권 ID'),
    ])
  } else if (transactionType === FUND_RECEIVABLE) {
    from = getAddress(receivable.funderWalletAddress)
    data = receivableFinanceInterface.encodeFunctionData('fundReceivable', [
      positiveInteger(receivable.onchainReceivableId, '온체인 채권 ID'),
    ])
  } else if (transactionType === REPAY_RECEIVABLE) {
    from = getAddress(receivable.buyerWalletAddress)
    data = receivableFinanceInterface.encodeFunctionData('repayReceivable', [
      positiveInteger(receivable.onchainReceivableId, '온체인 채권 ID'),
    ])
  } else {
    throw new Web3Error(
      'INVALID_PENDING_TRANSACTION',
      '블록체인 트랜잭션 종류를 확인할 수 없습니다.',
    )
  }

  return {
    from,
    to: address,
    data: data.toLowerCase(),
    value: '0',
  }
}

function transactionTracking(
  receivable,
  transactionType,
  address,
  replacementScanStartBlock = null,
) {
  const submittedPayload =
    transactionType === CREATE_RECEIVABLE
      ? { contractAddress: address }
      : transactionType === FUND_RECEIVABLE
        ? { funderWalletAddress: receivable.funderWalletAddress }
        : {}
  const normalizedStartBlock = normalizedBlockNumber(replacementScanStartBlock)
  if (normalizedStartBlock != null) {
    submittedPayload.replacementScanStartBlock = normalizedStartBlock
  }

  return {
    receivableId: receivable.receivableId,
    transactionType,
    contractAddress: address,
    expectedTransaction: expectedTransactionMetadata(receivable, transactionType, address),
    submittedPayload,
  }
}

function trackingForSynchronization(receivable, synchronization, address) {
  if (synchronization.type === 'chain-created') {
    return transactionTracking(receivable, CREATE_RECEIVABLE, address)
  }
  if (synchronization.type === 'verified') {
    return transactionTracking(receivable, VERIFY_RECEIVABLE, address)
  }
  if (synchronization.type === 'tokenized') {
    return transactionTracking(receivable, TOKENIZE_RECEIVABLE, address)
  }
  if (synchronization.type === 'funded') {
    return transactionTracking(
      {
        ...receivable,
        funderWalletAddress:
          synchronization.payload.funderWalletAddress ?? receivable.funderWalletAddress,
      },
      FUND_RECEIVABLE,
      address,
    )
  }
  if (synchronization.type === 'repaid') {
    return transactionTracking(receivable, REPAY_RECEIVABLE, address)
  }
  throw new Web3Error('INVALID_PENDING_TRANSACTION', '저장된 트랜잭션 종류를 확인할 수 없습니다.', {
    txHash: synchronization.payload?.txHash,
  })
}

function createdResult(receipt, contract, receivable, txHash, address) {
  const event = findEvent(receipt, contract, 'ReceivableCreated')
  if (
    !event ||
    getAddress(event.args.seller) !== getAddress(receivable.sellerWalletAddress) ||
    getAddress(event.args.buyer) !== getAddress(receivable.buyerWalletAddress) ||
    event.args.faceValue !== positiveInteger(receivable.faceValue, '채권 금액') ||
    event.args.fundingAmount !== positiveInteger(receivable.fundingAmount, '펀딩 요청 금액') ||
    event.args.issueDate !== unixDate(receivable.issueDate, '발행일') ||
    event.args.maturityDate !== unixDate(receivable.maturityDate, '만기일') ||
    event.args.documentHash.toLowerCase() !== documentHash(receivable.documentHash).toLowerCase()
  ) {
    throw new Web3Error(
      'CONTRACT_EVENT_NOT_FOUND',
      '트랜잭션은 확인되었지만 대상 ReceivableCreated 이벤트를 찾지 못했습니다.',
      { txHash },
    )
  }

  return {
    onchainReceivableId: event.args.receivableId.toString(),
    contractAddress: address,
    txHash,
  }
}

function verifiedResult(receipt, contract, receivable, txHash) {
  const event = findEvent(receipt, contract, 'ReceivableVerified')
  if (
    !event ||
    event.args.receivableId.toString() !== String(receivable.onchainReceivableId) ||
    getAddress(event.args.buyer) !== getAddress(receivable.buyerWalletAddress)
  ) {
    throw new Web3Error(
      'CONTRACT_EVENT_NOT_FOUND',
      '트랜잭션은 확인되었지만 대상 ReceivableVerified 이벤트를 찾지 못했습니다.',
      { txHash },
    )
  }

  return { txHash }
}

function tokenizedResult(receipt, contract, receivable, txHash, address) {
  const event = findEvent(receipt, contract, 'ReceivableTokenized')
  if (
    !event ||
    event.args.receivableId.toString() !== String(receivable.onchainReceivableId) ||
    event.args.tokenId <= 0n ||
    getAddress(event.args.custodian) !== address
  ) {
    throw new Web3Error(
      'CONTRACT_EVENT_NOT_FOUND',
      '트랜잭션은 확인되었지만 대상 ReceivableTokenized 이벤트를 찾지 못했습니다.',
      { txHash },
    )
  }

  return {
    tokenId: event.args.tokenId.toString(),
    txHash,
  }
}

function receivableTermsMatch(onchainReceivable, receivable) {
  return (
    onchainReceivable.id.toString() === String(receivable.onchainReceivableId) &&
    getAddress(onchainReceivable.seller) === getAddress(receivable.sellerWalletAddress) &&
    getAddress(onchainReceivable.buyer) === getAddress(receivable.buyerWalletAddress) &&
    onchainReceivable.faceValue === positiveInteger(receivable.faceValue, '채권 금액') &&
    onchainReceivable.fundingAmount ===
      positiveInteger(receivable.fundingAmount, '펀딩 요청 금액') &&
    onchainReceivable.issueDate === unixDate(receivable.issueDate, '발행일') &&
    onchainReceivable.maturityDate === unixDate(receivable.maturityDate, '만기일') &&
    onchainReceivable.documentHash.toLowerCase() ===
      documentHash(receivable.documentHash).toLowerCase()
  )
}

function requireCreatedReceivableMatches(onchainReceivable, receivable) {
  const matches = receivableTermsMatch(onchainReceivable, receivable)

  if (!matches) {
    throw new Web3Error(
      'ONCHAIN_RECEIVABLE_MISMATCH',
      '화면의 채권 정보와 온체인에 등록된 채권 정보가 일치하지 않아 검증을 중단했습니다.',
    )
  }
  if (onchainReceivable.status !== 0n) {
    throw new Web3Error(
      'ONCHAIN_RECEIVABLE_NOT_CREATED',
      '채권이 Buyer 검증 가능한 CREATED 상태가 아닙니다. 화면을 새로고침해 주세요.',
    )
  }
}

function requireVerifiedReceivableMatches(onchainReceivable, receivable) {
  if (!receivableTermsMatch(onchainReceivable, receivable)) {
    throw new Web3Error(
      'ONCHAIN_RECEIVABLE_MISMATCH',
      '화면의 채권 정보와 온체인에 등록된 채권 정보가 일치하지 않아 토큰화를 중단했습니다.',
    )
  }
  if (onchainReceivable.status !== 1n) {
    throw new Web3Error(
      'ONCHAIN_RECEIVABLE_NOT_VERIFIED',
      '채권이 Seller 토큰화 가능한 VERIFIED 상태가 아닙니다. 화면을 새로고침해 주세요.',
    )
  }
}

function requireFundingCandidate(receivable, funderWalletAddress) {
  if (receivable?.status !== 'TOKENIZED') {
    throw new Web3Error(
      'RECEIVABLE_NOT_TOKENIZED',
      'DB 채권이 Funder 자금 공급 가능한 TOKENIZED 상태가 아닙니다.',
    )
  }

  const funder = normalizedAddress(funderWalletAddress)
  if (!funder) {
    throw new Web3Error(
      'WALLET_NOT_CONNECTED',
      '자금 공급에 사용할 회사 지갑 주소를 확인할 수 없습니다.',
    )
  }
  if (
    funder === getAddress(receivable.sellerWalletAddress) ||
    funder === getAddress(receivable.buyerWalletAddress)
  ) {
    throw new Web3Error(
      'RELATED_PARTY_CANNOT_FUND',
      'Seller 또는 Buyer 회사는 이 채권에 자금을 공급할 수 없습니다.',
    )
  }
  return funder
}

function requireTokenizedReceivableMatches(onchainReceivable, receivable, address) {
  if (!receivableTermsMatch(onchainReceivable, receivable)) {
    throw new Web3Error(
      'ONCHAIN_RECEIVABLE_MISMATCH',
      '화면의 채권 정보와 온체인에 등록된 채권 정보가 일치하지 않아 자금 공급을 중단했습니다.',
    )
  }
  if (onchainReceivable.status !== 2n) {
    throw new Web3Error(
      'ONCHAIN_RECEIVABLE_NOT_TOKENIZED',
      '채권이 Funder 자금 공급 가능한 TOKENIZED 상태가 아닙니다. 화면을 새로고침해 주세요.',
    )
  }

  const tokenId = positiveInteger(receivable.tokenId, 'NFT 토큰 ID')
  if (
    onchainReceivable.tokenId !== tokenId ||
    getAddress(onchainReceivable.funder) !== ZeroAddress
  ) {
    throw new Web3Error(
      'ONCHAIN_RECEIVABLE_MISMATCH',
      '채권의 NFT 또는 Funder 상태가 화면 정보와 일치하지 않습니다.',
    )
  }
  return { tokenId, contractAddress: address }
}

async function fundingState(provider, receivable, funderWalletAddress) {
  const address = contractAddress()
  const paymentTokenAddress = mockKrwAddress()
  requireStoredContractAddress(receivable, address)
  const funder = requireFundingCandidate(receivable, funderWalletAddress)
  const receivableId = positiveInteger(receivable.onchainReceivableId, '온체인 채권 ID')
  const fundingAmount = positiveInteger(receivable.fundingAmount, '펀딩 요청 금액')
  const financeContract = new Contract(address, receivableFinanceAbi, provider)
  const paymentTokenContract = new Contract(paymentTokenAddress, mockKrwAbi, provider)

  const [configuredPaymentToken, onchainReceivable, decimals, balance, allowance] =
    await Promise.all([
      financeContract.paymentToken(),
      financeContract.getReceivable(receivableId),
      paymentTokenContract.decimals(),
      paymentTokenContract.balanceOf(funder),
      paymentTokenContract.allowance(funder, address),
    ])
  if (getAddress(configuredPaymentToken) !== paymentTokenAddress) {
    throw new Web3Error(
      'PAYMENT_TOKEN_ADDRESS_MISMATCH',
      'ReceivableFinance가 사용하는 결제 토큰과 VITE_MOCK_KRW_ADDRESS가 일치하지 않습니다.',
    )
  }
  if (
    receivable.mockTokenAddress &&
    (!isAddress(receivable.mockTokenAddress) ||
      getAddress(receivable.mockTokenAddress) !== paymentTokenAddress)
  ) {
    throw new Web3Error(
      'PAYMENT_TOKEN_ADDRESS_MISMATCH',
      'DB에 기록된 결제 토큰과 현재 MockKRW 설정이 일치하지 않습니다.',
    )
  }
  if (decimals !== 0n) {
    throw new Web3Error(
      'PAYMENT_TOKEN_DECIMALS_MISMATCH',
      'MockKRW decimals가 MVP 기준인 0이 아닙니다. 컨트랙트 배포 설정을 확인해 주세요.',
    )
  }

  const { tokenId } = requireTokenizedReceivableMatches(onchainReceivable, receivable, address)
  const owner = getAddress(await financeContract.ownerOf(tokenId))
  if (owner !== address) {
    throw new Web3Error(
      'NFT_NOT_IN_ESCROW',
      '채권 NFT가 ReceivableFinance 에스크로에 없어 자금 공급을 진행할 수 없습니다.',
    )
  }

  return {
    address,
    paymentTokenAddress,
    funder,
    receivableId,
    tokenId,
    fundingAmount,
    balance,
    allowance,
    financeContract,
    paymentTokenContract,
  }
}

function requireRepaymentCandidate(receivable, buyerWalletAddress) {
  if (receivable?.status !== 'FUNDED') {
    throw new Web3Error(
      'RECEIVABLE_NOT_FUNDED',
      'DB 채권이 Buyer 상환 가능한 FUNDED 상태가 아닙니다.',
    )
  }

  const buyer = normalizedAddress(buyerWalletAddress)
  if (!buyer) {
    throw new Web3Error(
      'WALLET_NOT_CONNECTED',
      '상환에 사용할 Buyer 회사 지갑 주소를 확인할 수 없습니다.',
    )
  }
  if (
    !isAddress(receivable.buyerWalletAddress) ||
    buyer !== getAddress(receivable.buyerWalletAddress)
  ) {
    throw new Web3Error(
      'WALLET_MISMATCH',
      '현재 회사 지갑이 이 채권에 등록된 Buyer 지갑과 일치하지 않습니다.',
    )
  }
  if (
    !isAddress(receivable.funderWalletAddress) ||
    !isAddress(receivable.mockTokenAddress) ||
    !isHexString(receivable.fundingTxHash, 32)
  ) {
    throw new Web3Error(
      'INCOMPLETE_FUNDING_METADATA',
      '상환에 필요한 Funder·결제 토큰·펀딩 트랜잭션 정보가 DB에 없습니다.',
    )
  }
  return buyer
}

function requireFundedReceivableMatches(onchainReceivable, receivable) {
  if (!receivableTermsMatch(onchainReceivable, receivable)) {
    throw new Web3Error(
      'ONCHAIN_RECEIVABLE_MISMATCH',
      '화면의 채권 정보와 온체인에 등록된 채권 정보가 일치하지 않아 상환을 중단했습니다.',
    )
  }
  if (onchainReceivable.status !== 3n) {
    throw new Web3Error(
      'ONCHAIN_RECEIVABLE_NOT_FUNDED',
      '채권이 Buyer 상환 가능한 FUNDED 상태가 아닙니다. 화면을 새로고침해 주세요.',
    )
  }

  const tokenId = positiveInteger(receivable.tokenId, 'NFT 토큰 ID')
  const funder = getAddress(receivable.funderWalletAddress)
  if (onchainReceivable.tokenId !== tokenId || getAddress(onchainReceivable.funder) !== funder) {
    throw new Web3Error(
      'ONCHAIN_RECEIVABLE_MISMATCH',
      '채권의 NFT 또는 Funder 정보가 화면 정보와 일치하지 않습니다.',
    )
  }
  return tokenId
}

async function repaymentState(provider, receivable, buyerWalletAddress) {
  const address = contractAddress()
  const paymentTokenAddress = mockKrwAddress()
  requireStoredContractAddress(receivable, address)
  const buyer = requireRepaymentCandidate(receivable, buyerWalletAddress)
  const receivableId = positiveInteger(receivable.onchainReceivableId, '온체인 채권 ID')
  const faceValue = positiveInteger(receivable.faceValue, '채권 금액')
  const financeContract = new Contract(address, receivableFinanceAbi, provider)
  const paymentTokenContract = new Contract(paymentTokenAddress, mockKrwAbi, provider)

  const [configuredPaymentToken, onchainReceivable, decimals, balance, allowance] =
    await Promise.all([
      financeContract.paymentToken(),
      financeContract.getReceivable(receivableId),
      paymentTokenContract.decimals(),
      paymentTokenContract.balanceOf(buyer),
      paymentTokenContract.allowance(buyer, address),
    ])
  if (getAddress(configuredPaymentToken) !== paymentTokenAddress) {
    throw new Web3Error(
      'PAYMENT_TOKEN_ADDRESS_MISMATCH',
      'ReceivableFinance가 사용하는 결제 토큰과 VITE_MOCK_KRW_ADDRESS가 일치하지 않습니다.',
    )
  }
  if (getAddress(receivable.mockTokenAddress) !== paymentTokenAddress) {
    throw new Web3Error(
      'PAYMENT_TOKEN_ADDRESS_MISMATCH',
      'DB에 기록된 결제 토큰과 현재 MockKRW 설정이 일치하지 않습니다.',
    )
  }
  if (decimals !== 0n) {
    throw new Web3Error(
      'PAYMENT_TOKEN_DECIMALS_MISMATCH',
      'MockKRW decimals가 MVP 기준인 0이 아닙니다. 컨트랙트 배포 설정을 확인해 주세요.',
    )
  }

  const tokenId = requireFundedReceivableMatches(onchainReceivable, receivable)
  const recipient = getAddress(await financeContract.ownerOf(tokenId))

  return {
    address,
    paymentTokenAddress,
    buyer,
    recipient,
    receivableId,
    tokenId,
    faceValue,
    balance,
    allowance,
    financeContract,
    paymentTokenContract,
  }
}

async function confirmedApprovalTransaction(transaction) {
  if (!isHexString(transaction.hash, 32)) {
    throw new Web3Error(
      'INVALID_TRANSACTION_HASH',
      '제출된 MockKRW 승인 트랜잭션 해시 형식을 확인할 수 없습니다.',
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
    } else if (error?.code === 'TIMEOUT') {
      throw new Web3Error(
        'APPROVAL_NOT_CONFIRMED',
        'MockKRW 사용 승인이 아직 확인되지 않았습니다. 승인 트랜잭션을 다시 보내지 말고 잠시 후 잔액·승인 상태를 새로고침해 주세요.',
        { txHash },
      )
    } else {
      throw error
    }
  }

  if (!receipt) {
    throw new Web3Error(
      'APPROVAL_NOT_CONFIRMED',
      'MockKRW 사용 승인이 아직 확인되지 않았습니다. 잠시 후 다시 확인해 주세요.',
      { txHash },
    )
  }
  if (receipt.status !== 1) {
    throw new Web3Error(
      'APPROVAL_FAILED',
      'MockKRW 사용 승인 트랜잭션이 블록체인에서 실패했습니다.',
      { txHash },
    )
  }
  return { receipt, txHash }
}

async function fundedResult(
  receipt,
  financeContract,
  paymentTokenContract,
  receivable,
  funder,
  txHash,
  address,
) {
  const receivableId = positiveInteger(receivable.onchainReceivableId, '온체인 채권 ID')
  const tokenId = positiveInteger(receivable.tokenId, 'NFT 토큰 ID')
  const fundingAmount = positiveInteger(receivable.fundingAmount, '펀딩 요청 금액')
  const seller = getAddress(receivable.sellerWalletAddress)
  const fundedEvents = findEvents(receipt, financeContract, 'ReceivableFunded')
  const nftTransfers = findEvents(receipt, financeContract, 'Transfer')
  const tokenTransfers = findEvents(receipt, paymentTokenContract, 'Transfer')
  const fundedEvent = fundedEvents[0]
  const nftTransfer = nftTransfers[0]
  const tokenTransfer = tokenTransfers[0]

  if (
    fundedEvents.length !== 1 ||
    !fundedEvent ||
    fundedEvent.args.receivableId !== receivableId ||
    fundedEvent.args.tokenId !== tokenId ||
    getAddress(fundedEvent.args.funder) !== funder ||
    getAddress(fundedEvent.args.seller) !== seller ||
    fundedEvent.args.fundingAmount !== fundingAmount ||
    nftTransfers.length !== 1 ||
    !nftTransfer ||
    getAddress(nftTransfer.args.from) !== address ||
    getAddress(nftTransfer.args.to) !== funder ||
    nftTransfer.args.tokenId !== tokenId ||
    tokenTransfers.length !== 1 ||
    !tokenTransfer ||
    getAddress(tokenTransfer.args.from) !== funder ||
    getAddress(tokenTransfer.args.to) !== seller ||
    tokenTransfer.args.value !== fundingAmount
  ) {
    throw new Web3Error(
      'CONTRACT_EVENT_NOT_FOUND',
      '트랜잭션은 확인되었지만 대상 펀딩·MockKRW·NFT 이전 이벤트를 정확히 확인하지 못했습니다.',
      { txHash },
    )
  }

  const blockTag = receipt.blockNumber
  const [onchainReceivable, nftOwner] = await Promise.all([
    financeContract.getReceivable(receivableId, { blockTag }),
    financeContract.ownerOf(tokenId, { blockTag }),
  ])
  if (
    onchainReceivable.status !== 3n ||
    getAddress(onchainReceivable.funder) !== funder ||
    getAddress(nftOwner) !== funder
  ) {
    throw new Web3Error(
      'ONCHAIN_FUNDING_STATE_MISMATCH',
      '펀딩 트랜잭션 이후 채권 상태 또는 NFT 소유자가 Funder와 일치하지 않습니다.',
      { txHash },
    )
  }

  return {
    txHash,
    tokenId: tokenId.toString(),
    funderWalletAddress: funder,
  }
}

async function repaidResult(
  receipt,
  financeContract,
  paymentTokenContract,
  receivable,
  buyer,
  txHash,
) {
  const receivableId = positiveInteger(receivable.onchainReceivableId, '온체인 채권 ID')
  const tokenId = positiveInteger(receivable.tokenId, 'NFT 토큰 ID')
  const faceValue = positiveInteger(receivable.faceValue, '채권 금액')
  const repaidEvents = findEvents(receipt, financeContract, 'ReceivableRepaid')
  const tokenTransfers = findEvents(receipt, paymentTokenContract, 'Transfer')
  const repaidEvent = repaidEvents[0]
  const tokenTransfer = tokenTransfers[0]

  if (
    repaidEvents.length !== 1 ||
    !repaidEvent ||
    repaidEvent.args.receivableId !== receivableId ||
    repaidEvent.args.tokenId !== tokenId ||
    getAddress(repaidEvent.args.buyer) !== buyer ||
    repaidEvent.args.faceValue !== faceValue ||
    tokenTransfers.length !== 1 ||
    !tokenTransfer ||
    getAddress(tokenTransfer.args.from) !== buyer ||
    getAddress(tokenTransfer.args.to) !== getAddress(repaidEvent.args.recipient) ||
    tokenTransfer.args.value !== faceValue
  ) {
    throw new Web3Error(
      'CONTRACT_EVENT_NOT_FOUND',
      '트랜잭션은 확인되었지만 대상 상환·MockKRW 이전 이벤트를 정확히 확인하지 못했습니다.',
      { txHash },
    )
  }

  const recipient = getAddress(repaidEvent.args.recipient)
  const blockTag = receipt.blockNumber
  const [onchainReceivable, nftOwner] = await Promise.all([
    financeContract.getReceivable(receivableId, { blockTag }),
    financeContract.ownerOf(tokenId, { blockTag }),
  ])
  if (
    onchainReceivable.status !== 4n ||
    onchainReceivable.tokenId !== tokenId ||
    getAddress(onchainReceivable.buyer) !== buyer ||
    getAddress(nftOwner) !== recipient
  ) {
    throw new Web3Error(
      'ONCHAIN_REPAYMENT_STATE_MISMATCH',
      '상환 트랜잭션 이후 채권 상태 또는 상환 수취인이 일치하지 않습니다.',
      { txHash },
    )
  }

  return {
    txHash,
    tokenId: tokenId.toString(),
    recipient,
  }
}

export async function getFundingReadiness(receivable, funderWalletAddress) {
  try {
    await requireNewReceivableAmounts(receivable)
    const provider = await configuredReadProvider()
    const state = await fundingState(provider, receivable, funderWalletAddress)
    return {
      financeAddress: state.address,
      paymentTokenAddress: state.paymentTokenAddress,
      funderWalletAddress: state.funder,
      tokenId: state.tokenId.toString(),
      fundingAmount: state.fundingAmount.toString(),
      balance: state.balance.toString(),
      allowance: state.allowance.toString(),
      hasSufficientBalance: state.balance >= state.fundingAmount,
      hasSufficientAllowance: state.allowance >= state.fundingAmount,
    }
  } catch (error) {
    throw normalizeContractFlowError(error)
  }
}

export async function approveFundingAmount(receivable, funderWalletAddress) {
  try {
    await requireNewReceivableAmounts(receivable)
    const { provider, signer } = await getGiwaSigner(funderWalletAddress)
    const state = await fundingState(provider, receivable, funderWalletAddress)
    if (state.balance < state.fundingAmount) {
      throw new Web3Error(
        'INSUFFICIENT_PAYMENT_TOKEN_BALANCE',
        'MockKRW 잔액이 펀딩 요청 금액보다 부족합니다.',
      )
    }
    if (state.allowance >= state.fundingAmount) {
      return {
        txHash: null,
        allowance: state.allowance.toString(),
        alreadyApproved: true,
      }
    }

    const paymentTokenContract = state.paymentTokenContract.connect(signer)
    const transaction = await paymentTokenContract.approve(state.address, state.fundingAmount)
    const confirmation = await confirmedApprovalTransaction(transaction)
    const approvalEvents = findEvents(confirmation.receipt, paymentTokenContract, 'Approval')
    const approvalEvent = approvalEvents[0]
    if (
      approvalEvents.length !== 1 ||
      !approvalEvent ||
      getAddress(approvalEvent.args.owner) !== state.funder ||
      getAddress(approvalEvent.args.spender) !== state.address ||
      approvalEvent.args.value !== state.fundingAmount
    ) {
      throw new Web3Error(
        'APPROVAL_EVENT_MISMATCH',
        '승인 트랜잭션은 확인되었지만 정확한 MockKRW Approval 이벤트를 찾지 못했습니다.',
        { txHash: confirmation.txHash },
      )
    }

    const allowance = await paymentTokenContract.allowance(state.funder, state.address)
    if (allowance < state.fundingAmount) {
      throw new Web3Error(
        'APPROVAL_STATE_MISMATCH',
        '승인 완료 후 MockKRW allowance가 펀딩 요청 금액보다 작습니다. 상태를 새로고침해 주세요.',
        { txHash: confirmation.txHash },
      )
    }
    return {
      txHash: confirmation.txHash,
      allowance: allowance.toString(),
      alreadyApproved: false,
    }
  } catch (error) {
    throw normalizeContractFlowError(error)
  }
}

export async function getRepaymentReadiness(receivable, buyerWalletAddress) {
  try {
    const provider = await configuredReadProvider()
    const state = await repaymentState(provider, receivable, buyerWalletAddress)
    return {
      financeAddress: state.address,
      paymentTokenAddress: state.paymentTokenAddress,
      buyerWalletAddress: state.buyer,
      recipientWalletAddress: state.recipient,
      tokenId: state.tokenId.toString(),
      faceValue: state.faceValue.toString(),
      balance: state.balance.toString(),
      allowance: state.allowance.toString(),
      hasSufficientBalance: state.balance >= state.faceValue,
      hasSufficientAllowance: state.allowance >= state.faceValue,
    }
  } catch (error) {
    throw normalizeContractFlowError(error)
  }
}

export async function approveRepaymentAmount(receivable, buyerWalletAddress) {
  try {
    const { provider, signer } = await getGiwaSigner(buyerWalletAddress)
    const state = await repaymentState(provider, receivable, buyerWalletAddress)
    if (state.balance < state.faceValue) {
      throw new Web3Error(
        'INSUFFICIENT_PAYMENT_TOKEN_BALANCE',
        'MockKRW 잔액이 상환할 채권 금액보다 부족합니다.',
      )
    }
    if (state.allowance >= state.faceValue) {
      return {
        txHash: null,
        allowance: state.allowance.toString(),
        alreadyApproved: true,
      }
    }

    const paymentTokenContract = state.paymentTokenContract.connect(signer)
    const transaction = await paymentTokenContract.approve(state.address, state.faceValue)
    const confirmation = await confirmedApprovalTransaction(transaction)
    const approvalEvents = findEvents(confirmation.receipt, paymentTokenContract, 'Approval')
    const approvalEvent = approvalEvents[0]
    if (
      approvalEvents.length !== 1 ||
      !approvalEvent ||
      getAddress(approvalEvent.args.owner) !== state.buyer ||
      getAddress(approvalEvent.args.spender) !== state.address ||
      approvalEvent.args.value !== state.faceValue
    ) {
      throw new Web3Error(
        'APPROVAL_EVENT_MISMATCH',
        '승인 트랜잭션은 확인되었지만 정확한 MockKRW Approval 이벤트를 찾지 못했습니다.',
        { txHash: confirmation.txHash },
      )
    }

    const allowance = await paymentTokenContract.allowance(state.buyer, state.address)
    if (allowance < state.faceValue) {
      throw new Web3Error(
        'APPROVAL_STATE_MISMATCH',
        '승인 완료 후 MockKRW allowance가 상환할 채권 금액보다 작습니다. 상태를 새로고침해 주세요.',
        { txHash: confirmation.txHash },
      )
    }
    return {
      txHash: confirmation.txHash,
      allowance: allowance.toString(),
      alreadyApproved: false,
    }
  } catch (error) {
    throw normalizeContractFlowError(error)
  }
}

export async function createReceivableOnchain(receivable, onSubmitted = () => {}) {
  try {
    await requireNewReceivableAmounts(receivable)
    const { provider, signer } = await getGiwaSigner(receivable.sellerWalletAddress)
    const address = contractAddress()
    const contract = new Contract(address, receivableFinanceAbi, signer)
    const replacementScanStartBlock = await safeCurrentBlockNumber(provider)
    const tracking = transactionTracking(
      receivable,
      CREATE_RECEIVABLE,
      address,
      replacementScanStartBlock,
    )
    const transaction = await contract.createReceivable(
      receivable.buyerWalletAddress,
      positiveInteger(receivable.faceValue, '채권 금액'),
      positiveInteger(receivable.fundingAmount, '펀딩 요청 금액'),
      unixDate(receivable.issueDate, '발행일'),
      unixDate(receivable.maturityDate, '만기일'),
      documentHash(receivable.documentHash),
    )
    const confirmation = await confirmedTransaction(transaction, tracking, onSubmitted)
    return createdResult(confirmation.receipt, contract, receivable, confirmation.txHash, address)
  } catch (error) {
    throw normalizeContractFlowError(error)
  }
}

export async function verifyReceivableOnchain(receivable, onSubmitted = () => {}) {
  try {
    const address = contractAddress()
    requireStoredContractAddress(receivable, address)
    const { provider, signer } = await getGiwaSigner(receivable.buyerWalletAddress)
    const contract = new Contract(address, receivableFinanceAbi, signer)
    const receivableId = positiveInteger(receivable.onchainReceivableId, '온체인 채권 ID')
    const onchainReceivable = await contract.getReceivable(receivableId)
    requireCreatedReceivableMatches(onchainReceivable, receivable)

    const replacementScanStartBlock = await safeCurrentBlockNumber(provider)
    const tracking = transactionTracking(
      receivable,
      VERIFY_RECEIVABLE,
      address,
      replacementScanStartBlock,
    )
    const transaction = await contract.verifyReceivable(receivableId)
    const confirmation = await confirmedTransaction(transaction, tracking, onSubmitted)
    return verifiedResult(confirmation.receipt, contract, receivable, confirmation.txHash)
  } catch (error) {
    throw normalizeContractFlowError(error)
  }
}

export async function tokenizeReceivableOnchain(receivable, onSubmitted = () => {}) {
  try {
    const address = contractAddress()
    requireStoredContractAddress(receivable, address)
    const { provider, signer } = await getGiwaSigner(receivable.sellerWalletAddress)
    const contract = new Contract(address, receivableFinanceAbi, signer)
    const receivableId = positiveInteger(receivable.onchainReceivableId, '온체인 채권 ID')
    const onchainReceivable = await contract.getReceivable(receivableId)
    requireVerifiedReceivableMatches(onchainReceivable, receivable)

    const replacementScanStartBlock = await safeCurrentBlockNumber(provider)
    const tracking = transactionTracking(
      receivable,
      TOKENIZE_RECEIVABLE,
      address,
      replacementScanStartBlock,
    )
    const transaction = await contract.tokenizeReceivable(receivableId)
    const confirmation = await confirmedTransaction(transaction, tracking, onSubmitted)
    return tokenizedResult(confirmation.receipt, contract, receivable, confirmation.txHash, address)
  } catch (error) {
    throw normalizeContractFlowError(error)
  }
}

export async function fundReceivableOnchain(
  receivable,
  funderWalletAddress,
  onSubmitted = () => {},
) {
  try {
    await requireNewReceivableAmounts(receivable)
    const { provider, signer } = await getGiwaSigner(funderWalletAddress)
    const state = await fundingState(provider, receivable, funderWalletAddress)
    if (state.balance < state.fundingAmount) {
      throw new Web3Error(
        'INSUFFICIENT_PAYMENT_TOKEN_BALANCE',
        'MockKRW 잔액이 펀딩 요청 금액보다 부족합니다.',
      )
    }
    if (state.allowance < state.fundingAmount) {
      throw new Web3Error(
        'INSUFFICIENT_PAYMENT_TOKEN_ALLOWANCE',
        '먼저 펀딩 요청 금액만큼 MockKRW 사용 승인을 완료해 주세요.',
      )
    }

    const financeContract = state.financeContract.connect(signer)
    const paymentTokenContract = state.paymentTokenContract.connect(signer)
    const replacementScanStartBlock = await safeCurrentBlockNumber(provider)
    const trackedReceivable = {
      ...receivable,
      funderWalletAddress: state.funder,
    }
    const tracking = transactionTracking(
      trackedReceivable,
      FUND_RECEIVABLE,
      state.address,
      replacementScanStartBlock,
    )
    const transaction = await financeContract.fundReceivable(state.receivableId)
    const confirmation = await confirmedTransaction(transaction, tracking, onSubmitted)
    return await fundedResult(
      confirmation.receipt,
      financeContract,
      paymentTokenContract,
      receivable,
      state.funder,
      confirmation.txHash,
      state.address,
    )
  } catch (error) {
    throw normalizeContractFlowError(error)
  }
}

export async function repayReceivableOnchain(
  receivable,
  buyerWalletAddress,
  onSubmitted = () => {},
) {
  try {
    const { provider, signer } = await getGiwaSigner(buyerWalletAddress)
    const state = await repaymentState(provider, receivable, buyerWalletAddress)
    if (state.balance < state.faceValue) {
      throw new Web3Error(
        'INSUFFICIENT_PAYMENT_TOKEN_BALANCE',
        'MockKRW 잔액이 상환할 채권 금액보다 부족합니다.',
      )
    }
    if (state.allowance < state.faceValue) {
      throw new Web3Error(
        'INSUFFICIENT_PAYMENT_TOKEN_ALLOWANCE',
        '먼저 채권 금액만큼 MockKRW 사용 승인을 완료해 주세요.',
      )
    }

    const financeContract = state.financeContract.connect(signer)
    const paymentTokenContract = state.paymentTokenContract.connect(signer)
    const replacementScanStartBlock = await safeCurrentBlockNumber(provider)
    const tracking = transactionTracking(
      receivable,
      REPAY_RECEIVABLE,
      state.address,
      replacementScanStartBlock,
    )
    const transaction = await financeContract.repayReceivable(state.receivableId)
    const confirmation = await confirmedTransaction(transaction, tracking, onSubmitted)
    return await repaidResult(
      confirmation.receipt,
      financeContract,
      paymentTokenContract,
      receivable,
      state.buyer,
      confirmation.txHash,
    )
  } catch (error) {
    throw normalizeContractFlowError(error)
  }
}

export async function resumeReceivableTransaction(
  receivable,
  synchronization,
  onSubmitted = () => {},
) {
  try {
    if (synchronization.payload.transactionCancelled) {
      const txHash = synchronization.payload.txHash
      await recordFailedTransaction(
        txHash,
        'TRANSACTION_REPLACED',
        '취소 트랜잭션이 기존 트랜잭션을 교체했습니다.',
      )
      await finalizeRecoveredReplacement(null, synchronization.payload)
      throw new Web3Error('TRANSACTION_CANCELLED', 'MetaMask에서 트랜잭션이 취소되었습니다.', {
        txHash,
      })
    }
    if (
      synchronization.type !== 'chain-created' &&
      synchronization.type !== 'verified' &&
      synchronization.type !== 'tokenized' &&
      synchronization.type !== 'funded' &&
      synchronization.type !== 'repaid'
    ) {
      throw new Web3Error(
        'INVALID_PENDING_TRANSACTION',
        '저장된 트랜잭션 종류를 확인할 수 없습니다.',
        { txHash: synchronization.payload?.txHash },
      )
    }
    const expectedWallet =
      synchronization.type === 'verified' || synchronization.type === 'repaid'
        ? receivable.buyerWalletAddress
        : synchronization.type === 'funded'
          ? (synchronization.payload.funderWalletAddress ?? receivable.funderWalletAddress)
          : receivable.sellerWalletAddress
    const { provider, signer } = await getGiwaSigner(expectedWallet)
    const address = contractAddress()
    if (
      synchronization.payload.contractAddress &&
      getAddress(synchronization.payload.contractAddress) !== address
    ) {
      throw new Web3Error(
        'CONTRACT_ADDRESS_MISMATCH',
        '저장된 트랜잭션과 현재 환경의 컨트랙트 주소가 다릅니다.',
      )
    }
    if (synchronization.type !== 'chain-created') {
      requireStoredContractAddress(receivable, address)
    }

    const contract = new Contract(address, receivableFinanceAbi, signer)
    const txHash = synchronization.payload.txHash
    const confirmation = await recoverTrackedReceipt(
      provider,
      txHash,
      trackingForSynchronization(receivable, synchronization, address),
      synchronization.payload,
      onSubmitted,
    )
    if (synchronization.type === 'chain-created') {
      return createdResult(confirmation.receipt, contract, receivable, confirmation.txHash, address)
    }
    if (synchronization.type === 'verified') {
      return verifiedResult(confirmation.receipt, contract, receivable, confirmation.txHash)
    }
    if (synchronization.type === 'tokenized') {
      return tokenizedResult(
        confirmation.receipt,
        contract,
        receivable,
        confirmation.txHash,
        address,
      )
    }
    if (synchronization.type === 'funded') {
      const funder = getAddress(expectedWallet)
      const paymentTokenContract = new Contract(mockKrwAddress(), mockKrwAbi, signer)
      return await fundedResult(
        confirmation.receipt,
        contract,
        paymentTokenContract,
        receivable,
        funder,
        confirmation.txHash,
        address,
      )
    }
    if (synchronization.type === 'repaid') {
      const buyer = getAddress(expectedWallet)
      const paymentTokenContract = new Contract(mockKrwAddress(), mockKrwAbi, signer)
      return await repaidResult(
        confirmation.receipt,
        contract,
        paymentTokenContract,
        receivable,
        buyer,
        confirmation.txHash,
      )
    }
  } catch (error) {
    throw normalizeContractFlowError(error)
  }
}
