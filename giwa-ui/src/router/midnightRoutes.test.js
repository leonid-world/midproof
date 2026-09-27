import { describe, expect, it } from 'vitest'
import router from './index'

describe('development-only Midnight routes', () => {
  it('uses request inboxes for product routes and isolates manual tools under legacy paths', () => {
    const routeNames = router.getRoutes().map((route) => route.name)

    expect(routeNames).toContain('midnight')
    expect(routeNames).toContain('midnight-prove')
    expect(router.resolve({ name: 'midnight-prove' }).path).toBe('/midnight/prove')
    expect(router.resolve({ name: 'midnight-legacy-results' }).path).toBe(
      '/midnight/legacy/results',
    )
    expect(router.resolve({ name: 'midnight-legacy-authorize' }).path).toBe(
      '/midnight/legacy/authorize',
    )
    expect(router.resolve({ name: 'midnight-legacy-prove' }).path).toBe('/midnight/legacy/prove')
  })
})
