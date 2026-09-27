# MidProof submission release — 2026-09-27

Status: **implementation and live verification in progress**. Evidence is added
as obtained; README's intended workflow does not certify every acceptance check.

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
- Spring120, Vue286, Midnight506 and root30 automated checks: 942 distinct
  passes. UI lint, local/hosted frontend production builds and four Midnight
  workspace builds passed. These are not a substitute for chain acceptance.
- Independent review resolved the UI's nested gateway-error envelope mismatch
  and definite pre-submission crash recovery; no remaining source blocker found.
- First actual local Seller/A proof finalized and independently read; all four
  outcomes then passed via HTTP, and complete-stack restart retained all four
  results with identical transaction IDs/blocks and no reproof. See
  [local validation](LOCAL_DEMO_VALIDATION_2026-09-27.md).
- Anonymous HTTPS clone of that public commit built all three images, with no
  author ignored files or submodules. New-volume startup is a separate next check.
- Existing Railway app deployed successfully as
  `9bc10a87-ed08-4830-91e1-bba8fd0406d8` from that source, with overlap0/draining30.
  `/health` and `/ready` pass on the same Preview contract
  `bfb760db44f9ee7996ef12c47e56346903c654aede7d65c3c88110214c932a1e`.
  Dedicated hosted fixture is not yet installed, so walletlessDemo is deliberately
  disabled and the existing Vercel frontend is still unchanged.
- Browser testing found that real Midnight transaction IDs have a `00` version
  byte plus 64 hex characters. The UI initially accepted only 64 hex; fixing the
  boundary preserves the complete actual ID and needs no new proof submission.

## Acceptance checks pending

- Local browser Seller/Buyer × A/B actual proofs and independent chain results.
- Hosted GIWA fixture using separate synthetic-role keys and free test gas.
- Anonymous fresh clone: actual fresh-volume runtime and proof after image build.
- Existing Vercel/Railway deployment and public browser proof verification.

The 2026-09-18 funding/repayment rehearsal is a separate historical flow; this
review demo does not silently complete it. No hackathon submission form has been
submitted by this work.
