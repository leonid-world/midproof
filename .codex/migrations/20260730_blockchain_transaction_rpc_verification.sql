-- Non-destructive one-time upgrade for an existing blockchain_transactions table.
-- Run the preflight first. Continue only when the table exists and all four
-- listed columns are absent.

SELECT column_name
  FROM information_schema.columns
 WHERE table_schema = DATABASE()
   AND table_name = 'blockchain_transactions'
   AND column_name IN (
       'block_hash',
       'event_receivable_id',
       'event_token_id',
       'rpc_verified_at'
   )
 ORDER BY column_name;

ALTER TABLE blockchain_transactions
    ADD COLUMN block_hash VARCHAR(66) NULL
        AFTER block_number,
    ADD COLUMN event_receivable_id BIGINT UNSIGNED NULL
        AFTER effective_gas_price,
    ADD COLUMN event_token_id BIGINT UNSIGNED NULL
        AFTER event_receivable_id,
    ADD COLUMN rpc_verified_at DATETIME NULL
        AFTER event_token_id;
