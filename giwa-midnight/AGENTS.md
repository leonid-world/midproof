# GASOK Midnight Workspace Instructions

Current packaging (2026-09-27): this directory is ordinary source inside the
MidProof monorepo, not a submodule. Parent ADR-024 approves a limited wallet-free
synthetic demo route and isolated Local Devnet/EVM Compose profile. Preserve
Preview pins and ordinary request authorization. Report monorepo status here;
the historical submodule reporting requirement below applies to original GASOK.

## Reference Harness

When working inside the GASOK checkout, read `../AGENTS.md`,
`../docs/ai/MIDNIGHT_REFERENCE_HARNESS.md`, and the latest parent TODO/CONTEXT
at the start of every task, including follow-ups. Run
`node ../scripts/check-midnight-reference.mjs` before applying Midnight advice.
The adjacent `../Midnight-Skills/` is community reference material; use only
the task-matched sources through the parent harness. Do not install its whole
skill collection or adopt its Preprod/React/version defaults.
If this repository is opened as a standalone clone without the parent harness,
report that limitation and follow the scope below; do not invent those files.

## Scope

The historical privacy proof-of-concept uses the `undeployed` network. The owner
approved a synthetic-data-only hosted hackathon demo on `preview` on 2026-09-15.
That mode uses a custodial demo wallet and mock financial fixtures, with
authenticated request-bound proof sessions. Real financial data, Preprod, and
Mainnet remain outside this scope. Do not introduce React, modify GIWA Solidity contracts, or
persist raw financial data in MySQL or Midnight public state.
Preserve the initialized wallet, encrypted state and deployment; create a fresh
identity only for an explicitly intended new isolated demo environment.

## Historical Baseline Order

The steps below record the original learning sequence. They do not require
recreating a chain or replacing the approved integrated Preview runtime on
every task. Preserve the existing CLI baseline and verify the affected flow.

1. Reproduce the official Midnight ZK Loan example unchanged.
2. Compile the Compact contract.
3. Run the local Node, Indexer, and Proof Server.
4. Complete the official CLI flow.
5. Only then map loan fields to GASOK financial eligibility fields.
6. Verify the GASOK flow through CLI before Vue integration.

## Learning Requirement

The owner wants one Spring Run, one integrated Railway deployment, and a browser
demo. Explain progress in those terms. Include source-level details only when
necessary to explain an actual blocker or choice, as required by the parent's
2026-09-15 approval.

## Privacy Rules

- The Attestation API is mock-only and must never be described as bank-verified.
- Keep provider private keys, mnemonics, raw financial inputs, signatures, and
  local private state out of Git, logs, MySQL, and public ledger state.
- Publish only the approved opaque result key, eligibility/provider/version/time
  metadata and public admin/provider/deployment control state. Consult the parent
  harness and contract schema before changing disclosure; raw financial values
  and the correlation-sensitive capability are not public ledger fields.

## Change Visibility

At the end of every task, report this repository's `git status --short --branch`
and tell the owner that the parent GASOK repository records only this
submodule's commit pointer.
