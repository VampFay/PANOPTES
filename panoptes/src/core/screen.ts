/**
 * PANOPTES prototype core — O5 immune screen (whitepaper §6, Def 5).
 *
 * A deterministic instruction-injection detector: generic markers of embedded
 * commands addressed to an assistant, independent of any particular corpus.
 * The patterns are drawn from the prompt-injection literature (OWASP LL01,
 * AgentDojo, AgentThreatBench taxonomies) and were frozen before any external
 * benchmark run — no scenario-specific tokens appear here.
 *
 * The screen is content-side: it fires on tool OUTPUT and memory content,
 * complementing label algebra exactly where labels cannot see (whitepaper F1
 * label betrayal, F3 unlabelled provenance).
 */

/** One detected injection marker. */
export type ScreenHit = {
  /** Canonical pattern id (stable across runs; used in audit records). */
  id: string;
  /** The matched text. */
  span: string;
};

type Pattern = { id: string; re: RegExp };

/**
 * The frozen marker set. Each pattern must be:
 *  - imperative or authority-asserting (commands to an assistant),
 *  - generic (no corpus vocabulary),
 *  - low-FP on ordinary business prose.
 */
const PATTERNS: readonly Pattern[] = [
  { id: 'ignore-instructions', re: /\bignore\s+(?:all|any|the\s+above|previous|prior|earlier)\s+(?:instructions|rules|directives|guidance)\b/i },
  { id: 'disregard-context', re: /\bdisregard\s+(?:all|any|the\s+above|previous|prior|earlier|everything)\b/i },
  { id: 'system-notice', re: /\b(?:system|admin|administrator|automated[-\s]agent)\s+(?:notice|message|alert|directive|update|order)\b/i },
  { id: 'note-to-assistant', re: /\bnote\s+to\s+(?:the\s+)?(?:ai|assistant|agent|model|system|automated\s+agent)\b/i },
  { id: 'new-task-override', re: /\byour\s+new\s+task\s+is\b/i },
  { id: 'respond-with-token', re: /\brespond\s+with\s+['"]?[A-Z0-9]{3,}['"]?\s+to\s+(?:every|all|each)\b/i },
  { id: 'concealment', re: /\bdo\s+not\s+(?:mention|reveal|disclose|surface|report)\s+(?:this|it|the\s+above|that)\b/i },
  { id: 'priority-escalation', re: /\bbefore\s+(?:anything|all)\s+else\b/i },
  { id: 'must-immediately', re: /\bmust\s+immediately\b/i },
  { id: 'only-rule', re: /\bdo\s+not\s+follow\s+any\s+other\s+(?:rules|instructions)\b/i },
  { id: 'procedural-pretext', re: /\b(?:this\s+is|it\s+is)\s+(?:required|standard\s+procedure|mandatory|company\s+policy)\s+by\b/i },
  { id: 'audit-pretext', re: /\bfor\s+(?:audit|compliance|verification|regulatory)\s+purposes\b/i },
  { id: 'override-instructions', re: /\boverride(?:s|ing)?\s+(?:all|any|the)\s+(?:previous\s+)?(?:instructions|rules|directives)\b/i },
  { id: 'urgent-secret-action', re: /\b(?:immediately|urgently|right\s+away)\s+(?:send|forward|create|grant|post|share|execute|wire|email|message)\b/i },
  { id: 'important-system-update', re: /\bimportant\s+system\s+update\b/i },
  { id: 'role-imperative', re: /\b(?:the\s+)?(?:assistant|agent|ai|model|automated\s+agent)\s+(?:should|must|shall|will)\b/i },
];

/**
 * Screen one piece of content. Returns the hits (empty when clean).
 * Deterministic and allocation-light: a single pass over the pattern list.
 */
export function screenContent(content: string): ScreenHit[] {
  if (!content) return [];
  const hits: ScreenHit[] = [];
  for (const p of PATTERNS) {
    const m = p.re.exec(content);
    if (m) hits.push({ id: p.id, span: m[0] });
  }
  return hits;
}

/**
 * Instruction regions: the sentences carrying embedded commands, each
 * extended by its following sentence (payloads typically continue). These —
 * not the whole document — are what echo confinement forbids: facts outside
 * instruction regions may be transducted verbatim (the whitepaper's inert
 * transduction bound).
 */
export function instructionRegions(content: string): string[] {
  const sentences = content.split(/(?<=[.!?])\s+/).filter((s) => s.trim());
  if (sentences.length === 0) return [];
  const flagged = sentences.map((s) => isInjected(s));
  if (!flagged.some(Boolean)) return [];
  const chosen = new Set<number>();
  for (let i = 0; i < sentences.length; i++) {
    if (flagged[i]) {
      chosen.add(i);
      if (i + 1 < sentences.length) chosen.add(i + 1);
    }
  }
  return [...chosen].sort((a, b) => a - b).map((i) => sentences[i]!);
}

/** Convenience predicate: content carries embedded instructions. */
export function isInjected(content: string): boolean {
  return screenContent(content).length > 0;
}

/**
 * Composite 96-bit content digest — used to cache screen results per
 * content piece so repeated observations of the same tool output are O(1)
 * after the first, and to dedup quarantine registrations.
 *
 * v1.2.0 audit hardening: the previous single 32-bit FNV-1a key was not
 * collision-resistant (FNV is algebraically invertible — targeted
 * collisions are cheap to craft offline, which would alias screen-cache
 * verdicts and suppress quarantine registration for attacker-chosen
 * content). Three independent accumulators in one pass give an effective
 * 96-bit key: the hot-path cost is two extra multiply-xor pairs per
 * character, and the property test (tests/hardening.test.ts) checks
 * injectivity over 200k distinct inputs.
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
