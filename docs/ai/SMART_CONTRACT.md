# IMPORTANT

GIWA Solidity contract
Midnight Compact contract

# Smart Contract

## Midnight Compact v2 (local PoC only)

`giwa-midnight/contract/src/zkloan-credit-scorer.compact` is not a GIWA
Solidity replacement. The current local evaluation version is `2` and accepts a
public `FunderPolicyRequest` containing:

```text
requestId Bytes<32>
intendedFunderWallet Bytes<20>
minAnnualRevenueKrw Uint<64>
maxDebtRatioBps Uint<32>
maxOverdueCount Uint<16>
validUntil Uint<64>
```

Compact recomputes a domain-separated policy-request hash and an opaque lookup
bound to the request-scoped company commitment, exact GIWA
chain/ReceivableFinance/receivable/role/wallet context, and Midnight deployment.
The registered Provider Schnorr verifier and Provider signer use the same exact
11-field order: three private facts, company/GIWA/deployment/policy hashes,
Provider ID, evaluation version, `profileAsOf`, and `validUntil`.

The circuit checks the private tuple against the exact thresholds and stores
only the combined boolean, Provider ID, version, profile timestamp, and expiry.
At `blockTime >= validUntil` it rejects. No raw fact, per-condition failure,
nonce, signature, authorization, receivable ID, role, wallet, or policy value is
published in the result map; those public context values travel in the bounded
capability and are revalidated by the Read API.

The live local v2 deployment is
`12caaf76aef1de1c584b67462018810f6e4e7eb2535e136f560cb621e24a3f36`.
Provider 2 registration transaction
`006abe69d8ba934519e19c4490ce77be724f75aae1bcb4e6b4fcd720258aa10601`
was included at local block `25714`. The former v1 deployment remains
historical and is not migrated or used as fallback.

## Contracts

`MockKRW.sol`

- OpenZeppelin ERC-20 and Ownable.
- Test-only currency with no real-world value.
- 0 decimals: one base unit equals one integer KRW in the MVP.
- Owner can mint demo funds to Buyer and Funder wallets.

`ReceivableFinance.sol`

- OpenZeppelin ERC-721.
- SafeERC20 for MockKRW movement.
- ReentrancyGuard for funding and repayment.
- No proxy and no backend/admin transaction signer.
- Receives the deployed MockKRW address in its constructor.

`MockKRWFaucet.sol`

- Separate testnet-only distributor for the existing MockKRW.
- Holds pre-funded inventory and transfers one immutable fixed amount per wallet.
- Has no MockKRW mint authority and never changes receivable lifecycle state.
- Uses SafeERC20, ReentrancyGuard, and owner-only remaining-inventory recovery.

## Status

CREATED

↓ Buyer verifies

VERIFIED

↓ Seller tokenizes

TOKENIZED

↓ Third-party Funder supplies MockKRW

FUNDED

↓ Buyer repays

REPAID

`CANCELLED` is reserved in the enum and has no MVP transition function.

## Receivable Data

Each onchain receivable stores:

- independent receivable ID
- Seller, Buyer, and eventual Funder addresses
- face value and funding amount
- issue and maturity timestamps
- optional bytes32 document hash
- NFT token ID
- lifecycle status

## Functions

`createReceivable`

- Caller becomes Seller.
- Buyer must be non-zero and different from Seller.
- Amounts must be positive and funding amount cannot exceed face value.
- Maturity must be after issue date.
- Creates status CREATED and emits `ReceivableCreated`.
- Records only the Seller's unverified claim; it does not mint an NFT.

`verifyReceivable`

- Only the stored Buyer.
- Only from CREATED.
- Changes status to VERIFIED and emits `ReceivableVerified`.
- The Buyer transaction is the authoritative attestation that the displayed debt
  terms were reviewed and accepted.

`tokenizeReceivable`

- Only the stored Seller.
- Only from VERIFIED.
- Mints a new ERC-721 directly to the financing contract as escrow.
- Changes status to TOKENIZED and emits `ReceivableTokenized`.

`fundReceivable`

- Only a third party that is neither Seller nor Buyer.
- Only from TOKENIZED.
- Transfers funding amount of MockKRW from Funder to Seller.
- Atomically transfers the escrowed NFT from the contract to Funder.
- Changes status to FUNDED and emits `ReceivableFunded`.

`repayReceivable`

- Only the stored Buyer.
- Only from FUNDED.
- Reads the current NFT owner.
- Transfers face value of MockKRW from Buyer to that owner.
- Changes status to REPAID and emits `ReceivableRepaid`.

`getReceivable`

- Returns the complete onchain receivable.
- Reverts for an ID that was never created.

## NFT Ownership

Before tokenization

- The economic receivable belongs to Seller, but no NFT exists.

After tokenization

- The financing contract owns the NFT in escrow.
- This removes a separate Seller approval transaction.

After funding

- Funder owns the NFT.
- The NFT may be transferred; repayment always goes to the current NFT owner.

After repayment

- The NFT remains as immutable proof while the receivable status is REPAID.

## Build and Deployment

- Compiler: Solidity `0.8.24+commit.e11b9ed9`.
- Optimizer: enabled, 200 runs.
- viaIR: disabled.
- EVM version: Paris.
- OpenZeppelin: 5.4.0.
- Local compile: `npm ci`, then `npm run compile`.
- Local EVM tests: `npm test`.
- Hardhat compile, tests, GIWA deployment, and verification use the same pinned
  settings and local `solc` package.
- Eighteen explicit tests cover MockKRW owner distribution, the local Faucet PoC,
  CREATED→REPAID, all lifecycle event arguments, role/state rejection,
  nonexistent IDs, NFT escrow and transfer, repayment to the current NFT owner,
  ERC-20 balance/allowance failures, rollback, and input boundaries.
- `npm run deploy:giwa` deploys MockKRW first and ReceivableFinance with that
  MockKRW address, then records public metadata in
  `deployment/giwa-testnet.json`.
- `npm run deploy:faucet:giwa` deploys only MockKRWFaucet against the recorded
  MockKRW. It never rewrites the existing pair metadata and records the Faucet in
  `deployment/giwa-testnet-faucet.json` after a successful receipt.
- The Faucet claim defaults to `10,000,000 mKRW` and may be overridden before its
  first deployment with positive-integer `MKRW_FAUCET_CLAIM_AMOUNT`. Its address
  is printed as `VITE_MOCK_KRW_FAUCET_ADDRESS`.
- `npm run verify:giwa` verifies both contracts through
  `https://sepolia-explorer.giwa.io/api`.
- `npm run deploy:giwa:verify` executes both steps; verification can be rerun
  safely without redeploying when explorer indexing is delayed.
- The deployer key is exported only in the current terminal through
  `DEPLOYER_PRIVATE_KEY` and must never be written to a project file, shell
  command argument, or Git.
- `npm run deployment:env` prints the new Vite and backend address variables.
- `npm run mkrw:transfer -- <recipient> <amount>` transfers existing owner mKRW
  without changing total supply. `npm run mkrw:mint -- <recipient> <amount>`
  issues additional test-only supply. Both commands attach to the MockKRW address
  recorded in deployment metadata and require the temporary onchain owner key in
  `DEPLOYER_PRIVATE_KEY`.
- The verified GIWA Sepolia replacement pair is MockKRW
  `0x5cD8a99Dcf5Fa00fb4fD9873b41A15F9C13C9d3F` and ReceivableFinance
  `0x0f264334f98BA0d22f7Fc6Bb901a5Fa36158a315`.
- The additive GIWA Sepolia MockKRWFaucet is
  `0xa451FA95c3E2Efd771f6Ba556daBBf36f888ef2E`; its fixed claim is
  `10,000,000 mKRW`, and its separate deployment metadata records transaction
  `0xcd71ff3c79c17bfc4627a22c87a72139c30cd5a69cf686025744f5b30f8cc633`
  at block `32667847`.
- Deployment and verification retry public-RPC contract visibility reads so a
  successful creation is not repeated when an immediate `eth_call` briefly
  returns empty data.
- A replacement deployment has independent storage, NFTs, balances, and
  allowances. Existing DB rows must remain associated with the original
  deployment, and a fresh demo lifecycle must be created for the new pair.

## Receivable Lifecycle

The MVP lifecycle is strictly sequential:

`CREATED -> VERIFIED -> TOKENIZED -> FUNDED -> REPAID`

### Actors

- Seller: creates the receivable and tokenizes it after buyer verification.
- Buyer: verifies the receivable and repays the full face value.
- Funder: supplies the discounted funding amount and receives the receivable NFT.
- Contract: escrows the NFT between tokenization and funding.

Seller, buyer, and funder must use distinct wallet addresses for the MVP flow.

## ERC20 Approval Requirements

`fundReceivable` and `repayReceivable` use `safeTransferFrom`.

Therefore:

- The funder must approve `fundingAmount` of MockKRW to `ReceivableFinance`
  before calling `fundReceivable`.
- The buyer must approve `faceValue` of MockKRW to `ReceivableFinance`
  before calling `repayReceivable`.

The frontend must treat approval and the business transaction as two separate
on-chain transactions and wait for the approval receipt before continuing.

## Funding Integration

The deployed contracts do not require a Solidity change for the Funding UI/API.

- The Funder first approves exactly `fundingAmount` of MockKRW.
- The frontend re-reads allowance and requires a separate user action before
  calling `fundReceivable`.
- Frontend preflight requires the configured MockKRW address to match
  `paymentToken()`, decimals 0, TOKENIZED onchain terms matching DB, and NFT
  ownership by ReceivableFinance escrow.
- Backend RPC confirmation requires exact `fundReceivable(receivableId)`
  calldata and Funder signer.
- The receipt must contain exactly one matching `ReceivableFunded`, one MockKRW
  `Transfer(funder, seller, fundingAmount)`, and one ReceivableFinance
  `Transfer(escrow, funder, tokenId)`.
- Only that proof may authorize the DB transition from TOKENIZED to FUNDED.

## Demo mKRW Faucet

`MockKRWFaucet.sol` is deployed for reviewer self-service funding and repayment
readiness and is wired to both workflow pages as an optional testnet-only flow.

- The Faucet references the existing MockKRW as an immutable payment token; it
  does not replace MockKRW or ReceivableFinance.
- The owner pre-funds the Faucet using a normal MockKRW transfer. `claim()` moves
  existing inventory to `msg.sender`, so MockKRW total supply remains unchanged.
- The claim amount is immutable and configured at deployment. Each wallet may
  claim exactly once.
- Invalid token contracts, a zero claim amount, duplicate claims, and insufficient
  Faucet inventory revert with explicit custom errors.
- A depleted claim does not consume wallet eligibility. The owner can transfer
  more mKRW directly to the Faucet and the wallet can retry.
- Only the Faucet owner can recover all remaining inventory through
  `withdrawAll()` when the demo Faucet is retired.
- No private key is added to the frontend or backend, and no backend API, DB row,
  or blockchain lifecycle journal entry is required for a claim.
- The Funding and Repayment pages verify Faucet/token bytecode, the Faucet token
  link, claim amount, wallet eligibility, inventory, estimated native gas,
  receipt event, and exact MockKRW `Transfer` before refreshing the existing
  balance/allowance readiness. Funding compares against `fundingAmount`; repayment
  compares against `faceValue`.
- A per-wallet submitted-transaction record survives reloads. Receipt failure
  clears the lock, while pending, replacement-ambiguous, successful-event, or RPC
  lag states remain blocked from duplicate claim submission until reconciled.
  The same record is shared across both pages because the contract limit is one
  claim per wallet rather than one claim per role or workflow.
- The caller still needs GIWA Sepolia native ETH for claim, approve, and funding
  gas. Native-token sponsorship is outside this PoC.
- The Faucet-only deployment command validates the existing MockKRW and current
  Owner signer, records successful deployment metadata before RPC state retries,
  and refuses to overwrite or duplicate an existing recorded Faucet.

## Repayment Integration

The deployed contracts do not require a Solidity change or redeployment for the
Repayment UI/API.

- The Buyer first approves exactly `faceValue` of MockKRW.
- When the Buyer balance is insufficient, it may first claim one fixed amount
  from the pre-funded demo Faucet only if that claim covers the full face value.
  Claim, approval, and repayment remain three explicit MetaMask transactions;
  none automatically triggers the next.
- The frontend re-reads allowance and requires a separate user action before
  calling `repayReceivable`.
- The current NFT owner is read immediately before repayment and becomes the
  MockKRW recipient. The original Funder is not a fixed recipient because the NFT
  remains transferable.
- Frontend preflight requires the configured MockKRW address to match
  `paymentToken()`, decimals 0, FUNDED onchain terms matching DB, and the stored
  token ID.
- Backend RPC confirmation requires exact `repayReceivable(receivableId)`
  calldata and the registered Buyer signer.
- The receipt must contain exactly one matching `ReceivableRepaid` and one
  MockKRW `Transfer(buyer, recipient, faceValue)`, with the same recipient in both.
- Repayment does not transfer or burn the NFT. Receipt-block post-state remains
  owned by the repayment recipient while the receivable status becomes REPAID.
- Only that proof may authorize the DB transition from FUNDED to REPAID.

The current contract does not require block time to reach `maturityDate` before
repayment. Maturity remains displayed business context in the MVP rather than an
onchain execution gate.

## NFT Ownership

- On tokenization, the NFT is minted to the `ReceivableFinance` contract.
- On funding, the NFT is transferred to the funder.
- On repayment, payment is sent to the current NFT owner.
- The NFT remains after repayment as an on-chain record of the completed
  receivable unless a future version introduces burning.

## MVP Scope Decisions

The following are intentionally excluded from the current MVP:

- Partial funding
- Partial repayment
- Late-payment penalties
- Default handling
- Oracle-based document validation
- Permissioned NFT transfers
- Document hash duplicate prevention
- Cancellation after funding
- Upgradeable contracts

Buyer verification represents confirmation by the registered buyer wallet,
not validation by an external oracle.

## Pre-Submission Validation Result

`npm test` compiles the core contracts and local Faucet PoC with Solidity 0.8.24
and passes 18 Hardhat scenarios.

- Existing owner-balance transfer is checked separately from owner-only additional
  issuance, including total-supply behavior and non-owner mint rejection.
- `ReceivableCreated`, `ReceivableVerified`, `ReceivableTokenized`,
  `ReceivableFunded`, and `ReceivableRepaid` are checked with their complete
  argument lists.
- Successful funding is checked against the Seller balance and Funder NFT
  ownership.
- Repayment after an NFT transfer is checked against the current NFT owner's
  balance, not only the original Funder.
- Role failures assert `UnauthorizedCaller` or `RelatedPartyCannotFund`.
- Wrong lifecycle states assert `InvalidStatus(expected, actual)`.
- Every ID-based function asserts `ReceivableNotFound` for an unknown ID.
- ERC-20 balance and allowance failures are tested independently for both funding
  and repayment, with rollback checks for status, balances, and NFT ownership.
- Zero/self Buyer, zero/invalid amounts, and invalid date ranges assert their exact
  custom errors.
- Six Faucet tests prove constructor validation, exact fixed transfer without
  minting, duplicate-claim rejection, independent wallet claims, depletion/refill
  recovery, and owner-only inventory withdrawal.

The validation required no change to `ReceivableFinance.sol` or `MockKRW.sol`;
the Faucet remains an additive testnet-only contract.
