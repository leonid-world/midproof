# GIWA Receivable Financing MVP 프로젝트 분석

## 문서 탐색

[최종 백서](./WHITEPAPER.md) | [시스템 아키텍처](./SYSTEM_ARCHITECTURE.md) | [스마트 컨트랙트](./SMART_CONTRACT_DESIGN.md) | [백엔드](./BACKEND_DESIGN.md) | [프런트엔드](./FRONTEND_DESIGN.md) | [보안 및 기술 의사결정](./SECURITY_AND_TECHNICAL_DECISIONS.md) | [백서 초안](./WHITEPAPER_DRAFT.md)

> 분석 기준: 저장소의 소스 코드, 설정, SQL 스키마/마이그레이션, 테스트, `docs/ai` 문서 및 배포 메타데이터. 문서의 설명은 소스와 대조했으며, 구현을 확인할 수 없는 기능은 구현되지 않은 것으로 표기했다. 이 문서는 백서가 아니다.

## 1. Overall Project Summary

GIWA Sepolia 기반의 매출채권 금융 데모(MVP)이다. Seller가 오프체인 매출채권을 등록하고 MetaMask로 온체인 채권을 생성한다. Buyer가 이를 검증하면 Seller가 ERC-721 NFT로 토큰화한다. Seller·Buyer와 다른 제3자 Funder는 MockKRW로 할인 금액을 Seller에게 지급하고 NFT를 받으며, Buyer는 원금(`faceValue`)을 당시 NFT 소유자에게 상환한다.

구성은 Vue 3 SPA(`giwa-ui`), Spring Boot REST API(`giwa-api`), MySQL 스키마(`.codex/schema.sql`), Solidity/Hardhat 컨트랙트(`giwa-contrract`)다. 서명과 트랜잭션 제출은 브라우저 MetaMask가 담당하고, 백엔드는 개인키를 보관하거나 트랜잭션에 서명하지 않는다. 백엔드는 RPC로 영수증·캘리데이터·이벤트를 검증한 뒤 DB 상태를 동기화한다.

이는 실제 금융 서비스가 아닌 MVP다. 실결제, KYC, 신용평가, 유동성 풀은 구현되어 있지 않다.

## 2. Folder Structure

| 경로                                    | 내용                                                                                      |
| --------------------------------------- | ----------------------------------------------------------------------------------------- |
| `.codex/`                               | MySQL 초기 스키마, 기존 DB용 비파괴 마이그레이션, MVP 명세                                |
| `docs/ai/`                              | 아키텍처, API, 배포, 프런트엔드/백엔드/컨트랙트 설계와 TODO 문서                          |
| `giwa-ui/`                              | Vue 3 + Vite + Pinia + ethers.js 프런트엔드                                               |
| `giwa-api/`                             | Spring Boot 4 / Java 17 / MyBatis 백엔드 및 H2 통합 테스트                                |
| `giwa-contrract/`                       | Solidity 컨트랙트, Hardhat 설정·배포·검증 스크립트·테스트 (`contrract`는 실제 디렉터리명) |
| `pitchdeck/`, `profile/`, `whitepaper/` | 발표 자료/프로필/기존 백서 초안 문서. 실행 코드가 아님                                    |
| `PromptRefer.md`                        | 다음 TODO 구현을 위한 짧은 프롬프트 참조                                                  |

루트에는 `README.md`, `TODO.md`, `CONTEXT.md`, `DECISIONS.md`가 없다. 해당 내용은 각각 주로 `docs/ai/PROJECT.md`, `docs/ai/TODO.md`, `docs/ai/CONTEXT.md`, `docs/ai/DECISIONS.md`에 있다.

## 3. Implemented Features

- 이메일/비밀번호 회원가입·로그인·현재 사용자 조회와 JWT 기반 인증
- 회원가입 시 회사와 사용자 계정을 하나의 DB 트랜잭션으로 생성
- MetaMask 계정 선택, 회사-지갑 전역 고유 매핑, 등록 지갑 조회
- 매출채권 생성, 관련 회사별 목록/상세 조회, 제3자 Funder용 TOKENIZED 기회 조회
- 순차 라이프사이클: `CREATED → VERIFIED → TOKENIZED → FUNDED → REPAID`
- Buyer의 명시적 검토 체크 및 체인 데이터 대조 후 검증 트랜잭션
- ERC-721 토큰화, 컨트랙트 에스크로, Funder 지급과 NFT 이전, Buyer 상환
- MockKRW 잔액·allowance 사전 점검과 Approval/본 거래의 분리 UX
- PENDING/CONFIRMED/FAILED 온체인 거래 저널, 동일 요청 재시도 멱등성, MetaMask 교체 거래 복구
- 백엔드 RPC 기반 트랜잭션·영수증·정규 블록·확정 수·함수 호출·이벤트·ERC-20/ERC-721 Transfer 검증
- 공통 API 오류 형식, 401/403 분리, CORS 설정, 공개 `/health`
- Hardhat 로컬 전체 라이프사이클 및 실패 롤백 테스트, Spring H2 통합 테스트
- GIWA Sepolia 배포 메타데이터와 프런트/백엔드용 주소 환경변수 기본값

## 4. Missing Features

- 실화폐 결제, KYC/AML, 기업·채권 외부 검증, 신용평가, 오라클, 법적 계약/추심 기능은 구현되지 않았다.
- 부분 펀딩·다중 Funder·부분 상환·연체료·디폴트 처리·펀딩 후 취소는 구현되지 않았다.
- 만기일은 저장·표시·검증되지만 컨트랙트의 상환 가능 시점을 제한하지 않는다.
- `CANCELLED` 상태는 Solidity enum에만 있으며 전이 함수/API/UI가 없다.
- 매출채권 수정·삭제 REST API는 없다. 실제 구현은 생성과 조회 및 상태 동기화만 제공한다.
- `receivable_documents` 테이블은 있으나 파일 업로드, 저장소 연동, 문서 API/백엔드 모듈은 없다. 현재 사용하는 것은 선택적 `documentHash` 문자열이다.
- 블록체인 인덱서, 웹훅/비동기 워커, 관리자 콘솔, 알림, 감사 리포트, CI/CD 구성 파일은 없다.
- 온체인 NFT는 일반 ERC-721 전송이 가능하며, 권한형 2차 유통 제한은 없다.

## 5. Business Logic

1. 가입자는 회사에 연결된 사용자로 생성된다. 사업자번호는 숫자 10자리로 정규화한다.
2. 인증 사용자는 MetaMask 주소 하나를 회사에 연결한다. 같은 주소를 다른 회사에 연결할 수 없으며, 동일 회사의 동일 주소 재연결은 멱등적이다.
3. Seller는 Buyer 사업자번호, 금액, 발행일/만기일, 선택 문서 해시를 넣어 채권을 생성한다. Seller와 Buyer 회사는 달라야 하며, `0 < fundingAmount ≤ faceValue`, `maturityDate > issueDate`가 강제된다.
4. Seller가 `createReceivable`을 실행하고, 확인된 거래 저널을 근거로 DB에 온체인 ID·컨트랙트 주소·생성 해시를 저장한다. DB 상태는 계속 `CREATED`다.
5. Buyer만 `verifyReceivable`을 실행할 수 있고, 확인 후 DB는 `VERIFIED`가 된다.
6. Seller만 `tokenizeReceivable`을 실행할 수 있다. NFT는 Seller가 아닌 Finance 컨트랙트로 민팅되어 에스크로된다.
7. Seller/Buyer가 아닌 Funder만 `fundReceivable`을 실행할 수 있다. MockKRW `fundingAmount`가 Funder에서 Seller로 이동하고, NFT는 에스크로에서 Funder로 원자적으로 이전된다.
8. Buyer만 `repayReceivable`을 실행할 수 있다. MockKRW `faceValue`는 등록 당시 Funder가 아니라 상환 시점의 NFT 소유자에게 지급된다. NFT는 소각되지 않는다.

DB 상태 전이는 각 단계의 CONFIRMED 거래 저널과 RPC 검증 증거를 요구한다. 같은 해시/메타데이터 재요청은 멱등적이고, 다른 메타데이터는 409 충돌이다.

## 6. Frontend Architecture

`giwa-ui`는 Vue 3 Composition API SPA다. Vite가 빌드하며, Pinia로 `auth`, `wallet`, `receivable` 상태를 관리한다. PrimeVue/Aura와 PrimeIcons를 사용하고, 라우터는 로그인 및 인증 필요 Dashboard/Receivables/Funding/Repayment 경로를 제공한다.

- `services/api.js`가 유일한 REST fetch 계층이다. Bearer JWT를 `localStorage`에서 읽고, API base URL의 끝 슬래시를 제거하며 `ApiError`로 공통 오류를 전달한다.
- `services/web3/provider.js`는 MetaMask 탐지, 필수 GIWA 체인 검증/전환, 등록 지갑 주소와 일치하는 signer 선택을 담당한다.
- `services/web3/receivableContract.js`는 ethers v6로 컨트랙트를 읽고 쓴다. 체인 사전검증, Approval, 거래 저널 등록/확정, 영수증 이벤트 파싱, 교체 거래 탐색/복구, 백엔드 전용 동기화 재시도를 구현한다.
- `FundingView.vue`와 `RepaymentView.vue`는 각각 1,000줄 이상으로 UI와 흐름 제어를 한 파일에 함께 둔다. 기능은 구현되어 있으나 화면 단위 분해는 되어 있지 않다.
- 브라우저 복구 정보와 JWT는 `localStorage`를 사용한다. 개인키·시드 문구는 저장하지 않는다.
- Vue 시작 템플릿 계열의 `HelloWorld`, `TheWelcome`, `WelcomeItem`, `AboutView`, `HomeView`, `counter` store 및 아이콘 컴포넌트가 남아 있으나 현재 라우팅된 핵심 플로우에는 사용되지 않는다.

## 7. Backend Architecture

`giwa-api`는 Spring Boot 4.1.0, Java 17, MyBatis, MySQL Connector/J, JJWT, Spring Security로 구성된다. 주 모듈은 `auth`, `company`, `wallet`, `receivable`, `transaction`, `common/error`, `config`, `health`다. 문서에 언급된 `document` 모듈은 소스에는 없다.

- JWT 필터는 유효한 Bearer 토큰의 이메일을 보안 컨텍스트에 넣는다. `/auth/signup`, `/auth/login`, `/health`만 공개다.
- 비밀번호는 BCrypt로 해시한다. JWT는 email을 subject로 사용하고 issued-at 및 expiration을 기록하며 기본 만료는 24시간이다.
- Mapper annotation SQL로 DB 접근하며, 매출채권과 거래 저널 상태 UPDATE에 회사·상태·필수 메타데이터 조건을 중복 적용한다.
- `ReceivableService`가 권한/상태/멱등성/상태이력 및 체인 동기화를 관리한다.
- `BlockchainTransactionService`가 거래 저널 생성, 확인, 실패, 조회, 역할별 가시성을 관리한다.
- `BlockchainTransactionVerifier`와 `GiwaJsonRpcClient`가 JSON-RPC에서 거래·영수증·블록을 가져와 독립 검증한다. 클라이언트가 전송한 gas/block 값은 검증 입력 힌트일 뿐, 저장하는 확정 증거는 RPC 값을 사용한다.
- 공통 오류 응답은 `status`, `code`, `message`, `path`, `timestamp`, `fieldErrors`다.

## 8. Smart Contract Architecture

`ReceivableFinance.sol`은 OpenZeppelin ERC-721과 `ReentrancyGuard`, `SafeERC20`을 사용한다. 생성자에서 불변 `paymentToken`(MockKRW)을 받고, 매출채권별 Seller/Buyer/Funder, 금액, 날짜, 문서 해시, 토큰 ID, 상태를 저장한다.

- `createReceivable`: caller를 Seller로 기록하고 CREATED 이벤트를 낸다. NFT는 아직 민팅하지 않는다.
- `verifyReceivable`: 저장된 Buyer만 CREATED에서 VERIFIED로 바꾼다.
- `tokenizeReceivable`: 저장된 Seller만 VERIFIED에서 NFT를 컨트랙트 자신에게 민팅한다.
- `fundReceivable`: 관련 당사자가 아닌 제3자만 TOKENIZED에서 호출할 수 있다. `safeTransferFrom`으로 MockKRW를 Seller에게 보내고 NFT를 Funder에게 보낸다.
- `repayReceivable`: Buyer만 FUNDED에서 호출한다. `ownerOf(tokenId)`를 수취인으로 읽고 전액을 송금한다.
- `getReceivable`: 저장된 구조체를 반환한다. 존재하지 않는 ID는 custom error로 revert한다.

`MockKRW.sol`은 OpenZeppelin ERC-20/Ownable 기반의 데모 토큰이다. 소수점은 0이고, 배포자는 초기 10억 토큰을 받으며 owner만 데모용 mint를 할 수 있다. 실물 KRW와의 교환·담보·준비금 메커니즘은 없다.

## 9. Database Structure

초기 MySQL 8 스키마는 `.codex/schema.sql`에 있다. 이 파일은 모든 테이블을 DROP 후 생성하므로 기존 데이터베이스에 재실행하면 안 된다.

| 테이블                      | 역할 및 핵심 구조                                                                                       |
| --------------------------- | ------------------------------------------------------------------------------------------------------- |
| `companies`                 | 회사명, 10자리 사업자번호(UNIQUE), 상태                                                                 |
| `users`                     | 이메일(UNIQUE), BCrypt 해시, 사용자명, 회사 FK                                                          |
| `company_wallets`           | 회사-지갑 주소(전역 UNIQUE), chain ID, primary/verified 관련 컬럼                                       |
| `receivables`               | 당사자/지갑, 정수 KRW 금액 `DECIMAL(36,0)`, 날짜, DB 상태, 문서 해시, 온체인 ID, NFT ID, 계약/거래 해시 |
| `receivable_documents`      | 파일 메타데이터 및 SHA-256 해시를 위한 테이블. 현재 코드에서 사용하지 않음                              |
| `blockchain_transactions`   | 전역 고유 tx hash, PENDING/CONFIRMED/FAILED, RPC 증거 요약, 검증 CAS 버전, 오류                         |
| `receivable_status_history` | 상태 전이 전/후 값, 변경 회사/지갑, tx hash, 사유                                                       |

`receivables`에는 Seller/Buyer 상이성, 양수 금액, 할인 금액 상한, 날짜 순서 CHECK와 `(contract_address, onchain_receivable_id)`, create/verify hash UNIQUE 제약이 있다. 온체인 ID와 token ID는 `BIGINT UNSIGNED`/Java `Long`이므로 임의의 `uint256` 범위 전체를 수용하지는 못한다.

기존 DB용 마이그레이션은 체인 메타데이터 UNIQUE, 거래 저널 생성, RPC proof 컬럼, `verification_version` 추가를 제공한다. 적용 전 백업과 사전 조회가 요구된다.

## 10. API Summary

모든 API는 `/health`, 회원가입/로그인을 제외하고 JWT 인증을 요구한다.

| 영역                | 엔드포인트                                                                          | 구현 내용                                         |
| ------------------- | ----------------------------------------------------------------------------------- | ------------------------------------------------- | ------------------------------------- | ------ | ------- | -------------------------------------------- |
| Health              | `GET /health`                                                                       | `{"status":"UP"}` 반환. DB 연결성은 검사하지 않음 |
| Auth                | `POST /auth/signup`, `POST /auth/login`, `GET /auth/me`                             | 계정/회사 생성, JWT 발급, 현재 사용자 조회        |
| Wallet              | `POST /wallet/connect`, `GET /wallet/me`                                            | 지갑 매핑/조회                                    |
| Receivable          | `POST /receivables`, `GET /receivables`, `GET /receivables/{id}`                    | 생성 및 권한 범위 내 조회                         |
| Funding             | `GET /receivables/funding-opportunities`                                            | 미배정 TOKENIZED 채권 중 제3자 후보만 조회        |
| Lifecycle sync      | `POST /receivables/{id}/chain-created                                               | verified                                          | tokenized                             | funded | repaid` | RPC 검증된 저널 거래를 근거로 DB 상태 동기화 |
| Transaction journal | `POST /blockchain-transactions`, `PATCH /blockchain-transactions/{txHash}/confirmed | failed`, `GET /receivables/{id}/transactions`     | 거래 추적, RPC 확인/실패, 권한별 조회 |

수정/삭제, 문서 업로드/다운로드, 회사 관리, 관리자, 검색·페이지네이션 API는 구현되어 있지 않다.

## 11. Deployment Architecture

프런트엔드는 Vite 산출물을 Vercel에, 백엔드는 `giwa-api/Dockerfile`을 사용해 Railway에 배포하는 구성을 문서와 환경 파일에서 확인할 수 있다. Dockerfile은 Java 17 JDK Alpine 빌드 후 JRE Alpine 런타임에서 non-root `app` 사용자로 `app.jar`를 실행한다.

```text
브라우저 + MetaMask
  ├─ HTTPS REST/JWT → Vercel SPA → Railway Spring API → Railway MySQL
  └─ MetaMask 서명/전송 → GIWA Sepolia ReceivableFinance / MockKRW
                               ↑
                        Railway API의 JSON-RPC 검증
```

환경변수는 프런트 `VITE_API_URL`, `VITE_GIWA_*`, `VITE_RECEIVABLE_FINANCE_ADDRESS`, `VITE_MOCK_KRW_ADDRESS`와 백엔드 DB/JWT/CORS/GIWA RPC 변수다. 배포 메타데이터에는 GIWA Sepolia chain ID 91342와 검증된 교체 주소 쌍이 기록되어 있다.

저장소에는 Vercel/Railway 서비스 설정 파일, GitHub Actions 등 CI/CD 자동화, IaC, 비밀관리 시스템 구성은 없다. 실제 Railway/Vercel 런타임 변수는 저장소만으로 검증할 수 없다.

## 12. Security Mechanisms

- 개인키/시드 구문을 저장하지 않고 모든 쓰기 거래를 MetaMask signer로 처리
- BCrypt 비밀번호 해싱, JWT 서명·만료, stateless Spring Security
- 인증 401과 권한 403, 충돌 409을 구분한 공통 오류 응답
- 지갑 주소의 전역 UNIQUE와 회사 귀속 검증; 다른 회사 정보는 충돌 응답에 노출하지 않음
- 역할·상태·지갑·계약 주소를 백엔드에서 다시 검증하고 SQL UPDATE 조건에도 반영
- 전역 tx hash UNIQUE, 멱등성 처리, 상태 이력, 거래 저널 및 `verification_version` CAS
- RPC에서 체인 ID, signer, target, native value=0, ABI selector/인자, canonical block, confirmations, 예상 이벤트 수, ERC-20/ERC-721 Transfer를 검증
- Funding/Repayment에는 `SafeERC20`, 재진입 방지, 토큰 잔액/allowance 사전검증 사용
- 정확한 CORS origin 목록, 컨테이너 non-root 실행

다만 CSRF는 비활성화되어 있으며(Bearer 토큰 방식), 기본 `JWT_SECRET` fallback도 `application.yml`에 존재한다. 운영에서는 강한 `JWT_SECRET`을 별도로 설정해야 한다. 이 MVP에는 KYC, 권한형 NFT 양도 제한, 다중 서명, 키 관리, 침해 탐지 같은 프로덕션 금융 보안은 없다.

## 13. Known Limitations

- 계약은 만기 이후 상환만 허용하지 않는다. 조기 상환도 가능하다.
- ERC-721은 Funder가 받은 뒤 일반 전송할 수 있고, 상환금은 현재 보유자에게 가므로 원래 Funder와 달라질 수 있다.
- 여러 브라우저/탭이 해시 등록 전에 동시에 tokenize/fund/repay를 시도하는 경우를 원자적으로 막는 서버 intent lease가 없다. 두 번째 체인 호출은 상태 revert될 수 있어 gas가 소모될 수 있다.
- 클라이언트 복구는 제한된 블록 범위 스캔에 의존하는 legacy 경로가 있어, 오래된 거래나 RPC 보존 범위 밖 거래의 자동 교체 탐색은 보장되지 않는다.
- 블록체인 인덱서가 없어 백엔드 동기화는 브라우저 및 API 재시도에 의존한다.
- `/health`는 DB/RPC 상태를 검증하지 않는 liveness endpoint다.
- 스키마의 온체인 ID/token ID가 `Long` 범위에 제한된다.
- `receivable_documents`는 고아 스키마이며 실제 파일 보관/검증 흐름이 없다.
- Hardhat 2 및 solc 개발 의존성 트리에 감사 경고가 남아 있으며, 문서상 도구체인 업그레이드가 미완료다.
- 컨트랙트는 proxy/upgrade 경로가 없고, 새 배포는 이전 채권·NFT·MockKRW 잔액·allowance와 독립적이다.

## 14. TODOs discovered from the source code

`docs/ai/TODO.md`와 배포 문서에서 확인되는 미완료 항목은 다음과 같다.

- 기존 MySQL에 체인 메타데이터 UNIQUE 및 거래 저널/RPC proof/verification version 마이그레이션을 조건에 맞게 적용
- Railway MySQL 참조, 강한 JWT secret, Vercel CORS origin 설정 및 새 Railway 스키마 초기화
- Railway에 `GIWA_MOCK_KRW_ADDRESS` 설정 후 Funding 백엔드 배포, Repayment 백엔드 배포, 해당 Vercel 재배포
- 현재 NFT 소유자가 실제로 `faceValue` 전액을 수령했는지 확인
- Railway/Vercel 런타임 계약 주소 쌍을 교체 배포본으로 갱신하고, 신규 데이터로 CREATED→REPAID 데모를 재수행
- Hardhat 2/solc 개발 전용 의존성 감사 경고를 제거할 도구체인 업그레이드
- 동시 제출로 인한 불필요한 revert gas를 줄이기 위한 채권별 intent lease 도입 검토
- 구현되지 않은 블록체인 인덱서, 문서 업로드, 수정/삭제 API, 프로덕션 금융 보안은 소스 기준으로 별도 향후 과제다.

문서에는 원본 배포본에서 전체 라이프사이클을 수행했다고 기록되어 있으나, 이 분석은 외부 Railway/Vercel/체인 런타임 상태를 새로 검증하지 않았다. 저장소가 보장하는 것은 소스·테스트·기록된 배포 메타데이터 범위다.
