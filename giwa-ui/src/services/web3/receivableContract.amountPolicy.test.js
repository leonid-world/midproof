import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Interface, ZeroHash } from 'ethers'
import receivableFinanceAbi from '../../contracts/ReceivableFinance.abi.json'
import {
  approveFundingAmount,
  approveRepaymentAmount,
  createReceivableOnchain,
  fundReceivableOnchain,
  getFundingReadiness,
  getRepaymentReadiness,
  resumeReceivableTransaction,
} from './receivableContract'
import { ApiError } from '../api'

const mocks = vi.hoisted(() => ({
  apiRequest: vi.fn(),
  getGiwaSigner: vi.fn(),
  createPending: vi.fn(),
  confirmTransaction: vi.fn(),
  failTransaction: vi.fn(),
  newContract: vi.fn(),
  newReadProvider: vi.fn(),
  readProvider: {
    getNetwork: vi.fn(),
    getTransactionReceipt: vi.fn(),
  },
}))

vi.mock('../api', async (importOriginal) => ({
  ...(await importOriginal()),
  apiRequest: mocks.apiRequest,
}))
vi.mock('../blockchainTransactions', () => ({
  createPendingBlockchainTransaction: mocks.createPending,
  confirmBlockchainTransaction: mocks.confirmTransaction,
  failBlockchainTransaction: mocks.failTransaction,
}))
vi.mock('./provider', () => ({
  getGiwaSigner: mocks.getGiwaSigner,
  requiredChainId: () => 91342n,
}))
vi.mock('../../contracts/addresses', () => ({
  giwaContractConfig: {
    receivableFinanceAddress: '0x1111111111111111111111111111111111111111',
    mockKrwAddress: '0x2222222222222222222222222222222222222222',
    rpcUrl: 'https://rpc.test.invalid',
  },
}))
vi.mock('ethers', async (importOriginal) => ({
  ...(await importOriginal()),
  Contract: vi.fn(function (...args) {
    return mocks.newContract(...args)
  }),
  JsonRpcProvider: vi.fn(function (...args) {
    mocks.newReadProvider(...args)
    return mocks.readProvider
  }),
}))

const FINANCE = '0x1111111111111111111111111111111111111111'
const TOKEN = '0x2222222222222222222222222222222222222222'
const SELLER = '0x3333333333333333333333333333333333333333'
const BUYER = '0x4444444444444444444444444444444444444444'
const FUNDER = '0x5555555555555555555555555555555555555555'
const TX_HASH = `0x${'6'.repeat(64)}`

function policy() {
  return {
    demoEnabled: true,
    tokenSymbol: 'mKRW',
    tokenDecimals: 0,
    minAmount: '1',
    maxFaceValue: '1000',
    maxFundingAmount: '1000',
    suggestedFaceValue: '100',
    suggestedFundingAmount: '90',
  }
}

function receivable(overrides = {}) {
  return {
    receivableId: 7,
    onchainReceivableId: '2',
    tokenId: '4',
    sellerWalletAddress: SELLER,
    buyerWalletAddress: BUYER,
    funderWalletAddress: FUNDER,
    contractAddress: FINANCE,
    mockTokenAddress: TOKEN,
    fundingTxHash: TX_HASH,
    status: 'TOKENIZED',
    faceValue: '1000',
    fundingAmount: '900',
    issueDate: '2026-09-17',
    maturityDate: '2026-10-17',
    documentHash: ZeroHash,
    ...overrides,
  }
}

beforeEach(() => {
  vi.resetAllMocks()
  mocks.apiRequest.mockResolvedValue(policy())
  mocks.readProvider.getNetwork.mockResolvedValue({ chainId: 91342n })
  mocks.getGiwaSigner.mockResolvedValue({ provider: mocks.readProvider, signer: {} })
  mocks.createPending.mockResolvedValue({ txStatus: 'PENDING' })
  mocks.confirmTransaction.mockResolvedValue({ txStatus: 'CONFIRMED' })
})

const newActionCases = [
  ['create', (value) => createReceivableOnchain(value)],
  ['funding approval', (value) => approveFundingAmount(value, FUNDER)],
  ['funding transaction', (value) => fundReceivableOnchain(value, FUNDER)],
  ['funding readiness', (value) => getFundingReadiness(value, FUNDER)],
]

describe('new receivable wallet action amount guards', () => {
  it.each(newActionCases)(
    'blocks %s over the cap before wallet or RPC access',
    async (_, action) => {
      await expect(action(receivable({ faceValue: '1001' }))).rejects.toMatchObject({
        code: 'DEMO_RECEIVABLE_AMOUNT_LIMIT_EXCEEDED',
      })
      expect(mocks.apiRequest).toHaveBeenCalledExactlyOnceWith('/receivables/amount-policy', {
        cache: 'no-store',
      })
      expect(mocks.getGiwaSigner).not.toHaveBeenCalled()
      expect(mocks.newReadProvider).not.toHaveBeenCalled()
      expect(mocks.newContract).not.toHaveBeenCalled()
      expect(mocks.createPending).not.toHaveBeenCalled()
    },
  )

  it.each(newActionCases)('blocks %s when current policy cannot be loaded', async (_, action) => {
    const unavailable = new ApiError(503, 'NETWORK_ERROR', 'temporarily unavailable')
    mocks.apiRequest.mockRejectedValueOnce(unavailable)
    await expect(action(receivable())).rejects.toBe(unavailable)
    expect(mocks.getGiwaSigner).not.toHaveBeenCalled()
    expect(mocks.newReadProvider).not.toHaveBeenCalled()
    expect(mocks.newContract).not.toHaveBeenCalled()
  })

  it.each(newActionCases)('blocks %s when the server policy is malformed', async (_, action) => {
    mocks.apiRequest.mockResolvedValueOnce({ ...policy(), maxFaceValue: 1000 })
    await expect(action(receivable())).rejects.toMatchObject({ code: 'INVALID_AMOUNT_POLICY' })
    expect(mocks.getGiwaSigner).not.toHaveBeenCalled()
    expect(mocks.newReadProvider).not.toHaveBeenCalled()
    expect(mocks.newContract).not.toHaveBeenCalled()
  })
})

describe('historical obligation and receipt recovery', () => {
  it('keeps exact full repayment readiness and approval for an already funded larger receivable', async () => {
    // Current new-issuance policy is unavailable; existing debt is still repayable.
    mocks.apiRequest.mockRejectedValue(new ApiError(503, 'NETWORK_ERROR', 'policy unavailable'))
    const existing = receivable({ status: 'FUNDED', faceValue: '1000000', fundingAmount: '950000' })
    const financeContract = {
      paymentToken: vi.fn().mockResolvedValue(TOKEN),
      getReceivable: vi.fn().mockResolvedValue({
        id: 2n,
        seller: SELLER,
        buyer: BUYER,
        funder: FUNDER,
        faceValue: 1000000n,
        fundingAmount: 950000n,
        issueDate: BigInt(Date.parse('2026-09-17T00:00:00Z') / 1000),
        maturityDate: BigInt(Date.parse('2026-10-17T00:00:00Z') / 1000),
        documentHash: ZeroHash,
        tokenId: 4n,
        status: 3n,
      }),
      ownerOf: vi.fn().mockResolvedValue(FUNDER),
    }
    const tokenContract = {
      decimals: vi.fn().mockResolvedValue(0n),
      balanceOf: vi.fn().mockResolvedValue(1500000n),
      allowance: vi.fn().mockResolvedValue(1000000n),
      approve: vi.fn(),
    }
    mocks.newContract.mockImplementation((address) =>
      address === FINANCE ? financeContract : tokenContract,
    )

    await expect(getRepaymentReadiness(existing, BUYER)).resolves.toMatchObject({
      faceValue: '1000000',
      hasSufficientBalance: true,
      hasSufficientAllowance: true,
      recipientWalletAddress: FUNDER,
    })
    await expect(approveRepaymentAmount(existing, BUYER)).resolves.toEqual({
      txHash: null,
      allowance: '1000000',
      alreadyApproved: true,
    })
    expect(mocks.apiRequest).not.toHaveBeenCalled()
    expect(tokenContract.approve).not.toHaveBeenCalled()
    expect(mocks.getGiwaSigner).toHaveBeenCalledExactlyOnceWith(BUYER)
  })

  it('recovers a mined larger creation receipt without requesting policy or sending another transaction', async () => {
    mocks.apiRequest.mockRejectedValue(new ApiError(503, 'NETWORK_ERROR', 'policy unavailable'))
    const existing = receivable({
      status: 'CREATED',
      faceValue: '1000000',
      fundingAmount: '950000',
    })
    const financeInterface = new Interface(receivableFinanceAbi)
    const event = financeInterface.encodeEventLog(financeInterface.getEvent('ReceivableCreated'), [
      2n,
      SELLER,
      BUYER,
      1000000n,
      950000n,
      BigInt(Date.parse('2026-09-17T00:00:00Z') / 1000),
      BigInt(Date.parse('2026-10-17T00:00:00Z') / 1000),
      ZeroHash,
    ])
    const financeContract = {
      target: FINANCE,
      interface: financeInterface,
      createReceivable: vi.fn(),
    }
    mocks.newContract.mockReturnValue(financeContract)
    mocks.readProvider.getTransactionReceipt.mockResolvedValue({
      status: 1,
      hash: TX_HASH,
      blockNumber: 123,
      gasUsed: 50000n,
      effectiveGasPrice: 10n,
      logs: [{ address: FINANCE, ...event }],
    })

    await expect(
      resumeReceivableTransaction(existing, {
        type: 'chain-created',
        payload: { contractAddress: FINANCE, txHash: TX_HASH },
      }),
    ).resolves.toEqual({ onchainReceivableId: '2', contractAddress: FINANCE, txHash: TX_HASH })
    expect(mocks.apiRequest).not.toHaveBeenCalled()
    expect(financeContract.createReceivable).not.toHaveBeenCalled()
    expect(mocks.confirmTransaction).toHaveBeenCalledExactlyOnceWith(TX_HASH, {
      blockNumber: '123',
      gasUsed: '50000',
      effectiveGasPrice: '10',
    })
  })
})
