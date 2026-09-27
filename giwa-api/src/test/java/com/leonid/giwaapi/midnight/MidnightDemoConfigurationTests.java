package com.leonid.giwaapi.midnight;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.attribute.PosixFilePermissions;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class MidnightDemoConfigurationTests {
    @TempDir Path directory;

    @Test
    void stableKeySurvivesRestartAndInvalidExistingMaterialIsNeverOverwritten() throws Exception {
        Path key = directory.resolve("state/spring-capability.key");
        String first = MidnightDemoKeyFile.loadOrCreate(key);
        assertThat(first).matches("^[0-9a-f]{64}$");
        assertThat(MidnightDemoKeyFile.loadOrCreate(key)).isEqualTo(first);
        assertThat(Files.getPosixFilePermissions(key))
                .isEqualTo(PosixFilePermissions.fromString("rw-------"));
        Files.writeString(key, "invalid-existing-key");
        assertThatThrownBy(() -> MidnightDemoKeyFile.loadOrCreate(key)).isInstanceOf(IllegalStateException.class);
        assertThat(Files.readString(key)).isEqualTo("invalid-existing-key");
    }

    @Test
    void previewAddressBecomesAvailableOnlyFromTheMatchingBootstrapManifest() throws Exception {
        MidnightProofProperties properties = new MidnightProofProperties();
        properties.setNetworkId("preview");
        assertThat(properties.getContractAddress()).isEmpty();
        Path manifest = directory.resolve("deployment.json");
        properties.setDeploymentManifest(manifest.toString());
        assertThat(properties.getContractAddress()).isEmpty();
        Files.writeString(manifest, "{\"networkId\":\"undeployed\",\"contractAddress\":\"" + "1".repeat(64) + "\"}");
        assertThat(properties.getContractAddress()).isEmpty();
        Files.writeString(manifest, "{\"networkId\":\"preview\",\"contractAddress\":\"" + "2".repeat(64) + "\"}");
        assertThat(properties.getContractAddress()).isEqualTo("2".repeat(64));
        assertThatThrownBy(() -> properties.setNetworkId("preprod")).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> properties.setNetworkId("mainnet")).isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void configuredEncryptionKeyTakesPrecedenceAndInternalTokenNeverRotatesWithinAProcess() {
        MidnightProofProperties properties = new MidnightProofProperties();
        properties.setDemoEnabled(true);
        properties.setDemoStateDir(directory.toString());
        properties.setCapabilityEncryptionKey("a".repeat(64));
        assertThat(properties.getCapabilityEncryptionKey()).isEqualTo("a".repeat(64));
        assertThat(Files.exists(directory.resolve("spring-capability.key"))).isFalse();
        String token = properties.getInternalToken();
        assertThat(token).matches("^[0-9a-f]{64}$");
        assertThat(properties.getInternalToken()).isEqualTo(token);
    }
}
