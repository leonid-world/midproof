export interface SyntheticDemoContext {
  readonly giwaChainId: string;
  readonly receivableFinanceAddress: string;
  readonly onchainReceivableId: string;
  readonly intendedFunderWallet: string;
  readonly wallets: Readonly<{ SELLER: string; BUYER: string }>;
}
export const SYNTHETIC_SUBJECT_ID: string;
export function isSyntheticSubjectId(value: unknown): boolean;
export function validateSyntheticContext(context: SyntheticDemoContext): SyntheticDemoContext;
export function matchesSyntheticBinding(binding: unknown, context: SyntheticDemoContext): boolean;
