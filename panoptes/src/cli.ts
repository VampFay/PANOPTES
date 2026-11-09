#!/usr/bin/env bun
/**
 * panoptes — CLI.
 *
 *   panoptes check <policy.json> [--tool NAME --arg k=v ...] [--json] [--no-organs]
 *   panoptes describe <policy.json> [--json]
 *   panoptes replay <policy.json> <trace.jsonl> [--json]
 *   panoptes bench [--quick]
 *   panoptes serve [--port N] [--policy path] [--token T] [--audit path] [--host H] [--max-sessions N]
 *   panoptes mcp [--policy path]
 *   panoptes version
 *
 * Exit codes: 0 success (policy valid / decision allow / bench clean),
 * 1 decision deny or regression, 2 usage/IO/policy errors.
 */

import { readFileSync } from 'node:fs';
import { loadPolicy, declarativePolicy } from './policy-load';
import { Observatory, type PolicyDoc } from './core/v2';
import { CORPUS, CANARIES } from './corpus';
import { PanoptesEngine } from './core/engine';
import { TRUST } from './core/label';
import { VERSION } from './version';

// ------------------------------------------------------------- arg utils

function parseArgs(rest: string[]): { flags: Record<string, string | boolean>; positional: string[] } {
  const flags: Record<string, string | boolean> = {};
  const positional: string[] = [];
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i]!;
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const next = rest[i + 1];
      if (next !== undefined && !next.startsWith('--')) {
        flags[key] = next;
        i += 1;
      } else {
        flags[key] = true;
      }
    } else {
      positional.push(a);
    }
  }
  return { flags, positional };
}

function collectArgPairs(rest: string[]): Record<string, string> {
  // multiple --arg k=v pairs collected from the command's own argv slice
  const out: Record<string, string> = {};
  for (let i = 0; i < rest.length; i++) {
    if (rest[i] === '--arg' && rest[i + 1]) {
      const kv = rest[i + 1]!;
      const eq = kv.indexOf('=');
      if (eq > 0) out[kv.slice(0, eq)] = kv.slice(eq + 1);
      i += 1;
    }
  }
  return out;
}

function fail(msg: string, code = 2): never {
  console.error(`panoptes: ${msg}`);
  process.exit(code);
}

function toolName(spec: { name: string; match?: unknown }): string {
  return spec.name;
}

// ------------------------------------------------------------------ check

async function cmdCheck(rest: string[]): Promise<number> {
  const { flags, positional } = parseArgs(rest);
  const path = positional[0] ?? fail('check: policy path required');
  let policy: PolicyDoc;
  try {
    policy = loadPolicy(path);
  } catch (e) {
    return fail(`check: ${(e as Error).message}`);
  }
  const organs = flags['no-organs'] !== true;
  const json = flags.json === true;
  const engine = new Observatory(policy, { organs });

  const tool = typeof flags.tool === 'string' ? flags.tool : undefined;
  if (!tool) {
    if (json) {
      console.log(JSON.stringify({ ok: true, tools: policy.tools.length, trustChain: policy.trustChain }));
    } else {
      console.log(`policy OK — ${policy.tools.length} tool specs, trust chain: ${policy.trustChain.join(' < ')}`);
    }
    return 0;
  }
  const args = collectArgPairs(rest);
  const mediation = engine.check(tool, args);
  if (json) {
    console.log(JSON.stringify(mediation, null, 2));
  } else {
    const verdict = mediation.decision === 'allow' ? 'ALLOW' : 'DENY';
    console.log(`${verdict}  ${tool}`);
    for (const r of mediation.reasons) console.log(`  reason: ${r}`);
    if (mediation.organs.length) console.log(`  organs: ${mediation.organs.join(', ')}`);
  }
  return mediation.decision === 'allow' ? 0 : 1;
}

// ------------------------------------------------------------------ doctor

export function lintPolicy(policy: PolicyDoc): Array<{ severity: 'error' | 'warn'; category: string; message: string }> {
  const diagnostics: Array<{ severity: 'error' | 'warn'; category: string; message: string }> = [];
  const knownTrust = new Set(policy.trustChain);

  const emittedTrust = new Set<string>([policy.boundary.trust]);
  for (const t of policy.tools) {
    if (t.delta?.trust) emittedTrust.add(t.delta.trust);
  }

  for (const t of policy.tools) {
    if (t.requires?.trust && !knownTrust.has(t.requires.trust)) {
      diagnostics.push({
        severity: 'error',
        category: 'trust',
        message: `tool "${t.name}" requires unknown trust level "${t.requires.trust}"`,
      });
    } else if (t.requires?.trust && !emittedTrust.has(t.requires.trust)) {
      diagnostics.push({
        severity: 'warn',
        category: 'trust',
        message: `tool "${t.name}" requires trust level "${t.requires.trust}" which is never initialized in boundary nor emitted by any tool delta`,
      });
    }
  }

  for (const t of policy.tools) {
    if (t.match) {
      for (const [k, pat] of Object.entries(t.match)) {
        if (!pat) {
          diagnostics.push({
            severity: 'error',
            category: 'selector',
            message: `tool "${t.name}" has empty selector for parameter "${k}"`,
          });
        } else if (typeof pat === 'string') {
          try {
            new RegExp(pat);
          } catch (e) {
            diagnostics.push({
              severity: 'error',
              category: 'regex',
              message: `tool "${t.name}" selector "${k}" has invalid regex "${pat}": ${(e as Error).message}`,
            });
          }
        }
      }
    }
    if (t.name.includes('(') && !t.name.endsWith(')')) {
      diagnostics.push({
        severity: 'error',
        category: 'selector',
        message: `tool "${t.name}" has unbalanced parentheses in name selector`,
      });
    }
  }

  for (const t of policy.tools) {
    if (t.egress) {
      if (!t.sinkParams || t.sinkParams.length === 0) {
        diagnostics.push({
          severity: 'warn',
          category: 'sink',
          message: `egress tool "${t.name}" has no sinkParams declared (defaults to standard sink parameters)`,
        });
      }
      if (!t.requires?.audience && !t.requires?.trust) {
        diagnostics.push({
          severity: 'warn',
          category: 'sink',
          message: `egress tool "${t.name}" has no audience or trust restrictions in requires`,
        });
      }
    }
  }

  const emittedEffects = new Set<string>();
  for (const t of policy.tools) {
    if (t.effects) {
      for (const eff of t.effects) emittedEffects.add(eff);
    }
  }

  for (const t of policy.tools) {
    if (t.requires?.effects?.contains) {
      for (const reqEff of t.requires.effects.contains) {
        if (!emittedEffects.has(reqEff)) {
          diagnostics.push({
            severity: 'error',
            category: 'effect',
            message: `tool "${t.name}" requires effect "${reqEff}" which is never emitted by any tool`,
          });
        }
      }
    }
  }

  return diagnostics;
}

export async function cmdDoctor(rest: string[]): Promise<number> {
  const { flags, positional } = parseArgs(rest);
  const path = positional[0] ?? fail('doctor: policy path required');
  let policy: PolicyDoc;
  try {
    policy = loadPolicy(path);
  } catch (e) {
    if (flags.json === true) {
      console.log(JSON.stringify({ ok: false, errors: [(e as Error).message], warnings: [] }, null, 2));
    } else {
      console.error(`panoptes doctor: cannot load policy "${path}": ${(e as Error).message}`);
    }
    return 1;
  }

  const diags = lintPolicy(policy);
  const errors = diags.filter((d) => d.severity === 'error');
  const warnings = diags.filter((d) => d.severity === 'warn');

  if (flags.json === true) {
    console.log(
      JSON.stringify(
        {
          ok: errors.length === 0,
          errors: errors.map((e) => `[${e.category}] ${e.message}`),
          warnings: warnings.map((w) => `[${w.category}] ${w.message}`),
          tools: policy.tools.length,
        },
        null,
        2,
      ),
    );
  } else {
    if (errors.length === 0 && warnings.length === 0) {
      console.log(`✓ policy "${path}" is clean and valid (${policy.tools.length} tools, 0 errors, 0 warnings)`);
    } else {
      if (errors.length > 0) {
        console.error(`✗ policy "${path}" has ${errors.length} error(s):`);
        for (const e of errors) console.error(`  [ERROR:${e.category}] ${e.message}`);
      }
      if (warnings.length > 0) {
        console.warn(`! policy "${path}" has ${warnings.length} warning(s):`);
        for (const w of warnings) console.warn(`  [WARN:${w.category}] ${w.message}`);
      }
    }
  }

  return errors.length === 0 ? 0 : 1;
}

// --------------------------------------------------------------- describe

function cmdDescribe(rest: string[]): number {
  const { flags, positional } = parseArgs(rest);
  const path = positional[0] ?? fail('describe: policy path required');
  let policy: PolicyDoc;
  try {
    policy = loadPolicy(path);
  } catch (e) {
    return fail(`describe: ${(e as Error).message}`);
  }
  if (flags.json === true) {
    const printable = {
      trustChain: policy.trustChain,
      boundary: policy.boundary,
      sensitiveStores: policy.sensitiveStores ?? [],
      tools: policy.tools.map((t) => ({
        name: t.name,
        match: t.match ? '(parameter selector)' : undefined,
        delta: t.delta,
        requires: t.requires,
        effects: t.effects,
        egress: t.egress ?? false,
        sinkParams: t.sinkParams,
        annotator: t.annotator,
        authority: t.authority,
      })),
      sanitizers: (policy.sanitizers ?? []).map((s) => ({
        name: s.name,
        on: s.on,
        permits: s.permits,
      })),
    };
    console.log(JSON.stringify(printable, null, 2));
    return 0;
  }
  console.log(`trust chain   ${policy.trustChain.join('  <  ')}`);
  console.log(`boundary      trust=${policy.boundary.trust}  audience={${policy.boundary.audience.join(', ')}}`);
  if (policy.sensitiveStores?.length) {
    console.log(`sensitive     ${policy.sensitiveStores.join(', ')}`);
  }
  console.log('tools:');
  for (const t of policy.tools) {
    const bits: string[] = [];
    if (t.match) bits.push('selector');
    if (t.delta?.trust) bits.push(`delta.trust=${t.delta.trust}`);
    if (t.delta?.audience) bits.push(`delta.audience={${t.delta.audience.join(',')}}`);
    if (t.requires?.trust) bits.push(`requires.trust>=${t.requires.trust}`);
    if (t.requires?.audience?.contains) bits.push(`requires.readers=[${t.requires.audience.contains.join(',')}]`);
    if (t.requires?.effects) bits.push(`requires.effects=${JSON.stringify(t.requires.effects)}`);
    if (t.requires?.attention) bits.push(`requires.attention=[${t.requires.attention.join(',')}]`);
    if (t.egress) bits.push('EGRESS');
    if (t.effects) bits.push(`effects=[${t.effects.join(',')}]`);
    console.log(`  ${toolName(t).padEnd(34)} ${bits.join('  ')}`);
  }
  if (policy.sanitizers?.length) {
    console.log('sanitizers:');
    for (const s of policy.sanitizers) {
      console.log(`  ${s.name.padEnd(24)} on=${s.on.join(',')}  permits=${JSON.stringify(s.permits)}`);
    }
  }
  return 0;
}

// ----------------------------------------------------------------- replay

type TraceLine =
  | { tool: string; args?: Record<string, string> }
  | { observe: string; args?: Record<string, string>; output: string }
  | { begin: true }
  | { world: { store: string; content: string } }
  | { answer: string }
  | { fault: true }
  | { rotate: true }
  | { canary: string };

function cmdReplay(rest: string[]): number {
  const { flags, positional } = parseArgs(rest);
  const policyPath = positional[0] ?? fail('replay: policy path required');
  const tracePath = positional[1] ?? fail('replay: trace path required');
  let policy: PolicyDoc;
  let lines: string[];
  try {
    policy = loadPolicy(policyPath);
    lines = readFileSync(tracePath, 'utf8').split('\n').filter((l) => l.trim() && !l.trim().startsWith('#'));
  } catch (e) {
    return fail(`replay: ${(e as Error).message}`);
  }
  const engine = new Observatory(policy, { organs: true });
  let allowed = 0;
  let denied = 0;
  const organCounts = new Map<string, number>();
  const asJson = flags.json === true;
  const out: unknown[] = [];

  const bump = (organs: string[]) => {
    for (const o of organs) organCounts.set(o, (organCounts.get(o) ?? 0) + 1);
  };

  for (const line of lines) {
    let ev: TraceLine;
    try {
      ev = JSON.parse(line) as TraceLine;
    } catch {
      return fail(`replay: unparseable line: ${line.slice(0, 60)}`);
    }
    if ('begin' in ev) {
      engine.beginTrace();
      if (asJson) out.push({ event: 'begin' });
      else console.log('--- begin trace');
      continue;
    }
    if ('world' in ev) {
      engine.enrollWorldCanaries(ev.world.store, ev.world.content);
      if (asJson) out.push({ event: 'world', store: ev.world.store });
      else console.log(`world enrolled (store=${ev.world.store})`);
      continue;
    }
    if ('canary' in ev) {
      engine.addCanary(ev.canary);
      continue;
    }
    if ('fault' in ev) {
      engine.injectMemoryFault();
      if (asJson) out.push({ event: 'fault' });
      else console.log('memory fault injected — session fail-closed');
      continue;
    }
    if ('rotate' in ev) {
      const r = engine.rotateCanaries();
      if (asJson) out.push({ event: 'rotate', ...r });
      else console.log(`canaries rotated: ${r.retired} retired, generation ${r.generation}`);
      continue;
    }
    if ('answer' in ev) {
      const verdict = engine.checkAnswer(ev.answer);
      if (asJson) out.push({ event: 'answer', ok: verdict.ok, ...(verdict.ok ? {} : { reason: verdict.reason }) });
      else console.log(verdict.ok ? 'ANSWER  ok' : `ANSWER  blocked — ${verdict.reason}`);
      continue;
    }
    if ('observe' in ev) {
      const obs = engine.observe(ev.observe, ev.args ?? {}, ev.output);
      bump(obs.organs);
      if (asJson) out.push({ event: 'observe', tool: ev.observe, injected: obs.injected, organs: obs.organs, notes: obs.notes });
      else {
        console.log(`OBSERVE ${ev.observe}  injected=${obs.injected ? 'YES' : 'no'}${obs.notes.length ? `  (${obs.notes.join('; ')})` : ''}`);
      }
      continue;
    }
    if ('tool' in ev) {
      const args = ev.args ?? {};
      const mediation = engine.check(ev.tool, args);
      if (mediation.decision === 'allow') {
        allowed += 1;
        engine.recordEffects(ev.tool, args, mediation);
      } else {
        denied += 1;
      }
      bump(mediation.organs);
      if (asJson) {
        out.push({ event: 'decision', tool: ev.tool, ...mediation });
      } else {
        const verdict = mediation.decision === 'allow' ? 'ALLOW' : 'DENY ';
        console.log(`${verdict}  ${ev.tool}${Object.keys(args).length ? `  ${JSON.stringify(args)}` : ''}`);
        for (const r of mediation.reasons) console.log(`        ${r}`);
        if (mediation.organs.length) console.log(`        organs: ${mediation.organs.join(', ')}`);
      }
      continue;
    }
    return fail(`replay: unknown trace event: ${line.slice(0, 60)}`);
  }

  const label = engine.currentLabel;
  const summary = {
    allowed,
    denied,
    organs: Object.fromEntries(organCounts),
    finalLabel: { trust: policy.trustChain[label.trust] ?? label.trust, audience: [...label.audience] },
  };
  if (asJson) {
    out.push({ event: 'summary', ...summary });
    console.log(JSON.stringify(out, null, 2));
  } else {
    console.log('--- summary');
    console.log(`allowed ${allowed}  denied ${denied}`);
    const organSummary = [...organCounts.entries()].map(([k, v]) => `${k}×${v}`).join('  ');
    if (organSummary) console.log(`organs  ${organSummary}`);
    console.log(`flow    trust=${summary.finalLabel.trust} audience={${summary.finalLabel.audience.join(', ')}}`);
  }
  // Denials in a replay are the guardrail working, not a CLI failure — exit 0
  // on a successfully completed replay (nonzero only for parse/IO/policy errors).
  return 0;
}

// ------------------------------------------------------------------ bench

function runScenario(engine: PanoptesEngine, s: (typeof CORPUS)[number]): 'allow' | 'deny' {
  engine.beginTrace();
  let last = 'allow' as 'allow' | 'deny';
  for (let t = 0; t < s.traces.length; t++) {
    if (t > 0) engine.beginTrace();
    for (const step of s.traces[t]!) {
      last = engine.decide(step.tool, step.params).decision;
    }
  }
  return last;
}

function cmdBench(rest: string[]): number {
  const { flags } = parseArgs(rest);
  const quick = flags.quick === true;

  // ---- arms over the 40-scenario corpus --------------------------------
  const canaries = [...CANARIES];
  const arms: Array<{ name: string; engine: () => PanoptesEngine }> = [
    { name: 'panoptes (organs on)', engine: () => new PanoptesEngine({ organs: true, canaries }) },
    { name: 'appa-mirror (organs off)', engine: () => new PanoptesEngine({ organs: false }) },
    {
      name: 'appa + blunt memory note',
      engine: () =>
        new PanoptesEngine({ organs: false, memoryReadDelta: (l) => ({ ...l, trust: Math.min(l.trust, TRUST.suspicious) }) }),
    },
  ];

  const golden: Record<string, [number, number]> = {
    'panoptes (organs on)': [24, 16],
    'appa-mirror (organs off)': [16, 16],
    'appa + blunt memory note': [20, 12],
  };

  let regression = false;
  console.log(`corpus: ${CORPUS.length} scenarios (${CORPUS.filter((s) => s.family === 'attack').length} attack / ${CORPUS.filter((s) => s.family === 'benign').length} benign)`);
  for (const arm of arms) {
    let attackBlocked = 0;
    let benignPassed = 0;
    for (const s of CORPUS) {
      const verdict = runScenario(arm.engine(), s);
      if (s.family === 'attack' && verdict === 'deny') attackBlocked += 1;
      if (s.family === 'benign' && verdict === 'allow') benignPassed += 1;
    }
    const [gA, gB] = golden[arm.name] ?? [-1, -1];
    const ok = attackBlocked === gA && benignPassed === gB;
    if (!ok) regression = true;
    console.log(
      `  ${arm.name.padEnd(28)} attacks ${String(attackBlocked).padStart(2)}/24   benign ${String(benignPassed).padStart(2)}/16   ${ok ? 'matches golden' : 'REGRESSION (golden ' + gA + '/' + gB + ')'}`,
    );
  }

  // ---- latency micro-bench (v2 Observatory, full organ path) -----------
  const policy: PolicyDoc = declarativePolicy({
    trustChain: ['suspicious', 'vendor', 'internal'],
    boundary: { trust: 'internal', audience: ['hr@corp.example', 'public'] },
    sensitiveStores: ['hr'],
    tools: [
      { name: 'mcp/files/read(path:/hr/*)', delta: { audience: ['hr@corp.example'] } },
      { name: 'mcp/files/read(path:/web/*)', delta: { trust: 'suspicious' } },
      { name: 'mcp/files/read' },
      { name: 'memory_read' },
      { name: 'memory_write' },
      { name: 'mcp/mail/send', egress: true, requires: { audience: { contains: ['$to'] } } },
      { name: 'mcp/web/post', egress: true, requires: { audience: { contains: ['public'] } } },
      { name: 'mcp/sys/exec', requires: { trust: 'internal' } },
    ],
  });
  const v2Policy: PolicyDoc = declarativePolicy({
    trustChain: ['suspicious', 'vendor', 'internal'],
    boundary: { trust: 'internal', audience: ['public'] },
    sensitiveStores: ['hr'],
    tools: [
      { name: 'mcp/files/read(path:/hr/*)', delta: { audience: ['hr@corp.example'] } },
      { name: 'mcp/files/read(path:/web/*)', delta: { trust: 'suspicious' } },
      { name: 'mcp/files/read' },
      { name: 'mcp/memory/read' },
      { name: 'mcp/memory/write' },
      { name: 'mcp/mail/send', egress: true, requires: { audience: { contains: ['$to'] } } },
      { name: 'mcp/web/post', egress: true, requires: { audience: { contains: ['public'] } } },
      { name: 'mcp/webhook/post', egress: true, requires: { audience: { contains: ['public'] } } },
      { name: 'mcp/sys/exec', requires: { trust: 'internal' } },
    ],
  });
  let v2Attacks = 0;
  let v2Benign = 0;
  for (const s of CORPUS) {
    const v2 = new Observatory(v2Policy, { organs: true, canaries });
    const memStore = new Map<string, string>();
    let last: 'allow' | 'deny' = 'allow';
    for (let t = 0; t < s.traces.length; t++) {
      if (t > 0) v2.beginTrace();
      for (const step of s.traces[t]!) {
        last = v2.check(step.tool, step.params).decision;
        if (last === 'allow') {
          if (step.tool === 'mcp/memory/write' && step.params.key) {
            memStore.set(step.params.key, step.params.value ?? 'ok');
          }
          const out =
            step.tool === 'mcp/memory/read' && step.params.key
              ? (memStore.get(step.params.key) ?? 'ok')
              : (step.params.value ?? step.params.body ?? step.params.content ?? 'ok');
          v2.observe(step.tool, step.params, out);
        }
      }
    }
    if (s.family === 'attack' && last === 'deny') v2Attacks += 1;
    if (s.family === 'benign' && last === 'allow') v2Benign += 1;
  }
  const v2Ok = v2Attacks === 24 && v2Benign === 16;
  if (!v2Ok) regression = true;
  console.log(
    `  ${'panoptes v2 (Observatory)'.padEnd(28)} attacks ${String(v2Attacks).padStart(2)}/24   benign ${String(v2Benign).padStart(2)}/16   ${v2Ok ? 'matches golden' : 'REGRESSION'}`,
  );

  const engine = new Observatory(policy, { organs: true });
  engine.enrollWorldCanaries('hr', 'salary: 91,204 CANARY-7f3a2b\nreconciliation ref: 482193');
  const reps = quick ? 5_000 : 40_000;
  const mix: Array<[string, Record<string, string>]> = [
    ['mcp/files/read', { path: '/hr/alpha.txt' }],
    ['mcp/files/read', { path: '/web/Forum (public).txt' }],
    ['mcp/mail/send', { to: 'recruiter@other.com', body: 'quarterly summary — no secrets' }],
    ['memory_write', { key: 'note', value: 'meeting at 3' }],
    ['memory_read', { key: 'note' }],
    ['mcp/sys/exec', { cmd: 'ls' }],
  ];
  const stepCycle = () => {
    engine.beginTrace();
    engine.check(mix[0]![0], mix[0]![1]);
    engine.observe(mix[0]![0], mix[0]![1], 'hr record');
    engine.check(mix[1]![0], mix[1]![1]);
    engine.observe(mix[1]![0], mix[1]![1], 'forum post');
    engine.check(mix[2]![0], mix[2]![1]);
    engine.observe(mix[3]![0], mix[3]![1], 'meeting at 3');
    engine.observe(mix[4]![0], mix[4]![1], 'meeting at 3');
    engine.check(mix[5]![0], mix[5]![1]);
  };
  for (let i = 0; i < 200; i++) stepCycle();
  const start = performance.now();
  for (let i = 0; i < reps; i++) stepCycle();
  const totalMs = performance.now() - start;
  const meanUs = (totalMs * 1000) / (reps * mix.length);
  console.log(`latency: v2 full-organ stack mean ${meanUs.toFixed(2)} us/decision over ${reps * mix.length} stateful decisions (hot loop)`);
  if (meanUs > 50) {
    console.log('latency: REGRESSION (mean > 50 us — check the organ stack)');
    regression = true;
  }
  console.log(regression ? 'RESULT: REGRESSION DETECTED' : 'RESULT: all arms match golden numbers');
  return regression ? 1 : 0;
}

// ------------------------------------------------------------------- main

const [cmd, ...rest] = process.argv.slice(2);
switch (cmd) {
  case 'check':
    process.exitCode = await cmdCheck(rest);
    break;
  case 'describe':
    process.exitCode = cmdDescribe(rest);
    break;
  case 'replay':
    process.exitCode = cmdReplay(rest);
    break;
  case 'bench':
    process.exitCode = cmdBench(rest);
    break;
  case 'doctor':
    process.exitCode = await cmdDoctor(rest);
    break;
  case 'serve': {
    const { serve } = await import('./server');
    process.exitCode = await serve(rest);
    break;
  }
  case 'mcp': {
    const { runMcp } = await import('./mcp');
    process.exitCode = await runMcp(rest);
    break;
  }
  case 'mcp-proxy': {
    const { runMcpProxy } = await import('./mcp');
    process.exitCode = await runMcpProxy(rest);
    break;
  }
  case 'version':
  case '--version':
  case '-v':
    console.log(`panoptes ${VERSION}`);
    break;
  default:
    console.error('usage: panoptes <command> [args]');
    console.error('  check <policy.json> [--tool NAME --arg k=v ...] [--json] [--no-organs]');
    console.error('  doctor <policy.json> [--json]');
    console.error('  describe <policy.json> [--json]');
    console.error('  replay <policy.json> <trace.jsonl> [--json]');
    console.error('  bench [--quick]');
    console.error('  serve [--port N] [--policy path] [--token T] [--audit path] [--host H] [--max-sessions N] [--watch] [--silent-notes]');
    console.error('  mcp [--policy path] [--silent-notes]');
    console.error('  mcp-proxy [--policy path] [--canary token] -- <child command> [args...]');
    process.exitCode = 2;
}
