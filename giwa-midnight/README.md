# Midnight Financial Proof Demo

## MidProof submission entry point (2026-09-27)

This workspace is included as ordinary source in the
[`leonid-world/midproof`](https://github.com/leonid-world/midproof) monorepo.
Follow the [parent README](../README.md) for the current reviewer workflow:
`docker compose up --build -d` starts a fully isolated local demo without faucet,
MetaMask, external database or copied owner keys. Public hosting uses Preview;
the local Compose profile uses Midnight Local Devnet and a separate local EVM.

The new `/v2/demo-runs/{start,status,recover}` routes use limited demo JWTs and
dedicated operator-managed synthetic-role fixture keys. The server validates
each exact consent challenge, calls the existing Provider for actual GIWA role
verification, generates/submits real Compact proofs, durably stores encrypted
capabilities and independently resolves chain results. These tokens cannot call
ordinary asset APIs. General `/v2/proof-sessions` requests retain MetaMask consent
and Spring capability custody described below. Older setup text is development
history and does not override ADR-024 or the parent clone-and-run instructions.

`MIDPROOF_DEMO_FIXTURE_FILE` names an owner-only fixture file on the server. It is
never committed or bundled in an image. Local Compose generates it automatically.
Preview uses separately prepared synthetic-role keys and a real tokenized GIWA
fixture; it never loads the owner's MetaMask keys. Witness data remains synthetic
and is processed by the hosting operator. See the dated parent release record
for actual completed validation, rather than assuming a build is an on-chain test.

The current hosted demo uses **synthetic financial fixtures**, a mock institution,
and actual Midnight Compact proofs on Preview. It reuses the GASOK v2
request-bound proof protocol and the official ZK Loan tutorial baseline. It is
not bank verification, a real-company identity system, or a funding approval.

## One application runtime

Use the parent GASOK repository's IntelliJ **Midnight Demo** run configuration or
its Railway Dockerfile. Those start Spring, the native Proof Server, and this
Node gateway together. Vue stays on Vercel. You do not start this workspace's
legacy individual servers for that mode.

The gateway owns public port 8080 (or the Railway port), proxies ordinary
business requests to private Spring port 8081, embeds a loopback Mock Provider,
and handles internal ledger reads. The Proof Server on loopback 6300 receives
only server-owned synthetic witnesses; it never receives the wallet seed.

The first run creates an encrypted demo identity under
`MIDNIGHT_DEMO_STATE_DIR`, writes the **public** address to `wallet-public.json`,
and waits for Preview tNIGHT. Request tokens from the official Preview faucet
shown in `/midnight-proof/v2/demo/config`; if its CAPTCHA requests interaction,
the owner completes it in the browser.
After funding, DUST registration, contract deployment, Provider 2 registration,
and readiness proceed automatically. The first Preview sync scans public history
and can take several minutes. Subsequent runs reuse that identity,
`deployment.json`, and encrypted wallet checkpoints, so they resume syncing near the last saved event instead of scanning
all public history again. Checkpoints are taken while the wallet has no pending
transaction, every 60 seconds and at completed sync, readiness, and graceful
shutdown. After a proof failure, the last safe checkpoint is preserved until
restart, even if the SDK has not yet marked the transaction pending.
DUST registration waits for its estimated fee to be generated and
reuses previously registered NIGHT. Keep this directory on the Railway
persistent volume.

`/health` reports that Node, private Spring, and the native prover are running.
`/ready` returns 200 only after the proof runtime is ready. Funding or deployment
in progress is visible in `/midnight-proof/v2/demo/config`, while proof creation
returns 503. Business API availability is independent of first-time funding.

The public challenge accepts exactly `{version:2, requestId, profileId}`.
It rejects caller-supplied financial values, policy, wallet, or receivable IDs.
Each proof action requires the existing user JWT and Spring authorization for
that request. Sessions and encrypted restart recovery bind to the original user.
MetaMask still authorizes the canonical GIWA role through EIP-712. The demo's
custodial Midnight wallet signs the separate Midnight transaction.

| Configuration | Purpose |
| --- | --- |
| `MIDNIGHT_DEMO_MODE=hosted-demo` | Explicit synthetic-only mode |
| `MIDNIGHT_NETWORK_ID=preview` | Public demo network; local diagnostics may use `undeployed` |
| `MIDNIGHT_DEMO_STATE_DIR` | Persistent encrypted identity, private state, outbox, deployment manifest |
| `MIDNIGHT_DEMO_PORT` | Public gateway port; takes precedence over `PORT` |
| `MIDNIGHT_DEMO_AUTHORITY_URL` | Private loopback Spring URL |
| `MIDNIGHT_DEMO_INTERNAL_TOKEN` | Runner-provided internal service credential, at least 32 characters |
| `MIDNIGHT_DEMO_ALLOWED_ORIGINS` | Comma-separated exact Vercel/local browser origins |
| `MIDNIGHT_NODE_URL`, `MIDNIGHT_INDEXER_URL`, `MIDNIGHT_INDEXER_WS_URL` | Optional matching-network endpoint overrides |
| `MIDNIGHT_PROOF_SERVER_URL` | Controlled native prover; defaults to loopback 6300 |
| `MIDNIGHT_STORAGE_PASSWORD` | Optional external encryption password; otherwise generated owner-only in state directory |

Build in order: `contract`, `api`, `attestation-api`, `cli`. Use Node 22.
`npm run demo --workspace zkloan-credit-scorer-cli` starts the compiled gateway.
`npm run demo:proof-check --workspace zkloan-credit-scorer-cli` runs real native
proof generation for both synthetic profiles without submitting any transaction
or requiring faucet funds. It prints only profile ID, expected public boolean,
proof byte count and timing. This is a proving check, not a full hosted E2E.

The state directory must not be copied into Git, Docker images, or logs.
An uncertain deployment submission recovers the prepared address rather than
silently creating a second contract. Raw financial values, EIP-712 authorization,
Provider signatures, wallet keys and witness state never enter Spring/MySQL or
Midnight public state. Spring retains only encrypted proof capabilities and
public request metadata.

## Historical local CLI learning guide

The following sections preserve the original local PoC learning path. The
fixed-policy v1/eight-field/PIN descriptions are historical; current v2 uses the
Funder's exact policy, eleven signed fields, request-scoped nonce and an
encrypted Bridge-to-Spring capability delivery flow.

This repository began as the local-only Midnight workspace for GASOK. It begins with
the official ZK Loan tutorial unchanged, then maps the verified CLI flow to
GASOK financial eligibility. The historical standalone flow uses the `undeployed` network.

Phase 1 and the GASOK Phase 2 CLI flow are verified locally. Phase 2 privately
evaluates annual revenue in integer KRW (`Uint<64>`), debt ratio in basis points
(`Uint<32>`, so 200.00% is 20,000), and overdue count (`Uint<16>`). Only a
pseudonymous commitment, `eligible`, Mock Provider ID, and policy version are
public.

The current Phase 2.5 contract keeps only an opaque receivable-role lookup key
with `eligible`, Provider ID, and policy version. Provider 2 adds the ADR-017
off-chain EIP-712 issuance gate; it does not change the Compact contract,
eight-field Schnorr message, public ledger schema, or deployed address.

The current package name and generated `managed/zkloan-credit-scorer` path are
retained temporarily to keep the first behavioral conversion small; the active
exported contract API is `GasokEligibility`.

The existing Vue, Spring Boot, GIWA Solidity, and GIWA Sepolia flows are outside
this repository and remain unchanged during CLI-first phases.

## Workspaces

Use Node 22 (`nvm use`) for the official ZK Loan runtime. Node 24 is installed
locally but is incompatible with the official Attestation API's current
Restify/SPDY dependency path.

- `contract/`: Compact contract and generated artifacts
- `api/`: localhost-only public-ledger read adapter for the dev Vue viewer; no
  Spring Boot replacement
- `cli/`: local wallet, private state, proof, deployment, and state-query flow
- `attestation-api/`: mock-only Provider 1 legacy / Provider 2 EIP-712-gated
  Schnorr attestation provider

Private financial data, signatures, mnemonics, provider secrets, private state,
and logs are local-only and must not be committed.

## Provider 2 authorization handoff

Provider 2 requires a canonical Seller/Buyer EOA authorization before it issues
the existing Schnorr attestation:

1. The CLI keeps the raw mock financial tuple and hidden salt and requests a
   random two-minute challenge.
2. It prints the exact EIP-712 request for manual paste into the existing Vue
   application's development-only `/midnight/authorize` route.
3. Vue validates the fixed GIWA/Midnight/Provider context, selects exactly the
   canonical role wallet in MetaMask, signs, verifies the recovered signer, and
   returns minified one-line JSON for CLI paste.
4. The Mock Provider consumes the challenge once, re-resolves the GIWA role,
   recomputes the salted request commitment, and recovers the EOA before
   Schnorr issuance.

Raw financial values and the hidden salt never enter Vue. Compact verifies the
registered Provider's Schnorr signature; Midnight does not independently verify
the EIP-712 signature. Provider 1 results remain legacy role-context-only
results. Provider 2 registration, actual MetaMask signing, and the complete
local proof/transaction/Indexer E2E are still pending.

## Runtime compatibility

Keep `@midnight-ntwrk/onchain-runtime-v3` pinned and hoisted as one physical
`3.0.0` package while using Midnight.js 4.1.1. Compact runtime and Midnight.js
exchange WASM `StateValue` objects during every contract call. Two installed
runtime copies fail their class-identity check even when their JavaScript shapes
are identical.

Verify the installation with:

```sh
npm ls --all @midnight-ntwrk/onchain-runtime-v3
find node_modules -path '*/@midnight-ntwrk/onchain-runtime-v3/package.json' -print
```

Both Compact runtime and Midnight.js protocol must be `deduped` to the single
root package path.

## Phase 3A capability viewer

With the local Node and Indexer running, start the read-only adapter under Node
22:

```sh
nvm use 22
npm run build --workspace giwa-midnight-api
npm run start --workspace giwa-midnight-api
```

It binds to `http://127.0.0.1:4100`. The existing Vue development server proxies
`/midnight-api` to it and resolves one intentionally shared CLI Proof capability
at `/midnight`; it does not anonymously enumerate public results.
The adapter cannot request attestations, access the CLI wallet/private state,
generate proofs, register providers, or submit transactions. It reads only the
configured GASOK contract. The adapter is the sole address authority for the
viewer; Vue has no Midnight-contract environment default. After an approved
local redeployment, update the adapter's pinned public address:

```sh
MIDNIGHT_CONTRACT_ADDRESS=<64-hex-address> npm run start --workspace giwa-midnight-api
```

Current ADR-017 code checks: authorization-focused Attestation tests `18/18`;
the preceding full Attestation run `71/71` before the latest zero-value patch
(full listen suite not yet rerun afterward); CLI `57` with `1` optional
environment E2E skipped; and Vue lint/build checks passing. These do not replace
the pending full Provider 2 local runtime E2E.
