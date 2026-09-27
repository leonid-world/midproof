# Historical Midnight learning notes

The implementation workspace is `giwa-midnight/`. These are historical local
PoC notes. The owner's 2026-09-15 approval in the root AGENTS.md and ADR-023
supersedes local-only execution restrictions for the integrated synthetic Preview
demo. Do not add a second implementation in this legacy directory.

# Midnight Workspace Instructions

This workspace is a local-only Midnight ZKP proof-of-concept.

## Development model

- Compact contracts define verification circuits.
- Witness implementations provide private inputs locally.
- The Attestation API signs mock financial data.
- The Proof Server generates ZK proofs locally.
- The Midnight Node validates transactions.
- The Indexer provides public state queries.
- The CLI is the primary integration and debugging tool.

## Implementation rules

- Begin from the official Midnight ZK Loan example.
- Keep the original example working before domain modifications.
- Make one domain mapping change at a time.
- Use the local `undeployed` network.
- Use Docker Compose for node, indexer, and proof server.
- Do not require Lace Wallet during the initial CLI phase.
- Do not introduce React into GASOK.
- Vue integration happens only after the CLI flow succeeds.
- Keep provider secret keys in ignored `.env` files.
- Never commit private keys, mnemonics, private financial data, or generated local state.
- Do not expose private inputs through logs.
- Store only eligibility result, provider identifier, timestamps, and commitments publicly.

## Trust boundary

The Mock GASOK Attestation Provider only demonstrates signed-data flow.

It does not prove that financial data came from:

- a real bank
- a tax authority
- an accounting firm
- an ERP provider

Midnight verifies the provider signature and circuit execution.
It does not independently verify real-world data truth.
