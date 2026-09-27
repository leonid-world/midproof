# Recording role demo — 2026-09-27

Status: implementation, automated checks and independent review passed;
public rollout pending.

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
- Existing Railway `RECORDING_DEMO_ENABLED=true` was staged with `--skip-deploys`.
  Vercel activation remains pending until the server guard is deployed.

No GIWA financial transaction or new Midnight proof is required or claimed by
these login checks. Full historical funding/repayment rehearsal remains a
separate scope. Work is in the MidProof monorepo; original GASOK and its dirty
submodule worktrees are preserved.
