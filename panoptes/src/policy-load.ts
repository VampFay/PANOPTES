/**
 * PANOPTES policy loading — declarative JSON policy files.
 *
 * The engine's `PolicyDoc` carries match/sanitize functions (not
 * JSON-serializable). This module defines the on-disk declarative subset and
 * compiles it into a live `PolicyDoc`:
 *
 *   - tool selectors: either the OpenAPPA-style name suffix
 *     `"mcp/files/read(path:/hr/*)"` or an explicit `match` rule list
 *     (`[{ param: "path", glob: "/hr/*" }]`) — all rules must match (AND);
 *   - sanitizers: declarative redaction patterns compiled to apply functions.
 *
 * Example (see examples/policies/):
 *   {
 *     "trustChain": ["suspicious", "vendor", "internal"],
 *     "boundary": { "trust": "internal", "audience": ["hr@corp.example"] },
 *     "sensitiveStores": ["hr", "finance"],
 *     "tools": [
 *       { "name": "mcp/files/read(path:/hr/*)", "delta": { "audience": ["hr@corp.example"] } },
 *       { "name": "mcp/files/read(path:/web/*)", "delta": { "trust": "suspicious" } },
 *       { "name": "mcp/mail/send", "egress": true,
 *         "requires": { "audience": { "contains": ["$to"] } } }
 *     ]
 *   }
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { PolicyDoc, Sanitizer, ToolSpec } from './core/v2';

// ------------------------------------------------------------------ types

export type MatchRule = {
  /** Argument the selector tests. */
  param: string;
  /** Glob pattern: `*` matches within a path segment, `**` matches anything. */
  glob: string;
};

export type PolicyFile = {
  trustChain: string[];
  boundary: { trust: string; audience: string[] };
  sensitiveStores?: string[];
  tools: Array<{
    /** Tool name; may carry `(param:glob)` selectors, OpenAPPA-style. */
    name: string;
    /** Explicit selectors (AND-ed). Mutually exclusive with the name suffix. */
    match?: MatchRule[];
    delta?: { trust?: string; audience?: string[] };
    requires?: {
      trust?: string;
      audience?: { contains: string[] };
      effects?: { contains?: string[]; excludes?: string[] };
      attention?: string[];
    };
    effects?: string[];
    egress?: boolean;
    sinkParams?: string[];
    annotator?: string;
    authority?: string;
  }>;
  sanitizers?: Array<{
    name: string;
    on: Array<'fork_return' | 'egress_remedy'>;
    permits: { audience?: { from: string[]; to: string[] } };
    /** Redaction rules, applied in order: regex → replacement (default "[REDACTED]"). */
    redact?: Array<{ pattern: string; flags?: string; replacement?: string }>;
  }>;
};

// ------------------------------------------------------------------ glob

/** Compile a glob to a RegExp. `**` crosses path separators, `*` does not. */
export function globToRegExp(glob: string): RegExp {
  let re = '';
  let i = 0;
  while (i < glob.length) {
    const c = glob[i]!;
    if (c === '*') {
      if (glob[i + 1] === '*') {
        re += '[\\s\\S]*';
        i += 2;
        continue;
      }
      re += '[^/]*';
      i += 1;
      continue;
    }
    if ('\\^$.|?+()[]{}'.includes(c)) re += '\\' + c;
    else re += c;
    i += 1;
  }
  return new RegExp('^' + re + '$');
}

/** Parse `"tool(param:glob)"` into base name + selector rule. */
export function parseToolName(name: string): { base: string; rules: MatchRule[] } {
  const m = /^(.+?)\((\w+):(.+?)\)$/.exec(name);
  if (!m) return { base: name, rules: [] };
  return { base: m[1]!, rules: [{ param: m[2]!, glob: m[3]! }] };
}

function compileMatch(name: string, rules: MatchRule[]): ToolSpec['match'] {
  const { base, rules: nameRules } = parseToolName(name);
  const all = [...nameRules, ...(rules ?? [])];
  if (all.length === 0) return undefined;
  const compiled = all.map((r) => ({ param: r.param, re: globToRegExp(r.glob) }));
  return (args: Record<string, string>) => {
    for (const { param, re } of compiled) {
      const v = args[param];
      if (typeof v !== 'string' || !re.test(v)) return false;
    }
    return true;
  };
}

// ------------------------------------------------------------------ loader

/** Compile a declarative policy file into a live PolicyDoc. Pure. */
export function declarativePolicy(file: PolicyFile): PolicyDoc {
  if (!file.trustChain?.length) throw new Error('policy: trustChain must be a non-empty array');
  if (file.trustChain.length < 2) throw new Error('policy: trustChain needs at least two ranks');
  const dup = file.trustChain.find((t, i) => file.trustChain.indexOf(t) !== i);
  if (dup) throw new Error(`policy: trustChain duplicate rank "${dup}"`);
  const rankSet = new Set(file.trustChain);
  if (!rankSet.has(file.boundary.trust)) {
    throw new Error(`policy: boundary.trust "${file.boundary.trust}" is not a trustChain rank`);
  }
  if (!file.boundary.audience?.length) {
    throw new Error('policy: boundary.audience must be a non-empty reader set');
  }

  const names = new Set<string>();
  for (const t of file.tools) {
    if (!t.name) throw new Error('policy: every tool needs a name');
    const { base } = parseToolName(t.name);
    names.add(base);
    if (t.delta?.trust && !rankSet.has(t.delta.trust)) {
      throw new Error(`tool ${t.name}: delta.trust "${t.delta.trust}" is not a trustChain rank`);
    }
    if (t.requires?.trust && !rankSet.has(t.requires.trust)) {
      throw new Error(`tool ${t.name}: requires.trust "${t.requires.trust}" is not a trustChain rank`);
    }
  }

  const tools: ToolSpec[] = file.tools.map((t) => {
    const { base } = parseToolName(t.name);
    const spec: ToolSpec = { name: base, match: compileMatch(t.name, t.match ?? []) };
    if (t.delta) spec.delta = t.delta;
    if (t.requires) spec.requires = t.requires;
    if (t.effects) spec.effects = t.effects;
    if (t.egress) spec.egress = true;
    if (t.sinkParams) spec.sinkParams = t.sinkParams;
    if (t.annotator) spec.annotator = t.annotator;
    if (t.authority) spec.authority = t.authority;
    return spec;
  });

  const sanitizers: Sanitizer[] | undefined = file.sanitizers?.map((s) => {
    if (!s.redact?.length) throw new Error(`sanitizer ${s.name}: declarative files need redact rules`);
    const rules = s.redact.map((r) => ({
      re: new RegExp(r.pattern, r.flags ?? 'g'),
      replacement: r.replacement ?? '[REDACTED]',
    }));
    const apply = (content: string): string => {
      let out = content;
      for (const { re, replacement } of rules) out = out.replace(re, replacement);
      return out;
    };
    return { name: s.name, on: s.on, permits: s.permits, apply };
  });

  return {
    trustChain: file.trustChain,
    boundary: file.boundary,
    sensitiveStores: file.sensitiveStores,
    tools,
    sanitizers,
  };
}

/** Load and compile a policy file from disk. Relative paths resolve against
 *  the process cwd first, then the package root — so the CLI and the test
 *  suite behave identically from any working directory. */
export function loadPolicy(path: string): PolicyDoc {
  let raw: string;
  try {
    raw = readFileSync(path, 'utf8');
  } catch {
    const fallback = join(import.meta.dir, '..', path);
    raw = readFileSync(fallback, 'utf8');
  }
  return declarativePolicy(JSON.parse(raw) as PolicyFile);
}
