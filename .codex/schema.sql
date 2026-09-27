-- GIWA Receivable Financing MVP
-- MySQL 8.x

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

DROP TABLE IF EXISTS receivable_status_history;
DROP TABLE IF EXISTS blockchain_transactions;
DROP TABLE IF EXISTS midnight_proof_requests;
DROP TABLE IF EXISTS receivable_documents;
DROP TABLE IF EXISTS receivables;
DROP TABLE IF EXISTS company_wallets;
DROP TABLE IF EXISTS users;
DROP TABLE IF EXISTS companies;

SET FOREIGN_KEY_CHECKS = 1;

CREATE TABLE companies (
    company_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    company_name VARCHAR(200) NOT NULL,
    business_number CHAR(10) NOT NULL,
    representative_name VARCHAR(100) NULL,
    company_status VARCHAR(30) NOT NULL DEFAULT 'ACTIVE',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (company_id),
    UNIQUE KEY uk_companies_business_number (business_number),
    KEY idx_companies_company_name (company_name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE users (
    user_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    email VARCHAR(255) NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    user_name VARCHAR(100) NOT NULL,
    phone VARCHAR(30) NULL,
    company_id BIGINT UNSIGNED NOT NULL,
    status VARCHAR(30) NOT NULL DEFAULT 'ACTIVE',
    last_login_at DATETIME NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id),
    UNIQUE KEY uk_users_email (email),
    KEY idx_users_company_id (company_id),
    CONSTRAINT fk_users_company
        FOREIGN KEY (company_id) REFERENCES companies(company_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE company_wallets (
    company_wallet_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    company_id BIGINT UNSIGNED NOT NULL,
    wallet_address VARCHAR(42) NOT NULL,
    chain_id BIGINT NOT NULL,
    wallet_type VARCHAR(30) NOT NULL DEFAULT 'METAMASK',
    is_primary TINYINT(1) NOT NULL DEFAULT 1,
    is_verified TINYINT(1) NOT NULL DEFAULT 0,
    verified_at DATETIME NULL,
    connected_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    disconnected_at DATETIME NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (company_wallet_id),
    UNIQUE KEY uk_company_wallets_wallet_address (wallet_address),
    KEY idx_company_wallets_company_id (company_id),
    CONSTRAINT fk_company_wallets_company
        FOREIGN KEY (company_id) REFERENCES companies(company_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE receivables (
    receivable_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    seller_company_id BIGINT UNSIGNED NOT NULL,
    buyer_company_id BIGINT UNSIGNED NOT NULL,
    funder_company_id BIGINT UNSIGNED NULL,
    seller_wallet_address VARCHAR(42) NOT NULL,
    buyer_wallet_address VARCHAR(42) NOT NULL,
    funder_wallet_address VARCHAR(42) NULL,
    currency_code VARCHAR(10) NOT NULL DEFAULT 'KRW',
    face_value DECIMAL(36, 0) NOT NULL,
    funding_amount DECIMAL(36, 0) NOT NULL,
    issue_date DATE NOT NULL,
    maturity_date DATE NOT NULL,
    status VARCHAR(30) NOT NULL DEFAULT 'CREATED',
    document_hash VARCHAR(66) NULL,
    onchain_receivable_id BIGINT UNSIGNED NULL,
    token_id BIGINT UNSIGNED NULL,
    contract_address VARCHAR(42) NULL,
    mock_token_address VARCHAR(42) NULL,
    create_tx_hash VARCHAR(66) NULL,
    verify_tx_hash VARCHAR(66) NULL,
    tokenize_tx_hash VARCHAR(66) NULL,
    funding_tx_hash VARCHAR(66) NULL,
    repay_tx_hash VARCHAR(66) NULL,
    description VARCHAR(1000) NULL,
    created_by BIGINT UNSIGNED NOT NULL,
    updated_by BIGINT UNSIGNED NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (receivable_id),
    UNIQUE KEY uk_receivables_contract_onchain_id
        (contract_address, onchain_receivable_id),
    UNIQUE KEY uk_receivables_create_tx_hash (create_tx_hash),
    UNIQUE KEY uk_receivables_verify_tx_hash (verify_tx_hash),
    KEY idx_receivables_seller_status (seller_company_id, status),
    KEY idx_receivables_buyer_status (buyer_company_id, status),
    KEY idx_receivables_funder_status (funder_company_id, status),
    KEY idx_receivables_maturity_date (maturity_date),
    KEY idx_receivables_onchain_id (onchain_receivable_id),
    KEY idx_receivables_token_id (token_id),
    CONSTRAINT fk_receivables_seller_company
        FOREIGN KEY (seller_company_id) REFERENCES companies(company_id),
    CONSTRAINT fk_receivables_buyer_company
        FOREIGN KEY (buyer_company_id) REFERENCES companies(company_id),
    CONSTRAINT fk_receivables_funder_company
        FOREIGN KEY (funder_company_id) REFERENCES companies(company_id),
    CONSTRAINT fk_receivables_created_by
        FOREIGN KEY (created_by) REFERENCES users(user_id),
    CONSTRAINT fk_receivables_updated_by
        FOREIGN KEY (updated_by) REFERENCES users(user_id),
    CONSTRAINT chk_receivables_company_diff
        CHECK (seller_company_id <> buyer_company_id),
    CONSTRAINT chk_receivables_face_value
        CHECK (face_value > 0),
    CONSTRAINT chk_receivables_funding_amount
        CHECK (funding_amount > 0 AND funding_amount <= face_value),
    CONSTRAINT chk_receivables_dates
        CHECK (maturity_date > issue_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE receivable_documents (
    receivable_document_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    receivable_id BIGINT UNSIGNED NOT NULL,
    original_file_name VARCHAR(255) NOT NULL,
    stored_file_name VARCHAR(255) NULL,
    storage_path VARCHAR(1000) NULL,
    content_type VARCHAR(100) NULL,
    file_size BIGINT UNSIGNED NULL,
    sha256_hash VARCHAR(64) NOT NULL,
    document_type VARCHAR(30) NOT NULL DEFAULT 'INVOICE',
    created_by BIGINT UNSIGNED NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (receivable_document_id),
    KEY idx_receivable_documents_receivable_id (receivable_id),
    CONSTRAINT fk_receivable_documents_receivable
        FOREIGN KEY (receivable_id) REFERENCES receivables(receivable_id),
    CONSTRAINT fk_receivable_documents_created_by
        FOREIGN KEY (created_by) REFERENCES users(user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

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

CREATE TABLE blockchain_transactions (
    blockchain_transaction_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    receivable_id BIGINT UNSIGNED NULL,
    company_id BIGINT UNSIGNED NOT NULL,
    wallet_address VARCHAR(42) NOT NULL,
    transaction_type VARCHAR(40) NOT NULL,
    chain_id BIGINT NOT NULL,
    contract_address VARCHAR(42) NOT NULL,
    function_name VARCHAR(100) NOT NULL,
    tx_hash VARCHAR(66) NOT NULL,
    block_number BIGINT UNSIGNED NULL,
    block_hash VARCHAR(66) NULL,
    tx_status VARCHAR(30) NOT NULL DEFAULT 'PENDING',
    gas_used BIGINT UNSIGNED NULL,
    effective_gas_price DECIMAL(65, 0) NULL,
    event_receivable_id BIGINT UNSIGNED NULL,
    event_token_id BIGINT UNSIGNED NULL,
    rpc_verified_at DATETIME NULL,
    verification_version BIGINT UNSIGNED NOT NULL DEFAULT 0,
    error_code VARCHAR(100) NULL,
    error_message VARCHAR(2000) NULL,
    submitted_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    confirmed_at DATETIME NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (blockchain_transaction_id),
    UNIQUE KEY uk_blockchain_transactions_tx_hash (tx_hash),
    KEY idx_blockchain_transactions_receivable_id (receivable_id),
    KEY idx_blockchain_transactions_company_id (company_id),
    KEY idx_blockchain_transactions_type_status (transaction_type, tx_status),
    CONSTRAINT fk_blockchain_transactions_receivable
        FOREIGN KEY (receivable_id) REFERENCES receivables(receivable_id),
    CONSTRAINT fk_blockchain_transactions_company
        FOREIGN KEY (company_id) REFERENCES companies(company_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE receivable_status_history (
    receivable_status_history_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    receivable_id BIGINT UNSIGNED NOT NULL,
    previous_status VARCHAR(30) NULL,
    current_status VARCHAR(30) NOT NULL,
    changed_by_company_id BIGINT UNSIGNED NULL,
    changed_by_wallet_address VARCHAR(42) NULL,
    tx_hash VARCHAR(66) NULL,
    change_reason VARCHAR(500) NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (receivable_status_history_id),
    KEY idx_receivable_status_history_receivable_id
        (receivable_id, created_at),
    CONSTRAINT fk_receivable_status_history_receivable
        FOREIGN KEY (receivable_id) REFERENCES receivables(receivable_id),
    CONSTRAINT fk_receivable_status_history_company
        FOREIGN KEY (changed_by_company_id) REFERENCES companies(company_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
