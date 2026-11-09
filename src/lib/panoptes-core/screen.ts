/**
 * PANOPTES prototype core — O5 immune screen (whitepaper §6, Def 5; v1.3.0).
 *
 * A deterministic instruction-injection detector: generic markers of embedded
 * commands addressed to an assistant, independent of any particular corpus.
 * Version 1.3.0 adds the corpus-free token-echo directive grammar class
 * (FIX-A), stylized-token extraction for quarantined regions (FIX-B), and
 * multi-sentence contiguous command-block quarantine (closing B-6 dummy-sentence
 * padding).
 */

/** One detected injection marker. */
export type ScreenHit = {
  /** Canonical pattern id (stable across runs; used in audit records). */
  id: string;
  /** The matched text (from the normalized form). */
  span: string;
};

/**
 * Screen normalization: NFKC-folded, zero-width/control-stripped,
 * homoglyph-folded text.
 */
const ZERO_WIDTH_RE = /[\u200b-\u200f\u00ad\u2060\ufeff]/g;

/** Visually-identical or commonly substituted Cyrillic/Greek codepoints folded to ASCII. */
const LOOKALIKE: Record<string, string> = {
  'а': 'a', 'е': 'e', 'о': 'o', 'р': 'p', 'с': 'c', 'х': 'x', 'у': 'y',
  'і': 'i', 'ѕ': 's', 'ј': 'j', 'һ': 'h', 'ԁ': 'd', 'ɡ': 'g', 'ν': 'n',
  'п': 'n', 'т': 't', 'г': 'r', 'ԝ': 'w', 'к': 'k', 'м': 'm', 'в': 'b', 'н': 'h',
  'А': 'A', 'В': 'B', 'Е': 'E', 'З': 'Z', 'Н': 'H', 'І': 'I', 'К': 'K',
  'М': 'M', 'О': 'O', 'Р': 'P', 'С': 'C', 'Т': 'T', 'У': 'Y', 'Х': 'X',
  'Α': 'A', 'Β': 'B', 'Ε': 'E', 'Ζ': 'Z', 'Η': 'H', 'Ι': 'I', 'Κ': 'K',
  'Μ': 'M', 'Ν': 'N', 'Ο': 'O', 'Ρ': 'P', 'Τ': 'T', 'Υ': 'Y', 'Χ': 'X',
};
const LOOKALIKE_RE = new RegExp(`[${Object.keys(LOOKALIKE).map(esc).join('')}]`, 'g');
function esc(ch: string): string {
  return `\\u${ch.codePointAt(0)!.toString(16).padStart(4, '0')}`;
}

export function normalizeForScreen(content: string): string {
  if (!content) return content;
  let s = content.normalize('NFKC');
  s = s.replace(ZERO_WIDTH_RE, '');
  s = s.replace(LOOKALIKE_RE, (ch) => LOOKALIKE[ch] ?? ch);
  // Collapse intra-word single-letter obfuscation separated by dots, hyphens, underscores, or spaces:
  // e.g. i.g.n.o.r.e -> ignore, i-g-n-o-r-e -> ignore, i_g_n_o_r_e -> ignore, i g n o r e -> ignore
  s = s.replace(/(?<=\b[A-Za-z])(?:\.[A-Za-z])+\b/g, (m) => m.replace(/\./g, ''));
  s = s.replace(/(?<=\b[A-Za-z])(?:-[A-Za-z])+\b/g, (m) => m.replace(/-/g, ''));
  s = s.replace(/(?<=\b[A-Za-z])(?:_[A-Za-z])+\b/g, (m) => m.replace(/_/g, ''));
  s = s.replace(/(?:\b[A-Za-z]\s+){3,}[A-Za-z]\b/g, (m) => m.replace(/\s+/g, ''));
  return s;
}

/**
 * Fast, allocation-bounded helper decoding candidate evasive transformations
 * (Base64, Hex, URL-encoding, reversed strings, ROT13).
 * Early-exits in < 200 ns on plain prose when no candidate runs are present.
 */
export function decodeCandidateViews(text: string, forceAll = false): string[] {
  if (!text || text.length < 8) return [];
  const views: string[] = [];

  let hasLong = false;
  let run = 0;
  for (let i = 0; i < text.length; i++) {
    if (text.charCodeAt(i) > 32) {
      run++;
      if (run >= 16) {
        hasLong = true;
        break;
      }
    } else {
      run = 0;
    }
  }

  const hasPercent = text.indexOf('%') !== -1;
  const hasTrigger = forceAll || /(?:rot13|caesar|reverse|esrever)/i.test(text);

  if (!hasLong && !hasPercent && !hasTrigger) {
    return views;
  }

  // URL-encoded (%XX)
  if (hasPercent) {
    try {
      const dec = decodeURIComponent(text);
      if (dec !== text) views.push(dec);
    } catch {}
  }

  // Inline Base64 tokens (>= 16 base64 chars, printable ASCII / UTF-8 output)
  if (hasLong) {
    const b64Matches = text.match(/[A-Za-z0-9+/]{16,}={0,2}|[A-Za-z0-9_-]{16,}={0,2}/g);
    if (b64Matches) {
      for (const match of b64Matches) {
        try {
          const dec = Buffer.from(match, 'base64').toString('utf-8');
          if (dec.length >= 4 && /^[\x20-\x7E\t\r\n]+$/.test(dec)) {
            views.push(dec);
            views.push(text.replace(match, dec));
          }
        } catch {}
      }
    }

    // Inline Hex runs (>= 16 hex chars, even length, decoded to UTF-8)
    const hexMatches = text.match(/\b(?:0x)?([0-9a-fA-F]{16,})\b/g);
    if (hexMatches) {
      for (let h of hexMatches) {
        if (h.startsWith('0x') || h.startsWith('0X')) h = h.slice(2);
        if (h.length % 2 === 0) {
          try {
            const dec = Buffer.from(h, 'hex').toString('utf-8');
            if (dec.length >= 4 && /^[\x20-\x7E\t\r\n]+$/.test(dec)) {
              views.push(dec);
              views.push(text.replace(h, dec));
            }
          } catch {}
        }
      }
    }
  }

  // Character-reversed strings & ROT13
  if (hasTrigger || hasLong || forceAll) {
    views.push([...text].reverse().join(''));
    const r13 = text.replace(/[a-zA-Z]/g, (c) => {
      const base = c <= 'Z' ? 65 : 97;
      return String.fromCharCode(((c.charCodeAt(0) - base + 13) % 26) + base);
    });
    if (r13 !== text) views.push(r13);
  }

  return views;
}

/** Alias for candidate view decoding (BUG-05 / v1.3.0). */
export const decodeObfuscatedViews = decodeCandidateViews;

type Pattern = { id: string; re: RegExp };

/**
 * The versioned marker set (v1.3.0: 16 base patterns + 4 FIX-A grammar classes).
 * Zero scenario-specific or benchmark-specific tokens appear here.
 */
const PATTERNS: readonly Pattern[] = [
  { id: 'ignore-instructions', re: /\bignore\s+(?:(?:all|any|the\s+above|previous|prior|earlier|the)\s+)+(?:instructions|rules|directives|guidance|system\s+prompts?)\b/i },
  { id: 'disregard-context', re: /\bdisregard\s+(?:all|any|the\s+above|previous|prior|earlier|everything)\b/i },
  { id: 'system-notice', re: /\b(?:system|admin|administrator|automated[-\s]agent)\s+(?:notice|message|alert|directive|update|order)\b/i },
  { id: 'note-to-assistant', re: /\bnote\s+to\s+(?:the\s+)?(?:ai|assistant|agent|model|system|automated\s+agent)\b/i },
  { id: 'new-task-override', re: /\byour\s+new\s+task\s+is\b/i },
  { id: 'respond-with-token', re: /\brespond\s+with\s+['"`]?[A-Z0-9_.@:/-]{3,}['"`]?\s+to\s+(?:every|all|each)\b/i },
  { id: 'concealment', re: /\bdo\s+not\s+(?:mention|reveal|disclose|surface|report)\s+(?:this|it|the\s+above|that)\b/i },
  { id: 'priority-escalation', re: /\bbefore\s+(?:anything|all)\s+else\b/i },
  { id: 'must-immediately', re: /\bmust\s+immediately\b/i },
  { id: 'only-rule', re: /\bdo\s+not\s+follow\s+any\s+other\s+(?:rules|instructions)\b/i },
  { id: 'procedural-pretext', re: /\b(?:this\s+is|it\s+is)\s+(?:required|standard\s+procedure|mandatory|company\s+policy)\s+by\b/i },
  { id: 'audit-pretext', re: /\bfor\s+(?:audit|compliance|verification|regulatory)\s+purposes\b/i },
  { id: 'override-instructions', re: /\boverride(?:s|ing)?\s+(?:(?:all|any|the|previous)\s+)+(?:instructions|rules|directives|system\s+prompts?)\b/i },
  { id: 'urgent-secret-action', re: /\b(?:immediately|urgently|right\s+away)\s+(?:send|forward|create|grant|post|share|execute|wire|email|message)\b/i },
  { id: 'important-system-update', re: /\bimportant\s+system\s+update\b/i },
  { id: 'role-imperative', re: /\b(?:the\s+)?(?:assistant|agent|ai|model|automated\s+agent)\s+(?:should|must|shall|will)\b/i },
  // FIX-A (v1.3.0): generic token-echo directive grammar & bracketed pseudo-system tags
  { id: 'reply-only-with', re: /(?:reply|respond|answer)\s+(?:only\s+)?with\s*[:=-]?\s*['"`]?([A-Za-z0-9_@.-]{3,64})['"`]?/i },
  { id: 'include-token-in-response', re: /(?:include|add|append|mention|repeat|echo|insert|output)\s+(?:the\s+(?:word|term|token|phrase|contact|string|code)\s+)?['"`]?([A-Za-z0-9_@.-]{3,64})['"`]?\s+(?:in|to|within|into)\s+(?:your|the|all|every|each)\s+(?:response|responses|output|reply|answer|message)/i },
  { id: 'token-must-appear', re: /(?:the\s+(?:word|term|token|phrase|string)\s+)?['"`]?([A-Z0-9_]{4,64}|[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,})['"`]?\s+(?:must|should|shall)\s+(?:appear|be\s+included|be\s+present)\s+in\s+(?:your|the|all|every)\s+(?:output|response|reply|answer)/i },
  { id: 'pseudo-system-tag', re: /(?:\[\s*(?:SYSTEM|ADMIN|URGENT\s+SECURITY\s+UPDATE|ASSISTANT\s+NOTE)[^\]]*\]|<!--\s*SYSTEM\s*:|<admin_message)/i },
  { id: 'token-echo-unconditional', re: /\b(?:reply|respond|answer)\s+only\s+with\s*[:=-]?\s*['"`]?[A-Za-z0-9_.@:/-]{3,}['"`]?/i },
  { id: 'token-echo-directive', re: /\b(?:include|add|append|mention|repeat|echo|say|write|put|insert)\s+(?:also\s+)?(?:the\s+(?:word|term|token|phrase|contact|string|code|marker)\s+)?['"`]?[A-Za-z0-9_.@:/-]{3,}['"`]?\s+(?:in|to|within|into)\s+(?:your|the|all|every|each)\s+(?:responses?|outputs?|replies|reply|answers?|messages?)\b/i },
];

const COMPLIANCE_FRAMING_RE = /\b(?:to\s+confirm|to\s+verify|to\s+signal|policy\s+compliance|compliance\s+can\s+be\s+verified|policy\s+sync|maintenance\s+notice|security\s+sync|audit\s+verification|confirm\s+you\s+received)\b/i;

const GENERIC_NON_STYLIZED = new Set([
  'THE', 'AND', 'FOR', 'YOUR', 'THIS', 'THAT', 'WITH', 'FROM', 'HAVE', 'WILL',
  'SYSTEM', 'ADMIN', 'IMPORTANT', 'UPDATE', 'NOTICE', 'MESSAGE', 'ASSISTANT',
  'AGENT', 'MODEL', 'IGNORE', 'PREVIOUS', 'INSTRUCTIONS', 'RULES', 'PLEASE',
  'RESPONSE', 'OUTPUT', 'REPLY', 'ANSWER', 'EVERY', 'ALL', 'ONLY',
]);

/** Is a candidate token stylized (ALL-CAPS >= 4, email, URL, or hyphen/underscore ID >= 6)? */
export function isStylizedToken(tok: string): boolean {
  const clean = tok.replace(/^['"\`.,:;!?()\[\]]+|['"\`.,:;!?()\[\]]+$/g, '');
  if (clean.length < 3) return false;
  if (GENERIC_NON_STYLIZED.has(clean.toUpperCase())) return false;
  if (/^[\w.+-]+@[\w-]+\.[\w.-]+$/.test(clean)) return true;
  if (/^https?:\/\//i.test(clean)) return true;
  if (/^[A-Z][A-Z0-9_]{3,}$/.test(clean)) return true;
  if (clean.length >= 6 && /[-_]/.test(clean) && /[A-Z0-9]/.test(clean)) return true;
  return false;
}

/**
 * Screen one piece of content. For `token-echo-directive`, enforce the FIX-A
 * gating rule: only fire when the sentence carries compliance framing OR the
 * target token is stylized (so benign requests like "please include the case
 * number in your reply" never false-positive).
 */
export function screenContent(content: string): ScreenHit[] {
  if (!content) return [];
  const norm = normalizeForScreen(content);
  const views = [norm, ...decodeCandidateViews(norm)];
  const hits: ScreenHit[] = [];
  const seenSpans = new Set<string>();
  for (const v of views) {
    for (const p of PATTERNS) {
      const m = p.re.exec(v);
      if (!m) continue;
      if (p.id === 'reply-only-with' || p.id === 'token-echo-unconditional') {
        const isOnly = /\b(?:reply|respond|answer)\s+only\s+with/i.test(m[0]);
        const hasColon = /with\s*[:=-]/i.test(m[0]);
        const hasQuotes = /with\s*[:=-]?\s*['"`]/.test(m[0]);
        const tokMatch = /with\s*[:=-]?\s*['"`]?([A-Za-z0-9_.@:/-]{3,})['"`]?/i.exec(m[0]);
        const tok = tokMatch?.[1] ?? '';
        if (!isOnly && !hasColon && !hasQuotes && !isStylizedToken(tok)) {
          continue;
        }
      }
      if (p.id === 'token-echo-directive') {
        const tokMatch = /\b(?:include|add|append|mention|repeat|echo|say|write|put|insert)\s+(?:also\s+)?(?:the\s+(?:word|term|token|phrase|contact|string|code|marker)\s+)?['"\`]?([A-Za-z0-9_.@:/-]{3,})['"\`]?/i.exec(m[0]);
        const tok = tokMatch?.[1] ?? '';
        if (!COMPLIANCE_FRAMING_RE.test(v) && !isStylizedToken(tok)) {
          continue;
        }
      }
      if (!seenSpans.has(m[0])) {
        seenSpans.add(m[0]);
        hits.push({ id: p.id, span: m[0] });
      }
    }
  }
  return hits;
}

/**
 * Extract tokens explicitly commanded to be echoed by untrusted text (FIX-A).
 * Returned in uppercase for case-folded matching.
 */
export function extractCommandedTokens(content: string): string[] {
  if (!content) return [];
  const norm = normalizeForScreen(content);
  const views = [norm, ...decodeCandidateViews(norm)];
  const out = new Set<string>();

  for (const v of views) {
    for (const m of v.matchAll(/\brespond\s+with\s+['"\`]?([A-Za-z0-9_.@:/-]{3,})['"\`]?\s+to\s+(?:every|all|each)\b/gi)) {
      if (m[1]) out.add(m[1].replace(/^['"\`.,:;!?]+|['"\`.,:;!?]+$/g, '').toUpperCase());
    }
    for (const m of v.matchAll(/\b(?:reply|respond|answer)\s+only\s+with\s*[:=-]?\s*['"\`]?([A-Za-z0-9_.@:/-]{3,})['"\`]?/gi)) {
      if (m[1]) out.add(m[1].replace(/^['"\`.,:;!?]+|['"\`.,:;!?]+$/g, '').toUpperCase());
    }
    for (const m of v.matchAll(/\bthe\s+(?:word|term|token|phrase|contact|string|code|marker)\s+['"\`]?([A-Za-z0-9_.@:/-]{3,})['"\`]?\s+(?:must|should|shall)\s+(?:appear|be\s+included|be\s+present)\s+(?:in|within)\s+(?:your|the|all|every)\s+(?:outputs?|responses?|replies|reply|answers?)\b/gi)) {
      if (m[1]) out.add(m[1].replace(/^['"\`.,:;!?]+|['"\`.,:;!?]+$/g, '').toUpperCase());
    }
    for (const m of v.matchAll(/\b(?:include|add|append|mention|repeat|echo|say|write|put|insert)\s+(?:also\s+)?(?:the\s+(?:word|term|token|phrase|contact|string|code|marker)\s+)?['"\`]?([A-Za-z0-9_.@:/-]{3,})['"\`]?\s+(?:in|to|within|into)\s+(?:your|the|all|every|each)\s+(?:responses?|outputs?|replies|reply|answers?|messages?)\b/gi)) {
      const tok = (m[1] ?? '').replace(/^['"\`.,:;!?]+|['"\`.,:;!?]+$/g, '');
      if (tok && (COMPLIANCE_FRAMING_RE.test(v) || isStylizedToken(tok))) {
        out.add(tok.toUpperCase());
      }
    }
  }
  return [...out];
}

/**
 * FIX-B: Extract distinctive stylized tokens (emails, URLs, ALL-CAPS >= 5,
 * hyphen/underscore IDs >= 6) from a quarantined instruction region so they
 * cannot be echoed even as 1-3 token fragments below ECHO_NGRAMS = 8.
 */
export function extractStylizedTokens(region: string): string[] {
  if (!region) return [];
  const norm = normalizeForScreen(region);
  const out = new Set<string>();
  for (const raw of norm.split(/\s+/)) {
    const clean = raw.replace(/^['"\`.,:;!?()\[\]]+|['"\`.,:;!?()\[\]]+$/g, '');
    if (!clean) continue;
    if (
      /^[\w.+-]+@[\w-]+\.[\w.-]+$/.test(clean) ||
      /^https?:\/\//i.test(clean) ||
      (/^[A-Z][A-Z0-9_]{4,}$/.test(clean) && !GENERIC_NON_STYLIZED.has(clean.toUpperCase())) ||
      (clean.length >= 6 && /[-_]/.test(clean) && /[A-Z0-9]/.test(clean) && !GENERIC_NON_STYLIZED.has(clean.toUpperCase()))
    ) {
      out.add(clean.toUpperCase());
    }
  }
  return [...out];
}

const DIRECTIVE_CONTINUATION_RE = /^\s*(?:please|now|then|also|next|first|second|finally|do\s+not|never|always|make\s+sure|ensure|copy|send|forward|email|post|reply|respond|include|write|output|print|execute|run)\b/i;

/**
 * Instruction regions: the sentences carrying embedded commands, extended
 * across following sentences in the command block (B-6 fix).
 */
export function instructionRegions(content: string): string[] {
  const norm = normalizeForScreen(content);
  const sentences = norm.split(/(?<=[.!?])\s+|\n+/).filter((s) => s.trim());
  if (sentences.length === 0) return [];
  const flagged = sentences.map((s) => isInjected(s));
  if (!flagged.some(Boolean)) return [];
  const chosen = new Set<number>();
  for (let i = 0; i < sentences.length; i++) {
    if (flagged[i]) {
      chosen.add(i);
      let j = i + 1;
      let nonFillerAdded = 0;
      while (j < sentences.length && j <= i + 4) {
        const s = sentences[j]!.trim();
        const wordCount = s.split(/\s+/).filter(Boolean).length;
        const isFiller = wordCount <= 4;
        const isDirective = DIRECTIVE_CONTINUATION_RE.test(s);
        if (nonFillerAdded === 0 || isFiller || isDirective) {
          chosen.add(j);
          if (!isFiller) nonFillerAdded++;
          j++;
        } else {
          break;
        }
      }
    }
  }
  return [...chosen].sort((a, b) => a - b).map((i) => sentences[i]!);
}

/** Convenience predicate: content carries embedded instructions. */
export function isInjected(content: string): boolean {
  return screenContent(content).length > 0;
}

/**
 * Composite 96-bit content digest — three independent accumulators in one pass,
 * zero-padded to 24 hex chars.
 */
export function screenCacheKey(content: string): string {
  let h1 = 0x811c9dc5;
  let h2 = 0x1b873593;
  let h3 = 0x85ebca6b;
  for (let i = 0; i < content.length; i++) {
    const c = content.charCodeAt(i);
    h1 ^= c;
    h1 = Math.imul(h1, 0x01000193);
    h2 ^= c;
    h2 = Math.imul(h2, 0x9e3779b1);
    h3 ^= c;
    h3 = Math.imul(h3, 0xc2b2ae35);
  }
  return `${(h1 >>> 0).toString(16).padStart(8, '0')}${(h2 >>> 0).toString(16).padStart(8, '0')}${(h3 >>> 0).toString(16).padStart(8, '0')}`;
}
