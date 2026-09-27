#!/usr/bin/env node
// Only ordinary signup/login is needed: standalone demo proof requests do not
// insert fake receivable lifecycle rows into the application database.
if (process.env.MIDPROOF_LOCAL_DEMO !== 'true' || process.env.MIDNIGHT_NETWORK_ID !== 'undeployed'
    || process.env.RAILWAY_ENVIRONMENT_ID) throw new Error('LOCAL_DEMO_PROFILE_REQUIRED');
const base = process.env.MIDNIGHT_DEMO_AUTHORITY_URL || 'http://127.0.0.1:8081';
const parsed = new URL(base);
if (parsed.protocol !== 'http:' || !['127.0.0.1', 'localhost'].includes(parsed.hostname)) throw new Error('PRIVATE_SPRING_URL_REQUIRED');
for (const [index, role] of ['seller', 'buyer', 'funder'].entries()) {
  const credentials = { email: `${role}@midnight-demo.test`, password: 'MidnightDemo2026!' };
  const request = async (route, body) => fetch(new URL(route, base), {
    method: 'POST', redirect: 'error', signal: AbortSignal.timeout(15000),
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify(body),
  });
  let response = await request('/auth/login', credentials);
  if (response.status === 401) response = await request('/auth/signup', {
    ...credentials, userName: `Synthetic Demo ${role}`, companyName: `MidProof Synthetic Demo ${role}`,
    businessNumber: `990000000${index + 1}`,
  });
  if (![200, 201].includes(response.status)) throw new Error(`LOCAL_DEMO_ACCOUNT_CONFLICT_${role.toUpperCase()}`);
  const user = await response.json();
  if (user.user?.email !== credentials.email) throw new Error('LOCAL_DEMO_ACCOUNT_IDENTITY_MISMATCH');
}
process.stdout.write('Local synthetic demo accounts ready.\n');
