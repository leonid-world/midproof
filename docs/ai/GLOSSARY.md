# Midnight Glossary

- **Funder policy request (v2)**: An authenticated public request binding a
  random `requestId`, intended Funder wallet, receivable/subject role, minimum
  annual revenue, maximum debt ratio, maximum overdue count, and `validUntil`.
  It contains criteria, not Seller/Buyer financial facts.
- **Policy request hash**: The Compact-recomputed domain-separated hash of the
  request ID, audience, exact thresholds, deadline, and evaluation version. It
  is included in the Provider signature, lookup derivation, capability, and
  Read API result context so a boolean cannot be reinterpreted under another
  policy.
- **Evaluation version 2**: The current request-bound Compact protocol. It has
  no fallback to the historical fixed-policy version 1 contract/results.
- **Proof request status**: Spring coordination state: `REQUESTED`,
  `SUBMITTED`, `DENIED`, `EXPIRED`, `COMPLETED`, or `FAILED`. Only a resolved
  `COMPLETED` record contains a policy boolean; denial/expiry/failure are not
  negative eligibility outcomes.
- **Encrypted capability envelope**: AES-256-GCM Spring/MySQL custody of the
  correlation-sensitive v2 capability. Its key is supplied outside MySQL; it
  contains no raw financial facts.
- **Capability outbox**: Owner-only encrypted local Bridge file that is the
  delivery durability boundary after a finalized transaction. It supports
  request-ID recovery and is ACKed/deleted only after Spring durably accepts
  the envelope as `SUBMITTED` or confirms the idempotent already-`COMPLETED`
  state.
- **Pseudonym nonce**: A Bridge-generated CSPRNG `Uint<16>` input used with the
  company secret and request ID to derive a request-scoped commitment. It is
  not a PIN, password, identity proof, or user input.
- **v2 authorization deadline**: The earlier of 120 seconds after Provider
  issuance and the Funder policy's `validUntil`. Its effective TTL is 1..120
  seconds; it never extends an expiring policy.
- **Indexer lag**: The expected interval after Node transaction finalization
  before the read replica exposes the result. It is retried as `SUBMITTED`, not
  treated as an invalid proof or reason to resubmit.
- **Active-request marker**: MySQL uniqueness guard allowing only one unexpired
  request per Funder, receivable, and role. It is a partial adaptive-query
  mitigation, not a full privacy budget.
- **Mock-attested result**: A boolean proving that Provider 2 signed the
  caller-supplied tuple and Compact evaluated the bound criteria. It is not
  bank/accounting verification, GIWA Funding approval, or an automatic gate.
- **Legacy v1 diagnostic flow**: The historical fixed-policy, user PIN,
  clipboard/file capability and `/v1` route set kept only for local learning
  under `/midnight/legacy/*`.

## Historical v1 diagnostic glossary (plus shared primitives)

The entries below preserve the fixed-policy/PIN learning vocabulary. Shared
terms such as Node, Indexer, Proof Server, witness, and Compact remain valid,
but any `/v1`, PIN, nine-field capability, or clipboard/file statement is
legacy-only.

- **Compact**: Midnight smart-contract language used to define private and
  public ledger state plus circuits.
- **Compact circuit / ZK circuit**: A contract function whose execution is
  proven with a zero-knowledge proof. It can assert facts about private witness
  data without publishing that data.
- **Witness**: Local code that supplies a circuit's private input at proving
  time. GASOK witnesses include mock-attested financial data and signatures.
- **Private state**: Encrypted local state retained by the CLI-compatible local
  participant. ADR-018's Bridge reuses that same state; Vue does not read it.
  Private state is never submitted to the Midnight network.
- **Public state**: Contract state queryable from the Midnight Indexer. For the
  Phase 2.5 result map it contains an opaque lookup key plus eligibility,
  provider ID, and policy version; the contract admin, registered Provider
  public keys, configured GIWA chain, and contract are also public values.
- **Attestation**: A signed statement binding a provider to specific private
  input values and an exact GIWA/Midnight proof context.
- **Attestation Provider**: The signer whose public key is registered in the
  contract. GASOK's providers are mock-only, not financial institutions.
  Provider 1 is the legacy role-context policy; Provider 2 first enforces the
  off-chain EIP-712 role-wallet authorization policy.
- **Schnorr signature**: The signature scheme used by the official ZK Loan
  pattern and verified inside the Compact circuit.
- **Proof Server**: Trusted local service that generates ZK proofs from circuit
  material and the plaintext private witness. It listens on port 6300. It does
  not receive the Midnight wallet key or sign the transaction.
- **Midnight Node**: The blockchain node that validates and accepts Midnight
  transactions. The local endpoint is port 9944.
- **Indexer**: GraphQL service for querying and subscribing to public Midnight
  ledger state. The local endpoint is port 8088.
- **Read-only Midnight API**: Local port-4100 adapter pinned to the approved
  Midnight contract. Its exact `POST /v1/eligibility-results/resolve` endpoint
  verifies a version-1 capability, recomputes its lookup key, queries that one
  Indexer result, and returns the approved Vue DTO. It does not anonymously list
  results, create proofs, sign transactions, or access private state.
- **Local Proof Bridge**: Trusted, custodial development process on loopback
  port 4200. It reuses the proven CLI encrypted private state and Midnight dev
  wallet, coordinates Provider 2, asks the Proof Server to generate a proof,
  and submits the transaction. It is not Spring Boot, a remote service, or a
  production wallet architecture.
- **Proof session**: CSPRNG-identified, memory-only, one-shot Bridge record that
  moves from authorization through attestation, proving/submission, indexing,
  and a terminal state. Its ID is sent only in POST bodies. A completed session
  returns a proof capability, which Vue resolves independently through the read
  API rather than trusting the Bridge for the public result. Completion proves
  transaction finalization, not that the asynchronous Indexer is already caught
  up. The `indexing` state is a transition into completion, not a Bridge-side
  query; delayed public visibility is recovered by retrying only the resolver
  read. An unsigned prepared session expires on an internal timer even without
  another browser request, discarding its prepared tuple and releasing the one
  active slot.
- **Midnight Local Dev**: Official Docker-based local environment containing a
  Node, Indexer, Proof Server, and funding wizard.
- **`undeployed`**: Network ID for the local Midnight development environment.
  It is the only allowed network for this PoC.
- **Preprod / Mainnet**: Remote Midnight networks. They are explicitly outside
  this PoC's deployment scope.
- **Company commitment**: A one-way pseudonym derived from the local company
  secret and PIN. It is not a business number, legal-company identity, or proof
  that the requester controls a GIWA wallet.
- **Pseudonym PIN**: A disposable decimal `Uint<16>` value in `0..65535` that is
  combined with the encrypted local company secret to derive the company
  commitment. There is no server-issued or correct PIN. It is not a login,
  MetaMask, card, bank, or company password, and its 16-bit entropy is not the
  security boundary by itself. Changing it creates another pseudonym/key; it is
  not a result update, replacement, refresh, revocation, or lost-capability
  recovery mechanism.
- **DB receivable ID**: The Spring/MySQL `receivableId` used by the Vue lists,
  detail pages, and route query. It may differ from the GIWA contract's
  independently assigned counter and must never be sent to `getReceivable`
  unless the synchronized onchain ID happens to be the same value.
- **GIWA onchain receivable ID**: The `onchainReceivableId` captured from the
  `ReceivableCreated` event and stored beside the DB record. Provider role
  resolution, EIP-712 authorization, and the Midnight GIWA binding use this
  value. Vue derives it from the selected DB record rather than asking the user
  to type it.
- **NFT token ID**: The independent ERC-721 identifier minted during
  tokenization. It is displayed separately from both receivable identifiers
  and is not accepted as a proof-subject ID.
- **GIWA receivable subject**: One canonical party of one onchain receivable,
  identified by GIWA chain, ReceivableFinance address, uint256 receivable ID,
  `SELLER` or `BUYER` role, and the corresponding wallet read from GIWA RPC.
  This context label does not prove that caller-supplied financial inputs belong
  to that party.
- **GIWA binding hash**: Domain-separated hash of the GIWA receivable subject.
  The hash is signed and checked by Compact so a signature cannot be moved to a
  different receivable, role, wallet, chain, or ReceivableFinance deployment.
- **Midnight deployment hash**: Domain-separated hash of the local Midnight
  contract address. It prevents an attestation for one deployment from being
  replayed against another deployment.
- **Receivable eligibility lookup key**: Opaque public map key derived from the
  company commitment, GIWA binding hash, Midnight deployment hash, and policy
  version. The ledger value contains only eligibility, provider ID, and policy
  version.
- **Proof capability**: Versioned CLI output that gives an intended verifier the
  lookup key and the public GIWA/Midnight context needed to interpret it. The
  dev-only Vue issuer can explicitly copy it or export it to a local file, and
  the verifier explicitly imports it from the clipboard or a selected file
  before resolving only that exact result. It has no PIN, secret, raw financial
  value, or signature, but it is correlation-sensitive, is not meant for
  general publication, and still requires a future secure delivery/access
  design. Raw one-line JSON is an advanced diagnostic representation. The same
  capability may be resolved repeatedly; reads do not consume it or create a
  new attestation/proof.
- **Capability handoff artifact**: The same version-1 Proof capability placed
  in the OS clipboard or an explicitly exported local file. It is not an upload
  or server record, but it can outlive Vue memory through clipboard history,
  filesystem backups, sync clients, or recoverable deletion. It must be sent
  only to the intended Funder and removed when no longer needed; the app cannot
  prove OS-level erasure. The local export uses the generic
  `gasok-proof.gasok-proof` filename; import accepts bounded `.gasok-proof` or
  `.json` content and does not automatically query the result.
- **Proof issuer**: The Seller or Buyer company for the selected receivable.
  The actor enters its own mock values and the corresponding canonical role
  wallet authorizes Provider 2 issuance. A Funder is not an issuer for either
  role.
- **Proof verifier**: The intended Funder that receives a correlation-sensitive
  capability, selects the same DB receivable and Seller/Buyer role, and resolves
  the exact public result. Verification does not require or authorize the
  Funder to sign as that role and does not itself approve Funding.
- **One-shot result**: A rule that rejects insertion when the exact lookup key
  already exists. It prevents exact replay but does not provide freshness,
  expiry, revocation, or a latest-result policy. It is narrower than uniqueness
  by receivable-role: changing the PIN changes the key and can create another
  unordered result. The Bridge exposes an exact-key conflict only as
  `ELIGIBILITY_RESULT_ALREADY_EXISTS`.
- **First issuance**: The current MVP's new challenge, Provider attestation, ZK
  proof, and ledger write for the first intended result of one receivable-role
  context. A new receivable or the opposite role requires another issuance,
  while a Funder reuses the resulting capability for later reads.
- **Result freshness**: A policy that would define issued time, expiry, current
  or latest selection, replacement, and revocation. It is not implemented. The
  Provider's two-minute authorization window limits issuance consent only and
  does not make the stored result fresh.
- **Reusable company credential**: A possible future time-bounded/revocable
  financial credential that could support fresh per-receivable-role ZK
  presentations/nullifiers. It requires a separate ADR and protocol design; it
  is not the current per-receivable attestation.
- **Authorization challenge**: A cryptographically random Provider 2 record
  held in Mock Provider memory for at most two minutes and consumed on the first
  attestation attempt. The expiry bounds its lifetime; atomic one-shot
  consumption prevents replay. Neither makes the resulting Midnight eligibility
  result fresh or unexpired.
- **Attestation request commitment**: Salted hash that binds the exact private
  mock financial tuple and company commitment to the public authorization
  context. The manual `/midnight/authorize` tool sees only this hash, never the
  raw financial values or hidden salt. `/midnight/prove` has already accepted
  the caller-supplied raw tuple transiently before the challenge, but it still
  never receives the Bridge-generated hidden salt.
- **Wallet-control authorization**: The Provider 2 EIP-712 signature proving
  control of the canonical Seller/Buyer EOA at attestation issuance time. Vue
  signs it through `/midnight/authorize` or `/midnight/prove`, and the Mock
  Provider recovers it off-chain before Schnorr issuance. Compact/Midnight does
  not independently verify this secp256k1 signature. Provider 1 results do not
  have this property.
- **Funding eligibility**: The public boolean/result indicating whether the
  private financial witness met the Compact policy.
- **Lace Wallet**: Midnight-compatible browser wallet. Current official
  Midnight Local Dev and wallet-connector documentation supports Lace on local
  `undeployed` using the local Node, Indexer, and Proof Server. ADR-018 still
  uses the Bridge to preserve the already-proven CLI identity/private state;
  direct Vue + Lace is a possible later self-custody replacement, not the
  architecture implemented now.
