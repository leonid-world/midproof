// Public Preview pins remain immutable. The opt-in local profile is a separate network.
export const PREVIEW_GIWA_CHAIN_ID = 91342n;
export const PREVIEW_RECEIVABLE_FINANCE_ADDRESS = '0x0f264334f98ba0d22f7fc6bb901a5fa36158a315';
export function readGiwaContext(env = process.env) {
  if (env.MIDPROOF_LOCAL_DEMO !== 'true') {
    if (env.MIDPROOF_LOCAL_WALLET_SEED) throw new Error('Local genesis seed requires the isolated local profile.');
    return { chainId: PREVIEW_GIWA_CHAIN_ID, receivableFinanceAddress: PREVIEW_RECEIVABLE_FINANCE_ADDRESS };
  }
  if (env.MIDNIGHT_NETWORK_ID !== 'undeployed' || env.MIDNIGHT_DEMO_MODE !== 'hosted-demo' || env.GIWA_CHAIN_ID !== '31337') {
    throw new Error('Local GIWA configuration requires the isolated undeployed demo.');
  }
  const rpc = new URL(env.GIWA_RPC_URL || '');
  if (rpc.protocol !== 'http:' || !['127.0.0.1', 'localhost', '[::1]', 'evm'].includes(rpc.hostname)
      || rpc.username || rpc.password || rpc.search || rpc.hash || rpc.pathname !== '/') {
    throw new Error('Local GIWA RPC must be the isolated EVM or loopback.');
  }
  const address = env.GIWA_RECEIVABLE_FINANCE_ADDRESS || '';
  if (!/^0x[0-9a-fA-F]{40}$/.test(address) || /^0x0{40}$/.test(address)) throw new Error('Local ReceivableFinance address is required.');
  return { chainId: 31337n, receivableFinanceAddress: address.toLowerCase() };
}
