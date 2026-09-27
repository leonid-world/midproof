package com.leonid.giwaapi.midnight;

import org.springframework.stereotype.Component;

import javax.crypto.AEADBadTagException;
import javax.crypto.Cipher;
import javax.crypto.Mac;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.security.GeneralSecurityException;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.util.Base64;
import java.util.HexFormat;

@Component
class MidnightCapabilityCrypto {
    static final int KEY_VERSION = 1;
    private static final int IV_BYTES = 12;
    private static final int TAG_BITS = 128;
    private static final byte[] FINGERPRINT_LABEL =
            "gasok-midnight-capability-fingerprint-v1".getBytes(StandardCharsets.UTF_8);

    private final byte[] encryptionKey;
    private final byte[] fingerprintKey;
    private final SecureRandom secureRandom = new SecureRandom();

    MidnightCapabilityCrypto(MidnightProofProperties properties) {
        this.encryptionKey = parseKey(properties.getCapabilityEncryptionKey());
        this.fingerprintKey = encryptionKey == null ? null : hmac(encryptionKey, FINGERPRINT_LABEL);
    }

    void ensureAvailable() {
        requireConfigured();
    }

    Envelope encrypt(byte[] plaintext, MidnightProofRequestRecord request) {
        requireConfigured();
        if (plaintext == null || plaintext.length == 0 || plaintext.length > 16384) throw unavailable();
        try {
            byte[] iv = new byte[IV_BYTES];
            secureRandom.nextBytes(iv);
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.ENCRYPT_MODE, new SecretKeySpec(encryptionKey, "AES"),
                    new GCMParameterSpec(TAG_BITS, iv));
            cipher.updateAAD(aad(request));
            return new Envelope(
                    KEY_VERSION,
                    iv,
                    cipher.doFinal(plaintext),
                    fingerprint(plaintext)
            );
        } catch (GeneralSecurityException exception) {
            throw unavailable();
        }
    }

    byte[] decrypt(MidnightProofRequestRecord request) {
        requireConfigured();
        if (request.getEncryptionKeyVersion() == null || request.getEncryptionKeyVersion() != KEY_VERSION
                || request.getCapabilityIv() == null || request.getCapabilityIv().length != IV_BYTES
                || request.getCapabilityCiphertext() == null || request.getCapabilityFingerprint() == null) {
            throw unavailable();
        }
        try {
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.DECRYPT_MODE, new SecretKeySpec(encryptionKey, "AES"),
                    new GCMParameterSpec(TAG_BITS, request.getCapabilityIv()));
            cipher.updateAAD(aad(request));
            byte[] plaintext = cipher.doFinal(request.getCapabilityCiphertext());
            if (!MessageDigest.isEqual(fingerprint(plaintext), request.getCapabilityFingerprint())) {
                throw unavailable();
            }
            return plaintext;
        } catch (AEADBadTagException exception) {
            throw unavailable();
        } catch (GeneralSecurityException exception) {
            throw unavailable();
        }
    }

    byte[] fingerprint(byte[] canonicalCapability) {
        requireConfigured();
        return hmac(fingerprintKey, canonicalCapability);
    }

    boolean sameFingerprint(byte[] left, byte[] right) {
        return left != null && right != null && MessageDigest.isEqual(left, right);
    }

    private byte[] aad(MidnightProofRequestRecord request) {
        String value = String.join("|",
                "gasok-midnight-capability",
                Integer.toString(KEY_VERSION),
                request.getRequestId(),
                request.getReceivableId().toString(),
                request.getRequesterCompanyId().toString(),
                request.getRequesterWalletAddress(),
                request.getSubjectCompanyId().toString(),
                request.getSubjectRole(),
                request.getSubjectWalletAddress(),
                request.getValidUntil().toString()
        );
        return value.getBytes(StandardCharsets.UTF_8);
    }

    private void requireConfigured() {
        if (encryptionKey == null || fingerprintKey == null) throw unavailable();
    }

    private static byte[] parseKey(String configured) {
        if (configured == null || configured.isBlank()) return null;
        String value = configured.trim();
        try {
            byte[] decoded;
            String hex = value.startsWith("0x") ? value.substring(2) : value;
            if (hex.matches("^[0-9a-fA-F]{64}$")) {
                decoded = HexFormat.of().parseHex(hex);
            } else {
                decoded = Base64.getDecoder().decode(value);
            }
            return decoded.length == 32 ? decoded : null;
        } catch (IllegalArgumentException exception) {
            return null;
        }
    }

    private static byte[] hmac(byte[] key, byte[] value) {
        try {
            Mac mac = Mac.getInstance("HmacSHA256");
            mac.init(new SecretKeySpec(key, "HmacSHA256"));
            return mac.doFinal(value);
        } catch (GeneralSecurityException exception) {
            throw new IllegalStateException("Required HMAC algorithm is unavailable", exception);
        }
    }

    private MidnightCapabilityCryptoException unavailable() {
        return new MidnightCapabilityCryptoException();
    }

    record Envelope(int keyVersion, byte[] iv, byte[] ciphertext, byte[] fingerprint) {}
}

final class MidnightCapabilityCryptoException extends RuntimeException {
    MidnightCapabilityCryptoException() {
        super("Midnight capability encryption is unavailable");
    }
}
