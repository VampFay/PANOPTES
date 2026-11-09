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
 *
 * v1.3.0 BUG-03 fix: uses tokenizeAligned() to lock normalized token indices
 * to raw whitespace token slices, eliminating off-by-one span shifts on
 * standalone punctuation tokens.
 */

import { normalizeForScreen } from './screen';

export const ECHO_NGRAMS = 8;

export type AlignedToken = {
  norm: string;
  raw: string;
  rawIndex: number;
};

/**
 * Tokenize text into aligned words: screen-canonicalized, lowercase, edge
 * punctuation stripped, while preserving exact 1:1 references back to the
 * raw whitespace-split token array.
 */
export function tokenizeAligned(text: string): AlignedToken[] {
  if (!text) return [];
  const rawTokens = text.split(/\s+/).filter(Boolean);
  const out: AlignedToken[] = [];
  for (let i = 0; i < rawTokens.length; i++) {
    const raw = rawTokens[i]!;
    const norm = normalizeForScreen(raw)
      .toLowerCase()
      .replace(/^[^\w]+|[^\w]+$/g, '');
    if (norm) {
      out.push({ norm, raw, rawIndex: i });
    }
  }
  return out;
}

/** Build the set of n-gram keys for a suspicious source. */
export function ngrams(text: string, n: number = ECHO_NGRAMS): Set<string> {
  const t = tokenizeAligned(text);
  const set = new Set<string>();
  for (let i = 0; i + n <= t.length; i++) {
    set.add(t.slice(i, i + n).map((tok) => tok.norm).join(' '));
  }
  return set;
}

/** Fast path: does `content` contain any gram from a precombined set? */
export function echoesGrams(content: string, combined: ReadonlySet<string>): boolean {
  const t = tokenizeAligned(content);
  if (t.length < ECHO_NGRAMS) return false;
  for (let i = 0; i + ECHO_NGRAMS <= t.length; i++) {
    const gram = t.slice(i, i + ECHO_NGRAMS).map((tok) => tok.norm).join(' ');
    if (combined.has(gram)) return true;
  }
  return false;
}

export type EchoMatch = {
  /** The verbatim span (original raw tokens) shared with a suspicious source. */
  span: string;
  /** Source index the echo came from. */
  source: number;
};

/**
 * Find verbatim echoes of suspicious sources in candidate content.
 * Returns the first (longest extendable) match per source or empty when clean.
 */
export function findEchoes(content: string, suspiciousSources: readonly string[]): EchoMatch[] {
  if (!content || suspiciousSources.length === 0) return [];
  const rawTokens = content.split(/\s+/).filter(Boolean);
  const contentTokens = tokenizeAligned(content);
  if (contentTokens.length < ECHO_NGRAMS) return [];

  const matches: EchoMatch[] = [];

  for (let s = 0; s < suspiciousSources.length; s++) {
    const src = suspiciousSources[s];
    if (!src) continue;
    const srcTokens = tokenizeAligned(src);
    if (srcTokens.length < ECHO_NGRAMS) continue;

    const srcGramMap = new Map<string, number[]>();
    for (let j = 0; j + ECHO_NGRAMS <= srcTokens.length; j++) {
      const g = srcTokens.slice(j, j + ECHO_NGRAMS).map((t) => t.norm).join(' ');
      let list = srcGramMap.get(g);
      if (!list) {
        list = [];
        srcGramMap.set(g, list);
      }
      list.push(j);
    }
    if (srcGramMap.size === 0) continue;

    for (let i = 0; i + ECHO_NGRAMS <= contentTokens.length; i++) {
      const key = contentTokens.slice(i, i + ECHO_NGRAMS).map((t) => t.norm).join(' ');
      const srcIndices = srcGramMap.get(key);
      if (srcIndices && srcIndices.length > 0) {
        const srcIdx = srcIndices[0]!;
        let len = ECHO_NGRAMS;
        while (
          i + len < contentTokens.length &&
          srcIdx + len < srcTokens.length &&
          contentTokens[i + len]!.norm === srcTokens[srcIdx + len]!.norm
        ) {
          len++;
        }
        let back = 0;
        while (
          i - back - 1 >= 0 &&
          srcIdx - back - 1 >= 0 &&
          contentTokens[i - back - 1]!.norm === srcTokens[srcIdx - back - 1]!.norm
        ) {
          back++;
        }
        const startTokenIdx = i - back;
        const endTokenIdx = i + len - 1;
        const startRaw = contentTokens[startTokenIdx]!.rawIndex;
        const endRaw = contentTokens[endTokenIdx]!.rawIndex;

        matches.push({
          span: rawTokens.slice(startRaw, endRaw + 1).join(' '),
          source: s,
        });
        break; // one match per source is enough for deny
      }
    }
  }
  return matches;
}

/** Predicate: content may NOT flow to a sink (verbatim echo detected). */
export function echoesSuspicious(content: string, suspiciousSources: readonly string[]): boolean {
  return findEchoes(content, suspiciousSources).length > 0;
}
