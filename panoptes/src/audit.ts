/**
 * PANOPTES audit stream — structured, append-only decision records.
 *
 * Every mediation the engine performs is a security-relevant event. The
 * `AuditedSession` wrapper mediates through an `Observatory` and writes one
 * structured event per action to any number of sinks, without touching the
 * engine's hot path (the sink call happens after the decision is made).
 *
 * Sinks:
 *   - JsonlAuditSink  — newline-delimited JSON; the logstash/ELK-native format
 *   - OtelAuditSink   — OpenTelemetry-compatible span-event envelopes
 *
 * Events are immutable facts: timestamp, session, tool, decision, reasons,
 * organs engaged, and decision latency. They are the forensic record the
 * whitepaper's auditability claim rests on.
 */

import { appendFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import type { Mediation, Observatory, OutputObservation } from './core/v2';

export type AuditEvent = {
  /** ISO-8601 timestamp. */
  ts: string;
  level: 'info' | 'warn' | 'deny';
  kind:
    | 'session_begin'
    | 'session_end'
    | 'decision'
    | 'observation'
    | 'answer'
    | 'rotation'
    | 'fault';
  session: string;
  parentSessionId?: string;
  tool?: string;
  decision?: 'allow' | 'deny';
  reasons?: string[];
  organs?: string[];
  /** Decision latency in microseconds (measured around engine.check). */
  latencyUs?: number;
  detail?: Record<string, unknown>;
};

export interface AuditSink {
  write(event: AuditEvent): void;
  close?(): void;
}

/** Fan-out composite. */
export class CompositeSink implements AuditSink {
  private readonly sinks: AuditSink[];
  constructor(...sinks: AuditSink[]) {
    this.sinks = sinks;
  }
  write(event: AuditEvent): void {
    for (const s of this.sinks) s.write(event);
  }
  close(): void {
    for (const s of this.sinks) s.close?.();
  }
}

/** Newline-delimited JSON to a file path (append) or stdout when omitted. */
export class JsonlAuditSink implements AuditSink {
  private readonly path?: string;
  constructor(path?: string) {
    this.path = path;
    if (path) {
      const dir = dirname(path);
      if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
      if (!existsSync(path)) appendFileSync(path, '');
    }
  }
  write(event: AuditEvent): void {
    const line = JSON.stringify(event) + '\n';
    if (this.path) {
      appendFileSync(this.path, line);
    } else {
      process.stdout.write(line);
    }
  }
}

/** High-throughput buffered JSONL sink with periodic batch flushing. */
export class BufferedJsonlAuditSink implements AuditSink {
  private readonly path?: string;
  private readonly bufferSize: number;
  private buffer: string[] = [];
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(path?: string, bufferSize = 100, flushIntervalMs = 1000) {
    this.path = path;
    this.bufferSize = bufferSize;
    if (path) {
      const dir = dirname(path);
      if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
      if (!existsSync(path)) appendFileSync(path, '');
    }
    if (flushIntervalMs > 0) {
      this.timer = setInterval(() => this.flush(), flushIntervalMs);
      if (this.timer && typeof this.timer === 'object' && 'unref' in this.timer) {
        (this.timer as { unref(): void }).unref();
      }
    }
  }

  write(event: AuditEvent): void {
    this.buffer.push(JSON.stringify(event) + '\n');
    if (this.buffer.length >= this.bufferSize) {
      this.flush();
    }
  }

  flush(): void {
    if (this.buffer.length === 0) return;
    const batch = this.buffer.join('');
    this.buffer = [];
    if (this.path) {
      appendFileSync(this.path, batch);
    } else {
      process.stdout.write(batch);
    }
  }

  close(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.flush();
  }
}

/**
 * OpenTelemetry-compatible envelope: each audit event becomes a span event on
 * a per-session span. Consumed by OTel collectors that accept JSON span
 * exports (e.g. via the OTLP JSON gateway or file-based tails).
 */
export class OtelAuditSink implements AuditSink {
  private readonly traceId: string;
  private readonly path?: string;
  private spanSeq = 0;

  constructor(session: string, path?: string) {
    // Deterministic trace id from the session name (FNV-1a, hex) so restarts
    // keep writing to the same logical trace.
    let h = 0x811c9dc5;
    for (let i = 0; i < session.length; i++) {
      h ^= session.charCodeAt(i);
      h = Math.imul(h, 0x01000193);
    }
    this.traceId = (h >>> 0).toString(16).padStart(8, '0').repeat(2);
    this.path = path;
  }

  write(event: AuditEvent): void {
    const spanId = (this.spanSeq++).toString(16).padStart(8, '0').padEnd(16, '0').slice(0, 16);
    const span = {
      traceId: this.traceId,
      spanId,
      name: `panoptes.${event.kind}`,
      kind: 1, // INTERNAL
      startTimeUnixNano: Date.parse(event.ts) * 1_000_000,
      endTimeUnixNano: Date.parse(event.ts) * 1_000_000,
      attributes: {
        'panoptes.session': event.session,
        'panoptes.level': event.level,
        ...(event.parentSessionId ? { 'panoptes.parent_session': event.parentSessionId } : {}),
        ...(event.tool !== undefined ? { 'panoptes.tool': event.tool } : {}),
        ...(event.decision !== undefined ? { 'panoptes.decision': event.decision } : {}),
        ...(event.reasons ? { 'panoptes.reasons': event.reasons.join(' | ') } : {}),
        ...(event.organs ? { 'panoptes.organs': event.organs.join(',') } : {}),
        ...(event.latencyUs !== undefined ? { 'panoptes.latency_us': event.latencyUs } : {}),
      },
      events:
        event.kind === 'decision'
          ? [
              {
                name: event.decision === 'deny' ? 'denied' : 'allowed',
                timeUnixNano: Date.parse(event.ts) * 1_000_000,
                attributes: event.reasons ? { reasons: event.reasons.join(' | ') } : {},
              },
            ]
          : [],
      status: event.level === 'deny' ? { code: 2, message: 'mediation denial' } : { code: 1 },
    };
    const line = JSON.stringify(span) + '\n';
    if (this.path) {
      appendFileSync(this.path, line);
    } else {
      process.stdout.write(line);
    }
  }
}

/** OpenTelemetry OTLP/HTTP export sink streaming JSON spans with fork lineage. */
export class OtlpHttpAuditSink implements AuditSink {
  private readonly endpoint: string;
  private readonly headers: Record<string, string>;
  private readonly traceId: string;
  private spanSeq = 0;

  constructor(endpoint: string, session: string, headers: Record<string, string> = {}) {
    this.endpoint = endpoint.replace(/\/+$/, '') + (endpoint.endsWith('/v1/traces') ? '' : '/v1/traces');
    this.headers = { 'content-type': 'application/json', ...headers };
    let h = 0x811c9dc5;
    for (let i = 0; i < session.length; i++) {
      h ^= session.charCodeAt(i);
      h = Math.imul(h, 0x01000193);
    }
    this.traceId = (h >>> 0).toString(16).padStart(8, '0').repeat(2);
  }

  write(event: AuditEvent): void {
    const spanId = (this.spanSeq++).toString(16).padStart(8, '0').padEnd(16, '0').slice(0, 16);
    const parentSpanId = event.parentSessionId
      ? (0x811c9dc5 ^ event.parentSessionId.length).toString(16).padStart(16, '0').slice(0, 16)
      : undefined;

    const payload = {
      resourceSpans: [
        {
          resource: {
            attributes: [
              { key: 'service.name', value: { stringValue: 'panoptes' } },
              { key: 'service.version', value: { stringValue: '1.3.0' } },
            ],
          },
          scopeSpans: [
            {
              scope: { name: 'panoptes.audit' },
              spans: [
                {
                  traceId: this.traceId,
                  spanId,
                  ...(parentSpanId ? { parentSpanId } : {}),
                  name: `panoptes.${event.kind}`,
                  kind: 1,
                  startTimeUnixNano: String(Date.parse(event.ts) * 1_000_000),
                  endTimeUnixNano: String(Date.parse(event.ts) * 1_000_000),
                  attributes: [
                    { key: 'panoptes.session', value: { stringValue: event.session } },
                    { key: 'panoptes.level', value: { stringValue: event.level } },
                    ...(event.tool !== undefined ? [{ key: 'panoptes.tool', value: { stringValue: event.tool } }] : []),
                    ...(event.decision !== undefined ? [{ key: 'panoptes.decision', value: { stringValue: event.decision } }] : []),
                    ...(event.reasons ? [{ key: 'panoptes.reasons', value: { stringValue: event.reasons.join(' | ') } }] : []),
                    ...(event.organs ? [{ key: 'panoptes.organs', value: { stringValue: event.organs.join(',') } }] : []),
                    ...(event.latencyUs !== undefined ? [{ key: 'panoptes.latency_us', value: { doubleValue: event.latencyUs } }] : []),
                  ],
                  status: event.level === 'deny' ? { code: 2, message: 'mediation denial' } : { code: 1 },
                },
              ],
            },
          ],
        },
      ],
    };

    fetch(this.endpoint, {
      method: 'POST',
      headers: this.headers,
      body: JSON.stringify(payload),
    }).catch(() => {});
  }
}

/** ArcSight / Splunk Common Event Format (CEF) SIEM audit sink. */
export class CefAuditSink implements AuditSink {
  private readonly path?: string;

  constructor(path?: string) {
    this.path = path;
    if (path) {
      const dir = dirname(path);
      if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
      if (!existsSync(path)) appendFileSync(path, '');
    }
  }

  write(event: AuditEvent): void {
    const severity = event.level === 'deny' ? '7' : event.level === 'warn' ? '5' : '1';
    const extParts: string[] = [
      `suser=${event.session}`,
      `act=${event.decision ?? event.kind}`,
    ];
    if (event.tool) extParts.push(`cs1=${event.tool}`, `cs1Label=Tool`);
    if (event.latencyUs !== undefined) extParts.push(`cn1=${event.latencyUs}`, `cn1Label=LatencyUs`);
    if (event.reasons?.length) extParts.push(`msg=${event.reasons.join('; ')}`);
    if (event.organs?.length) extParts.push(`cs2=${event.organs.join(',')}`, `cs2Label=Organs`);

    const cef = `CEF:0|PANOPTES|Core|1.3.0|${event.kind}|${event.decision ?? event.kind}|${severity}|${extParts.join(' ')}\n`;
    if (this.path) {
      appendFileSync(this.path, cef);
    } else {
      process.stdout.write(cef);
    }
  }
}

/**
 * A mediated session: every call passes through the engine and lands in the
 * audit sink(s) as a structured event. The engine stays untouched — the
 * wrapper adds the record-keeping the whitepaper's auditability pillar needs.
 */
export class AuditedSession {
  readonly engine: Observatory;
  private readonly sink: AuditSink;
  private readonly session: string;
  private readonly t0 = Date.now();
  private decisionCount = 0;
  private denialCount = 0;

  constructor(engine: Observatory, sink: AuditSink, session: string) {
    this.engine = engine;
    this.sink = sink;
    this.session = session;
    this.sink.write({
      ts: new Date().toISOString(),
      level: 'info',
      kind: 'session_begin',
      session,
      detail: {
        policyBoundary: `${engine.currentLabel.trust}/${[...engine.currentLabel.audience].join('+')}`,
        startedAt: new Date(this.t0).toISOString(),
      },
    });
  }

  get id(): string {
    return this.session;
  }

  get stats(): { decisions: number; denials: number; denialRate: number; durationMs: number } {
    return {
      decisions: this.decisionCount,
      denials: this.denialCount,
      denialRate: this.decisionCount === 0 ? 0 : this.denialCount / this.decisionCount,
      durationMs: Date.now() - this.t0,
    };
  }

  beginTrace(): void {
    this.engine.beginTrace();
    this.sink.write({ ts: new Date().toISOString(), level: 'info', kind: 'session_begin', session: this.session, detail: { trace: 'fresh' } });
  }

  check(name: string, args: Record<string, string>): Mediation {
    const start = performance.now();
    const mediation = this.engine.check(name, args);
    const latencyUs = Math.round((performance.now() - start) * 1000);
    this.decisionCount += 1;
    if (mediation.decision === 'deny') this.denialCount += 1;
    this.sink.write({
      ts: new Date().toISOString(),
      level: mediation.decision === 'deny' ? 'deny' : 'info',
      kind: 'decision',
      session: this.session,
      tool: name,
      decision: mediation.decision,
      reasons: mediation.reasons,
      organs: mediation.organs,
      latencyUs,
    });
    return mediation;
  }

  recordEffects(name: string, args: Record<string, string>, mediation: Mediation): void {
    this.engine.recordEffects(name, args, mediation);
  }

  observe(name: string, args: Record<string, string>, output: string): OutputObservation {
    const t0 = performance.now();
    const observation = this.engine.observe(name, args, output);
    const latencyUs = +((performance.now() - t0) * 1000).toFixed(2);
    this.sink.write({
      ts: new Date().toISOString(),
      level: observation.injected ? 'warn' : 'info',
      kind: 'observation',
      session: this.session,
      tool: name,
      organs: observation.organs,
      latencyUs,
      detail: { injected: observation.injected, notes: observation.notes },
    });
    return observation;
  }

  checkAnswer(draft: string): { ok: boolean; reason?: string; organs?: string[]; sanitizedDraft: string } {
    const verdict = this.engine.checkAnswer(draft);
    this.sink.write({
      ts: new Date().toISOString(),
      level: verdict.ok ? 'info' : 'deny',
      kind: 'answer',
      session: this.session,
      decision: verdict.ok ? ('allow' as const) : ('deny' as const),
      reasons: verdict.ok ? undefined : (verdict.reason ? [verdict.reason] : undefined),
      organs: verdict.ok ? undefined : verdict.organs,
    });
    return verdict;
  }

  forkSession(childId?: string): AuditedSession {
    const childEngine = this.engine.forkSession();
    const cid = childId ?? `${this.session}-child-${Date.now().toString(36)}`;
    const childSession = new AuditedSession(childEngine, this.sink, cid);
    this.sink.write({
      ts: new Date().toISOString(),
      level: 'info',
      kind: 'session_begin',
      session: cid,
      parentSessionId: this.session,
      detail: { forkLineage: this.session },
    });
    return childSession;
  }

  rotateCanaries(): { retired: number; generation: number } {
    const report = this.engine.rotateCanaries();
    this.sink.write({
      ts: new Date().toISOString(),
      level: 'info',
      kind: 'rotation',
      session: this.session,
      detail: { ...report },
    });
    return report;
  }

  fault(reason: string): void {
    this.engine.injectMemoryFault();
    this.sink.write({
      ts: new Date().toISOString(),
      level: 'deny',
      kind: 'fault',
      session: this.session,
      reasons: [reason],
      organs: ['O6-ratchet'],
    });
  }

  end(): { decisions: number; denials: number; durationMs: number } {
    const stats = this.stats;
    this.sink.write({
      ts: new Date().toISOString(),
      level: 'info',
      kind: 'session_end',
      session: this.session,
      detail: { decisions: stats.decisions, denials: stats.denials, durationMs: stats.durationMs },
    });
    this.sink.close?.();
    return stats;
  }
}
