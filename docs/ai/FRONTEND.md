## Midnight reliability fixes — 2026-09-18 source, not yet deployed

See [the fix report](MIDNIGHT_COMPLIANCE_FIXES.md). Cached true/false results must
remain tied to current request context/status and a reactive expiry clock. An
accepted but malformed prove response keeps same-session recovery. Midnight mailbox
requests have 10-second/64KiB limits; timeout cannot undo an accepted server mutation.
Auth token+generation changes invalidate old responses, pending signatures and later
batch operations; keyed remount restarts the new account's mailbox even on the same
route. Hosted results accept only Provider2. Read degradation warns without blocking
existing recovery; verifier mismatch requests an operator update, not repeated restart.
UI257 distinct tests, production build and full lint passed; no new public E2E yet.

## MidProof UI — 2026-09-17

Current product name: **MidProof**. Original mint M symbol, dark teal palette,
logo/favicon/Apple/share assets, metadata and per-route titles replace the prior
Midnight-copy branding. Explanations are concise while fictional fixtures/provider,
hosted witness processing, consent, result expiry/failure and recovery stay explicit.

The authenticated receivable amount policy supplies demo max 10,000 mKRW and
suggested face 1,000/funding 900. Inputs remain strings (text + numeric input mode)
for exact BigInt validation; no floating-point conversion. New issuance/funding
fails closed before wallet interaction on policy failure or cap violation. Existing
receipt recovery and already-funded repayment retain full historical amounts.
List selection uses request ordering so late responses cannot change Buyer consent.
Vue 205 tests, production build, ESLint and Oxlint passed for the feature release.
The subsequent domain update uses `https://midproof.vercel.app/` for canonical,
Open Graph and Twitter URLs. The sitemap contains only the public entry URL;
robots allows the entry/login page and required static assets. API URLs and
wallet protocols are unchanged. New-origin login/MetaMask permission must be
established again; browser-local pending transaction records do not migrate.
Final domain deployment verification is recorded in CONTEXT.md.

## Integrated hackathon demo — 2026-09-15

The owner approved a Vercel production demo and Preview backend. With
`VITE_MIDNIGHT_DEMO_ENABLED=true`, the normal v2 request/response routes are
included in production. Legacy manual/private-input diagnostics remain dev-only
and are excluded from the hosted demo. Vue and existing GIWA wallet flows stay.

The existing `VITE_API_URL` selects the single integrated gateway. Hosted proof
calls use bearer authentication, and status/prove/cancel also carry the request
ID for ownership checks. The public demo config pins the Preview deployment used
when validating EIP-712 and returned capabilities; local addresses are not a
fallback. Config must be ready before the synthetic proof button is enabled.

The assigned-request screen selects a named synthetic company profile instead
of arbitrary financial values. The operator-hosted fictional institution signs
its fixture. A shared status banner shows automatic backend preparation and
readiness. Normal completion/recovery remains JSON/PIN-free. No server keys,
private state or financial witness data is placed in the Vue bundle.

# MOST IMPORTANT For Midnight work

## Midnight

Vue 유지
React 예제는 참고만 함
CLI 성공 전 UI 연동 금지

위 CLI 선행은 초기 개발 순서이며 현재 통합 데모를 매번 초기화하라는 지시가 아니다.
외부 예제를 적용하기 전 [참조 하네스](MIDNIGHT_REFERENCE_HARNESS.md)를 따른다.

## Current v2 product UX

The authenticated `/midnight` route is the Funder request
workspace. The Funder selects an unassigned `TOKENIZED` receivable, Seller
and/or Buyer, minimum annual revenue, maximum debt ratio, maximum overdue
count, and a validity duration. These are public evaluation **criteria**, not
the Funder's guesses about the subject's facts. Selecting both roles creates two
independent requests. The page explains every unit and always renders the
result beside the exact criteria and subject. The approved hosted-demo flag
includes this route in production; legacy diagnostics remain development-only.

The authenticated `/midnight/prove` route is the Seller/Buyer assigned-request
inbox. The subject reviews who requested the check, which receivable/role and
wallet are bound, the criteria, and expiry; it may deny or select a named
synthetic profile. The hosted browser sends only its profile ID and request ID;
the operator expands the synthetic values. The earlier direct local mode accepts
caller-supplied mock facts transiently, sends them only to the loopback Bridge
and clears them after challenge creation. The canonical role wallet signs the v2 EIP-712
consent. No Funder signs for Seller/Buyer.

There is no product JSON textarea, capability copy/paste, file handoff, or PIN.
The Bridge creates an internal request-scoped random pseudonym nonce. On proof
finalization Vue hands the capability directly to Spring `complete`; after
Spring confirms `SUBMITTED` or the idempotent already-`COMPLETED` state, Vue
ACKs the Bridge's encrypted outbox. If the page or Bridge restarts before that
ACK, the same request is recovered by request ID and delivered without another
signature or proof submission.

The Funder sees request states, not a bare `eligible`: waiting, proof submitted
while public indexing catches up, denied, expired, failed, or completed. A
temporary resolver outage keeps `SUBMITTED` and retries. `DENIED`, `EXPIRED`,
and `FAILED` are explicitly not “부적격”. A completed result is worded as
“요청한 기준 충족/미충족” and includes Provider, mock profile timestamp, and
validity deadline. It is not bank/accounting verification, GIWA Funding
approval, or an automatic Funding gate.

The same Funder cannot create another unexpired request for the same
receivable/role. This reduces simple threshold probing, but the UI/backend still
need fixed policy templates, query budgets/cooldowns, and audit UX before any
remote multi-user release.

## Historical v1 diagnostic UX

The text below describes ADR-018 through ADR-020. These fixed-policy,
clipboard/file, PIN, and manual authorization routes remain only at
`/midnight/legacy/results`, `/midnight/legacy/prove`, and
`/midnight/legacy/authorize` for learning/diagnostics. They are not a fallback
for v2 product requests.

The authenticated, development-only `/midnight` route is the Funder-side
verifier. It first loads the existing authenticated receivable and Funding-
opportunity DTOs, requires a Funder-visible DB receivable plus Seller/Buyer role,
and then explicitly imports an intentionally shared Proof capability from the
clipboard or a user-selected local file before resolving it through
`/midnight-api`. Before resolution, the capability must match the selected
record's synchronized onchain ID, approved ReceivableFinance address, role, and
canonical party wallet. The result is not a Funding gate and does not establish
legal-company identity, financial-data truth, bank verification, freshness, or
current eligibility. Provider ID `1` is legacy role-context-only output; only
Provider ID `2` may be described as having passed the Mock Provider's EIP-712
role-wallet authorization policy.

The separate development-only `/midnight/authorize` route is a MetaMask signing
tool for the Seller/Buyer actor. It accepts only the versioned EIP-712 request
printed by the CLI, validates its fixed GIWA/Midnight/Provider context, selects
the exact canonical role wallet, and returns a signature response for manual
paste back into the CLI. Raw financial values, the hidden request salt, PIN,
company secret, provider signature, and Midnight private state never enter Vue.
The signing request and response stay in component memory and must not be put in
browser storage, logs, URLs, Spring Boot, or MySQL.

This manual tool is retained only for CLI learning/diagnostics through direct
dev-only URL access. The product-facing Funder verifier and Seller/Buyer proof
page do not link to it, and the global navigation points only to the Funder
result verifier. Normal Seller/Buyer issuance uses the integrated
`/midnight/prove` signature step.

The development-only `/midnight/prove` route is the Seller/Buyer issuer flow.
It does not accept a manually typed receivable ID or role. It loads the current
company's existing receivables, keeps only records whose positive synchronized
onchain ID belongs to the approved ReceivableFinance deployment, and derives
`SELLER` or `BUYER` from the authenticated company relationship. A route query
contains only a public DB record ID used to prefer one already-visible record;
it is never treated as an onchain ID. A Funder or unrelated company is blocked
from issuance and directed to `/midnight` instead.

The issuer flow collects the caller-supplied mock financial tuple and PIN only
in component memory, sends them once to the loopback `/midnight-proof` Bridge
to create the Provider 2 challenge, and immediately clears those raw fields
from the reactive form after the challenge response. A separate explicit
button then opens MetaMask for the selected role's canonical GIWA wallet. A
Funder cannot substitute its own account for Seller/Buyer. The page polls the
one-shot proof session and, when complete, passes the returned capability to
the existing `/midnight-api` resolver. It displays the independently decoded
Indexer result rather than trusting an eligibility value from the Bridge. Only
after that resolution succeeds does it enable an explicit capability copy or
local-file export for delivery to an intended Funder. The raw one-line JSON is
available only as an advanced diagnostic representation.

The first intended result for each receivable-role context is a new issuance and
therefore needs a fresh challenge, Provider attestation, and ZK write. A
different receivable or the opposite role cannot reuse that attestation. After
issuance, verification is read-only: the same capability may be imported and
resolved repeatedly without another proof. The UI must not equate repeated
Funder verification with re-attestation.

The proof flow must not place raw values, PIN, authorization material, session
ID, capability, or result in Pinia, browser storage, a URL, console output,
telemetry, Spring Boot, or MySQL. ADR-020's explicit user-directed clipboard
copy and local capability-file export are the only intentional handoff
exceptions for the capability itself; they never include the raw tuple, PIN,
secret, authorization material, or private state. The flow must not
automatically open MetaMask,
automatically retry an ambiguous submission, or claim perfect JavaScript memory
zeroization. Unmount and overlapping-request guards must prevent a stale response
from repopulating cleared state. Vue devtools are disabled whenever the raw-input
proof route is enabled so reactive values are not exposed through inspection
history.

The existing Midnight read service remains independent from the Node CLI, Proof
Server, attestation server, and private-state code. `/midnight/prove` calls only
the narrow loopback Bridge service; the Bridge owns those dependencies and the
Midnight development wallet. Production keeps
`VITE_MIDNIGHT_POC_ENABLED=false` and
`VITE_MIDNIGHT_PROOF_BRIDGE_ENABLED=false`, so all Midnight routes and lazy
chunks are excluded. The proof route requires both development mode and its
separate Bridge flag. React is not introduced.

This custodial Bridge is selected to reuse the current proven CLI identity and
state. It is not required by a Lace limitation: current official Midnight Local
Dev supports Lace on `undeployed`. Direct Vue + Lace remains a possible later
self-custody replacement after a separate identity/private-state migration ADR.

When the proof flag is enabled, Vite uses strict literal-loopback port `5173`,
adds the `/midnight-proof` proxy to `127.0.0.1:4200`, removes the development
devtools plugin, and sets the Vue runtime devtools policy to false. When the
proof flag is disabled, the port-4200 proxy is absent. Production excludes the
proof route registration, proof view/service lazy chunk, and proof API marker.
The current Receivables component still leaves the dead route-name string
`midnight-prove` in a production asset even though its dev-only CTA condition is
always false. Complete compile-time elimination of that dead string remains a
TODO and is not treated as a security boundary.

A live development-browser Seller `#1` challenge reached the Bridge,
after which all four private form values were absent from the DOM and captured
console output. The in-app browser exposed no MetaMask provider, so this smoke
stopped before signing and does not count as a full proof/transaction E2E.

### Receivable identity and actor contract

- `receivableId` is the Spring/MySQL record identifier used for list selection
  and routes.
- `onchainReceivableId` is the independent GIWA contract counter used by
  `getReceivable`, Provider role resolution, the EIP-712 request, and Compact
  binding. The UI never falls back from one ID to the other.
- `tokenId` identifies the NFT created at tokenization and is displayed as a
  third, separate value. It is not a receivable ID.
- Seller/Buyer start issuance from the Receivables page. Their current company
  relationship determines the role, and that role's registered wallet signs.
- Funder opens `/midnight`, selects a TOKENIZED opportunity or a record already
  assigned to it, selects which party result it received, and explicitly
  imports the capability from the clipboard or a selected file. It does not
  sign the Seller/Buyer issuance request.
- Changing either record or role clears imported capability/result state and
  aborts any pending resolver request. Leaving either proof page clears its
  in-app working copy. It cannot erase an exported file, OS clipboard history,
  filesystem backup, or synced-folder copy.
- This actor-aware UI does not create independent Midnight identities. The
  Bridge still shares one dev wallet, encrypted private state, and
  `companySecret` across every Seller/Buyer selection. Reusing a PIN can make
  capabilities correlatable through that shared secret. Independent company
  participant state is still a TODO.

### Proof capability handoff contract

- Seller/Buyer must deliberately choose either clipboard copy or local-file
  export after the capability has independently resolved. Neither action is
  automatic.
- Funder imports through an explicit clipboard action or a browser file picker.
  File contents are parsed locally into component memory; the selected file is
  not uploaded to Spring Boot or a new storage service. Import only validates
  and stages the capability; it does not automatically query the result. The
  user must explicitly select `ZK 결과 확인` afterward.
- Export uses the identifier-free generic filename
  `gasok-proof.gasok-proof`. File import accepts only `.gasok-proof` or `.json`,
  requires non-empty valid UTF-8 content no larger than 16 KiB, and still runs
  the exact version-1 capability/context parser before enabling verification.
- Raw one-line capability JSON is an advanced learning/diagnostic path, not the
  default product handoff. It has the same sensitivity and validation rules as
  the file and clipboard forms.
- The capability has no financial tuple, PIN, `companySecret`, hidden salt,
  Provider signature, or Midnight private state, but it links an otherwise
  opaque result to one public receivable role and is correlation-sensitive.
- Copy/export UX must warn the issuer to use only the intended Funder, avoid
  shared or auto-synced folders, and delete obsolete files. Import UX must warn
  the Funder to clear or overwrite the clipboard and remove local copies when
  no longer required.
- Clearing Vue state does not clear OS clipboard history, filesystem backups,
  sync history, or recoverable deleted files. Secure authenticated multi-user
  delivery, recipient binding, revocation, and retention remain TODO.
- There is still no automatic backend delivery, capability upload endpoint,
  server persistence, URL/query transport, local/session storage, IndexedDB,
  Pinia persistence, telemetry, or application logging.
- A saved capability is intentionally reusable for repeated exact-result reads;
  rechecking does not consume it. Because no listing or reconstruction endpoint
  exists, the saved artifact is also the only supported recovery after issuer
  component memory is cleared. Lost-capability recovery remains unsupported.

### Private input UX contract

- Annual revenue is entered as non-negative integer KRW. Grouping commas are
  accepted for readability and removed before the Bridge request. The protocol
  range is `Uint<64>`, not only values near the policy threshold.
- Debt ratio is entered as percent with up to two decimal places. Vue converts
  it exactly to basis points: `85.5% -> 8550 bps`, `200% -> 20000 bps`. The
  protocol range is `Uint<32>` basis points.
- Overdue count accepts the `Uint<16>` range `0..65535`.
- The PIN accepts `0..65535` and combines with the encrypted local company
  secret to derive a pseudonymous commitment. There is no correct PIN. It is
  not a login, MetaMask, card, bank, or company password; the user should use a
  disposable value or the cryptographically random temporary-PIN button.
  Changing it after an exact-key duplicate creates another pseudonym/key; it
  does not update, refresh, replace, or recover the earlier result and must not
  be offered as a duplicate workaround.
- Policy version 1 is a separate evaluation rule: annual revenue at least
  500,000,000 KRW, debt ratio at most 200%, and overdue count at most 1. Inputs
  outside those thresholds are allowed and produce a valid `eligible=false`
  proof rather than a form-validation failure.

### `/midnight/prove` State and UX Contract

The observable sequence is:

`editing -> requesting challenge -> awaiting signature -> signing ->`
`attesting/proving and submitting -> transitional indexing -> complete capability ->`
`resolving public result ->`
`success | failed | expired | cancelled | unknown`

- Challenge creation does not open MetaMask automatically. It shows the exact
  public receivable/role authorization meaning before the user explicitly signs.
- The displayed countdown uses the Provider's decimal-string expiry and never
  extends it locally. The Bridge independently expires and drops an unsigned
  prepared tuple at that deadline even if the page stops polling. An expired
  challenge requires a new session and new input.
- Session polling sends `{ version, sessionId }` in a POST body. The session ID
  is never added to route/query state.
- `failed` shows only the Bridge's stable safe code/message. The exact Compact
  duplicate code `ELIGIBILITY_RESULT_ALREADY_EXISTS` tells the user to reuse the
  previously saved capability and explicitly forbids trying another PIN. If the
  artifact was lost, the current MVP reports that recovery is unsupported. A
  timeout or unknown browser result remains status-checkable; it never launches
  another proof.
- `complete` is not final UI success until the returned capability resolves
  through the existing read API and Indexer. An indexing delay remains retryable
  only at the resolver step, without repeating proof submission. The Bridge may
  return `complete` immediately after a finalized transaction without querying
  the Indexer; preserving that capability is what makes resolver-only recovery
  possible.
- Cancelling before proof submission clears component references and asks the
  Bridge to consume the session. A proof already executing in the non-abortable
  SDK is shown as still running instead of falsely reported as cancelled.
- All fields use semantic labels, status text is announced accessibly, buttons
  expose loading/disabled states, and focus returns to actionable recovery.

The 2026-08-19 DB receivable `#4` Seller attempt exposed this duplicate
condition. The UI correctly derived onchain receivable `#1`; the local services
were healthy, but Compact found the exact lookup key already present. The Bridge
running at 12:04 still returned generic `PROOF_FAILED`; logs and ledger state
identified the cause afterward. The updated safe-code/UX path is covered by
tests but has not yet run through a restarted live Bridge/MetaMask E2E. This is
a stored-result identity conflict, not a 502 or a Docker, Provider, Proof Server,
Node, or Bridge availability failure.

# Frontend

## Pages

Login

Signup

Dashboard

Wallet

Receivables

Funding

Repayment

My Information

---

## Web3

ethers.js v6

BrowserProvider

Signer

MetaMask

---

## Stores

AuthStore

WalletStore

ReceivableStore

---

## Rules

State-changing transactions are signed only by MetaMask.

Frontend never stores private keys.

Visual consistency

- Public branding is Midnight (owner follow-up supersedes combined branding), referencing the white wordmark and dark /
  electric-blue palette at https://academy.midnight.network/. The official SVG
  is stored locally at `giwa-ui/public/midnight-logo.svg`; no runtime logo fetch
  or new third-party script/font is introduced.
- `--color-action` is the saturated button background; `--color-brand` is the
  lighter text/icon color for readable contrast. Success, warning, and failure
  retain distinct semantic tokens. Transaction copy uses neutral network terms without claiming Midnight asset settlement.
- Login/signup, shared header/footer, dashboard, 404, all active business and
  Midnight diagnostic screens share the dark theme. The dashboard puts the
  existing feature-gated Midnight request action first.
- SEO and social images describe local mock proof evaluation, never bank
  verification or Midnight settlement. Old deployment-origin references were removed on owner follow-up. Image
  paths are host-relative; canonical and `og:url` await a confirmed origin.
  Regenerate absolute social URLs and sitemap before publication.
- Old `og.png` / `og-saas.png` URLs remain copies of the new assets;
  the obsolete branded favicon filename was removed.
  `og-midnight.svg` is the editable social-card source; `og-midnight.png` is the
  1200x630 sharing image. Favicon SVG/ICO/64px and 180px Apple icon use the
  symbol from the supplied Midnight SVG on a dark background.

- Use the owner-requested Midnight dark theme (2026-09-12) while preserving
  the existing route/component structure and business behavior.
- `main.js` imports `assets/main.css`, which applies the project baseline from
  `base.css`. The baseline is explicitly dark and defines shared surface, text, action,
  focus, and semantic status colors alongside box sizing, dimensions, and typography.
- Do not restore the Vue starter automatic dark theme or universal
  `font-weight: normal`/margin reset; active screens use explicit scoped spacing
  and semantic type hierarchy.
- Authenticated workflow pages align to a maximum 1180px content width.
- Primary, secondary, list-row, and explorer actions keep distinct hover,
  disabled, and focus-visible states.
- Inputs and textareas keep the existing shape and receive consistent hover and
  high-contrast lavender focus-ring feedback.
- Panels use the same subtle border, 16px-scale radius, and restrained shadow.
- Responsive rules preserve the current flows while reducing padding and
  wrapping actions at narrow widths.

Public demo release quality

- `index.html` defines the Korean document language, product title and
  description, browser theme color, canonical production URL, Open Graph
  metadata, and Twitter Card metadata.
- Public assets include an optimized favicon, Apple touch icon, dedicated
  1200x630 Midnight social card, `robots.txt`, and `robots.txt`; sitemap regeneration awaits the new deployment origin.
- Authenticated pages and the client-side not-found route are marked
  `noindex, nofollow` at runtime.
- Router metadata sets a distinct browser title for Login, Dashboard,
  Receivables, Funding, Repayment, My Information, and 404.
- Unknown routes render the branded 404 page. `vercel.json` rewrites history-mode
  paths to `index.html` so direct links reach Vue Router.
- The shared shell adds only a compact demo footer and keyboard skip link; the
  existing header, route layout, and business flows remain unchanged.
- Data screens render in the order loading, error, data, and confirmed empty
  state. Empty copy is never shown before the initial API request completes.

Authenticated layout

- `App.vue` shows a compact navigation header on every route with
  `meta.requiresAuth`.
- The header links to Dashboard, Receivables, Funding, Repayment, and My
  Information.
- Display only the authenticated email in the global account summary. Do not
  expose internal user/company IDs, business number, or wallet address there.
- Direct refresh of an authenticated page loads `/auth/me` before replacing the
  loading label, and concurrent layout/page loads reuse the same request.
- Long emails use ellipsis. On mobile, the account summary remains on the first
  row and the menu is horizontally scrollable on the second row.

My Information

- `/profile` requires authentication and reuses AuthStore and WalletStore.
- Show the login email, company wallet connection state, and full wallet address
  only. Current APIs do not expose a user name or company name, so the frontend
  must not infer them.
- Treat `/wallet/me` 404 as a normal disconnected state. Keep other wallet lookup
  errors visible with a retry action.
- Provide wallet-address copy, Dashboard wallet management, and logout actions.
- Logout clears both AuthStore and WalletStore before routing to Login.

Contract configuration

- `src/contracts/addresses.js` reads only Vite environment variables.
- `src/contracts/ReceivableFinance.abi.json` contains the receivable lifecycle ABI.
- `src/contracts/MockKRW.abi.json` contains the payment-token ABI used by Funding
  and Repayment.
- `src/contracts/MockKRWFaucet.abi.json` contains only the read and claim surface
  used by the optional testnet demo-token flow.
- `src/composables/useMockKrwFaucetClaim.js` owns the shared wallet-keyed pending
  claim persistence, receipt/nonce recovery, uncertainty lock, and Faucet state
  used by both Funding and Repayment.
- Missing chain ID, RPC URL, ReceivableFinance address, or MockKRW address fails
  with a user-safe configuration message.
- A missing or invalid `VITE_MOCK_KRW_FAUCET_ADDRESS` disables only the demo
  recharge callout. It must never block a Funding or Repayment wallet that already
  has enough mKRW from its normal approval and lifecycle action.
- Placeholder or zero contract addresses are never treated as deployed contracts.
- Vercel must set `VITE_API_URL` to the Railway backend public HTTPS origin and
  rebuild the frontend because Vite variables are embedded at build time.
- `api.js` strips trailing slashes from `VITE_API_URL`, so API paths never become
  double-slash URLs that fail Railway preflight handling.

Receivable chain creation

1. Register the receivable in the backend.
2. Seller explicitly clicks GIWA chain creation.
3. Validate the GIWA network and active MetaMask signer.
4. Call `createReceivable`.
5. Wait for a successful receipt.
6. Parse `ReceivableCreated` by event name and keep the uint256 ID as a string.
7. Call `POST /receivables/{id}/chain-created`.

Buyer verification

1. Automatically prioritize a Buyer-owned CREATED receivable, then fall back to the
   first visible receivable, so pending Buyer work is visible.
2. Show the review panel for every authenticated Buyer-owned CREATED receivable.
3. Before Seller chain creation, keep the verification CTA visible but disabled and
   explain that the Buyer can review the terms while waiting.
4. Provide a state refresh action so the Buyer can load Seller chain creation without
   leaving the page; reset the local attestation checkbox whenever data is refreshed.
5. Show Seller, Buyer, registered wallets, amounts, issue date, maturity date,
   document hash, and description.
6. Require an explicit checkbox confirming that the Buyer reviewed and accepts the
   displayed debt terms.
7. Require that the Seller chain-created metadata exists.
8. Validate the GIWA network and Buyer MetaMask signer.
9. Read `getReceivable` and compare its ID, parties, amounts, dates, document hash,
   and CREATED status with the backend response.
10. Call `verifyReceivable`.
11. Wait for a successful receipt.
12. Call `POST /receivables/{id}/verified`.

The review checkbox is not persisted as a separate Web2 approval. The Buyer
MetaMask transaction is the authoritative attestation, and the smart contract still
prevents tokenization until its status is VERIFIED.
Client-side comparison protects the signing UX but is not a substitute for the
backend RPC receipt and event verification that authorizes synchronization.

Seller tokenization

1. Show the tokenization CTA only to the authenticated Seller for a VERIFIED
   receivable with complete create and verify metadata.
2. Validate the configured GIWA network, stored contract address, and registered
   Seller MetaMask signer.
3. Read `getReceivable` and compare the parties, amounts, dates, document hash,
   onchain ID, and VERIFIED status with the backend response.
4. Call `tokenizeReceivable`.
5. Persist the submitted hash and replacement recovery metadata before waiting.
6. Parse `ReceivableTokenized` from the configured contract, preserve token ID as
   a string, and require the financing contract as custodian.
7. Confirm the transaction through the backend RPC-verified journal.
8. Call `POST /receivables/{id}/tokenized` with only `txHash`.
9. Reload the receivable as TOKENIZED and display its token ID and tokenize tx.

The NFT is minted to the ReceivableFinance contract as escrow, not directly to
the Seller wallet.

Funder funding

1. Dashboard links to the authenticated `/funding` marketplace.
2. Load `GET /receivables/funding-opportunities`; Seller and Buyer companies never
   receive their own receivables as candidates.
3. Display Seller, Buyer, face value, funding amount, maturity, document hash,
   token ID, and expected face-value difference.
4. Validate the configured RPC network and require
   `ReceivableFinance.paymentToken()` to equal `VITE_MOCK_KRW_ADDRESS`.
5. Require MockKRW decimals 0, DB/onchain terms equality, TOKENIZED status, the
   stored token ID, zero onchain Funder, and NFT ownership by ReceivableFinance
   escrow.
6. Display the registered Funder wallet's mKRW balance and allowance. Block both
   writes when balance is below `fundingAmount`.
7. When balance is insufficient, read the separately configured MockKRWFaucet.
   Validate deployed bytecode, its MockKRW link, zero-decimal token model, fixed
   claim amount, wallet eligibility, Faucet inventory, and Funder native gas.
   Show the recharge action only when one claim makes the wallet balance at least
   `fundingAmount`.
8. The registered Funder wallet explicitly calls `claim()` through MetaMask.
   Wait for a successful receipt and require exactly one matching `Claimed` plus
   one MockKRW `Transfer(Faucet, Funder, claimAmount)`, then refresh the existing
   Funding readiness. Never submit a second claim when receipt confirmation is
   uncertain.
9. When allowance is insufficient, expose only the first-step approval action.
   Approve exactly `fundingAmount`, wait for a successful receipt, verify the
   exact Approval event, and re-read allowance.
10. Never automatically open `fundReceivable` after approval. The user must review
    the second step and click it separately.
11. Immediately before funding, repeat the complete onchain, balance, and allowance
    preflight, then call `fundReceivable`.
12. Verify exactly one ReceivableFunded event, MockKRW Transfer from Funder to
    Seller, NFT Transfer from escrow to Funder, FUNDED post-state, and Funder NFT
    ownership.
13. Confirm FUND_RECEIVABLE through the backend journal, then call
    `POST /receivables/{id}/funded` with only `txHash`.

Approval is not stored as a receivable lifecycle journal entry. A reload reads the
current allowance as the approval authority. FUND_RECEIVABLE uses the shared
per-company hash/replacement recovery record and backend journal. A confirmed
funding whose DB write failed exposes only a backend synchronization retry; it
never sends another fundReceivable transaction.

The demo recharge is testnet-only token distribution, not a receivable lifecycle
transition. It transfers pre-funded MockKRW inventory without minting, has no
backend API or DB journal row, and does not give the frontend/backend the Owner
private key. Funding and Repayment use the same per-wallet pending claim record,
so an uncertain request cannot be resubmitted from the other page. The caller
still needs GIWA Sepolia ETH for claim, approve, and fund or repay.

Buyer repayment

1. Dashboard and receivable management link to the authenticated `/repayment`
   page.
2. Load the current company's receivables and show only FUNDED receivables for
   which the authenticated company is the Buyer.
3. Display the full face value, maturity date, registered Buyer wallet, current
   NFT owner, mKRW balance, and allowance. The current NFT owner is the actual
   repayment recipient and may differ from the original Funder.
4. Validate the configured network, ReceivableFinance and MockKRW addresses,
   `paymentToken()`, MockKRW decimals 0, complete Funding metadata, DB/onchain
   terms, FUNDED status, token ID, stored onchain Funder, and current NFT owner.
5. When the Buyer balance is below `faceValue`, validate the separately configured
   MockKRWFaucet, its MockKRW link, zero decimals, fixed claim, wallet eligibility,
   inventory, and native gas. Expose the claim only when the current balance plus
   one fixed claim covers the full face value.
6. Submit `claim()` only from the registered Buyer MetaMask wallet. Persist the
   hash and nonce immediately, verify exactly one `Claimed` and one
   `Transfer(Faucet, Buyer, claimAmount)`, then refresh repayment readiness.
   Never automatically approve or repay after the claim.
7. When allowance is insufficient, expose only the first-step approval action.
   Approve exactly `faceValue`, wait for a successful receipt, verify the exact
   Approval event, and re-read allowance.
8. Never automatically open `repayReceivable` after approval. The Buyer must
   review the second step and click it separately.
9. Immediately before repayment, repeat the complete onchain, balance, allowance,
   and current-owner preflight, then call `repayReceivable`.
10. Verify exactly one ReceivableRepaid event and one MockKRW Transfer from Buyer
    to the receipt-block current NFT owner for `faceValue`.
11. Read the receipt block and require onchain status REPAID while NFT ownership
    remains unchanged.
12. Confirm REPAY_RECEIVABLE through the backend journal, then call
    `POST /receivables/{id}/repaid` with only `txHash`.

Approval is not journaled. REPAY_RECEIVABLE uses the shared per-company
localStorage and PENDING/CONFIRMED/FAILED journal recovery. A CONFIRMED repayment
takes priority over later PENDING or FAILED attempts. If the onchain transaction
succeeds but DB synchronization fails, expose only a backend synchronization
retry and never send another MetaMask repayment.
If receivable management detects a Funding or Repayment recovery record, it
routes to the matching dedicated page instead of trying to synchronize an
unsupported transaction type itself.

Repayment selection uses the same request-generation guard as Funding. Detail,
journal, Web3 readiness, and Faucet responses for an older selection are ignored,
and receivable switching is disabled while a wallet action is running.

The contract does not enforce repayment at or after `maturityDate`. The frontend
displays maturity for review but does not introduce a client-only date gate.

Transaction UX

- Display MetaMask/block confirmation and backend synchronization as separate stages.
- Before showing or executing the Seller mint action for a DB `VERIFIED`
  receivable, reconcile TOKENIZE transactions from the server journal. This
  protects a different browser, a cleared localStorage, and a stale tab.
- Prefer any CONFIRMED TOKENIZE journal over PENDING or FAILED rows even when the
  confirmed row is not the newest submission. A later failed attempt must not
  cause a duplicate mint.
- A CONFIRMED TOKENIZE journal with DB still `VERIFIED` shows an explicit
  "onchain mint complete, server synchronization required" warning and a
  backend-only synchronization button. The button never opens MetaMask.
- If that backend-only synchronization encounters a changed or unconfirmed
  journal, retry re-runs the journal reconciliation first. It does not reuse the
  same DB-sync label for a MetaMask receipt-recovery action.
- A PENDING TOKENIZE journal disables minting and restores the existing
  transaction-confirmation recovery flow. If local replacement metadata no
  longer exists, never guess or submit a replacement transaction.
- Within PENDING recovery, keep a browser-submitted hash and its replacement
  metadata even when that hash is not yet visible in the server journal. Do not
  overwrite it with a different server PENDING hash; reconcile that additional
  row after the local transaction is resolved.
- If the journal cannot be checked, keep minting disabled and show a retry action.
  Only a state with no CONFIRMED/PENDING tokenization candidate may expose a new
  mint action.
- This gate protects transactions whose hashes have reached the browser or server
  journal. It is not an atomic cross-browser lock before submission; the current
  contract still rejects a simultaneous second tokenization, while preventing its
  failed gas cost would require a future server-side intent lease.
- Handle user rejection, missing MetaMask, wrong network, wallet mismatch,
  an already-pending wallet request, insufficient gas, contract revert, and missing
  contract configuration.
- Store txHash in per-company browser local storage immediately after MetaMask
  submission, before waiting for a receipt.
- If the page reloads while pending, resume the existing receipt check and event
  parsing instead of sending the contract call again.
- If the chain transaction succeeds but backend synchronization fails, retain the
  confirmed txHash and event data until the idempotent backend retry succeeds.
- The retry button calls only the backend; it never submits the contract transaction again.
- Explorer links are displayed only when `VITE_GIWA_EXPLORER_URL` is configured.
- Receivable details link the contract address and create, verify, tokenize,
  funding, and repayment transaction hashes to their matching explorer pages
  while retaining the full values on screen.
- Immediately after MetaMask returns a hash, keep it in per-company local storage
  and create a backend PENDING journal entry before waiting for a receipt.
- After a successful browser receipt, the frontend sends decimal-string block/gas
  hints. The backend independently verifies RPC transaction/receipt/block/calldata/
  events and returns authoritative CONFIRMED metadata before receivable state
  synchronization.
- RPC pending, confirmation-depth, reorg, and availability errors keep the local
  transaction for retry without sending another contract call.
- A backend-verified revert or deterministic transaction/event mismatch is
  terminal. Clear the invalid local recovery record and show the stable backend
  error instead of retrying synchronization forever.
- If a terminal backend response was lost, the idempotent PENDING POST returns the
  existing FAILED journal on recovery; convert it to
  `BLOCKCHAIN_TRANSACTION_FAILED` and clear the stale local record.
- `BLOCKCHAIN_VERIFICATION_RETRY_REQUIRED` and the RPC pending/reorg/configuration
  families keep the local record for a backend-only retry.
- `BLOCKCHAIN_SYNCHRONIZATION_EVENT_MISMATCH` is distinct from a verifier event
  failure. Move the local record back to receipt recovery so the next retry
  reparses the event instead of treating a bad payload as a failed onchain
  transaction.
- A hash is marked FAILED only for a mined failed receipt or a provider-confirmed
  replacement/cancellation.
- Receipt timeout, temporary network failure, and journal API failure leave the
  local transaction recoverable and do not resubmit the contract call.
- On a successful ethers replacement, store the replacement hash first, journal it
  as PENDING→CONFIRMED, and mark the original hash FAILED with
  `TRANSACTION_REPLACED`.
- Capture a replacement scan start block before each contract submission and
  persist the public transaction `from`, nonce, target, calldata, and value with
  the original hash.
- After reload, use ethers replacement detection while the original transaction
  remains RPC-readable.
- If the RPC no longer returns the original hash, scan bounded canonical block
  ranges with a persisted cursor. New records require the same sender and nonce;
  legacy hash-only records require one exact actor, contract, calldata, and
  zero-value match.
- Only an exact-intent repricing is resumed. A same-nonce changed call or
  cancellation is terminal, while no or ambiguous candidates stay retryable and
  never trigger a new contract submission.
- Reload recovery idempotently re-ensures the PENDING row, checks the existing
  receipt, updates the journal, and then resumes backend state synchronization.
- Browser records created before journal integration are backfilled on retry. If
  their exact create/verify metadata is already present in the backend, they are
  recognized as already synchronized and safely cleared.
- A cancelled replacement is kept in local storage when its FAILED journal update
  cannot be sent; retry completes that update before clearing the local record.
- Known limitation: a legacy hash-only record can search only the retained bounded
  block history. If the relevant block is no longer available from the RPC, safe
  automatic replacement discovery remains retryable and requires explorer review.

Business Number

- Input and display format: 123-45-67890
- API payload format: 1234567890

Wallet Connection

- Force MetaMask account selection before mapping
- Show the selected address before calling POST /wallet/connect
- Require explicit user confirmation
- On WALLET_ALREADY_MAPPED, explain the conflict and offer another account selection

API Error Handling

- `src/services/api.js` is the only backend API fetch layer.
- AuthStore, WalletStore, and ReceivableStore use `apiRequest`.
- `ApiError` exposes `status`, `code`, `message`, and `fieldErrors`.
- Display the backend user-safe message.
- Branch special UX by stable `code`, not by parsing message text.
- Network failures use `NETWORK_ERROR`.

MetaMask Connection Flow

1. Call `wallet_requestPermissions` to show MetaMask account selection.
2. Read the selected account and chain.
3. Display the selected address before saving.
4. Require explicit confirmation.
5. Call `POST /wallet/connect`.
6. On `WALLET_ALREADY_MAPPED`, show that the address belongs to another company and offer `다른 계정 선택`.

Wallet UX rules

- Never automatically save the previously authorized browser account.
- Keep the selected address pending until the user confirms.
- On duplicate mapping, keep the pending address visible so the user understands which address failed.
- Do not display any information about the company that already owns the address.
- MetaMask rejection code `4001` is displayed as a cancellation message.
- Contract writes never assume that MetaMask account index 0 is the registered
  company wallet.
- Request the receivable wallet explicitly with `getSigner(expectedAddress)`.
- When the expected wallet is not in the site's permitted accounts, open the
  MetaMask account permission picker once and verify the returned accounts again.
- If it is still unavailable, show both the receivable's expected address and the
  first permitted address so the user can select the correct account or identify a
  stale wallet mapping.

### Branding and signed data boundary (2026-09-12 follow-up)

Visible application copy excludes the previous project/network brands. Signed
EIP-712 domain/type/purpose, actual network configuration, HTTP header names,
wire keys, and real explorer/faucet destinations remain unchanged. MetaMask's
external signature prompt may display the existing protocol domain; do not
mutate signed data merely to alter its display. Legacy local exports use
`midnight-proof.json`, while the old import extension stays compatible.
This supersedes historical `.gasok-proof` export-name instructions above only;
privacy handling and file validation remain unchanged.
