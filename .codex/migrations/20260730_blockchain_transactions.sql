-- Non-destructive setup for an existing GIWA Receivable MySQL database.
-- The canonical fresh-database definition remains in .codex/schema.sql.

SELECT table_name
  FROM information_schema.tables
 WHERE table_schema = DATABASE()
   AND table_name = 'blockchain_transactions';

CREATE TABLE IF NOT EXISTS blockchain_transactions (
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
