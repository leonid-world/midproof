## Current compliance fixes — 2026-09-18

[MIDNIGHT_COMPLIANCE_FIXES.md](MIDNIGHT_COMPLIANCE_FIXES.md) records current source
fixes, 834 automatic tests and four isolated native proof/verifier cases. Canonical
Schnorr reduction bounds changed verifyEligibility keys. Full compile artifacts are
guarded by the normal build; existing Preview must undergo an explicit reviewed
key transition before the new runtime is published. Public C10 acceptance remains
pending. Do not reset state or run the migrated local wallet alongside Railway.

## Current hosted-demo approval — 2026-09-15

The owner approved ADR-023: a synthetic hackathon demo on Preview, one IntelliJ
Run and one integrated Railway app deployment, with the existing MySQL and Vercel.
This supersedes the local-only execution requirements below, while preserving
Compact verification, mock disclosure, GIWA transaction ownership and the ban on
Preprod/Mainnet. See ARCHITECTURE.md and DEPLOYMENT.md for the current runtime.
Historical success records below do not establish that this new hosted setup has
completed a live proof. Current verification and blockers belong in CONTEXT.md.
External skills are filtered through [the reference harness](MIDNIGHT_REFERENCE_HARNESS.md)
and [the source comparison](MIDNIGHT_SKILLS_REVIEW.md), including an unresolved
static-review concern about Schnorr reduction constraints. Existing test/live
records are not a cryptographic soundness certification.

# GASOK Midnight PoC

## Current Protocol: Funder Request-Bound v2

The normal product flow implements ADR-021. A Funder selects a public GASOK
receivable/subject and enters underwriting criteria: minimum annual revenue,
maximum debt ratio, maximum overdue count, and validity duration. Those values
are criteria, not purported Seller/Buyer facts. Spring generates a non-zero
32-byte request ID and binds the exact requesting Funder wallet, canonical
Seller/Buyer role wallet, GIWA deployment/receivable, criteria, and deadline.

The assigned Seller or Buyer sees the complete audience and policy before
deciding whether to deny or continue. In the current hosted mode it selects a
named synthetic profile; the gateway expands its fixed values. The earlier local
mode accepts caller-supplied mock facts transiently. The canonical role wallet signs
an EIP-712 v2 authorization. Provider 2 is fictional: it verifies that wallet
control and signs the synthetic tuple/context, but it does not establish the
tuple's bank, tax, ERP, accounting, or legal-company provenance.

The role-wallet authorization window is bounded by both transport and policy:
`expiresAt = min(issuedAt + 120 seconds, validUntil)`. The effective v2 TTL is
1..120 seconds; it is not always two minutes. A challenge at or after the
policy deadline is rejected, so there is no final 119-second dead zone between
authorization and policy expiry.

Compact evaluation version 2 computes:

```text
annualRevenueKrw >= minAnnualRevenueKrw
AND debtRatioBps <= maxDebtRatioBps
AND overdueCount <= maxOverdueCount
```

It publishes only the combined boolean plus Provider ID, evaluation version,
`profileAsOf`, and `validUntil` behind an opaque lookup key. It does not expose
the raw tuple or which individual predicate failed. Exact expiry is exclusive:
at `blockTime >= validUntil` the proof is rejected.

The policy-request hash is domain separated and includes request ID, intended
Funder wallet, all three criteria, deadline, and evaluation version. The lookup
also binds request-scoped company commitment, GIWA receivable/role/wallet,
ReceivableFinance/chain, and Midnight deployment. Provider 2's Schnorr message
contains exactly these eleven ordered fields:

1. annual revenue
2. debt ratio in basis points
3. overdue count
4. company commitment hash
5. GIWA binding hash
6. Midnight deployment hash
7. policy request hash
8. Provider ID
9. evaluation version `2`
10. `profileAsOf`
11. `validUntil`

The product path has no PIN. The Bridge generates a random `Uint<16>`
pseudonym nonce and derives the company commitment with `requestId`, so a nonce
collision does not make two requests share the same commitment. The nonce is
never returned to Vue/Spring and is not authentication or a legal identity.

## v2 Delivery and Read Lifecycle

Spring states normally move `REQUESTED -> SUBMITTED -> COMPLETED`. Vue never
renders or asks a person to move the capability JSON. The Bridge atomically
encrypts/persists a finalized capability before reporting `complete`; Vue sends
it to Spring, and Spring encrypts the canonical capability with AES-256-GCM.
Only after Spring confirms `SUBMITTED` or the idempotent already-`COMPLETED`
state does Vue ACK the Bridge, which deletes the recoverable outbox record.
Reload/restart before ACK uses `requestId` recovery and does not create another
proof.

The Funder resolves through Spring, which decrypts the envelope only in memory
and calls the loopback Read API. The Read API recomputes the policy hash and
lookup and checks request/audience/criteria/GIWA/deployment/freshness equality.
Indexer `not found` immediately after finalization is retryable and leaves the
row `SUBMITTED`. A permanent invalid/mismatched capability changes the row to
`FAILED`, purges the encrypted envelope, and releases its active marker.

One active unexpired request is allowed per Funder, receivable, and subject
role, including a completed result through its `validUntil`. This raises the
cost of changing thresholds repeatedly but does not eliminate adaptive-query
leakage. Fixed policy templates, privacy budgets/cooldowns, audit/abuse
controls, revocation, and independent per-company Midnight private states are
still required before any remote multi-user use.

The v2 capability contains only binding/correlation material and freshness
metadata: deployment, company commitment, opaque lookup key, GIWA context,
role wallet, request/audience/criteria/policy hash, `profileAsOf`, and
`validUntil`. It contains no raw facts, nonce, Provider signature,
authorization, company secret, or witness. It is nevertheless sensitive and
is kept behind the local outbox and Spring encrypted envelope rather than shown
to either human actor.

## Historical local v2 evidence — not the current Preview deployment

- Contract:
  `12caaf76aef1de1c584b67462018810f6e4e7eb2535e136f560cb621e24a3f36`
- Provider 2 registration transaction:
  `006abe69d8ba934519e19c4490ce77be724f75aae1bcb4e6b4fcd720258aa10601`
- Registration block: `25714`
- Deterministic local Provider config: `PROVIDER_SECRET_KEY=2`
- Network: local `undeployed`; no Preprod/Mainnet deployment

The old v1 contract remains preserved and its results are not migrated or
silently accepted by the v2 path. The current checks are Compact contract
`39/39`, Mock Provider `87/87` across 4 files, Read API `60/60`, CLI `156`
passed plus `1` optional environment test skipped (12 passing files plus 1
skipped file), Vue
`141/141` across 21 files, and Spring full Gradle `86/86` including focused
Midnight `19/19`. CLI typecheck/build, Vue lint/build, Spring `bootJar`, and live
deploy/register/preflight also passed. A new full
MetaMask-to-Spring-to-Funder v2 browser E2E after all changed process restarts
remains pending and must not be inferred from those checks.

The completed boolean means only “the local Mock Provider-signed
caller-supplied tuple met this Funder request's displayed criteria.” It is not
bank/accounting verification, legal-company proof, GIWA Funding approval, or
an automatic Funding gate.

## Historical v1 record (ADR-008 through ADR-020)

The remaining fixed-policy, PIN, clipboard/file capability, `/v1`, and former
contract-address sections document the implementation learning path. They are
legacy diagnostics only under `/midnight/legacy/*`; they are not valid v2
product behavior or a fallback when a v2 request fails.

## Historical v1: Scope

The Midnight PoC exists only on the `gasok-midnight` branch. It privately
evaluates caller-supplied mock financial inputs and binds each result to the
canonical Seller or Buyer role context of a specific GASOK receivable. It is
local-only and uses the Midnight `undeployed` network.

`giwa-midnight/` is the dedicated workspace and Git submodule. Its target
structure is `contract/`, `api/`, `cli/`, `attestation-api/`, and
`docker-compose.yml`.

GIWA remains the sole system for receivable tokenization, funding, repayment,
wallet mapping, and asset transactions. Midnight does not replace or deploy a
GIWA Solidity contract.

## Historical v1: Trust Model

The GASOK Attestation API is a local mock provider. It signs demonstration
financial inputs but does not prove that they originated from a bank, tax
authority, accounting firm, or ERP provider. Product copy must call the result
"mock-attested" and must never describe it as bank-verified.

Midnight proves that a registered provider signed the witness data for the
specific encoded GIWA/Midnight context, the signed data was not modified, and
the Compact eligibility circuit executed correctly. It does not prove that the
underlying real-world financial data is truthful.

The Mock Provider reads the configured GIWA Sepolia ReceivableFinance contract
through RPC, confirms the receivable exists, and selects its canonical Seller or
Buyer wallet. This prevents a request from substituting an arbitrary wallet for
that role. It does not prove that the submitted financial inputs belong to that
party. Provider ID `2` additionally requires a two-minute, one-shot EIP-712
authorization from that canonical role wallet before issuing its mock
attestation. Provider ID `1` results predate that gate and remain legacy
role-context-only results. Neither policy is proof of legal-company identity,
financial-data truth, or bank/accounting provenance.

ADR-018 adds a trusted local Proof Bridge so the complete flow can be triggered
from Vue without creating a second Midnight identity. MetaMask authorizes only
the canonical GIWA role through EIP-712. The Bridge, not MetaMask, owns the
existing Midnight development wallet, balance, encrypted private state, proof
orchestration, and transaction submission. This is an explicit local custodial
boundary and must not be presented as a production or self-custody design.

ADR-019 separates the actors in the product-facing Vue flow. Seller and Buyer
are proof issuers for their own receivable roles; only the canonical wallet of
the derived role may authorize Provider 2. Funder is the intended verifier: it
receives a capability from one of those parties, selects the matching DB
receivable and role on `/midnight`, and reads the exact public result. The
Funder never signs a Seller/Buyer issuance request. Its MetaMask wallet remains
relevant to the separate GIWA Funding transaction, not to proving either
party's mock finances.

ADR-020 defines the local capability handoff. After independent resolution,
Seller/Buyer explicitly copy the capability or export a local capability file;
the Funder explicitly imports it from the clipboard or a selected file. Raw
one-line JSON remains available only for advanced learning and diagnostics.
This adds no automatic backend delivery, upload endpoint, server persistence,
browser storage, URL transport, or secure multi-user channel.
The generic export filename is `gasok-proof.gasok-proof`; import accepts bounded
non-empty UTF-8 `.gasok-proof` or `.json` content, validates the exact schema and
selected context, and waits for the Funder's separate `ZK 결과 확인` action
instead of resolving automatically.

That separation does not yet create independent Midnight identities. The
Bridge uses one Midnight dev wallet, one encrypted participant private state,
and one `companySecret` for every selected Seller/Buyer. Reusing a PIN in
different contexts derives commitments from the same secret, so a holder of
multiple capabilities may correlate them. Independent per-company
participants/private states and migration are still required before remote or
multi-user use.

## Historical v1: Private and Public Data

Private inputs are annual revenue, debt ratio, overdue count, PIN-derived
company identity material, attestation signature, the user secret, and witness
randomness. In the ADR-018 route, Vue holds the entered tuple and PIN only in
component memory until one challenge response, then removes them from its
reactive state. The loopback Bridge processes them in memory and reuses the
CLI-compatible encrypted private state at rest. The local Mock Attestation API
must see the raw values to sign them, and the local Proof Server must process
the plaintext witness to generate a proof; both are inside the local PoC trust
boundary and must not persist or log the values. The Proof Server does not
receive the Midnight wallet key.

Raw values must not be stored in Pinia, browser storage, URLs, console logs,
telemetry, MySQL, Midnight public state, committed files, or general application
logs. Bridge cleanup drops transient financial/signature references and removes
them from encrypted state after proof work. The encrypted write is temporary:
cleanup is marked before it begins, attempted after success or failure, retried
once, and rechecked before another prepare may proceed. JavaScript immutable
strings cannot be guaranteed to be zeroized, so this is bounded lifetime,
sanitization, and process isolation, not a perfect memory-erasure claim. A wallet mnemonic is separate
from contract private state: the interactive CLI accepts it locally and shows a
freshly generated mnemonic once without logging it. The Bridge deliberately
reuses the public disposable Local Dev genesis seed from the standalone flow;
it is never sent to Vue and must never be reused on a network or asset with
value.

The Phase 2.5 public map is limited to an opaque receivable-eligibility lookup
key and `{ eligible, providerId, policyVersion }`. The contract also exposes its
admin, registered Provider public-key registry, and sealed GIWA chain and
ReceivableFinance configuration. The public eligibility result entry contains no
raw financial value, signature, receivable ID, role, party wallet, company
commitment, or business number.

After a proof succeeds, the interactive CLI prints or the Bridge returns a
versioned proof capability containing the company commitment, lookup key,
Midnight deployment, GIWA chain and ReceivableFinance address, receivable ID,
role, and canonical party wallet. It contains no PIN, secret, raw financial
value, or provider signature. It is still correlation-sensitive because it
links an otherwise opaque ledger entry to a specific public GIWA party, so it
must be delivered only to the intended verifier and must not be logged or
committed. An explicit clipboard copy or exported local file can outlive Vue
component memory and remain in clipboard history, backups, sync clients, or
recoverable storage. Users must avoid shared/auto-synced folders, clear or
overwrite the clipboard after import, and delete obsolete files; Vue cannot
prove erasure outside its own memory.

For Provider 2, the browser-facing EIP-712 request contains public receivable
context and a salted `attestationRequestCommitment`, not the financial tuple or
hidden salt. In `/midnight/prove`, the request and response move directly
between Vue component memory and the loopback Bridge. The preserved
`/midnight/authorize` tool still supports the manual CLI handoff. Neither path
may place them in logs, URLs, browser storage, MySQL, or Midnight public state.

The company commitment remains derived from an encrypted local 32-byte secret
and a decimal `Uint<16>` PIN. Any value from `0` through `65535` is valid; there
is no correct or pre-registered PIN. It is disposable local pseudonym material,
not a login, MetaMask, card, bank, or company password. The 16-bit PIN alone is
not a security boundary. The commitment is not a legal business identity and
is deliberately not an unsalted hash of GASOK's low-entropy 10-digit business
number. Reusing the same secret/PIN/context derives the same one-shot lookup
key; choosing another PIN creates a different pseudonym, not an update or
revocation of the earlier result.

The product MVP therefore treats each receivable-role's first intended result
as one issuance and does not use a different PIN to bypass an existing result.
If Compact reports `ELIGIBILITY_RESULT_ALREADY_EXISTS`, the correct action is
to reuse the saved capability. There is no capability listing or reconstruction
path, so a lost capability is not recoverable in the current flow.

## Historical v1: DB, Onchain, and NFT Identifiers

The Spring/MySQL `receivableId`, GIWA `onchainReceivableId`, and ERC-721
`tokenId` are independent identifiers. Vue displays all available values and
never falls back from one to another.

- Seller/Buyer choose a DB record already visible to their authenticated
  company. `/midnight/prove` derives its synchronized onchain ID and the current
  company's role automatically.
- Only the onchain ID is used for Provider `getReceivable`, EIP-712, and Compact
  context binding.
- NFT token ID is evidence of tokenization and remains display-only for this
  proof flow.
- Funder selects the DB record and Seller/Buyer role before pasting a capability.
  Vue requires the capability's onchain ID, contract, role, and party wallet to
  match before asking the read API to resolve it.

The current local demo database illustrates why this separation is mandatory:
DB receivable `#5` maps to GIWA onchain receivable `#2` and NFT token `#2`.
Calling `getReceivable(5)` is therefore wrong even though the application page
is labelled `#5`.

## Historical v1: Phase 2.5 Signed Context

The current local Midnight contract address is
`7e3ea9d741ce0f5862db6f46d0ad720be2586cd7d0405ec77e4a0478aa50f4fb`.
It was constructed with the fixed GIWA context below:

- GIWA chain ID: `91342`
- ReceivableFinance:
  `0x0f264334f98BA0d22f7Fc6Bb901a5Fa36158a315`

The prior local deployment
`a8c0c1997c424dd1215d055fb5688200194263c7be5deef8b4e7620d2cdceb2c`
is historical only. Recreating the standalone Node on 2026-08-17 reset the
non-persistent local chain, so the old address and its proof results are no
longer present. Provider 2 registration and one full Seller runtime E2E have
completed on the replacement deployment.

The Mock Provider's Schnorr message contains exactly eight ordered fields:

1. annual revenue in integer KRW
2. debt ratio in basis points
3. overdue count
4. company-commitment hash
5. hash of GIWA chain, ReceivableFinance, receivable ID, role, and canonical wallet
6. hash of the Midnight contract deployment
7. provider ID
8. policy version

Changing the receivable ID, Seller/Buyer role, canonical wallet, GIWA chain,
ReceivableFinance deployment, Midnight deployment, provider ID, policy version,
company secret, or PIN invalidates reuse in another context. The ledger rejects
an already-existing lookup key, so an exact same-context submission is one-shot.
This replay rule is not a freshness policy: the contract has no issued time,
latest-result rule, expiry, revocation, or refresh round yet.

Every new receivable or opposite Seller/Buyer role consequently needs a fresh
Provider challenge, attestation, ZK proof, and ledger write. Once written, the
capability is reusable for repeated exact reads by an intended Funder; a read
does not consume it or repeat issuance. The two-minute EIP-712 expiry covers
only the role wallet's consent to that issuance, not the lifetime of the result.

On 2026-08-19, DB receivable `#4` correctly mapped to onchain receivable `#1`,
but a Seller entry for the exact lookup key already existed. Compact rejected
the write. The Bridge running at 12:04 still returned generic `PROOF_FAILED`;
logs and ledger state confirmed the duplicate afterward. The updated Bridge now
maps and tests the exact assertion as `ELIGIBILITY_RESULT_ALREADY_EXISTS`, but a
restarted live Bridge/MetaMask E2E has not yet exercised that new mapping.
Docker, Provider 2, Proof Server, Node, Indexer, and Bridge were available;
restarting them or changing the PIN was not a valid fix.

## Historical v1: Provider 2 Role-Wallet Authorization

Provider 2 adds an off-chain issuance gate without changing the Compact
contract or its Schnorr message:

1. The CLI retains the raw mock financial values and hidden random salt and
   requests an authorization challenge.
2. The Provider resolves the canonical Seller/Buyer wallet and returns an exact
   EIP-712 request with a two-minute expiry and salted request commitment.
3. The CLI prints that request for manual paste into the development-only Vue
   `/midnight/authorize` route.
4. Vue strictly validates the fixed context, calls MetaMask for exactly the
   canonical role wallet, checks the typed-data hash and recovered signer, and
   outputs a minified one-line response for paste back into the CLI.
5. On `POST /attest`, the Provider consumes the challenge before validation,
   re-reads the GIWA role, recomputes the private commitment, recovers the EOA
   signer, and only then issues the existing Schnorr attestation.

Compact verifies only the registered Provider's Schnorr signature and ZK policy
execution. It does not independently verify the MetaMask secp256k1 signature.
The two-minute challenge is one-shot transport authorization, not a result
freshness or expiry policy.

## Historical v1: Local Components and Ports

| Component | Purpose | Host endpoint |
| --- | --- | --- |
| Midnight Node | validates Midnight transactions | `http://127.0.0.1:9944` |
| Midnight Indexer | public-state query and subscription | `http://127.0.0.1:8088/api/v4/graphql` |
| Midnight Indexer WS | state subscription | `ws://127.0.0.1:8088/api/v4/graphql/ws` |
| Midnight Proof Server | local ZK-proof generation | `http://127.0.0.1:6300` |
| Mock Attestation API | mock financial-data signing | `http://127.0.0.1:4000` |
| Read-only Midnight API | resolves one exact proof capability against Indexer public state for the dev-only Vue viewer | `http://127.0.0.1:4100` |
| Local Proof Bridge | trusted CLI-compatible private-state/wallet orchestration for `/midnight/prove` | `http://127.0.0.1:4200` |

The proof server is localhost-only. Do not run a second independent container on
port 6300 while Midnight Local Dev is running.

## Historical v1: Required Delivery Order

1. Reproduce the official ZK Loan contract, CLI, and Attestation API unchanged.
2. Compile Compact and build the contract package.
3. Run the local Node, Indexer, and Proof Server.
4. Complete the official CLI flow: fund wallet, deploy, register provider,
   request attestation, generate proof, submit, and query public state.
5. Replace only the loan-domain fields with GASOK financial eligibility fields.
6. Connect the mock provider and test valid and invalid signatures through CLI.
7. Verify the full GASOK proof flow through CLI.
8. Bind Seller and Buyer results to a canonical GIWA receivable and verify the
   bound flow through CLI.
9. Only then add the isolated read-only Vue capability resolver.
10. Add the separate Provider 2 CLI-to-Vue-to-CLI EIP-712 authorization handoff
    without moving private financial values into the browser.
11. Register Provider 2 and verify the real MetaMask authorization plus complete
    local attestation/proof/transaction/Indexer flow end to end.
12. Add the approved local-only Proof Bridge and `/midnight/prove`: prepare the
    challenge, explicitly authorize with MetaMask, attest, prove, submit, poll,
    and resolve the resulting capability through the read API.
13. Treat direct Vue + Lace self-custody and secure multi-user capability
    delivery as later, separate architectures. Reuse only existing Spring
    receivable reads for UI context and add no proof coordination/persistence
    unless an already-proven Vue flow needs it.

The development-only Vue route `/midnight` now resolves the Phase 2.5 result
through `giwa-midnight/api` and the same-origin Vite `/midnight-api` proxy. The
adapter uses the official Indexer public-data provider and generated
`GasokEligibility.ledger()` decoder and has no transaction or private-state
surface. It binds to `127.0.0.1`, uses `Cache-Control: no-store`, and is not a
Spring Boot API.

The adapter is the sole contract-address authority and pins
`7e3ea9d741ce0f5862db6f46d0ad720be2586cd7d0405ec77e4a0478aa50f4fb`.
Vue has no default-contract environment variable. The former anonymous GET
collection is removed. `POST /v1/eligibility-results/resolve` accepts only the
exact version-1 capability object, with no extra fields:

```text
{
  version: 1,
  midnightContractAddress,
  companyCommitment,
  lookupKey,
  giwaChainId,
  receivableFinanceAddress,
  onchainReceivableId,
  subjectRole,
  partyWallet
}
```

It returns:

```text
{
  networkId: "undeployed",
  contractAddress,
  context: { giwaChainId, receivableFinanceAddress, onchainReceivableId,
             subjectRole, partyWallet },
  result: { lookupKey, eligible, providerId, policyVersion }
}
```

The Vue page first selects an authenticated Funder-visible DB receivable and
Seller/Buyer role, then explicitly imports a capability from the clipboard or
a user-selected local file. It validates syntax and requires the capability's
onchain ID, approved contract, role, and party wallet to match before calling
the adapter. File content is read locally into component memory and is not
uploaded; the page does not store the capability in browser storage, logs, or a
URL. Raw JSON input is retained only for advanced diagnostics. Live API smoke
resolved the role-bound demo for receivable `#1` as Seller `eligible=true` and
Buyer `eligible=false`, while
tampering returned HTTP 400. These outcomes came from intentionally different
caller-supplied mock inputs; they do not assert the actual financial condition
of either role wallet. Actual development-browser submissions resolved the same
Seller result as `eligible=true` and Buyer result as `eligible=false`; the Buyer
screen correctly explained that ineligibility is a valid proof outcome. This is
browser read verification, not browser attestation or proof submission.

The separate development-only `/midnight/authorize` route performs only the
MetaMask portion of the Provider 2 issuance handoff. It accepts the exact CLI
authorization request, receives no raw financial value or hidden salt, makes no
Attestation, Spring, or Midnight HTTP request, and returns a one-line signature
response for manual CLI paste. MetaMask still handles account/network selection
and EIP-712 signing. This is not Midnight proof submission and is not part of
the GIWA Funding transaction flow.

It remains directly addressable for CLI learning and diagnostics but is not
linked from the product-facing `/midnight` Funder verifier or
`/midnight/prove` Seller/Buyer flow.

## Historical v1: ADR-018 Vue Proof Session

The development-only `/midnight/prove` page uses the same proven participant
without exposing its private state to Vue:

1. Vue loads the authenticated company's existing receivables, lets only the
   related Seller/Buyer choose one DB record, and derives the synchronized
   onchain ID and role. A Funder is directed to `/midnight` instead.
2. Vue POSTs one exact private-input object to the Bridge's
   `/v1/proof-sessions/challenge` endpoint.
3. The Bridge prepares the CLI-compatible private witness context and returns a
   random session ID, decimal-string expiry, and exact Provider 2 authorization
   request. Vue immediately clears the financial tuple and PIN.
4. The user explicitly asks MetaMask to sign as the canonical GIWA role wallet.
   Challenge creation never triggers signing automatically.
5. Vue POSTs the versioned authorization response to
   `/v1/proof-sessions/prove`. The Bridge consumes the session and progresses
   through `attesting` and `proving_and_submitting`; after finalization it uses
   `indexing` only as an immediate transition to `complete`.
6. Vue polls `/v1/proof-sessions/status` with the session ID in the JSON body.
   It does not retry proof submission after a timeout or unknown result.
7. `complete` returns only the proof capability. Vue sends that to the existing
   read adapter, which recomputes the lookup key and reads the public Indexer
   result. Only that independently resolved response becomes UI success. The
   Bridge does not query the Indexer per session after finalization; it preserves
   the capability and returns `complete`, while Vue retries only the resolver
   read and never resubmits the proof for delayed public visibility.
8. After independent resolution, Vue lets Seller/Buyer explicitly copy the
   capability or export a local file. The Funder selects the same DB record/role
   on `/midnight`, explicitly imports from the clipboard or selected file, and
   the verifier rejects a context mismatch before calling the read API. The raw
   JSON representation is an advanced diagnostic path. The file and clipboard
   are correlation-sensitive OS artifacts and are not cleared when Vue clears
   its in-app state.

An exact-key duplicate is terminal for that issuance attempt. Vue displays the
safe `ELIGIBILITY_RESULT_ALREADY_EXISTS` guidance, directs the issuer to its
previously saved capability, and does not suggest a new PIN. If the artifact was
lost, current-MVP recovery is unsupported. This differs from Indexer delay,
where Vue safely retries only the read resolver with a capability it already
has.

`failed`, `expired`, and `cancelled` are terminal. Cancellation is truthful: an
SDK proof/submission already running without abort support remains running and
status-checkable. The Bridge is single-session because its local wallet and
encrypted private state are one mutable participant. The interactive CLI and
Bridge cannot run simultaneously against that database.

Current official Midnight Local Dev supports Lace against the local Node,
Indexer, and Proof Server, and the wallet-connector guide includes an
`undeployed` configuration. Direct Vue + Lace is therefore technically viable
without Preprod. ADR-018 nevertheless uses the trusted local Bridge because the
current proof participant, encrypted private state, wallet balance, and deployed
contract have already been proven through the CLI. The Bridge avoids adding and
migrating a second Midnight identity while the owner learns the end-to-end
runtime. A later direct Lace self-custody path requires a separate replacement
ADR rather than being mixed into this one.

Official references pinned for this decision:

- [Midnight Local Dev Lace setup](https://github.com/midnightntwrk/midnight-local-dev/blob/8b44aabc5ea65e4c5d4cd855017517600bc90e8a/README.md#L76-L89)
- [Local proving roles and endpoints](https://github.com/midnightntwrk/midnight-docs/blob/90da63c74fb92cf156505c682df07dbaba61be62/docs/guides/local-proving.mdx#L267-L325)
- [Wallet connector `undeployed` configuration](https://github.com/midnightntwrk/midnight-docs/blob/90da63c74fb92cf156505c682df07dbaba61be62/docs/guides/react-wallet-connect.mdx#L180-L240)
- [SDK compatibility matrix](https://github.com/midnightntwrk/midnight-docs/blob/90da63c74fb92cf156505c682df07dbaba61be62/docs/relnotes/support-matrix.mdx#L17-L38)

## Historical v1: Initial Eligibility Policy

The initial private-input policy is:

- annual revenue >= 500,000,000 KRW
- debt ratio <= 200%
- overdue count <= 1

Threshold values and policy version are contract configuration, not raw company
financial data. Any policy change after the first working CLI proof requires a
documented contract-version decision.

The policy thresholds are not form limits. The current browser accepts the
Compact protocol ranges: integer KRW `Uint<64>`, debt ratio `Uint<32>` basis
points, and overdue count `Uint<16>`. Revenue may include display commas. Debt
ratio is entered as a percentage with at most two decimal places and converted
exactly (`85.5% = 8550 bps`, `200% = 20000 bps`). A value outside policy v1
still creates a valid proof whose public boolean is `eligible=false`.

## Historical v1: Local Security Hardening

- Provider secret keys must be in `1..JubjubOrder-1`; the API does not reduce an
  invalid configured key modulo the order. Compact rejects the Jubjub identity
  public key `(0, 1)` during registration and again during proof verification.
- The Mock Provider signs only for its pinned approved Midnight deployment. It
  accepts uncompressed JSON up to 4,096 bytes and uses bounded HTTP timeouts.
- Provider 2 authorization challenges are random, bounded, two-minute, and
  one-shot. The Provider atomically consumes the challenge on the first
  attestation attempt, rejects zero/expired/replayed or context-mismatched
  material, re-resolves the GIWA role, and recovers the EOA signer before
  Schnorr issuance.
- CLI calls to the Mock Provider are restricted to an HTTP loopback root URL,
  reject redirects, time out after 10 seconds, and cap success/error bodies at
  64 KiB. Remote response bodies and sensitive URL parts are not logged.
- CLI log files use owner-only `0600` permissions. Fresh mnemonics bypass the
  logger and are displayed once only in an interactive terminal.
- The Proof Bridge binds to literal `127.0.0.1:4200`, enables no CORS, and
  accepts only allowlisted local `Origin` and `Host` values,
  `Sec-Fetch-Site: same-origin`, the custom UI header, `application/json`,
  identity encoding, no query string, exact object keys, a 4,096-byte body, and
  bounded header/request timeouts.
- Provider/GIWA operational failures are not reflected verbatim across the
  trust boundary. CLI/Bridge promote only the exact allowlisted combinations
  `404 / GIWA_RECEIVABLE_NOT_FOUND`, `502 / GIWA_RPC_UNAVAILABLE`, and
  attestation `403 / ROLE_WALLET_MISMATCH`. The Compact exact-key assertion is
  separately normalized to `ELIGIBILITY_RESULT_ALREADY_EXISTS`; Vue renders
  fixed local guidance and treats malformed/unknown bodies generically.
- Session IDs are CSPRNG values held only in Bridge memory and sent only in POST
  bodies. One active session, one authorization use, no automatic ambiguous
  retry, and a common CLI/Bridge process lock protect the single local encrypted
  state and wallet. An internal timer expires an unsigned prepared session at
  the Provider deadline, discards its tuple, and frees the slot without relying
  on a later poll. Terminal capability/error/status records are automatically
  purged after 60 seconds by unref timers even if no further request arrives.
- Vue clears raw financial/PIN form state after challenge creation, disables
  devtools while the raw-input route is enabled, and stores none of the proof
  flow in Pinia, browser storage, URLs, logs, or telemetry. Bridge responses and
  errors never reflect input values, bodies, secrets, stacks, or witness data.
- The Bridge attempts to sanitize transient finance, signature, and Provider
  fields after proof work, retries the encrypted cleanup once, and makes a later
  prepare sanitize stale fields before it can proceed. It drops JavaScript
  references but does not claim reliable zeroization of immutable strings.
- A `complete` Bridge status contains the proof capability only. Vue must
  resolve it again through the read adapter/Indexer; the Bridge is not an
  independent public-result authority. Transaction finalization immediately
  preserves and returns the capability; recovery from Indexer delay is
  resolver-only.
- Before port 4200 opens, one 10-second-bounded Indexer preflight validates the
  pinned deployment and seals its GIWA configuration in memory. Challenge
  preparation uses that cache and never queries the Indexer while raw inputs
  exist. The SDK query has no abort signal, so one timed-out startup query may
  remain unresolved internally; the server remains closed and no raw tuple has
  been accepted. The later SDK contract-join watcher is not yet bounded end to
  end; port 4200 still remains closed until it finishes, and a complete join
  deadline is tracked separately.
- The read adapter returns a timeout after 10 seconds and allows only one live
  upstream Indexer query while the SDK operation remains unresolved, preventing
  repeated requests from piling up unabortable work.

## Historical v1: Exclusions

- No Midnight Preprod or Mainnet deployment.
- No React dependency or React conversion.
- No Lace Wallet requirement during CLI Phase 1.
- No claim that the ADR-018 Bridge is self-custodial or required by a Lace
  limitation. Official local Lace support exists; direct Vue + Lace is simply
  not the selected architecture in this phase.
- No raw financial-data persistence in MySQL or public ledger state.
- No real bank, credit-bureau, or accounting-provider claim.
- No change to existing GASOK flows until the proof has succeeded through CLI.
- No claim that Provider 1 legacy results prove wallet control. Only Provider 2
  applies the EIP-712 issuance gate.
- No legal-company identity proof.
- No issued time, freshness, latest-result, expiry, or refresh-round policy.
- No claim that an existing result describes the party's current financial
  condition; the Vue verifier must display this freshness limitation.
- No lost-capability reconstruction or safe reissue path. A different PIN is a
  different pseudonym/result, not recovery.
- No reusable company-wide financial credential. A future time-bounded company
  credential plus fresh per-receivable-role presentation/nullifier requires a
  separate ADR, independent company state, and Compact/Provider protocol changes;
  the existing context binding must not simply be removed.
- No eligibility-based GIWA Funding gate.
- No general publication of proof capabilities; they are correlation-sensitive.
- No anonymous public-result collection endpoint.

## Historical v1: ADR-017 Verification Status

- The complete Attestation API suite passes `74/74` and its build passes.
- CLI tests pass `125` with `1` optional environment E2E skipped; typecheck and
  build pass.
- The current Vue suite passes 14 files / 103 tests; full ESLint/Oxlint,
  changed-file Prettier, and production build pass.
- Provider 2 is registered on the current replacement deployment and its public
  state reports one Provider. A real Seller MetaMask authorization completed
  the Provider 2 → Schnorr → Midnight proof → transaction → Indexer E2E in
  transaction `00d7ed17d2d109ad0f0490bd6ea116b57745befcb6a7d0662dd922936374657045`
  at block `2854`. The independently decoded public result is `eligible=true`,
  Provider `2`, policy `1`.

## Historical v1: ADR-018 Verification Status

- The port-4200 Bridge, session store, runtime, local preflight, and common
  CLI/Bridge process lock are implemented.
- Under Node 22.21.1, the current CLI suite reports `125` tests passed with
  `1` optional environment test skipped, including exact HTTP/session
  security, one-shot state transitions,
  non-reflective failure responses, private-state cleanup behavior, and lock
  safety. CLI typecheck and build pass.
- The installed CLI dependency tree overrides Restify 11's transitive
  `find-my-way` and `send` to `9.8.0` and `1.2.1`; both resolve to those versions
  and `npm audit --audit-level=high` reports zero high-severity vulnerabilities.
- CLI lint is not counted as passed: the workspace currently declares the lint
  script/config but has no installed ESLint binary, so `npm run lint` exits with
  `eslint: command not found`. Restoring the lint dependency and running it is a
  separate remaining verification item.
- The `/midnight/prove` route and its service/composable/view boundaries are
  implemented. Under Node 24.19.0, the full Vue suite passes 14 files / 103
  tests covering the Bridge wire contract, body size/timeout/abort behavior,
  one-shot and ambiguous-submission recovery, sequential polling, transient
  input cleanup, independent resolution, race/unmount guards, accessible
  eligible/ineligible views, route gating, literal-loopback strict-port proxy
  policy, and both plugin/runtime Vue Devtools disabling.
- Full ESLint/Oxlint, changed-file Prettier, and the production Vite build pass,
  and `npm audit --audit-level=high` reports zero high-severity
  vulnerabilities. Direct exhaustive unit coverage of the complete pre-existing capability
  and role-authorization modules remains a separate TODO; their dependencies
  are mocked at the focused proof-composable boundary.
- Node 24.19.0 applies to `giwa-ui` verification only. The Midnight CLI and
  Proof Bridge remain pinned and verified on Node 22.21.1.
- The production artifact excludes the proof route registration, proof
  view/service chunk, and proof API marker. The dead route-name string
  `midnight-prove` remains in the Receivables production component behind an
  always-false CTA condition; complete compile-time elimination is a TODO and
  is not a security boundary. A live development-browser smoke created the
  Seller `#1` challenge through Vue
  and the Bridge; all four private form values were then absent from the DOM and
  no synthetic value appeared in captured console output.
- That browser had no MetaMask provider. The smoke therefore does not count as
  EIP-712 signing, proof submission, a Midnight transaction, public resolution,
  or the required real Seller/Buyer browser E2E.
- Docker/real LevelDB Bridge E2E and real Seller/Buyer `/midnight/prove`
  browser-triggered runs are not included in that unit/boundary result and must
  remain visibly pending until executed.
