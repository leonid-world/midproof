import { defineComponent, h, ref } from 'vue'
import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import { useMidnightCapabilityVerification } from './useMidnightCapabilityVerification'
import {
  makeProofCapability,
  makeResolvedEligibility,
  PARTY_WALLET,
  RECEIVABLE_FINANCE,
} from '../test/midnightFixtures'

function mountVerification(expectedContext, resolveCapability = vi.fn()) {
  let verification
  const wrapper = mount(
    defineComponent({
      setup() {
        verification = useMidnightCapabilityVerification({
          expectedContext,
          resolveCapability,
        })
        return () => h('div')
      },
    }),
  )
  return { wrapper, verification }
}

function makeExpectedContext(overrides = {}) {
  return {
    dbReceivableId: '5',
    onchainReceivableId: '1',
    receivableFinanceAddress: RECEIVABLE_FINANCE,
    subjectRole: 'SELLER',
    partyWallet: PARTY_WALLET,
    ...overrides,
  }
}

describe('useMidnightCapabilityVerification', () => {
  it('commits a canonical exact capability after context validation without auto-resolving', () => {
    const resolveCapability = vi.fn()
    const { wrapper, verification } = mountVerification(
      ref(makeExpectedContext()),
      resolveCapability,
    )

    const imported = verification.importCapabilityText(
      '  ' + JSON.stringify(makeProofCapability()) + '  ',
    )

    expect(imported).toBe(true)
    expect(verification.capabilityText.value).toBe(JSON.stringify(makeProofCapability()))
    expect(verification.validationMessage.value).toBe('')
    expect(verification.verification.value).toBeNull()
    expect(resolveCapability).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('clears prior capability and result when imported content has extra fields or wrong context', async () => {
    const resolveCapability = vi.fn().mockResolvedValue(makeResolvedEligibility())
    const expectedContext = ref(makeExpectedContext())
    const { wrapper, verification } = mountVerification(expectedContext, resolveCapability)
    verification.capabilityText.value = JSON.stringify(makeProofCapability())
    await verification.verifyCapability()
    expect(verification.verification.value).not.toBeNull()

    expect(
      verification.importCapabilityText(
        JSON.stringify({ ...makeProofCapability(), unexpected: 'must-not-reflect' }),
      ),
    ).toBe(false)
    expect(verification.capabilityText.value).toBe('')
    expect(verification.verification.value).toBeNull()
    expect(verification.inputErrorMessage.value).toContain('검증 권한 형식이 올바르지 않습니다')
    expect(verification.inputErrorMessage.value).not.toContain('must-not-reflect')

    expectedContext.value = makeExpectedContext({ subjectRole: 'BUYER' })
    expect(verification.importCapabilityText(JSON.stringify(makeProofCapability()))).toBe(false)
    expect(verification.capabilityText.value).toBe('')
    expect(verification.inputErrorMessage.value).toContain('Seller/Buyer 역할')
    expect(resolveCapability).toHaveBeenCalledOnce()
    wrapper.unmount()
  })

  it('resolves only after the capability matches the selected DB role context', async () => {
    const resolveCapability = vi.fn().mockResolvedValue(makeResolvedEligibility())
    const { wrapper, verification } = mountVerification(
      ref(makeExpectedContext()),
      resolveCapability,
    )
    verification.capabilityText.value = JSON.stringify(makeProofCapability())

    await verification.verifyCapability()

    expect(resolveCapability).toHaveBeenCalledOnce()
    expect(verification.verification.value).toEqual(makeResolvedEligibility())
    wrapper.unmount()
  })

  it('rejects a different DB receivable before calling the public adapter', async () => {
    const resolveCapability = vi.fn()
    const { wrapper, verification } = mountVerification(
      ref(makeExpectedContext({ onchainReceivableId: '2' })),
      resolveCapability,
    )
    verification.capabilityText.value = JSON.stringify(makeProofCapability())

    await verification.verifyCapability()

    expect(resolveCapability).not.toHaveBeenCalled()
    expect(verification.errorMessage.value).toContain('온체인 ID')
    wrapper.unmount()
  })

  it('clears the memory-only capability and result on unmount', async () => {
    const { wrapper, verification } = mountVerification(
      ref(makeExpectedContext()),
      vi.fn().mockResolvedValue(makeResolvedEligibility()),
    )
    verification.capabilityText.value = JSON.stringify(makeProofCapability())
    await verification.verifyCapability()
    expect(verification.verification.value).not.toBeNull()

    wrapper.unmount()

    expect(verification.capabilityText.value).toBe('')
    expect(verification.verification.value).toBeNull()
  })
})
