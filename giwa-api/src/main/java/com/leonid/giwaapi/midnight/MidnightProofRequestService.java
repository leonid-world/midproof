package com.leonid.giwaapi.midnight;

import com.leonid.giwaapi.auth.User;
import com.leonid.giwaapi.auth.UserMapper;
import com.leonid.giwaapi.common.error.ApiException;
import com.leonid.giwaapi.receivable.ReceivableMapper;
import com.leonid.giwaapi.receivable.ReceivableResponse;
import com.leonid.giwaapi.transaction.BlockchainRpcProperties;
import com.leonid.giwaapi.wallet.Wallet;
import com.leonid.giwaapi.wallet.WalletMapper;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

import java.math.BigDecimal;
import java.math.BigInteger;
import java.security.SecureRandom;
import java.time.Instant;
import java.util.Arrays;
import java.util.HexFormat;
import java.util.List;
import java.util.Locale;
import java.util.regex.Pattern;

@Service
public class MidnightProofRequestService {
    private static final Pattern REQUEST_ID = Pattern.compile("^0x[0-9a-f]{64}$");
    private static final Pattern EVM_ADDRESS = Pattern.compile("^0x[0-9a-f]{40}$");
    private static final Pattern MIDNIGHT_ADDRESS = Pattern.compile("^[0-9a-f]{64}$");
    private static final BigInteger UINT64_MAX = new BigInteger("18446744073709551615");
    private static final BigInteger UINT32_MAX = new BigInteger("4294967295");
    private static final BigInteger UINT16_MAX = new BigInteger("65535");

    private final UserMapper userMapper;
    private final WalletMapper walletMapper;
    private final ReceivableMapper receivableMapper;
    private final MidnightProofRequestMapper proofRequestMapper;
    private final MidnightProofProperties properties;
    private final BlockchainRpcProperties blockchainProperties;
    private final MidnightCapabilityCrypto crypto;
    private final MidnightReadClient readClient;
    private final ObjectMapper objectMapper;
    private final SecureRandom secureRandom = new SecureRandom();

    public MidnightProofRequestService(
            UserMapper userMapper,
            WalletMapper walletMapper,
            ReceivableMapper receivableMapper,
            MidnightProofRequestMapper proofRequestMapper,
            MidnightProofProperties properties,
            BlockchainRpcProperties blockchainProperties,
            MidnightCapabilityCrypto crypto,
            MidnightReadClient readClient,
            ObjectMapper objectMapper
    ) {
        this.userMapper = userMapper;
        this.walletMapper = walletMapper;
        this.receivableMapper = receivableMapper;
        this.proofRequestMapper = proofRequestMapper;
        this.properties = properties;
        this.blockchainProperties = blockchainProperties;
        this.crypto = crypto;
        this.readClient = readClient;
        this.objectMapper = objectMapper;
    }

    @Transactional
    public MidnightProofRequestResponse create(
            String email,
            Long receivableId,
            MidnightProofRequestCreateRequest request
    ) {
        ensureCryptoAvailable();
        User requester = findUser(email);
        Wallet requesterWallet = walletMapper.findByCompanyId(requester.companyId())
                .orElseThrow(this::walletRequired);
        requireGiwaWallet(requesterWallet);

        ReceivableResponse receivable = receivableMapper.findVisibleById(receivableId, requester.companyId())
                .orElseThrow(this::receivableNotFound);
        if (requester.companyId().equals(receivable.getSellerCompanyId())
                || requester.companyId().equals(receivable.getBuyerCompanyId())) {
            throw forbiddenRequester();
        }
        if (!"TOKENIZED".equals(receivable.getStatus()) || receivable.getFunderCompanyId() != null) {
            throw new ApiException(
                    HttpStatus.CONFLICT,
                    "MIDNIGHT_PROOF_RECEIVABLE_NOT_REQUESTABLE",
                    "현재 이 채권에는 재무 적격성 요청을 만들 수 없습니다."
            );
        }

        MidnightSubjectRole role = MidnightSubjectRole.parse(request.subjectRole());
        PublicCriteria criteria = criteria(request);
        long now = Instant.now().getEpochSecond();
        long validUntil;
        try {
            validUntil = Math.addExact(now, request.validForSeconds());
        } catch (ArithmeticException exception) {
            throw invalidCriteria();
        }

        String receivableFinanceAddress = normalizeEvmAddress(blockchainProperties.getReceivableFinanceAddress());
        String storedContract = normalizeEvmAddress(receivable.getContractAddress());
        Long chainId = blockchainProperties.getChainId();
        if (chainId == null || chainId <= 0 || !storedContract.equals(receivableFinanceAddress)
                || receivable.getOnchainReceivableId() == null || receivable.getOnchainReceivableId() <= 0) {
            throw contextUnavailable();
        }
        String midnightContractAddress = normalizeMidnightAddress(properties.getContractAddress());
        Long subjectCompanyId = role == MidnightSubjectRole.SELLER
                ? receivable.getSellerCompanyId() : receivable.getBuyerCompanyId();
        String subjectWallet = normalizeEvmAddress(role == MidnightSubjectRole.SELLER
                ? receivable.getSellerWalletAddress() : receivable.getBuyerWalletAddress());

        proofRequestMapper.expireStale(now);
        MidnightProofRequestRecord record = new MidnightProofRequestRecord();
        record.setRequestId(newRequestId());
        record.setReceivableId(receivableId);
        record.setRequesterCompanyId(requester.companyId());
        record.setRequesterWalletAddress(normalizeEvmAddress(requesterWallet.walletAddress()));
        record.setSubjectCompanyId(subjectCompanyId);
        record.setSubjectRole(role.name());
        record.setSubjectWalletAddress(subjectWallet);
        record.setMidnightContractAddress(midnightContractAddress);
        record.setGiwaChainId(chainId);
        record.setReceivableFinanceAddress(receivableFinanceAddress);
        record.setOnchainReceivableId(receivable.getOnchainReceivableId());
        record.setMinAnnualRevenueKrw(new BigDecimal(criteria.minAnnualRevenueKrw()));
        record.setMaxDebtRatioBps(new BigDecimal(criteria.maxDebtRatioBps()));
        record.setMaxOverdueCount(new BigDecimal(criteria.maxOverdueCount()));
        record.setValidUntil(validUntil);

        try {
            proofRequestMapper.insert(record);
        } catch (DataIntegrityViolationException exception) {
            throw activeRequestExists();
        }
        return MidnightProofRequestResponse.from(proofRequestMapper.findById(record.getRequestId())
                .orElseThrow(this::coordinationUnavailable));
    }

    public List<MidnightProofRequestResponse> getAll(String email, String scope) {
        User user = findUser(email);
        proofRequestMapper.expireStale(Instant.now().getEpochSecond());
        List<MidnightProofRequestRecord> records = switch (scope == null ? "" : scope) {
            case "requested" -> proofRequestMapper.findRequestedByCompany(user.companyId());
            case "assigned" -> proofRequestMapper.findAssignedToCompany(user.companyId());
            default -> throw new ApiException(
                    HttpStatus.BAD_REQUEST,
                    "MIDNIGHT_PROOF_SCOPE_INVALID",
                    "scope은 requested 또는 assigned여야 합니다."
            );
        };
        return records.stream().map(MidnightProofRequestResponse::from).toList();
    }

    public MidnightProofRequestResponse getById(String email, String requestId) {
        User user = findUser(email);
        return MidnightProofRequestResponse.from(findVisible(user.companyId(), requestId));
    }

    public MidnightBridgeAuthorizationResponse authorizeBridge(String email, String requestId, String operation) {
        User user = findUser(email);
        MidnightProofRequestRecord record = findVisible(user.companyId(), requestId);
        requireSubject(record, user.companyId());
        if ("challenge".equals(operation) || "prove".equals(operation)) {
            requireRequested(record);
            if (!record.getMidnightContractAddress().equals(normalizeMidnightAddress(properties.getContractAddress()))
                    || !record.getGiwaChainId().equals(blockchainProperties.getChainId())
                    || !record.getReceivableFinanceAddress().equals(
                            normalizeEvmAddress(blockchainProperties.getReceivableFinanceAddress()))) {
                throw contextUnavailable();
            }
        } else if ("ack".equals(operation) && !hasSubmittedCapability(record)) {
            // The worker may discard a finalized result only after durable Spring delivery.
            throw requestStateConflict();
        }
        return new MidnightBridgeAuthorizationResponse(
                record.getRequestId(), user.userId().toString(), user.companyId().toString(),
                record.getSubjectWalletAddress(), record.getRequestStatus(), properties.getNetworkId(),
                record.getMidnightContractAddress(), record.getGiwaChainId().toString(),
                record.getReceivableFinanceAddress(), record.getOnchainReceivableId().toString(),
                record.getSubjectRole(),
                new MidnightBridgeAuthorizationResponse.PolicyRequest(
                        record.getRequestId(), record.getRequesterWalletAddress(),
                        decimal(record.getMinAnnualRevenueKrw()), decimal(record.getMaxDebtRatioBps()),
                        decimal(record.getMaxOverdueCount()), record.getValidUntil().toString()
                )
        );
    }

    public MidnightProofRequestResponse deny(String email, String requestId) {
        User user = findUser(email);
        MidnightProofRequestRecord record = findVisible(user.companyId(), requestId);
        requireSubject(record, user.companyId());
        if (record.getRequestStatus().equals(MidnightProofRequestStatus.DENIED.name())) {
            return MidnightProofRequestResponse.from(record);
        }
        requireRequested(record);
        int updated = proofRequestMapper.deny(
                record.getRequestId(), user.companyId(), Instant.now().getEpochSecond()
        );
        if (updated != 1) throw requestStateConflict();
        return MidnightProofRequestResponse.from(proofRequestMapper.findById(record.getRequestId())
                .orElseThrow(this::coordinationUnavailable));
    }

    public MidnightProofRequestResponse complete(
            String email,
            String requestId,
            MidnightProofCompleteRequest request
    ) {
        User user = findUser(email);
        MidnightProofRequestRecord record = findVisible(user.companyId(), requestId);
        requireSubject(record, user.companyId());

        byte[] canonical = null;
        try {
            MidnightCapabilityV2 capability = MidnightCapabilityV2.parse(request.proofCapability());
            canonical = capability.canonicalBytes(objectMapper);
            byte[] fingerprint = crypto.fingerprint(canonical);
            requireCapabilityMatchesRequest(capability, record);
            if (hasSubmittedCapability(record)) {
                if (crypto.sameFingerprint(record.getCapabilityFingerprint(), fingerprint)) {
                    return MidnightProofRequestResponse.from(record);
                }
                throw requestStateConflict();
            }
            requireRequested(record);
            MidnightCapabilityCrypto.Envelope envelope = crypto.encrypt(canonical, record);
            int updated = proofRequestMapper.submit(
                    record.getRequestId(), user.companyId(), Instant.now().getEpochSecond(),
                    envelope.keyVersion(),
                    envelope.ciphertext(), envelope.iv(), envelope.fingerprint()
            );
            if (updated != 1) {
                MidnightProofRequestRecord current = proofRequestMapper.findById(record.getRequestId())
                        .orElseThrow(this::coordinationUnavailable);
                if (hasSubmittedCapability(current)
                        && crypto.sameFingerprint(current.getCapabilityFingerprint(), fingerprint)) {
                    return MidnightProofRequestResponse.from(current);
                }
                throw requestStateConflict();
            }
            return MidnightProofRequestResponse.from(proofRequestMapper.findById(record.getRequestId())
                    .orElseThrow(this::coordinationUnavailable));
        } catch (MidnightCapabilityException exception) {
            throw capabilityInvalid();
        } catch (MidnightCapabilityCryptoException exception) {
            throw coordinationUnavailable();
        } finally {
            if (canonical != null) Arrays.fill(canonical, (byte) 0);
        }
    }

    public MidnightProofResolveResponse resolve(String email, String requestId) {
        User user = findUser(email);
        MidnightProofRequestRecord record = findVisible(user.companyId(), requestId);
        requireRequester(record, user.companyId());
        if (!hasSubmittedCapability(record)) {
            throw requestStateConflict();
        }

        byte[] plaintext = null;
        try {
            plaintext = crypto.decrypt(record);
            JsonNode capabilityNode = objectMapper.readTree(plaintext);
            MidnightCapabilityV2 capability = MidnightCapabilityV2.parse(capabilityNode);
            requireCapabilityMatchesRequest(capability, record);
            MidnightReadResult readResult = resolveCapability(plaintext, capability, record, user.companyId());
            record = currentResolutionRequest(record, capability, user.companyId());
            if (record.getRequestStatus().equals(MidnightProofRequestStatus.SUBMITTED.name())) {
                proofRequestMapper.markCompleted(
                        record.getRequestId(), user.companyId(), Instant.now().getEpochSecond()
                );
            }
            // Recheck even an already-COMPLETED retry and either CAS outcome:
            // the external read or a competing resolver may cross the deadline.
            record = currentResolutionRequest(record, capability, user.companyId());
            if (!record.getRequestStatus().equals(MidnightProofRequestStatus.COMPLETED.name())) {
                throw requestStateConflict();
            }
            return new MidnightProofResolveResponse(
                    record.getRequestId(),
                    record.getReceivableId(),
                    record.getOnchainReceivableId().toString(),
                    record.getSubjectRole(),
                    record.getSubjectWalletAddress(),
                    record.getRequesterWalletAddress(),
                    MidnightProofRequestStatus.COMPLETED.name(),
                    decimal(record.getMinAnnualRevenueKrw()),
                    decimal(record.getMaxDebtRatioBps()),
                    decimal(record.getMaxOverdueCount()),
                    record.getValidUntil().toString(),
                    new MidnightProofResolveResponse.Result(
                            readResult.eligible(), readResult.providerId(),
                            readResult.evaluationVersion(), readResult.profileAsOf(),
                            readResult.validUntil()
                    )
            );
        } catch (MidnightCapabilityException exception) {
            throw coordinationUnavailable();
        } catch (MidnightCapabilityCryptoException exception) {
            throw coordinationUnavailable();
        } catch (RuntimeException exception) {
            if (exception instanceof ApiException apiException) throw apiException;
            throw coordinationUnavailable();
        } finally {
            if (plaintext != null) Arrays.fill(plaintext, (byte) 0);
        }
    }

    private MidnightProofRequestRecord currentResolutionRequest(
            MidnightProofRequestRecord previous,
            MidnightCapabilityV2 capability,
            Long requesterCompanyId
    ) {
        MidnightProofRequestRecord current = findVisible(requesterCompanyId, previous.getRequestId());
        requireRequester(current, requesterCompanyId);
        if (!hasSubmittedCapability(current)
                || !crypto.sameFingerprint(previous.getCapabilityFingerprint(), current.getCapabilityFingerprint())) {
            throw requestStateConflict();
        }
        requireCapabilityMatchesRequest(capability, current);
        return current;
    }

    private MidnightReadResult resolveCapability(
            byte[] canonical,
            MidnightCapabilityV2 capability,
            MidnightProofRequestRecord record,
            Long requesterCompanyId
    ) {
        try {
            return readClient.resolve(canonical, capability);
        } catch (MidnightReadClientException exception) {
            if (exception.kind() == MidnightReadClientException.Kind.INVALID_CAPABILITY) {
                failInvalidCapability(record, requesterCompanyId);
                throw capabilityInvalid();
            }
            throw coordinationUnavailable();
        }
    }

    private void failInvalidCapability(MidnightProofRequestRecord record, Long requesterCompanyId) {
        long now = Instant.now().getEpochSecond();
        int updated = proofRequestMapper.failInvalidCapability(
                record.getRequestId(), requesterCompanyId, now
        );
        if (updated == 1) return;

        proofRequestMapper.expireStale(now);
        MidnightProofRequestRecord current = proofRequestMapper.findById(record.getRequestId())
                .orElseThrow(this::coordinationUnavailable);
        if (!current.getRequestStatus().equals(MidnightProofRequestStatus.FAILED.name())) {
            throw requestStateConflict();
        }
    }

    private MidnightProofRequestRecord findVisible(Long companyId, String requestId) {
        requireRequestId(requestId);
        proofRequestMapper.expireStale(Instant.now().getEpochSecond());
        return proofRequestMapper.findVisibleById(requestId, companyId)
                .orElseThrow(this::requestNotFound);
    }

    private void requireCapabilityMatchesRequest(
            MidnightCapabilityV2 capability,
            MidnightProofRequestRecord record
    ) {
        boolean matches = capability.midnightContractAddress().equals(record.getMidnightContractAddress())
                && capability.giwaChainId().equals(record.getGiwaChainId().toString())
                && capability.receivableFinanceAddress().equals(record.getReceivableFinanceAddress())
                && capability.onchainReceivableId().equals(record.getOnchainReceivableId().toString())
                && capability.subjectRole().equals(record.getSubjectRole())
                && capability.partyWallet().equals(record.getSubjectWalletAddress())
                && capability.requestId().equals(record.getRequestId())
                && capability.intendedFunderWallet().equals(record.getRequesterWalletAddress())
                && capability.minAnnualRevenueKrw().equals(decimal(record.getMinAnnualRevenueKrw()))
                && capability.maxDebtRatioBps().equals(decimal(record.getMaxDebtRatioBps()))
                && capability.maxOverdueCount().equals(decimal(record.getMaxOverdueCount()))
                && capability.validUntil().equals(record.getValidUntil().toString());
        if (!matches || Instant.now().getEpochSecond() >= record.getValidUntil()) throw capabilityInvalid();
    }

    private PublicCriteria criteria(MidnightProofRequestCreateRequest request) {
        long minimum = properties.getMinValidForSeconds();
        long maximum = properties.getMaxValidForSeconds();
        if (minimum <= 0 || maximum < minimum || maximum > 604800) throw coordinationUnavailable();
        if (request.validForSeconds() == null
                || request.validForSeconds() < minimum || request.validForSeconds() > maximum) {
            throw invalidCriteria();
        }
        return new PublicCriteria(
                uint(request.minAnnualRevenueKrw(), UINT64_MAX),
                uint(request.maxDebtRatioBps(), UINT32_MAX),
                uint(request.maxOverdueCount(), UINT16_MAX)
        );
    }

    private String uint(String value, BigInteger maximum) {
        try {
            if (value == null || value.length() > maximum.toString().length()
                    || !value.matches("^(0|[1-9][0-9]*)$")) throw invalidCriteria();
            BigInteger parsed = new BigInteger(value);
            if (parsed.signum() < 0 || parsed.compareTo(maximum) > 0) throw invalidCriteria();
            return parsed.toString();
        } catch (NumberFormatException exception) {
            throw invalidCriteria();
        }
    }

    private void requireGiwaWallet(Wallet wallet) {
        if (blockchainProperties.getChainId() == null
                || !blockchainProperties.getChainId().equals(wallet.chainId())) throw walletRequired();
        normalizeEvmAddress(wallet.walletAddress());
    }

    private void ensureCryptoAvailable() {
        try {
            crypto.ensureAvailable();
        } catch (MidnightCapabilityCryptoException exception) {
            throw coordinationUnavailable();
        }
    }

    private void requireSubject(MidnightProofRequestRecord record, Long companyId) {
        if (!record.getSubjectCompanyId().equals(companyId)) {
            throw new ApiException(
                    HttpStatus.FORBIDDEN,
                    "MIDNIGHT_PROOF_SUBJECT_REQUIRED",
                    "선택된 Seller 또는 Buyer 회사만 이 요청에 응답할 수 있습니다."
            );
        }
    }

    private void requireRequester(MidnightProofRequestRecord record, Long companyId) {
        if (!record.getRequesterCompanyId().equals(companyId)) {
            throw new ApiException(
                    HttpStatus.FORBIDDEN,
                    "MIDNIGHT_PROOF_REQUESTER_REQUIRED",
                    "이 요청을 만든 회사만 증명 결과를 조회할 수 있습니다."
            );
        }
    }

    private void requireRequested(MidnightProofRequestRecord record) {
        if (!record.getRequestStatus().equals(MidnightProofRequestStatus.REQUESTED.name())) {
            throw requestStateConflict();
        }
    }

    private boolean hasSubmittedCapability(MidnightProofRequestRecord record) {
        return record.getRequestStatus().equals(MidnightProofRequestStatus.SUBMITTED.name())
                || record.getRequestStatus().equals(MidnightProofRequestStatus.COMPLETED.name());
    }

    private User findUser(String email) {
        return userMapper.findByEmail(email).orElseThrow(() -> new ApiException(
                HttpStatus.UNAUTHORIZED,
                "AUTHENTICATION_REQUIRED",
                "로그인이 필요합니다."
        ));
    }

    private String newRequestId() {
        byte[] value = new byte[32];
        do {
            secureRandom.nextBytes(value);
        } while (Arrays.equals(value, new byte[32]));
        return "0x" + HexFormat.of().formatHex(value);
    }

    private void requireRequestId(String requestId) {
        if (requestId == null || !REQUEST_ID.matcher(requestId).matches()
                || requestId.equals("0x" + "0".repeat(64))) {
            throw new ApiException(
                    HttpStatus.BAD_REQUEST,
                    "MIDNIGHT_PROOF_REQUEST_ID_INVALID",
                    "증명 요청 ID 형식을 확인해 주세요."
            );
        }
    }

    private String normalizeEvmAddress(String value) {
        String normalized = value == null ? "" : value.toLowerCase(Locale.ROOT);
        if (!EVM_ADDRESS.matcher(normalized).matches() || normalized.equals("0x" + "0".repeat(40))) {
            throw contextUnavailable();
        }
        return normalized;
    }

    private String normalizeMidnightAddress(String value) {
        String normalized = value == null ? "" : value.toLowerCase(Locale.ROOT);
        if (normalized.startsWith("0x")) normalized = normalized.substring(2);
        if (!MIDNIGHT_ADDRESS.matcher(normalized).matches() || normalized.equals("0".repeat(64))) {
            throw coordinationUnavailable();
        }
        return normalized;
    }

    private String decimal(BigDecimal value) {
        return value.toBigIntegerExact().toString();
    }

    private ApiException forbiddenRequester() {
        return new ApiException(
                HttpStatus.FORBIDDEN,
                "MIDNIGHT_PROOF_RELATED_PARTY_REQUEST_FORBIDDEN",
                "Seller 또는 Buyer 회사는 이 채권의 Funder 요청자가 될 수 없습니다."
        );
    }

    private ApiException walletRequired() {
        return new ApiException(
                HttpStatus.CONFLICT,
                "GIWA_WALLET_REQUIRED",
                "GIWA 네트워크에 등록된 회사 지갑이 필요합니다."
        );
    }

    private ApiException receivableNotFound() {
        return new ApiException(HttpStatus.NOT_FOUND, "RECEIVABLE_NOT_FOUND", "채권을 찾을 수 없습니다.");
    }

    private ApiException requestNotFound() {
        return new ApiException(
                HttpStatus.NOT_FOUND,
                "MIDNIGHT_PROOF_REQUEST_NOT_FOUND",
                "증명 요청을 찾을 수 없습니다."
        );
    }

    private ApiException activeRequestExists() {
        return new ApiException(
                HttpStatus.CONFLICT,
                "MIDNIGHT_PROOF_REQUEST_ACTIVE",
                "같은 채권·역할에 대한 유효한 요청이 이미 있습니다. 만료 후 새 기준으로 요청해 주세요."
        );
    }

    private ApiException requestStateConflict() {
        return new ApiException(
                HttpStatus.CONFLICT,
                "MIDNIGHT_PROOF_REQUEST_STATE_CONFLICT",
                "현재 요청 상태에서는 이 작업을 수행할 수 없습니다."
        );
    }

    private ApiException invalidCriteria() {
        return new ApiException(
                HttpStatus.BAD_REQUEST,
                "MIDNIGHT_PROOF_CRITERIA_INVALID",
                "재무 기준 또는 요청 유효시간을 확인해 주세요."
        );
    }

    private ApiException capabilityInvalid() {
        return new ApiException(
                HttpStatus.valueOf(422),
                "MIDNIGHT_PROOF_CAPABILITY_INVALID",
                "증명 응답이 요청 문맥과 일치하지 않습니다."
        );
    }

    private ApiException contextUnavailable() {
        return new ApiException(
                HttpStatus.CONFLICT,
                "MIDNIGHT_PROOF_CONTEXT_UNAVAILABLE",
                "이 채권은 현재 Midnight 증명 문맥과 일치하지 않습니다."
        );
    }

    private ApiException coordinationUnavailable() {
        return new ApiException(
                HttpStatus.SERVICE_UNAVAILABLE,
                "MIDNIGHT_PROOF_COORDINATION_UNAVAILABLE",
                "Midnight 로컬 증명 조정 서비스를 사용할 수 없습니다."
        );
    }

    private record PublicCriteria(
            String minAnnualRevenueKrw,
            String maxDebtRatioBps,
            String maxOverdueCount
    ) {}
}
