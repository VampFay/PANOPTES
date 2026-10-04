/**
 * PANOPTES prototype core — O7 confinement (inert transduction).
 *
 * The whitepaper's bounded-echo principle: facts may leave a quarantined
 * source, verbatim spans may not. This module measures the longest verbatim
 * overlap between candidate sink content and each registered suspicious
 * source, using word n-grams — O(source + content) per pair, no quadratic
 * alignment.
 *
 * Threshold was pre-registered before any external benchmark run:
 *   ECHO_NGRAMS = 8 consecutive identical whitespace tokens (≈ 48 chars)
 * which sits above every legitimate short factual quote in the corpora we
 * measured (version numbers, policy figures, names) and below every planted
 * payload's command span.
 */

import { normalizeForScreen } from './screen';

export const ECHO_NGRAMS = 8;

/** Normalize text into word tokens: screen-canonicalized (NFKC, zero-width
 *  stripped, homoglyphs folded), lowercase, whitespace-split, edge
 *  punctuation stripped — so a payload echoed with different punctuation,
 *  casing, or unicode obfuscation is still caught. */
function tokens(text: string): string[] {
  return normalizeForScreen(text)
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .map((t) => t.replace(/^[^\w]+|[^\w]+$/g, ''))
    .filter(Boolean);
}

/** Build the set of n-gram keys for a suspicious source. */
export function ngrams(text: string, n: number): Set<string> {
  const t = tokens(text);
  const set = new Set<string>();
  for (let i = 0; i + n <= t.length; i++) set.add(t.slice(i, i + n).join(' '));
  return set;
}

/** Fast path: does `content` contain any gram from a precombined set? */
export function echoesGrams(content: string, combined: ReadonlySet<string>): boolean {
  const t = tokens(content);
  if (t.length < ECHO_NGRAMS) return false;
  for (let i = 0; i + ECHO_NGRAMS <= t.length; i++) {
    if (combined.has(t.slice(i, i + ECHO_NGRAMS).join(' '))) return true;
  }
  return false;
}

export type EchoMatch = {
  /** The verbatim span (original casing) shared with a suspicious source. */
  span: string;
  /** Source index the echo came from. */
  source: number;
};

/**
 * Find verbatim echoes of suspicious sources in candidate content.
 * Returns the first (longest extendable) match per source or null when the
 * content is echo-clean.
 */
export function findEchoes(content: string, suspiciousSources: readonly string[]): EchoMatch[] {
  if (!content || suspiciousSources.length === 0) return [];
  const contentTokens = tokens(content);
  if (contentTokens.length < ECHO_NGRAMS) return [];

  const matches: EchoMatch[] = [];
  const contentRaw = content.split(/\s+/).filter(Boolean);

  for (let s = 0; s < suspiciousSources.length; s++) {
    const src = suspiciousSources[s];
    if (!src) continue;
    const srcSet = ngrams(src, ECHO_NGRAMS);
    if (srcSet.size === 0) continue;

    for (let i = 0; i + ECHO_NGRAMS <= contentTokens.length; i++) {
      const key = contentTokens.slice(i, i + ECHO_NGRAMS).join(' ');
      if (srcSet.has(key)) {
        // extend the echo to the maximal run of shared tokens
        const srcTokens = tokens(src);
        const srcIdx = indexOfSpan(srcTokens, contentTokens, i, ECHO_NGRAMS);
        let len = ECHO_NGRAMS;
        if (srcIdx >= 0) {
          while (
            i + len < contentTokens.length &&
            srcIdx + len < srcTokens.length &&
            contentTokens[i + len] === srcTokens[srcIdx + len]
          ) {
            len++;
          }
          // also extend backwards
          let back = 0;
          while (
            i - back - 1 >= 0 &&
            srcIdx - back - 1 >= 0 &&
            contentTokens[i - back - 1] === srcTokens[srcIdx - back - 1]
          ) {
            back++;
          }
          const start = i - back;
          matches.push({
            span: contentRaw.slice(start, start + len).join(' '),
            source: s,
          });
        } else {
          matches.push({ span: contentRaw.slice(i, i + len).join(' '), source: s });
        }
        break; // one match per source is enough for a deny decision
      }
    }
  }
  return matches;
}

function indexOfSpan(hay: string[], needle: string[], at: number, n: number): number {
  const key = needle.slice(at, at + n).join(' ');
  for (let i = 0; i + n <= hay.length; i++) {
    if (hay.slice(i, i + n).join(' ') === key) return i;
  }
  return -1;
}

/** Predicate: content may NOT flow to a sink (verbatim echo detected). */
export function echoesSuspicious(content: string, suspiciousSources: readonly string[]): boolean {
  return findEchoes(content, suspiciousSources).length > 0;
}
