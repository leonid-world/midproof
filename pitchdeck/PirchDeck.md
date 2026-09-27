# 기왕 하는 거 가속 Pitch Deck

> **GIWA 체인 기반 매출채권(RWA) 토큰화 및 즉시 유동화 프로토콜**

![GIWA Chain](https://img.shields.io/badge/Chain-GIWA%20Chain-blue?style=for-the-badge)
![Category](https://img.shields.io/badge/Category-DeFi%20%2F%20RWA-green?style=for-the-badge)
![License](https://img.shields.io/badge/License-MIT-orange?style=for-the-badge)

---

## Executive Summary

**"기업의 자금 순환을 '가속'합니다."**

`기왕 하는 거 가속` 프로젝트는 B2B 거래에서 발생하는 **매출채권(미수금)을 GIWA 체인 상의 RWA(Real World Asset) 토큰으로 전환**하여, 대금 지급 기한까지 기다릴 필요 없이 즉시 현금화할 수 있는 **온체인 유동화 플랫폼**입니다.

- **Problem**: 평균 30~90일에 달하는 대금 정산 주기, 이로 인한 연쇄 자금난 및 현금 흐름 정체
- **Solution**: 매출채권의 토큰화 + 온체인 유동성 풀(Liquidity Pool)을 통한 신속 할인 매각
- **Core Value**: 금융 소외계층(중소기업 등)의 자금 유동성 즉시 확보 & 투자자에게는 안정적인 저위험 리워드 제공

---

## Problem: 묶여있는 돈, 느린 정산

1. **기나긴 대금 정산 주기 (Payment Delay)**
   - B2B 거래 후 대금 수령까지 **평균 30일 ~ 90일 소요**
   - 당장 오퍼레이션 비용(인건비, 원자재비 등)이 급한 소규모 사업자는 자금 압박 직면
2. **기존 금융권 매출채권 할인(팩토링)의 한계**
   - 까다로운 서류 심사와 높은 은행 문턱
   - 영세 기업 접근 불가능에 가까움
   - 중개 기관의 과도한 수수료 발생

---

## Solution: GIWA 기반 매출채권 토큰화 (RWA)

우리는 GIWA 체인의 빠른 속도와 저렴한 수수료를 활용해 **매출채권 할인 정산 프로세스를 완전 온체인화**합니다.

```mermaid
graph TD
    A[채권자] -->|1. 매출채권 발행 및 증빙 업로드| B(GIWA Smart Contract)
    B -->|2. Invoice NFT / Token 발행| C[RWA Liquidity Pool]
    D[투자자 / 유동성 공급자] -->|3. 할인 가격에 채권 토큰 매수| C
    C -->|4. 즉시 현금 유동성 지급| A
    E[원채무자 / 기업] -->|5. 만기 시 대금 상환| B
    B -->|6. 원금 + 이자 정산| D
```
