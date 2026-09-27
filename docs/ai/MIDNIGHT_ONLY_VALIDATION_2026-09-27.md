# Midnight-only demo acceptance — 2026-09-27

This records the owner-directed ADR-025 correction. The earlier EVM-backed
validation is historical. No GIWA test ETH, MetaMask, receivable, mKRW, funding,
or operator faucet preparation is required for this version.

## Source and checks

- Public implementation commit: `e2aa5542b889d5e5d2a47280856c78216379394a`.
- Four Midnight workspace builds and complete CLI typecheck passed.
- Midnight TypeScript tests: 524 passed; one existing live-only suite excluded.
- Separate Compact artifact guard: 5 passed. Root runner/local/account tests: 36 passed.
- Spring full 120 and UI full 286 passed for the initial walletless implementation;
  Spring source is unchanged by this correction. Changed Vue view: relevant 29,
  lint and local/hosted production build passed again.
- Independent review found no remaining blocker. New tests cover zero GIWA RPC
  calls for all four synthetic Provider scenarios, actual EIP-712/Schnorr checks,
  exact independent-read binding, ordinary-route rejection, encrypted identity
  reuse, malformed/missing identity fail-closed behavior and legacy state retention.

## Local five-service runtime

Fresh project `midproof-synthetic-20260927`, loopback 25175, has database,
Midnight Node, Indexer, integrated app/Prover and web only. There are four new
named volumes. No EVM service or mounted GIWA fixture file exists. GIWA RPC is
set to `http://127.0.0.1:1`; local circuit binding uses chain 31337 and a dummy
0x111… address, which is not a deployed contract. The synthetic subject is a
reserved identifier, not an actual receivable. Login accounts and encrypted
internal authentication keys are prepared automatically.

Midnight contract: `c5e85c92dc23b0fb09dd959405d2fbe9704242fa1b87bdc95aa477302c7516c1`.

| Role / scenario | Eligible | Actual transaction | Local block |
| --- | --- | --- | --- |
| SELLER / steady | true | `00a98ed0c66750141c68b69d406931bba03390c1b5aa27b207a1eccd4ec89afe65` | 15 |
| SELLER / stretched | false | `00a14360fe54a54bd8d46d87a051daaaa183948a1173f4dd6d1180d5908e0c13d2` | 19 |
| BUYER / steady | true | `00be53f8cf7c812fe7e6165e1704a0d120e1c4e0c90a0d0570462663546b30ec36` | 23 |
| BUYER / stretched | false | `00727b003009d263417452419d7d9fa1517a191fa975f928b84f6bb4e681cfbf2e` | 27 |

All four authenticated HTTP proofs completed and were independently resolved.
After rebuilding the final image and stopping/starting the entire stack, the
same JWT sessions returned identical results from four status and four recover
calls. No reproof occurred. Missing consent, cross-session access, ordinary
asset-route denial and idempotency checks also passed.

## Anonymous final source clone

The existing clean anonymous checkout fast-forwarded 7492d13→e2aa554 with Git
credential helpers/extra authentication headers disabled. It built both images
and started a new five-service/four-volume project on loopback 25176 without
manual .env, account, key, wallet, fixture, EVM or faucet setup. Build caches were
available. Checkout stayed clean after execution.

The fresh clone independently completed Seller/steady=true:

- Midnight contract: `93c71064ff91b8fad2e414d14df27dd13a1e2182deaca2639a6f2462187e0e5f`.
- Transaction: `00e7ba8840f809bbe5ba5d6ba81b1070a3cb9cc577d31443ea065c65d55d4c6710`; block 14.
- Consent denial, cross-session denial, asset-route denial and request idempotency passed.

The clone-only stack was stopped after validation; its volumes were preserved.
The 25175 review stack remains available. Earlier 25173/25174 state is preserved.

## Public Preview rollout

- Existing Railway app deployed source e2aa554 as 7f52b80a; after connecting the
  same service to `leonid-world/midproof`, branch main, Git deployment
  `bac84ef1-d645-4c63-b1e1-ded84d876c84` reached SUCCESS and ready.
- Existing Preview contract remains
  `bfb760db44f9ee7996ef12c47e56346903c654aede7d65c3c88110214c932a1e`.
  Existing wallet, Provider, MySQL, migration journal and data volume remain.
- Public config reports walletlessDemo.enabled=true. No role fixture upload,
  GIWA gas transfer, receivable creation or contract migration was performed.
- Vercel `dpl_DPQZgXXyC87BVvZSEZSdvXgK8sah` is promoted to midproof.vercel.app.
  Existing project now connects to leonid-world/midproof, main, root giwa-ui;
  Node 24.x and all 13 environment entries were preserved.
- Actual browser: test Seller login entered the demo without MetaMask. All four
  scenarios completed with explicit consent; the exact public evidence is below.
  Hosted restart recovery also passed as recorded below.


## Actual public browser results

Each row was initiated with the Vue consent button and completed through actual
Preview submission and independent public-state lookup. No MetaMask prompt,
GIWA transaction or faucet operation occurred.

| Role / scenario | Eligible | Actual Preview transaction | Block |
| --- | --- | --- | --- |
| Seller / A | true | `002053b66693d61cc41b2b21e94fa05e34054a77d888b8f1e39d99633a3b843b04` | 1048086 |
| Seller / B | false | `004175c2cfdae0db7a0e7266db6e186dda8452496e044454172d846f33b1444bc5` | 1048103 |
| Buyer / A | true | `00d45156121d64627d018a4017f1c96fe675da831994aa2cc3c90859165ac94f99` | 1048118 |
| Buyer / B | false | `007f958e94ff7a4ae4cb387d4fc934fcbb4d9bea7802bec57f3350e9be6ae053c5` | 1048128 |

Both false results were displayed as valid unmet-criteria outcomes, not errors.
All four used the same preserved Preview contract. Final Buyer/B request ID:
`0xbb25a1d1902f73eccf0cff302c3920635e0086aba6cdc0fc8ce6a6bda71d6bc9`.


## Hosted restart and recovery

The existing Railway service was explicitly restarted after all four browser
proofs completed. Its readiness returned true, the same Preview contract remained,
and walletlessDemo stayed enabled. Reloading the browser retained the same demo
login session and recovered Buyer/B=false with the identical request ID,
transaction `007f958e94ff7a4ae4cb387d4fc934fcbb4d9bea7802bec57f3350e9be6ae053c5`
and block 1048128. No new proof button was pressed. This verifies live recovery of
the latest run; all-four recovery was separately verified on the local stack.

Later documentation-only commits may rebuild the same application through the
new Git connections. The implementation accepted here is e2aa554. No hackathon
form, video or deck submission was performed. Prior GASOK funding/repayment
rehearsal is a separate task.

Original GASOK root and giwa-midnight remain dirty with their pre-existing work
preserved. The original root tracks the submodule commit pointer; the inner
repository tracks its own files. The new MidProof repository tracks all four
projects as ordinary directories. Only documentation pointers were updated in
the original checkout during this submission work.
