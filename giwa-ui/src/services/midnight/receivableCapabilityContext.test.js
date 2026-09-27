import { describe, expect, it } from 'vitest'
import {
  assertCapabilityMatchesReceivable,
  createReceivableCapabilityContext,
  isFunderVisibleReceivable,
  mergeVisibleReceivables,
} from './receivableCapabilityContext'
import { makeProofCapability, RECEIVABLE_FINANCE } from '../../test/midnightFixtures'

const SELLER = '0x60602ed43987ea474a85c12a4e768dc8062b4361'
const BUYER = '0xf0aa8d7ca5c7e3e586dcc40397147ac98e3717bb'

function makeReceivable(overrides = {}) {
  return {
    receivableId: 5,
    onchainReceivableId: '2',
    tokenId: '2',
    contractAddress: RECEIVABLE_FINANCE,
    sellerCompanyId: 2,
    buyerCompanyId: 1,
    funderCompanyId: null,
    sellerWalletAddress: SELLER,
    buyerWalletAddress: BUYER,
    status: 'TOKENIZED',
    ...overrides,
  }
}

function makeCapability(overrides = {}) {
  return {
    ...makeProofCapability(),
    onchainReceivableId: '2',
    partyWallet: SELLER,
    ...overrides,
  }
}

describe('receivable capability context', () => {
  it('deduplicates the same DB receivable returned by visible-record APIs', () => {
    const receivable = makeReceivable()
    expect(mergeVisibleReceivables([receivable], [{ ...receivable }])).toEqual([receivable])
  })

  it('keeps only unrelated opportunities or records assigned to the current Funder', () => {
    expect(isFunderVisibleReceivable(makeReceivable(), 3)).toBe(true)
    expect(isFunderVisibleReceivable(makeReceivable({ funderCompanyId: 3 }), 3)).toBe(true)
    expect(isFunderVisibleReceivable(makeReceivable(), 2)).toBe(false)
    expect(isFunderVisibleReceivable(makeReceivable({ funderCompanyId: 4 }), 3)).toBe(false)
    expect(isFunderVisibleReceivable(makeReceivable({ status: 'FUNDED' }), 3)).toBe(false)
  })

  it('binds DB 5 to GIWA 2 and the selected Seller wallet', () => {
    const expected = createReceivableCapabilityContext(makeReceivable(), 'SELLER')
    expect(expected).toEqual({
      dbReceivableId: '5',
      onchainReceivableId: '2',
      receivableFinanceAddress: RECEIVABLE_FINANCE,
      subjectRole: 'SELLER',
      partyWallet: SELLER,
    })
    expect(assertCapabilityMatchesReceivable(makeCapability(), expected)).toBeTruthy()
  })

  it.each([
    ['onchain ID', { onchainReceivableId: '3' }],
    ['contract', { receivableFinanceAddress: '0x1111111111111111111111111111111111111111' }],
    ['role', { subjectRole: 'BUYER', partyWallet: BUYER }],
    ['wallet', { partyWallet: '0x2222222222222222222222222222222222222222' }],
  ])('rejects a capability with a different %s before resolution', (_label, overrides) => {
    const expected = createReceivableCapabilityContext(makeReceivable(), 'SELLER')
    expect(() => assertCapabilityMatchesReceivable(makeCapability(overrides), expected)).toThrow(
      /일치하지 않습니다/,
    )
  })
})
