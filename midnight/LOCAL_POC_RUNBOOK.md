# GASOK Midnight v2 로컬 PoC 실행 가이드

이 문서는 request-bound v2 제품 흐름을 로컬에서 재현하는 실행 기준이다.
Funder는 Seller/Buyer의 재무값을 추측해서 넣지 않고 공개 **검증 기준**을
요청한다. Seller/Buyer가 자신의 caller-supplied mock 값을 비공개로 입력하고
역할 지갑으로 동의하면, Midnight가 그 기준을 충족했는지 한 비트만 기록한다.

일반 화면에는 JSON 붙여넣기와 PIN 입력이 없다. 과거 fixed-policy/PIN/파일
handoff는 `/midnight/legacy/*` 진단 화면과 `/v1` wire에만 남아 있으며 v2 실패
시 fallback으로 사용하지 않는다.

> 이 결과는 은행·회계기관 검증, GIWA 펀딩 승인 또는 자동 Funding gate가
> 아닙니다. Local Mock Provider가 caller-supplied 값을 서명했고 Compact가
> Funder의 표시된 기준을 계산했다는 뜻만 갖는다.

## 고정된 현재 로컬 배포

```text
Network:                  undeployed (local only)
Midnight v2 contract:     12caaf76aef1de1c584b67462018810f6e4e7eb2535e136f560cb621e24a3f36
Provider ID:              2
Provider dev secret:      PROVIDER_SECRET_KEY=2
Provider registration tx: 006abe69d8ba934519e19c4490ce77be724f75aae1bcb4e6b4fcd720258aa10601
Registration block:       25714
GIWA chain ID:             91342
ReceivableFinance:        0x0f264334f98BA0d22f7Fc6Bb901a5Fa36158a315
```

`PROVIDER_SECRET_KEY=2`는 공개된 로컬 데모 전용 고정값이다. 가치가 있는
네트워크나 자산에 절대 사용하지 않는다. 기존 v1 계약은 보존되어 있고 v2로
migration되지 않는다. 컨테이너/볼륨을 삭제하거나 새 계약을 다시 배포하지
않는다.

## 프로세스 구성

Midnight 관련 터미널은 정확히 5개다.

1. Docker: Node + Indexer + Proof Server
2. Mock Attestation Provider 2
3. Midnight Read API
4. Proof Bridge
5. Vue

여기에 기존 MySQL과 Spring Boot가 별도로 필요하다. MySQL은 공개 요청 문맥과
암호화된 capability envelope만 저장한다. Spring은 Provider/Proof Server가
아니다.

## 0. MySQL 1회 migration과 Spring Boot

### 기존 MySQL migration 확인

fresh DB는 `.codex/schema.sql`에 `midnight_proof_requests`가 이미 있다. 기존
DB는 먼저 백업한 다음, 아래 결과가 비어 있을 때만 migration을 한 번 적용한다.
DB 계정 옵션은 자신의 로컬 설정에 맞춘다.

```bash
cd /Users/leonid/projects/blockchain/gasok
mysql -h 127.0.0.1 -P 3306 -u root giwa_receivable \
  -e "SHOW TABLES LIKE 'midnight_proof_requests';"
```

테이블이 없을 때만:

```bash
cd /Users/leonid/projects/blockchain/gasok
mysql -h 127.0.0.1 -P 3306 -u root giwa_receivable \
  < .codex/migrations/20260819_midnight_proof_requests.sql
```

### Spring용 capability 암호화 키

Spring은 32-byte 키를 MySQL 밖에서 받아 AES-256-GCM으로 capability를
암호화한다. 아래 ignored owner-only 파일은 최초 한 번 생성하고 계속 같은 값을
사용한다. 명령은 키를 화면에 출력하지 않는다.

```bash
cd /Users/leonid/projects/blockchain/gasok/giwa-api
if [[ ! -s .midnight-capability-key ]]; then
  umask 077
  openssl rand -hex 32 > .midnight-capability-key
  chmod 600 .midnight-capability-key
fi
```

활성/미만료 요청의 암호문이 남아 있을 때 이 파일을 바꾸거나 삭제하지 않는다.
현재 key version은 1개만 읽으므로 key rotation에는 별도 재암호화 migration 또는
모든 활성 요청의 drain/expiry가 필요하다.

### Spring 실행 터미널

```bash
cd /Users/leonid/projects/blockchain/gasok/giwa-api
export MIDNIGHT_CAPABILITY_ENCRYPTION_KEY="$(tr -d '\r\n' < .midnight-capability-key)"
export MIDNIGHT_READ_API_URL=http://127.0.0.1:4100
export MIDNIGHT_CONTRACT_ADDRESS=12caaf76aef1de1c584b67462018810f6e4e7eb2535e136f560cb621e24a3f36
export CORS_ALLOWED_ORIGINS=http://127.0.0.1:5173
./gradlew bootRun
```

다른 터미널에서:

```bash
curl -fsS http://127.0.0.1:8080/health
```

## 터미널 1 — Midnight Docker 3종

- Node: proof transaction을 검증·finalize하고 공개 원장을 기록한다.
- Indexer: Node 공개 상태의 조회 replica다. finalization 직후 잠깐 늦을 수 있다.
- Proof Server: private witness로 ZK proof를 계산한다. 지갑 키로 서명하지 않는다.

```bash
cd /Users/leonid/projects/blockchain/gasok/giwa-midnight
source "$HOME/.nvm/nvm.sh"
nvm use 22.21.1
docker compose -f cli/standalone.yml up -d --wait --wait-timeout 120 node indexer proof-server
docker compose -f cli/standalone.yml ps
curl -fsS http://127.0.0.1:6300/version
```

정상 기준:

```text
zkloan-node       healthy
zkloan-indexer    healthy
proof-server      running, version 8.1.0
```

`proof-server`가 compose `ps`에 잠깐 보이지 않으면 `docker ps -a`와 로그를
확인한다. `docker compose down -v`, 컨테이너 삭제, volume 삭제는 금지한다.

## 터미널 2 — deterministic Mock Provider 2

Provider는 GIWA RPC에서 현재 canonical Seller/Buyer 지갑을 다시 읽고, 그
지갑의 EIP-712 v2 동의가 맞는 caller-supplied mock tuple/context에 Schnorr
서명한다. 은행/회계기관 서버가 아니다.

v2 서명 창은 항상 120초가 아니다. Provider가
`expiresAt = min(issuedAt + 120초, policy validUntil)`로 정하므로 실제 TTL은
1..120초다. 정책 기한이 이미 지났으면
`409 / POLICY_REQUEST_EXPIRED`로 challenge를 만들지 않고, 1초 남았으면 서명
창도 1초뿐이다.

```bash
cd /Users/leonid/projects/blockchain/gasok/giwa-midnight
source "$HOME/.nvm/nvm.sh"
nvm use 22.21.1
PROVIDER_SECRET_KEY=2 \
MIDNIGHT_CONTRACT_ADDRESS=12caaf76aef1de1c584b67462018810f6e4e7eb2535e136f560cb621e24a3f36 \
npm run dev --workspace zkloan-credit-scorer-attestation-api
```

정상 로그에는 다음이 포함된다.

```text
[MOCK] Loaded provider secret key from environment
[MOCK] Provider ID: 2
[MOCK] Approved Midnight contract: 12caaf76aef1de1c584b67462018810f6e4e7eb2535e136f560cb621e24a3f36
[MOCK] Authorization protocol: eip712-role-wallet-v2
[MOCK] Attestation API listening on http://127.0.0.1:4000
```

포트 충돌이면 기존 PID를 확인하고 정상 종료한 뒤 이 고정 명령으로 하나만
실행한다.

```bash
lsof -nP -iTCP:4000 -sTCP:LISTEN
```

## 터미널 3 — Midnight Read API

Read API는 proof를 만들거나 트랜잭션을 제출하지 않는다. Spring이 보낸 exact
v2 capability에서 policy hash와 lookup을 다시 계산하고 Indexer의 한 결과만
읽는다.

```bash
cd /Users/leonid/projects/blockchain/gasok/giwa-midnight
source "$HOME/.nvm/nvm.sh"
nvm use 22.21.1
MIDNIGHT_CONTRACT_ADDRESS=12caaf76aef1de1c584b67462018810f6e4e7eb2535e136f560cb621e24a3f36 \
npm run dev --workspace giwa-midnight-api
```

정상 확인:

```bash
curl -fsS http://127.0.0.1:4100/health
```

health의 `networkId`는 `undeployed`여야 한다. 소스 address를 바꾼 뒤 기존
4100 프로세스를 그대로 두면 과거 address를 계속 사용하므로 반드시 재시작한다.

## 터미널 4 — Proof Bridge + encrypted outbox

Bridge는 Vue용 단순 proxy가 아니라 Midnight dev wallet, encrypted private
state, Provider exchange, proof 생성/제출, crash-safe capability 전달을 조율하는
신뢰된 로컬 프로세스다.

`giwa-midnight/cli/.env`의 `MIDNIGHT_STORAGE_PASSWORD`가 기존 private state를
열 수 있어야 한다. 같은 암호가 owner-only outbox
`giwa-midnight/cli/.gasok-midnight-capability-outbox/outbox.enc`의 AES-256-GCM key를
scrypt로 파생한다. 암호를 바꾸거나 파일만 임의 삭제하면 미ACK 결과를 복구할 수
없다. 대화형 CLI와 Bridge는 같은 LevelDB/process lock을 사용하므로 동시에
실행하지 않는다.

```bash
cd /Users/leonid/projects/blockchain/gasok/giwa-midnight
source "$HOME/.nvm/nvm.sh"
nvm use 22.21.1
npm run proof-bridge --workspace zkloan-credit-scorer-cli
```

wallet sync, v2 contract, GIWA seal, Provider 2 public key, private state,
outbox decrypt 검사가 모두 끝난 다음에만 다음 로그가 나온다.

```text
Local-only GASOK Midnight Proof Bridge listening on http://127.0.0.1:4200
```

별도 확인:

```bash
lsof -nP -iTCP:4200 -sTCP:LISTEN
```

Bridge는 finalize된 capability를 outbox에 원자적으로 기록하기 전에는
`complete`를 반환하지 않는다. Spring `complete`가 `SUBMITTED` 또는 이미
`COMPLETED`인 idempotent 상태를 확인한 뒤 Vue가 ACK하면 recoverable record가
삭제된다. 그 전 reload/restart는 `requestId`로 같은 capability를 recover하며
새 proof를 만들지 않는다.
동시 outbox 변경은 직렬화되며 durable write 중 recover는 새 proof 대신
`409 / PROOF_RESULT_IN_PROGRESS`로 닫힌다.

내부 v2 capability의 `midnightContractAddress`는 `0x` 없는 lowercase 64-hex다.
EIP-712 MetaMask 메시지에서만 동일 값을 `0x`-prefixed `bytes32`로 표현한다.
일반 사용자는 두 형식을 보거나 JSON을 고쳐 맞추지 않는다.

## 터미널 5 — Vue

```bash
cd /Users/leonid/projects/blockchain/gasok/giwa-ui
source "$HOME/.nvm/nvm.sh"
nvm use 24.19.0
npm run dev -- --host 127.0.0.1 --port 5173
```

항상 아래 origin을 그대로 사용한다.

```text
http://127.0.0.1:5173/midnight        Funder가 보낸 요청
http://127.0.0.1:5173/midnight/prove  Seller/Buyer가 받은 요청
```

Bridge는 `localhost:5173`도 허용하지만 브라우저에서 `localhost`와
`127.0.0.1`은 서로 다른 origin/cookie/local state다. 중간에 바꾸면 Spring
CORS 또는 로그인 문제처럼 보인다. Vue는 4200/4100으로 직접 요청하지 않고
Vite의 same-origin `/midnight-proof`와 `/midnight-api` proxy를 사용한다.

## 화면 테스트 순서

### 1. Funder: 공개 기준 요청

1. Seller/Buyer와 무관한 Funder 회사 계정으로 로그인한다.
2. `/midnight`에서 미배정 `TOKENIZED` 채권을 고른다.
3. Seller, Buyer 또는 둘 다를 고른다. 둘 다면 별도 request 2건이다.
4. 최소 연매출(KRW), 최대 부채비율(%), 최대 연체 횟수(건), 유효시간을
   입력하고 요청한다.
5. 화면의 초기 상태가 `REQUESTED`인지 확인한다.

Funder 값은 “상대 회사 재무가 이렇다”는 입력이 아니다. 상대가 입력한 private
facts가 이 공개 기준을 통과하는지만 요청한다. 동일 Funder·채권·역할의
유효 요청이 있으면 새 요청을 만들 수 없다. 성공 결과도 `validUntil`까지 active로
유지해 기준을 조금씩 바꾸는 adaptive query를 줄인다.

### 2. Seller/Buyer: 동의 또는 거절

1. 요청 대상 Seller 또는 Buyer 계정으로 로그인한다.
2. `/midnight/prove` 받은 요청에서 requester, 채권, 역할 지갑, 기준, 만료를
   확인한다.
3. 원하지 않으면 거절한다. `DENIED`는 “기준 미충족”이 아니다.
4. 계속하려면 자신의 mock 연매출, 부채비율, 연체 횟수를 입력한다.
5. Challenge 생성 뒤 입력값이 화면 state에서 제거되는지 확인한다.
6. MetaMask에서 표시된 canonical 역할 지갑으로 EIP-712 v2에 서명한다.
7. proof finalization과 Spring 전달을 기다린다. 성공하면 요청이
   `SUBMITTED` 또는 Indexer 확인 뒤 `COMPLETED`가 된다.

입력값은 실데이터 검증이 아닌 데모 caller-supplied 값이다. 기준 밖의 값도
정상 입력이며 `false` proof를 만든다. UI validation error와 정책 미충족을
혼동하지 않는다.

### 3. Funder: 결과 확인

1. Funder 계정의 `/midnight` 보낸 요청을 새로고침한다.
2. `SUBMITTED`면 트랜잭션은 finalize되고 capability는 Spring에 암호화 저장된
   상태다. Indexer가 늦으면 잠시 뒤 `결과 다시 확인`만 누른다.
3. `COMPLETED`에서 정확한 기준, 역할, Provider ID, `profileAsOf`,
   `validUntil`, 기준 충족/미충족을 함께 확인한다.

proof를 다시 만들거나 JSON을 Seller/Buyer에게 달라고 하지 않는다. Funder
브라우저는 capability 자체를 받지 않는다.

## 상태 의미

| 상태 | 의미 |
| --- | --- |
| `REQUESTED` | 대상 당사자의 응답/동의 대기 |
| `SUBMITTED` | Spring이 capability를 암호화 보관; Read/Indexer 재시도 가능 |
| `COMPLETED` | Funder가 exact public result를 resolve함 |
| `DENIED` | 당사자가 요청을 거절함; 부적격 아님 |
| `EXPIRED` | 기한 내 완료되지 않음; 부적격 아님 |
| `FAILED` | 영구 문맥/capability 오류; 부적격 아님 |

## 오류 진단

### Vue가 502를 표시함

```bash
lsof -nP -iTCP:4000 -sTCP:LISTEN
lsof -nP -iTCP:4100 -sTCP:LISTEN
lsof -nP -iTCP:4200 -sTCP:LISTEN
lsof -nP -iTCP:5173 -sTCP:LISTEN
curl -fsS http://127.0.0.1:4100/health
docker compose -f /Users/leonid/projects/blockchain/gasok/giwa-midnight/cli/standalone.yml ps
```

- challenge 502: 대개 Bridge 4200 또는 Provider 4000/preflight 문제다.
- resolve 502/503: Read API 4100, Indexer, 또는 Spring 8080을 확인한다.
- `EADDRINUSE`: 기존 PID 하나를 정상 종료하고 중복 프로세스를 만들지 않는다.
- Provider public-key mismatch: 터미널 2가 반드시 `PROVIDER_SECRET_KEY=2`인지
  확인한다. 재등록/재배포부터 하지 않는다.

### `SUBMITTED`인데 결과가 아직 없음

Node finalization과 Indexer 조회 가능 시점은 다르다.
`ELIGIBILITY_RESULT_NOT_FOUND` 또는 `CONTRACT_NOT_FOUND`는 Spring에서
`SUBMITTED`를 유지하는 retryable lag다. 잠시 뒤 resolve만 재시도한다. proof,
MetaMask 서명, Provider attestation을 반복하지 않는다.

### capability 영구 오류

Read API가 위변조/다른 request·audience·criteria·deployment·GIWA context 또는
expiry를 확정하면 Spring은 `FAILED`로 전이하고 encrypted envelope를 purge하며
active marker를 해제한다. 이 경우도 “기준 미충족”이 아니다. 새 요청이 정말
필요한지는 원인을 확인한 다음 판단한다.

### Bridge/브라우저가 proof 뒤 끊김

Spring이 아직 `SUBMITTED`가 아니면 `/midnight/prove`의 같은 assigned request를
다시 연다. Vue는 Bridge `/v2/proof-sessions/recover`에 `requestId`를 보내 이미
finalize된 capability를 가져와 Spring delivery를 재개한다. 새 challenge,
MetaMask 서명, proof submission을 하지 않는다. ACK 이후에는 Spring이
durability owner이므로 Bridge는 같은 request를 다시 증명하지 않는다.

아직 proof 제출 전이던 `awaiting_authorization` 예약은 서명 기한 전 recover에서
진행 중 상태를 보일 수 있다. 기한이 지난 뒤 `결과 전달만 다시 확인`하면 만료
예약이 정리되어 같은 탭이 idle로 돌아간다. Spring 요청도 여전히 `REQUESTED`
이고 `validUntil` 전일 때만 새 challenge를 시작한다. 반대로 이미 `proving`인
예약은 모호한 중복 제출을 막기 위해 새 증명을 허용하지 않는다.

## 안전 종료

1. 진행 중 proof가 없을 때 Vue를 `Ctrl+C`로 종료한다.
2. Proof Bridge를 `Ctrl+C`로 종료하고 wallet/outbox close를 기다린다.
3. Read API, Provider, Spring을 각각 `Ctrl+C`로 종료한다.
4. Docker는 다음 테스트를 위해 그대로 둘 수 있다.

다음은 사용하지 않는다.

```text
docker compose down -v
Docker Desktop에서 zkloan volume 삭제
giwa-midnight/cli/midnight-level-db 임의 삭제
giwa-midnight/cli/.gasok-midnight-capability-outbox 임의 삭제
giwa-api/.midnight-capability-key 교체/삭제
```

## 현재 검증 한계와 다음 확인

현재 검증 수치는 Compact contract `39/39`, Mock Provider `87/87`(4 files), Read API
`60/60`, CLI `156` passed + `1` optional environment skip(12 passing files +
1 skipped file), Vue `141/141`(21 files), Spring full Gradle `86/86`(focused
Midnight `19/19`)이다. CLI typecheck/build, Vue lint/build, Spring `bootJar`,
v2 배포와 Provider 2 등록/공개 상태 preflight도 통과했다. 이는 코드 경계와
로컬 배포 검증이며 최종 브라우저 E2E 완료를 뜻하지 않는다. 모든 변경
프로세스를 재시작하고 다음 live E2E를 별도로 기록해야 한다.

```text
Funder request
-> Seller eligible proof + Spring SUBMITTED + Bridge ACK
-> Indexer lag retry + Funder COMPLETED
-> Buyer ineligible proof + 정확한 "기준 미충족" 문구
-> Bridge restart-before-ACK recovery
```

아직 이 최종 브라우저 E2E가 완료됐다고 문서에서 주장하지 않는다. 독립
per-company Midnight private state, production KMS/key rotation, remote subject
identity, policy template/query budget/cooldown/audit는 남은 TODO다.
