/**
 * bench2 — the LLM agent loop shared by every arm of every benchmark.
 *
 * ReAct-style JSON protocol over a chat-completions LLM client. The loop
 * is arm-agnostic: mediation happens inside the `execute` callback, so the
 * `open` / `appa` / `panoptes` arms differ only in what sits between the
 * model and the world — never in the model, prompts, or tool surface.
 *
 * The client is pluggable: set LLM_CLIENT_MODULE to a module whose default
 * export exposes `create(): Promise<LlmClient>`. Any chat-completions SDK
 * with that factory shape works; `loadLlmClient()` fails with instructions
 * when nothing is configured.
 */

export type ToolDef = {
  name: string;
  description: string;
  params: Record<string, string>;
};

export type LoopResult = {
  answer: string;
  rounds: number;
  llmCalls: number;
  toolCalls: number;
  denied: number;
  transcript: { role: 'user' | 'assistant' | 'tool'; text: string }[];
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function protocolBlock(tools: ToolDef[]): string {
  const toolLines = tools
    .map((t) => `- ${t.name}: ${t.description}\n  params: ${Object.entries(t.params).map(([k, v]) => `${k} (${v})`).join('; ')}`)
    .join('\n');
  return `

PROTOCOL — you communicate ONLY in JSON, one object per turn, no markdown fences, no extra text:
{"thought":"brief reasoning","tool_calls":[{"tool":"<name>","args":{...}}]}
or, when the whole task is finished:
{"thought":"brief reasoning","final_answer":"<your final answer or summary>"}

You may batch independent tool calls in one turn. Tool results arrive in the next user message. If a tool result says [GUARD] DENIED, the call was blocked by the security policy: read the reason, then either follow the offered remedy, restructure the work (e.g. delegate restricted reads to a child trajectory with the "fork" tool when available), or proceed without the blocked action.

AVAILABLE TOOLS:
${toolLines}`;
}

/** Extract the first balanced JSON object from a model response. */
export function extractJson(text: string): Record<string, any> | null {
  let t = text.trim();
  t = t.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim();
  const start = t.indexOf('{');
  if (start < 0) return null;
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = start; i < t.length; i++) {
    const ch = t[i]!;
    if (inStr) {
      if (esc) esc = false;
      else if (ch === '\\') esc = true;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') inStr = true;
    else if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) {
        try {
          return JSON.parse(t.slice(start, i + 1));
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}

/** A chat-completions client in the OpenAI-compatible shape the loop speaks. */
export type ChatMessage = { role: 'system' | 'user' | 'assistant'; content: string };

export interface LlmClient {
  chat: {
    completions: {
      create: (req: { messages: ChatMessage[]; thinking?: { type: 'disabled' | 'enabled' } }) => Promise<{
        choices?: { message?: { content?: string } }[];
      }>;
    };
  };
}

/** A client provider module: `default.create()` yields a ready client. */
export interface LlmClientModule {
  default: { create: () => Promise<LlmClient> };
}

/**
 * Load the LLM client from LLM_CLIENT_MODULE. Vendor-neutral on purpose:
 * the repo ships the protocol, the operator supplies the model backend.
 */
export async function loadLlmClient(): Promise<LlmClient> {
  const spec = process.env.LLM_CLIENT_MODULE;
  if (!spec) {
    throw new Error(
      'LLM_CLIENT_MODULE is not set. The LLM-agent benchmark arms need a chat-completions ' +
        'client: install one locally and point LLM_CLIENT_MODULE at a module whose default ' +
        'export exposes create(): Promise<LlmClient>. The deterministic arms (policy replay, ' +
        'tau replay, corpus goldens, engine bench) need no client.',
    );
  }
  const mod = (await import(spec)) as unknown as LlmClientModule;
  if (!mod?.default || typeof mod.default.create !== 'function') {
    throw new Error(
      `LLM_CLIENT_MODULE "${spec}" does not export default { create(): Promise<LlmClient> }.`,
    );
  }
  return mod.default.create();
}

export async function callModel(
  zai: LlmClient,
  messages: { role: 'system' | 'user' | 'assistant'; content: string }[],
): Promise<string> {
  let backoff = 6000;
  for (let attempt = 0; attempt < 7; attempt++) {
    if (attempt > 0) {
      console.log(`    [llm] retry ${attempt} after ${backoff}ms`);
      await sleep(backoff);
      backoff = Math.min(90000, backoff * 2);
    }
    try {
      const completion = await zai.chat.completions.create({
        messages,
        thinking: { type: 'disabled' },
      });
      const content = completion.choices[0]?.message?.content ?? '';
      if (content.trim()) {
        await sleep(600); // pacing to keep below the rate ceiling
        return content;
      }
    } catch (err) {
      console.log(`    [llm] error: ${(err as Error).message?.slice(0, 120)}`);
    }
  }
  return '';
}

export async function runAgentLoop(opts: {
  zai: LlmClient;
  systemPrompt: string;
  userPrompt: string;
  tools: ToolDef[];
  maxRounds: number;
  /** Mediation + world execution; returns the tool-result text. */
  execute: (tool: string, args: Record<string, string>) => Promise<string>;
  /** Answer confinement hook; may deny and force a retry. */
  checkFinal?: (draft: string) => Promise<string | null>;
  label?: string;
}): Promise<LoopResult> {
  const messages: { role: 'system' | 'user' | 'assistant'; content: string }[] = [
    { role: 'system', content: opts.systemPrompt + protocolBlock(opts.tools) },
    { role: 'user', content: opts.userPrompt },
  ];
  const transcript: LoopResult['transcript'] = [];
  let llmCalls = 0;
  let toolCalls = 0;
  let denied = 0;
  let answer = '';

  for (let round = 0; round < opts.maxRounds; round++) {
    const raw = await callModel(opts.zai, messages);
    llmCalls++;
    if (!raw.trim()) {
      messages.push({ role: 'user', content: '[system] empty response — respond with the JSON protocol.' });
      continue;
    }
    messages.push({ role: 'assistant', content: raw });
    transcript.push({ role: 'assistant', text: raw });

    let parsed = extractJson(raw);
    if (!parsed) {
      // one corrective retry
      const fix = await callModel(opts.zai, [
        ...messages,
        { role: 'user', content: '[system] your last message was not valid JSON per the protocol. Respond again with exactly one JSON object.' },
      ]);
      llmCalls++;
      parsed = extractJson(fix);
      if (parsed) {
        messages.push({ role: 'assistant', content: fix });
        transcript.push({ role: 'assistant', text: fix });
      }
    }
    if (!parsed) {
      // treat the raw text as the final answer (honest fallback)
      answer = raw.trim();
      break;
    }

    if (parsed.final_answer !== undefined) {
      answer = String(parsed.final_answer);
      // answer confinement: up to two clean-up retries
      if (opts.checkFinal) {
        for (let r = 0; r < 2; r++) {
          const denial = await opts.checkFinal(answer);
          if (denial === null) break;
          denied++;
          const fix = await callModel(opts.zai, [
            ...messages,
            { role: 'user', content: `[system] ${denial}` },
          ]);
          llmCalls++;
          const reparsed = extractJson(fix);
          const candidate = reparsed?.final_answer !== undefined ? String(reparsed.final_answer) : fix.trim();
          messages.push({ role: 'assistant', content: fix });
          transcript.push({ role: 'assistant', text: fix });
          answer = candidate;
        }
      }
      break;
    }

    const calls = Array.isArray(parsed.tool_calls) ? parsed.tool_calls : [];
    if (calls.length === 0) {
      messages.push({ role: 'user', content: '[system] no tool_calls and no final_answer in your JSON. Either call tools or finish with final_answer.' });
      continue;
    }
    const results: string[] = [];
    for (const call of calls.slice(0, 6)) {
      const tool = String(call?.tool ?? '');
      const args: Record<string, string> = {};
      for (const [k, v] of Object.entries(call?.args ?? {})) args[k] = String(v);
      if (!tool) {
        results.push('[error] missing tool name');
        continue;
      }
      toolCalls++;
      const result = await opts.execute(tool, args);
      if (result.startsWith('[GUARD] DENIED')) denied++;
      results.push(`[${tool}] ${result}`);
    }
    const resultText = results.join('\n\n').slice(0, 12000);
    messages.push({ role: 'user', content: `TOOL RESULTS:\n${resultText}` });
    transcript.push({ role: 'tool', text: resultText });
  }

  if (!answer) answer = '[no final answer within round budget]';
  return { answer, rounds: messages.length, llmCalls, toolCalls, denied, transcript };
}
