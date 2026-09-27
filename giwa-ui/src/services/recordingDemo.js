// Existing public test accounts from scripts/prepare-midnight-demo.mjs.
// These credentials are intentionally public and are not wallet signing keys.
export const isRecordingDemoEnabled = import.meta.env.VITE_RECORDING_DEMO_ENABLED === 'true'

export const recordingDemoAccounts = Object.freeze([
  Object.freeze({
    role: 'SELLER',
    label: 'Seller',
    email: 'seller@midnight-demo.test',
    walletAddress: '0x60602ed43987ea474a85c12a4e768dc8062b4361',
  }),
  Object.freeze({
    role: 'BUYER',
    label: 'Buyer',
    email: 'buyer@midnight-demo.test',
    walletAddress: '0xf0aa8d7ca5c7e3e586dcc40397147ac98e3717bb',
  }),
  Object.freeze({
    role: 'FUNDER',
    label: 'Funder',
    email: 'funder@midnight-demo.test',
    walletAddress: '0x3dc823dc2c1caf3c14b5b882c7e9a80cc40df9b7',
  }),
])

export function recordingDemoCredentials(account) {
  return { email: account.email, password: 'MidnightDemo2026!' }
}

export function recordingDemoAccountFor(email) {
  if (!isRecordingDemoEnabled) return null
  return recordingDemoAccounts.find((account) => account.email === email) ?? null
}
