# REST API

## Reliability fixes — 2026-09-18 source, not yet deployed

See [MIDNIGHT_COMPLIANCE_FIXES.md](MIDNIGHT_COMPLIANCE_FIXES.md) for current evidence.
Hosted result consumers require Provider 2 at Read API, Spring and UI boundaries;
generic/local policy remains. Read API rechecks expiry after reading Indexer state;
Spring rechecks current permission, request, capability fingerprint and expiry after
reading and after completion CAS. Errors/expiry do not become a valid false result.

Read-only Indexer fetch now has a 10-second complete-response deadline, 2MiB cap,
real cancellation and one in-flight operation. Read health degrades on transport
failure and recovers on the next successful read. Hosted `/ready` reports 503 while
`/health` may remain live; existing resolve/recovery routes stay usable. UI→Spring
Midnight calls have 10-second/64KiB bounds; Spring→Read has its configured complete
response deadline and 64KiB cap. These are source guarantees, not public rollout evidence.

## Current hosted Midnight API — ADR-023

For the approved synthetic Preview demo, the browser uses the integrated
gateway at `/midnight-proof/v2/proof-sessions/<operation>`. Every operation
requires an app Bearer token, fresh Spring request authorization and bound
actor/request/session ownership. Origin or the public UI header alone is not
authentication. See [reference harness](MIDNIGHT_REFERENCE_HARNESS.md).

| Operation | Exact body fields |
| --- | --- |
| challenge | `version: 2`, `requestId`, `profileId` |
| prove | `version: 2`, `requestId`, `sessionId`, `authorization` |
| status / cancel / ack | `version: 2`, `requestId`, `sessionId` |
| recover | `version: 2`, `requestId` |

The gateway expands only a named synthetic fixture and derives subject/policy
from Spring. Raw financial fields, caller-selected roles and policy overrides
are rejected by this hosted interface. Public `GET /midnight-proof/v2/demo/config`
reports fixture labels, deployment and runtime readiness; it does not issue a
proof. The result reader is an internal token-and-loopback service used by
Spring, not an anonymous public result browser. Provider/helper roles share the
single application deployment. Source: `giwa-midnight/cli/src/hosted-demo/gateway.ts`.

The Spring request endpoints, result states, expiry and durable delivery rules
below still apply. The direct `127.0.0.1:4200` private-tuple bodies below describe
the earlier local transport only; they are not the hosted browser API.

## Shared v2 request protocol and historical local transport

The normal product path is request-bound and coordinated by authenticated
Spring Boot. A Funder submits public criteria, not guesses about another
company's financial facts. In the earlier direct local transport, the selected
Seller or Buyer supplies the private mock tuple to the loopback Proof Bridge after reviewing the requester,
criteria, audience, and deadline. No product screen asks a user to paste JSON
or enter a PIN.

Spring Boot exposes these authenticated, `no-store` endpoints:

```text
POST /receivables/{receivableId}/midnight-proof-requests
GET  /midnight-proof-requests?scope=requested|assigned
GET  /midnight-proof-requests/{requestId}
POST /midnight-proof-requests/{requestId}/deny
POST /midnight-proof-requests/{requestId}/complete
POST /midnight-proof-requests/{requestId}/resolve
```

Create accepts exactly:

```json
{
  "subjectRole": "SELLER",
  "minAnnualRevenueKrw": "500000000",
  "maxDebtRatioBps": "20000",
  "maxOverdueCount": "1",
  "validForSeconds": 86400
}
```

The three criteria are canonical unsigned decimal strings. `validForSeconds`
is an integral JSON number. Spring derives the GIWA chain, ReceivableFinance
deployment, synchronized onchain receivable ID, subject company/wallet, and
requesting Funder wallet; clients may not override those fields. `deny` and
`resolve` have no body. `complete` accepts exactly
`{ "proofCapability": { ...version-2 capability... } }`; that object is moved
directly from the local Bridge by Vue and is never shown as a user input.

Request states are `REQUESTED`, `SUBMITTED`, `DENIED`, `EXPIRED`, `COMPLETED`,
and `FAILED`. The normal success path is `REQUESTED -> SUBMITTED -> COMPLETED`:
`SUBMITTED` means Spring durably accepted an encrypted capability envelope;
`COMPLETED` means the requesting Funder resolved the bound public result.
Indexer propagation immediately after a finalized Midnight transaction is a
temporary condition: `ELIGIBILITY_RESULT_NOT_FOUND` and `CONTRACT_NOT_FOUND`
leave the request `SUBMITTED` so the resolver can retry. A permanent invalid or
context-mismatched capability transitions to `FAILED`, purges its encrypted
envelope, and releases the active-request marker. `DENIED`, `EXPIRED`, and
`FAILED` are not negative eligibility results.

The local Proof Bridge on `127.0.0.1:4200` exposes only exact v2 POST routes:

```text
/v2/proof-sessions/challenge
/v2/proof-sessions/prove
/v2/proof-sessions/status
/v2/proof-sessions/cancel
/v2/proof-sessions/recover
/v2/proof-sessions/ack
```

The challenge body contains `version`, private `annualRevenueKrw`,
`debtRatioBps`, `overdueCount`, the exact onchain receivable/role, and a
`policyRequest` with `requestId`, `intendedFunderWallet`, the three public
criteria, and `validUntil`. Challenge returns HTTP 201 with
`{version,sessionId,expiresAt,authorizationRequest}`. Prove accepts exactly
`{version,sessionId,authorization}` and returns HTTP 202. Status and cancel
accept `{version,sessionId}`. Recover accepts `{version,requestId}` and returns
the same `complete` object as status; ACK accepts
`{version,sessionId,requestId}` and returns
`{version,sessionId,status:"acknowledged"}`.

For v2, the Provider sets the authorization `expiresAt` to
`min(issuedAt + 120 seconds, policyRequest.validUntil)`. Its effective TTL is
therefore 1 through 120 seconds, never a guaranteed two minutes. If
`issuedAt >= validUntil`, challenge creation fails closed with
`409 / POLICY_REQUEST_EXPIRED`; a policy with one second remaining gets only a
one-second authorization window.

The Bridge persists a finalized capability in an encrypted local outbox before
returning `complete`. Vue calls Spring `complete` first and ACKs the outbox only
after Spring confirms `SUBMITTED` or the idempotent already-`COMPLETED` state. A
reload or Bridge restart therefore uses `recover` by `requestId` instead of
signing or submitting a second proof. ACK removes the recoverable capability;
the request/session tombstone remains only until `validUntil` to block an exact
replay. These routes are a local delivery protocol, not a public API.
Recover returns 404 `PROOF_RESULT_NOT_FOUND` when no record exists and 409
`PROOF_RESULT_IN_PROGRESS` for a persisted reservation, ambiguous submission,
or an in-flight serialized durable outbox mutation.
An ACK for the exact tombstoned pair is idempotent; a mismatched pair returns
409. Both routes use the same strict Origin, Host, `Sec-Fetch-Site`, UI-header,
body-only/no-query boundary as the other Bridge v2 routes.

The Read API on `127.0.0.1:4100` exposes `GET /health` and
`POST /v2/eligibility-results/resolve`. The resolver accepts the exact
18-field v2 capability, recomputes the policy request hash and opaque lookup
key, checks deployment/GIWA/request/audience/criteria/freshness bindings, and
returns exactly `{version,networkId,contractAddress,context,result}`. It never
returns private financial facts, nonce, Provider signature, or witness data.
At `validUntil <= now` it returns `410 PROOF_RESULT_EXPIRED`.

The returned boolean means only “the Mock Provider-signed caller-supplied tuple
satisfied this request's displayed criteria.” It is not bank/accounting
verification, GIWA Funding approval, or an automatic Funding gate.

## Historical v1 Diagnostic API (ADR-018 through ADR-020)

The following `/v1` API and clipboard/file descriptions are preserved for CLI
learning and legacy diagnostics. They are not the normal v2 product path and
must never be treated as a Funder-selected v2 policy result.

## Historical v1: Midnight Local Read API

This is `giwa-midnight/api`, not the Spring Boot REST API. It is a local-only,
read-only adapter bound to `127.0.0.1:4100` for the development Vue viewer.

- `GET /health`
- `POST /v1/eligibility-results/resolve`

The POST body is the exact nine-field version-1 Proof capability produced by the
CLI/Bridge and explicitly imported into Vue from the clipboard or a selected
local file. POST is used so its correlation-sensitive fields are not placed in
a URL; the operation does not mutate state. The adapter validates the pinned
Midnight deployment and GIWA context, recomputes the lookup key, and reads
exactly one public ledger entry. It returns `networkId`, `contractAddress`, the
receivable context, and only `lookupKey`, boolean `eligible`, decimal-string
`providerId`, and decimal-string `policyVersion`. It never exposes an anonymous
result list.

Clipboard copy, local-file export, and local-file import are browser/OS user
actions, not HTTP APIs. The selected file is parsed locally and is not uploaded.
There is no capability-delivery or capability-storage endpoint; raw JSON is an
advanced diagnostic representation of the same request body.
The generic export is `gasok-proof.gasok-proof`; local import accepts non-empty
UTF-8 `.gasok-proof` or `.json` files up to 16 KiB before applying the exact
capability parser. Import does not call this endpoint until the Funder
explicitly chooses `ZK 결과 확인`.

Every response is `no-store`. The adapter has no wallet, signing, proof,
attestation, mutation, MySQL, or GIWA-RPC endpoint. Vite reaches it through the
same-origin `/midnight-api` proxy in development. Only the configured GASOK
contract is accepted; other addresses return
`400 / UNAPPROVED_CONTRACT_ADDRESS`. The Indexer query has a 10-second deadline
and permits only one in-flight SDK query so a stalled local service becomes a
bounded, retryable UI error.

## Historical v1: Midnight Mock Attestation API

This is `giwa-midnight/attestation-api`, not Spring Boot. It binds only to
`127.0.0.1:4000` and issues local mock attestations for the approved Midnight
deployment.

- `GET /health`
- `GET /provider-info`
- `POST /authorization-challenges`
- `POST /attest`

`POST /authorization-challenges` accepts the private mock financial tuple only
from the local CLI-compatible participant (interactive CLI or trusted Proof
Bridge), resolves the canonical GIWA Seller/Buyer wallet, and returns a
two-minute EIP-712 authorization request. The browser-facing request contains a
salted commitment instead of raw financial values. The random salt remains in
Bridge/CLI and Provider memory.

`POST /attest` requires the matching MetaMask authorization response. The
Provider consumes the in-memory challenge once, re-reads the canonical GIWA
wallet, recovers the EIP-712 signer, and only then creates its existing Schnorr
attestation. Provider ID `2` identifies this authorization policy; Provider ID
`1` results are legacy context-only results. Challenge expiry is transport-level
replay protection and does not make a Midnight eligibility result current or
unexpired.

## Historical v1: Midnight Local Proof Bridge

This is the trusted, local-only process in `giwa-midnight/cli`, not Spring Boot
and not a production API. It binds only to `127.0.0.1:4200`. Development Vue
reaches it through the same-origin `/midnight-proof` Vite proxy. It reuses the
already-proven CLI Midnight wallet, encrypted contract private state, Provider 2
flow, Proof Server, and current local contract. The Bridge therefore owns the
Midnight transaction signer and balance; MetaMask signs only the GIWA
Seller/Buyer EIP-712 authorization.

All session identifiers stay in JSON bodies rather than URLs:

- `POST /v1/proof-sessions/challenge`
- `POST /v1/proof-sessions/prove`
- `POST /v1/proof-sessions/status`
- `POST /v1/proof-sessions/cancel`

`POST /v1/proof-sessions/challenge` accepts exactly:

```json
{
  "version": 1,
  "onchainReceivableId": "1",
  "subjectRole": "SELLER",
  "annualRevenueKrw": "500000000",
  "debtRatioBps": "20000",
  "overdueCount": "1",
  "secretPin": "1234"
}
```

The development Vue route does not ask a user to type
`onchainReceivableId` or `subjectRole`. It first reads the authenticated
company's existing receivables from Spring Boot, lets a Seller/Buyer select a
DB receivable record, and derives the synchronized onchain ID and current
company's role from that record. Only the derived onchain ID and role enter the
Bridge request. The DB `receivableId` is UI/application context and is never
substituted for the GIWA onchain ID.

The Bridge prepares the existing private witness flow and returns HTTP 201 with
exactly a cryptographically random `sessionId`, decimal-string `expiresAt`, and
the existing exact `authorizationRequest`. Vue removes the raw financial fields
and PIN from its form state immediately after this response. The request is then
signed only after a separate, explicit MetaMask action.

`POST /v1/proof-sessions/prove` accepts `{ version, sessionId, authorization }`
and returns HTTP 202 with `{ version, sessionId, status }`. The Bridge consumes
the one-shot session, obtains the mock Schnorr attestation, generates the proof,
and submits the Midnight transaction asynchronously. It does not automatically
retry an ambiguous submission.

This issuance path is used once for the first intended result of each selected
receivable and Seller/Buyer role. A different receivable or the opposite role
requires a new challenge, Provider attestation, and ZK transaction because the
signed binding changes. After a result exists, a Funder may resolve the same
capability repeatedly; read resolution does not consume the capability and does
not create another attestation or proof.

`POST /v1/proof-sessions/status` and
`POST /v1/proof-sessions/cancel` accept exactly `{ version, sessionId }` and
return HTTP 200 on success. Thus the exact successful status codes are 201 for
challenge, 202 for prove, and 200 for status/cancel.
Status is one of:

- `awaiting_authorization`
- `attesting`
- `proving_and_submitting`
- `indexing`
- `complete`
- `failed`
- `expired`
- `cancelled`

A complete response contains the exact proof capability, not an independently
trusted eligibility boolean. Vue submits that capability to the existing
read-only `/midnight-api` resolver and displays only the independently decoded
Indexer result. `complete` means the Midnight transaction finalized and the
capability was preserved; it does not promise that the asynchronous Indexer is
already caught up. After finalization, `indexing` is only the internal
transition into `complete`; the Bridge does not issue a per-session Indexer
query or hold the one-shot session open for public visibility. Vue retries only
the independent resolver until the result is visible and must never submit
another proof for that delay. A failed response contains only a stable
`{ code, message }` error. Session status never returns the raw tuple, PIN,
hidden salt, Provider signature, private state, wallet seed, or stack trace.

Provider/GIWA failures cross the Bridge boundary only through a fixed
status/code/message allowlist. The current safe mappings are
`404 / GIWA_RECEIVABLE_NOT_FOUND`, `502 / GIWA_RPC_UNAVAILABLE`, and the
attestation-stage `403 / ROLE_WALLET_MISMATCH`. The Bridge also normalizes the
Compact exact-key assertion to the proof-session error code
`ELIGIBILITY_RESULT_ALREADY_EXISTS`. That code means the selected private
identity/PIN plus receivable-role context already has a public entry; it is not
a Docker, Provider, Proof Server, Node, or proxy outage. Provider response
bodies are not reflected. Vue maps these codes to fixed Korean guidance and
keeps every unknown or malformed error generic.

On 2026-08-19, the failed Seller attempt for DB receivable `#4` correctly
derived GIWA onchain receivable `#1` and reached Compact, which rejected the
already-present exact lookup key. The Bridge running at 12:04 still returned the
generic `PROOF_FAILED`; logs and ledger state established the duplicate during
the subsequent diagnosis. The updated Bridge now maps and tests that exact
assertion as `ELIGIBILITY_RESULT_ALREADY_EXISTS`; the new mapping has not yet
been exercised by a restarted live Bridge/MetaMask E2E. Restarting local services
was not a remedy. The supported recovery is to reuse the previously exported
capability. Changing the PIN would derive another pseudonym/key rather than
recover, replace, or refresh the existing result, and the current MVP does not
recover a lost capability.

The Bridge permits only one active prepared/running session because one local
CLI encrypted state and wallet are shared. Sessions are memory-only, short-lived,
one-shot, and not resumable after process restart. An internal timer expires an
unsigned `awaiting_authorization` session exactly at its Provider deadline even
if the browser sends no further request; this drops its prepared tuple and frees
the active slot. Every terminal record, including a returned capability or safe
error, is retained for 60 seconds and then removed by its own unref timer even
when no later request arrives. CLI and Bridge use a common process lock so two processes
cannot concurrently mutate the same encrypted
LevelDB state. Cancellation removes a session that has not begun the
non-abortable SDK proof/submission call; once that call is running, the Bridge
keeps the lock and exposes status instead of pretending the transaction was
cancelled.

Before binding, the Bridge applies a 10-second deadline to one startup Indexer
preflight, validates the pinned contract/Provider, and seals the GIWA
configuration in memory. Challenge preparation uses only that cache and never
queries the Indexer while raw inputs exist. Because the SDK exposes no abort
signal, one timed-out startup query may remain internally pending; the server
does not open and no raw proof tuple has been accepted.

The HTTP boundary requires an exact allowlisted local `Origin`, an allowlisted
local `Host`, `Sec-Fetch-Site: same-origin`, and the custom request header
`X-GASOK-MIDNIGHT-UI: 1`. Its default development authorities are the
`127.0.0.1:5173`/`localhost:5173` proxy and literal-loopback port 4200; there is
no wildcard. It also requires `application/json`, no query string, identity
content encoding, an exact request shape, a 4,096-byte body limit, and bounded
header/request timeouts. It does not enable CORS, bind to a LAN address, reflect
request values in errors, or log request bodies. Responses are `no-store`,
`nosniff`, and `no-referrer`. This is a development trust boundary, not a safe
remote or multi-user service.

---

## Auth

POST /auth/signup

POST /auth/login

GET /auth/me

---

## Health

GET /health

Public deployment health endpoint.

```json
{
  "status": "UP"
}
```

---

## Wallet

POST /wallet/connect

GET /wallet/me

---

## Receivable

Implemented

POST /receivables

GET /receivables

GET /receivables/funding-opportunities

GET /receivables/{id}

POST /receivables/{id}/chain-created

POST /receivables/{id}/verified

POST /receivables/{id}/tokenized

POST /receivables/{id}/funded

POST /receivables/{id}/repaid

The local Midnight UI reuses `GET /receivables` and
`GET /receivables/funding-opportunities` only to select an authenticated public
receivable context. No Midnight endpoint, raw financial value, PIN,
authorization, session ID, or proof capability is added to Spring Boot or
MySQL. No local capability file is uploaded to Spring, and no automatic
issuer-to-Funder delivery is routed through the backend. `/midnight/prove` uses
Seller/Buyer-related records; `/midnight` uses
TOKENIZED opportunities or records already assigned to the authenticated
Funder.

---

## Receivable Chain Created

Seller-only synchronization after a confirmed `createReceivable` transaction.
This endpoint stores blockchain metadata and keeps the receivable status as `CREATED`.

```json
{
  "onchainReceivableId": "1",
  "txHash": "0x...",
  "contractAddress": "0x..."
}
```

## Receivable Verified

Buyer-only synchronization after a confirmed `verifyReceivable` transaction.
This endpoint changes `CREATED` to `VERIFIED` and adds status history.

```json
{
  "txHash": "0x..."
}
```

## Receivable Tokenized

Seller-only synchronization after a confirmed `tokenizeReceivable` transaction.
This endpoint changes `VERIFIED` to `TOKENIZED`, stores the RPC-verified NFT token
ID and transaction hash, and adds status history.

```json
{
  "txHash": "0x..."
}
```

The client does not submit `tokenId`. The backend uses only `eventTokenId` from
the matching RPC-verified `TOKENIZE_RECEIVABLE` journal proof.

## Funding Opportunities

Returns only unassigned `TOKENIZED` receivables for which the authenticated
company is neither Seller nor Buyer. A candidate may read that receivable detail,
but transaction-list access is limited to the candidate's own FUND_RECEIVABLE
journal rows until it becomes the assigned Funder.

## Receivable Funded

Third-party Funder synchronization after a confirmed `fundReceivable`
transaction. This endpoint changes `TOKENIZED` to `FUNDED`, stores the
authenticated Funder company and wallet, configured MockKRW address, funding
transaction hash, and status history.

```json
{
  "txHash": "0x..."
}
```

The client does not submit the Funder identity, payment-token address, or token
ID. The backend derives them from authentication, server configuration, and the
RPC-verified FUND_RECEIVABLE proof.

## Receivable Repaid

Buyer-only synchronization after a confirmed `repayReceivable` transaction. This
endpoint changes `FUNDED` to `REPAID`, stores the repayment transaction hash, and
adds status history.

```json
{
  "txHash": "0x..."
}
```

The client does not submit the repayment recipient, face value, or token ID. The
backend derives the Buyer from authentication and accepts only the
RPC-verified REPAY_RECEIVABLE proof. The verified `ReceivableRepaid` recipient
must equal the recipient of the MockKRW Transfer from Buyer for the full face
value. It is the current NFT owner and may differ from the original Funder.

Synchronization rules

- Same metadata retry is idempotent and returns the current receivable.
- Different metadata retry returns `409 / BLOCKCHAIN_METADATA_CONFLICT`.
- Verification before chain creation returns `409 / RECEIVABLE_NOT_ONCHAIN`.
- Tokenization before Buyer verification returns
  `409 / RECEIVABLE_NOT_VERIFIED_ONCHAIN`.
- Funding before tokenization returns
  `409 / RECEIVABLE_NOT_TOKENIZED_ONCHAIN`.
- Repayment before Funding returns
  `409 / RECEIVABLE_NOT_FUNDED_ONCHAIN`.
- A wrong state returns `409 / INVALID_RECEIVABLE_STATUS`.
- Seller-only and Buyer-only violations return `403 / ONLY_SELLER` or `403 / ONLY_BUYER`.
- Seller or Buyer Funding returns `403 / RELATED_PARTY_CANNOT_FUND`.
- Backend does not sign or submit blockchain transactions.

---

## Transaction

Implemented.

POST /blockchain-transactions

PATCH /blockchain-transactions/{txHash}/confirmed

PATCH /blockchain-transactions/{txHash}/failed

GET /receivables/{id}/transactions

Create a PENDING journal entry immediately after MetaMask returns a transaction
hash.

```json
{
  "receivableId": 1,
  "transactionType": "CREATE_RECEIVABLE",
  "contractAddress": "0x...",
  "txHash": "0x..."
}
```

Supported transaction types

- `CREATE_RECEIVABLE`
- `VERIFY_RECEIVABLE`
- `TOKENIZE_RECEIVABLE`
- `FUND_RECEIVABLE`
- `REPAY_RECEIVABLE`

The backend derives company, wallet, chain ID, and contract function from the
authenticated user, receivable, and transaction type.

While the row is PENDING, the returned chain ID is a provisional stored
wallet-mapping snapshot. Successful confirmation replaces it with the chain ID
read from the configured backend RPC network.

Request backend confirmation after the browser observes a successful receipt:

```json
{
  "blockNumber": "12345",
  "gasUsed": "21000",
  "effectiveGasPrice": "1000000000"
}
```

The three request values remain decimal strings and are validated for transport
compatibility, but they are advisory. The backend independently fetches and
validates the transaction, receipt, canonical block, confirmation depth, calldata,
and contract events. CONFIRMED stores only RPC-derived chain/block/gas/event proof
data.

Confirmed responses also include `blockHash`, `eventReceivableId`,
`eventTokenId` for TOKENIZE, FUND, and REPAY, `rpcVerifiedAt`, and
`verificationVersion`. Integer values are serialized as JSON strings.

Mark a definitively failed or replaced transaction:

```json
{
  "errorCode": "TRANSACTION_REPLACED",
  "errorMessage": "replacement transaction used"
}
```

Journal rules

- Transaction hashes and addresses are normalized to lowercase.
- The same submission and same status transition retry are idempotent.
- Reusing a transaction hash with different metadata returns
  `409 / BLOCKCHAIN_TRANSACTION_CONFLICT`.
- Only the submitting company can confirm or fail its transaction.
- Seller, Buyer, and assigned Funder can list all receivable transactions.
  An unassigned Funding candidate sees only its own FUND_RECEIVABLE rows.
- Transaction lists are ordered by `submittedAt` descending and then journal ID
  descending. Tokenization recovery must inspect every TOKENIZE row: an earlier
  CONFIRMED result takes priority over a later PENDING or FAILED attempt.
- The journal response does not contain browser-only replacement metadata such as
  nonce, calldata, scan cursor, or replacement links. Preserve an existing local
  recovery payload when its hash matches a PENDING journal row.
- Receipt integers are sent and returned as decimal strings.
- `chain-created`, `verified`, `tokenized`, `funded`, and `repaid`
  synchronization require a matching CONFIRMED journal entry with
  `rpcVerifiedAt` and the expected emitted receivable ID.
- REPAY_RECEIVABLE also requires the verified token ID to match the DB token ID.
- A legacy CONFIRMED row without `rpcVerifiedAt` is verified and backfilled through
  RPC before it can authorize a new synchronization.
- The backend revalidates even a previously verified CONFIRMED proof immediately
  before the first lifecycle write and refreshes it if the canonical placement
  changed.
- RPC/network/receipt/confirmation/reorg uncertainty leaves the row retryable.
- Only after a coherent canonical proof reaches the required confirmation depth
  does a reverted receipt or deterministic transaction/event mismatch mark the
  unsynchronized row FAILED.
- Success and failure writes compare `verificationVersion`; a stale concurrent
  result returns a retryable conflict instead of overwriting newer proof.
- A failure write checks the receivable lifecycle hash and cannot downgrade a
  transaction that is already synchronized.

Journal error codes

- `400 / INVALID_TRANSACTION_TYPE`
- `400 / INVALID_TRANSACTION_HASH`
- `400 / INVALID_RECEIPT_METADATA`
- `403 / ONLY_SELLER` or `403 / ONLY_BUYER`
- `403 / RELATED_PARTY_CANNOT_FUND`
- `404 / BLOCKCHAIN_TRANSACTION_NOT_FOUND`
- `409 / BLOCKCHAIN_TRANSACTION_CONFLICT`
- `409 / INVALID_BLOCKCHAIN_TRANSACTION_STATUS`
- `409 / BLOCKCHAIN_TRANSACTION_NOT_CONFIRMED`
- `409 / INVALID_RECEIVABLE_STATUS`
- `409 / CONTRACT_ADDRESS_MISMATCH`
- `409 / RECEIVABLE_WALLET_NOT_MAPPED`
- `409 / FUNDER_WALLET_NOT_CONNECTED`
- `409 / BLOCKCHAIN_TRANSACTION_PENDING`
- `409 / BLOCKCHAIN_CONFIRMATIONS_PENDING`
- `409 / BLOCKCHAIN_CANONICAL_BLOCK_PENDING`
- `409 / BLOCKCHAIN_REORG_DETECTED`
- `409 / BLOCKCHAIN_TRANSACTION_REVERTED`
- `409 / BLOCKCHAIN_TRANSACTION_VERIFICATION_FAILED`
- `409 / BLOCKCHAIN_EVENT_MISMATCH`
- `409 / BLOCKCHAIN_SYNCHRONIZATION_EVENT_MISMATCH`
- `409 / BLOCKCHAIN_VERIFICATION_RETRY_REQUIRED`
- `502 / BLOCKCHAIN_RPC_INVALID_RESPONSE`
- `503 / BLOCKCHAIN_RPC_NOT_CONFIGURED`
- `503 / BLOCKCHAIN_RPC_CONFIGURATION_MISMATCH`
- `503 / BLOCKCHAIN_RPC_UNAVAILABLE`

---

## Error Response

All API errors use the same JSON shape.

- status
- code
- message
- path
- timestamp
- fieldErrors

Wallet conflict

- HTTP 409
- code = WALLET_ALREADY_MAPPED

Authentication required

- HTTP 401
- code = AUTHENTICATION_REQUIRED

Access denied

- HTTP 403
- code = ACCESS_DENIED
