## Approved integrated synthetic demo — ADR-023, 2026-09-15

This section supersedes the local-only runtime boundary in the historical
sections below. The owner explicitly approved Preview and a hosted hackathon demo.

```text
Vercel Vue -> authenticated Node gateway (one Railway public port)
                |-> public business API -> private Spring :8081 -> MySQL
                |-> profile ID + request ID -> synthetic fixture + Proof Bridge
                |     -> fictional Attestation Provider -> native Proof Server
                |     -> public Preview Node / Indexer
                |-> internal result reader -> Spring independent verification
```

All Node roles, Spring and the native prover share one app deployment; MySQL
retains its separate service and volume. IntelliJ's `Midnight Demo` Run starts
Spring and its helper supervisor automatically. In Railway the same supervisor
owns Spring and the helpers. One persistent app directory retains wallet,
provider identity, encrypted private state, outbox, session ownership and the
public deployment manifest across restarts. Do not regenerate keys on redeploy.

The gateway authenticates every proof action through Spring's internal authority
endpoint and binds request/session ownership. Raw financial input is rejected by
the hosted challenge: it accepts only a selected synthetic profile. Spring sees
public request context, not financial witness bodies. Existing result verification,
capability encryption, owner-only delivery and no-duplicate-proof recovery remain.
The operator processes synthetic data, including temporary encrypted witness
storage. The fictional Provider does not establish real-world financial truth.

Preview wallet funding, DUST generation, contract initialization and actual
browser E2E must be verified; build/tests alone are not live demo evidence.
See CONTEXT.md for the latest achieved and outstanding verification.

# Architecture

## v2 protocol reference — historical local transport

The diagram below records the local transport before ADR-023. Request binding,
encrypted delivery and result semantics remain; current hosted fixtures, ports,
authentication and Preview endpoints follow the integrated diagram above.
Apply external examples through [the reference harness](MIDNIGHT_REFERENCE_HARNESS.md).

```text
Funder Vue /midnight
  -> Spring POST proof request (public criteria + authenticated audience)
  -> MySQL REQUESTED row
  -> Seller/Buyer Vue /midnight/prove
       -> private mock facts held transiently in component memory
       -> loopback Proof Bridge :4200
          -> Mock Provider 2 :4000 (role-wallet consent + mock attestation)
          -> Proof Server :6300 (ZK proof computation)
          -> Midnight Node :9944 (validation/finalization)
          -> encrypted local capability outbox (delivery durability)
       -> Spring complete (AES-256-GCM encrypted capability envelope)
       -> Bridge ACK after Spring reports SUBMITTED/idempotent COMPLETED
  -> Funder Spring resolve
       -> local Read API :4100 -> Indexer :8088
       -> COMPLETED sanitized policy result
```

The Funder owns the public policy request: request ID, intended Funder wallet,
minimum annual revenue, maximum debt ratio, maximum overdue count, and
`validUntil`. The Seller/Buyer owns the private mock facts and decides whether
to deny or authorize. Compact evaluation version 2 binds the policy hash,
audience, GIWA receivable/role/wallet, company commitment, deployment,
Provider, profile timestamp, and deadline. Only one combined boolean and
freshness metadata become public; individual comparisons and raw values do
not.

Spring is a coordinator and encrypted bearer-capability custodian, not a proof
generator or financial-data source. It stores no raw facts, nonce, Provider
signature, authorization, or witness. The Bridge is not a generic reverse
proxy: it owns the local Midnight wallet/private-state flow, Provider exchange,
proof transaction, crash-safe encrypted outbox, recovery, and delivery ACK.
The Read API is separately read-only so Indexer lag can be retried without
replaying a proof transaction.

The active-request uniqueness marker allows only one unexpired request per
requesting Funder, receivable, and subject role. It remains active through a
successful result's validity window to limit trivial adaptive yes/no probing;
denial, expiry, and permanent failure release it. This is only a PoC
mitigation. Policy templates, query budgets/cooldowns, audit controls, and
independent per-company Midnight identities remain required before any remote
multi-user use.

The result is informational. It is neither bank/accounting verification nor a
GIWA funding approval or automatic lifecycle gate. GIWA Solidity continues to
own tokenization, funding, repayment, and asset transfers.

## Historical v1 Boundary (ADR-018 through ADR-020)

The diagram and flow below record the former fixed-policy, PIN, manual
clipboard/file capability PoC. Those routes remain under `/midnight/legacy/*`
for diagnostics only and have no v2 fallback.

## Historical v1: Network Boundary

GIWA and Midnight are separate networks with separate responsibilities. The
Midnight PoC is local-only on `undeployed`; GIWA remains the existing testnet
integration. No Midnight deployment reaches Preprod or Mainnet.

```text
GASOK Vue (existing giwa-ui)
  ├─ Existing GIWA lifecycle UI ──────────────────────────────┐
  └─ Dev-only Midnight tools                                   │
     ├─ /midnight/prove ── DB record → onchain ID/role derivation │
     │                      raw input, role-wallet EIP-712       │
     │                         │                                 │
     │                         ▼                                 │
     │   Proof Bridge (127.0.0.1:4200, trusted local process)   │
     │     ├─ encrypted private state + Midnight dev wallet     │
     │     ├─ Mock Provider 2 attestation                       │
     │     └─ proof generation + transaction submission        │
     ├─ /midnight/authorize ← preserved manual CLI handoff      │
     ├─ explicit copy/export → OS clipboard/local file          │
     └─ /midnight verifier ← explicit clipboard/file import ─┐      │
                                                           │      │
GASOK Spring Boot (existing giwa-api)                      │      │
  ├─ auth / existing public receivable reads                │      │
  ├─ business logic / MySQL                                  │      │
  └─ GIWA RPC verification and transaction journal          │      │
                                                           │      │
GIWA Sepolia                                               │      │
  ├─ ReceivableFinance / MockKRW / NFT settlement ◀────────┘      │
  └─ canonical Seller/Buyer read ───────────────────────┐          │
                                                        │          │
Midnight PoC (giwa-midnight, local-only) ◀──────────────┼──────────┘
  ├─ CLI and Proof Bridge encrypted private state        │
  ├─ Mock Attestation API (127.0.0.1:4000) ◀─────────────┘
  ├─ Proof Server (127.0.0.1:6300; witness, no wallet key)
  ├─ Midnight Node (127.0.0.1:9944)
  ├─ Indexer (127.0.0.1:8088) → minimal public result
  └─ Read-only API (127.0.0.1:4100) → exact capability resolver
```

## Historical v1: Component Ownership

| Component | Owns | Must not own |
| --- | --- | --- |
| Vue | Authenticated public receivable selection; strict DB-ID/onchain-ID display and conversion; Seller/Buyer role derivation for `/midnight/prove`; transient raw input/PIN memory until challenge creation; explicit canonical-role MetaMask EIP-712 signing; proof-session polling; user-directed capability copy/local-file export; Funder clipboard/file import; DB/role context matching and independent capability resolution; preserved manual `/midnight/authorize` tool | accepting a manually invented onchain ID or role, allowing a Funder to sign for Seller/Buyer, silent capability delivery/upload, browser-storage/Pinia/URL/log persistence, hidden salt, Midnight wallet/private-key custody, direct private-state access, direct Proof Server/Node calls, Funding enforcement, GIWA architecture changes |
| Spring Boot | authentication, MySQL, existing public receivable/funding-opportunity reads used to establish UI context, GIWA receipt/event verification and journal | raw financial input, PIN, proof session/capability upload or persistence, Attestation-provider signing in the initial PoC, Midnight transaction signing |
| GIWA contracts | receivable ownership, tokenization, funding, repayment, current-NFT-owner settlement | financial eligibility proof or private financial data |
| Midnight contract | sealed GIWA deployment configuration, eight-field provider-signature verification, private eligibility proof, one-shot opaque-key result | raw financial values, GIWA assets, GIWA lifecycle state, independent GIWA RPC reads |
| Attestation API | canonical Seller/Buyer role-context resolution from GIWA RPC; bounded two-minute one-shot EIP-712 challenges, EOA signer recovery, and Provider 2 mock financial-input/context signing | bank/accounting-provider claim, legal-company identity proof, financial-data truth, MySQL persistence |
| CLI | deployment, provider registration, manual proof submission, local encrypted private state, two-step Provider 2 authorization handoff, and correlation-sensitive proof-capability output | MetaMask key custody, Vue replacement, production wallet flow, secure verifier delivery channel |
| Local Proof Bridge | one localhost-only proof session at a time; reuse of the current CLI encrypted state and development wallet; Provider 2 orchestration; proof generation and Midnight submission; transient capability return | remote/multi-user service, production signer, raw-input persistence/logging, Funding/Spring/MySQL responsibilities, automatic ambiguous retry |
| Proof Server | local proof generation from the plaintext witness supplied by the Bridge/CLI | wallet key, transaction signing, public remote exposure, or persisted raw financial data |
| Indexer | query of public Midnight result | private witness/state query |
| Read-only Midnight API | one pinned Midnight deployment, exact `POST /v1/eligibility-results/resolve`, capability/key recomputation, local Indexer lookup, and generated Compact-ledger decoding for Vue | anonymous result listing, wallet, proof, attestation, mutation, Spring/MySQL responsibilities, or verifier authentication |

## Historical v1: Data Classification

| Data | Location |
| --- | --- |
| annual revenue, debt ratio, overdue count, PIN, signatures, witness secret | `/midnight/prove` component memory only until challenge creation; then trusted loopback Bridge memory and encrypted CLI-compatible private state. The Mock Attestation API and Proof Server process required plaintext transiently without persistence or logging |
| EIP-712 authorization request and response | direct `/midnight/prove` sessions keep them in component/Bridge memory; the preserved `/midnight/authorize` tool still supports manual CLI copy/paste. Both forms contain a salted request commitment rather than raw financial values or the hidden salt |
| Midnight wallet mnemonic/seed | interactive CLI mnemonics are supplied locally or shown once and never logged; ADR-018 reuses the public disposable Local Dev genesis seed already used by the standalone flow and must never use it on a network or asset with value |
| contract admin, registered Provider public keys, sealed GIWA chain/address, opaque receivable-eligibility lookup key, provider ID, policy version, eligibility | Midnight public state and Indexer |
| company commitment plus GIWA receivable ID/role/wallet and lookup key | CLI/Bridge proof capability; not raw financial data, but correlation-sensitive. Vue keeps its working copy in component memory, while an explicit user action may copy it to the OS clipboard or export it to a local file; a Funder explicitly imports either artifact before Vue POSTs it to the local adapter. No browser-storage, Pinia, URL, server, telemetry, or log persistence is added |
| Proof-session ID and state | cryptographically random, memory-only Bridge record; sent only in request bodies, one-shot, short-lived, and automatically discarded by a 60-second terminal timer or process restart |
| account/company identity, receivable lifecycle, GIWA transaction proof summaries | existing Spring Boot/MySQL and GIWA chain according to existing rules |
| DB receivable ID, synchronized onchain receivable ID, NFT token ID, Seller/Buyer/Funder relationship | existing Spring Boot DTO and Vue display/context selection. The DB ID remains an application identifier; only the synchronized onchain ID enters GIWA RPC and the Midnight binding |

The current Bridge uses one Midnight development wallet, one encrypted
participant private state, and one `companySecret` for every UI-selected Seller
and Buyer. The authenticated GIWA actors and role-wallet authorizations are
separate, but their Midnight participant identity is not. Same-PIN commitments
are derived from the same Bridge secret and capabilities can therefore enable
cross-context correlation. Independent per-company private state remains a
required later architecture, not a property of ADR-019.

The ADR-020 handoff deliberately crosses Vue's memory boundary only through a
user gesture. Clipboard history and an exported local file can remain after the
page is reset or closed, and may be copied by OS backup or folder-sync tools.
They must therefore be treated as correlation-sensitive artifacts, delivered
only to the intended Funder, removed when no longer needed, and never confused
with a securely addressed multi-user channel. Vue can clear only its own
working copy; it cannot prove erasure from the clipboard, filesystem, backup,
or sync history. Raw one-line JSON is an advanced diagnostic representation of
the same capability, not the primary handoff UX.

## Historical v1: Phase 2.5 Receivable-Subject Binding

The local Compact deployment is fixed to GIWA chain `91342` and
ReceivableFinance `0x0f264334f98BA0d22f7Fc6Bb901a5Fa36158a315`. For each
request, the Mock Attestation API reads `getReceivable(id)` through GIWA RPC and
selects the canonical Seller or Buyer wallet for the requested role. The
Midnight contract itself does not call GIWA RPC.

The provider signs exactly eight fields, in protocol order:

1. annual revenue
2. debt ratio
3. overdue count
4. pseudonymous company-commitment hash
5. GIWA binding hash over chain, ReceivableFinance, receivable ID, role, and wallet
6. Midnight deployment hash
7. provider ID
8. policy version

The circuit recomputes those hashes, verifies the signature, evaluates the
private policy, and writes only
`opaque lookup key -> { eligible, providerId, policyVersion }`. Seller and Buyer
therefore have different lookup keys even for the same receivable; their result
values depend on the caller-supplied mock inputs and may be equal or different.
An existing key is rejected, so the exact same proof context is one-shot.

The current MVP therefore creates a fresh Provider 2 challenge, attestation,
proof, and ledger write for the first intended result of each receivable-role
pair. A different receivable or the opposite role cannot reuse the old
attestation because the signed binding changes. Once that result exists, the
proof capability is a reusable exact-read artifact: one or more intended
Funders may resolve it again without another proof. The two-minute Provider
challenge limits issuance consent only and does not make the stored result
fresh or unexpired.

Contract one-shot enforcement is narrower than the UX policy: it rejects an
exact lookup key, not every possible result for a receivable-role pair. Since
the PIN contributes to the company commitment, changing it creates a different
pseudonym and key that can coexist with the old result. The UI must not offer
PIN rotation as duplicate recovery, replacement, or refresh. It directs the
issuer to the existing capability instead; if that capability was not retained,
recovery is intentionally unsupported in this MVP.

After submission, the CLI prints a proof capability containing the lookup data
needed to correlate that opaque Midnight entry with one GIWA receivable party.
The capability contains no PIN, company secret, raw financial value, or provider
signature, but possession reveals that correlation and must be treated as
privacy-sensitive.

The 2026-08-19 DB receivable `#4` Seller failure is a concrete example of this
boundary. Vue correctly derived onchain receivable `#1`; Node, Indexer, Provider,
Proof Server, and Bridge were available, but Compact found the exact lookup key
already present. The then-running Bridge returned generic `PROOF_FAILED`; logs
and ledger state identified the exact duplicate afterward. The updated Bridge
now maps and tests it as `ELIGIBILITY_RESULT_ALREADY_EXISTS`, and Vue instructs
capability reuse rather than infrastructure restart or a different PIN. A live
restart/MetaMask E2E of that new mapping remains outstanding.

The read-only adapter is the sole configured Midnight-address authority and is
pinned to
`7e3ea9d741ce0f5862db6f46d0ad720be2586cd7d0405ec77e4a0478aa50f4fb`.
It accepts only the exact version-1 capability object at
`POST /v1/eligibility-results/resolve`, recomputes the binding, deployment, and
lookup key, and reads that single map entry. The former anonymous
`GET .../eligibility-results` list is no longer exposed. The dev-only Vue page
first selects an authenticated Funder-visible DB receivable and Seller/Buyer
role. It then explicitly imports a capability from the clipboard or a selected
local file, requires its onchain ID,
ReceivableFinance address, role, and canonical party wallet to match that
selected context before calling the same-origin `/midnight-api` proxy, and
shows the DB ID, onchain ID, role, wallet, eligibility, provider ID, and policy
version.

## Historical v1: ADR-017 Provider 2 Issuance Authorization

Provider ID `2` is reserved for the EIP-712-authorized mock issuance policy.
The CLI keeps the private financial tuple and hidden random salt, asks the local
Provider for a two-minute challenge, and prints only the typed authorization
request. The development-only Vue `/midnight/authorize` tool validates the
exact fixed GIWA/Midnight/Provider context, selects
`message.partyWallet` through MetaMask, signs the EIP-712 message, verifies its
hash and recovered signer locally, and returns minified one-line JSON for manual
paste back into the CLI.

On the first attestation attempt, the Provider atomically consumes the
challenge, re-reads the canonical role wallet from GIWA RPC, recomputes the
salted request commitment, and independently recovers the EOA signer. Only then
does it issue its existing Schnorr attestation. Raw financial values, the hidden
salt, PIN, company secret, Provider signature, and Midnight private state never
enter Vue.

This is an off-chain issuance gate. It does not require a change to the Compact
contract, eight-field Schnorr message, public ledger schema, or sealed GIWA
configuration. Compact proves the registered Provider 2 Schnorr
signature and private policy execution; Midnight does not independently verify
the secp256k1 EIP-712 signature. Provider ID `1` entries remain honest legacy
role-context-only results and must not be described as wallet-authorized.

## Historical v1: ADR-018 Local Vue Proof Bridge

The approved Phase 3B path adds a trusted Node.js Proof Bridge inside the
`giwa-midnight/cli` workspace and a development-only Vue `/midnight/prove`
route. This choice reuses the current, runtime-proven CLI participant identity,
encrypted private state, wallet balance, Provider 2 flow, and deployed Compact
contract. It is not a claim that Lace is unable to use local `undeployed`.

Current official Midnight Local Dev documentation supports Lace against the
local Node, Indexer, and Proof Server endpoints (`9944`, `8088`, and `6300`),
and the official wallet-connector guide includes an `undeployed` configuration.
A direct Vue + Lace self-custody architecture is therefore viable later. It is
not mixed into this PoC because the current Vue application has no Midnight
DApp Connector, Lace participant state, wallet balance, or migration from the
already-proven CLI identity. See the pinned
[official Local Dev README](https://github.com/midnightntwrk/midnight-local-dev/blob/8b44aabc5ea65e4c5d4cd855017517600bc90e8a/README.md#L76-L89)
and
[wallet-connector `undeployed` example](https://github.com/midnightntwrk/midnight-docs/blob/90da63c74fb92cf156505c682df07dbaba61be62/docs/guides/react-wallet-connect.mdx#L180-L240).

The Bridge is explicitly custodial inside this disposable local PoC. Vue sends
the private mock tuple and PIN to loopback memory to prepare a Provider 2
challenge, then immediately clears those form values. MetaMask authorizes only
the public GIWA role context. The Bridge holds the local Midnight development
wallet and encrypted private state, receives the resulting authorization,
obtains the Provider signature, asks the Proof Server to process the plaintext
witness, and submits the Midnight transaction. The Proof Server does not receive
the wallet key. The public ledger remains limited to the opaque key and minimal
result.

Proof sessions are CSPRNG-identified, body-only, memory-only, short-lived,
single-active, and one-shot. Submission begins only after an explicit MetaMask
action. The frontend polls status and never automatically retries an ambiguous
transaction. A complete session returns a capability, which Vue must resolve
again through the independent port-4100 read adapter and Indexer; it must not
trust a Bridge-supplied eligibility boolean. Once the transaction is finalized,
the Bridge immediately preserves that capability and completes without a
per-session Indexer query. The browser retries resolver reads only and never
submits a second proof for delayed public visibility. CLI and Bridge share a
fail-fast process lock around the encrypted state database.

Before port 4200 opens, the Bridge performs a 10-second-bounded Indexer
preflight, validates the pinned contract and Provider, and seals the GIWA
configuration in memory. Each challenge uses that validated cache instead of
querying the Indexer while raw inputs exist. The current SDK query has no abort
signal, so one timed-out startup query may remain internally unresolved; the
server stays closed and no raw tuple has been accepted in that condition.

This decision preserves the existing `/midnight` capability verifier and
`/midnight/authorize` manual learning tool. It adds no Spring Boot endpoint,
MySQL proof persistence, GIWA Funding gate, React, Preprod, or Mainnet. ADR-019
later reuses only existing authenticated receivable reads for UI context. A
later move to direct Lace
self-custody would require a separate ADR covering identity/state migration and
would replace, not silently coexist with, the custodial Bridge architecture.

## Historical v1: Integration Sequence

1. `giwa-midnight` CLI proves the official ZK Loan example locally.
2. The same CLI proves the GASOK financial-eligibility contract.
3. Phase 2.5 binds separate Seller and Buyer proofs to a canonical GIWA
   receivable context and verifies them end to end through the CLI.
4. The Phase 3A read side now resolves one explicitly imported Phase 2.5
   capability without publicly enumerating results. This is verification, not
   a secure delivery channel or proof-submission UI.
5. ADR-017 adds the separate CLI-to-Vue-to-CLI EIP-712 authorization handoff for
   Provider 2. The current replacement deployment completed a real Seller
   MetaMask authorization followed by Provider attestation, CLI proof creation,
   Midnight submission, and Indexer result verification. At that ADR-017 stage,
   Vue remained only the authorization bridge; ADR-018 adds the separate
   Bridge-backed proof route without changing the manual tool.
6. ADR-018 adds the development-only `/midnight/prove` route and trusted
   loopback Proof Bridge. The Bridge reuses the proven CLI wallet/private state;
   Vue explicitly authorizes with MetaMask, polls proof submission, and
   independently resolves the returned capability through the read adapter.
7. ADR-019 removes manual proof-subject entry from the product-facing flow.
   Seller/Buyer select one authenticated DB record and Vue derives its onchain
   ID and role; the resulting capability is intentionally handed to a Funder,
   who selects the same DB record/role before exact resolution. This reuses
   existing Spring reads and adds no persistence or Funding gate.
8. ADR-020 makes that handoff an explicit clipboard copy or local-file export
   followed by Funder clipboard/file import. The file and clipboard can outlive
   Vue memory and carry a correlation warning; no backend transfer, server
   persistence, URL, or browser-storage channel is added.
9. Direct Vue + Lace is a viable later self-custody replacement, not a blocker
   or a parallel implementation. Secure capability delivery/access remains a
   separate product concern beyond this local single-user session.
10. Further Spring Boot integration is considered only when required by the proven Vue
   flow. Existing GIWA lifecycle APIs and Solidity contracts remain unchanged.

Phase 2.5 and ADR-017 still do not enforce a GIWA funding gate. Provider 2 proves
control of the canonical role wallet only at mock-attestation issuance time; it
does not prove that the private values belong to that wallet, legal-company
identity, bank verification, accounting provenance, or data truth. The
two-minute expiry bounds the authorization lifetime, while atomic one-shot
challenge consumption prevents replay. Neither makes the result fresh: the
ledger still has no issued time, latest-result rule, expiry, revocation, or
refresh round. Independent Seller/Buyer Midnight identities, lifecycle policy,
secure verifier capability delivery, any direct Lace migration, and later
backend coordination remain separate work.

If a later product needs one company financial attestation to support multiple
receivables, it must not remove the existing receivable/role binding from the
Provider message. The safe direction is a separately approved, time-bounded
company credential plus a fresh per-receivable-role ZK presentation/nullifier.
That requires independent per-company private state, freshness/revocation
semantics, Compact and Provider protocol changes, and a new ADR. It is not
implemented by the current MVP.

## Historical v1: Local PoC Security Controls

- Provider secrets must be canonical non-zero Jubjub scalars. The Compact
  registry and verification circuit reject the identity public key `(0, 1)` so
  it cannot be used to forge a signature for an arbitrary message.
- The Mock Attestation API pins one approved Midnight contract before it reads
  GIWA or signs, accepts JSON bodies up to 4,096 bytes, and applies local HTTP
  request/header timeouts.
- Provider 2 challenges are cryptographically random, bounded in memory,
  limited to two minutes, and consumed before validation on the first
  attestation attempt. The Provider rejects expired, zero, replayed, or
  context-mismatched authorization material and recovers the canonical EOA
  signer off-chain.
- The CLI accepts only an HTTP loopback Attestation API root URL, rejects
  redirects, bounds the full response to 64 KiB, and applies a 10-second
  deadline without reflecting remote bodies or sensitive URL data into logs.
- CLI log files are owner-only (`0600`). A freshly generated wallet mnemonic is
  shown once on the interactive terminal and never sent to the file logger.
- The Proof Bridge binds to literal loopback port `4200`, accepts only the
  configured local development Origin/Host allowlists,
  `Sec-Fetch-Site: same-origin`, and custom UI header, enables no CORS, requires
  exact JSON/body-only session requests, and returns no-store safe errors
  without request-value, body, stack, secret, or witness reflection.
- Provider/GIWA failures cross the Bridge boundary only through the fixed safe
  mappings, and the Compact exact-key assertion is reduced to
  `ELIGIBILITY_RESULT_ALREADY_EXISTS`. Unknown bodies remain generic; this code
  is a result-identity conflict rather than an infrastructure-health signal.
- One active proof session and a common CLI/Bridge process lock prevent
  concurrent mutation of the same encrypted private state. Session IDs are
  cryptographically random, memory-only, one-shot, and never placed in URLs. An
  internal deadline timer discards an unsigned prepared tuple and frees the
  active slot even when the client never polls again. Complete/failed/expired/
  cancelled records, including capability or safe error data, are automatically
  purged after 60 seconds without relying on another request.
- Vue removes raw financial fields and PIN after challenge creation and never
  writes them, authorization material, session IDs, or capabilities to Pinia,
  browser storage, URLs, logs, telemetry, Spring Boot, or MySQL. Devtools are
  disabled while the raw-input proof route is enabled.
- The Bridge temporarily writes financial and Provider-signature witness fields
  to its encrypted local private state for proof generation. Cleanup is marked
  before the write awaits, is attempted after success or failure, and is retried
  once idempotently; the next prepare also sanitizes stale transient fields and
  cannot continue unless that write succeeds. A finalized capability is not
  discarded merely because cleanup storage reports an error. JavaScript
  immutable strings cannot be guaranteed to be zeroized, so the local-only
  trust model relies on dropping references, bounded lifetime, sanitization,
  and process isolation rather than claiming perfect memory erasure.
- The read adapter permits one unresolved Indexer query at a time. Because the
  current Midnight SDK query has no abort signal, this bound prevents timed-out
  requests from accumulating orphaned upstream operations.
