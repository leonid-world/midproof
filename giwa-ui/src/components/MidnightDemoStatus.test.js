import { ref } from 'vue'
import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import MidnightDemoStatus from './MidnightDemoStatus.vue'

const state = vi.hoisted(() => ({ runtime: null, load: vi.fn() }))
vi.mock('../services/midnight/demoRuntime', () => ({
  get midnightDemoRuntime() {
    return state.runtime
  },
  loadMidnightDemoConfig: (...args) => state.load(...args),
}))

describe('hosted read availability banner', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    state.runtime = ref({ runtime: { status: 'ready', code: 'READ_API_UNAVAILABLE' } })
    state.load.mockReset().mockResolvedValue(null)
  })
  afterEach(() => vi.useRealTimers())

  it('warns that reads are delayed while the existing runtime stays ready', async () => {
    const wrapper = mount(MidnightDemoStatus)
    await flushPromises()
    expect(wrapper.text()).toContain('결과 조회가 지연되고 있습니다')
    expect(wrapper.text()).toContain('다시 증명하지 않고')
    expect(wrapper.classes()).not.toContain('ready')
    expect(wrapper.find('button').text()).toBe('다시 확인')
    expect(state.runtime.value.runtime.status).toBe('ready')
    wrapper.unmount()
  })

  it('clears the warning after a successful server read restores the runtime code', async () => {
    const wrapper = mount(MidnightDemoStatus)
    await flushPromises()
    state.load.mockImplementationOnce(async () => {
      state.runtime.value = { runtime: { status: 'ready' } }
    })
    await wrapper.find('button').trigger('click')
    await flushPromises()
    expect(wrapper.text()).toContain('증명 준비 완료')
    expect(wrapper.classes()).toContain('ready')
    expect(wrapper.find('button').exists()).toBe(false)
    wrapper.unmount()
  })
  it('requires an update for a verifier mismatch while keeping retry advice for temporary compatibility failure', async () => {
    state.runtime.value = { runtime: { status: 'failed', code: 'CONTRACT_VERIFIER_MISMATCH' } }
    const wrapper = mount(MidnightDemoStatus)
    await flushPromises()
    expect(wrapper.find('strong').text()).toBe('증명 서버 업데이트 필요')
    expect(wrapper.text()).toContain(
      '증명 서버 업데이트가 필요합니다. 기존 요청과 저장 상태는 유지됩니다.',
    )
    expect(wrapper.text()).not.toContain('다시 실행')
    expect(wrapper.classes()).not.toContain('ready')
    state.runtime.value = {
      runtime: { status: 'failed', code: 'CONTRACT_COMPATIBILITY_UNAVAILABLE' },
    }
    await flushPromises()
    expect(wrapper.find('strong').text()).toBe('증명 서버 확인 필요')
    expect(wrapper.text()).toContain('서버를 다시 실행해 주세요')
    wrapper.unmount()
  })
})
