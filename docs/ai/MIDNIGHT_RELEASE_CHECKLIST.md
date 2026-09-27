# 최종 제출 전 저장소·공개 주소 정리

기록일: 2026-09-15. 갱신: 2026-09-27. 상태: **단일 저장소·새 클론·배포
연결·공개 Preview 네 시나리오와 재시작 복구 검증 완료**.

2026-09-27 사용자가 새 공개 `leonid-world/midproof` 저장소와 지갑 없는 데모,
기존 Vercel/Railway 배포를 승인했다. 같은 날 ADR-025로 체험 범위를 정정했다.
테스트 로그인 뒤 미리 준비된 가상 기업 시나리오에 동의하고 실제 Midnight
증명과 독립 조회 결과를 확인한다. GIWA 채권 생성, 역할 지갑 ETH, MetaMask,
운영자의 faucet 준비는 필요 없다. 앞선 전용 GIWA fixture 계획과 CAPTCHA
동의 요청은 미수행 상태로 폐기했다. 기존 GASOK·Preview 지갑·계약·MySQL은 보존한다.

현재 기준은 공개 `main`의 `e2aa5542b889d5e5d2a47280856c78216379394a`다.
EVM 없는 새 로컬 5개 서비스에서 Seller/Buyer × 충족/미충족 네 실제 증명과
전체 재시작 후 동일 결과 복구를 확인했다. 인증 없는 clone도 이 커밋으로
두 이미지를 빌드하고 별도 새 볼륨에서 Seller/steady 실제 증명에 성공했다.
기존 Preview 계약에서 Seller/Buyer A/B 네 브라우저 결과를 확인했으며,
서버 재시작 후 같은 세션의 최신 결과와 동일 거래 복구도 확인했다. 최신 근거는
[Midnight 전용 검증](MIDNIGHT_ONLY_VALIDATION_2026-09-27.md)을 따른다.
[이전 로컬 검증](LOCAL_DEMO_VALIDATION_2026-09-27.md)의 EVM 기반 결과와
[앞선 릴리스 기록](MIDPROOF_RELEASE_2026-09-27.md)은 역사 기록으로 구분한다.

## 잊지 않도록 설정한 상기 방법

2026-09-15 사용자가 아래 두 방법을 승인했고 설정을 완료한 기록이다.
알림 자체는 전환 작업을 실행하지 않는다. 이번 체크리스트 갱신에서 자동화
설정이나 실제 전달 이력을 변경·재검증하지 않았다.

- **제출 준비 시 확인:** 루트 [AGENTS.md](../../AGENTS.md)에 최종 제출·
  제출 준비·제출 링크 정리를 요청받으면 이 문서와 TODO를 먼저 읽고 미완료
  항목을 상기시키도록 규칙을 추가했다. 일반 기능 개발 중에는 전환을 앞당기지 않는다.
- **예약 알림:** 2026년 **9월 24·25·26·27일, 매일 오후 8시(Asia/Seoul)**에
  이 대화에서 최신 문서와 완료 근거를 확인하고 남은 작업을 알려준다.
  자동화 이름은 `Midnight 제출 전 저장소·주소 정리 알림`, ID는 `midnight`다.
  같은 상태라도 요청한 각 날짜에 미완료 작업을 한 번 상기시킨다.
- 완료 근거가 확인되거나 사용자가 최종 제출 완료/알림 중지를 알리면 자동화를
  일시 중지하도록 지시했다. 9월 27일 이후에는 예정된 실행이 없다.
- 로컬 문서를 읽는 예약 작업은 컴퓨터와 Codex 앱이 실행 중이어야 한다.
  앱의 Scheduled에서 알림 설정과 실제 실행 결과를 확인할 수 있다.

설정 생성과 저장된 일정은 확인했다. 미래 알림의 실행·전달 완료를 뜻하지 않는다.

## 정리 방향

- 기존 GASOK 저장소와 제출 이력은 보존한다.
- Midnight 제출용 **새 공개 저장소 하나**에 프론트·백엔드·Midnight·기존
  계약 등 필요한 소스를 일반 폴더로 모은다. 내부 저장소를 따로 받아야 하는
  서브모듈 구조를 제출 저장소에 그대로 옮기지 않는 방향이다.
- 새 저장소의 기본 브랜치 `main`을 Midnight 제출 버전으로 사용하고,
  이후 Midnight 개발도 이 저장소에서 이어간다.
- 기존 Vercel 프로젝트의 이름과 공개 주소도 최종 프로젝트명에 맞춘다.
  배포는 기존 Vercel과 Railway 통합 앱·MySQL 구성을 유지한다.
- 프로젝트명은 **MidProof**, Vercel 프로젝트명은 `midproof`, 공개 주소는
  **https://midproof.vercel.app**으로 확정했다(2026-09-17). 주소를 기존 프로젝트에
  연결하고 HTTPS 응답을 확인했다. 제출 저장소는 2026-09-27
  `leonid-world/midproof`로 확정·게시했고, 공개 범위와 기반 출처를 기록했다.

새 저장소는 심사자가 코드를 쉽게 받고 실행하도록 하기 위한 구성이다.
새 이름이나 저장소만으로 신규성 또는 이전 코드 재사용 자격이 확보되는 것은
아니다. 공식 요구사항과 미확인 규정은
[해커톤 제출 안내](MIDNIGHT_HACKATHON_SUBMISSION.md)를 함께 확인한다.

## 1. 전환할 버전과 이름 확정

- [x] 제출 범위를 지갑 없는 합성 Midnight 검증과 단일 저장소 로컬 실행으로
  확정하고, GIWA 준비 없는 Midnight 전용 체험으로 정정했다(ADR-025).
  일반 GIWA 펀딩·상환 리허설은 별도 범위다.
- [x] 최종 프로젝트명 **MidProof** 확정(2026-09-17).
- [x] 제출 GitHub 저장소명/소유자: `leonid-world/midproof`.
- [x] Vercel 이름 `midproof`와 무료 주소 `midproof.vercel.app` 확정 및 연결.
- [x] 원본 GASOK 루트와 내부 저장소의 기존 변경 상태를 확인·보존하고,
  별도 monorepo에 네 프로젝트의 현재 소스를 일반 폴더로 이관했다.
- [x] 기존 GASOK와 Midnight 기반 커밋, 이관 시 포함한 미커밋 수정,
  이번 추가 구현을 [출처 문서](../PROVENANCE.md)와
  [기준 커밋](../source-origins.json)에 기록했다. 저작자 표시와 upstream
  라이선스를 보존하고 통합 런타임 이미지에도 고지·라이선스를 포함했다.
- [ ] 재사용 허용 범위와 신규 작업 기간 등 공식 제출 자격을 최종 확인한다.
  새 이름이나 저장소 게시만으로 자격이 확정되지는 않는다.

## 2. 제출용 단일 저장소 준비

- [x] 별도 `midproof` 경로에 실행·빌드에 필요한 내부 소스와 Compact
  generated artifact를 포함했다. 원본 GASOK 런타임 상태는 가져오지 않았다.
- [x] 원래 저장소와 기준 커밋, 이후 추가 변경을 문서/커밋으로 추적할 수 있게
  보존한다. 새 저장소를 만들었다는 이유로 기존 코드를 새 개발로 설명하지 않는다.
- [x] 공개 대상 파일과 가져올 이력에서 기존 비밀값·개인 상태 제외를 확인했다.
  `.local`, DB 덤프, 지갑 seed·개인키·암호화 상태·저장 암호·capability 키,
  실제 환경 파일과 배포 인증정보는 소스와 함께 게시하지 않는다.
- [x] 네 프로젝트를 서브모듈 없이 일반 파일로 추적하고 `main`에 게시했다.
  현재 검증 기준 커밋은 `e2aa5542b889d5e5d2a47280856c78216379394a`다.
- [x] README와 실행 문서에 Midnight 기여·기존 코드 재사용·고정 도구 버전·
  Docker 실행·로컬 자동 준비·호스팅 설정·가상 기관과 운영자의 처리 범위를 정리했다.
- [x] [공개 저장소](https://github.com/leonid-world/midproof)에 About 설명,
  공개 데모 링크와 `midnightntwrk` 토픽을 설정했다.
- [x] 인증 없는 HTTPS clone을 `e2aa554`로 갱신하고 두 Docker 이미지를 빌드했다.
  EVM 없는 5개 서비스·4개 새 볼륨에서 수동 환경 파일·키·계정·fixture 준비 없이
  시작해 Seller/steady=true 실제 증명과 독립 조회에 성공했다. 빌드 캐시는 사용했다.
  동의 거절·다른 세션 차단·일반 자산 경로 차단·동일 요청 재접수 검증도 통과했고,
  checkout은 clean이다. clone 환경은 검증 후 중지하고 볼륨을 보존했다.
- [x] 별도 새 로컬 5개 서비스 환경에서 네 실제 증명과 전체 stop/up 후 동일
  거래·결과 재조회를 확인했다. GIWA RPC는 `http://127.0.0.1:1`로 설정했으며,
  EVM 서비스·채권 생성·가스 준비 없이 실행했다. 이전 테스트 볼륨은 보존했다.

## 3. 기존 배포를 새 저장소·주소에 맞춤

- [x] 기존 Vercel 프로젝트 이름을 `midproof`로 변경하고 `midproof.vercel.app` 연결.
  2026-09-17 완료 사항이며 새 지갑 없는 프론트의 공개 반영과 구분한다.
- [x] 기존 Railway 앱과 Vercel 프로젝트를 `leonid-world/midproof`, `main`에
  Git 연결했다. Railway는 통합 Dockerfile이 있는 저장소 루트,
  Vercel은 Root Directory `giwa-ui`를 사용한다. Vercel Node 24.x와 기존
  환경변수 13개를 보존했다.
- [x] 새 소스의 통합 백엔드를 기존 Railway 앱으로 배포했다.
  Git 배포 `bac84ef1-d645-4c63-b1e1-ded84d876c84`는 SUCCESS/ready이며,
  기존 Preview 계약 `bfb760db44f9ee7996ef12c47e56346903c654aede7d65c3c88110214c932a1e`
  유지가 확인됐다.
- [x] 기존 환경변수, Railway `/data` 볼륨과 MySQL을 유지했다.
  저장소/도메인 정리를 위해 지갑·계약·DB를 새로 만들거나 초기화하지 않는다.
  같은 지갑 상태를 사용하는 로컬 앱과 Railway를 동시에 실행하지 않는다.
- [x] Vercel `dpl_DPQZgXXyC87BVvZSEZSdvXgK8sah`를 공개 production alias
  `midproof.vercel.app`으로 승격하고 공개 데모 화면을 확인했다.
- [x] ADR-025에 따라 전용 GIWA 역할 지갑 ETH·채권 fixture 준비 요구를 폐기했다.
  해당 faucet 수령·가스 지급·채권 거래는 실행하지 않았다. 데모 내부 인증 키는
  자동 암호화 보관하며, 공개 config의 `walletlessDemo.enabled=true`를 확인했다.
  기존 사용자·자산·Midnight 상태는 유지한다.
- [x] `https://midproof.vercel.app`을 Railway의 `CORS_ALLOWED_ORIGINS`와
  `MIDNIGHT_DEMO_ALLOWED_ORIGINS`에 반영하고 실제 배포·허용/거절 응답 확인(2026-09-17).
- [x] README·canonical·OG/Twitter·sitemap을 새 주소로 갱신하고 공개 파일 검증.
  이전 주소의 307 리다이렉트와 경로·쿼리 보존 확인(2026-09-17).
- [ ] 제출 폼·영상/Deck에 사용하는 링크도 새 주소인지 최종 확인한다.
  이번 작업에서 폼 전송이나 영상/Deck 제작은 수행하지 않았다.
- [x] 최종 공개 프론트에서 테스트 Seller 로그인·가상 시나리오 명시적 동의 후
  실제 Preview 증명과 독립 조회로 A=true/B=false를 확인했다. MetaMask·GIWA
  거래·faucet 없이 진행했다. 실제 거래 근거는 최신 검증 기록에 남긴다.
- [x] 공개 Buyer A=true/B=false 두 시나리오 완료 및 실제 거래 증거 확인.
- [x] 공개 네 시나리오 및 서버 재시작 후 최신 요청의 동일 거래·결과 복구 확인.
  로컬 네 증명·재시작 근거로 공개 검증을 대체하지 않는다. 제출 시점에
  시연 요청과 결과가 만료되지 않았는지도 확인한다.

9/18의 일반 GIWA Buyer/Funder 지갑 연결·펀딩·상환 리허설은 별도 작업이며,
이 체크리스트의 합성 리뷰 데모 완료로 대체하지 않는다. 진행 상황은
[9/18 리허설 기록](MIDNIGHT_LIVE_REHEARSAL_2026-09-18.md)을 따른다.

## 완료 기록

아래 항목이 채워지고 기존 [최종 제출 TODO](TODO.md)의 관련 항목까지 검증한
뒤에 저장소·주소 정리를 완료로 표시한다. 폼 제출 자체는 별도 최종 작업이다.

- 최종 프로젝트명: MidProof
- 공개 GitHub URL / 기본 브랜치: https://github.com/leonid-world/midproof / `main`
- 공개·검증 기준 커밋: `e2aa5542b889d5e5d2a47280856c78216379394a`
- 최종 데모 URL: https://midproof.vercel.app
- 새 클론 빌드·실행 검증: 2026-09-27 완료. EVM 없는 5개 서비스 자동 시작과
  Seller/steady 실제 증명; [최신 검증 기록](MIDNIGHT_ONLY_VALIDATION_2026-09-27.md).
- 별도 새 로컬 환경: Seller/Buyer × true/false 네 실제 증명과 전체 재시작 복구 완료.
- 배포 Git 연결: Railway/Vercel 모두 `leonid-world/midproof` / `main`.
  Railway는 저장소 루트, Vercel은 `giwa-ui`.
- 공개 백엔드: `bac84ef1-d645-4c63-b1e1-ded84d876c84` SUCCESS/ready,
  기존 Preview 계약·지갑·Provider·MySQL·볼륨 보존.
- 공개 프론트: `dpl_DPQZgXXyC87BVvZSEZSdvXgK8sah` 공개 alias 승격 완료,
  기존 환경변수 13개 보존.
- 공개 데모 최종 검증: Seller/Buyer A=true/B=false 네 결과 완료. 서버 재시작과
  새로고침 후 Buyer/B 최신 결과의 동일 요청·거래·블록 복구 완료(재증명 없음).
- 전용 GIWA fixture·ETH 준비: ADR-025로 미수행 폐기, 더 이상 선행 작업이 아님.
- 제출 폼·영상/Deck: 이번 작업에서 미수행.

실행 구성과 현재 배포 기록은 [DEPLOYMENT.md](DEPLOYMENT.md), 현재 기능 상태는
[CONTEXT.md](CONTEXT.md)를 따른다. 저장소 게시·로컬 검증·배포 연결과 공개 주소
전환과 공개 증명·복구 검증은 완료됐다. 영상/Deck·제출 링크 확인 및 실제
폼 제출은 별도 작업이며 이번 완료 범위에 포함되지 않는다.
