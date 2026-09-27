import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, disposePinia, setActivePinia } from 'pinia'
import { afterEach, expect, it, vi } from 'vitest'
import { setAuthSessionToken } from '../services/authSession'
import WalletlessDemoView from './WalletlessDemoView.vue'

let wrapper
let pinia
afterEach(() => {
  wrapper?.unmount()
  if (pinia) disposePinia(pinia)
  setAuthSessionToken(null)
  vi.unstubAllGlobals()
})
const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
it('handles real Node nested error envelopes through fetch, allowing first consent and proof start', async () => {
  pinia = createPinia()
  setActivePinia(pinia)
  setAuthSessionToken('limited-demo-jwt')
  const contract = 'c'.repeat(64)
  const finance = `0x${'d'.repeat(40)}`
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(
      json({
        mode: 'hosted-demo',
        networkId: 'undeployed',
        contractAddress: contract,
        runtime: { status: 'ready' },
        provider: { name: '가상 데모 기관', attestationType: 'mock' },
        walletlessDemo: {
          enabled: true,
          giwaChainId: '31337',
          receivableFinanceAddress: finance,
          onchainReceivableId: '1',
        },
        profiles: [{ id: 'steady', label: '가상 기업 A', summary: '기준 충족 사례' }],
      }),
    )
    .mockResolvedValueOnce(
      json(
        {
          error: {
            code: 'DEMO_RUN_NOT_FOUND',
            message: 'No demo run was found for this sign-in session.',
          },
        },
        404,
      ),
    )
    .mockImplementationOnce(async (_url, options) => {
      const body = JSON.parse(options.body)
      return json(
        {
          version: 2,
          runId: `0x${'a'.repeat(64)}`,
          requestId: `0x${'a'.repeat(64)}`,
          clientRequestId: body.clientRequestId,
          profileId: body.profileId,
          subjectRole: body.subjectRole,
          status: 'preparing',
          networkId: 'undeployed',
          midnightContractAddress: contract,
          giwaChainId: '31337',
          receivableFinanceAddress: finance,
          onchainReceivableId: '1',
          partyWallet: `0x${'e'.repeat(40)}`,
          intendedFunderWallet: `0x${'f'.repeat(40)}`,
          minAnnualRevenueKrw: '500000000',
          maxDebtRatioBps: '20000',
          maxOverdueCount: '1',
          validUntil: String(Math.floor(Date.now() / 1000) + 3600),
        },
        202,
      )
    })
  vi.stubGlobal('fetch', fetcher)
  wrapper = mount(WalletlessDemoView, { global: { plugins: [pinia] } })
  await flushPromises()
  expect(wrapper.find('[role=alert]').exists()).toBe(false)
  await wrapper.find('input[type=checkbox]').setValue(true)
  const start = wrapper.findAll('button').find((item) => item.text().includes('실제 증명 생성'))
  expect(start.attributes('disabled')).toBeUndefined()
  await start.trigger('click')
  await flushPromises()
  expect(fetcher).toHaveBeenCalledTimes(3)
  expect(fetcher.mock.calls[2][0]).toContain('/midnight-proof/v2/demo-runs/start')
  expect(fetcher.mock.calls[2][1].headers.get('Authorization')).toBe('Bearer limited-demo-jwt')
  expect(wrapper.text()).toContain('가상 기관 확인 중')
})
