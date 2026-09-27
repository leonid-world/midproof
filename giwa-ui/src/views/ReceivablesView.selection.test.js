import { reactive } from 'vue'
import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import ReceivablesView from './ReceivablesView.vue'

const state = vi.hoisted(() => ({
  auth: null,
  wallet: null,
  receivables: null,
  verifyOnchain: vi.fn(),
}))

vi.mock('vue-router', () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn() }) }))
vi.mock('../stores/auth', () => ({ useAuthStore: () => state.auth }))
vi.mock('../stores/wallet', () => ({ useWalletStore: () => state.wallet }))
vi.mock('../stores/receivable', () => ({ useReceivableStore: () => state.receivables }))
vi.mock('../services/blockchainTransactions', () => ({
  getReceivableBlockchainTransactions: vi.fn().mockResolvedValue([]),
}))
vi.mock('../services/web3/receivableContract', () => ({
  createReceivableOnchain: vi.fn(),
  resumeReceivableTransaction: vi.fn(),
  tokenizeReceivableOnchain: vi.fn(),
  verifyReceivableOnchain: (...args) => state.verifyOnchain(...args),
}))

const amountPolicy = {
  demoEnabled: true,
  tokenSymbol: 'mKRW',
  tokenDecimals: 0,
  minAmount: '1',
  maxFaceValue: '10000',
  maxFundingAmount: '10000',
  suggestedFaceValue: '1000',
  suggestedFundingAmount: '900',
}

function receivable(id) {
  return {
    receivableId: id,
    onchainReceivableId: String(id + 10),
    sellerCompanyId: 1,
    buyerCompanyId: 2,
    sellerCompanyName: `Seller ${id}`,
    buyerCompanyName: 'Buyer',
    sellerWalletAddress: `0x${'1'.repeat(40)}`,
    buyerWalletAddress: `0x${'2'.repeat(40)}`,
    contractAddress: `0x${'3'.repeat(40)}`,
    createTxHash: `0x${String(id).repeat(64)}`,
    faceValue: '1000',
    fundingAmount: '900',
    currencyCode: 'KRW',
    issueDate: '2026-09-17',
    maturityDate: '2026-10-17',
    status: 'CREATED',
  }
}

function deferred() {
  let resolve
  const promise = new Promise((done) => {
    resolve = done
  })
  return { promise, resolve }
}

const wrappers = []

async function mountView() {
  const wrapper = mount(ReceivablesView, {
    global: { stubs: { RouterLink: { template: '<a><slot /></a>' } } },
  })
  wrappers.push(wrapper)
  await flushPromises()
  return wrapper
}

describe('receivable selection and Buyer consent', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.clearAllMocks()
    state.auth = reactive({ user: { companyId: 2 }, loadUser: vi.fn().mockResolvedValue() })
    state.wallet = reactive({
      walletAddress: `0x${'2'.repeat(40)}`,
      loadWallet: vi.fn().mockResolvedValue(),
    })
    state.receivables = reactive({
      receivables: [receivable(1), receivable(2), receivable(3)],
      selectedReceivable: null,
      amountPolicy,
      loadAll: vi.fn().mockResolvedValue(),
      loadAmountPolicy: vi.fn().mockResolvedValue(amountPolicy),
      fetchOne: vi.fn().mockImplementation(async (id) => receivable(id)),
      selectOne: vi.fn().mockImplementation((record) => {
        state.receivables.selectedReceivable = record
        return record
      }),
      loadOne: vi.fn().mockImplementation(async (id) => {
        state.receivables.selectedReceivable = receivable(id)
        return state.receivables.selectedReceivable
      }),
      clearSelection: vi.fn(),
    })
  })

  afterEach(() => {
    for (const wrapper of wrappers.splice(0)) wrapper.unmount()
  })

  it('keeps B and its reviewed consent when the earlier A lookup finishes last', async () => {
    const wrapper = await mountView()
    const setup = wrapper.vm.$.setupState
    const slowA = deferred()
    const fastB = deferred()
    state.receivables.fetchOne.mockImplementation((id) =>
      id === 2 ? slowA.promise : fastB.promise,
    )

    const selectingA = setup.selectReceivable(2)
    const selectingB = setup.selectReceivable(3)
    fastB.resolve(receivable(3))
    await selectingB
    await flushPromises()
    await wrapper.find('input[type="checkbox"]').setValue(true)
    expect(setup.canSubmitVerification).toBe(true)

    slowA.resolve(receivable(2))
    await selectingA
    await flushPromises()

    expect(state.receivables.selectedReceivable.receivableId).toBe(3)
    expect(wrapper.find('input[type="checkbox"]').element.checked).toBe(true)
    expect(setup.canSubmitVerification).toBe(true)
    expect(state.receivables.selectOne).toHaveBeenCalledTimes(1)
    expect(state.receivables.selectOne).toHaveBeenCalledWith(
      expect.objectContaining({ receivableId: 3 }),
    )
  })

  it('blocks signing during a selection lookup and requires fresh consent after it completes', async () => {
    const wrapper = await mountView()
    const setup = wrapper.vm.$.setupState
    await wrapper.find('input[type="checkbox"]').setValue(true)
    expect(setup.canSubmitVerification).toBe(true)
    const pending = deferred()
    state.receivables.fetchOne.mockReturnValue(pending.promise)

    const selecting = setup.selectReceivable(2)
    await flushPromises()
    expect(setup.canSubmitVerification).toBe(false)
    // A stale input event must not override the in-flight selection gate.
    setup.buyerAttestationAccepted = true
    expect(setup.canSubmitVerification).toBe(false)
    await setup.verifyOnchain()
    expect(state.verifyOnchain).not.toHaveBeenCalled()

    pending.resolve(receivable(2))
    await selecting
    await flushPromises()
    expect(state.receivables.selectedReceivable.receivableId).toBe(2)
    expect(wrapper.find('input[type="checkbox"]').element.checked).toBe(false)
    expect(setup.canSubmitVerification).toBe(false)
    await wrapper.find('input[type="checkbox"]').setValue(true)
    expect(setup.canSubmitVerification).toBe(true)
  })
})
