# WORKFLOW

## Current Midnight v2 Product Flow

Current operation is the approved ADR-023 synthetic Preview demo. The historical
raw-input/local transport sections below do not replace it. Follow
[the reference harness](MIDNIGHT_REFERENCE_HARNESS.md) before applying external examples.

```text
Funder selects unassigned TOKENIZED receivable + SELLER/BUYER
  -> Funder enters public criteria and validity (not subject facts)
  -> Spring creates REQUESTED request with random requestId and exact audience
  -> selected Seller/Buyer sees assigned request
      -> deny => DENIED (not an ineligible result)
      -> or select a named synthetic profile
      -> authenticated gateway derives request context and expands the fixture
      -> Bridge creates request-bound challenge and internal nonce
      -> canonical role wallet signs EIP-712 v2 consent
      -> Provider 2 signs exact facts/context/policy/freshness
      -> Proof Server generates proof
      -> Midnight Node finalizes transaction
      -> Bridge atomically stores encrypted capability in local outbox
  -> Vue POSTs capability directly to Spring complete
      -> Spring validates/binds/encrypts it and records SUBMITTED
      -> only then Vue ACKs Bridge and removes recoverable outbox record
  -> Funder resolves the request through Spring
      -> Read API recomputes context/lookup and reads Indexer
      -> temporary Indexer not-found: remain SUBMITTED and retry
      -> valid result: COMPLETED with criteria satisfied/not satisfied
      -> permanent invalid capability: FAILED + envelope purge + active release
```

The normal v2 workflow never asks a human to copy JSON or enter a PIN. If Vue
or the Bridge restarts after finalization but before Spring delivery, it calls
Bridge `recover` with the request ID and resumes the same delivery; it never
signs or submits another proof. A completed request remains active until
`validUntil` so the same Funder cannot immediately probe the same
receivable/role with slightly different thresholds.

The v2 MetaMask authorization is valid for at most 120 seconds and never beyond
the Funder policy deadline: `expiresAt = min(issuedAt + 120, validUntil)`.
Depending on the remaining policy lifetime, the displayed signing window is
1..120 seconds; an already-expired policy cannot create a challenge.

The result represents a Mock Provider-attested synthetic tuple and the Compact
evaluation of the displayed criteria. It is not a bank/accounting
check, GIWA Funding approval, or an automatic Funding transaction gate.
The hosted operator handles synthetic witness values. Independent review of
signature-reduction constraints is tracked in [the comparison](MIDNIGHT_SKILLS_REVIEW.md);
historical successful runs do not establish a complete cryptographic audit.

## Historical v1 Diagnostic Flow

Any later section describing a fixed policy, PIN, clipboard/file capability,
or `/v1` endpoint is an ADR-008 through ADR-020 learning record only. Current
product routes are `/midnight` for requested policies and `/midnight/prove` for
assigned Seller/Buyer consent; legacy tools live under `/midnight/legacy/*`.

## GASOK Main Business Flow

회원가입
↓
로그인
↓
MetaMask 연결
↓
기업-지갑 매핑
↓
채권 등록
↓
Buyer 채권 내용 검토
↓
Seller GIWA 채권 생성
↓
Buyer 명시적 채무 확인 + GIWA 지갑 검증
↓
토큰화
↓
제3자 Funder가 TOKENIZED 채권 선택
↓
잔액 부족 시 Funder가 사전 예치된 데모 mKRW 1회 충전
↓
Funder MockKRW 사용 승인
↓
Funder 자금 공급 + Seller mKRW 지급 + NFT 이전
↓
Backend RPC 검증 + DB FUNDED 동기화
↓
Buyer가 faceValue와 현재 NFT 소유자 확인
↓
잔액 부족 시 Buyer가 사전 예치된 데모 mKRW 1회 충전
↓
Buyer MockKRW 사용 승인
↓
Buyer 상환 + 현재 NFT 소유자에게 faceValue 지급
↓
Backend ReceivableRepaid + MockKRW Transfer RPC 검증
↓
DB REPAID 동기화

## Historical v1: GASOK Midnight PoC Flow

Midnight functionality is implemented only on the `gasok-midnight` branch.

The Midnight integration is a local-only privacy proof-of-concept.
It must not change the production GIWA funding architecture.

The existing GASOK flow remains intact.
Midnight is inserted only as an additional eligibility check over
caller-supplied mock financial inputs, bound to a per-receivable Seller/Buyer
role context.

Phase 2.5 proof creation is complete through the CLI: the Mock Provider resolves
receivable `#1` and its canonical role wallets from GIWA RPC, then separate
role-bound proofs produce separate opaque ledger keys. The inputs remain
caller-supplied mock values and are not proven to belong to those wallets. The
read side is also complete for the local PoC: an intended Funder can explicitly
import one intentionally shared Proof capability from the clipboard or a local
file in the development-only Vue page, which requests an exact result from the
pinned local adapter. This remains reference information, not a Funding gate.

ADR-017 code adds a separate Provider 2 issuance gate without moving proof
submission into Vue. The CLI keeps the private values and hidden salt, hands a
two-minute EIP-712 request to `/midnight/authorize`, receives one-line MetaMask
signature JSON back, and then asks the Provider for its Schnorr attestation.
Provider 1 results remain legacy. The actual Provider 2 registration,
Seller MetaMask-signing handoff, and full CLI-submitted local Midnight runtime
E2E have now completed. The manual `/midnight/authorize` route remains available
for learning and diagnostics by direct dev URL only; product-facing verifier
and prover pages do not link to it.

ADR-018 adds the complete development-only Vue path without changing GIWA or
Spring. `/midnight/prove` sends the private mock tuple once to a trusted
loopback Proof Bridge, clears it after challenge creation, asks MetaMask to
authorize the canonical role only after an explicit user action, and polls the
Bridge while it attests, proves, and submits through the existing CLI-compatible
Midnight wallet/private state. The completed capability is then resolved through
the independent read adapter and Indexer. This is a custodial local PoC, not a
Funding gate or production wallet design.

Issuance and verification have different reuse rules. The first intended result
for every receivable-role context requires a fresh challenge, Provider
attestation, proof, and ledger write; a different receivable or the opposite
role cannot reuse that attestation. After success, the exact capability may be
resolved repeatedly by an intended Funder without a new proof. The two-minute
challenge is issuance consent only, not result freshness.

### Historical v1 Local Actor Flow

This actor separation is implemented in the local Vue PoC. The bound proof
result still does not authorize or block any GIWA funding action. Making
Midnight eligibility a GIWA funding gate requires separate approval and an
architectural decision after browser proof submission and the remaining access
controls are proven.

The preserved Phase 3A read side accepts an explicitly imported,
correlation-sensitive Proof capability from the clipboard or a selected local
file and calls
`POST /v1/eligibility-results/resolve`. The adapter is the sole authority for
the pinned contract
`7e3ea9d741ce0f5862db6f46d0ad720be2586cd7d0405ec77e4a0478aa50f4fb`;
there is no Vue contract-address default and no anonymous GET result list. The
page first selects a Funder-visible DB record and Seller/Buyer role, then
requires the capability's synchronized onchain ID, approved contract, role, and
canonical wallet to match. `/midnight/prove` is the separate Seller/Buyer
issuer route: it selects an authenticated DB receivable, derives the onchain ID
and role, and requires that role wallet to sign. Neither route affects Funding.
Secure multi-user capability delivery and verifier access remain future work;
the explicit copy/export and clipboard/file import are local learning-PoC
handoffs only. The raw JSON form is reserved for advanced diagnostics. No
capability upload endpoint, automatic backend delivery, or server persistence
is introduced.

The UI separates Seller/Buyer/Funder actions, but the Bridge still represents
all issuers with one Midnight dev wallet, encrypted participant private state,
and `companySecret`. The parties are not independent Midnight identities, and
same-PIN capabilities may be cross-correlatable through that shared secret.
Per-company private state remains future work.

The 2026-08-19 DB `#4` Seller attempt correctly derived GIWA onchain `#1` but
reached an already-present exact lookup key. The Bridge running at 12:04 emitted
generic `PROOF_FAILED`; logs and ledger state diagnosed the exact duplicate
afterward. Updated code now maps/tests
`ELIGIBILITY_RESULT_ALREADY_EXISTS`, but has not yet run through a restarted
live Bridge/MetaMask E2E. This was not a Docker, Provider, Proof Server, Node,
Indexer, Bridge, or 502 failure. The correct workflow is to reuse the existing
saved capability; another PIN is not a supported bypass. If the artifact was
lost, the current MVP has no recovery path.

회원가입
↓
로그인
↓
MetaMask 연결
↓
기업-지갑 매핑
↓
채권 등록
  ↓
  Buyer 채권 내용 검토
  ↓
  Seller GIWA 채권 생성
  ↓
  Buyer 명시적 채무 확인 + GIWA 지갑 검증
  ↓
  토큰화
  ↓
  Seller/Buyer가 매출채권 화면에서 자신의 DB 채권을 선택
  ↓
  Vue가 동기화된 온체인 ID와 현재 회사의 Seller/Buyer 역할을 자동 파생
  ↓
  각 역할 당사자가 `/midnight/prove`에서 비공개 mock 재무값과 임시 PIN 입력
  ↓
  Bridge가 Provider 2 challenge를 준비하고 Vue가 raw 입력을 즉시 제거
  ↓
  Seller 또는 Buyer canonical 역할 지갑이 MetaMask EIP-712 서명
  (Funder가 대신 서명하지 않음)
  ↓
  Mock Provider attestation → Proof Server ZK proof → Midnight Node 검증/기록
  ↓
  Vue가 capability로 Read API/Indexer 결과를 독립 재조회
  ↓
  Seller/Buyer가 상관관계 민감 capability를 명시적으로 클립보드에 복사하거나
  로컬 파일로 내보내 의도한 Funder에게 전달
  ↓
  제3자 Funder가 TOKENIZED 채권 선택
  ↓
  Funder가 `/midnight`에서 같은 DB 채권과 Seller/Buyer 역할을 선택하고
  클립보드/파일 capability를 명시적으로 가져와 문맥 일치/결과를 확인
  (같은 capability 재조회에는 새 attestation/proof가 필요하지 않음)
  ↓
  별도 승인 전에는 참고 정보로만 표시하고 Funding gate로 사용하지 않음
  ↓
  잔액 부족 시 Funder가 사전 예치된 데모 mKRW 1회 충전
  ↓
  Funder MockKRW 사용 승인
  ↓
  Funder 자금 공급 + Seller mKRW 지급 + NFT 이전
  ↓
  Backend RPC 검증 + DB FUNDED 동기화
  ↓
  Buyer가 faceValue와 현재 NFT 소유자 확인
  ↓
  잔액 부족 시 Buyer가 사전 예치된 데모 mKRW 1회 충전
  ↓
  Buyer MockKRW 사용 승인
  ↓
  Buyer 상환 + 현재 NFT 소유자에게 faceValue 지급
  ↓
  Backend ReceivableRepaid + MockKRW Transfer RPC 검증
  ↓
  DB REPAID 동기화

## Historical v1: Midnight PoC Development Workflow

Midnight development must follow the order below.

Do not skip directly to frontend integration.

1. Create and switch to the `gasok-midnight` branch.
2. Add `giwa-midnight/` as the dedicated Midnight workspace under the GASOK root.
   It is a Git submodule backed by `https://github.com/leonid-world/giwa-midnight.git`.
   The legacy untracked `midnight/` directory is not the PoC workspace and must
   not receive implementation files.
3. Reproduce the official Midnight ZK Loan tutorial inside `giwa-midnight/`
   without GASOK-specific behavioral modifications.
4. Compile the original Compact contract successfully.
5. Start the local Midnight development environment.
   - Midnight Node
   - Midnight Indexer
   - Midnight Proof Server
6. Run the official CLI flow end-to-end.
   - deploy Compact contract
   - register Mock Attestation Provider
   - request attestation
   - generate ZK proof
   - submit Midnight transaction
   - query public verification result
7. Replace ZK Loan credit data with GASOK financial data.
8. Verify the GASOK financial eligibility flow through CLI.
9. Bind separate Seller and Buyer proofs to the canonical GIWA receivable
   context and verify both through CLI.
10. Integrate the exact, capability-based read side into the existing Vue
    frontend through the adapter's single pinned contract authority.
11. Add the Provider 2 two-step CLI/Vue EIP-712 authorization handoff while raw
    financial values remain in CLI/Provider memory for that manual flow.
12. Register Provider 2 and verify the actual MetaMask authorization plus local
    attestation, proof submission, and Indexer result end to end.
13. Add the approved trusted local Proof Bridge and `/midnight/prove`; verify
    challenge, explicit MetaMask authorization, Provider attestation, proof,
    transaction submission, status polling, and independent Indexer resolution.
14. Treat secure multi-user capability delivery/access and direct Vue + Lace
    self-custody as separate later architectures. Current official local Lace
    support means this is a product/identity migration choice, not a platform
    blocker.
15. Keep Spring limited to the existing authenticated receivable reads unless
    further backend proof coordination is required by the proven browser flow.

## Historical v1: Midnight Verification Rules

The initial PoC may use rules such as:

- annualRevenue >= 500,000,000 KRW
- debtRatio <= 200%
- overdueCount <= 1

These values are private inputs.

The browser form keeps protocol ranges separate from those policy thresholds:

- annual revenue: integer KRW in `Uint<64>`; display commas are accepted and
  removed before the Bridge request
- debt ratio: human percentage with up to two decimal places, converted exactly
  to `Uint<32>` basis points (`85.5% = 8550`, `200% = 20000`)
- overdue count: `Uint<16>` in `0..65535`
- pseudonym PIN: disposable `Uint<16>` in `0..65535`; not a login, wallet,
  bank, card, or company password and not a proof of company identity

The PIN is not a refresh counter. Compact rejects only an already-present exact
lookup key, so changing the PIN can create another unordered pseudonym/result
for the same receivable-role. The product UX must instead map
`ELIGIBILITY_RESULT_ALREADY_EXISTS` to existing-capability reuse. Lost
capability recovery is unsupported in the current MVP.

An input outside the three policy thresholds remains valid and produces a
valid `eligible=false` proof. It is not rejected merely for being ineligible.

Raw financial values must not be written to:

- Midnight public ledger state
- GASOK MySQL
- application logs
- committed local files

The Phase 2.5 public eligibility-result entries may expose only:

- eligible
- providerId
- policyVersion
- opaque receivable-eligibility lookup key
- sealed GIWA chain and ReceivableFinance deployment configuration

The contract admin and registered Provider public-key registry are also public
control-plane state. They are not financial result fields.

The CLI proof capability additionally contains the pseudonymous company
commitment and GIWA/Midnight correlation context required to interpret the
opaque key. It must be shared only with an intended verifier. Risk tiers,
maximum funding ratios, legal-company identity, issued/freshness/latest/expiry
semantics, refresh rounds, and Funding enforcement remain deferred until their
policies are approved.

A future reusable company-wide attestation would require a separate ADR for a
time-bounded/revocable company credential and fresh per-receivable-role ZK
presentations/nullifiers. It must preserve cross-receivable/role replay
protection rather than removing the current signed binding.

## Historical v1: Trust Boundary

The GASOK Attestation API is a mock provider for local demonstration purposes.

It does not prove that financial data originated from:

- a real bank
- a tax authority
- an accounting firm
- an ERP provider

Midnight verifies:

- that the financial data was signed by a registered provider
- that the signed data was not modified
- that the signature is bound to the encoded GIWA receivable party and Midnight deployment
- that the Compact Circuit was executed correctly
- that the Zero-Knowledge Proof is valid

The Mock Provider verifies through GIWA RPC which Seller or Buyer wallet the
configured ReceivableFinance contract records, then labels the caller-supplied
mock inputs with that role context. Provider 2 also issues a bounded two-minute
challenge, consumes it once, recomputes the salted private-request commitment,
and recovers the canonical EOA from the EIP-712 response before Schnorr
issuance. Provider 1 does not have that gate and is legacy.

In ADR-018, Vue sees the raw mock tuple and PIN only until the Bridge returns a
challenge, then clears them. The trusted loopback Bridge owns the existing
Midnight development wallet and encrypted participant private state. The local
Proof Server receives the plaintext witness needed to construct the proof but
never the wallet key. MetaMask signs only the GIWA role EIP-712 request. The
Midnight public ledger receives only the opaque key and minimal result.

The Compact circuit verifies the registered Provider's Schnorr signature; it
does not independently verify the secp256k1 EIP-712 signature. Provider 2
therefore proves canonical role-wallet control only at issuance time. It does
not prove that the inputs belong to that wallet, real-world financial truth,
legal-company identity, bank/accounting provenance, current eligibility, or
Funding approval.

## Historical v1: Local Development Rules

Use only the local Midnight `undeployed` network.

Expected local components:

- GASOK Vue frontend
- GASOK Spring Boot backend
- GIWA testnet integration
- Midnight Local Node
- Midnight Indexer
- Midnight Proof Server
- GASOK Mock Attestation API
- Midnight CLI
- Midnight Local Proof Bridge on `127.0.0.1:4200`

Do not deploy Midnight contracts to Preprod or Mainnet.

Do not replace Vue with React.

The official Midnight React examples may be used only as implementation references.

Do not modify existing GIWA Solidity contracts unless Midnight integration explicitly requires it.

## Historical v1: Phase Completion Criteria

### Phase 1 — Official Midnight Example

- Compact contract compiles successfully.
- Midnight Node is running.
- Midnight Indexer is running.
- Midnight Proof Server is running.
- Official CLI can deploy the contract.
- Mock Attestation Provider can be registered.
- ZK Proof generation succeeds.
- Midnight transaction submission succeeds.
- Public contract state can be queried.

### Phase 2 — GASOK Domain Mapping

- GASOK financial fields are used instead of ZK Loan credit fields.
- Financial data is passed as private input.
- Provider signature validation succeeds.
- Invalid provider signatures are rejected.
- Eligibility rules are enforced by the Compact Circuit.
- Raw financial values are not stored publicly.
- Verification results can be queried through CLI.

### Phase 2.5 — GIWA Receivable-Subject Binding

- [x] The local contract seals GIWA chain `91342` and ReceivableFinance
  `0x0f264334f98BA0d22f7Fc6Bb901a5Fa36158a315`.
- [x] The Mock Provider resolves the canonical Seller/Buyer wallet by uint256
  receivable ID through GIWA RPC.
- [x] The signed eight-field message binds private values,
  company-commitment hash, GIWA context, Midnight deployment, provider, and
  policy.
- [x] Seller and Buyer use different opaque lookup keys for the same receivable.
- [x] Exact same-key replay is rejected.
- [x] CLI E2E produced Seller `true` and Buyer `false` for receivable `#1`.
- [ ] Independent actors, refresh/expiry policy, and secure capability delivery
  remain future work.

### ADR-017 — Provider 2 Role-Wallet Authorization

- [x] The Provider issues a bounded, random, two-minute EIP-712 challenge and
  consumes it on the first attestation attempt.
- [x] The CLI keeps raw financial values and hidden salt private while handing
  only the typed request to Vue and accepting a one-line response.
- [x] The dev-only `/midnight/authorize` route validates exact context, selects
  the canonical MetaMask EOA, signs, and verifies the recovered signer.
- [x] Provider 2 re-resolves the GIWA role, recomputes the private commitment,
  and recovers the EOA before issuing the unchanged Schnorr attestation.
- [x] Provider 1 is displayed as legacy without wallet authorization; Compact
  and Midnight are not described as independently verifying EIP-712.
- [x] Register Provider 2 on the current replacement deployment and confirm one
  registered Provider in public contract state.
- [x] Execute a real Seller MetaMask authorization followed by the full local
  attestation/proof/transaction/Indexer E2E.

### Phase 3 — Vue Integration

- [x] Existing Vue project structure is preserved.
- [x] React dependencies are not introduced.
- [x] Midnight code is isolated in dedicated services or composables.
- [x] A dev-only `/midnight` page resolves one explicitly imported Proof
  capability through the localhost-only adapter without wallet, proof, or
  private-state access, after matching it to an authenticated Funder-visible DB
  record and selected Seller/Buyer role.
- [x] The adapter pins the approved Phase 2.5 contract and exposes only exact
  `POST /v1/eligibility-results/resolve`; anonymous result enumeration is absent.
- [x] The page distinguishes Provider 2 wallet-authorized issuance from Provider
  1 legacy results without claiming current capability-presenter wallet control,
  company identity, bank verification, data truth, funding approval, or a
  Funding gate.
- [x] Live API smoke resolved receivable `#1` Seller `true` and Buyer `false`,
  and rejected a tampered capability with HTTP 400.
- [x] Actual development-browser capability submissions resolved Seller `true`
  and Buyer `false`, including the valid-proof explanation for `false`. This
  verifies the read path only, not browser proof submission.
- [x] A separate development-only `/midnight/authorize` tool performs the
  Provider 2 MetaMask signing handoff without raw financial values,
  Attestation/Spring/Midnight HTTP requests, browser persistence, or Funding
  integration.
- [ ] Add direct exhaustive unit tests for the complete pre-existing capability
  validation/response module and role-authorization schema/real-signer module.
  The focused proof-flow suite covers its mocked integration boundary,
  timeout/abort, races, same-origin configuration, and both route flags.
- [x] Choose and approve ADR-018's trusted local Proof Bridge to reuse the
  proven CLI identity/state. The choice is not based on a Lace limitation;
  current official Local Dev supports Lace on `undeployed`.
- [x] Complete the loopback port-4200 Bridge with exact body-only, one-shot,
  single-active proof sessions, a common CLI/Bridge private-state lock, bounded
  errors/timeouts, idempotent cleanup attempts after both success and failure,
  and mandatory stale-witness sanitization before a later prepare.
- [x] Expire unsigned prepared sessions on an internal deadline timer, discard
  their tuple, and free the single active slot without requiring another poll.
- [x] Purge terminal capability/error/status records automatically after 60
  seconds without waiting for another request.
- [x] Bound startup Indexer preflight to 10 seconds, keep the server closed on
  failure, cache the sealed GIWA configuration, and issue no per-challenge
  Indexer query while raw inputs exist. The non-abortable SDK may leave one
  timed-out startup query internally pending, but it has seen no raw tuple.
- [x] Preserve the capability immediately after transaction finalization;
  expose `complete` and recover delayed visibility through resolver-only retry
  without proof resubmission.
- [x] Complete the development-only `/midnight/prove` route with transient
  private inputs, immediate post-challenge clearing, explicit MetaMask action,
  status polling, no automatic submission retry, and independent read-API
  resolution of the returned capability.
- [x] Run the Vue checks on Node 24.19.0: 14 files / 103 tests, full
  ESLint/Oxlint, changed-file Prettier, the production Vite build, and a high-
  severity npm audit with zero findings. These do not complete
  the broader legacy capability/authorization test item above.
- [x] Confirm the production artifact excludes the proof route registration,
  proof view/service chunk, and proof API marker, then run a live Seller `#1`
  Vue → Bridge challenge smoke; after challenge creation all
  four private values were absent from DOM/captured console output.
- [ ] Remove the dead `midnight-prove` route-name string still present in the
  production Receivables asset if complete compile-time elimination is desired;
  the disabled CTA string is not a security boundary.
- [ ] Repeat the live browser path with MetaMask. The in-app browser lacked a
  provider, so signing, proof submission, transaction, and resolution were not
  exercised by that smoke.
- [x] On Node 22.21.1, verify 125 CLI tests passed with 1 optional environment
  test skipped, plus CLI typecheck/build, 74/74 Attestation tests and build,
  diff-check, and a
  high-severity npm audit with zero findings after the locked Restify transitive
  overrides.
- [ ] Run a real Seller and Buyer browser-triggered local Bridge E2E before
  marking the Phase 3B runtime complete.
- [ ] Design secure capability delivery and verifier access before any remote or
  multi-user use; direct loopback response solves only the local learning PoC.
- [ ] Consider direct Vue + Lace only as a separately approved self-custody
  replacement with participant/private-state migration.

ADR-017/019 verification includes the complete Attestation API suite `74/74`,
CLI `125` with `1` optional environment E2E skipped, Vue 14 files / 103 tests,
full ESLint/Oxlint, changed-file Prettier, production build, and the
separate live Seller Provider 2 MetaMask-to-Midnight transaction at block
`2854`. This proves the local CLI-submitted flow, not browser proof submission,
financial-data truth, or a Funding gate.
