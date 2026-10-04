/**
 * PANOPTES prototype core — canary immunology (whitepaper Def 5):
 * hypergeometric detection power for n planted canaries with m observed in
 * egress, and the false-positive control for the token matcher.
 */

/** Probability that at least one of n planted canaries appears in a sample
 *  where the adversary's dump covers a k/n fraction of the secret store. */
export function canaryDetectionPower(n: number, k: number, fraction: number): number {
  if (n <= 0 || k <= 0) return 0;
  if (fraction <= 0) return 0;
  if (fraction >= 1) return 1;
  // P(at least one of the k sampled items is a canary), sampling without
  // replacement from n items of which the dump fraction covers fraction*n.
  const covered = Math.max(1, Math.round(n * fraction));
  // P(none of k draws is from the covered set) = C(n-covered, k)/C(n, k)
  let pNone = 1;
  for (let i = 0; i < k; i++) {
    pNone *= (n - covered - i) / (n - i);
  }
  return Math.min(1, Math.max(0, 1 - pNone));
}

/** Upper bound on false-positive rate for a token matcher of given length
 *  over an alphabet of size A, against random content of the same length. */
export function canaryFalsePositiveRate(tokenLength: number, alphabet = 62): number {
  if (tokenLength <= 0) return 1;
  return 1 / Math.pow(alphabet, tokenLength);
}

/** Required token length for a target FP rate (capped at 32). */
export function canaryTokenLengthForFp(targetFp: number, alphabet = 62): number {
  return Math.min(32, Math.max(8, Math.ceil(Math.log(1 / targetFp) / Math.log(alphabet))));
}
