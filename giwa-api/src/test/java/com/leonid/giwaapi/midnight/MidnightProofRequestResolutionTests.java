package com.leonid.giwaapi.midnight;

import com.leonid.giwaapi.auth.User;
import com.leonid.giwaapi.auth.UserMapper;
import com.leonid.giwaapi.common.error.ApiException;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.ObjectMapper;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.Optional;
import java.util.concurrent.atomic.AtomicLong;
import java.util.concurrent.atomic.AtomicReference;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.CALLS_REAL_METHODS;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.mockStatic;
import static org.mockito.Mockito.when;

class MidnightProofRequestResolutionTests {
    private static final long EXPIRES = 1_800_000_300L;
    private static final String EMAIL = "funder@fixture.invalid";
    private final AtomicLong now = new AtomicLong(EXPIRES - 1);
    private final AtomicReference<MidnightProofRequestRecord> current = new AtomicReference<>();
    private final ObjectMapper objectMapper = new ObjectMapper();
    private final UserMapper users = mock(UserMapper.class);
    private final MidnightProofRequestMapper requests = mock(MidnightProofRequestMapper.class);
    private final MidnightReadClient reader = mock(MidnightReadClient.class);
    private final MidnightCapabilityV2 capability = new MidnightCapabilityV2(
            2, 2, "1".repeat(64), "0x" + "2".repeat(64), "0x" + "3".repeat(64),
            "0x" + "4".repeat(64), "91342", "0x" + "5".repeat(40), "2", "SELLER",
            "0x" + "6".repeat(40), "0x" + "7".repeat(64), "0x" + "8".repeat(40),
            "500000000", "20000", "1", Long.toString(EXPIRES - 300), Long.toString(EXPIRES)
    );
    private MidnightCapabilityCrypto crypto;
    private MidnightProofRequestService service;

    @BeforeEach
    void setUp() {
        MidnightProofProperties properties = new MidnightProofProperties();
        properties.setCapabilityEncryptionKey("ab".repeat(32));
        crypto = new MidnightCapabilityCrypto(properties);
        service = new MidnightProofRequestService(users, null, null, requests, properties,
                null, crypto, reader, objectMapper);
        when(users.findByEmail(EMAIL)).thenReturn(Optional.of(
                new User(100L, 10L, EMAIL, "unused", "Fixture", null)));
        when(requests.expireStale(anyLong())).thenAnswer(invocation -> {
            if (invocation.<Long>getArgument(0) >= EXPIRES) {
                current.set(record("EXPIRED"));
                return 1;
            }
            return 0;
        });
        when(requests.findVisibleById(capability.requestId(), 10L))
                .thenAnswer(invocation -> Optional.of(current.get()));
        when(requests.findById(capability.requestId()))
                .thenAnswer(invocation -> Optional.of(current.get()));
        when(requests.markCompleted(anyString(), anyLong(), anyLong())).thenAnswer(invocation -> {
            if (current.get().getRequestStatus().equals("SUBMITTED")
                    && invocation.<Long>getArgument(2) < EXPIRES) {
                current.set(record("COMPLETED"));
                return 1;
            }
            return 0;
        });
        when(reader.resolve(any(byte[].class), any(MidnightCapabilityV2.class)))
                .thenReturn(result(false));
    }

    @Test
    void alreadyCompletedResultCannotBeReturnedAfterTheReadCrossesExpiry() {
        current.set(record("COMPLETED"));
        when(reader.resolve(any(byte[].class), any(MidnightCapabilityV2.class))).thenAnswer(invocation -> {
            now.set(EXPIRES);
            return result(true);
        });
        assertExpiredResolution();
    }

    @Test
    void firstCompletionStillRejectsAndPurgesWhenTheReadCrossesExpiry() {
        current.set(record("SUBMITTED"));
        when(reader.resolve(any(byte[].class), any(MidnightCapabilityV2.class))).thenAnswer(invocation -> {
            now.set(EXPIRES);
            return result(false);
        });
        assertExpiredResolution();
    }

    @Test
    void concurrentCompletedFallbackCannotReturnAfterExpiry() {
        current.set(record("SUBMITTED"));
        doAnswer(invocation -> {
            current.set(record("COMPLETED"));
            now.set(EXPIRES);
            return 0;
        }).when(requests).markCompleted(anyString(), anyLong(), anyLong());
        assertExpiredResolution();
    }

    @Test
    void expiryImmediatelyAfterSuccessfulCompletionCasIsAlsoRejected() {
        current.set(record("SUBMITTED"));
        doAnswer(invocation -> {
            current.set(record("COMPLETED"));
            now.set(EXPIRES);
            return 1;
        }).when(requests).markCompleted(anyString(), anyLong(), anyLong());
        assertExpiredResolution();
    }

    @Test
    void aConcurrentFailureCannotBeReplacedWithTheEarlierReadResult() {
        current.set(record("SUBMITTED"));
        when(reader.resolve(any(byte[].class), any(MidnightCapabilityV2.class))).thenAnswer(invocation -> {
            current.set(record("FAILED"));
            return result(true);
        });
        withClock(() -> assertThatThrownBy(this::resolve)
                .isInstanceOfSatisfying(ApiException.class,
                        error -> assertThat(error.getCode()).isEqualTo("MIDNIGHT_PROOF_REQUEST_STATE_CONFLICT")));
        assertThat(current.get().getRequestStatus()).isEqualTo("FAILED");
    }

    @Test
    void aValidConcurrentCompletionAndAnAlreadyCompletedRetryPreserveFalseResults() {
        current.set(record("SUBMITTED"));
        when(reader.resolve(any(byte[].class), any(MidnightCapabilityV2.class))).thenAnswer(invocation -> {
            current.set(record("COMPLETED"));
            return result(false);
        });
        withClock(() -> {
            MidnightProofResolveResponse first = resolve();
            MidnightProofResolveResponse retried = resolve();
            assertThat(first.status()).isEqualTo("COMPLETED");
            assertThat(first.result().eligible()).isFalse();
            assertThat(retried).isEqualTo(first);
        });
    }

    @Test
    void aChangedStoredCapabilityCannotUseAnEarlierCompletedRead() {
        current.set(record("COMPLETED"));
        when(reader.resolve(any(byte[].class), any(MidnightCapabilityV2.class))).thenAnswer(invocation -> {
            MidnightProofRequestRecord changed = record("COMPLETED");
            changed.setCapabilityFingerprint(new byte[32]);
            current.set(changed);
            return result(true);
        });
        withClock(() -> assertThatThrownBy(this::resolve)
                .isInstanceOfSatisfying(ApiException.class,
                        error -> assertThat(error.getCode()).isEqualTo("MIDNIGHT_PROOF_REQUEST_STATE_CONFLICT")));
    }

    private void assertExpiredResolution() {
        withClock(() -> assertThatThrownBy(this::resolve)
                .isInstanceOfSatisfying(ApiException.class,
                        error -> assertThat(error.getCode()).isEqualTo("MIDNIGHT_PROOF_REQUEST_STATE_CONFLICT")));
        assertThat(current.get().getRequestStatus()).isEqualTo("EXPIRED");
        assertThat(current.get().getCapabilityCiphertext()).isNull();
    }

    private void withClock(Runnable assertion) {
        try (var clock = mockStatic(Instant.class, CALLS_REAL_METHODS)) {
            clock.when(Instant::now).thenAnswer(invocation -> Instant.ofEpochSecond(now.get()));
            assertion.run();
        }
    }

    private MidnightProofResolveResponse resolve() {
        return service.resolve(EMAIL, capability.requestId());
    }

    private MidnightReadResult result(boolean eligible) {
        return new MidnightReadResult(eligible, "2", 2, capability.profileAsOf(), capability.validUntil());
    }

    private MidnightProofRequestRecord record(String status) {
        MidnightProofRequestRecord value = new MidnightProofRequestRecord();
        value.setRequestId(capability.requestId());
        value.setReceivableId(1L);
        value.setRequesterCompanyId(10L);
        value.setSubjectCompanyId(20L);
        value.setRequesterWalletAddress(capability.intendedFunderWallet());
        value.setSubjectWalletAddress(capability.partyWallet());
        value.setMidnightContractAddress(capability.midnightContractAddress());
        value.setGiwaChainId(91342L);
        value.setReceivableFinanceAddress(capability.receivableFinanceAddress());
        value.setOnchainReceivableId(2L);
        value.setSubjectRole(capability.subjectRole());
        value.setMinAnnualRevenueKrw(new BigDecimal(capability.minAnnualRevenueKrw()));
        value.setMaxDebtRatioBps(new BigDecimal(capability.maxDebtRatioBps()));
        value.setMaxOverdueCount(new BigDecimal(capability.maxOverdueCount()));
        value.setValidUntil(EXPIRES);
        value.setRequestStatus(status);
        if (status.equals("SUBMITTED") || status.equals("COMPLETED")) {
            MidnightCapabilityCrypto.Envelope envelope = crypto.encrypt(capability.canonicalBytes(objectMapper), value);
            value.setEncryptionKeyVersion(envelope.keyVersion());
            value.setCapabilityCiphertext(envelope.ciphertext());
            value.setCapabilityIv(envelope.iv());
            value.setCapabilityFingerprint(envelope.fingerprint());
        }
        return value;
    }
}
