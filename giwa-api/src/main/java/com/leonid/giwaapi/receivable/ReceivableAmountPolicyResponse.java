package com.leonid.giwaapi.receivable;

public record ReceivableAmountPolicyResponse(
        boolean demoEnabled,
        String tokenSymbol,
        int tokenDecimals,
        String minAmount,
        String maxFaceValue,
        String maxFundingAmount,
        String suggestedFaceValue,
        String suggestedFundingAmount
) {
}
