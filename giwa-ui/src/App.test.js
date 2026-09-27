import { defineComponent } from 'vue'
import { createPinia, disposePinia } from 'pinia'
import { flushPromises, mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import App from './App.vue'
import { setAuthSessionToken } from './services/authSession'
import { useMidnightProofMailbox } from './composables/useMidnightProofMailbox'

vi.mock('vue-router', () => ({
  useRoute: () => ({ meta: { requiresAuth: true }, fullPath: '/midnight' }),
  useRouter: () => ({ push: vi.fn() }),
}))
vi.mock('./services/api', () => ({
  apiRequest: vi.fn().mockResolvedValue({ email: 'synthetic@example.test' }),
}))

describe('same-route account switch', () => {
  it('remounts the request view and starts a fresh mailbox for the new account', async () => {
    const mailboxes = []
    const services = {
      list: vi.fn((_scope, options) =>
        Promise.resolve([{ requestId: options.session.token, status: 'REQUESTED' }]),
      ),
    }
    const page = defineComponent({
      setup() {
        const mailbox = useMidnightProofMailbox('assigned', { services })
        mailboxes.push(mailbox)
        return { mailbox }
      },
      template: '<div data-test="mailbox">{{ mailbox.requests.value[0]?.requestId }}</div>',
    })
    setAuthSessionToken('company-a')
    const pinia = createPinia()
    const wrapper = mount(App, {
      global: {
        plugins: [pinia],
        stubs: { RouterView: page, RouterLink: { template: '<a><slot /></a>' } },
      },
    })
    await flushPromises()
    expect(wrapper.find('[data-test="mailbox"]').text()).toBe('company-a')
    setAuthSessionToken('company-b')
    await flushPromises()
    expect(mailboxes).toHaveLength(2)
    expect(mailboxes[0].requests.value).toEqual([])
    expect(wrapper.find('[data-test="mailbox"]').text()).toBe('company-b')
    expect(services.list).toHaveBeenCalledTimes(2)
    wrapper.unmount()
    disposePinia(pinia)
    setAuthSessionToken(null)
  })
})
