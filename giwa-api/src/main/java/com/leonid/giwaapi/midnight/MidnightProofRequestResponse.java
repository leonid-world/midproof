package com.leonid.giwaapi.midnight;

import java.time.LocalDateTime;

public record MidnightProofRequestResponse(
        String requestId,
        Long receivableId,
        String onchainReceivableId,
        String subjectRole,
        String requesterCompanyName,
        String subjectCompanyName,
        String partyWallet,
        String intendedFunderWallet,
        String minAnnualRevenueKrw,
        String maxDebtRatioBps,
        String maxOverdueCount,
        String validUntil,
        String status,
        LocalDateTime createdAt,
        LocalDateTime updatedAt
) {
    static MidnightProofRequestResponse from(MidnightProofRequestRecord record) {
        return new MidnightProofRequestResponse(
                record.getRequestId(),
                record.getReceivableId(),
                record.getOnchainReceivableId().toString(),
                record.getSubjectRole(),
                record.getRequesterCompanyName(),
                record.getSubjectCompanyName(),
                record.getSubjectWalletAddress(),
                record.getRequesterWalletAddress(),
                record.getMinAnnualRevenueKrw().toBigIntegerExact().toString(),
                record.getMaxDebtRatioBps().toBigIntegerExact().toString(),
                record.getMaxOverdueCount().toBigIntegerExact().toString(),
                record.getValidUntil().toString(),
                record.getRequestStatus(),
                record.getCreatedAt(),
                record.getUpdatedAt()
        );
    }
}
