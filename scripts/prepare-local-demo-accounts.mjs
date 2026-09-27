#!/usr/bin/env node
// Historical filename; local and hosted synthetic demos need only these
// ordinary signup/login calls. Never registers wallets or creates receivables.
import { pathToFileURL } from 'node:url';

export async function prepareDemoAccounts(env = process.env, requestFetch = fetch) {
  const synthetic = env.MIDPROOF_SYNTHETIC_ONLY === 'true'
    && env.MIDNIGHT_DEMO_MODE === 'hosted-demo'
    && ['preview', 'undeployed'].includes(env.MIDNIGHT_NETWORK_ID);
  const local = env.MIDPROOF_LOCAL_DEMO === 'true' && env.MIDNIGHT_NETWORK_ID === 'undeployed'
    && !env.RAILWAY_ENVIRONMENT_ID;
  if (!synthetic && !local) throw new Error('SYNTHETIC_DEMO_PROFILE_REQUIRED');
  const base = new URL(env.MIDNIGHT_DEMO_AUTHORITY_URL || 'http://127.0.0.1:8081');
  if (base.protocol !== 'http:' || !['127.0.0.1', 'localhost', '[::1]'].includes(base.hostname)
      || base.username || base.password || base.pathname !== '/' || base.search || base.hash) {
    throw new Error('PRIVATE_SPRING_URL_REQUIRED');
  }
  for (const [index, role] of ['seller', 'buyer', 'funder'].entries()) {
    // Intentionally public credentials for existing fictional demonstration accounts.
    const credentials = { email: `${role}@midnight-demo.test`, password: 'MidnightDemo2026!' };
    const request = async (route, body) => requestFetch(new URL(route, base), {
      method: 'POST', redirect: 'error', signal: AbortSignal.timeout(15000),
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify(body),
    });
    let response = await request('/auth/login', credentials);
    if (response.status === 401) response = await request('/auth/signup', {
      ...credentials, userName: `Synthetic Demo ${role}`, companyName: `MidProof Synthetic Demo ${role}`,
      businessNumber: `990000000${index + 1}`,
    });
    if (![200, 201].includes(response.status)) throw new Error(`DEMO_ACCOUNT_CONFLICT_${role.toUpperCase()}`);
    const user = await response.json();
    if (user.user?.email !== credentials.email) throw new Error('DEMO_ACCOUNT_IDENTITY_MISMATCH');
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await prepareDemoAccounts();
  process.stdout.write('Synthetic demo accounts ready; no wallet or receivable setup.\n');
}
