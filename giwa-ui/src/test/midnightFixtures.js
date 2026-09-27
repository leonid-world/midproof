export const SESSION_ID = `0x${'1'.repeat(64)}`
export const PARTY_WALLET = '0x1111111111111111111111111111111111111111'
export const RECEIVABLE_FINANCE = '0x0f264334f98ba0d22f7fc6bb901a5fa36158a315'
export const MIDNIGHT_CONTRACT = '7e3ea9d741ce0f5862db6f46d0ad720be2586cd7d0405ec77e4a0478aa50f4fb'

export function makeAuthorizationRequest(nowSeconds = Math.floor(Date.now() / 1_000)) {
  return {
    version: 1,
    domain: {
      name: 'GASOK Mock Attestation',
      version: '1',
      chainId: '91342',
    },
    primaryType: 'GASOKRoleAttestationAuthorization',
    types: {
      GASOKRoleAttestationAuthorization: [
        { name: 'purpose', type: 'string' },
        { name: 'authorizationId', type: 'bytes32' },
        { name: 'midnightContractAddress', type: 'bytes32' },
        { name: 'receivableFinanceAddress', type: 'address' },
        { name: 'onchainReceivableId', type: 'uint256' },
        { name: 'subjectRole', type: 'string' },
        { name: 'partyWallet', type: 'address' },
        { name: 'attestationRequestCommitment', type: 'bytes32' },
        { name: 'providerId', type: 'uint16' },
        { name: 'policyVersion', type: 'uint16' },
        { name: 'issuedAt', type: 'uint64' },
        { name: 'expiresAt', type: 'uint64' },
      ],
    },
    message: {
      purpose: 'Authorize GASOK local mock financial attestation',
      authorizationId: `0x${'2'.repeat(64)}`,
      midnightContractAddress: `0x${MIDNIGHT_CONTRACT}`,
      receivableFinanceAddress: RECEIVABLE_FINANCE,
      onchainReceivableId: '1',
      subjectRole: 'SELLER',
      partyWallet: PARTY_WALLET,
      attestationRequestCommitment: `0x${'3'.repeat(64)}`,
      providerId: '2',
      policyVersion: '1',
      issuedAt: String(nowSeconds - 1),
      expiresAt: String(nowSeconds + 119),
    },
  }
}

export function makeAuthorizationResponse() {
  return {
    version: 1,
    authorizationId: `0x${'2'.repeat(64)}`,
    typedDataHash: `0x${'4'.repeat(64)}`,
    signer: PARTY_WALLET,
    signature: `0x${'ab'.repeat(65)}`,
  }
}

export function makeProofCapability() {
  return {
    version: 1,
    midnightContractAddress: MIDNIGHT_CONTRACT,
    companyCommitment: `0x${'5'.repeat(64)}`,
    lookupKey: `0x${'6'.repeat(64)}`,
    giwaChainId: '91342',
    receivableFinanceAddress: RECEIVABLE_FINANCE,
    onchainReceivableId: '1',
    subjectRole: 'SELLER',
    partyWallet: PARTY_WALLET,
  }
}

export function makeResolvedEligibility(eligible = true) {
  const capability = makeProofCapability()
  return {
    networkId: 'undeployed',
    contractAddress: capability.midnightContractAddress,
    context: {
      giwaChainId: capability.giwaChainId,
      receivableFinanceAddress: capability.receivableFinanceAddress,
      onchainReceivableId: capability.onchainReceivableId,
      subjectRole: capability.subjectRole,
      partyWallet: capability.partyWallet,
    },
    result: {
      lookupKey: capability.lookupKey,
      eligible,
      providerId: '2',
      policyVersion: '1',
    },
  }
}
