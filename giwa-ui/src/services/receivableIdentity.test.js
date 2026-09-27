import { describe, expect, it } from 'vitest'
import { formatReceivableIdentity } from './receivableIdentity'

describe('formatReceivableIdentity', () => {
  it('keeps the database, onchain, and NFT identifiers distinct', () => {
    expect(
      formatReceivableIdentity({
        receivableId: 5,
        onchainReceivableId: '2',
        tokenId: '2',
      }),
    ).toBe('DB 채권 #5 · 온체인 #2 · NFT #2')
  })

  it('does not substitute another identifier when blockchain metadata is missing', () => {
    expect(formatReceivableIdentity({ receivableId: 5 })).toBe(
      'DB 채권 #5 · 온체인 미연결 · NFT 미연결',
    )
  })
})
