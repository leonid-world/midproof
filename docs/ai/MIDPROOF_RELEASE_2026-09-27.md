# MidProof submission release — 2026-09-27

Status: **source publication and local acceptance complete; public wallet-free
activation pending**. Local evidence does not certify the public Preview path.

## Owner approval

The owner approved a separate public `leonid-world/midproof` repository,
wallet-free synthetic hosted demo, isolated local clone-and-run runtime and
publication to existing Vercel/Railway services. Preserve existing GASOK source,
database, wallet and contract state. See ADR-024.

## Evidence obtained

- Public GitHub source published at commit
  `996d5dea961ff1bd9a1e2589aeb11b3c43476bfa`; repository is public and includes
  the `midnightntwrk` topic and public demo website link.
- Four application repositories copied as ordinary directories, including
  current uncommitted security fixes; baseline commits recorded.
- Original reference harness: 126 entries / 37 project pins PASS. The optional
  community reference checkout is not bundled in the submission.
- Isolated local EVM: existing Solidity contracts compiled, deployed, and
  synthetic 1,000/900 fixture created, Buyer-verified and tokenized.
- EVM restart/recreate reused the same contract and fixture, with no new
  transaction. Original GASOK state was not mounted.
- Spring120, Vue286, Midnight506 and root62 automated checks: 974 distinct
  passes. UI lint, local/hosted frontend production builds and four Midnight
  workspace builds passed. These are not a substitute for chain acceptance.
- Independent review resolved the UI's nested gateway-error envelope mismatch
  and definite pre-submission crash recovery; no remaining source blocker found.
- All four local outcomes passed through both authenticated HTTP and the actual
  Vue browser flow. Complete-stack restart retained all four HTTP results with
  identical transaction IDs/blocks and no reproof. Browser reload also recovered
  its original run and transaction. See
  [local validation](LOCAL_DEMO_VALIDATION_2026-09-27.md).
- Anonymous HTTPS clone, updated to `7492d13dd2129bbefab99510b3ab594d033c8166`,
  built all three images with no author ignored files or submodules. One Compose
  command initialized fresh independent volumes, accounts, keys and contracts.
  Seller/Buyer × true/false actual proofs passed; full-stack restart retained
  all four transactions and independent results. No manually prepared .env,
  faucet, account or wallet was needed. Build/image caches were available.
- Existing Railway app deployed successfully as
  `9bc10a87-ed08-4830-91e1-bba8fd0406d8` from that source, with overlap0/draining30.
  `/health` and `/ready` pass on the same Preview contract
  `bfb760db44f9ee7996ef12c47e56346903c654aede7d65c3c88110214c932a1e`.
  Dedicated hosted fixture is not yet installed, so walletlessDemo is deliberately
  disabled. Hosted auth smoke passed: demo login and identity lookup succeed;
  the scoped demo session cannot access ordinary receivables (403).
- Vercel deployment `dpl_8Ms7AXf6vpQRQnw3Bs47BW6bHDDN` from the corrected
  frontend is READY, built with `--skip-domain`. The public `midproof.vercel.app`
  alias still serves its prior version until the hosted fixture is ready.
- Browser testing found that real Midnight transaction IDs have a `00` version
  byte plus 64 hex characters. The UI initially accepted only 64 hex; fixing the
  boundary preserves the complete actual ID and needs no new proof submission.
  The fix is public in `7492d13`; four actual response fixtures cover the boundary.
- The separate Preview fixture preparer has 32 regressions for signed-transaction
  journal recovery, exact context/roles/terms, receipt/canonical state checks,
  nonce continuity, bounded gas and owner-only atomic storage. Its inspection
  reports the new dedicated wallets still need free test gas; no fixture
  transaction has been submitted. Existing MetaMask keys are not used.

## Acceptance checks pending

- Hosted GIWA fixture using separate synthetic-role keys and free test gas.
- Secure fixture installation, hosted activation and public browser proof/recovery.
- Promote the prepared Vercel frontend; connect future deployment to the new
  repository's main branch and giwa-ui root directory.

The official Nodit faucet requires reCAPTCHA. A user confirmation request is
pending because browser automation requires consent at the CAPTCHA action.
The faucet form contains only the new public synthetic seller address.

The 2026-09-18 funding/repayment rehearsal is a separate historical flow; this
review demo does not silently complete it. No hackathon submission form has been
submitted by this work.
