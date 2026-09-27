# GIWA Receivable MVP Codex Pack

파일 구성:

- `CODEX_MVP_SPEC.md`
  - 전체 MVP 프로세스, 역할, 화면, API, 아키텍처, 컨트랙트 요구사항
- `schema.sql`
  - MySQL 8 실행용 테이블 DDL
- `CODEX_ENTRY_PROMPT.md`
  - Codex 세션을 시작할 때 전달할 짧은 명령문

권장 사용 순서:

1. 세 파일을 프로젝트 루트 또는 `docs/codex/`에 복사한다.
2. Codex에 `CODEX_ENTRY_PROMPT.md` 내용을 전달한다.
3. Codex가 저장소 분석 결과와 구현 계획을 먼저 출력하게 한다.
4. 계획을 검토한 후 P0 구현을 시작시킨다.
5. GIWA RPC, Explorer URL, Contract Address, ABI는 실제 값으로 별도 설정한다.

주의:
- 이 문서는 신규 프로젝트를 강제하지 않는다.
- 기존 저장소가 있으면 Codex가 기존 구조를 우선하도록 설계되어 있다.
- Remix로 배포한 컨트랙트도 ABI와 주소만 있으면 Frontend에서 정상 호출할 수 있다.
