import { describe, expect, it } from 'vitest'
import { applyMidnightProofDevtoolsPolicy } from './devtoolsPolicy'

describe('Midnight proof Vue devtools policy', () => {
  it('disables runtime Vue devtools while private proof inputs are enabled', () => {
    const app = { config: { devtools: true } }

    applyMidnightProofDevtoolsPolicy(app)

    expect(app.config.devtools).toBe(false)
  })
})
