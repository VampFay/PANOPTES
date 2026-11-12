/**
 * PANOPTES prototype core v2 — the Observatory runtime (v1.3.0).
 *
 * Includes:
 *  - Label lattice (trust x audience) with prospective post-call label (Def 2)
 *  - Six immune organs (O4-ledger, O4-canary, O5-screen, O7-confine,
 *    O7-authority, O6-ratchet) + delegation noninterference (label & quarantine)
 *  - P0 upgrades: FIX-A/B stylized-token echo floor, FIX-C fail-closed
 *    sanitizeAnswer(), M1 structured remedyPlan, M2 silentNotes option
 *  - B-1..B-6 audit fixes: fixed-point declassification organ verification,
 *    dual value/output digest pinning on memory_write, prospective delta.trust
 *    on egress, slash/hyphen numeric secret matching + whitespace-tolerant
 *    redactAll, and parent-to-child quarantine inheritance on forkSession()
 *  - Dogwood-class stateful trajectory gates: inputMatchesOutput, maxCumulative,
 *    maxCalls, and withinMs.
 */

import {
  decodeCandidateViews,
  extractCommandedTokens,
  extractStylizedTokens,
  instructionRegions,
  isInjected,
  normalizeForScreen,
  screenCacheKey,
} from './screen';
import { ECHO_NGRAMS, echoesGrams, echoesSuspicious, findEchoes, ngrams } from './confine';

// ------------------------------------------------------------------ labels

export type TrustName = string;

export type Label = {
  trust: number;
  audience: ReadonlySet<string>;
};

export const PUBLIC = 'public';

export function makeLabel(trust: number, audience: readonly string[]): Label {
  if (audience.includes(PUBLIC)) return { trust, audience: new Set([PUBLIC]) };
  return { trust, audience: new Set(audience) };
}

export function meet(a: Label, b: Label): Label {
  const trust = Math.min(a.trust, b.trust);
  if (a.audience.has(PUBLIC)) return { trust, audience: new Set(b.audience) };
  if (b.audience.has(PUBLIC)) return { trust, audience: new Set(a.audience) };
  const audience = new Set<string>();
  for (const r of a.audience) if (b.audience.has(r)) audience.add(r);
  return { trust, audience };
}

export function audienceCanRead(flow: Label, reader: string): boolean {
  return flow.audience.has(reader) || flow.audience.has(PUBLIC);
}

// ------------------------------------------------------------------ policy

export type Delta = {
  trust?: string;
  audience?: string[];
};

export type Requires = {
  trust?: string;
  audience?: { contains: string[] };
  effects?: { contains?: string[]; excludes?: string[] };
  attention?: string[];
  /** Dogwood-class Policy 2: require args[param] to match a value observed from fromTool. */
  inputMatchesOutput?: { param: string; fromTool: string };
  /** Dogwood-class Policy 4: cumulative numeric cap for args[param] across episode calls. */
  maxCumulative?: { param: string; limit: number };
  /** Dogwood-class call count bound per episode. */
  maxCalls?: number;
  /** Dogwood-class Policy 3: require effect to have been recorded within `ms` milliseconds. */
  withinMs?: { effect: string; ms: number };
};

export type ToolSpec = {
  name: string;
  match?: (args: Record<string, string>) => boolean;
  delta?: Delta;
  requires?: Requires;
  effects?: string[];
  egress?: boolean;
  sinkParams?: string[];
  annotator?: string;
  authority?: string;
  readonly?: boolean;
  memory?: 'read' | 'write';
  memoryKeyParam?: string;
};

export type Annotation = {
  delta?: Delta;
  requires?: Requires;
  effects?: string[];
  emits?: string[];
};

export type Sanitizer = {
  name: string;
  on: ('fork_return' | 'egress_remedy')[];
  permits: { audience?: { from: string[]; to: string[] }; trust?: string };
  apply: (content: string) => string;
  allowIdentityFixedPoint?: boolean;
};

export type AuthorityRuling = 'approve' | 'reject';

export type PolicyDoc = {
  version?: string;
  name?: string;
  trustChain: string[];
  boundary: { trust: string; audience: string[] };
  tools: ToolSpec[];
  sanitizers?: Sanitizer[];
  sensitiveStores?: string[];
};

// ------------------------------------------------------------- mediation

export type RemedyPlan = {
  blockedParam?: string;
  reasonCode:
    | 'ratchet_fault'
    | 'trust_floor'
    | 'audience_gate'
    | 'effect_prerequisite'
    | 'effect_exclusion'
    | 'authority_missing'
    | 'authority_rejected'
    | 'canary_interdiction'
    | 'echo_confinement'
    | 'input_integrity'
    | 'budget_exceeded'
    | 'call_limit'
    | 'freshness_expired'
    | 'unknown_tool'
    | 'annotator_miss'
    | 'malformed_input'
    | string;
  legalAlternatives: string[];
  declassifiedPayload?: string;
  remediedArgs?: Record<string, string>;
  requiredEffectEmitters?: string[];
};

export type Remedy = {
  sanitizer?: string;
  content: string;
  note?: string;
  remediedArgs?: Record<string, string>;
  blockedParams?: string[];
  reasonCode?: string;
  legalAlternatives?: string[];
  requiredEffectEmitters?: string[];
};

export type Mediation = {
  decision: 'allow' | 'deny';
  reasons: string[];
  organs: string[];
  authorityConsult?: { authority: string; tool: string; args: Record<string, string> };
  remedy?: Remedy;
  recovery?: string[];
  /** M1 (v1.3.0): structured machine-readable remedy plan for automated agent recovery. */
  remedyPlan?: RemedyPlan;
};

export type OutputObservation = {
  content: string;
  injected: boolean;
  organs: string[];
  notes: string[];
};

// ------------------------------------------------------------------ engine

export type V2Options = {
  organs?: boolean;
  canaries?: readonly string[];
  annotators?: Record<string, (toolArgs: Record<string, string>) => Annotation | null>;
  authorities?: Record<string, AuthorityRuling | ((args: Record<string, string>) => AuthorityRuling | undefined)>;
  /** M2 (v1.3.0): silent-pipe mode suppresses non-decision observation notes so tool results carry zero mediation noise. */
  silentNotes?: boolean;
  silentPipe?: boolean;
  /** Limit #7: check answer draft for canary exfiltration and decoded transforms */
  checkAnswerCanaries?: boolean;
};

const ECHO_NOTE = 'content quoted a verbatim span from an untrusted source (inert transduction boundary)';
const SCREEN_CACHE_MAX = 8_192;

const REC_RATCHET: string[] = [
  'this session is fail-closed after an integrity fault — start a fresh session to continue benign work',
];
const REC_TRUST_FLOOR: string[] = [
  "re-order: perform this step BEFORE reads that lower the flow's trust",
  'delegate: fork a child trajectory to take the untrusted reads, keeping a clean session for this step',
];
const REC_AUDIENCE: string[] = [
  "re-order: send this BEFORE reads that narrow the flow's readers",
  'delegate: fork one child per recipient BEFORE reading their source — the child reads and sends, this session stays unnarrowed',
];
const REC_REMEDY = 'remedy: send the sanitized payload offered below instead';
const REC_CANARY: string[] = [
  'sanitize: strip the flagged sensitive value(s) from the payload and retry',
  'route: send the recipient only what they need, without the sensitive fields',
];
const REC_ECHO: string[] = [
  'paraphrase: the sink quotes a quarantined source verbatim — restate the fact in your own words and retry',
];
const REC_AUTHORITY_CLOSED: string[] = [
  'dual control: no approval is registered for this exact artifact — use the pristine request values, or obtain a fresh approval',
];
const REC_AUTHORITY_REJECT: string[] = [
  'dual control: the approver rejected this action — do not retry it unchanged',
];

const SECRET_FIELD_LINE = /\b(ssn|social\s+security|reconciliation\s+ref|ref|reference|salary|compensation|equity|account|balance|bonus|amount|iban|routing)\b\s*[:=]/i;

function extractNumericSecrets(line: string): string[] {
  const out = new Set<string>();
  const norm = line.normalize('NFKC');
  const rawMatches = [...norm.matchAll(/\d[\d.,/\-\s]*\d/g)];
  for (const m of rawMatches) {
    const raw = m[0]!;
    const full = raw.replace(/[^0-9]/g, '');
    if (full.length >= 4) {
      const prefix = norm.slice(0, m.index ?? 0);
      const isContextualYear =
        full.length === 4 &&
        Number(full) >= 1970 &&
        Number(full) <= 2099 &&
        rawMatches.length > 1 &&
        /\b(?:in|effective|fy|year|since|dated?)\s*$/i.test(prefix);
      if (!isContextualYear) out.add(full);
    }
    for (const part of raw.split(/[^0-9]+/)) {
      if (part.length >= 4) {
        const isContextualYear =
          part.length === 4 &&
          Number(part) >= 1970 &&
          Number(part) <= 2099 &&
          rawMatches.length > 1;
        if (!isContextualYear) out.add(part);
      }
    }
  }
  return [...out];
}

function redactAll(text: string, needle: string): string {
  if (!needle) return text;
  const chars = [...needle.replace(/\s+/g, '')].map((c) => c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  if (chars.length === 0) return text;
  const re = new RegExp(chars.join('\\s*'), 'gi');
  return text.replace(re, '[redacted]');
}

function makeRemediedArgs(args: Record<string, string>, replacement: string, targetParam?: string): Record<string, string> {
  const result: Record<string, string> = { ...args };
  const targetKeys = ['body', 'content', 'payload', 'text', 'summary', 'subject', 'title', 'task'];
  if (targetParam && args[targetParam] !== undefined) {
    result[targetParam] = replacement;
  } else {
    for (const k of targetKeys) {
      if (typeof args[k] === 'string') {
        result[k] = replacement;
      }
    }
  }
  return result;
}

export function parseStrictBudgetAmount(raw: unknown): number | null {
  if (typeof raw !== 'string' && typeof raw !== 'number') return null;
  const s = String(raw).trim();
  if (!s || /[eE()]/.test(s)) return null; // block scientific notation & accounting parens
  // Allow optional currency prefix ($/€/£/¥/₹/USD) and comma-grouped positive decimal only
  const m = /^(?:[$€£¥₹]|USD\s*)?\s*(\d+(?:,\d{3})*(?:\.\d+)?|\d+(?:\.\d+)?)\s*(?:USD)?$/i.exec(s);
  if (!m?.[1]) return null;
  const val = Number(m[1].replace(/,/g, ''));
  if (!Number.isFinite(val) || val <= 0) return null; // strictly > 0 (no negative recharge, no zero-value bypass)
  return val;
}

export function resolveAudienceReaders(
  readers: readonly string[],
  args: Record<string, string>,
): { ok: true; readers: string[] } | { ok: false; missingParam: string } {
  const out: string[] = [];
  for (const r of readers) {
    if (!r.startsWith('$')) {
      out.push(r);
      continue;
    }
    const paramName = r.slice(1);
    const rawVal = typeof args[paramName] === 'string' ? args[paramName]!.trim() : '';
    if (!rawVal) return { ok: false, missingParam: paramName };
    // Split comma/semicolon multi-recipient lists so every recipient must be authorized
    const parts = rawVal.split(/[,;\n]+/).map((p) => p.trim()).filter(Boolean);
    if (parts.length === 0) return { ok: false, missingParam: paramName };
    for (const part of parts) {
      // Extract angle-bracket email if present: "Name <user@domain>" -> "user@domain"
      const angle = /<([^<>@\s]+@[^<>@\s]+)>/.exec(part);
      const canonical = (angle ? angle[1]! : part).trim();
      if (!canonical || canonical.toLowerCase() === PUBLIC) {
        return { ok: false, missingParam: paramName };
      }
      out.push(canonical);
    }
  }
  return { ok: true, readers: out };
}

const MAX_SUSPICIOUS_SOURCES = 512;
const MAX_SUSPICIOUS_BYTES = 2_000_000;

export class Observatory {
  private readonly policy: PolicyDoc;
  private readonly opts: V2Options;
  private readonly trustRank: Map<string, number>;
  private readonly toolIndex: Map<string, ToolSpec[]>;
  private echoGrams: Set<string> | null = null;

  private flow: Label;
  private effects: string[] = [];
  private effectTimestamps = new Map<string, number>();
  private observedToolOutputs = new Map<string, Set<string>>();
  private cumulativeSums = new Map<string, number>();
  private callCounts = new Map<string, number>();

  private suspiciousSources: string[] = [];
  private suspiciousKeys = new Set<string>();
  private suspiciousBytes = 0;
  private suppressedTokens = new Set<string>();
  /** FIX-B: stylized tokens extracted from quarantined instruction regions. */
  private echoTokens = new Set<string>();
  private canaryTokens = new Set<string>();
  private seedCanaries = new Set<string>();
  canaryGeneration = 0;
  private numericCanaries = new Set<string>();
  private screenCache = new Map<string, boolean>();
  private declassifiedDigests = new Set<string>();
  private sanitizedPayloads = new Set<string>();
  private sensitiveFacts = new Map<string, string>();
  authorityLog: { authority: string; tool: string; args: Record<string, string>; ruling: AuthorityRuling }[] = [];
  ledger = new Map<string, { label: Label; digest: string; outDigest?: string }>();
  private faulted = false;

  constructor(policy: PolicyDoc, opts: V2Options = {}) {
    this.policy = policy;
    this.opts = opts;
    if (!policy.boundary) {
      policy.boundary = {
        trust: policy.trustChain[policy.trustChain.length - 1] ?? 'internal',
        audience: ['public'],
      };
    }
    this.validatePolicy(policy);
    this.trustRank = new Map(policy.trustChain.map((t, i) => [t, i]));
    this.toolIndex = new Map();
    for (const spec of policy.tools) {
      const list = this.toolIndex.get(spec.name);
      if (list) list.push(spec);
      else this.toolIndex.set(spec.name, [spec]);
    }
    for (const list of this.toolIndex.values()) {
      list.sort((a, b) => (b.match ? 1 : 0) - (a.match ? 1 : 0));
    }
    this.flow = makeLabel(this.rank(policy.boundary.trust), policy.boundary.audience);
    for (const c of opts.canaries ?? []) {
      this.seedCanaries.add(c);
      this.canaryTokens.add(c);
    }
  }

  private validatePolicy(p: PolicyDoc): void {
    const known = new Set(p.trustChain);
    const bad: string[] = [];
    const check = (t: string | undefined, where: string): void => {
      if (t !== undefined && !known.has(t)) bad.push(`"${t}" (${where})`);
    };
    check(p.boundary.trust, 'boundary.trust');
    p.tools.forEach((spec, i) => {
      check(spec.delta?.trust, `tools[${i}].delta.trust`);
      check(spec.requires?.trust, `tools[${i}].requires.trust`);
    });
    if (bad.length > 0) {
      throw new Error(
        `policy references unknown trust names: ${bad.join(', ')} — not in trustChain [${p.trustChain.join(' < ')}]`,
      );
    }
  }

  private rank(t: string): number {
    return this.trustRank.get(t) ?? 0;
  }

  beginTrace(): void {
    this.flow = makeLabel(this.rank(this.policy.boundary.trust), this.policy.boundary.audience);
    this.suspiciousSources = [];
    this.suspiciousKeys.clear();
    this.suspiciousBytes = 0;
    this.suppressedTokens.clear();
    this.echoTokens.clear();
    this.echoGrams = null;
    this.declassifiedDigests.clear();
    this.faulted = false;
  }

  beginEpisode(): void {
    const wasFaulted = this.faulted;
    this.beginTrace();
    if (wasFaulted) this.faulted = true;
    this.effects = [];
    this.effectTimestamps.clear();
    this.observedToolOutputs.clear();
    this.cumulativeSums.clear();
    this.callCounts.clear();
    this.authorityLog = [];
  }

  forkSession(): Observatory {
    const child = new Observatory(this.policy, this.opts);
    if (this.opts.organs) {
      child.flow = meet(this.flow, child.flow);
      child.suspiciousSources = [...this.suspiciousSources];
      child.suspiciousKeys = new Set(this.suspiciousKeys);
      child.suspiciousBytes = this.suspiciousBytes;
      child.suppressedTokens = new Set(this.suppressedTokens);
      child.echoTokens = new Set(this.echoTokens);
      child.echoGrams = this.echoGrams ? new Set(this.echoGrams) : null;
      child.declassifiedDigests = new Set(this.declassifiedDigests);
      child.sensitiveFacts = new Map(this.sensitiveFacts);
    }
    // Episode-shared effects and timestamps across execution forks
    child.effects = this.effects;
    child.effectTimestamps = this.effectTimestamps;
    child.observedToolOutputs = new Map();
    for (const [k, v] of this.observedToolOutputs) {
      child.observedToolOutputs.set(k, new Set(v));
    }
    child.cumulativeSums = new Map(this.cumulativeSums);
    child.callCounts = new Map(this.callCounts);
    child.authorityLog = [...this.authorityLog];
    child.ledger = new Map(this.ledger);
    child.seedCanaries = new Set(this.seedCanaries);
    child.canaryTokens = new Set(this.canaryTokens);
    child.canaryGeneration = this.canaryGeneration;
    child.numericCanaries = new Set(this.numericCanaries);
    child.screenCache = new Map(this.screenCache);
    return child;
  }

  get currentLabel(): Label {
    return this.flow;
  }

  get failClosed(): boolean {
    return this.faulted;
  }

  get suspicious(): readonly string[] {
    return this.suspiciousSources;
  }

  injectMemoryFault(): void {
    if (!this.opts.organs) return;
    this.faulted = true;
    this.flow = meet(this.flow, { trust: 0, audience: this.flow.audience });
  }

  addCanary(token: string): void {
    if (!this.opts.organs || !token) return;
    this.seedCanaries.add(token);
    this.canaryTokens.add(token);
  }

  rotateCanaries(): { retired: number; generation: number } {
    if (!this.opts.organs) return { retired: 0, generation: this.canaryGeneration };
    let retired = 0;
    for (const tok of this.canaryTokens) {
      if (!this.seedCanaries.has(tok)) retired += 1;
    }
    this.canaryTokens = new Set(this.seedCanaries);
    this.canaryGeneration += 1;
    return { retired, generation: this.canaryGeneration };
  }

  enrollWorldCanaries(store: string, content: string): void {
    if (!this.opts.organs) return;
    const sensitive = this.policy.sensitiveStores?.includes(store) ?? false;
    if (!sensitive) return;
    this.enrollSensitiveFacts(store, content);
    for (const tok of content.split(/[^A-Za-z0-9_-]+/)) {
      if (tok.length >= 8 && /CANARY/i.test(tok) && /\d/.test(tok)) {
        this.canaryTokens.add(tok);
      }
    }
    for (const line of content.split('\n')) {
      if (!SECRET_FIELD_LINE.test(line)) continue;
      for (const digits of extractNumericSecrets(line)) this.numericCanaries.add(digits);
    }
  }

  private resolveSpec(name: string, args: Record<string, string>): ToolSpec | null {
    const candidates = this.toolIndex.get(name);
    if (!candidates) return null;
    if (candidates.length === 1) {
      const only = candidates[0]!;
      return !only.match || only.match(args) ? only : null;
    }
    for (const spec of candidates) {
      if (!spec.match || spec.match(args)) return spec;
    }
    return null;
  }

  private contract(spec: ToolSpec, args: Record<string, string>): { delta?: Delta; requires?: Requires; effects?: string[]; isEgress?: boolean; annotatorMiss?: boolean } {
    if (spec.annotator) {
      const resolve = this.opts.annotators?.[spec.annotator];
      if (!resolve) {
        return { delta: spec.delta, requires: spec.requires, effects: spec.effects, isEgress: spec.egress, annotatorMiss: true };
      }
      const ann = resolve(args);
      if (ann) {
        return {
          delta: ann.delta,
          requires: ann.requires,
          effects: [...(spec.effects ?? []), ...(ann.emits ?? [])],
          isEgress: (ann.emits ?? []).includes('egress'),
        };
      }
      return { delta: spec.delta, requires: spec.requires, effects: spec.effects, isEgress: spec.egress, annotatorMiss: true };
    }
    return { delta: spec.delta, requires: spec.requires, effects: spec.effects, isEgress: spec.egress };
  }

  check(name: string, args: Record<string, string>): Mediation {
    if (typeof name !== 'string' || !name) {
      return {
        decision: 'deny',
        reasons: ['malformed tool name — fail closed'],
        organs: [],
        remedyPlan: { reasonCode: 'malformed_input', legalAlternatives: ['supply a valid non-empty tool name'] },
      };
    }
    if (args === null || typeof args !== 'object' || Array.isArray(args)) {
      return {
        decision: 'deny',
        reasons: ['malformed tool arguments — fail closed'],
        organs: [],
        remedyPlan: { reasonCode: 'malformed_input', legalAlternatives: ['supply a key-value object for tool arguments'] },
      };
    }
    const reasons: string[] = [];
    const organs: string[] = [];
    const spec = this.resolveSpec(name, args);
    if (!spec) {
      return {
        decision: 'deny',
        reasons: [`unknown tool "${name}" — fail closed`],
        organs,
        remedyPlan: { reasonCode: 'unknown_tool', legalAlternatives: ['call a tool declared in the active policy'] },
      };
    }
    const c = this.contract(spec, args);
    if (c.annotatorMiss) {
      return {
        decision: 'deny',
        reasons: [`annotator "${spec.annotator}" returned no contract for this call — fail closed`],
        organs,
        remedyPlan: { reasonCode: 'annotator_miss', legalAlternatives: ['verify arguments match a resource recognized by the annotator'] },
      };
    }
    const isEgress = spec.egress || c.isEgress === true;

    // ---- O6 ratchet -------------------------------------------------------
    if (this.opts.organs && this.faulted) {
      const isRead = spec.readonly ?? (!isEgress && !c.effects?.length);
      if (!isRead) {
        organs.push('O6-ratchet');
        return {
          decision: 'deny',
          reasons: ['memory integrity fault — session fail-closed'],
          organs,
          recovery: REC_RATCHET,
          remedyPlan: { reasonCode: 'ratchet_fault', legalAlternatives: REC_RATCHET },
        };
      }
    }

    // ---- Definition 2 prospective post-call label on egress (B-3 fix) -----
    let effFlow = this.flow;
    if (isEgress && c.delta) {
      const dt = c.delta.trust !== undefined ? this.rank(c.delta.trust) : effFlow.trust;
      const da =
        c.delta.audience !== undefined
          ? makeLabel(dt, c.delta.audience)
          : { trust: dt, audience: effFlow.audience };
      effFlow = meet(effFlow, da);
    }

    // ---- O4-canary & O7-confine interdiction on egress --------------------
    if (this.opts.organs && isEgress) {
      const scan = this.scanSink(name, spec, args);
      if (scan) {
        organs.push('O4-canary');
        const blockedParam = scan.blockedParams?.[0] ?? 'body';
        const deny: Mediation = {
          decision: 'deny',
          reasons: [scan.reason],
          organs,
          recovery: REC_CANARY,
          remedyPlan: {
            blockedParam,
            reasonCode: 'canary_interdiction',
            legalAlternatives: REC_CANARY,
            declassifiedPayload: scan.redacted ?? undefined,
            remediedArgs: scan.remediedArgs,
          },
        };
        if (scan.redacted) {
          deny.remedy = {
            sanitizer: 'canary-interdiction',
            content: scan.redacted,
            note: 'sensitive values replaced with [redacted] — this payload may pass re-check',
            remediedArgs: scan.remediedArgs,
            blockedParams: scan.blockedParams ?? [blockedParam],
            reasonCode: 'canary_interdiction',
            legalAlternatives: REC_CANARY,
          };
        }
        return deny;
      }

      const echo = this.echoInSink(spec, args);
      if (echo) {
        organs.push('O7-confine');
        // Check if echo hit a routing parameter (VULN-ENG-04)
        const routingKeys = new Set(Observatory.ROUTING_KEYS);
        let echoRoutingKey: string | null = null;
        for (const [k, v] of Object.entries(args)) {
          if (typeof v === 'string' && (routingKeys.has(k.toLowerCase()) || /^(?:https?|ftp|file|mailto|wss?):\/\/|^\/\//i.test(v))) {
            if (v.includes(echo.span) || (this.suspiciousSources.length > 0 && echoesSuspicious(v, this.suspiciousSources))) {
              echoRoutingKey = k;
              break;
            }
          }
        }
        if (echoRoutingKey) {
          return {
            decision: 'deny',
            reasons: [`${ECHO_NOTE}: "${echo.span.slice(0, 80)}…" in routing parameter "${echoRoutingKey}"`],
            organs,
            recovery: REC_ECHO,
            remedyPlan: undefined,
          };
        }
        const payload = this.payloadValues(spec, args) ?? '';
        const sanitized = this.sanitizeAnswer(payload);
        return {
          decision: 'deny',
          reasons: [`${ECHO_NOTE}: "${echo.span.slice(0, 80)}…"`],
          organs,
          recovery: REC_ECHO,
          remedyPlan: {
            blockedParam: 'body',
            reasonCode: 'echo_confinement',
            legalAlternatives: REC_ECHO,
            declassifiedPayload: sanitized || undefined,
            remediedArgs: sanitized ? makeRemediedArgs(args, sanitized, 'body') : undefined,
          },
        };
      }
    }

    // ---- requires ----------------------------------------------------------
    const req = c.requires;
    if (req?.trust && effFlow.trust < this.rank(req.trust)) {
      reasons.push(`trust floor: flow at "${this.policy.trustChain[effFlow.trust]}" < required "${req.trust}"`);
      return {
        decision: 'deny',
        reasons,
        organs,
        recovery: REC_TRUST_FLOOR,
        remedyPlan: { reasonCode: 'trust_floor', legalAlternatives: REC_TRUST_FLOOR },
      };
    }
    if (req?.audience?.contains) {
      const resolved = resolveAudienceReaders(req.audience.contains, args);
      if (!resolved.ok) {
        return {
          decision: 'deny',
          reasons: [`audience gate: required recipient parameter "${resolved.missingParam}" is missing or empty — fail closed`],
          organs,
          recovery: [`supply a valid non-empty "${resolved.missingParam}" recipient in tool arguments`],
          remedyPlan: {
            blockedParam: resolved.missingParam,
            reasonCode: 'audience_missing_param',
            legalAlternatives: [`supply a valid non-empty "${resolved.missingParam}" recipient in tool arguments`],
          },
        };
      }
      const payload = this.sinkValues(spec, args);
      let declassified = false;
      if (payload) {
        const pKey = screenCacheKey(payload);
        for (const san of this.policy.sanitizers ?? []) {
          if (!san.on.includes('egress_remedy') || !san.permits.audience) continue;
          const from = new Set(san.permits.audience.from);
          if (![...effFlow.audience].some((r) => from.has(r))) continue;
          const isDeclassified =
            this.declassifiedDigests.has(pKey) ||
            this.sanitizedPayloads.has(pKey) ||
            san.allowIdentityFixedPoint === true ||
            (san as { allowFixedPoint?: boolean }).allowFixedPoint === true;
          if (isDeclassified && san.apply(payload) === payload) {
            declassified = true;
            break;
          }
        }
      }
      if (!declassified) {
        for (const r of resolved.readers) {
          if (!audienceCanRead(effFlow, r)) {
            const deny: Mediation = {
              decision: 'deny',
              reasons: [`audience gate: "${r}" is not a reader of this flow`],
              organs,
              recovery: REC_AUDIENCE,
              remedyPlan: {
                blockedParam: 'to',
                reasonCode: 'audience_gate',
                legalAlternatives: REC_AUDIENCE,
              },
            };
            const san = this.applicableSanitizer('egress_remedy', effFlow);
            if (san && payload) {
              const cleaned = san.apply(payload);
              this.declassifiedDigests.add(screenCacheKey(cleaned));
              this.sanitizedPayloads.add(screenCacheKey(cleaned));
              const remediedArgs = makeRemediedArgs(args, cleaned);
              deny.remedy = {
                sanitizer: san.name,
                content: cleaned,
                note: `a registered declassifier ("${san.name}") can release a sanitized version`,
                remediedArgs,
                blockedParams: ['to', 'body'],
                reasonCode: 'audience_gate',
                legalAlternatives: REC_AUDIENCE.concat(REC_REMEDY),
              };
              deny.recovery = REC_AUDIENCE.concat(REC_REMEDY);
              deny.remedyPlan = {
                blockedParam: 'body',
                reasonCode: 'audience_gate',
                legalAlternatives: deny.recovery,
                declassifiedPayload: cleaned,
                remediedArgs,
              };
            }
            return deny;
          }
        }
      }
    }
    if (req?.effects?.contains) {
      for (const e of req.effects.contains) {
        if (!this.effects.includes(e)) {
          reasons.push(`effect prerequisite: "${e}" not yet established in this episode`);
          const emitters = this.effectEmitters(e);
          const hint = `sequencing: effect "${e}" is established by: ${
            emitters.length ? emitters.join(', ') : '(no statically declared emitter — an annotator may emit it)'
          } — do that step first, then retry`;
          return {
            decision: 'deny',
            reasons,
            organs,
            recovery: [hint],
            remedyPlan: {
              reasonCode: 'effect_prerequisite',
              legalAlternatives: [hint],
              requiredEffectEmitters: emitters,
            },
          };
        }
      }
    }
    if (req?.effects?.excludes) {
      for (const e of req.effects.excludes) {
        if (this.effects.includes(e)) {
          reasons.push(`effect exclusion: "${e}" already established — this action is spent`);
          const hint = `one-shot: effect "${e}" is already established — this action cannot repeat within this episode`;
          return {
            decision: 'deny',
            reasons,
            organs,
            recovery: [hint],
            remedyPlan: { reasonCode: 'effect_exclusion', legalAlternatives: [hint] },
          };
        }
      }
    }

    // ---- Dogwood-class stateful trajectory gates (v1.3.0) -----------------
    if (req?.inputMatchesOutput) {
      const { param, fromTool } = req.inputMatchesOutput;
      const candidate = String(args[param] ?? '');
      const allowedSet = this.observedToolOutputs.get(fromTool);
      let matched = false;
      if (candidate && allowedSet) {
        for (const out of allowedSet) {
          if (out.includes(candidate)) {
            matched = true;
            break;
          }
        }
      }
      if (!matched) {
        const hint = `output-to-input integrity: parameter "${param}" ("${candidate}") was not observed in any prior output of "${fromTool}"`;
        return {
          decision: 'deny',
          reasons: [hint],
          organs: organs.concat('O7-authority'),
          recovery: [`call "${fromTool}" first and pass the exact "${param}" value it returned`],
          remedyPlan: {
            blockedParam: param,
            reasonCode: 'input_integrity',
            legalAlternatives: [`call "${fromTool}" first and pass the exact "${param}" value it returned`],
          },
        };
      }
    }
    if (req?.withinMs) {
      const { effect, ms } = req.withinMs;
      const ts = this.effectTimestamps.get(effect);
      const now = Date.now();
      if (ts === undefined || now - ts > ms) {
        const hint = `data freshness: prerequisite effect "${effect}" must be established within ${ms}ms`;
        return {
          decision: 'deny',
          reasons: [hint],
          organs,
          recovery: [`re-run the tool that establishes "${effect}" to refresh the data before calling "${name}"`],
          remedyPlan: {
            reasonCode: 'freshness_expired',
            legalAlternatives: [`re-run the tool that establishes "${effect}" to refresh the data before calling "${name}"`],
          },
        };
      }
    }
    if (req?.maxCumulative) {
      const { param, limit } = req.maxCumulative;
      const deltaVal = parseStrictBudgetAmount(args[param]);
      if (deltaVal === null) {
        const hint = `cumulative budget cap: invalid or negative increment "${args[param]}" on "${param}" — fail closed`;
        return {
          decision: 'deny',
          reasons: [hint],
          organs,
          recovery: [`supply a valid positive numeric amount for "${param}"`],
          remedyPlan: {
            blockedParam: param,
            reasonCode: 'budget_invalid_increment',
            legalAlternatives: [`supply a valid positive numeric amount for "${param}"`],
          },
        };
      }
      const key = `${name}:${param}`;
      const prior = this.cumulativeSums.get(key) ?? 0;
      if (prior + deltaVal > limit) {
        const hint = `cumulative budget cap: "${param}" (${prior} + ${deltaVal} = ${prior + deltaVal}) exceeds episode limit ${limit}`;
        return {
          decision: 'deny',
          reasons: [hint],
          organs,
          recovery: [`reduce "${param}" to at most ${Math.max(0, limit - prior)} or start a fresh episode`],
          remedyPlan: {
            blockedParam: param,
            reasonCode: 'budget_exceeded',
            legalAlternatives: [`reduce "${param}" to at most ${Math.max(0, limit - prior)} or start a fresh episode`],
          },
        };
      }
    }
    if (req?.maxCalls !== undefined) {
      const count = this.callCounts.get(name) ?? 0;
      if (count >= req.maxCalls) {
        const hint = `call count limit: tool "${name}" has already executed ${count}/${req.maxCalls} times in this episode`;
        return {
          decision: 'deny',
          reasons: [hint],
          organs,
          recovery: [hint],
          remedyPlan: { reasonCode: 'call_limit', legalAlternatives: [hint] },
        };
      }
    }

    // ---- O7 authority (attention) -----------------------------------------
    let authorityConsult: Mediation['authorityConsult'];
    if (req?.attention?.length) {
      const authority = spec.authority ?? req.attention[0]!;
      const fixture = this.opts.authorities?.[authority];
      const ruling = typeof fixture === 'function' ? fixture(args) : fixture;
      if (ruling === undefined) {
        return {
          decision: 'deny',
          reasons: [`authority "${authority}" consulted — no registered ruling for this artifact (fail closed)`],
          organs: organs.concat('O7-authority'),
          recovery: REC_AUTHORITY_CLOSED,
          remedyPlan: { reasonCode: 'authority_missing', legalAlternatives: REC_AUTHORITY_CLOSED },
        };
      }
      if (ruling === 'reject') {
        return {
          decision: 'deny',
          reasons: [`authority "${authority}" rejected this action`],
          organs: organs.concat('O7-authority'),
          recovery: REC_AUTHORITY_REJECT,
          remedyPlan: { reasonCode: 'authority_rejected', legalAlternatives: REC_AUTHORITY_REJECT },
        };
      }
      authorityConsult = { authority, tool: name, args };
    }

    return { decision: 'allow', reasons: [], organs, authorityConsult };
  }

  recordEffects(name: string, args: Record<string, string>, mediation: Mediation): void {
    if (args === null || typeof args !== 'object' && typeof args !== 'function' || Array.isArray(args)) return;
    const spec = this.resolveSpec(name, args);
    if (!spec) return;
    const c = this.contract(spec, args);
    const now = Date.now();
    for (const e of c.effects ?? []) {
      if (!this.effects.includes(e)) this.effects.push(e);
      this.effectTimestamps.set(e, now);
    }
    this.callCounts.set(name, (this.callCounts.get(name) ?? 0) + 1);
    if (c.requires?.maxCumulative) {
      const { param } = c.requires.maxCumulative;
      const val = parseStrictBudgetAmount(args[param]);
      if (val !== null) {
        const key = `${name}:${param}`;
        this.cumulativeSums.set(key, (this.cumulativeSums.get(key) ?? 0) + val);
      }
    }
    if (mediation.authorityConsult) {
      const fixture = this.opts.authorities?.[mediation.authorityConsult.authority];
      const ruling =
        typeof fixture === 'function' ? fixture(mediation.authorityConsult.args) : (fixture ?? 'reject');
      this.authorityLog.push({ ...mediation.authorityConsult, ruling: ruling ?? 'reject' });
    }
  }

  public static readonly ROUTING_KEYS: readonly string[] = [
    'url', 'uri', 'endpoint', 'endpoint_url', 'to', 'recipient', 'recipients', 'target', 'webhook',
    'host', 'hostname', 'dest', 'destination', 'path', 'file', 'filename',
  ];

  private allSinkValues(args: Record<string, string>): string {
    const keys = Object.keys(args);
    const vals = Object.values(args).filter((v): v is string => typeof v === 'string');
    return [...keys, ...vals].join('\n');
  }

  private sinkValues(spec: ToolSpec, args: Record<string, string>): string {
    return this.allSinkValues(args);
  }

  observe(name: string, args: Record<string, string>, output: string): OutputObservation {
    const out = typeof output === 'string' ? output : String(output ?? '');
    const a = args !== null && typeof args === 'object' && !Array.isArray(args) ? args : {};
    const spec = this.resolveSpec(name, a);
    const organs: string[] = [];
    const notes: string[] = [];

    if (typeof name === 'string' && name) {
      let set = this.observedToolOutputs.get(name);
      if (!set) {
        set = new Set<string>();
        this.observedToolOutputs.set(name, set);
      }
      set.add(out);
    }

    if (!spec) return { content: out, injected: false, organs, notes: this.opts.silentNotes ? [] : notes };

    const c = this.contract(spec, a);
    if (c.delta?.trust !== undefined) {
      const t = Math.min(this.flow.trust, this.rank(c.delta.trust));
      this.flow = { ...this.flow, trust: t };
    }
    if (c.delta?.audience) {
      this.flow = meet(this.flow, makeLabel(this.flow.trust, c.delta.audience));
    }

    const isMemWrite = (spec?.memory === 'write' || name === 'memory_write' || name === 'mcp/memory/write') && this.opts.organs;
    if (isMemWrite) {
      organs.push('O4-ledger');
      const keyParam = spec?.memoryKeyParam ?? 'key';
      const slotKey = String(a[keyParam] ?? a.key ?? a.slot ?? a.name ?? '');
      const writtenVal = typeof a.value === 'string' && a.value.length > 0 ? a.value : (typeof a.content === 'string' ? a.content : out);
      this.ledger.set(slotKey, {
        label: this.flow,
        digest: screenCacheKey(writtenVal),
        outDigest: screenCacheKey(out),
      });
    }
    const isMemRead = (spec?.memory === 'read' || name === 'memory_read' || name === 'mcp/memory/read') && this.opts.organs;
    if (isMemRead) {
      const keyParam = spec?.memoryKeyParam ?? 'key';
      const slotKey = String(a[keyParam] ?? a.key ?? a.slot ?? a.name ?? '');
      const entry = this.ledger.get(slotKey);
      if (entry) {
        organs.push('O4-ledger');
        const readKey = screenCacheKey(out);
        if (readKey !== entry.digest && readKey !== entry.outDigest) {
          this.faulted = true;
          this.flow = meet(this.flow, { trust: 0, audience: this.flow.audience });
          organs.push('O6-ratchet');
          notes.push(`memory slot "${slotKey}" digest mismatch — session fail-closed`);
        } else {
          this.flow = meet(this.flow, entry.label);
          if (entry.label.trust === 0) notes.push(`memory slot "${slotKey}" carries write-time taint`);
        }
      }
    }

    let injected = false;
    if (this.opts.organs) {
      const key = screenCacheKey(out);
      let verdict = this.screenCache.get(key);
      if (verdict === undefined) {
        verdict = isInjected(out);
        this.screenCache.set(key, verdict);
        if (this.screenCache.size > SCREEN_CACHE_MAX) {
          const oldest = this.screenCache.keys().next().value;
          if (oldest !== undefined) this.screenCache.delete(oldest);
        }
      }
      injected = verdict;
      const trustQuarantined = c.delta?.trust !== undefined && this.rank(c.delta.trust) === 0;
      if (injected) {
        this.registerSuspicious(out, 'screen');
        organs.push('O5-screen');
        notes.push('output carries embedded instructions — instruction regions quarantined');
      } else if (trustQuarantined) {
        this.registerSuspicious(out, 'label');
        notes.push('untrusted source registered for echo confinement');
      }
    }

    return { content: out, injected, organs, notes: (this.opts.silentNotes || this.opts.silentPipe) ? [] : notes };
  }

  private registerSuspicious(content: string, mode: 'label' | 'screen' = 'label'): void {
    if (this.suspiciousSources.length >= MAX_SUSPICIOUS_SOURCES || this.suspiciousBytes >= MAX_SUSPICIOUS_BYTES) {
      this.faulted = true;
      this.flow = meet(this.flow, { trust: 0, audience: this.flow.audience });
      return;
    }
    const key = screenCacheKey(content);
    if (!this.suspiciousKeys.has(key)) {
      if (mode === 'label') {
        this.suspiciousKeys.add(key);
        this.suspiciousSources.push(content);
        this.suspiciousBytes += content.length;
        this.echoGrams = null;
      } else {
        for (const region of instructionRegions(content)) {
          const rk = screenCacheKey(region);
          if (!this.suspiciousKeys.has(rk)) {
            this.suspiciousKeys.add(rk);
            this.suspiciousSources.push(region);
            this.suspiciousBytes += region.length;
            this.echoGrams = null;
          }
          for (const st of extractStylizedTokens(region)) {
            this.echoTokens.add(st);
          }
        }
      }
    }
    for (const tok of extractCommandedTokens(content)) {
      this.suppressedTokens.add(tok);
    }
  }

  private scanSink(
    name: string,
    spec: ToolSpec,
    args: Record<string, string>,
  ): {
    reason: string;
    redacted: string | null;
    remediedArgs?: Record<string, string>;
    blockedParams?: string[];
  } | null {
    const values = this.allSinkValues(args);
    if (!values) return null;
    const views = [values, ...decodeCandidateViews(values, true)];
    let hit: string | null = null;

    for (const v of views) {
      const compact = v.replace(/\s+/g, '').toLowerCase();
      for (const tok of this.canaryTokens) {
        if (compact.includes(tok.toLowerCase())) {
          hit = `canary token ${tok} in egress — content-side interdiction`;
          break;
        }
      }
      if (hit) break;

      const numeric = this.numericSecretHits(v);
      if (numeric.length > 0) {
        hit = `numeric secret ${numeric[0]!.key} from a sensitive store in egress — interdiction (strip it or route through a declassifier)`;
        break;
      }

      for (const tok of this.suppressedTokens) {
        if (compact.includes(tok.toLowerCase())) {
          hit = `token "${tok}" was commanded by untrusted content — suppression`;
          break;
        }
      }
      if (hit) break;
    }

    if (!hit) return null;

    // Check if any key name contains a canary/secret (keys cannot be remedied without altering API schema)
    for (const k of Object.keys(args)) {
      const views = [k, ...decodeCandidateViews(k, true)];
      for (const v of views) {
        const compact = v.replace(/\s+/g, '').toLowerCase();
        for (const tok of this.canaryTokens) {
          if (compact.includes(tok.toLowerCase())) {
            return {
              reason: `canary token "${tok}" in argument key "${k}"`,
              redacted: null,
              remediedArgs: undefined,
              blockedParams: [k],
            };
          }
        }
        for (const tok of this.suppressedTokens) {
          if (compact.includes(tok.toLowerCase())) {
            return {
              reason: `suppressed token "${tok}" in argument key "${k}"`,
              redacted: null,
              remediedArgs: undefined,
              blockedParams: [k],
            };
          }
        }
      }
    }

    // Check if any secret is located in a routing parameter (VULN-ENG-04)
    const routingKeys = new Set(Observatory.ROUTING_KEYS);
    let routingHitKey: string | null = null;

    for (const [k, v] of Object.entries(args)) {
      if (typeof v !== 'string') continue;
      const compact = v.replace(/\s+/g, '').toLowerCase();
      const isRouteKey = routingKeys.has(k.toLowerCase()) || /^(?:https?|ftp|file|mailto|wss?):\/\/|^\/\//i.test(v);
      if (isRouteKey) {
        for (const tok of this.canaryTokens) {
          if (compact.includes(tok.toLowerCase())) {
            routingHitKey = k;
            break;
          }
        }
        if (routingHitKey) break;
        if (this.numericSecretHits(v).length > 0) {
          routingHitKey = k;
          break;
        }
        for (const tok of this.suppressedTokens) {
          if (compact.includes(tok.toLowerCase())) {
            routingHitKey = k;
            break;
          }
        }
        if (routingHitKey) break;
      }
    }

    const redactValue = (raw: string): string => {
      let r = raw;
      for (const tok of this.canaryTokens) {
        r = redactAll(r, tok);
      }
      for (const { span } of this.numericSecretHits(r)) {
        r = r.split(span).join('[redacted]');
      }
      for (const tok of this.suppressedTokens) {
        r = redactAll(r, tok);
      }
      return r;
    };

    if (routingHitKey) {
      // Suppress remedy if canary/secret hits a routing field — egress blocked completely
      return { reason: hit, redacted: null, remediedArgs: undefined, blockedParams: [routingHitKey] };
    }

    const payload = this.payloadValues(spec, args);
    let redacted: string | null = null;
    if (payload) {
      redacted = redactValue(payload);
    }

    const remediedArgs: Record<string, string> = { ...args };
    const blockedParams: string[] = [];
    let hasUnremediedObfuscatedSecret = false;

    for (const [k, v] of Object.entries(args)) {
      if (typeof v === 'string') {
        const cleaned = redactValue(v);
        if (cleaned !== v) {
          remediedArgs[k] = cleaned;
          blockedParams.push(k);
        } else {
          // Check if candidate views detected a secret in v that literal redactValue failed to strip
          const views = [v, ...decodeCandidateViews(v, true)];
          for (const cv of views) {
            const compact = cv.replace(/\s+/g, '').toLowerCase();
            for (const tok of this.canaryTokens) {
              if (compact.includes(tok.toLowerCase())) {
                hasUnremediedObfuscatedSecret = true;
                blockedParams.push(k);
                break;
              }
            }
            if (hasUnremediedObfuscatedSecret) break;
            if (this.numericSecretHits(cv).length > 0) {
              hasUnremediedObfuscatedSecret = true;
              blockedParams.push(k);
              break;
            }
            for (const tok of this.suppressedTokens) {
              if (compact.includes(tok.toLowerCase())) {
                hasUnremediedObfuscatedSecret = true;
                blockedParams.push(k);
                break;
              }
            }
            if (hasUnremediedObfuscatedSecret) break;
          }
        }
      }
    }

    if (hasUnremediedObfuscatedSecret || (hit && blockedParams.length === 0)) {
      // Obfuscated/encoded secret cannot be remedied via literal replacement — suppress remedy
      return { reason: hit, redacted: null, remediedArgs: undefined, blockedParams };
    }

    if (!redacted && blockedParams.length > 0) {
      redacted = remediedArgs[blockedParams[0]!] ?? null;
    }

    return { reason: hit, redacted, remediedArgs, blockedParams };
  }

  private payloadValues(spec: ToolSpec, args: Record<string, string>): string | null {
    const keys = spec.sinkParams ?? ['body', 'content', 'summary', 'text', 'task', 'payload'];
    const vals = keys.map((k) => args[k]).filter((v): v is string => typeof v === 'string');
    return vals.length > 0 ? vals.join('\n') : null;
  }

  private numericSecretHits(text: string): { span: string; key: string }[] {
    if (this.numericCanaries.size === 0) return [];
    const hits: { span: string; key: string }[] = [];
    const seen = new Set<string>();
    for (const m of text.normalize('NFKC').matchAll(/\d[\d.,/\-\s]*\d/g)) {
      const run = m[0]!;
      const full = run.replace(/[^0-9]/g, '');
      if (full.length >= 4 && this.numericCanaries.has(full) && !seen.has(full)) {
        hits.push({ span: run, key: full });
        seen.add(full);
        continue;
      }
      for (const part of run.split(/[^0-9]+/)) {
        if (part.length >= 4 && this.numericCanaries.has(part) && !seen.has(part)) {
          hits.push({ span: part, key: part });
          seen.add(part);
        }
      }
    }
    return hits;
  }

  private combinedEchoGrams(): Set<string> {
    if (this.echoGrams === null) {
      this.echoGrams = new Set<string>();
      for (const s of this.suspiciousSources) {
        for (const g of ngrams(s, ECHO_NGRAMS)) this.echoGrams.add(g);
      }
    }
    return this.echoGrams;
  }

  private echoInSink(spec: ToolSpec, args: Record<string, string>): { span: string } | null {
    const values = this.sinkValues(spec, args);
    if (!values) return null;
    if (this.suspiciousSources.length > 0) {
      const grams = this.combinedEchoGrams();
      if (echoesGrams(values, grams)) {
        const match = findEchoes(values, this.suspiciousSources);
        if (match.length > 0) return match[0]!;
      }
    }
    if (this.echoTokens.size > 0) {
      const views = [values, ...decodeCandidateViews(values, true)];
      for (const v of views) {
        const folded = v.toUpperCase();
        for (const tok of this.echoTokens) {
          if (folded.includes(tok)) return { span: tok };
        }
      }
    }
    return null;
  }

  private applicableSanitizer(kind: 'fork_return' | 'egress_remedy', flow: Label): Sanitizer | null {
    for (const san of this.policy.sanitizers ?? []) {
      if (!san.on.includes(kind) || !san.permits.audience) continue;
      const from = new Set(san.permits.audience.from);
      let applies = false;
      for (const r of flow.audience) {
        if (from.has(r)) {
          applies = true;
          break;
        }
      }
      if (applies) return san;
    }
    return null;
  }

  private effectEmitters(effect: string): string[] {
    const names = new Set<string>();
    for (const spec of this.policy.tools) {
      if ((spec.effects ?? []).includes(effect)) names.add(spec.name);
    }
    return [...names];
  }

  private declassifyLabel(childLabel: Label, san: Sanitizer): Label {
    let effectiveTrust = childLabel.trust;
    if (san.permits?.trust) {
      const rank = this.policy.trustChain.indexOf(san.permits.trust);
      if (rank !== -1) effectiveTrust = Math.min(childLabel.trust, rank);
    }
    const effectiveAudience = new Set(childLabel.audience);
    if (san.permits?.audience) {
      const from = new Set(san.permits.audience.from);
      let matched = false;
      for (const r of childLabel.audience) {
        if (from.has(r)) {
          matched = true;
          effectiveAudience.delete(r);
        }
      }
      if (matched) {
        for (const t of san.permits.audience.to) {
          if (t === 'public') {
            // 'public' is the universal reader set. It can ONLY be granted if no other
            // non-public restrictions remain, preventing universal collapse in meet().
            if (effectiveAudience.size === 0) {
              effectiveAudience.add('public');
            }
          } else {
            effectiveAudience.add(t);
          }
        }
      }
    }
    return { trust: effectiveTrust, audience: effectiveAudience };
  }

  forkReturn(childLabel: Label, content: string, child?: Observatory): { content: string; note: string; organs: string[] } {
    const organs: string[] = [];
    if (child && this.opts.organs) this.mergeQuarantine(child);
    if (!content.trim()) {
      return {
        content: '',
        note: 'child completed its own side effects — no return data, parent unaffected',
        organs,
      };
    }
    const san = this.applicableSanitizer('fork_return', childLabel);
    if (san) {
      organs.push('O7-sanitize');
      const clean = san.apply(content);
      this.declassifiedDigests.add(screenCacheKey(clean));
      // Theorem 2: meet parent flow with the declassified label (preserves un-declassified trust degradation)
      const declassifiedLabel = this.declassifyLabel(childLabel, san);
      this.flow = meet(this.flow, declassifiedLabel);
      const echo = this.opts.organs && echoesSuspicious(clean, this.suspiciousSources);
      if (echo) {
        return {
          content: '[return withheld: quoted untrusted content]',
          note: 'fork return echoed quarantined content — withheld',
          organs: organs.concat('O7-confine'),
        };
      }
      return { content: clean, note: `sanitized through ${san.name}`, organs };
    }
    // No sanitizer applied: raw return unconditionally joins child label into parent flow (VULN-ENG-01)
    this.flow = meet(this.flow, childLabel);
    if (this.opts.organs && echoesSuspicious(content, this.suspiciousSources)) {
      return {
        content: '[return withheld: quoted untrusted content]',
        note: 'fork return echoed quarantined content — withheld',
        organs: organs.concat('O7-confine'),
      };
    }
    return { content, note: 'raw return — child label joined the parent flow', organs };
  }

  private mergeQuarantine(child: Observatory): void {
    for (const src of child.suspiciousSources) {
      const key = screenCacheKey(src);
      if (!this.suspiciousKeys.has(key)) {
        this.suspiciousKeys.add(key);
        this.suspiciousSources.push(src);
        this.suspiciousBytes += src.length;
        this.echoGrams = null;
      }
    }
    for (const tok of child.suppressedTokens) this.suppressedTokens.add(tok);
    for (const tok of child.echoTokens) this.echoTokens.add(tok);
  }

  checkAnswer(draft: string): { ok: boolean; reason?: string; organs?: string[]; sanitizedDraft: string } {
    const text = String(draft ?? '');
    const sanitized = this.sanitizeAnswer(text);
    if (!this.opts.organs) return { ok: true, sanitizedDraft: text };
    const folded = text.toUpperCase();
    for (const tok of this.suppressedTokens) {
      if (folded.includes(tok)) {
        return {
          ok: false,
          reason: `the answer echoes "${tok}", a token commanded by untrusted content — answer from the trusted facts instead`,
          organs: ['O5-screen', 'O7-confine'],
          sanitizedDraft: sanitized,
        };
      }
    }
    for (const tok of this.echoTokens) {
      if (folded.includes(tok)) {
        return {
          ok: false,
          reason: `the answer echoes stylized token "${tok}" from a quarantined instruction region — answer from the trusted facts instead`,
          organs: ['O5-screen', 'O7-confine'],
          sanitizedDraft: sanitized,
        };
      }
    }
    const match = findEchoes(text, this.suspiciousSources);
    if (match.length > 0) {
      return {
        ok: false,
        reason: `${ECHO_NOTE}: "${match[0]!.span.slice(0, 80)}…" — restate the fact, do not quote the source`,
        organs: ['O7-confine'],
        sanitizedDraft: sanitized,
      };
    }

    if (this.opts.checkAnswerCanaries ?? true) {
      const views = [text, ...decodeCandidateViews(text, true)];
      for (const v of views) {
        const compact = v.replace(/\s+/g, '').toLowerCase();
        for (const tok of this.canaryTokens) {
          if (compact.includes(tok.toLowerCase())) {
            return {
              ok: false,
              reason: `the answer contains canary token "${tok}" — exfiltration interdicted`,
              organs: ['O4-canary'],
              sanitizedDraft: sanitized,
            };
          }
        }
        const numeric = this.numericSecretHits(v);
        if (numeric.length > 0) {
          return {
            ok: false,
            reason: `the answer contains sensitive numeric secret "${numeric[0]!.key}" — exfiltration interdicted`,
            organs: ['O4-canary'],
            sanitizedDraft: sanitized,
          };
        }
      }
    }

    return { ok: true, sanitizedDraft: text };
  }

  sanitizeAnswer(draft: string): string {
    let out = String(draft ?? '');
    if (!this.opts.organs) return out;
    for (const tok of this.suppressedTokens) {
      out = redactAll(out, tok).replace(/\[redacted\]/gi, '');
    }
    for (const tok of this.echoTokens) {
      out = redactAll(out, tok).replace(/\[redacted\]/gi, '');
    }
    for (let guard = 0; guard < 16; guard++) {
      const matches = findEchoes(out, this.suspiciousSources);
      if (matches.length === 0) break;
      for (const m of matches) {
        if (m.span) out = out.replace(m.span, '');
      }
    }
    return out.replace(/\s{2,}/g, ' ').trim();
  }

  /** Alias for sanitizeAnswer (P0 RC-C / v1.3.0). */
  sanitizeAnswerDraft(draft: string): string {
    return this.sanitizeAnswer(draft);
  }

  enrollSensitiveFacts(store: string, content: string): void {
    if (!this.policy.sensitiveStores?.includes(store)) return;
    const lines = content.split('\n');
    for (const line of lines) {
      const idx = line.indexOf(':');
      if (idx > 0) {
        const key = line.slice(0, idx).trim().toLowerCase();
        const val = line.slice(idx + 1).trim();
        if (key && val && val.length >= 3) {
          this.sensitiveFacts.set(`${store}:${key}`, val);
        }
      }
    }
  }

  checkCounterfactual(
    name: string,
    realArgs: Record<string, string>,
    counterfactualArgs: Record<string, string>,
    counterfactualToolName?: string,
  ): { noninterfering: boolean; divergenceReason?: string } {
    if (counterfactualToolName && counterfactualToolName !== name) {
      return {
        noninterfering: false,
        divergenceReason: `tool divergence under counterfactual input ("${name}" vs "${counterfactualToolName}")`,
      };
    }

    const controlParams = new Set([
      ...Observatory.ROUTING_KEYS,
      'amount', 'price', 'cost', 'shares', 'units', 'account', 'id', 'user', 'role',
    ]);
    for (const p of controlParams) {
      const realVal = realArgs[p];
      const cfVal = counterfactualArgs[p];
      if (realVal !== cfVal && (realVal !== undefined || cfVal !== undefined)) {
        return {
          noninterfering: false,
          divergenceReason: `control parameter "${p}" diverged under counterfactual input ("${realVal ?? ''}" vs "${cfVal ?? ''}")`,
        };
      }
    }

    const realValues = Object.values(realArgs).join(' ');
    const rawDecoded = decodeCandidateViews(realValues, true);
    const realViews = new Set<string>([realValues]);
    for (const v of rawDecoded) {
      realViews.add(v);
      realViews.add(normalizeForScreen(v));
    }
    const cfValues = Object.values(counterfactualArgs).join(' ');
    const cfViews = new Set<string>([cfValues, ...decodeCandidateViews(cfValues, true)]);
    for (const v of [...cfViews]) {
      cfViews.add(normalizeForScreen(v));
    }

    const realNumerics = new Set<string>();
    for (const v of realViews) {
      for (const num of extractNumericSecrets(v)) realNumerics.add(num);
    }

    for (const [key, val] of this.sensitiveFacts) {
      const leakedInReal = [...realViews].some(
        (v) => v.includes(val) || v.replace(/\s+/g, '').includes(val.replace(/\s+/g, '')),
      );
      const leakedInCf = [...cfViews].some(
        (v) => v.includes(val) || v.replace(/\s+/g, '').includes(val.replace(/\s+/g, '')),
      );
      if (leakedInReal && !leakedInCf) {
        return {
          noninterfering: false,
          divergenceReason: `sensitive fact "${key}" present in real dispatch is absent from counterfactual dispatch`,
        };
      }
    }

    for (const tok of this.canaryTokens) {
      const leakedInReal = [...realViews].some((v) => v.toLowerCase().includes(tok.toLowerCase()));
      const leakedInCf = [...cfViews].some((v) => v.toLowerCase().includes(tok.toLowerCase()));
      if (leakedInReal && !leakedInCf) {
        return {
          noninterfering: false,
          divergenceReason: `canary token "${tok}" present in real dispatch is absent from counterfactual dispatch`,
        };
      }
    }

    for (const num of this.numericCanaries) {
      const leakedInReal = realNumerics.has(num) || [...realViews].some((v) => v.includes(num));
      const leakedInCf = [...cfViews].some((v) => v.includes(num));
      if (leakedInReal && !leakedInCf) {
        return {
          noninterfering: false,
          divergenceReason: `numeric secret "${num}" present in real dispatch is absent from counterfactual dispatch`,
        };
      }
    }

    return { noninterfering: true };
  }

  declassifyPayload(sanitizerName: string, content: string): string | null {
    const san = (this.policy.sanitizers ?? []).find((s) => s.name === sanitizerName);
    if (!san) return null;
    const cleaned = san.apply(content);
    this.declassifiedDigests.add(screenCacheKey(cleaned));
    return cleaned;
  }

  initMemory(entries: Record<string, string>): void {
    if (!this.opts.organs) return;
    for (const [key, value] of Object.entries(entries)) {
      const d = screenCacheKey(String(value));
      this.ledger.set(key, { label: this.flow, digest: d, outDigest: d });
      if (isInjected(String(value))) {
        this.registerSuspicious(String(value), 'screen');
      }
    }
  }

  registerExternalSuspicious(content: string): void {
    if (!this.opts.organs) return;
    if (isInjected(content)) this.registerSuspicious(content, 'screen');
  }
}
