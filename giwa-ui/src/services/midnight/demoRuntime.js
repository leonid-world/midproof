import { captureAuthSession, assertAuthSessionCurrent, onAuthSessionChange } from '../authSession'
import { readonly, shallowRef } from 'vue'
import { isMidnightDemoEnabled, midnightProofConfig } from './config'

const LOCAL_CONTRACT = '12caaf76aef1de1c584b67462018810f6e4e7eb2535e136f560cb621e24a3f36'
let runtimeConfig = null
const runtimeState = shallowRef(null)
export const midnightDemoRuntime = readonly(runtimeState)

onAuthSessionChange(() => {
  runtimeConfig = null
  runtimeState.value = null
})

export function demoAuthorizationHeaders(session = captureAuthSession()) {
  if (!isMidnightDemoEnabled) return {}
  assertAuthSessionCurrent(session)
  const token = session.token
  if (!token) throw new Error('로그인 후 데모를 이용해 주세요.')
  return { Authorization: `Bearer ${token}` }
}

export function approvedMidnightContractAddress() {
  if (!isMidnightDemoEnabled) return LOCAL_CONTRACT
  if (!runtimeConfig?.contractAddress) {
    throw new Error('증명 서버를 준비하고 있습니다. 잠시 후 다시 확인해 주세요.')
  }
  return runtimeConfig.contractAddress
}

export async function loadMidnightDemoConfig({ signal, refresh = false } = {}) {
  if (!isMidnightDemoEnabled) return null
  if (!refresh && runtimeConfig?.runtime.status === 'ready') return runtimeConfig
  const session = captureAuthSession()
  const timeout = AbortSignal.timeout(10_000)
  let response
  try {
    response = await fetch(`${midnightProofConfig.apiUrl}/v2/demo/config`, {
      headers: { Accept: 'application/json', ...demoAuthorizationHeaders(session) },
      cache: 'no-store',
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
      signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
    })
  } catch (error) {
    if (signal?.aborted) throw error
    throw new Error('증명 서버에 연결하지 못했습니다. 잠시 후 다시 확인해 주세요.', {
      cause: error,
    })
  }
  if (!response.ok) {
    throw new Error(
      response.status === 401 ? '다시 로그인해 주세요.' : '증명 서버를 준비하고 있습니다.',
    )
  }
  const value = await response.json()
  assertAuthSessionCurrent(session)
  if (
    value?.mode !== 'hosted-demo' ||
    value.networkId !== 'preview' ||
    !Array.isArray(value.profiles) ||
    value.profiles.length < 1 ||
    value.profiles.length > 10 ||
    !value.profiles.every(
      (profile) =>
        /^[a-z0-9-]{1,64}$/.test(profile.id) &&
        typeof profile.label === 'string' &&
        typeof profile.summary === 'string',
    ) ||
    typeof value.runtime?.status !== 'string' ||
    typeof value.provider?.name !== 'string' ||
    value.provider.attestationType !== 'mock' ||
    (value.contractAddress != null &&
      (!/^[0-9a-f]{64}$/.test(value.contractAddress) || /^0+$/.test(value.contractAddress))) ||
    (value.runtime.status === 'ready' && !value.contractAddress)
  ) {
    throw new Error('데모 서버의 설정을 확인하지 못했습니다.')
  }
  runtimeConfig = Object.freeze({
    mode: value.mode,
    networkId: value.networkId,
    contractAddress: value.contractAddress ?? null,
    profiles: Object.freeze(
      value.profiles.map((profile) =>
        Object.freeze({
          id: profile.id,
          label: profile.label,
          summary: profile.summary,
        }),
      ),
    ),
    runtime: Object.freeze({ status: value.runtime.status, code: value.runtime.code }),
    provider: Object.freeze({ name: value.provider.name, attestationType: 'mock' }),
  })
  runtimeState.value = runtimeConfig
  return runtimeConfig
}
