export const PREVIEW_GIWA_CHAIN_ID: bigint;
export const PREVIEW_RECEIVABLE_FINANCE_ADDRESS: string;
export function readGiwaContext(env?: Record<string, string | undefined>): { chainId: bigint; receivableFinanceAddress: string };
