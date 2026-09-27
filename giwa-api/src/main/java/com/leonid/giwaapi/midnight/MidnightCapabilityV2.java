package com.leonid.giwaapi.midnight;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

import java.math.BigInteger;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Set;
import java.util.regex.Pattern;

record MidnightCapabilityV2(
        int version,
        int evaluationVersion,
        String midnightContractAddress,
        String companyCommitment,
        String lookupKey,
        String policyRequestHash,
        String giwaChainId,
        String receivableFinanceAddress,
        String onchainReceivableId,
        String subjectRole,
        String partyWallet,
        String requestId,
        String intendedFunderWallet,
        String minAnnualRevenueKrw,
        String maxDebtRatioBps,
        String maxOverdueCount,
        String profileAsOf,
        String validUntil
) {
    private static final Pattern BYTES32 = Pattern.compile("^0x[0-9a-f]{64}$");
    private static final Pattern EVM_ADDRESS = Pattern.compile("^0x[0-9a-f]{40}$");
    private static final Pattern MIDNIGHT_ADDRESS = Pattern.compile("^[0-9a-f]{64}$");
    private static final Pattern DECIMAL = Pattern.compile("^(0|[1-9][0-9]*)$");
    private static final BigInteger UINT64_MAX = new BigInteger("18446744073709551615");
    private static final BigInteger UINT256_MAX = BigInteger.ONE.shiftLeft(256).subtract(BigInteger.ONE);
    private static final BigInteger UINT32_MAX = new BigInteger("4294967295");
    private static final BigInteger UINT16_MAX = new BigInteger("65535");
    private static final Set<String> FIELDS = Set.of(
            "version", "evaluationVersion", "midnightContractAddress",
            "companyCommitment", "lookupKey", "policyRequestHash", "giwaChainId",
            "receivableFinanceAddress", "onchainReceivableId", "subjectRole",
            "partyWallet", "requestId", "intendedFunderWallet",
            "minAnnualRevenueKrw", "maxDebtRatioBps", "maxOverdueCount",
            "profileAsOf", "validUntil"
    );

    static MidnightCapabilityV2 parse(JsonNode node) {
        try {
            requireExactObject(node, FIELDS);
            int version = exactInt(node, "version", 2);
            int evaluationVersion = exactInt(node, "evaluationVersion", 2);
            String midnightContractAddress = exactString(node, "midnightContractAddress", MIDNIGHT_ADDRESS);
            requireNonzeroHex(midnightContractAddress);
            String companyCommitment = exactString(node, "companyCommitment", BYTES32);
            requireNonzeroHex(companyCommitment);
            String lookupKey = exactString(node, "lookupKey", BYTES32);
            requireNonzeroHex(lookupKey);
            String policyRequestHash = exactString(node, "policyRequestHash", BYTES32);
            requireNonzeroHex(policyRequestHash);
            String giwaChainId = uintString(node, "giwaChainId", UINT64_MAX);
            requirePositive(giwaChainId);
            String receivableFinanceAddress = exactString(node, "receivableFinanceAddress", EVM_ADDRESS);
            requireNonzeroHex(receivableFinanceAddress);
            String onchainReceivableId = uintString(node, "onchainReceivableId", UINT256_MAX);
            requirePositive(onchainReceivableId);
            String subjectRole = exactString(node, "subjectRole", null);
            if (!subjectRole.equals("SELLER") && !subjectRole.equals("BUYER")) throw invalid();
            String partyWallet = exactString(node, "partyWallet", EVM_ADDRESS);
            requireNonzeroHex(partyWallet);
            String requestId = exactString(node, "requestId", BYTES32);
            requireNonzeroHex(requestId);
            String intendedFunderWallet = exactString(node, "intendedFunderWallet", EVM_ADDRESS);
            requireNonzeroHex(intendedFunderWallet);
            String minAnnualRevenueKrw = uintString(node, "minAnnualRevenueKrw", UINT64_MAX);
            String maxDebtRatioBps = uintString(node, "maxDebtRatioBps", UINT32_MAX);
            String maxOverdueCount = uintString(node, "maxOverdueCount", UINT16_MAX);
            String profileAsOf = uintString(node, "profileAsOf", UINT64_MAX);
            requirePositive(profileAsOf);
            String validUntil = uintString(node, "validUntil", UINT64_MAX);
            requirePositive(validUntil);
            if (new BigInteger(profileAsOf).compareTo(new BigInteger(validUntil)) > 0) throw invalid();
            return new MidnightCapabilityV2(
                    version, evaluationVersion, midnightContractAddress,
                    companyCommitment, lookupKey, policyRequestHash, giwaChainId,
                    receivableFinanceAddress, onchainReceivableId, subjectRole,
                    partyWallet, requestId, intendedFunderWallet,
                    minAnnualRevenueKrw, maxDebtRatioBps, maxOverdueCount,
                    profileAsOf, validUntil
            );
        } catch (MidnightCapabilityException exception) {
            throw exception;
        } catch (RuntimeException exception) {
            throw invalid();
        }
    }

    byte[] canonicalBytes(ObjectMapper objectMapper) {
        try {
            Map<String, Object> value = new LinkedHashMap<>();
            value.put("version", version);
            value.put("evaluationVersion", evaluationVersion);
            value.put("midnightContractAddress", midnightContractAddress);
            value.put("companyCommitment", companyCommitment);
            value.put("lookupKey", lookupKey);
            value.put("policyRequestHash", policyRequestHash);
            value.put("giwaChainId", giwaChainId);
            value.put("receivableFinanceAddress", receivableFinanceAddress);
            value.put("onchainReceivableId", onchainReceivableId);
            value.put("subjectRole", subjectRole);
            value.put("partyWallet", partyWallet);
            value.put("requestId", requestId);
            value.put("intendedFunderWallet", intendedFunderWallet);
            value.put("minAnnualRevenueKrw", minAnnualRevenueKrw);
            value.put("maxDebtRatioBps", maxDebtRatioBps);
            value.put("maxOverdueCount", maxOverdueCount);
            value.put("profileAsOf", profileAsOf);
            value.put("validUntil", validUntil);
            return objectMapper.writeValueAsBytes(value);
        } catch (RuntimeException exception) {
            throw invalid();
        }
    }

    static void requireExactObject(JsonNode node, Set<String> fields) {
        if (node == null || !node.isObject() || !node.propertyNames().equals(fields)) throw invalid();
    }

    static String exactString(JsonNode node, String field, Pattern pattern) {
        JsonNode value = node.get(field);
        if (value == null || !value.isString()) throw invalid();
        String result = value.asString();
        if (pattern != null && !pattern.matcher(result).matches()) throw invalid();
        return result;
    }

    static int exactInt(JsonNode node, String field, int expected) {
        JsonNode value = node.get(field);
        if (value == null || !value.isIntegralNumber() || !value.canConvertToInt()) throw invalid();
        int result = value.asInt();
        if (result != expected) throw invalid();
        return result;
    }

    static String uintString(JsonNode node, String field, BigInteger maximum) {
        String value = exactString(node, field, DECIMAL);
        if (value.length() > maximum.toString().length()) throw invalid();
        BigInteger parsed = new BigInteger(value);
        if (parsed.signum() < 0 || parsed.compareTo(maximum) > 0) throw invalid();
        return value;
    }

    private static void requirePositive(String decimal) {
        if (new BigInteger(decimal).signum() <= 0) throw invalid();
    }

    private static void requireNonzeroHex(String value) {
        String hex = value.startsWith("0x") ? value.substring(2) : value;
        if (hex.chars().allMatch(character -> character == '0')) throw invalid();
    }

    static MidnightCapabilityException invalid() {
        return new MidnightCapabilityException();
    }
}

final class MidnightCapabilityException extends RuntimeException {
    MidnightCapabilityException() {
        super("Invalid Midnight capability");
    }
}
