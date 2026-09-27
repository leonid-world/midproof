package com.leonid.giwaapi.midnight;

import com.leonid.giwaapi.common.error.ApiException;
import org.springframework.http.HttpStatus;

import java.util.Locale;

public enum MidnightSubjectRole {
    SELLER,
    BUYER;

    static MidnightSubjectRole parse(String value) {
        if (value != null) {
            try {
                return valueOf(value.toUpperCase(Locale.ROOT));
            } catch (IllegalArgumentException ignored) {
                // Fall through to the stable public validation error.
            }
        }
        throw new ApiException(
                HttpStatus.BAD_REQUEST,
                "MIDNIGHT_PROOF_ROLE_INVALID",
                "증명 대상 역할은 SELLER 또는 BUYER여야 합니다."
        );
    }
}
