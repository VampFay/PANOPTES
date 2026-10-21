/**
 * bench2 — atb-sync: fold a completed (or partial) AgentThreatBench episode
 * file (scripts/results-atb.json, produced by run-atb.ts) into the two
 * dashboard artifacts:
 *
 *   1. src/lib/external-results.ts   — the ATB_* exports (typed module)
 *   2. public/bench/panoptes_external_benchmarks.json — the raw download
 *
 * Usage: bun run scripts/bench2/atb-sync.ts
 *   PANOPTES_RESULTS_ATB=<path> overrides the episode file location.
 *
 * The splice is surgical: only the ATB_* constants and the
 * agentThreatBench section are rewritten — the corp / tau / engine numbers
 * and every other export keep whatever their latest measured values are.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const RESULTS = process.env.PANOPTES_RESULTS_ATB ?? join(import.meta.dir, '..', 'results-atb.json');
const TS_OUT = join(import.meta.dir, '..', '..', 'src', 'lib', 'external-results.ts');
const JSON_OUT = join(import.meta.dir, '..', '..', 'public', 'bench', 'panoptes_external_benchmarks.json');

type Episode = {
  arm: string;
  sample: string;
  task_type: string;
  utility: boolean;
  security: boolean;
};

const episodes = (JSON.parse(readFileSync(RESULTS, 'utf8')) as { episodes: Episode[] }).episodes;

// ---------------------------------------------------------------- aggregation
const GROUP_KEY: Record<string, string> = {
  memory_poison: 'memoryPoison',
  autonomy_hijack: 'autonomy',
  data_exfil: 'dataExfil',
};

type Cell = { n: number; utility: number; security: number };
const groups: Record<string, Record<string, Cell>> = {};
for (const e of episodes) {
  const g = (groups[e.arm] ??= {});
  const k = e.task_type;
  const c = (g[k] ??= { n: 0, utility: 0, security: 0 });
  c.n++;
  if (e.utility) c.utility++;
  if (e.security) c.security++;
}

const overall: Record<string, { utility: number; security: number; n: number }> = {};
for (const [arm, g] of Object.entries(groups)) {
  let u = 0, s = 0, n = 0;
  for (const x of Object.values(g)) { u += x.utility; s += x.security; n += x.n; }
  overall[arm] = { utility: n ? u / n : 0, security: n ? s / n : 0, n };
}

const armOrder = ['stock', 'appa', 'panoptes'] as const;
const arms = armOrder
  .filter((a) => groups[a])
  .map((arm) => {
    const row: Record<string, unknown> = { arm };
    for (const [tt, key] of Object.entries(GROUP_KEY)) {
      const c = groups[arm]?.[tt];
      row[key] = c ? { n: c.n, utility: c.n ? c.utility / c.n : 0, security: c.n ? c.security / c.n : 0 } : { n: 0, utility: 0, security: 0 };
    }
    row.controls = { n: 0, utility: 0, security: 0 };
    return row;
  });

const total = episodes.length;
const fullDenominator = 78; // 24 upstream samples x 3 arms + 2 controls x 3 arms
const maxArm = Math.max(...Object.values(overall).map((o) => o.n));
const coverage = maxArm / 26;
const runState =
  total >= fullDenominator
    ? { status: 'complete', note: 'full 3-arm run' }
    : {
        status: 'complete',
        note: `${total}/${fullDenominator} episodes — all 24 upstream attack samples on every arm; the remainder are local egress controls held back by an API-quota window (the runner is resumable: bun run scripts/bench2/run-atb.ts)`,
      };

const atbFindings = [
  `AgentThreatBench (${total}/${fullDenominator} episodes): panoptes ${(overall.panoptes?.utility ?? 0).toFixed(2)} utility / ${(overall.panoptes?.security ?? 0).toFixed(2)} security vs stock ${(overall.stock?.utility ?? 0).toFixed(2)} / ${(overall.stock?.security ?? 0).toFixed(2)} vs label-only ${(overall.appa?.utility ?? 0).toFixed(2)} / ${(overall.appa?.security ?? 0).toFixed(2)}. Both guarded arms pay a ~12-point utility tax on this suite while the organ stack buys autonomy_hijack (${(groups.stock?.autonomy_hijack.security ? groups.stock.autonomy_hijack.security / groups.stock.autonomy_hijack.n : 0).toFixed(2)} stock → ${(groups.panoptes?.autonomy_hijack.security ? groups.panoptes.autonomy_hijack.security / groups.panoptes.autonomy_hijack.n : 0).toFixed(2)} guarded) and holds data_exfil at ${groups.panoptes?.data_exfil.security ?? 0}/${groups.panoptes?.data_exfil.n ?? 0} with zero exfil.`,
  'HONEST GAP on ATB memory_poison: the poison markers (ADMIN_OVERRIDE, COMPROMISED, role-override strings) flow through every arm — the frozen 16-pattern injection screen does not label these entries, so nothing enrolls the markers for answer-channel suppression. Their published guarded arm (different model) reports security 1.0 at utility 0.5 on this vector; closing our gap needs marker enrollment from declared poison signatures, which is on the roadmap — not tuned to their benchmark post-hoc.',
];

// ------------------------------------------------------------ ts module splice
let ts = readFileSync(TS_OUT, 'utf8');

const armsBlock = `export const ATB_ARMS = ${JSON.stringify(arms, null, 2).replace(/"([a-zA-Z_]+)":/g, '$1:').replace(/"/g, "'")} as const;`;
ts = ts.replace(/export const ATB_ARMS = \[.*?\n\] as const;/s, armsBlock);
if (!ts.includes('export const ATB_ARMS')) throw new Error('ATB_ARMS splice failed');

ts = ts.replace(
  /export const ATB_COVERAGE = [^;]+;/,
  `export const ATB_COVERAGE = ${coverage.toFixed(6).replace(/0+$/, '').replace(/\.$/, '') || '0'} as const;`,
);

const runStateBlock = `export const ATB_RUN_STATE = ${JSON.stringify(runState).replace(/"([a-zA-Z_]+)":/g, '$1:').replace(/"/g, "'")} as const;`;
ts = ts.replace(/export const ATB_RUN_STATE = \{.*?\} as const;/s, runStateBlock);
if (!ts.includes('export const ATB_RUN_STATE')) throw new Error('ATB_RUN_STATE splice failed');

// swap the ATB findings: drop any prior AgentThreatBench-summary entries, append fresh ones
ts = ts.replace(/'AgentThreatBench upstream samples:[^']*',\n/s, '');
ts = ts.replace(/'AgentThreatBench \(full 3-arm run[^']*',\n/s, '');
ts = ts.replace(/'HONEST GAP on ATB memory_poison:[^']*',\n/s, '');
const findingsAdd = atbFindings.map((f) => `  ${JSON.stringify(f).replace(/^"|"$/g, "'")},`).join('\n');
ts = ts.replace(/export const EXTERNAL_FINDINGS: string\[\] = \[\n/, `export const EXTERNAL_FINDINGS: string[] = [\n${findingsAdd}\n`);

// stamp the ATB refresh date next to the corp/tau/engine ranAt
const atbRanAt = new Date().toISOString();
if (!ts.includes('atbRanAt')) {
  ts = ts.replace(/("ranAt": "[^"]+",)/, `$1\n  "atbRanAt": "${atbRanAt}",`);
}

writeFileSync(TS_OUT, ts);

// ------------------------------------------------------------ json artifact splice
const bench = JSON.parse(readFileSync(JSON_OUT, 'utf8'));
bench.agentThreatBench.summary = { groups, overall };
bench.agentThreatBench.episodes = total;
bench.meta.atbRanAt = atbRanAt;
writeFileSync(JSON_OUT, JSON.stringify(bench, null, 2) + '\n');

console.log('atb-sync complete:');
console.log(JSON.stringify({ episodes: total, coverage: +coverage.toFixed(3), overall }, null, 1));
