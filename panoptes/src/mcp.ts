/**
 * PANOPTES MCP server — Model Context Protocol over stdio.
 *
 * Exposes the mediation engine as tools to any MCP client (Claude Desktop,
 * IDE agents, custom hosts):
 *
 *   bun run src/cli.ts mcp --policy examples/policies/bench.json
 *
 * Protocol: JSON-RPC 2.0, newline-delimited, on stdin/stdout (MCP stdio
 * transport). Logs go to stderr — stdout belongs to the protocol.
 *
 * The MCP process hosts one policy; sessions are created via the
 * `panoptes_new_session` tool and hold engine state (ledger, canaries).
 */

import { Observatory, type PolicyDoc } from './core/v2';
import { loadPolicy } from './policy-load';
import { AuditedSession } from './audit';
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

  let policy: PolicyDoc;
  try {
    policy = loadPolicy(policyPath);
  } catch (e) {
    process.stderr.write(`panoptes mcp: cannot load policy "${policyPath}": ${(e as Error).message}\n`);
    return 2;
  }

  const sessions = new Map<string, AuditedSession>();
  let seq = 0;
  // session-flood guard — mirrors the sidecar's cap + oldest-eviction
  const maxSessions = Math.max(1, Number(process.env.PANOPTES_MAX_SESSIONS ?? 4_096));

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

  // ------------------------------------------------------------ dispatch

  async function callTool(name: string, args: ToolCallArgs): Promise<ReturnType<typeof toolResult>> {
    const sessionId = str(args.sessionId);
    switch (name) {
      case 'panoptes_new_session': {
        const canaries = Array.isArray(args.canaries)
          ? (args.canaries as unknown[]).filter((c): c is string => typeof c === 'string')
          : [];
        const id = `s${Date.now().toString(36)}-${(seq++).toString(36)}`;
        while (sessions.size >= maxSessions) {
          const oldest = sessions.keys().next().value;
          if (oldest === undefined) break;
          sessions.delete(oldest);
        }
        const engine = new Observatory(policy, { organs: true, canaries });
        const session = new AuditedSession(
          engine,
          { write: () => undefined }, // silent sink: MCP hosts own their logging
          id,
        );
        sessions.set(id, session);
        return toolResult(JSON.stringify({ sessionId: id, canariesEnrolled: canaries.length }));
      }
      case 'panoptes_check': {
        const session = sessions.get(sessionId);
        if (!session) return toolResult(`unknown session "${sessionId}"`, true);
        const tool = str(args.tool);
        if (!tool) return toolResult('field "tool" required', true);
        const mediation = session.check(tool, strArgs(args.args));
        if (mediation.decision === 'allow') session.recordEffects(tool, strArgs(args.args), mediation);
        return toolResult(JSON.stringify(mediation));
      }
      case 'panoptes_observe': {
        const session = sessions.get(sessionId);
        if (!session) return toolResult(`unknown session "${sessionId}"`, true);
        const observation = session.observe(str(args.tool), strArgs(args.args), str(args.output));
        return toolResult(JSON.stringify(observation));
      }
      case 'panoptes_answer': {
        const session = sessions.get(sessionId);
        if (!session) return toolResult(`unknown session "${sessionId}"`, true);
        const verdict = session.checkAnswer(str(args.draft));
        return toolResult(JSON.stringify(verdict));
      }
      case 'panoptes_world': {
        const session = sessions.get(sessionId);
        if (!session) return toolResult(`unknown session "${sessionId}"`, true);
        session.engine.enrollWorldCanaries(str(args.store), str(args.content));
        return toolResult(JSON.stringify({ enrolled: true, sensitive: policy.sensitiveStores?.includes(str(args.store)) ?? false }));
      }
      case 'panoptes_rotate': {
        const session = sessions.get(sessionId);
        if (!session) return toolResult(`unknown session "${sessionId}"`, true);
        return toolResult(JSON.stringify(session.rotateCanaries()));
      }
      case 'panoptes_status': {
        const session = sessions.get(sessionId);
        if (!session) return toolResult(`unknown session "${sessionId}"`, true);
        const label = session.engine.currentLabel;
        return toolResult(
          JSON.stringify({
            stats: session.stats,
            flow: { trust: policy.trustChain[label.trust] ?? label.trust, audience: [...label.audience] },
            canaryGeneration: session.engine.canaryGeneration,
            failClosed: session.engine.failClosed,
          }),
        );
      }
      default:
        return toolResult(`unknown tool "${name}"`, true);
    }
  }

  function handle(id: JsonRpcId, method: string, params: Record<string, unknown> | undefined): string | null {
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
        // Synchronous engine — respond inline via a bridged promise below.
        pendingToolCall = { id, name, args };
        return null; // handled async by the caller
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

  let pendingToolCall: { id: JsonRpcId; name: string; args: ToolCallArgs } | null = null;

  // ------------------------------------------------------------ stdio loop

  const write = (line: string) => process.stdout.write(line + '\n');

  let buffer = '';
  const decoder = new TextDecoder();
  for await (const chunk of Bun.stdin.stream()) {
    buffer += decoder.decode(chunk);
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
      const response = handle(msg.id ?? null, msg.method, msg.params);
      if (response !== null) {
        write(response);
      } else if (pendingToolCall) {
        const { id, name, args } = pendingToolCall;
        pendingToolCall = null;
        const result = await callTool(name, args);
        if (!isNotification) {
          write(JSON.stringify({ jsonrpc: '2.0', id, result }));
        }
      }
    }
  }
  return 0;
}
