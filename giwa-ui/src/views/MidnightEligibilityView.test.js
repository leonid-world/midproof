import { createPinia } from 'pinia'
import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import MidnightEligibilityView from './MidnightEligibilityView.vue'
import {
  makeProofCapability,
  MIDNIGHT_CONTRACT,
  RECEIVABLE_FINANCE,
} from '../test/midnightFixtures'

const SELLER = '0x60602ed43987ea474a85c12a4e768dc8062b4361'
const BUYER = '0xf0aa8d7ca5c7e3e586dcc40397147ac98e3717bb'

function deferred() {
  let resolve
  const promise = new Promise((resolvePromise) => {
    resolve = resolvePromise
  })
  return { promise, resolve }
}

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

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

function makeResolved(capability) {
  return {
    networkId: 'undeployed',
    contractAddress: MIDNIGHT_CONTRACT,
    context: {
      giwaChainId: capability.giwaChainId,
      receivableFinanceAddress: capability.receivableFinanceAddress,
      onchainReceivableId: capability.onchainReceivableId,
      subjectRole: capability.subjectRole,
      partyWallet: capability.partyWallet,
    },
    result: {
      lookupKey: capability.lookupKey,
      eligible: true,
      providerId: '2',
      policyVersion: '1',
    },
  }
}

async function mountFunder({
  receivables = [],
  opportunities = [makeReceivable()],
  capability = makeCapability(),
} = {}) {
  const fetchMock = vi.fn(async (input) => {
    const url = String(input)
    if (url.endsWith('/auth/me')) {
      return jsonResponse({ userId: 3, companyId: 3, email: 'funder@example.com' })
    }
    if (url.endsWith('/receivables/funding-opportunities')) {
      return jsonResponse(opportunities)
    }
    if (url.endsWith('/receivables')) return jsonResponse(receivables)
    if (url.endsWith('/midnight-api/v1/eligibility-results/resolve')) {
      return jsonResponse(makeResolved(capability))
    }
    throw new Error('Unexpected test URL: ' + url)
  })
  vi.stubGlobal('fetch', fetchMock)
  localStorage.setItem('accessToken', 'test-token')
  const wrapper = mount(MidnightEligibilityView, {
    attachTo: document.body,
    global: {
      plugins: [createPinia()],
      stubs: { RouterLink: { template: '<a><slot /></a>' } },
    },
  })
  await flushPromises()
  return { wrapper, fetchMock }
}

function resolverCallCount(fetchMock) {
  return fetchMock.mock.calls.filter(([input]) =>
    String(input).endsWith('/midnight-api/v1/eligibility-results/resolve'),
  ).length
}

async function chooseFile(wrapper, file) {
  const input = wrapper.get('input[type="file"]')
  Object.defineProperty(input.element, 'files', {
    configurable: true,
    value: [file],
  })
  await input.trigger('change')
  await flushPromises()
}

afterEach(() => {
  localStorage.clear()
  vi.unstubAllGlobals()
  document.body.innerHTML = ''
})

describe('MidnightEligibilityView capability handoff', () => {
  it('imports on an explicit clipboard click, validates context, and waits for explicit ZK lookup', async () => {
    const capability = makeCapability()
    const assigned = makeReceivable({
      receivableId: 6,
      onchainReceivableId: '3',
      tokenId: '3',
      funderCompanyId: 3,
      status: 'FUNDED',
    })
    const sellerOwned = makeReceivable({
      receivableId: 8,
      onchainReceivableId: '8',
      tokenId: '8',
      sellerCompanyId: 3,
    })
    const readText = vi.fn().mockResolvedValue(JSON.stringify(capability))
    vi.stubGlobal('navigator', { clipboard: { readText } })
    const { wrapper, fetchMock } = await mountFunder({
      receivables: [assigned, sellerOwned],
      capability,
    })

    expect(readText).not.toHaveBeenCalled()
    expect(wrapper.text()).toContain('DB 채권 #5 · 온체인 #2 · NFT #2')
    expect(wrapper.text()).toContain('DB 채권 #6 · 온체인 #3 · NFT #3')
    expect(wrapper.text()).not.toContain('DB 채권 #8')
    expect(wrapper.text()).toContain('판매기업·구매기업의 검증 권한을 각각')
    expect(wrapper.text()).toContain('실제 회사·재무 검증이나 펀딩 승인이 아닙니다')
    expect(wrapper.find('#proof-capability').exists()).toBe(false)
    expect(wrapper.get('input[type="file"]').attributes('hidden')).toBeDefined()
    expect(
      wrapper.findAll('button').filter((button) => button.text().includes('검증 파일 선택')),
    ).toHaveLength(1)

    const receivableSelect = wrapper.get('#midnight-receivable')
    await receivableSelect.setValue('5')
    await wrapper
      .findAll('button')
      .find((button) => button.text().includes('클립보드에서 가져오기'))
      .trigger('click')
    await flushPromises()

    expect(readText).toHaveBeenCalledOnce()
    expect(wrapper.text()).toContain('형식과 선택한 채권·역할의 일치를 확인했습니다')
    expect(wrapper.text()).toContain('아직 조회하지 않았습니다')
    expect(resolverCallCount(fetchMock)).toBe(0)

    await wrapper.get('form').trigger('submit')
    await flushPromises()

    expect(resolverCallCount(fetchMock)).toBe(1)
    expect(wrapper.find('.results-section').exists()).toBe(true)
    expect(wrapper.get('#results-title').text()).toContain('DB 채권 #5 · 온체인 #2 · NFT #2')

    await receivableSelect.setValue('6')

    expect(wrapper.find('.results-section').exists()).toBe(false)
    expect(wrapper.find('.handoff-feedback').exists()).toBe(false)
    expect(wrapper.get('button[type="submit"]').attributes('disabled')).toBeDefined()
    wrapper.unmount()
  })

  it('rejects a clipboard capability for the wrong role without reflecting or resolving it', async () => {
    const readText = vi.fn().mockResolvedValue(JSON.stringify(makeCapability()))
    vi.stubGlobal('navigator', { clipboard: { readText } })
    const { wrapper, fetchMock } = await mountFunder()

    await wrapper.get('#midnight-subject-role').setValue('BUYER')
    await wrapper
      .findAll('button')
      .find((button) => button.text().includes('클립보드에서 가져오기'))
      .trigger('click')
    await flushPromises()

    expect(wrapper.get('.handoff-feedback').text()).toContain('Seller/Buyer 역할')
    expect(resolverCallCount(fetchMock)).toBe(0)
    expect(wrapper.get('button[type="submit"]').attributes('disabled')).toBeDefined()
    wrapper.unmount()
  })

  it('imports exact capability files, clears the file input immediately, and rejects extra fields', async () => {
    const capability = makeCapability()
    const { wrapper, fetchMock } = await mountFunder({ capability })
    const text = JSON.stringify(capability)
    const bytes = new TextEncoder().encode(text)
    const file = {
      name: 'gasok-proof.gasok-proof',
      size: bytes.byteLength,
      arrayBuffer: vi.fn().mockResolvedValue(bytes.buffer),
    }

    await chooseFile(wrapper, file)

    expect(file.arrayBuffer).toHaveBeenCalledOnce()
    expect(wrapper.get('input[type="file"]').element.value).toBe('')
    expect(wrapper.text()).toContain('아직 조회하지 않았습니다')
    expect(resolverCallCount(fetchMock)).toBe(0)

    const invalidText = JSON.stringify({ ...capability, privateMarker: 'must-not-reflect' })
    const invalidBytes = new TextEncoder().encode(invalidText)
    await chooseFile(wrapper, {
      name: 'gasok-proof.json',
      size: invalidBytes.byteLength,
      arrayBuffer: vi.fn().mockResolvedValue(invalidBytes.buffer),
    })

    expect(wrapper.get('.handoff-feedback').text()).toContain('검증 권한 형식이 올바르지 않습니다')
    expect(wrapper.text()).not.toContain('must-not-reflect')
    expect(wrapper.get('button[type="submit"]').attributes('disabled')).toBeDefined()
    expect(resolverCallCount(fetchMock)).toBe(0)
    wrapper.unmount()
  })

  it('keeps raw input out of the DOM until the advanced control is opened and clears it on role change', async () => {
    const { wrapper } = await mountFunder()

    expect(wrapper.find('#proof-capability').exists()).toBe(false)
    const details = wrapper.get('.advanced-input')
    details.element.open = true
    await details.trigger('toggle')
    expect(wrapper.find('#proof-capability').exists()).toBe(true)

    await wrapper.get('#proof-capability').setValue(JSON.stringify(makeCapability()))
    await wrapper.get('#midnight-subject-role').setValue('BUYER')

    expect(wrapper.find('#proof-capability').exists()).toBe(false)
    expect(wrapper.get('button[type="submit"]').attributes('disabled')).toBeDefined()
    wrapper.unmount()
  })

  it('focuses a safe permission error and ignores a late clipboard result after role change', async () => {
    vi.stubGlobal('navigator', {
      clipboard: { readText: vi.fn().mockRejectedValue(new Error('private browser detail')) },
    })
    const first = await mountFunder()
    await first.wrapper
      .findAll('button')
      .find((button) => button.text().includes('클립보드에서 가져오기'))
      .trigger('click')
    await flushPromises()

    expect(first.wrapper.get('.handoff-feedback').text()).toContain('권한이 거부되었습니다')
    expect(first.wrapper.text()).not.toContain('private browser detail')
    expect(first.wrapper.element.ownerDocument.activeElement).toBe(
      first.wrapper.get('.handoff-feedback').element,
    )
    first.wrapper.unmount()

    const pending = deferred()
    vi.stubGlobal('navigator', {
      clipboard: { readText: vi.fn().mockReturnValue(pending.promise) },
    })
    const second = await mountFunder()
    await second.wrapper
      .findAll('button')
      .find((button) => button.text().includes('클립보드에서 가져오기'))
      .trigger('click')
    await second.wrapper.get('#midnight-subject-role').setValue('BUYER')
    pending.resolve(JSON.stringify(makeCapability()))
    await flushPromises()

    expect(second.wrapper.find('.handoff-feedback').exists()).toBe(false)
    expect(second.wrapper.get('button[type="submit"]').attributes('disabled')).toBeDefined()
    second.wrapper.unmount()
  })

  it('does not let a late clipboard result overwrite advanced manual input', async () => {
    const pending = deferred()
    vi.stubGlobal('navigator', {
      clipboard: { readText: vi.fn().mockReturnValue(pending.promise) },
    })
    const { wrapper } = await mountFunder()
    await wrapper
      .findAll('button')
      .find((button) => button.text().includes('클립보드에서 가져오기'))
      .trigger('click')

    const details = wrapper.get('.advanced-input')
    details.element.open = true
    await details.trigger('toggle')
    await wrapper.get('#proof-capability').setValue('manual-input-in-progress')
    pending.resolve(JSON.stringify(makeCapability()))
    await flushPromises()

    expect(wrapper.get('#proof-capability').element.value).toBe('manual-input-in-progress')
    expect(wrapper.find('.handoff-feedback').exists()).toBe(false)
    expect(wrapper.get('button[type="submit"]').attributes('disabled')).toBeDefined()
    wrapper.unmount()
  })
})
