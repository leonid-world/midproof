# MOST IMPORTANT For Midnight work

2026-09-18 source fixes: [수정·검증 결과](MIDNIGHT_COMPLIANCE_FIXES.md).
Spring ReadClient는 비동기 body subscriber로 전체 응답 deadline/64KiB/취소를
보장하고, resolver는 read/CAS 뒤 현재 요청·권한·fingerprint·만료를 다시 검사한다.
Hosted 결과는 Provider 2만 수용한다. 전체 Spring 114개 테스트와 build 통과;
공개 배포에는 아직 적용하지 않았다.

## Midnight

현재 실행 범위는 ADR-023의 합성 Preview 데모다. Spring Run 하나와 Railway
통합 앱 하나가 모든 helper를 관리한다. Hosted gateway는 JWT와 요청별 권한을
확인하고 지정 profileId를 서버의 가상 재무값으로 확장한다. 과거 직접 입력·
별도 터미널 실행 설명과 구분한다. [참조 하네스](MIDNIGHT_REFERENCE_HARNESS.md).

현재 v2 제품 흐름에서 Spring Boot는 인증된 **검증 요청 coordinator**다.
Funder가 입력한 공개 기준과 대상 채권/역할을 `REQUESTED`로 저장하고,
Seller/Buyer가 만든 v2 capability를 AES-256-GCM envelope로 암호화해
`SUBMITTED`로 보관하며, Funder의 resolve가 성공하면 `COMPLETED`로 바꾼다.
Spring은 Attestation Provider나 Proof Server가 아니며 재무 원문, nonce,
Provider signature, EIP-712 응답, witness를 저장하지 않는다. Mock
Attestation API 구현은 `giwa-midnight/attestation-api` 모듈에 분리되어 있으나,
현재 데모에서는 같은 통합 런타임이 관리한다. 별도 배포 서비스를 요구하지 않는다.

정상 상태 흐름은 `REQUESTED -> SUBMITTED -> COMPLETED`다. 당사자 거절,
기한 만료, 영구 오류는 각각 `DENIED`, `EXPIRED`, `FAILED`다. Midnight
트랜잭션 직후 Indexer가 아직 결과를 색인하지 않은 경우는 영구 오류가
아니므로 `SUBMITTED`를 유지하고 재시도한다. 반대로 Read API가 capability
위변조/문맥 불일치를 확정하면 `FAILED`로 전이하고 encrypted envelope를
삭제하며 active marker를 해제한다.

`MIDNIGHT_CAPABILITY_ENCRYPTION_KEY`는 MySQL 밖에서 주입하는 32-byte
hex/base64 키다. 기존 암호문이 남아 있는 동안 이 키를 즉시 교체하면 복호화할
수 없으므로, key version별 복호화와 재암호화 migration 또는 모든 활성 요청의
drain/expiry 없이 회전하지 않는다. 현재 key version은 `1`이다.

동일 Funder·채권·역할의 유효 요청은 하나만 허용한다. 성공한 요청도
`validUntil`까지 active로 유지해 기준을 조금씩 바꾸는 adaptive query를 줄인다.
이는 완전한 방어가 아니며 정책 template, query budget/cooldown, audit가 TODO다.

결과는 “Mock Provider가 서명한 가상값이 Funder의 공개 기준을
충족했는가”일 뿐 은행/회계기관 검증, GIWA 펀딩 승인, 자동 Funding gate가 아니다.
Hosted는 고정 합성 fixture이며 caller-supplied 값은 과거 local 진단 경로 설명이다.

### Historical v1 diagnostic behavior

ADR-019의 Vue 흐름은 기존 인증된 `GET /receivables`와
`GET /receivables/funding-opportunities`를 DB 채권 ID → 동기화된 GIWA
온체인 ID/역할 문맥으로 파생하는 데만 재사용한다. 새 Midnight API나
스키마를 추가하지 않으며, 재무 원문, PIN, 세션, 서명, capability를
Spring/MySQL에 저장하지 않는다. ADR-020의 capability 클립보드 복사와 로컬
파일 내보내기/가져오기는 사용자 브라우저와 OS 안에서만 일어나며, 파일을
Spring으로 업로드하거나 발급자에서 Funder로 자동 전달하는 endpoint는 없다.
선택한 파일 내용은 Vue component memory에서만 파싱되고 기존 loopback Read
API로 exact capability가 전달될 뿐이다. 안전한 다중 사용자 전달과 보존 정책은
여전히 별도 TODO다.

# Backend

## Stack

Spring Boot

Java17

MyBatis

JWT

MySQL

---

## Modules

auth

company

wallet

receivable

transaction

document

---

## Responsibility

Authentication

Database

REST API

Business Logic

Transaction History

---

## Common Error Handling

Implementation

- `common/error/ApiError.java`
- `common/error/ApiException.java`
- `common/error/GlobalExceptionHandler.java`
- `config/SecurityErrorHandler.java`

All API errors use this JSON shape.

- `status`: HTTP status number
- `code`: stable machine-readable error code
- `message`: user-safe message
- `path`: request path
- `timestamp`: error time
- `fieldErrors`: validation errors by field

Exception rules

- Use `ApiException` when frontend UX must branch on a stable error code.
- `ResponseStatusException` is converted to the common shape as a fallback.
- Bean Validation errors return `400 / VALIDATION_FAILED`.
- Invalid JSON returns `400 / INVALID_REQUEST_BODY`.
- Database constraint conflicts return `409 / DATA_CONFLICT`.
- Unexpected errors return `500 / INTERNAL_SERVER_ERROR` without exposing internal details.

Security rules

- Missing or invalid authentication returns `401 / AUTHENTICATION_REQUIRED`.
- Authenticated users without permission return `403 / ACCESS_DENIED`.
- `/error` and ERROR dispatcher requests are permitted so an original 4xx/5xx response is not replaced by Security 403.

Wallet conflict

- A wallet address remains globally unique across companies.
- Same wallet and same company is idempotent.
- Reconnecting the same company wallet with a different network refreshes its
  stored chain ID.
- Same wallet and different company returns `409 / WALLET_ALREADY_MAPPED`.
- Do not expose the owning company name, company ID, or business number in the error response.
- Database unique-constraint races are also translated to `WALLET_ALREADY_MAPPED`.

Verification

- `WalletErrorResponseIntegrationTests` verifies duplicate wallet 409.
- The same test verifies missing authentication returns 401 instead of 403.

---

## Receivable Blockchain Synchronization

Endpoints

- `POST /receivables/{id}/chain-created`
- `POST /receivables/{id}/verified`
- `POST /receivables/{id}/tokenized`
- `GET /receivables/funding-opportunities`
- `POST /receivables/{id}/funded`
- `POST /receivables/{id}/repaid`

Rules

- Seller company authorization is checked before chain-created metadata is saved.
- Buyer company authorization is checked before verification is saved.
- MyBatis UPDATE statements repeat the company, status, and required metadata conditions.
- `chain-created` stores onchain ID, contract address, create tx hash, and updated user.
- `verified` stores verify tx hash, changes status to VERIFIED, and inserts one status-history row.
- `tokenized` stores the RPC-verified token ID and tokenize tx hash, changes
  VERIFIED to TOKENIZED, and inserts one status-history row.
- Funding opportunities include only unassigned TOKENIZED receivables for a
  company that is neither Seller nor Buyer.
- `funded` accepts only `txHash`, derives the current Funder company and primary
  wallet, stores the configured MockKRW address and funding tx hash, changes
  TOKENIZED to FUNDED, and inserts one status-history row.
- `repaid` accepts only `txHash`, requires the authenticated Buyer and its
  registered receivable wallet, stores the repayment tx hash, changes FUNDED to
  REPAID, and inserts one status-history row.
- Reads used for transition decisions bypass the MyBatis local cache so concurrent requests see the latest state.
- Same blockchain metadata is idempotent, including after a later state transition.
- Different blockchain metadata uses `409 / BLOCKCHAIN_METADATA_CONFLICT`.
- Database unique constraints reject same-stage reuse of the same contract/onchain
  ID, create transaction hash, or verify transaction hash.
- Service-level duplicate checks provide a clear conflict before the write;
  database constraints remain the final defense against concurrent requests.
- The `blockchain_transactions` journal provides race-safe global transaction hash
  uniqueness.
- New chain-created, verified, tokenized, funded, and repaid state changes require a
  matching CONFIRMED journal entry for the receivable, company, wallet, type,
  contract, transaction hash, and emitted receivable ID.
- The tokenized request accepts only `txHash`; `token_id` comes from the journal's
  RPC-verified `event_token_id`, never from client input.
- The funded request accepts only `txHash`; Funder identity, MockKRW address, and
  token ID come from authenticated/configured/RPC-verified server state.
- The repaid request accepts only `txHash`; Buyer identity and the token ID come
  from authenticated/RPC-verified server state. The repayment recipient comes
  from the onchain event and matching MockKRW Transfer, not the stored Funder.
- Existing already-synchronized metadata remains idempotent even when it predates
  the journal.

RPC verification

- Require `GIWA_RPC_URL`, `GIWA_CHAIN_ID`,
  `GIWA_RECEIVABLE_FINANCE_ADDRESS`, and Funding/Repayment verification's
  `GIWA_MOCK_KRW_ADDRESS`.
- Fetch the chain, transaction, receipt, latest block, and receipt block directly
  from RPC.
- Require a successful receipt in the canonical block with at least
  `GIWA_MIN_CONFIRMATIONS`.
- Match transaction/receipt hashes, block hashes, signer, target, zero native
  value, chain, ABI selector, and every expected calldata argument.
- Decode only logs emitted by the configured contract and require exactly one
  expected lifecycle event.
- CREATE compares Seller, Buyer, face value, funding amount, dates, and document
  hash with DB data. VERIFY and TOKENIZE bind the stored onchain receivable ID and
  expected actor; TOKENIZE also checks the ERC-721 mint Transfer.
- FUND binds the Funder signer, fundReceivable calldata, ReceivableFunded event,
  stored token ID, Seller and funding amount, the MockKRW Funder-to-Seller
  Transfer, and the ReceivableFinance escrow-to-Funder ERC-721 Transfer.
- REPAY binds the Buyer signer, repayReceivable calldata, stored token ID,
  ReceivableRepaid Buyer/recipient/face value, and the MockKRW Buyer-to-recipient
  Transfer. The recipient is the current NFT owner and is intentionally not
  compared with the original Funder wallet.
- Persist RPC-derived chain, block hash/number, gas values, emitted IDs, and
  verification time. Client receipt values never overwrite these fields.
- Verify and backfill legacy CONFIRMED rows that have no `rpc_verified_at` before
  allowing a new receivable lifecycle synchronization.
- Re-run the full proof verification immediately before the first lifecycle state
  write even when a row already has `rpc_verified_at`; refresh a valid proof if a
  transaction was canonically re-included in a different block.
- Increment `verification_version` with every authoritative success/failure write
  and require the caller's previously read version in the UPDATE. Concurrent stale
  results fail CAS and must retry.
- The successful lifecycle-boundary proof refresh holds the journal row lock until
  the receivable write completes. Terminal updates also require that the same hash
  has not already been written to the matching receivable lifecycle column.
- Treat incoherent transaction/receipt snapshots, noncanonical blocks, and
  insufficient confirmations as retryable. Record a deterministic terminal
  failure only after a coherent canonical proof reaches the configured depth.

Not implemented yet

- Blockchain indexer

Verification

- `ReceivableOnchainServiceIntegrationTests` covers chain creation, Buyer
  verification, Seller tokenization, third-party Funding, Buyer Repayment,
  authorization, required prior lifecycle state, idempotent retry, conflicting
  metadata, duplicate history prevention, RPC-authoritative token IDs,
  RPC-verified journal requirements, atomic status guards, and legacy CONFIRMED
  backfill.

---

## Blockchain Transaction Journal

Endpoints

- `POST /blockchain-transactions`
- `PATCH /blockchain-transactions/{txHash}/confirmed`
- `PATCH /blockchain-transactions/{txHash}/failed`
- `GET /receivables/{id}/transactions`

Rules

- Supported types are CREATE_RECEIVABLE, VERIFY_RECEIVABLE,
  TOKENIZE_RECEIVABLE, FUND_RECEIVABLE, and REPAY_RECEIVABLE.
- The client supplies only receivable ID, type, contract address, and transaction
  hash when submitting.
- Company, stored receivable wallet, chain ID, function name, and initial PENDING
  status are derived by the backend.
- The initial chain ID is copied from the stored company-wallet mapping and is
  replaced by the configured RPC network chain during confirmation.
- The stored receivable wallet must still map to the authenticated company.
- CREATE requires the Seller and CREATED status.
- VERIFY requires the Buyer, CREATED status, and complete Seller chain metadata.
- TOKENIZE requires the Seller, VERIFIED status, and completed Buyer verification
  metadata.
- FUND requires an unrelated third-party company, TOKENIZED status, complete
  tokenization metadata, and that company's connected primary wallet.
- REPAY requires the Buyer company, FUNDED status, complete Funding metadata,
  and the registered Buyer wallet.
- Transaction hash uniqueness is enforced globally by the database.
- Identical create, confirm, and fail retries are idempotent.
- Conflicting metadata or terminal-state changes return stable 409 errors.
- Only the submitting company can update a journal row.
- Seller, Buyer, and assigned Funder can list the full receivable journal. An
  unassigned funding candidate can list only its own FUND_RECEIVABLE rows.
- Client receipt block/gas values enter the API as decimal strings for JavaScript
  precision safety, but are advisory; stored confirmation metadata comes from RPC.
- A timeout or temporary API/network error does not mark a transaction FAILED.
- Missing receipts, insufficient confirmations, and possible reorgs also remain
  retryable. Reverted receipts and deterministic signer/target/calldata/event
  mismatches become FAILED.
- Concurrent proof changes return `BLOCKCHAIN_VERIFICATION_RETRY_REQUIRED`.
- A valid proof whose emitted ID differs only from the synchronization request
  returns `BLOCKCHAIN_SYNCHRONIZATION_EVENT_MISMATCH` without failing the journal.
- A successful replacement is stored under its actual hash, while the original is
  marked FAILED with `TRANSACTION_REPLACED`.

Verification

- `BlockchainTransactionServiceIntegrationTests` covers server-derived metadata,
  roles/states/contracts, idempotency, conflicts, receipt parsing, company
  authorization, list visibility/order, RPC proof persistence, terminal/retryable
  verification failures, lifecycle-boundary revalidation, legacy terminal cleanup,
  CAS version ordering, post-synchronization failure prevention, and JSON string
  serialization.
- `BlockchainTransactionVerifierTests` cover CREATE/VERIFY/TOKENIZE/FUND/REPAY
  ABI and event validation, Funding payment/NFT Transfers, Repayment payment to
  the event recipient, chain/canonical/confirmation checks, signer/target
  mismatches, reverted receipts, duplicate events, and safe configuration/RPC
  failures.
- `GiwaJsonRpcClientTests` use a local HTTP JSON-RPC server to verify proof parsing,
  pending null results, and sanitized upstream errors.

---

## Railway Deployment Runtime

- `Dockerfile` uses a Java 17 JDK builder and Java 17 JRE runtime.
- Gradle packages the Spring Boot executable as `build/libs/app.jar`.
- The container runs as a non-root `app` user.
- `server.port` reads Railway `PORT`, then local `SERVER_PORT`, then `8080`.
- The server binds to `0.0.0.0`.
- Datasource configuration accepts the existing `DB_*` variables and Railway MySQL
  `MYSQLHOST`, `MYSQLPORT`, `MYSQLDATABASE`, `MYSQLUSER`, and `MYSQLPASSWORD`.
- `CORS_ALLOWED_ORIGINS` is a comma-separated list of exact frontend origins.
- `GET /health` is public and returns `{"status":"UP"}` for Railway health checks.
- Production must set a strong `JWT_SECRET`; the local fallback must not be used.
