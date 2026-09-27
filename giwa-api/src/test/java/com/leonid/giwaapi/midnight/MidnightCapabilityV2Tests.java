package com.leonid.giwaapi.midnight;

import org.junit.jupiter.api.Test;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

import java.util.LinkedHashMap;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class MidnightCapabilityV2Tests {
    private final ObjectMapper objectMapper = new ObjectMapper();

    @Test
    void acceptsUint256OnchainIdAndZeroPublicThresholds() {
        Map<String, Object> value = validCapability();
        String uint256Max = "115792089237316195423570985008687907853269984665640564039457584007913129639935";
        value.put("onchainReceivableId", uint256Max);
        value.put("minAnnualRevenueKrw", "0");
        value.put("maxDebtRatioBps", "0");
        value.put("maxOverdueCount", "0");

        MidnightCapabilityV2 parsed = MidnightCapabilityV2.parse(node(value));

        assertThat(parsed.onchainReceivableId()).isEqualTo(uint256Max);
        assertThat(parsed.minAnnualRevenueKrw()).isEqualTo("0");
    }

    @Test
    void rejectsUnknownFieldsAndNoncanonicalDecimalStrings() {
        Map<String, Object> unknown = validCapability();
        unknown.put("rawFinance", "never accepted");
        assertThatThrownBy(() -> MidnightCapabilityV2.parse(node(unknown)))
                .isInstanceOf(MidnightCapabilityException.class);

        Map<String, Object> leadingZero = validCapability();
        leadingZero.put("maxOverdueCount", "01");
        assertThatThrownBy(() -> MidnightCapabilityV2.parse(node(leadingZero)))
                .isInstanceOf(MidnightCapabilityException.class);
    }

    @Test
    void rejectsZeroCorrelationValuesAddressesAndIdentifiers() {
        for (String field : new String[]{"companyCommitment", "lookupKey", "policyRequestHash", "requestId"}) {
            Map<String, Object> value = validCapability();
            value.put(field, "0x" + "0".repeat(64));
            assertThatThrownBy(() -> MidnightCapabilityV2.parse(node(value)))
                    .as(field)
                    .isInstanceOf(MidnightCapabilityException.class);
        }
        for (String field : new String[]{"receivableFinanceAddress", "partyWallet", "intendedFunderWallet"}) {
            Map<String, Object> value = validCapability();
            value.put(field, "0x" + "0".repeat(40));
            assertThatThrownBy(() -> MidnightCapabilityV2.parse(node(value)))
                    .as(field)
                    .isInstanceOf(MidnightCapabilityException.class);
        }
        for (String field : new String[]{"giwaChainId", "onchainReceivableId", "profileAsOf", "validUntil"}) {
            Map<String, Object> value = validCapability();
            value.put(field, "0");
            assertThatThrownBy(() -> MidnightCapabilityV2.parse(node(value)))
                    .as(field)
                    .isInstanceOf(MidnightCapabilityException.class);
        }
    }

    @Test
    void rejectsUintOverflowAndProfileAfterValidityDeadline() {
        Map<String, Object> uint256Overflow = validCapability();
        uint256Overflow.put(
                "onchainReceivableId",
                "115792089237316195423570985008687907853269984665640564039457584007913129639936"
        );
        assertThatThrownBy(() -> MidnightCapabilityV2.parse(node(uint256Overflow)))
                .isInstanceOf(MidnightCapabilityException.class);

        Map<String, Object> futureProfile = validCapability();
        futureProfile.put("profileAsOf", "1900000000");
        futureProfile.put("validUntil", "1800000000");
        assertThatThrownBy(() -> MidnightCapabilityV2.parse(node(futureProfile)))
                .isInstanceOf(MidnightCapabilityException.class);
    }

    private JsonNode node(Map<String, Object> value) {
        return objectMapper.readTree(objectMapper.writeValueAsBytes(value));
    }

    private Map<String, Object> validCapability() {
        Map<String, Object> value = new LinkedHashMap<>();
        value.put("version", 2);
        value.put("evaluationVersion", 2);
        value.put("midnightContractAddress", "1".repeat(64));
        value.put("companyCommitment", "0x" + "2".repeat(64));
        value.put("lookupKey", "0x" + "3".repeat(64));
        value.put("policyRequestHash", "0x" + "4".repeat(64));
        value.put("giwaChainId", "91342");
        value.put("receivableFinanceAddress", "0x" + "5".repeat(40));
        value.put("onchainReceivableId", "2");
        value.put("subjectRole", "BUYER");
        value.put("partyWallet", "0x" + "6".repeat(40));
        value.put("requestId", "0x" + "7".repeat(64));
        value.put("intendedFunderWallet", "0x" + "8".repeat(40));
        value.put("minAnnualRevenueKrw", "1");
        value.put("maxDebtRatioBps", "2");
        value.put("maxOverdueCount", "3");
        value.put("profileAsOf", "1800000000");
        value.put("validUntil", "1800000300");
        return value;
    }
}
