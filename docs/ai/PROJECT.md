## Current project identity — 2026-09-17

The owner named the Midnight hackathon project **MidProof**. This is an application
using Midnight proofs and the existing GASOK/GIWA receivable foundation. UI assets
are original MidProof branding; the protocol/network is still named Midnight.
New demo receivables are small integer mKRW transactions (max 10,000; default
face 1,000/funding 900). The owner approved the free public origin
`https://midproof.vercel.app` and reuse of the existing Vercel project and Git
repositories. Submission repository packaging remains deferred; do not infer
repo names or originality from the new brand.

## Current owner-approved hackathon target — 2026-09-15

The owner approved the integrated synthetic Midnight demo (ADR-023), superseding
local-only execution restrictions below. One IntelliJ **Midnight Demo** Run
starts the backend and helpers; one existing Railway app contains them with the
existing separate MySQL service. Vercel remains the frontend. Public Midnight
Preview replaces self-operated Node/Indexer. Preprod/Mainnet remain prohibited.
The owner wants UI operation, not source-level learning or production operations.
Existing GIWA funding/repayment behavior remains separate and unchanged.

# MOST IMPORTANT

Midnight PoC가 production scope가 아니라는 점
gasok-midnight 브랜치에서만 작업

현재 로컬 Midnight 제품 흐름은 request-bound v2다. Funder가 채권의
Seller/Buyer에게 공개 **기준**을 요청하고, 해당 당사자가 자신의
caller-supplied mock 재무값과 역할 지갑 동의를 제공하면 Compact가 그 기준의
충족 여부 한 비트만 증명한다. 일반 화면에는 JSON/PIN이 없고 Spring이 요청과
암호화 capability 전달을 조율한다.

이 결과는 은행·회계기관 검증, 실제 기업 재무의 진실성 보증, GIWA Funding
승인 또는 자동 펀딩 gate가 아니다. Midnight Preprod/Mainnet에는 배포하지
않고, GIWA Solidity의 tokenization/funding/repayment 흐름은 변경하지 않는다.
과거 v1 fixed-policy/clipboard/PIN 화면은 `/midnight/legacy/*` 진단 경로로만
보존한다.

# GIWA Receivable Financing MVP

## Overview

GIWA 기반 RWA(Real World Asset) 매출채권 토큰화 MVP.

매출채권을 ERC-721 NFT로 토큰화하고,
제3의 Funder가 자금을 공급한 뒤
Buyer가 채권 금액을 상환하는 Supply Chain Finance 데모를 구현한다.
현재 MVP 컨트랙트는 만기 시점 자체를 강제하지 않는다.

본 프로젝트는 실제 금융서비스가 아닌
GIWA Hackathon용 MVP이다.

---

## Goals

- 일반 로그인
- MetaMask 연동
- 기업과 Wallet Mapping
- 매출채권 등록
- Buyer 검증
- ERC721 토큰화
- Funding
- Repayment

---

## Current Stage

End-to-end MVP lifecycle completed.

Replacement contracts deployed and source-verified with the reproducible
Hardhat configuration. Application address rollout and a fresh lifecycle remain.

---

## Tech Stack

Frontend

- Vue3
- Vite
- Pinia
- ethers.js

Backend

- Spring Boot
- Java17
- MyBatis
- MySQL

Blockchain

- Solidity
- OpenZeppelin
- GIWA Sepolia

---

## Out of Scope

- Real Payment
- KYC
- Credit Scoring
- Liquidity Pool
- Multiple Funders
- Oracle
- Production Security
