package com.leonid.giwaapi.midnight;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.SecureRandom;
import java.util.HexFormat;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

@Component
@ConfigurationProperties(prefix = "app.midnight")
public class MidnightProofProperties {

    private String readApiUrl = "http://127.0.0.1:4100";
    private String contractAddress = "12caaf76aef1de1c584b67462018810f6e4e7eb2535e136f560cb621e24a3f36";
    private String capabilityEncryptionKey = "";
    private String networkId = "undeployed";
    private boolean demoEnabled;
    private String demoStateDir = "";
    private String deploymentManifest = "";
    private String internalToken = "";
    private String generatedInternalToken;
    private long readTimeoutMs = 10000L;
    private long minValidForSeconds = 300L;
    private long maxValidForSeconds = 86400L;

    public String getReadApiUrl() { return readApiUrl; }
    public void setReadApiUrl(String readApiUrl) { this.readApiUrl = readApiUrl; }
    public String getContractAddress() {
        if (!deploymentManifest.isBlank()) {
            try {
                Path manifest = deploymentManifest.equals("auto")
                        ? stateDirectory().resolve("deployment.json") : Path.of(deploymentManifest);
                if (!Files.isRegularFile(manifest) || Files.size(manifest) > 8192) return "";
                JsonNode value = new ObjectMapper().readTree(Files.readAllBytes(manifest));
                if (value == null || !value.isObject()
                        || !value.path("networkId").asString("").equals(networkId)
                        || !value.path("contractAddress").isString()) return "";
                return value.get("contractAddress").asString();
            } catch (IOException | RuntimeException exception) {
                return "";
            }
        }
        // A fresh Preview deployment must never reuse the disposable local address.
        if (networkId.equals("preview") && contractAddress.equals(
                "12caaf76aef1de1c584b67462018810f6e4e7eb2535e136f560cb621e24a3f36")) return "";
        return contractAddress;
    }
    public void setContractAddress(String contractAddress) { this.contractAddress = contractAddress; }
    public synchronized String getCapabilityEncryptionKey() {
        if (demoEnabled && capabilityEncryptionKey.isBlank()) {
            capabilityEncryptionKey = MidnightDemoKeyFile.loadOrCreate(stateDirectory().resolve("spring-capability.key"));
        }
        return capabilityEncryptionKey;
    }
    public void setCapabilityEncryptionKey(String capabilityEncryptionKey) { this.capabilityEncryptionKey = capabilityEncryptionKey; }
    public String getNetworkId() { return networkId; }
    public void setNetworkId(String networkId) {
        if (!"undeployed".equals(networkId) && !"preview".equals(networkId)) {
            throw new IllegalArgumentException("Only undeployed and preview Midnight networks are supported.");
        }
        this.networkId = networkId;
    }
    public boolean isDemoEnabled() { return demoEnabled; }
    public void setDemoEnabled(boolean demoEnabled) { this.demoEnabled = demoEnabled; }
    public String getDemoStateDir() { return demoStateDir; }
    public void setDemoStateDir(String demoStateDir) { this.demoStateDir = demoStateDir; }
    public String getDeploymentManifest() { return deploymentManifest; }
    public void setDeploymentManifest(String deploymentManifest) { this.deploymentManifest = deploymentManifest; }
    public Path stateDirectory() { return MidnightDemoPaths.stateDirectory(demoStateDir); }
    public synchronized String getInternalToken() {
        if (!demoEnabled) return "";
        if (!internalToken.isBlank()) return internalToken;
        if (generatedInternalToken == null) {
            byte[] bytes = new byte[32];
            new SecureRandom().nextBytes(bytes);
            generatedInternalToken = HexFormat.of().formatHex(bytes);
        }
        return generatedInternalToken;
    }
    public void setInternalToken(String internalToken) {
        if (internalToken != null && !internalToken.isBlank() && internalToken.length() < 32) {
            throw new IllegalArgumentException("The internal Midnight token must contain at least 32 characters.");
        }
        this.internalToken = internalToken == null ? "" : internalToken;
    }
    public long getReadTimeoutMs() { return readTimeoutMs; }
    public void setReadTimeoutMs(long readTimeoutMs) { this.readTimeoutMs = readTimeoutMs; }
    public long getMinValidForSeconds() { return minValidForSeconds; }
    public void setMinValidForSeconds(long minValidForSeconds) { this.minValidForSeconds = minValidForSeconds; }
    public long getMaxValidForSeconds() { return maxValidForSeconds; }
    public void setMaxValidForSeconds(long maxValidForSeconds) { this.maxValidForSeconds = maxValidForSeconds; }
}
