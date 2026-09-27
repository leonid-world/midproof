package com.leonid.giwaapi.midnight;

import com.leonid.giwaapi.auth.AuthResponse;
import com.leonid.giwaapi.auth.AuthService;
import com.leonid.giwaapi.auth.SignupRequest;
import com.leonid.giwaapi.auth.User;
import com.leonid.giwaapi.auth.UserMapper;
import com.leonid.giwaapi.common.error.ApiException;
import com.leonid.giwaapi.wallet.WalletConnectRequest;
import com.leonid.giwaapi.wallet.WalletService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

import java.time.Instant;
import java.time.LocalDate;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.concurrent.atomic.AtomicInteger;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest(properties = {
        "app.midnight.demo-enabled=true",
        "app.midnight.internal-token=midnight-test-internal-token-32-characters"
})
@AutoConfigureMockMvc
@ActiveProfiles("test")
class MidnightProofRequestIntegrationTests {
    private static final AtomicInteger IDS = new AtomicInteger(1000);
    private static final String INTERNAL_TOKEN = "midnight-test-internal-token-32-characters";

    @Autowired private AuthService authService;
    @Autowired private WalletService walletService;
    @Autowired private UserMapper userMapper;
    @Autowired private JdbcTemplate jdbcTemplate;
    @Autowired private MidnightProofRequestService service;
    @Autowired private MidnightProofRequestMapper mapper;
    @Autowired private MidnightProofProperties properties;
    @Autowired private ObjectMapper objectMapper;
    @Autowired private MockMvc mockMvc;

    @MockitoBean
    private MidnightReadClient readClient;

    @BeforeEach
    void stubReadApi() {
        when(readClient.resolve(any(byte[].class), any(MidnightCapabilityV2.class)))
                .thenAnswer(invocation -> {
                    MidnightCapabilityV2 capability = invocation.getArgument(1);
                    return new MidnightReadResult(
                            true, "2", 2, capability.profileAsOf(), capability.validUntil()
                    );
                });
    }

    @Test
    void createsScopedRequestAndEnforcesOneActiveRequestPerFunderReceivableRole() {
        Fixture fixture = fixture();

        MidnightProofRequestResponse created = createSellerRequest(fixture);

        assertThat(created.requestId()).matches("^0x[0-9a-f]{64}$");
        assertThat(created.subjectRole()).isEqualTo("SELLER");
        assertThat(created.intendedFunderWallet()).isEqualTo(fixture.funder.wallet);
        assertThat(created.partyWallet()).isEqualTo(fixture.seller.wallet);
        assertThat(created.status()).isEqualTo("REQUESTED");
        assertThat(service.getAll(fixture.funder.email, "requested"))
                .extracting(MidnightProofRequestResponse::requestId)
                .contains(created.requestId());
        assertThat(service.getAll(fixture.seller.email, "assigned"))
                .extracting(MidnightProofRequestResponse::requestId)
                .contains(created.requestId());
        assertThat(service.getAll(fixture.buyer.email, "assigned"))
                .extracting(MidnightProofRequestResponse::requestId)
                .doesNotContain(created.requestId());

        assertThatThrownBy(() -> createSellerRequest(fixture))
                .isInstanceOfSatisfying(ApiException.class, error -> {
                    assertThat(error.getStatus().value()).isEqualTo(409);
                    assertThat(error.getCode()).isEqualTo("MIDNIGHT_PROOF_REQUEST_ACTIVE");
                });
    }

    @Test
    void bridgeAuthorityRequiresBothTheInternalCredentialAndAuthenticatedSubject() throws Exception {
        Fixture fixture = fixture();
        MidnightProofRequestResponse request = createSellerRequest(fixture);
        String body = objectMapper.writeValueAsString(Map.of("requestId", request.requestId(), "operation", "challenge"));

        mockMvc.perform(post("/internal/midnight/authorize")
                        .header("X-Midnight-Internal-Token", INTERNAL_TOKEN)
                        .contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isUnauthorized())
                .andExpect(header().string("Cache-Control", "no-store"));
        mockMvc.perform(post("/internal/midnight/authorize")
                        .header("Authorization", "Bearer " + fixture.seller.token)
                        .contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isForbidden());
        mockMvc.perform(post("/internal/midnight/authorize")
                        .header("Authorization", "Bearer " + fixture.funder.token)
                        .header("X-Midnight-Internal-Token", INTERNAL_TOKEN)
                        .contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("MIDNIGHT_PROOF_SUBJECT_REQUIRED"));
        mockMvc.perform(post("/internal/midnight/authorize")
                        .header("Authorization", "Bearer " + fixture.seller.token)
                        .header("X-Midnight-Internal-Token", INTERNAL_TOKEN)
                        .contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isOk())
                .andExpect(header().string("Cache-Control", "no-store"))
                .andExpect(jsonPath("$.actorId").value(fixture.seller.user.userId().toString()))
                .andExpect(jsonPath("$.companyId").value(fixture.seller.user.companyId().toString()))
                .andExpect(jsonPath("$.subjectWallet").value(fixture.seller.wallet))
                .andExpect(jsonPath("$.onchainReceivableId").value(request.onchainReceivableId()))
                .andExpect(jsonPath("$.networkId").value("undeployed"))
                .andExpect(jsonPath("$.policyRequest.requestId").value(request.requestId()))
                .andExpect(jsonPath("$.policyRequest.minAnnualRevenueKrw").value("500000000"))
                .andExpect(jsonPath("$.annualRevenueKrw").doesNotExist())
                .andExpect(jsonPath("$.proofCapability").doesNotExist());
    }

    @Test
    void bridgeAuthorityRejectsPrivateFieldsAndRemoteOrForeignRequestAccess() throws Exception {
        Fixture fixture = fixture();
        MidnightProofRequestResponse request = createSellerRequest(fixture);
        Map<String, Object> body = new LinkedHashMap<>(Map.of("requestId", request.requestId(), "operation", "recover"));
        body.put("annualRevenueKrw", "private-marker");
        mockMvc.perform(post("/internal/midnight/authorize")
                        .header("Authorization", "Bearer " + fixture.seller.token)
                        .header("X-Midnight-Internal-Token", INTERNAL_TOKEN)
                        .contentType(MediaType.APPLICATION_JSON).content(objectMapper.writeValueAsBytes(body)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("INVALID_REQUEST_BODY"));
        body.remove("annualRevenueKrw");
        mockMvc.perform(post("/internal/midnight/authorize")
                        .with(servletRequest -> { servletRequest.setRemoteAddr("203.0.113.10"); return servletRequest; })
                        .header("Authorization", "Bearer " + fixture.seller.token)
                        .header("X-Midnight-Internal-Token", INTERNAL_TOKEN)
                        .contentType(MediaType.APPLICATION_JSON).content(objectMapper.writeValueAsBytes(body)))
                .andExpect(status().isForbidden());
        mockMvc.perform(post("/internal/midnight/authorize")
                        .header("Authorization", "Bearer " + fixture.buyer.token)
                        .header("X-Midnight-Internal-Token", INTERNAL_TOKEN)
                        .contentType(MediaType.APPLICATION_JSON).content(objectMapper.writeValueAsBytes(body)))
                .andExpect(status().isNotFound());
    }

    @Test
    void bridgeAcknowledgementRequiresDurableDeliveryAndCannotRestartSubmittedProof() throws Exception {
        Fixture fixture = fixture();
        MidnightProofRequestResponse request = createSellerRequest(fixture);
        String ack = objectMapper.writeValueAsString(Map.of("requestId", request.requestId(), "operation", "ack"));
        mockMvc.perform(post("/internal/midnight/authorize")
                        .header("Authorization", "Bearer " + fixture.seller.token)
                        .header("X-Midnight-Internal-Token", INTERNAL_TOKEN)
                        .contentType(MediaType.APPLICATION_JSON).content(ack))
                .andExpect(status().isConflict());
        service.complete(fixture.seller.email, request.requestId(), new MidnightProofCompleteRequest(capability(request, "a")));
        mockMvc.perform(post("/internal/midnight/authorize")
                        .header("Authorization", "Bearer " + fixture.seller.token)
                        .header("X-Midnight-Internal-Token", INTERNAL_TOKEN)
                        .contentType(MediaType.APPLICATION_JSON).content(ack))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.requestStatus").value("SUBMITTED"));
        assertThatThrownBy(() -> service.authorizeBridge(fixture.seller.email, request.requestId(), "prove"))
                .isInstanceOfSatisfying(ApiException.class,
                        error -> assertThat(error.getCode()).isEqualTo("MIDNIGHT_PROOF_REQUEST_STATE_CONFLICT"));
    }

    @Test
    void expiredRequestsMayBeInspectedButCannotAuthorizeAnotherProof() {
        Fixture fixture = fixture();
        MidnightProofRequestResponse request = createSellerRequest(fixture);
        jdbcTemplate.update("UPDATE midnight_proof_requests SET valid_until = ? WHERE request_id = ?",
                Instant.now().getEpochSecond() - 1, request.requestId());
        assertThat(service.authorizeBridge(fixture.seller.email, request.requestId(), "status").requestStatus())
                .isEqualTo("EXPIRED");
        assertThatThrownBy(() -> service.authorizeBridge(fixture.seller.email, request.requestId(), "challenge"))
                .isInstanceOfSatisfying(ApiException.class,
                        error -> assertThat(error.getCode()).isEqualTo("MIDNIGHT_PROOF_REQUEST_STATE_CONFLICT"));
    }

    @Test
    void rejectsRelatedPartyRequesterAndRequiresRegisteredGiwaWallet() {
        Fixture fixture = fixture();

        assertThatThrownBy(() -> service.create(
                fixture.seller.email,
                fixture.receivableId,
                createRequest("SELLER")
        )).isInstanceOfSatisfying(ApiException.class,
                error -> assertThat(error.getCode())
                        .isEqualTo("MIDNIGHT_PROOF_RELATED_PARTY_REQUEST_FORBIDDEN"));

        Actor noWallet = signup("no-wallet");
        assertThatThrownBy(() -> service.create(noWallet.email, fixture.receivableId, createRequest("BUYER")))
                .isInstanceOfSatisfying(ApiException.class,
                        error -> assertThat(error.getCode()).isEqualTo("GIWA_WALLET_REQUIRED"));
    }

    @Test
    void onlySubjectSubmitsAndSameCapabilityRetryIsIdempotentWithoutReadDependency() {
        Fixture fixture = fixture();
        MidnightProofRequestResponse request = createSellerRequest(fixture);
        JsonNode capability = capability(request, "a");

        assertThatThrownBy(() -> service.complete(
                fixture.funder.email, request.requestId(), new MidnightProofCompleteRequest(capability)
        )).isInstanceOfSatisfying(ApiException.class,
                error -> assertThat(error.getCode()).isEqualTo("MIDNIGHT_PROOF_SUBJECT_REQUIRED"));

        MidnightProofRequestResponse submitted = service.complete(
                fixture.seller.email, request.requestId(), new MidnightProofCompleteRequest(capability)
        );
        MidnightProofRequestResponse retried = service.complete(
                fixture.seller.email, request.requestId(), new MidnightProofCompleteRequest(capability)
        );

        assertThat(submitted.status()).isEqualTo("SUBMITTED");
        assertThat(retried).isEqualTo(submitted);
        verify(readClient, times(0)).resolve(any(byte[].class), any(MidnightCapabilityV2.class));

        assertThatThrownBy(() -> createSellerRequest(fixture))
                .isInstanceOfSatisfying(ApiException.class,
                        error -> assertThat(error.getCode()).isEqualTo("MIDNIGHT_PROOF_REQUEST_ACTIVE"));

        MidnightProofRequestRecord stored = mapper.findById(request.requestId()).orElseThrow();
        assertThat(stored.getEncryptionKeyVersion()).isEqualTo(1);
        assertThat(stored.getCapabilityIv()).hasSize(12);
        assertThat(stored.getCapabilityFingerprint()).hasSize(32);
        assertThat(new String(stored.getCapabilityCiphertext()))
                .doesNotContain("companyCommitment", "lookupKey", "annualRevenueKrw");

        assertThatThrownBy(() -> service.complete(
                fixture.seller.email,
                request.requestId(),
                new MidnightProofCompleteRequest(capability(request, "b"))
        )).isInstanceOfSatisfying(ApiException.class,
                error -> assertThat(error.getCode()).isEqualTo("MIDNIGHT_PROOF_REQUEST_STATE_CONFLICT"));
    }

    @Test
    void requesterResolvesServerSideWithoutCapabilityOrCorrelationFieldsInResponse() throws Exception {
        Fixture fixture = fixture();
        MidnightProofRequestResponse request = createSellerRequest(fixture);
        JsonNode capability = capability(request, "c");
        service.complete(fixture.seller.email, request.requestId(), new MidnightProofCompleteRequest(capability));

        assertThatThrownBy(() -> service.resolve(fixture.seller.email, request.requestId()))
                .isInstanceOfSatisfying(ApiException.class,
                        error -> assertThat(error.getCode()).isEqualTo("MIDNIGHT_PROOF_REQUESTER_REQUIRED"));

        MidnightProofResolveResponse response = service.resolve(fixture.funder.email, request.requestId());
        String json = objectMapper.writeValueAsString(response);

        assertThat(response.status()).isEqualTo("COMPLETED");
        assertThat(service.getById(fixture.funder.email, request.requestId()).status()).isEqualTo("COMPLETED");
        assertThat(response.result().eligible()).isTrue();
        assertThat(response.result().providerId()).isEqualTo("2");
        assertThat(json).doesNotContain(
                "proofCapability", "companyCommitment", "lookupKey", "policyRequestHash", "signature"
        );
        verify(readClient, times(1)).resolve(any(byte[].class), any(MidnightCapabilityV2.class));

        assertThatThrownBy(() -> createSellerRequest(fixture))
                .isInstanceOfSatisfying(ApiException.class,
                        error -> assertThat(error.getCode()).isEqualTo("MIDNIGHT_PROOF_REQUEST_ACTIVE"));
    }

    @Test
    void rejectsCapabilityContextMismatchWithoutCallingReadApi() {
        Fixture fixture = fixture();
        MidnightProofRequestResponse request = createSellerRequest(fixture);
        Map<String, Object> value = capabilityMap(request, "d");
        value.put("maxOverdueCount", "2");
        JsonNode capability = objectMapper.readTree(objectMapper.writeValueAsBytes(value));

        assertThatThrownBy(() -> service.complete(
                fixture.seller.email, request.requestId(), new MidnightProofCompleteRequest(capability)
        )).isInstanceOfSatisfying(ApiException.class, error -> {
            assertThat(error.getStatus().value()).isEqualTo(422);
            assertThat(error.getCode()).isEqualTo("MIDNIGHT_PROOF_CAPABILITY_INVALID");
        });
        verify(readClient, times(0)).resolve(any(byte[].class), any(MidnightCapabilityV2.class));
    }

    @Test
    void readApiFailureKeepsTheEncryptedSubmissionDurableForRequesterRetry() {
        Fixture fixture = fixture();
        MidnightProofRequestResponse request = createSellerRequest(fixture);
        MidnightProofRequestResponse submitted = service.complete(
                fixture.seller.email,
                request.requestId(),
                new MidnightProofCompleteRequest(capability(request, "8"))
        );
        when(readClient.resolve(any(byte[].class), any(MidnightCapabilityV2.class)))
                .thenThrow(new MidnightReadClientException(MidnightReadClientException.Kind.UNAVAILABLE));

        assertThat(submitted.status()).isEqualTo("SUBMITTED");
        assertThatThrownBy(() -> service.resolve(fixture.funder.email, request.requestId()))
                .isInstanceOfSatisfying(ApiException.class, error -> {
            assertThat(error.getStatus().value()).isEqualTo(503);
            assertThat(error.getCode()).isEqualTo("MIDNIGHT_PROOF_COORDINATION_UNAVAILABLE");
            assertThat(error).hasMessageNotContaining("lookupKey");
            assertThat(error).hasMessageNotContaining("companyCommitment");
        });

        MidnightProofRequestRecord stored = mapper.findById(request.requestId()).orElseThrow();
        assertThat(stored.getRequestStatus()).isEqualTo("SUBMITTED");
        assertThat(stored.getCapabilityCiphertext()).isNotEmpty();
        assertThat(stored.getCapabilityIv()).hasSize(12);
        assertThat(stored.getCapabilityFingerprint()).hasSize(32);
        assertThat(activeMarkerCount(request.requestId())).isEqualTo(1);

        when(readClient.resolve(any(byte[].class), any(MidnightCapabilityV2.class)))
                .thenAnswer(invocation -> {
                    MidnightCapabilityV2 capability = invocation.getArgument(1);
                    return new MidnightReadResult(
                            true, "2", 2, capability.profileAsOf(), capability.validUntil()
                    );
                });
        assertThat(service.resolve(fixture.funder.email, request.requestId()).status()).isEqualTo("COMPLETED");
    }

    @Test
    void permanentInvalidCapabilityFailsRequestClearsEnvelopeAndReleasesActiveSlot() {
        Fixture fixture = fixture();
        MidnightProofRequestResponse request = createSellerRequest(fixture);
        service.complete(
                fixture.seller.email,
                request.requestId(),
                new MidnightProofCompleteRequest(capability(request, "6"))
        );
        when(readClient.resolve(any(byte[].class), any(MidnightCapabilityV2.class)))
                .thenThrow(new MidnightReadClientException(MidnightReadClientException.Kind.INVALID_CAPABILITY));

        assertThatThrownBy(() -> service.resolve(fixture.funder.email, request.requestId()))
                .isInstanceOfSatisfying(ApiException.class, error -> {
                    assertThat(error.getStatus().value()).isEqualTo(422);
                    assertThat(error.getCode()).isEqualTo("MIDNIGHT_PROOF_CAPABILITY_INVALID");
                    assertThat(error).hasMessageNotContaining(request.requestId());
                    assertThat(error).hasMessageNotContaining("companyCommitment");
                    assertThat(error).hasMessageNotContaining("lookupKey");
                    assertThat(error).hasMessageNotContaining("policyRequestHash");
                });

        MidnightProofRequestRecord failed = mapper.findById(request.requestId()).orElseThrow();
        assertThat(failed.getRequestStatus()).isEqualTo("FAILED");
        assertThat(failed.getCapabilityCiphertext()).isNull();
        assertThat(failed.getCapabilityIv()).isNull();
        assertThat(failed.getCapabilityFingerprint()).isNull();
        assertThat(failed.getSubmittedAt()).isNotNull();
        assertThat(failed.getCompletedAt()).isNull();
        assertThat(activeMarkerCount(request.requestId())).isZero();
        assertThat(service.getById(fixture.funder.email, request.requestId()).status()).isEqualTo("FAILED");

        assertThat(createSellerRequest(fixture).status()).isEqualTo("REQUESTED");
    }

    @Test
    void subjectDenialIsIdempotentAndReleasesTheActiveRequestSlot() {
        Fixture fixture = fixture();
        MidnightProofRequestResponse request = createSellerRequest(fixture);

        MidnightProofRequestResponse denied = service.deny(fixture.seller.email, request.requestId());
        MidnightProofRequestResponse retried = service.deny(fixture.seller.email, request.requestId());

        assertThat(denied.status()).isEqualTo("DENIED");
        assertThat(retried.status()).isEqualTo("DENIED");
        assertThat(createSellerRequest(fixture).status()).isEqualTo("REQUESTED");
    }

    @Test
    void expiryClearsEncryptedCapabilityAndClosesRequest() {
        Fixture fixture = fixture();
        MidnightProofRequestResponse request = createSellerRequest(fixture);
        service.complete(
                fixture.seller.email,
                request.requestId(),
                new MidnightProofCompleteRequest(capability(request, "e"))
        );
        jdbcTemplate.update(
                "UPDATE midnight_proof_requests SET valid_until = 1 WHERE request_id = ?",
                request.requestId()
        );

        MidnightProofRequestResponse expired = service.getById(fixture.funder.email, request.requestId());
        MidnightProofRequestRecord stored = mapper.findById(request.requestId()).orElseThrow();

        assertThat(expired.status()).isEqualTo("EXPIRED");
        assertThat(stored.getCapabilityCiphertext()).isNull();
        assertThat(stored.getCapabilityIv()).isNull();
        assertThat(stored.getCapabilityFingerprint()).isNull();
    }

    @Test
    void controllerRequiresAuthenticationExactBodiesAndEmitsNoStoreJson() throws Exception {
        Fixture fixture = fixture();
        MidnightProofRequestResponse request = createSellerRequest(fixture);
        Actor outsider = signup("outsider");
        connect(outsider);

        mockMvc.perform(get("/midnight-proof-requests")
                        .param("scope", "requested"))
                .andExpect(status().isUnauthorized())
                .andExpect(header().string("Cache-Control", "no-store"));

        mockMvc.perform(get("/midnight-proof-requests/{requestId}", request.requestId())
                        .header("Authorization", "Bearer " + outsider.token))
                .andExpect(status().isNotFound())
                .andExpect(header().string("Cache-Control", "no-store"))
                .andExpect(jsonPath("$.code").value("MIDNIGHT_PROOF_REQUEST_NOT_FOUND"));

        mockMvc.perform(get("/midnight-proof-requests")
                        .header("Authorization", "Bearer " + fixture.funder.token)
                        .param("scope", "requested"))
                .andExpect(status().isOk())
                .andExpect(header().string("Cache-Control", "no-store"))
                .andExpect(header().string("Pragma", "no-cache"))
                .andExpect(jsonPath("$[0].proofCapability").doesNotExist());

        mockMvc.perform(post("/midnight-proof-requests/{requestId}/deny", request.requestId())
                        .header("Authorization", "Bearer " + fixture.seller.token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("INVALID_REQUEST_BODY"));

        Map<String, Object> invalidComplete = new LinkedHashMap<>();
        invalidComplete.put("proofCapability", capabilityMap(request, "7"));
        invalidComplete.put("signature", "must-not-be-accepted");
        mockMvc.perform(post("/midnight-proof-requests/{requestId}/complete", request.requestId())
                        .header("Authorization", "Bearer " + fixture.seller.token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsBytes(invalidComplete)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("INVALID_REQUEST_BODY"));

        Map<String, Object> withUnknown = new LinkedHashMap<>();
        withUnknown.put("subjectRole", "BUYER");
        withUnknown.put("minAnnualRevenueKrw", "1");
        withUnknown.put("maxDebtRatioBps", "2");
        withUnknown.put("maxOverdueCount", "3");
        withUnknown.put("validForSeconds", 600);
        withUnknown.put("rawFinance", "must-not-be-accepted");
        mockMvc.perform(post("/receivables/{receivableId}/midnight-proof-requests", fixture.receivableId)
                        .header("Authorization", "Bearer " + fixture.funder.token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsBytes(withUnknown)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("INVALID_REQUEST_BODY"));
    }

    private MidnightProofRequestResponse createSellerRequest(Fixture fixture) {
        return service.create(fixture.funder.email, fixture.receivableId, createRequest("SELLER"));
    }

    private MidnightProofRequestCreateRequest createRequest(String role) {
        return new MidnightProofRequestCreateRequest(role, "500000000", "20000", "1", 600L);
    }

    private JsonNode capability(MidnightProofRequestResponse request, String marker) {
        return objectMapper.readTree(objectMapper.writeValueAsBytes(capabilityMap(request, marker)));
    }

    private Map<String, Object> capabilityMap(MidnightProofRequestResponse request, String marker) {
        Map<String, Object> value = new LinkedHashMap<>();
        value.put("version", 2);
        value.put("evaluationVersion", 2);
        value.put("midnightContractAddress", properties.getContractAddress());
        value.put("companyCommitment", "0x" + marker.repeat(64));
        value.put("lookupKey", "0x" + "f".repeat(64));
        value.put("policyRequestHash", "0x" + "9".repeat(64));
        value.put("giwaChainId", "91342");
        value.put("receivableFinanceAddress", "0x0f264334f98ba0d22f7fc6bb901a5fa36158a315");
        value.put("onchainReceivableId", request.onchainReceivableId());
        value.put("subjectRole", request.subjectRole());
        value.put("partyWallet", request.partyWallet());
        value.put("requestId", request.requestId());
        value.put("intendedFunderWallet", request.intendedFunderWallet());
        value.put("minAnnualRevenueKrw", request.minAnnualRevenueKrw());
        value.put("maxDebtRatioBps", request.maxDebtRatioBps());
        value.put("maxOverdueCount", request.maxOverdueCount());
        value.put("profileAsOf", Long.toString(Instant.now().getEpochSecond()));
        value.put("validUntil", request.validUntil());
        return value;
    }

    private Fixture fixture() {
        Actor seller = signup("seller");
        Actor buyer = signup("buyer");
        Actor funder = signup("funder");
        connect(seller);
        connect(buyer);
        connect(funder);

        String txHash = hash("c", IDS.incrementAndGet());
        String verifyTxHash = hash("a", IDS.incrementAndGet());
        String tokenizeTxHash = hash("b", IDS.incrementAndGet());
        jdbcTemplate.update("""
                INSERT INTO receivables (
                    seller_company_id, buyer_company_id,
                    seller_wallet_address, buyer_wallet_address,
                    currency_code, face_value, funding_amount,
                    issue_date, maturity_date, status,
                    onchain_receivable_id, token_id, contract_address,
                    create_tx_hash, verify_tx_hash, tokenize_tx_hash, created_by
                ) VALUES (?, ?, ?, ?, 'KRW', 1000000, 900000, ?, ?, 'TOKENIZED', ?, ?, ?, ?, ?, ?, ?)
                """,
                seller.user.companyId(), buyer.user.companyId(), seller.wallet, buyer.wallet,
                LocalDate.now(), LocalDate.now().plusMonths(1),
                IDS.incrementAndGet() + 1L, IDS.incrementAndGet() + 1L,
                "0x0f264334f98ba0d22f7fc6bb901a5fa36158a315",
                txHash,
                verifyTxHash,
                tokenizeTxHash,
                seller.user.userId()
        );
        Long receivableId = jdbcTemplate.queryForObject(
                "SELECT receivable_id FROM receivables WHERE create_tx_hash = ?", Long.class, txHash
        );
        return new Fixture(seller, buyer, funder, receivableId);
    }

    private Actor signup(String prefix) {
        int id = IDS.incrementAndGet();
        String email = prefix + "-midnight-" + id + "@example.com";
        AuthResponse auth = authService.signup(new SignupRequest(
                email, "password123", prefix, prefix + " company " + id,
                String.format("%010d", id)
        ));
        User user = userMapper.findByEmail(email).orElseThrow();
        return new Actor(email, auth.accessToken(), user, null);
    }

    private void connect(Actor actor) {
        String wallet = "0x" + String.format("%040x", actor.user.userId());
        walletService.connect(actor.email, new WalletConnectRequest(wallet, 91342L));
        actor.wallet = wallet;
    }

    private String hash(String prefix, int id) {
        return "0x" + prefix.repeat(56) + String.format("%08x", id);
    }

    private Integer activeMarkerCount(String requestId) {
        return jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM midnight_proof_requests WHERE request_id = ? AND active_marker IS NOT NULL",
                Integer.class,
                requestId
        );
    }

    private static final class Actor {
        private final String email;
        private final String token;
        private final User user;
        private String wallet;

        private Actor(String email, String token, User user, String wallet) {
            this.email = email;
            this.token = token;
            this.user = user;
            this.wallet = wallet;
        }
    }

    private record Fixture(Actor seller, Actor buyer, Actor funder, Long receivableId) {}
}
