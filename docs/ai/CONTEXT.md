# Current Context

## 2026-09-27 Correction: no GIWA preparation for the Midnight-only demo

The owner rejected the unnecessary dedicated funded GIWA fixture dependency.
ADR-025 supersedes that part of ADR-024. Test login must lead directly to fixed
fictional financial scenarios, real Compact proofs, Preview submission and
independent results. No MetaMask, GIWA RPC, receivable creation, token, funding,
or operator faucet step is required for the demo. Pending CAPTCHA consent is
obsolete; no faucet claim or fixture transaction occurred.

Implementation is being corrected to automatically encrypted internal auth keys,
reserved synthetic context, ordinary-route separation, and a five-service local
Compose startup with login-account seeding only. Existing Preview identity,
contract, DB and original repositories stay preserved. The prior 974 checks and
EVM-backed live evidence describe the earlier version, not this correction.


## 2026-09-27 Owner-approved submission monorepo and wallet-free demo

The owner approved implementation/publication of `leonid-world/midproof`, a
wallet-free hosted synthetic review experience and one-command isolated local
Compose environment. Work is in the new sibling `midproof` checkout. Original
GASOK and its dirty submodules remain preserved. `docs/PROVENANCE.md` and
`docs/source-origins.json` record source reuse and actual base commits.

ADR-024 supplements ADR-023: limited demo JWTs with unique jti; exact synthetic
fixture EIP-712 signatures using new operator role keys; encrypted Node demo-run
capability custody; actual Provider/Compact/chain/Read verification. Ordinary
Spring request and GIWA asset flows retain their existing boundaries. Local
Compose alone uses independent EVM31337 and Midnight undeployed genesis; hosted
Preview keeps existing wallet/contract/DB and one writer.

Public source is published through 7492d13; API120/UI286/Midnight506/root62
checks passed (974 distinct). Local actual Seller/Buyer × true/false passed
through HTTP and browser. Anonymous fresh clone with independent empty volumes
also passed four real proofs and complete-stack restart with identical results.
Original state was not mounted. Railway deployment9bc10a87 is ready on the same
Preview contract, while walletless activation waits for the new GIWA fixture.
Vercel deployment dpl_8Ms7AXf6vpQRQnw3Bs47BW6bHDDN is READY with --skip-domain;
the public alias still serves its old frontend. Faucet reCAPTCHA action consent
is pending. New repository Git deployment connection and public proof acceptance
remain to do. Current evidence is
[MIDPROOF_RELEASE_2026-09-27.md](MIDPROOF_RELEASE_2026-09-27.md).

## 2026-09-18 Live rehearsal in progress

Owner explicitly requested real mKRW/NFT/funding/ZK/repayment rehearsal. Track
[MIDNIGHT_LIVE_REHEARSAL_2026-09-18.md](MIDNIGHT_LIVE_REHEARSAL_2026-09-18.md).
Two synthetic 1000-face/900-funding invoices are now app DB2/3 and GIWA onchain5/6.
A create used same-receipt recovery after public RPC canonical-block visibility lag;
B create synchronized normally. Neither is funded/repaid. Buyer verification is
blocked before submission while MetaMask still exposes Seller. Browser security
policy blocked extension URL automation; user must select/confirm wallet manually.
No alternative wallet access/key extraction. User is asked to switch Buyer.

Reviewed opt-in same-address Preview verifier maintenance now has encrypted
pre-open consistent state backup, pending-wallet/outbox guards, full-state/key/counter
pins, durable submitting/broadcast journal, 120s submit deadline and late-broadcast
prohibition, safe checkpoint retention. Independent review found no activation blocker.
Final CLI273/273 and GIWA18/18 pass. Linux amd64 integrated image and network-disabled
unprivileged artifact smoke pass (cfb9dd7252d43fdb7213e4a0e788783b229513bc6a5f65ba73d7df0fd88b4312).
Default-sandbox HTTP tests initially could not bind localhost; that attempt was stopped
and the complete isolated CLI suite passed with scoped local-server permission.

Root applied five public migration pins plus explicit overlap0, retaining draining30.
Railway e58b6f76-d5ed-482b-ba4b-787470a41fb4 successfully completed the SAME-address
Preview verifier transition. Public keys all match; counter1; expected whole-state
hash4412aa10609ec9cc44817d409f0a9baec0fadf786c6472002c756a2ba8cf905e; complete
journal stores both real balanced transaction IDs. Encrypted backup20files/963451bytes
exists on the same /data volume. Enabled was set0 and restart61fe8fbe-3180-462e-8688-bad77ce92a6b
is SUCCESS/ready with samewallet/contract/completejournal, oldinstanceREMOVED.
Vercel dpl_3bxfruxjKUeYy4JLFiM2QS3BgQKT is READY/production; new public asset verified.

Full live lifecycle is NOT complete. Browser is logged in Buyer, at DB3/onchain6,
terms checkbox checked and ready to request verification, awaiting user's Buyer
wallet switch confirmation. MetaMask automated extension access remains policy-blocked.
A/B create receipts each passed16 independent calldata/event/canonical/state checks.
All balances sufficient; Buyer/Funder already claimed faucet; Seller notyetclaimed.
Explorer Faucet has no ABI, so direct claim UI absent. Exact source/creation/runtime
match was verified, but auto-review REJECTED source verification publication because
irreversible public source disclosure wasn't specifically authorized. No publish ran.
A separate async approval request is pending; do not retry via another publication
route or treat prior broad rehearsal request as that approval. Buyer wallet question
also pending. Continue unrelated work; no keys/seeds exported.

Root/submodule changes remain uncommitted. Local migrated Midnight writer staysstopped.

## 2026-09-18 Compliance fixes and isolated verification

The owner authorized testing and fixing the review findings. Current status is
[MIDNIGHT_COMPLIANCE_FIXES.md](MIDNIGHT_COMPLIANCE_FIXES.md); the earlier review below
is a pre-fix historical record. C01–C09/C11–C13 source fixes are implemented;
C10 has additional isolated evidence but no new public Preview/browser acceptance.

C01 now constrains canonical challenge quotient/remainder with bit widths, q<=115,
terminal remainder bound, and reconstruction. Generated ZKIR enforces those bounds.
Compiler0.31.1 full compile produced 2 source/20 artifact provenance, including a
changed verifyEligibility verifier. Normal contract build now fails source/artifact
drift rather than silently copying stale keys. All four on-chain operation keys
are checked before hosted join; mismatch is an explicit safe startup failure.
Existing Preview keys were NOT migrated. Do not redeploy the new app blindly,
erase state, start a competing local writer, or claim remote C01 remediation.

Other fixes: reactive expiry of true/false UI results; ambiguous malformed prove
responses retain same-session recovery; Midnight UI 10s/64KiB request/body bounds;
Spring asynchronous bounded body subscriber and final expiry/permission/fingerprint
rechecks; Provider/Read post-await freshness; recoverable owner save queue; native
abortable read-only Indexer transport with 10s/2MiB/one-in-flight cleanup and
degraded readiness; auth generation/request binding; Preprod command/wallet guards;
correlation metadata owned by bounded session records; hosted Provider2 consumers.
GIWA asset architecture/schema and generic local Provider policy remain unchanged.

Final distinct automatic passes: root28 + artifact5 + contract50 + Provider90 +
Read77 + CLI213 + full Spring114 + UI257 = **834**, no skips in selected scope.
UI256 ran as a full suite, then one additional isolated verifier-mismatch banner
regression passed with its existing banner tests. CLI live zkloan.api.test.ts was
explicitly excluded. The increase vs644 is125 regressions plus65 existing non-Midnight
Spring tests newly included in the complete Gradle build. Node22.21.1/Java17;
all four Midnight builds/typechecks, Vue build/full lint and Spring build pass.
Old behavior was reproduced before several fixes; source-only/static evidence is
distinguished from real HTTP and actual service/crypto tests in the report.

Actual isolated Proof Server8.1.0 + ledger8.1.0 verifier/apply passed Seller/Buyer
steady=true and stretched=false (5757bytes each). Fresh in-memory keys, no production
wallet/DB/volume, submittedToNetwork=false; funding balance/wallet signatures were
outside that test. The temporary Prover container was stopped/auto-removed. Six new
HTTP recovery tests use actual runtime/gateway/encrypted files and fake authority/
proof operations, not OS-kill or chain tests. The uncertain broadcast-before-durable
capability window still blocks reproof and cannot auto-reconstruct the capability.

Local integrated Docker image build passed, including Linux npm ci, artifact gate,
four workspace builds and bootJar. Image config ID and unprivileged network-disabled
artifact smoke test are recorded in DEPLOYMENT. No public service was redeployed.
Reference126/37pins PASS: direct API protocol4.1.1 declaration adds two reviewed
pins without a dependency upgrade. Root/inner whitespace and document links checked.
Warnings remain generated sourcemaps/Restify/Gradle deprecations, not test failures.

Root docs/harness plus API, UI and Midnight inner files are dirty/uncommitted;
the root only tracks submodule commit pointers, which were not advanced. New
manifest/checker/keys must travel with the inner commit. GIWA Solidity and reference
checkout bytes remain untouched. No commits, pushes, secret collection, remote
transactions or architectural change; DECISIONS is unchanged.

## 2026-09-18 Full Midnight implementation compliance review

The owner requested a fresh full implementation review against the reference
harness and approved requirements, classified by compliance level and improvement
priority. [MIDNIGHT_COMPLIANCE_REVIEW.md](MIDNIGHT_COMPLIANCE_REVIEW.md) is the current
finding/acceptance record; the harness links it and TODO tracks C01–C13. L0 covers
mandatory correctness/security, L1 demo reliability, L2 quality and L3 future
production scope. Architectural/authentication/synthetic-data/GIWA boundaries are
mostly implemented; overall compliance and live-readiness are not signed off.

Three previously uncovered behaviors were reproduced in isolated fixtures using
actual compiled Java classes or the exact unmodified JS function block:

- C04: LocalMidnightReadClient configured for 200ms remained blocked 1000ms after
  receiving headers and one body byte. The request timeout does not cover this
  blocking InputStream body path. The fixture was released and resources closed.
- C05: a valid already-COMPLETED request, real service/crypto, in-memory mappers and
  delayed fake reader returned COMPLETED after validUntil. The ordinary first
  SUBMITTED completion CAS already has a fresh deadline guard and must retain it.
- C06: first owner write failed; two saveOwners calls both rejected but writer was
  invoked only once. The rejected saveQueue tail prevents later write attempts.

Other source-confirmed gaps: cached expired UI result remains green (C02), malformed
accepted prove responses lose ambiguous-outcome recovery (C03), unbounded UI Spring
requests (C04), Provider/Read post-await expiry (C05), indefinitely retained Indexer
read slot without recovery/readiness degradation (C07), source/artifact build gate
(C08), UI response/account-generation binding (C09), executable legacy Preprod
paths (C11), stale runtime correlation metadata (C12), and unclear final consumer
Provider2-vs-any-registered-provider policy (C13). These were static reviews, not
new live failure/authorization-bypass demonstrations. C13 is a trust-policy question,
not an established bypass. C01 Schnorr canonical reduction remains an **unverified
static soundness concern**, requiring specialist constraint review; no forged
signature/witness or attack proof was constructed. The earlier optional body-timeout
investigation is superseded by the C04 reproduction above.

C10 remains pending: Buyer/valid-false/current hosted browser→Preview evidence and
restart/ACK/Indexer-delay rehearsals. A crash after chain submission but before
durable capability can leave only a proving reservation; current safe behavior
blocks reproof until expiry and does not automatically reconstruct that capability.
Do not clear state or claim complete automatic recovery for that window. The prior
Seller true live run and hosted prover true/false records remain historical evidence.

Fresh unchanged tests passed on Node22.21.1 / Java17: root28 + contract39 + Provider88 +
Read61 + CLI186 + Spring Midnight37 + UI205 = **644**, zero skips within the selected
suites. CLI's live `zkloan.api.test.ts` was explicitly excluded. HTTP fixtures use
mock dependencies; Spring uses H2 memory with managed runtime disabled. Initial
sandbox loopback/Gradle cache restrictions were resolved by scoped approved reruns,
not application changes. Vue production build and all four Midnight TS workspace
builds passed. The latter copy existing managed artifacts, not full Compact compile.
Reference checker passed126/35 with no errors/warnings. Generated-contract source
and dist JS hashes matched. Three diagnostic reproductions are separate from the
644 normal regression passes. Source-map/Restify and Gradle deprecation warnings
remain. No live RPC, real helper/prover, wallet signing, chain transaction or deploy.

Only review documentation/routing/TODO/CONTEXT were changed in this follow-up;
the earlier harness/checker files are preserved. No application source, dependency,
architecture/ADR, submodule pointer, Git commit/push or remote state changed.
Root Git tracks inner repository commit pointers; giwa-midnight still has only its
earlier AGENTS.md modification, while API/UI/Solidity and reference worktrees remain
unchanged. Final documentation/checker verification is recorded in the review.

## 2026-09-18 Midnight-Skills audit and reference harness

The owner added `Midnight-Skills/` and requested a thorough repository comparison
and persistent instructions for later prompts. It is the community MIT repository
Kali-Decoder/Midnight-Skills, package 1.0.8, at
`f1649caf7fbfedb79d6976976f8dbef4e19e43f8`. There are 34 on-disk skills, 32 registry
entries, 31 enabled and 30 router/package-listed entries, plus three actual template
apps. It is supplemental material, not an official specification or an MCP server.
Current official Kapa documentation supports Cursor/VS Code and other remote MCP
clients; the Claude-only premise does not describe current documentation access.

The full coverage and evidence are in [MIDNIGHT_SKILLS_REVIEW.md](MIDNIGHT_SKILLS_REVIEW.md).
All 17 existing docs/ai documents were read across the audit. All source repositories
were inventoried and the integration/cryptographic/data/runtime boundaries reviewed
in detail. The report distinguishes full inventory/keyword scanning from detailed
line review and excludes secrets/runtime state and exhaustive third-party binaries.
No claim of a complete formal/security audit or fresh successful live proof is made.

Root AGENTS now routes every task/follow-up/compaction through
[MIDNIGHT_REFERENCE_HARNESS.md](MIDNIGHT_REFERENCE_HARNESS.md) and newest TODO/CONTEXT.
Cursor has a small alwaysApply rule; inner Midnight AGENTS links the parent harness
and clarifies historical learning order/current operator-facing communication.
This is instruction-based routing, not an OS hook or guaranteed enforcement.
The external skill set was not bulk-installed and personal global settings were
not changed. Opening only API/UI/contract as a separate repository does not guarantee
parent instruction discovery; use the GASOK root or explicitly reference the guide.

The offline checker pins 124 regular reference file hashes, two symlink targets,
the reference HEAD/worktree/skill inventory, 35 project manifest/lock/generated
version values, single onchain runtime lock path and nine required entrypoints.
It detects missing/drifted inputs without download, installation, services, wallet
access or Git writes; changed baselines require review rather than automatic refresh.
The nested reference repository remains untracked, not a new root submodule. A fresh
GASOK clone needs the separately documented pinned reference checkout. No Git commit,
push, gitlink update, deployment or reference-repository edit was performed.

Useful retained patterns are witness distrust, explicit disclosure, request/audience/
deployment binding, version-matched providers and separate submit/finality/indexing.
Rejected copy patterns include React/1AM/Preprod defaults, arbitrary upgrades,
browser secret storage, memory-only persistence, fake tx-ID fallback, permissive key
coercion and optimistic verified status. Official Compact semantics contradict
blanket all-arguments-public and Uint-wrapping advice. The existing hosted auth,
synthetic fixture boundary, encrypted outbox/envelope and GIWA asset separation
remain. Current scope was clarified in API/BACKEND/FRONTEND/ARCHITECTURE/WORKFLOW/
MIDNIGHT/PROMPTS; DECISIONS is unchanged because architecture did not change.

A separate high-priority **unverified static concern** was found in Schnorr challenge
reduction: the witness quotient is typed Field and the reconstruction uses Field
arithmetic without an explicit canonical small-integer quotient constraint. Honest
TypeScript witness behavior is not a circuit constraint. The report and TODO request
specialist verification and fix-focused follow-up, with compiler/artifact/deployment
implications; no malformed witness, signature bypass, proof or chain test was run.
Normal existing tests/live records must not be described as a soundness certification.
An optional stalled response-body deadline check for Spring ReadClient is also
tracked as an unverified test gap. Runtime and cryptographic code are unchanged.

Validation completed for this documentation/harness change:

- `node scripts/check-midnight-reference.mjs --json`: PASS, 126 reference entries,
  no errors/warnings; all 35 project pins and instruction markers match.
- `node --test scripts/check-midnight-reference.test.mjs scripts/midnight-demo.test.mjs
  scripts/prepare-midnight-demo.test.mjs`: 28/28 passed, no skips. Fourteen new
  offline fixture tests cover missing/changed inputs, extra skills, version drift,
  missing/duplicate WASM runtime, broken links, symlink boundaries, wrong Git HEAD
  and dirty checkout; fourteen existing supervisor/bootstrap tests also passed.
  Their Docker/API messages are mocked test output, not actual service starts.
- `node Midnight-Skills/scripts/validate-registry.mjs`: `Registry OK: 32 skills`.
  This validates registry structure, not the correctness of its examples.
- Local Markdown link scan over the eleven touched docs/ai documents: 28 links,
  none missing. Node syntax check and root/inner `git diff --check` passed.
- Checker and these offline Node tests used the shell's Node 20.19.4; they use
  built-in modules and are not a validation of the Midnight application runtime.
  The application's managed Node 22.21.1 pin is unchanged. The checker also passed
  when invoked as `node ../scripts/check-midnight-reference.mjs` from the inner repo.
- Independent review of the reference inventory, harness and protocol/version
  explanations found no remaining actionable documentation issue. Build vs full
  Compact compile, idempotent already-COMPLETED ACK, internal-token auth and
  initialized-wallet preservation were clarified during review.

No application runtime source or dependency changed, so no full app build or
live service was run. Prior application counts and Seller Preview E2E remain
historical evidence; Buyer/valid-false/recovery rehearsals are still pending.
Root changes are documentation/instructions and three checker/baseline/test files;
inner Midnight has only AGENTS.md modified. Other application submodules and the
reference worktree are unchanged. Root tracks only the submodule commit pointer;
the inner repository tracks its AGENTS.md change. All work remains uncommitted.

## 2026-09-17 Free MidProof domain migration

The owner explicitly chose `midproof.vercel.app` and approved updating the
existing Vercel project, removing the mistaken `midproof.app` association,
both Railway frontend-origin settings, production Git branch, public metadata
and documentation. No domain purchase or repository move is part of this work.

The requested free domain was successfully added and serves HTTPS 200. Vercel
project ID `prj_7aIQ9LeEsb5NVOFfDSN9qinLv0Md` is unchanged; its display name is
now `midproof`, with the same Git repository and 13 Production variables. The
Production branch was changed from `main` to `giwa-midnight` in the dashboard
and confirmed through the project API. The mistaken custom-domain association
was removed. The old broken redirect was first cleared to restore access during
the transition, then changed to a 307 redirect to `midproof.vercel.app` after
the new frontend and backend were ready. Public GET checks confirmed 307 for
both `/` and `/login?migration-check=2`, preserving the path and query. The final
project domain list contains only the new primary address and the old redirect.

Source audit found no frontend-hostname dependency in Spring/Midnight business
logic, signatures, database records or persistent proof/wallet state. Both
`CORS_ALLOWED_ORIGINS` and `MIDNIGHT_DEMO_ALLOWED_ORIGINS` must explicitly allow
`https://giwa-ui.vercel.app,https://midproof.vercel.app`. The API URL remains
`https://giwa-api-production.up.railway.app`; internal loopback endpoints stay
unchanged. Backend source, contracts, keys and database migrations are unnecessary.
Browser login tokens and pending-transaction recovery records are origin-scoped;
new-site login and MetaMask permissions must be established separately.

UI metadata commit `d223f0a2a650c23bb33845f5a0bca1c9a5a7d3ad` contains only
index metadata, robots, a one-entry sitemap and its README. Production build and
static output checks pass. Source packaging and a fresh actual proof/transaction
rehearsal remain unfinished submission tasks, independent of this URL migration.

Git push automatically created Vercel Production deployment
`dpl_CeMWG13gaYzBCn72ko5cRTcLhnUw` (`source=git`, READY, alias assigned).
Both `gitSource.sha` and `githubCommitSha` match `d223f0a`; ref is
`giwa-midnight`. Public HTML plus seven JS/CSS/brand/robots/sitemap files match
the local production build by SHA-256. No manual CLI deployment was needed.

Railway deployment `3efba8fd-5d3f-4b5a-bd4f-60bfda3f4727` is SUCCESS and the
only active deployment. Both origin variables were updated together, followed
by one redeploy of the existing runtime. Image digest remains
`sha256:62e659606c5e0f3bc6053e2695d8adc1b2fd9ab11ceba7b40f50110ccd5d7efa`;
the same volume and state are preserved. Health/readiness return 200 and
proofReady=true. New-origin preflights return 204; Seller login, amount policy
and assigned proof reads return 200 with the exact new allowed origin.
Unapproved origins return 403 and an unauthenticated proof challenge returns
401. Existing-origin requests remain allowed for compatibility.

Chrome on the new HTTPS origin successfully logged into the Seller demo,
showed proof readiness, the historical expired request and the unchanged
registered `0x6060…` Seller wallet. The former Funder page showed the existing
large TOKENIZED receivable without a pending synchronization recovery card.
No new financial transaction or proof was initiated for this migration.
New-origin MetaMask permission was requested through the UI. After the browser
returned the same selected Seller `0x60602ed43987ea474a85c12a4e768dc8062b4361`,
the existing wallet was confirmed through the normal connection action and the
UI displayed `회사 지갑이 연결되었습니다.`. No transaction or proof signing was
requested. Buyer/Funder wallet rehearsals remain separate submission checks.

## 2026-09-17 Owner requested committing, pushing and deploying all changes

The owner explicitly requested publishing all current source changes and completing
both deployments. This includes the previously uncommitted integrated Preview demo
and MidProof UI/amount policy, with root documentation and submodule commit pointers.
Use existing repositories and `giwa-midnight`; the deferred final-submission repository
and domain rename is a separate task. Preserve ignored runtime wallets/private state
and credentials locally, and do not change deployed Solidity or existing DB state.
Published inner repositories on `origin/giwa-midnight`:
- UI: `82dca577487b07f2910a3f0d8872c27a9b1e9d07`.
- Spring API: `6637fefed90469d0765bfad39814f81e88330f13`.
- Midnight: `6c12b35acc64614ac53f4e3836fac0f8a8738a77` (new remote branch,
  original `main` remains `aa02835f900b2f71cb996fb3ed335f901f936075`).
- Unchanged Solidity: `b15a2fbc5bb10e665a8093f5e60a8a0e9c6e099d`.

All inner worktrees are clean and the relevant remote heads match. Validation:
Spring 102/102 tests and bootJar; existing UI 205 tests, final build and lint;
Midnight Contract 39, Read API 61, Attester 88, CLI 186 passed with one optional
environment E2E skipped. All four Midnight workspace builds also passed from an
export containing only committed files after npm ci. Root runner/bootstrap tests
14/14 and shell syntax checks passed. Actual private state/credentials remain
ignored; published VITE values and Compact prover/verifier artifacts are public.

Vercel deployment `dpl_8rEwpWrAqR5oYox84BcKvYvEVPvQ` is READY/production,
aliased to `giwa-ui.vercel.app`. Metadata `releaseCommit` matches the UI SHA above.
Public HTML and entry JS/CSS plus MidProof logo/favicon/OG image match the local
build by SHA-256. Root code-release commit `00a409d568cca4f06e013ef30cc0bc507673c31b` is published
on `origin/giwa-midnight`. A fresh network `git clone --branch giwa-midnight
--depth 1 --recurse-submodules --shallow-submodules` from GitHub retrieved that root
and all four exact submodule SHAs, with clean trees, required Docker/build/prover
inputs and no .local runtime state. Railway deployment
`fcbb0ed4-2fd4-4aae-8081-70a72a0d7d58` was uploaded from this fresh published checkout;
its release message identifies the exact root code SHA. It is SUCCESS and the
only active deployment, with final image
`sha256:62e659606c5e0f3bc6053e2695d8adc1b2fd9ab11ceba7b40f50110ccd5d7efa`.
Public `/health` and `/ready` return 200 with proof readiness true. Demo config
reports Preview, `MidProof Demo Attestation`, mock provider and ready runtime.
Seller login, authenticated amount policy (1–10,000 mKRW, suggested 1,000/900),
and assigned proof-request reads succeed. The existing TOKENIZED receivable
(on-chain ID 2, face 1e12, funding 1e10) remains unchanged. The historical Seller
request is EXPIRED as expected; this release verification creates no new proof
or blockchain transaction.

All component branches match their published commits and have clean worktrees.
The subsequent root documentation-only commit records this evidence and the
clone command; runtime code and submodule pointers remain those of `00a409d`.

## 2026-09-17 MidProof identity and small demo amounts

The owner chose **MidProof** as the project name. Only the three exact historical synthetic company names are displayed as short
Korean role labels; source names, company IDs and wallets are preserved. Current UI identity is an original
geometric M logo with a dark teal/mint palette, not the Midnight network logo.
Browser titles, metadata, favicon/Apple/share assets, navigation/footer, login and
fictional provider display name use MidProof. Midnight remains the factual proof
network. Protocol domains, account email/password, persisted identities and source
folder names are unchanged. Historical branding sections below are superseded.

New demo receivables use 1–10,000 integer mKRW, funding <= face value, suggested
face 1,000 / funding 900. Repayment is the exact full face value. The authenticated
`GET /receivables/amount-policy` is authoritative; Spring rejects oversized new
issuance. Vue preserves decimal strings and validates with BigInt, reloads policy
before create/new funding approvals/transfers, and fails closed before wallet
interaction if policy is unavailable/invalid. The cap is application/demo policy,
not a change to deployed Solidity. Non-demo new issuance retains the old range.

Read-only GIWA RPC on 2026-09-17 confirmed MockKRW decimals 0, totalSupply
1,000,000,000, faucet claimAmount 10,000,000 and faucet inventory 580,000,000.
New maximum face value is 0.001% of supply; one full faucet claim covers 1,000
maximum-size face payments before fees/other usage. Individual wallet balances and
faucet eligibility must still be checked. Annual financial ZK fixture values and
policy criteria are separate from these token-denominated receivables and unchanged.

The historical chain #2 has face 1,000,000,000,000 and funding 10,000,000,000.
Never shrink its displayed/DB/chain values. New UI funding on an oversized legacy
record is blocked; already-funded obligations and mined receipt recovery retain
the exact original amounts. A fresh demo setup prepares accounts and skips creating
that oversized historical record, then the owner creates a small receivable in UI.
Existing matching legacy records retain full replay/identity checks. No DB reset,
wallet replacement, new chain transaction or contract change was performed for this.

Shortened copy preserves synthetic-data/provider disclosures, operator witness
handling, signer/role/terms checks, user consent, valid false versus failure/denial,
expiry and retry-without-resubmission. Receivables selection uses request ordering
and resets Buyer consent on a new selection; stale responses cannot carry consent
over. Funding rechecks captured selection after asynchronous readiness checks.
Validation: Vue 205/205; production build; full source ESLint/Oxlint; targeted Spring
41/41 including legacy debt/receipt lifecycle and non-demo behavior; bootstrap/runner
14/14; gateway 19/19 and Midnight CLI build. Public deployment/visual verification
is recorded below; prior successful proofs are historical and may expire.

Railway deployment `a517b5c6-f460-4d03-b066-6ce2e73f7e4c` is SUCCESS. Public
`/health` and `/ready` return 200/proofReady=true; fictional provider display name is
MidProof Demo Attestation. Authenticated live amount policy is 1–10,000 with defaults
1,000/900. A deliberately rejected 10,001/900 create returned 400
DEMO_RECEIVABLE_AMOUNT_LIMIT_EXCEEDED and the one existing receivable was unchanged.
No successful create or new wallet transaction was performed. Browser checks on the
public origin confirmed MidProof login/title/theme, Seller login, defaults 1,000/900,
disabled submission for 10,001, funding>face and 0.5; repayment's new-debt guidance;
Funder's legacy high-debt funding block; and expired historical proof requests remain
expired. Served favicon SVG/ICO, logo and OG PNG match local SHA-256 hashes. A final
visual pass found and corrected low-contrast funding text inherited from old CSS,
normalized funding/repayment token displays to mKRW, and clarified the legacy block.

Final Vercel deployment `dpl_5TK5u4fv69uzk9UFvwyet5gBrdJj` is READY and aliased
to `https://giwa-ui.vercel.app`. Final browser login title is `로그인 | MidProof`.
Funding heading/body now use rgb(241,247,247) on dark surfaces, mKRW labels and
short legacy-debt guidance; desktop viewport 1728px had no horizontal overflow.
Login demo-role and profile copy-button hover styles were also corrected to retain
dark backgrounds. No mobile/browser-wallet transaction coverage is claimed.

Files changed for this request: UI `index.html`, public MidProof logo/favicon/share
assets (including compatibility URLs), `App.vue`, router titles, base theme, status
banner, page copy, company-name display helper, three financial views, receivable
store and amount-policy/web3 guards plus targeted tests. Spring adds the amount
policy/DTO/endpoint and create validation with amount/lifecycle tests. Midnight's
hosted demo config/gateway change only display labels. Root bootstrap avoids new
oversized legacy records and has four regression tests. README, TODO, CONTEXT,
FRONTEND, PROJECT, DEPLOYMENT and the deferred release checklist record the outcome.
This is a description of this request, not every pre-existing working-tree change.
No architectural decision changed, so DECISIONS received no additional entry.

At the end of the UI editing request, before the later publish request, root and
Midnight inner repository were on `giwa-midnight`, with uncommitted changes preserved. Root Git records submodule commit pointers; the Midnight inner
repository tracks its files. UI/API also remain dirty on giwa-midnight; Solidity
repository is clean. No commits, pushes, repository/domain rename or new services.

The final submission repository and Vercel name/domain cleanup remains deferred.
Project name is now fixed; exact repo/domain names and availability remain to check.

## 2026-09-15 Deferred repository and domain cleanup before submission

The owner subsequently approved both reminder mechanisms. AGENTS.md now requires
reading the release checklist and unfinished TODOs and reminding the owner when
final submission, submission preparation or submission-link cleanup is requested.
A thread heartbeat named "Midnight 제출 전 저장소·주소 정리 알림" (automation ID
`midnight`) is ACTIVE for September 24–27, 2026 at 20:00 Asia/Seoul each day.
It reads current checklist/context records and reports unfinished work in this
conversation. Its prompt pauses the reminder when completion is evidenced, the
owner confirms final submission, or the owner asks to stop; the schedule has no
runs after September 27. Local-file runs require the computer and Codex app to
be running. It does not perform repository, deployment, domain, DB, wallet or
submission changes. Creation and the persisted schedule were verified; no future
notification is claimed to have already run.

The owner asked to finish several more feature tasks before preparing the final
submission repository and renaming the Vercel project/domain. Keep this work
deferred during normal feature development, then follow
[MIDNIGHT_RELEASE_CHECKLIST.md](MIDNIGHT_RELEASE_CHECKLIST.md) during final
submission preparation, allowing time for a fresh-clone build and demo rehearsal.
The planned direction is a new public repository containing all required source
as ordinary folders, with `main` as the Midnight submission branch; preserve the
existing GASOK repositories and provenance. Future Midnight development should
continue in that single repository. Exact names, ownership and publication scope
remain unset. Existing Vercel/Railway application/MySQL infrastructure is reused.
The repository/domain transition remains deferred: only reminder instructions,
documentation and the scheduled task were configured. No repository, branch,
remote, deployment or domain was changed. Current implementation and original submission history
must remain distinguishable; a new repository does not establish reuse eligibility.

## 2026-09-15 Owner-approved integrated synthetic Preview demo

The owner approved the previously researched minimal deployment design and
explicitly requested changing AGENTS.md's local-only restriction. The current
target is one IntelliJ Spring **Midnight Demo** Run and one integrated application
deployment in the existing Railway project, keeping Vercel and the existing
MySQL service. No Preprod/Mainnet deployment or GIWA contract rewrite is allowed.
The historical local-only sections below describe earlier work, not current scope.

Implemented runtime: a Node gateway owns local port 18080 (Railway PORT), Spring
listens privately on 18081 (Railway 8081), and a real Proof Server 8.1.0 handles
proving. Attestation, Bridge and Read API reuse the existing modules within this
runtime. Public Preview supplies Node/Indexer. The local runner automatically
prepares isolated MySQL on 3307 and the official prover Docker container; Railway
uses the native prover and its Nix closure inside the same application image.
No Docker daemon is required in Railway. Other projects/containers are preserved.
The unrelated Java application occupying port 8080 was not stopped.

`scripts/prepare-midnight-demo.mjs` uses normal authenticated application APIs
to prepare three explicitly fictional accounts/companies and to import existing
public GIWA receivable #2 into the dedicated demo DB. Existing create/verify/tokenize
receipts were checked by Spring RPC; no new GIWA transaction was sent. Repeating
preparation preserved companies/users/wallets/receivables/journal counts 3/3/3/1/3.
Shared demo role login buttons use those accounts. Seller/Buyer consent still
requires the corresponding existing MetaMask wallet; account login is not consent.

Hosted challenges accept only version/requestId/profileId. The gateway expands
the fixed fictional financial fixtures and uses Spring JWT plus a private internal
token to authorize request/session ownership. The original EIP-712 consent,
Compact policy/signature checks, encrypted outbox, delivery ACK and independent
Spring result verification are retained. Raw financial inputs do not go to Spring
or MySQL/public ledger. The hosted operator can process synthetic witness values;
this is a fictional institution, not bank-verified information. Production Vue
builds now include authenticated v2 demo routes, while legacy diagnostic routes
remain development-only. Preparation status is visible and proof actions wait
until the actual runtime is ready.

Validation so far: Spring 96/96 tests and actual Java lifecycle smoke; Vue 148/148
tests, production build and ESLint/Oxlint; Midnight CLI 186 pass/1 skip, Provider
88 and Read API 61 tests; runner 10/10 including Docker startup handling.
Native prover 8.1.0 executed in composed ARM64 and AMD64 Linux runtimes, and full
image builds succeeded for both architectures. ARM64 image cold-start reached automatic fixture preparation,
Spring/gateway/native prover with `/health` 200 and `/ready` 503 while the wallet
was syncing. The runtime correctly distinguishes process availability from proof
readiness. In-memory SDK 4.1.1 circuit checks produced genuine proof bytes for
steady=true and stretched=false (serialized proven transactions 5755/5757 bytes); this is not chain or
MetaMask/browser E2E validation.

The freshly generated persistent local Preview wallet has received 5,000 tNight,
confirmed by public Indexer created UTXO value 5,000,000,000 at transaction ID
63024. All three SDK subwallets connected; shielded and DUST must replay roughly
235,000 initial ledger events, while unshielded synchronization has completed.
On 2026-09-15 at approximately 14:12 KST, initial synchronization, DUST
registration, actual Preview contract deployment and fictional Provider 2
registration/public-key validation all completed. The persistent deployment is
`bfb760db44f9ee7996ef12c47e56346903c654aede7d65c3c88110214c932a1e`.
The gateway `/ready` returned 200/proofReady=true and Vue displayed ready.
The real browser created Seller and Buyer requests with the default criteria,
logged into the shared Seller account, displayed its assigned request and
synthetic profiles, and obtained a genuine request-bound challenge. The UI
reached the MetaMask account/consent stage. The wallet then returned a different
allowed account, and the expected-role guard correctly reported WALLET_MISMATCH
before signing. The owner confirmed that this account is in the same `Leonid`
Chrome profile, named `GIWA Testnet(Seller)` in MetaMask; changing browser
profiles or importing the wallet is unnecessary. The owner subsequently allowed the registered Seller account
(`0x6060…4361`) and approved the real MetaMask signature. Seller request #1 then
completed the synthetic attestation, actual proof and Preview submission, durable
Spring delivery and Bridge ACK cleanup. Switching back to Funder showed the
Seller response completed and the requested criteria satisfied.

An independent read-only query of
`https://indexer.preview.midnight.network/api/v4/graphql` confirmed the latest
contract action is `verifyEligibility`, with transaction result `SUCCESS`,
transaction hash
`7dd331347d83750908c10863242206dda8d799337015e2d1c6a7d48cab2385cd`,
Indexer transaction ID 63097 and block 872472 (2026-09-15 15:09:18.001 KST).
Decoding the public contract state found exactly one eligibility result:
`eligible=true`, Provider 2, evaluationVersion 2, issued at
2026-09-15 15:08:36 KST and valid until 2026-09-16 14:12:42 KST.
Both timestamps exactly match the Funder UI. Raw state, lookup keys, capabilities
and private keys were not printed. This verifies the Seller browser-to-Preview-
to-Funder path; Buyer and a valid false-result browser/chain path remain unverified.

The hosted wallet now checkpoints all three SDK states under encryption and
restores their cursors. A separate unfunded SDK round-trip preserved its address
and exact shielded/dust/unshielded positions 9408/1827/0 through serialization,
encryption and restart, without a chain transaction. The funded demo instance
was restarted on the final code, preserving the same wallet, deployed contract,
Provider and two requests. At 14:27 KST its full initial replay completed;
the subsequent Java restart reached `/ready` 200 within 27 seconds of process
launch (first successful observation), compared with roughly nine minutes for
the preceding full replay. This is an observation on this Mac, not a guaranteed
cold-cloud-start duration. The encrypted complete wallet checkpoint is now
present for later Runs. Hosted DUST preparation waits for generated resources
rather than failing merely because a previously registered wallet temporarily
has zero available DUST.
The final error-path review also added explicit SDK recipe reversal after
pre-broadcast finalization failure and disables checkpoint replacement after a
transaction error. This preserves the last healthy snapshot even when SDK coin
reservations are not represented by its pending-transaction list. Dedicated
regressions passed; the hosted subset contains 30 tests.
Runtime identities and keys live under ignored
`.local/midnight-demo` with restricted permissions. They are not included in the
Docker context. Railway and Vercel CLI authorization have now completed.
The existing Railway application was reconfigured for the root integrated
image, with a 5 GB persistent `/data` volume, one replica and 30-second graceful
draining. The old standalone `giwa-api` main source trigger was disconnected;
future uploads use the populated root checkout. The project still contains only
the application and existing MySQL services. No billing upgrade was performed.

The local demo was stopped before migration. Its eight demo tables were copied
into a new logical `gasok_midnight_demo` database inside the existing MySQL
service; every row including encrypted capability bytes, schema, constraints
and auto-increment metadata matched. The original seven-table `railway`
database was preserved. The encrypted identity, wallet checkpoint, private state,
outbox and capability key were restored together to `/data/midnight-demo`, with
archive integrity verified and stale process locks excluded. Private backups
remain ignored and restricted. The local copy and Railway share a wallet
identity: do not Run both simultaneously; Railway is the active writer.

Railway deployment `35dbfd8b-2067-46a6-adcd-02b198c787d3` now runs the actual
native prover, Spring and Node gateway. Its explicit start command is
`/app/scripts/midnight-container-entrypoint.sh`; the API's earlier null update
did not clear the temporary migration hold. Public `/health` returns UP with
proofReady true, `/ready` returns 200, and all three restored wallet states are
connected and synchronized. The contract and funded wallet addresses match the
local demo. Public authenticated CORS/login, receivable #2 and both proof
requests were verified. Resolving the completed Seller request successfully
decrypts its migrated capability and reads the same Preview eligible=true,
Provider 2/version 2 result with the exact original issue and expiry times.

A separate in-memory proof check against Railway's actual native prover passed:
steady=true produced 5,755 bytes in 2,843 ms and stretched=false produced 5,757
bytes in 1,940 ms. This used fresh temporary keys and did not open the running
wallet, submit a transaction, or establish a new browser-to-chain proof.
Vercel deployment `dpl_8uWMXSTE1h7TWXYiJGKKBEuMrewX` was promoted to the existing
`https://giwa-ui.vercel.app` domain; its thirteen public Production configuration
values were persisted and verified. In the actual public browser, the Funder
demo login button opened the original requests and the public-result button
displayed the Seller's criteria-satisfied result with the original issue/expiry
timestamps. The Midnight runtime reports ready in the UI. A fresh hosted Buyer consent
and chain rehearsal remains to be performed with the owner's MetaMask wallet.
The existing service IDs and root-upload command are in DEPLOYMENT.md.

Root and submodule branches remain `giwa-midnight`. Existing branding/submission
work was preserved. Root Git tracks the submodule commit pointers only; the inner
repositories track their own modified/new files. No commit, push, or submodule
pointer update has been made for this work.

## 2026-09-12 Follow-up: Midnight-only public branding

The owner explicitly rejected the combined GASOK · Midnight branding. This
supersedes the initial presentation choices in the section below. Visible Vue
copy, navigation/footer/logo labels, SEO, social artwork, transaction progress,
validation messages, and diagnostic copy now use Midnight or neutral network
terms. The public README introduction is updated; existing source history and
actual architecture remain documented here without an originality claim.

The old deployment origin was removed from canonical/social/robots metadata;
image references are host-relative; canonical and `og:url` are omitted until
a new origin is confirmed. The old sitemap and
obsolete branded favicon filename were removed. A confirmed new deployment
origin is still needed for absolute social URLs and a regenerated sitemap.
Legacy proof downloads now use `midnight-proof.json`; prior import extensions
remain supported without advertising their old brand in visible instructions.

Frontend service changes are presentation strings and the local download name
only. Backend, Proof Server, network IDs/addresses, EIP-712 domain/type/purpose,
API keys/headers, and request/response schemas remain unchanged. In particular,
MetaMask may still display the existing signed `GASOK Mock Attestation` domain;
changing that requires a coordinated backend/protocol task, outside the owner's
frontend-only scope. Real chain explorers and faucet destinations are retained
so asset transactions are not misrepresented as Midnight transactions.

Follow-up validation: 141/141 tests, production build, ESLint/Oxlint and
Git diff checks passed. Browser text/title audit found no old brand names on
login or the 11 business/Midnight/404 routes in their available states. Backend
remained unreachable; no live proof/signature or asset transaction was run.
The regenerated PNG artwork was visually inspected.


## 2026-09-12 Midnight frontend branding and dark theme

Owner-authorized presentation-only update in `giwa-ui`: GASOK · Midnight brand,
local white Midnight wordmark, dark surfaces/electric-blue actions, login/signup
privacy introduction, dashboard emphasis, shared header/footer/404, and all active
business and Midnight page palettes. SEO titles/descriptions/social metadata,
favicons, Apple icon, and 1200x630 social thumbnails use the same identity.
The supplied Academy logo and reference page are recorded in FRONTEND.md and
the UI README. Old asset URLs now serve the new artwork for compatibility.

No API, service/composable/store protocol logic, wallet behavior, feature flags,
proxy configuration, Proof Server, Midnight workspace, or GIWA contracts changed.
Midnight remains local mock-attested policy proof evaluation; GIWA remains the
transaction network. This is visual work, not new proof functionality or a fresh
successful proof E2E. Production continues excluding local Midnight proof routes.
The existing public origin is retained in canonical/OG/sitemap metadata because
no replacement deployment domain has been assigned. No publication/deploy occurred.

Validation on Node 24.19.0: production build, 21 files / 141 tests, ESLint and
Oxlint passed. Browser inspection covered desktop login/signup, dashboard,
business/profile routes, v2 request inboxes and legacy diagnostics. Backend was
unreachable during UI review, so data-loaded flows, signatures, and live proofs
were not executed; backend processes were not started or modified. All 11
authenticated/diagnostic/404 routes had no horizontal page overflow at 320px;
login/signup was also checked at 375px. The generated social card was visually
inspected, and icon/image dimensions verified.

Root has pre-existing AGENTS.md / submission documentation changes, preserved.
Frontend changes live in the `giwa-ui` submodule working tree; root Git tracks
its commit pointer, not the inner files. No commit or pointer update was made.


## 2026-09-10 Midnight submission requirements and demo priority

The owner confirms Luma registration is complete. Submission requirements and
sources verified on 2026-09-10 are recorded in
[MIDNIGHT_HACKATHON_SUBMISSION.md](MIDNIGHT_HACKATHON_SUBMISSION.md).
The deadline is 2026-09-28 00:00 KST (the end of September 27).

The owner intends to prepare a new public Midnight submission repository because
the current work evolved on a branch of the previous GIWA GASOK hackathon project.
Its name, packaging, and publication are pending. A new repository is an owner
preference, not an official requirement or proof of originality. Document the
GASOK baseline, pre-existing Midnight work, and work actually added during this
event; existing-code reuse eligibility still needs confirmation.

The priority is judge-reproducible source/build and a working v2 demo, supported
by consistent README, implementation evidence, video, Deck, and submission text.
Local Devnet is allowed. Current runtime readiness has not been reverified by
this documentation task; historical test/E2E records must not be presented as
a fresh successful run. The final submission checklist is at the top of TODO.md.
No repository was created/published, no submodule pointer changed, and no form
was submitted. Existing architecture and local-only Midnight limits remain.

## 2026-09-04 Midnight hackathon repository preparation

The owner has closed the GASOK hackathon effort and plans to reuse the Midnight
presentation implementation for a new Midnight hackathon. Preserve the GASOK
submission on root `main`. The actual current working branch is `giwa-midnight`
in the root and all four repositories (`giwa-api`, `giwa-ui`, `giwa-contrract`,
and `giwa-midnight`); older `gasok-midnight` references below are historical.
Branding/UI changes and any architecture changes are separate follow-up work.

The empty `giwa-midnight/` directory was an uninitialized submodule, not an
empty Midnight branch. Git commands inside it resolved to the parent root,
which made its branch appear to follow the root. No active checkout hook or
branch-synchronization configuration was found in the inspected Git settings.
`git submodule update --init -- giwa-midnight` restored the root-pinned commit
`aa02835f900b2f71cb996fb3ed335f901f936075`, also the inner `main`/`origin/main`.
A local inner `giwa-midnight` branch was created at that same commit without
tracking `origin/main`. All 118 tracked files and existing history are preserved.
The root gitlink already points to this commit, so no pointer change was needed.
No commit, push, new remote repository, or deployment was performed.

Root Git tracks only a submodule commit pointer; the inner repository tracks
its own files and branches. Switching the root does not select a same-named
inner branch. For this existing local checkout, return to Midnight work with:

```sh
git switch giwa-midnight
git submodule update --init -- giwa-midnight
git -C giwa-midnight switch giwa-midnight
git -C giwa-api switch giwa-midnight
git -C giwa-ui switch giwa-midnight
git -C giwa-contrract switch giwa-midnight
git status --short --branch
git -C giwa-midnight status --short --branch
git submodule status
```

The inner Midnight branch is local-only until separately published. A fresh
clone can restore the pinned source with submodule update, then create its local
branch with `git -C giwa-midnight switch --no-track -c giwa-midnight main`
while `main` still points to the recorded commit. Submodule update normally
checks out the pinned commit in detached HEAD; select the branch afterward.
Do not use forced checkout/reset to bypass uncommitted-work conflicts.

Validation: inner `main` and `giwa-midnight` have identical commits/trees,
the working tree is clean, `git fsck --full` passed, and all four submodule
HEADs match the root's recorded pointers. The CLI build was attempted but
stopped at `tsc: command not found`: this restored checkout has no installed
`node_modules`. Runtime/build readiness is therefore not verified. Restoring
source does not restore ignored private state or start the local Node, Indexer,
or Proof Server; historical runtime evidence below is not a new live check.

## Previous implementation context

Project

GIWA Hackathon

Current Stage

End-to-End MVP Lifecycle Complete

Submission Deployment Preparation

Current Focus

Replacement Contract Address Rollout and Fresh Demo Lifecycle

Midnight PoC Context

Current Midnight focus: ADR-021's request-bound v2 policy evaluation and the
durable local delivery boundary. The Funder creates an authenticated Spring
request containing public criteria, audience, receivable/role, and deadline;
the Seller/Buyer may deny it or transiently enter caller-supplied mock facts and
authorize a proof with the canonical role wallet. The normal product path has
no JSON handoff and no user-entered PIN. ADR-018 through ADR-020 are preserved
only as historical v1 CLI/diagnostic behavior under `/midnight/legacy/*`.

Provider 2 clamps every v2 role-wallet challenge to
`min(issuedAt + 120 seconds, policy validUntil)`. The effective authorization
TTL is 1..120 seconds, and `issuedAt >= validUntil` is rejected as
`409 / POLICY_REQUEST_EXPIRED`; the policy deadline is never extended merely
to provide a full two-minute signing window.

Spring now coordinates `REQUESTED -> SUBMITTED -> COMPLETED`, stores only
public request context plus an AES-256-GCM encrypted v2 capability envelope,
and returns a sanitized result only to the requesting Funder. It never stores
raw financial facts, nonce, authorization, Provider signature, or witness. A
temporary Read API/Indexer not-found keeps `SUBMITTED` for retry. A permanent
invalid capability becomes `FAILED`, its envelope is purged, and its active
marker is released. Denied/expired/failed states are not eligibility results.

The Bridge persists each finalized capability in an encrypted local outbox
before exposing `complete`. Vue delivers it directly to Spring, then ACKs the
Bridge only after the request is durably `SUBMITTED` or already `COMPLETED`;
reload/restart recovery uses request ID and does not resubmit the proof. An
expired `awaiting_authorization` reservation is removed on recovery, so the
same tab can return to idle and start a fresh challenge only while the Spring
request itself is still `REQUESTED` and unexpired. A `proving` reservation stays
fail-closed through `validUntil`. Both encrypted stores are
correlation-sensitive local PoC custody and require externally supplied keys.

The capability wire uses a bare lowercase 64-hex
`midnightContractAddress`, consistently enforced by Bridge, Vue, Spring, and
Read API. The EIP-712 authorization message alone represents that same value as
an `0x`-prefixed `bytes32`; neither form is user-editable product input.

The live local v2 contract is
`12caaf76aef1de1c584b67462018810f6e4e7eb2535e136f560cb621e24a3f36`.
Provider ID 2 was registered with the deterministic local development secret
literal `PROVIDER_SECRET_KEY=2` in transaction
`006abe69d8ba934519e19c4490ce77be724f75aae1bcb4e6b4fcd720258aa10601`
at block `25714`. The old v1 contract remains intact and is not migrated.
The current validation snapshot is Compact contract `39/39`, Mock Provider
`87/87` across 4 files, Read API `60/60`, CLI `156` passed plus `1` optional
environment test skipped across 12 passing files plus 1 skipped file, Vue
`141/141` across 21
files, and Spring full Gradle `86/86` including focused Midnight `19/19`. CLI
typecheck/build, Vue lint/build, Spring `bootJar`, and the new
deployment/registration preflight also passed. These are code-boundary and
local-deployment checks, not a claim that the final restarted browser flow ran.
A complete new v2 Seller/Buyer MetaMask-to-Spring-to-Funder live browser E2E
remains a required verification step after restarting all changed processes.

One active unexpired request per Funder·receivable·role is enforced through the
database marker, including the completed result's validity window. This reduces
obvious adaptive yes/no probing but does not solve it; templates, request
budgets/cooldowns, auditing, and independent per-company Midnight private state
remain TODO. The result is mock-attested and informational, never bank/accounting
verification, GIWA Funding approval, or an automatic Funding gate.

## Historical v1 implementation record (ADR-008 through ADR-020)

The implementation narrative below is retained to explain the learning path
from the official CLI to the earlier fixed-policy/manual-capability PoC. Any
v1 address, PIN, nine-field capability, clipboard/file handoff, fixed threshold,
or memory-only session statement below is historical unless a later v2 section
explicitly supersedes it.

The `gasok-midnight` branch additionally contains a local-only Midnight privacy
PoC. `giwa-midnight/` is an initialized Git submodule workspace backed by
`https://github.com/leonid-world/giwa-midnight.git`; it contains Node 22
workspace metadata and the official Midnight SDK dependency lockfile. Phase 1
must reproduce the official ZK Loan Compact/CLI/Attestation flow unchanged on
the `undeployed` network before any GASOK financial-field or Vue work. Node
24.19.0, Docker 29.6.2, and Compact 0.5.1 are installed. Use Node 22.21.1 for
the official API and CLI runtime through `nvm use 22`; Compact compilation has
also been verified with Node 24. The official Proof Server is running locally.

Phase 1 progress: the unmodified official ZK Loan `contract/` source has been
imported from `midnightntwrk/example-zkloan`. With Node 24.19.0 and Compact
0.5.1, its eight Compact circuits compiled successfully and generated
`contract/src/managed/zkloan-credit-scorer/{contract,keys,zkir,compiler}`.
The official Midnight Local Dev Node (`127.0.0.1:9944`), Indexer
(`127.0.0.1:8088`), and Proof Server (`127.0.0.1:6300`) are running and healthy
through the official standalone Docker Compose definition.
The official mock Attestation API is running on `127.0.0.1:4000` under Node
22.21.1 and its health endpoint returns provider ID 1. Node 24.19.0 cannot run
this official Restify/SPDY dependency path because it no longer exposes
`http_parser`; use Node 22 for the official API and CLI runtime, while Compact
compilation remains verified on Node 24. The contract simulator passes 61/61
tests. Phase 1 is complete: the official CLI synchronized its wallet, received
local NIGHT/DUST, deployed the contract, registered Mock Provider 1, fetched a
mock attestation, generated and submitted a loan proof, and queried the public
contract state on the local `undeployed` network.

The initial Provider registration failure, `expected instance of StateValue`,
was caused by two physical WASM runtime copies after the custom workspace lock
resolved `@midnight-ntwrk/onchain-runtime-v3` to both 3.1.0 and 3.0.0. The
official ZK Loan lockfile uses one 3.0.0 instance. The workspace therefore pins
and hoists exactly one 3.0.0 runtime through a direct dependency plus npm
override/resolution. Do not remove that compatibility pin while Midnight.js
remains on 4.1.1.

The tracked CLI `.env.example` previously contained a non-empty storage
password and the value is present in the current submodule Git history. The
working template is blank now. Treat the former password as exposed; rotate the
ignored local `.env` value and recreate the local encrypted private-state DB
together when the current disposable Phase 1 state is no longer needed. Do not
delete or rewrite either one automatically.

Phase 2 GASOK CLI proof flow is complete. The transformed Compact contract uses
`annualRevenueKrw: Uint<64>`, `debtRatioBps: Uint<32>`, and
`overdueCount: Uint<16>` as private witness values and applies policy version 1:
revenue at least 500,000,000 KRW, debt ratio at most 20,000 basis points
(200.00%), and overdue count at most 1. The official loan amount, tier,
authorized amount, response flow, blacklist, and loan/PIN-migration ledger data
were removed because they have no approved GASOK meaning.

At that phase, the local Mock Attestation API accepted decimal strings,
validated Compact integer ranges, and signed the three values plus a
pseudonymous commitment hash. It did not echo raw values and bound only to
`127.0.0.1`. A local CLI E2E deployed the GASOK contract, registered Mock
Provider 1, submitted valid eligible and ineligible proofs, and queried two
public results containing only commitment, eligibility, Provider ID, and policy
version.

The original Phase 3A public-result viewer established wallet-free Indexer
reading: a localhost-only `giwa-midnight/api` adapter decoded public state and a
development-only authenticated Vue `/midnight` page displayed the two earlier
unbound results. That anonymous GET/list shape has now been retired rather than
carried into the receivable-bound design.

Phase 2.5 receivable-subject binding was completed through the CLI on the prior
local Midnight contract
`a8c0c1997c424dd1215d055fb5688200194263c7be5deef8b4e7620d2cdceb2c`.
On 2026-08-17, recreation of the standalone Node container reset the local
chain, and that deployment now returns `NOT_FOUND`. The replacement contract
was deployed at the current approved local address
`7e3ea9d741ce0f5862db6f46d0ad720be2586cd7d0405ec77e4a0478aa50f4fb`.
It seals GIWA chain `91342` and ReceivableFinance
`0x0f264334f98BA0d22f7Fc6Bb901a5Fa36158a315`. For each request, the Mock
Attestation Provider reads `getReceivable(uint256)` through GIWA RPC and chooses
the canonical Seller or Buyer wallet. It then signs exactly eight fields: the
three private financial values, company-commitment hash, GIWA binding hash,
Midnight deployment hash, provider ID, and policy version.

Compact recomputes the context, verifies the signature, applies policy version
1, and stores only an opaque receivable-eligibility lookup key with
`eligible`, `providerId`, and `policyVersion`. An existing exact key is rejected.
Contract simulator tests pass 35/35, including policy boundaries, Seller/Buyer
key separation, uint256 maximum IDs, all binding dimensions, signature replay,
invalid roles/zero values, provider controls, identity-key rejection, admin
rotation, and exact replay. A live CLI E2E against GIWA receivable `#1` recorded
a separate Seller `eligible=true` result and Buyer `eligible=false` result from
intentionally different caller-supplied mock inputs. This demonstrates role
separation, not the actual financial condition of either GIWA party.

The reset exposed three local-runtime gaps. `cli/standalone.yml` has no explicit
persistent volume for Node or Indexer data, so contract addresses and results do
not survive container recreation; persistence and recovery need separate design
and approval. CLI join currently reaches the SDK's `watchForDeployTxData` path
without a bounded existence preflight or timeout, so a missing address can wait
indefinitely instead of returning a clear `NOT_FOUND`. Wallet synchronization
also renders tagged transport failures as `Wallet.Sync: [object Object]`, hiding
the actionable Node/Indexer cause. The compose-level hotspot DNS override is
scoped only to the stateless Proof Server; the Node/Indexer network recovery was
a runtime workaround, not a durable code fix.

A later CLI restart exposed a separate local private-state lifecycle bug. The
Join path supplied a newly generated `initialPrivateState` even when encrypted
contract-scoped state already existed. Midnight.js defines that option as an
explicit overwrite, so rejoining the replacement deployment replaced the local
company secret and its derived admin identity; Provider registration then
correctly failed the Compact admin assertion. Join now probes the selected
contract's encrypted state first, omits `initialPrivateState` when it exists,
creates a new participant state only when it is absent, and fails closed when
the existing state cannot be read. The pre-Join encrypted LevelDB snapshot was
recovered in memory, accepted only after its derived admin key matched the
public `contractAdmin`, and restored through the official private-state provider.
A protected byte-for-byte backup was retained outside the repository, and a
post-write read verified that the restored state still derives the public admin
key. No private secret was logged or written as plaintext, so deployment
`7e3ea9d741ce0f5862db6f46d0ad720be2586cd7d0405ec77e4a0478aa50f4fb`
can continue without redeployment.

The interactive CLI prints a proof capability directly to the terminal rather
than its file logger. ADR-020 separately lets the Vue issuer deliberately copy
that same schema or export a local handoff file; neither path adds application
logging. The capability contains the lookup key, company commitment, Midnight
deployment, and GIWA receivable role context needed by an intended verifier.
It contains no PIN, secret, raw financial value, or provider signature, but it is
correlation-sensitive because it links an opaque Midnight entry to one public
GIWA receivable party.

The Phase 2.5 capability-resolution implementation is also complete on the read
side. The localhost-only adapter is pinned to the current contract address
above as its single address authority; Vue has no independent contract-address
configuration. The adapter accepts only the exact version-1 capability body at
`POST /v1/eligibility-results/resolve`, recomputes the GIWA binding, Midnight
deployment hash, and lookup key, then returns one matching result. The old
anonymous result-list GET endpoint returns 404.

The development-only Vue `/midnight` page now loads authenticated
Funder-visible DB receivables, requires a selected Seller/Buyer role, and then
imports a capability through an explicit clipboard action or user-selected
local file. It performs safe syntax checks and exact
onchain-ID/contract/role/party-wallet matching before POSTing through the
same-origin `/midnight-api` proxy with `no-store`. It displays separate DB and
onchain identifiers, the selected role, canonical party wallet, eligibility,
Provider ID, and policy version. It does not put the capability in browser
storage, logs, or the URL; selected file content is parsed locally and is not
uploaded. Raw one-line JSON is retained only for advanced diagnostics.
The page distinguishes Provider 2 EIP-712-authorized issuance from Provider 1
legacy role-context-only results. Neither Provider proves that the private
financial inputs belong to the role wallet, company identity, bank verification,
data truth, current eligibility, or Funding approval.

Before the local-chain reset, live adapter smoke verification resolved
receivable `#1` as Seller
`eligible=true` and Buyer `eligible=false`; a tampered capability was rejected
with HTTP 400. Actual development-browser submissions resolved both the Seller
and Buyer capabilities and displayed the same outcomes; the Buyer result was
correctly described as a valid proof that did not meet policy. This verifies the
browser read path only, not attestation, proof generation, or transaction
submission from Vue. Node 22 frontend lint and production build also pass.

ADR-017 implements EIP-712 MetaMask role authorization as a separate two-step
CLI handoff. The CLI keeps the raw financial tuple and hidden salt, prints a
two-minute Provider 2 request, accepts a minified one-line Vue signature
response, and then continues the local attestation flow. The development-only
`/midnight/authorize` route validates the exact fixed context, selects the
canonical role wallet through MetaMask, signs, verifies the typed hash and
recovered signer, and never receives raw financial values.

The manual authorization route remains available only by direct dev URL for
CLI learning/diagnostics. Product-facing `/midnight` and `/midnight/prove` no
longer link to it; their normal flows are Funder verification and integrated
Seller/Buyer issuance respectively.

ADR-018 is accepted for the complete Vue-triggered local flow. It adds a trusted
Node.js Proof Bridge inside the `giwa-midnight/cli` workspace on
`127.0.0.1:4200` and a separately gated development-only `/midnight/prove`
route. The Bridge reuses the existing runtime-proven CLI encrypted private
state, participant identity, wallet balance, Provider 2 path, Proof Server, and
current contract. This is an explicit custodial local boundary: MetaMask only
authorizes the GIWA role, while the Bridge's Midnight dev wallet signs and
submits the Midnight transaction.

The browser keeps the entered mock financial tuple and PIN only until challenge
creation and then clears them from reactive form state. The Bridge and Mock
Provider process those values transiently, and the Proof Server receives the
plaintext witness but no wallet key. One CSPRNG body-only session progresses
through authorization, attestation, and proof/submission; after finalization,
`indexing` is only an immediate compatibility transition into `complete`. There
is no automatic ambiguous retry. An internal expiry timer drops an unsigned
prepared tuple and frees the active slot at its deadline even without a later
poll. Each terminal capability/error/status record is also automatically purged
after 60 seconds without requiring another request. On completion Vue receives a
proof capability and must independently resolve it through the existing
port-4100 read adapter and Indexer before showing success.

Current official Midnight documentation supports Lace on the local
`undeployed` Node/Indexer/Proof Server endpoints. The Bridge was selected to
preserve the current proven CLI identity/private state and minimize this PoC's
change surface while local Lace remains technically supported. Direct Vue +
Lace remains a possible later self-custody replacement requiring a separate
identity/state migration decision.

The Mock Provider atomically consumes the challenge on the first attestation
attempt, re-reads the canonical GIWA role, recomputes the salted request
commitment, and recovers the EOA signer before issuing its unchanged Schnorr
attestation as Provider 2. Provider 1 results remain legacy and must not be
called wallet-authorized. The Compact contract, eight-field Schnorr message,
public result schema, and sealed GIWA configuration did not require changes;
Midnight does not independently verify the EIP-712 signature. The local address
changed only because the disposable standalone chain was recreated.

Provider 2 is now registered on replacement deployment
`7e3ea9d741ce0f5862db6f46d0ad720be2586cd7d0405ec77e4a0478aa50f4fb`;
the live public state reports one registered Provider. A real Seller MetaMask
authorization completed the local attestation → Schnorr → proof → transaction
→ Indexer E2E. Transaction
`00d7ed17d2d109ad0f0490bd6ea116b57745befcb6a7d0662dd922936374657045`
was included in block `2854`; an independent Indexer read decoded one result as
`eligible=true`, `providerId=2`, and `policyVersion=1`. Secure multi-user
capability delivery/access, independent Seller/Buyer Midnight private states,
refresh rounds, freshness/latest selection, expiry, and any later direct-Lace
self-custody migration remain future work. Further Spring proof coordination or
persistence remains later and only if the proven Vue flow requires it.

Phase 2.5/ADR-017 limitations are explicit: GIWA RPC proves which wallet is
recorded for a role, and Provider 2 additionally proves control of that wallet
only at issuance time. It does not prove that the mock inputs belong to the
wallet, legal-company identity, bank verification, accounting provenance, or
data truth. The two-minute authorization expiry is not result freshness; the
ledger has no issued time, latest-result rule, expiry, revocation, or refresh
round and is not a GIWA Funding gate.

The implemented MVP issues a new challenge, Provider attestation, and ZK write
for the first intended result of each receivable-role context. A different
receivable or the opposite role needs its own issuance because the signed GIWA
binding changes. Funder verification is different: the resulting capability is
a reusable exact-read handle, so repeated checks do not consume it or generate
another proof. Compact enforces one-shot insertion only for the exact lookup
key; changing the PIN produces another pseudonym/key, not a refresh or recovery.

The final security pass rejects the Jubjub identity Provider key in both
registration and verification, requires canonical non-zero Provider secrets,
and pins the Mock Provider to the approved Midnight deployment before any GIWA
RPC or signing. The Attestation API accepts JSON bodies up to 4,096 bytes with
bounded server timeouts. CLI provider calls are loopback-only, redirect-free,
10-second/64-KiB bounded, and do not reflect remote bodies or sensitive URL
parts into logs. Fresh mnemonics bypass file logging, and CLI logs use `0600`.
The read adapter permits only one unresolved Indexer query at a time because the
current SDK does not expose cancellation. ADR-018 additionally limits the
Bridge to literal loopback, exact JSON/body-only sessions, the configured local
Origin and custom UI header, no CORS, one active session, and one
CLI/Bridge process lock. Vue clears the raw tuple/PIN after challenge creation;
the Bridge temporarily writes the witness to encrypted local private state,
then attempts cleanup after success or failure, retries once, and sanitizes any
stale transient fields before another prepare may proceed. Vue does not persist
the values, and neither layer logs them. For the current ADR-017 code,
Attestation authorization-focused tests pass, and the complete Attestation API
suite passes `74/74`. CLI tests pass `125` with `1` optional environment E2E
skipped. The current Vue suite passes 14 files / 103 tests; full ESLint/Oxlint,
changed-file Prettier, and production build pass. These are code-boundary
checks, and the separate live Seller run above supplies the Provider 2
local-runtime E2E evidence. Those results alone did not turn Vue into a
proof-submission client; ADR-018 is the new, separate Bridge-backed path.

For ADR-018, the loopback Bridge, one-shot session runtime, pinned local
Provider/contract startup preflight, sealed GIWA configuration cache,
private-state cleanup, and common CLI/Bridge process lock are implemented. The
Indexer preflight is bounded to 10 seconds and occurs before port 4200 opens;
per-challenge preparation does not query the Indexer while raw inputs exist.
Under Node 22.21.1, the current CLI suite reports `125` tests passed with `1`
optional environment test skipped, and CLI typecheck/build pass. The separate
Attestation API suite passes `74/74` and its build passes. CLI lint is not
verified because this workspace currently has no installed
ESLint binary (`eslint: command not found`). The workspace overrides and locked
tree use `find-my-way@9.8.0` and `send@1.2.1` below Restify 11, and
`npm audit --audit-level=high` reports zero high-severity vulnerabilities. The
successful checks are not a Docker/real-LevelDB proof run. The new Vue proof
route is implemented. Under Node 24.19.0, the full UI suite passes 14 files /
103 tests; full ESLint/Oxlint, changed-file Prettier, and the production Vite
build pass. Development
configuration verification confirms literal host `127.0.0.1`, strict port
`5173`, a read proxy to `4100`, and a proof proxy to `4200` only when the proof
flag is on. Both the Vite devtools plugin and runtime Vue Devtools exposure are
disabled for that mode. The production artifact scan found zero occurrences of
the proof view/service chunk and proof API markers, but the dead route-name
string `midnight-prove` remains in the Receivables production component even
though its CTA condition is false. Removing that string at compile time remains
a TODO and is not a privacy/security boundary. A live development-browser
smoke created the Seller `#1` challenge through Vue and the real Bridge, then
found all four
private input values absent from the DOM and zero synthetic-value console
matches. The in-app browser had no MetaMask provider, so signing, proof
submission, and the full Seller/Buyer browser E2E remain pending. Direct
exhaustive tests of the
complete pre-existing capability and role-authorization modules also remain a
separate TODO rather than being inferred from mocked composable dependencies.
The UI workspace's `npm audit --audit-level=high` also reports zero
high-severity vulnerabilities after its scoped lockfile update. Midnight
CLI/Bridge runtime verification remains on
Node 22.21.1; these frontend results must not be used to change that pin.

On 2026-08-18, a live UI failure reading `Proof Bridge가 JSON 응답을 반환하지
않았습니다` was traced to process availability, not a Midnight proof or
Seller/Buyer financial-registration requirement. Docker Node, Indexer, Proof
Server, Provider 2, and Vue were running, but the separate read API on port
4100 and Proof Bridge on port 4200 were not. Vite therefore returned a
non-JSON `502` for `/midnight-proof`. Both local processes were restarted, a
real Seller `#1` challenge again reached the wallet-authorization step, and the
frontend now maps only that non-JSON proxy `502` to a clear Bridge-unavailable
error while retaining strict rejection of malformed successful responses.

On 2026-08-19, a later Challenge HTTP 502 was reproduced while ports
4000/4100/4200/5173 and all three Docker services were live. Exact MySQL and
GIWA-RPC inspection identified the concrete cause: the UI value `5` was the DB
`receivable_id`, but that row's synchronized GIWA
`onchain_receivable_id` is `2` and its NFT `token_id` is `2`.
`getReceivable(5)` correctly reverts `ReceivableNotFound(5)`. The row is
`TOKENIZED`, has no Funder assignment or funding transaction hash, and its
journal contains only confirmed create, verify, and tokenize stages. It is
ready to be funded; it has not been funded. In the same current demo data, DB
records `#6` and `#7` are `FUNDED` and assigned to the Funder. NFT minting and
`TOKENIZED` must not be described as completed liquidity supply; successful
liquidity supply changes the lifecycle state to `FUNDED`.

The Vue flow now prevents that ID mix-up. Seller/Buyer select an authenticated
DB receivable and `/midnight/prove` derives the synchronized onchain ID and the
current company's role; there is no manual onchain-ID or role input. DB,
onchain, and NFT IDs are displayed separately. Funder no longer enters the
issuer route or signs for a Seller/Buyer. After the role wallet produces and
independently resolves a proof, the issuer explicitly copies the capability or
exports a local capability file. On `/midnight`, the Funder selects a visible
DB receivable and Seller/Buyer role, explicitly imports the clipboard/file
artifact, and Vue rejects a capability whose onchain ID, approved contract,
role, or canonical wallet does not match that context before calling the read
adapter.

ADR-020 records that this explicit local handoff is no longer wholly
memory-only: the exported file and OS clipboard can outlive the page and remain
in backups, sync history, or clipboard history. They contain no raw financial
tuple, PIN, `companySecret`, hidden salt, signature, or private state, but they
are correlation-sensitive. The UX warns users to avoid shared/auto-synced
folders, delete obsolete files, and clear or overwrite the clipboard. Vue
clears only its component working copy. There is still no automatic backend
delivery, upload endpoint, server persistence, browser storage, URL transport,
or application logging; secure authenticated multi-user delivery remains
future work.

The implemented export uses the identifier-free
`gasok-proof.gasok-proof` filename. The Funder file picker accepts non-empty
UTF-8 `.gasok-proof` or `.json` content up to 16 KiB, then runs the existing
exact schema and selected-context validation. Import never auto-resolves: the
Funder must separately press `ZK 결과 확인`.

The Bridge error path now preserves only fixed operational classifications:
`GIWA_RECEIVABLE_NOT_FOUND`, `GIWA_RPC_UNAVAILABLE`, and the attestation-stage
`ROLE_WALLET_MISMATCH`. Compact's exact-key duplicate is separately normalized
to `ELIGIBILITY_RESULT_ALREADY_EXISTS`. Unknown Provider content remains generic
and is not reflected. The UI still distinguishes a non-JSON Vite 502 caused by
a stopped Bridge. `midnight/LOCAL_POC_RUNBOOK.md` records the exact five-terminal
startup, actor-specific browser flow, ID model, input units, safe shutdown, and
separate infrastructure/duplicate decision trees. The currently registered
Provider 2 process still uses an unpersisted ephemeral key and must not be
casually restarted; a repeatable cold start requires one intentional
persistent-key registration change.

The later 2026-08-19 Seller failure was not the earlier DB-ID/onchain-ID bug and
was not a Docker, Provider, Proof Server, Node, or Bridge outage. DB receivable
`#4` correctly mapped to GIWA onchain receivable `#1`; the exact Seller lookup
key was already present from an earlier result, so Compact rejected the write.
The Bridge running at 12:04 returned generic `PROOF_FAILED`; logs and ledger
state established the exact duplicate afterward. The updated Bridge/UI now map
and test `ELIGIBILITY_RESULT_ALREADY_EXISTS`, explain that the existing saved
capability must be reused, and do not offer PIN rotation as a bypass. A restarted
live Bridge/MetaMask E2E of that new mapping remains outstanding. If the
capability was not retained, recovery is unsupported in the current MVP.

The proof form now separates protocol ranges from eligibility policy. Revenue
accepts comma-formatted integer KRW and normalizes to `Uint<64>`; debt ratio is
entered as a percentage with up to two decimal places and converted to
`Uint<32>` basis points; overdue count and the pseudonym PIN accept `Uint<16>`.
Policy v1 remains revenue at least 500,000,000 KRW, debt ratio at most 200%, and
overdue count at most 1. A value outside those thresholds is valid input that
produces `eligible=false`, not a form error. The PIN is disposable local
pseudonym material in `0..65535`, not a login, wallet, bank, or company
password, and has no preassigned correct value.

ADR-019's actor separation is not a separate Midnight identity implementation.
The local Bridge continues to reuse one development wallet, encrypted
participant state, and `companySecret` for all Seller/Buyer selections. A PIN
is a pseudonym rotation value inside that shared participant; same-PIN
capabilities across contexts may be correlatable. Independent per-company
Midnight private states remain a required TODO.

A future design may separate a reusable, time-bounded company financial
credential from fresh per-receivable-role ZK presentations/nullifiers. That
would require an approved ADR, independent company identity/private state,
freshness and revocation rules, and Compact/Provider schema changes. No such
credential-reuse architecture is implemented now, and the current signed
receivable/role binding must not be removed as a shortcut.

After Midnight transaction finalization, the Bridge immediately returns
`complete` with the preserved capability and performs no per-session Indexer
confirmation query. Vue may retry only the independent read resolver until the
Indexer catches up; it never resubmits the proof for delayed public visibility.
Because the SDK has no abort signal, one timed-out startup query may remain
internally unresolved, but the Bridge stays closed and no raw tuple has entered
the process through its HTTP surface.

Database Contract

business_number = CHAR(10), digits only

UI Contract

business number display = 000-00-00000

Authenticated pages use a shared navigation header. The global account summary
shows only the current login email.

The dedicated My Information page shows the login email and company wallet
connection state/address. It does not expose internal user/company IDs.

All active frontend routes use the same minimalist B2B SaaS visual baseline,
1200px content width, 8px spacing scale, one green brand color, neutral surfaces,
subtle borders, form focus state, and button interaction hierarchy. Blockchain
lifecycle actions are presented as vertical timelines. This is a presentation
layer only; route structure and business flows are unchanged.

Error Contract

Common JSON error response with stable error codes

Backend implementation

- GlobalExceptionHandler
- SecurityErrorHandler
- ApiException
- BlockchainTransactionController
- BlockchainTransactionService
- BlockchainTransactionMapper
- BlockchainTransactionVerifier
- GiwaJsonRpcClient
- BlockchainRpcProperties
- BlockchainTransactionFailureRecorder

Frontend implementation

- src/services/api.js
- ApiError
- AuthStore, WalletStore, ReceivableStore use apiRequest
- src/assets/base.css and src/assets/main.css
- App-level authenticated navigation header
- src/views/ProfileView.vue
- src/contracts/ReceivableFinance.abi.json
- src/contracts/MockKRW.abi.json
- src/contracts/addresses.js
- src/services/web3/provider.js
- src/services/web3/receivableContract.js
- src/services/web3/mockKrwFaucet.js
- src/composables/useMockKrwFaucetClaim.js
- src/services/blockchainTransactions.js
- src/views/FundingView.vue
- src/views/RepaymentView.vue
- src/views/NotFoundView.vue
- `@lucide/vue` icon components
- public/favicon-64.png, public/apple-touch-icon.png, public/og.png, and public/og-saas.png
- public/robots.txt and public/sitemap.xml
- vercel.json SPA history fallback

Authenticated layout

- Every route with `meta.requiresAuth` displays a compact shared navigation
  header with Dashboard, Receivables, Funding, Repayment, and My Information.
- The minimum account identity is the authenticated email from `/auth/me`.
- Internal user/company IDs, business number, and wallet address are not shown in
  the shared header.
- `/profile` reuses `/auth/me` and `/wallet/me` to show only the login email,
  company wallet connection state, and full wallet address.
- A missing company wallet is a normal profile state; wallet lookup errors other
  than 404 remain visible and retryable.
- App startup loads the current user for authenticated pages, including a direct
  dashboard refresh.
- Concurrent page/layout calls share one in-flight `/auth/me` request.

Frontend visual polish

- `main.js` loads the project baseline stylesheet. It applies the light theme,
  one primary brand color, neutral canvas/surfaces, typography, 8px spacing
  tokens, box sizing, and minimum app height.
- The removed starter resets no longer override semantic heading and `strong`
  weights or introduce an unsupported automatic dark theme.
- The authenticated shell, Login, Dashboard, Profile, Receivables, Funding,
  Repayment, and 404 routes use Lucide icons instead of decorative emoji and
  retain visible text for accessibility.
- Redundant nested cards, gradients, and decorative shadows were removed. The
  remaining form and workspace boundaries use 1px neutral borders and 8px/12px
  radii so the product keeps the same layout with less visual noise.
- Receivables, Funding, and Repayment workspaces align to the shared 1200px
  content width. Their list panes and detail panes share one flat workspace
  boundary rather than appearing as unrelated cards.
- Receivables now presents CREATED, VERIFIED, TOKENIZED, FUNDED, and REPAID as a
  five-step vertical lifecycle timeline. Funding and Repayment present approval
  and execution as two-step vertical transaction timelines.
- Existing lifecycle guards, journal recovery, MetaMask actions, API payloads,
  disabled states, and synchronization handlers are unchanged; the timeline
  state is display-only and reuses the existing conditions.
- Interactive list rows expose selected, hover, focus-visible, and
  `aria-pressed` states without changing selection behavior.
- Mobile rules reduce outer and panel padding, wrap header actions, and preserve
  the existing single-column workflows.

Frontend public demo release quality

- The base document uses Korean language metadata, the GIWA product title and
  description, browser theme color, canonical URL, Open Graph fields, and
  Twitter Card fields.
- The favicon uses a lightweight 64px derivative of the existing GIWA
  receivable/NFT mark. A 180px Apple touch icon and a minimalist single-brand
  1200x630 social preview card are public assets.
- `robots.txt` allows the public demo entry point and references a sitemap that
  lists only the public root URL. Authenticated routes and the not-found route
  switch the runtime robots directive to `noindex, nofollow`.
- Every route has a product-specific browser title. Unknown client routes render
  a branded 404 page rather than an empty RouterView.
- Vercel rewrites history-mode paths to `index.html`, so direct visits and
  refreshes can reach Vue Router and the application 404 page.
- The shared shell keeps the existing header and route layout while adding a
  compact GIWA demo footer and a keyboard skip link.
- Dashboard, Profile, Receivables, Funding, and Repayment now render loading
  before data, confirmed empty state only after a successful read, and explicit
  retry/failure guidance where applicable. Login retains its existing
  submit-loading state.
- These changes are release/UI state only. Authentication, wallet mapping,
  receivable lifecycle, API payloads, and Web3 transaction behavior are
  unchanged.

Receivable explorer links

- The receivable detail panel keeps the full contract address and lifecycle
  transaction hashes visible.
- Contract, create, verify, tokenize, funding, and repayment metadata expose
  button-style links to the configured GIWA explorer in a new tab.
- Explorer buttons are hidden when the metadata or `VITE_GIWA_EXPLORER_URL` is
  missing.

Receivable onchain flow

DB CREATED

→ Buyer can review Seller, Buyer, amounts, dates, wallets, and document hash

→ Seller MetaMask createReceivable

→ ReceivableCreated event ID

→ POST /receivables/{id}/chain-created

→ Buyer explicitly accepts the displayed debt terms

→ Frontend reads getReceivable and compares DB data with onchain CREATED data

→ Buyer MetaMask verifyReceivable

→ POST /receivables/{id}/verified

→ DB VERIFIED

→ Seller reads and compares the VERIFIED onchain receivable

→ Seller MetaMask tokenizeReceivable

→ ReceivableTokenized event and escrow NFT mint

→ POST /receivables/{id}/tokenized with txHash only

→ Backend stores RPC-verified tokenId and DB TOKENIZED

→ Unrelated authenticated companies discover TOKENIZED funding opportunities

→ Funder verifies DB/onchain terms, payment token, NFT escrow, mKRW balance, and allowance

→ Funder explicitly approves the exact funding amount of mKRW

→ Funder separately confirms fundReceivable

→ ReceivableFunded + mKRW Transfer + escrow NFT Transfer

→ POST /receivables/{id}/funded with txHash only

→ Backend stores RPC-verified Funder metadata and DB FUNDED

→ Buyer reviews the full face value, current NFT owner, mKRW balance, and allowance

→ 잔액 부족 시 Buyer가 사전 예치된 데모 mKRW를 지갑당 1회 충전

→ Buyer explicitly approves the exact face value of mKRW

→ Buyer separately confirms repayReceivable

→ ReceivableRepaid + Buyer-to-current-owner mKRW Transfer

→ POST /receivables/{id}/repaid with txHash only

→ Backend stores the RPC-verified repayment hash and DB REPAID

Synchronization contract

- `chain-created` does not change the DB status.
- `verified` changes CREATED to VERIFIED and writes status history.
- `tokenized` changes VERIFIED to TOKENIZED, stores the RPC-verified token ID and
  tokenize transaction hash, and writes status history.
- `funded` changes TOKENIZED to FUNDED, stores the authenticated Funder company
  and wallet, configured MockKRW address, funding transaction hash, and status history.
- `repaid` changes FUNDED to REPAID, stores the repayment transaction hash, and
  writes Buyer status history.
- All five synchronization APIs are idempotent for the same blockchain metadata.
- Different metadata returns 409 BLOCKCHAIN_METADATA_CONFLICT.
- `(contract_address, onchain_receivable_id)`, create tx hash, and verify tx hash
  have same-stage database uniqueness constraints.
- Service checks reject a transaction hash already stored in any current lifecycle
  tx column, and `blockchain_transactions.tx_hash` now enforces race-safe global
  uniqueness across lifecycle stages.
- Frontend stores txHash in per-company browser local storage immediately after
  submission, before waiting for a receipt.
- A reload resumes the existing receipt check and event parsing instead of
  submitting a duplicate contract transaction.
- Confirmed event data remains stored until backend synchronization succeeds.
- Retry calls only the backend synchronization API; it never repeats the confirmed contract call.
- When browser recovery data is missing, the Seller UI reconciles DB `VERIFIED`
  receivables with the server transaction journal before exposing the mint action.
- An existing CONFIRMED tokenization journal is recovered through the idempotent
  backend synchronization API without opening MetaMask again.
- If a server-recovered CONFIRMED synchronization fails or its journal state
  changes, retry first re-reads the journal. It never silently downgrades the same
  button into a MetaMask receipt-recovery action.
- An existing PENDING tokenization journal blocks a new mint and resumes the
  original transaction receipt check. A journal lookup failure also keeps minting
  locked until the Seller explicitly retries the check.
- If the browser has a submitted tokenization hash that has not reached the server
  journal yet, preserve its nonce/calldata/replacement metadata ahead of a
  different server PENDING row. The server row remains available for the next
  reconciliation.
- The recovery candidate order is DB `TOKENIZED`, any TOKENIZE `CONFIRMED`
  transaction, TOKENIZE `PENDING`, and finally `FAILED`; a later failed attempt
  never hides an earlier confirmed mint.
- The journal gate detects already-submitted hashes. Two browsers that click in the
  same pre-submission window can both pass the read check before either hash is
  journaled; the contract prevents a second NFT mint, but a server-side
  per-receivable submission lease is future hardening if failed gas must also be
  prevented.
- Frontend role buttons use authenticated companyId.
- A Buyer-owned CREATED receivable is selected first when available; otherwise the
  first visible receivable is selected, so pending Buyer work is not hidden behind
  an additional list click.
- A Buyer review panel is visible for every Buyer-owned CREATED receivable, including
  while Seller chain creation is still pending.
- VERIFIED workflow guidance is role-specific: Seller sees Buyer verification
  completion, while Buyer sees its receivable verification completion. Internal
  TODO wording is not exposed in the user interface.
- The review panel provides a state refresh action so Buyer can pick up Seller chain
  creation without leaving the page; refreshing resets the local attestation checkbox.
- The review panel shows the parties, registered wallets, amounts, dates, document
  hash, and an explicit debt-attestation checkbox.
- The checkbox is a local signing guard, not a separate backend approval state.
- Immediately before `verifyReceivable`, the frontend reads `getReceivable` and
  requires the onchain ID, Seller, Buyer, amounts, dates, document hash, and CREATED
  status to match the backend response.
- Receipt event parsing accepts logs emitted only by the configured
  ReceivableFinance contract.
- Frontend preflight comparison remains a Buyer UX and accidental-mismatch guard.
  Backend RPC receipt/event verification is the authoritative synchronization guard.
- Contract calls request the receivable's registered wallet explicitly with
  `BrowserProvider.getSigner(expectedAddress)` instead of using the first permitted
  MetaMask account.
- If the registered wallet is not currently permitted for the site, the frontend
  opens MetaMask account permissions once and checks again before returning a
  WALLET_MISMATCH that includes the expected and first permitted addresses.
- Every write still verifies the resolved signer address against the receivable
  wallet immediately before signing.
- uint256 event values remain bigint/string and are never converted to JavaScript Number.

Blockchain transaction journal

- MetaMask hash submission creates a backend PENDING row before receipt waiting.
- The backend derives company, stored receivable wallet, chain ID, and function name
  instead of trusting those client fields.
- CREATE_RECEIVABLE, VERIFY_RECEIVABLE, TOKENIZE_RECEIVABLE, FUND_RECEIVABLE,
  and REPAY_RECEIVABLE are supported.
- REPAY_RECEIVABLE requires the registered Buyer while the DB receivable is
  FUNDED.
- Transaction hashes and addresses are normalized to lowercase.
- `blockchain_transactions.tx_hash` provides race-safe global uniqueness.
- Identical create/confirm/fail retries are idempotent; conflicting reuse returns
  `409 / BLOCKCHAIN_TRANSACTION_CONFLICT`.
- The frontend-confirmed block/gas fields are format-checked hints only. The backend
  fetches the transaction, receipt, latest block, and canonical receipt block from
  `GIWA_RPC_URL` before writing CONFIRMED.
- RPC verification requires the configured chain and ReceivableFinance address,
  expected signer/target, zero native value, exact ABI selector/arguments, a
  successful canonical receipt, minimum confirmations, and exactly one expected
  lifecycle event.
- CREATE validates every onchain receivable field and binds the emitted receivable
  ID; VERIFY binds the receivable ID and Buyer; TOKENIZE binds the receivable ID,
  token ID, custodian, and zero-address ERC-721 mint Transfer. FUND binds the
  receivable ID, token ID, Funder, Seller, funding amount, MockKRW payment
  Transfer, and escrow-to-Funder ERC-721 Transfer. REPAY binds the receivable ID,
  token ID, Buyer, current NFT-owner recipient, face value, and the matching
  Buyer-to-recipient MockKRW Transfer.
- The RPC-derived chain ID replaces the provisional wallet-mapping chain snapshot.
  Block number/hash, gas used, effective gas price, event IDs, and `rpc_verified_at`
  are stored as the verification proof summary.
- `verification_version` provides optimistic CAS ordering for success and failure
  results. A stale concurrent RPC result cannot overwrite a newer result.
- Only the submitting company can update a journal row; related companies can list
  the receivable journal.
- New chain-created, verified, tokenized, funded, and repaid database
  synchronization requires a matching RPC-verified CONFIRMED journal whose
  emitted receivable ID matches the requested onchain ID.
- Legacy CONFIRMED rows with no `rpc_verified_at` are verified and backfilled before
  they can authorize a new lifecycle synchronization.
- Even an already RPC-verified CONFIRMED row is checked again immediately before
  the first receivable lifecycle write, so a post-confirmation reorg cannot reuse a
  stale proof. A newly canonical placement refreshes the stored proof summary.
- Existing already-synchronized metadata keeps legacy-safe idempotent retry behavior.
- A 60-second receipt timeout remains PENDING.
- A successful replacement uses the replacement hash and marks the original FAILED
  with `TRANSACTION_REPLACED`; local storage retains both hashes until recovery is
  complete.
- Legacy browser records created before the journal integration backfill the
  PENDING/CONFIRMED journal before lifecycle synchronization. If exact lifecycle
  metadata is already present in the database, the stale browser record is cleared
  without attempting an invalid state transition.
- A cancelled replacement is retained locally until the original transaction can
  be marked FAILED, so a temporary journal API failure remains retryable.
- RPC unavailability, missing receipts, insufficient confirmations, and possible
  reorgs remain retryable without changing PENDING to FAILED.
- After a coherent canonical proof reaches the configured confirmation depth, a
  reverted receipt or deterministic signer/target/calldata/event mismatch marks
  the unsynchronized journal row FAILED and returns a stable error code.
- A lifecycle success refresh holds the journal row through the receivable write;
  a late failure cannot mark a hash FAILED after that hash is already synchronized.
- If concurrent verification changes the proof first, the caller receives
  `BLOCKCHAIN_VERIFICATION_RETRY_REQUIRED` and keeps its local recovery record.
- A client synchronization payload whose claimed event ID differs from the valid
  RPC proof uses `BLOCKCHAIN_SYNCHRONIZATION_EVENT_MISMATCH`; it does not corrupt
  the confirmed journal.
- New submissions persist a pre-send scan block and public transaction metadata.
- Reload recovery uses ethers replacement detection while the original transaction
  remains RPC-readable.
- If the original transaction is no longer returned by RPC, recovery scans bounded
  canonical block ranges with a persisted cursor. Stored metadata requires the same
  sender and nonce; legacy hash-only records require a unique exact lifecycle call.
- Exact-intent repricing resumes under the replacement hash. Changed calls and
  cancellations are terminal; missing or ambiguous candidates remain retryable
  without resubmitting a contract call.

Funding flow

- `GET /receivables/funding-opportunities` exposes only TOKENIZED, unassigned
  receivables to companies that are neither Seller nor Buyer.
- Before funding, a candidate can read the receivable detail but can list only its
  own FUND_RECEIVABLE journal rows. Seller, Buyer, and the assigned Funder retain
  full related-journal visibility.
- The Funding page validates `paymentToken()`, MockKRW decimals 0, the complete
  DB/onchain receivable terms, TOKENIZED status, token ID, and NFT escrow ownership.
- The page displays the exact funding amount, mKRW balance, and allowance.
- When that balance is insufficient, the page separately reads the configured
  MockKRWFaucet without weakening or replacing the normal Funding preflight.
- The testnet recharge CTA requires deployed Faucet/token bytecode, the expected
  MockKRW link and zero-decimal model, an eligible wallet, enough Faucet
  inventory, enough native gas, and a fixed claim that makes the wallet balance
  sufficient for the selected receivable.
- A claim is signed by the registered Funder MetaMask wallet. The client verifies
  the exact `Claimed` and MockKRW `Transfer(Faucet, Funder, claimAmount)` events,
  then refreshes the existing balance and allowance readiness.
- Submitted claim hashes are stored per wallet until a receipt/state check proves
  success or failure. Reload and temporary GIWA RPC lag cannot expose a duplicate
  claim action while the original result is uncertain.
- Funding and Repayment share the same wallet-keyed Faucet claim composable and
  browser record. A claim submitted on one page cannot be submitted again from
  the other page while its outcome is uncertain.
- Funding opportunity detail, journal, readiness, and Faucet reads share a
  selection generation guard, so a slower response for a previously selected
  receivable cannot overwrite the current receivable UI.
- Approval and funding are separate user actions. Approval never automatically
  opens the fundReceivable signature request.
- Approval is not a receivable lifecycle journal row. Its successful receipt,
  exact Approval event, and refreshed allowance are the client-side readiness
  proof; the final funding receipt proves the actual token movement.
- FUND_RECEIVABLE uses the existing PENDING/CONFIRMED/FAILED journal and
  per-company reload/replacement recovery.
- A confirmed funding whose DB synchronization failed is retried through
  `POST /receivables/{id}/funded` without submitting another MetaMask transaction.
- Backend confirmation requires the exact fundReceivable calldata, Funder signer,
  ReceivableFunded event, MockKRW Transfer from Funder to Seller, and ERC-721
  Transfer from ReceivableFinance escrow to Funder.
- The backend writes FUNDED only when the RPC-derived event token ID matches the
  stored token ID. The client supplies only the funding transaction hash.

Repayment flow

- `/repayment` lists receivables for which the authenticated company is the Buyer
  and the DB status is FUNDED.
- The page validates the configured Finance and MockKRW addresses,
  `paymentToken()`, MockKRW decimals 0, complete DB/onchain terms, FUNDED status,
  token ID, stored Funder, and the current NFT owner.
- The current NFT owner is the repayment recipient. It may differ from the
  original Funder after an ERC-721 transfer and must never be inferred from the
  stored Funder wallet.
- The page displays face value, maturity date, Buyer wallet, current NFT owner,
  Buyer mKRW balance, and allowance. The current contract does not enforce a
  maturity-time gate, so maturity is informational and the frontend does not add
  a client-only block.
- When the Buyer balance is below `faceValue`, the Repayment page conditionally
  validates the same pre-funded Faucet and allows one claim only when the fixed
  amount makes the selected repayment affordable.
- The Buyer claim uses the registered Buyer MetaMask wallet, verifies exactly one
  `Claimed` and one Faucet-to-Buyer MockKRW `Transfer`, and refreshes the existing
  repayment balance/allowance readiness. It never automatically approves or repays.
- Repayment detail, journal, readiness, and Faucet reads use a selection generation
  guard so a slower response for a previously selected receivable cannot overwrite
  the current Buyer workflow.
- Approval and repayment are separate user actions. Approval uses the exact face
  value and never automatically opens the repayReceivable signature request.
- REPAY_RECEIVABLE uses the shared journal and per-company localStorage recovery.
  A CONFIRMED repayment takes priority over PENDING or FAILED attempts.
- Two tabs can still pass the pre-hash journal check before either transaction is
  recorded. The contract prevents a second state transition, while a server-side
  per-receivable intent lease remains future hardening to prevent reverted gas
  for tokenize, fund, and repay submissions.
- A confirmed onchain repayment whose DB synchronization failed exposes only
  `POST /receivables/{id}/repaid` retry and never submits another MetaMask
  repayment.
- Receivable management redirects shared Funding/Repayment recovery records to
  their dedicated workflow pages so the generic lifecycle UI cannot invoke the
  wrong synchronization handler.
- Frontend receipt validation requires exactly one ReceivableRepaid and one
  MockKRW Transfer from Buyer to the current NFT owner for the full face value,
  plus receipt-block REPAID status and unchanged NFT ownership.
- Backend RPC verification binds the exact repayReceivable calldata, Buyer signer,
  ReceivableRepaid IDs/Buyer/recipient/face value, and the matching MockKRW
  Transfer before writing DB REPAID.
- Repayment reuses the existing `repay_tx_hash`, status-history, and transaction
  journal columns; no schema migration is required.

Wallet UX

MetaMask account selection → address confirmation → company mapping

Reconnecting the same mapped address refreshes the stored wallet chain ID.

Duplicate wallet

409 WALLET_ALREADY_MAPPED → show conflict → select another MetaMask account

Guardrail for next work

- New backend errors that require dedicated UX must use a stable ApiException code.
- New frontend API calls must use src/services/api.js.
- Do not convert all errors to 403.
- Keep 401 authentication, 403 authorization, and 409 resource conflict distinct.

Deployment

Hardhat

GIWA Sepolia

Deployment status

- Hardhat compile, test, deployment, and verification now share Solidity
  `0.8.24+commit.e11b9ed9`, optimizer enabled with 200 runs, viaIR disabled, and
  EVM version Paris.
- The pinned local `solc` package supplies the compiler, and Hardhat artifacts
  preserve the Standard JSON input used for Blockscout verification.
- `npm run deploy:giwa` deploys MockKRW and then ReceivableFinance, verifies
  `paymentToken()`, and writes public metadata to
  `giwa-contrract/deployment/giwa-testnet.json`.
- `npm run verify:giwa` verifies both contracts against the GIWA Blockscout API;
  `npm run deployment:env` prints the matching frontend/backend environment
  values.
- `npm run mkrw:transfer -- <recipient> <amount>` distributes existing owner
  balance without increasing supply, while
  `npm run mkrw:mint -- <recipient> <amount>` explicitly creates additional
  test-only supply. Both Hardhat tasks attach to the recorded deployment and
  validate chain, code, zero decimals, current onchain owner, balances, event,
  and post-state before reporting success.
- `giwa-contrract/MKRW_OPERATIONS.md` is the Korean operator guide for securely
  loading the temporary Owner key, choosing transfer versus mint, checking the
  explorer result, pre-funding the deployed Faucet, cleaning the shell variable,
  and resolving common errors.
- After a successful receipt and exact Transfer event, the owner tasks read
  balances and total supply at the confirmed block with bounded retries. Public
  RPC post-receipt state lag produces a success warning instead of a false
  transaction failure; the submitted transaction must never be sent again.
- Owner-to-Funder transfer
  `0x276dc7572aa09e47b2cc55e1b75ae4e111cfbe1cb45f89ef73985a4716032ba0`
  succeeded on GIWA Sepolia for `10,000 mKRW`. RPC verification confirmed status
  1, the exact Transfer event, Owner balance `999,990,000`, Funder balance
  `10,000`, and unchanged total supply `1,000,000,000`.
- A subsequent user-executed `100,000 mKRW` transfer increased the same Funder
  wallet's RPC-verified current balance to `110,000 mKRW`.
- `MockKRWFaucet` provides a self-service demo-token path for online reviewers.
  The owner pre-funds the Faucet with existing mKRW, and each wallet may claim one
  constructor-configured fixed amount. Claims transfer existing inventory, so
  they do not increase `totalSupply`.
- The Faucet validates the payment-token contract address and claim amount at
  deployment, rejects duplicate claims, reports depleted inventory without
  consuming claim eligibility, and lets only the owner recover remaining demo
  inventory when the Faucet is retired. It does not receive MockKRW ownership or
  mint permission.
- The GIWA Sepolia Faucet is deployed at
  `0xa451FA95c3E2Efd771f6Ba556daBBf36f888ef2E` with fixed claim amount
  `10,000,000 mKRW`. Deployment transaction
  `0xcd71ff3c79c17bfc4627a22c87a72139c30cd5a69cf686025744f5b30f8cc633`
  was confirmed in block `32667847` and recorded separately from the verified
  MockKRW/ReceivableFinance pair.
- `npm run deploy:faucet:giwa` now provides a Faucet-only Hardhat deployment
  path. It reads the existing pair metadata without modifying it, validates the
  GIWA chain, recorded deployer, live MockKRW identity/owner/zero decimals, and
  native gas balance, then deploys a default `10,000,000 mKRW` fixed claim unless
  `MKRW_FAUCET_CLAIM_AMOUNT` is explicitly set.
- A successful Faucet receipt is written separately to
  `deployment/giwa-testnet-faucet.json` before post-deployment RPC reads. Rerunning
  the command recovers and validates that address without submitting a duplicate
  deployment when GIWA public-RPC visibility is delayed.
- The Funding and Repayment UIs read `VITE_MOCK_KRW_FAUCET_ADDRESS` only after
  detecting an insufficient actor balance. A missing/bad Faucet configuration
  remains local to that callout and never blocks a wallet that already has enough
  mKRW.
- The implemented UX is: insufficient mKRW balance -> registered Funder or Buyer
  MetaMask wallet calls `claim()` -> receipt and exact token transfer are checked
  -> the existing workflow readiness is refreshed -> approval and funding/repayment
  remain separate explicit actions.
- Claim submission and recovery never call the backend or add a receivable
  lifecycle journal row. A per-wallet browser record blocks duplicate submission
  across reloads until the existing receipt or onchain claim state is reconciled.
- The Owner has pre-funded the Faucet with `600,000,000 mKRW`, enough for sixty
  fixed `10,000,000 mKRW` claims. Total supply was not increased. The private key
  remains only in the user's terminal and must never be copied into chat or a
  repository file.
- The Faucet solves only demo mKRW distribution. Reviewers still require GIWA
  Sepolia native ETH for the claim, approve, and fund/repay transactions; gas
  sponsorship remains outside the MVP PoC.
- `MKRW_OPERATIONS.md` documents MetaMask balance visibility: use GIWA Sepolia,
  activate the exact recipient account, import the current deployment's MockKRW
  address with symbol `mKRW` and decimals `0`, distinguish old deployments with
  the same symbol, and refresh the network without resubmitting a transfer.
- The same guide records the complete MetaMask custom-network fields for GIWA
  Sepolia: RPC `https://sepolia-rpc.giwa.io`, chain ID `91342`, native symbol
  `ETH`, and explorer `https://sepolia-explorer.giwa.io`.
- Verification rechecks the live chain, both contracts' deployed code, recorded
  compiler settings, and the ReceivableFinance-to-MockKRW payment token link
  before submitting source metadata to Blockscout.
- The verified replacement deployment is MockKRW
  `0x5cD8a99Dcf5Fa00fb4fD9873b41A15F9C13C9d3F` and ReceivableFinance
  `0x0f264334f98BA0d22f7Fc6Bb901a5Fa36158a315`.
- The first Finance post-deployment `paymentToken()` read briefly returned empty
  data from the public RPC even though the creation receipt succeeded. Explorer
  and RPC recovery confirmed the existing deployment, and both contracts were
  verified without redeploying.
- Deployment and verification now retry contract-code/state reads during public
  RPC visibility lag, while completed receipt metadata is persisted before the
  post-deployment read.
- The deployer private key is accepted only through the current terminal's
  `DEPLOYER_PRIVATE_KEY`; it is never stored in the repository.
- Hardhat local EVM tests pass for the full CREATED→REPAID lifecycle, permissions,
  current NFT-owner repayment, and ERC-20 failure rollback.
- `npm audit --omit=dev` reports zero non-development dependency vulnerabilities.
- The Hardhat 2 / solc development-only dependency tree still has audit advisories
  without a non-breaking fix; it is used only with trusted local contract sources
  and remains a toolchain-upgrade TODO.
- Existing MySQL must receive the non-destructive
  `.codex/migrations/20260730_receivable_chain_metadata_uniques.sql` migration.
- Existing journal tables with none of the four RPC proof columns must receive
  `.codex/migrations/20260730_blockchain_transaction_rpc_verification.sql`, then
  tables without `verification_version` must receive
  `.codex/migrations/20260730_blockchain_transaction_verification_version.sql`
  before the backend is deployed. A table created by the current create-table
  migration already contains all five and must not run either ALTER.
- Never rerun the destructive `.codex/schema.sql` against the populated local database.
- User-confirmed MockKRW and ReceivableFinance deployment to GIWA Sepolia is complete.
- User-confirmed real Seller createReceivable and Buyer verifyReceivable transactions
  succeeded.
- User-confirmed real Seller tokenizeReceivable transaction, NFT mint, and backend
  TOKENIZED synchronization succeeded.
- User-confirmed real Funder approval, fundReceivable transaction, DB FUNDED
  synchronization, and Seller mKRW receipt succeeded.
- User-confirmed real Buyer approval, repayReceivable transaction, and DB REPAID
  synchronization succeeded. The current NFT owner's exact face-value balance
  increase remains to be confirmed.
- The original Remix deployment remains historical. The replacement Hardhat
  deployment is complete and both contracts are verified on Blockscout.
- Existing DB chain metadata, NFTs, MockKRW balances, allowances, and journal
  proofs remain bound to the original contract pair. Never rewrite those rows to
  the replacement addresses; use a fresh demo database or new lifecycle data.
- The Vercel frontend deployment is live.
- The Repayment backend/frontend update still requires Railway and Vercel
  redeployment before production-origin validation.
- Public replacement contract addresses, transaction hashes, blocks, deployer,
  and compiler settings are recorded in
  `giwa-contrract/deployment/giwa-testnet.json`.
- Frontend development/production/example env files and the backend
  `application.yml` fallback addresses now use the verified replacement pair.
- Vercel `VITE_*` and Railway `GIWA_*` dashboard variables still override those
  files and must be updated together before their next deployments.
- Railway backend deployment uses the `giwa-api/Dockerfile` Java 17 build instead of
  relying on Railpack Java auto-detection.
- Backend runtime supports Railway `PORT`, Railway MySQL variables, exact
  comma-separated Vercel CORS origins, and public `GET /health`.
- `GET /health` is a liveness endpoint and does not validate MySQL connectivity or
  schema readiness.
- Blank legacy `DB_*` variables must not remain on Railway because they override
  the corresponding `MYSQL*` fallback values.
- Railway is deployed at `https://giwa-api-production.up.railway.app`, and
  `GET /health` returns `{"status":"UP"}`.
- A preflight from `https://giwa-ui.vercel.app` to `/auth/login` returns the correct
  CORS allow-origin header.
- The deployed frontend previously appended `/auth/login` to a slash-terminated
  `VITE_API_URL`, producing `//auth/login`; Railway returned 400 without CORS headers,
  so the browser surfaced it as a CORS failure.
- The frontend now strips trailing slashes from `VITE_API_URL`, and the production
  environment value is stored without a trailing slash.
- Vercel has been redeployed, and browser API calls work without CORS errors.
- The public-demo metadata, Vercel SPA rewrite, 404, footer, and loading/empty
  state update still requires a Vercel redeployment.
- Railway RPC verification requires `GIWA_RPC_URL`, `GIWA_CHAIN_ID`,
  `GIWA_RECEIVABLE_FINANCE_ADDRESS`, and `GIWA_MOCK_KRW_ADDRESS`; timeout and
  confirmation depth are configurable with `GIWA_RPC_TIMEOUT_MS` and
  `GIWA_MIN_CONFIRMATIONS`.

Smart contract pre-submission validation

- `npm test` compiles Solidity 0.8.24 and passes 18 explicit Hardhat scenarios.
- Six Faucet scenarios cover constructor validation, fixed pre-funded transfer
  without supply growth, one claim per wallet, independent wallets, depleted
  inventory and refill recovery, and owner-only inventory withdrawal.
- The additional MockKRW scenario distinguishes initial-supply owner transfer
  from owner-only minting and checks the corresponding total-supply behavior.
- The complete CREATED→VERIFIED→TOKENIZED→FUNDED→REPAID lifecycle and all five
  lifecycle event argument sets are verified.
- Seller funding proceeds, NFT escrow/ownership transfer, repayment to the current
  NFT owner, and final REPAID status are verified.
- Role restrictions, wrong-state calls, and nonexistent IDs assert exact Solidity
  custom errors and arguments.
- Funding and repayment independently test insufficient ERC-20 balance and
  insufficient allowance, including state, balance, and NFT ownership rollback.
- Buyer, amount, and date input boundaries are verified.
- No change to the deployed `ReceivableFinance` or `MockKRW` core contracts was
  required; `MockKRWFaucet` is an additive testnet-only contract.

Remaining Features

- Update Railway/Vercel runtime address pairs and run a fresh lifecycle.
- Confirm the current NFT owner received the full face value on repayment.
- Redeploy Vercel with the Faucet-enabled Funding and Repayment bundle and its
  `VITE_MOCK_KRW_FAUCET_ADDRESS` value.
- Execute one real Buyer Faucet claim and confirm the claim, approval, and
  repayment remain three explicit MetaMask actions.
