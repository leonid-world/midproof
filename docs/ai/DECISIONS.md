# Architecture Decisions

## Midnight decision versioning note

ADR-008 through ADR-020 are preserved historical records of the official CLI,
fixed-policy v1, user PIN, and clipboard/file capability learning path. ADR-021
defines the current request-bound v2 product protocol; ADR-022 defines its
durable Bridge-to-Spring delivery boundary. A v1 result or route is never a
fallback for v2. Earlier ADR text remains unchanged where possible so it does
not falsely describe a later design as if it existed at the time.

## ADR-001

Date

2026-07-29

Status

Accepted

Decision

Use MetaMask for all Seller, Buyer, and Funder application lifecycle write
transactions.

The test-only MockKRW owner may use local Hardhat administration commands for
explicit owner-balance distribution or additional demo-token issuance. The key
is supplied only through the current terminal and is never handled by the
frontend or backend.

Reason

Never store private keys.

---

## ADR-002

Decision

Wallet Address is mapped to Company.

Reason

Authentication remains Web2.

Blockchain only verifies ownership.

---

## ADR-003

Decision

NFT is initially owned by Financing Contract.

Reason

Remove Seller approve transaction.

---

## ADR-004

Decision

Single Funder model.

Reason

Keep MVP simple.

---

## ADR-005

Decision

Backend stores only transaction metadata.

Reason

Blockchain remains the source of truth.

---

## ADR-006

Date

2026-07-30

Status

Accepted

Decision

MockKRW uses 0 decimals, and one token base unit represents one integer KRW in the MVP.

Reason

The database stores receivable amounts as integer KRW with `DECIMAL(36, 0)`.
Using the same unit onchain prevents accidental 18-decimal scaling differences between
the database, UI, and smart contract.

---

## ADR-007

Date

2026-08-06

Status

Accepted

Decision

Use a separate, pre-funded MockKRWFaucet for testnet reviewer self-service.
Each wallet can claim one fixed amount through MetaMask. The Faucet transfers
existing MockKRW inventory and has no mint authority, backend signer, API, DB
state, or receivable lifecycle journal entry.

Reason

An online reviewer must be able to reach Funding without operator coordination,
while private keys and unlimited token issuance remain outside the public UI.

---

## ADR-008

Date

2026-08-09

Status

Accepted

Decision

Use `giwa-midnight/` as a dedicated Git submodule workspace for the local-only
Midnight PoC. The workspace is backed by
`https://github.com/leonid-world/giwa-midnight.git` and contains the Compact
contract, shared API boundary, CLI, mock Attestation API, and local Docker
configuration.

Reason

The PoC needs an independently versioned Midnight toolchain without coupling its
Node/TypeScript dependencies or generated artifacts to the Vue, Spring Boot, or
GIWA Solidity submodules.

---

## ADR-009

Date

2026-08-09

Status

Accepted

Decision

Use the official Midnight ZK Loan tutorial as the Phase 1 baseline and prove it
through its CLI before changing it to the GASOK domain.

Reason

It supplies the required Compact contract, Schnorr attestation flow, private
witness implementation, CLI orchestration, provider registration, and public
state inspection in one official end-to-end reference.

---

## ADR-010

Date

2026-08-09

Status

Accepted

Decision

Run this PoC only on the local Midnight `undeployed` network, using a local
Node, Indexer, Proof Server, and mock Attestation API. Do not deploy a Midnight
contract to Preprod or Mainnet.

Reason

The PoC is a reproducible local privacy demonstration, not a production
financial-verification system.

---

## ADR-011

Date

2026-08-09

Status

Accepted

Decision

Keep the existing Vue application, Spring Boot backend, and GIWA Solidity
contracts intact. Midnight adds only a financial-eligibility result; Vue
integration begins only after the official and GASOK CLI proof flows succeed.

Reason

GIWA remains responsible for tokenization, funding, repayment, wallets, and
asset movement. Keeping the proof system isolated prevents an experimental local
PoC from changing production funding architecture.

---

## ADR-012

Date

2026-08-09

Status

Accepted

Decision

Raw financial values, attestation signatures, witness secrets, mnemonics, and
provider private keys remain local private data. A Phase 2 eligibility-result
entry and its application display may expose only eligibility output, provider
ID, policy version, and a pseudonymous commitment. The contract's public admin
and registered Provider public-key registry remain public control-plane state.
The initial provider is explicitly mock-attested.

Reason

This preserves the PoC privacy boundary and avoids representing a local mock
signature as independent real-world financial verification.

---

## ADR-013

Date

2026-08-10

Status

Accepted

Decision

Each Phase 2 eligibility-result entry exposes only a pseudonymous verification
commitment, binary funding eligibility, Mock Provider ID, and policy version;
the public contract admin and Provider registry remain separate control-plane
state. Policy version 1 privately
checks annual revenue of at least 500,000,000 KRW, debt ratio of at most 200.00%,
and overdue count of at most 1. Do not publish raw values or add risk tiers,
maximum funding ratios, issued/expiry timestamps, a real-company binding, or a
GIWA funding gate until their policies and trust sources are separately approved.

Reason

Only the binary three-condition policy is currently defined. Additional public
categories would reveal more about private financial ranges and would invent
financial and time semantics that the PoC has not specified. CLI-only Phase 2
also has no approved binding between its local secret-derived commitment and a
GASOK business identity.

---

## ADR-014

Date

2026-08-12

Status

Accepted

Decision

Implement Phase 3A as a development-only, wallet-free public-result viewer in
the existing Vue application. A localhost-only `giwa-midnight/api` adapter uses
the official Indexer provider and generated Compact ledger decoder and returns
only the approved public result DTO. Keep the page independent of Funding,
Spring Boot, MySQL, MetaMask, and GASOK company/receivable identities. Defer
browser proof submission until a local `undeployed` signer architecture is
separately approved; do not use Preprod as a workaround.

Reason

The CLI flow already proves both eligibility outcomes, so public state can be
observed without any private input or wallet. The official ZK Loan browser path
used Lace/Preprod in the reference version evaluated at the time. An honest
read-only stage makes the runtime observable for learning without inventing a
browser proof flow or adding an unreviewed trusted signer service.
ADR-016 later replaces this anonymous list DTO with exact capability resolution;
the wallet-free and no-submission boundaries remain unchanged.

Runtime correction (2026-08-17): current official Midnight Local Dev and wallet
connector documentation supports Lace on the local `undeployed` environment.
The earlier reason must not be read as a continuing platform limitation.
ADR-018 supersedes only that factual premise and approves a local Bridge for
reuse of the current proven CLI identity/state, while leaving the historical
Phase 3A read-only decision intact.

---

## ADR-015

Date

2026-08-15

Status

Accepted

Decision

Add a CLI-first Phase 2.5 receivable-subject binding before any further Vue
proof-submission work. Construct the local Midnight contract with sealed GIWA
chain `91342` and ReceivableFinance
`0x0f264334f98BA0d22f7Fc6Bb901a5Fa36158a315`. For each proof, the Mock
Attestation Provider reads the specified receivable from that GIWA deployment
and resolves the canonical `SELLER` or `BUYER` wallet.

The provider signs an eight-field message containing the three private financial
values, company-commitment hash, GIWA receivable-subject binding hash, Midnight
deployment hash, provider ID, and policy version. Compact recomputes the context,
checks the signature and private policy, rejects an already-present exact lookup
key, and publishes only the opaque key with eligibility, provider ID, and policy
version. The CLI emits a versioned, correlation-sensitive capability so an
intended verifier can associate that opaque key with the selected GIWA
receivable party.

This is a role-context binding, not an ownership or provenance claim. The Mock
Provider labels caller-supplied demonstration inputs with the canonical GIWA
role wallet read from RPC; it does not yet prove that those values belong to the
role wallet. The security baseline therefore also requires canonical non-zero
Provider secrets, Compact rejection of the Jubjub identity public key, a single
approved Midnight deployment at the Provider and read adapter, bounded local
HTTP bodies/timeouts, owner-only CLI logs, and no mnemonic logging.

This decision does not add EIP-712 wallet-control authorization, legal-company
identity, bank verification, attestation freshness, latest-result or expiry
semantics, a Funding gate, browser submission, or Spring Boot coordination.
Those require separate decisions. Secure capability delivery/access, independent
Seller and Buyer actors/private states, and refresh-round policy are also
deferred.

Reason

The former secret-and-PIN-only result answered whether an anonymous local
witness met the policy, which was insufficient for a Funder evaluating the two
parties to a specific receivable. Domain separation across GIWA chain,
ReceivableFinance, uint256 receivable ID, role, canonical wallet, and Midnight
deployment prevents cross-receivable, cross-role, and cross-deployment signature
reuse while keeping those correlation fields out of the public result value.
The capability makes disclosure intentional instead of publishing every binding
directly on the Midnight ledger.

---

## ADR-016

Date

2026-08-15

Status

Accepted

Decision

Replace the anonymous Phase 3A result-list endpoint and Vue list with exact,
capability-based read resolution. The localhost-only adapter is the sole
Midnight contract-address authority. At acceptance, it pinned
`a8c0c1997c424dd1215d055fb5688200194263c7be5deef8b4e7620d2cdceb2c`.
Vue has no independent contract-address configuration. The capability carries
its deployment address, and the adapter approves or rejects it.

Runtime note (2026-08-17): the accepted address above is historical because the
disposable local Node was recreated and the deployment became `NOT_FOUND`. The
same single-authority design now pins replacement deployment
`7e3ea9d741ce0f5862db6f46d0ad720be2586cd7d0405ec77e4a0478aa50f4fb`;
this runtime replacement does not change the ADR.

Expose only `POST /v1/eligibility-results/resolve`. Its body must be the exact
version-1 proof-capability object with no extra fields. The adapter recomputes
the GIWA binding hash, Midnight deployment hash, and lookup key, checks the
pinned GIWA/contract context, and reads only that map entry. Do not expose the
former anonymous GET collection. Although the operation uses POST to keep the
correlation-sensitive capability out of URLs, it remains read-only and returns
`Cache-Control: no-store`.

The existing Vue application remains development-only for this feature. At
acceptance it used a raw JSON capability input, performed only safe basic syntax
checks, POSTed through the same-origin `/midnight-api` proxy, and
displayed the exact receivable, Seller/Buyer role, canonical party wallet,
eligibility, provider, and policy version. It must not persist the capability
in browser storage,
logs, or URLs and must not claim wallet ownership, legal-company identity, bank
verification, data truth, or Funding approval.

Runtime refinement (ADR-019, 2026-08-19): the Funder now selects an
authenticated DB receivable and Seller/Buyer role before import. Vue additionally
requires the capability's onchain ID, approved contract, role, and canonical
party wallet to match that DB context before resolver submission. This narrows
the UI boundary without changing the adapter endpoint or capability schema.

Runtime refinement (ADR-020, 2026-08-19): the primary handoff is now explicit
issuer clipboard copy/local-file export followed by Funder clipboard/file
import. Raw JSON is advanced diagnostics. The adapter endpoint and schema remain
unchanged, and no upload, automatic backend delivery, or server persistence is
added. The OS artifacts can outlive component memory and are explicitly treated
as correlation-sensitive.

This decision does not implement secure capability delivery or verifier access
control, EIP-712 wallet-control authorization, independent Seller/Buyer actors,
freshness/expiry/refresh semantics, browser attestation/proof submission,
Spring Boot coordination, or a Funding gate.

Reason

Publishing every opaque result allowed observers to enumerate outcomes without
possessing the intentional disclosure context. Exact resolution preserves the
learning-oriented read path while requiring the verifier to present the
capability and while keeping authoritative hash recomputation outside Vue.
Making the adapter the only deployment-address authority avoids configuration
drift between the UI and resolver.

Validation distinguished the layers: live API smoke resolved receivable `#1`
as Seller `eligible=true` and Buyer `eligible=false`, and rejected tampering
with HTTP 400. Actual development-browser submissions resolved both capabilities
and displayed the same outcomes. This validates capability-based browser reads;
it is not browser attestation, proof generation, or transaction submission.

---

## ADR-017

Date

2026-08-15

Status

Accepted

Decision

Require an EIP-712 role-wallet authorization before the local Mock Attestation
Provider issues a new GASOK financial attestation. The Provider first resolves
the canonical Seller or Buyer wallet from the fixed GIWA ReceivableFinance
deployment, then issues a cryptographically random, two-minute, in-memory
challenge. Challenges are bounded, expire, and are removed atomically on the
first attestation attempt so EIP-712 signatures cannot be replayed.

The EIP-712 domain uses the user-readable GASOK mock-attestation name, schema
version, and GIWA chain ID. It does not set `verifyingContract`, because the
signature verifier is the off-chain Mock Provider rather than the
ReceivableFinance contract. The signed message explicitly includes the fixed
ReceivableFinance address, canonical role wallet, uint256 receivable ID, role,
approved Midnight deployment, Provider ID, financial-policy version, challenge
times, and a salted `attestationRequestCommitment`. That commitment binds the
three private mock financial inputs and company-commitment hash without sending
their raw values or the random salt to Vue.

Keep private financial input in the CLI. The CLI prints only the versioned
authorization request to its interactive terminal. A separate development-only
Vue `/midnight/authorize` tool validates the exact schema, selects the canonical
GIWA role account through MetaMask, signs it, verifies the recovered signer, and
returns a versioned authorization response for the user to paste back into the
CLI. Neither side stores the challenge, typed data, signature, salt, or raw
financial values in logs, URLs, browser storage, MySQL, or Midnight public
state.

Reserve Mock Provider ID `2` for this EIP-712-authorized issuance policy. Results
from Provider ID `1` are legacy role-context-only results and must not be
described as wallet-authorized. The Compact contract and eight-field Schnorr
message remain unchanged: a new result proves that registered Provider `2`
signed the private policy inputs after applying its off-chain authorization
policy, but Compact does not independently verify the secp256k1 signature.

This authorization proves control of the canonical GIWA role wallet at issuance
time. It does not prove legal-company identity, financial-data truth, bank or
accounting provenance, current eligibility, result freshness, revocation,
Funding approval, or secure capability delivery. The first implementation
supports MetaMask EOA signatures only; ERC-1271 contract-wallet verification is
deferred.

Reason

Phase 2.5 bound an attestation to the wallet address stored in a GIWA receivable
but did not require the holder of that wallet to approve the request. EIP-712
makes the role, receivable, deployment, Provider policy, and one-time purpose
visible in MetaMask while allowing the Provider to recover the signer before it
creates the Schnorr attestation. A hidden random salt keeps the browser-facing
request commitment from becoming a practical dictionary oracle for the small
private financial tuple. A distinct Provider ID preserves honest interpretation
of already-recorded legacy results without changing or migrating the local
Midnight ledger schema.

---

## ADR-018

Date

2026-08-17

Status

Accepted

Decision

Implement the first complete Vue-driven local proof flow with a trusted Node.js
Proof Bridge inside the `giwa-midnight/cli` workspace. Bind it only to
`127.0.0.1:4200`, expose it to development Vue only through the same-origin
`/midnight-proof` Vite proxy, and add a separate development-only
`/midnight/prove` route. Preserve the development-only `/midnight` capability verifier and
`/midnight/authorize` CLI handoff as learning and diagnostic tools.

The Bridge reuses exactly the current local CLI participant: its encrypted
contract private state, Midnight development wallet and balance, approved
Provider 2 flow, Proof Server, and current deployed contract. It is therefore a
trusted custodial local process. MetaMask does not become a Midnight wallet; it
signs only the EIP-712 authorization proving control of the canonical GIWA
Seller/Buyer role wallet. The Bridge obtains the Mock Provider's Schnorr
attestation, supplies the plaintext witness to the local Proof Server, signs and
submits the Midnight transaction with its development wallet, and returns a
correlation-sensitive proof capability. The Proof Server never receives the
wallet key.

Vue may hold the raw financial tuple and PIN only in `/midnight/prove` component
memory until challenge creation. It sends them once to the loopback Bridge and
must immediately remove them from its reactive form state after the challenge
response. Neither Vue nor Bridge may log them, place them in Pinia, browser
storage, a URL, telemetry, Spring Boot, MySQL, or public Midnight state. Bridge
transient witness and Provider-signature fields are written only to encrypted
local private state for the proof call. Cleanup is marked before the write
awaits, attempted after success or failure, and retried once idempotently. A
later prepare sanitizes any stale transient fields and cannot proceed unless
that write succeeds. A finalized proof capability is preserved even if a
cleanup write reports failure. Because JavaScript strings cannot be reliably
zeroized, this is bounded-reference lifetime and sanitization rather than a
promise of perfect process-memory erasure.

Use memory-only CSPRNG session IDs in JSON bodies, never URL paths or queries.
Allow one active prepared/running session, one authorization use, and no
automatic retry after an ambiguous submission. The session states are
`awaiting_authorization`, `attesting`, `proving_and_submitting`, `indexing`,
`complete`, `failed`, `expired`, and `cancelled`. Vue polls status. A complete
session returns the exact proof capability but no trusted eligibility shortcut;
Vue must pass that capability to the independent port-4100 resolver and show the
Indexer-decoded result. Once the transaction finalizes, the Bridge preserves the
capability and immediately returns `complete` without a per-session Indexer
query. Vue retries only the resolver and never submits another proof for delayed
public visibility. A common fail-fast process lock prevents the interactive CLI
and Bridge from mutating the same encrypted LevelDB state concurrently.
An internal expiry timer consumes an unsigned `awaiting_authorization` session,
drops its prepared tuple, and releases the active slot at `expiresAt` without
requiring a status poll or another client request. Every terminal record,
including its capability or safe error, is retained for 60 seconds and then
purged by an unref timer without waiting for another request.

Before accepting HTTP input, the Bridge performs one 10-second-bounded Indexer
preflight, validates the pinned contract and Provider, and seals the GIWA
configuration in memory. Per-challenge preparation uses that cache, so raw
tuples are never held while an Indexer query is attempted. The SDK does not
offer cancellation: one timed-out startup query can remain internally pending,
but the server stays closed and no proof input has been accepted.

The HTTP surface is exact-body, JSON-only, no-CORS, loopback-only, body-size and
timeout bounded, and restricted to allowlisted local Origin/Host values,
`Sec-Fetch-Site: same-origin`, plus a custom UI request header. It returns
no-store, non-reflective safe errors and
does not expose request bodies, stacks, seeds, witness values, private state, or
Provider material. A proof already inside the non-abortable SDK call is not
reported as cancelled; clients continue polling its one status instead.

This Bridge is chosen because it minimizes change and preserves the identity and
state already proven through the required CLI-first sequence, not because Lace
is unable to use `undeployed`. The current official
[Local Dev README](https://github.com/midnightntwrk/midnight-local-dev/blob/8b44aabc5ea65e4c5d4cd855017517600bc90e8a/README.md#L76-L89),
[local proving guide](https://github.com/midnightntwrk/midnight-docs/blob/90da63c74fb92cf156505c682df07dbaba61be62/docs/guides/local-proving.mdx#L267-L325),
and
[wallet-connector `undeployed` example](https://github.com/midnightntwrk/midnight-docs/blob/90da63c74fb92cf156505c682df07dbaba61be62/docs/guides/react-wallet-connect.mdx#L180-L240)
show a supported local Lace path. Direct Vue + Lace is a viable later
self-custody replacement, but it requires a separate ADR for DApp Connector
integration and participant/private-state migration and must not be mixed with
the Bridge implicitly.

No part of this decision adds React, Spring Boot coordination, a GIWA Funding
gate, Preprod, Mainnet, financial-data truth, legal-company identity, bank or
accounting verification, freshness, revocation, or production security.

Reason

The CLI, Provider 2, Compact circuit, Proof Server, wallet, and current
deployment have already completed one real local end-to-end proof. Reusing that
known participant through a narrowly bound development Bridge lets the project
owner observe the complete browser-triggered sequence without changing the
existing Vue/Spring/GIWA architecture or introducing a second Midnight identity
at the same time. Explicit custody and session controls keep that educational
shortcut honest and bounded.

---

## ADR-019

Date

2026-08-19

Status

Accepted

Decision

Separate the product-facing proof issuer and verifier actors and derive every
proof subject from the existing authenticated receivable data instead of
letting a user type a GIWA ID or choose an arbitrary role.

On `/midnight/prove`, only the authenticated Seller or Buyer of an existing DB
receivable with a synchronized positive `onchainReceivableId` and the approved
ReceivableFinance address may start issuance. Vue displays the DB receivable
ID, synchronized onchain ID, and NFT token ID separately and derives `SELLER`
or `BUYER` from the authenticated company relationship. The canonical wallet
for that role must sign the Provider 2 EIP-712 request. A Funder must not sign
or create a Seller/Buyer proof.

After independent resolution succeeds, Vue keeps the proof capability in
component memory until the Seller or Buyer explicitly copies it or exports a
local capability file for an intended Funder. On `/midnight`, an authenticated
unrelated Funder may select an unassigned `TOKENIZED` opportunity, while an
already assigned Funder may select its own record, then explicitly import the
capability from the clipboard or a selected local file. Before the read adapter
is called, Vue requires the imported capability's onchain ID,
ReceivableFinance address, Seller/Buyer role, and canonical party wallet to
equal the selected DB context. Raw JSON remains an advanced diagnostic path,
not the primary product handoff. ADR-020 defines the resulting local-artifact
lifecycle and warning requirements.

This decision reuses only the existing authenticated `GET /receivables` and
`GET /receivables/funding-opportunities` data. It adds no Spring endpoint,
schema, raw financial persistence, server-side proof-capability persistence,
automated delivery, verifier authentication beyond existing application
visibility, or GIWA Funding gate. This explicit local handoff is PoC behavior
and remains correlation-sensitive.

The proof form distinguishes protocol ranges from policy thresholds. Annual
revenue accepts comma-formatted integer KRW and is normalized to `Uint<64>`;
debt ratio is entered as a human percentage with up to two decimal places and
converted exactly to `Uint<32>` basis points; overdue count and the local
pseudonym PIN use `Uint<16>`. Values outside policy version 1's revenue,
debt-ratio, or overdue thresholds remain valid inputs and produce a valid
ineligible result rather than a form error. The PIN is a disposable local
pseudonym input, not a login, wallet, bank, or company password.

For the current MVP, the product UX treats the first result for each selected
receivable and Seller/Buyer role as a new issuance: it requires a fresh
two-minute challenge, Provider 2 attestation, and ZK ledger write. A different
receivable or the opposite role cannot reuse an attestation because those
fields are in the signed binding. Once issued, the exact Proof capability is
reusable for repeated Funder reads; resolution does not consume it or require a
new proof. The two-minute deadline bounds the role wallet's issuance consent,
not the lifetime or freshness of the public result.

This one-result-per-receivable-role behavior is an MVP UX rule rather than a
stronger Compact uniqueness rule. Compact rejects only an already-present exact
lookup key. Changing the PIN changes the company commitment and can create a
second unordered key for the same receivable-role, so the UI must never present
a new PIN as duplicate recovery, replacement, or refresh. A duplicate is
reported as `ELIGIBILITY_RESULT_ALREADY_EXISTS` and the issuer is directed to
reuse its saved capability. If that capability was lost, the current MVP does
not reconstruct or reissue it.

This actor separation is UI/context authorization only. The current Bridge
still reuses one Midnight development wallet, one encrypted participant private
state, and one `companySecret` for every Seller and Buyer. They are therefore
not independent Midnight company identities. Reusing the same PIN across
different role/receivable contexts creates commitments derived from the same
secret and can allow correlation to a party holding the capabilities. A
per-company participant/private-state design and migration remains an explicit
TODO before multi-user or remote use.

The 2026-08-19 DB receivable `#4` Seller attempt validated this distinction. Vue
correctly mapped DB `#4` to GIWA onchain receivable `#1`, and the local services
were healthy; Compact rejected the exact lookup key because that Seller result
already existed. The Bridge running at 12:04 still returned generic
`PROOF_FAILED`; the duplicate was confirmed afterward from logs and ledger
state. The updated code now safely maps and tests the exact assertion as
`ELIGIBILITY_RESULT_ALREADY_EXISTS` rather than classifying it as a Docker,
Provider, Proof Server, Node, or proxy failure. That updated mapping has not yet
run in a restarted live Bridge/MetaMask E2E.

Reusing one financial attestation across several receivables is not approved by
this ADR. If later required, it needs a separate architecture decision for a
time-bounded/revocable company credential and a fresh per-receivable-role ZK
presentation/nullifier. Removing the current receivable/role binding from the
Provider message would weaken replay protection and is not an acceptable
shortcut.

Reason

The former free-form UI made a DB receivable number easy to confuse with the
independent onchain counter and made a Funder appear responsible for signing a
Seller or Buyer authorization. That was both a usability problem and the wrong
actor model. Binding selection to authenticated application data prevents the
known DB-ID/onchain-ID mismatch, keeps Provider 2's role-wallet control claim
honest, and lets the intended Funder verify exactly the result it received
without expanding the local PoC into backend storage or Funding enforcement.

---

## ADR-020

Date

2026-08-19

Status

Accepted

Decision

Use an explicit, user-controlled local artifact as the product-facing Proof
capability handoff for the local PoC. After the Seller/Buyer result has been
independently resolved, the issuer may either copy the capability to the OS
clipboard or export it as a local capability file. The Funder may import that
capability from the clipboard or a file selected through the browser. The raw
one-line JSON control is retained only for advanced learning and diagnostics.
No action silently exports, imports, sends, or uploads a capability.

The exported artifact uses a generic filename with no company, receivable,
role, wallet, or outcome in its name. The implementation accepts only bounded,
non-empty UTF-8 `.gasok-proof` or `.json` files and applies the same exact
version-1 schema and selected-context checks as clipboard import. Import stages
the capability but does not automatically resolve it; the Funder must explicitly
start verification after reviewing the selected record and role.

The clipboard value and exported file contain the same version-1 capability
and therefore contain no raw financial value, PIN, `companySecret`, hidden
salt, Provider signature, or Midnight private state. They are nevertheless
correlation-sensitive because they bind an opaque Midnight result to a public
GIWA receivable, role, and canonical wallet. The UI must warn users to deliver
the artifact only to the intended Funder, avoid shared or automatically synced
folders, delete local copies when no longer needed, and clear or overwrite the
clipboard after import. OS clipboard history, filesystem backups, sync clients,
and deleted-file recovery are outside the app's control, so clearing Vue
component state is not a claim that those artifacts were erased.

Import parses the selected local content inside Vue and retains the working
copy only in component memory. Changing the selected record or role, resetting,
or leaving the page clears that in-app copy and aborts a pending resolver
request. The exact capability is still POSTed only to the loopback read adapter
for resolution. There is no automatic backend delivery, upload endpoint,
server-side capability persistence, URL/query transport, browser storage,
Pinia state, telemetry, or application logging. Spring Boot and MySQL remain
outside this handoff.

The same artifact is deliberately reusable for repeated exact-result reads; a
Funder does not request a new attestation or proof whenever it rechecks the
record. Retaining the exported artifact is also the only supported MVP recovery
path after the issuer page is cleared. The app has no capability listing or
reconstruction endpoint, so a lost artifact is not recovered by changing the
PIN or issuing another result.

This local artifact is a usability mechanism, not a secure multi-user delivery
channel or access-control system. Authenticated and encrypted issuer-to-verifier
delivery, recipient binding, server-side authorization, revocation, retention,
and auditable deletion remain TODO before remote or multi-user use. This ADR
refines only ADR-019's capability handoff; its Seller/Buyer issuer, Funder
verifier, receivable-context matching, and shared-Bridge-identity limitations
remain unchanged.

Reason

Copy/paste-only JSON made the intended handoff hard to recognize and easy to
misuse as a normal data-entry field. An explicit export/import flow gives the
local PoC a comprehensible actor handoff without introducing a backend transfer
or persistence architecture. Because a downloaded file and clipboard entry can
outlive Vue component memory, documenting that OS-level residue as an explicit
trust boundary is more accurate than describing the whole handoff as
memory-only.

---

## ADR-021

Date

2026-08-19

Status

Accepted

Decision

Replace the fixed-policy, manually delivered local capability flow with a
request-bound policy evaluation flow coordinated by the authenticated GASOK
backend. This decision supersedes ADR-019 and ADR-020 only for the normal v2
product path; their version-1 clipboard/file flow remains a legacy diagnostic
path and must not be silently interpreted as a v2 Funder decision.

The Funder enters evaluation criteria, not claims about another company's
financial facts. A request contains a random 32-byte request ID, the exact GIWA
receivable and Seller/Buyer subject, the requesting Funder wallet, minimum
annual revenue, maximum debt ratio in basis points, maximum overdue count, and
an expiry. Seller or Buyer sees that complete request and may deny it or enter
its own private mock financial tuple and authorize issuance with the canonical
role wallet. Absence, denial, and expiry are distinct from a policy result of
`false`.

The Provider computes the v2 authorization deadline as
`min(issuedAt + 120 seconds, policyValidUntil)`. The effective signing TTL must
be between 1 and 120 seconds. `issuedAt >= policyValidUntil` is rejected as
`409 / POLICY_REQUEST_EXPIRED`; a nearly expired policy is not extended and
does not enter an artificial final-119-second challenge dead zone.

Compact protocol version 2 recomputes a domain-separated policy-request hash
from the request ID, Funder audience, thresholds, and expiry. The Mock Provider
signature, lookup key, proof capability, and public result are bound to that
hash in addition to the existing GIWA receivable/role, canonical wallet, and
Midnight deployment. The circuit compares the private tuple against the exact
requested thresholds and publishes only the combined boolean plus provider,
evaluation-version, and bounded time metadata. It does not reveal a raw value
or which individual predicate failed. A version-1 boolean may not be
reinterpreted under a version-2 request.

The normal v2 browser flow has no user-entered pseudonym PIN. The trusted local
Proof Bridge creates a request-scoped random pseudonym nonce internally. This
nonce is not authentication, not a refresh counter, and is never returned to
Vue or Spring. The existing manual CLI may retain an explicitly entered PIN for
legacy learning, but that path is not the v2 product UX.

Spring stores only authenticated request context, public thresholds, status,
and an encrypted proof capability envelope. It never stores raw financial
values, the Bridge nonce, `companySecret`, Provider signature, authorization
response, or private witness. The envelope is encrypted with an application
key supplied outside MySQL, and the capability, lookup key, and company
commitment are never returned to the Funder browser. On completion Spring
validates the capability against the stored request context before encrypting
it; on Funder resolution Spring passes it to the localhost Midnight Read API
for independent lookup and result validation. Only the requesting company may
resolve the sanitized result; only the selected Seller or Buyer company may
deny or complete its assigned request.

The product flow therefore becomes:

1. Funder selects a visible receivable, subject role, criteria, and validity.
2. Spring creates one authenticated active request and assigns it to the exact
   Seller or Buyer company.
3. The subject reviews the requester, criteria, purpose context, and expiry,
   then denies or authorizes a request-bound proof.
4. Vue sends the returned capability directly to the authenticated completion
   endpoint without rendering or asking a human to transfer JSON.
5. The Funder request inbox shows pending, proof-submitted, denied, expired,
   failed, or completed state and resolves `SUBMITTED` into `COMPLETED` without
   possessing the capability.

Results are labelled `requested policy satisfied` or `not satisfied`, always
next to the exact public thresholds, subject, Provider, mock profile submission
time, and validity deadline. The UI must not show a bare, unexplained
`eligible`, must not call the mock tuple bank-verified, and must not treat the
result as a GIWA Funding approval or automatic Funding gate.

Every custom-threshold request requires explicit subject consent and only one
active request is allowed for the same requester, receivable, and role. This
reduces silent adaptive probing but does not eliminate the privacy oracle
created by many sequential yes/no requests. Policy templates, query budgets,
cooldowns, revocation, independent per-company Midnight private state, and a
production key-management service remain required before remote multi-user
use.

The new Compact schema requires a fresh local `undeployed` deployment and
Provider registration. Existing version-1 results remain legacy read-only
evidence and are not migrated. No Midnight contract is deployed to Preprod or
Mainnet, the existing GIWA Solidity lifecycle is unchanged, and Funding remains
informationally separate.

Reason

A Funder needs to know whether private facts satisfy the Funder's disclosed
underwriting criteria. Asking the Funder to invent the subject's facts would
only prove an arbitrary claim, while applying new UI thresholds to the old
fixed-policy boolean would be cryptographically false. Binding the request,
audience, criteria, consent, attestation, proof, and delivery provides the
meaning users expect and removes the correlation-sensitive JSON handoff from
the normal workflow without exposing raw financial data.

---

## ADR-022

Date

2026-08-19

Status

Accepted

Decision

Make an encrypted request-bound local outbox the durability boundary between a
finalized Midnight proof transaction and Spring capability custody. The Bridge
must never return `complete` until the exact v2 capability has been atomically
persisted. Vue delivers that capability directly to the authenticated Spring
`complete` endpoint and acknowledges the outbox only after Spring reports the
same request as `SUBMITTED` or the idempotent already-`COMPLETED` state.

The outbox is the ignored owner-only
`giwa-midnight/cli/.gasok-midnight-capability-outbox/outbox.enc` file (directory
`0700`, file `0600`). It uses a per-file random 32-byte salt,
scrypt (`N=32768`, `r=8`, `p=1`) to derive a 256-bit key from the existing local
`MIDNIGHT_STORAGE_PASSWORD`, AES-256-GCM with a fresh 12-byte IV per write and
AAD `gasok-midnight-proof-capability-outbox:v1`, strict
schema/size/ownership/writeability validation, same-process serialized state
mutations, and same-directory atomic rename plus file/directory `fsync`.
Plaintext records bind request ID, session ID, policy/audience/receivable
context, capability, and timestamps. Raw facts, pseudonym nonce, role-wallet
authorization, Provider signature, company secret, wallet seed, and private
witness are never stored in it.

The Bridge reserves a request before proof work. An `awaiting_authorization`
reservation may be released by an explicit cancel/expiry. Recovery after that
clamped authorization deadline removes the stale reservation; Vue clears its
same-tab recovery latch and may start a fresh challenge only when the Spring
request is still `REQUESTED` and unexpired. Once proving begins, an indeterminate
reservation is retained through the policy deadline rather than allowing a
second submission. After finalization the reservation is atomically replaced
by the recoverable capability. `POST /v2/proof-sessions/recover` accepts the
request ID and returns the same complete response after a page or Bridge
restart.
`POST /v2/proof-sessions/ack` requires the exact session/request pair, deletes
the capability, and keeps a bounded tombstone through `validUntil` so a retry
cannot silently re-prove an already delivered request. Expired reservations,
records, and tombstones are removed.

Spring separately encrypts the canonical capability in MySQL with AES-256-GCM
and an externally supplied 32-byte `MIDNIGHT_CAPABILITY_ENCRYPTION_KEY`. It
binds envelope AAD to request/actors/validity and uses a keyed fingerprint for
idempotent delivery. These are deliberately distinct custody domains. The
Bridge password is not copied to Spring, and the Spring key is not copied to
the Bridge.

The canonical v2 capability carries `midnightContractAddress` as bare lowercase
64-hex. Bridge, Vue, Spring, and Read API reject a prefixed, zero, or otherwise
noncanonical capability address. The EIP-712 consent message separately uses
the equivalent `0x`-prefixed `bytes32`, as required by typed-data signing; this
transport distinction is normalized in code and is never exposed as a product
JSON-editing task.

Read resolution is decoupled from proof finalization. A finalized transaction
may precede Indexer visibility; Read API codes `ELIGIBILITY_RESULT_NOT_FOUND`
and `CONTRACT_NOT_FOUND` therefore leave Spring at `SUBMITTED` for later retry.
Permanent capability invalidity/context mismatch transitions the request to
`FAILED`, purges the encrypted envelope, and releases the active-request
marker. Failure, expiry, and denial must never be displayed as an ineligible
policy result.

The local v2 deployment is
`12caaf76aef1de1c584b67462018810f6e4e7eb2535e136f560cb621e24a3f36`.
Provider 2 was registered using deterministic local development config
`PROVIDER_SECRET_KEY=2` in transaction
`006abe69d8ba934519e19c4490ce77be724f75aae1bcb4e6b4fcd720258aa10601`
at block `25714`. The v1 deployment remains preserved and is not a fallback.

This decision is local-PoC durability, not production key management or a
remote multi-user delivery system. KMS-backed rotation, multi-instance locking,
retention/audit policy, per-company private state, and adaptive-query budgets
remain future decisions. A fresh full live browser E2E after the final outbox
restart has not yet been recorded.

Reason

A Midnight transaction can finalize before Vue reaches Spring or before the
Indexer exposes the public result. Holding the only capability in Bridge RAM
would make reload, process restart, or Spring outage an irreversible loss while
Compact correctly prevents the same request from being proved again. Persist
before exposure, recover by the already-bound request, and delete only after a
durable recipient ACK closes that delivery gap without exposing JSON to users
or introducing unsafe proof retries.


## ADR-023 — Integrated synthetic Midnight hackathon demo

Date: 2026-09-15. Status: owner-approved; implementation and live verification
are tracked separately in CONTEXT.md and TODO.md.

The owner explicitly approved removing local-only restrictions for a synthetic
Preview demo. The user operates one IntelliJ Spring Run locally, and deploys one
integrated backend application to the existing Railway project. Vercel and the
existing separate MySQL service remain. No independent Attestation, Read API,
Bridge or Proof Server service/project is required. Node/Indexer use public
Preview endpoints. Preprod and Mainnet are still out of scope.

A Node gateway owns the public port; Spring is private. Ordinary business calls
are proxied to Spring, while proof requests remain in Node. The gateway uses an
internal-token-protected Spring endpoint and the user's JWT to authorize exact
request/session actions. Hosted challenges accept named synthetic fixtures only,
not caller-supplied financial values. The existing fictional Attestation Provider,
Compact signature/policy evaluation, MetaMask role consent, outbox, encrypted
capability delivery and Spring's independent result verification are reused.

The process supervisor manages startup/build/bootstrap and shutdown. A native
prover is bundled in the Railway image; on macOS its official Docker image can
be started automatically. A dedicated local demo MySQL may be created when no
DB is configured, without resetting any existing database. A persistent app
volume retains generated demo identities and encrypted state. Re-deployment
must not replace that identity or replay completed proof transactions.

The operator and hosting environment process synthetic witness data. The demo
does not promise that data never leaves the browser or is hidden from the
operator, and the mock institution never represents a bank/accounting source.
Existing GIWA funding/repayment and Vue are preserved. Production operations,
multiple instances, real financial ingestion and a new wallet architecture are
not part of the hackathon target.

Reason: minimize the owner's execution and deployment tasks, reuse the proven
v2 modules, and present a working UI-driven actual-ZK demo without new platforms.

## ADR-024 — Wallet-free review and reproducible submission repository

Date: 2026-09-27. Status: owner-approved. Implementation and live acceptance
are tracked in MIDPROOF_RELEASE_2026-09-27.md.

The owner approved a separate public `leonid-world/midproof` monorepo containing
Vue, Spring, GIWA contracts and Midnight as ordinary source directories. Preserve
the original GASOK repositories, working state and source attribution. Packaging
alone makes no originality or reuse-eligibility claim.

The review route uses existing synthetic demo accounts with a dedicated
`midnight:demo` JWT scope, a random login-session identifier and at most two-hour
expiry. These tokens cannot operate ordinary receivable, wallet, funding,
repayment, transaction-journal or general proof APIs. Node authorizes each demo
action through the internal Spring boundary and binds runs to actor plus login
session, not a caller-chosen company or request.

The reviewer selects only named synthetic profiles and Seller/Buyer roles and
consents through the UI. A new dedicated operator-managed role fixture replaces
the reviewer's MetaMask signature only in this route. Keys are held in an
owner-only server file, absent from source/images/browser. The signer accepts
only the exact authorized EIP-712 request, fixed fixture roles/receivable,
Provider2 and policy/expiry context. The existing Provider still re-reads actual
GIWA role state and verifies the signature. Real Compact proofs, chain submission
and independent result reads remain mandatory. No generic signing/asset API is
introduced and existing owner MetaMask keys are not copied.

The separate demo-run store owns encrypted capability custody. Finalization
must first persist the outbox, then encrypted run custody, then ACK. A matching
independent Read determines completed/true/false; visibility delays only retry
reads. Idempotent client request identifiers and persisted session ownership
prevent accidental duplicate starts. Refresh recovers the latest run for the
same JWT session without storing proof metadata in browser storage. Uncertain
broadcast-before-durability states remain uncertain and block unsafe reproof.
Ordinary request custody continues to use Spring/MySQL under ADR-022.

The local reviewer profile starts isolated MySQL, EVM, Midnight Node/Indexer,
native Proof Server, app and Vue with Docker Compose. It generates new role keys,
deploys unchanged GIWA contracts and actually creates/verifies/tokenizes a
synthetic fixture. It uses public development genesis only on the explicit
`undeployed` local network, chain31337 and local EVM endpoint. Public Preview pins
remain unchanged. No hosted keys/state/DB or external faucet is needed locally.
Normal stop/start and container recreation preserve the project's named volumes.

Public deployment retains the existing Vercel domain and Railway integrated app,
MySQL, Preview identity and contract. Only dedicated new synthetic-role fixture
state is added. Preprod/Mainnet and production financial ingestion remain out of
scope. Companies, provider and facts are fictional; the operator handles the
synthetic witnesses. Do not describe the result as bank verified or as hiding
raw facts from the operator.

Reason: reviewers must be able to exercise the actual Midnight contribution
without reproducing the owner's MetaMask accounts, Sepolia funding setup or
multi-repository development environment.


## ADR-025 — Midnight-only synthetic review without GIWA preparation

Date: 2026-09-27. Status: owner-directed correction to ADR-024.

The owner clarified that the review experience must start from a test login and
reach actual Midnight verification without MetaMask, GIWA test ETH, receivable
creation, mKRW, funding, or operator-side preparation of those dependencies.
The previous dedicated funded role-fixture plan was unnecessary and is retired.
No faucet claim or GIWA fixture transaction was executed for that plan.

Use the existing limited demo JWT, actor/session binding and explicit UI consent.
The server expands only named fictional financial scenarios and uses a reserved
synthetic subject context. Internal authentication keys are generated once and
stored encrypted automatically; they are not funded asset wallets and need no
user configuration. Existing EIP-712 validation protects this internal protocol.
The synthetic Provider resolver performs no GIWA RPC call. Ordinary Provider,
gateway and result ingress reject the reserved demo context, while the dedicated
demo result path verifies the exact synthetic binding. Ordinary GIWA authorization
and asset operations remain unchanged.

The actual Compact financial/signature proof, existing Preview contract and
wallet, encrypted outbox/custody/ACK and independent Indexer result verification
remain. The sealed GIWA deployment fields in the current circuit are compatibility
binding metadata in this demo; they do not assert that a real receivable exists.
No circuit change or hosted contract redeployment is necessary.

The default clone runtime contains MySQL, Midnight Node/Indexer, the integrated
app/Proof Server and Vue. Remove EVM and receivable setup from that startup path.
Use a new Compose project name to preserve prior test volumes whose contract
binding differs. Automatically seed only the fictional login accounts. Existing
GASOK source, contract code, hosted DB, encrypted state and historical evidence
remain preserved.

The user-facing path is: test login → choose fictional company scenario → consent
→ generate actual Midnight proof → verify the recorded result. Synthetic input
must never be described as a verified bank statement or an actual GIWA asset.
