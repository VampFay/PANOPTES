/**
 * PANOPTES prototype core — the session engine.
 *
 * Fast path: APPA-class deterministic label algebra (per-trace accumulation
 * of trust/audience deltas + pre-call gate checks) — semantically identical
 * to what the real OpenAPPA binary does within one replay session.
 *
 * Organs layered on top (the prototype's contribution):
 *   O4-ledger   — cross-session memory taint: writes record the flow label at
 *                 write time; reads join that label back in, so poison
 *                 persisted in one session re-enters the next.
 *   O4-canary   — egress interdiction: outgoing string params are scanned for
 *                 registered canary tokens; a hit denies regardless of labels
 *                 (content-side detector for when labels lie, whitepaper F1).
 *   O6-ratchet  — fail-closed memory integrity: a memory read whose content
 *                 hash mismatches the ledger pin degrades the session to
 *                 suspicious and flags the fault (the 17/50 story).
 */

import { audienceCanRead, meet, PUBLIC_LABEL, type Label } from './label';
import { resolveTool, type ToolSpec } from './policy';

export type Decision = {
  tool: string;
  /** Canonical tool identity that fired (incl. glob selector). */
  matched: string;
  decision: 'allow' | 'deny';
  reasons: string[];
  /** Which PANOPTES organs participated in this decision. */
  organs: string[];
};

export type EngineOptions = {
  /** PANOPTES organs on (ledger + canary + ratchet). */
  organs: boolean;
  /** Canary registry (planted tokens), for the immune organ. */
  canaries?: readonly string[];
  /** Policy variant hook (blunt-memory arm annotates memory reads). */
  memoryReadDelta?: (label: Label) => Label;
};

type LedgerEntry = {
  label: Label;
  /** Pinned content digest at write time (ratchet integrity check). */
  digest: string;
};

function hashString(s: string): string {
  // FNV-1a — deterministic, dependency-free; used only for fault simulation.
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16);
}

export class PanoptesEngine {
  private readonly opts: EngineOptions;
  /** Current trajectory label — resets to the boundary each trace. */
  private flow: Label = PUBLIC_LABEL;
  /** Cross-trace memory ledger (O4). Survives beginTrace(). */
  private readonly ledger = new Map<string, LedgerEntry>();
  /** Fail-closed fault flag for the current trace (O6). */
  private faulted = false;
  /** True when this trace's degradation came from a ledger join (O4) — so
   *  downstream denials can name the organ that caused them. */
  private ledgerTainted = false;

  constructor(opts: EngineOptions) {
    this.opts = opts;
  }

  /** Start a fresh session/trace (the boundary label), keeping the ledger. */
  beginTrace(): void {
    this.flow = PUBLIC_LABEL;
    this.faulted = false;
    this.ledgerTainted = false;
  }

  /** Simulated memory fault (corrupted slot): ratchet to fail-closed. */
  injectMemoryFault(): void {
    if (!this.opts.organs) return;
    this.faulted = true;
    this.flow = meet(this.flow, { trust: 0, audience: this.flow.audience });
  }

  get currentLabel(): Label {
    return this.flow;
  }

  get failClosed(): boolean {
    return this.faulted;
  }

  decide(name: string, params: Record<string, string>): Decision {
    const reasons: string[] = [];
    const organs: string[] = [];

    const spec: ToolSpec | null = resolveTool(name, params);
    if (!spec) {
      return { tool: name, matched: name, decision: 'deny', reasons: ['unknown tool — fail closed'], organs };
    }

    // ---- O6 ratchet: fail-closed state blocks everything but reads ------
    if (this.opts.organs && this.faulted) {
      const isRead = !spec.egress && spec.name !== 'mcp/sys/exec' && spec.name !== 'mcp/memory/write';
      if (!isRead) {
        organs.push('O6-ratchet');
        return {
          tool: name,
          matched: spec.name,
          decision: 'deny',
          reasons: ['memory integrity fault — session fail-closed until sanitizer pass'],
          organs,
        };
      }
    }

    // ---- memory read: ledger join (O4) ------------------------------------
    if (spec.name === 'mcp/memory/read') {
      if (this.opts.organs) {
        const entry = this.ledger.get(params.key);
        if (entry) {
          organs.push('O4-ledger');
          this.ledgerTainted = true;
          if (hashString(String(params.content ?? '')) !== entry.digest && params.content !== undefined) {
            // integrity mismatch — ratchet fail-closed
            this.faulted = true;
            this.flow = meet(this.flow, { trust: 0, audience: this.flow.audience });
            organs.push('O6-ratchet');
            reasons.push('memory slot digest mismatch — fail-closed');
          } else {
            this.flow = meet(this.flow, entry.label);
            if (entry.label.trust === 0) {
              reasons.push(`memory slot "${params.key}" carries taint from its write-time flow`);
            }
          }
        }
      }
      if (this.opts.memoryReadDelta) {
        this.flow = this.opts.memoryReadDelta(this.flow);
      }
    }

    // ---- gate check (APPA `requires`) --------------------------------------
    const requiredAudience = spec.requiresAudienceFrom ? spec.requiresAudienceFrom(params) : (spec.requires?.audience ?? []);
    const trustFloor = spec.requires?.trust ?? 0;
    if (this.flow.trust < trustFloor) {
      if (this.ledgerTainted) organs.push('O4-ledger');
      reasons.push(
        `trust floor: flow at ${this.flow.trust} < required ${trustFloor}` +
          (this.ledgerTainted ? ' (ledger taint joined in)' : ''),
      );
      return { tool: name, matched: spec.name, decision: 'deny', reasons, organs };
    }
    for (const r of requiredAudience) {
      if (!audienceCanRead(this.flow, r)) {
        reasons.push(`audience gate: "${r}" is not a reader of this flow`);
        return { tool: name, matched: spec.name, decision: 'deny', reasons, organs };
      }
    }

    // ---- O4 canary interdiction on egress ----------------------------------
    if (this.opts.organs && spec.egress && this.opts.canaries && this.opts.canaries.length > 0) {
      const values = Object.values(params).filter((v) => typeof v === 'string');
      for (const v of values) {
        for (const token of this.opts.canaries) {
          if (v.includes(token)) {
            organs.push('O4-canary');
            reasons.push(`canary token ${token} found in egress — content-side interdiction (labels said public)`);
            return { tool: name, matched: spec.name, decision: 'deny', reasons, organs };
          }
        }
      }
    }

    // ---- allowed: apply the delta to the trajectory ------------------------
    if (spec.name === 'mcp/memory/write') {
      if (this.opts.organs) {
        organs.push('O4-ledger');
        this.ledger.set(params.key, {
          label: this.flow,
          digest: hashString(String(params.value ?? '')),
        });
      }
    } else {
      this.flow = spec.delta(this.flow);
    }

    return { tool: name, matched: spec.name, decision: 'allow', reasons: organs.length > 0 ? [`ledger updated (${organs.join(', ')})`] : [], organs };
  }
}
