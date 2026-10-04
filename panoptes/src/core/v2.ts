/**
 * PANOPTES prototype core v2 — the Observatory runtime.
 *
 * A policy-driven mediation engine that reproduces APPA's contract semantics
 * (trust chain, audience sets, deltas, requires with $param substitution,
 * effect prerequisites, annotator-consulted dynamic contracts, registered
 * sanitizers/authorities) and layers the PANOPTES organs on top:
 *
 *   O4-canary   egress interdiction against auto-enrolled canary tokens and
 *               numeric secrets from declared sensitive stores;
 *   O5-screen   deterministic instruction-injection screen on tool output —
 *               suspicious sources are registered for confinement;
 *   O7-confine  inert transduction: bounded verbatim-echo denial on sinks,
 *               fork returns, and the final-answer channel;
 *   O7-authority escrowed dual control via authority consults (attention);
 *   O4-ledger   cross-session memory taint (carried over from v1 semantics);
 *   O6-ratchet  fail-closed integrity faults.
 *
 * `organs: false` gives the APPA-baseline arm: identical policy semantics
 * with the content-side organs off.
 */

import { isInjected, instructionRegions, screenCacheKey, screenContent } from './screen';
import { ECHO_NGRAMS, echoesGrams, echoesSuspicious, findEchoes, ngrams } from './confine';

// ------------------------------------------------------------------ labels

export type TrustName = string; // resolved against the policy's chain

export type Label = {
  trust: number; // rank in the policy chain; higher = more trusted
  audience: ReadonlySet<string>;
};

export const PUBLIC = 'public';

export function makeLabel(trust: number, audience: readonly string[]): Label {
  // `public` is the universal reader set: any audience containing it is
  // canonically the universal set. Canonicalizing here keeps `meet`
  // commutative for mixed audiences (audit A-9) without changing reading
  // semantics (audienceCanRead treats PUBLIC as every reader).
  if (audience.includes(PUBLIC)) return { trust, audience: new Set([PUBLIC]) };
  return { trust, audience: new Set(audience) };
}

export function meet(a: Label, b: Label): Label {
  const trust = Math.min(a.trust, b.trust);
  // `public` is the universal reader set: meet(public, X) = X.
  // (Empirically pinned: joint-merger-brief's ACL intersection names exactly
  // the CFO — the reader set must intersect, never replace.)
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
  /** Degrade trust to this rank (never raises). */
  trust?: string;
  /** Narrow the audience to exactly this reader set. */
  audience?: string[];
};

export type Requires = {
  trust?: string;
  /** Readers that must be able to read the flow; `$param` substituted. */
  audience?: { contains: string[] };
  /** Effect prerequisites on the episode effect log. */
  effects?: { contains?: string[]; excludes?: string[] };
  /** Authority attention required before dispatch. */
  attention?: string[];
};

export type ToolSpec = {
  name: string;
  /** Optional parameter selector (most specific first). */
  match?: (args: Record<string, string>) => boolean;
  delta?: Delta;
  requires?: Requires;
  effects?: string[];
  /** Egress sink: sink params are canary-scanned and echo-confined. */
  egress?: boolean;
  /** Which params carry content (default: ALL string params — audit A-4:
   *  a hand-maintained key whitelist already missed `subject`). */
  sinkParams?: string[];
  /** Annotator that supplies this tool's per-call contract. */
  annotator?: string;
  /** Authority consulted at dispatch (attention). */
  authority?: string;
  /** Explicit read-only marker for the O6 ratchet's read exemption
   *  (default heuristic: not egress, no effects — audit A-15). */
  readonly?: boolean;
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
  /** Applicable when the flow's audience sits inside `from`. */
  permits: { audience?: { from: string[]; to: string[] } };
  apply: (content: string) => string;
};

export type AuthorityRuling = 'approve' | 'reject';

export type PolicyDoc = {
  trustChain: string[];
  boundary: { trust: string; audience: string[] };
  tools: ToolSpec[];
  sanitizers?: Sanitizer[];
  /** Sensitive stores for canary auto-enrollment (e.g. ['hr', 'finance']). */
  sensitiveStores?: string[];
};

// ------------------------------------------------------------- mediation

export type Mediation = {
  decision: 'allow' | 'deny';
  reasons: string[];
  organs: string[];
  /** For authority-gated tools: the consult to perform on allow. */
  authorityConsult?: { authority: string; tool: string; args: Record<string, string> };
  /** For audience-denied egress: an offered sanitized payload (remedy). */
  remedy?: { sanitizer: string; content: string; note: string };
  /** Generic, policy-introspective recovery hints for a denied action —
   *  shared frozen instances on hot paths (never mutate). */
  recovery?: string[];
};

export type OutputObservation = {
  /** Content as the agent sees it (post-sanitizer where applicable). */
  content: string;
  /** Whether the immune screen flagged this output. */
  injected: boolean;
  organs: string[];
  notes: string[];
};

// ------------------------------------------------------------------ engine

export type V2Options = {
  organs: boolean;
  /** Extra canaries beyond auto-enrollment (v1-style registry). */
  canaries?: readonly string[];
  /** Annotator fixture: annotator name -> resolver over the tool's args. */
  annotators?: Record<string, (toolArgs: Record<string, string>) => Annotation | null>;
  /** Authority fixture: name -> ruling, or a resolver over the consult's
   *  args (undefined = no ruling -> fail closed, e.g. tampered artifacts). */
  authorities?: Record<string, AuthorityRuling | ((args: Record<string, string>) => AuthorityRuling | undefined)>;
};

const ECHO_NOTE = 'content quoted a verbatim span from an untrusted source (inert transduction boundary)';

/** Bound for the per-session screen verdict cache (see Observatory.observe). */
const SCREEN_CACHE_MAX = 8_192;

// ------------------------------------------------------------ recovery kit
// Shared (frozen-by-convention: consumers treat as read-only) hint arrays so
// hot deny paths pay a property reference, not an allocation.
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

/** Lines that carry numeric secrets (DLP-style field dictionary). */
const SECRET_FIELD_LINE = /\b(ssn|social\s+security|reconciliation\s+ref|ref|reference|salary|compensation|equity|account|balance|bonus|amount|iban|routing)\b\s*[:=]/i;

/**
 * NFKC-folded digit-run extraction — the SAME normalization on enrollment
 * and sink sides, so a secret enrolled as "12345.67" or "1,234.56" or
 * "１２３４５" is interdicted in any of those renderings (audit A-1).
 * Known trade-off (A-17): a benign reformat of an enrolled secret
 * ("91,250 employees") also trips — inherent to digit-normalized DLP; the
 * remedy channel (declassifier sanitizer) is the release path.
 */
function extractNumericSecrets(text: string): string[] {
  const out: string[] = [];
  const norm = text.normalize('NFKC');
  for (const m of norm.matchAll(/\d[\d.,\s]*\d/g)) {
    const digits = m[0].replace(/[^0-9]/g, '');
    if (digits.length >= 4) out.push(digits);
  }
  return out;
}

/** Case-insensitive literal replace-all — the deny-path remedy channel
 *  rewriting an enrolled span into [redacted] (canary-interdiction). */
function redactAll(text: string, needle: string): string {
  if (!needle) return text;
  const re = new RegExp(needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
  return text.replace(re, '[redacted]');
}

/** Caps that keep long-lived sessions bounded (audit A-14): beyond these,
 * registration fails CLOSED (the session ratchets) rather than silently
 * dropping quarantine coverage. */
const MAX_SUSPICIOUS_SOURCES = 512;
const MAX_SUSPICIOUS_BYTES = 2_000_000;

export class Observatory {
  private readonly policy: PolicyDoc;
  private readonly opts: V2Options;
  private readonly trustRank: Map<string, number>;
  /** name -> candidate specs (param selectors disambiguate) — O(1) lookup. */
  private readonly toolIndex: Map<string, ToolSpec[]>;
  /** Combined n-gram set of all quarantined sources (lazy, invalidated on
   *  registration) — one pass over sink content per egress check. */
  private echoGrams: Set<string> | null = null;

  private flow: Label;
  /** Episode-level effect log (shared across parent + children). */
  private effects: string[] = [];
  /** Suspicious source texts registered by the screen (this trace). */
  private suspiciousSources: string[] = [];
  private suspiciousKeys = new Set<string>();
  private suspiciousBytes = 0;
  /** Tokens commanded by untrusted content (screen-derived suppression;
   *  stored uppercase — comparisons are case-folded). */
  private suppressedTokens = new Set<string>();
  /** Canary registry: CANARY-pattern tokens + numeric secrets. */
  private canaryTokens = new Set<string>();
  /** Operator-declared canaries (opts + addCanary) — survive rotation. */
  private seedCanaries = new Set<string>();
  /** Rotation generation counter (retired synthetic canaries stop matching). */
  canaryGeneration = 0;
  private numericCanaries = new Set<string>();
  /** Screen result cache (content digest -> injected?), insertion-ordered
   *  and bounded — an adversarial stream of unique outputs cannot grow it
   *  without limit (v1.2.0 audit hardening; 8,192 entries ≈ a few MB). */
  private screenCache = new Map<string, boolean>();
  /** Authority consult log (episode). */
  authorityLog: { authority: string; tool: string; args: Record<string, string>; ruling: AuthorityRuling }[] = [];
  /** Cross-session memory ledger (O4). */
  ledger = new Map<string, { label: Label; digest: string }>();
  private faulted = false;

  constructor(policy: PolicyDoc, opts: V2Options) {
    this.policy = policy;
    this.opts = opts;
    this.validatePolicy(policy);
    this.trustRank = new Map(policy.trustChain.map((t, i) => [t, i]));
    this.toolIndex = new Map();
    for (const spec of policy.tools) {
      const list = this.toolIndex.get(spec.name);
      if (list) list.push(spec);
      else this.toolIndex.set(spec.name, [spec]);
    }
    // Most-specific-first: a catch-all spec (no `match`) declared before a
    // parameter-selector spec must never shadow it (audit A-22). Stable sort
    // keeps declaration order within each specificity class.
    for (const list of this.toolIndex.values()) {
      list.sort((a, b) => (b.match ? 1 : 0) - (a.match ? 1 : 0));
    }
    this.flow = makeLabel(this.rank(policy.boundary.trust), policy.boundary.audience);
    for (const c of opts.canaries ?? []) {
      this.seedCanaries.add(c);
      this.canaryTokens.add(c);
    }
  }

  /** Policy validation: an unknown trust name in a floor fails OPEN and in
   *  a delta fails closed — both silently. Reject the policy up front
   *  instead (audit A-19). */
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

  /** Start a fresh session/trace (the boundary label), keeping the ledger.
   * Episode-level state (effects, authority log) intentionally PERSISTS —
   * one-shot actions stay spent across sessions within an episode. Use
   * beginEpisode() for a full reset (audit A-16). */
  beginTrace(): void {
    this.flow = makeLabel(this.rank(this.policy.boundary.trust), this.policy.boundary.audience);
    this.suspiciousSources = [];
    this.suspiciousKeys.clear();
    this.suspiciousBytes = 0;
    this.suppressedTokens.clear();
    this.faulted = false;
  }

  /** Start a fresh EPISODE: sessions, effect log, and authority log all
   * reset (the cross-session memory ledger survives — it is O4's whole
   * point). */
  beginEpisode(): void {
    this.beginTrace();
    this.effects = [];
    this.authorityLog = [];
  }

  /**
   * Fork a child trajectory: a fresh boundary label and its own quarantine
   * registry, while the episode-level effects log, authority log, memory
   * ledger, and canary registries stay shared with the parent (a child's
   * side effects have succeeded; its return crosses `forkReturn`).
   *
   * O7 delegation noninterference (organs on): the task text is a channel
   * from the parent's context into the child — a parent whose flow is
   * narrowed cannot launder that restriction away by delegating, so the
   * child's boundary is the meet of the parent's current flow and the policy
   * boundary. Discovered empirically: the Corp benchmark's LLM agent found
   * the laundering path (restricted codes embedded in fork task text, sent
   * from the fresh child) against the label-only arm.
   */
  forkSession(): Observatory {
    const child = new Observatory(this.policy, this.opts);
    if (this.opts.organs) {
      child.flow = meet(this.flow, child.flow);
    }
    child.effects = this.effects;
    child.authorityLog = this.authorityLog;
    child.ledger = this.ledger;
    child.seedCanaries = this.seedCanaries;
    child.canaryTokens = this.canaryTokens;
    child.canaryGeneration = this.canaryGeneration;
    child.numericCanaries = this.numericCanaries;
    child.screenCache = this.screenCache;
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

  /** O6: simulated memory integrity fault — session fail-closed. */
  injectMemoryFault(): void {
    if (!this.opts.organs) return;
    this.faulted = true;
    this.flow = meet(this.flow, { trust: 0, audience: this.flow.audience });
  }

  /** O4-canary: enroll an operator-issued canary token (survives rotation). */
  addCanary(token: string): void {
    if (!this.opts.organs || !token) return;
    this.seedCanaries.add(token);
    this.canaryTokens.add(token);
  }

  /** O4-canary rotation: retire auto-enrolled synthetic canaries (the
   *  CANARY-convention tokens picked up from world content), keep the
   *  operator-declared seeds, and bump the generation. Numeric secrets from
   *  sensitive stores are real data, not canaries — they are never rotated.
   *  A deployment rotates after suspected exposure so retired tokens stop
   *  matching egress; fresh documents re-enroll the new generation. */
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

  /** O4-canary: enroll canary tokens + numeric secrets from world content.
   *
   *  Deployment-plausible auto-enrollment over declared sensitive stores:
   *   - structured canary tokens: the CANARY marker AND a digit run, ≥ 8
   *     chars (the planted convention, e.g. CANARY-7f3a2b). The bare word
   *     "Canary" is ordinary English and must not enroll — it false-denied
   *     benign egress like "the Canary Wharf office" (audit A-7);
   *   - digit runs ≥ 4 (separator- and format-normalized on BOTH sides —
   *     see extractNumericSecrets) on lines with secret-field labels
   *     (ssn / ref / salary / compensation / account / …). Short digit runs
   *     on reference lines (release codes, project codes) stay quotable. */
  enrollWorldCanaries(store: string, content: string): void {
    if (!this.opts.organs) return;
    const sensitive = this.policy.sensitiveStores?.includes(store) ?? false;
    if (!sensitive) return;
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

  // ---------------------------------------------------------- gate check

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

  /** Resolve the effective contract for a call (annotator overrides spec).
   *  `annotatorMiss` marks a consulted annotator that returned no contract:
   *  the call must fail closed (audit A-5) — an unmatched annotation used to
   *  fall through to a spec with no gate at all. */
  private contract(spec: ToolSpec, args: Record<string, string>): { delta?: Delta; requires?: Requires; effects?: string[]; isEgress?: boolean; annotatorMiss?: boolean } {
    if (spec.annotator && this.opts.annotators) {
      const resolve = this.opts.annotators[spec.annotator];
      if (resolve) {
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
    }
    return { delta: spec.delta, requires: spec.requires, effects: spec.effects, isEgress: spec.egress };
  }

  private substitute(readers: readonly string[], args: Record<string, string>): string[] {
    return readers.map((r) => (r.startsWith('$') ? String(args[r.slice(1)] ?? r) : r));
  }

  check(name: string, args: Record<string, string>): Mediation {
    // Malformed input fails closed instead of crashing the mediator (audit
    // A-12: `check('send_email', null)` used to throw — a guardrail DoS).
    if (typeof name !== 'string' || !name) {
      return { decision: 'deny', reasons: ['malformed tool name — fail closed'], organs: [] };
    }
    if (args === null || typeof args !== 'object' || Array.isArray(args)) {
      return { decision: 'deny', reasons: ['malformed tool arguments — fail closed'], organs: [] };
    }
    const reasons: string[] = [];
    const organs: string[] = [];
    const spec = this.resolveSpec(name, args);
    if (!spec) {
      return { decision: 'deny', reasons: [`unknown tool "${name}" — fail closed`], organs };
    }
    const c = this.contract(spec, args);
    if (c.annotatorMiss) {
      return {
        decision: 'deny',
        reasons: [`annotator "${spec.annotator}" returned no contract for this call — fail closed`],
        organs,
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
        };
      }
    }

    // ---- composite egress: the tool's own delta participates pre-dispatch --
    let effFlow = this.flow;
    if (isEgress && c.delta?.audience) {
      effFlow = meet(effFlow, makeLabel(this.rank(c.delta.trust ?? this.policy.trustChain[this.policy.trustChain.length - 1]!), c.delta.audience));
    }

    // ---- requires ----------------------------------------------------------
    const req = c.requires;
    if (req?.trust && effFlow.trust < this.rank(req.trust)) {
      reasons.push(`trust floor: flow at "${this.policy.trustChain[effFlow.trust]}" < required "${req.trust}"`);
      return { decision: 'deny', reasons, organs, recovery: REC_TRUST_FLOOR };
    }
    if (req?.audience?.contains) {
      const payload = this.sinkValues(spec, args);
      // Registered-declassifier release: a payload that is already a fixed
      // point of an applicable sanitizer is declassified for this dispatch
      // (their pii-redactor / demographics-redactor semantics — the egress
      // channel admits redacted derivations).
      let declassified = false;
      if (payload) {
        for (const san of this.policy.sanitizers ?? []) {
          if (!san.on.includes('egress_remedy') || !san.permits.audience) continue;
          const from = new Set(san.permits.audience.from);
          if (![...effFlow.audience].some((r) => from.has(r))) continue;
          if (san.apply(payload) === payload) {
            declassified = true;
            break;
          }
        }
      }
      if (!declassified) {
        for (const r of this.substitute(req.audience.contains, args)) {
          if (!audienceCanRead(effFlow, r)) {
            const deny: Mediation = {
              decision: 'deny',
              reasons: [`audience gate: "${r}" is not a reader of this flow`],
              organs,
              recovery: REC_AUDIENCE,
            };
            const san = this.applicableSanitizer('egress_remedy', effFlow);
            if (san && payload) {
              deny.remedy = {
                sanitizer: san.name,
                content: san.apply(payload),
                note: `a registered declassifier ("${san.name}") can release a sanitized version`,
              };
              deny.recovery = REC_AUDIENCE.concat(REC_REMEDY);
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
          return {
            decision: 'deny',
            reasons,
            organs,
            recovery: [
              `sequencing: effect "${e}" is established by: ${
                emitters.length ? emitters.join(', ') : '(no statically declared emitter — an annotator may emit it)'
              } — do that step first, then retry`,
            ],
          };
        }
      }
    }
    if (req?.effects?.excludes) {
      for (const e of req.effects.excludes) {
        if (this.effects.includes(e)) {
          reasons.push(`effect exclusion: "${e}" already established — this action is spent`);
          return {
            decision: 'deny',
            reasons,
            organs,
            recovery: [`one-shot: effect "${e}" is already established — this action cannot repeat within this episode`],
          };
        }
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
        };
      }
      if (ruling === 'reject') {
        return {
          decision: 'deny',
          reasons: [`authority "${authority}" rejected this action`],
          organs: organs.concat('O7-authority'),
          recovery: REC_AUTHORITY_REJECT,
        };
      }
      authorityConsult = { authority, tool: name, args };
    }

    // ---- O4-canary interdiction on egress ---------------------------------
    if (this.opts.organs && isEgress) {
      const scan = this.scanSink(name, spec, args);
      if (scan) {
        organs.push('O4-canary');
        const deny: Mediation = {
          decision: 'deny',
          reasons: [scan.reason],
          organs,
          recovery: REC_CANARY,
        };
        if (scan.redacted) {
          deny.remedy = {
            sanitizer: 'canary-interdiction',
            content: scan.redacted,
            note: 'sensitive values replaced with [redacted] — this payload may pass re-check',
          };
        }
        return deny;
      }
    }

    // ---- O7 echo confinement on egress ------------------------------------
    if (this.opts.organs && isEgress) {
      const echo = this.echoInSink(spec, args);
      if (echo) {
        organs.push('O7-confine');
        return {
          decision: 'deny',
          reasons: [`${ECHO_NOTE}: "${echo.span.slice(0, 80)}…"`],
          organs,
          recovery: REC_ECHO,
        };
      }
    }

    return { decision: 'allow', reasons: [], organs, authorityConsult };
  }

  /** After an allowed call dispatches: apply effects + record authority. */
  recordEffects(name: string, args: Record<string, string>, mediation: Mediation): void {
    if (args === null || typeof args !== 'object' || Array.isArray(args)) return;
    const spec = this.resolveSpec(name, args);
    if (!spec) return;
    const c = this.contract(spec, args);
    for (const e of c.effects ?? []) if (!this.effects.includes(e)) this.effects.push(e);
    if (mediation.authorityConsult) {
      const fixture = this.opts.authorities?.[mediation.authorityConsult.authority];
      const ruling =
        typeof fixture === 'function' ? fixture(mediation.authorityConsult.args) : (fixture ?? 'reject');
      this.authorityLog.push({ ...mediation.authorityConsult, ruling: ruling ?? 'reject' });
    }
  }

  /** All content-bearing param values of a call, joined for scanning.
   *  Default: EVERY string param — a hand-maintained key whitelist already
   *  missed `subject` on send_email (audit A-4). Policies that want a
   *  narrower scan opt in explicitly via sinkParams. */
  private sinkValues(spec: ToolSpec, args: Record<string, string>): string {
    const vals = spec.sinkParams
      ? spec.sinkParams.map((k) => args[k]).filter((v): v is string => typeof v === 'string')
      : Object.values(args).filter((v): v is string => typeof v === 'string');
    return vals.join('\n');
  }

  /** After the tool returns: apply the delta, screen the output, enroll. */
  observe(name: string, args: Record<string, string>, output: string): OutputObservation {
    // Malformed input degrades to a guarded no-op instead of crashing the
    // mediator (audit A-12).
    const out = typeof output === 'string' ? output : String(output ?? '');
    const a = args !== null && typeof args === 'object' && !Array.isArray(args) ? args : {};
    const spec = this.resolveSpec(name, a);
    const organs: string[] = [];
    const notes: string[] = [];
    if (!spec) return { content: out, injected: false, organs, notes };

    const c = this.contract(spec, a);
    if (c.delta?.trust !== undefined) {
      const t = Math.min(this.flow.trust, this.rank(c.delta.trust));
      this.flow = { ...this.flow, trust: t };
    }
    if (c.delta?.audience) {
      this.flow = meet(this.flow, makeLabel(this.flow.trust, c.delta.audience));
    }

    // O4 ledger: memory writes pin the write-time flow label + content digest
    // (both tool naming conventions — the corp/tau underscore form and the MCP slash form)
    if ((name === 'memory_write' || name === 'mcp/memory/write') && this.opts.organs) {
      organs.push('O4-ledger');
      this.ledger.set(String(a.key ?? ''), { label: this.flow, digest: screenCacheKey(out) });
    }
    if ((name === 'memory_read' || name === 'mcp/memory/read') && this.opts.organs) {
      const entry = this.ledger.get(String(a.key ?? ''));
      if (entry) {
        organs.push('O4-ledger');
        // O6 (audit A-18): the slot's content must still match its write-time
        // pin — a mismatch means the store was tampered with after the clean
        // write; ratchet the session fail-closed instead of joining the
        // clean write-time label.
        if (screenCacheKey(out) !== entry.digest) {
          this.faulted = true;
          this.flow = meet(this.flow, { trust: 0, audience: this.flow.audience });
          organs.push('O6-ratchet');
          notes.push(`memory slot "${a.key}" digest mismatch — session fail-closed`);
        } else {
          this.flow = meet(this.flow, entry.label);
          if (entry.label.trust === 0) notes.push(`memory slot "${a.key}" carries write-time taint`);
        }
      }
    }

    // O5 screen (content-side taint) + label-side quarantine: anything that
    // entered at suspicious trust is a source for echo confinement, whether
    // or not the screen's markers fired. The screen does NOT degrade the
    // flow's trust rank — trust rank is a property of the source channel
    // (policy labels); content taint manifests at sinks (echo, canary,
    // suppression). Keeping them separate preserves benign internal writes
    // from injected-but-quotable sources (e.g. a compliance file whose text
    // carries an embedded instruction must still allow the SAR filing).
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

    return { content: out, injected, organs, notes };
  }

  /** Register quarantined sources + extract commanded tokens.
   *
   *  Mode semantics (the inert-transduction bound):
   *   - 'label': the whole content is untrusted (it entered on a
   *     suspicious-labeled channel) — echo confinement covers all of it;
   *   - 'screen': only the instruction regions (marker sentence + next)
   *     are forbidden — facts outside them may be transducted verbatim.
   */
  private registerSuspicious(content: string, mode: 'label' | 'screen' = 'label'): void {
    // Bounded quarantine (audit A-14): over-cap registration fails CLOSED —
    // the session ratchets — rather than silently narrowing coverage.
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
        }
      }
    }
    for (const hit of screenContent(content)) {
      if (hit.id === 'respond-with-token') {
        // extract the token commanded by "respond with X ..." (case-tolerant,
        // audit A-20): anchored to the pattern's own grammar so ordinary
        // words in the span never register; stored uppercase, compared folded
        const m = /respond\s+with\s+['"]?([A-Za-z0-9]{3,})['"]?/i.exec(hit.span);
        if (m?.[1]) this.suppressedTokens.add(m[1].toUpperCase());
      }
    }
  }

  /** Canary scan of an egress sink's content params. Returns the deny
   *  reason plus, on the deny path only, a canary-safe version of the
   *  payload (every enrolled span replaced with [redacted]).
   *
   *  Matching is case-folded and whitespace-compacted (audits A-11 + A-20):
   *  the compact form spans the param join, so a token split across two
   *  params ("...CANARY-" + "7f3a2b@evil...") still trips. Numeric-secret
   *  matching mirrors enrollment exactly (extractNumericSecrets — plain /
   *  decimal / comma-thousands / fullwidth / space-separated runs are
   *  recognized symmetrically, audit A-1). */
  private scanSink(name: string, spec: ToolSpec, args: Record<string, string>): { reason: string; redacted: string | null } | null {
    const values = this.sinkValues(spec, args);
    if (!values) return null;
    // Case-folded, whitespace-compacted matching (audits A-11 + A-20): the
    // compact form also spans the param join, so a token split across two
    // params ("...CANARY-" + "7f3a2b@evil...") still trips.
    const compact = values.replace(/\s+/g, '').toLowerCase();
    let hit: string | null = null;
    for (const tok of this.canaryTokens) {
      if (compact.includes(tok.toLowerCase())) {
        hit = `canary token ${tok} in egress — content-side interdiction`;
        break;
      }
    }
    if (!hit) {
      const numeric = this.numericSecretHits(values);
      if (numeric.length > 0) {
        hit = `numeric secret ${numeric[0]!.key} from a sensitive store in egress — interdiction (strip it or route through a declassifier)`;
      }
    }
    if (!hit) {
      for (const tok of this.suppressedTokens) {
        if (compact.includes(tok.toLowerCase())) {
          hit = `token "${tok}" was commanded by untrusted content — suppression`;
          break;
        }
      }
    }
    if (!hit) return null;
    // deny path: build the redacted retryable payload (cold relative to
    // allows). The remedy rewrites the sink's PAYLOAD params — the message
    // body — not routing fields like `to`, so the agent can retry it as-is.
    const payload = this.payloadValues(spec, args);
    let redacted: string | null = null;
    if (payload) {
      for (const tok of this.canaryTokens) {
        if (compact.includes(tok.toLowerCase())) redacted = redactAll(redacted ?? payload, tok);
      }
      for (const { span } of this.numericSecretHits(payload)) {
        redacted = (redacted ?? payload).split(span).join('[redacted]');
      }
      for (const tok of this.suppressedTokens) {
        if (compact.includes(tok.toLowerCase())) redacted = redactAll(redacted ?? payload, tok);
      }
    }
    return { reason: hit, redacted };
  }

  /** The retryable payload of a sink call: the sinkParams join (default
   *  body/content/summary/text/task). Scans cover every string param (audit
   *  A-4); the remedy rewrites the message body, not routing fields. */
  private payloadValues(spec: ToolSpec, args: Record<string, string>): string | null {
    const keys = spec.sinkParams ?? ['body', 'content', 'summary', 'text', 'task'];
    const vals = keys.map((k) => args[k]).filter((v): v is string => typeof v === 'string');
    return vals.length > 0 ? vals.join('\n') : null;
  }

  /** Enrolled-numeric hits in scanned text: whole-run keys (a secret
   *  enrolled as "91,204.50" trips in any NFKC-equivalent rendering —
   *  audit A-1) and >=4-digit separator-delimited sub-runs, so separately
   *  enrolled secrets printed comma-adjacent ("1234,5678") cannot merge
   *  into a non-key (v1.2.0 audit F-2). */
  private numericSecretHits(text: string): { span: string; key: string }[] {
    if (this.numericCanaries.size === 0) return [];
    const hits: { span: string; key: string }[] = [];
    const seen = new Set<string>();
    for (const m of text.normalize('NFKC').matchAll(/\d[\d.,\s]*\d/g)) {
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
    if (!values || this.suspiciousSources.length === 0) return null;
    const grams = this.combinedEchoGrams();
    if (!echoesGrams(values, grams)) return null;
    // confirm with the precise matcher for the deny reason's span
    const match = findEchoes(values, this.suspiciousSources);
    return match.length > 0 ? match[0]! : null;
  }

  private applicableSanitizer(kind: 'fork_return' | 'egress_remedy', flow: Label): Sanitizer | null {
    for (const san of this.policy.sanitizers ?? []) {
      if (!san.on.includes(kind) || !san.permits.audience) continue;
      const from = new Set(san.permits.audience.from);
      // applies when the flow's narrowing sits inside the sanitizer's from-set
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

  /** Policy introspection: which tools statically establish an effect. */
  private effectEmitters(effect: string): string[] {
    const names = new Set<string>();
    for (const spec of this.policy.tools) {
      if ((spec.effects ?? []).includes(effect)) names.add(spec.name);
    }
    return [...names];
  }

  // ------------------------------------------------------------ fork return

  /**
   * The return channel: a child trajectory's final message crosses back to
   * the parent. Their semantics: a child that finished its own side effects
   * returns nothing, and the parent stays unaffected; a real return crosses
   * through any registered fork_return sanitizer (declassifier) — otherwise
   * the raw return joins the child's label into the parent flow.
   *
   * Delegation noninterference, content side (audit A-3): pass the child so
   * its quarantine registries merge into the parent BEFORE the return is
   * accepted — a child that observed injected content must not be able to
   * return it (or its commanded tokens) into the parent's clean flow. The
   * label-side laundering organ alone left this channel open.
   */
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
      const echo = this.opts.organs && echoesSuspicious(clean, this.suspiciousSources);
      if (echo) {
        return {
          content: '[return withheld: quoted untrusted content]',
          note: 'fork return echoed quarantined content — withheld',
          organs: organs.concat('O7-confine'),
        };
      }
      // the declassified derivation re-enters the parent clean
      return { content: clean, note: `sanitized through ${san.name}`, organs };
    }
    if (this.opts.organs && echoesSuspicious(content, this.suspiciousSources)) {
      return {
        content: '[return withheld: quoted untrusted content]',
        note: 'fork return echoed quarantined content — withheld',
        organs: organs.concat('O7-confine'),
      };
    }
    // raw return: the child's label joins the parent trajectory
    this.flow = meet(this.flow, childLabel);
    return { content, note: 'raw return — child label joined the parent flow', organs };
  }

  /** Merge a forked child's quarantine registries into this (parent)
   * engine — suspicious sources and commanded tokens cross back with the
   * return channel (audit A-3). */
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
  }

  // -------------------------------------------------------- answer channel

  /**
   * O7 answer confinement: the agent's own final answer is a sink (the
   * whitepaper's stance — the principal may see what the session may see, but
   * untrusted spans must not be parroted verbatim and commanded tokens must
   * not be emitted). Returns null when the draft is clean.
   *
   * Design note (audit A-10): canary/numeric interdiction deliberately does
   * NOT run on this channel — the principal is by definition inside the
   * flow's audience (they may see what the session saw); O4 interdiction
   * targets external egress, and the declassifier remedy covers releases.
   */
  checkAnswer(draft: string): { ok: true } | { ok: false; reason: string; organs: string[] } {
    if (!this.opts.organs) return { ok: true };
    const folded = String(draft ?? '').toUpperCase();
    for (const tok of this.suppressedTokens) {
      if (folded.includes(tok)) {
        return {
          ok: false,
          reason: `the answer echoes "${tok}", a token commanded by untrusted content — answer from the trusted facts instead`,
          organs: ['O5-screen', 'O7-confine'],
        };
      }
    }
    const match = findEchoes(String(draft ?? ''), this.suspiciousSources);
    if (match.length > 0) {
      return {
        ok: false,
        reason: `${ECHO_NOTE}: "${match[0]!.span.slice(0, 80)}…" — restate the fact, do not quote the source`,
        organs: ['O7-confine'],
      };
    }
    return { ok: true };
  }

  /** Memory init for a fresh session: screen + ledger-pin every entry. */
  initMemory(entries: Record<string, string>): void {
    if (!this.opts.organs) return;
    for (const [key, value] of Object.entries(entries)) {
      this.ledger.set(key, { label: this.flow, digest: screenCacheKey(String(value)) });
      if (isInjected(String(value))) {
        this.registerSuspicious(String(value), 'screen');
      }
    }
  }

  /** Suspicious labels for external stores (ATB inbox/customer db). */
  registerExternalSuspicious(content: string): void {
    if (!this.opts.organs) return;
    if (isInjected(content)) this.registerSuspicious(content, 'screen');
  }
}
