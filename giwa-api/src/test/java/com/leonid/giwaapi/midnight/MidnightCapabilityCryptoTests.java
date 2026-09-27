package com.leonid.giwaapi.midnight;

import org.junit.jupiter.api.Test;

import java.nio.charset.StandardCharsets;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class MidnightCapabilityCryptoTests {

    @Test
    void encryptsWithAadAndDecryptsOnlyForTheSameRequestContext() {
        MidnightCapabilityCrypto crypto = crypto("000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f");
        MidnightProofRequestRecord request = request("0x" + "1".repeat(64), 10L);
        byte[] plaintext = "correlation-sensitive-capability".getBytes(StandardCharsets.UTF_8);

        MidnightCapabilityCrypto.Envelope envelope = crypto.encrypt(plaintext, request);
        request.setEncryptionKeyVersion(envelope.keyVersion());
        request.setCapabilityIv(envelope.iv());
        request.setCapabilityCiphertext(envelope.ciphertext());
        request.setCapabilityFingerprint(envelope.fingerprint());

        assertThat(crypto.decrypt(request)).isEqualTo(plaintext);
        assertThat(envelope.ciphertext()).isNotEqualTo(plaintext);

        request.setReceivableId(11L);
        assertThatThrownBy(() -> crypto.decrypt(request))
                .isInstanceOf(MidnightCapabilityCryptoException.class)
                .hasMessageNotContaining("correlation-sensitive-capability");
    }

    @Test
    void detectsCiphertextAndFingerprintTampering() {
        MidnightCapabilityCrypto crypto = crypto("AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=");
        MidnightProofRequestRecord request = request("0x" + "2".repeat(64), 12L);
        byte[] plaintext = "capability-two".getBytes(StandardCharsets.UTF_8);
        MidnightCapabilityCrypto.Envelope envelope = crypto.encrypt(plaintext, request);
        byte[] ciphertext = envelope.ciphertext().clone();
        ciphertext[0] ^= 1;
        request.setEncryptionKeyVersion(1);
        request.setCapabilityIv(envelope.iv());
        request.setCapabilityCiphertext(ciphertext);
        request.setCapabilityFingerprint(envelope.fingerprint());

        assertThatThrownBy(() -> crypto.decrypt(request))
                .isInstanceOf(MidnightCapabilityCryptoException.class);
    }

    @Test
    void missingOrMalformedKeyFailsOnlyWhenProofStorageIsUsed() {
        MidnightProofProperties missing = new MidnightProofProperties();
        MidnightCapabilityCrypto missingCrypto = new MidnightCapabilityCrypto(missing);
        assertThatThrownBy(missingCrypto::ensureAvailable)
                .isInstanceOf(MidnightCapabilityCryptoException.class);

        MidnightProofProperties malformed = new MidnightProofProperties();
        malformed.setCapabilityEncryptionKey("not-a-32-byte-key");
        MidnightCapabilityCrypto malformedCrypto = new MidnightCapabilityCrypto(malformed);
        assertThatThrownBy(malformedCrypto::ensureAvailable)
                .isInstanceOf(MidnightCapabilityCryptoException.class);
    }

    @Test
    void keyedFingerprintIsStableWithoutBeingRawSha256() throws Exception {
        MidnightCapabilityCrypto crypto = crypto("ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff");
        byte[] capability = "same-capability".getBytes(StandardCharsets.UTF_8);

        byte[] fingerprint = crypto.fingerprint(capability);
        byte[] rawSha256 = java.security.MessageDigest.getInstance("SHA-256").digest(capability);

        assertThat(crypto.fingerprint(capability)).isEqualTo(fingerprint);
        assertThat(fingerprint).isNotEqualTo(rawSha256);
    }

    private MidnightCapabilityCrypto crypto(String key) {
        MidnightProofProperties properties = new MidnightProofProperties();
        properties.setCapabilityEncryptionKey(key);
        return new MidnightCapabilityCrypto(properties);
    }

    private MidnightProofRequestRecord request(String requestId, Long receivableId) {
        MidnightProofRequestRecord request = new MidnightProofRequestRecord();
        request.setRequestId(requestId);
        request.setReceivableId(receivableId);
        request.setRequesterCompanyId(20L);
        request.setRequesterWalletAddress("0x" + "3".repeat(40));
        request.setSubjectCompanyId(30L);
        request.setSubjectRole("SELLER");
        request.setSubjectWalletAddress("0x" + "4".repeat(40));
        request.setValidUntil(2000000000L);
        return request;
    }
}
