import { describe, expect, it } from 'vitest'
import { createMidnightServerConfig } from './vite.config'

describe('Midnight proof development boundary', () => {
  it('pins the loopback origin and exposes the proof proxy only when the bridge flags are on', () => {
    const development = createMidnightServerConfig(true)

    expect(development).toMatchObject({
      host: '127.0.0.1',
      port: 5173,
      strictPort: true,
    })
    expect(development.proxy['/midnight-api'].target).toBe('http://127.0.0.1:4100')
    expect(development.proxy['/midnight-proof'].target).toBe('http://127.0.0.1:4200')
    expect(development.proxy['/midnight-api'].rewrite('/midnight-api/v1/result')).toBe('/v1/result')
    expect(
      development.proxy['/midnight-proof'].rewrite('/midnight-proof/v1/proof-sessions/status'),
    ).toBe('/v1/proof-sessions/status')

    const disabled = createMidnightServerConfig(false)

    expect(disabled.proxy['/midnight-api'].target).toBe('http://127.0.0.1:4100')
    expect(disabled.proxy['/midnight-proof']).toBeUndefined()
  })
})
