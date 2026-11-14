/**
 * PANOPTES prototype core — O7 confinement (inert transduction; v1.3.2).
 *
 * Unicode-aware index-locked n-gram confinement across all scripts (Latin,
 * Cyrillic, Greek, Arabic, Hebrew, Devanagari/Indic, Hangul, Thai, and
 * unspaced CJK Han/Hiragana/Katakana).
 */

import { normalizeForConfinement, foldLookalikes } from './screen';

export const ECHO_NGRAMS = 8;

export type AlignedToken = {
  /** Normalized lowercase token used for n-gram comparison. */
  norm: string;
  /** Original raw substring from the source text. */
  raw: string;
  /** Exact raw whitespace token index for legacy compatibility. */
  rawIndex?: number;
  /** Exact UTF-16 start offset in the original string. */
  start: number;
  /** Exact UTF-16 end offset in the original string. */
  end: number;
};

const UNICODE_EDGE_PUNCT_RE = /^[^\p{L}\p{M}\p{N}_]+|[^\p{L}\p{M}\p{N}_]+$/gu;
const CJK_CHAR_RE = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u;
const CJK_RUN_RE = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]+/gu;

/**
 * Normalized token helper with document-level and fast-path optimizations (OPT-02).
 * Skips 9 sequential regex and Unicode passes for ASCII alphanumeric tokens.
 */
function normalizeWordChunk(rawChunk: string): string {
  if (!rawChunk) return '';
  // Fast path 1: ASCII alphanumeric (most common case in benchmarks/code/English)
  if (/^[a-zA-Z0-9]+$/.test(rawChunk)) {
    return rawChunk.toLowerCase();
  }
  // Fast path 2: Printable ASCII with punctuation (removes edge & intra-word punct)
  if (/^[\x20-\x7E]+$/.test(rawChunk)) {
    let s = rawChunk.toLowerCase();
    s = s.replace(/^[^a-z0-9_]+|[^a-z0-9_]+$/g, '');
    if (!s) return '';
    return s.replace(/(?<=[a-z])[.\-_'](?=[a-z])/g, '');
  }
  // Full path: Unicode diacritics, zalgo, lookalikes, non-Latin scripts, C0 control characters
  return foldLookalikes(normalizeForConfinement(rawChunk))
    .toLowerCase()
    .replace(UNICODE_EDGE_PUNCT_RE, '')
    .replace(/(?<=\p{L})[.\-_'](?=\p{L})/gu, '');
}

/**
 * Index-locked Unicode-aware tokenizer (VULN-CONF-01 & BUG-06 fix):
 * 1. Preserves all Unicode letters (\p{L}), combining marks (\p{M}), and
 *    numbers (\p{N}) across Arabic, Hebrew, Hindi/Devanagari, Cyrillic, etc.
 * 2. Segments continuous unspaced CJK runs (Chinese/Japanese) into individual
 *    ideograph/kana tokens with exact [start, end] character offsets so an
 *    8-character CJK verbatim quote trips ECHO_NGRAMS = 8 without needing
 *    ASCII spaces.
 */
export function tokenizeAligned(text: string): AlignedToken[] {
  if (!text) return [];
  const out: AlignedToken[] = [];
  const wsRe = /\S+/g;
  let m: RegExpExecArray | null;
  let rawIdx = 0;

  while ((m = wsRe.exec(text)) !== null) {
    const rawChunk = m[0];
    const chunkStart = m.index;
    const currentRawIdx = rawIdx++;

    if (CJK_CHAR_RE.test(rawChunk)) {
      // Split mixed or pure CJK chunks into individual CJK character tokens + non-CJK word tokens
      let lastIdx = 0;
      CJK_RUN_RE.lastIndex = 0;
      let cjkMatch: RegExpExecArray | null;

      while ((cjkMatch = CJK_RUN_RE.exec(rawChunk)) !== null) {
        if (cjkMatch.index > lastIdx) {
          const preRaw = rawChunk.slice(lastIdx, cjkMatch.index);
          const preNorm = normalizeWordChunk(preRaw);
          if (preNorm) {
            out.push({
              norm: preNorm,
              raw: preRaw,
              rawIndex: currentRawIdx,
              start: chunkStart + lastIdx,
              end: chunkStart + cjkMatch.index,
            });
          }
        }
        const cjkRun = cjkMatch[0];
        let charOffset = cjkMatch.index;
        for (const ch of cjkRun) {
          const normCh = normalizeForConfinement(ch).toLowerCase();
          if (normCh) {
            out.push({
              norm: normCh,
              raw: ch,
              rawIndex: currentRawIdx,
              start: chunkStart + charOffset,
              end: chunkStart + charOffset + ch.length,
            });
          }
          charOffset += ch.length;
        }
        lastIdx = cjkMatch.index + cjkRun.length;
      }

      if (lastIdx < rawChunk.length) {
        const postRaw = rawChunk.slice(lastIdx);
        const postNorm = normalizeWordChunk(postRaw);
        if (postNorm) {
          out.push({
            norm: postNorm,
            raw: postRaw,
            rawIndex: currentRawIdx,
            start: chunkStart + lastIdx,
            end: chunkStart + rawChunk.length,
          });
        }
      }
    } else {
      const norm = normalizeWordChunk(rawChunk);
      if (norm) {
        out.push({
          norm,
          raw: rawChunk,
          rawIndex: currentRawIdx,
          start: chunkStart,
          end: chunkStart + rawChunk.length,
        });
      }
    }
  }
  return out;
}

function tokens(text: string): string[] {
  return tokenizeAligned(text).map((t) => t.norm);
}

/** Pre-indexed source structures (OPT-01) eliminating O(N*M) re-tokenization. */
export type IndexedSource = {
  raw: string;
  tokens: string[];
  tokenSet: Set<string>;
  ngrams8: Set<string>;
  ngrams6: Set<string>;
};

const SOURCE_INDEX_CACHE = new Map<string, IndexedSource>();
const MAX_SOURCE_CACHE = 2048;

/** Build precomputed index structure for a suspicious source string. */
export function indexSource(src: string): IndexedSource {
  const srcTokens = tokens(src);
  return {
    raw: src,
    tokens: srcTokens,
    tokenSet: new Set(srcTokens),
    ngrams8: ngrams(src, ECHO_NGRAMS),
    ngrams6: ngrams(src, 6),
  };
}

/** Retrieve cached indexed source or compute and cache it. */
export function getOrIndexSource(src: string): IndexedSource {
  let cached = SOURCE_INDEX_CACHE.get(src);
  if (!cached) {
    if (SOURCE_INDEX_CACHE.size >= MAX_SOURCE_CACHE) {
      const first = SOURCE_INDEX_CACHE.keys().next().value;
      if (first !== undefined) SOURCE_INDEX_CACHE.delete(first);
    }
    cached = indexSource(src);
    SOURCE_INDEX_CACHE.set(src, cached);
  }
  return cached;
}

/** Build the set of n-gram keys for a suspicious source. */
export function ngrams(text: string, n: number = ECHO_NGRAMS): Set<string> {
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
  /** The verbatim span (original casing & script) shared with a suspicious source. */
  span: string;
  /** Source index the echo came from. */
  source: number;
};

/**
 * Find verbatim echoes of suspicious sources in candidate content.
 * Uses exact [start, end] offsets from tokenizeAligned so standalone
 * punctuation and unspaced CJK text never shift the quoted span.
 * Supports pre-indexed sources (OPT-01) and cached index lookup.
 */
export function findEchoes(
  content: string,
  suspiciousSources: readonly (string | IndexedSource)[]
): EchoMatch[] {
  if (!content || suspiciousSources.length === 0) return [];
  const aligned = tokenizeAligned(content);
  if (aligned.length < ECHO_NGRAMS) return [];
  const contentTokens = aligned.map((t) => t.norm);

  const matches: EchoMatch[] = [];

  for (let s = 0; s < suspiciousSources.length; s++) {
    const item = suspiciousSources[s];
    if (!item) continue;
    const srcIndex: IndexedSource = typeof item === 'string' ? getOrIndexSource(item) : item;
    const srcSet = srcIndex.ngrams8;

    let found = false;
    if (srcSet.size > 0 && contentTokens.length >= ECHO_NGRAMS) {
      for (let i = 0; i + ECHO_NGRAMS <= contentTokens.length; i++) {
        const key = contentTokens.slice(i, i + ECHO_NGRAMS).join(' ');
        if (srcSet.has(key)) {
          const srcTokens = srcIndex.tokens;
          const srcIdx = indexOfSpan(srcTokens, contentTokens, i, ECHO_NGRAMS);
          let len = ECHO_NGRAMS;
          let start = i;
          if (srcIdx >= 0) {
            while (
              i + len < contentTokens.length &&
              srcIdx + len < srcTokens.length &&
              contentTokens[i + len] === srcTokens[srcIdx + len]
            ) {
              len++;
            }
            let back = 0;
            while (
              i - back - 1 >= 0 &&
              srcIdx - back - 1 >= 0 &&
              contentTokens[i - back - 1] === srcTokens[srcIdx - back - 1]
            ) {
              back++;
            }
            start = i - back;
            len += back;
          }

          const firstTok = aligned[start]!;
          const lastTok = aligned[start + len - 1]!;
          matches.push({
            span: content.slice(firstTok.start, lastTok.end),
            source: s,
          });
          found = true;
          break;
        }
      }
    }

    if (!found) {
      // Segmented streaming exfiltration detection (VULN-CONF-02):
      // When content contains a sub-threshold chunk (>= 6 tokens) PLUS additional
      // tokens from the same secret that together total >= ECHO_NGRAMS (8) tokens.
      const srcTokens = srcIndex.tokens;
      const srcTokenSet = srcIndex.tokenSet;
      const srcSet6 = srcIndex.ngrams6;
      if (srcSet6.size > 0 && contentTokens.length >= ECHO_NGRAMS) {
        let chunk6Start = -1;
        for (let i = 0; i + 6 <= contentTokens.length; i++) {
          const key = contentTokens.slice(i, i + 6).join(' ');
          if (srcSet6.has(key)) {
            chunk6Start = i;
            break;
          }
        }
        if (chunk6Start !== -1) {
          let totalSrcTokensInContent = 0;
          for (const ct of contentTokens) {
            if (srcTokenSet.has(ct)) totalSrcTokensInContent++;
          }
          if (totalSrcTokensInContent >= ECHO_NGRAMS) {
            const firstTok = aligned[chunk6Start]!;
            const lastTok = aligned[chunk6Start + 5]!;
            matches.push({
              span: content.slice(firstTok.start, lastTok.end),
              source: s,
            });
          }
        }
      }
    }
  }
  return matches;
}

/**
 * Linear span matcher (OPT-03):
 * Replaces hay.slice().join(' ') with direct index comparisons in O(1) space.
 */
function indexOfSpan(hay: string[], needle: string[], at: number, n: number): number {
  if (at + n > needle.length) return -1;
  const limit = hay.length - n;
  for (let i = 0; i <= limit; i++) {
    let match = true;
    for (let k = 0; k < n; k++) {
      if (hay[i + k] !== needle[at + k]) {
        match = false;
        break;
      }
    }
    if (match) return i;
  }
  return -1;
}

/** Predicate: content may NOT flow to a sink (verbatim echo detected). */
export function echoesSuspicious(
  content: string,
  suspiciousSources: readonly (string | IndexedSource)[]
): boolean {
  return findEchoes(content, suspiciousSources).length > 0;
}
