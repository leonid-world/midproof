# Codex 시작 프롬프트

반드시 `CODEX_MVP_SPEC.md` 전체를 먼저 읽어라.

목표는 GIWA 매출채권 금융 MVP의 P0 범위를 기존 저장소에 구현하는 것이다.

## 첫 작업

코드를 수정하지 말고 저장소를 먼저 분석한 뒤 다음을 보고하라.

1. 실제 디렉터리 구조
2. Frontend/Backend 프레임워크 및 버전
3. Java/Node/패키지 매니저 버전
4. 기존 인증 및 보안 구조
5. MyBatis Mapper 패턴
6. 공통 응답과 예외 처리 구조
7. 환경변수 구조
8. Solidity, ABI, Contract Address 존재 여부
9. 생성할 파일
10. 수정할 파일
11. DB 적용 계획
12. P0 구현 순서
13. 누락된 환경값과 위험 요소

## 구현 원칙

- 기존 아키텍처와 코딩 컨벤션을 우선한다.
- 대규모 리팩터링을 하지 않는다.
- P0 기능부터 순서대로 구현한다.
- Backend는 MySQL + MyBatis를 사용한다.
- Frontend Web3 연동은 ethers.js v6를 사용한다.
- 사용자 상태 변경 트랜잭션은 Frontend에서 MetaMask로 서명한다.
- Backend가 사용자의 Private Key를 보유하거나 대리 서명하면 안 된다.
- Private Key, Seed Phrase, MetaMask Password를 저장하거나 커밋하지 않는다.
- RPC, Chain ID, Explorer URL, Contract Address는 환경변수로 관리한다.
- uint256을 JavaScript Number로 변환하지 않는다.
- JavaScript는 bigint, Java는 BigDecimal을 사용한다.
- 각 주요 단계 후 build/test를 실행하고 오류를 수정한다.
- 블록체인 연동을 Mock 처리하고 완료했다고 주장하지 않는다.

## MVP 완료 조건

Seller 등록 → Buyer 검증 → Seller 토큰화 → Funder 자금공급 →
NFT 이전 → Buyer 상환 → Funder 수령까지 실제 GIWA 트랜잭션으로 성공해야 한다.

이제 저장소를 분석하고 구현 계획만 먼저 제시하라.
