# Source provenance and contribution scope

MidProof packages the existing GASOK/GIWA project and its Midnight proof of
concept, adding a wallet-free synthetic review flow and isolated clone-and-run
environment on 2026-09-27. It does not claim all code was written from scratch
during this hackathon.

## Reused foundation

- GASOK/GIWA: existing Vue UI, Spring accounts and receivable APIs, MySQL schema,
  Solidity receivable/NFT/funding/repayment lifecycle and deployment foundation.
- Midnight: the official [example-zkloan](https://github.com/midnightntwrk/example-zkloan)
  tutorial informed the Compact/CLI/private-state baseline. Retained source
  headers identify Apache-2.0 code and copyright owners. The upstream license
  text is included under `licenses/`.
- Existing GASOK Midnight work: financial field mapping, fictional signed
  attestations, request-bound policies, private inputs, public result metadata,
  encrypted capabilities, hosted Preview runtime and security/recovery fixes.

Source URLs and snapshot base commits are recorded in
[source-origins.json](source-origins.json). The snapshot includes working-tree
fixes present at packaging time; the base commit hashes alone do not represent
those changes. Original repositories and history remain available. This
repository contains ordinary directories rather than Git submodules.

## Midnight-specific contribution

- Compact verification of the mock Provider signature and request-bound
  financial policy, including canonical numeric constraints.
- Pseudonymous, context-bound result keys; raw financial inputs do not enter
  MySQL or public Midnight contract state.
- Actual proof generation, transaction finalization, independent Indexer reads,
  expiry handling and a distinct valid `eligible=false` result.
- Authenticated hosted proof sessions, encrypted capability custody/outbox,
  idempotent delivery and conservative recovery after uncertain submissions.
- 2026-09-27 review experience: limited demo JWTs, per-login run ownership,
  explicit consent, automatically prepared encrypted demo authentication and
  reserved synthetic context. The Vue demo requires no GIWA RPC, receivable,
  funded role wallet or asset transaction from either reviewer or operator.
- 2026-09-27 reproducibility: one repository and an isolated five-service Compose
  profile with Midnight Local Devnet and automatic account/demo authentication
  setup. No EVM, GIWA fixture, author-owned wallet, cloud credentials or faucet
  is needed for the local reviewer workflow.

Under ADR-025, this synthetic-only demo is separate from the ordinary GIWA
asset flow. The reused Solidity contracts and the existing role and wallet
checks for ordinary receivable, funding and repayment operations remain intact.

## Claims and limitations

Companies, institution and financial inputs are fictional. The hosting operator
and proof service process synthetic witnesses. This is not bank verification,
real-company authentication or a production lending decision system. Local
proofs are on Local Devnet, not Preview. Build/unit evidence is separate from
actual on-chain/browser evidence in the dated release record.

A new Git repository does not decide hackathon originality or reuse eligibility.
The official rules and organizers determine that question. Historical AI notes
remain for traceability; read their older status statements with the newest
dated context and release record.
