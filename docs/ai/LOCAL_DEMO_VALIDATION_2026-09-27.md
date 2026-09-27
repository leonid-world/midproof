# Isolated local demo validation — 2026-09-27

Status: **in progress**. This is actual Local Devnet evidence, not Preview or
public-site verification. The original GASOK directory, database, wallet and
Railway state were not mounted or started.

## Environment and automatic setup

- Source: new single-repository worktree `/Users/leonid/projects/blockchain/midproof`.
- Compose project: `midproof-review-20260927`, all volumes initially new.
- Browser target: `http://localhost:25173` (`MIDPROOF_WEB_PORT=25173`).
- Docker build: Node 22.21.1, Solidity 0.8.24, existing contracts unchanged.
- EVM: Anvil 1.8.3, chain 31337; image digest
  `sha256:2e4287278639262de76db72477301d5d3212fa1b1cce710d7d148750a46ce9e7`.
- Midnight: Node 1.0.0, Indexer 4.3.3, native Prover 8.1.0, network `undeployed`.
- Empty MySQL initialized with eight tables using CREATE-only SQL; three
  synthetic demo accounts created through normal signup.
- Fresh local actor keys generated into a private Docker volume. Five actual
  EVM transactions deployed MockKRW/Finance and created/verified/tokenized the
  1,000/900 mKRW fixture, onchain receivable 1.
- EVM Finance: `0xdfba316ecb79cc86743faed3063a6e8fa582d025`.
- Anvil restart/recreate plus bootstrap rerun retained the same fixture and
  receipts. A further rerun kept EVM block number 5→5, proving no new transaction.
- Local Midnight public genesis wallet synchronized, prepared DUST, deployed
  Compact and registered Provider 2 without a faucet or MetaMask.
- Midnight contract:
  `4c10fb3025426672f9dc39540564ff93fd417e8a1588a966188985b318f21886`.
- `/ready` returned `{"proofReady":true,"stage":"ready"}`.

First startup downloaded proof parameters from the official SRS host into the
new cache volume. One startup issue was a checksummed EVM address where the
strict fixture format requires lowercase; the preparer now normalizes addresses.
The same local identity and transactions were preserved during that correction.

## Actual proof via authenticated HTTP

The check obtained a limited `/auth/demo-login` JWT in memory and confirmed it
receives HTTP 403 from `/receivables`. It started and polled the new demo route;
no token, signer key or witness was printed.

| Role / fixture | Result | Evidence |
| --- | --- | --- |
| Seller / steady | **completed, true** | Real native proof, local Midnight finalization, independent Indexer result |

Seller run:
`0x07ba026a09ea699198e9b0cfbb1f2dbf46605f2514fd16453faee2a7f4c12a9c`.
Transaction:
`006382eafa323d8991cc92d6e432fb97a86b6dbe6d1be33e7639cce69191709a24`,
local block **91**. Native eligibility proving took approximately 2.30 seconds;
transaction finalization and Indexer visibility are additional time.

## Automated checks

- Root runner/fixture/local-profile checks: **16/16 pass**.
- Local Solidity build: **26 files compiled**.
- Integrated Docker local-demo image: build passed (four Midnight workspaces
  plus Spring bootJar); it will be rebuilt after concurrent final source edits.

## Remaining acceptance checks

- Final app/web rebuild from the completed implementation.
- Browser Seller/Buyer × steady/stretched true/false through the new route.
- Complete stack restart and recover/requery without proof resubmission.
- Actual fresh clone with no author ignored files and independent new volumes.
- Public Preview/site verification is a separate report and not implied here.
