-- Non-destructive one-time CAS version upgrade for an existing
-- blockchain_transactions table.
-- Run the preflight first. Continue only when the table exists,
-- rpc_verified_at is present, and verification_version is absent.

SELECT column_name
  FROM information_schema.columns
 WHERE table_schema = DATABASE()
   AND table_name = 'blockchain_transactions'
   AND column_name IN ('rpc_verified_at', 'verification_version')
 ORDER BY column_name;

ALTER TABLE blockchain_transactions
    ADD COLUMN verification_version BIGINT UNSIGNED NOT NULL DEFAULT 0
        AFTER rpc_verified_at;
