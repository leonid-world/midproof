# GIWA 매출채권 금융 MVP — Codex 구현 명세

## 0. 목적

이 문서는 PoC가 완료된 GIWA 기반 매출채권 토큰화 프로젝트를
Codex가 실제 MVP로 구현하기 위한 단일 기준 문서다.

MVP의 성공 기준은 아래 전체 흐름이 실제로 동작하는 것이다.

```text
기업 회원가입 및 일반 로그인
→ MetaMask 연결
→ 로그인 기업과 공개 지갑 주소 매핑
→ Seller가 Buyer 대상 매출채권 등록
→ Seller가 GIWA에 채권 생성
→ Buyer가 지갑 서명으로 채권 검증
→ Seller가 채권을 ERC-721로 토큰화
→ Funder가 MockKRW를 공급
→ Funder가 채권 NFT 취득
→ Buyer가 MockKRW로 상환
→ Funder가 상환금 수령
→ Backend DB와 온체인 상태 동기화
```

이 MVP는 실제 금융서비스가 아니다.
GIWA Sepolia에서 RWA 업무 흐름을 검증하는 데모용 애플리케이션이다.

---

## 1. 기술 스택

기존 저장소가 있다면 기존 구조와 버전을 우선한다.

### Frontend
- Vue 3
- Vite
- Pinia
- Vue Router
- Axios
- ethers.js v6
- MetaMask

### Backend
- Java 17+
- Spring Boot 3.x
- Spring Security 6
- JWT
- MyBatis
- MySQL 8
- Gradle

### Blockchain
- GIWA Sepolia
- Solidity `^0.8.24`
- OpenZeppelin ERC-20 / ERC-721
- Remix IDE로 배포
- Frontend에서 ABI와 Contract Address 사용

---

## 2. MVP 범위

### 반드시 구현

#### Frontend
- 회원가입
- 일반 로그인
- 로그인 상태 유지
- MetaMask 연결
- GIWA Sepolia 네트워크 확인 및 전환
- 현재 기업과 지갑 주소 매핑
- 채권 등록
- 채권 목록 및 상세
- Buyer 검증
- Seller 토큰화
- Funder 자금 공급
- Buyer 상환
- 트랜잭션 상태 UI
- GIWA Explorer 링크

#### Backend
- 기업 및 사용자 관리
- 일반 로그인 및 JWT
- 기업과 지갑 주소 매핑
- 매출채권 오프체인 데이터 저장
- 문서 메타데이터와 SHA-256 해시 저장
- 온체인 ID, Token ID, Contract Address, Tx Hash 저장
- 상태 이력 및 트랜잭션 이력
- MySQL + MyBatis

#### Smart Contract
- 채권 생성
- Buyer 검증
- ERC-721 토큰화
- MockKRW 발행
- Funder 자금 공급
- NFT 이전
- Buyer 상환
- Funder 상환금 수령
- 상태 조회 및 이벤트

### 구현하지 말 것
- 실제 원화나 실제 USDC
- 실제 투자 모집
- 실제 채권양도 법률 절차
- KYC/KYB
- 전자세금계산서 API
- 신용평가
- 경매
- 다수 투자자 분할 투자
- 유동성 풀 및 LP 토큰
- 2차 거래
- 자동 청산
- 자동 상환 봇
- Oracle
- Kafka, Redis, Kubernetes, MSA
- 자체 블록체인 인덱서
- 관리자용 복잡한 통계
- 모바일 앱
- 다국어

---

## 3. 역할 정의

역할은 회사의 고정 속성이 아니라 **채권 거래별 역할**이다.

| 역할 | 정의 |
|---|---|
| Seller | 해당 거래에서 물품·서비스를 판매하고 돈을 받을 기업 |
| Buyer | 해당 거래에서 물품·서비스를 구매하고 돈을 지급할 기업 |
| Funder | 할인된 금액을 Seller에게 선지급하고 채권 NFT를 받는 자금공급자 |
| Debtor | 만기에 상환해야 하는 주체. 해당 거래의 Buyer |
| Receivable Holder | 채권의 경제적 권리를 가진 주체 |
| Face Value | Buyer가 만기에 지급할 액면가 |
| Funding Amount | Funder가 Seller에게 먼저 지급할 금액 |

`companies.role = SELLER` 같은 고정 역할 컬럼은 만들지 않는다.

---

## 4. 정상 상태 전이

Backend와 Smart Contract에서 동일한 상태명을 사용한다.

```text
CREATED
→ VERIFIED
→ TOKENIZED
→ FUNDED
→ REPAID
```

추가 상태:

```text
CANCELLED
```

실패는 채권 상태가 아니라 `blockchain_transactions.tx_status`로 관리한다.

금지 예:

```text
CREATED → TOKENIZED
VERIFIED → FUNDED
REPAID → FUNDED
```

---

## 5. 상세 프로세스

### 5.1 회원가입

```text
기업 및 담당자 정보 입력
→ companies 생성
→ users 생성
→ 비밀번호 BCrypt 암호화
→ 로그인 가능
```

최소 필드:
- 이메일
- 비밀번호
- 담당자명
- 기업명
- 사업자번호
- 대표자명

### 5.2 일반 로그인

```text
이메일 + 비밀번호
→ Spring Security 인증
→ JWT Access Token 발급
→ Frontend 저장
→ /auth/me 호출
```

MVP에서는 Refresh Token을 생략할 수 있다.

### 5.3 지갑 연결

```text
일반 로그인
→ "지갑 연결" 클릭
→ window.ethereum 확인
→ eth_requestAccounts 호출
→ MetaMask 계정 선택
→ GIWA Sepolia 확인
→ 필요 시 네트워크 추가/전환
→ 공개 지갑 주소 획득
→ Backend에 저장
→ 현재 로그인 기업과 지갑 주소 매핑
```

저장:
- 공개 지갑 주소
- Chain ID
- Wallet Type
- Primary 여부
- 연결 시각

절대 저장 금지:
- Private Key
- Seed Phrase
- MetaMask Password

MVP에서는 nonce 기반 지갑 소유권 검증을 선택사항으로 둔다.

### 5.4 매출채권 DB 등록

```text
Seller 로그인
→ Buyer 기업 선택
→ 액면가, 요청금액, 발행일, 만기일 입력
→ 증빙 문서 선택
→ Backend DB 등록
→ 상태 CREATED
→ document hash 반환
```

검증:
- Seller와 Buyer가 달라야 함
- 액면가 > 0
- 요청금액 > 0
- 요청금액 <= 액면가
- 만기일 > 발행일
- Seller와 Buyer 모두 활성 지갑이 있어야 함

### 5.5 GIWA 채권 생성

```text
DB 등록 완료
→ Frontend에서 createReceivable 호출
→ MetaMask 서명
→ GIWA 트랜잭션
→ receipt와 event에서 onchainReceivableId 추출
→ Backend에 txHash와 onchainReceivableId 저장
```

### 5.6 Buyer 검증

```text
Buyer 로그인
→ 자신이 Buyer인 CREATED 채권 조회
→ "검증" 클릭
→ verifyReceivable 호출
→ MetaMask 서명
→ 성공 receipt 확인
→ Backend 상태 VERIFIED
```

권한:
- `msg.sender == buyer`
- 현재 상태 `CREATED`

### 5.7 Seller 토큰화

```text
Seller 로그인
→ VERIFIED 채권 조회
→ "토큰화" 클릭
→ tokenizeReceivable 호출
→ ERC-721 생성
→ NFT 초기 보관자는 Financing Contract
→ tokenId 추출
→ Backend 상태 TOKENIZED
```

NFT를 컨트랙트가 보관하는 이유:
- Seller의 별도 NFT approve 단계를 생략
- Funder가 자금을 공급할 때 원자적으로 NFT 이전

### 5.8 Funder 자금 공급

```text
Funder 로그인
→ TOKENIZED 채권 목록
→ 채권 선택
→ MockKRW allowance 조회
→ 부족하면 approve
→ MetaMask 서명
→ fundReceivable 호출
→ Funder에서 Seller로 Funding Amount 이동
→ Contract에서 Funder로 NFT 이전
→ Backend 상태 FUNDED
```

제약:
- Funder는 Seller 또는 Buyer가 아니어야 함
- 선착순 단일 Funder
- 잔액과 allowance 충분해야 함

### 5.9 Buyer 상환

```text
Buyer 로그인
→ 자신이 Buyer인 FUNDED 채권 조회
→ MockKRW approve
→ repayReceivable 호출
→ Buyer에서 현재 NFT Owner에게 Face Value 이동
→ 상태 REPAID
```

자동상환은 구현하지 않는다.

---

## 6. 화면 구성

### 공개
- `/login`
- `/signup`

### 인증 후
- `/dashboard`
- `/wallet`
- `/receivables`
- `/receivables/new`
- `/receivables/:id`
- `/funding`

### Dashboard
최소 카드:
- 등록 채권
- 검증 대기
- 토큰화 완료
- 자금 공급 완료
- 상환 완료

### 채권 목록 컬럼
- DB ID
- 온체인 ID
- Seller
- Buyer
- Face Value
- Funding Amount
- Maturity Date
- Status
- Token ID
- 상세

### 채권 상세 버튼 노출 조건
- 현재 기업 == Buyer && status == CREATED: `검증`
- 현재 기업 == Seller && status == VERIFIED: `토큰화`
- 현재 기업 != Seller/Buyer && status == TOKENIZED: `자금 공급`
- 현재 기업 == Buyer && status == FUNDED: `상환`

---

## 7. Frontend Web3 구조

```text
src/
├── contracts/
│   ├── ReceivableFinance.abi.json
│   ├── MockKRW.abi.json
│   └── addresses.js
├── services/web3/
│   ├── provider.js
│   ├── wallet.js
│   ├── network.js
│   ├── receivableContract.js
│   └── mockKrwContract.js
├── stores/
│   ├── auth.js
│   ├── wallet.js
│   └── receivable.js
└── views/
```

조회:

```javascript
const provider = new ethers.JsonRpcProvider(GIWA_RPC_URL);
```

상태 변경:

```javascript
const browserProvider = new ethers.BrowserProvider(window.ethereum);
const signer = await browserProvider.getSigner();
```

Frontend가 구현할 것:
- MetaMask 미설치
- 연결
- 계정 변경
- 네트워크 전환
- 서명 대기
- 사용자 거절
- 가스 부족
- Pending
- Confirmed
- Failed
- Explorer 링크

Frontend가 구현하지 않을 것:
- 개인키 관리
- 직접 서명 알고리즘
- 직접 가스비 계산
- 서버 대리 서명

환경변수:

```env
VITE_GIWA_CHAIN_ID=
VITE_GIWA_CHAIN_ID_HEX=
VITE_GIWA_RPC_URL=
VITE_GIWA_EXPLORER_URL=
VITE_RECEIVABLE_FINANCE_ADDRESS=
VITE_MOCK_KRW_ADDRESS=
```

---

## 8. Backend 패키지 구조

기존 프로젝트가 있다면 기존 패턴을 우선한다.

```text
src/main/java/com/example/receivable/
├── common/
│   ├── config/
│   ├── exception/
│   ├── response/
│   ├── security/
│   └── util/
├── auth/
├── user/
├── company/
├── wallet/
├── receivable/
├── document/
└── transaction/
```

각 도메인 권장 구조:

```text
controller/
dto/
mapper/
model/
service/
```

MyBatis XML:

```text
src/main/resources/mapper/
├── UserMapper.xml
├── CompanyMapper.xml
├── WalletMapper.xml
├── ReceivableMapper.xml
├── ReceivableDocumentMapper.xml
├── BlockchainTransactionMapper.xml
└── ReceivableStatusHistoryMapper.xml
```

---

## 9. DB 테이블

전체 실행 SQL은 별도 `schema.sql`을 사용한다.

### companies
기업 마스터.

### users
로그인 사용자. 하나의 기업에 속한다.

### company_wallets
기업과 공개 지갑 주소 매핑.

### receivables
채권의 오프체인 원본 데이터와 현재 상태.

### receivable_documents
증빙 문서 메타데이터와 SHA-256.

### blockchain_transactions
모든 온체인 요청과 receipt 결과.

### receivable_status_history
채권 상태 변경 이력.

중요 설계:
- 금액: `DECIMAL(36,0)`
- onchain ID와 tokenId: `DECIMAL(78,0)`
- 주소: `VARCHAR(42)`
- tx hash: `VARCHAR(66)`
- Java 금액: `BigDecimal`
- JavaScript 온체인 정수: `bigint`
- uint256을 JavaScript `Number`로 변환 금지

---

## 10. REST API

Base path:

```text
/api/v1
```

### Auth

```http
POST /auth/signup
POST /auth/login
GET  /auth/me
```

### Company

```http
GET /companies
GET /companies/{companyId}
```

### Wallet

```http
POST /wallets/connect
GET  /wallets/me
```

연결 요청:

```json
{
  "walletAddress": "0x...",
  "chainId": 91342,
  "walletType": "METAMASK"
}
```

### Receivable

```http
POST /receivables
GET  /receivables
GET  /receivables/{id}

POST /receivables/{id}/chain-created
POST /receivables/{id}/verified
POST /receivables/{id}/tokenized
POST /receivables/{id}/funded
POST /receivables/{id}/repaid
```

목록 query:

```text
relation=SELLER|BUYER|FUNDER|AVAILABLE_FUNDING|ALL_RELATED
status=CREATED|VERIFIED|TOKENIZED|FUNDED|REPAID
page=1
size=20
```

### Blockchain Transaction

```http
POST  /blockchain-transactions
PATCH /blockchain-transactions/{txHash}/confirmed
PATCH /blockchain-transactions/{txHash}/failed
GET   /receivables/{id}/transactions
```

---

## 11. Frontend-Backend 동기화

예: 토큰화

```text
1. 채권 상세 조회
2. 현재 지갑과 Seller 주소 비교
3. tokenizeReceivable 실행
4. txHash 확보
5. Backend transaction PENDING 저장
6. tx.wait()
7. event에서 tokenId 추출
8. Backend /tokenized 호출
9. receivables 상태 TOKENIZED
10. transaction CONFIRMED
11. 화면 재조회
```

온체인 성공 후 Backend 갱신 실패 시:
- `온체인 성공 / 서버 동기화 실패` 안내
- txHash 유지
- 재동기화 가능하도록 API 구성

별도 인덱서나 자동 복구 배치는 MVP에서 제외한다.

---

## 12. Smart Contract 요구사항

권장 파일:

```text
MockKRW.sol
ReceivableFinance.sol
```

### MockKRW
- OpenZeppelin ERC20
- 이름: Mock Korean Won
- 심볼: mKRW
- 데모 지갑에 mint 가능
- 실제 가치 없음 명시

### ReceivableFinance
- ERC721 상속
- SafeERC20
- ReentrancyGuard
- 업그레이드 프록시 금지

상태:

```solidity
enum Status {
    CREATED,
    VERIFIED,
    TOKENIZED,
    FUNDED,
    REPAID,
    CANCELLED
}
```

구조체:

```solidity
struct Receivable {
    uint256 id;
    address seller;
    address buyer;
    address funder;
    uint256 faceValue;
    uint256 fundingAmount;
    uint256 issueDate;
    uint256 maturityDate;
    bytes32 documentHash;
    uint256 tokenId;
    Status status;
}
```

필수 함수:

```solidity
createReceivable(...)
verifyReceivable(uint256 receivableId)
tokenizeReceivable(uint256 receivableId)
fundReceivable(uint256 receivableId)
repayReceivable(uint256 receivableId)
getReceivable(uint256 receivableId)
```

권한:
- create: Seller 지갑
- verify: 해당 Buyer
- tokenize: 해당 Seller
- fund: Seller/Buyer가 아닌 제3자
- repay: 해당 Buyer

토큰화:
- `status == VERIFIED`
- NFT를 `address(this)`에 mint
- 상태 `TOKENIZED`

자금 공급:
- `status == TOKENIZED`
- MockKRW `transferFrom(funder, seller, fundingAmount)`
- NFT `address(this) → funder`
- 상태 `FUNDED`

상환:
- `status == FUNDED`
- `msg.sender == buyer`
- 현재 NFT owner 조회
- MockKRW `transferFrom(buyer, owner, faceValue)`
- 상태 `REPAID`

필수 이벤트:

```solidity
ReceivableCreated
ReceivableVerified
ReceivableTokenized
ReceivableFunded
ReceivableRepaid
```

---

## 13. 예외 코드

```text
METAMASK_NOT_INSTALLED
WALLET_NOT_CONNECTED
WRONG_NETWORK
WALLET_MISMATCH
USER_REJECTED
INSUFFICIENT_GAS
INSUFFICIENT_MOCK_KRW
INSUFFICIENT_ALLOWANCE
INVALID_RECEIVABLE_STATUS
ONLY_SELLER
ONLY_BUYER
ALREADY_FUNDED
ALREADY_REPAID
TRANSACTION_REVERTED
BACKEND_SYNC_FAILED
```

공통 응답 예:

```json
{
  "success": false,
  "code": "INVALID_RECEIVABLE_STATUS",
  "message": "현재 상태에서는 요청을 처리할 수 없습니다."
}
```

---

## 14. Seed 계정

개발환경 전용:

```text
seller@example.com / password123!
buyer@example.com  / password123!
funder@example.com / password123!
```

지갑 주소는 seed에 넣지 않는다.
각 계정으로 로그인한 뒤 MetaMask 연결을 통해 저장한다.

MockKRW 권장 잔액:
- Seller: 0
- Buyer: 100,000,000
- Funder: 100,000,000

---

## 15. 구현 우선순위

### P0
1. 저장소 분석
2. MySQL schema 적용
3. 회원가입/로그인/JWT
4. 기업 및 지갑 매핑
5. 채권 CRUD 최소 기능
6. MetaMask + GIWA 연결
7. ABI/address 연결
8. createReceivable
9. verifyReceivable
10. tokenizeReceivable
11. approve + fundReceivable
12. approve + repayReceivable
13. 상태 및 txHash 저장
14. Explorer 링크
15. 전체 시나리오 테스트

### P1
- 문서 업로드
- SHA-256
- 상태 이력
- 트랜잭션 이력 화면
- Dashboard
- nonce 지갑 서명 검증
- 재동기화

### 제외
- Oracle
- 자동상환
- 다중 Funder
- 분할 투자
- 신용평가
- 운영 인프라

---

## 16. Codex 작업 규칙

Codex는 코드를 수정하기 전에 저장소를 분석하고 아래를 먼저 보고한다.

```text
- 실제 디렉터리 구조
- Frontend/Backend 버전
- Java/Node 버전
- 패키지 매니저
- 인증 구조
- MyBatis 패턴
- 공통 응답/예외 구조
- 기존 환경변수
- 기존 Solidity/ABI/address
- 변경 파일
- 신규 파일
- 구현 순서
- 누락된 환경값
```

구현 원칙:
- 기존 구조 우선
- P0부터 구현
- 대규모 리팩터링 금지
- Private Key 저장 금지
- 사용자 트랜잭션은 Frontend MetaMask 서명
- Backend 대리 서명 금지
- RPC와 주소는 환경변수
- DTO Validation
- 금액 BigDecimal
- 온체인 정수 bigint
- MyBatis SQL에서 상태 조건 포함
- `SELECT *` 금지
- 각 단계마다 build/test 수행
- 실패를 숨기지 말 것

---

## 17. 완료 조건

아래가 실제로 성공해야 한다.

```text
1. Seller 로그인 및 지갑 연결
2. Buyer 로그인 및 지갑 연결
3. Funder 로그인 및 지갑 연결
4. Seller가 Buyer 대상 채권 등록
5. GIWA createReceivable 성공
6. Buyer verify 성공
7. Seller tokenize 성공
8. tokenId 생성
9. Funder MockKRW approve
10. Funder fund 성공
11. Seller 잔액 증가
12. Funder가 NFT owner
13. Buyer MockKRW approve
14. Buyer repay 성공
15. Funder 잔액 증가
16. 상태 REPAID
17. 모든 txHash Explorer 확인
18. DB 상태와 온체인 상태 일치
```

MVP의 최종 성공 문장:

> Seller가 등록한 매출채권을 Buyer가 검증하고, GIWA에서 ERC-721로 토큰화한 뒤, Funder가 MockKRW를 공급해 NFT를 취득하고, Buyer가 상환하여 Funder가 상환금을 받는다.
