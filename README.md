# MidProof · 비공개 재무 검증

**가상 기업의 재무 조건을 실제 Midnight ZK 증명으로 확인하는 데모입니다.**
재무 원문 대신 요청한 기준의 충족 여부를 상대방에게 전달합니다.
회사·재무값·확인 기관은 모두 가상이며, 실제 은행 검증이나 대출 심사가 아닙니다.

[공개 데모](https://midproof.vercel.app) · [소스 출처와 Midnight 기여](docs/PROVENANCE.md) ·
[검증 기록](docs/ai/MIDPROOF_RELEASE_2026-09-27.md)

## 브라우저에서 체험

> 2026-09-27 배포 상태: 아래 지갑 없는 흐름은 로컬에서 실제 검증을 마쳤으며,
> 공개 사이트는 전용 테스트 지갑 준비 후 활성화할 예정입니다. 현재 공개 화면은
> 이전 버전입니다. 바로 실행하려면 아래 Docker 방법을 이용하세요.

1. **데모 시작**으로 로그인합니다.
2. 판매기업 또는 구매기업, 가상 시나리오 A 또는 B를 선택합니다.
3. 가상 데이터 처리에 동의하고 **증명 시작**을 누릅니다.
4. 증명 생성과 체인 반영 후 **기준 충족** 또는 **기준 미충족**을 확인합니다.

체험에는 MetaMask, 개인 지갑, 테스트 토큰 수령, 채권 생성, 펀딩 거래가 필요하지
않습니다. 운영자가 준비한 별도 합성 채권과 데모 지갑을 사용합니다.
공개 데모는 Midnight **Preview**, 아래 로컬 데모는 **Local Devnet**에서 실행됩니다.
실제 증명과 독립적인 체인 조회를 수행하므로 대기 시간이 발생합니다.
`기준 미충족`은 유효한 증명 결과이며 오류·만료와 구분됩니다.

운영 서버와 Prover는 가상 재무 원문을 처리합니다. 원문이 사용자의 기기 안에만
머무르거나 운영자에게도 숨겨진다고 주장하지 않습니다. 일반 계정의 기존 GIWA
자산 거래는 별도 흐름이며, 해당 거래에는 원래의 지갑 인증이 필요합니다.

## Clone 후 실행

준비물은 **Docker Desktop 또는 Docker Engine + Compose v2**입니다.
최초 빌드에는 이미지·의존성·증명 파라미터 다운로드를 위한 인터넷 연결이 필요합니다.
호스트에 Node/Java/MetaMask를 설치하거나 외부 faucet을 이용할 필요는 없습니다.

```sh
git clone https://github.com/leonid-world/midproof.git
cd midproof
docker compose up --build -d
```

[http://localhost:5173](http://localhost:5173)을 엽니다. 첫 빌드와 체인 초기화가
끝나면 화면에서 데모를 시작할 수 있습니다. 진행 상태는 다음 명령으로 확인합니다.

```sh
docker compose logs -f app
```

로컬 MySQL, GIWA용 EVM, Midnight Node/Indexer, 실제 Proof Server와 앱을 자동으로
준비합니다. 새 데모 계정·전용 지갑·합성 채권도 자동 생성합니다. 기존 공개 서버의
DB나 지갑을 복사하거나 연결하지 않습니다. 네 하위 프로젝트는 모두 일반 폴더여서
서브모듈 명령이 필요하지 않습니다.

중지와 재시작은 데이터를 유지합니다.

```sh
docker compose stop
docker compose up -d
```

포트 변경, 서비스 구성, 상태 보존 설명은 [로컬 실행 안내](docker/local/README.md)를
참고하세요. `docker compose down --volumes`는 로컬 데모 상태를 모두 지우므로
일반적인 중지·복구 명령으로 사용하지 않습니다.

## 무엇을 검증하나요?

가상 확인 기관이 서명한 연매출·부채비율·연체 횟수에 대해 Compact 회로가
서명과 요청 기준을 검사합니다. 증명은 Midnight에 제출되고 독립적인 Indexer
조회로 결과를 확인합니다. 데모 기준은 연매출 5억 원 이상, 부채비율 200% 이하,
연체 1회 이하이며, A는 충족·B는 미충족 시나리오입니다.

원문 재무값은 MySQL이나 Midnight 공개 상태에 저장하지 않습니다. 공개 상태에는
불투명한 결과 키와 충족 여부·Provider·버전·유효시간 등 검증 메타데이터가 남습니다.
요청과 결과를 연결하는 capability는 서버에서 암호화해 보관합니다.
공유 데모는 한 번에 하나의 증명을 처리하며, 새로고침 후 같은 로그인 세션에서
진행 상태를 복구합니다. 체인 전송 후 저장 전에 중단된 불확정 상태는 안전하게
표시하며 자동으로 새 증명을 제출하지 않습니다.

| 폴더 | 역할 |
| --- | --- |
| `giwa-ui` | Vue 화면과 데모 흐름 |
| `giwa-api` | Spring 사용자 인증과 기존 채권 API |
| `giwa-midnight` | Compact 회로, 가상 Provider, 증명·제출·독립 결과 조회 |
| `giwa-contrract` | 기존 GIWA 채권 Solidity 계약과 로컬 fixture 준비 |

기존 GASOK/GIWA의 채권·펀딩·상환 기반 및 Midnight 공식 ZK Loan 예제를
재사용했습니다. 이 저장소를 새로 만들었다는 사실이 기존 코드의 신규성이나
해커톤 재사용 적격성을 보장하지 않습니다. 실제 추가 내용과 기반 커밋은
[출처 문서](docs/PROVENANCE.md), 라이선스 표시는
[서드파티 고지](THIRD_PARTY_NOTICES.md)에 구분했습니다.

공개 배포는 기존 Vercel 1개와 Railway 통합 앱·MySQL을 사용합니다.
Preview/로컬 데모만 지원하며 Preprod/Mainnet 배포는 하지 않습니다.
현재 통과한 검사와 아직 확인하지 못한 항목은 [검증 기록](docs/ai/MIDPROOF_RELEASE_2026-09-27.md)을 따릅니다.
