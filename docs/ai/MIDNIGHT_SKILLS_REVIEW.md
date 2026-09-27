# Midnight-Skills와 GASOK 비교 검토

검토일 **2026-09-18**. 매 작업에 적용하는 짧은 지침은
[MIDNIGHT_REFERENCE_HARNESS.md](MIDNIGHT_REFERENCE_HARNESS.md)다.
이 문서는 전체 소스 탐색, 핵심 경계의 상세 코드 검토, 공식 문서 대조 결과다.
보안 인증서나 모든 예제의 실행 성공 보고서가 아니다.
후속 요청으로 수행한 현재 구현의 레벨별 준수 판정과 추가 결함/재현은
[구현 준수 검토](MIDNIGHT_COMPLIANCE_REVIEW.md)를 따른다.
같은 날 이후의 C01 제약 보강 및 구현 수정·테스트는
[수정 결과](MIDNIGHT_COMPLIANCE_FIXES.md)에 기록했다. 아래 미수정 우려는 최초 발견 기록이다.

## 1. 이 저장소는 무엇인가

`Midnight-Skills`는 [Kali-Decoder/Midnight-Skills](https://github.com/Kali-Decoder/Midnight-Skills)의
커뮤니티 AI 지식 패키지다. `package.json`의 버전은 **1.0.8**, author는
Kali-Decoder, contributor에 Tusharpamnani가 있으며 MIT 라이선스다.
공식 `midnightntwrk` 소스 저장소나 Midnight 프로토콜 명세로 취급하지 않는다.
복사·재배포 시 원래 저작권과 라이선스 고지를 보존한다.

일반 설명서와 달리 각 `SKILL.md`에는 에이전트가 언제 무엇을 읽고 어떤 명령을
실행할지, 샘플 코드와 오류 해결 방법까지 들어 있다. React/Next 앱 scaffold도
포함된다. **읽어서 참고하는 것과 설치해서 지시를 자동 활성화하는 것은 다르다.**
현재 요청에서는 원본을 수정하거나 스킬 전체를 설치하지 않았다.

| 구성 | 실제 로컬 내용 | GASOK에서의 용도 |
| --- | --- | --- |
| `.agents/skills/` | `SKILL.md` 34개 | 작업 주제별로 원문을 찾아 비교 |
| `skills.json` | 등록 32, enabled 31, router/package 목록 30 | 실제 path를 찾는 목록; 등록 ID가 폴더명과 다른 항목 있음 |
| `references/` | 5개 파일: README, session, gotchas, versions, node architecture | SDK 연결·버전·주의사항 참고 |
| `templates/` | locker, leaderboard, private-party의 실제 앱 3개 | 코드 구조 비교; GASOK 시작 템플릿으로 사용하지 않음 |
| `scripts/`, workflows | 레지스트리 검사·동기화·묶음 배포 | GASOK 빌드와 무관. sync/package는 파일을 변경함 |
| `.claude-plugin/` | Claude용 배포 metadata | MCP 서버 구현이 아니며 현재 경로 오류도 있음 |
| `.claude/skills/` | GSAP를 가리키는 symlink 2개 | Midnight 기능과 관계없는 추가 콘텐츠 |

숫자가 다른 이유: router `midnightskill`은 등록됐으나 배포 목록에서 제외,
`dynamic-midnight-wallet`은 비활성, `gsap-core`/`gsap-utils`는 미등록 추가 skill이다.
카탈로그의 full dApp 항목 9개가 모두 실제 template 폴더로 제공되는 것은 아니다.
자동 패키징 script는 별도로 disabled 항목도 수집할 수 있어 배포 방식별 구성이 다르다.

**MCP 설명 정정:** 현재 공식 Kapa MCP 문서는 Claude Code뿐 아니라 Cursor,
VS Code, 기타 remote MCP client를 안내한다. endpoint는
`https://midnight.mcp.kapa.ai`다. Claude Code용 **Midnight Expert**와 이 문서 검색
MCP, 커뮤니티 **Midnight-Skills**는 서로 다른 제공물이다. “Codex/Cursor는 공식
MCP를 쓸 수 없어 이 저장소만 사용해야 한다”는 결론은 맞지 않는다.
이 작업에서 MCP 연결/설치나 Codex의 실제 연결 검증은 하지 않았다.
근거: [공식 Kapa 안내](https://docs.midnight.network/ai-integration/kapa-mcp-server),
[공식 AI integration](https://docs.midnight.network/ai-integration).

## 2. 검사 기준과 전체 탐색 범위

| 저장소 | 검토 시작 HEAD | Git 추적 항목 |
| --- | --- | ---: |
| GASOK root | `a4cdb7746d9aba80ff6920cab69679a28fe68148` | 58 |
| giwa-api | `6637fefed90469d0765bfad39814f81e88330f13` | 113 |
| giwa-ui | `d223f0a2a650c23bb33845f5a0bca1c9a5a7d3ad` | 123 |
| giwa-contrract | `b15a2fbc5bb10e665a8093f5e60a8a0e9c6e099d` | 19 |
| giwa-midnight | `6c12b35acc64614ac53f4e3836fac0f8a8738a77` | 128 |
| Midnight-Skills | `f1649caf7fbfedb79d6976976f8dbef4e19e43f8` | 126 |

작업 시작 때 root는 `?? Midnight-Skills/`만 있었고 기존 네 서브모듈은 clean이었다.
표는 **수정 전 스냅샷**이며 root 항목에는 네 gitlink도 들어 있다.

검토 범위를 다음처럼 구분한다.

- 기존 `docs/ai` **17개 문서 전체**를 분담해서 읽었다. 최신 TODO/CONTEXT와
  ADR-021/022/023을 과거 v1/local-only 기록과 대조했다.
- 참조의 **34개 skill**, 5개 references, 레지스트리·4개 script·2개 workflow·
  plugin metadata·README/CONTRIBUTING/LICENSE, 세 template의 contract/witness/
  provider/business/UI/config 코드를 검토했다. lockfile은 관련 버전을 추출했다.
- GASOK 전체 추적 파일을 열거하고 API 104개 소스/설정(12,680행), UI 95개
  소스/설정(28,092행), Solidity 영역 15개 소스/설정(2,635행)을 내용 검색했다.
  이것은 모든 줄을 독립적으로 보안 검증했다는 뜻이 아니다.
- 상세 검토: Midnight Compact/Provider/CLI/Read API/hosted gateway/지갑/outbox,
  Spring 인증·authority·요청 상태·암호화·조회·자동 실행,
  Vue 요청·동의·결과·복구·라우트, Solidity 계약 3개, root 배포·실행 스크립트.
  관련 테스트의 대상과 핵심 assertion을 대조했다.
- `.codex`, `whitepaper`, `midnight`, `docs/research`, pitchdeck/profile도 구조와
  관련 설명을 탐색했다. 기존 GIWA 설계·과거 학습 자료로 분류하며 최신 승인보다
  우선하지 않는다. 모든 과거 문장을 이번에 다시 편집하지 않았다.
- 의존성 내부 전체, 모든 생성 바이너리/이미지, 거대한 lock의 모든 항목은 의미 검토
  대상이 아니다. `.env`, ignored 지갑·키·private state·DB·로그를 수집하지 않았다.
  generated Compact metadata와 관련 JS 제약은 버전/회로 검토 목적으로 확인했다.

이하 `S/`는 `Midnight-Skills/`, `M/`은 `giwa-midnight/`다.
`파일:행`은 위 스냅샷의 근거 위치로, 이후 수정 때 실제 파일에서 재확인한다.

## 3. 현재 아키텍처와 예제의 차이

```text
Vue + 기존 앱 로그인
  ├─ MetaMask: GIWA 채권/펀딩/상환 거래, Seller/Buyer 역할 동의
  └─ 인증된 hosted gateway: requestId + 가상 profileId
       ├─ Spring: 요청 권한·공개 기준·암호화 capability·결과 상태
       ├─ 가상 Attestation Provider: canonical 역할 확인 + EIP-712 + Schnorr
       ├─ Bridge/운영 지갑: 요청별 증명·제출·암호화 outbox
       ├─ 내부 native Proof Server: 합성 witness로 실제 ZK 생성
       └─ 공용 Preview Node/Indexer: 체인 수락 및 독립 결과 조회
```

| 비교 항목 | GASOK 현재 구현 | 참조 예제 적용 판단 |
| --- | --- | --- |
| 화면 | Vue + Vite + 기존 MetaMask | Next/React scaffold·`window.midnight` connector는 대체안 아님 |
| 지갑 책임 | GIWA는 사용자, Midnight는 demo 운영 지갑 | 1AM/Lace/ProofStation 전환은 별도 구조·상태 이관 결정 |
| 데이터 | hosted 화면은 지정 profileId, 서버의 합성 tuple | 임의 실제 재무값 입력이나 client secret 저장을 가져오지 않음 |
| 인증 | JWT + Spring 권한 + actor/request/session | 지갑 연결 또는 localhost 헤더만으로 대체 불가 |
| 금융 정책 | Funder가 정한 공개 기준, v2 11-field attestation | 원래 ZK Loan의 대출액·등급·PIN·blacklist는 업무 요구사항 아님 |
| 저장 | encrypted private state + durable outbox + DB envelope | 메모리 Map/브라우저 localStorage는 대체 불가 |
| 결과 | exact capability 독립 조회, 유효 `false` 지원 | optimistic 성공·임의 기존 ledger·tx 문자열만으로 완료 금지 |
| 자산 | GIWA Solidity가 NFT·펀딩·상환 담당 | Midnight NFT/payment/auction으로 변경하지 않음 |
| 운영 | Spring Run 하나, Railway 앱 하나, 기존 MySQL/Vercel | 별도 helper 앱·자가 Node/Indexer 운영 불필요 |
| 네트워크 | approved Preview; 필요 시 격리된 local 진단 | Preprod/Mainnet 예제 명령 실행 금지 |

GASOK가 이미 더 구체적으로 구현한 인증·복구를 일반 예제에 맞춰 단순화하지 않는다.
이 비교로 앱 아키텍처를 바꾸지 않았으므로 새로운 ADR을 추가하지 않았다.

## 4. 버전은 예제 표가 아니라 현재 lock과 산출물로 확인

| 항목 | GASOK 확인값 | 참조 저장소의 차이 |
| --- | --- | --- |
| Midnight Node.js 실행 | Docker `22.21.1`, `.nvmrc` 22 | 일반적인 `>=22`를 최신 major 자동 사용으로 해석 금지 |
| Compact devtools | 기존 검증 기록 0.5.1 | compiler/language 버전과 구별; 이 작업에서 실행 파일을 새로 검증하지 않음 |
| Compact compiler / language | 생성 metadata `0.31.1` / `0.23.0` | zk-loan의 `0.22–0.23` 표기는 language와 compiler 혼동 |
| compact-runtime | lock/generated `0.16.0`; manifest는 `^0.16.0` | references 0.16.0, midnight-js skill 표는 0.15.0 |
| Midnight.js | **4.1.1** | references 4.0.4, midnight-js skill은 4.0.2 |
| ledger / Proof Server | **8.1.0 / 8.1.0** | references ledger 8.0.3, 일부 local 예제 prover 7 |
| onchain-runtime-v3 | **3.0.0 단일 lock 경로**, override/resolution | 두 WASM 인스턴스의 `StateValue` 오류 회귀 주의 |
| wallet-sdk | 1.2.0; facade lock 4.1.0 | 예제별 이전 facade/shielded API가 섞임 |
| local 진단 Indexer | standalone.yml 4.3.3, `/api/v4/graphql` | local=v3 단정과 local=v4 예제가 저장소 안에서 충돌 |
| hosted Indexer | 공용 Preview v4 endpoint | 운영자가 실제 서비스 버전을 직접 고정하는 구조는 아님 |

근거: `M/package.json`, `M/package-lock.json`, `M/contract/src/managed/zkloan-credit-scorer/compiler/contract-info.json`,
root `Dockerfile`, `scripts/midnight-demo.mjs`, `M/cli/standalone.yml`.
참조: `S/references/versions.json`, `S/.agents/skills/midnight-js/SKILL.md:602`,
`multinetwork/SKILL.md:53`, `example-zk-loan-application/SKILL.md:357`.

2026-09-18 열람한 [공식 호환성 표](https://docs.midnight.network/relnotes/support-matrix)는
compiler 0.31.1/runtime 0.16.0/Midnight.js 4.1.1/prover 8.1.0 및 Preview
Indexer 4.3.5를 안내한다. 표는 최신 검증 조합이며 예전 조합의 실패를 뜻하지 않는다.
공용 endpoint와 local image의 차이를 이유로 자동 업데이트하지 않는다.

특히 **일반 contract build는 기존 generated 파일을 복사하며 Compact를 재컴파일하지 않는다.**
`.compact`를 수정하면 contract binding, metadata, keys, zkir를 함께 재생성·검증해야 한다.
TypeScript build 성공이나 `--skip-zk`만으로 새 proving artifact가 준비됐다고 쓰지 않는다.
기존 계약과 결과를 보존한 배포/이관 판단도 별도다.

## 5. 참조에서 확인한 오류·복사 금지 패턴

### 5.1 언어·비공개 데이터 설명

| 참조의 설명 | 근거와 판단 | 우리 작업 규칙 |
| --- | --- | --- |
| 모든 circuit 인자는 공개 | `security:34,54,88`, `compact:282`; 공식 explicit-disclosure와 충돌 | 인자라는 이유만으로 유출이라고 단정하지 말고 실제 ledger/transcript/return/전송 경로 조사 |
| `Uint` overflow는 wrap | `compact:81`, `token-transfers:545`; 공식 arithmetic 의미와 충돌 | widening, narrowing error, 음수 subtraction, Field modular 연산을 구별 |
| witness는 소유자만 보고 기기 밖으로 안 나감 | `compact:38`, `why-midnight:76,99`, `zk-vs-fhe-vs-mpc:57,71` | 현재 hosted 운영자·Provider·Prover의 합성 원문 처리를 설명 |
| export 제거가 private 전환 | visibility 설명을 잘못 일반화할 위험 | ledger는 공개 상태다. API export와 원장 공개 범위를 구별 |

공식 문서에서 exported circuit/constructor 인자도 witness data의 입력 경로가 될 수
있다. `disclose()`는 공개를 허용하는 compiler annotation이며 호출 자체가 값을
원장에 쓰는 동작은 아니다. 따라서 `verifyEligibility`의 nonce/subject/policy가
인자라는 사실만으로 유출을 선언하지 않는다.
[공식 explicit disclosure](https://docs.midnight.network/compact/reference/explicit-disclosure).

정수 덧셈·곱셈의 타입 범위 확장, 음수가 되는 뺄셈과 좁은 타입 변환의 오류는
Field의 모듈러 연산과 다르다. 정확한 단위·범위와 경계 테스트를 유지한다.
[공식 Compact reference](https://docs.midnight.network/compact/reference/compact-reference).

### 5.2 실행·SDK·저장 관련 위험

| 패턴 | 참조 근거 | GASOK에서 금지/조건부로 보는 이유 |
| --- | --- | --- |
| auto `compact update`, curl installer, `proof-server:latest`, 다른 포트 자동 선택 | environment-setup `:62,97,140,222` | 기존 Run·고정 버전·내부 prover와 충돌 |
| Preview면 항상 1AM sponsorship, DUST 불필요 | multinetwork `:18,361`; midnight-js `:228` | 제3자 서비스 조건을 네트워크 속성으로 일반화; 현 지갑은 DUST 준비 필요 |
| 알 수 없는 submit 응답을 직렬화 tx 앞 64글자로 ID 대체 | references/midnight-session `:170–178`, 세 template의 `lib/midnight.ts` | 실제 tx hash/수락/finalization의 근거가 아님 |
| 잘못된 공개키를 0으로 채우거나 자르기 | 같은 reference `:42–55` | 실패해야 할 입력을 다른 식별자로 바꿈; 엄격한 길이/타입 검증 유지 |
| private state/signing key를 Map만으로 구현 | 같은 reference `:58–103` | 재시작시 identity/복구 상태 소실; 현재 암호화 상태를 대체 못함 |
| private state/secret을 localStorage에 보관 | 1am-wallet `:417`, zk-loan `:205,277`, template secret helpers | GASOK의 금융 witness·capability 저장 금지와 충돌 |
| 아무 기존 contract state면 poll 성공 | session reference `:197–223` | 해당 request의 exact 결과/시점 검증이 아님 |
| optimistic verified 표시 | 1am-wallet `:690`, leaderboard UI | proof 제출/독립 조회가 끝나기 전에는 pending으로 표시 |
| DUST 문제면 재시작, compile하면 무조건 재배포 | midnight-js `:588,596` | 공유 지갑의 단일 writer, 기존 계약·capability·미확정 거래 보존 필요 |
| 모든 곳에 `offset:null` patch 또는 `signTransactionIntents` 주입 | 1am-wallet, midnight-js, gotchas | SDK/Indexer/지갑 버전과 관찰된 오류를 확인한 후에만 판단 |

SDK 샘플끼리 `WalletFacade` 생성 방식, private-state provider 인자, deploy/submit
경로도 다르다. 실제 설치 패키지의 타입·현재 코드·실패 사례를 대조한다.
기존 SDK wrapper를 단순 예제로 교체하거나 응답 검증을 약화시키지 않는다.
노드의 sr25519, Compact/Jubjub attestation, GIWA secp256k1 EIP-712도 서로 다르다.

### 5.3 template·registry 품질과 적용 한계

다음은 **정적 소스/타입/설정 불일치**다. template을 설치·실행해 재현한 결과가 아니다.

- 세 template의 `contract/src/index.ts:1`은 `CompiledContract`를 compact-runtime에서
  가져오지만 관련 skill 설명은 compact-js를 사용한다. 우리 설치 runtime의
  `index.d.ts`에도 해당 export가 없다. browser import 경로의 `node:path`/`node:url`도 점검 필요.
- private-party `lib/party.ts:48,76,90`과 locker `lib/locker.ts:54`의 Bytes/Uint 인자
  표현이 자체 skill의 Uint8Array/BigInt 안내와 다르다.
- locker `app/locker/LockerClient.tsx:59,81`은 공개 coin key를 secret과 beneficiary로
  사용하지만 `contract/src/locker.compact:40`은 secret의 domain hash와 beneficiary를
  비교한다. 인증 설계 참고용으로 복사하지 않는다.
- template의 Preprod 고정값, nested `npm install --prefix contract`, 중복 runtime
  가능성이 자체 skill의 단일 runtime/네트워크 안내와 충돌한다.
- leaderboard의 origin-global secret 저장과 로컬 verified 표시를 company identity나
  외부 사실 검증으로 해석하지 않는다. 입력 점수의 사실성은 증명하지 않는다.
- security skill의 일부 Merkle/allowlist/admin 예제에는 leaf 결합·admin 권한·타입·
  초기 round 제약을 추가 검토해야 할 부분이 있다. vetted 암호 라이브러리가 아니다.
- Android voting 예제는 하드코딩 admin, 중복 투표 방어 부재 등을 스스로 밝힌다.
  GASOK 인증 구현의 근거로 사용하지 않는다.
- `.claude-plugin/plugin.json`은 버전 1.0.0과 오래된 skill 경로 5개를 유지한다.
  `skills.json` ID를 폴더명으로 조합하면 `midnight-indexer → indexer` 등의 경로를 틀린다.
- offline Markdown link 검사에서 98개 중 5개 로컬 링크가 없었다. CONTRIBUTING의
  testing, nft의 두 링크, leaderboard/locker README 링크다. Claude metadata의
  5개 경로도 존재하지 않는다. remote URL 전체 검증 결과는 아니다.
- 원본 `node scripts/validate-registry.mjs`는 **Registry OK: 32 skills**였지만
  파일 존재/ID 등을 검사할 뿐 위 오류나 code correctness를 보장하지 않는다.
  CI의 `sync:registry`는 실제 파일을 쓰므로 읽기 전용 검사로 실행하지 않는다.

따라서 좋은 개념·체크 질문은 이용하되, 예제 전체가 GASOK에서 즉시 실행 가능한
정답이라는 전제를 버린다. 고정 proof 크기·forward secrecy·자산 bridge 등의
출처 없는 보장도 제품 설명에 옮기지 않는다.

## 6. 우리 구현에서 보존해야 할 구체적인 것

| 확인한 경계 | 소스 근거 | 이후 변경 시 유지할 것 |
| --- | --- | --- |
| 공개 기준과 비공개 사실 구분 | Compact financial/policy structs, Spring request DTO | `minAnnualRevenueKrw` DB 열은 기준이며 실제 `annualRevenueKrw` 저장이 아님 |
| v2 11개 attestation field | `M/contract/src/zkloan-credit-scorer.compact:271`, `attestation-api/src/signing.ts:114` | 순서/타입/해시 변경은 전체 경로를 함께 검증 |
| request/audience/role/deployment 결합 | Compact `:83,110,128,137,168` | 회사 commitment, request ID, Funder, GIWA chain/contract/receivable/role/wallet, Midnight deployment |
| 요청별 nonce | Compact `:83`, Bridge `local-runtime.ts:32` | Uint16 nonce는 secret·requestId와 결합; 사용자 PIN이나 인증 암호가 아님 |
| 한 번의 역할 동의 | Provider `authorization.ts:231,317`, `server.ts:418,449,486` | canonical GIWA 역할 재조회, 단발 EIP-712, 만료 제한 |
| hosted 입력 제한 | `M/cli/src/hosted-demo/gateway.ts:158–177` | 정확한 `{version,requestId,profileId}`; public route에 raw facts/역할 override 추가 금지 |
| 모든 hosted 동작 권한 | gateway `:155–202`, Spring `MidnightBridgeAuthorityController` | JWT + authority + actor/request/session, 내부 토큰 분리, 조기 ACK 거부 |
| state overwrite 방지 | `M/cli/src/api.ts`, `state.utils.ts`, `private-state-join.test.ts` | 기존 private state가 있으면 join의 `initialPrivateState`로 덮어쓰지 않음 |
| durable 전달 | `proof-bridge/runtime.ts:168–181`, `capability-outbox.ts:668,885` | 완료 노출 전 암호화 outbox, 복구와 idempotent ACK |
| 암호화 DB envelope | Spring `MidnightCapabilityCrypto:38–106`, `MidnightProofRequestService:212–309` | AES-GCM/AAD, 요청 바인딩, idempotence, 원문·서명 미저장 |
| 독립 결과 조회 | `M/api/src/capability.ts:86–153`, `eligibility.ts:66`, Spring ReadClient | exact lookup/정책/대상/발급·만료 일치, bool만 신뢰하지 않음 |
| false/오류 구별 | Vue assigned/mailbox/proof components, Spring request status | 거절/만료/실패/대기는 `false` 증명 결과가 아님 |
| 자산 책임 분리 | `giwa-contrract/contracts/ReceivableFinance.sol:161,187` | 펀딩·상환은 GIWA, 현재 NFT owner 상환, Midnight 자동 gate 없음 |
| 단일 Run/앱 | root runner/Dockerfile, Spring `MidnightDemoRuntime` | pinned prover, private ports, 자동 준비·종료, 기존 DB/지갑 보존 |

공개 ledger에는 opaque key와 `eligible`, Provider ID, evaluationVersion,
`profileAsOf`, `validUntil` 및 admin/Provider/GIWA 설정의 control state가 있다.
capability는 이 결과와 GIWA 당사자를 연결하는 민감한 조회 재료라 공개 배포하지 않는다.
공개 체인 데이터는 앱에서 결과 만료 처리를 해도 삭제되지 않는다.

기한은 exclusive다. `now >= validUntil`이면 만료이며 동의 TTL은
`min(issuedAt + 120, validUntil)`로 제한된다. `profileAsOf`는 가상 발급 시각이지
감사받은 재무제표의 기준일이나 실제 회사 재무의 최신성 증거가 아니다.

Spring의 envelope 만료 삭제는 요청을 처리하며 `expireStale`를 실행할 때 일어나는
lazy cleanup이다. 정확한 시각의 삭제·백업 삭제·원장 취소/철회를 보장하지 않는다.
운영자가 키와 상태를 함께 관리하므로 at-rest 암호화를 운영자로부터의 비밀성으로
설명하지 않는다. JS 객체를 해제했다고 확실한 memory zeroization도 주장하지 않는다.

앱 회사 등록과 주소 매핑은 법인 인증/KYC가 아니다. EIP-712는 역할 지갑의 동의이며,
Compact는 Provider의 Schnorr attestation을 검증하도록 구현돼 있다. 실제 재무
사실의 진실성이나 운영급 암호 안전성까지 입증했다는 뜻은 아니다.

## 7. 우선 후속 검토: 서명 회로 제약

**상태: 정적 검토상 우려, 미확인. 검증된 취약점으로 기록하지 않는다.**

`M/contract/src/schnorr.compact:24,45–53`의 challenge reduction witness는
`[Field, Uint<248>]`를 반환한다. 현재 소스는 Field 연산의 reconstruction equality를
검사하며 첫 값의 작은 정수 범위/canonical quotient 제약은 명시하지 않는다.
`contract/src/witnesses.ts:48–54`의 정상 JS 구현은 정수 quotient/remainder를 반환하지만
정상 witness 구현 자체가 회로 제약은 아니다. 관련 generated JS의 Field 검사와
연산도 함께 확인했다.

이 지점이 intended challenge reduction을 충분히 강제하는지 **전문 암호/회로 검토를
최우선 후속 항목**으로 둔다. 기존 signature tampering·role replay·expiry tests가
이 제약의 soundness를 독립적으로 검증한다는 근거는 찾지 못했다.
잘못된 witness 구성, 서명 우회 재현, 실제 proof/체인 제출은 이번에 수행하지 않았다.

완료 조건: 정확한 불변식과 compiler/generated 제약을 확인하고, 필요한 수정 및
부정 입력 거부 회귀를 검증하며, prover/verifier artifact와 기존 deployment에 미치는
영향을 기록한다. 확인 전 정상 테스트 통과를 근거로 “서명 회로의 안전성까지 검증 완료”라고
확대하지 않는다. 문서 작업 중 임의로 암호 프로토콜이나 배포 계약을 바꾸지 않는다.

## 8. 기존 TODO와 새로 연결한 주의사항

| 우선도 | 항목 | 근거 수준 / 다음 확인 |
| --- | --- | --- |
| 높음 | 위 Schnorr reduction 검토 | 정적 우려; 전문 제약 검토·수정 검증 필요 |
| 높음 | 실제 Buyer와 valid-false 브라우저→Preview 리허설 | 최신 TODO에 미완료. 과거 Seller true 성공으로 대체 불가 |
| 높음 | 재시작/ACK 전 중단/Indexer lag 복구 리허설 | 구현·테스트와 라이브 복구 증거는 별개 |
| 높음 | local/Railway 동일 지갑 동시 실행 금지 | 현재 이관 상태, host-local lock은 분산 fencing이 아님 |
| 중간 | 반복 기준 질의의 inference | active request 하나만으로 해결 안 됨. budget/template/cooldown 별도 설계 |
| 중간 | 암호 키 교체·보존 정책 | envelope version 1, rotation/reencryption 또는 drain 필요 |
| 향후 구조 | 회사별 독립 Midnight identity, real provenance, revocation, 다중 인스턴스 | 합성 demo 승인과 운영급 설계는 다름; 별도 승인 |
| 높음 | Java read 응답 body 전체 deadline | 후속 구현 검토 C04에서 격리 재현: timeout 200ms인데 stalled body가 1,000ms 후에도 blocking. 수정은 아직 미완료 |

해커톤 제출 정리는 기존 체크리스트의 시점에 따른다. 이번 참고 하네스 작업은
새 단일 저장소 게시, 배포, 도메인 변경, 폼 제출을 수행하라는 지시가 아니다.
새 저장소를 만드는 것으로 기존 GASOK 재사용·신규 기여 문제가 해결되지 않는다.

## 9. 34개 skill 적용 분류

실제 디렉터리 기준이다. 모두 `S/.agents/skills/<이름>/SKILL.md`에 있다.
“참고”도 위 오류 검토와 현재 버전 대조를 통과한 부분만 적용한다.

| 실제 skill 폴더 | 분류 | 이유/주의 |
| --- | --- | --- |
| midnightskill | 탐색 | ID와 실제 경로를 구별 |
| compact | 핵심 참고 | 공식 공개/정수 의미로 보정 |
| security | 핵심 질문 | witness trust·binding 점검; crypto 예제 그대로 복사 금지 |
| testing | 핵심 참고 | compiler/runtime 조합, simulator와 proof 구별 |
| midnight-js | 핵심 참고 | 여러 버전이 섞여 installed typings 우선 |
| indexer | 핵심 참고 | exact lookup·decode·lag; v3/v4 단정 금지 |
| example-zk-loan-application | 개념 참고 | attestation 흐름만; 대출액/tier/PIN/브라우저 secret 제외 |
| example-counter | 비교 참고 | headless lifecycle; 오래된 endpoint/seed는 현 설정 아님 |
| example-hello-world | 비교 참고 | 테스트 구조; 앱 재생성/고정 seed 사용 금지 |
| midnight-environment-setup | 진단 참고 | 자동 install/update/start 절차 비활성 |
| multinetwork | 용어 참고 | 네트워크·서비스 구별; 네 네트워크 리팩터링 금지 |
| why-midnight | 설명 참고 | 과장된 device-only/크기/forward-secrecy 제외 |
| zk-vs-fhe-vs-mpc | 설명 참고 | hosted operator 경계를 별도로 설명 |
| midnight-consensus | 배경 | AURA/GRANDPA; validator 운영 불필요 |
| midnight-cryptography | 배경 | node 서명과 Compact/MetaMask 서명 구별 |
| midnight-onchain-logic | 배경 | node/ledger 역할; 앱 로직 이식 금지 |
| midnight-p2p-networking | 배경 | 자체 p2p 운영 범위 아님 |
| midnight-rpc | 진단 참고 | 실제 endpoint method/버전 확인 |
| midnight-storage | 배경 | node DB와 앱 private-state 저장소 구별 |
| midnight-transactions | 개념 참고 | prove/submit/finality/indexing 분리 |
| 1am-wallet | 구조 적용 제외 | 다른 지갑/증명 운영, 별도 승인 필요 |
| react-wallet-connector | 구조 적용 제외 | Vue와 기존 MetaMask 유지 |
| dynamic-midnight-wallet | 제외 | upstream 비활성, React/WaaS 범위 밖 |
| ankr-midnight | 제외 | 명시적 RPC 변경 과업 전엔 불필요 |
| nft | 기능 적용 제외 | GIWA ERC721 책임 유지 |
| token-transfers | 용어 참고 | DUST와 GIWA mKRW 구별; 지급 흐름 이식 금지 |
| example-payment-dapp | 제외 | GASOK 펀딩 모델 아님 |
| example-locker-dapp | 제외 | auth/인자 정적 결함, 채권 상환과 무관 |
| example-leaderboard-dapp | 제외 | localStorage·로컬 verified; 점수 사실성 미검증 |
| example-private-party-dapp | disclosure 비교 | private 인자 설명은 유용하나 실제 template이 뒤처짐 |
| example-private-reserve-auction | disclosure 비교 | 새로운 경매 feature 도입 아님 |
| android-example-voting | 제외 | Android/Kuira와 demo 인증 제한 |
| gsap-core | 제외 | 미등록 애니메이션 자료 |
| gsap-utils | 제외 | 미등록 애니메이션 유틸; 암호 도구 아님 |

## 10. 실제로 만든 하네스와 갱신법

- root `AGENTS.md`: 매 task/후속 prompt에서 짧은 harness와 최신 상태를 읽도록 연결.
- `.cursor/rules/gasok-midnight-reference.mdc`: `alwaysApply: true`로 같은 진입점 연결.
- inner `giwa-midnight/AGENTS.md`: 부모 harness와 현재 운영 설명 연결; 초기 학습
  단계를 매번 재실행하라는 뜻으로 읽히지 않도록 보정.
- `docs/ai/MIDNIGHT_REFERENCE_HARNESS.md`: 작업별 읽기 경로, 금지된 오적용,
  검증 수준, 누락/갱신 처리를 정의.
- `scripts/check-midnight-reference.mjs`: 참조 124개 파일 hash + symlink 2개 대상,
  참조 commit/worktree, skill 목록, 프로젝트 pin 35개, 단일 runtime lock 경로,
  지침 연결/필수 파일을 offline 확인.
- `scripts/midnight-reference-baseline.json`: 검토한 외부 자료와 버전의 기준.
  checker는 이 파일을 갱신하지 않는다. 참조를 새로 검토한 뒤에만 기준을 변경한다.

실행:

```sh
node scripts/check-midnight-reference.mjs
node --test scripts/check-midnight-reference.test.mjs
```

checker가 pass여도 문서의 기술적 내용이나 앱 안전성은 증명되지 않는다.
Git 없는 exact-byte archive는 hash를 검사하되 provenance 미확인 경고를 낸다.
정상 Git checkout이면 commit과 dirty 상태도 확인한다. 파일 누락·변경·버전 이탈은
exit 1이며 자동 설치/삭제/네트워크 접근/서비스 시작은 하지 않는다.
이 검사 결과는 모든 향후 프롬프트가 실제 문서를 읽었다는 실행 증거도 아니다.
새 세션에서 활성 지침을 확인하는 사용자 점검과 코드 테스트를 구분한다.

현재 참조 폴더는 untracked nested Git 저장소다. 기존 root Git의 submodule로
추가하거나 전체 vendor 복사/commit하지 않았다. 새로운 GASOK clone에는 없다.
필요할 때만 다음 **수동 복원 예시**로 검토 버전을 마련할 수 있다. 기존 폴더가
있으면 덮어쓰지 말고 먼저 상태를 확인한다.

```sh
git clone --no-checkout https://github.com/Kali-Decoder/Midnight-Skills.git Midnight-Skills
git -C Midnight-Skills checkout --detach f1649caf7fbfedb79d6976976f8dbef4e19e43f8
node scripts/check-midnight-reference.mjs
```

source tarball이나 상위 폴더 없이 inner repo만 열 때는 발견 범위가 다르다.
GASOK root에서 작업하는 것을 기본으로 하며 개인 전역 Codex/Cursor 설정은 바꾸지 않았다.
공식 근거: [Codex AGENTS discovery](https://developers.openai.com/codex/guides/agents-md),
[skills discovery](https://developers.openai.com/codex/skills),
[Cursor alwaysApply rules](https://cursor.com/docs/rules).

## 11. 검증과 이번 작업의 한계

원본 registry 검사는 32개 등록 항목으로 통과했다. 하네스 checker는 126개 참조
항목·35개 프로젝트 pin·지침 연결을 PASS했고 경고도 없었다. 새 하네스 negative
case tests 14개와 기존 runner/bootstrap 14개, 총 **28개**가 통과했다.
수정 문서 로컬 링크 28개, Node 문법 검사, root/inner Git whitespace 검사도 정상이다.
정확한 명령과 한계는 최신 [CONTEXT](CONTEXT.md)에 기록했다.

앱 소스·Compact·lockfile·generated proving artifact를 바꾸지 않았으므로 전체
앱 재빌드나 지갑을 여는 demo Run을 이 문서 작업의 검사로 실행하지 않는다.
참조 template 빌드, 새 live proof, 체인 제출, 배포, 원격 서비스 재시작은 수행하지 않았다.
과거 2026-09-15 Seller true E2E와 09-17 배포 검증은 기존 기록이며 이번에 재검증한
결과로 바꾸지 않는다. 실제 Buyer/false·복구·제출 새 clone 빌드는 여전히 별도다.

root는 inner 저장소의 commit pointer만 추적한다. 이 작업에서 수정한 inner
`giwa-midnight/AGENTS.md`는 inner 작업 트리의 파일 변경이며 pointer를 commit하지
않았다. 마지막 root/inner status는 작업 종료 시 별도로 재조회한다.
