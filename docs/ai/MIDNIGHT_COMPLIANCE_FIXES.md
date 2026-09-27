# Midnight 준수 검토 후 수정·검증 결과

기준일 **2026-09-18**, 사용자 후속 지시 **“전부 테스트후 수정하고 보고해”**에 따라
[최초 검토 C01–C13](MIDNIGHT_COMPLIANCE_REVIEW.md)의 구현을 수정했다.
최초 검토 문서는 수정 전 증거로 보존한다. 현재 판정은 이 문서와 최신 TODO가 우선한다.

**소스 수정과 격리 검증은 완료했다. 공개 Preview 적용과 브라우저 최종 검증은 미완료다.**
특히 서명 회로의 검증 키가 바뀌었으므로 기존 앱에 새 코드만 배포하면 정상적으로
호환성 검사에서 중단된다. 기존 계약·지갑·DB를 삭제하거나 자동 재배포하지 않았다.
이 보고서는 보안 인증서나 공개 데모의 최종 승인 기록이 아니다.

## 1. 레벨별 현재 판정

| 레벨 | 현재 상태 | 남은 경계 |
| --- | --- | --- |
| L0 필수 | canonical reduction 제약, 만료 정합성, Provider 2 정책, 계정·요청 결합을 수정하고 회귀 검증 | 새 제약은 기존 Preview 계약에 아직 적용되지 않음. 공개 경로 C10 미완료 |
| L1 데모 신뢰성 | 본문까지 deadline/취소, 불확정 접수 복구, 저장 큐 회복, 조회 장애 회복, 재시작/ACK 통합 회귀 통과 | 실제 호스팅 재시작·Indexer 지연·브라우저 장애 리허설 미완료 |
| L2 품질 | full compile 산출물 검증을 build에 강제, Preprod 진입점 차단, 세션 메모리 정리, 버전 기준 보강 | 변경 파일·생성 키·manifest를 내부 저장소에 함께 커밋해야 새 클론에서도 재현 가능 |
| L3 운영 확장 | 기존 데모 범위 유지 | 실제 기관, multi-tenant, 키 회전, 질의 예산, 운영 보존 정책은 별도 설계 |

## 2. C01–C13 처리 결과

| ID | 수정·검증 | 판정 |
| --- | --- | --- |
| C01 | challenge quotient 7비트/remainder 248비트, quotient 상한·마지막 limb 상한·재구성 제약. 11개 경계 회귀, 실제 ZKIR 확인, full compile, 실제 증명/검증 네 경우 | 코드 수정 완료; 기존 배포 적용 별도 |
| C02 | 현재 요청 상태와 반응형 시각을 함께 검사. true/false 캐시 모두 만료 시 유효 결과 표시 제거, 탭 복귀 재평가 | 수정·회귀 완료 |
| C03 | prove 전송 후 JSON/용량/schema/session 오류도 불확정 접수로 유지. 같은 session status/recover 사용 | 수정·회귀 완료 |
| C04 | UI Midnight 요청 10초/64KiB, Spring ReadClient 전체 응답 deadline/64KiB와 실제 구독 취소. stalled headers/body/trickle 회귀 | 수정·회귀 완료 |
| C05 | Provider 비동기 권한 조회/서명 후, Read API 조회 후, Spring 재조회 및 CAS 후 현재 권한·fingerprint·기한 재확인 | 수정·회귀 완료 |
| C06 | 현재 owner 저장 실패는 호출자에게 전달하되 다음 저장 큐는 회복. 실제 gateway의 첫 저장 실패→다음 성공 검증 | 수정·회귀 완료 |
| C07 | 취소 가능한 읽기 전용 Indexer transport, 10초/2MiB/단일 작업. 실제 연결 종료·다음 조회 성공·degraded→healthy 검증 | 수정·회귀 완료 |
| C08 | full compiler 0.31.1 실행으로만 manifest 기록; build에서 소스 2개/산출물 20개 hash·버전·완전성 검사. Linux 이미지에서도 통과 | 수정·회귀 완료 |
| C09 | auth token+generation, 동일 토큰 재로그인/다른 탭 변경, 늦은 응답·서명·batch 차단, 결과와 선택 요청의 전체 문맥 비교 | 수정·회귀 완료 |
| C10 | 실제 gateway/runtime/암호화 outbox/owner 파일의 재시작·ACK 유실 등 6개 통합 회귀, 실제 Prover/메모리 원장 네 경우 | 격리 검증 보강; 공개 브라우저→Preview 미완료 |
| C11 | 세 legacy Preprod npm 진입점은 연결 전 실패. wallet/provider 초기화에서도 Preview/undeployed만 허용 | 수정·회귀 완료 |
| C12 | 별도 request correlation Map 제거, bounded session record로 통합. 자동 만료/완료/purge 및 취소 재시도 수명 검증 | 수정·회귀 완료 |
| C13 | hosted Read API·Spring·UI 모두 Provider 2만 결과 수용. generic/local의 등록 Provider 정책은 유지 | 데모 정책 명시·회귀 완료 |

### C01의 구체적 제약 근거

`B = 2^248`, native Field의 최댓값을 `M`이라 하면:

```text
M = 52435875175126190479447740508185965837690552500527637822603658699938581184512
M = 115 × B + 419897588050555816515462086314444731729426576509415695503572133883854979072
```

새 회로는 `0 ≤ q ≤ 115`, `0 ≤ r < B`와 `q=115`일 때 마지막 나머지 상한을
함께 제약한다. 따라서 정수 `qB+r`가 `[0,M]`에 있고, 이 구간의 challenge와
Field에서 같으면 정수로도 같다. quotient 타입만 줄이는 것으로 끝내지 않았다.
서명자는 기존대로 challenge를 `2^248`로 나눈 나머지를 사용한다.

근거: [schnorr.compact](../../giwa-midnight/contract/src/schnorr.compact),
[generated ZKIR](../../giwa-midnight/contract/src/managed/zkloan-credit-scorer/zkir/verifyEligibility.zkir),
[경계 테스트](../../giwa-midnight/contract/src/test/schnorr-reduction.test.ts).
ZKIR의 240–258줄에 bit/range/reconstruction 제약이 있고 260줄의 EC scalar로 연결된다.
위조 서명 공격을 재현한 것은 아니며, 전체 암호 프로토콜의 형식 검증으로 표현하지 않는다.

`verifyEligibility`의 prover/verifier 키가 변경됐다. 나머지 세 회로 키는 같다.
SDK의 기존 `findDeployedContract`도 키 불일치를 거절한다. 추가한
[호환성 검사](../../giwa-midnight/cli/src/hosted-demo/contract-compatibility.ts)는 실제
배포 operation과 네 로컬 verifier bytes를 비교해 고정 오류 코드로 원인을 드러낸다.
불일치 시 `CONTRACT_VERIFIER_MISMATCH`, 조회/비교 불가 시
`CONTRACT_COMPATIBILITY_UNAVAILABLE`이고 초기화·재배포로 우회하지 않는다.

### 장애와 복구에서 유지한 조건

- 접수 응답이 손상돼도 같은 세션을 조회한다. 서버에서 이미 접수된 작업을
  timeout/abort로 되돌렸다고 주장하거나 새 증명을 자동 제출하지 않는다.
- Indexer 읽기 실패 시 internal Read health와 gateway `/ready`는 503,
  gateway `/health`는 다른 의존성이 살아 있으면 200이다. 지갑을 재시작시키지 않으며
  기존 결과 조회가 가능해야 다음 성공으로 회복한다. health는 마지막 실제 관측 기준이다.
- Read 경고 중 config의 runtime은 ready를 유지하고 UI는 지연 경고를 표시한다.
  새 증명도 기존 동작처럼 가능하지만 결과 조회 성공을 보장하지 않는다.
- owner 파일은 기존대로 policy expiry+1일에 정리한다. RAM session, encrypted outbox,
  MySQL의 수명은 각각 다르며 전체 저장소 즉시 삭제를 의미하지 않는다.
- finalization → encrypted outbox → Spring durable SUBMITTED 또는 already-COMPLETED
  확인 → ACK를 유지한다. 독립 조회만 COMPLETED를 결정한다.
- broadcast 후 durable capability 저장 전 중단되면 proving reservation만 남을 수 있다.
  이 경우 재증명은 거절하며 capability 자동 복원은 아직 없다. 파일을 지워 우회하지 않는다.

## 3. 실제 실행한 검증

모든 Node 검증은 **22.21.1**, Java 검증은 **17**이다. 겹치는 focused 재실행은
합계에 중복 계산하지 않는다. 실제 Prover 네 경우는 아래 자동 테스트 합계와 별도다.

| 범위 | 최종 테스트 수 | 결과 |
| --- | ---: | --- |
| 루트 참조 하네스/runner/초기 fixture | 28 | 통과 |
| Compact 산출물 gate | 5 | 통과 |
| Compact 계약 | 50 | 통과 |
| Attestation API | 90 | 통과 |
| Read API | 77 | 통과 |
| CLI/Bridge/hosted gateway/복구 | 213 | 통과 |
| Spring 전체 | 114 | 통과; Midnight 49 포함 |
| Vue 전체 및 추가 banner 회귀 | 257 | 통과 |
| **합계** | **834** | 선택 범위 내 실패·skip 없음 |

처음의 기존 테스트 644개보다 동일 범위 회귀가 125개 늘었고, Spring 전체로
확대하면서 기존 비-Midnight 테스트 65개도 추가 실행했다. CLI의 외부 지갑/체인
`zkloan.api.test.ts`는 명시적으로 제외했으므로 “모든 live 테스트 통과”로 쓰지 않는다.

수정 전 실패도 확인했다: UI 8개, Spring 7개(별도 수정한 CAS fixture 2개도 원본에
대해 실패), owner queue, artifact 부모 symlink 회귀. 새 테스트를 녹색 구현에만
맞춘 것은 아니다. 최초 검사 중 생긴 fixture/type 오류는 정정 후 해당 검사를 다시 통과했다.

### 실제 Proof Server와 verifier

기존 서비스와 분리된 임시 컨테이너 `midnightntwrk/proof-server:8.1.0`,
loopback `16300`, fresh in-memory keys와 합성 데이터만 사용했다. 볼륨·지갑·DB 미연결.
[proof-check](../../giwa-midnight/cli/src/hosted-demo/proof-check.ts)가 임시 배포와 Provider
등록 proof를 만든 뒤 실제 ledger 8.1.0의 `wellFormed`와 `apply`를 실행했다.

| 대상 | fixture | 공개 결과 | 증명 크기 | 증명·검증·반영 시간 |
| --- | --- | --- | ---: | ---: |
| Seller | steady | true | 5,757 bytes | 1,523ms |
| Seller | stretched | false | 5,757 bytes | 1,615ms |
| Buyer | steady | true | 5,757 bytes | 1,513ms |
| Buyer | stretched | false | 5,757 bytes | 1,582ms |

네 경우 모두 `contractProofVerified=true`, `isolatedLedgerApplied=true`,
`submittedToNetwork=false`. 실제 contract/native proof와 크기 제한을 검사하되
funding balance·wallet signature 검사는 격리 fixture에서 비활성화했다.
따라서 자금 지급·지갑 서명·체인 수락·브라우저 E2E의 증거가 아니다.
초기 ledger/Compact WASM 객체 전달 오류를 canonical serialization으로 수정한 뒤
최종 네 경우가 통과했다. 전용 Prover 컨테이너는 테스트 후 종료·자동 삭제했다.

### 재시작 통합 fixture

[hosted-demo-recovery.integration.test.ts](../../giwa-midnight/cli/src/test/hosted-demo-recovery.integration.test.ts)는
실제 HTTP gateway/runtime/outbox/암호화 파일을 사용한다. Spring authority와 proof
operation은 fake다. durable 저장 전 complete/recover/ACK 차단, 저장 후 재시작 복구,
SUBMITTED/already-COMPLETED ACK, 실제 ACK HTTP 응답 유실 뒤 중복 ACK, 다른 actor 거절,
불확정 proving 재증명 차단, owner 첫 저장 실패 뒤 회복을 검증했다.
정상 종료 후 인스턴스를 다시 만드는 테스트이며 OS kill·전원 장애·실체인 테스트는 아니다.

### 빌드·패키징

- compiler 0.31.1 full compile 통과. `--skip-zk` 미사용. source 2개/artifact 20개
  manifest가 생성됐고 일반 contract build가 이 manifest를 먼저 확인한다.
- Midnight 네 workspace build/typecheck, Vue production build 및 전체 lint,
  Spring 전체 Gradle build/bootJar 통과.
- 실제 통합 Docker build `gasok-compliance:20260918` 통과. 새 Linux `npm ci`와
  mandatory artifact gate, 네 Node build, Java bootJar가 실행됐다.
  이미지 config ID `sha256:3785173c9da70008da404127f0852634b24232dfa27fffacc71f420c1a6894b6`.
  이는 로컬 이미지이며 Railway에 게시·실행하지 않았다.
  비관리자 UID/GID 10001, network none, volume 없이 이미지 내부 artifact 검사도 통과했다.
- 참조 126항목 무결성 통과. 기존 SDK 4.1.1에 API의 직접 protocol 의존성 선언만
  추가했고 두 manifest/lock pin을 검토해 기준을 **35→37**로 확장했다. 버전 업데이트 없음.
- 변경 문서의 로컬 링크 49개와 root/Midnight/API/UI `git diff --check` 통과.
- 기존 source-map, Restify http_parser, Gradle deprecation 경고는 남아 있다.
  증명/테스트 실패로 해석하지 않으며 무관한 의존성 일괄 업그레이드는 하지 않았다.

## 4. 재실행 명령

Node 22.21.1과 Java 17을 선택하고 실행한다. 테스트용 localhost 서버를 허용해야 한다.
아래는 검증 명령이며 기존 운영 데모를 Run하는 명령이 아니다.

```sh
# GASOK root
node scripts/check-midnight-reference.mjs
node --test scripts/check-midnight-reference.test.mjs scripts/midnight-demo.test.mjs scripts/prepare-midnight-demo.test.mjs giwa-midnight/scripts/check-compact-artifacts.test.mjs

# giwa-midnight root: 재컴파일은 Compact 소스를 수정했을 때만
npm run compact --workspace=contract
node scripts/check-compact-artifacts.mjs
npm run build --workspace=contract
npm run build --workspace=api
npm run build --workspace=attestation-api
npm run build --workspace=cli

# contract, attestation-api, api 각 디렉터리
../node_modules/.bin/vitest run
# cli 디렉터리
../node_modules/.bin/vitest run --exclude '**/zkloan.api.test.ts'

# giwa-ui
npm test
npm run build
node node_modules/oxlint/bin/oxlint .
node node_modules/eslint/bin/eslint.js .
```

Spring은 `SPRING_PROFILES_ACTIVE=test`, `MIDNIGHT_RUNTIME_ENABLED=false`,
임시 H2 URL/driver, `GIWA_RPC_URL=http://127.0.0.1:1` 환경에서
`./gradlew --offline --no-daemon build`를 실행했다. 실제 MySQL 설정으로 대체하지 않는다.
실제 proof-check는 격리한 8.1.0 Prover URL을 지정하고
`npm run demo:proof-check --workspace=cli`로 실행한다. 일반 프롬프트마다 실행할 필요는 없다.

## 5. 공개 적용 전에 남은 일

1. 현재 writer와 미완료 요청/outbox/reservation을 확인하고 상태를 보존한다.
   같은 지갑으로 로컬 Run과 Railway를 동시에 기동하지 않는다.
2. 새 verifier와 기존 Preview operation을 비교해 적용 방식을 결정한다. 기존 주소·요청
   결합을 보존하는 maintenance-key 업데이트 가능성을 먼저 검토한다. SDK 4.1.1은
   operation별 key maintenance API를 제공하지만, 이 작업에서 권한·실제 트랜잭션·
   중단/재개 과정을 실행해 검증한 것은 아니다. 자동 새 계약 배포로 대신하지 않는다.
3. 검토된 Preview 키 전환과 같은 버전의 통합 앱/UI를 함께 적용하고 4개 key의 실제
   일치·ready를 확인한다. 지갑/Provider/회사 secret/DB 초기화는 필요하지 않은 한 금지한다.
4. 공개 브라우저에서 Seller/Buyer × true/false, 만료, 접수/ACK 유실, 재시작,
   Indexer 지연을 검증하고 역할·배포 버전·최종 요청 상태 증거를 남긴다.

이 공개 변경과 실제 사용자 지갑 동의는 이번 소스 수정·격리 테스트에 포함되지 않았다.
기존 배포를 최신 보안 수정이 적용된 상태라고 발표하지 않는다. 구체적 실행 순서는
[DEPLOYMENT](DEPLOYMENT.md)와 현재 TODO를 따른다.

## 6. 변경 파일과 Git 경계

- `giwa-midnight`: Compact 원본/generated keys/ZKIR, witness 설명, Provider/Read API,
  CLI runtime/session/owner persistence/network guard/gateway/bootstrap/proof-check,
  artifact manifest/checker 및 회귀 테스트. API package/lock에 고정 의존성 선언 추가.
- `giwa-api`: `LocalMidnightReadClient`, `MidnightProofRequestService`와 두 테스트 파일.
  DB schema·GIWA 자산 로직 변경 없음.
- `giwa-ui`: Midnight 상태/결과/요청/계정 경계와 관련 shared API/auth/store,
  반응형 clock·banner 및 회귀 테스트. Vue 유지, 기존 GIWA의 기본 요청 제한은 유지.
- root: 이 결과서, 최초 검토의 후속 링크, TODO/CONTEXT/DEPLOYMENT/하네스·참조 기준.
  앞선 비교/하네스의 미커밋 변경은 보존했다. 구조 변경이 없어 DECISIONS는 변경하지 않았다.

root는 submodule 커밋 포인터만 추적하며, 실제 앱 파일 변경은 각 내부 저장소에서
관리된다. root와 `giwa-midnight` 모두 수정/새 파일이 있다. API/UI도 수정 상태이고
GIWA Solidity와 Midnight-Skills 원본은 변경하지 않았다. 커밋·푸시·gitlink 변경 없음.
새 파일과 generated key를 함께 커밋하기 전에는 다른 클론에 이 결과가 전달되지 않는다.
