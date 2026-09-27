package com.leonid.giwaapi.midnight;

import java.math.BigDecimal;
import java.time.LocalDateTime;

public class MidnightProofRequestRecord {
    private String requestId;
    private Long receivableId;
    private Long requesterCompanyId;
    private String requesterCompanyName;
    private String requesterWalletAddress;
    private Long subjectCompanyId;
    private String subjectCompanyName;
    private String subjectRole;
    private String subjectWalletAddress;
    private String midnightContractAddress;
    private Long giwaChainId;
    private String receivableFinanceAddress;
    private Long onchainReceivableId;
    private BigDecimal minAnnualRevenueKrw;
    private BigDecimal maxDebtRatioBps;
    private BigDecimal maxOverdueCount;
    private Long validUntil;
    private String requestStatus;
    private Integer encryptionKeyVersion;
    private byte[] capabilityCiphertext;
    private byte[] capabilityIv;
    private byte[] capabilityFingerprint;
    private LocalDateTime submittedAt;
    private LocalDateTime completedAt;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;

    public MidnightProofRequestRecord() {}

    public String getRequestId() { return requestId; }
    public void setRequestId(String requestId) { this.requestId = requestId; }
    public Long getReceivableId() { return receivableId; }
    public void setReceivableId(Long receivableId) { this.receivableId = receivableId; }
    public Long getRequesterCompanyId() { return requesterCompanyId; }
    public void setRequesterCompanyId(Long requesterCompanyId) { this.requesterCompanyId = requesterCompanyId; }
    public String getRequesterCompanyName() { return requesterCompanyName; }
    public void setRequesterCompanyName(String requesterCompanyName) { this.requesterCompanyName = requesterCompanyName; }
    public String getRequesterWalletAddress() { return requesterWalletAddress; }
    public void setRequesterWalletAddress(String requesterWalletAddress) { this.requesterWalletAddress = requesterWalletAddress; }
    public Long getSubjectCompanyId() { return subjectCompanyId; }
    public void setSubjectCompanyId(Long subjectCompanyId) { this.subjectCompanyId = subjectCompanyId; }
    public String getSubjectCompanyName() { return subjectCompanyName; }
    public void setSubjectCompanyName(String subjectCompanyName) { this.subjectCompanyName = subjectCompanyName; }
    public String getSubjectRole() { return subjectRole; }
    public void setSubjectRole(String subjectRole) { this.subjectRole = subjectRole; }
    public String getSubjectWalletAddress() { return subjectWalletAddress; }
    public void setSubjectWalletAddress(String subjectWalletAddress) { this.subjectWalletAddress = subjectWalletAddress; }
    public String getMidnightContractAddress() { return midnightContractAddress; }
    public void setMidnightContractAddress(String midnightContractAddress) { this.midnightContractAddress = midnightContractAddress; }
    public Long getGiwaChainId() { return giwaChainId; }
    public void setGiwaChainId(Long giwaChainId) { this.giwaChainId = giwaChainId; }
    public String getReceivableFinanceAddress() { return receivableFinanceAddress; }
    public void setReceivableFinanceAddress(String receivableFinanceAddress) { this.receivableFinanceAddress = receivableFinanceAddress; }
    public Long getOnchainReceivableId() { return onchainReceivableId; }
    public void setOnchainReceivableId(Long onchainReceivableId) { this.onchainReceivableId = onchainReceivableId; }
    public BigDecimal getMinAnnualRevenueKrw() { return minAnnualRevenueKrw; }
    public void setMinAnnualRevenueKrw(BigDecimal minAnnualRevenueKrw) { this.minAnnualRevenueKrw = minAnnualRevenueKrw; }
    public BigDecimal getMaxDebtRatioBps() { return maxDebtRatioBps; }
    public void setMaxDebtRatioBps(BigDecimal maxDebtRatioBps) { this.maxDebtRatioBps = maxDebtRatioBps; }
    public BigDecimal getMaxOverdueCount() { return maxOverdueCount; }
    public void setMaxOverdueCount(BigDecimal maxOverdueCount) { this.maxOverdueCount = maxOverdueCount; }
    public Long getValidUntil() { return validUntil; }
    public void setValidUntil(Long validUntil) { this.validUntil = validUntil; }
    public String getRequestStatus() { return requestStatus; }
    public void setRequestStatus(String requestStatus) { this.requestStatus = requestStatus; }
    public Integer getEncryptionKeyVersion() { return encryptionKeyVersion; }
    public void setEncryptionKeyVersion(Integer encryptionKeyVersion) { this.encryptionKeyVersion = encryptionKeyVersion; }
    public byte[] getCapabilityCiphertext() { return capabilityCiphertext; }
    public void setCapabilityCiphertext(byte[] capabilityCiphertext) { this.capabilityCiphertext = capabilityCiphertext; }
    public byte[] getCapabilityIv() { return capabilityIv; }
    public void setCapabilityIv(byte[] capabilityIv) { this.capabilityIv = capabilityIv; }
    public byte[] getCapabilityFingerprint() { return capabilityFingerprint; }
    public void setCapabilityFingerprint(byte[] capabilityFingerprint) { this.capabilityFingerprint = capabilityFingerprint; }
    public LocalDateTime getSubmittedAt() { return submittedAt; }
    public void setSubmittedAt(LocalDateTime submittedAt) { this.submittedAt = submittedAt; }
    public LocalDateTime getCompletedAt() { return completedAt; }
    public void setCompletedAt(LocalDateTime completedAt) { this.completedAt = completedAt; }
    public LocalDateTime getCreatedAt() { return createdAt; }
    public void setCreatedAt(LocalDateTime createdAt) { this.createdAt = createdAt; }
    public LocalDateTime getUpdatedAt() { return updatedAt; }
    public void setUpdatedAt(LocalDateTime updatedAt) { this.updatedAt = updatedAt; }
}
