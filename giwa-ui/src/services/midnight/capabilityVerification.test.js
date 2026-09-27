import { afterEach, describe, expect, it, vi } from 'vitest'
import { makeProofCapability, makeResolvedEligibility } from '../../test/midnightFixtures'
import { resolveEligibilityCapability } from './capabilityVerification'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('resolveEligibilityCapability', () => {
  it('never forwards GASOK browser credentials to the local read adapter', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(makeResolvedEligibility()), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    )
    vi.stubGlobal('fetch', fetchMock)

    await expect(resolveEligibilityCapability(makeProofCapability())).resolves.toMatchObject({
      result: { providerId: '2', policyVersion: '1' },
    })

    expect(fetchMock).toHaveBeenCalledOnce()
    expect(fetchMock.mock.calls[0][1]).toMatchObject({
      credentials: 'omit',
      cache: 'no-store',
      referrerPolicy: 'no-referrer',
    })
  })
})
