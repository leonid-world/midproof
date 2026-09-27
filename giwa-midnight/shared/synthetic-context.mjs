import { createHash } from 'node:crypto';

// A reserved application namespace, never an ID to look up on GIWA. The sealed
// chain/contract fields remain circuit domain inputs, not a claim of an EVM asset.
export const SYNTHETIC_SUBJECT_ID = BigInt(`0x${createHash('sha256').update('midproof:synthetic-financial-subject:v1').digest('hex')}`).toString();
export const isSyntheticSubjectId = (value) => value === SYNTHETIC_SUBJECT_ID || value === BigInt(SYNTHETIC_SUBJECT_ID);
const address = (value) => typeof value === 'string' && /^0x[0-9a-f]{40}$/.test(value) && !/^0x0{40}$/.test(value);
export function validateSyntheticContext(context) {
  if (!context || context.onchainReceivableId !== SYNTHETIC_SUBJECT_ID
      || typeof context.giwaChainId !== 'string' || !/^[1-9][0-9]*$/.test(context.giwaChainId)
      || !address(context.receivableFinanceAddress) || !address(context.intendedFunderWallet)
      || !address(context.wallets?.SELLER) || !address(context.wallets?.BUYER)
      || new Set([context.wallets.SELLER, context.wallets.BUYER, context.intendedFunderWallet]).size !== 3) {
    throw new Error('SYNTHETIC_CONTEXT_MISMATCH');
  }
  return Object.freeze({ giwaChainId: context.giwaChainId, receivableFinanceAddress: context.receivableFinanceAddress,
    onchainReceivableId: SYNTHETIC_SUBJECT_ID, intendedFunderWallet: context.intendedFunderWallet,
    wallets: Object.freeze({ SELLER: context.wallets.SELLER, BUYER: context.wallets.BUYER }) });
}
export function matchesSyntheticBinding(binding, context) {
  return binding?.onchainReceivableId === SYNTHETIC_SUBJECT_ID
    && binding.giwaChainId === context.giwaChainId && binding.receivableFinanceAddress === context.receivableFinanceAddress
    && ['SELLER', 'BUYER'].includes(binding.subjectRole) && binding.partyWallet === context.wallets[binding.subjectRole]
    && binding.intendedFunderWallet === context.intendedFunderWallet;
}
