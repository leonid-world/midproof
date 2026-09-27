package com.leonid.giwaapi.midnight;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Positive;

@JsonIgnoreProperties(ignoreUnknown = false)
public record MidnightProofRequestCreateRequest(
        @NotBlank String subjectRole,
        @NotBlank @Pattern(regexp = "^(0|[1-9][0-9]{0,19})$") String minAnnualRevenueKrw,
        @NotBlank @Pattern(regexp = "^(0|[1-9][0-9]{0,9})$") String maxDebtRatioBps,
        @NotBlank @Pattern(regexp = "^(0|[1-9][0-9]{0,4})$") String maxOverdueCount,
        @NotNull @Positive Long validForSeconds
) {
}
