# Demo UX and configurable criteria — 2026-09-27

Status: implemented and validated through two actual isolated local browser proofs
and application-restart recovery. Full UI validation, final image builds and
desktop/mobile layout checks passed. The public release, two actual Preview
browser proofs and same-session browser reload recovery passed.

## Scope

- Login presents one **데모 시작** action; ordinary account login remains available.
- The demo shows company selection, editable public criteria and the result.
  Long explanations and transaction metadata move into optional details.
- **완화 / 기본 / 엄격** presets and direct minimum revenue, maximum debt-ratio
  and maximum overdue-count inputs replace the fixed demo criteria.
- Revenue is entered in 억 원 and debt ratio in percent. Conversion preserves
  exact integer KRW and basis points with decimal strings/BigInt; the existing
  Uint64/Uint32/Uint16 protocol limits are retained.
- Changing criteria resets consent. Submission freezes the exact selected
  policy; response validation, idempotency, encrypted recovery and the result
  summary remain bound to those same values. Old clients omitting all three
  criteria retain the original defaults; partial policies are rejected.
- The existing circuit already accepts request-specific public thresholds.
  Compact source, proving artifacts, architecture, synthetic financial fixtures,
  authentication and ordinary GIWA paths were not changed.
- Fictional-company/provider disclosure and hosted operator processing remain
  visible or available in details. An unmet result remains a valid proof result;
  expired results continue to suppress the current completion badge.

## Automatic validation

- Final full Vue suite: **319 passed across 36 files**; production build and full
  Oxlint/ESLint passed. This supersedes the initial 316-test result.
- Focused CLI walletless/fixture/gateway suites: **54 passed**; CLI typecheck/build
  and existing Compact simulator suite **39 passed**.
- Feature-flag affected CLI gateway/walletless recheck: **50 passed**.
- Final view-focused suite: **9 passed**, including exact custom-policy retry
  after a lost response, consent reset, recovery, focus return and true/false
  expiry display. Changed view/test formatting and ESLint passed.
- Separate exact-conversion checks covered all presets, integer-KRW/bps
  precision, protocol maxima and fractional/overflow rejection.
- Final local app/web Docker build and recreation passed; `/api/ready` again
  returned proofReady=true. The final web-only image build for viewport spacing
  also passed.

These suites overlap; their counts must not be added into one test total.
Unit/simulator checks alone are not evidence of a live proof or public deployment.

## Actual local browser proofs

Environment: existing isolated Compose project `midproof-synthetic-20260927`,
browser `http://localhost:25175`, local Midnight `undeployed`. The named local
volumes and contract were preserved. No original GASOK or hosted Preview wallet
was opened by this validation.

Preserved local contract:
`c5e85c92dc23b0fb09dd959405d2fbe9704242fa1b87bdc95aa477302c7516c1`.

Both runs used Seller / fictional company A and actual proof generation,
local-chain submission and independent result resolution. Changing only the
public criteria changed the result:

| Criteria | Eligible | Actual transaction | Local block |
| --- | --- | --- | --- |
| Minimum revenue 1,000,000,000 KRW (10억), maximum debt ratio 10,000 bps (100%), overdue ≤ 0 | false | `00496d81370ee577837253051db55a777488d34ef9d77da8dbba96f216e043cb68` | 1179 |
| Minimum revenue 750,000,000 KRW (7.5억), maximum debt ratio 17,525 bps (175.25%), overdue ≤ 2 | true | `004b6b25d71b4064b9b2f534a1fb39e8e098142282c9bd7bf1a8d455f249237d35` | 1186 |

The first run is the strict preset. The second uses directly edited criteria.
These are Local Devnet results, not new Preview/public-site acceptance.

After the app/web rebuild and actual application restart, reloading the browser
recovered the custom result with exactly the same 7.5억/175.25%/2 criteria,
transaction `004b6b25d71b4064b9b2f534a1fb39e8e098142282c9bd7bf1a8d455f249237d35`
and block 1186. No new proof was requested. Existing encrypted local identity,
contract, run record and session recovery remained intact.

## Final browser layout

The final local image was visually reviewed in the browser. With scrollY=0,
the start button ended at 688.8px in a 1280×720 desktop viewport and at 688.4px
in a 390×844 mobile viewport. Both had no horizontal page overflow; the mobile
header's three items remained on one row. The primary action is visible without
initial scrolling at both checked sizes.

## Public release and Preview browser validation

- Application source: `110dff0ab8131b0cfbf2bcb9d69b09237f65f421`.
- Both GitHub deployment statuses succeeded for that source.
- Existing Railway app deployment: `cc3416f5-9338-4cef-b98c-c03d71021c39`.
- Existing Vercel project deployment: `CYB6vxvqZFBGDocue4nD5urnNwtu`, serving
  `https://midproof.vercel.app`.
- Public configuration reports `customCriteriaEnabled=true`, runtime ready and
  Preview. The existing contract remains
  `bfb760db44f9ee7996ef12c47e56346903c654aede7d65c3c88110214c932a1e`.

The actual public browser entered through the single demo-start action and
completed two Buyer / fictional company B runs. Both used real proof generation,
Preview submission and independent result resolution:

| Criteria | Eligible | Actual Preview transaction | Block |
| --- | --- | --- | --- |
| Minimum revenue 300,000,000 KRW (3억), maximum debt ratio 30,000 bps (300%), overdue ≤ 3 | true | `00595bad613a56b335c608ffd936d444ca358a6bd794eae2440da8417911dad01e` | 1049250 |
| Minimum revenue 301,000,000 KRW (3.01억), maximum debt ratio 29,999 bps (299.99%), overdue ≤ 3 | false | `00e5d6e5bca26d35622071ba449678c6ce3a71ee5725a3dbba914dff15a50d744e` | 1049260 |

The first uses the relaxed preset; the second directly edited the same company's
public criteria. False was displayed as an unmet-criteria result, not an error.
Reloading the public browser recovered the second result. Reopening its details
showed exactly the same 3.01억/299.99%/3 criteria, request, transaction, block and
false result without reproof. This is browser-reload recovery; the separately
recorded application-restart recovery above was performed on the isolated local
stack. No new hosted process-restart acceptance is claimed for this release.

## Workspace

Work is in the MidProof monorepo; all application directories are ordinary
tracked folders. Original GASOK and its submodule worktrees remain untouched.
No new architecture decision was made, so DECISIONS.md is unchanged. The local
and public acceptance checks for this UX change are complete.
