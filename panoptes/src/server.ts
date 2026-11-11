/**
 * PANOPTES sidecar — an HTTP mediation service.
 *
 * Runs the engine as a stateful process beside the agent host:
 *
 *   bun run src/cli.ts serve --policy examples/policies/bench.json \
 *        --port 8787 --token <secret> --audit audit.jsonl
 *
 * Binds 127.0.0.1 by default (--host / PANOPTES_HOST to override — e.g.
 * 0.0.0.0 when fronted by your own TLS-terminating proxy).
 *
 * Sessions hold one `Observatory` each (ledger + canary registry are
 * per-session; the policy is shared). Every mediated call lands in the
 * audit stream. REST + JSON, OpenAPI 3.1 spec served at /openapi.json.
 *
 * This is a reference sidecar: front it with TLS and your authn/proxy
 * stack in production, and keep the port inside the agent host's trust
 * domain.
 */

import http from 'node:http';
import { watch } from 'node:fs';
import { Observatory, type PolicyDoc, type Label } from './core/v2';
import { loadPolicy } from './policy-load';
import { AuditedSession, JsonlAuditSink, CompositeSink, type AuditEvent, type AuditSink } from './audit';
import { OPENAPI_SPEC } from './openapi';
import { VERSION } from './version';

type SessionRecord = {
  session: AuditedSession;
  memory: MemorySink;
  events: AuditEvent[];
  tenantId: string;
  lastAccess: number;
};

type LedgerEntry = { label: Label; digest: string; outDigest?: string };

const MAX_BODY_BYTES = 1_048_576; // 1 MB cap

/**
 * Token-bucket rate limiter for per-tenant throughput protection.
 */
export class TokenBucket {
  private tokens: number;
  private lastRefill: number;
  private readonly capacity: number;
  private readonly fillRate: number; // tokens per ms
  private readonly clock: () => number;

  constructor(rps: number, burst?: number, clock?: () => number) {
    this.fillRate = Math.max(0.0001, rps / 1000);
    this.capacity = burst ?? Math.max(10, rps * 2);
    this.tokens = this.capacity;
    this.clock = clock ?? (() => (typeof performance !== 'undefined' ? performance.now() : Date.now()));
    this.lastRefill = this.clock();
  }

  tryConsume(cost = 1): boolean {
    const now = this.clock();
    if (now < this.lastRefill) {
      // Clock skew detected (wall clock adjusted backward). Anchor to current timestamp.
      this.lastRefill = now;
    }
    const elapsed = Math.max(0, now - this.lastRefill);
    this.tokens = Math.min(this.capacity, this.tokens + elapsed * this.fillRate);
    this.lastRefill = now;
    if (this.tokens >= cost) {
      this.tokens -= cost;
      return true;
    }
    return false;
  }
}

/** Parses per-tenant tokens from JSON or comma-separated pairs: "tenantA:secretA,tenantB:secretB" */
export function parseTenantTokens(raw?: string): Map<string, string> {
  const map = new Map<string, string>();
  if (!raw) return map;
  const s = raw.trim();
  if (s.startsWith('{')) {
    try {
      const obj = JSON.parse(s);
      for (const [k, v] of Object.entries(obj)) {
        if (typeof v === 'string') map.set(k, v);
      }
      return map;
    } catch {}
  }
  for (const part of s.split(',')) {
    const idx = part.indexOf(':');
    if (idx > 0) {
      const t = part.slice(0, idx).trim();
      const tok = part.slice(idx + 1).trim();
      if (t && tok) map.set(t, tok);
    }
  }
  return map;
}

/** Validates and resolves the tenant from X-Panoptes-Tenant. */
export function resolveTenant(req: Request): { ok: true; tenant: string } | { ok: false; error: string; status: number } {
  const header = req.headers.get('x-panoptes-tenant');
  if (header !== null) {
    if (/[\r\n\0]/.test(header)) {
      return { ok: false, error: 'invalid X-Panoptes-Tenant header: CRLF and null characters prohibited', status: 400 };
    }
    const trimmed = header.trim();
    if (!/^[a-zA-Z0-9._-]{1,64}$/.test(trimmed)) {
      return { ok: false, error: 'invalid X-Panoptes-Tenant header; must match /^[a-zA-Z0-9._-]{1,64}$/', status: 400 };
    }
    return { ok: true, tenant: trimmed };
  }
  return { ok: true, tenant: 'default' };
}

/**
 * Bounded ledger map capped per tenant at cap entries (default 65,536).
 * Evicts oldest clean entries first; ratchets fail-closed if tainted entries overflow.
 * Maintains an O(1) cleanKeys set so eviction never performs a linear scan.
 */
export class BoundedLedger extends Map<string, LedgerEntry> {
  readonly cap: number;
  private onOverflowFailClosed?: () => void;
  private cleanKeys = new Set<string>();

  constructor(cap = 65_536, onOverflowFailClosed?: () => void) {
    super();
    this.cap = cap;
    this.onOverflowFailClosed = onOverflowFailClosed;
  }

  isTainted(entry: LedgerEntry): boolean {
    return !entry.label.audience.has('public');
  }

  override set(key: string, value: LedgerEntry): this {
    if (this.has(key)) {
      super.set(key, value);
      if (this.isTainted(value)) this.cleanKeys.delete(key);
      else this.cleanKeys.add(key);
      return this;
    }
    if (this.size >= this.cap) {
      // O(1) oldest clean key eviction via insertion-ordered Set
      const cleanKey = this.cleanKeys.values().next().value;
      if (cleanKey !== undefined) {
        this.cleanKeys.delete(cleanKey);
        this.delete(cleanKey);
      } else {
        // Tainted entries overflow! Evict oldest and ratchet fail-closed
        const oldest = this.keys().next().value;
        if (oldest !== undefined) {
          this.cleanKeys.delete(oldest);
          this.delete(oldest);
        }
        if (this.onOverflowFailClosed) {
          this.onOverflowFailClosed();
        }
      }
    }
    super.set(key, value);
    if (!this.isTainted(value)) this.cleanKeys.add(key);
    return this;
  }

  override delete(key: string): boolean {
    this.cleanKeys.delete(key);
    return super.delete(key);
  }

  override clear(): void {
    this.cleanKeys.clear();
    super.clear();
  }
}

/** In-memory ring + optional JSONL file sink per session with pub/sub for live SSE streaming. */
export class MemorySink implements AuditSink {
  readonly events: AuditEvent[] = [];
  private readonly cap: number;
  private readonly subscribers = new Set<(event: AuditEvent) => void>();

  constructor(cap = 10_000) {
    this.cap = cap;
  }

  write(event: AuditEvent): void {
    this.events.push(event);
    if (this.events.length > this.cap) this.events.splice(0, this.events.length - this.cap);
    for (const sub of this.subscribers) {
      try {
        sub(event);
      } catch {}
    }
  }

  subscribe(listener: (event: AuditEvent) => void): () => void {
    this.subscribers.add(listener);
    return () => this.subscribers.delete(listener);
  }

  close(): void {
    this.subscribers.clear();
  }
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

/** Constant-time string equality for bearer-token comparison — a plain
 *  `===` on the Authorization header leaks match length over a timing
 *  channel (v1.2.0 audit hardening). Token LENGTH is not treated as
 *  secret; only the comparison itself is made constant-time. */
export function timingSafeEqualStr(a: string, b: string): boolean {
  const max = Math.max(a.length, b.length);
  let diff = a.length ^ b.length;
  for (let i = 0; i < max; i++) {
    diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  }
  return diff === 0;
}

/**
 * Constant-time tenant authentication evaluator (VULN-SRV-01).
 * Fails closed if tenant tokens are configured and the tenant is unlisted,
 * unless a valid master token is provided.
 */
export function verifyTenantAuth(
  req: Request,
  tenantId: string,
  tenantTokens: Map<string, string>,
  masterToken?: string,
): boolean {
  const authHeader = req.headers.get('authorization') ?? '';
  const tenantToken = tenantTokens.get(tenantId);
  if (tenantToken) {
    if (timingSafeEqualStr(authHeader, `Bearer ${tenantToken}`)) return true;
    if (masterToken && timingSafeEqualStr(authHeader, `Bearer ${masterToken}`)) return true;
    return false;
  }
  // Fail-closed on unlisted tenant when tenant tokens are configured (VULN-SRV-01)
  if (tenantTokens.size > 0) {
    if (masterToken && timingSafeEqualStr(authHeader, `Bearer ${masterToken}`)) return true;
    return false;
  }
  if (!masterToken) return true; // dev mode: no token configured anywhere
  return timingSafeEqualStr(authHeader, `Bearer ${masterToken}`);
}

export type TenantState = {
  ledger: BoundedLedger;
  sessionIds: Set<string>;
  rateLimiter?: TokenBucket;
  faulted?: boolean;
  faultReason?: string;
};

export type SidecarConfig = {
  policy?: PolicyDoc;
  policyPath?: string;
  token?: string;
  tenantTokens?: Map<string, string> | string;
  rateLimitRps?: number;
  auditPath?: string;
  perSessionMemory?: boolean;
  silentNotes?: boolean;
  sessionTtlMs?: number;
  maxLedgerEntries?: number;
  maxSessions?: number;
  maxActiveTenants?: number;
  maxSessionsPerTenant?: number;
  maxEntriesPerTenantLedger?: number;
};

export type SidecarApp = {
  handleRequest: (req: Request) => Promise<Response>;
  policy: PolicyDoc;
  sessions: Map<string, SessionRecord>;
  tenants: Map<string, TenantState>;
  getTenant: (id: string) => TenantState;
  evictIdleSessions: () => void;
  shutdown: () => void;
};

export function createSidecarApp(config: SidecarConfig = {}): SidecarApp {
  let policy: PolicyDoc;
  if (config.policy) {
    policy = config.policy;
  } else {
    const policyPath = config.policyPath ?? process.env.PANOPTES_POLICY ?? 'examples/policies/bench.json';
    policy = loadPolicy(policyPath);
  }
  const token = (typeof config.token === 'string' && config.token) || process.env.PANOPTES_TOKEN || '';
  const tenantTokensRaw =
    typeof config.tenantTokens === 'string'
      ? config.tenantTokens
      : (process.env.PANOPTES_TENANT_TOKENS ?? '');
  const tenantTokens = config.tenantTokens instanceof Map ? config.tenantTokens : parseTenantTokens(tenantTokensRaw);
  const rateLimitRps = Math.max(0, config.rateLimitRps ?? Number(process.env.PANOPTES_RATE_LIMIT ?? 0));

  const auditPath = typeof config.auditPath === 'string' ? config.auditPath : undefined;
  const perSessionMemory = config.perSessionMemory === true;
  const silentNotes = config.silentNotes === true || process.env.PANOPTES_SILENT_NOTES === '1';
  const sessionTtlMs = Math.max(10_000, Number(config.sessionTtlMs ?? process.env.PANOPTES_SESSION_TTL_MS ?? 3600_000));
  const maxLedgerEntries = Math.max(100, Number(config.maxLedgerEntries ?? process.env.PANOPTES_MAX_LEDGER_ENTRIES ?? 65_536));
  const maxSessions = Math.max(1, Number(config.maxSessions ?? process.env.PANOPTES_MAX_SESSIONS ?? 4_096));

  const tenants = new Map<string, TenantState>();
  const MAX_ACTIVE_TENANTS = config.maxActiveTenants ?? 256;
  const maxSessionsPerTenant = config.maxSessionsPerTenant ?? Math.max(16, Math.floor(maxSessions / 4));
  const maxEntriesPerTenantLedger = config.maxEntriesPerTenantLedger ?? Math.min(maxLedgerEntries, 8_192);

  function getTenant(tenantId: string): TenantState {
    let t = tenants.get(tenantId);
    if (!t) {
      if (tenants.size >= MAX_ACTIVE_TENANTS) {
        // Evict idle tenant with no active sessions
        for (const [id, state] of tenants.entries()) {
          if (state.sessionIds.size === 0) {
            tenants.delete(id);
            break;
          }
        }
      }
      t = {
        ledger: new BoundedLedger(maxEntriesPerTenantLedger, () => {
          if (t) {
            t.faulted = true;
            t.faultReason = `tenant ledger capacity exceeded (${maxEntriesPerTenantLedger} tainted entries)`;
            for (const sId of t.sessionIds) {
              const r = sessions.get(sId);
              r?.session.fault(t.faultReason);
            }
          }
        }),
        sessionIds: new Set(),
        rateLimiter: rateLimitRps > 0 ? new TokenBucket(rateLimitRps) : undefined,
      };
      tenants.set(tenantId, t);
    }
    return t;
  }

  const sessions = new Map<string, SessionRecord>();
  let seq = 0;

  function evictIdleSessions(): void {
    const now = Date.now();
    for (const [id, rec] of sessions.entries()) {
      if (now - rec.lastAccess > sessionTtlMs) {
        try { rec.session.end(); } catch { /* ignore close error */ }
        sessions.delete(id);
        tenants.get(rec.tenantId)?.sessionIds.delete(id);
      }
    }
  }

  const ttlTimer = setInterval(evictIdleSessions, 60_000);
  ttlTimer.unref?.();

  const shutdown = () => {
    clearInterval(ttlTimer);
    for (const [, rec] of sessions.entries()) {
      try { rec.session.end(); } catch {}
    }
    sessions.clear();
  };

  const unauthorized = () => json({ error: 'unauthorized — provide Authorization: Bearer <token>' }, 401);

  const authed = (req: Request, tenantId: string): boolean =>
    verifyTenantAuth(req, tenantId, tenantTokens, token);

  const getRecord = (id: string, reqTenant: string): SessionRecord | null => {
    const r = sessions.get(id);
    if (!r) return null;
    if (r.tenantId !== reqTenant) return null;
    r.lastAccess = Date.now();
    return r;
  };

  const readJson = async (req: Request): Promise<{ ok: true; data: Record<string, unknown> } | { ok: false; status: number; error: string }> => {
    const len = Number(req.headers.get('content-length') ?? 0);
    if (len > MAX_BODY_BYTES) {
      return { ok: false, status: 413, error: 'payload too large' };
    }
    try {
      const text = await req.text();
      if (text.length > MAX_BODY_BYTES) {
        return { ok: false, status: 413, error: 'payload too large' };
      }
      if (!text.trim()) return { ok: true, data: {} };
      const parsed = JSON.parse(text);
      if (typeof parsed === 'object' && parsed !== null) {
        return { ok: true, data: parsed as Record<string, unknown> };
      }
      return { ok: false, status: 400, error: 'invalid JSON body' };
    } catch {
      return { ok: false, status: 400, error: 'invalid JSON body' };
    }
  };

  async function handleRequest(req: Request): Promise<Response> {
    const url = new URL(req.url);
    const path = url.pathname;

    // ---------- infrastructure -----------------------------------------
    if (path === '/healthz') return json({ ok: true, service: 'panoptes', version: VERSION });
    if (path === '/readyz') {
      return json({
        ok: true,
        policy: { tools: policy.tools.length, trustChain: policy.trustChain },
        sessions: sessions.size,
      });
    }
    if (path === '/openapi.json') return json(OPENAPI_SPEC);

    const tenantRes = resolveTenant(req);
    if (!tenantRes.ok) return json({ error: tenantRes.error }, tenantRes.status);
    let reqTenant = tenantRes.tenant;

    // ---------- session lifecycle --------------------------------------
    if (path === '/v1/sessions' && req.method === 'POST') {
      const bodyRes = await readJson(req);
      if (!bodyRes.ok) return json({ error: bodyRes.error }, bodyRes.status);
      const body = bodyRes.data;

      if (typeof body.tenantId === 'string' && body.tenantId.trim()) {
        if (/[\r\n\0]/.test(body.tenantId)) {
          return json({ error: 'invalid tenantId field: CRLF and null characters prohibited' }, 400);
        }
        const candidate = body.tenantId.trim();
        if (!/^[a-zA-Z0-9._-]{1,64}$/.test(candidate)) {
          return json({ error: 'invalid tenantId field; must match /^[a-zA-Z0-9._-]{1,64}$/' }, 400);
        }
        if (reqTenant !== 'default' && candidate !== reqTenant) {
          return json({ error: `tenantId in body ("${candidate}") does not match X-Panoptes-Tenant header ("${reqTenant}")` }, 400);
        }
        reqTenant = candidate;
      }

      if (!authed(req, reqTenant)) return unauthorized();

      const tenant = getTenant(reqTenant);
      if (tenant.rateLimiter && !tenant.rateLimiter.tryConsume()) {
        return new Response(JSON.stringify({ error: 'rate limit exceeded' }, null, 2), {
          status: 429,
          headers: { 'content-type': 'application/json', 'retry-after': '1' },
        });
      }

      const canaries = Array.isArray(body.canaries)
        ? (body.canaries as unknown[]).filter((c): c is string => typeof c === 'string' && c.length > 0)
        : [];
      const id = `s${Date.now().toString(36)}-${(seq++).toString(36)}`;
      
      evictIdleSessions();
      // Enforce per-tenant session quota (VULN-SRV-02)
      while (tenant.sessionIds.size >= maxSessionsPerTenant) {
        const oldestTenantSession = tenant.sessionIds.values().next().value;
        if (oldestTenantSession === undefined) break;
        const oldRec = sessions.get(oldestTenantSession);
        if (oldRec) {
          try { oldRec.session.end(); } catch { /* ignore close error */ }
          sessions.delete(oldestTenantSession);
        }
        tenant.sessionIds.delete(oldestTenantSession);
      }
      // Enforce global session capacity
      while (sessions.size >= maxSessions) {
        const oldest = sessions.keys().next().value;
        if (oldest === undefined) break;
        const oldRec = sessions.get(oldest);
        if (oldRec) {
          try { oldRec.session.end(); } catch { /* ignore close error */ }
          tenants.get(oldRec.tenantId)?.sessionIds.delete(oldest);
        }
        sessions.delete(oldest);
      }
      const engine = new Observatory(policy, {
        organs: true,
        canaries,
        silentNotes,
        checkAnswerCanaries: true,
      });
      if (!perSessionMemory) engine.ledger = tenant.ledger;
      const memory = new MemorySink();
      const sinks = auditPath
        ? new CompositeSink(memory, new JsonlAuditSink(`${auditPath}.${id}`))
        : memory;
      const session = new AuditedSession(engine, sinks, id);
      if (tenant.faulted) {
        session.fault(tenant.faultReason ?? 'tenant ledger capacity exceeded');
      }
      tenant.sessionIds.add(id);
      sessions.set(id, { session, memory, events: memory.events, tenantId: reqTenant, lastAccess: Date.now() });
      return json(
        {
          sessionId: id,
          tenantId: reqTenant,
          canariesEnrolled: canaries.length,
          boundary: {
            trust: policy.trustChain[engine.currentLabel.trust] ?? engine.currentLabel.trust,
            audience: [...engine.currentLabel.audience],
          },
        },
        201,
      );
    }

    if (!authed(req, reqTenant)) return unauthorized();

    const tenant = getTenant(reqTenant);
    if (tenant.rateLimiter && !tenant.rateLimiter.tryConsume()) {
      return new Response(JSON.stringify({ error: 'rate limit exceeded' }, null, 2), {
        status: 429,
        headers: { 'content-type': 'application/json', 'retry-after': '1' },
      });
    }

    const sessionMatch = /^\/v1\/sessions\/([^/]+)(?:\/(check|observe|answer|world|rotate|fault|audit)(?:\/([^/]+))?)?$/.exec(path);
    if (!sessionMatch) return json({ error: 'not found' }, 404);
    const [, id, action, subaction] = sessionMatch;
    const record = getRecord(id!, reqTenant);
    if (!record) return json({ error: `unknown session "${id}"` }, 404);
    const { session } = record;

    if (!action) {
      if (req.method === 'DELETE') {
        try { record.session.end(); } catch {}
        sessions.delete(id!);
        tenants.get(record.tenantId)?.sessionIds.delete(id!);
        return json({ terminated: true, sessionId: id! });
      }
      const label = session.engine.currentLabel;
      return json({
        sessionId: id,
        tenantId: record.tenantId,
        stats: session.stats,
        flow: { trust: policy.trustChain[label.trust] ?? label.trust, audience: [...label.audience] },
        canaryGeneration: session.engine.canaryGeneration,
        failClosed: session.engine.failClosed,
      });
    }

    // ---------- mediation ----------------------------------------------
    switch (action) {
      case 'check': {
        if (req.method !== 'POST') return json({ error: 'POST required' }, 405);
        const bodyRes = await readJson(req);
        if (!bodyRes.ok) return json({ error: bodyRes.error }, bodyRes.status);
        const body = bodyRes.data;
        const tool = typeof body.tool === 'string' ? body.tool : '';
        if (!tool) return json({ error: 'field "tool" (string) required' }, 400);
        const args: Record<string, string> = {};
        if (body.args && typeof body.args === 'object' && !Array.isArray(body.args)) {
          for (const [k, v] of Object.entries(body.args as Record<string, unknown>)) {
            args[k] = typeof v === 'string' ? v : JSON.stringify(v);
          }
        }
        const mediation = session.check(tool, args);
        if (mediation.decision === 'allow') session.recordEffects(tool, args, mediation);
        return json(mediation);
      }
      case 'observe': {
        if (req.method !== 'POST') return json({ error: 'POST required' }, 405);
        const bodyRes = await readJson(req);
        if (!bodyRes.ok) return json({ error: bodyRes.error }, bodyRes.status);
        const body = bodyRes.data;
        const tool = typeof body.tool === 'string' ? body.tool : '';
        const output = typeof body.output === 'string' ? body.output : '';
        if (!tool) return json({ error: 'fields "tool" (string) and "output" (string) required' }, 400);
        const args: Record<string, string> = {};
        if (body.args && typeof body.args === 'object' && !Array.isArray(body.args)) {
          for (const [k, v] of Object.entries(body.args as Record<string, unknown>)) {
            args[k] = typeof v === 'string' ? v : JSON.stringify(v);
          }
        }
        const observation = session.observe(tool, args, output);
        return json(observation);
      }
      case 'answer': {
        if (req.method !== 'POST') return json({ error: 'POST required' }, 405);
        const bodyRes = await readJson(req);
        if (!bodyRes.ok) return json({ error: bodyRes.error }, bodyRes.status);
        const body = bodyRes.data;
        if (typeof (body as { draft?: unknown }).draft !== 'string') {
          return json({ error: 'field "draft" (string) required' }, 400);
        }
        return json(session.checkAnswer((body as { draft: string }).draft));
      }
      case 'world': {
        if (req.method !== 'POST') return json({ error: 'POST required' }, 405);
        const bodyRes = await readJson(req);
        if (!bodyRes.ok) return json({ error: bodyRes.error }, bodyRes.status);
        const body = bodyRes.data;
        if (typeof (body as { store?: unknown }).store !== 'string' || typeof (body as { content?: unknown }).content !== 'string') {
          return json({ error: 'fields "store" and "content" (strings) required' }, 400);
        }
        const b = body as { store: string; content: string };
        const before = session.engine.currentLabel;
        session.engine.enrollWorldCanaries(b.store, b.content);
        return json({
          enrolled: true,
          sensitive: policy.sensitiveStores?.includes(b.store) ?? false,
          canaryGeneration: session.engine.canaryGeneration,
          flowUnchanged: before === session.engine.currentLabel,
        });
      }
      case 'rotate': {
        if (req.method !== 'POST') return json({ error: 'POST required' }, 405);
        return json(session.rotateCanaries());
      }
      case 'fault': {
        if (req.method !== 'POST') return json({ error: 'POST required' }, 405);
        const bodyRes = await readJson(req);
        const body = bodyRes.ok ? bodyRes.data : {};
        const reason = body && typeof (body as { reason?: unknown }).reason === 'string'
          ? (body as { reason: string }).reason
          : 'operator-declared integrity fault';
        session.fault(reason);
        return json({ failClosed: session.engine.failClosed, reason });
      }
      case 'audit': {
        if (subaction === 'stream') {
          if (req.method !== 'GET') return json({ error: 'GET required' }, 405);
          let unsubscribe: (() => void) | undefined;
          const stream = new ReadableStream({
            start(controller) {
              const encoder = new TextEncoder();
              controller.enqueue(encoder.encode(':connected\n\n'));
              unsubscribe = record.memory.subscribe((event) => {
                try {
                  controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
                } catch {
                  unsubscribe?.();
                }
              });
              req.signal?.addEventListener('abort', () => {
                unsubscribe?.();
                try { controller.close(); } catch {}
              });
            },
            cancel() {
              unsubscribe?.();
            },
          });
          return new Response(stream, {
            status: 200,
            headers: {
              'content-type': 'text/event-stream; charset=utf-8',
              'cache-control': 'no-cache, no-transform',
              'connection': 'keep-alive',
              'x-accel-buffering': 'no',
            },
          });
        }
        const limit = Math.max(1, Math.min(10_000, Number(url.searchParams.get('limit') ?? 200)));
        const events = record.events.slice(-limit);
        return json({ sessionId: id, count: events.length, events });
      }
      default:
        return json({ error: 'not found' }, 404);
    }
  }

  return {
    handleRequest,
    get policy() { return policy; },
    set policy(p: PolicyDoc) { policy = p; },
    sessions,
    tenants,
    getTenant,
    evictIdleSessions,
    shutdown,
  };
}

export async function serve(rest: string[]): Promise<number> {
  const flags: Record<string, string | boolean> = {};
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i]!;
    if (a.startsWith('--') && rest[i + 1] && !rest[i + 1]!.startsWith('--')) {
      flags[a.slice(2)] = rest[i + 1]!;
      i += 1;
    } else if (a.startsWith('--')) {
      flags[a.slice(2)] = true;
    }
  }
  const port = Number(flags.port ?? process.env.PANOPTES_PORT ?? 8787);
  const policyPath =
    typeof flags.policy === 'string' ? flags.policy : (process.env.PANOPTES_POLICY ?? 'examples/policies/bench.json');
  const token = (typeof flags.token === 'string' && flags.token) || process.env.PANOPTES_TOKEN || '';
  const tenantTokensRaw =
    typeof flags['tenant-tokens'] === 'string'
      ? flags['tenant-tokens']
      : (process.env.PANOPTES_TENANT_TOKENS ?? '');
  const tenantTokens = parseTenantTokens(tenantTokensRaw);
  const rateLimitRps = Math.max(0, Number(flags['rate-limit'] ?? process.env.PANOPTES_RATE_LIMIT ?? 0));

  const auditPath = typeof flags.audit === 'string' ? flags.audit : undefined;
  const perSessionMemory = flags['per-session-memory'] === true;
  const silentNotes = flags['silent-notes'] === true || process.env.PANOPTES_SILENT_NOTES === '1';
  const watchPolicy = flags.watch === true || process.env.PANOPTES_WATCH === '1';
  const sessionTtlMs = Math.max(10_000, Number(flags['session-ttl'] ?? process.env.PANOPTES_SESSION_TTL_MS ?? 3600_000));
  const maxLedgerEntries = Math.max(100, Number(flags['max-ledger-entries'] ?? process.env.PANOPTES_MAX_LEDGER_ENTRIES ?? 65_536));

  const hostname =
    typeof flags.host === 'string' && flags.host
      ? flags.host
      : (process.env.PANOPTES_HOST ?? '127.0.0.1');
  const maxSessions = Math.max(1, Number(flags['max-sessions'] ?? process.env.PANOPTES_MAX_SESSIONS ?? 4_096));

  let app: SidecarApp;
  try {
    app = createSidecarApp({
      policyPath,
      token,
      tenantTokens,
      rateLimitRps,
      auditPath,
      perSessionMemory,
      silentNotes,
      sessionTtlMs,
      maxLedgerEntries,
      maxSessions,
    });
  } catch (e) {
    console.error(`panoptes serve: cannot load policy "${policyPath}": ${(e as Error).message}`);
    return 2;
  }

  if (watchPolicy) {
    try {
      watch(policyPath, (eventType) => {
        if (eventType === 'change' || eventType === 'rename') {
          try {
            const newPolicy = loadPolicy(policyPath);
            app.policy = newPolicy;
            console.log(`[panoptes] reloaded policy from ${policyPath} (${newPolicy.tools.length} tools)`);
          } catch (err) {
            console.error(`[panoptes] failed to reload policy: ${(err as Error).message}`);
          }
        }
      });
    } catch (err) {
      console.warn(`[panoptes] unable to watch policy file: ${(err as Error).message}`);
    }
  }

  process.once('SIGINT', app.shutdown);
  process.once('SIGTERM', app.shutdown);

  if (typeof Bun !== 'undefined' && Bun.serve) {
    const server = Bun.serve({
      port,
      hostname,
      fetch: app.handleRequest,
    });
    console.log(`panoptes serve (bun) — listening on ${hostname}:${server.port}`);
  } else {
    const nodeServer = http.createServer(async (nodeReq, nodeRes) => {
      try {
        const url = `http://${nodeReq.headers.host || `${hostname}:${port}`}${nodeReq.url}`;
        const headers = new Headers();
        for (const [k, v] of Object.entries(nodeReq.headers)) {
          if (v === undefined) continue;
          if (Array.isArray(v)) {
            for (const item of v) headers.append(k, item);
          } else {
            headers.set(k, v);
          }
        }
        let body: Buffer[] | null = null;
        if (nodeReq.method !== 'GET' && nodeReq.method !== 'HEAD') {
          const chunks: Buffer[] = [];
          let total = 0;
          for await (const chunk of nodeReq) {
            total += (chunk as Buffer).length;
            if (total > MAX_BODY_BYTES) {
              nodeRes.writeHead(413, { 'content-type': 'application/json' });
              nodeRes.end(JSON.stringify({ error: 'payload too large' }, null, 2));
              return;
            }
            chunks.push(chunk as Buffer);
          }
          body = chunks;
        }
        const webReq = new Request(url, {
          method: nodeReq.method,
          headers,
          body: body && body.length > 0 ? Buffer.concat(body) : undefined,
          duplex: 'half',
        } as RequestInit & { duplex?: string });
        const webRes = await app.handleRequest(webReq);
        if (webRes.headers.get('content-type')?.includes('text/event-stream') && webRes.body) {
          nodeRes.writeHead(webRes.status, Object.fromEntries(webRes.headers.entries()));
          const reader = webRes.body.getReader();
          nodeReq.on('close', () => {
            reader.cancel().catch(() => {});
          });
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            nodeRes.write(Buffer.from(value));
          }
          nodeRes.end();
        } else {
          nodeRes.writeHead(webRes.status, Object.fromEntries(webRes.headers.entries()));
          const resText = await webRes.text();
          nodeRes.end(resText);
        }
      } catch (err) {
        nodeRes.writeHead(500, { 'content-type': 'application/json' });
        nodeRes.end(JSON.stringify({ error: (err as Error).message }, null, 2));
      }
    });
    nodeServer.listen(port, hostname, () => {
      console.log(`panoptes serve (node) — listening on ${hostname}:${port}`);
    });
  }

  console.log(`  policy: ${policyPath} (${app.policy.tools.length} tools, chain ${app.policy.trustChain.join(' < ')})`);
  console.log(`  auth:   ${token || tenantTokens.size ? 'bearer token required' : 'NONE (dev mode — set --token or PANOPTES_TOKEN)'}`);
  console.log(`  memory: ${perSessionMemory ? 'per-session ledger (isolated)' : 'shared cross-session ledger (O4 taint carries)'}`);
  console.log(`  audit:  ${auditPath ? `JSONL per session (${auditPath}.<sessionId>)` : 'in-memory ring (last 10,000 events/session)'}`);
  console.log(`  limits: ${maxSessions} sessions (oldest evicted), ledger cap ${maxLedgerEntries}/tenant`);
  if (rateLimitRps > 0) console.log(`  rate:   ${rateLimitRps} rps/tenant`);
  console.log(`  spec:   http://${hostname}:${port}/openapi.json`);

  // Run until interrupted.
  await new Promise<never>(() => {
    /* serve until SIGINT/SIGTERM */
  });
  return 0;
}
