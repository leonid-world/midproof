package com.leonid.giwaapi.midnight;

import org.apache.ibatis.annotations.Insert;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;
import org.apache.ibatis.annotations.Update;

import java.util.List;
import java.util.Optional;

@Mapper
public interface MidnightProofRequestMapper {

    String RESPONSE_SELECT = """
            SELECT p.request_id,
                   p.receivable_id,
                   p.requester_company_id,
                   requester.company_name AS requester_company_name,
                   p.requester_wallet_address,
                   p.subject_company_id,
                   subject.company_name AS subject_company_name,
                   p.subject_role,
                   p.subject_wallet_address,
                   p.midnight_contract_address,
                   p.giwa_chain_id,
                   p.receivable_finance_address,
                   p.onchain_receivable_id,
                   p.min_annual_revenue_krw,
                   p.max_debt_ratio_bps,
                   p.max_overdue_count,
                   p.valid_until,
                   p.request_status,
                   p.encryption_key_version,
                   p.capability_ciphertext,
                   p.capability_iv,
                   p.capability_fingerprint,
                   p.submitted_at,
                   p.completed_at,
                   p.created_at,
                   p.updated_at
              FROM midnight_proof_requests p
              JOIN companies requester ON requester.company_id = p.requester_company_id
              JOIN companies subject ON subject.company_id = p.subject_company_id
            """;

    @Insert("""
            INSERT INTO midnight_proof_requests (
                request_id, receivable_id,
                requester_company_id, requester_wallet_address,
                subject_company_id, subject_role, subject_wallet_address,
                midnight_contract_address, giwa_chain_id,
                receivable_finance_address, onchain_receivable_id,
                min_annual_revenue_krw, max_debt_ratio_bps, max_overdue_count,
                valid_until, request_status, active_marker
            ) VALUES (
                #{requestId}, #{receivableId},
                #{requesterCompanyId}, #{requesterWalletAddress},
                #{subjectCompanyId}, #{subjectRole}, #{subjectWalletAddress},
                #{midnightContractAddress}, #{giwaChainId},
                #{receivableFinanceAddress}, #{onchainReceivableId},
                #{minAnnualRevenueKrw}, #{maxDebtRatioBps}, #{maxOverdueCount},
                #{validUntil}, 'REQUESTED', 1
            )
            """)
    void insert(MidnightProofRequestRecord request);

    @Update("""
            UPDATE midnight_proof_requests
               SET request_status = 'EXPIRED',
                   active_marker = NULL,
                   capability_ciphertext = NULL,
                   capability_iv = NULL,
                   capability_fingerprint = NULL,
                   updated_at = CURRENT_TIMESTAMP
             WHERE request_status IN ('REQUESTED', 'SUBMITTED', 'COMPLETED')
               AND valid_until <= #{nowEpochSeconds}
            """)
    int expireStale(long nowEpochSeconds);

    @Select(RESPONSE_SELECT + """
            WHERE p.request_id = #{requestId}
              AND (
                    p.requester_company_id = #{companyId}
                 OR p.subject_company_id = #{companyId}
              )
            """)
    Optional<MidnightProofRequestRecord> findVisibleById(
            @Param("requestId") String requestId,
            @Param("companyId") Long companyId
    );

    @Select(RESPONSE_SELECT + """
            WHERE p.request_id = #{requestId}
            """)
    Optional<MidnightProofRequestRecord> findById(String requestId);

    @Select(RESPONSE_SELECT + """
            WHERE p.requester_company_id = #{companyId}
            ORDER BY p.created_at DESC, p.request_id DESC
            """)
    List<MidnightProofRequestRecord> findRequestedByCompany(Long companyId);

    @Select(RESPONSE_SELECT + """
            WHERE p.subject_company_id = #{companyId}
            ORDER BY p.created_at DESC, p.request_id DESC
            """)
    List<MidnightProofRequestRecord> findAssignedToCompany(Long companyId);

    @Update("""
            UPDATE midnight_proof_requests
               SET request_status = 'DENIED',
                   active_marker = NULL,
                   updated_at = CURRENT_TIMESTAMP
             WHERE request_id = #{requestId}
               AND subject_company_id = #{subjectCompanyId}
               AND request_status = 'REQUESTED'
               AND valid_until > #{nowEpochSeconds}
            """)
    int deny(
            @Param("requestId") String requestId,
            @Param("subjectCompanyId") Long subjectCompanyId,
            @Param("nowEpochSeconds") long nowEpochSeconds
    );

    @Update("""
            UPDATE midnight_proof_requests
               SET request_status = 'SUBMITTED',
                   encryption_key_version = #{keyVersion},
                   capability_ciphertext = #{ciphertext},
                   capability_iv = #{iv},
                   capability_fingerprint = #{fingerprint},
                   submitted_at = CURRENT_TIMESTAMP,
                   updated_at = CURRENT_TIMESTAMP
             WHERE request_id = #{requestId}
               AND subject_company_id = #{subjectCompanyId}
               AND request_status = 'REQUESTED'
               AND valid_until > #{nowEpochSeconds}
            """)
    int submit(
            @Param("requestId") String requestId,
            @Param("subjectCompanyId") Long subjectCompanyId,
            @Param("nowEpochSeconds") long nowEpochSeconds,
            @Param("keyVersion") int keyVersion,
            @Param("ciphertext") byte[] ciphertext,
            @Param("iv") byte[] iv,
            @Param("fingerprint") byte[] fingerprint
    );

    @Update("""
            UPDATE midnight_proof_requests
               SET request_status = 'COMPLETED',
                   completed_at = CURRENT_TIMESTAMP,
                   updated_at = CURRENT_TIMESTAMP
             WHERE request_id = #{requestId}
               AND requester_company_id = #{requesterCompanyId}
               AND request_status = 'SUBMITTED'
               AND valid_until > #{nowEpochSeconds}
            """)
    int markCompleted(
            @Param("requestId") String requestId,
            @Param("requesterCompanyId") Long requesterCompanyId,
            @Param("nowEpochSeconds") long nowEpochSeconds
    );

    @Update("""
            UPDATE midnight_proof_requests
               SET request_status = 'FAILED',
                   active_marker = NULL,
                   capability_ciphertext = NULL,
                   capability_iv = NULL,
                   capability_fingerprint = NULL,
                   updated_at = CURRENT_TIMESTAMP
             WHERE request_id = #{requestId}
               AND requester_company_id = #{requesterCompanyId}
               AND request_status = 'SUBMITTED'
               AND valid_until > #{nowEpochSeconds}
            """)
    int failInvalidCapability(
            @Param("requestId") String requestId,
            @Param("requesterCompanyId") Long requesterCompanyId,
            @Param("nowEpochSeconds") long nowEpochSeconds
    );
}
