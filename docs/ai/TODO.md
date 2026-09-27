# TODO

## 2026-09-27 정정: GIWA 준비 없는 Midnight 전용 체험

사용자 지시에 따라 ADR-025로 정정한다. 테스트 로그인 뒤 바로 가상 시나리오의
Midnight 증명으로 진입한다. 운영자에게도 GIWA 채권·역할 지갑 잔액·ETH 지급을
요구하지 않는다. 앞서 요청한 faucet CAPTCHA 동의는 더 이상 필요 없다.

- [x] 불필요한 GIWA fixture 준비 도구 제거; 지급/체인 거래 미실행 확인.
- [x] 화면에서 실제 채권·GIWA 지갑 준비를 암시하는 정보 제거.
- [x] 기본 Compose의 EVM/채권 준비 의존성 제거, 계정 준비는 signup/login만 수행.
- [ ] 자동 암호화 데모 인증·reserved 합성 문맥·일반 경로 분리 구현/회귀 최종 확인.
- [ ] GIWA RPC가 없는 새 로컬 환경 네 실제 proof와 재시작 검증.
- [ ] 기존 Railway/Vercel에 반영하고 공개 Preview 네 결과/복구 검증.
- [ ] 최종 소스 게시·새 clone 재현·배포 Git 연결 전환.

앞선 974개 검사와 실제 EVM 기반 검증은 이전 버전의 기록이다. 이번 정정 버전의
완료 근거는 릴리스 기록에 별도로 남긴다.


## 제출 단일 저장소·지갑 없는 데모 — 2026-09-27 승인

현재 작업 위치는 `midproof` monorepo이며 원본 GASOK는 보존한다.
상세 승인과 검증은 ADR-024 및 [릴리스 기록](MIDPROOF_RELEASE_2026-09-27.md).

- [x] `leonid-world/midproof` 공개 저장소 생성, 네 프로젝트 일반 폴더로 이관.
- [x] 기반 커밋·재사용 범위·Midnight 기여와 upstream 라이선스 기록.
- [x] 전용 데모 로그인·지갑 없는 화면·세션 격리 구현, 자동 검사 974개 통과.
- [x] 독립 로컬 EVM의 실제 합성 채권 생성/확인/NFT 및 재시작 재사용.
- [x] 최종 Node 리뷰·회귀·통합 빌드 및 실제 로컬 HTTP/브라우저 네 시나리오 증명.
- [ ] 새 전용 Preview 역할 지갑/합성 채권 준비, 기존 상태 보존.
- [x] 공개 소스 게시·anonymous fresh clone·Compose 실행과 네 실제 결과/전체 재시작 복구 검증.
- [ ] 기존 Vercel/Railway 공개 배포 및 브라우저 실제 증명·독립 조회 검증.
  Railway 신규 backend 배포/ready 완료, Vercel 새 빌드 READY이나 공개 alias 승격 전.
  전용 GIWA 지갑 테스트 ETH faucet reCAPTCHA 실행 동의 대기. 소스 자동배포 연결도 남음.

아래 9/18 일반 GIWA 전체 펀딩/상환 리허설은 별도 기록이며 이 데모 완료와
혼동하지 않는다. 해커톤 제출 폼 전송은 이번 작업에 포함되지 않았다.

## 공개 전체 리허설 — 2026-09-18 진행 중

현재 실제 수행 증거: [리허설 기록](MIDNIGHT_LIVE_REHEARSAL_2026-09-18.md).
사용량 제한으로 중단 후 사용자 초기화에 따라 같은 작업을 재개했다.

- [x] 공개 GIWA 잔액·Faucet·역할 주소·기존 Preview key/counter 재확인.
- [x] 소액 합성 채권 A/B 앱 등록(DB #2/#3) 및 온체인 생성(#5/#6).
  A의 canonical RPC 지연은 기존 거래 복구로 동기화; 중복 제출 없음.
- [x] GIWA 18개 + 최종 CLI 273개 회귀, 통합 Linux 이미지와 비관리자 artifact 검사.
  이전 Midnight 검토 834개의 CLI213을273으로 대체하면894, GIWA18 포함912 고유 테스트.
- [x] 기존 주소 verifier 전환·암호화 백업·pending wallet/deadline/중복방지 구현 및 독립 검토.
- [x] Railway `e58b6f76-d5ed-482b-ba4b-787470a41fb4` 적용, 20파일 암호화 백업,
  같은 Preview 주소의 verifier 전환 완료. public key/counter1/state와 complete journal 일치.
- [x] 기존 Vercel midproof production 배포 READY 및 공개 신규 asset 확인.
- [ ] Buyer 확인 → Seller NFT → 네 실제 ZK 결과 → Funder 펀딩 → Buyer 상환.
- [ ] Faucet 실제 새 수령 및 최종 잔액·영수증 대조. Buyer/Funder는 이미 수령했고 잔액 충분.
- [x] migration enabled=0, 정상 재시작61fe8fbe SUCCESS/ready, wallet/address/journal 보존.
- [ ] 새 proof 생성 후 서버 재시작·이전 결과 재조회 검증.
- [ ] Faucet 공개 source 검증 등록은 auto-review 거절로 미실행. 사용자 별도 공개 승인 대기;
  승인 없이 다른 게시 경로로 우회하지 않기.

MetaMask 확장 자동 접근은 브라우저 보안 정책으로 차단되어, 앱에서 거래를 준비하고
사용자가 계정 선택·지갑 확인을 수행한다. 현재 Buyer 단계는 연결된 Seller 계정 때문에
앱이 제출 전에 차단했고, 사용자의 Buyer 전환 응답을 기다린다. 키/시드 추출로 우회하지 않는다.


## Midnight 검토 후 수정·테스트 — 2026-09-18 후속 승인

현재 결과는 [수정·검증 보고서](MIDNIGHT_COMPLIANCE_FIXES.md)가 기준이다.
아래 최초 검토 항목의 체크는 **소스 수정·격리 검증** 완료를 뜻하며 공개 배포 완료가 아니다.

- [x] C01 canonical range 제약 수정, ZKIR 확인, compiler 0.31.1 full compile 및
  source 2/artifact 20 manifest 검증. 새 키와 기존 배포 비교 fail-closed 추가.
- [x] C02–C09/C11–C13 예외 경로와 hosted Provider 2 소비 정책 수정 및 회귀.
- [x] Node 22.21.1/Java 17 고유 자동 테스트 **834개** 통과(선택 범위 skip 0).
  기존 644개 대비 회귀 125개 추가 및 Spring 전체 확장 65개. CLI live suite 제외.
- [x] Seller/Buyer × steady(true)/stretched(false) **네 실제 증명·검증** 통과.
  Proof Server 8.1.0와 메모리 ledger 8.1.0만 사용; funding/지갑 서명/체인 제출 제외.
- [x] encrypted outbox/owner 파일을 사용하는 실제 gateway/runtime 재시작·ACK 유실
  통합 회귀 6개 통과. fake authority/proof 경계와 uncertain reservation 한계 기록.
- [x] 네 Midnight build/typecheck, Vue build/full lint, Spring 전체 build,
  Linux 통합 Docker image 및 비관리자/네트워크 차단 artifact smoke 검사 통과.
- [x] 참조 checker 126항목/37 pin 및 artifact gate 5개 회귀 통과. 임시 Prover 종료.
- [x] **공개 적용:** 후속 실 리허설에서 같은 Preview 주소의 verifier 전환과
  앱/UI 배포 완료, 실제 네 key 일치·counter1·complete journal 확인. 기존 상태 보존.
- [ ] **C10 최종:** 공개 브라우저 Seller/Buyer true/false·expiry·접수/ACK 유실·재시작·
  Indexer 지연 증거. 격리 증명과 mock 통합 회귀를 public E2E로 대체하지 않기.

## Midnight 전체 구현 준수 검토 — 2026-09-18 후속 요청

기준·소스 근거·영향·검증 조건: [구현 준수 검토](MIDNIGHT_COMPLIANCE_REVIEW.md).
L0 필수 / L1 데모 신뢰성 / L2 품질 / L3 운영 확장을 구분하며, P1/P2는 수정 우선순위다.

- [x] 전체 저장소 inventory와 Midnight/Provider/Read/CLI/Spring/Vue/GIWA/배포 경계를
  다시 대조하고 준수·부분 준수·경로 미준수·미검증·대상 외로 분류.
- [x] Node 22.21.1 / Java 17에서 기존 테스트 **644/644**, Vue production build,
  Midnight 4개 TS workspace build 통과. live suite 제외, 새 proof/배포 없음.
- [x] 실제 client/service 또는 실제 함수 블록으로 C04/C05/C06 세 동작을 격리 재현.
  기존 녹색 테스트가 덮지 못한 예외 경로였으며 후속 수정 결과는 위 보고서를 따른다.
- [x] **P1 C01:** Schnorr canonical reduction의 제약 근거 검토와 필요한
  방어적 회귀·full compile·산출물/배포 영향 확인. 최초 정적 우려를 제약 보강으로 처리; 위조 공격 재현 주장은 아님.
- [x] **P1 C02:** 만료된 true/false 캐시를 현재 유효한 결과로 표시하지 않도록
  상태+반응형 시각+탭 복귀 검사 및 회귀 추가.
- [x] **P1 C03:** prove 전송 후 JSON/크기/schema 오류도 불확정 접수로 분류해
  같은 세션 status/recover 유지. 재서명/재증명 없이 복구되는지 검증.
- [x] **P1 C04:** UI→Spring과 Spring→Read의 본문까지 포함한 deadline/byte cap/
  취소·resource cleanup. Spring timeout 200ms인데 1,000ms 후 blocking 재현됨.
- [x] **P1 C05:** Provider/Read/Spring 비동기 작업 후 expiry 재검사. 이미 COMPLETED
  재조회가 만료 후 성공 반환하는 경로 재현됨. first-completion CAS 보호 유지.
- [x] **P2 C06:** owner save queue의 이전 실패에서 회복하되 현재 저장 실패는 반환.
  첫 write 실패 뒤 다음 write 자체가 실행되지 않는 동작 재현됨.
- [x] **P2 C07:** 영구 대기 Indexer query의 bounded recovery와 degraded readiness.
  caller timeout만으로 in-flight를 비워 orphan query를 누적시키지 않기.
- [x] **P2 C08:** Compact 변경 시 full compile/source-artifact provenance와 실제
  proof 검증을 build/릴리스 절차에 연결. 일반 TS build로 대체하지 않기.
- [x] **P2 C09:** UI resolver 응답의 선택 request 결합, auth generation 변경 시
  늦은 store 응답/다음 batch 동작 중단 및 계정 전환 회귀.
- [ ] **P1 C10:** Buyer·valid-false·expiry·접수/ACK 유실·재시작·Indexer 지연의
  실제 공개 브라우저→Preview 증거. 기존 지갑의 단일 writer와 상태 보존.
  broadcast 이후 outbox 저장 전 중단의 불확정 reservation 한계도 명시적으로 검증.
- [x] **P2 C11:** 남은 legacy Preprod 명령을 실행 전 차단/분리. 실제 금지 네트워크
  호출 없이 guard를 검증하고 managed Preview 경로 유지.
- [x] **P2 C12:** session 자동 만료 시 correlation map도 정리하고 RAM/owner/
  outbox/DB의 보존 수명 구분. 지갑/필요한 복구 metadata는 유지.
- [x] **P2 C13:** 결과 수용 정책이 모든 등록 Provider인지 Provider 2인지 명확화하고
  필요한 소비 경계 검사 추가. hosted 소비 경계 Provider 2 제한, generic/local 정책 유지로 확정.

최초 요청은 검토/보고였고 이후 수정 승인을 받아 위 소스 변경·테스트를 완료했다. 새 배포는 하지 않았다. 실제 기관/다중 tenant/
키 회전/질의 예산 등 L3는 현재 데모의 미준수로 섞지 않고 별도 확장 설계로 남긴다.

## Midnight-Skills 비교·참조 하네스 — 2026-09-18

- [x] 기존 docs/ai 17개와 전체 저장소 파일 목록을 읽고, 34개 skill·5개 reference·
  세 template 및 Compact/Provider/CLI/Read API/Spring/Vue/GIWA/배포 경계를 비교.
  상세 범위·정적 검토 한계는 [비교 보고서](MIDNIGHT_SKILLS_REVIEW.md)에 기록.
- [x] 커뮤니티 출처/고정 commit, 공식 Kapa MCP 지원, 공개 인자·정수 의미 오류,
  버전/네트워크/저장/결과 처리의 복사 금지 사항을 공식 자료와 대조.
- [x] root/inner AGENTS, Cursor alwaysApply, [상시 참조 지침](MIDNIGHT_REFERENCE_HARNESS.md),
  offline 참조/버전 checker와 baseline 및 negative case tests 구성.
- [x] API/BACKEND/FRONTEND/ARCHITECTURE/WORKFLOW/MIDNIGHT/PROMPTS의
  과거 local-only와 현재 hosted synthetic 경계가 혼동되는 설명 보정.
- [x] 참조 checker 126항목/35 pin PASS, 새 하네스 14 + 기존 runner/bootstrap 14
  총 28 tests PASS, 원본 registry 32항목 PASS, 수정 문서 로컬 링크 28개 정상,
  root/inner `git diff --check`와 Node 문법 검사 통과. 결과는 CONTEXT에 기록.
- [x] **후속 C01 처리:** `giwa-midnight/contract/src/schnorr.compact` challenge reduction의
  canonical quotient/range 제약을 검토하고 필요한 수정·회귀 검증·산출물/배포
  영향 기록 완료. 상세는 수정 보고서 참조; 공격 재현 성공으로 표시하지 않기.
- [x] Spring ReadClient의 stalled response-body deadline 조사: 후속 구현 검토의
  격리 probe로 제한 시간 초과 blocking 확인. **후속 C04에서 수정·회귀 완료**.

참조 checkout은 untracked nested repo로 보존한다. 전체 skill 설치·MCP 연결·패키지
업데이트·앱 코드 변경·live proof·배포는 최초 하네스 작업에서는 수행하지 않았다. 후속 소스 수정·격리 증명은 위 결과를 따른다.
기존 Buyer/false E2E, 복구, 키 회전, 질의 budget 및 제출 준비 TODO는 그대로 남는다.

## 무료 MidProof 주소 전환 — 2026-09-17 사용자 승인

- [x] `midproof.vercel.app` 사용 가능 여부 확인 및 기존 Vercel 프로젝트 연결.
  프로젝트 ID·환경변수 13개·기존 Git 저장소를 유지하고 표시 이름을 `midproof`로 변경.
- [x] 잘못 추가한 `midproof.app` 프로젝트 연결 제거. 도메인 구매 없음.
- [x] Vercel Production 자동배포 브랜치를 `main`에서 `giwa-midnight`로 변경·재조회 확인.
- [x] Railway의 두 Origin 설정에 새 주소 추가 후 기존 통합 앱 재배포 및 실제 요청 검증.
  `3efba8fd-5d3f-4b5a-bd4f-60bfda3f4727` SUCCESS, 기존 이미지·볼륨 유지.
- [x] 공유·검색 URL과 공개 진입 sitemap, README·문서 반영; UI `d223f0a`의
  Git Production 자동배포 `dpl_CeMWG13gaYzBCn72ko5cRTcLhnUw` READY 확인.
- [x] 이전 주소를 새 주소로 307 연결. 새 주소 Chrome Seller 로그인·기존 요청 조회·증명 준비 확인.
- [x] 새 사이트 MetaMask에서 기존 Seller `0x6060…b4361` 선택 결과를 확인하고
  같은 회사 지갑 연결 완료 메시지 확인. 새 거래·증명 서명 없음.
- 제출용 단일 저장소 준비와 실제 새 증명/채권 거래 리허설은 별도 미완료 항목으로 유지.

## 전체 소스 커밋·푸시·배포 — 2026-09-17 후속 요청

- [x] 루트와 각 저장소의 공개 대상 변경·원격 브랜치 상태 확인.
  실제 지갑 상태/비밀값은 제외하고 소스·공개 설정·테스트·문서를 보존.
- [x] UI·API·Midnight의 변경을 `giwa-midnight`에 커밋·푸시하고 루트에서
  정확한 서브모듈 커밋을 기록하여 푸시. GitHub 재귀 클론에서 네 내부 소스와
  고정 커밋을 확인. 코드 릴리스 루트 커밋 `00a409d`.
- [x] 게시된 커밋으로 기존 Vercel·Railway 배포 완료, 공개 로그인/금액 정책/
  증명 준비 상태 및 작업 트리·원격 커밋 일치 확인. Vercel `dpl_8rEwpWrAqR5oYox84BcKvYvEVPvQ`
  READY, Railway `fcbb0ed4-2fd4-4aae-8081-70a72a0d7d58` SUCCESS/활성.
  최종 배포 증거는 CONTEXT.md와 DEPLOYMENT.md에 기록.
- 계약 저장소는 변경 없음. 기존 저장소/브랜치 체계를 사용하며 제출 직전
  새 단일 저장소·Vercel 주소 전환은 별도 TODO로 보류한다.

## MidProof 브랜딩·소액 데모 — 2026-09-17 사용자 지정

- [x] 프로젝트 표시 이름을 **MidProof**로 확정. 자체 M 심볼·로고·SVG/ICO/PNG
  파비콘·Apple 아이콘·공유 이미지·탭 제목·프로젝트 설명과 민트/청록 테마 적용.
- [x] 각 페이지 설명과 단계 안내 축소. 가상 기관/재무값·실제 ZK·운영 서버의
  가상 원문 처리·동의 범위·미충족/오류/거절/만료 구분은 유지.
- [x] 신규 데모 채권을 정수 **1~10,000 mKRW**, 펀딩을 채권액 이하로 제한.
  기본 채권 **1,000**, 펀딩 **900**; 상환은 채권 원금 전액. 인증된 서버
  금액 정책을 화면과 서명 직전에 다시 조회하며 조회 실패 시 새 거래 차단.
- [x] 금액 문자열/BigInt로 정밀도 유지. 소수·과대 금액·펀딩>채권 차단,
  늦은 채권 조회가 선택/Buyer 동의를 덮어쓰는 경쟁 조건 회귀 검증.
- [x] 기존 거액 채권 금액·영수증 보존. UI에서 새 고액 펀딩을 막고,
  이미 펀딩된 기존 채무는 전액 상환/복구 유지. 기존 Solidity 변경 없음.
- [x] 초기 빈 데모는 1조짜리 과거 채권을 새로 등록하지 않고 계정만 준비;
  새 소액 채권은 UI로 발행. 기존 과거 채권의 검증/복구는 유지.
- [x] Vue 205 tests + production build + ESLint/Oxlint, Spring 금액/거래
  회귀 41 tests, 초기 준비/runner 14 tests, hosted gateway 19 tests + CLI build.
- [x] 기존 Vercel·Railway에 반영한 버전에서 브랜딩·소액 입력·서버 정책·
  준비 상태를 실제 브라우저/API로 확인. 공개 자산 해시 일치, 초기값·초과/소수/
  펀딩>액면 차단, 만료 표시와 고액 신규 펀딩 차단 확인. 최종 배포 ID는 CONTEXT 기록.
- [ ] 새 소액 채권의 Seller 발행→Buyer 확인→NFT→Funder 펀딩→Buyer 상환
  실제 지갑 리허설. 테스트·빌드 통과를 새 체인 거래 성공으로 기록하지 않기.

저장소 통합은 제출 직전 작업으로 계속 보류한다. Vercel 이름/주소는 위 별도 승인에 따라 전환한다.

## 제출 직전 후속 작업 — 2026-09-15 사용자 지정

- [x] AGENTS.md에 최종 제출·제출 준비·제출 링크 정리 요청 시 체크리스트와
  미완료 TODO를 먼저 읽고 사용자에게 상기시키는 규칙 추가.
- [x] 이 대화에 예약 알림 `midnight` 생성: 2026-09-24~27 매일 20:00
  한국시간. 미완료 작업을 알리며, 완료/제출 완료/중지 요청 시 알림 중지.
  컴퓨터와 Codex 앱이 실행 중이어야 로컬 문서를 확인할 수 있음.
- [ ] 기능 작업을 몇 가지 더 진행한 후, 최종 제출 준비 단계에서
  [저장소·공개 주소 정리 체크리스트](MIDNIGHT_RELEASE_CHECKLIST.md)를 실행.
  새 Midnight 단일 공개 저장소와 `main` 제출 버전, Vercel 이름/주소 정리,
  새 클론 빌드와 공개 데모 재검증을 함께 진행한다. 실제 전환 작업은 보류하며
  상기 규칙과 예약 알림의 설정만 완료했다.

## 통합 실행·배포 데모 — 2026-09-15 사용자 승인

- [x] AGENTS.md의 local-only 경계를 가상 데이터 Preview 데모로 변경하고 ADR-023 기록.
- [x] IntelliJ `Midnight Demo` 한 번 Run으로 전용 MySQL·실제 Prover·Node 역할을 자동 시작.
- [x] 별도 Node/Indexer 운영을 공용 Preview 연결로 대체.
- [x] 기존 Railway 앱 하나에 Spring·가상 Attestation·Bridge·Read API·native Prover 패키징.
  기존 MySQL과 Vercel은 유지하며 추가 앱 서비스는 만들지 않음.
- [x] 정상 API를 통한 가상 계정 3개·테스트 채권 자동 준비 및 재실행 중복 없음 검증.
- [x] 프론트 데모 역할 로그인 버튼·가상 재무 시나리오·준비 상태·호스팅 인증 연결.
- [x] SDK 4.1.1 / 실제 Proof Server 8.1.0에서 가상 두 시나리오의 Compact ZK 증명 생성.
  `steady=true`, `stretched=false`; 메모리 ledger의 회로/증명 검사이며 체인 E2E와 구분.
- [x] Spring 96 tests, Vue 148 tests, Midnight CLI 186 pass/1 skip,
  Attestation 88 tests, Read API 61 tests 및 실제 Linux 통합 이미지 기동 확인.
- [x] 로컬 Preview 지갑의 무료 5,000 tNight 지급 및 공개 Indexer UTXO 입금 확인.
- [x] 공용 Preview 지갑 동기화·DUST 등록·계약 배포·Provider 2 등록 완료 확인.
  실제 `/ready` 200 및 프론트 준비 완료 표시 확인.
- [x] 브라우저 Funder 요청 2건 생성, Seller 수신함·가상 시나리오 선택·
  인증된 실제 challenge 발급과 MetaMask 동의 단계 도달 확인.
- [x] 암호화된 SDK 지갑 상태 저장·복원으로 동기화 진행점 유지 검증.
  거래 finalization 실패 시 코인 예약 해제 및 이전 정상 저장본 보존 회귀 포함.
- [x] 자금이 있는 실제 데모 지갑 재실행: 기존 계약·기관·요청 유지,
  최초 전체 동기화 약 9분에서 저장본 복원 후 27초 내 ready 확인(현재 Mac 관찰).
- [x] Seller 브라우저 실제 요청→사용자 MetaMask 동의→증명→Preview 기록→
  Spring 제출·Bridge ACK→Funder 응답 완료/기준 충족 표시까지 검증.
  2026-09-15 15:08:36 KST 발급, 공개 원장 `verifyEligibility` SUCCESS,
  block 872472, Provider 2 / evaluationVersion 2 / `eligible=true` 1건 확인.
  tx hash: `7dd331347d83750908c10863242206dda8d799337015e2d1c6a7d48cab2385cd`.
- [ ] Buyer 경로 및 기준 미충족 `false`의 실제 브라우저·체인 리허설.
- [x] 사용자의 Railway 재활성화 후 기존 앱/MySQL Online 및 공개 `/health` UP 확인.
- [x] Railway/Vercel CLI 인증 완료, 기존 Railway 앱에 `/data` 볼륨과
  환경변수를 설정하고 루트 통합 이미지를 실제 배포.
  기존 MySQL 안의 새 `gasok_midnight_demo` DB에 8개 테이블을 이관하고
  모든 행·암호문·스키마 일치 확인. 기존 `railway` DB는 보존.
  지갑 암호화 상태도 복원하여 같은 지갑·계약·기관을 유지하고 `/ready` 200 확인.
- [x] Railway 실제 Proof Server에서 충족/미충족 두 가상 시나리오의 증명 생성.
  5,755/5,757 bytes, 2.84/1.94초; 메모리 상태 검사이며 새로운 체인 제출은 아님.
- [x] Vercel 최신 빌드를 기존 공개 주소로 승격하고 Production 공개 설정 13개 유지.
  공개 API의 로그인·CORS·기존 채권·요청 조회 및 이관한 Seller 결과의
  복호화→Preview 재조회에서 `eligible=true`와 기존 발급/만료 시간 일치 확인.
- [x] 실제 공개 브라우저에서 검증 요청자 로그인 버튼→요청함→공개 결과 확인:
  데모 준비 완료·Seller 응답 완료·요청 기준 충족과 원래 발급/만료 시각 표시.
- [ ] 공개 배포에서 Buyer의 실제 MetaMask 동의→체인 제출 리허설.

운영 방법은 루트 README와 [DEPLOYMENT.md](DEPLOYMENT.md)를 따른다.
아래 과거 기록의 local-only/프론트만 수정 범위는 당시 작업 기록이다.
현재 과업은 승인된 통합 구현이며 실제 은행 검증·Mainnet 운영을 목표로 하지 않는다.

## Midnight 전용 화면 문구 정리 — 2026-09-12 후속 지시

- [x] GASOK/GIWA 화면 브랜드·푸터·SEO·OG 문구 제거, Midnight 단독 표기 적용.
- [x] 채권/검증/진행/오류 안내를 중립적인 거래망 표현으로 교체.
- [x] 과거 배포 도메인과 sitemap 제거, 공유 이미지 재생성.
- [x] 후속 변경 후 141개 테스트·빌드·ESLint/Oxlint 통과, 로그인 및 11개 라우트
  표시 문구에 이전 브랜드 없음 확인(백엔드 미연결 상태).
- [x] 로컬 검증 파일 다운로드명을 `midnight-proof.json`으로 변경; 이전 파일 호환 유지.
- [x] 새 배포 도메인 확정 후 absolute OG/Twitter URL 및 sitemap 생성.
  2026-09-17 `midproof.vercel.app`으로 반영·공개 파일 검증.
- 서명 domain/type/purpose와 wire schema는 백엔드 변경 금지 범위로 유지.
  화면 브랜딩 변경이 코드 신규성·재사용 적격성 또는 실제 거래망 변경을 뜻하지 않음.


## Midnight 화면 브랜딩 — 2026-09-12

- [x] 프론트만 GASOK · Midnight 브랜딩과 다크/블루 테마로 전환.
- [x] 로그인/회원가입, 공통 헤더/푸터, 대시보드, 404, 채권/펀딩/상환/프로필,
  Midnight v2 및 legacy 화면의 색상과 상태 대비 점검.
- [x] 공식 흰색 SVG 로고 로컬 적용, SVG/ICO/PNG 파비콘·Apple 아이콘·OG/Twitter
  썸네일과 SEO 메타데이터 교체. 기존 이미지 URL 호환 유지.
- [x] Node 24.19.0 프로덕션 빌드, 기존 141개 테스트, ESLint/Oxlint 통과.
- [x] 320px 전체 라우트 가로 넘침 없음, 375px 로그인/회원가입 및 OG 이미지 시각 확인.
- [x] canonical/OG URL과 robots/sitemap origin을 `midproof.vercel.app`으로
  갱신하고 2026-09-17 공개 배포 확인.
- [ ] 백엔드 가용 상태에서 데이터가 있는 화면과 실제 v2 증명 E2E 재검증.
  이번 범위는 화면 수정이며 API/Proof Server를 실행·수정하지 않았음.


## Midnight 최종 제출 — 심사 재현성과 동작하는 데모 (2026-09-10)

안내·출처: [MIDNIGHT_HACKATHON_SUBMISSION.md](MIDNIGHT_HACKATHON_SUBMISSION.md).
마감: **2026-09-28 00:00 KST (9월 27일 밤까지)**.
최종 완료 기준은 심사자가 공개 소스를 클론·빌드하고 Midnight 핵심 흐름을
재현할 수 있으며 실제 데모와 구현 근거로 질문에 답할 수 있는 상태다.
아래 체크는 해당 검증 근거가 확보된 뒤에만 완료로 바꾼다.

### 1. 참가 자격과 이전 프로젝트 대비 기여

- [x] Luma 참가 등록 완료 — 2026-09-10 사용자 확인.
- [x] 공식 안내와 실제 Tally 제출 폼 조사 및 하네스 참고 문서 연결.
- [ ] 이전 GASOK 제출 기준 커밋/기능, 이미 존재한 Midnight 구현, 이번 대회
  기간의 신규 변경을 비교표로 정리하고 관련 코드·커밋·데모 근거 연결.
- [ ] 기존 코드/이전 대회 제출물 재사용 규정과 작업 기간 기준 확인.
  필요 시 주최 측에 위 이력을 설명해 확인하고 답변 출처·날짜 기록.
  새 저장소 생성만으로 재사용 문제를 해결했다고 간주하지 않기.
- [ ] 이번 제출의 핵심 문제와 Midnight 기여를 한 줄 설명으로 확정하고,
  실제 구현을 기준으로 이전 GASOK과 차별점 및 한계 정리.

### 2. Midnight 제출용 새 공개 저장소 준비

실행 시점: 다른 기능 작업 후 최종 제출 전. 상세 순서와 도메인 전환은
[후속 체크리스트](MIDNIGHT_RELEASE_CHECKLIST.md)를 따른다.

- [ ] 새 저장소 이름·소유자·포함 소스/이력 범위를 확정하고, 필요한 소스를
  일반 폴더로 담는 단일 공개 저장소를 준비. 기존 GASOK 제출 기준과
  출처·라이선스·기여 이력 보존. 새 저장소의 `main`을 제출 버전으로 사용.
- [ ] 공개할 파일과 이력을 점검하고 비밀키·seed·환경 비밀값·private state·
  실제 재무 원문·민감 capability가 포함되지 않는 제출 소스 준비.
- [ ] 확정한 범위로 새 공개 저장소 생성·게시하고 실제 제출 URL 기록.
- [ ] 비로그인 일반 클론으로 네 내부 구성요소의 필수 소스까지 모두 확보되는지
  확인. 현재 루트의 서브모듈 링크만 복사하여 코드가 누락되는 상태 방지.
- [ ] GitHub About 설명과 `midnightntwrk` 토픽 설정.

### 3. 심사자 환경에서 빌드·실행 재현 (최우선)

- [ ] 제출 커밋의 새 클론에서 의존성 설치와 Compact/CLI/API/Vue/Spring의
  해당 빌드·필수 테스트 실행. 결과·도구 버전·검증 커밋 기록.
- [ ] README에 설치/실행 명령, 환경변수 예시, DB 준비, Local Devnet,
  로컬 계약 배포·Provider 등록, 서비스 시작 순서와 상태 확인 방법 작성.
- [ ] 작성자 PC의 ignored 데이터 없이 새 로컬 상태·지갑을 준비하는 절차와
  GIWA 테스트넷/RPC·채권·역할 지갑·데모 자금 등 외부 의존성 검증.
- [ ] 공식 예제→GASOK CLI의 기존 검증 이력을 확인하고 현재 제출 코드의
  CLI proof 흐름을 재검증한 뒤 Vue v2 E2E 진행. 과거 성공 기록으로 대체하지 않기.
- [ ] 심사자 관점으로 README만 따라 새 클론에서 핵심 흐름을 재현하고,
  누락된 파일/명령/설정과 실행 시간·문제 해결 안내 보완.

### 4. 실제 v2 데모와 증거 확보 (최우선)

- [ ] 데모 계정과 Seller/Buyer/Funder 역할, 채권, mock 입력 시나리오 준비.
- [x] Funder 기준 요청 → Seller 검토·사용자 MetaMask 동의 → mock attestation →
  ZK proof → Midnight 기록 → Spring SUBMITTED/Bridge ACK → Funder
  resolve/COMPLETED까지 실제 브라우저에서 검증하고 실행 증거 기록.
  2026-09-15 Preview block 872472의 `verifyEligibility` SUCCESS와
  Provider 2 / `eligible=true` 결과를 공개 Indexer에서 독립 대조함.
  Buyer 경로는 별도 미검증.
- [ ] 기준 충족 `true`와 유효한 기준 미충족 `false`를 보여주고, 거절·만료·
  proof 오류는 기준 미충족과 다름을 화면/설명에서 확인.
- [ ] Indexer 지연 시 proof 재제출 없이 조회 재시도, ACK 전 중단 시 같은
  결과 복구 등 구현된 복구 동작을 확인하고 데모 장애 대응 절차 작성.
- [ ] 공개 결과와 비공개 입력의 경계를 코드/ledger/저장 경로로 설명할
  증거 준비. mock의 한계와 로컬 Proof Server 신뢰 범위를 과장하지 않기.
- [ ] 제출 직전 서비스 재시작부터 전체 데모를 다시 리허설하고 소요 시간,
  필요한 초기 상태, 안전한 재실행 방법과 실패 시 복구 순서 기록.

### 5. 심사 설명·제출 자료·최종 접수

- [ ] README에 프로젝트 소개, 이전 작업 대비 기여, Compact 증명 조건,
  공개/비공개 데이터, GIWA와 Midnight 역할, 실행/데모 플로우와 한계 정리.
- [ ] 핵심 흐름이 실제 동작하는 데모 영상 제작·게시(3분 이내 권장).
  긴 증명 대기를 편집하면 표시하고 원본 실행 근거 보존.
- [ ] Google Slides Deck 준비: 문제, Midnight 필요성, 기여, 아키텍처,
  데모 결과, 한계. README/폼/영상 설명과 일치시키기.
- [ ] 프로젝트명·로고·썸네일·소개 화면을 확정한 Midnight 제출 메시지에 맞춤.
  기능과 심사 재현성을 먼저 확보하고 외형 변경만을 신규 기여로 제시하지 않기.
- [ ] 선택 데모 URL의 제공 여부 결정. Local Devnet 재현·영상 경로를 명시하고
  URL을 위해 loopback 서비스를 외부 노출하거나 Midnight 배포 범위를 확대하지 않기.
- [ ] Academy Explorer/Scholar 수료증이 있으면 제출 준비(각 1점, 최대 2점).
- [ ] 필수 팀/연락처/소개/구현 포인트를 Tally 폼용으로 준비하고 공식 폼의
  최신 요구사항·마감·제출 후 수정 조건 재확인.
- [ ] 비로그인 상태에서 GitHub와 영상·Deck 공유 링크 접근 확인. 심사
  설명마다 코드/테스트/실행 근거 연결, 제출 커밋 확정.
- [ ] 마감 전에 최종 폼 제출 후 접수 확인 화면/메일 등 제출 증거와
  제출 시각·저장소 URL·커밋·자료 링크 기록. 폼 작성만으로 완료 처리하지 않기.

## Midnight hackathon preparation — 2026-09-04

- [x] Preserve root `main` as the previous GASOK submission baseline.
- [x] Diagnose the empty Midnight directory as an uninitialized submodule.
- [x] Restore `giwa-midnight/` at root-pinned `aa02835` and create its local
  `giwa-midnight` branch from the identical `main`, preserving source/history.
- [x] Confirm root and all four inner repositories use `giwa-midnight`, all
  gitlinks match, and inner Git integrity/source equality checks pass.
- [x] Document independent root/submodule branch handling in CONTEXT.md.
- [ ] Install Midnight workspace dependencies and rerun CLI build; the branch
  restoration build attempt stopped at missing `tsc` (no `node_modules`).
- [ ] Separately publish the local inner Midnight branch when requested.
- [ ] Confirm existing-code reuse eligibility; prepare a new public submission
  repository per the owner's 2026-09-10 direction. See the final checklist above
  for pending repository scope and publication work.
- [x] Update visible branding, thumbnails, logo, SEO, and GIWA-centered UI for
  the Midnight submission (2026-09-12, presentation only; architecture unchanged).

## Done

[x] PoC

[x] Architecture

[x] Smart Contract Design

[x] Login

[x] Wallet Mapping

[x] Receivable CRUD

---

## Stabilization Done

[x] Business Number CHAR(10) Alignment

[x] Business Number UI Formatting

[x] Common Backend Error Response

[x] Spring Security 401/403 Error Separation

[x] Wallet Duplicate Mapping 409 Conflict

[x] Common Frontend API Client

[x] MetaMask Account Selection and Confirmation UX

[x] Buyer Receivable Review and Explicit Attestation UX

[x] Buyer Pre-sign DB/Onchain CREATED Data Comparison

[x] MetaMask Multi-account Registered Signer Selection

[x] Role-specific VERIFIED Lifecycle Copy

[x] Shared Authenticated Layout Current-Account Email Display

[x] Shared Authenticated Navigation and My Information Page

[x] Frontend Visual Polish and Interaction Consistency Pass

[x] Frontend B2B SaaS Visual System and Vertical Blockchain Workflow Timelines

[x] Frontend Public Demo Release Readiness (metadata, favicon, social card, loading/empty states, 404, footer)

[x] Receivable Contract and Lifecycle Transaction Explorer Links

---

## Doing

[x] Buyer Verify Live GIWA Verification

[x] ReceivableFinance lifecycle contract implementation

[x] Seller createReceivable frontend transaction

[x] POST /receivables/{id}/chain-created synchronization

[x] Buyer verifyReceivable frontend transaction

[x] POST /receivables/{id}/verified synchronization and status history

[x] Seller tokenizeReceivable frontend transaction and NFT mint CTA

[x] POST /receivables/{id}/tokenized synchronization and status history

[x] RPC-authoritative token ID synchronization

[x] Cross-reload MetaMask replacement discovery and recovery

[x] Onchain-success/backend-failure retry UX

[x] Server-journal tokenization recovery gate and backend-only manual synchronization UX

[x] Third-party Funding opportunity discovery and role-safe visibility

[x] Funder mKRW balance/allowance preflight and explicit approval transaction

[x] Funder fundReceivable transaction, receipt recovery, and backend-only retry UX

[x] POST /receivables/{id}/funded synchronization and status history

[x] RPC-authoritative ReceivableFunded, mKRW Transfer, and NFT Transfer verification

[x] Buyer Repayment opportunity discovery and FUNDED receivable selection

[x] Buyer mKRW balance/allowance preflight and explicit face-value approval transaction

[x] Buyer repayReceivable transaction, receipt recovery, and backend-only retry UX

[x] POST /receivables/{id}/repaid synchronization and status history

[x] RPC-authoritative ReceivableRepaid and mKRW Transfer verification

[x] Local contract compile and Hardhat lifecycle/rollback tests

[x] Backend tests and build

[x] Frontend build/lint

[x] Reproducible Hardhat GIWA Sepolia compile, deployment, and Blockscout verification tooling

[x] Recover the successful ReceivableFinance deployment after immediate RPC visibility lag without redeploying

[x] Hardhat MockKRW Owner Balance Transfer and Additional Test Mint Operations

[x] MockKRW Owner Hardhat Operations User Guide

[x] MockKRW Owner Operations Confirmed-block RPC State Retry and Safe Warning

[x] Execute a real Owner-to-Funder 10,000 mKRW Hardhat transfer on GIWA Sepolia

[x] Document MetaMask MockKRW Import, Current-contract Selection, and Balance Refresh

[x] Document GIWA Sepolia MetaMask Custom Network Fields in the MockKRW Operations Guide

[x] Pre-funded MockKRWFaucet contract PoC (fixed one-time wallet claim, depletion protection, owner recovery)

[x] Safe Faucet-only Hardhat deployment command with separate metadata and duplicate-deployment recovery

[ ] Apply `.codex/migrations/20260730_receivable_chain_metadata_uniques.sql` to the existing MySQL database after backup and duplicate preflight

[ ] Confirm `blockchain_transactions` exists in local/Railway MySQL; run `.codex/migrations/20260730_blockchain_transactions.sql` only when absent

[ ] On an existing journal table, apply `.codex/migrations/20260730_blockchain_transaction_rpc_verification.sql` only when all four RPC proof columns are absent

[ ] Apply `.codex/migrations/20260730_blockchain_transaction_verification_version.sql` only when `verification_version` is absent; do not run either ALTER after the current create-table migration

[x] Deploy MockKRW and ReceivableFinance to GIWA Sepolia

[x] Configure frontend chain, explorer, RPC, and contract addresses

[x] Execute real Seller createReceivable and Buyer verifyReceivable transactions

[x] Deploy frontend to Vercel

[x] Add Railway Java 17 Docker build and runtime

[x] Support Railway PORT, MySQL variables, Vercel CORS, and GET /health

[x] Deploy backend to Railway and verify GET /health

[x] Set Vercel VITE_API_URL to the Railway public domain

[x] Normalize VITE_API_URL trailing slashes before appending API paths

[ ] Configure Railway MySQL references, JWT secret, and Vercel CORS origin

[ ] Initialize the fresh Railway MySQL schema

[x] Redeploy Vercel with the normalized API URL and verify frontend API calls

[ ] Redeploy Vercel with the public-demo metadata, SPA rewrite, and release-quality UI states

[ ] Set Railway GIWA_MOCK_KRW_ADDRESS and deploy the Funding backend

[ ] Redeploy Vercel with the Funding page

[ ] Deploy the Repayment backend to Railway

[ ] Redeploy Vercel with the Repayment page

---

## Next

[x] Deploy MockKRWFaucet against the existing MockKRW without redeploying MockKRW or ReceivableFinance (source verification optional)

[x] Record the MockKRWFaucet address, receipt, block, compiler settings, MockKRW link, and fixed claim amount in separate deployment metadata

[x] Pre-fund MockKRWFaucet with 600,000,000 existing owner mKRW inventory (60 fixed claims)

[x] Add the conditional "데모 mKRW 충전하기" flow to the Funding page and refresh readiness after a verified claim

[x] Share wallet-level Faucet claim recovery between Funding and Repayment without duplicating pending transaction safety logic

[x] Add the conditional Buyer "데모 mKRW 충전하기" flow to the Repayment page using faceValue readiness

[x] Add GIWA Sepolia native ETH balance guidance and the official test-ETH faucet link for claim/approve/fund/repay gas

[ ] Execute a real Buyer Faucet claim and confirm claim -> approval -> repayment remains three explicit actions

[ ] Set Vercel VITE_MOCK_KRW_FAUCET_ADDRESS and redeploy the Funding/Repayment frontend

[x] Blockchain Transaction Journal (PENDING / CONFIRMED / FAILED)

[x] Backend RPC Receipt/Event Verification Before Blockchain State Synchronization

[x] Verify/correct journal chain ID from the backend RPC network

[x] Recover a MetaMask replacement after reload when only the original tx hash is known

[ ] Upgrade the local contract test toolchain to remove Hardhat 2 / solc dev-only audit advisories

[ ] Production hardening: add per-receivable intent leases for tokenize, fund, and repay when simultaneous pre-hash submissions across different browsers must be prevented

[x] Tokenize

[x] Execute a real Seller tokenizeReceivable transaction on GIWA Sepolia and verify DB TOKENIZED/tokenId/tokenizeTxHash

[x] Funding

[x] Execute a real Funder approve + fundReceivable transaction on GIWA Sepolia and verify DB FUNDED/funder/fundingTxHash

[x] Confirm the Seller received the Funding mKRW on GIWA Sepolia

[x] Repay implementation

[x] Execute a real Buyer approve + repayReceivable transaction on GIWA Sepolia and verify DB REPAID/repayTxHash

[ ] Confirm the current NFT owner received the full faceValue mKRW on GIWA Sepolia

[x] Deploy and verify replacement MockKRW and ReceivableFinance with Hardhat

[x] Update tracked frontend and backend local configuration defaults to the verified replacement address pair

[ ] Update Railway and Vercel runtime contract address pairs and run a fresh CREATED-to-REPAID demo on the replacement deployment

---

## Deployment Verified

Railway is live and returns the configured Vercel origin for a normal preflight.
Vercel has been redeployed with the frontend API URL normalization fix, and the
browser API flow is working without CORS errors.

## Smart Contract Pre-Submission Validation

### P0 — End-to-End Happy Path

- [x] Add Hardhat tests for the complete receivable lifecycle:
  1. Seller creates a receivable
  2. Buyer verifies the receivable
  3. Seller tokenizes the receivable
  4. Funder approves MockKRW
  5. Funder funds the receivable
  6. Buyer approves MockKRW
  7. Buyer repays the receivable
- [x] Verify final receivable status is `REPAID`.
- [x] Verify the seller receives `fundingAmount`.
- [x] Verify the current NFT owner receives `faceValue` on repayment.
- [x] Verify the funder becomes the NFT owner after funding.
- [x] Verify all lifecycle events are emitted with correct arguments.

### P0 — Access Control and State Transitions

- [x] Verify only the registered buyer can call `verifyReceivable`.
- [x] Verify only the seller can call `tokenizeReceivable`.
- [x] Verify the seller and buyer cannot fund their own receivable.
- [x] Verify only the buyer can call `repayReceivable`.
- [x] Verify lifecycle functions revert when called in the wrong status.
- [x] Verify nonexistent receivable IDs revert with `ReceivableNotFound`.

### P0 — ERC20 Funding Requirements

- [x] Verify funding fails when the funder has insufficient MockKRW balance.
- [x] Verify funding fails when ERC20 allowance is insufficient.
- [x] Verify repayment fails when the buyer has insufficient MockKRW balance.
- [x] Verify repayment fails when ERC20 allowance is insufficient.

### P1 — Input Validation

- [x] Verify buyer cannot be the zero address.
- [x] Verify buyer cannot equal seller.
- [x] Verify face value and funding amount cannot be zero.
- [x] Verify funding amount cannot exceed face value.
- [x] Verify maturity date must be greater than issue date.

### MIDNIGHT

#### Current request-bound v2

- [x] Approve ADR-021: Funder supplies public policy criteria while the selected
  Seller/Buyer supplies private caller-provided mock facts and consent
- [x] Bind request ID, intended Funder wallet, thresholds, expiry, GIWA
  receivable/role/wallet, deployment, Provider, and freshness through Compact,
  Provider signature, capability, Spring, and Read API
- [x] Remove product JSON/PIN UX; generate the request-scoped pseudonym nonce
  inside the Bridge and retain `/midnight/legacy/*` only for v1 diagnostics
- [x] Clamp v2 role-wallet authorization to
  `min(issuedAt + 120 seconds, policyValidUntil)`, require an effective 1..120
  second TTL, and reject an already-expired policy as
  `409 / POLICY_REQUEST_EXPIRED`
- [x] Deploy local Compact evaluation v2 at
  `12caaf76aef1de1c584b67462018810f6e4e7eb2535e136f560cb621e24a3f36`
  and register deterministic Provider 2 in transaction
  `006abe69d8ba934519e19c4490ce77be724f75aae1bcb4e6b4fcd720258aa10601`
  at block `25714`, preserving the old v1 contract
- [x] Add authenticated Spring proof-request coordination with
  `REQUESTED -> SUBMITTED -> COMPLETED`, subject denial, expiry, failure,
  exact actor/context checks, and no raw-financial persistence
- [x] Encrypt the capability in MySQL with external
  `MIDNIGHT_CAPABILITY_ENCRYPTION_KEY`, versioned AES-256-GCM envelope/AAD, and
  HMAC idempotency fingerprint
- [x] Classify Read API/Indexer not-found as retryable while preserving
  `SUBMITTED`; classify permanent invalid capability as `FAILED`, purge its
  envelope, and release the active marker
- [x] Add an encrypted owner-only local Bridge outbox, request/session
  reservation, restart recovery, and ACK after Spring `SUBMITTED` or idempotent
  `COMPLETED` so a finalized capability is not lost or reproved during delivery
  failure
- [x] Release an expired `awaiting_authorization` reservation during recovery so
  the same tab can safely return to idle, while retaining ambiguous `proving`
  reservations through `validUntil` to prevent duplicate submission
- [x] Normalize the v2 capability's Midnight contract address as bare lowercase
  64-hex across Bridge, Vue, Spring, and Read API while keeping the EIP-712
  typed-data field `0x`-prefixed as `bytes32`
- [x] Verify current v2 boundaries: Compact `39/39`, Provider `87/87`, Read API
  `60/60`, CLI `156` passed + `1` optional environment skip, Vue `141/141`,
  Spring full Gradle `86/86` (focused Midnight `19/19`), plus CLI
  typecheck/build, Vue lint/build, and Spring `bootJar`
- [x] Enforce one active unexpired request per Funder, receivable, and role,
  including a completed result through `validUntil`
- [ ] Add policy templates plus per-Funder/subject query budgets, cooldowns,
  audit visibility, and abuse controls; current active uniqueness only reduces
  simple adaptive threshold probing
- [ ] Add versioned Spring envelope key rotation/reencryption or a documented
  drain/expiry ceremony before changing `MIDNIGHT_CAPABILITY_ENCRYPTION_KEY`
- [ ] Design and migrate independent per-company Midnight wallets, encrypted
  private states, and company secrets before remote multi-user use
- [ ] Restart all changed local processes and execute a fresh live v2 E2E:
  Funder request -> Seller and Buyer consent/proof -> Spring `SUBMITTED` ->
  Bridge ACK/restart recovery -> retryable Indexer read -> Funder `COMPLETED`
- [ ] Record a live negative-criteria result and confirm the UI states only
  “requested criteria not satisfied,” never bank verification, Funding
  rejection, or automatic GIWA gate

#### Historical v1 implementation record

The checklist below records ADR-008 through ADR-020's official-CLI,
fixed-policy, PIN, and manual capability learning path. Open v1 items do not
override the current v2 product requirements above.

- [x] Define `giwa-midnight/` as the dedicated Git-submodule workspace
- [x] Document local-only Midnight trust boundary, network, components, and data classification
- [x] Add `giwa-midnight` Git submodule from `leonid-world/giwa-midnight`
- [x] Initialize the Node 22 Midnight workspace and install official SDK dependencies
- [x] Official ZK Loan contract compiles
- [x] Local Midnight services are healthy
- [ ] Design and approve explicit persistent storage and recovery for the local
  Midnight Node and Indexer before treating contract addresses as durable across
  container recreation
- [ ] Add a bounded end-to-end CLI/Bridge join deadline so a nonexistent or
  newly unreachable deployment does not wait indefinitely in
  `watchForDeployTxData` and instead reports a clear `NOT_FOUND`. The Bridge's
  10-second startup preflight validates the address first but does not itself
  bound every later SDK join watcher
- [ ] Preserve and display actionable `Wallet.Sync` root causes, including the
  Node/Indexer endpoint and transport failure, instead of `[object Object]`
- [x] Official CLI synchronizes its wallet and deploys a contract on the local network
- [x] Preserve existing contract-scoped CLI private state when joining after a
  restart; create a fresh participant state only when none exists locally
- [x] Restore the replacement deployment's original encrypted admin private
  state after the pre-fix Join overwrite; verify the recovered derived key
  against public `contractAdmin` before and after the official provider write,
  without logging or persisting the plaintext secret
- [x] Mock provider is registered
- [x] Official loan proof succeeds and the public contract state is queryable
- [ ] Rotate the local Midnight storage password and recreate the encrypted CLI
  private-state DB when ready; the former `.env.example` value exists in the
  current submodule Git history, so decide separately whether to rewrite that history
- [x] Financial fields replace credit fields
- [x] GASOK eligible and ineligible proofs succeed via CLI and expose no raw financial values in public state
- [x] Add the initial dev-only Vue `/midnight` page and local read-only API for
  CLI-proven public eligibility results
- [x] Verify the initial Vue read side against the live local Indexer with no raw
  financial values exposed
- [x] Seal GIWA chain `91342` and ReceivableFinance
  `0x0f264334f98BA0d22f7Fc6Bb901a5Fa36158a315` into the new local Compact
  deployment
- [x] Resolve the canonical Seller/Buyer wallet for a uint256 receivable ID
  through GIWA RPC in the Mock Attestation Provider
- [x] Bind the provider signature to eight fields: private policy inputs,
  company-commitment hash, GIWA receivable subject, Midnight deployment,
  provider, and policy version
- [x] Store only an opaque lookup key with eligibility, provider ID, and policy
  version; reject an exact same-key replay
- [x] Verify receivable `#1` through CLI end to end with a separate eligible
  Seller result and ineligible Buyer result
- [x] Emit the correlation-sensitive proof capability only to the CLI terminal
  for intentional verifier sharing
- [x] Reject zero/out-of-range Provider secrets and the Jubjub identity public
  key in both Provider registration and proof verification
- [x] Pin the Mock Provider and read adapter to the approved local Midnight
  deployment, and reject another address before GIWA RPC or signing
- [x] Bound local Attestation requests/responses and timeouts; restrict CLI
  Provider URLs to a redirect-free loopback root
- [x] Keep fresh wallet mnemonics out of file logs and enforce owner-only `0600`
  CLI log permissions
- [x] Bound unresolved read-adapter Indexer work to one in-flight SDK query
- [x] Add the Provider 2 two-minute, one-shot EIP-712 issuance gate: CLI
  challenge/response handoff, dev-only `/midnight/authorize` MetaMask signing,
  and Mock Provider canonical EOA recovery before Schnorr attestation
- [x] Keep raw financial values and the hidden request salt out of Vue; exchange
  only the exact salted authorization request and minified one-line response
- [x] Register Provider 2 on the current replacement deployment and confirm the
  public contract state reports one registered Provider
- [x] Execute a real Seller MetaMask authorization plus local attestation, proof
  generation, Midnight submission, and independent Indexer result verification
- [ ] Decide and implement independent per-company Seller/Buyer Midnight
  participants, wallets, encrypted private states, and `companySecret` values.
  The current actor-aware Vue flow still demonstrates every role through one
  shared Bridge identity, so same-PIN capabilities can be cross-correlatable
- [ ] Define refresh rounds, allowed replacement behavior, freshness/latest
  selection, expiry, and revocation semantics before allowing another result for
  the same receivable subject
- [x] Supersede the v1 lost-capability limitation with a request-bound encrypted
  local outbox: reserve before proving, persist before `complete`, recover by
  request ID after reload/restart, and delete only after Spring delivery ACK
- [ ] If cross-receivable reuse of one company financial attestation is desired,
  approve a separate ADR for a time-bounded/revocable company credential plus a
  fresh per-receivable-role ZK presentation/nullifier. Keep the existing
  receivable/role binding until that replacement protocol and independent
  per-company private state are designed
- [x] Replace the normal v1 clipboard/file handoff with authenticated v2 Spring
  delivery bound to the intended Funder and an encrypted capability envelope;
  keep the local artifact only in explicitly labelled legacy diagnostics
- [ ] Replace the local PoC key/env and single-instance delivery assumptions
  with a production KMS, authenticated remote Bridge/subject identity,
  retention/deletion policy, revocation, and audit before multi-user release
- [x] Update the existing Vue viewer for Phase 2.5 capability-based exact
  resolution without publicly listing receivable-party correlations
- [ ] Add direct exhaustive frontend unit tests for the complete pre-existing
  capability schema/response module and role-authorization schema/real-signer
  module. The focused proof-flow suite covers its mocked integration boundary,
  timeout/abort, races, same-origin configuration, and both route flags
- [x] Approve ADR-018's trusted local Proof Bridge to reuse the already-proven
  CLI participant, encrypted private state, wallet balance, Provider 2 flow,
  Proof Server, and current contract
- [x] Correct the former Lace assumption: official Midnight Local Dev supports
  Lace on local `undeployed`; the Bridge is a minimal-change custodial PoC
  choice, not a technical requirement
- [x] Implement the port-4200 loopback Proof Bridge with CSPRNG body-only
  sessions, one active proof, one-shot authorization, no ambiguous auto-retry,
  bounded safe HTTP behavior, and a common CLI/Bridge private-state process lock
- [x] Add an internal authorization-deadline timer so an unsigned prepared tuple
  is discarded and its active slot is released even when no later poll arrives
- [x] Automatically purge terminal capability/error/status records after 60
  seconds with unref timers, without relying on lazy sweep or a later request
- [x] Bound the startup Indexer preflight to 10 seconds, keep port 4200 closed on
  failure, seal validated GIWA configuration in memory, and remove per-challenge
  Indexer queries while raw inputs exist; record the SDK's non-abortable single
  timed-out-startup-query limitation
- [x] Attempt encrypted-state sanitization after every Bridge success/failure,
  retry cleanup once, and require stale-witness sanitization before another
  prepare; disclose that dropping JavaScript references is not guaranteed
  memory zeroization
- [x] Immediately preserve and return a finalized proof capability without a
  per-session Indexer query; permit resolver-only retry and never proof
  resubmission for delayed public visibility
- [x] Add the separately gated dev-only `/midnight/prove` route; clear raw
  values/PIN after challenge creation, require an explicit MetaMask action, poll
  status, and independently resolve the completed capability via read API/Indexer
- [x] Replace free-form proof-subject entry with authenticated receivable
  selection: display DB/onchain/NFT IDs separately, derive the synchronized
  onchain ID and Seller/Buyer role, and block Funder/unrelated issuance
- [x] Separate the actor UX: Seller/Buyer start proof issuance from Receivables
  with their canonical role wallet; Funder opens `/midnight`, never signs for a
  party, and verifies only an intentionally delivered capability
- [x] Remove `/midnight/authorize` links from product-facing verifier/prover
  pages; retain that dev-only route only for direct CLI learning/diagnostic use
- [x] Bind Funder capability verification to a selected DB receivable and role;
  reject an onchain ID, ReceivableFinance, role, or party-wallet mismatch before
  the read adapter call and clear capability memory when context changes
- [x] Replace the copy/paste-only primary handoff with explicit issuer clipboard
  copy or local-file export plus Funder clipboard/file import; keep raw one-line
  JSON for advanced diagnostics, preserve context/reset cleanup, and warn that
  correlation-sensitive OS artifacts may remain after Vue memory is cleared
- [x] Make private-input guidance human-readable without narrowing Compact:
  comma-formatted integer-KRW revenue, percentage-to-bps conversion, full
  overdue/PIN uint ranges, temporary CSPRNG PIN, and explicit valid-ineligible
  behavior outside policy thresholds
- [x] Disable both plugin and runtime Vue Devtools while the raw-input proof
  route is enabled and verify no proof-flow value enters Pinia, storage, URL,
  logs, telemetry, Spring, or MySQL
- [x] Add Bridge session, HTTP security, one-shot/expiry/cancellation,
  private-state cleanup, and common process-lock tests; keep Docker/LevelDB live
  E2E separate from the non-environment suite
- [ ] Restore the CLI workspace ESLint binary/dependency and run its existing
  lint script; current CLI typecheck/build and 125-test pass result plus 1
  optional environment test skip are verified, but `npm run lint`
  currently reports `eslint: command not found`
- [x] Override and lock Restify 11's transitive `find-my-way`/`send` to
  `9.8.0`/`1.2.1`; confirm the installed tree and zero high-severity npm audit
  findings
- [x] Complete focused Vue route/service/composable tests for success, failure, expiry,
  cancellation, races, unmount, timeout, strict response matching, and
  independent final resolution; current Node 24.19.0 result is 14 files / 103
  tests plus full ESLint/Oxlint, changed-file Prettier, production build, and zero
  high-severity `npm audit` findings
- [x] Distinguish a stopped port-4200 Bridge from a malformed successful wire
  response: map Vite's non-JSON `502` proxy response to the safe local-service
  unavailable error, preserve ambiguous prove status-only recovery, and keep a
  successful non-JSON response invalid
- [x] Preserve only fixed Provider/GIWA operational errors through the
  CLI/Bridge/Vue boundary (`GIWA_RECEIVABLE_NOT_FOUND`,
  `GIWA_RPC_UNAVAILABLE`, `ROLE_WALLET_MISMATCH`) without reflecting Provider
  response bodies or request values
- [x] Normalize Compact's exact lookup-key duplicate to
  `ELIGIBILITY_RESULT_ALREADY_EXISTS`; show existing-capability reuse guidance,
  forbid PIN-change bypass language, and disclose that a lost capability cannot
  be recovered in the current MVP
- [x] Diagnose the 2026-08-19 DB `#4` / onchain `#1` Seller failure as an
  already-existing exact result rather than Docker, Provider, Proof Server,
  Node, or Bridge unavailability
- [x] Add `midnight/LOCAL_POC_RUNBOOK.md` with five copy-paste terminal blocks,
  readiness checks, DB/onchain/NFT identity guidance, Seller/Buyer issuance and
  Funder verification, input units/PIN meaning, safe shutdown, CLI/Bridge
  locking rules, and separate 502 diagnosis for a stopped Bridge versus the
  Provider/GIWA-RPC Challenge path
- [x] Replace the ephemeral Provider 2 with deterministic local development
  config `PROVIDER_SECRET_KEY=2`, register its public key once on the v2
  deployment, and pin Provider/Bridge preflight to that key
- [x] Verify the production artifact excludes the proof route registration,
  proof view/service chunk, and proof API marker, and smoke the live Seller `#1`
  challenge through Vue → Bridge with
  all four private values absent from the post-challenge DOM and captured console
- [ ] Remove the dead `midnight-prove` route-name string left in the production
  Receivables asset by the dev-only CTA, if complete compile-time elimination is
  desired. The route/chunk/API are already absent; do not present this dead
  string as a security boundary
- [ ] Repeat the browser flow with an available MetaMask provider; the in-app
  browser smoke stopped before EIP-712 signing and is not a proof/transaction E2E
- [ ] Execute real Seller and Buyer `/midnight/prove` local E2E runs before
  marking browser-triggered proof submission complete
- [ ] Treat direct Vue + Lace as a later self-custody replacement requiring a
  separate identity/private-state migration ADR, not a parallel hidden path
- [x] Supersede the former no-Spring v1 limitation with ADR-021's minimal
  authenticated request coordination and encrypted capability custody; keep
  raw facts outside Spring/MySQL and keep eligibility outside the Funding gate

Phase 1 complete: the workspace pins one physical
`@midnight-ntwrk/onchain-runtime-v3@3.0.0` instance, matching the official ZK
Loan lockfile and compatibility matrix. This fixed the duplicate-WASM-class
`StateValue` failure. The official CLI deployed the contract, registered Mock
Provider 1, fetched a mock attestation, generated and submitted the loan proof,
and queried the public contract state on the local `undeployed` network.

Phase 2 CLI complete: the Compact circuit privately evaluates integer KRW
annual revenue, debt ratio in basis points, and overdue count. The local CLI E2E
recorded both `eligible=true` at the exact policy boundary and `eligible=false`
one KRW below the revenue boundary. Each result entry contained only a
pseudonymous commitment, eligibility, Mock Provider ID, and policy version;
public admin and Provider-registry control state remained separate.

The initial Phase 3A list viewer is retired. The current read side accepts one
intentionally shared Proof capability in the development-only Vue `/midnight`
page and sends it to the adapter's exact
`POST /v1/eligibility-results/resolve` endpoint. The adapter is the sole
authority for the pinned Midnight contract, does not expose an anonymous result
list, and returns only the matching receivable, role, canonical party wallet,
and minimal proof result. The page does not submit proofs or change Funding,
Spring Boot, MySQL, MetaMask, or GIWA contracts.

Phase 2.5 binding was completed on the now-superseded local contract
`a8c0c1997c424dd1215d055fb5688200194263c7be5deef8b4e7620d2cdceb2c`.
That deployment separated Seller and Buyer results for one canonical GIWA
receivable context.

The Mock Provider resolves that context through GIWA RPC, the eight-field
signature prevents cross-context reuse, and the ledger publishes only an opaque
key plus the minimal result. Receivable `#1` produced Seller `true` and Buyer
`false` through the CLI from deliberately different caller-supplied mock inputs.
This proves role-context separation, not either party's actual finances. Live
adapter smoke tests resolved those same role-labeled outcomes and rejected a
tampered capability with HTTP 400. Actual development-browser submissions also
resolved Seller `true` and Buyer `false`, while Node 22 lint/build checks passed.
That is only the browser read path.

The standalone chain was reset when its Node container was recreated on
2026-08-17, so those results and capabilities remain historical evidence only.
The current replacement deployment is
`7e3ea9d741ce0f5862db6f46d0ad720be2586cd7d0405ec77e4a0478aa50f4fb`;
Provider 2 registration and the ADR-017 real Seller runtime E2E were completed
there. ADR-018 real Seller/Buyer browser-triggered runs remain pending.

ADR-017 code complete: Provider 2 now has a separate two-step issuance gate.
The CLI retains private values and a hidden salt, hands a two-minute typed
request to the dev-only Vue `/midnight/authorize` tool, accepts its one-line
MetaMask response, and sends it back to the Mock Provider. The Provider consumes
the challenge once, rechecks the GIWA role and private commitment, and recovers
the canonical EOA before issuing the unchanged Schnorr attestation. Compact and
the contract logic are unchanged and do not independently verify EIP-712;
Provider 1 results remain legacy. The local deployment address changed only
because the standalone chain was recreated.

The complete Attestation API suite passes `74/74`. CLI tests pass `125` with `1`
optional environment E2E skipped, and UI lint/build checks pass. Provider 2
registration and a real Seller MetaMask-to-Midnight local runtime E2E are
complete on the current replacement deployment. ADR-018 is accepted for the
trusted local Bridge and `/midnight/prove` flow. Secure multi-user capability
delivery/access, independent actors, public-result freshness/expiry, direct Lace
self-custody, and backend coordination remain later work.
