package com.leonid.giwaapi.midnight;

public record MidnightBridgeAuthorizationResponse(
        String requestId,
        String actorId,
        String companyId,
        String subjectWallet,
        String requestStatus,
        String networkId,
        String midnightContractAddress,
        String giwaChainId,
        String receivableFinanceAddress,
        String onchainReceivableId,
        String subjectRole,
        PolicyRequest policyRequest
) {
    public record PolicyRequest(
            String requestId,
            String intendedFunderWallet,
            String minAnnualRevenueKrw,
            String maxDebtRatioBps,
            String maxOverdueCount,
            String validUntil
    ) {}
}
