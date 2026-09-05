/**
 * Proof-of-work CAPTCHA.
 *
 * A stateless, self-hosted challenge used to slow down bot-driven
 * register/login on the sync backend — no third-party service required.
 *
 * The server issues an opaque `challenge` plus a `difficulty` (number of
 * leading zero hex nibbles the digest must start with). The client finds a
 * `nonce` such that `sha256(challenge + ':' + nonce)` starts with that many
 * zeros, and returns the nonce. The server recomputes the hash to verify.
 */

export function difficultyFromHex(hex: string): number {
  let zeros = 0;
  for (const ch of hex) {
    if (ch === '0') zeros++;
    else break;
  }
  return zeros;
}

export async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/** Verify that a nonce satisfies the challenge at the given difficulty. */
export async function verifyProof(
  challenge: string,
  nonce: number,
  difficulty: number
): Promise<boolean> {
  if (difficulty < 1 || difficulty > 32) return false;
  const hash = await sha256Hex(`${challenge}:${nonce}`);
  return difficultyFromHex(hash) >= difficulty;
}

/**
 * Find a nonce satisfying the challenge. Expected work is ~16^difficulty
 * hashes; the default of 4 (≈65k hashes) stays fast on desktop browsers.
 */
export async function solveChallenge(
  challenge: string,
  difficulty: number
): Promise<number> {
  const prefixLen = difficulty;
  for (let nonce = 0; nonce < 1_000_000_000; nonce++) {
    const hash = await sha256Hex(`${challenge}:${nonce}`);
    if (difficultyFromHex(hash) >= prefixLen) return nonce;
  }
  throw new Error('Could not solve proof-of-work challenge.');
}
