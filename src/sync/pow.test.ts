import { describe, it, expect } from 'vitest';
import {
  solveChallenge,
  verifyProof,
  difficultyFromHex,
  sha256Hex,
} from './pow';

describe('proof-of-work', () => {
  it('counts leading zero hex nibbles', () => {
    expect(difficultyFromHex('0001ab')).toBe(3);
    expect(difficultyFromHex('0aaa')).toBe(1);
    expect(difficultyFromHex('ff00')).toBe(0);
  });

  it('produces a stable 64-char sha256 hex digest', async () => {
    const h = await sha256Hex('abc');
    expect(h).toHaveLength(64);
    expect(h).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'
    );
  });

  it('finds a nonce that verifies for a given difficulty', async () => {
    const challenge = 'c-' + Math.random().toString(36).slice(2);
    const difficulty = 3;
    const nonce = await solveChallenge(challenge, difficulty);
    expect(await verifyProof(challenge, nonce, difficulty)).toBe(true);
  });

  it('rejects the wrong nonce', async () => {
    const challenge = 'c-' + Math.random().toString(36).slice(2);
    const nonce = await solveChallenge(challenge, 3);
    expect(await verifyProof(challenge, nonce + 1, 3)).toBe(false);
  });

  it('rejects out-of-range difficulties', async () => {
    expect(await verifyProof('x', 0, 0)).toBe(false);
    expect(await verifyProof('x', 0, 99)).toBe(false);
  });
});
