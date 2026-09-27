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
