// This file is derived from midnightntwrk/example-zkloan.
// Copyright (C) 2025 Midnight Foundation
// SPDX-License-Identifier: Apache-2.0

import { Ledger } from './managed/zkloan-credit-scorer/contract/index.js';
import { WitnessContext } from '@midnight-ntwrk/midnight-js-protocol/compact-runtime';

export type SchnorrSignature = {
  announcement: { x: bigint; y: bigint };
  response: bigint;
};

// The proof runtime temporarily supplies these values to the proving circuit.
// In the hosted synthetic demo the operator and Prover process the witness;
// callers must sanitize private state after proving. This witness never writes
// the financial values, signature, or company secret to the public ledger.
export type GasokEligibilityPrivateState = {
  annualRevenueKrw: bigint;
  debtRatioBps: bigint;
  overdueCount: bigint;
  attestationSignature: SchnorrSignature;
  attestationProviderId: bigint;
  attestationProfileAsOf: bigint;
  companySecretKey: Uint8Array;
};

const TWO_248 = 452312848583266388373324160190187140051835877600158453279131187530910662656n;

export const witnesses = {
  getAttestedFinancialWitness: ({
    privateState,
  }: WitnessContext<Ledger, GasokEligibilityPrivateState>): [
    GasokEligibilityPrivateState,
    [{ annualRevenueKrw: bigint; debtRatioBps: bigint; overdueCount: bigint }, SchnorrSignature, bigint, bigint],
  ] => [
    privateState,
    [
      {
        annualRevenueKrw: privateState.annualRevenueKrw,
        debtRatioBps: privateState.debtRatioBps,
        overdueCount: privateState.overdueCount,
      },
      privateState.attestationSignature,
      privateState.attestationProviderId,
      privateState.attestationProfileAsOf,
    ],
  ],

  getSchnorrReduction: (
    { privateState }: WitnessContext<Ledger, GasokEligibilityPrivateState>,
    challengeHash: bigint,
  ): [GasokEligibilityPrivateState, [bigint, bigint]] => {
    const q = challengeHash / TWO_248;
    const r = challengeHash % TWO_248;
    return [privateState, [q, r]];
  },

  getCompanySecret: ({
    privateState,
  }: WitnessContext<Ledger, GasokEligibilityPrivateState>): [GasokEligibilityPrivateState, Uint8Array] => {
    if (!privateState.companySecretKey || privateState.companySecretKey.length !== 32) {
      throw new Error('getCompanySecret: companySecretKey is missing or wrong length');
    }
    return [privateState, privateState.companySecretKey];
  },
};
