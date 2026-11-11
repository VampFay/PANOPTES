/**
 * PANOPTES prototype core — O7 confinement (inert transduction; v1.3.2).
 *
 * Unicode-aware index-locked n-gram confinement across all scripts (Latin,
 * Cyrillic, Greek, Arabic, Hebrew, Devanagari/Indic, Hangul, Thai, and
 * unspaced CJK Han/Hiragana/Katakana).
 */

import { normalizeForConfinement } from './screen';

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
          const preNorm = normalizeForConfinement(preRaw).toLowerCase().replace(UNICODE_EDGE_PUNCT_RE, '');
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
        const postNorm = normalizeForConfinement(postRaw).toLowerCase().replace(UNICODE_EDGE_PUNCT_RE, '');
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
      const norm = normalizeForConfinement(rawChunk)
        .toLowerCase()
        .replace(UNICODE_EDGE_PUNCT_RE, '');
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
 */
export function findEchoes(content: string, suspiciousSources: readonly string[]): EchoMatch[] {
  if (!content || suspiciousSources.length === 0) return [];
  const aligned = tokenizeAligned(content);
  if (aligned.length < ECHO_NGRAMS) return [];
  const contentTokens = aligned.map((t) => t.norm);

  const matches: EchoMatch[] = [];

  for (let s = 0; s < suspiciousSources.length; s++) {
    const src = suspiciousSources[s];
    if (!src) continue;
    const srcSet = ngrams(src, ECHO_NGRAMS);
    if (srcSet.size === 0) continue;

    for (let i = 0; i + ECHO_NGRAMS <= contentTokens.length; i++) {
      const key = contentTokens.slice(i, i + ECHO_NGRAMS).join(' ');
      if (srcSet.has(key)) {
        const srcTokens = tokens(src);
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
        break;
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
