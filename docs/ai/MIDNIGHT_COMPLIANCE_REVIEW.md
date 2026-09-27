# Midnight 구현 준수 검토

> **후속 상태:** 같은 날 사용자의 수정 지시에 따라 C01–C09/C11–C13 코드를 수정하고
> 테스트했다. 현재 결과는 [수정·검증 보고서](MIDNIGHT_COMPLIANCE_FIXES.md)와 최신 TODO를
> 따른다. 아래 내용은 **수정 전 최초 검토 기록**이며, 공개 배포/C10은 계속 미완료다.

최초 검토일: **2026-09-18**. 대상은 당시 GASOK의 Midnight 구현 전체와 연결되는
Spring·Vue·GIWA·실행/배포 경계다. 사용자가 요청한 **검토와 개선 방향**을 기록하며,
이번 검토로 애플리케이션 소스·의존성·계약·배포를 변경하지 않았다.

**판정: 승인된 구조와 주요 인증·데이터 경계는 대체로 준수한다. 다만 전체를
“준수 완료”로 판정할 수는 없다.** 서명 회로의 제약 건전성은 추가 확인이 필요하고,
만료 결과 표시·비동기 처리 중 만료·응답 유실·시간 제한·저장 실패 복구에 빈틈이 있다.
기존 테스트 통과와 이 미완료 항목은 동시에 성립한다.

참조 저장소 자체의 설명·오류·버전 비교는 [Midnight-Skills 비교](MIDNIGHT_SKILLS_REVIEW.md),
매 작업의 적용 순서는 [참조 하네스](MIDNIGHT_REFERENCE_HARNESS.md)를 따른다.
이 문서는 코드 감사 인증서나 실제 Preview 재검증 완료 보고서가 아니다.

## 1. 판정 기준과 레벨

요구사항의 강도와 수정 우선순위를 구분한다. `Midnight-Skills` 예제와 다르다는
이유만으로 미준수로 판정하지 않는다. 사용자 승인/ADR-023, 현재 요구사항,
버전에 맞는 공식 문서가 커뮤니티 예제보다 우선한다.

| 요구 레벨 | 의미 | 이번 판정 |
| --- | --- | --- |
| **L0 필수** | 인증·요청 결합·서명/회로 검증·원문 비공개·결과 의미·네트워크·GIWA 분리 | 주요 경계 준수. C01 건전성 미검증, C02/C05 만료 정합성 부분 준수, C10 실제 경로 미검증 |
| **L1 데모 신뢰성** | Run/배포·재시작·접수 유실·전달/ACK·timeout·장애 후 복구 | 정상 경로와 durable 복구 기반 준수. C03/C04/C06/C07 예외 경로 부분 준수 |
| **L2 품질·회귀 방지** | 소스와 산출물 연결·테스트 범위·화면 응답 결합·세션 변경·위험한 예전 명령 차단 | 버전 고정과 참조 하네스 준수. C08/C09/C11–C13 보강·정책 명확화 필요 |
| **L3 운영 서비스 확장** | 실제 기관 신뢰·회사별 격리·키 회전·질의 예산·운영 보존 정책 | 현재 합성 데이터 해커톤 데모의 대상 외. 실제 데이터 도입 전 별도 설계 필요 |

상태는 **준수**(검토한 구현/검증 근거 있음), **부분 준수**(정상 경로는 있으나
구체적인 예외/누락 존재), **미준수**(해당 요구를 충족하지 않는 경로 확인),
**미검증**(완료 판정에 필요한 근거 부족), **대상 외**로 구별한다.
영역 전체는 부분 준수여도 그 안의 특정 경로는 미준수일 수 있다.

우선순위 **P1**은 데모를 최종 검증 완료라고 말하기 전에 해결/판정할 항목,
**P2**는 이어서 개선할 복구·품질 항목이다. **P0**는 즉시 중단이 필요한 확정적
치명 결함에 사용한다. 이번에 P0를 재현하지 않았다는 사실은 P0가 없다는 보증이 아니다.
C01의 전문 검토 결과에 따라 우선순위와 사용 판단을 다시 정해야 한다.

## 2. 실제 스캔 범위와 근거 수준

| 저장소 | 검토 HEAD | Git 추적 항목 | 상세 검토 대상 |
| --- | --- | ---: | --- |
| GASOK root | `a4cdb7746d9aba80ff6920cab69679a28fe68148` | 58 | 지침/요구사항, runner, 초기 준비, Docker/Railway/IntelliJ 구성 |
| giwa-midnight | `6c12b35acc64614ac53f4e3836fac0f8a8738a77` | 128 | Compact 2개·witness·generated 제약, Provider, Read API, CLI, gateway, 지갑/상태/outbox, 관련 테스트 |
| giwa-api | `6637fefed90469d0765bfad39814f81e88330f13` | 113 | JWT/권한, 요청 상태/SQL, capability 암호화/조회, 내부 authority, 자동 실행, GIWA 연결 |
| giwa-ui | `d223f0a2a650c23bb33845f5a0bca1c9a5a7d3ad` | 123 | Midnight 서비스 11개·composable 5개, 현재/legacy 화면, 라우트, API/auth/store, MetaMask/GIWA 연결 |
| giwa-contrract | `b15a2fbc5bb10e665a8093f5e60a8a0e9c6e099d` | 19 | 자산·채권·펀딩·상환 계약과 Midnight의 역할 분리 |
| Midnight-Skills | `f1649caf7fbfedb79d6976976f8dbef4e19e43f8` | 126 | 직전 전수 비교의 34 skills·5 references·3 templates와 현재 무결성 재확인 |

숫자는 각 저장소의 추적 항목이며 root에는 네 gitlink가 포함된다. 직전 하네스 작업의
미커밋 문서/지침은 현재 작업 트리에 포함되어 있다. 전체 목록과 관련 내용 검색 후
Midnight 실행 경로를 상세히 읽었고, 참조 감사의 결과를 현재 소스와 다시 대조했다.
모든 의존성·생성 바이너리·CSS 한 줄까지 독립 검증했다는 의미는 아니다.

검토 중 `.env`, 실지갑/키/DB/운영 로그를 수집하지 않았다. 실제 데모 Run, 외부
Provider/Indexer 호출, 지갑 서명, 새 증명/체인 제출, 배포는 실행하지 않았다.
테스트용 localhost 서버와 H2 메모리 DB는 실제 데모 서비스와 구별한다.
정적 경로 확인, 격리 재현, 기존 테스트, 과거 live 기록을 아래에서 구별한다.

## 3. 이미 준수하는 항목

아래 판정은 표시된 경계에 한정한다. 예를 들어 인증 통과 테스트는 서명 회로의
건전성까지 증명하지 않으며, 암호화 저장은 운영자에게 원문이 숨겨진다는 뜻이 아니다.

| 항목 / 레벨 | 판정·구현 근거 | 유지할 사항 |
| --- | --- | --- |
| Vue와 GIWA 자산 흐름 / L0 | 준수. Vue 유지, `FundingView`는 증명 화면 연결만 제공. Solidity가 NFT/펀딩/상환 담당 | Midnight를 자동 펀딩 승인이나 새 자산 시스템으로 바꾸지 않기 |
| 승인된 네트워크 / L0 | 현재 managed 실행 경로 준수. runner·hosted config는 Preview/undeployed만 허용 | C11의 예전 Preprod 진입점은 별도 방어 보강 |
| 합성 데이터와 설명 / L0 | 준수. `hosted-demo/config.ts:48`, gateway `:154–163`의 지정 profile만 수용 | 가상 기관이며 운영 서버/Prover가 합성 원문 처리. 은행 검증 주장 금지 |
| hosted 사용자 인증 / L0 | 준수. gateway `:149–160` JWT 전달→Spring 최신 권한 검사, `:173–182` actor/request/session 결합 | Origin/localhost/공개 UI 헤더를 인증으로 대체하지 않기 |
| 내부 서비스 분리 / L0 | 준수. Spring loopback, Provider 임시 loopback 포트, Read API 내부 토큰 경계 | public proxy가 내부 authority/Read/legacy 경로를 노출하지 않게 유지 |
| 역할 동의 / L0 | 준수. EIP-712 전체 요청/역할/지갑/배포/기준/만료 결합과 GIWA canonical 역할 확인 | EIP-712는 Provider 검증. Compact가 직접 MetaMask 서명을 검증한다고 표현하지 않기 |
| 공개 원문 최소화 / L0 | 준수. Compact ledger는 결과 key·boolean·Provider·버전·시각과 관리용 공개 상태. 재무 원문을 ledger에 저장하지 않음 | 공개 시각/기준/반복 질의의 추론 가능성은 남음 |
| 브라우저/DB 저장 / L0 | 준수. hosted UI는 profileId만 전달, capability는 일시 메모리. MySQL은 공개 요청과 암호화 envelope | 기존 로그인 JWT 저장과 GIWA 공개 거래 복구 기록을 금융 witness 저장으로 오분류하지 않기 |
| 저장 암호화/결합 / L0 | 준수. AES-GCM, 요청·회사·역할·지갑·만료 AAD, HMAC fingerprint, 파일 권한/원자적 쓰기 | 운영자는 키와 synthetic witness를 처리할 수 있음 |
| 정책·배포·audience 결합 / L0 | 구현 준수. Compact의 domain-separated hash, Provider 11-field 서명, Read capability 재계산, Spring 요청 일치 | C01 때문에 전체 암호학적 건전성 확정은 보류 |
| replay·Provider 관리 / L0 | 구현 준수. exact eligibility key 재사용 거절, admin secret 제약, 잘못된 Provider key 거절, block-time expiry | 부정 입력/관리자 테스트와 C01 전문 검토는 별개 |
| 유효한 `false` / L0 | 정상 경로 준수. 미충족은 실제 boolean 결과이며 거절/실패/만료와 분리 | C02 만료 캐시, C05 완료 직전 만료를 보완 |
| finality/독립 조회 / L0 | 정상 경로 준수. 실제 finalization 후 outbox, exact lookup과 metadata 확인 후 Spring COMPLETED | tx 문자열이나 submit 응답만으로 verified 표시 금지 |
| 전달/ACK / L1 | 준수 기반. encrypted outbox→Spring durable SUBMITTED 또는 already-COMPLETED 확인→ACK | C03/C04 예외에서도 같은 세션/결과를 복구하고 재증명하지 않기 |
| 재시작/상태 보존 / L1 | 준수 기반. 지갑 checkpoint·private state·pending deployment 주소·reservation/outbox 보존 | C06/C07 장애 복구 보완. 로컬과 Railway 공유 지갑 동시 Run 금지 |
| 한 번 Run/한 앱 배포 / L1 | 구현 준수. IntelliJ Spring lifecycle, runner, 단일 Docker 이미지, Railway replica 1, 기존 MySQL/Vercel | 현재 변경 없는 배포 상태를 이번에 재배포/실기동 검증한 것은 아님 |
| 버전/참조 통제 / L2 | 준수. Node 22.21.1, SDK 4.1.1, prover/ledger 8.1.0, runtime 0.16.0, 단일 onchain runtime 3.0.0 | reference checker 통과는 코드 정확성 인증이 아님 |

언어 판단은 [공식 explicit disclosure](https://docs.midnight.network/compact/reference/explicit-disclosure)를
따른다. circuit/constructor 인자도 private witness 입력이 될 수 있고 `disclose()` 자체는
게시 동작이 아니다. witness를 검증해야 한다는 기준은
[공식 Smart contract security](https://docs.midnight.network/compact/smart-contract-security),
버전 조합은 [공식 support matrix](https://docs.midnight.network/relnotes/support-matrix)와 대조했다.

## 4. 우선 개선·추가 검증 항목

| ID | 우선순위 / 레벨 | 상태 | 핵심 내용 |
| --- | --- | --- | --- |
| C01 | P1 / L0 | 미검증 | Schnorr challenge reduction의 canonical quotient 제약 |
| C02 | P1 / L0 | 부분 준수; 만료 캐시 경로 미준수 | 만료 후에도 기존 성공 카드가 유효한 결과처럼 남음 |
| C03 | P1 / L1 | 부분 준수 | 접수된 prove의 JSON/크기/schema 오류가 같은 세션 복구로 이어지지 않음 |
| C04 | P1 / L1 | 부분 준수 | UI→Spring 및 Spring→Read의 응답 본문까지 포함한 시간 제한 |
| C05 | P1 / L0·L1 | 부분 준수; late-COMPLETED 경로 미준수 | 비동기 조회/서명 중 만료를 마지막 응답 시점에 다시 검사하지 않음 |
| C06 | P2 / L1 | 부분 준수 | owner 저장 큐의 한 번 실패가 이후 쓰기를 계속 실패시킴 |
| C07 | P2 / L1 | 부분 준수 | 끝나지 않는 Indexer 조회 뒤 Read API가 계속 busy에 갇힐 수 있음 |
| C08 | P2 / L2 | 부분 준수 | 일반 build와 Compact 소스/산출물 검증이 연결되어 있지 않음 |
| C09 | P2 / L2 | 부분 준수 | UI 결과 결합과 계정 변경 시 늦은 응답/후속 동작 방어 |
| C10 | P1 / L0·L1 | 미검증 | Buyer·valid-false·장애 복구의 현재 공개 브라우저/Preview 증거 |
| C11 | P2 / L2 | 부분 준수 | 금지된 Preprod로 연결되는 옛 CLI 명령이 실행 가능한 상태로 남음 |
| C12 | P2 / L2 | 부분 준수 | 자동 session 만료와 correlation metadata 정리 수명이 다름 |
| C13 | P2 / L2 | 미검증; 정책 미확정 | 발급은 Provider 2로 고정하지만 결과 소비자는 다른 등록 Provider도 허용 |

### C01 — 서명 회로의 추가 제약 검토

근거: `giwa-midnight/contract/src/schnorr.compact:24,45–55`,
`contract/src/witnesses.ts:48–54`, generated `contract/index.js`의 reduction 처리.
quotient가 `Field`이고 reconstruction equality도 Field 연산이며, 소스에 canonical
small-integer quotient를 보장하는 명시적 범위 제약이 보이지 않는다.
정직한 TypeScript witness가 정수 나눗셈을 하는 것은 회로 제약을 대신하지 않는다.

**현재는 정적 우려다. 위조 서명 수락이나 악용 가능한 취약점을 재현했다고 주장하지
않는다.** 정상 fixture·서명 변조 테스트·과거 성공 proof만으로 이 우려가 해소되지 않는다.

개선: Compact/유한체 제약을 이해하는 검토로 canonical reduction의 유일성과
범위·modular equality 의미를 확인한다. 필요 시 검토된 constrained conversion으로
수정하고 관련 생성 파일을 함께 재생성한다. 단순 quotient 타입 축소만으로 충분하다고
가정하지 말고 전체 정수 표현과 Field 연산을 검증한다.

완료 기준: 제약 근거 문서, 독립적으로 통제한 witness에 대한 방어적 회귀 검증,
고정 compiler full compile, 정상 true/false 실제 proof 검증. 기존 계약/Provider/
capability에 대한 산출물·배포 영향은 별도 판단한다. 이번에는 회로/계약을 바꾸지 않았다.

### C02 — 만료된 결과 카드

근거: `giwa-ui/src/composables/useMidnightProofMailbox.js:61–73,124–130`은
resolution 캐시를 유지하고 목록만 갱신한다. `MidnightProofRequestsView.vue:451–468`은
캐시 존재만으로 초록색 “요청 기준 충족”을 표시한다. 같은 카드가 EXPIRED로 바뀌어도
이 결과는 남는다. 시간 표시는 있으나 현재 유효/과거 결과를 구별하지 않는다.

영향: Funder가 만료된 결과를 현재 유효한 적격 결과로 오해할 수 있다.
**화면 정합성 문제**이며 자동 펀딩 승인 우회나 체인 만료 우회가 확인된 것은 아니다.
정적 경로로 확인했고 실제 공개 화면에서 시간 경과를 재현하지 않았다.

개선/완료 기준: request 상태와 result/request expiry를 반응형 시계로 함께 판단한다.
만료 시 숨기거나 명시적인 과거 결과로 바꾸고 탭 복귀 때도 재평가한다.
true/false 각각 조회 후 네트워크 없이 만료, 다음 poll의 EXPIRED,
숨김→복귀를 검사해 현재 유효한 성공 표시가 남지 않게 한다.

### C03 — prove 접수 응답이 손상된 경우

근거: `giwa-ui/src/services/midnight/proofBridgeV2.js:352–440,554–573`,
`useMidnightAssignedProof.js:320–347`. network/timeout/non-JSON에는
`requestMayHaveSucceeded`가 붙지만 JSON parsing·초과 크기·schema/session 오류에는
기본 false인 오류가 전달된다. 화면은 이를 terminal failure로 보고 새 시작을 허용한다.

영향: 서버는 증명을 접수했는데 사용자는 실패를 보고 동일 세션 복구를 놓칠 수 있다.
서버의 reservation/dedup는 유지되므로 중복 체인 제출이 발생했다고 단정하지 않는다.
이 항목은 정적 경로 확인이며 새 응답 손상 주입으로 재현하지 않았다.

개선/완료 기준: 전송 전 입력 오류와 전송 후 불확정 응답을 분리한다. 접수 가능성이
있으면 잘못된 payload를 수용하지 않으면서도 같은 session을 status/recover로 확인한다.
잘린 JSON·잘못된 session/schema·선언/스트림 크기 초과·네트워크 단절 각각에서
challenge/sign/prove가 추가 호출되지 않는 회귀 테스트가 필요하다.

### C04 — 요청 전체 수명에 시간 제한 적용

브라우저 근거: `giwa-ui/src/services/api.js:13–53`에는 자체 timeout/body cap이 없다.
`useMidnightProofMailbox.js:112–151`의 list가 끝나지 않으면 다음 poll도 멈추며,
`useMidnightAssignedProof.js:180–221`의 complete가 멈추면 안전한 재전달 상태로 못 간다.
컴포넌트 종료 시 abort하는 것만으로 대기 중인 화면에 시간 제한이 생기지는 않는다.

Spring 근거: `LocalMidnightReadClient.java:69–84`는 request/connect timeout과 byte cap을
설정하지만 `BodyHandlers.ofInputStream()` 반환 뒤 `readNBytes()`가 따로 수행된다.
**격리 재현 완료:** 실제 컴파일된 client에 timeout 200ms를 설정하고 localhost fixture가
헤더와 본문 1byte만 보냈을 때, 헤더 수신 1,000ms 뒤에도 호출이 blocking 상태였다.
이는 본문까지 포함한 제한 시간 요구를 충족하지 않는 경로다. fixture를 해제하고
stream/서버/thread를 정리했으며 실제 Read API/Indexer는 호출하지 않았다.
브라우저 쪽은 정적 경로 확인이며 신규 stall 주입은 하지 않았다.

개선/완료 기준: 헤더와 본문을 합친 제한 시간·크기·취소를 보장한다. timeout 뒤에는
capability와 동일 요청 복구를 보존하고 durable complete 확인 전에 ACK하지 않는다.
헤더 미응답·본문 일부 후 정지·과대 본문·연결 종료를 테스트한다. Spring은 worker와
stream이 실제로 정리되는지도 확인해 background 작업 누적을 피한다.

### C05 — 비동기 처리 전후의 만료 재검사

세 위치를 같은 시간 경계 문제로 묶되 영향은 다르다.

- Provider `attestation-api/src/server.ts:449–456`이 먼저 만료를 확인한 뒤
  `:484`에서 GIWA를 기다리고 `:518–558`에서 서명/응답한다. 마지막 시각 검사가 없다.
  지연 중 만료된 challenge에 대한 불필요한 서명/증명 시도가 가능하다. Compact의
  block-time expiry 검사가 있으므로 만료 proof의 체인 수락을 뜻하지 않는다.
- Read API `api/src/server.ts:130–136,170`은 조회 전 만료만 검사한다.
  조회 중 expiry를 넘으면 200 결과를 반환할 수 있다.
- Spring `MidnightProofRequestService.java:274–287`은 첫 SUBMITTED→COMPLETED의
  SQL CAS에는 최신 expiry 조건이 있으나, 이미 COMPLETED인 재조회와 경쟁 후
  COMPLETED fallback에는 동일한 최종 만료 검사가 없다.

**Spring의 이미-COMPLETED 경로는 격리 재현 완료:** 실제 컴파일된 Service/Crypto와
메모리 mapper·지연 fake reader를 사용해 유효기간 내 시작한 조회가 만료 후에도
COMPLETED를 반환함을 확인했다. 실제 DB/Preview 결과를 사용한 재현은 아니다.
Provider/Read API와 동시 CAS fallback은 정적 제어 흐름 확인으로 구별한다.

개선/완료 기준: 각 await/외부 조회 뒤 응답·서명·완료 직전에 최신 시각과 권한/상태를
다시 확인한다. 완료된 과거 사실과 현재 유효한 결과를 API에서도 구별한다.
시간을 주입한 테스트로 expiry 직전 진입→지연→expiry 이후 반환, 이미 COMPLETED,
동시 resolver의 CAS fallback을 검증한다. 정상 false를 expiry 오류로 혼동하지 않는다.

### C06 — owner 저장 큐의 실패 전파

근거: `giwa-midnight/cli/src/hosted-demo.ts:17–23`의
`saveQueue = saveQueue.then(write)`에는 이전 rejection을 회복하는 tail이 없다.
한 번 쓰기가 실패하면 이후 요청도 실제 쓰기 재시도 없이 거절된다.
gateway `:166–167`은 안전하게 challenge를 취소하지만 서비스 회복은 되지 않는다.

**격리 재현 완료:** 실제 파일의 `saveOwners` 함수 블록을 추출해 VM에서 fake write와
실행했다. 첫 write를 실패시키고 두 번 호출하면 두 호출 모두 reject되며 실제 write
호출은 한 번뿐이었다. 운영 상태 파일을 손상시키거나 디스크 장애를 일으키지 않았다.

개선/완료 기준: 현재 호출의 저장 실패는 그대로 전달하고, 큐 tail은 회복해서 다음
독립 쓰기를 직렬 실행한다. 첫 write 실패→다음 write 성공을 주입하여 첫 challenge는
취소되고 다음 challenge는 저장 후 발급되는지 확인한다. 암호화/원자적 쓰기는 유지한다.

### C07 — 영구 대기 조회와 준비 상태

근거: `giwa-midnight/api/src/timeout.ts:32–59`은 caller timeout 후에도 실제 SDK
promise가 끝날 때까지 in-flight 슬롯을 유지한다. `api/src/midnight.ts:25–34`에서
이를 공유한다. promise가 영원히 끝나지 않으면 후속 조회는 계속 busy가 된다.
Read API `/health`(`server.ts:100–110`)는 이 상태와 관계없이 ok다.

이 제한은 orphan query 누적을 막는 의도적인 방어다. 단순히 timeout 때 슬롯을
비우면 문제가 악화될 수 있다. 개선은 SDK 취소 지원 확인, 제한된 reader 재생성/
격리, degraded readiness와 복구 안내를 함께 검토한다. pending proof나 지갑을
무조건 초기화/재시작하는 해결책은 사용하지 않는다.

완료 기준: 절대 settle하지 않는 stub query를 주입해 요청 수가 늘지 않으면서
장애가 표시되고, 안전한 복구 후 다음 조회가 성공한다. 이번에는 실제 Indexer를
고장내거나 live outage를 재현하지 않았다.

### C08 — build와 Compact 산출물의 연결

근거: `giwa-midnight/contract/package.json:27–30`의 build는 tsc와 기존 managed 파일
복사다. Dockerfile `:12,23–26`도 bootJar/TS build이며 Compact compile/test gate가 아니다.
참조 checker의 compiler/version 일치는 소스와 proving key가 대응한다는 증거가 아니다.

현재 산출물이 잘못됐다는 발견은 아니다. 향후 `.compact`만 수정하고 build가 성공해
이전 회로를 배포하는 회귀를 막을 연결 장치가 부족하다는 판정이다.

개선/완료 기준: 회로 변경 시 고정 compiler로 full compile하고 source/compiler/
생성 artifact의 provenance를 기록한다. build 검증과 proof 검증을 분리해 CI/릴리스
체크에 연결한다. 정상 true/false·변조 거절을 생성 binding과 실제 prover 양쪽에서
확인한다. `--skip-zk`를 full proving artifact 생성 완료로 취급하지 않는다.

### C09 — UI 응답 결합과 계정 변경

근거 1: `proofRequests.js:370–375`는 resolve 응답 shape를 확인하지만 요청한 ID와
응답 ID를 비교하지 않는다. mailbox `:61–70,242–250`은 caller ID 밑에 결과를 저장한다.
서버/프록시 회귀가 다른 요청의 올바른 형식 응답을 돌려주면 카드와 결과가 섞일 수 있다.
현재 서버의 exact binding이 실패했다거나 권한 우회가 확인된 것은 아니다.

근거 2: `stores/receivable.js:21–40`의 비동기 반영과 mailbox `:187–197`의 두 역할
연속 생성은 계정 세대 변경을 확인하지 않는다. `api.js:23`은 매 호출마다 현재 토큰을
읽는다. 이전 계정 응답이 늦게 store를 덮거나 다음 동작이 바뀐 계정으로 실행될 수 있다.
proof composable의 unmount 취소/메모리 정리와 서버 권한 검사는 이미 있다.
두 경로 모두 정적으로 확인했으며 새 계정 전환/응답 바꿔치기 실험은 하지 않았다.

개선/완료 기준: 선택한 request의 ID/역할/대상/기준/audience/expiry와 응답을 결합하고,
동작 묶음을 auth generation에 묶는다. logout·다른 계정 login·다른 탭 토큰 변경 뒤
늦은 응답을 무시하고 후속 batch를 중단한다. 다른 회사 데이터를 표시하지 않는지
검증한다. 기존 GIWA의 durable 거래 복구 기록은 소유자별로 유지한다.

### C10 — 실제 브라우저·체인 검증의 빈칸

과거 2026-09-15 Seller/eligible=true Preview 성공 및 호스팅 환경 실제 prover의
true/false 생성 기록은 유효한 **과거 증거**다. 이번 테스트로 새 live proof가 생성된
것은 아니다. 현재 TODO의 Buyer·valid-false 브라우저/체인 경로와 장애 복구 리허설은
여전히 미완료다. UI 205 tests에는 legacy/development 모드도 포함된다.

완료 기준: 실제 공개 데모에서 역할·배포 버전·request·tx/finality·Indexer 결과·Spring
상태·ACK·화면의 true/false를 연결해서 기록한다. 거절/만료, 접수 응답 유실,
Spring 전달 후 ACK 유실, 재시작, Indexer 지연을 별도 확인한다. 자동 테스트에는
hosted profile 선택/원문 입력 부재와 C02–C09의 해당 경계를 추가한다.
현재 공유 지갑의 쓰기 주체를 정하고 기존 wallet/contract/outbox를 보존하며 진행한다.

복구가 항상 자동 완료되는 것은 아니다. `proof-bridge/runtime.ts:169–185`,
`capability-outbox.ts:724–745,874–882`, `cli/src/api.ts:924–986`의 **체인 제출 후
durable capability 저장 전**에 프로세스가 죽으면 proving reservation만 남을 수 있다.
현재는 expiry까지 중복 proof를 막는 안전한 불확정 상태이며, 자동으로 capability를
재구성하지 못한다. 이 한계를 리허설과 UI 안내에서 명확히 해야 한다. 자동 복원을
요구한다면 제출 전 recovery manifest/tx 식별자 저장과 독립 조회 reconciliation을
신중히 설계해야 하며, reservation 삭제나 강제 재증명으로 해결하지 않는다.

### C11 — 예전 Preprod 진입점 방어

근거: `giwa-midnight/cli/package.json:9,13,17`, `src/preprod-remote.ts:17–22`,
`src/config.ts:48–55`에 Preprod 실행 경로가 남아 있다. managed demo는 이를 사용하지
않으며 문서가 실행을 금지한다. **실제 금지 배포를 발견했다는 뜻은 아니다.**

개선/완료 기준: 현재 프로젝트에서 호출 시 명확하게 거절하게 하거나 historical
예제와 실행 가능한 script를 분리한다. endpoint 입력에서도 실제 의도한 네트워크를
확인한다. 회귀 테스트는 네트워크 호출 전에 거절되는지만 검사하고 해당 명령을
실제 네트워크 대상으로 실행하지 않는다.

### C12 — 세션과 상관관계 metadata의 수명

근거: `proof-bridge/runtime.ts:56,86,140,158,188,192`의 request/session map은
명시적 cancel·증명 종료·shutdown 때 지워지지만 `session-store.ts:239–250,274–280`의
자동 만료가 이 map을 정리하지 않는다. challenge를 발급한 후 자동 만료만 반복하면
소유 프로세스가 유지되는 동안 식별 metadata가 누적될 수 있다. 정적 확인이며
메모리 고갈이나 실제 DoS를 재현한 것은 아니다.

raw prepared witness의 timer 정리와 다른 문제다. owner 파일은 정책 만료 1일 뒤부터
다음 저장 시 정리되고, outbox/DB도 RAM과 디스크에서 정리되는 시점이 다르다.
모든 정보가 60초나 validUntil에 즉시 삭제된다고 표현하면 안 된다.

개선/완료 기준: session lifecycle에 연결한 bounded map cleanup을 마련하고
challenge→자동 만료를 반복하는 테스트로 metadata가 제한되는지 확인한다.
RAM/암호화 파일/DB/public ledger의 보존 의미를 구분하되 지갑 identity나 아직 필요한
ACK/복구 metadata를 함께 지우지 않는다.

### C13 — 결과에서 신뢰하는 Provider 범위 명확화

근거: `hosted-demo/bootstrap.ts:159–168`과 역할 동의 발급은 Provider 2를 사용한다.
그러나 Compact registry는 복수 Provider를 지원하고 Read API는 등록된 다른 Provider의
결과도 읽을 수 있다. `LocalMidnightReadClient.java:162–165`와 Vue 결과 parser도
양의 uint16 Provider ID를 허용한다. Read API 테스트에는 Provider 1 수용 사례가 있다.

이것은 자동으로 취약점/미준수가 되는 조건은 아니다. 공격자가 Provider를 등록하거나
권한 없는 capability를 전달할 수 있다는 사실은 확인하지 않았다. **현재 발급 경로가
Provider 2라는 사실**과 **모든 수용 결과가 그 역할 동의를 거쳤다는 정책**은 구별한다.

개선/완료 기준: “관리자가 승인한 모든 Provider”와 “역할 동의가 있는 Provider 2만” 중
제품의 수용 정책을 문서화한다. 후자라면 최종 소비 경계에도 동일 제한과 회귀 테스트를
추가하고, 전자라면 Provider ID만으로 동일한 동의 이력을 주장하지 않는다.

## 5. 현재 범위를 넘어서는 운영 서비스 요건

다음은 현재 합성 데모의 미준수 점수에 섞지 않는다. 실제 금융 데이터나 다중 고객
서비스로 확장하기 전에 승인된 설계와 검증이 필요한 **L3 조건**이다.

| 항목 | 개선 방향 |
| --- | --- |
| 실제 데이터 provenance | 기관 계약/데이터 검증·주체 확인·발급 책임. 현재 가상 Provider에 은행 인증 의미 부여 금지 |
| 회사별 private state/권한 | 단일 demo operator identity와 실제 다중 회사 격리를 구분하고 tenant 단위로 설계 |
| 반복 질의 추론 | 기준을 바꿔 반복 질의할 때 원문 범위를 좁히는 문제에 consent/rate/privacy budget 적용 |
| 키·Provider 수명 | KMS/HSM 필요성, rotation/drain/revocation, 기존 결과와 capability 호환, 사고 복구 정책 |
| 보존과 삭제 | 만료 envelope의 현재 lazy cleanup과 on-chain immutable 기록을 구분. 명시적 purge/보존 정책 |
| 지갑 다중 writer | 로컬 파일 lock만으로 여러 호스트의 같은 wallet 동시 사용은 방지되지 않음. 현재는 단일 writer 운영 |
| 사용자 세션/브라우저 | JWT 저장·CSP·XSS 대응·세션 철회는 기존 앱 전체 설계와 함께 보강 |

React 전환, 별도 helper 배포, Midnight 자산/펀딩 도입, 실제 은행 연동, Mainnet
전환은 이 검토의 개선 작업에 포함되지 않는다.

## 6. 실행한 검증과 한계

검증 결과는 아래 최종 집계에 기록한다. 기존 테스트의 성공을 C01–C13 종료로
간주하지 않는다. 결함별 완료 기준은 아직 추가/실행할 검증이다.

모든 Node 검사는 **22.21.1**, Spring은 **Java 17**을 사용했다.

| 검사 | 이번 결과 | 범위/주의 |
| --- | ---: | --- |
| root 참조·runner·초기 준비 | 28/28 PASS | Docker/API 동작은 mock. 실제 Run 없음 |
| Compact contract | 39/39 PASS | 기존 simulator/binding tests. full compile/실제 proof 아님 |
| Attestation Provider | 88/88 PASS | 순수 48 + mock HTTP 40. 실제 GIWA RPC 없음 |
| Read API | 61/61 PASS | 순수 44 + mock HTTP 17. 실제 Indexer 없음 |
| CLI/gateway/지갑/session/outbox | 186/186 PASS | 15 files. live `zkloan.api.test.ts` 명시 제외 |
| Spring Midnight | 37/37 PASS | 6 classes. H2 memory, runtime disabled |
| Vue UI | 205/205 PASS | 26 files. hosted뿐 아니라 기존/개발 모드 포함 |
| **기존 테스트 합계** | **644/644 PASS** | 최종 실행 대상 내 skip 0. live suite는 대상 제외 |
| 격리 결함 재현 | 3/3 예상 동작 확인 | C04 Spring body, C05 completed expiry, C06 save queue. 정상 회귀 테스트 PASS 수에 합산하지 않음 |
| Vue production build | PASS | production bundle에 legacy prove/authorize/result 화면 chunk 없음 |
| Midnight 4개 workspace TS build | 모두 PASS | contract→api→attestation-api→cli. Compact 재컴파일과 구별 |
| 참조 checker | PASS 126항목, 오류/경고 0 | 35 version pin과 연결 지침 검사 |

재실행 명령: root `node --test scripts/*.test.mjs`; 각 Midnight package에서
`node ../node_modules/vitest/vitest.mjs run --reporter=default`에 해당 순수/HTTP test 파일을
지정; CLI는 `--exclude src/test/zkloan.api.test.ts`; UI는 `npm test -- --reporter=dot`와
`npm run build`; Spring은 offline Gradle의 Midnight package test 범위와 H2 test profile.
live suite를 포함하는 명령으로 무작정 확장하지 않는다.
Spring 명령은 `MIDNIGHT_RUNTIME_ENABLED=false` 및
`SPRING_DATASOURCE_URL=jdbc:h2:mem:gasok-compliance-review;MODE=MySQL;DB_CLOSE_DELAY=-1`
(shell에서는 전체 값을 quote), 사용자 `sa`, 빈 test 암호를 지정한
`./gradlew --offline --no-daemon test --tests 'com.leonid.giwaapi.midnight.*'`였다.
TS build는 `giwa-midnight`에서 `npm run build --workspace=<contract|api|attestation-api|cli>`를
순서대로 실행했다.

최초 일부 HTTP fixture 검사는 sandbox의 loopback listen EPERM, Gradle은 cache lock
접근 제한으로 실행되지 않았다. 필요한 로컬 fixture/cache에 한정한 승인 후 같은
검사를 재실행해 위 최종 결과를 얻었다. 애플리케이션 실패를 수정한 것으로 기록하지 않는다.
generated source-map 경고와 Restify deprecation 경고는 남지만 assertion 실패는 없다.
generated source/dist의 해당 contract JS hash도 일치함을 확인했다.

검증하지 않은 것: 새 full Compact compile/proving keys, 현재 배포 verifier와 소스의
동일성, 실제 현재 Node/Indexer 가용성, 새 지갑 동의/증명/체인 거래, C10 live 경로,
암호학적 soundness, 전체 GIWA/Solidity 재실행. 변경 없는 GIWA는 분리 경계를 검토했고
이번 기존 테스트 수에 Solidity 테스트나 전체 Spring 테스트를 포함하지 않았다.

문서 최종 검사: 이번에 갱신한 5개 docs/ai 파일의 로컬 링크 26개 모두 존재,
C01–C13 ID 누락/중복 없음, root/inner `git diff --check` 통과. 참조 checker도
문서 연결 변경 후 다시 PASS했다. 추가/갱신한 문서는 이 보고서, 참조 하네스,
Midnight-Skills 비교, TODO, CONTEXT다.

Git 상태: root는 직전 하네스 변경과 이번 문서 변경이 미커밋 상태이며
`Midnight-Skills/`는 계속 untracked nested repository다. `giwa-midnight` 내부는
직전 `AGENTS.md` 변경만 남고, API/UI/Solidity/reference 내부 worktree는 clean이다.
root는 submodule **commit pointer**, 내부 저장소는 **자신의 파일**을 추적한다.
`giwa-midnight` pointer 값은 그대로이며 dirty 표시는 내부 AGENTS 변경에서 온다.

## 7. 권장 개선 순서

1. **C01을 먼저 전문 검토**하여 현재 회로의 신뢰 판단을 확정한다. 동시에
   C02/C03/C04/C05의 만료·복구 경계를 기존 구조 안에서 수정할 수 있다.
2. **C06/C07을 보강**하여 일시적인 저장/조회 장애가 Run 재시작만 요구하는
   상태로 남지 않게 한다. 상태 파일 삭제나 새 계약 배포를 복구 수단으로 삼지 않는다.
3. **C08/C09/C11/C12를 회귀 방지에 연결**하고 C13의 수용 정책과 hosted 모드 테스트를 보완한다.
4. 수정된 소스·산출물로 **C10 실제 Buyer/false/복구 리허설**을 수행하고 근거를
   남긴다. 이후 제출용 fresh-clone/공개 데모 점검은 기존 제출 체크리스트를 따른다.

이 보고서는 구현 수정을 완료했다고 표시하지 않는다. 후속 작업은
[TODO](TODO.md)의 같은 C01–C13 ID로 추적하며, 구조 변경이 없는 이번 검토에서
DECISIONS.md는 변경하지 않는다.
