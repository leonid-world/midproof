# Isolated local demo validation — 2026-09-27

Status: **four real proofs and full-stack restart passed; fresh-clone acceptance
in progress**. This is actual Local Devnet evidence, not Preview or public-site
verification. The original GASOK directory, database, wallet and Railway state
were not mounted or started.

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

After rebuilding the final application and frontend, all four requested paths
completed through the actual authenticated web proxy and independent Indexer:

| Role / fixture | Eligible | Transaction | Local block |
| --- | --- | --- | --- |
| Seller / steady | true | `0077a89722c15d05767edb97a2ef3efcd32b62d314d3e4fb371b873727fbd1562b` | 143 |
| Seller / stretched | false | `0058cf45b70ed17947876bffe5267ad5fe7f0e105411f440da5a876bb16b227e22` | 147 |
| Buyer / steady | true | `00be791178931b839f176192653999b708b23f0a466d74aa91fbf6946a13b9e331` | 151 |
| Buyer / stretched | false | `00393e6d271dbba48989481fa3c49d1e91f94535ec795d5fb7a03a5534cd26bd20` | 155 |

Every result used Provider 2. The same HTTP harness verified missing consent
returns 400, the demo JWT cannot access `/receivables` (403), a fresh session
cannot recover a prior session, a different same-role session cannot read a run
(403), and replaying the same start input returns the same run and transaction.

The complete Compose stack was stopped, including MySQL, Anvil, Midnight Node,
Indexer, application and web. It was brought back using the same named volumes
and the final image containing license notices. The harness retained JWTs only
in memory across that downtime; all four status and recover calls returned the
same eligible values, transaction IDs and block heights after restart. These
calls perform independent result resolution. No proof was resubmitted and the
Midnight contract and GIWA fixture addresses stayed unchanged.

The subsequent browser check exposed a frontend response-validation issue:
Ledger 8.1 returned a 66-character `00`-prefixed transaction ID, while the UI
accepted only 64-character IDs. The real four public responses above reproduced
the rejection without creating another proof. They are now regression fixtures;
the parser preserves the complete Ledger ID and rejects malformed metadata.
Backend proof results were already complete and were retained during the fix.

## Automated checks

- Root runner/fixture/local-profile checks: **16/16 pass**.
- Local Solidity build: **26 files compiled**.
- Integrated Docker local-demo image and final frontend: builds passed (four
  Midnight workspaces plus Spring bootJar). The final runtime includes upstream
  notices and licenses.

## Anonymous fresh clone

An HTTPS clone with credential helpers and extra authentication headers disabled
retrieved public commit `996d5dea961ff1bd9a1e2589aeb11b3c43476bfa` into a new
temporary directory. Git status was clean; the checkout was approximately
38 MB. It had no developer ignored files or prior runtime volumes. Build and
actual new-volume startup are being checked separately from the first stack.

## Remaining acceptance checks

- Browser Seller/Buyer × steady/stretched true/false through the new route.
- Actual fresh clone with no author ignored files and independent new volumes.
- Public Preview/site verification is a separate report and not implied here.
