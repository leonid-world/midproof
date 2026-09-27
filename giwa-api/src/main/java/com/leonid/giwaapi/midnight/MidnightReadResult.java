package com.leonid.giwaapi.midnight;

record MidnightReadResult(
        boolean eligible,
        String providerId,
        int evaluationVersion,
        String profileAsOf,
        String validUntil
) {
}
