# Codex Workflow

Every task, including follow-up prompts

- Follow root AGENTS.md and read [MIDNIGHT_REFERENCE_HARNESS.md](MIDNIGHT_REFERENCE_HARNESS.md).
- Read the latest TODO/CONTEXT entries. For Midnight work, run
  `node scripts/check-midnight-reference.mjs`, then read task-matched source,
  tests and [the comparison](MIDNIGHT_SKILLS_REVIEW.md).
- Treat Midnight-Skills as audited community reference, not automatic commands.

Before coding

- Read every file under docs/ai.
- Analyze repository.
- Compare code with TODO.
- Report implementation plan.

After coding

- Update TODO.md.
- Update CONTEXT.md.
- Update DECISIONS.md if architecture changed.
- Run build.
- Run tests if available.
- Report modified files.

Rules

- Never store private keys.
- Never refactor architecture without approval.
- Follow existing coding conventions.
- Keep MVP simple.
- Do not add unnecessary abstractions.
- For GIWA asset transactions, backend never signs and frontend uses MetaMask.
  The approved Midnight synthetic demo has a custodial operator wallet for
  Midnight proof transactions. MetaMask authorizes only the GIWA role consent
  in that proof flow; preserve this scoped distinction.

Midnight v2 review checklist

- Treat the Funder's values as public criteria, never as Seller/Buyer facts.
- Keep Seller/Buyer financial facts transient; never persist them in Vue,
  Spring/MySQL, logs, URLs, or Midnight public state.
- Keep request ID, Funder audience, criteria, deadline, GIWA context, deployment,
  Provider, and freshness cryptographically bound end to end.
- Do not add a product PIN or raw capability JSON handoff. The Bridge owns the
  request-scoped nonce; Vue hands the capability directly to Spring.
- Persist a finalized capability in the encrypted local outbox before exposing
  completion; ACK/delete it only after Spring durably reports `SUBMITTED` or
  the idempotent already-`COMPLETED` state.
- Retry Read API/Indexer lag without replaying the proof. Permanent invalid
  capability means `FAILED`, envelope purge, and active-request release.
- Do not add v1 fallback to a v2 request. Legacy `/v1` and
  `/midnight/legacy/*` paths are diagnostics only.
- Never describe a Mock Provider result as bank/accounting verification,
  GIWA Funding approval, or an automatic Funding gate.
- Preserve one-active-request mitigation and document that adaptive-query
  budgets/templates/cooldowns are still required.
- Report both root and `giwa-midnight` Git status when Midnight is touched.
