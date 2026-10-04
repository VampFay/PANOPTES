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
  /** Optional parameter selector (first match wins). */
  match?: (args: Record<string, string>) => boolean;
  delta?: Delta;
  requires?: Requires;
  effects?: string[];
  /** Egress sink: sink params are canary-scanned and echo-confined. */
  egress?: boolean;
  /** Which params carry content (default: egress ? all string params : []). */
  sinkParams?: string[];
  /** Annotator that supplies this tool's per-call contract. */
  annotator?: string;
  /** Authority consulted at dispatch (attention). */
  authority?: string;
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
  /** Tokens commanded by untrusted content (screen-derived suppression). */
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
    this.trustRank = new Map(policy.trustChain.map((t, i) => [t, i]));
    this.toolIndex = new Map();
    for (const spec of policy.tools) {
      const list = this.toolIndex.get(spec.name);
      if (list) list.push(spec);
      else this.toolIndex.set(spec.name, [spec]);
    }
    this.flow = makeLabel(this.rank(policy.boundary.trust), policy.boundary.audience);
    for (const c of opts.canaries ?? []) {
      this.seedCanaries.add(c);
      this.canaryTokens.add(c);
    }
  }

  private rank(t: string): number {
    return this.trustRank.get(t) ?? 0;
  }

  /** Start a fresh session/trace (the boundary label), keeping the ledger. */
  beginTrace(): void {
    this.flow = makeLabel(this.rank(this.policy.boundary.trust), this.policy.boundary.audience);
    this.suspiciousSources = [];
    this.suspiciousKeys.clear();
    this.suppressedTokens.clear();
    this.faulted = false;
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
   *   - tokens carrying the CANARY naming convention;
   *   - digit runs ≥ 4 that appear on lines with secret-field labels
   *     (ssn / ref / salary / compensation / account / …). Short digit runs
   *     on reference lines (release codes, project codes) stay quotable. */
  enrollWorldCanaries(store: string, content: string): void {
    if (!this.opts.organs) return;
    const sensitive = this.policy.sensitiveStores?.includes(store) ?? false;
    if (!sensitive) return;
    for (const tok of content.split(/[^A-Za-z0-9-]+/)) {
      if (tok.length >= 6 && /CANARY/i.test(tok)) this.canaryTokens.add(tok);
    }
    for (const line of content.split('\n')) {
      if (!SECRET_FIELD_LINE.test(line)) continue;
      for (const m of line.matchAll(/\d[\d,.]*\d/g)) {
        const digits = m[0].replace(/[,./]/g, '');
        if (digits.length >= 4) this.numericCanaries.add(digits);
      }
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

  /** Resolve the effective contract for a call (annotator overrides spec). */
  private contract(spec: ToolSpec, args: Record<string, string>): { delta?: Delta; requires?: Requires; effects?: string[]; isEgress?: boolean } {
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
      }
    }
    return { delta: spec.delta, requires: spec.requires, effects: spec.effects, isEgress: spec.egress };
  }

  private substitute(readers: readonly string[], args: Record<string, string>): string[] {
    return readers.map((r) => (r.startsWith('$') ? String(args[r.slice(1)] ?? r) : r));
  }

  check(name: string, args: Record<string, string>): Mediation {
    const reasons: string[] = [];
    const organs: string[] = [];
    const spec = this.resolveSpec(name, args);
    if (!spec) {
      return { decision: 'deny', reasons: [`unknown tool "${name}" — fail closed`], organs };
    }
    const c = this.contract(spec, args);
    const isEgress = spec.egress || c.isEgress === true;

    // ---- O6 ratchet -------------------------------------------------------
    if (this.opts.organs && this.faulted) {
      const isRead = !isEgress && !c.effects?.length;
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
      const payloadKeys = spec.sinkParams ?? ['body', 'content', 'summary', 'text', 'task'];
      const payload = payloadKeys
        .map((k) => args[k])
        .filter((v): v is string => typeof v === 'string')
        .join('\n');
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

  /** After the tool returns: apply the delta, screen the output, enroll. */
  observe(name: string, args: Record<string, string>, output: string): OutputObservation {
    const spec = this.resolveSpec(name, args);
    const organs: string[] = [];
    const notes: string[] = [];
    if (!spec) return { content: output, injected: false, organs, notes };

    const c = this.contract(spec, args);
    if (c.delta?.trust !== undefined) {
      const t = Math.min(this.flow.trust, this.rank(c.delta.trust));
      this.flow = { ...this.flow, trust: t };
    }
    if (c.delta?.audience) {
      this.flow = meet(this.flow, makeLabel(this.flow.trust, c.delta.audience));
    }

    // O4 ledger: memory writes pin the write-time flow label (both tool
    // naming conventions — the corp/tau underscore form and the MCP slash form)
    if ((name === 'memory_write' || name === 'mcp/memory/write') && this.opts.organs) {
      organs.push('O4-ledger');
      this.ledger.set(String(args.key ?? ''), { label: this.flow, digest: digest(output) });
    }
    if ((name === 'memory_read' || name === 'mcp/memory/read') && this.opts.organs) {
      const entry = this.ledger.get(String(args.key ?? ''));
      if (entry) {
        organs.push('O4-ledger');
        this.flow = meet(this.flow, entry.label);
        if (entry.label.trust === 0) notes.push(`memory slot "${args.key}" carries write-time taint`);
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
      const key = screenCacheKey(output);
      let verdict = this.screenCache.get(key);
      if (verdict === undefined) {
        verdict = isInjected(output);
        this.screenCache.set(key, verdict);
        if (this.screenCache.size > SCREEN_CACHE_MAX) {
          const oldest = this.screenCache.keys().next().value;
          if (oldest !== undefined) this.screenCache.delete(oldest);
        }
      }
      injected = verdict;
      const trustQuarantined = c.delta?.trust !== undefined && this.rank(c.delta.trust) === 0;
      if (injected) {
        this.registerSuspicious(output, 'screen');
        organs.push('O5-screen');
        notes.push('output carries embedded instructions — instruction regions quarantined');
      } else if (trustQuarantined) {
        this.registerSuspicious(output, 'label');
        notes.push('untrusted source registered for echo confinement');
      }
    }

    return { content: output, injected, organs, notes };
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
    const key = screenCacheKey(content);
    if (!this.suspiciousKeys.has(key)) {
      if (mode === 'label') {
        this.suspiciousKeys.add(key);
        this.suspiciousSources.push(content);
        this.echoGrams = null;
      } else {
        for (const region of instructionRegions(content)) {
          const rk = screenCacheKey(region);
          if (!this.suspiciousKeys.has(rk)) {
            this.suspiciousKeys.add(rk);
            this.suspiciousSources.push(region);
            this.echoGrams = null;
          }
        }
      }
    }
    for (const hit of screenContent(content)) {
      if (hit.id === 'respond-with-token') {
        const m = /['"]?([A-Z0-9]{3,})['"]?/.exec(hit.span);
        if (m?.[1]) this.suppressedTokens.add(m[1]);
      }
    }
  }

/** Canary scan of an egress sink's content params. Returns the deny
   *  reason plus, on the deny path only, a canary-safe version of the
   *  payload (every enrolled span replaced with [redacted]).
   *
   *  Numeric-secret matching mirrors enrollment exactly: a maximal
   *  `[\d,.]` run is stripped of separators and looked up whole, and each
   *  ≥4-digit comma/dot-delimited sub-run is looked up too — so a secret
   *  enrolled as "91,204.50" (key 9120450) cannot evade by crossing a
   *  decimal point, and secrets enrolled separately ("1234", "5678")
   *  cannot evade by comma juxtaposition ("1234,5678"). Found in the
   *  v1.2.0 codebase audit; regression-tested in tests/hardening.test.ts. */
  private scanNumbers(values: string): { span: string; key: string }[] {
    const hits: { span: string; key: string }[] = [];
    if (this.numericCanaries.size === 0) return hits;
    for (const m of values.matchAll(/\d[\d,.]*\d/g)) {
      const run = m[0]!;
      const full = run.replace(/[,./]/g, '');
      if (this.numericCanaries.has(full)) {
        hits.push({ span: run, key: full });
        continue;
      }
      for (const part of run.split(/[,./]+/)) {
        if (part.length >= 4 && this.numericCanaries.has(part)) hits.push({ span: part, key: part });
      }
    }
    return hits;
  }

  private scanSink(name: string, spec: ToolSpec, args: Record<string, string>): { reason: string; redacted: string | null } | null {
    const keys = spec.sinkParams ?? ['body', 'content', 'summary', 'text', 'task'];
    const values = keys
      .map((k) => args[k])
      .filter((v): v is string => typeof v === 'string')
      .join('\n');
    if (!values) return null;
    let hit: string | null = null;
    for (const tok of this.canaryTokens) {
      if (values.includes(tok)) {
        hit = `canary token ${tok} in egress — content-side interdiction`;
        break;
      }
    }
    if (!hit) {
      const numeric = this.scanNumbers(values);
      if (numeric.length > 0) {
        hit = `numeric secret ${numeric[0]!.key} from a sensitive store in egress — interdiction (strip it or route through a declassifier)`;
      }
    }
    if (!hit) {
      for (const tok of this.suppressedTokens) {
        if (values.includes(tok)) {
          hit = `token "${tok}" was commanded by untrusted content — suppression`;
          break;
        }
      }
    }
    if (!hit) return null;
    // deny path: build the redacted payload (cold relative to allows)
    let redacted: string | null = null;
    for (const tok of this.canaryTokens) {
      if (values.includes(tok)) redacted = (redacted ?? values).split(tok).join('[redacted]');
    }
    for (const { span } of this.scanNumbers(values)) {
      redacted = (redacted ?? values).split(span).join('[redacted]');
    }
    for (const tok of this.suppressedTokens) {
      if (values.includes(tok)) redacted = (redacted ?? values).split(tok).join('[redacted]');
    }
    return { reason: hit, redacted };
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
    const keys = spec.sinkParams ?? ['body', 'content', 'summary', 'text', 'task'];
    const values = keys
      .map((k) => args[k])
      .filter((v): v is string => typeof v === 'string')
      .join('\n');
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
   */
  forkReturn(childLabel: Label, content: string): { content: string; note: string; organs: string[] } {
    const organs: string[] = [];
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

  // -------------------------------------------------------- answer channel

  /**
   * O7 answer confinement: the agent's own final answer is a sink (the
   * whitepaper's stance — the principal may see what the session may see, but
   * untrusted spans must not be parroted verbatim and commanded tokens must
   * not be emitted). Returns null when the draft is clean.
   */
  checkAnswer(draft: string): { ok: true } | { ok: false; reason: string; organs: string[] } {
    if (!this.opts.organs) return { ok: true };
    for (const tok of this.suppressedTokens) {
      if (draft.includes(tok)) {
        return {
          ok: false,
          reason: `the answer echoes "${tok}", a token commanded by untrusted content — answer from the trusted facts instead`,
          organs: ['O5-screen', 'O7-confine'],
        };
      }
    }
    const match = findEchoes(draft, this.suspiciousSources);
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
      this.ledger.set(key, { label: this.flow, digest: digest(value) });
      if (isInjected(value)) {
        this.registerSuspicious(value, 'screen');
      }
    }
  }

  /** Suspicious labels for external stores (ATB inbox/customer db). */
  registerExternalSuspicious(content: string): void {
    if (!this.opts.organs) return;
    if (isInjected(content)) this.registerSuspicious(content, 'screen');
  }
}

function digest(s: string): string {
  // 96-bit composite (see screen.ts screenCacheKey rationale) — the ledger
  // digest is the forensic identity of a memory slot's content; 32-bit FNV
  // alone was collision-craftable.
  let h1 = 0x811c9dc5;
  let h2 = 0x1b873593;
  let h3 = 0x85ebca6b;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    h1 ^= c;
    h1 = Math.imul(h1, 0x01000193);
    h2 ^= c;
    h2 = Math.imul(h2, 0x9e3779b1);
    h3 ^= c;
    h3 = Math.imul(h3, 0xc2b2ae35);
  }
  return `${(h1 >>> 0).toString(16).padStart(8, '0')}${(h2 >>> 0).toString(16).padStart(8, '0')}${(h3 >>> 0).toString(16).padStart(8, '0')}`;
}
