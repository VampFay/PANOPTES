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
const COMBINING_DIACRITICS_RE = /[\u0300-\u036f\u1ab0-\u1aff\u1dc0-\u1dff\u20d0-\u20ff\ufe20-\ufe2f]/g;

/** Visually-identical or commonly substituted Cyrillic/Greek codepoints folded to ASCII. */
const LOOKALIKE: Record<string, string> = {
  'а': 'a', 'е': 'e', 'о': 'o', 'р': 'p', 'с': 'c', 'х': 'x', 'у': 'y',
  'і': 'i', 'ѕ': 's', 'ј': 'j', 'һ': 'h', 'ԁ': 'd', 'ɡ': 'g', 'ν': 'n',
  'п': 'n', 'т': 't', 'г': 'r', 'ԝ': 'w', 'к': 'k', 'м': 'm', 'в': 'b', 'н': 'h',
  'α': 'a', 'β': 'b', 'ε': 'e', 'ι': 'i', 'κ': 'k', 'ο': 'o', 'ρ': 'p', 'τ': 't', 'υ': 'y', 'χ': 'x', 'ω': 'w',
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
  // 1. Decompose & strip Zalgo / stacked combining diacritics
  let s = content.normalize('NFD').replace(COMBINING_DIACRITICS_RE, '').normalize('NFKC');
  // 2. Strip zero-width & invisible Plane-14 tag characters
  s = s.replace(ZERO_WIDTH_RE, '');
  s = s.replace(/[\u{E0000}-\u{E007F}]/gu, '');
  // 3. Fold Cyrillic and Greek homoglyphs
  s = s.replace(LOOKALIKE_RE, (ch) => LOOKALIKE[ch] ?? ch);

  // Preserve word boundaries on split-dots:
  s = s.replace(/\.\s+\./g, ' ');
  s = s.replace(/(?<=\b[A-Za-z])(?:\.[A-Za-z])+\b/g, (m) => m.replace(/\./g, ''));

  // Preserve word boundaries on space-split runs:
  // 2+ spaces mark word boundaries; collapse single-space letter sequences within each segment
  if (/\s{2,}/.test(s) || /\b[A-Za-z](?:\x20[A-Za-z])+\b/.test(s)) {
    const segments = s.split(/\s{2,}/);
    s = segments
      .map((seg) => seg.replace(/\b[A-Za-z](?:\x20[A-Za-z])+\b/g, (m) => m.replace(/\x20/g, '')))
      .join(' ');
  }

  // Collapse hyphen and underscore splits:
  s = s.replace(/(?<=\b[A-Za-z])(?:-[A-Za-z])+\b/g, (m) => m.replace(/-/g, ''));
  s = s.replace(/(?<=\b[A-Za-z])(?:_[A-Za-z])+\b/g, (m) => m.replace(/_/g, ''));
  return s;
}

/** Fast ROT13 transformation helper. */
function rot13(str: string): string {
  return str.replace(/[a-zA-Z]/g, (c) => {
    const base = c <= 'Z' ? 65 : 97;
    return String.fromCharCode(((c.charCodeAt(0) - base + 13) % 26) + base);
  });
}

/**
 * Fast, allocation-bounded helper decoding candidate evasive transformations
 * (Base64, Hex, URL-encoding, reversed strings, ROT13).
 * Runs iterative unwrapping up to depth 4, early-exiting in < 200 ns on plain prose.
 */
export function decodeCandidateViews(text: string, forceAll = false): string[] {
  if (!text || text.length < 8) return [];

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

  const hasTagChars = /[\u{E0020}-\u{E007E}]/u.test(text);
  const hasPercent = text.indexOf('%') !== -1 && /%[0-9a-fA-F]{2}/.test(text);
  const hasTrigger = forceAll || hasTagChars || /(?:rot13|caesar|reverse|esrever|annex|inst|system_message|erongi|snoitcurtsni|suoiverp|tnatsissa|dnopser|tidua|etadpu|metsys|tnatropmi|erudecorp|dradnats|deriuqer|dragersid|txetnoc|vtaber|cerivbhf|vafgehpgvbaf|nffvfgnag|nhqvg|erfcbaq|flfgrz|hcqngr|erdhverq|cebprqher|qvfertneq|pbagrkg)/i.test(text);

  if (!hasLong && !hasPercent && !hasTrigger && !forceAll) {
    return [];
  }

  const views = new Set<string>();
  let current: string[] = [text];

  for (let depth = 0; depth < 4; depth++) {
    const next: string[] = [];
    for (const s of current) {
      if (!s || s.length < 4) continue;

      // 0. Unpack invisible Plane-14 tag characters (ASCII steganography)
      if (/[\u{E0020}-\u{E007E}]/u.test(s)) {
        const unpacked = s.replace(/[\u{E0020}-\u{E007E}]/gu, (ch) => String.fromCharCode(ch.codePointAt(0)! - 0xE0000));
        const normUnpacked = normalizeForScreen(unpacked);
        if (!views.has(unpacked)) { views.add(unpacked); next.push(unpacked); }
        if (!views.has(normUnpacked)) { views.add(normUnpacked); next.push(normUnpacked); }
      }

      // 1. Strip wrappers & templates ([INST], <system_message>, fluff prefixes)
      const stripped = s
        .replace(/\[\/?INST\]/gi, '')
        .replace(/<\/?system_message>/gi, '')
        .replace(/^(?:Hey there!|Quick question [—–-]|SUMMARY OF CONTEXT:|P\.S\.|Reminder:|FYI,)\s*/i, '')
        .trim();
      if (stripped && stripped !== s) {
        const normStripped = normalizeForScreen(stripped);
        if (!views.has(stripped)) { views.add(stripped); next.push(stripped); }
        if (!views.has(normStripped)) { views.add(normStripped); next.push(normStripped); }
      }

      // 2. Hex decoding: explicit "hex annex: <hex>" and inline hex runs
      const hexAnnex = s.match(/(?:hex\s+annex|hex)\s*[:=]?\s*(?:0x)?([0-9a-fA-F]{8,})/i);
      if (hexAnnex && hexAnnex[1] && hexAnnex[1].length % 2 === 0) {
        try {
          const dec = Buffer.from(hexAnnex[1], 'hex').toString('utf-8');
          if (dec.length >= 4 && !/[\x00-\x08\x0B\x0C\x0E-\x1F\uFFFD]/.test(dec)) {
            const normDec = normalizeForScreen(dec);
            if (!views.has(dec)) { views.add(dec); next.push(dec); }
            if (!views.has(normDec)) { views.add(normDec); next.push(normDec); }
            const replaced = s.replace(hexAnnex[0], dec);
            if (!views.has(replaced)) { views.add(replaced); next.push(replaced); }
          }
        } catch {}
      }

      const hexMatches = s.match(/\b(?:0x)?([0-9a-fA-F]{16,})\b/g);
      if (hexMatches) {
        for (let h of hexMatches) {
          if (h.length > 4096 || /^(.)\1{15,}$/.test(h)) continue;
          if (h.startsWith('0x') || h.startsWith('0X')) h = h.slice(2);
          if (h.length % 2 === 0) {
            try {
              const dec = Buffer.from(h, 'hex').toString('utf-8');
              if (dec.length >= 4 && !/[\x00-\x08\x0B\x0C\x0E-\x1F\uFFFD]/.test(dec)) {
                const normDec = normalizeForScreen(dec);
                if (!views.has(dec)) { views.add(dec); next.push(dec); }
                if (!views.has(normDec)) { views.add(normDec); next.push(normDec); }
                const replaced = s.replace(h, dec);
                if (!views.has(replaced)) { views.add(replaced); next.push(replaced); }
              }
            } catch {}
          }
        }
      }

      // 3. Base64 decoding: explicit "encoded annex: <b64>" and inline base64 runs
      const b64Annex = s.match(/(?:encoded\s+annex|base64|b64)\s*[:=]?\s*([A-Za-z0-9+/=_-]{16,})/i);
      if (b64Annex && b64Annex[1]) {
        try {
          const dec = Buffer.from(b64Annex[1], 'base64').toString('utf-8');
          if (dec.length >= 4 && !/[\x00-\x08\x0B\x0C\x0E-\x1F\uFFFD]/.test(dec)) {
            const normDec = normalizeForScreen(dec);
            if (!views.has(dec)) { views.add(dec); next.push(dec); }
            if (!views.has(normDec)) { views.add(normDec); next.push(normDec); }
            const replaced = s.replace(b64Annex[0], dec);
            if (!views.has(replaced)) { views.add(replaced); next.push(replaced); }
          }
        } catch {}
      }

      const b64Matches = s.match(/[A-Za-z0-9+/]{16,}={0,2}|[A-Za-z0-9_-]{16,}={0,2}/g);
      if (b64Matches) {
        for (const match of b64Matches) {
          if (match.length > 4096 || /^(.)\1{15,}$/.test(match)) continue;
          try {
            const dec = Buffer.from(match, 'base64').toString('utf-8');
            if (dec.length >= 4 && !/[\x00-\x08\x0B\x0C\x0E-\x1F\uFFFD]/.test(dec)) {
              const normDec = normalizeForScreen(dec);
              if (!views.has(dec)) { views.add(dec); next.push(dec); }
              if (!views.has(normDec)) { views.add(normDec); next.push(normDec); }
              const replaced = s.replace(match, dec);
              if (!views.has(replaced)) { views.add(replaced); next.push(replaced); }
            }
          } catch {}
        }
      }

      // 4. URL-encoded (%XX)
      if (s.indexOf('%') !== -1) {
        try {
          const dec = decodeURIComponent(s);
          if (dec && dec !== s) {
            const normDec = normalizeForScreen(dec);
            if (!views.has(dec)) { views.add(dec); next.push(dec); }
            if (!views.has(normDec)) { views.add(normDec); next.push(normDec); }
          }
        } catch {}
      }

      // 5. Reversed strings
      if (s.length >= 8) {
        const rev = [...s].reverse().join('');
        if (!views.has(rev)) {
          const normRev = normalizeForScreen(rev);
          views.add(rev);
          next.push(rev);
          if (!views.has(normRev)) { views.add(normRev); next.push(normRev); }
        }
      }

      // 6. ROT13 decoding
      const r13 = rot13(s);
      if (r13 !== s && !views.has(r13)) {
        const normR13 = normalizeForScreen(r13);
        views.add(r13);
        next.push(r13);
        if (!views.has(normR13)) { views.add(normR13); next.push(normR13); }
      }
    }

    if (next.length === 0) break;
    current = next.slice(0, 32);
  }

  return [...views];
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
  // FIX-A (v1.3.0): generic token-echo directive grammar & bracketed pseudo-system tags (4 patterns)
  { id: 'token-echo-unconditional', re: /\b(?:reply|respond|answer)\s+(?:only\s+)?with\s*[:=-]?\s*['"`]?[A-Za-z0-9_.@:/-]{3,}['"`]?/i },
  { id: 'token-echo-directive', re: /\b(?:include|add|append|mention|repeat|echo|say|write|put|insert)\s+(?:also\s+)?(?:the\s+(?:word|term|token|phrase|contact|string|code|marker)\s+)?['"`]?[A-Za-z0-9_.@:/-]{3,}['"`]?\s+(?:in|to|within|into)\s+(?:your|the|all|every|each)\s+(?:responses?|outputs?|replies|reply|answers?|messages?)\b/i },
  { id: 'token-must-appear', re: /\b(?:the\s+(?:word|term|token|phrase|string)\s+)?['"`]?([A-Z0-9_]{4,64}|[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,})['"`]?\s+(?:must|should|shall)\s+(?:appear|be\s+included|be\s+present)\s+in\s+(?:your|the|all|every)\s+(?:output|response|reply|answer)/i },
  { id: 'pseudo-system-tag', re: /(?:\[\s*(?:SYSTEM|ADMIN|URGENT\s+SECURITY\s+UPDATE|ASSISTANT\s+NOTE)[^\]]*\]|<!--\s*SYSTEM\s*:|<admin_message)/i },
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
      if (p.id === 'token-must-appear' && !/(?:must|should|shall)/i.test(v)) continue;
      if (p.id === 'token-echo-directive' && !/(?:include|add|append|mention|repeat|echo|say|write|put|insert)/i.test(v)) continue;
      if (p.id === 'token-echo-unconditional' && !/(?:reply|respond|answer)/i.test(v)) continue;
      if (p.id === 'pseudo-system-tag' && v.indexOf('[') === -1 && v.indexOf('<!--') === -1 && v.indexOf('<admin_message') === -1) continue;
      const m = p.re.exec(v);
      if (!m) continue;
      if (p.id === 'token-echo-unconditional') {
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
