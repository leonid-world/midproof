package com.leonid.giwaapi.midnight;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import jakarta.validation.constraints.NotNull;
import tools.jackson.databind.JsonNode;

@JsonIgnoreProperties(ignoreUnknown = false)
public record MidnightProofCompleteRequest(
        @NotNull JsonNode proofCapability
) {
}
