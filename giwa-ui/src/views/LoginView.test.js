import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import LoginView from './LoginView.vue'

const { auth, router, flags } = vi.hoisted(() => ({
  auth: { loginDemo: vi.fn(), login: vi.fn(), signup: vi.fn() },
  router: { push: vi.fn() },
  flags: { demo: true },
}))
vi.mock('../stores/auth', () => ({ useAuthStore: () => auth }))
vi.mock('vue-router', () => ({ useRouter: () => router }))
vi.mock('../services/midnight/config', () => ({
  get isMidnightDemoEnabled() {
    return flags.demo
  },
}))

let wrapper
const button = (label) => wrapper.findAll('button').find((item) => item.text() === label)
beforeEach(() => {
  flags.demo = true
  auth.loginDemo.mockReset().mockResolvedValue(undefined)
  auth.login.mockReset().mockResolvedValue(undefined)
  auth.signup.mockReset().mockResolvedValue(undefined)
  router.push.mockReset().mockResolvedValue(undefined)
})
afterEach(() => wrapper?.unmount())

describe('simple demo entry', () => {
  it('opens one limited demo session without asking for credentials or a role', async () => {
    wrapper = mount(LoginView)
    expect(wrapper.find('form').exists()).toBe(false)
    expect(button('판매기업')).toBeUndefined()
    await button('데모 시작').trigger('click')
    await flushPromises()
    expect(auth.loginDemo).toHaveBeenCalledExactlyOnceWith('FUNDER')
    expect(auth.login).not.toHaveBeenCalled()
    expect(router.push).toHaveBeenCalledExactlyOnceWith({ name: 'demo' })
  })

  it('keeps a failed demo sign-in visible and allows retry without switching forms', async () => {
    auth.loginDemo.mockRejectedValueOnce(new Error('데모 서버를 준비 중입니다.'))
    wrapper = mount(LoginView)
    await button('데모 시작').trigger('click')
    await flushPromises()
    expect(wrapper.get('[role=alert]').text()).toContain('데모 서버를 준비 중입니다.')
    expect(button('데모 시작').attributes('disabled')).toBeUndefined()
    expect(router.push).not.toHaveBeenCalled()
    await button('데모 시작').trigger('click')
    await flushPromises()
    expect(auth.loginDemo).toHaveBeenCalledTimes(2)
    expect(wrapper.find('[role=alert]').exists()).toBe(false)
  })

  it('retains ordinary account login behind its explicit entry', async () => {
    wrapper = mount(LoginView)
    await button('계정으로 로그인').trigger('click')
    await wrapper.get('input[type=email]').setValue('owner@example.test')
    await wrapper.get('input[type=password]').setValue('test-password')
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(auth.login).toHaveBeenCalledExactlyOnceWith({
      email: 'owner@example.test',
      password: 'test-password',
    })
    expect(router.push).toHaveBeenCalledExactlyOnceWith({ name: 'dashboard' })
    expect(auth.loginDemo).not.toHaveBeenCalled()
  })

  it('keeps login and signup directly available when the demo is disabled', async () => {
    flags.demo = false
    wrapper = mount(LoginView)
    expect(wrapper.find('form').exists()).toBe(true)
    expect(button('데모 시작')).toBeUndefined()
    await wrapper
      .findAll('button')
      .find((item) => item.text().includes('회원가입'))
      .trigger('click')
    expect(wrapper.get('input[autocomplete=name]').exists()).toBe(true)
    expect(wrapper.get('input[autocomplete=organization]').exists()).toBe(true)
    expect(wrapper.get('h2').text()).toBe('회원가입')
  })
})
