# Recording role demo — 2026-09-27

Status: implementation, automated checks, independent review and public
role-login/wallet-pin acceptance passed.

The owner requested three recording-only role shortcuts below the existing
walletless Demo Start. Ordinary GIWA transactions remain signed by MetaMask;
the live-presentation Midnight-only flow remains walletless.

## Existing identities

All three hosted ordinary logins and `/wallet/me` reads returned200 before any
change. The registered addresses match `scripts/prepare-midnight-demo.mjs`:

| Role | Existing public demo account | Fixed GIWA Sepolia address |
| --- | --- | --- |
| Seller | seller@midnight-demo.test | `0x60602ed43987ea474a85c12a4e768dc8062b4361` |
| Buyer | buyer@midnight-demo.test | `0xf0aa8d7ca5c7e3e586dcc40397147ac98e3717bb` |
| Funder | funder@midnight-demo.test | `0x3dc823dc2c1caf3c14b5b882c7e9a80cc40df9b7` |

The chain is91342. Company IDs are resolved from the existing users, not pinned
to assumed database numbers. Existing intentionally public demo login values
are reused. Wallet signing keys and browser-extension state are not accessed.

## Validation scope

- Original reference integrity checker: PASS126entries. No Midnight source,
  dependencies, circuit, contract or encrypted wallet state changed.
- Backend wallet/auth regressions:18tests across5classes passed, including8new
  checks for exact role pins, wrong address/network rejection without writes,
  company ownership, reserved addresses, disabled mode and walletless denial.
- Backend `bootJar` passed; no real application runtime was started for tests.
- Frontend full suite:339tests across38files passed on Node22.21.1. Production
  build with recording enabled, full read-only ESLint/Oxlint and diff checks passed.
  Coverage includes all three entries, fixed-wallet mismatch/missing registration,
  failure rollback, newer-session preservation, wrong pending wallet guidance,
  wallet clearing and delayed MetaMask responses after an account change.
- Independent review found no blocking defect. Local1280×720 visual inspection
  showed the three role buttons immediately below Demo Start, all visible without
  scrolling and no horizontal overflow.
- Existing Railway `RECORDING_DEMO_ENABLED=true` was staged with `--skip-deploys`,
  then enabled by the source deployment. Vercel activation followed server checks.

## Public rollout and browser acceptance

- Implementation commit: `98e3c6fadb06b91fce1e3a1793ccc91016735650`.
- Existing Railway deployment: `86ac953d-f4a8-4a71-8a79-390663be80c5`, SUCCESS.
- Existing Vercel production deployment: `dpl_7VXAzJNQsbXR5SKaYwTzxQeFScAF`, Ready,
  serving `https://midproof.vercel.app` with the recording flag enabled.
- Server verification preceded UI activation. Each of the three ordinary logins
  succeeded; trying another role's already-reserved address returned409 with
  `ROLE_DEMO_WALLET_MISMATCH`. A subsequent wallet read preserved the original
  mapping. No wallet address or network was changed by these checks.
- The public browser displayed the three buttons below Demo Start. Clicking each
  role opened the ordinary dashboard with its correct email, fixed wallet and
  enabled GIWA menus. Login did not call MetaMask. Logging out and changing roles
  displayed the new role's address. Funder's funding list also loaded successfully.
- The preserved historical high-amount receivable remains blocked by the existing
  small-demo issuance policy. No old data was rewritten to make it fundable.
- Returning to Demo Start opened the original walletless screen; company,
  editable criteria and consent controls became enabled without MetaMask.
- Backend `/ready` returned200/proofReady=true. Authenticated walletless config
  stayed enabled on Preview contract
  `bfb760db44f9ee7996ef12c47e56346903c654aede7d65c3c88110214c932a1e`.
- Final public1280×720 screenshot confirms the first-screen button layout.

Later documentation-only commits can redeploy identical application code through
the existing Git connections. The application acceptance above is for98e3c6f.

No GIWA financial transaction or new Midnight proof is required or claimed by
these login checks. Full historical funding/repayment rehearsal remains a
separate scope. Work is in the MidProof monorepo; original GASOK and its dirty
submodule worktrees are preserved.

## Follow-up: Profile logout freeze

The owner found that logout from **내 정보 / Profile** froze the browser when
switching recording roles. The earlier browser checks above logged out through
Dashboard and did not cover Profile. MetaMask was not the cause of this loop.

Root cause: logout increments the auth generation; App keys RouterView by that
generation, so it remounted the still-current Profile before asynchronous
navigation completed. Profile saw a missing user and logged out again. Forced
generation increments even for an already-null token repeated the cycle.

Before the fix, real App + Pinia auth/wallet stores + Profile + memory-router
tests failed for all three roles (nine logout calls, stopped by a bounded test
guard). The repeated-null session test also failed. API responses alone were
mocked; the app shell, auth session and routed pages were real components.

The fix prevents a protected page from remounting without authentication and
does not re-invalidate an already-empty session. Non-null login still invalidates
previous work even when the token string is unchanged. An existing mocked proof
polling test was corrected to establish an authenticated session before testing
logout; it had previously started anonymous and depended on forced null resets.

The app also redirects protected routes to login when another tab clears the
session. A separate regression reproduced the blank protected route before this
redirect and passes afterward. Final checks passed all347tests/40files,
recording-enabled production build, full read-only ESLint/Oxlint and diff checks.

Public acceptance after deploying implementation
`b509f27510c28a5cc5deab9f62a8497b698316ca`:

- Vercel `dpl_2M7TZPrzAFA8BxfWVgw3bA1Nn5hH` Ready on
  `https://midproof.vercel.app`; Railway
  `08c349e5-458b-4050-84eb-b5c81be36450` SUCCESS. Both commit statuses succeeded.
- In the public browser, Seller → Buyer → Funder → Seller each opened Profile
  with the correct account and logged out to the login screen without freezing.
- Funder's Dashboard logout returned to login. Walletless Demo Start → Exit →
  Demo Start succeeded; company/criteria/consent controls became enabled.
- With Seller Profile open in one tab and Dashboard in another, Dashboard
  logout returned **both tabs** to login. No blank protected screen remained.
- Browser captured error/warning logs were empty. Backend `/ready` returned
  `{"proofReady":true,"stage":"ready"}` after deployment.

No MetaMask permission, wallet signing or financial transaction was performed.
Documentation-only commits after b509f27 may redeploy identical application code.
