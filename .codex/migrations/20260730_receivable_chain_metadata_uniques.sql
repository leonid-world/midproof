-- Non-destructive migration for an existing GIWA Receivable MySQL database.
-- Check existing constraint names, then run all three duplicate preflight queries.
-- Each duplicate query must return zero rows.

-- If this returns any of the target names, inspect the existing constraints and
-- do not add the same constraint again.
SELECT constraint_name
  FROM information_schema.table_constraints
 WHERE table_schema = DATABASE()
   AND table_name = 'receivables'
   AND constraint_name IN (
       'uk_receivables_contract_onchain_id',
       'uk_receivables_create_tx_hash',
       'uk_receivables_verify_tx_hash'
   );

SELECT contract_address, onchain_receivable_id, COUNT(*) AS duplicate_count
  FROM receivables
 WHERE contract_address IS NOT NULL
   AND onchain_receivable_id IS NOT NULL
 GROUP BY contract_address, onchain_receivable_id
HAVING COUNT(*) > 1;

SELECT create_tx_hash, COUNT(*) AS duplicate_count
  FROM receivables
 WHERE create_tx_hash IS NOT NULL
 GROUP BY create_tx_hash
HAVING COUNT(*) > 1;

SELECT verify_tx_hash, COUNT(*) AS duplicate_count
  FROM receivables
 WHERE verify_tx_hash IS NOT NULL
 GROUP BY verify_tx_hash
HAVING COUNT(*) > 1;

-- Apply only after the preflight queries return zero rows and a backup exists.
ALTER TABLE receivables
    ADD CONSTRAINT uk_receivables_contract_onchain_id
        UNIQUE (contract_address, onchain_receivable_id),
    ADD CONSTRAINT uk_receivables_create_tx_hash
        UNIQUE (create_tx_hash),
    ADD CONSTRAINT uk_receivables_verify_tx_hash
        UNIQUE (verify_tx_hash);
