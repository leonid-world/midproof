# 2026-09-18 공개 데모 전체 리허설

상태: **진행 중 — 완료 보고가 아니다.** 사용자는 mKRW 충전부터 채권 발행,
펀딩, Midnight 검증, 상환까지 실제 실행을 요청했다. 아래는 실제 관측과 미실행을
분리한 작업 기록이다. 기존 합성 데모 계정·기존 계약·기존 Railway/Vercel을 사용한다.

## 범위와 진행 순서

- GIWA Sepolia(chain 91342): 테스트 mKRW/NFT/펀딩/상환. 메인넷·실제 금전 없음.
- Midnight Preview: C01 수정 verifier를 기존 주소에서 원자적으로 교체한 뒤 실제 증명.
- 채권 A/B: 각 채권액 1,000 mKRW, 펀딩액 900 mKRW, 발행일 2026-09-18,
  만기일 2026-09-30. A는 Seller steady=true / Buyer stretched=false,
  B는 Seller stretched=false / Buyer steady=true 목표.
- 새 검증 요청은 TOKENIZED·미펀딩 채권만 받으므로 실제 순서는
  잔액/충전 → 생성 → Buyer 확인 → NFT → 요청/동의/ZK/조회 → 펀딩 → 상환이다.
- 충분한 잔액이 있는 기존 지갑의 owner mint는 필요하지 않다. Faucet은 사전 충전된
  재고를 지갑당 한 번 분배하며 공급량을 늘리지 않는다.

## 재개 시 확인된 상태

보조 작업 3개가 사용량 제한으로 중단됐다. 사용자 초기화 후 같은 파일에서 재개했으며,
새 배포·계약 유지보수·GIWA 체인 거래가 중단 중 실행된 흔적은 없었다.
로컬 Midnight gateway/prover 포트와 상태 잠금은 비어 있고, Docker에는 이 프로젝트의
MySQL만 실행 중이다. 로컬 8080 Java는 다른 프로젝트이므로 종료하지 않았다.

공개 조회: 2026-09-18 17:59:46 KST, GIWA block **36376866**.

| 역할 | mKRW | native ETH | Finance allowance | Faucet 수령 |
| --- | ---: | ---: | ---: | --- |
| Seller | 9,000,010 | 0.001492789539003618 | 0 | 아직 안 함 |
| Buyer | 9,999,980 | 0.001999245418600750 | 4,999,980 | 이미 함 |
| Funder | 1,110,010 | 0.011499228358140709 | 0 | 이미 함 |

- mKRW decimals=0, 공급량 1,000,000,000, Faucet 재고 580,000,000,
  고정 수령량 10,000,000. 세 역할 모두 이번 소액 리허설 잔액·gas가 충분하다.
- Token: `0x5cD8a99Dcf5Fa00fb4fD9873b41A15F9C13C9d3F`
- Faucet: `0xa451FA95c3E2Efd771f6Ba556daBBf36f888ef2E`
- Finance: `0x0f264334f98BA0d22f7Fc6Bb901a5Fa36158a315`
- Faucet/Finance의 paymentToken이 위 Token 주소와 일치함을 조회했다.
- 기존 onchain #1 REPAID, #2 TOKENIZED, #3/#4 FUNDED. 과거 큰 금액 채권은 사용하지 않는다.

Midnight 계약은
`bfb760db44f9ee7996ef12c47e56346903c654aede7d65c3c88110214c932a1e`,
유지보수 counter=0, authority threshold1/member1이다. 세 관리 circuit key는 로컬과 일치하고
verifyEligibility만 다르다.

- 기존 SHA-256: `86bce8c759de518b11efa3f5906ae6872ca91d2ac5ff040d5b6ca3744866dd60`
- 수정 SHA-256: `035debadf768d2e72ae8dcf712eb2607c0e64181e029b4689bdbb294a74fc508`
- 전환 전 full public state SHA-256:
  `3ddfac2748ec3905f66b1b4d6b49d4c67466d7f05a6af57ff629ad471d7e42b1`

## 실제 수행 기록

| 단계 | 실제 결과 | 증거/한계 |
| --- | --- | --- |
| 공개 앱 로그인 | Seller 로그인 및 등록 주소 일치 | midproof.vercel.app 브라우저 |
| GIWA/Faucet 사전 조회 | 위 잔액·재고·수령 여부·paymentToken 확인 | 읽기 전용 RPC |
| GIWA 계약 회귀 | **18/18 PASS** | Hardhat 격리 체인; live 영수증 아님 |
| 리허설 A 앱 등록 | **DB #2 CREATED**, 1,000/900 mKRW | 브라우저 등록 완료 표시 |
| A 온체인 생성 | **onchain #5**, 성공 receipt 및 DB #2 동기화 | 아래 생성 영수증 |
| Faucet 실제 수령 | 미실행 | Buyer/Funder 이미 수령; Seller 가능 |
| B 생성 | **DB #3 ↔ onchain #6 CREATED**, 1,000/900 mKRW | 생성 receipt·이벤트·상태 검증 통과 |
| Buyer 확인/NFT/펀딩/상환 | 미실행 | 아직 성공으로 판정하지 않음 |
| Preview verifier 전환 | **완료**: 같은 주소, 새 key, counter1 | journal complete + 독립 공개 원장 대조 |
| 새 Preview proof/finalization | 미실행 | 격리 proof와 구분 |

MetaMask 확장 전용 URL의 자동 접근이 브라우저 보안 정책에 의해 차단됐다.
우회 경로·CLI 개인키로 대체하지 않고 앱의 거래 준비까지만 수행하며,
계정 선택과 지갑 확인/서명은 사용자가 직접 해야 한다. 이 제한은
자동 승인 심사(auto-review)의 거절과는 다르다.

### A 생성의 실제 RPC 지연 복구

거래 `0xf9094af2cc78a4fc2a4e20124b585e49046630bf6aa71630991bd87916756665`,
receipt status=1, block `0x22b11e2`, Finance `ReceivableCreated` id5,
Seller/Buyer 주소와 1,000/900 금액 일치. 앱은 최초 canonical block 조회 실패를
보여주고 **기존 트랜잭션 확인 이어받기**를 제공했다. 그 버튼으로 동일 영수증을
재확인하자 온체인 ID5와 생성 Tx를 DB #2에 동기화했다. 중복 제출하지 않았다.

### Preview 검증 키 전환과 공개 배포

2026-09-18 18:15 KST 공개 조회에서 네 operation key가 모두 로컬 산출물과 일치했다.
`verifyEligibility`만 지정된 새 key로 바뀌고 maintenance counter0→1,
authority와 나머지 public state는 예정된 전후 전체 serialized hash와 일치했다.

- Railway 적용: `e58b6f76-d5ed-482b-ba4b-787470a41fb4`, SUCCESS.
- Vercel: `dpl_3bxfruxjKUeYy4JLFiM2QS3BgQKT`, READY/production,
  기존 `https://midproof.vercel.app` 공개 asset `index-DoRhjBIx.js` 응답 확인.
- 전환 후 state SHA-256:
  `4412aa10609ec9cc44817d409f0a9baec0fadf786c6472002c756a2ba8cf905e`.
- durable journal phase=complete, 실제 balanced transaction identifiers:
  `002aa4b5dab1ae2b45bcb34050380ee8696c7936d1cbd311ba3c6b15111a529313`,
  `00030e5dc9ec082e0a1bf931773bba3461bbdec67cc648d429380b1e10343266c7`.
- 암호화 snapshot: 20 files, 원본 963,451 bytes,
  `/data/midnight-demo/maintenance-backups/72962263bca99483cf2e50c4104c9db2b45522da1fbd61e159cefda23d0d4cc5`.
  owner-only snapshot이며 원본 비밀번호를 포함한 모든 파일을 추가 암호화했다.
  같은 볼륨의 전환 전 복구용 snapshot이며 별도 재해복구/오프사이트 백업은 아니다.
- `/health`·proof health 200, proofReady=true, Preview·기존 wallet/contract 그대로.
- 일회성 `MIDNIGHT_VERIFIER_MIGRATION_ENABLED=0` 설정으로 정상 재시작을 요청했다.
  재시작 `61fe8fbe-3180-462e-8688-bad77ce92a6b` SUCCESS, enabled0/overlap0/ready,
  동일 wallet/contract/complete journal을 SSH로 재확인했다. 비밀 값·지갑·DB 초기화·새 계약 생성 없음.

B 생성 거래는
`0x9fbda909c299d8d623a97f9ebb42ce380486367130e5a57aaea41a2d9a9147ae`,
block36377313, status1이다. A/B 각각 calldata·이벤트·canonical block·현재 계약 값
16개 검사 통과. Buyer 확인은 잘못 선택된 Seller 계정일 때 **전송 전 거절**을 확인했다.

### Faucet 공개 인터페이스와 승인 대기

기존 Faucet은 explorer에 ABI가 없어 Write Contract 화면이 없다. 로컬 source와
보존 Standard JSON을 solc0.8.24로 메모리 재컴파일해 배포 creation code+인자,
immutable 반영 runtime1805bytes가 공개 RPC와 완전히 일치함을 확인했다.
Runtime Keccak256=`0x60ca6a08f71f4b3f9df537fa0ed63cb142394dd7b0f1767c20cafdef8941c780`.

Hardhat verify로 source/공개 생성 인자를 게시하려던 실행은 **자동 승인 심사에서
거절됐다**. 이유: 공개 탐색기에 local Solidity source를 게시하는 되돌리기 어려운
공개 행위가 별도로 승인되지 않음. 명령은 실행되지 않았고 source/ABI도 미게시다.
검토 가능한 정확한 대상·인자를 제시해 사용자에게 공개 승인 질문을 보냈다.
승인 없이 다른 endpoint나 UI로 같은 게시를 우회하지 않는다.

브라우저 MetaMask 접근 제한과 이 source 게시 auto-review 거절은 별개다.
Buyer 계정 전환 질문 및 source 공개 승인 질문은 현재 답변 대기다.

## 완료 조건

각 live 거래의 tx hash·receipt status·정확한 이벤트·앱 DB 상태를 함께 기록한다.
펀딩 시 Seller +900/NFT Funder 소유, 상환 시 현재 NFT 소유자 +1,000/REPAID를
확인한다. 두 건이면 Seller 합계 +1,800, Buyer -2,000, Funder 순증 +200이다
(별도 Faucet 수령은 합산을 분리한다). Midnight는 네 역할/profile의 실제 결과·
Provider2·요청 결합·유효기간·Preview finalization과 독립 조회가 모두 필요하다.
실패/불확정 거래를 다시 생성하지 않고 기존 journal/receipt/state로 먼저 복구한다.

루트는 submodule commit pointer만 추적하며 `giwa-midnight` 내부 파일은 별도 Git이
추적한다. 현재 루트/API/UI/Midnight 변경은 미커밋 상태이며 기존 수정은 보존했다.
