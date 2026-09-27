# Deployment

## Recording role entry — 2026-09-27

The optional Seller/Buyer/Funder recording shortcuts use the existing public
synthetic accounts and real user-controlled MetaMask transactions on GIWA
Sepolia91342. They do not change the walletless Midnight-only review flow.

- Existing Railway app: `RECORDING_DEMO_ENABLED=true` pins the three role
  companies to their addresses from `scripts/prepare-midnight-demo.mjs` and
  rejects an address/network mismatch before changing the wallet mapping.
- Existing Vercel `giwa-ui` build: `VITE_RECORDING_DEMO_ENABLED=true` displays
  the three buttons below Demo Start. Activate only after the server guard is
  deployed and verified. Preserve the existing environment values and services.
- Both defaults are false. The default local Compose reviewer experience stays
  walletless; enabling this hosted recording shortcut is not a clone prerequisite.
- A role button authenticates the existing ordinary account and checks its
  registered wallet. It neither overwrites mismatched mappings nor signs GIWA
  transactions. The owner selects/authorizes the corresponding MetaMask wallet.

Rollout evidence: [recording validation](RECORDING_DEMO_VALIDATION_2026-09-27.md).

## Current submission packaging — 2026-09-27

The owner approved the new `leonid-world/midproof` monorepo and existing-service
deployment. The reviewer local command is `docker compose up --build -d` from
its root; it creates separate Local Devnet/MySQL state and does not need the
hosted wallet or faucet. See `docker/local/README.md` and ADR-025.

Hosted deployment keeps the existing Railway integrated service, persistent
`/data/midnight-demo`, MySQL and `midproof.vercel.app`. Upload this monorepo root
to Railway. Vercel must build the `giwa-ui` root on the new repository's `main`.
The runner/container enables `MIDPROOF_SYNTHETIC_ONLY=true`. Startup prepares only
the synthetic login accounts and encrypted internal demo authentication keys;
there is no GIWA role-wallet/receivable/faucet preparation or fixture upload.
The demo uses a reserved synthetic context and performs no GIWA RPC calls.
Ordinary GIWA flows retain their original authorization and RPC boundaries.
Existing Midnight wallet, contract, provider and migration journal remain.

Actual rollout IDs, public validation and unfinished items are recorded in
[MIDPROOF_RELEASE_2026-09-27.md](MIDPROOF_RELEASE_2026-09-27.md). The historical
commands/evidence below describe the original GASOK checkout, unless explicitly
updated in that release record.

## Live rehearsal deployment — 2026-09-18

The source changes below were uploaded locally to the existing services for the
owner-requested real rehearsal; they remain uncommitted. See
[MIDNIGHT_LIVE_REHEARSAL_2026-09-18.md](MIDNIGHT_LIVE_REHEARSAL_2026-09-18.md)
for actual transaction/state evidence and remaining browser steps.

- Railway source deployment `e58b6f76-d5ed-482b-ba4b-787470a41fb4` succeeded.
  Its one-time explicitly pinned maintenance replaced only verifyEligibility at
  the SAME Preview contract address, counter0→1. Four operation keys match the
  local full-compile artifacts; full expected post-state digest matches public Indexer.
  Journal is complete and an encrypted pre-open snapshot of20files/963451bytes exists.
- Maintenance-enabled was then set0. Configuration restart deployment
  `61fe8fbe-3180-462e-8688-bad77ce92a6b` is SUCCESS; the previous instance is REMOVED.
  Explicit overlap0 and existing draining30 preserve the single-writer boundary.
  Existing wallet, private-state DB, Provider2, contract and MySQL were retained.
- Vercel `dpl_3bxfruxjKUeYy4JLFiM2QS3BgQKT` is READY/production for the existing
  midproof project/domain, public JS `index-DoRhjBIx.js`. Existing environment settings
  and project were used; no fresh project/domain was created.
- Final isolated CLI273 + GIWA18 passed. Prior verified suite totals894 across
  Midnight/root/Spring/UI when CLI213 is replaced with273, or912 including GIWA18.
  The initial sandboxed HTTP attempt was interrupted after localhost bind failures;
  the complete suite then passed with scoped local-server permission. No live suite
  was accidentally included.
- Final integrated linux/amd64 image `gasok-rehearsal:20260918`, config
  `sha256:cfb9dd7252d43fdb7213e4a0e788783b229513bc6a5f65ba73d7df0fd88b4312`,
  built successfully and passed artifact verification with networknone/UID10001.

The snapshot lives on the same volume and is not an off-site disaster-recovery
backup. Do not restore it over the completed maintenance journal: the chain update
cannot be undone by reverting local files. Timeout/uncertain journals must be
reconciled by recorded transaction IDs/state, never deleted to force resubmission.
The migration helper is disabled by default, Preview-only, and requires explicit
address/oldkey/newkey/counter pins; ordinary startup never infers a migration.


## Historical pre-rollout compliance validation — 2026-09-18

The current worktree includes new `verifyEligibility` prover/verifier keys. Full
compile, 834 distinct automatic tests, four actual isolated proof/verifier cases,
and the local integrated image build passed; see
[MIDNIGHT_COMPLIANCE_FIXES.md](MIDNIGHT_COMPLIANCE_FIXES.md). These changes have not
been committed, pushed or deployed. Existing public release records below remain
historical; they do not establish that the new constraints are active remotely.

Do not deploy the new application alone onto the old contract and expect ready.
Startup now reports `CONTRACT_VERIFIER_MISMATCH` for a different deployed key set,
or `CONTRACT_COMPATIBILITY_UNAVAILABLE` when comparison cannot complete. The SDK
already refused mismatching contracts; the new preflight makes the cause explicit
before restoring contract private state. A mismatch needs a reviewed key transition,
not repeated Run, a new wallet, erased state or automatic replacement deployment.

Before public rollout, preserve the existing state and inspect pending proof/
delivery reservations under the existing single writer. Review same-address
Preview operation-key maintenance using the stored maintenance authority; SDK
support exists but no migration transaction or permission verification was run
in this task. Coordinate the accepted key transition with the integrated runtime
and UI release, then verify actual deployed keys and browser Seller/Buyer ×
true/false, expiry, lost responses/ACK, restart and Indexer-delay behavior.
Existing request/capability address binding must be preserved or explicitly migrated.

Local validation image: `gasok-compliance:20260918`, config ID
`sha256:3785173c9da70008da404127f0852634b24232dfa27fffacc71f420c1a6894b6`.
Its artifact checker also passed as UID/GID 10001 with networking disabled and
no mounted volume. The application itself was not started against production state.
Include new scripts, artifact manifest and generated files when committing the
inner repository; root Git alone cannot publish inner uncommitted files.

## Free public domain — 2026-09-17

The public frontend origin is `https://midproof.vercel.app`. The existing Vercel
project is named `midproof` (same project ID); its existing `leonid-world/giwa-ui`
Git connection now uses `giwa-midnight` for Production. Preserve the 13 existing
Production variables, Vite build and Node 24 settings. A Git repository move or
paid domain is not needed for this address. The mistaken `midproof.app` project
association was removed.

Both Railway `CORS_ALLOWED_ORIGINS` and `MIDNIGHT_DEMO_ALLOWED_ORIGINS` use
`https://giwa-ui.vercel.app,https://midproof.vercel.app` during the transition.
Apply them together and restart/redeploy the existing integrated app once.
Keep the same `/data` volume, MySQL, single-writer settings and API domain.
Only a real new-Origin API response verifies this change; health alone does not.
The final old-domain redirect is 307 to the new domain. Vercel Git Production
deployment `dpl_CeMWG13gaYzBCn72ko5cRTcLhnUw` serves UI commit `d223f0a`;
Railway configuration redeploy `3efba8fd-5d3f-4b5a-bd4f-60bfda3f4727` reuses
the previous runtime image. New-origin API checks, public assets and Chrome
Seller login/request reads pass; full evidence is recorded in CONTEXT.md.

## Published MidProof release — 2026-09-17

Root code commit `00a409d568cca4f06e013ef30cc0bc507673c31b` and all four pinned
submodule commits are published on GitHub. A fresh recursive clone supplied the
Railway upload; the final root documentation commit only records this evidence.

- Vercel: `dpl_8rEwpWrAqR5oYox84BcKvYvEVPvQ`, READY/production at
  `https://giwa-ui.vercel.app`. Release metadata matches UI commit
  `82dca577487b07f2910a3f0d8872c27a9b1e9d07`; public HTML and JS/CSS/brand assets
  match the local build.
- Railway: `fcbb0ed4-2fd4-4aae-8081-70a72a0d7d58`, SUCCESS and the sole active
  deployment at `https://giwa-api-production.up.railway.app`. Release metadata
  matches root code commit `00a409d`; final image is
  `sha256:62e659606c5e0f3bc6053e2695d8adc1b2fd9ab11ceba7b40f50110ccd5d7efa`.
- Public health/readiness, Preview configuration, fictional MidProof provider,
  Seller login, authenticated 1–10,000 mKRW policy and proof-request reads pass.
  The historical receivable amounts and expired request are preserved. These
  release checks create no new proof or chain transaction.

Repository/domain renaming remains deferred in the submission checklist.

## Earlier MidProof source validation — 2026-09-17

The earlier Railway source validation used deployment
`a517b5c6-f460-4d03-b066-6ce2e73f7e4c` (SUCCESS), image
`sha256:54d7a976e930a1c74efd4248b0a1a69e1852abb0777df9c0f36d06431e8ade05`.
It includes the demo-only 10,000 mKRW new-issuance cap, authenticated amount policy,
small-demo bootstrap compatibility, and fictional provider MidProof display name.
The public `/health` and `/ready` are 200 and proofReady=true. Live Seller policy
returns suggested 1,000/900; 10,001/900 is rejected with 400 and original DB row is
unchanged. The existing project/service/DB/volume/wallet/contracts are preserved;
no extra service, GIWA contract change or new blockchain transaction was needed.

Vercel uses the same public origin and Production settings, now with original
MidProof branding and strict small-amount UI. Repository/domain rename remains
in the deferred submission checklist. Final Vercel deployment ID and browser
verification are recorded in CONTEXT.md.

## Midnight hosted demo: one Run / one application deployment

The owner approved a separate `midnight-demo` profile on 2026-09-15. This
profile uses public **Preview**, synthetic financial fixtures, and the actual
8.1.0 Proof Server. It does not deploy to Preprod or Mainnet. The historical
`undeployed` PoC and normal GASOK profile below remain available independently.

### Runtime ownership

| Component | Local demo | Railway demo |
| --- | --- | --- |
| Vue | Existing Vite process | Existing Vercel project |
| Public gateway, attestation, proof bridge, result reader | One Node child, port 18080 | Same application container, Railway `PORT` |
| Spring business API / public-context authority | IntelliJ Run, loopback 18081 | Same container, loopback 8081 |
| Proof Server 8.1.0 | Native binary if installed; otherwise automatically started Docker container | Official Nix binary and its dependency closure inside the application image |
| MySQL | Automatically created isolated demo container, loopback 3307 | Existing separate MySQL service |
| Midnight node and indexer | Public Preview endpoints | Public Preview endpoints |

Only the gateway receives a public Railway domain. The browser sends a selected
`profileId`; the Node gateway expands it into a fixed synthetic financial
fixture and passes the witness to its local prover. Spring only authorizes
public request context. The operator can access the fixture/witness inside this
hosted runtime. The provider signs synthetic fixtures and is explicitly a mock
provider, not a bank. Proof jobs use asynchronous status polling rather than
holding an ingress connection open during proving. The gateway opens while
wallet synchronization, faucet funding, and contract setup are still pending;
its config endpoint reports progress and proof routes remain unavailable.

### Local: press IntelliJ Run once

The migrated local state and Railway currently share the same Midnight wallet
identity. **Do not run the local migrated demo while the Railway wallet is
running.** Cross-host writes can conflict even though each host has its own
local process lock. Distributed ownership/fencing and separate development
identity management have not been implemented. Keep the migrated local runtime
stopped; any intentional move back requires stopping the cloud writer first
and using its latest state, not the stale pre-migration local copy.

Open the root project or `giwa-api`, select the shared **Midnight Demo** Spring
Boot Run configuration, and Run. Frontend development remains the existing
Vue/Vite command. Prerequisites are Java 17, Node 22 (22.21.1 recommended), and
installed Docker Desktop when a local MySQL or native prover is absent. On
macOS the runner starts the existing Docker.app if its daemon is stopped and
waits up to 90 seconds. It does not install Docker or change permissions, and
never stops Docker Desktop or unrelated containers. Linux and production keep
the existing requirement for an available daemon when Docker is needed. The
launcher can select an already installed nvm Node 22 when IntelliJ inherits a
different system Node version, and discovers Docker's installed CLI even when
the GUI application PATH omits it.

Spring starts `scripts/midnight-demo.mjs --mode=helpers`. The runner prepares
the isolated database, installs locked Node dependencies when needed, builds
the existing workspaces, starts the prover, and starts the integrated gateway.
No separate attestation, reader, bridge, node, or indexer terminal is required.
The first run needs network access for images, packages, proof parameters, and
Preview. Later runs reuse the local database and encrypted Midnight state.

After Spring becomes healthy, `scripts/prepare-midnight-demo.mjs` prepares the
approved synthetic demo accounts through the normal application APIs. In a fresh
capped demo, create a new small receivable through the UI. If the dedicated DB
already contains the exact historical GIWA #2 fixture, preparation retains its
original amounts and verifies/restores its existing transaction receipts against
RPC. It sends no new chain transaction. Repeated
runs reuse matching records; conflicting accounts or receivables fail visibly
without reset. `MIDNIGHT_DEMO_PREPARE_FIXTURE=false` skips this optional fixed
fixture when a deployment already uses different prepared demo data.

- Browser API / gateway: `http://127.0.0.1:18080`.
- Spring private health: `http://127.0.0.1:18081/health`.
- The shared Run configuration reserves ports 18080/18081 through environment
  variables so the unrelated application already using 8080 remains available.
- State: `.local/midnight-demo`, ignored by Git and Docker build context.
- Owned local containers: `gasok-midnight-demo-mysql` and
  `gasok-midnight-demo-prover`. Other containers, including Supabase, are not
  managed. Stop terminates helper processes and containers started by that
  runner; persistent volumes are retained.
- Default local database: `127.0.0.1:3307/gasok_midnight_demo`, user `gasok_demo`,
  disposable local-only password `gasok-demo-local-only`. The runner initializes
  CREATE statements only after proving this dedicated database is empty. It
  never runs the canonical schema's DROP statements.
- Explicit `DB_*`, `MYSQL*`, or `SPRING_DATASOURCE_URL` variables mean use the
  configured database; automatic database management is then disabled. Clear
  old database variables in the Run configuration to use the isolated demo DB.
- A new Preview wallet may require one-time faucet funding. The gateway reports
  `funding_required` until usable funds are indexed. Do not present health as
  proof readiness: deployment, Provider registration, and a real proof must
  complete before claiming an end-to-end Preview demo.

The runtime persists encrypted identity/private state and stable local keys.
Keep the state directory across restarts. It writes only public network and
contract address metadata to `deployment.json`; Spring reads that manifest and
fails closed while the Preview contract is unavailable. Do not share the
encrypted identity, storage password, or Spring capability key in logs or Git.

### Railway: reuse the application and MySQL services

Keep the existing Vercel project and the existing Railway project with **two
services**: the integrated application and MySQL. No new application service
is needed for attestation, reading, bridge, or proving. The root `Dockerfile`
builds Java and the Node workspaces, copies the official prover's `/nix/store`
closure, and starts the supervisor; Docker itself is not run inside Railway.

The existing Railway application service uses this configuration:

1. Build from the **GASOK root**, containing populated `giwa-api` and
   `giwa-midnight` checkouts. Clear the old `/giwa-api` Root Directory and custom
   build command. Use the root `Dockerfile` and explicitly set the service's
   Start Command to `/app/scripts/midnight-container-entrypoint.sh`.
   Sending `null` did not clear the earlier start-command override, so verify
   this literal path in service settings before a new root upload. Configure
   the service's actual Build/Deploy settings as described below.
   A connection to the standalone `giwa-api` repository cannot supply the
   sibling Midnight source; the root CLI upload below includes both checkouts.
   The old standalone `giwa-api` repository's `main` source connection has
   been disconnected. The official release path is now one root CLI upload
   to the existing service, not a standalone-repository redeploy.
2. Add one persistent volume mounted at `/data` on the application service.
   It contains both encrypted demo state and downloaded proof parameters.
   Set one replica in the service's Scale settings, in one region; the
   wallet/private-state database has a single writer.
3. Reuse the existing MySQL service's host, port, user, and password references
   and preserve production `JWT_SECRET`. Select the separate
   `gasok_midnight_demo` logical database for the integrated demo; the existing
   `railway` database and its original tables are retained.
   Set `CORS_ALLOWED_ORIGINS` and `MIDNIGHT_DEMO_ALLOWED_ORIGINS` to the exact
   Vercel origin, comma-separated if multiple origins are required. Update the
   frontend's API/gateway URL to the existing Railway public domain.
4. Keep the image defaults: `SPRING_PROFILES_ACTIVE=midnight-demo`,
   `MIDNIGHT_NETWORK_ID=preview`, `MIDNIGHT_DEMO_STATE_DIR=/data/midnight-demo`,
   `MIDNIGHT_PROOF_SERVER_NUM_WORKERS=1`. Railway supplies `PORT`; Spring keeps
   its distinct private port. Do not expose port 6300 or add a separate prover
   public domain. Set the service's deployment Healthcheck Path to `/health`
   and Healthcheck Timeout to 600 seconds (or set
   `RAILWAY_HEALTHCHECK_TIMEOUT_SEC=600`).
   It reports application availability separately from proof readiness;
   `/ready` stays unavailable until contract and provider setup are complete.
   Set `RAILWAY_DEPLOYMENT_DRAINING_SECONDS=30` to allow the supervisor and
   encrypted wallet checkpoint to finish after SIGTERM. Railway documents a
   default of zero seconds; retain zero deployment overlap for this single
   state volume. See the official [healthcheck settings](https://docs.railway.com/deployments/healthchecks)
   and [runtime configuration variables](https://docs.railway.com/variables/reference).
5. Preserve and back up `/data` alongside MySQL. A mounted volume couples state
   to this single service and prevents multiple replicas; expect brief downtime
   during redeployment. Changing the encrypted state keys breaks access to the
   previous wallet/capability state.

Do not rely on the root `railway.json` to apply these settings to this service.
Railway now deprecates Config as Code: existing users of `railway.json` or
`railway.toml` retain support only until 2026-12-01, and services that have not
used it cannot newly opt in. The dashboard observed on 2026-09-15 gives
2026-08-28 as the opt-in cutoff; this application's config-file path is unset.
Set and verify the real service settings before upload. The optional successor
is `.railway/railway.ts`, but it is not required for this existing service's
manual settings plus CLI upload. See Railway's current
[Config as Code notice](https://docs.railway.com/config-as-code).

Railway CLI authentication is complete. For subsequent source releases, one
upload from the root targets the existing application:

```sh
npx --yes @railway/cli@5.57.1 up . --project 51aaa2c8-0b42-41a4-9594-4245786f1a60 --environment b7530e23-f1a2-4da2-9320-e80ecada0268 --service 5ea692fe-4985-48e1-90a8-18c10f51d321 --path-as-root
```

The CLI command does not create a project or service, configure billing, mount
the volume, or migrate a populated database. Existing schema changes still use
the non-destructive migrations described below. The upload includes the current
populated checkouts and respects Git ignore rules; do not add `--no-gitignore`.
See the official [CLI upload reference](https://docs.railway.com/cli/up).

Production demo verification on 2026-09-15: Railway deployment
`35dbfd8b-2067-46a6-adcd-02b198c787d3` was built and uploaded from the GASOK
root and runs the native prover, private Spring API on 8081, and public gateway
through `/app/scripts/midnight-container-entrypoint.sh`. Railway and Vercel CLI
authentication are complete. Project `elegant-recreation` still has exactly two
services, the existing application and MySQL, with a 5 GB persistent application
volume at `/data`. The earlier `migration_hold` deployment was used only while
transferring the database and encrypted state.

The `gasok_midnight_demo` logical database has been created and imported inside
that existing MySQL service; the original `railway` database's seven tables are
preserved. The encrypted wallet state has been restored to the application
volume and its transferred file hashes verified. Private keys, passwords, and
backup contents are not recorded here.

The public API at `https://giwa-api-production.up.railway.app` returned
`/health` with `status: UP`, `proofReady: true`, and `stage: ready`; `/ready`
returned HTTP 200. The restored wallet kept Preview contract
`bfb760db44f9ee7996ef12c47e56346903c654aede7d65c3c88110214c932a1e`.
All three wallet SDK synchronization streams reported connected/ready with
their applied indexes equal to their tips.

Authenticated public requests and CORS for `https://giwa-ui.vercel.app` were
verified. The migrated GIWA #2 receivable retained its Seller `COMPLETED` and
Buyer `REQUESTED` proof requests. The completed request's public resolver
returned the matching version-2 result: `eligible: true`, Provider 2,
`profileAsOf: 1789452516`, and `validUntil: 1789535562`. These timestamps record
the observed result; they are not an assertion of perpetual validity.

The Railway native prover also passed both synthetic proof checks: `steady`
produced `true` (5,755 bytes, 2,843 ms), and `stretched` produced `false`
(5,757 bytes, 1,940 ms), exiting successfully. This check used an in-memory
ledger and did not submit new transactions to Preview; it is distinct from
the migrated on-chain proof and its successful hosted result resolution.

Vercel deployment `dpl_8uWMXSTE1h7TWXYiJGKKBEuMrewX` is `READY` and has been
promoted to the existing public [Midnight demo](https://giwa-ui.vercel.app).
The public domain now serves the Midnight screen. Its 13 public API/GIWA/Midnight
build values are saved in the existing project's Production environment and
verified to match, so later deployments retain the same configuration. No new
frontend project or Git push was needed. The public browser check passed:
`/login` → the verification-requester demo login → `/midnight` showed ready
status and both migrated requests; opening the Seller's public result showed
the criteria satisfied, issued at `2026-09-15 15:08:36` and valid until
`2026-09-16 14:12:42` (KST), matching the resolved values above.

A new public-domain wallet-consent → Preview transaction flow was not repeated
after migration. A new subject proof still requires the owner to allow the
domain in MetaMask and sign the new request with the subject wallet.

### Packaging checks

```sh
node --test scripts/midnight-demo.test.mjs
docker buildx build --platform linux/amd64 --load -t gasok-midnight-demo:railway-current .
```

The first command checks database ownership, non-destructive initialization,
port isolation, allowed network/prover configuration, and bounded macOS Docker
startup without installing software or changing existing containers. The image build
compiles both applications and executes the copied prover's `--help`, verifying
that its executable loader/dependencies survived composition. A successful
image build alone does not establish a funded Preview wallet or successful
on-chain proof; record those separately after runtime initialization.

Local packaging evidence on 2026-09-15: all 10 runner tests passed; complete
Linux ARM64 and AMD64 images built successfully. The copied native AMD64 prover
answered `/version` with `8.1.0`, and the AMD64 compiled hosted bootstrap
imported successfully. An isolated integrated ARM64 container started the native
prover, Spring, fixture preparation, and gateway. It returned `/health` 200 with
`proofReady:false`, and `/ready` 503 during wallet synchronization. Repeated
fixture preparation preserved counts of 3 companies, 3 users, 3 wallets,
1 receivable, and 3 transaction records. SIGTERM completed with exit 0; the
temporary smoke container was removed and the shared demo database was retained.

Recorded local image IDs (not deployed to Railway):

```text
arm64 sha256:dec7ffc715b95e01d883abfe71a3dff1ed0bbe488360cd51e8193c624ce81e3e
amd64 sha256:43c28473a0e460c6cadba73bcc34cab536196d4eadd57f65c471e3f57ae3ebad
```

These smoke images precede the later macOS-only automatic Docker Desktop
startup addition; that code path was verified with a simulated command runner and
read-only reuse of the already-running daemon.

Final packaging gate on 2026-09-15 at 15:13 KST: the latest Linux AMD64 image
`gasok-midnight-demo:railway-current` built successfully with image ID:

```text
sha256:26980d97c3e0229340e525da68b5bd957cd73bb3101d4df7e319604674d9460a
```

All 10 runner tests passed again. Six key source hashes match between this
image and the current checkout: SDK API, hosted bootstrap/gateway/wallet,
runtime supervisor, and fixture preparation. The image includes the built
wallet module, Spring JAR, and native prover; known local state and environment
paths are absent. This is a local build and isolated file inspection, not a
new Railway deployment or a new integrated runtime/E2E result. The funded local
demo, database, and prover were not restarted for this packaging gate.

## Historical Midnight v2 Local Deployment

Midnight remains local-only on network `undeployed`; it is not deployed to
Preprod/Mainnet, Railway, or Vercel. The current v2 contract is:

```text
12caaf76aef1de1c584b67462018810f6e4e7eb2535e136f560cb621e24a3f36
```

Provider ID 2 was registered using the deterministic local development secret
literal `PROVIDER_SECRET_KEY=2`. Registration transaction
`006abe69d8ba934519e19c4490ce77be724f75aae1bcb4e6b4fcd720258aa10601`
was included at local block `25714`; the public registry contained one Provider
after verification. The old v1 contract is preserved. Do not remove/recreate
Docker volumes or redeploy simply because an Indexer read is temporarily
missing.

Use [the local runbook](../../midnight/LOCAL_POC_RUNBOOK.md) as the executable
source of truth. It starts five Midnight-facing terminals: Docker Node +
Indexer + Proof Server, deterministic Mock Provider 2, Read API, Proof Bridge,
and Vue. Spring Boot and MySQL are required in addition. The Bridge and CLI
share the Midnight wallet/private-state database and must not run concurrently.

Required secret/config boundaries:

- Node/CLI/Bridge runtime stays on Node `22.21.1`.
- `PROVIDER_SECRET_KEY=2` is a deterministic local test value only; never use it
  on a network or asset with value.
- `MIDNIGHT_STORAGE_PASSWORD` opens the encrypted Midnight private state and
  derives the encrypted capability-outbox key. Keep it in an ignored local env
  file and preserve it across Bridge restarts; losing/changing it makes the
  outbox and private state unavailable.
- Spring requires a separate externally supplied 32-byte
  `MIDNIGHT_CAPABILITY_ENCRYPTION_KEY`. It is not stored in MySQL or Git.
- Existing MySQL installs apply
  `.codex/migrations/20260819_midnight_proof_requests.sql` once after backup and
  only when the table is absent.

Use `http://127.0.0.1:5173` consistently for the browser. The Bridge accepts
both loopback names, but `localhost` and `127.0.0.1` are different browser
origins/cookie scopes; Spring CORS must include the exact origin used by Vue.
Switching names mid-session can look like an authentication/CORS failure.

The current checks are Compact contract `39/39`, Mock Provider `87/87`, Read
API `60/60`, CLI `156` passed plus `1` optional environment test skipped (12
passing files plus 1 skipped file), Vue `141/141` across 21 files, and Spring
full Gradle `86/86` including focused Midnight `19/19`. CLI typecheck/build,
Vue lint/build, Spring `bootJar`, and deployment/registration preflight passed.
A fresh end-to-end v2 browser run through MetaMask, Spring `SUBMITTED`, Bridge
ACK, Funder resolve, and `COMPLETED` has not yet been recorded after the final
outbox changes, so deployment readiness must not claim that live evidence yet.

## Historical GIWA deployment status

- Target network: GIWA Sepolia.
- Local Hardhat compilation passes with Solidity `0.8.24+commit.e11b9ed9`,
  optimizer enabled with 200 runs, viaIR disabled, and EVM version Paris.
- The original Remix MockKRW and ReceivableFinance deployment completed the live
  lifecycle but its compiler settings were not retained for final verification.
- The replacement Hardhat deployment and Blockscout verification are complete.
- Verified MockKRW:
  `0x5cD8a99Dcf5Fa00fb4fD9873b41A15F9C13C9d3F`.
- Verified ReceivableFinance:
  `0x0f264334f98BA0d22f7Fc6Bb901a5Fa36158a315`.
- User-confirmed Seller createReceivable and Buyer verifyReceivable live transactions
  are complete.
- User-confirmed Seller tokenizeReceivable live transaction, escrow NFT mint, and
  backend TOKENIZED/tokenId/tokenizeTxHash synchronization are complete.
- User-confirmed Funder mKRW approval, fundReceivable, backend FUNDED
  synchronization, and Seller mKRW receipt are complete on GIWA Sepolia.
- User-confirmed Buyer mKRW approval, repayReceivable, backend RPC proof, and DB
  REPAID synchronization are complete. Exact current-owner face-value receipt
  remains to be confirmed.
- The Repayment backend/frontend update has not yet been redeployed to Railway
  and Vercel.
- The Vercel frontend is deployed.
- The Railway backend is deployed, and `GET /health` returns `{"status":"UP"}`.
- Browser API calls from `https://giwa-ui.vercel.app` are working without CORS
  errors after normalizing the frontend API base URL.
- Public replacement addresses, deployment transactions, blocks, deployer, and
  compiler settings are recorded in
  `giwa-contrract/deployment/giwa-testnet.json`.
- Hardhat owner operations can transfer existing mKRW or mint additional
  test-only mKRW to Buyer/Funder wallets without using Remix.
- MockKRWFaucet is deployed separately at
  `0xa451FA95c3E2Efd771f6Ba556daBBf36f888ef2E` with a fixed
  `10,000,000 mKRW` claim. Its deployment metadata leaves the verified
  MockKRW/ReceivableFinance pair untouched.
- The tracked frontend environments and Funding/Repayment UIs use the Faucet
  address. The Faucet now holds `600,000,000 mKRW`, while the Vercel runtime
  variable and frontend redeployment are still pending.
- Owner-to-Funder `10,000 mKRW` transfer
  `0x276dc7572aa09e47b2cc55e1b75ae4e111cfbe1cb45f89ef73985a4716032ba0`
  is confirmed. A temporary public-RPC latest-state lag caused the original CLI
  post-state check to report a false error even though the receipt and Transfer
  were valid; owner tasks now retry state reads at the confirmed block and warn
  without treating an already confirmed transfer as failed.

## Historical v1: Midnight Local-Only Proof Bridge

Midnight is not part of the Railway or Vercel deployment. Never add the Proof
Bridge, Mock Attestation API, Proof Server, local Node/Indexer, Midnight wallet
seed, private-state password, raw financial values, or
`VITE_MIDNIGHT_PROOF_BRIDGE_ENABLED=true` to a production environment. No
Midnight contract is deployed to Preprod or Mainnet.

The development stack uses these loopback-only processes:

- Midnight Node `127.0.0.1:9944`
- Midnight Indexer `127.0.0.1:8088`
- Midnight Proof Server `127.0.0.1:6300`
- Mock Attestation API `127.0.0.1:4000`
- read-only capability API `127.0.0.1:4100`
- trusted Proof Bridge `127.0.0.1:4200`
- Vue development server on strict `127.0.0.1:5173`, with same-origin
  `/midnight-api` and a proof-flag-conditional `/midnight-proof` proxy

Use `midnight/LOCAL_POC_RUNBOOK.md` for the five copy-paste terminals and actor
test sequence. The existing Spring API/MySQL must also be reachable so Vue can
load authenticated receivable context, but they are not new Midnight
processes. Seller/Buyer start issuance from Receivables and sign with the
derived role wallet; Funder uses `/midnight` only to verify a delivered
capability. No user manually types an onchain ID in the current Vue flow.

Capability copy/export/import needs no sixth service. It is an explicit local
browser/OS handoff: Seller/Buyer copy to the clipboard or export a local file,
and Funder imports from the clipboard or a selected file. The file is never
uploaded to Spring or a delivery server. It is correlation-sensitive and may
remain in clipboard history, backups, or synced folders, so use only the
intended Funder, avoid shared/auto-synced locations, clear or overwrite the
clipboard, and delete obsolete files. Raw JSON is for advanced diagnostics.

Use Node 22.21.1 for the current Midnight CLI/Bridge runtime. Start
Node/Indexer/Proof Server
through `giwa-midnight/cli/standalone.yml`, then the already-registered Provider
2 Mock Attestation API, the read API, and the Proof Bridge. Use Node 24.19.0 for
the current `giwa-ui` toolchain and start Vue last; some installed transitive UI
dependencies require Node `>=24.15` or `>=22.22.2`. The
Provider process key must match the Provider 2 public key registered in the
current local Compact deployment; restarting an ephemeral Provider with a new
key requires intentional re-registration before proof creation.

From the `giwa-midnight` workspace, the Bridge command is:

```bash
nvm use 22.21.1
npm run proof-bridge --workspace zkloan-credit-scorer-cli
```

From `giwa-ui`, use:

```bash
nvm use 24.19.0
npm run dev
```

The process performs its wallet/private-state checks plus a 10-second-bounded
Indexer contract/Provider preflight before opening port 4200, then seals the
validated GIWA configuration in memory. Per-challenge preparation uses that
cache instead of querying the Indexer while raw inputs exist. A missing existing
contract-scoped private state, mismatched running Provider 2 key, unavailable
local service, or already-held process lock must fail closed rather than create
a new participant or overwrite state. The SDK Indexer query has no abort signal,
so one timed-out startup query may remain internally pending, but the server
does not open and no raw proof input has been accepted. This public preflight
does not yet impose an end-to-end deadline on every subsequent SDK
`joinContract` watcher; the Bridge still never opens its HTTP port until join
finishes, and a full join deadline remains a tracked hardening item.

The Bridge deliberately uses the public, disposable Local Dev genesis wallet
seed already used by the standalone CLI flow. It is not a production secret and
must never be reused on Preprod, Mainnet, or for assets with value. Real wallet
seeds and private keys remain prohibited in source, Vue, Spring, logs, and chat.

Do not run the interactive CLI and Proof Bridge concurrently. They share one
encrypted LevelDB participant state and wallet and use a common fail-fast
process lock. Do not delete or recreate the local Node container when the
current disposable contract/results must remain available; the compose setup
does not yet provide an approved durable Node/Indexer recovery design.

The Bridge is a trusted custodial single-user development process. Keep all
ports on literal loopback, leave CORS disabled, and access it only through the
Vue dev proxy. Current official Local Dev also supports Lace on `undeployed`,
but ADR-018 intentionally reuses the proven CLI participant instead of creating
and migrating a second Lace identity/private state. This does not authorize a
remote Bridge deployment.

Only the ignored/local development Vue environment may enable the route:

```env
VITE_MIDNIGHT_POC_ENABLED=true
VITE_MIDNIGHT_PROOF_BRIDGE_ENABLED=true
VITE_MIDNIGHT_PROOF_API_URL=/midnight-proof
```

`VITE_MIDNIGHT_PROOF_API_URL` must remain a same-origin absolute path. Do not
replace it with `http://127.0.0.1:4200`; the Vite proxy supplies the same-origin
browser boundary and the Bridge intentionally enables no CORS. Production and
tracked production configuration must keep both feature flags false.

With the proof flag on, both the Vite devtools plugin and Vue runtime Devtools
exposure are disabled, strict port `5173` prevents Origin drift, and the
port-4200 proxy is present. With the flag off, that proxy is absent. If the
Bridge returns `complete` but the read resolver has not seen the result yet, the
Midnight transaction has already finalized: retry only public resolution. Do
not restart the proof session or submit another proof for an Indexer delay.

## Contract Deployment

GIWA Sepolia Hardhat configuration:

- Chain ID: `91342`
- RPC: `https://sepolia-rpc.giwa.io`
- Explorer: `https://sepolia-explorer.giwa.io`
- Blockscout API: `https://sepolia-explorer.giwa.io/api`
- Compiler: `0.8.24+commit.e11b9ed9`
- Optimizer: enabled, 200 runs
- viaIR: disabled
- EVM version: Paris

The public GIWA RPC is rate-limited. Override `GIWA_RPC_URL` in the current
terminal when a dedicated provider is available.

1. Back up the existing MySQL database and preserve the original deployment
   addresses and transaction history.
2. Install the locked toolchain with `npm ci` in `giwa-contrract`.
3. Confirm the deployer has GIWA Sepolia ETH.
4. Export the private key only for the current terminal session:

   ```bash
   read -s "DEPLOYER_PRIVATE_KEY?GIWA deployer private key: "
   export DEPLOYER_PRIVATE_KEY
   ```

5. Deploy and verify:

   ```bash
   npm run deploy:giwa:verify
   unset DEPLOYER_PRIVATE_KEY
   ```

6. If Blockscout indexing delays verification, do not redeploy. Run:

   ```bash
   npm run verify:giwa
   ```

7. Print the address variables:

   ```bash
   npm run deployment:env
   ```

The deploy script checks chain ID, deployer balance, deployment receipts, and
`ReceivableFinance.paymentToken()`. It records addresses, deployment hashes,
blocks, deployer address, time, and compiler settings in
`giwa-contrract/deployment/giwa-testnet.json`. A completed metadata file prevents
an accidental repeat; an intentional later replacement requires transient
`ALLOW_REDEPLOY=true` and archives the prior metadata.

Before verification, the verification script independently checks the live chain
ID, bytecode at both recorded addresses, compiler metadata, and the
`ReceivableFinance.paymentToken()` link. A partially completed deployment is
resumed only after the recorded MockKRW code, owner, and zero-decimal model are
validated.

During the replacement deployment, the Finance creation receipt succeeded but
the first public-RPC `paymentToken()` read returned empty data. Explorer and RPC
checks recovered the already-deployed Finance at
`0x0f264334f98BA0d22f7Fc6Bb901a5Fa36158a315`; it was not redeployed. The
deployment and verification scripts now retry code/state visibility, and complete
receipt metadata is written before the post-deployment state check.

Never store the deployer private key, seed phrase, or MetaMask password.
Never rerun the destructive `.codex/schema.sql` against a populated database.

### Replacement deployment boundary

The replacement pair is a new independent system:

- The new ReceivableFinance has empty receivable mappings, counters, and NFT
  ownership.
- The new MockKRW has separate balances; the initial supply belongs to the new
  deployer.
- Old mKRW balances, NFT ownership, allowances, transaction hashes, and DB
  journal proofs remain tied to the original pair.
- Never update an old DB row's contract/token metadata to the new addresses.
- Prefer a new empty demo database while preserving the completed one.
- Transfer the new deployer's initial MockKRW balance to Buyer and Funder, or mint
  additional test supply only when necessary. Import the new token in MetaMask
  and approve the new Finance address.
- Clear only the old per-company `receivablePendingBlockchainSync` browser record
  before the fresh demo when necessary.

### MockKRW demo distribution

MockKRW deploys with `1,000,000,000 mKRW` in the owner wallet. Prefer moving that
existing balance because `transfer` does not change total supply. Use `mint` only
when additional test-token supply is intentionally required.

```bash
cd giwa-contrract
read -s "DEPLOYER_PRIVATE_KEY?GIWA MockKRW owner private key: "
export DEPLOYER_PRIVATE_KEY

npm run mkrw:transfer -- 0xFUNDER_OR_BUYER_WALLET 8000000
# Alternative additional issuance:
npm run mkrw:mint -- 0xFUNDER_OR_BUYER_WALLET 8000000

unset DEPLOYER_PRIVATE_KEY
```

Use only one operation for the intended distribution. Amounts are integer mKRW
without commas or decimal points. The tasks read the recorded MockKRW address,
require chain ID `91342`, verify deployed code, zero decimals, the current
onchain owner, native gas balance and any required transfer balance, wait for one
confirmed transaction, and verify the emitted Transfer plus post-transaction
balances and total supply.
They print the transaction hash before waiting so an uncertain client result can
be checked in the explorer instead of submitted again. Confirmed-block state
reads are retried to tolerate GIWA public-RPC visibility lag; an exact confirmed
Transfer remains successful even if the follow-up state query still needs more
time.

### MockKRWFaucet deployment

The demo Faucet is deployed separately against the existing MockKRW. It does not
replace or modify the recorded MockKRW/ReceivableFinance pair. Source verification
is optional for runtime use.

Current GIWA Sepolia deployment:

- MockKRWFaucet: `0xa451FA95c3E2Efd771f6Ba556daBBf36f888ef2E`
- MockKRW: `0x5cD8a99Dcf5Fa00fb4fD9873b41A15F9C13C9d3F`
- Claim amount: `10,000,000 mKRW`
- Transaction: `0xcd71ff3c79c17bfc4627a22c87a72139c30cd5a69cf686025744f5b30f8cc633`
- Block: `32667847`
- Current pre-funded inventory: `600,000,000 mKRW`, enough for sixty fixed claims.

```bash
cd giwa-contrract
read -s "DEPLOYER_PRIVATE_KEY?GIWA MockKRW owner private key: "
export DEPLOYER_PRIVATE_KEY

# Optional before the first deployment; defaults to 10000000.
export MKRW_FAUCET_CLAIM_AMOUNT=10000000
npm run deploy:faucet:giwa

unset MKRW_FAUCET_CLAIM_AMOUNT
unset DEPLOYER_PRIVATE_KEY
```

The command validates chain ID `91342`, the existing MockKRW bytecode and token
identity, zero decimals, the recorded/current owner, and native gas balance. A
successful receipt is stored in
`giwa-contrract/deployment/giwa-testnet-faucet.json`; the original
`giwa-testnet.json` remains unchanged. If immediate RPC state reads lag, rerun the
same command. It recovers the recorded Faucet and does not submit another
deployment.

After deployment, pre-fund the printed Faucet address separately with the
existing owner inventory:

```bash
npm run mkrw:transfer -- 0xFAUCET_ADDRESS 200000000
```

This example funds twenty `10,000,000 mKRW` claims without increasing total
supply. Choose the inventory intentionally before running the transfer. The
deployment alone does not create Faucet inventory; this pre-funding transfer
must complete before testing the public claim button. The deployed Faucet has
since been funded with `600,000,000 mKRW`; do not repeat the example transfer
unless additional inventory is intentionally required.

## Frontend Configuration

Copy `giwa-ui/.env.example` to an ignored `.env.local` and set:

```env
VITE_GIWA_CHAIN_ID=
VITE_GIWA_CHAIN_ID_HEX=
VITE_GIWA_RPC_URL=
VITE_GIWA_EXPLORER_URL=
VITE_RECEIVABLE_FINANCE_ADDRESS=
VITE_MOCK_KRW_ADDRESS=
VITE_MOCK_KRW_FAUCET_ADDRESS=
```

Decimal and hexadecimal chain IDs must represent the same network.
The tracked development, production, and example files currently set
`VITE_MOCK_KRW_FAUCET_ADDRESS` to the deployed Faucet. Funding uses it when the
Funder balance is below `fundingAmount`; Repayment uses the same address when the
Buyer balance is below `faceValue`. Add the same variable in Vercel and rebuild.
No Railway/backend Faucet variable is required because claim is a frontend
MetaMask transaction outside the receivable lifecycle journal.

Vercel serves the Vue Router history-mode SPA through the root `vercel.json`
rewrite to `index.html`. Keep `public/robots.txt`, `public/sitemap.xml`, favicon,
Apple touch icon, and social preview assets in the Vite public directory. The
canonical and social metadata currently target `https://giwa-ui.vercel.app`;
update them together if the production domain changes.

## Standalone GIWA backend deployment

Railway uses `giwa-api/Dockerfile`, which provides both the Java 17 compiler and
runtime. Do not keep a custom Railpack build command such as `./gradlew bootJar`;
let Railway detect the Dockerfile and use its ENTRYPOINT.

Source configuration

- If `giwa-api` is its own Git repository, the service root is the repository root.
- If the whole `gasok` repository is connected, set Railway Root Directory to
  `/giwa-api`.
- The build log should contain `Using detected Dockerfile`.

Add a Railway MySQL service, then create these reference variables on the API
service. Replace `MySQL` if the database service has a different name.

```env
MYSQLHOST=${{MySQL.MYSQLHOST}}
MYSQLPORT=${{MySQL.MYSQLPORT}}
MYSQLDATABASE=${{MySQL.MYSQLDATABASE}}
MYSQLUSER=${{MySQL.MYSQLUSER}}
MYSQLPASSWORD=${{MySQL.MYSQLPASSWORD}}
```

Also configure:

```env
JWT_SECRET=<random secret of at least 32 bytes>
CORS_ALLOWED_ORIGINS=https://<production-vercel-domain>
GIWA_RPC_URL=<backend GIWA Sepolia JSON-RPC URL>
GIWA_CHAIN_ID=<decimal GIWA Sepolia chain ID>
GIWA_RECEIVABLE_FINANCE_ADDRESS=<deployed ReceivableFinance address>
GIWA_MOCK_KRW_ADDRESS=<deployed MockKRW address>
GIWA_RPC_TIMEOUT_MS=10000
GIWA_MIN_CONFIRMATIONS=1
```

- Do not commit `JWT_SECRET`.
- Treat an RPC URL containing an API key as a secret and do not commit or log it.
- `GIWA_CHAIN_ID`, `GIWA_RECEIVABLE_FINANCE_ADDRESS`, and
  `GIWA_MOCK_KRW_ADDRESS` must match the deployed frontend network,
  ReceivableFinance contract, and its `paymentToken()`.
- Do not add a trailing slash to the CORS origin.
- Do not add a trailing slash to `VITE_API_URL`. The frontend also normalizes it
  defensively before appending API paths.
- Multiple exact origins are comma-separated.
- Railway provides `PORT`; the application reads it automatically.
- The existing `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USERNAME`, and `DB_PASSWORD`
  variables remain supported and override the Railway MySQL names.
- Remove stale or blank `DB_*` variables. Even an empty override prevents the
  corresponding Railway `MYSQL*` fallback from being used.

Database initialization

- For a brand-new empty Railway database, run `.codex/schema.sql` exactly once.
- That file contains destructive DROP statements. Never run it against a populated
  database.
- For an existing populated database, use the non-destructive migration files only.
- `spring.sql.init.mode=never`, so application startup does not create tables.
- Before deploying the transaction journal backend, run the non-destructive
  `.codex/migrations/20260730_blockchain_transactions.sql` against an existing
  database. The canonical fresh schema already contains this table.
- Before deploying RPC verification over an existing journal table that has none
  of the four RPC proof columns, run the preflight and one-time ALTER in
  `.codex/migrations/20260730_blockchain_transaction_rpc_verification.sql`.
- If that existing table has no `verification_version`, run
  `.codex/migrations/20260730_blockchain_transaction_verification_version.sql`
  after its preflight. This is also the upgrade path when the four proof columns
  were already deployed earlier.
- A fresh database initialized from the current `.codex/schema.sql` already has the
  proof columns and must not run either journal migration afterward.
- Funding and Repayment reuse existing receivable and journal columns. Neither
  requires a new database migration.
- A table created by the current
  `.codex/migrations/20260730_blockchain_transactions.sql` also already has the
  proof columns; do not run the RPC ALTER after it.

RPC-verified transaction journal rollout order

1. Back up MySQL and confirm whether `blockchain_transactions` exists.
2. If absent, run `.codex/migrations/20260730_blockchain_transactions.sql` and skip
   both ALTER migrations. If it exists with none of the four proof columns, run
   `.codex/migrations/20260730_blockchain_transaction_rpc_verification.sql` once.
   If the existing table lacks `verification_version`, then run
   `.codex/migrations/20260730_blockchain_transaction_verification_version.sql`
   once.
3. Configure all five `GIWA_*` Railway variables above.
4. Deploy the Railway backend and verify `/health`.
5. Verify an authenticated `POST /blockchain-transactions` can create PENDING.
6. Retry or execute a Seller create or Buyer verify transaction and require
   CONFIRMED to contain `blockHash`, `eventReceivableId`, and `rpcVerifiedAt`
   before receivable synchronization.
7. Deploy the Vercel frontend error-handling update.

Deploy the backend before the frontend because the updated frontend requires the
new journal endpoints.

For the tokenization rollout, deploy the backend `/tokenized` synchronization
endpoint before deploying the Seller mint CTA.

For Funding and Repayment rollout, deploy the backend `/funded` and `/repaid`
synchronization endpoints plus FUND_RECEIVABLE and REPAY_RECEIVABLE journal
verification before deploying their frontend pages.

After deployment:

1. Generate a Railway public domain.
2. Optionally set the Railway health-check path to `/health`.
3. Open `https://<railway-domain>/health` and require `{"status":"UP"}`.
   This endpoint is a liveness check only; it does not prove that MySQL is
   connected or that the schema has been initialized.
4. Set Vercel `VITE_API_URL=https://<railway-domain>`.
5. Redeploy Vercel because Vite environment variables are build-time values.
6. Test signup, login, wallet load, receivable list, Seller create, and Buyer verify
   from the Vercel origin.

## GIWA Live Verification

The Buyer Verify TODO is fully verified only after:

1. Seller sends `createReceivable` on GIWA.
2. `ReceivableCreated` yields an onchain ID.
3. Backend stores create tx metadata while status stays CREATED.
4. Buyer sends `verifyReceivable` from the registered Buyer wallet.
5. Backend RPC verifies each receipt, signer, contract call, and lifecycle event.
6. Backend status becomes VERIFIED with one verification history row.
7. Both transaction hashes open in the configured explorer.

## GIWA Tokenization Live Verification

The Tokenize implementation is live-verified only after:

1. Open a DB VERIFIED receivable as its Seller.
2. Confirm the Seller tokenization CTA is visible.
3. Submit `tokenizeReceivable` from the registered Seller MetaMask wallet.
4. Require the backend journal to become RPC-verified CONFIRMED with
   `eventTokenId`.
5. Require `POST /receivables/{id}/tokenized` to return status TOKENIZED with
   matching `tokenId` and `tokenizeTxHash`.
6. Confirm `ownerOf(tokenId)` is the ReceivableFinance contract escrow address.
7. Confirm the tokenize transaction opens in the configured explorer.

User verification result:

- The Seller mint CTA successfully submitted a real GIWA transaction.
- The NFT mint completed and the frontend received the synchronized TOKENIZED
  receivable result.
- The journal-aware recovery UI must be redeployed with the frontend before
  production users rely on cross-browser/manual synchronization recovery.

## GIWA Funding Live Verification

The Funding implementation is live-verified after:

1. Open an unrelated company's DB TOKENIZED receivable as Funder.
2. Approve the exact `fundingAmount` of MockKRW from the registered Funder wallet.
3. Submit `fundReceivable` as a separate MetaMask transaction.
4. Require the backend journal to verify ReceivableFunded, the Funder-to-Seller
   MockKRW Transfer, and the escrow-to-Funder NFT Transfer.
5. Require `POST /receivables/{id}/funded` to return status FUNDED with the
   Funder identity and `fundingTxHash`.
6. Confirm the Seller received `fundingAmount` mKRW and the Funder owns the NFT.

User verification result:

- The real Funder approval and fundReceivable transaction succeeded.
- The backend synchronized the receivable to FUNDED.
- The Seller mKRW receipt was confirmed.

## GIWA Repayment Live Verification

The Repayment implementation is live-verified only after:

1. Open a DB FUNDED receivable as its Buyer.
2. Confirm the displayed current NFT owner is the intended repayment recipient.
3. Approve the exact `faceValue` of MockKRW from the registered Buyer wallet.
4. Submit `repayReceivable` as a separate MetaMask transaction.
5. Require the backend journal to verify ReceivableRepaid and the
   Buyer-to-current-owner MockKRW Transfer for `faceValue`.
6. Require `POST /receivables/{id}/repaid` to return status REPAID with the
   matching `repayTxHash`.
7. Confirm the current NFT owner received the full face value and still owns the
   NFT.
8. Confirm the repayment transaction opens in the configured explorer.

User verification result:

- Buyer approval, repayReceivable, and DB REPAID synchronization succeeded.
- Exact current NFT-owner face-value receipt is still pending confirmation.
