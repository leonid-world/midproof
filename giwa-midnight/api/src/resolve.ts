import { verifyProofCapability } from './capability.js';
import { proofResultExpired, PublicApiError } from './errors.js';
import type { GetEligibilityResult } from './eligibility.js';

/** Shared exact read boundary for the HTTP API and the isolated walletless demo. */
export async function resolveExactProofCapability(value: unknown, approvedContractAddress: string,
  getEligibilityResult: GetEligibilityResult, acceptedProviderId?: string, signal?: AbortSignal,
  nowSeconds = () => BigInt(Math.floor(Date.now() / 1000))) {
  const verified = verifyProofCapability(value, approvedContractAddress);
  if (BigInt(verified.capability.validUntil) <= nowSeconds()) throw proofResultExpired();
  const result = await getEligibilityResult(verified.capability.midnightContractAddress, verified.lookupKeyBytes, signal);
  signal?.throwIfAborted();
  if (BigInt(verified.capability.validUntil) <= nowSeconds()) throw proofResultExpired();
  if (acceptedProviderId !== undefined && result.providerId !== acceptedProviderId) {
    throw new PublicApiError(400, 'UNAPPROVED_ATTESTATION_PROVIDER', 'The eligibility result is not from the approved attestation provider.');
  }
  if (result.profileAsOf !== verified.capability.profileAsOf || result.validUntil !== verified.capability.validUntil
      || result.evaluationVersion !== verified.capability.evaluationVersion) {
    throw new PublicApiError(400, 'CAPABILITY_RESULT_MISMATCH', 'The proof capability freshness metadata does not match the public result.');
  }
  return { verified, result };
}
