# Midnight 데모 최소 배포 설계

> **2026-09-15 후속 상태:** 사용자가 이 통합 방향과 가상 데이터 Preview 사용을
> 승인했다. IntelliJ 통합 Run, Railway 단일 앱 이미지, 가상 계정/재무 프로필과
> 실제 ZK 증명 생성이 구현됐다. 현재 검증·외부 배포 상태는
> [CONTEXT.md](../ai/CONTEXT.md), 실행은 [루트 README](../../README.md)를 따른다.
> 아래는 2026-09-14의 조사·제안 기록이며 승인 전 문구를 현재 제한으로 적용하지 않는다.

**Vercel 프로젝트 1개와 Railway 프로젝트 1개를 유지하고, Railway 안의 서비스를 통합 앱과 MySQL 두 개로 구성하는 것이 추천 목표다. 데모 사용자의 로컬 서버와 Docker 실행은 0개로 만들 수 있다.** 현재 Proof Bridge를 활용한 호스팅 데모와 공개 Midnight Preview 연결을 전제로 한다. 통합 이미지에서 실제 재무 검증 회로를 실행하는 검증은 아직 필요하며, 이미 배포되거나 성능이 확인된 구성은 아니다.

이 문서는 배포 설계 제안이다. 현재의 local-only 아키텍처와 Preprod/Mainnet 배포 금지 규칙을 변경하지 않는다. 적용에는 호스팅 데모의 데이터 신뢰 범위와 Preview 사용에 대한 별도 아키텍처 승인이 필요하다. 판단 기준일은 2026-09-14다.

## 1. 무엇을 최소화할 것인가

최적화 우선순위는 데모 사용자의 설치·실행 제거, 배포 프로젝트와 서비스 수 축소, 현재 검증 기능 보존, 재시작·복구의 단순화다. 운영체제 내부 프로세스 수를 줄이는 것은 그 다음이다. 프로세스 하나를 없애려고 검증 로직을 다른 언어로 재작성하는 일은 우선순위에 맞지 않는다.

| 용어 | 이 프로젝트에서의 의미 |
| --- | --- |
| Git 저장소 | 코드를 보관하는 곳. 저장소가 여러 개여도 배포는 하나로 묶을 수 있다. |
| 배포 프로젝트 | Vercel·Railway 대시보드의 관리 묶음. Railway 프로젝트 하나에 서비스 여러 개를 둘 수 있다. |
| 배포 서비스 | 독립적으로 빌드·재시작·자원을 배정하는 단위. Railway의 앱 카드 하나에 해당한다. |
| 컨테이너 | 실행파일과 라이브러리를 포장한 실행 환경. 여러 프로세스를 포함할 수 있다. |
| 프로세스 | 실제 실행 중인 Spring, Node.js API, native prover 등의 프로그램. |
| 실행 위치 | 노트북 또는 클라우드. Docker와 로컬은 서로 반대 개념이 아니다. |

Docker에 들어 있는 Midnight 프로그램도 직접 중지·재시작·이전·배포할 수 있다. Docker는 Midnight만 관리할 수 있는 원격 서비스가 아니다. 공식 이미지의 실행 위치와 버전·환경설정은 애플리케이션 운영자가 정한다. 다만 native 실행파일을 다른 이미지 안에 합칠 때는 실행파일 경로·의존 라이브러리·파라미터 위치를 확인해야 한다.

Docker는 한 컨테이너에서 여러 프로세스를 관리하는 wrapper와 supervisor 방식을 문서화하고 있다. Railway에서 Compose를 사용하면 원래 Compose의 각 서비스가 Railway의 개별 서비스로 대응한다. 따라서 **Compose 파일 하나로 정리하는 것과 배포 서비스 하나로 합치는 것은 다르다.** [Docker 다중 프로세스](https://docs.docker.com/engine/containers/multi-service_container/), [Railway Compose](https://docs.railway.com/guides/docker-compose).

## 2. 현재 구성요소 9개의 목적과 목적지

아래는 전체 v2 흐름에 필요한 논리 구성요소다. 9개가 지금 실행 중이라는 뜻은 아니다. 현재 Vercel·Railway 배포 버전과 계정 내 실제 서비스 수는 별도 확인 대상이다.

| 구성요소 | 현재 로컬 기본 포트 | 하는 일 | 추천 배포에서의 위치 |
| --- | ---: | --- | --- |
| Vue | 5173 | 기준 요청, 당사자 동의, 진행 상황, 결과 화면 | 기존 Vercel |
| Spring | 8080 | 로그인, 요청 소유권, 공개 기준, 결과 상태와 암호화 capability 관리 | Railway 통합 앱 |
| MySQL | 3306 | 기존 업무 데이터와 공개 요청·암호화 capability 저장 | Railway MySQL 별도 서비스 |
| Mock Attestation API | 4000 | 역할 지갑 동의를 확인하고 mock 값·문맥에 서명 | Railway 통합 앱 내부 |
| Midnight Read API | 4100 | capability 검증, Indexer 결과 해석, 서버 측 독립 확인 | Railway 통합 앱 내부 |
| Proof Bridge | 4200 | Midnight 지갑·private state, 증명 요청·제출, 결과 복구 조율 | Railway 통합 앱 내부 |
| Proof Server | 6300 | private witness로 실제 ZK proof 계산 | Railway 통합 앱 내부 native 프로세스 |
| Midnight Node | 9944 | 트랜잭션 검증과 원장 확정 | 공개 Preview Node |
| Midnight Indexer | 8088 | 공개 원장 상태 조회와 구독 | 공개 Preview Indexer |

Compact contract는 상시 서버가 아니다. CLI도 초기 지갑 준비·계약 배포·Provider 등록·진단에 쓰는 도구다. 일반 데모에서는 Bridge가 같은 역할의 실행을 조율하므로 CLI를 추가로 켜 둘 필요가 없다. 현재 CLI와 Bridge는 같은 private-state 저장소를 사용하므로 동시에 실행하면 안 된다.

GIWA RPC와 MetaMask 의존성은 계속 존재한다. MetaMask는 당사자의 GIWA 역할 지갑 동의에 쓰이고, Bridge의 Midnight 지갑과 다르다. 추천안은 GIWA 계약을 Midnight 계약으로 교체하는 안이 아니다. 현재 역할 분리는 [ARCHITECTURE.md](/Users/leonid/projects/blockchain/gasok/docs/ai/ARCHITECTURE.md:3)와 [실행 가이드](/Users/leonid/projects/blockchain/gasok/midnight/LOCAL_POC_RUNBOOK.md:1)에 기록돼 있다.

## 3. 추천하는 관리 화면

```text
Vercel 프로젝트 1개
└─ Vue 웹사이트

Railway 프로젝트 1개
├─ app 서비스 1개
│  ├─ 인증된 HTTPS 진입점
│  ├─ Spring
│  ├─ Mock Attestation API
│  ├─ Midnight Read API
│  ├─ Proof Bridge
│  ├─ Midnight Proof Server
│  └─ 영구 Volume: 암호화 private state / outbox / 공개 파라미터 캐시
└─ MySQL 서비스 1개
   └─ DB 전용 영구 Volume

외부에서 제공받는 인프라
├─ Midnight Preview Node / Indexer
└─ 기존 GIWA RPC

데모 사용자 컴퓨터
└─ 브라우저 + 기존 MetaMask
   로컬 개발 서버 0개 / Docker 실행 0개 / Midnight CLI 실행 0개
```

기존 MySQL이 이미 같은 Railway 프로젝트에 있다면, 추가 프로젝트 없이 기존 API 서비스의 이미지를 확장하는 것이 목표다. MySQL이 다른 곳에 있다면 기존 위치를 먼저 확인해야 한다. 단지 숫자를 맞추려고 데이터베이스를 즉시 이전할 이유는 없다.

통합 앱 안에서 TypeScript 프로그램을 Java로 다시 작성하지 않는다. 먼저 현재의 독립 프로그램을 supervisor로 함께 시작하고, 이미 구현된 내부 HTTP 호출을 유지하는 편이 변경 범위가 작다. 하나의 배포·하나의 자원 배정·하나의 상태 화면으로 운영하고, 내부 로그에는 프로그램 이름만 구분해서 붙인다.

이 구조에는 Redis, 별도 작업 큐 서비스, Kubernetes, 별도 Proof SaaS, 별도 MCP 서버가 필수적이지 않다. 초기 데모의 증명 동시 실행은 1개로 제한하고 현재의 encrypted outbox와 예약·복구 구조를 활용한다. 프로그램 역할은 남지만 수동으로 관리할 서비스는 줄어든다.

## 4. 원격 Proof Server는 가능한가

가능하다. 최신 Midnight 공식 문서는 Proof Server를 로컬 또는 통제 가능한 원격 장비에 두고 암호화 연결로 사용할 수 있다고 설명한다. 공식 Midnight organization의 Leaderboard 저장소에도 Vercel 프론트와 Railway Proof Server 구성이 있다. 따라서 원격 실행 자체를 불가능하다고 보는 것은 잘못이다. [Midnight proving 문서](https://docs.midnight.network/guides/local-proving), [공식 Leaderboard 저장소](https://github.com/midnightntwrk/midnight-leaderboard).

중요한 차이는 **누가 입력을 볼 수 있느냐**다. Proof Server는 지갑 키로 거래에 서명하지 않지만 증명 대상 private witness를 받는다. Bridge는 그와 별도로 Midnight 지갑과 애플리케이션 private state를 관리한다. 두 프로그램을 Railway에 두면 운영자가 관리하는 실행 환경이 입력과 상태를 처리한다.

따라서 공개 데모는 미리 생성한 가상 기업 프로필과 데모 계정을 사용하는 방식이 적합하다. Mock Provider가 서명한다는 사실만으로 데이터가 가상이라는 뜻은 아니므로, 임의의 실제 기업 재무값을 받는 공개 서비스와 구분해야 한다. 실제 ZK proof를 생성하고 실제 Preview 원장에 결과를 기록하되 입력 데이터가 데모용이라는 뜻이다.

이 데모에서 가능한 설명은 다음과 같다.

> 가상 재무값은 운영자가 관리하는 증명 환경에서 처리됩니다. 자금제공자와 공개 원장에는 재무 원문을 제공하지 않고, 요청한 조건의 충족 여부와 필요한 검증 메타데이터를 제공합니다.

“운영자도 원문을 볼 수 없다”, “원문이 사용자 기기 밖으로 나가지 않는다”, “은행 검증 데이터다”라는 설명은 이 구성에 맞지 않는다. HTTPS는 전송을 보호하지만 원격 서버가 계산 중 입력을 읽지 못하게 만들지는 않는다.

사용자가 제공한 Midnight Korea의 2026-08-18 글도 자체 서버, 브라우저·모바일 내장 증명, 전문 증명 서비스의 세 배치를 비교하며 witness의 소유자와 신뢰 범위를 판단 기준으로 삼는다. native 계산 자원은 실제 회로와 동시 실행 수로 측정해야 한다는 점도 이번 설계에 직접 적용된다. [제공된 한국어 글](https://medium.com/midnight-korea-developer-blog/proof-server-%ED%94%84%EB%A1%9C%EB%8D%95%EC%85%98%EC%97%90%EC%84%9C%EB%8A%94-%EC%96%B4%EB%94%94%EC%97%90-%EB%91%98-%EA%B2%83%EC%9D%B8%EA%B0%80-9d8def3f5361).

Attestation API를 같은 컨테이너에 두는 것도 데모에서는 가능하다. 현재 Provider는 애초에 운영자가 관리하는 mock이다. 프로세스를 분리했다고 실제 독립 은행이 되는 것은 아니며, 합쳤다고 Compact의 서명 검증 계산이 없어지는 것도 아니다. 실제 외부 Provider 연동은 별도 신뢰 모델로 설계할 사항이다.

## 5. 최신 WASM·지갑·외부 증명 서비스 비교

| 방식 | 사용자 로컬 서버 | 별도 증명 배포 서비스 | 현재 코드에서의 변화 | 판단 |
| --- | ---: | ---: | --- | --- |
| 기존 Bridge + native prover를 통합 앱에 호스팅 | 0 | 0 | 원격 인증, 환경설정, 패키징, 상태 관리 | 제출 데모 기본 추천 |
| 같은 프로젝트에서 prover만 별도 Railway 서비스 | 0 | 1 | 위와 비슷하나 native 이미지 그대로 사용 가능 | 통합 실행 검증 실패 시 대안 |
| 브라우저 WASM으로 증명 | 0 | 0 | browser proof provider, private state, 키 자산, 복구 흐름 변경 | 장기적으로 가치 있음; 실제 회로 검증 필요 |
| 1AM 지갑의 browser proving | 0을 목표 | 0을 목표 | 새 지갑 연동과 회로 자산 전달, 실제 증명 경로 확인 | 조건부 후보 |
| 외부 Proof Station/ZkPaaS | 0 | 자체 운영은 0 | API 계약·키·버전·요금·데이터 처리자 추가 | 이번 운영 단순화의 기본안에서 제외 |
| Lace + 로컬 prover | 1 | 0 | 지갑·private state·브라우저 제출 흐름 변경 | 로컬 0개 목표와 맞지 않음 |

브라우저 WASM은 단순한 미래 계획이 아니다. 공식 Wallet SDK에는 `makeWasmProvingService`가 문서화돼 있고, 공개된 prover-client 패키지에도 구현이 있다. 다만 Wallet의 기본 DUST·shielded proving을 바꾸는 것과 이 프로젝트의 사용자 정의 Compact 회로를 증명하는 것은 구분해야 한다. GASOK 회로의 prover/verifier/ZKIR 자산을 제공하는 proof provider까지 연결해야 한다. 공식 가이드도 native HTTP proving보다 상당히 느릴 수 있음을 명시한다. [Wallet SDK 대체 proving](https://docs.midnight.network/sdks/official/wallet-developer-guide#use-alternative-proving), [공식 WASM 구현](https://github.com/midnightntwrk/midnight-wallet/blob/main/packages/prover-client/src/effect/WasmProver.ts).

WASM 전환의 완료 기준은 실제 재무 검증 회로가 일반 데모 기기에서 처음부터 끝까지 동작하는 것이다. cold-start 키 다운로드, 메모리, 증명 지연, 브라우저 정지 여부, Worker 처리, 결과 전달 중 탭이 닫혔을 때의 복구를 확인해야 한다. 브라우저에 계산을 옮겨도 현재 Mock Attestation API가 값을 받는 단계는 별도로 남는다.

최신 공식 community integration 문서는 Lace가 `getProvingProvider()`를 구현하지 않고, 1AM은 browser WASM 및 hosted Proof Station을 제공한다고 구분한다. 지갑 연결만 추가하면 Bridge의 애플리케이션 상태·요청 동의·durable delivery까지 자동으로 대체되는 것이 아니다. 메서드 존재 여부와 실제 처리 경로는 설치된 지갑 버전에서 확인해야 한다. [지갑별 proving 차이](https://docs.midnight.network/sdks/community/wallets/community-wallets-integration#where-zk-proofs-come-from).

1AM 공급자의 공개 문서에는 사용자 정의 Compact 계약 호출과 key material 전달 예제가 있으며, 인증된 Proof Station API adapter도 공개돼 있다. 그러나 서비스 가입 가능 여부, 할당량, 현재 회로 호환성, 비용, 실제로 브라우저에서 계산하는지에 대한 검증은 별개다. 공급자 사이트의 TEE 표현만으로 운영자에게도 witness가 숨겨진다고 확정할 수 없다. [1AM 통합 예제](https://github.com/webisoftSoftware/1AM-starter-template/blob/main/1am.md), [Proof Station adapter](https://github.com/webisoftSoftware/midnight-proof-provider-auth), [공급자 사이트](https://1am.xyz/).

WASM과 통합 native 방식은 Vercel 1개·Railway 1개라는 프로젝트 수에서는 동일한 최저값을 달성할 수 있다. native prover를 기존 앱에 넣으면 배포 서비스도 추가되지 않는다. 따라서 WASM의 추가 가치는 주로 서버 계산 비용과 사용자 측 proving이며, 프로젝트 수만을 이유로 지갑과 private state를 전면 교체할 필요는 없다. 운영자에게도 원문을 숨기는 제품이 다음 목표가 된다면 그때 WASM을 우선 후보로 재평가한다.

## 6. 숫자상 최저와 실용적 최저

모든 안에서 Vercel은 1개 프로젝트다. Railway 숫자는 같은 프로젝트의 한 데모 환경을 기준으로 하며, 별도의 기존 GASOK 운영 환경을 계속 보존하면 그 자원은 추가된다.

| 안 | Railway 프로젝트 | Railway 서비스 | 로컬 실행 | 주요 대가 |
| --- | ---: | ---: | ---: | --- |
| 프로그램마다 별도 배포, 자체 Node·Indexer 유지 | 1 | 8 | 0 | 서비스 카드와 설정이 많음 |
| 프로그램마다 별도 배포, 공개 Node·Indexer 사용 | 1 | 6 | 0 | 프로젝트는 적지만 서비스 관리는 남음 |
| 통합 앱 + MySQL + 자체 Node + 자체 Indexer | 1 | 4 | 0 | devnet 영속성과 초기화까지 직접 운영 |
| 통합 앱 + 별도 Proof Server + MySQL, 공개 네트워크 | 1 | 3 | 0 | prover 장애·메모리 영향 분리 |
| **통합 앱에 prover 포함 + MySQL, 공개 네트워크** | **1** | **2** | **0** | **앱 내부 여러 프로세스와 shared resource 관리** |
| MySQL까지 모두 한 컨테이너, 공개 네트워크 | 1 | 1 | 0 | 모든 앱 배포가 DB 재시작과 결합 |

마지막 1서비스 안은 기술적으로 검토할 수 있는 절대 최저 후보다. 그러나 현재 MySQL을 유지하면서도 데이터 복구와 앱 배포를 분리하려면 2서비스가 실용적 최저다. MySQL의 설정·백업·복구 책임은 하나로 묶어도 없어지지 않는다. 실제 바이너리 통합과 증명 성능이 실패하면 prover만 분리한 3서비스로 전환한다. 이 경우에도 추가 Railway 프로젝트는 필요 없다.

Vercel까지 없애고 Vue 정적 파일을 Railway 앱에서 제공하면 관리 플랫폼을 하나로 줄일 수 있지만, 현재의 Vercel·Railway 배치 유지 조건에서 벗어난다. SQLite 전환으로 MySQL 서비스를 없애는 안도 기존 MySQL/MyBatis 및 요청 유일성·거래 처리 검증을 다시 해야 하므로 이번 기본안에 포함하지 않는다.

별도 VPS에 Compose로 모으는 방식 역시 가능하지만, Vercel·Railway를 유지하는 상황에서는 세 번째 운영 위치가 생긴다. 서비스 카드 몇 개를 줄이기 위해 새 VM의 OS·Docker·네트워크·백업까지 관리하는 선택은 현재 최적화 기준에서 우선하지 않는다.

## 7. 공개 네트워크 선택과 해커톤 조건

공식 행사 페이지는 Preview, Preprod, Local Devnet을 모두 허용한다. 공개 테스트넷 배포 자체가 제출의 필수 조건은 아니다. 공개 소스, 컴파일 가능성, 설명과 구현의 일치, 확인 가능한 데모가 중요하다. [Midnight Korea Hackathon 한국어 안내](https://www.hackathon.midnightkorea.org/kor).

이번 추천안에서 Preview를 사용하는 이유는 Node와 Indexer 두 프로그램을 직접 운영하지 않기 위해서다. 공개 Preview Node와 Indexer는 공식 개발용 endpoint다. Preview에서 동작하면 이번 서비스 수 최소화 목표를 위해 다시 Preprod로 옮길 필요는 없다. [공식 네트워크 문서](https://docs.midnight.network/guides/networks-and-environments).

2026-09-14의 읽기 전용 endpoint 확인에서는 Preview와 Preprod Node 모두 `system_chain` 응답을 반환했고, 두 Indexer에서도 block height 조회가 성공했다. Preview 높이는 859087, Preprod는 2543267이었다. 이는 해당 순간의 조회 가능성만 의미하며, 이 프로젝트의 proof 제출 성공이나 SLA를 의미하지 않는다.

현재 계약은 `undeployed`의 특정 주소에 묶여 있다. Preview 전환에는 network ID·endpoint·검증 주소 설정뿐 아니라 Preview 전용 지갑, tNIGHT/DUST 준비, 계약 배포와 Provider 등록이 필요하다. 로컬 genesis 개발 지갑이나 공개된 mock 서명키를 공개망용 지갑·키로 재사용하지 않는다. 기존 로컬 결과·암호화 private state가 Preview 계약으로 자동 이전되지도 않는다.

현재 [AGENTS.md](/Users/leonid/projects/blockchain/gasok/AGENTS.md)는 local-only PoC 및 Preprod/Mainnet 배포 금지를 유지한다. 따라서 이 문서는 Preview 사용을 새 설계안으로 제시할 뿐 허가된 것으로 처리하지 않는다. 공개망으로의 변경을 승인하지 않는 경우에는 Node·Indexer를 포함한 자체 devnet의 원격 운영안을 별도로 승인·설계해야 하며, 현재 local-only 코드 그대로 포트를 열어도 되는 것은 아니다.

## 8. SDK를 먼저 전부 업그레이드할 필요는 없다

공식 compatibility matrix의 2026-09-13 표시 버전은 현재 저장소의 주요 SDK·회로 산출물 버전과 맞는다. 지원표에 없는 버전을 더 최신이라는 이유로 섞지 않는 것이 오히려 호환 위험을 줄인다. [공식 호환성 표](https://docs.midnight.network/relnotes/support-matrix).

| 구성 | 현재 코드·산출물 | 공식 Preview 표 | 해석 |
| --- | --- | --- | --- |
| Midnight.js | 4.1.1 | 4.1.1 | 일괄 업그레이드 근거 없음 |
| Wallet SDK | 1.2.0 | 1.2.0 | 기존 headless 흐름 활용 후보 |
| Compact compiler | 0.31.1 | 0.31.1 | 산출물 metadata와 일치 |
| Compact runtime | 0.16.0 | 0.16.0 | 같은 runtime 유지 |
| On-chain runtime | 3.0.0 pin | 3.0.0 | 기존 단일 WASM 인스턴스 pin 유지 |
| Proof Server | 8.1.0 | 8.1.0 | 동일 버전에서 먼저 검증 |
| 자체 Node | 1.0.0 | 1.0.2 | 공개망 사용 시 직접 운영 대상에서 제외 |
| 자체 Indexer | 4.3.3 | 4.3.5 | 공개망 사용 시 직접 운영 대상에서 제외 |

표가 일치해도 실제 실행이 보장되는 것은 아니다. 현재 v2 회로를 재빌드하고 적절한 네트워크 설정에서 CLI 증명을 확인해야 한다. 현재 체크아웃은 Midnight 의존성·빌드 결과·ignored private state가 준비되지 않은 상태다. 과거 테스트 통과 기록과 새 배포의 실행 검증을 구분한다.

## 9. 실제로 고쳐야 하는 지점

배포 서비스 수를 줄일 수 있다는 것과 현재 코드를 그대로 업로드하면 동작한다는 것은 다른 판단이다.

| 현재 경계 | 코드 근거 | 필요한 변경 |
| --- | --- | --- |
| Midnight 화면은 DEV 빌드에서만 활성화 | [config.js](/Users/leonid/projects/blockchain/gasok/giwa-ui/src/services/midnight/config.js:19), [router](/Users/leonid/projects/blockchain/gasok/giwa-ui/src/router/index.js:8) | 별도 hosted-demo 빌드 모드와 접근 범위 |
| localhost 경로와 Vite proxy에 의존 | [vite.config.js](/Users/leonid/projects/blockchain/gasok/giwa-ui/vite.config.js:12) | 배포용 HTTPS API 경로·CORS 또는 production rewrite |
| Bridge의 loopback/Host/Origin 검사 | [Bridge server](/Users/leonid/projects/blockchain/gasok/giwa-midnight/cli/src/proof-bridge/server.ts:315) | 인증된 진입점과 요청·세션 소유권 검증 |
| Bridge의 고정 개발 지갑·계약·StandaloneConfig | [local-runtime.ts](/Users/leonid/projects/blockchain/gasok/giwa-midnight/cli/src/proof-bridge/local-runtime.ts:309) | 환경별 설정, 전용 지갑, 초기화 절차 |
| Read API의 고정 Indexer | [Read config](/Users/leonid/projects/blockchain/gasok/giwa-midnight/api/src/config.ts:1) | 네트워크별 Indexer 설정 |
| Spring의 undeployed 결과 검증 | [LocalMidnightReadClient](/Users/leonid/projects/blockchain/gasok/giwa-api/src/main/java/com/leonid/giwaapi/midnight/LocalMidnightReadClient.java:133) | 선택한 네트워크와 정확히 일치하도록 검증 설정 |
| Spring의 Read API URL은 loopback만 허용 | [URL 검증](/Users/leonid/projects/blockchain/gasok/giwa-api/src/main/java/com/leonid/giwaapi/midnight/LocalMidnightReadClient.java:188) | 같은 컨테이너에서는 내부 loopback 유지 가능 |
| 현재 Dockerfile은 Java 앱 하나만 실행 | [Dockerfile](/Users/leonid/projects/blockchain/gasok/giwa-api/Dockerfile:1) | Java·Node·prover·supervisor를 포함하는 통합 이미지 |

Read API의 검증 기능은 보존해야 한다. 현재 Spring은 encrypted capability를 복호화하고 Read API의 독립적인 결과 검증을 거쳐 `COMPLETED`로 바꾼다. 브라우저가 “통과했다”고 보내는 값만 믿게 바꾸면 검증 모델이 달라진다. **독립 배포 서비스를 없애되 해당 검증 코드는 통합 앱 내부에 그대로 두는 것이 적합하다.** [Spring 결과 처리](/Users/leonid/projects/blockchain/gasok/giwa-api/src/main/java/com/leonid/giwaapi/midnight/MidnightProofRequestService.java:230).

공개 진입점은 하나면 된다. 예를 들어 Node 진입점이 일반 업무 요청을 Spring에 전달하고 증명 요청은 Bridge에 전달한다. 증명 요청의 인증과 정책 소유권은 Spring의 권한과 연결하되, 재무 원문을 Spring의 업무 처리·로그로 보내지 않는 경로를 설계한다. Attestation, Read API와 prover의 내부 포트에 각각 공개 도메인을 만들 필요는 없다.

주소·Origin 허용 목록만 바꾸는 것으로는 부족하다. `challenge`, `prove`, `status`, `recover`, `ack`, `cancel`에 로그인 주체와 request/session 소유권을 연결해야 한다. 특히 현재 로컬 `recover`가 request ID로 결과를 찾는 방식을 그대로 공개하면 안 된다. public ingress 검증은 기존 loopback 신뢰를 대체하는 실제 기능 변경이다.

## 10. 하나의 앱 서비스로 운영할 조건

**실행과 포트.** Spring, Attestation, Read API는 모두 `PORT` 환경변수를 읽는다. Railway가 준 하나의 `PORT`를 그대로 모든 자식 프로세스에 넘기면 충돌한다. 외부 진입점에만 public port를 사용하고, 내부 프로세스에는 각각 고정된 별도 포트를 전달해야 한다.

**Proof Server 패키징.** 공식 `ledger-8.1.0` 이미지 빌드 소스는 Nix와 musl을 사용한다. native 실행파일을 임의의 `/bin/midnight-proof-server` 경로에서 복사한다고 가정하면 안 된다. Java·Node 런타임과 함께 실행 가능한 Linux 이미지로 구성하고, 필요한 Nix 경로 또는 바이너리 의존성을 보존해야 한다. Docker 안에서 다시 Docker daemon을 실행하는 설계는 필요하지 않다. [8.1.0 이미지 빌드 코드](https://github.com/midnightntwrk/midnight-ledger/blob/ledger-8.1.0/flake.nix).

**단일 실행자.** 현재 Bridge의 단일 증명 세션 제한을 데모에 활용한다. 동시에 두 번째 증명이 들어오면 대기 또는 명확한 busy 상태를 보여준다. 자동 replica 확장 대신 하나의 Bridge가 지갑·private state·outbox를 소유한다. 필요하면 prover worker도 1개로 제한해 메모리 피크를 측정한다. [Proof Server 실행 인자](https://github.com/midnightntwrk/midnight-ledger/blob/ledger-8.1.0/proof-server/src/main.rs).

**영구 저장소.** 앱 volume 하나 아래 private state, encrypted outbox와 공개 증명 파라미터 캐시의 경로를 구분한다. 재무 원문을 MySQL·공개 원장·로그에 저장하지 않는 경계를 유지한다. 다만 현재 구현은 증명에 필요한 재무값과 서명을 **암호화된 private state에 일시 기록**하고 작업 후 정리한다. 중단으로 값이 남으면 다음 증명 준비 전에 다시 정리한다. 이는 volume에 값이 전혀 기록되지 않거나 디스크에서 물리적으로 완전히 삭제된다는 보장이 아니다. 따라서 volume과 백업도 운영자의 신뢰 범위에 포함된다. 디스크 기록 자체를 없애려면 witness를 메모리에서만 제공하도록 별도 변경해야 한다. [witness 기록](/Users/leonid/projects/blockchain/gasok/giwa-midnight/cli/src/api.ts:898), [작업 후 정리](/Users/leonid/projects/blockchain/gasok/giwa-midnight/cli/src/api.ts:955), [중단 후 정리](/Users/leonid/projects/blockchain/gasok/giwa-midnight/cli/src/api.ts:739).

capability와 private state는 기존 암호화·보존 규칙을 유지한다. 앱 재시작마다 새로운 지갑·Provider key·암호를 생성하는 방식은 사용하지 않는다.

Railway는 서비스당 volume 하나를 허용하고, volume 사용 서비스에서는 replicas를 지원하지 않는다. volume을 붙인 서비스는 재배포 때 짧은 중단이 발생한다. 이 제한은 단일 상태 저장 Bridge 구조와 함께 고려해야 한다. MySQL은 별도 서비스의 volume을 사용한다. [Railway volume 제한](https://docs.railway.com/volumes/reference).

**긴 계산과 짧은 HTTP.** 기존 `202 + sessionId + status 조회` 패턴을 유지한다. 증명 완료까지 하나의 공개 HTTP 요청을 계속 붙잡을 필요가 없다. Railway에는 무응답 HTTP 요청과 전체 요청 시간 제한이 있으므로, proof 계산과 브라우저 요청 수명을 분리하는 것이 중요하다. [Railway 네트워크 제한](https://docs.railway.com/networking/public-networking/specs-and-limits).

**재시작과 준비 상태.** 포트가 열렸다는 이유만으로 ready로 판단하지 않는다. Provider·계약·지갑 sync·outbox 복호화·prover 준비가 확인돼야 증명을 받는다. supervisor는 프로세스 종료를 감지하고 graceful shutdown을 처리해야 한다. Railway healthcheck는 주로 배포 시 준비 여부를 확인하므로 이후 자식 프로세스 감시를 대신하지 않는다. 증명 도중 실패한 작업은 기존 outbox 상태를 확인하고, 이미 확정된 proof를 다시 제출하지 않는다. [Railway healthchecks](https://docs.railway.com/deployments/healthchecks).

**공동 장애 범위.** 통합 앱에서 prover가 메모리를 많이 사용하면 Spring도 영향을 받는다. 따라서 실제 proof 한 번의 최대 메모리, 유휴 메모리, cold/warm 시작 시간, 증명 중 일반 API 응답 시간을 측정해야 한다. 안정적인 메모리 여유가 없으면 같은 Railway 프로젝트 안에서 prover만 분리한다. 숫자상 2개를 유지하기 위해 데모 전체를 불안정하게 만드는 것은 최적화가 아니다.

## 11. 배포 위치와 비용 판단

프론트는 기존 Vercel에 유지하고, 상태를 가진 통합 앱은 Railway에 둔다. 계정·대시보드·배포 경험을 재사용하고 제3의 플랫폼을 추가하지 않는 선택이다. Vercel 정적 페이지에는 private key나 Provider secret을 넣지 않는다.

최신 Vercel은 OCI Container Images Beta를 지원하므로 “Vercel은 Docker를 못 돌린다”고 단정할 수 없다. 다만 해당 컨테이너도 Functions 실행 모델이며 무요청 시 scale-down한다. 지속적인 지갑 상태와 private-state lock, outbox, 긴 계산을 가진 현재 Bridge를 옮기려면 추가 상태 관리가 필요하다. 기존 Railway를 사용하는 편이 이번 목적에 맞는다. [Vercel Container Images](https://vercel.com/docs/functions/container-images).

Railway MySQL은 편리하게 생성할 수 있지만 공식 문서상 template은 unmanaged다. 완전관리형 DB처럼 백업과 유지보수를 자동으로 모두 책임져 주는 것으로 설명하면 안 된다. 같은 Railway 프로젝트에 두고 DB의 수명과 volume을 앱 배포에서 분리하는 정도가 이 데모의 최소 운영 설계다. [Railway MySQL](https://docs.railway.com/databases/mysql).

서비스 개수와 비용은 일대일로 비례하지 않는다. 공식 단가는 RAM $10/GB·월, CPU $20/vCPU·월, volume $0.15/GB·월, egress $0.05/GB다. Hobby $5와 Pro $20는 포함 사용료가 있는 계정 요금이므로 “서비스 하나 추가할 때마다 $5”라는 계산은 맞지 않는다. 통합 전후 총 메모리·CPU 사용량이 같다면 사용료도 비슷할 수 있다. [Railway 가격](https://docs.railway.com/pricing/plans).

실제 GASOK proof의 메모리·시간 측정이 없으므로 정확한 월 요금이나 필요한 플랜을 단정할 수 없다. 한 번의 proof에서 최대 RAM을 확인한 후 자원 상한을 정하고, 유휴 메모리와 증명 횟수로 월 사용량을 추정해야 한다. 가격표의 replica 합산 자원과 단일 서비스 인스턴스의 자원 상한도 구분한다.

## 12. 구현 순서와 완료 기준

| 단계 | 수행 범위 | 다음 단계로 넘어갈 근거 |
| --- | --- | --- |
| 1. 설계 승인 | 가상 데이터 hosted demo, Preview 사용, 통합 앱과 별도 DB 결정 | 기존 local-only 규칙과의 관계가 명시됨 |
| 2. 기준 실행 복원 | 잠긴 버전 의존성 설치, fresh 상태 준비, CLI proof 확인 후 Vue v2 실행 | 실제 true/false proof와 결과 조회 성공 |
| 3. 통합 이미지 검증 | 기존 프로세스를 supervisor로 묶고 native prover·volume·포트 설정 | Linux에서 실제 회로 증명, peak RAM, 자식 프로세스 종료 동작 확인 |
| 4. Preview 초기화 | 전용 지갑·DUST·계약·Provider 준비, 네트워크 설정 통일 | CLI에서 실제 Preview proof와 공개 결과 확인 |
| 5. Hosted 접근 구현 | Vue 배포 모드, HTTPS API, 로그인·요청·세션 권한, 데모 프로필 | 다른 사용자의 세션·recover·ACK 접근 차단 |
| 6. 배포와 복구 검증 | 기존 Vercel/Railway 데모 환경에 적용 | 새 컴퓨터에서 서버 설치 없이 데모 성공, 재시작 후 중복 proof 없이 복구 |
| 7. 제출 자료 | fresh clone 실행법, 배포 구조, mock·운영자 신뢰 범위, 데모 영상 | README·코드·영상이 같은 구현을 설명 |

이 순서는 기존 공식 예제→CLI→Vue 학습 순서를 되돌려 처음부터 다시 구현하라는 뜻이 아니다. 이미 작성된 기능을 기준 버전에서 복원하고, 새 실행 위치와 네트워크에 필요한 경계만 검증한다. Stage 3의 통합 이미지가 안정성 기준을 통과하지 못하면 prover 별도 서비스인 3서비스 안으로 바꾸고 나머지는 유지한다.

운영 완료 기준은 “포트가 모두 열림”이 아니다. 브라우저에서 기준 요청→당사자 동의→mock attestation→실제 proof→Midnight 확정→Spring 결과 보관→요청자 결과 조회까지 확인해야 한다. 증명 오류·거절·만료를 유효한 조건 미충족(false)과 구분하고, Indexer 지연이나 ACK 전 중단에서도 이미 만들어진 proof를 재제출하지 않아야 한다.

## 13. 자료 간 차이와 판단의 한계

| 자료·주장 | 확인한 내용 | 적용 방식 |
| --- | --- | --- |
| 한국어 Proof Server 글 | 2026-08-18 게시; 자체 호스팅·embedded·ZkPaaS 비교 | 배치 판단에 사용. 글 안의 과거 시장 snapshot을 현재 상품 보장으로 사용하지 않음 |
| Midnight 공식 local proving 문서 | 통제 가능한 원격 장비 허용과 사용자 비밀에 대한 로컬 권장 병존 | 기술적 가능성과 privacy 모델을 분리 |
| Leaderboard README | Railway 원격 prover 예제 존재 | 호스팅 사례로 사용. 과거 버전·실행 인자·고정 요금 문구는 그대로 복사하지 않음 |
| 최신 wallet integration 문서 | Lace와 1AM의 proving 기능 구분 | 설치 버전 feature detection과 실제 회로 확인을 추가 조건으로 설정 |
| 1AM TEE·sponsorship | 공급자 사이트 주장과 공개 API adapter 존재 | 가입·버전·쿼터·attestation 증거를 확인하기 전 기본 인프라로 채택하지 않음 |
| Midnight Expert | 개발 도구·참조 지식·스캐폴딩 | 런타임 호스팅 서비스가 아니므로 배포 프로젝트를 추가하지 않음 |
| SDK 지원표 일치 | 현재 핵심 버전과 공식 표 일치 | 무조건 업그레이드 대신 고정 버전 실제 proof 테스트 |

[Midnight Expert 사이트](https://midnightntwrk.expert/)와 연결된 [공식 저장소](https://github.com/midnightntwrk/midnight-expert)는 최신 구현을 확인하는 개발 자료다. 새 서버를 대신 제공하는 서비스가 아니며, 이 프로젝트의 Vue를 다른 프레임워크로 바꿔야 할 근거도 아니다.

이 설계의 미검증 항목은 통합 이미지 실행·실제 proof 자원량·현재 계정의 배포 구성·새 네트워크의 전체 proof·재시작 복구·브라우저 WASM 성능이다. 공식 기능과 코드상 가능성은 확인했지만 이 항목들에 대한 성공 결과를 대신하지 않는다. 구현된 기능과 준비 중인 설계를 제출 설명에서 구분해야 한다.

## 출처

모든 온라인 자료의 확인 기준일은 2026-09-14다. 표시된 문서 갱신일이 모든 예제의 개별 호환성 검증일을 의미하지는 않는다. 위 본문에는 각 판단을 지원하는 원문을 직접 연결했다.

1. Midnight Korea. [Hackathon 공식 한국어 안내](https://www.hackathon.midnightkorea.org/kor). 허용 네트워크와 제출·심사 기준.
2. Midnight Korea. [proof server, 프로덕션에서는 어디에 둘 것인가](https://medium.com/midnight-korea-developer-blog/proof-server-%ED%94%84%EB%A1%9C%EB%8D%95%EC%85%98%EC%97%90%EC%84%9C%EB%8A%94-%EC%96%B4%EB%94%94%EC%97%90-%EB%91%98-%EA%B2%83%EC%9D%B8%EA%B0%80-9d8def3f5361). 2026-08-18. 자체 호스팅·embedded·전문 증명 서비스 비교.
3. Midnight. [Proving transactions locally](https://docs.midnight.network/guides/local-proving). 표시 갱신일 2026-09-13. Witness와 원격 proving 신뢰 범위.
4. Midnight. [Networks and environments](https://docs.midnight.network/guides/networks-and-environments). 공개 Node·Indexer와 네트워크 구분.
5. Midnight. [Compatibility matrix](https://docs.midnight.network/relnotes/support-matrix). 표시 갱신일 2026-09-13. 기준 SDK·compiler·prover 버전.
6. Midnight. [Wallet developer guide](https://docs.midnight.network/sdks/official/wallet-developer-guide#use-alternative-proving). 대체 WASM proving.
7. Midnight. [Community wallet integration](https://docs.midnight.network/sdks/community/wallets/community-wallets-integration#where-zk-proofs-come-from). 지갑별 proving 기능과 feature detection.
8. Midnight. [Wallet SDK WASM 구현](https://github.com/midnightntwrk/midnight-wallet/blob/main/packages/prover-client/src/effect/WasmProver.ts). 공식 공개 코드.
9. Midnight. [Leaderboard](https://github.com/midnightntwrk/midnight-leaderboard). Vercel·Railway 배포 사례.
10. Midnight. [Ledger 8.1.0 image build](https://github.com/midnightntwrk/midnight-ledger/blob/ledger-8.1.0/flake.nix), [Proof Server 실행 인자](https://github.com/midnightntwrk/midnight-ledger/blob/ledger-8.1.0/proof-server/src/main.rs). Native 배포 경로와 worker 설정.
11. Midnight Expert. [사이트](https://midnightntwrk.expert/), [공식 코드](https://github.com/midnightntwrk/midnight-expert). 개발 도구 역할.
12. Docker. [Run multiple processes in a container](https://docs.docker.com/engine/containers/multi-service_container/). Supervisor 방식의 근거.
13. Railway. [Docker Compose](https://docs.railway.com/guides/docker-compose), [Dockerfiles](https://docs.railway.com/builds/dockerfiles). 프로젝트와 서비스 패키징.
14. Railway. [Volume reference](https://docs.railway.com/volumes/reference). 단일 volume·replica·재배포 조건.
15. Railway. [MySQL](https://docs.railway.com/databases/mysql). 운영·백업 책임 범위.
16. Railway. [Public networking limits](https://docs.railway.com/networking/public-networking/specs-and-limits), [Healthchecks](https://docs.railway.com/deployments/healthchecks). 요청 수명과 준비 상태.
17. Railway. [Pricing plans](https://docs.railway.com/pricing/plans). 리소스 과금과 포함 사용료.
18. Vercel. [Container Images](https://vercel.com/docs/functions/container-images). OCI 지원과 Functions 수명.
19. Webisoft/1AM. [1AM custom contract integration](https://github.com/webisoftSoftware/1AM-starter-template/blob/main/1am.md), [authenticated proof adapter](https://github.com/webisoftSoftware/midnight-proof-provider-auth), [제품 사이트](https://1am.xyz/). 공급자 원문; 제품 주장과 실제 이용 가능성을 구분.
20. GASOK. [현재 아키텍처](/Users/leonid/projects/blockchain/gasok/docs/ai/ARCHITECTURE.md), [현재 맥락](/Users/leonid/projects/blockchain/gasok/docs/ai/CONTEXT.md), [할 일](/Users/leonid/projects/blockchain/gasok/docs/ai/TODO.md), [제출 기준](/Users/leonid/projects/blockchain/gasok/docs/ai/MIDNIGHT_HACKATHON_SUBMISSION.md). 현재 소스·지침과 별도 실행 검증의 경계.
