'use client';

import { useState } from 'react';
import { FlaskConical, FileJson, FileSpreadsheet, Cpu, ShieldCheck, Zap, Scale } from 'lucide-react';
import { Section, ProvBadge, LabShell } from './lab-ui';
import { BENCH_ARMS, BENCH_META, TAXON_ORDER, BENCH_FINDINGS, BENCH_METHODOLOGY, OPENAPPA_SCALING } from '@/lib/bench-results';
import { cn } from '@/lib/utils';

const TAXON_NAMES: Record<string, string> = {
  B1: 'customer reply',
  B2: 'HR → HR',
  B3: 'forum reply',
  B4: 'clean memory → batch',
  T1: 'instruction override',
  T2: 'tool coercion',
  T3: 'exfil sink',
  T4: 'persona hijack',
  T5: 'memory carryover',
  T6: 'canary leak (labels lie)',
};

const ARM_KEYS = ['panoptes', 'openappa', 'appaBaseline', 'appaBlunt', 'regex', 'llmJudge'] as const;

const ARM_SHORT: Record<string, string> = {
  panoptes: 'PANOPTES',
  openappa: 'OpenAPPA (real)',
  appaBaseline: 'APPA mirror',
  appaBlunt: 'APPA blunt',
  regex: 'regex/DLP',
  llmJudge: 'LLM judge',
};

function pct(x: number) {
  return `${(x * 100).toFixed(0)}%`;
}

function rate(n: number) {
  return `${Math.round(n * 100)}%`;
}

function LatencyCell({ armKey }: { armKey: string }) {
  const a = BENCH_ARMS[armKey];
  if (a.latencyMeanNs !== undefined && armKey !== 'openappa') return `${(a.latencyMeanNs / 1000).toFixed(2)} µs`;
  if (armKey === 'openappa') return `${(a.latencyMeanUs ?? 0).toFixed(0)} µs*`;
  if (a.latencyMeanMs !== undefined) return `${a.latencyMeanMs.toFixed(0)} ms`;
  return '—';
}

/** Prototype-provenance badge (distinct from paper / project-page badges). */
function ProtoBadge() {
  return (
    <span className="inline-flex shrink-0 items-center border border-orange-400/40 bg-orange-400/10 px-1.5 py-0.5 font-mono text-[10px] leading-none tracking-wide text-orange-300 uppercase" title="measured in this environment, single run — not from the NeurIPS paper">
      prototype run
    </span>
  );
}

function Cell({ secure, total, highlight }: { secure: number; total: number; highlight?: boolean }) {
  const full = secure === total;
  const zero = secure === 0;
  return (
    <td
      className={cn(
        'px-2 py-1.5 text-center font-mono text-[11px] tabular-nums',
        full ? 'bg-emerald-500/[0.07] text-emerald-300' : zero ? 'bg-rose-500/[0.09] text-rose-300' : 'bg-amber-500/[0.07] text-amber-300',
        highlight && 'font-semibold',
      )}
    >
      {secure}/{total}
    </td>
  );
}

export function PrototypeBench() {
  const [showMethod, setShowMethod] = useState(false);

  const panoptes = BENCH_ARMS.panoptes;
  const openappa = BENCH_ARMS.openappa;
  const llm = BENCH_ARMS.llmJudge;

  // log-scale latency bars (ns)
  const latBars = [
    { label: 'APPA mirror (TS, organs off)', ns: BENCH_ARMS.appaBaseline.latencyMeanNs ?? 0 },
    { label: 'PANOPTES (TS, organs on)', ns: panoptes.latencyMeanNs ?? 0 },
    { label: 'regex/DLP', ns: BENCH_ARMS.regex.latencyMeanNs ?? 0 },
    { label: 'OpenAPPA (subprocess replay)', ns: (openappa.latencyMeanUs ?? 0) * 1000 },
    { label: 'LLM judge', ns: (llm.latencyMeanMs ?? 0) * 1e6 },
  ];
  const logMin = Math.log10(300);
  const logMax = Math.log10(1e9);
  const width = (ns: number) => `${Math.max(2, ((Math.log10(Math.max(ns, 300)) - logMin) / (logMax - logMin)) * 100)}%`;

  return (
    <Section
      id="prototype"
      index="08"
      eyebrow="build · measure · compare"
      title="We built the prototype and benchmarked it against the real OpenAPPA"
      lead="The whitepaper argued the flaws on paper; this section argues them with a working engine. We implemented the PANOPTES fast path — the APPA label algebra plus the ledger, canary, and ratchet organs — as a real TypeScript core, wrote a 40-scenario corpus from the session's threat taxonomy, and ran it head-to-head against the actual OpenAPPA v0.30.0 binary (MIT, replay mode), a naive regex/DLP blocklist, and an LLM-as-judge guardrail. Every number below was measured in this environment, on this run — and labeled as such."
    >
      {/* headline verdict band */}
      <div className="grid grid-cols-1 gap-px border border-zinc-800 bg-zinc-800/60 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { icon: ShieldCheck, value: rate(panoptes.attackBlockRate), label: 'PANOPTES prototype attack block rate (24/24) — incl. the two structural taxa', tint: 'text-emerald-300' },
          { icon: ShieldCheck, value: rate(panoptes.benignPassRate), label: 'benign pass rate (16/16) — organs cost zero legitimate work on this corpus', tint: 'text-emerald-300' },
          { icon: Zap, value: `${((panoptes.latencyMeanNs ?? 0) / 1000).toFixed(2)} µs`, label: 'mean per decision, in-process — organs add ~0.19 µs over the label-only fast path (624 ns vs 430 ns)', tint: 'text-amber-300' },
          { icon: Scale, value: `${rate(openappa.attackBlockRate)} → ${rate(panoptes.attackBlockRate)}`, label: 'attack coverage vs the real OpenAPPA binary at its base policy (16/24 → 24/24)', tint: 'text-amber-300' },
        ].map((s) => (
          <div key={s.label} className="relative bg-zinc-950/60 p-4">
            <div className="flex items-center justify-between gap-2">
              <p className={cn('font-display text-3xl leading-none', s.tint)}>{s.value}</p>
              <s.icon className="h-4 w-4 shrink-0 text-zinc-500" aria-hidden />
            </div>
            <p className="mt-3 text-xs leading-relaxed text-zinc-500">{s.label}</p>
          </div>
        ))}
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <ProtoBadge />
        <p className="font-mono text-[10px] text-zinc-500">
          ran {new Date(BENCH_META.ranAt).toISOString().slice(0, 16).replace('T', ' ')} UTC · {BENCH_META.environment.runtime} ·{' '}
          {BENCH_META.environment.cpu}
        </p>
      </div>

      {/* main comparison table */}
      <div className="mt-8">
        <p className="font-mono text-[11px] tracking-[0.2em] text-zinc-500 uppercase">arm-by-arm comparison</p>
        <div className="scroll-thin mt-3 overflow-x-auto">
          <table className="w-full min-w-[680px] border-collapse border border-zinc-800 text-left">
            <thead>
              <tr className="bg-zinc-900/70 font-mono text-[10px] tracking-[0.15em] text-zinc-500 uppercase">
                <th className="px-3 py-2">arm</th>
                <th className="px-3 py-2 text-center">attacks blocked</th>
                <th className="px-3 py-2 text-center">benign passed</th>
                <th className="px-3 py-2 text-right">latency / decision</th>
                <th className="px-3 py-2">provenance</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/70">
              {ARM_KEYS.map((k) => {
                const a = BENCH_ARMS[k];
                const isOurs = k === 'panoptes';
                return (
                  <tr key={k} className={cn('text-sm', isOurs ? 'bg-amber-500/[0.04]' : 'bg-zinc-950/40')}>
                    <td className={cn('px-3 py-2.5', isOurs ? 'font-semibold text-amber-200' : 'text-zinc-300')}>
                      {ARM_SHORT[k]}
                      {k === 'openappa' && <span className="block font-mono text-[9px] text-zinc-500">v0.30.0 · replay mode · our policy in their idiom</span>}
                      {k === 'appaBlunt' && <span className="block font-mono text-[9px] text-zinc-500">memory/read annotated suspicious</span>}
                    </td>
                    <td className="px-3 py-2.5 text-center font-mono text-[13px] tabular-nums text-zinc-200">
                      <span className={a.attackBlockRate === 1 ? 'text-emerald-300' : a.attackBlockRate < 0.7 ? 'text-rose-300' : 'text-amber-300'}>
                        {rate(a.attackBlockRate)}
                      </span>
                      <span className="ml-1 font-mono text-[9px] text-zinc-500">({Math.round(a.attackBlockRate * 24)}/24)</span>
                    </td>
                    <td className="px-3 py-2.5 text-center font-mono text-[13px] tabular-nums text-zinc-200">
                      <span className={a.benignPassRate === 1 ? 'text-emerald-300' : 'text-rose-300'}>{rate(a.benignPassRate)}</span>
                      <span className="ml-1 font-mono text-[9px] text-zinc-500">({Math.round(a.benignPassRate * 16)}/16)</span>
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono text-[12px] tabular-nums text-zinc-300">
                      <LatencyCell armKey={k} />
                    </td>
                    <td className="px-3 py-2.5">
                      <span className="font-mono text-[9px] leading-snug text-zinc-500">
                        {k === 'openappa' ? 'real binary, our corpus' : k === 'llmJudge' ? 'single run, non-deterministic' : 'ours, this run'}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="mt-2 font-mono text-[10px] leading-relaxed text-zinc-500">
          *OpenAPPA latency = subprocess replay amortized over a 40-step session (startup included; its replay CLI scales superlinearly with
          trace length — measured {OPENAPPA_SCALING.map((p) => `${(p.ms / 1000).toFixed(1)}s@${p.steps}`).join(' → ')}); TS arms are in-process
          hot loops. Different measurement modes — stated per arm, never averaged.
        </p>
      </div>

      {/* per-taxon matrix */}
      <div className="mt-10">
        <p className="font-mono text-[11px] tracking-[0.2em] text-zinc-500 uppercase">block matrix — every taxon, every arm</p>
        <p className="mt-1 max-w-3xl text-xs leading-relaxed text-zinc-500">
          Rows are scenario taxa (4 variants each); a green cell means the arm produced the secure outcome on all 4. The story is in the
          last two rows: <span className="text-rose-300">T5 and T6 are structurally invisible</span> to session-scoped labels — confirmed
          on the real binary — while the blunt patch that closes T5 <span className="text-rose-300">kills B4</span>. The PANOPTES column is
          green all the way down.
        </p>
        <div className="scroll-thin mt-3 overflow-x-auto">
          <table className="w-full min-w-[640px] border-collapse border border-zinc-800">
            <thead>
              <tr className="bg-zinc-900/70 font-mono text-[10px] tracking-[0.1em] text-zinc-500 uppercase">
                <th className="px-3 py-2 text-left">taxon</th>
                {ARM_KEYS.map((k) => (
                  <th key={k} className={cn('px-2 py-2 text-center', k === 'panoptes' && 'text-amber-300')}>
                    {ARM_SHORT[k]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/70">
              {TAXON_ORDER.map((t) => {
                const isBenign = t.startsWith('B');
                return (
                  <tr key={t} className={cn('bg-zinc-950/40', (t === 'T5' || t === 'T6') && 'bg-zinc-900/50')}>
                    <td className="px-3 py-1.5 font-mono text-[11px] whitespace-nowrap text-zinc-300">
                      <span className={cn('mr-2', isBenign ? 'text-emerald-500' : 'text-rose-400')}>{isBenign ? '▾' : '▴'}</span>
                      {t} · {TAXON_NAMES[t]}
                    </td>
                    {ARM_KEYS.map((k) => {
                      const cell = BENCH_ARMS[k].byTaxon[t];
                      return <Cell key={k} secure={cell.secure} total={cell.total} highlight={k === 'panoptes'} />;
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* latency panel */}
      <div className="mt-10 grid gap-6 lg:grid-cols-[1.15fr_0.85fr]">
        <div className="reticle border border-zinc-800 bg-zinc-900/40 p-4 md:p-5">
          <div className="flex items-center justify-between gap-2">
            <p className="font-mono text-[11px] tracking-[0.2em] text-zinc-300 uppercase">decision latency · log scale</p>
            <span className="inline-flex items-center gap-1.5 border border-fuchsia-500/35 bg-fuchsia-500/10 px-2 py-1 font-mono text-[10px] text-fuchsia-300 uppercase">
              <span className="led led-pulse" aria-hidden />
              measured
            </span>
          </div>
          <div className="mt-5 space-y-4">
            {latBars.map((b) => (
              <div key={b.label}>
                <div className="flex items-baseline justify-between gap-2">
                  <span className="font-mono text-[11px] text-zinc-400">{b.label}</span>
                  <span className="font-mono text-[11px] font-semibold text-amber-300">
                    {b.ns >= 1e6 ? `${(b.ns / 1e6).toFixed(0)} ms` : `${(b.ns / 1000).toFixed(2)} µs`}
                  </span>
                </div>
                <div className="mt-1.5 h-2 w-full bg-zinc-900">
                  <div
                    className={cn('h-full', b.label.startsWith('PANOPTES') ? 'bg-amber-500' : b.ns >= 1e6 ? 'bg-fuchsia-500/70' : 'bg-zinc-600')}
                    style={{ width: width(b.ns) }}
                  />
                </div>
              </div>
            ))}
          </div>
          <p className="mt-5 border-t border-zinc-800 pt-3 font-mono text-[10px] leading-relaxed text-zinc-500">
            the organs cost ~0.19 µs per decision over the label-only fast path (0.62 µs vs 0.43 µs measured this run); the LLM judge is ~10⁶× slower and non-reproducible —
            accuracy is not the deterministic selling point, reproducibility and auditability are. The judge scored 100%/100% on this
            corpus in one run; rerun it and the numbers move.
          </p>
        </div>

        {/* findings */}
        <div className="border border-zinc-800 bg-zinc-900/40 p-4 md:p-5">
          <p className="font-mono text-[11px] tracking-[0.2em] text-zinc-300 uppercase">measured findings</p>
          <ol className="mt-4 space-y-3">
            {BENCH_FINDINGS.map((f, i) => (
              <li key={i} className="flex gap-3 text-xs leading-relaxed text-zinc-400">
                <span className="mt-0.5 shrink-0 border border-amber-500/40 bg-amber-500/10 px-1.5 py-0.5 font-mono text-[10px] text-amber-400">
                  F{i + 1}
                </span>
                <span>{f}</span>
              </li>
            ))}
          </ol>
        </div>
      </div>

      {/* the engine itself */}
      <div className="mt-10">
        <LabShell
          code="CORE"
          title="src/lib/panoptes-core — the engine under test"
          subtitle="label lattice (Def 1–2) · gate checks · cross-trace memory ledger (O4) · canary interdiction (O4) · fail-closed ratchet (O6)"
          footer={
            <>
              tests: <span className="text-emerald-300">bun test tests/panoptes-core.test.ts → 21 pass / 0 fail</span> — lattice laws
              (commutativity, associativity, idempotence, absorption), monotone degradation, public-as-top audience semantics, canary
              detection power, fail-closed integrity faults, and the full 40-scenario matrix for all three deterministic arms.
            </>
          }
        >
          <div className="grid gap-4 md:grid-cols-3">
            {[
              {
                h: 'fast path',
                b: 'meet() over {trust, audience} with param-substituted gates — semantically identical to what the real binary does inside one replay session. First-match glob resolution mirrors their read(path:/hr/*) selectors.',
              },
              {
                h: 'organs',
                b: 'the ledger records the flow label at memory-write time and joins it back on every later read, across sessions; the canary organ scans egress params for planted tokens regardless of labels; the ratchet fails closed on digest mismatch.',
              },
              {
                h: 'verified mirror',
                b: 'the TS baseline (organs off) reproduces the real binary\u2019s decisions on all 40 scenarios — 16/24 attacks, 16/16 benign, exactly matching appa v0.30.0 replay — so the organ delta is measured against a verified mirror, not a strawman.',
              },
            ].map((c) => (
              <div key={c.h} className="border border-zinc-800 bg-zinc-950/50 p-3.5">
                <p className="font-mono text-[10px] tracking-[0.2em] text-amber-400 uppercase">{c.h}</p>
                <p className="mt-2 text-xs leading-relaxed text-zinc-400">{c.b}</p>
              </div>
            ))}
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            {['lattice laws', 'monotonicity', 'fail-closed', 'canary power', '40-scenario matrix', 'organ attribution'].map((t) => (
              <span key={t} className="border border-zinc-700 bg-zinc-900/70 px-2 py-0.5 font-mono text-[10px] text-zinc-500">
                {t}
              </span>
            ))}
          </div>
        </LabShell>
      </div>

      {/* methodology + downloads */}
      <div className="mt-8 grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
        <div className="border border-zinc-800 bg-zinc-900/40 p-4 md:p-5">
          <button
            onClick={() => setShowMethod(!showMethod)}
            className="flex w-full items-center justify-between gap-2 text-left"
            aria-expanded={showMethod}
          >
            <p className="font-mono text-[11px] tracking-[0.2em] text-zinc-300 uppercase">methodology &amp; honest caveats</p>
            <span className="font-mono text-[10px] text-amber-400">{showMethod ? '[ hide ]' : '[ show ]'}</span>
          </button>
          {showMethod && (
            <ol className="mt-4 space-y-2.5">
              {BENCH_METHODOLOGY.map((m, i) => (
                <li key={i} className="flex gap-3 text-xs leading-relaxed text-zinc-500">
                  <span className="shrink-0 font-mono text-[10px] text-zinc-700">{String(i + 1).padStart(2, '0')}</span>
                  <span>{m}</span>
                </li>
              ))}
            </ol>
          )}
          <p className="mt-4 border-t border-zinc-800 pt-3 text-xs leading-relaxed text-zinc-500">
            Corpus design note — read it before quoting numbers: <span className="text-zinc-300">T5 and T6 are engineered</span> so the
            vulnerable behavior is only visible to session-crossing state or content-side detection. They measure the organ delta the
            architecture exists for; they are not a real-world prevalence estimate. T1–T4 reproduce the paper-style in-session threat, and
            the real binary blocks them 16/16 with zero benign loss — that part of OpenAPPA&apos;s claim holds.
          </p>
        </div>

        <div className="reticle border border-zinc-800 bg-zinc-900/40 p-4 md:p-5">
          <p className="font-mono text-[11px] tracking-[0.2em] text-zinc-300 uppercase">raw results</p>
          <div className="mt-4 space-y-2.5">
            <a
              href="/bench/panoptes_prototype_benchmarks.json"
              download="panoptes_prototype_benchmarks.json"
              className="flex items-center gap-3 border border-zinc-800 bg-zinc-950/60 px-3 py-2.5 transition-colors hover:border-zinc-600"
            >
              <FileJson className="h-4 w-4 shrink-0 text-amber-400" />
              <span className="min-w-0">
                <span className="block text-xs font-medium text-zinc-200">benchmarks.json</span>
                <span className="block font-mono text-[10px] text-zinc-500">all arms, per-scenario decisions, latency, env</span>
              </span>
            </a>
            <a
              href="/bench/panoptes_prototype_benchmarks.csv"
              download="panoptes_prototype_benchmarks.csv"
              className="flex items-center gap-3 border border-zinc-800 bg-zinc-950/60 px-3 py-2.5 transition-colors hover:border-zinc-600"
            >
              <FileSpreadsheet className="h-4 w-4 shrink-0 text-amber-400" />
              <span className="min-w-0">
                <span className="block text-xs font-medium text-zinc-200">benchmarks.csv</span>
                <span className="block font-mono text-[10px] text-zinc-500">the summary table, spreadsheet-ready</span>
              </span>
            </a>
          </div>
          <p className="mt-4 flex items-start gap-2 font-mono text-[10px] leading-relaxed text-zinc-500">
            <Cpu className="mt-0.5 h-3 w-3 shrink-0" aria-hidden />
            scripts/bench-openappa · bench-panoptes · bench-llm-judge re-run everything end-to-end; tests/panoptes-core.test.ts verifies the engine.
          </p>
          <p className="mt-2 flex items-start gap-2 font-mono text-[10px] leading-relaxed text-zinc-500">
            <FlaskConical className="mt-0.5 h-3 w-3 shrink-0" aria-hidden />
            Not comparable to the paper&apos;s 1,320-eval Bench-Corp / ATB numbers: different corpus, harness, single run.
          </p>
        </div>
      </div>
    </Section>
  );
}
