package com.leonid.giwaapi.midnight;

public record MidnightProofResolveResponse(
        String requestId,
        Long receivableId,
        String onchainReceivableId,
        String subjectRole,
        String partyWallet,
        String intendedFunderWallet,
        String status,
        String minAnnualRevenueKrw,
        String maxDebtRatioBps,
        String maxOverdueCount,
        String validUntil,
        Result result
) {
    public record Result(
            boolean eligible,
            String providerId,
            int evaluationVersion,
            String profileAsOf,
            String validUntil
    ) {}
}
