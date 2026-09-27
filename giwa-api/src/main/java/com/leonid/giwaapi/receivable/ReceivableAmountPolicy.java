package com.leonid.giwaapi.receivable;

import com.leonid.giwaapi.common.error.ApiException;
import com.leonid.giwaapi.midnight.MidnightProofProperties;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;

import java.math.BigDecimal;

@Component
public class ReceivableAmountPolicy {

    private static final BigDecimal DEMO_MAX_AMOUNT = new BigDecimal("10000");

    private final MidnightProofProperties midnightProperties;

    public ReceivableAmountPolicy(MidnightProofProperties midnightProperties) {
        this.midnightProperties = midnightProperties;
    }

    public ReceivableAmountPolicyResponse current() {
        boolean demoEnabled = midnightProperties.isDemoEnabled();
        String maximum = demoEnabled ? DEMO_MAX_AMOUNT.toPlainString() : null;
        return new ReceivableAmountPolicyResponse(
                demoEnabled, "mKRW", 0, "1", maximum, maximum, "1000", "900"
        );
    }

    // Restrict only new demo debt. Existing debts and confirmed chain receipts
    // must retain their exact original amounts, including when repaid later.
    public void validateNewIssuance(BigDecimal faceValue, BigDecimal fundingAmount) {
        if (!midnightProperties.isDemoEnabled()) return;

        requirePositiveInteger(faceValue);
        requirePositiveInteger(fundingAmount);
        if (faceValue.compareTo(DEMO_MAX_AMOUNT) > 0
                || fundingAmount.compareTo(DEMO_MAX_AMOUNT) > 0) {
            throw new ApiException(
                    HttpStatus.BAD_REQUEST,
                    "DEMO_RECEIVABLE_AMOUNT_LIMIT_EXCEEDED",
                    "데모 채권은 건당 10,000 mKRW까지 발행할 수 있습니다."
            );
        }
    }

    private void requirePositiveInteger(BigDecimal amount) {
        if (amount == null || amount.signum() <= 0
                || amount.stripTrailingZeros().scale() > 0) {
            throw new ApiException(
                    HttpStatus.BAD_REQUEST,
                    "INVALID_RECEIVABLE_AMOUNT",
                    "금액은 1 mKRW 이상의 정수로 입력해 주세요."
            );
        }
    }
}
