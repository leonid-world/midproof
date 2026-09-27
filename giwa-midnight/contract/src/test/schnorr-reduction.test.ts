import { MAX_FIELD } from '@midnight-ntwrk/midnight-js-protocol/compact-runtime';
import { describe, expect, it } from 'vitest';
import { pureCircuits } from '../managed/zkloan-credit-scorer/contract/index.js';

const TWO_248 = 1n << 248n;
const reduce = pureCircuits.Schnorr_reduceChallenge;

describe('canonical Schnorr challenge reduction', () => {
  it.each([0n, 1n, TWO_248 - 1n, TWO_248, TWO_248 + 1n, MAX_FIELD - 1n, MAX_FIELD])(
    'preserves the signing protocol at canonical field boundary %s',
    (challenge) => {
      expect(reduce(challenge, challenge / TWO_248, challenge % TWO_248)).toBe(challenge % TWO_248);
    },
  );

  it('rejects a quotient above the native field maximum', () => {
    expect(() => reduce(0n, MAX_FIELD / TWO_248 + 1n, 0n)).toThrow('Challenge quotient is out of range');
  });

  it('rejects the terminal limb above the canonical field maximum', () => {
    expect(() => reduce(MAX_FIELD, MAX_FIELD / TWO_248, MAX_FIELD % TWO_248 + 1n))
      .toThrow('Challenge decomposition is not canonical');
  });

  it('rejects inconsistent in-range limbs', () => {
    expect(() => reduce(1n, 0n, 0n)).toThrow('Invalid challenge reduction');
    expect(() => reduce(TWO_248, 0n, 1n)).toThrow('Invalid challenge reduction');
  });

  it('enforces limb widths at the generated boundary', () => {
    expect(() => reduce(0n, 128n, 0n)).toThrow();
    expect(() => reduce(0n, 0n, TWO_248)).toThrow();
    expect(() => reduce(0n, -1n, 0n)).toThrow();
  });
});
