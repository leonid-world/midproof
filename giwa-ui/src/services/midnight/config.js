function normalizeSameOriginApiPath(value, variableName) {
  const path = value.trim().replace(/\/+$/, '')
  const hasControlCharacter = Array.from(value).some((character) => {
    const codePoint = character.codePointAt(0)
    return codePoint <= 31 || codePoint === 127
  })
  if (!/^\/(?!\/)/.test(path) || /[\\?#]/.test(path) || hasControlCharacter) {
    throw new Error(`${variableName} must be a same-origin absolute path`)
  }

  const baseUrl = new URL('/', globalThis.location?.origin ?? 'http://localhost')
  const resolvedUrl = new URL(path, baseUrl)
  if (resolvedUrl.origin !== baseUrl.origin || resolvedUrl.pathname !== path) {
    throw new Error(`${variableName} must be a same-origin absolute path`)
  }
  return path
}

export const isMidnightDemoEnabled = import.meta.env.VITE_MIDNIGHT_DEMO_ENABLED === 'true'

export const isMidnightPocEnabled =
  isMidnightDemoEnabled ||
  (import.meta.env.DEV && import.meta.env.VITE_MIDNIGHT_POC_ENABLED === 'true')

export const isMidnightProofBridgeEnabled =
  isMidnightDemoEnabled ||
  (isMidnightPocEnabled && import.meta.env.VITE_MIDNIGHT_PROOF_BRIDGE_ENABLED === 'true')

function demoApiOrigin() {
  const configured = (import.meta.env.VITE_API_URL ?? 'http://localhost:8080').replace(/\/+$/, '')
  if (!configured) return ''
  if (import.meta.env.VITE_MIDPROOF_LOCAL_DEMO === 'true' && configured === '/api') return '/api'
  const url = new URL(configured)
  const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
  if (
    (url.protocol !== 'https:' && !(url.protocol === 'http:' && loopback)) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== '/'
  ) {
    throw new Error('VITE_API_URL must be an HTTPS origin or a local development origin')
  }
  return url.origin
}

export const midnightConfig = Object.freeze({
  apiUrl: normalizeSameOriginApiPath(
    import.meta.env.VITE_MIDNIGHT_API_URL ?? '/midnight-api',
    'VITE_MIDNIGHT_API_URL',
  ),
  networkId: isMidnightDemoEnabled ? 'preview' : 'undeployed',
})

export const midnightProofConfig = Object.freeze({
  apiUrl: isMidnightProofBridgeEnabled
    ? (isMidnightDemoEnabled ? demoApiOrigin() : '') +
      normalizeSameOriginApiPath(
        import.meta.env.VITE_MIDNIGHT_PROOF_API_URL ?? '/midnight-proof',
        'VITE_MIDNIGHT_PROOF_API_URL',
      )
    : '',
})
