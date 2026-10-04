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

import { Observatory, type PolicyDoc } from './core/v2';
import { loadPolicy } from './policy-load';
import { AuditedSession, JsonlAuditSink, CompositeSink, type AuditEvent } from './audit';
import { OPENAPI_SPEC } from './openapi';
import { VERSION } from './version';

type SessionRecord = {
  session: AuditedSession;
  events: AuditEvent[];
};

/** In-memory ring + optional JSONL file sink per session. */
class MemorySink {
  readonly events: AuditEvent[] = [];
  private readonly cap: number;
  constructor(cap = 10_000) {
    this.cap = cap;
  }
  write(event: AuditEvent): void {
    this.events.push(event);
    if (this.events.length > this.cap) this.events.splice(0, this.events.length - this.cap);
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
function timingSafeEqualStr(a: string, b: string): boolean {
  const max = Math.max(a.length, b.length);
  let diff = a.length ^ b.length;
  for (let i = 0; i < max; i++) {
    diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  }
  return diff === 0;
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
  const auditPath = typeof flags.audit === 'string' ? flags.audit : undefined;
  const perSessionMemory = flags['per-session-memory'] === true;
  // v1.2.0 audit hardening: bind loopback by default (the docs say "keep the
  // port inside the agent host's trust domain" — now the default enforces
  // it); --host 0.0.0.0 / PANOPTES_HOST opts back in deliberately.
  const hostname =
    typeof flags.host === 'string' && flags.host
      ? flags.host
      : (process.env.PANOPTES_HOST ?? '127.0.0.1');
  // v1.2.0 audit hardening: bound session table (evicts oldest) so a
  // session-creation flood cannot exhaust memory.
  const maxSessions = Math.max(1, Number(flags['max-sessions'] ?? process.env.PANOPTES_MAX_SESSIONS ?? 4_096));

  let policy: PolicyDoc;
  try {
    policy = loadPolicy(policyPath);
  } catch (e) {
    console.error(`panoptes serve: cannot load policy "${policyPath}": ${(e as Error).message}`);
    return 2;
  }

  // Durable memory is process-global state: every session's ledger writes and
  // reads through the same map, so poison persisted in one session re-enters
  // the next one scarred (the O4 cross-session taint). Disable with
  // --per-session-memory to isolate sessions completely.
  const sharedLedger = new Map<string, { label: { trust: number; audience: ReadonlySet<string> }; digest: string }>();

  const sessions = new Map<string, SessionRecord>();
  let seq = 0;

  const unauthorized = () => json({ error: 'unauthorized — provide Authorization: Bearer <token>' }, 401);

  const authed = (req: Request): boolean => {
    if (!token) return true; // dev mode: no token configured
    const header = req.headers.get('authorization') ?? '';
    return timingSafeEqualStr(header, `Bearer ${token}`);
  };

  const getRecord = (id: string): SessionRecord | null => sessions.get(id) ?? null;

  const readJson = async (req: Request): Promise<Record<string, unknown> | null> => {
    try {
      const text = await req.text();
      if (!text.trim()) return {};
      const parsed = JSON.parse(text);
      return typeof parsed === 'object' && parsed !== null ? (parsed as Record<string, unknown>) : null;
    } catch {
      return null;
    }
  };

  const server = Bun.serve({
    port,
    hostname,
    async fetch(req): Promise<Response> {
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

      if (!authed(req)) return unauthorized();

      // ---------- session lifecycle --------------------------------------
      if (path === '/v1/sessions' && req.method === 'POST') {
        const body = await readJson(req);
        if (!body) return json({ error: 'invalid JSON body' }, 400);
        const canaries = Array.isArray(body.canaries)
          ? (body.canaries as unknown[]).filter((c): c is string => typeof c === 'string' && c.length > 0)
          : [];
        const id = `s${Date.now().toString(36)}-${(seq++).toString(36)}`;
        // bounded session table: evict the oldest (Map insertion order)
        while (sessions.size >= maxSessions) {
          const oldest = sessions.keys().next().value;
          if (oldest === undefined) break;
          sessions.delete(oldest);
        }
        const engine = new Observatory(policy, { organs: true, canaries });
        if (!perSessionMemory) engine.ledger = sharedLedger;
        const memory = new MemorySink();
        const sinks = auditPath
          ? new CompositeSink(memory, new JsonlAuditSink(`${auditPath}.${id}`))
          : memory;
        const session = new AuditedSession(engine, sinks, id);
        sessions.set(id, { session, events: memory.events });
        return json(
          {
            sessionId: id,
            canariesEnrolled: canaries.length,
            boundary: {
              trust: policy.trustChain[engine.currentLabel.trust] ?? engine.currentLabel.trust,
              audience: [...engine.currentLabel.audience],
            },
          },
          201,
        );
      }

      const sessionMatch = /^\/v1\/sessions\/([^/]+)(?:\/(check|observe|answer|world|rotate|fault|audit))?$/.exec(path);
      if (!sessionMatch) return json({ error: 'not found' }, 404);
      const [, id, action] = sessionMatch;
      const record = getRecord(id!);
      if (!record) return json({ error: `unknown session "${id}"` }, 404);
      const { session } = record;

      if (!action) {
        const label = session.engine.currentLabel;
        return json({
          sessionId: id,
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
          const body = await readJson(req);
          if (!body) return json({ error: 'invalid JSON body' }, 400);
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
          const body = await readJson(req);
          if (!body) return json({ error: 'invalid JSON body' }, 400);
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
          const body = await readJson(req);
          if (!body || typeof (body as { draft?: unknown }).draft !== 'string') {
            return json({ error: 'field "draft" (string) required' }, 400);
          }
          return json(session.checkAnswer((body as { draft: string }).draft));
        }
        case 'world': {
          if (req.method !== 'POST') return json({ error: 'POST required' }, 405);
          const body = await readJson(req);
          if (!body || typeof (body as { store?: unknown }).store !== 'string' || typeof (body as { content?: unknown }).content !== 'string') {
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
          const body = await readJson(req);
          const reason = body && typeof (body as { reason?: unknown }).reason === 'string'
            ? (body as { reason: string }).reason
            : 'operator-declared integrity fault';
          session.fault(reason);
          return json({ failClosed: session.engine.failClosed, reason });
        }
        case 'audit': {
          const limit = Math.max(1, Math.min(10_000, Number(url.searchParams.get('limit') ?? 200)));
          const events = record.events.slice(-limit);
          return json({ sessionId: id, count: events.length, events });
        }
        default:
          return json({ error: 'not found' }, 404);
      }
    },
  });

  console.log(`panoptes serve — listening on ${hostname}:${server.port}`);
  console.log(`  policy: ${policyPath} (${policy.tools.length} tools, chain ${policy.trustChain.join(' < ')})`);
  console.log(`  auth:   ${token ? 'bearer token required' : 'NONE (dev mode — set --token or PANOPTES_TOKEN)'}`);
  console.log(`  memory: ${perSessionMemory ? 'per-session ledger (isolated)' : 'shared cross-session ledger (O4 taint carries)'}`);
  console.log(`  audit:  ${auditPath ? `JSONL per session (${auditPath}.<sessionId>)` : 'in-memory ring (last 10,000 events/session)'}`);
  console.log(`  limits: ${maxSessions} sessions (oldest evicted)`);
  console.log(`  spec:   http://${hostname}:${server.port}/openapi.json`);

  // Run until interrupted.
  await new Promise<never>(() => {
    /* serve until SIGINT/SIGTERM */
  });
  return 0;
}
