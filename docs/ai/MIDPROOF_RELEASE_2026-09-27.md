# MidProof submission release — 2026-09-27

Status: **implementation and live verification in progress**. Evidence is added
as obtained; README's intended workflow does not certify every acceptance check.

## Owner approval

The owner approved a separate public `leonid-world/midproof` repository,
wallet-free synthetic hosted demo, isolated local clone-and-run runtime and
publication to existing Vercel/Railway services. Preserve existing GASOK source,
database, wallet and contract state. See ADR-024.

## Evidence obtained

- Public GitHub repository created under `leonid-world`.
- Four application repositories copied as ordinary directories, including
  current uncommitted security fixes; baseline commits recorded.
- Original reference harness: 126 entries / 37 project pins PASS. The optional
  community reference checkout is not bundled in the submission.
- Isolated local EVM: existing Solidity contracts compiled, deployed, and
  synthetic 1,000/900 fixture created, Buyer-verified and tokenized.
- EVM restart/recreate reused the same contract and fixture, with no new
  transaction. Original GASOK state was not mounted.
- Spring120, Vue273, Midnight506 and root30 automated checks: 929 distinct
  passes. UI lint, local/hosted frontend production builds and four Midnight
  workspace builds passed. These are not a substitute for chain acceptance.
- Independent review resolved the UI's nested gateway-error envelope mismatch
  and definite pre-submission crash recovery; no remaining source blocker found.
- First actual local Seller/A proof finalized and independently read; all four
  outcomes and restart checks continue in the separate local validation record.

## Acceptance checks pending

- Local browser Seller/Buyer × A/B actual proofs and independent chain results.
- Local restart/reload recovery with persisted state.
- Hosted GIWA fixture using separate synthetic-role keys and free test gas.
- Publish verified source; anonymous fresh clone and documented Compose command.
- Existing Vercel/Railway deployment and public browser proof verification.

The 2026-09-18 funding/repayment rehearsal is a separate historical flow; this
review demo does not silently complete it. No hackathon submission form has been
submitted by this work.
