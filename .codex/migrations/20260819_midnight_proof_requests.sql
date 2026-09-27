-- Authenticated, recipient-bound Midnight proof coordination.
-- Stores only public request context/status plus an encrypted capability envelope.
-- Raw financial inputs, PINs, signatures, lookup keys, and company commitments
-- must never be stored in this table.

CREATE TABLE midnight_proof_requests (
    request_id CHAR(66) NOT NULL,
    receivable_id BIGINT UNSIGNED NOT NULL,
    requester_company_id BIGINT UNSIGNED NOT NULL,
    requester_wallet_address VARCHAR(42) NOT NULL,
    subject_company_id BIGINT UNSIGNED NOT NULL,
    subject_role VARCHAR(10) NOT NULL,
    subject_wallet_address VARCHAR(42) NOT NULL,
    midnight_contract_address CHAR(64) NOT NULL,
    giwa_chain_id BIGINT NOT NULL,
    receivable_finance_address VARCHAR(42) NOT NULL,
    onchain_receivable_id BIGINT UNSIGNED NOT NULL,
    min_annual_revenue_krw DECIMAL(20, 0) NOT NULL,
    max_debt_ratio_bps DECIMAL(10, 0) NOT NULL,
    max_overdue_count DECIMAL(5, 0) NOT NULL,
    valid_until BIGINT UNSIGNED NOT NULL,
    request_status VARCHAR(20) NOT NULL DEFAULT 'REQUESTED',
    active_marker TINYINT(1) NULL DEFAULT 1,
    encryption_key_version SMALLINT UNSIGNED NOT NULL DEFAULT 1,
    capability_ciphertext VARBINARY(16384) NULL,
    capability_iv BINARY(12) NULL,
    capability_fingerprint BINARY(32) NULL,
    submitted_at DATETIME NULL,
    completed_at DATETIME NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (request_id),
    UNIQUE KEY uk_midnight_proof_requests_active
        (requester_company_id, receivable_id, subject_role, active_marker),
    UNIQUE KEY uk_midnight_proof_requests_fingerprint (capability_fingerprint),
    KEY idx_midnight_proof_requests_requester
        (requester_company_id, created_at),
    KEY idx_midnight_proof_requests_subject
        (subject_company_id, request_status, created_at),
    KEY idx_midnight_proof_requests_expiry
        (request_status, valid_until),
    CONSTRAINT fk_midnight_proof_requests_receivable
        FOREIGN KEY (receivable_id) REFERENCES receivables(receivable_id),
    CONSTRAINT fk_midnight_proof_requests_requester_company
        FOREIGN KEY (requester_company_id) REFERENCES companies(company_id),
    CONSTRAINT fk_midnight_proof_requests_subject_company
        FOREIGN KEY (subject_company_id) REFERENCES companies(company_id),
    CONSTRAINT chk_midnight_proof_requests_role
        CHECK (subject_role IN ('SELLER', 'BUYER')),
    CONSTRAINT chk_midnight_proof_requests_status
        CHECK (request_status IN ('REQUESTED', 'SUBMITTED', 'DENIED', 'EXPIRED', 'COMPLETED', 'FAILED')),
    CONSTRAINT chk_midnight_proof_requests_unrelated
        CHECK (requester_company_id <> subject_company_id),
    CONSTRAINT chk_midnight_proof_requests_active
        CHECK (active_marker IS NULL OR (active_marker = 1 AND request_status IN ('REQUESTED', 'SUBMITTED', 'COMPLETED'))),
    CONSTRAINT chk_midnight_proof_requests_revenue
        CHECK (min_annual_revenue_krw >= 0 AND min_annual_revenue_krw <= 18446744073709551615),
    CONSTRAINT chk_midnight_proof_requests_debt
        CHECK (max_debt_ratio_bps >= 0 AND max_debt_ratio_bps <= 4294967295),
    CONSTRAINT chk_midnight_proof_requests_overdue
        CHECK (max_overdue_count >= 0 AND max_overdue_count <= 65535)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
