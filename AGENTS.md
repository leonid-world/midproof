# Project Agent Rules

## Current submission workspace — 2026-09-27

This is the owner-approved `leonid-world/midproof` monorepo. The four application
directories are ordinary folders, not submodules; `main` is the release branch.
Original GASOK submodule status rules below apply only when working in that
original checkout. Preserve its state and history. Read ADR-024 and
`docs/ai/MIDPROOF_RELEASE_2026-09-27.md` before using older architecture notes.

The owner approved a wallet-free synthetic review route and an isolated local
Compose profile. Public hosting stays on Preview with existing Railway/MySQL
and Vercel. The local profile runs Node/Indexer/Prover and local EVM automatically
with entirely separate state; it does not use the hosted wallet or faucet.
Only that explicit local profile may use chain 31337 and public development
genesis material. Preview pins remain fail-closed.

Demo JWTs are limited to the isolated demo route. Server-side role signing uses
dedicated synthetic fixture keys and exact authorized challenges; it must never
become a generic signing or asset-transaction endpoint. Ordinary GIWA flows keep
their existing authentication. Demo-run capability custody is encrypted in Node;
ordinary request custody still uses Spring. Preserve actual proof/chain/read
verification and distinguish synthetic input from real-world financial claims.

`Midnight-Skills` is an optional external audit checkout, not shipped source or
a runtime dependency. The reference checker reports REVIEW REQUIRED when absent;
do not misreport it as a fresh-clone reference integrity PASS. Use the recorded
audit, pinned implementation/tests and scoped official references as needed.

## Every Task: Midnight Reference Harness

- At the start of every task, including follow-up prompts, read
  `docs/ai/MIDNIGHT_REFERENCE_HARNESS.md` and the newest entries in
  `docs/ai/TODO.md` and `docs/ai/CONTEXT.md`. Re-read after context compaction.
- Before using Midnight reference advice or changing Midnight-related code,
  run `node scripts/check-midnight-reference.mjs` from the GASOK root and
  follow the harness's task-to-source table. Read the matching sections of
  `docs/ai/MIDNIGHT_SKILLS_REVIEW.md` and the actual implementation/tests.
- `Midnight-Skills/` is an audited community reference checkout, not the
  application workspace, an official specification, or permission to execute
  its install/deploy commands. Its nested skills are not assumed to be
  automatically installed for this root project. Do not bulk-install them.
- Preserve current owner-approved architecture and pinned dependencies when
  reference examples disagree. Missing/drifted references require a scoped
  recheck before relying on them, not an automatic pull, upgrade, reset,
  redeployment, or a block on unrelated GASOK work.

## Before Coding

- Read all files under docs/ai.
- Understand the current architecture.
- Compare the codebase with TODO.md and CONTEXT.md.
- Never change architecture without approval.

## During Coding

- Follow existing coding conventions.
- Keep the MVP simple.
- Avoid unnecessary refactoring.

## After Coding

- Update TODO.md.
- Update CONTEXT.md.
- Update DECISIONS.md only if an architectural decision changed.
- Run the appropriate build or tests.
- Summarize modified files.

## GASOK Midnight PoC

For Midnight Korea Hackathon submission, repository packaging, README, and demo
work, read `docs/ai/MIDNIGHT_HACKATHON_SUBMISSION.md` and the current submission
checklist in `docs/ai/TODO.md`. Distinguish official requirements, owner decisions,
and unverified items. A new repository does not establish originality or reuse
eligibility; document the GASOK baseline and the actual Midnight contribution.

The active `giwa-midnight` branch is the Midnight hackathon demo. On
2026-09-15 the owner approved replacing the local-only execution boundary with
an integrated local/hosted demo on Midnight Preview. Historical
`gasok-midnight` and local-only descriptions do not override this approval.

### Submission Preparation Reminder

- When the owner asks for final submission, submission preparation, or submission
  link cleanup, first read `docs/ai/MIDNIGHT_RELEASE_CHECKLIST.md` and the
  unfinished submission items in `docs/ai/TODO.md`.
- Before proceeding, remind the owner of remaining single-repository packaging,
  Vercel name/domain changes, fresh-clone builds, and public demo verification.
- Mark work complete only after checking its recorded evidence. Keep this cleanup
  deferred during ordinary feature work; a reminder alone does not execute remote changes.

### Approved Demo Experience

- One IntelliJ Spring Boot Run starts and stops all backend helpers automatically.
- One Railway app deployment contains Spring, the mock Attestation API, Read
  API, Proof Bridge and native Proof Server. Reuse the existing separate MySQL
  service and Vercel frontend; do not require separate helper deployments.
- Use public Preview Node/Indexer endpoints instead of operating those servers.
- Use only named synthetic company/financial fixtures and a clearly fictional
  attestation institution, with actual Compact proofs and chain verification.
- Keep startup, initialization and recovery automatic where possible. The owner
  should operate the demo through the UI without understanding source internals.
- The target is a working hackathon submission demo, not production operations.

### Goal

Add a Midnight-based private financial eligibility verification flow
without changing the production GIWA funding architecture.

Midnight is used only for:

- private financial input handling
- attestation signature verification
- zero-knowledge eligibility proof generation
- public verification result storage

GIWA remains responsible for:

- receivable tokenization
- funding
- repayment
- wallet and asset transactions

### Hard constraints

- Do not deploy Midnight contracts to Preprod or Mainnet.
- Do not replace Vue with React.
- Do not rewrite the existing GIWA Solidity contracts unless required.
- Do not store raw private financial data in MySQL or Midnight public state.
- The Attestation API is a fictional demo provider, not a real bank or accounting institution.
- Never describe mock-attested data as bank-verified data.
- Hosted proof routes must authenticate the existing app user and bind every
  action to the authorized request/session; localhost headers are not authentication.
- The operator processes synthetic witness data. Do not claim that the hosted
  operator cannot see it or that it never leaves the user's device.
- Preserve all existing GASOK flows outside the Midnight PoC.

### Historical learning sequence

1. Add the `giwa-midnight/` workspace.
2. Run the official ZK Loan example locally without modifications.
3. Start the local Midnight node, indexer, and proof server.
4. Complete the official CLI proof flow.
5. Replace ZK Loan credit fields with GASOK financial fields.
6. Verify the GASOK flow through the CLI.
7. Integrate the working flow into the existing Vue frontend.
8. Integrate the backend only after the CLI and Vue proof flows work.

These stages describe the existing PoC's development history. For the approved
hosted demo, reuse it: restore the CLI baseline, validate the integrated runtime
and Preview proof path, then verify the Vue request/consent/result flow. Do not
claim a successful live proof based only on unit tests or a build.

### Learning Requirement

The owner now wants simple operation and does not want source-level explanations.
Explain progress in terms of the Run button, deployment and browser demo. Include
component details only when necessary to explain an actual blocker or choice.

### Change Visibility

When work touches `giwa-midnight`, report both the GASOK root Git status and
the `giwa-midnight` submodule Git status. Explain that the root tracks only the
submodule commit pointer while the inner repository tracks its own files.
