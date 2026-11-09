/**
 * PANOPTES MCP server — Model Context Protocol over stdio.
 *
 * Exposes the mediation engine as tools to any MCP client (Claude Desktop,
 * IDE agents, custom hosts):
 *
 *   bun run src/cli.ts mcp --policy examples/policies/bench.json
 *
 * Also provides transparent MCP reverse proxy:
 *
 *   bun run src/cli.ts mcp-proxy --policy examples/policies/bench.json -- <child command> [args...]
 *
 * Protocol: JSON-RPC 2.0, newline-delimited, on stdin/stdout (MCP stdio
 * transport). Logs go to stderr — stdout belongs to the protocol.
 */

import { Observatory, type PolicyDoc } from './core/v2';
import { loadPolicy } from './policy-load';
import { AuditedSession, type AuditSink } from './audit';
import { VERSION } from './version';

const PROTOCOL_VERSION = '2024-11-05';
const SERVER_INFO = { name: 'panoptes', version: VERSION };

type JsonRpcId = string | number | null;
type ToolCallArgs = Record<string, unknown>;

const str = (v: unknown): string => (typeof v === 'string' ? v : v === undefined || v === null ? '' : JSON.stringify(v));
const strArgs = (v: unknown): Record<string, string> => {
  const out: Record<string, string> = {};
  if (v && typeof v === 'object' && !Array.isArray(v)) {
    for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
      out[k] = typeof val === 'string' ? val : JSON.stringify(val);
    }
  }
  return out;
};

function toolResult(text: string, isError = false) {
  return { content: [{ type: 'text' as const, text }], ...(isError ? { isError: true } : {}) };
}

type McpSessionRecord = {
  session: AuditedSession;
  lastAccess: number;
};

export async function runMcp(rest: string[]): Promise<number> {
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
  const policyPath =
    typeof flags.policy === 'string' ? flags.policy : (process.env.PANOPTES_POLICY ?? 'examples/policies/bench.json');
  const silentNotes = flags['silent-notes'] === true || process.env.PANOPTES_SILENT_NOTES === '1';
  const sessionTtlMs = Math.max(10_000, Number(flags['session-ttl'] ?? process.env.PANOPTES_SESSION_TTL_MS ?? 3600_000));

  let policy: PolicyDoc;
  try {
    policy = loadPolicy(policyPath);
  } catch (e) {
    process.stderr.write(`panoptes mcp: cannot load policy "${policyPath}": ${(e as Error).message}\n`);
    return 2;
  }

  const sessions = new Map<string, McpSessionRecord>();
  let seq = 0;
  const maxSessions = Math.max(1, Number(flags['max-sessions'] ?? process.env.PANOPTES_MAX_SESSIONS ?? 4_096));

  function evictIdleMcpSessions(): void {
    const now = Date.now();
    for (const [id, rec] of sessions.entries()) {
      if (now - rec.lastAccess > sessionTtlMs) {
        sessions.delete(id);
      }
    }
  }

  const TOOLS = [
    {
      name: 'panoptes_new_session',
      description:
        'Start a mediated agent session. Optionally pass operator canary tokens (they survive rotation). Returns the sessionId used by every other panoptes tool.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          canaries: { type: 'array', items: { type: 'string' }, description: 'Operator-issued canary tokens' },
        },
      },
    },
    {
      name: 'panoptes_check',
      description:
        'Mediate a tool call BEFORE dispatching it. Returns allow/deny with reasons and the organs that decided. Deny means: do not run the tool.',
      inputSchema: {
        type: 'object' as const,
        required: ['sessionId', 'tool'],
        properties: {
          sessionId: { type: 'string' },
          tool: { type: 'string', description: 'Tool name, e.g. mcp/mail/send' },
          args: { type: 'object', additionalProperties: { type: 'string' } },
        },
      },
    },
    {
      name: 'panoptes_observe',
      description:
        'Feed a completed tool output back to the engine: applies the policy delta, updates the memory ledger, and screens for injected instructions. Call after every allowed tool completes.',
      inputSchema: {
        type: 'object' as const,
        required: ['sessionId', 'tool', 'output'],
        properties: {
          sessionId: { type: 'string' },
          tool: { type: 'string' },
          args: { type: 'object', additionalProperties: { type: 'string' } },
          output: { type: 'string' },
        },
      },
    },
    {
      name: 'panoptes_answer',
      description:
        'Check the final answer draft against the answer channel (blocks verbatim quotes of untrusted content and commanded tokens).',
      inputSchema: {
        type: 'object' as const,
        required: ['sessionId', 'draft'],
        properties: { sessionId: { type: 'string' }, draft: { type: 'string' } },
      },
    },
    {
      name: 'panoptes_world',
      description:
        'Enroll world content (a document, database row, or store snapshot) for canary auto-enrollment when the store is policy-declared sensitive.',
      inputSchema: {
        type: 'object' as const,
        required: ['sessionId', 'store', 'content'],
        properties: { sessionId: { type: 'string' }, store: { type: 'string' }, content: { type: 'string' } },
      },
    },
    {
      name: 'panoptes_rotate',
      description:
        'Rotate canaries for a session: retire auto-enrolled synthetic canaries (after suspected exposure), keep operator seeds. Numeric secrets never rotate.',
      inputSchema: {
        type: 'object' as const,
        required: ['sessionId'],
        properties: { sessionId: { type: 'string' } },
      },
    },
    {
      name: 'panoptes_status',
      description: 'Session status: decision stats, current flow label, canary generation, fail-closed flag.',
      inputSchema: {
        type: 'object' as const,
        required: ['sessionId'],
        properties: { sessionId: { type: 'string' } },
      },
    },
  ];

  async function callTool(name: string, args: ToolCallArgs): Promise<ReturnType<typeof toolResult>> {
    const sessionId = str(args.sessionId);
    switch (name) {
      case 'panoptes_new_session': {
        const canaries = Array.isArray(args.canaries)
          ? (args.canaries as unknown[]).filter((c): c is string => typeof c === 'string')
          : [];
        const id = `s${Date.now().toString(36)}-${(seq++).toString(36)}`;
        evictIdleMcpSessions();
        while (sessions.size >= maxSessions) {
          const oldest = sessions.keys().next().value;
          if (oldest === undefined) break;
          sessions.delete(oldest);
        }
        const engine = new Observatory(policy, { organs: true, canaries, silentNotes });
        const session = new AuditedSession(
          engine,
          { write: () => undefined }, // silent sink: MCP hosts own their logging
          id,
        );
        sessions.set(id, { session, lastAccess: Date.now() });
        return toolResult(JSON.stringify({ sessionId: id, canariesEnrolled: canaries.length }));
      }
      case 'panoptes_check': {
        const rec = sessions.get(sessionId);
        if (!rec) return toolResult(`unknown session "${sessionId}"`, true);
        rec.lastAccess = Date.now();
        const tool = str(args.tool);
        if (!tool) return toolResult('field "tool" required', true);
        const mediation = rec.session.check(tool, strArgs(args.args));
        if (mediation.decision === 'allow') rec.session.recordEffects(tool, strArgs(args.args), mediation);
        return toolResult(JSON.stringify(mediation));
      }
      case 'panoptes_observe': {
        const rec = sessions.get(sessionId);
        if (!rec) return toolResult(`unknown session "${sessionId}"`, true);
        rec.lastAccess = Date.now();
        const observation = rec.session.observe(str(args.tool), strArgs(args.args), str(args.output));
        return toolResult(JSON.stringify(observation));
      }
      case 'panoptes_answer': {
        const rec = sessions.get(sessionId);
        if (!rec) return toolResult(`unknown session "${sessionId}"`, true);
        rec.lastAccess = Date.now();
        const verdict = rec.session.checkAnswer(str(args.draft));
        return toolResult(JSON.stringify(verdict));
      }
      case 'panoptes_world': {
        const rec = sessions.get(sessionId);
        if (!rec) return toolResult(`unknown session "${sessionId}"`, true);
        rec.lastAccess = Date.now();
        rec.session.engine.enrollWorldCanaries(str(args.store), str(args.content));
        return toolResult(JSON.stringify({ enrolled: true, sensitive: policy.sensitiveStores?.includes(str(args.store)) ?? false }));
      }
      case 'panoptes_rotate': {
        const rec = sessions.get(sessionId);
        if (!rec) return toolResult(`unknown session "${sessionId}"`, true);
        rec.lastAccess = Date.now();
        return toolResult(JSON.stringify(rec.session.rotateCanaries()));
      }
      case 'panoptes_status': {
        const rec = sessions.get(sessionId);
        if (!rec) return toolResult(`unknown session "${sessionId}"`, true);
        rec.lastAccess = Date.now();
        const label = rec.session.engine.currentLabel;
        return toolResult(
          JSON.stringify({
            stats: rec.session.stats,
            flow: { trust: policy.trustChain[label.trust] ?? label.trust, audience: [...label.audience] },
            canaryGeneration: rec.session.engine.canaryGeneration,
            failClosed: rec.session.engine.failClosed,
          }),
        );
      }
      default:
        return toolResult(`unknown tool "${name}"`, true);
    }
  }

  async function handleMessage(
    id: JsonRpcId,
    method: string,
    params: Record<string, unknown> | undefined,
  ): Promise<string | null> {
    switch (method) {
      case 'initialize':
        return JSON.stringify({
          jsonrpc: '2.0',
          id,
          result: {
            protocolVersion: PROTOCOL_VERSION,
            capabilities: { tools: { listChanged: false } },
            serverInfo: SERVER_INFO,
          },
        });
      case 'ping':
        return JSON.stringify({ jsonrpc: '2.0', id, result: {} });
      case 'tools/list':
        return JSON.stringify({ jsonrpc: '2.0', id, result: { tools: TOOLS } });
      case 'tools/call': {
        const name = str(params?.name);
        const args = (params?.arguments ?? {}) as ToolCallArgs;
        const result = await callTool(name, args);
        return JSON.stringify({ jsonrpc: '2.0', id, result });
      }
      case 'notifications/initialized':
      case 'notifications/cancelled':
        return null; // notifications take no response
      default:
        return JSON.stringify({
          jsonrpc: '2.0',
          id,
          error: { code: -32601, message: `method not found: ${method}` },
        });
    }
  }

  // ------------------------------------------------------------ stdio loop

  const write = (line: string) => process.stdout.write(line + '\n');

  let buffer = '';
  const decoder = new TextDecoder();
  const stdinStream = typeof Bun !== 'undefined' && Bun.stdin?.stream ? Bun.stdin.stream() : process.stdin;

  for await (const chunk of stdinStream) {
    buffer += typeof chunk === 'string' ? chunk : decoder.decode(chunk);
    let nl: number;
    while ((nl = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, nl).trim();
      buffer = buffer.slice(nl + 1);
      if (!line) continue;
      let msg: { jsonrpc?: string; id?: JsonRpcId; method?: string; params?: Record<string, unknown> };
      try {
        msg = JSON.parse(line);
      } catch {
        write(JSON.stringify({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'parse error' } }));
        continue;
      }
      if (typeof msg.method !== 'string') continue;
      const isNotification = msg.id === undefined || msg.id === null;
      const response = await handleMessage(msg.id ?? null, msg.method, msg.params);
      if (response !== null && !isNotification) {
        write(response);
      }
    }
  }
  return 0;
}

/**
 * Transparent reverse proxy for child MCP servers.
 * Intercepts tools/call through the Observatory before forwarding to child process.
 */
export async function runMcpProxy(rest: string[]): Promise<number> {
  const doubleDash = rest.indexOf('--');
  const proxyArgs = doubleDash >= 0 ? rest.slice(0, doubleDash) : rest;
  const childCmd = doubleDash >= 0 ? rest.slice(doubleDash + 1) : [];

  if (childCmd.length === 0) {
    process.stderr.write('panoptes mcp-proxy: child command required after --\n  example: panoptes mcp-proxy --policy bench.json -- npx -y @modelcontextprotocol/server-filesystem /tmp\n');
    return 2;
  }

  const flags: Record<string, string | boolean> = {};
  const canaries: string[] = [];
  for (let i = 0; i < proxyArgs.length; i++) {
    const a = proxyArgs[i]!;
    if (a === '--canary' && proxyArgs[i + 1]) {
      canaries.push(proxyArgs[i + 1]!);
      i += 1;
    } else if (a.startsWith('--') && proxyArgs[i + 1] && !proxyArgs[i + 1]!.startsWith('--')) {
      flags[a.slice(2)] = proxyArgs[i + 1]!;
      i += 1;
    } else if (a.startsWith('--')) {
      flags[a.slice(2)] = true;
    }
  }

  const policyPath =
    typeof flags.policy === 'string' ? flags.policy : (process.env.PANOPTES_POLICY ?? 'examples/policies/bench.json');
  const silentNotes = flags['silent-notes'] === true || process.env.PANOPTES_SILENT_NOTES === '1';
  const upstreamUrl = typeof flags.upstream === 'string' ? flags.upstream : undefined;

  let policy: PolicyDoc;
  try {
    policy = loadPolicy(policyPath);
  } catch (e) {
    process.stderr.write(`panoptes mcp-proxy: cannot load policy "${policyPath}": ${(e as Error).message}\n`);
    return 2;
  }

  const engine = new Observatory(policy, { organs: true, canaries, silentNotes });
  const session = new AuditedSession(engine, { write: () => undefined }, 'mcp-proxy-session');

  // Streamable HTTP Proxy Mode (POST /mcp)
  if (upstreamUrl) {
    const port = Number(flags.port ?? 8788);
    const host = typeof flags.host === 'string' ? flags.host : '127.0.0.1';

    const handleHttpMcp = async (req: Request): Promise<Response> => {
      if (req.method !== 'POST') return new Response('Method Not Allowed', { status: 405 });
      const text = await req.text();
      let msg: { jsonrpc?: string; id?: JsonRpcId; method?: string; params?: Record<string, unknown> };
      try {
        msg = JSON.parse(text);
      } catch {
        return new Response(JSON.stringify({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'parse error' } }), {
          status: 400,
          headers: { 'content-type': 'application/json' },
        });
      }

      if (msg.method === 'tools/call') {
        const tool = str(msg.params?.name);
        const args = strArgs(msg.params?.arguments);
        const mediation = session.check(tool, args);

        if (mediation.decision === 'deny') {
          const denyResponse = {
            jsonrpc: '2.0',
            id: msg.id ?? null,
            result: {
              content: [
                {
                  type: 'text',
                  text: `PANOPTES INTERDICTION: Call to "${tool}" denied.\nOrgans: ${mediation.organs.join(', ')}\nReasons:\n${mediation.reasons.map((r) => ` - ${r}`).join('\n')}${
                    mediation.remedyPlan ? `\nRemedy Plan: ${JSON.stringify(mediation.remedyPlan, null, 2)}` : ''
                  }`,
                },
              ],
              isError: true,
            },
          };
          return new Response(JSON.stringify(denyResponse), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          });
        }

        // Allowed: record effects, forward to upstream
        session.recordEffects(tool, args, mediation);
        const upstreamRes = await fetch(upstreamUrl, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            ...(req.headers.get('authorization') ? { authorization: req.headers.get('authorization')! } : {}),
          },
          body: text,
        });

        const upstreamBodyText = await upstreamRes.text();
        try {
          const resJson = JSON.parse(upstreamBodyText) as { result?: { content?: Array<{ text?: string }> } };
          const outputText = Array.isArray(resJson.result?.content)
            ? resJson.result.content.map((c) => c.text || '').join('\n')
            : JSON.stringify(resJson.result ?? '');
          session.observe(tool, args, outputText);
        } catch {}

        return new Response(upstreamBodyText, {
          status: upstreamRes.status,
          headers: { 'content-type': 'application/json' },
        });
      }

      // Non-tool call: forward to upstream
      const upstreamRes = await fetch(upstreamUrl, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...(req.headers.get('authorization') ? { authorization: req.headers.get('authorization')! } : {}),
        },
        body: text,
      });
      return new Response(await upstreamRes.text(), {
        status: upstreamRes.status,
        headers: { 'content-type': 'application/json' },
      });
    };

    if (typeof Bun !== 'undefined' && Bun.serve) {
      Bun.serve({
        port,
        hostname: host,
        fetch: handleHttpMcp,
      });
      console.log(`panoptes mcp-proxy (streamable HTTP) listening on ${host}:${port} -> upstream ${upstreamUrl}`);
    } else {
      const http = await import('node:http');
      const server = http.createServer(async (nodeReq, nodeRes) => {
        const url = `http://${nodeReq.headers.host || `${host}:${port}`}${nodeReq.url}`;
        const chunks: Buffer[] = [];
        for await (const chunk of nodeReq) chunks.push(chunk as Buffer);
        const body = chunks.length > 0 ? Buffer.concat(chunks) : undefined;
        const headers = new Headers();
        for (const [k, v] of Object.entries(nodeReq.headers)) {
          if (Array.isArray(v)) {
            for (const item of v) headers.append(k, item);
          } else if (typeof v === 'string') {
            headers.set(k, v);
          }
        }
        const webReq = new Request(url, {
          method: nodeReq.method,
          headers,
          body,
          duplex: 'half',
        } as RequestInit & { duplex?: string });
        const webRes = await handleHttpMcp(webReq);
        nodeRes.writeHead(webRes.status, Object.fromEntries(webRes.headers.entries()));
        nodeRes.end(await webRes.text());
      });
      server.listen(port, host, () => {
        console.log(`panoptes mcp-proxy (node HTTP) listening on ${host}:${port} -> upstream ${upstreamUrl}`);
      });
    }

    await new Promise<never>(() => {});
    return 0;
  }

  if (childCmd.length === 0) {
    process.stderr.write('panoptes mcp-proxy: either --upstream <url> or child command after -- required\n  example: panoptes mcp-proxy --policy bench.json -- npx -y @modelcontextprotocol/server-filesystem /tmp\n');
    return 2;
  }

  // Spawn child MCP server
  let childWriteStdin: (data: string) => void;
  let childStdout: AsyncIterable<Uint8Array | Buffer | string>;
  let killChild: () => void;

  if (typeof Bun !== 'undefined' && Bun.spawn) {
    const child = Bun.spawn(childCmd, {
      stdin: 'pipe',
      stdout: 'pipe',
      stderr: 'inherit',
    });
    childWriteStdin = (data: string) => {
      child.stdin.write(data);
      child.stdin.flush?.();
    };
    childStdout = child.stdout;
    killChild = () => child.kill();
  } else {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { spawn } = await import('node:child_process');
    const child = spawn(childCmd[0]!, childCmd.slice(1), {
      stdio: ['pipe', 'pipe', 'inherit'],
    });
    childWriteStdin = (data: string) => child.stdin.write(data);
    childStdout = child.stdout;
    killChild = () => child.kill();
  }

  const writeClient = (line: string) => process.stdout.write(line + '\n');
  const pendingCalls = new Map<JsonRpcId, { tool: string; args: Record<string, string> }>();

  // Background loop: read from child stdout, observe results, forward to client stdout
  void (async () => {
    let buf = '';
    const dec = new TextDecoder();
    try {
      for await (const chunk of childStdout) {
        buf += typeof chunk === 'string' ? chunk : dec.decode(chunk);
        let nl: number;
        while ((nl = buf.indexOf('\n')) >= 0) {
          const line = buf.slice(0, nl).trim();
          buf = buf.slice(nl + 1);
          if (!line) continue;
          try {
            const res = JSON.parse(line) as { id?: JsonRpcId; result?: { content?: Array<{ type: string; text?: string }> } };
            if (res.id !== undefined && pendingCalls.has(res.id)) {
              const pending = pendingCalls.get(res.id)!;
              pendingCalls.delete(res.id);
              const outputText = Array.isArray(res.result?.content)
                ? res.result.content.map((c) => c.text || '').join('\n')
                : JSON.stringify(res.result ?? '');
              session.observe(pending.tool, pending.args, outputText);
            }
          } catch {
            /* ignore JSON parse noise */
          }
          writeClient(line);
        }
      }
    } catch {
      /* child stdout closed */
    }
  })();

  // Main loop: read from client stdin, intercept tools/call, forward to child stdin
  let clientBuf = '';
  const dec = new TextDecoder();
  const stdinStream = typeof Bun !== 'undefined' && Bun.stdin?.stream ? Bun.stdin.stream() : process.stdin;

  try {
    for await (const chunk of stdinStream) {
      clientBuf += typeof chunk === 'string' ? chunk : dec.decode(chunk);
      let nl: number;
      while ((nl = clientBuf.indexOf('\n')) >= 0) {
        const line = clientBuf.slice(0, nl).trim();
        clientBuf = clientBuf.slice(nl + 1);
        if (!line) continue;

        let msg: { jsonrpc?: string; id?: JsonRpcId; method?: string; params?: Record<string, unknown> };
        try {
          msg = JSON.parse(line);
        } catch {
          childWriteStdin(line + '\n');
          continue;
        }

        if (msg.method === 'tools/call') {
          const tool = str(msg.params?.name);
          const args = strArgs(msg.params?.arguments);
          const mediation = session.check(tool, args);

          if (mediation.decision === 'deny') {
            const denyResponse = {
              jsonrpc: '2.0',
              id: msg.id ?? null,
              result: {
                content: [
                  {
                    type: 'text',
                    text: `PANOPTES INTERDICTION: Call to "${tool}" denied.\nOrgans: ${mediation.organs.join(', ')}\nReasons:\n${mediation.reasons.map((r) => ` - ${r}`).join('\n')}${
                      mediation.remedyPlan ? `\nRemedy Plan: ${JSON.stringify(mediation.remedyPlan, null, 2)}` : ''
                    }`,
                  },
                ],
                isError: true,
              },
            };
            writeClient(JSON.stringify(denyResponse));
            continue;
          }

          // Allowed: record effects, remember id, forward to child
          session.recordEffects(tool, args, mediation);
          if (msg.id !== undefined && msg.id !== null) {
            pendingCalls.set(msg.id, { tool, args });
          }
          childWriteStdin(line + '\n');
        } else {
          // Forward all other messages (initialize, ping, tools/list, etc.) to child
          childWriteStdin(line + '\n');
        }
      }
    }
  } finally {
    killChild();
  }

  return 0;
}
